use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::session::ConnectionState;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteServerUpdateMode {
    Latest,
    Pinned,
    Disabled,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RemoteServerPolicy {
    pub mode: RemoteServerUpdateMode,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub host: String,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub ssh_args: Vec<String>,
    pub project_path: String,
    #[serde(default)]
    pub zed_remote_binary: Option<String>,
    #[serde(default)]
    pub managed_remote_exec: Option<String>,
    #[serde(default)]
    pub managed_data_dir: Option<String>,
    #[serde(default)]
    pub remote_server: Option<RemoteServerPolicy>,
}

#[derive(Debug, Serialize)]
pub struct CreateSessionResponse {
    pub session: SessionSnapshot,
}

#[derive(Clone, Debug, Serialize)]
pub struct SessionSnapshot {
    pub id: Uuid,
    pub target: String,
    pub project_path: String,
    pub identifier: String,
    pub state: ConnectionState,
    pub proxy_active: bool,
    pub reconnect_count: u32,
    pub last_error: Option<String>,
    pub remote_server_mode: RemoteServerUpdateMode,
    pub remote_server_version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    File,
    Directory,
}

#[derive(Debug, Serialize)]
pub struct TreeResponse {
    pub root: String,
    pub entries: Vec<DirectoryEntry>,
}

#[derive(Debug, Deserialize)]
pub struct FileQuery {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct FileResponse {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Deserialize)]
pub struct SaveFileRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SaveFileResponse {
    pub path: String,
    pub bytes_written: usize,
}

#[derive(Debug, Deserialize)]
pub struct TreeQuery {
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TerminalQuery {
    #[serde(default)]
    pub cwd: Option<String>,
}
