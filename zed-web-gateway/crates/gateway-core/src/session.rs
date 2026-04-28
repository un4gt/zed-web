use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Connecting,
    Ready,
    Reconnecting,
    Disconnected,
}

#[derive(Clone, Debug)]
pub struct ProxyState {
    pub active: bool,
    pub reconnect_count: u32,
}

pub fn resolve_remote_path(root: &str, requested_path: Option<&str>) -> String {
    let root = Path::new(root);
    let path = match requested_path {
        Some(raw) if !raw.trim().is_empty() => {
            let candidate = Path::new(raw);
            if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                root.join(candidate)
            }
        }
        _ => root.to_path_buf(),
    };

    path.to_string_lossy().to_string()
}

pub fn normalize_child_path(root: &str, child: &str) -> String {
    let mut path = PathBuf::from(root);
    path.push(child);
    path.to_string_lossy().to_string()
}

pub fn normalize_worktree_relative_path(
    project_root: &str,
    requested_path: &str,
) -> Result<String, String> {
    let requested_path = requested_path.trim();
    if requested_path.is_empty() {
        return Err("path is required".into());
    }

    let requested = Path::new(requested_path);
    if !requested.is_absolute() {
        return normalize_relative_path(requested);
    }

    let project_root = Path::new(project_root);
    let relative = requested
        .strip_prefix(project_root)
        .map_err(|_| format!("absolute path is outside project root: {requested_path}"))?;

    if relative.as_os_str().is_empty() {
        return Err("path points to the project root, not a file".into());
    }

    normalize_relative_path(relative)
}

fn normalize_relative_path(path: &Path) -> Result<String, String> {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Normal(segment) => normalized.push(segment),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err("path must not contain parent directory segments".into());
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err("path must be relative to the project root".into());
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err("path is required".into());
    }

    Ok(normalized.to_string_lossy().to_string())
}
