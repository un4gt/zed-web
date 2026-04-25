use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use base64::Engine;
use gateway_core::api::{
    DirectoryEntry, EntryKind, FileResponse, SaveFileRequest, SaveFileResponse, TreeResponse,
};
use gateway_core::error::SessionError;
use gateway_core::session::{normalize_child_path, resolve_remote_path};
use gateway_core::ssh::{SshTarget, shell_escape};
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
) -> Result<TreeResponse, SessionError> {
    let root = resolve_remote_path(project_root, requested_path);
    let command = format!(
        r#"sh -lc 'if [ -d {path} ]; then LC_ALL=C find {path} -mindepth 1 -maxdepth 1 -printf "%f\t%y\n" | sort; else exit 3; fi'"#,
        path = shell_escape(&root)
    );
    let output = run_ssh_capture(target, &command).await?;

    let entries = output
        .lines()
        .filter_map(|line| {
            let (name, kind) = line.split_once('\t')?;
            let entry_kind = match kind {
                "d" => EntryKind::Directory,
                _ => EntryKind::File,
            };

            Some(DirectoryEntry {
                name: name.to_string(),
                path: normalize_child_path(&root, name),
                kind: entry_kind,
            })
        })
        .collect();

    Ok(TreeResponse { root, entries })
}

pub async fn read_file(
    target: &SshTarget,
    project_root: &str,
    requested_path: &str,
) -> Result<FileResponse, SessionError> {
    let path = resolve_remote_path(project_root, Some(requested_path));
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
        path,
        content,
        truncated,
    })
}

pub async fn save_file(
    target: &SshTarget,
    project_root: &str,
    request: SaveFileRequest,
) -> Result<SaveFileResponse, SessionError> {
    let path = resolve_remote_path(project_root, Some(&request.path));
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
        path,
        bytes_written: request.content.len(),
    })
}

pub async fn run_ssh_capture(
    target: &SshTarget,
    remote_command: &str,
) -> Result<String, SessionError> {
    let mut command = Command::new("ssh");

    if let Some(port) = target.port {
        command.arg("-p").arg(port.to_string());
    }

    command.args(&target.args);

    command
        .arg(target.destination())
        .arg(remote_command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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
