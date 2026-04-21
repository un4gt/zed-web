use prost::Message;

#[derive(Clone, PartialEq, Message)]
pub struct PeerId {
    #[prost(uint32, tag = "1")]
    pub owner_id: u32,
    #[prost(uint32, tag = "2")]
    pub id: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct Envelope {
    #[prost(uint32, tag = "1")]
    pub id: u32,
    #[prost(uint32, optional, tag = "2")]
    pub responding_to: Option<u32>,
    #[prost(message, optional, tag = "3")]
    pub original_sender_id: Option<PeerId>,
    #[prost(uint32, optional, tag = "266")]
    pub ack_id: Option<u32>,
    #[prost(oneof = "envelope::Payload", tags = "5, 6, 57, 58, 59, 60, 61, 62, 63, 222, 223, 267, 268, 381")]
    pub payload: Option<envelope::Payload>,
}

pub mod envelope {
    use prost::Oneof;

    use super::{
        Ack, AddWorktree, AddWorktreeResponse, BufferSaved, CreateBufferForPeer, Error,
        FlushBufferedMessages, FlushBufferedMessagesResponse, OpenBufferByPath, OpenBufferResponse,
        RemoteStarted, SaveBuffer, UpdateBuffer, UpdateBufferFile,
    };

    #[derive(Clone, PartialEq, Oneof)]
    pub enum Payload {
        #[prost(message, tag = "5")]
        Ack(Ack),
        #[prost(message, tag = "6")]
        Error(Error),
        #[prost(message, tag = "57")]
        OpenBufferByPath(OpenBufferByPath),
        #[prost(message, tag = "58")]
        OpenBufferResponse(OpenBufferResponse),
        #[prost(message, tag = "59")]
        CreateBufferForPeer(CreateBufferForPeer),
        #[prost(message, tag = "60")]
        UpdateBuffer(UpdateBuffer),
        #[prost(message, tag = "61")]
        UpdateBufferFile(UpdateBufferFile),
        #[prost(message, tag = "62")]
        SaveBuffer(SaveBuffer),
        #[prost(message, tag = "63")]
        BufferSaved(BufferSaved),
        #[prost(message, tag = "222")]
        AddWorktree(AddWorktree),
        #[prost(message, tag = "223")]
        AddWorktreeResponse(AddWorktreeResponse),
        #[prost(message, tag = "267")]
        FlushBufferedMessages(FlushBufferedMessages),
        #[prost(message, tag = "268")]
        FlushBufferedMessagesResponse(FlushBufferedMessagesResponse),
        #[prost(message, tag = "381")]
        RemoteStarted(RemoteStarted),
    }
}

#[derive(Clone, PartialEq, Message)]
pub struct Ack {}

#[derive(Clone, PartialEq, Message)]
pub struct Error {
    #[prost(string, tag = "1")]
    pub message: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct AddWorktree {
    #[prost(string, tag = "1")]
    pub path: String,
    #[prost(uint64, tag = "2")]
    pub project_id: u64,
    #[prost(bool, tag = "3")]
    pub visible: bool,
}

#[derive(Clone, PartialEq, Message)]
pub struct AddWorktreeResponse {
    #[prost(uint64, tag = "1")]
    pub worktree_id: u64,
    #[prost(string, tag = "2")]
    pub canonicalized_path: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct OpenBufferByPath {
    #[prost(uint64, tag = "1")]
    pub project_id: u64,
    #[prost(uint64, tag = "2")]
    pub worktree_id: u64,
    #[prost(string, tag = "3")]
    pub path: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct OpenBufferResponse {
    #[prost(uint64, tag = "1")]
    pub buffer_id: u64,
}

#[derive(Clone, PartialEq, Message)]
pub struct CreateBufferForPeer {
    #[prost(uint64, tag = "1")]
    pub project_id: u64,
    #[prost(message, optional, tag = "2")]
    pub peer_id: Option<PeerId>,
    #[prost(oneof = "create_buffer_for_peer::Variant", tags = "3, 4")]
    pub variant: Option<create_buffer_for_peer::Variant>,
}

pub mod create_buffer_for_peer {
    use prost::Oneof;

    use super::{BufferChunk, BufferState};

    #[derive(Clone, PartialEq, Oneof)]
    pub enum Variant {
        #[prost(message, tag = "3")]
        State(BufferState),
        #[prost(message, tag = "4")]
        Chunk(BufferChunk),
    }
}

#[derive(Clone, PartialEq, Message)]
pub struct BufferState {
    #[prost(uint64, tag = "1")]
    pub id: u64,
    #[prost(message, optional, tag = "2")]
    pub file: Option<File>,
    #[prost(string, tag = "3")]
    pub base_text: String,
    #[prost(int32, tag = "5")]
    pub line_ending: i32,
    #[prost(message, repeated, tag = "6")]
    pub saved_version: Vec<VectorClockEntry>,
    #[prost(message, optional, tag = "8")]
    pub saved_mtime: Option<Timestamp>,
}

#[derive(Clone, PartialEq, Message)]
pub struct BufferChunk {
    #[prost(uint64, tag = "1")]
    pub buffer_id: u64,
    #[prost(message, repeated, tag = "2")]
    pub operations: Vec<Operation>,
    #[prost(bool, tag = "3")]
    pub is_last: bool,
}

#[derive(Clone, PartialEq, Message)]
pub struct UpdateBuffer {
    #[prost(uint64, tag = "1")]
    pub project_id: u64,
    #[prost(uint64, tag = "2")]
    pub buffer_id: u64,
    #[prost(message, repeated, tag = "3")]
    pub operations: Vec<Operation>,
}

#[derive(Clone, PartialEq, Message)]
pub struct UpdateBufferFile {
    #[prost(uint64, tag = "1")]
    pub project_id: u64,
    #[prost(uint64, tag = "2")]
    pub buffer_id: u64,
    #[prost(message, optional, tag = "3")]
    pub file: Option<File>,
}

#[derive(Clone, PartialEq, Message)]
pub struct SaveBuffer {
    #[prost(uint64, tag = "1")]
    pub project_id: u64,
    #[prost(uint64, tag = "2")]
    pub buffer_id: u64,
    #[prost(message, repeated, tag = "3")]
    pub version: Vec<VectorClockEntry>,
}

#[derive(Clone, PartialEq, Message)]
pub struct BufferSaved {
    #[prost(uint64, tag = "1")]
    pub project_id: u64,
    #[prost(uint64, tag = "2")]
    pub buffer_id: u64,
    #[prost(message, repeated, tag = "3")]
    pub version: Vec<VectorClockEntry>,
    #[prost(message, optional, tag = "4")]
    pub mtime: Option<Timestamp>,
}

#[derive(Clone, PartialEq, Message)]
pub struct File {
    #[prost(uint64, tag = "1")]
    pub worktree_id: u64,
    #[prost(uint64, optional, tag = "2")]
    pub entry_id: Option<u64>,
    #[prost(string, tag = "3")]
    pub path: String,
    #[prost(message, optional, tag = "4")]
    pub mtime: Option<Timestamp>,
    #[prost(bool, tag = "5")]
    pub is_deleted: bool,
    #[prost(bool, tag = "6")]
    pub is_historic: bool,
}

#[derive(Clone, PartialEq, Message)]
pub struct Timestamp {
    #[prost(uint64, tag = "1")]
    pub seconds: u64,
    #[prost(uint32, tag = "2")]
    pub nanos: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct VectorClockEntry {
    #[prost(uint32, tag = "1")]
    pub replica_id: u32,
    #[prost(uint32, tag = "2")]
    pub timestamp: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct Operation {
    #[prost(oneof = "operation::Variant", tags = "1")]
    pub variant: Option<operation::Variant>,
}

pub mod operation {
    use prost::Oneof;

    use super::Edit;

    #[derive(Clone, PartialEq, Oneof)]
    pub enum Variant {
        #[prost(message, tag = "1")]
        Edit(Edit),
    }
}

#[derive(Clone, PartialEq, Message)]
pub struct Edit {
    #[prost(uint32, tag = "1")]
    pub replica_id: u32,
    #[prost(uint32, tag = "2")]
    pub lamport_timestamp: u32,
    #[prost(message, repeated, tag = "3")]
    pub version: Vec<VectorClockEntry>,
    #[prost(message, repeated, tag = "4")]
    pub ranges: Vec<Range>,
    #[prost(string, repeated, tag = "5")]
    pub new_text: Vec<String>,
}

#[derive(Clone, PartialEq, Message)]
pub struct Range {
    #[prost(uint64, tag = "1")]
    pub start: u64,
    #[prost(uint64, tag = "2")]
    pub end: u64,
}

#[derive(Clone, PartialEq, Message)]
pub struct FlushBufferedMessages {}

#[derive(Clone, PartialEq, Message)]
pub struct FlushBufferedMessagesResponse {}

#[derive(Clone, PartialEq, Message)]
pub struct RemoteStarted {}
