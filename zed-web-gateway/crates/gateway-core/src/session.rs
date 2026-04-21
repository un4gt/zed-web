use serde::Serialize;
use std::path::{Path, PathBuf};

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
