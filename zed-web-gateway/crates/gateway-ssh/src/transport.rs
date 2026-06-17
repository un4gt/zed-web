use std::collections::BTreeSet;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use base64::Engine;
use gateway_core::api::{
    DEFAULT_TREE_DEPTH, DirectoryEntry, EntryKind, FileResponse, MAX_TREE_DEPTH, SaveFileRequest,
    SaveFileResponse, TreeResponse,
};
use gateway_core::error::SessionError;
use gateway_core::session::{
    normalize_child_path, normalize_worktree_relative_path, resolve_remote_path,
};
use gateway_core::ssh::{SshTarget, shell_escape};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

const SSH_TIMEOUT_SECS: u64 = 20;
const MAX_FILE_BYTES: usize = 512 * 1024;

pub async fn probe_remote(
    target: &SshTarget,
    project_path: &str,
    zed_remote_binary: &str,
) -> Result<String, SessionError> {
    let command = format!(
        "sh -lc 'mkdir -p {path} && command -v {binary} >/dev/null 2>&1 && {binary} version || true'",
        path = shell_escape(project_path),
        binary = shell_escape(zed_remote_binary)
    );

    run_ssh_capture(target, &command).await
}

pub async fn reconnect_probe(
    target: &SshTarget,
    project_path: &str,
) -> Result<String, SessionError> {
    let command = format!(
        "sh -lc 'test -d {path} && printf ready || printf missing'",
        path = shell_escape(project_path)
    );

    run_ssh_capture(target, &command).await
}

pub async fn list_directory(
    target: &SshTarget,
    project_root: &str,
    requested_path: Option<&str>,
    requested_depth: Option<usize>,
) -> Result<TreeResponse, SessionError> {
    let relative_root = requested_path
        .filter(|path| !path.trim().is_empty())
        .map(|path| normalize_worktree_relative_path(project_root, path))
        .transpose()
        .map_err(SessionError::InvalidRequest)?;
    let root = resolve_remote_path(project_root, relative_root.as_deref());
    let depth = requested_depth
        .unwrap_or(DEFAULT_TREE_DEPTH)
        .clamp(DEFAULT_TREE_DEPTH, MAX_TREE_DEPTH);
    let command = format!(
        r#"sh -lc 'if [ -d {path} ]; then LC_ALL=C find {path} -mindepth 1 -maxdepth {depth} -printf "%P\t%f\t%y\n" | sort; else exit 3; fi'"#,
        path = shell_escape(&root),
        depth = depth
    );
    let output = run_ssh_capture(target, &command).await?;

    let mut entries = Vec::new();
    let mut loaded_paths = BTreeSet::from([relative_root.clone().unwrap_or_default()]);

    for line in output.lines() {
        let Some((relative_path_from_root, rest)) = line.split_once('\t') else {
            continue;
        };
        let Some((name, kind)) = rest.split_once('\t') else {
            continue;
        };

        let entry_kind = match kind {
            "d" => EntryKind::Directory,
            _ => EntryKind::File,
        };
        let path = normalize_worktree_relative_path(
            project_root,
            &normalize_child_path(&root, relative_path_from_root),
        )
        .map_err(SessionError::InvalidRequest)?;

        entries.push(DirectoryEntry {
            name: name.to_string(),
            path: path.clone(),
            kind: entry_kind,
        });

        if matches!(kind, "d") && relative_component_count(relative_path_from_root) < depth {
            loaded_paths.insert(path);
        }
    }

    Ok(TreeResponse {
        root,
        entries,
        loaded_paths: loaded_paths.into_iter().collect(),
    })
}

fn relative_component_count(path: &str) -> usize {
    path.split('/')
        .filter(|component| !component.is_empty())
        .count()
}

pub async fn read_file(
    target: &SshTarget,
    project_root: &str,
    requested_path: &str,
) -> Result<FileResponse, SessionError> {
    let relative_path = normalize_worktree_relative_path(project_root, requested_path)
        .map_err(SessionError::InvalidRequest)?;
    let path = resolve_remote_path(project_root, Some(&relative_path));
    let command = format!(
        "sh -lc 'if [ -f {path} ]; then base64 -w0 < {path}; else exit 4; fi'",
        path = shell_escape(&path)
    );
    let output = run_ssh_capture(target, &command).await?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(output.trim())
        .map_err(|error| SessionError::Decode(format!("failed to decode file payload: {error}")))?;

    let truncated = bytes.len() > MAX_FILE_BYTES;
    let slice = if truncated {
        &bytes[..MAX_FILE_BYTES]
    } else {
        &bytes
    };
    let content = String::from_utf8(slice.to_vec())?;

    Ok(FileResponse {
        path: relative_path,
        content,
        truncated,
    })
}

