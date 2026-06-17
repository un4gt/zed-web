use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::session::ConnectionState;

pub const DEFAULT_TREE_DEPTH: usize = 1;
pub const MAX_TREE_DEPTH: usize = 3;

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
    pub loaded_paths: Vec<String>,
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

#[derive(Clone, Debug, Deserialize)]
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
    #[serde(default)]
    pub depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct TerminalQuery {
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CommandEnvelope {
    pub id: String,
    #[serde(rename = "type")]
    pub command_type: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Serialize)]
pub struct CommandResponse<T>
where
    T: Serialize,
{
    pub id: String,
    #[serde(rename = "type")]
    pub response_type: String,
    pub payload: T,
}

#[derive(Debug, Deserialize)]
pub struct FileOpenCommand {
    pub path: String,
    #[serde(default = "default_initial_file_chunk_bytes")]
    pub initial_bytes: usize,
    #[serde(default = "default_file_chunk_bytes")]
    pub chunk_bytes: usize,
}

#[derive(Debug, Deserialize)]
pub struct TreeListCommand {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub depth: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct CommandErrorPayload {
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct FileOpenStartedPayload {
    pub path: String,
    pub read_only: bool,
}

#[derive(Debug, Serialize)]
pub struct FileChunkPayload {
    pub path: String,
    pub offset: usize,
    pub encoding: &'static str,
    pub data: String,
    pub done: bool,
}

#[derive(Debug, Serialize)]
pub struct FileCompletePayload {
    pub path: String,
    pub bytes_read: usize,
    pub truncated: bool,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
pub struct ResourceVersion {
    pub scheme: ResourceVersionScheme,
    pub value: String,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResourceVersionScheme {
    ZedVectorClock,
    SshStat,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
pub struct TextPosition {
    pub line: usize,
    pub character: usize,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
pub struct BufferTextRange {
    pub start: TextPosition,
    pub end: TextPosition,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
pub struct BufferTextChange {
    pub range: BufferTextRange,
    #[serde(rename = "rangeOffsetUtf16")]
    pub range_offset_utf16: usize,
    #[serde(rename = "rangeLengthUtf16")]
    pub range_length_utf16: usize,
    pub text: String,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BufferChangeSource {
    User,
    Ai,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Serialize)]
pub struct BufferChangeBatch {
    pub seq: u64,
    pub source: BufferChangeSource,
    #[serde(rename = "modelVersionId")]
    pub model_version_id: u64,
    #[serde(rename = "alternativeVersionId")]
    pub alternative_version_id: u64,
    pub changes: Vec<BufferTextChange>,
    #[serde(default)]
    pub eol: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BufferOpenCommand {
    pub path: String,
    #[serde(default = "default_initial_file_chunk_bytes")]
    pub initial_bytes: usize,
    #[serde(default = "default_file_chunk_bytes")]
    pub chunk_bytes: usize,
}

#[derive(Debug, Deserialize)]
pub struct BufferSaveCommand {
    pub path: String,
    pub base_resource_version: ResourceVersion,
    #[serde(default)]
    pub batches: Vec<BufferChangeBatch>,
    pub expected_content_length: usize,
}

#[derive(Debug, Deserialize)]
pub struct BufferSyncCommand {
    #[serde(default)]
    pub buffers: Vec<BufferSyncRequestItem>,
}

#[derive(Debug, Deserialize)]
pub struct BufferSyncRequestItem {
    pub path: String,
    pub base_resource_version: ResourceVersion,
    pub dirty: bool,
    pub last_seq: u64,
}

#[derive(Debug, Serialize)]
pub struct BufferOpenStartedPayload {
    pub path: String,
    pub read_only: bool,
}

#[derive(Debug, Serialize)]
pub struct BufferChunkPayload {
    pub path: String,
    pub offset: usize,
    pub encoding: &'static str,
    pub data: String,
    pub done: bool,
}

#[derive(Debug, Serialize)]
pub struct BufferOpenCompletePayload {
    pub path: String,
    pub bytes_read: usize,
    pub truncated: bool,
    pub read_only: bool,
    pub resource_version: ResourceVersion,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BufferSaveCompletePayload {
    Saved {
        path: String,
        applied_seq: u64,
        bytes_written: usize,
        resource_version: ResourceVersion,
    },
    Conflict {
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        current_resource_version: Option<ResourceVersion>,
        message: String,
    },
}

#[derive(Debug, Serialize)]
pub struct BufferSyncCompletePayload {
    pub buffers: Vec<BufferSyncResponseItem>,
}

#[derive(Debug, Serialize)]
pub struct BufferSyncResponseItem {
    pub path: String,
    pub status: BufferSyncStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_resource_version: Option<ResourceVersion>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BufferSyncStatus {
    Unchanged,
    RemoteChanged,
    Missing,
}

#[derive(Debug, Serialize)]
pub struct EmptyCommandPayload {}

pub const DEFAULT_INITIAL_FILE_CHUNK_BYTES: usize = 64 * 1024;
pub const DEFAULT_FILE_CHUNK_BYTES: usize = 128 * 1024;
pub const MAX_STREAMED_FILE_BYTES: usize = 512 * 1024;

fn default_initial_file_chunk_bytes() -> usize {
    DEFAULT_INITIAL_FILE_CHUNK_BYTES
}

fn default_file_chunk_bytes() -> usize {
    DEFAULT_FILE_CHUNK_BYTES
}