pub async fn stream_file<F>(
    target: &SshTarget,
    project_root: &str,
    requested_path: &str,
    initial_chunk_bytes: usize,
    chunk_bytes: usize,
    max_bytes: usize,
    mut on_chunk: F,
) -> Result<StreamedFileSummary, SessionError>
where
    F: FnMut(StreamedFileChunk) -> Result<(), SessionError>,
{
    let relative_path = normalize_worktree_relative_path(project_root, requested_path)
        .map_err(SessionError::InvalidRequest)?;
    let path = resolve_remote_path(project_root, Some(&relative_path));
    let command = format!(
        "sh -lc 'if [ -f {path} ]; then cat {path}; else exit 4; fi'",
        path = shell_escape(&path)
    );

    let mut child = ssh_command(target, &command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| SessionError::SshCommand("failed to capture ssh stdout".into()))?;
    let mut bytes_read = 0_usize;
    let mut truncated = false;

    loop {
        let next_chunk_bytes = if bytes_read == 0 {
            initial_chunk_bytes
        } else {
            chunk_bytes
        }
        .max(1);
        let mut buffer = vec![0_u8; next_chunk_bytes];
        let read = timeout(
            Duration::from_secs(SSH_TIMEOUT_SECS),
            stdout.read(&mut buffer),
        )
        .await
        .map_err(|_| SessionError::SshCommand("ssh command timed out".into()))??;

        if read == 0 {
            break;
        }

        let remaining = max_bytes.saturating_sub(bytes_read);
        if remaining == 0 {
            truncated = true;
            break;
        }

        let usable = read.min(remaining);
        let chunk = StreamedFileChunk {
            path: relative_path.clone(),
            offset: bytes_read,
            bytes: buffer[..usable].to_vec(),
        };
        bytes_read += usable;
        if let Err(error) = on_chunk(chunk) {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(error);
        }

        if usable < read || bytes_read >= max_bytes {
            truncated = true;
            break;
        }
    }

    if truncated {
        let _ = child.kill().await;
        let _ = child.wait().await;
    } else {
        let output = timeout(
            Duration::from_secs(SSH_TIMEOUT_SECS),
            child.wait_with_output(),
        )
        .await
        .map_err(|_| SessionError::SshCommand("ssh command timed out".into()))??;

        if !output.status.success() {
            let stderr = String::from_utf8(output.stderr)?;
            return Err(SessionError::SshCommand(stderr.trim().to_string()));
        }
    }

    Ok(StreamedFileSummary {
        path: relative_path,
        bytes_read,
        truncated,
    })
}

#[derive(Debug)]
pub struct StreamedFileChunk {
    pub path: String,
    pub offset: usize,
    pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub struct StreamedFileSummary {
    pub path: String,
    pub bytes_read: usize,
    pub truncated: bool,
}

pub async fn save_file(
    target: &SshTarget,
    project_root: &str,
    request: SaveFileRequest,
) -> Result<SaveFileResponse, SessionError> {
    let relative_path = normalize_worktree_relative_path(project_root, &request.path)
        .map_err(SessionError::InvalidRequest)?;
    let path = resolve_remote_path(project_root, Some(&relative_path));
    let encoded = base64::engine::general_purpose::STANDARD.encode(request.content.as_bytes());
    let directory = std::path::Path::new(&path)
        .parent()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "/".to_string());
    let command = format!(
        "sh -lc 'mkdir -p {directory} && printf %s {encoded} | base64 -d > {path}'",
        directory = shell_escape(&directory),
        encoded = shell_escape(&encoded),
        path = shell_escape(&path)
    );

    run_ssh_capture(target, &command).await?;

    Ok(SaveFileResponse {
        path: relative_path,
        bytes_written: request.content.len(),
    })
}

pub async fn run_ssh_capture(
    target: &SshTarget,
    remote_command: &str,
) -> Result<String, SessionError> {
    let mut command = ssh_command(target, remote_command);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let output = timeout(Duration::from_secs(SSH_TIMEOUT_SECS), command.output())
        .await
        .map_err(|_| SessionError::SshCommand("ssh command timed out".into()))??;

    if output.status.success() {
        Ok(String::from_utf8(output.stdout)?)
    } else {
        let stderr = String::from_utf8(output.stderr)?;
        Err(SessionError::SshCommand(stderr.trim().to_string()))
    }
}

fn ssh_command(target: &SshTarget, remote_command: &str) -> Command {
    let mut command = Command::new("ssh");

    if let Some(port) = target.port {
        command.arg("-p").arg(port.to_string());
    }

    command.args(&target.args);
    command.arg(target.destination()).arg(remote_command);
    command
}

pub async fn copy_file_to_remote(
    target: &SshTarget,
    local_path: &Path,
    remote_path: &str,
) -> Result<(), SessionError> {
    let mut command = Command::new("scp");

    if let Some(port) = target.port {
        command.arg("-P").arg(port.to_string());
    }

    command.args(&target.args);
    command
        .arg(local_path)
        .arg(format!("{}:{}", target.destination(), remote_path))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = timeout(Duration::from_secs(SSH_TIMEOUT_SECS), command.output())
        .await
        .map_err(|_| SessionError::SshCommand("scp command timed out".into()))??;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8(output.stderr)?;
        Err(SessionError::SshCommand(stderr.trim().to_string()))
    }
}
