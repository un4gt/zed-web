use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use gateway_core::error::SessionError;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::messages::{
    self, AddWorktree, AddWorktreeResponse, AllocateWorktreeIdResponse, BufferSaved, Envelope,
    OpenBufferByPath, OpenBufferResponse, SaveBuffer, UpdateBuffer,
};
use prost::Message;

const REMOTE_SERVER_PROJECT_ID: u64 = 0;
const REMOTE_SERVER_PEER_ID: messages::PeerId = messages::PeerId { owner_id: 0, id: 0 };

#[derive(Clone)]
pub struct ZedProxyClient {
    state: Arc<Mutex<ClientState>>,
}

struct ClientState {
    next_message_id: u32,
    next_worktree_id: u64,
    writer: Box<dyn AsyncWrite + Send + Unpin>,
    reader: Box<dyn AsyncRead + Send + Unpin>,
    max_received: u32,
    buffered_outgoing: VecDeque<Envelope>,
    opened_buffers: HashMap<u64, OpenedBuffer>,
}

#[derive(Clone)]
pub struct OpenedBuffer {
    pub buffer_id: u64,
    pub file: Option<messages::File>,
    pub base_text: String,
    pub saved_version: Vec<messages::VectorClockEntry>,
}

impl ZedProxyClient {
    pub fn new(
        reader: Box<dyn AsyncRead + Send + Unpin>,
        writer: Box<dyn AsyncWrite + Send + Unpin>,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(ClientState {
                next_message_id: 1,
                next_worktree_id: 1,
                writer,
                reader,
                max_received: 0,
                buffered_outgoing: VecDeque::new(),
                opened_buffers: HashMap::new(),
            })),
        }
    }

    pub async fn initialize(&self) -> Result<(), SessionError> {
        self.send(messages::RemoteStarted {}).await?;
        loop {
            let envelope = self.read_envelope().await?;
            match envelope.payload {
                Some(messages::envelope::Payload::Ack(_)) => {}
                Some(messages::envelope::Payload::RemoteStarted(_)) => {
                    self.send_special_ack(envelope.id).await?;
                    return Ok(());
                }
                Some(messages::envelope::Payload::FlushBufferedMessages(_)) => {
                    self.replay_buffered_messages().await?;
                    self.send_special_ack(envelope.id).await?;
                }
                _ => self.handle_unsolicited(envelope).await?,
            }
        }
    }

    pub async fn ping(&self) -> Result<(), SessionError> {
        let _: messages::Ack = self.request(messages::Ping {}).await?;
        Ok(())
    }

    pub async fn add_worktree(&self, path: &str) -> Result<AddWorktreeResponse, SessionError> {
        self.request(AddWorktree {
            path: path.to_string(),
            project_id: REMOTE_SERVER_PROJECT_ID,
            visible: true,
        })
        .await
    }

    pub async fn send<T>(&self, payload: T) -> Result<(), SessionError>
    where
        T: IntoEnvelope,
    {
        self.write_buffered_envelope(payload.into_envelope(0, None))
            .await
            .map(|_| ())
    }

    pub async fn open_buffer_by_path(
        &self,
        worktree_id: u64,
        path: &str,
    ) -> Result<OpenedBuffer, SessionError> {
        let response: OpenBufferResponse = self
            .request(OpenBufferByPath {
                project_id: REMOTE_SERVER_PROJECT_ID,
                worktree_id,
                path: path.to_string(),
            })
            .await?;

        let buffer_id = response.buffer_id;
        if let Some(buffer) = self.cached_opened_buffer(buffer_id).await {
            return Ok(buffer);
        }

        let mut state = None;
        let mut operations = Vec::new();

        loop {
            let envelope = self.read_envelope().await?;
            match envelope.payload {
                Some(messages::envelope::Payload::CreateBufferForPeer(message)) => {
                    if message.project_id != REMOTE_SERVER_PROJECT_ID {
                        continue;
                    }
                    let Some(peer_id) = message.peer_id else {
                        continue;
                    };
                    if peer_id != REMOTE_SERVER_PEER_ID {
                        continue;
                    }

                    match message.variant {
                        Some(messages::create_buffer_for_peer::Variant::State(buffer_state))
                            if buffer_state.id == buffer_id =>
                        {
                            state = Some(buffer_state);
                        }
                        Some(messages::create_buffer_for_peer::Variant::Chunk(chunk))
                            if chunk.buffer_id == buffer_id =>
                        {
                            operations.extend(chunk.operations);
                            if chunk.is_last {
                                let buffer_state = state.ok_or_else(|| {
                                    SessionError::Decode(
                                        "received buffer chunk before initial state".into(),
                                    )
                                })?;
                                let content = apply_operations(
                                    &buffer_state.base_text,
                                    buffer_state.saved_version.clone(),
                                    &operations,
                                )?;
                                self.send_ack(envelope.id).await?;
                                let buffer = OpenedBuffer {
                                    buffer_id,
                                    file: buffer_state.file,
                                    base_text: content,
                                    saved_version: buffer_state.saved_version,
                                };
                                self.cache_opened_buffer(buffer.clone()).await;
                                return Ok(buffer);
                            }
                        }
                        _ => {}
                    }

                    self.send_ack(envelope.id).await?;
                }
                Some(messages::envelope::Payload::Error(error)) => {
                    return Err(SessionError::SshCommand(error.message));
                }
                _ => {
                    self.ack_if_needed(&envelope).await?;
                }
            }
        }
    }

    pub async fn overwrite_and_save(
        &self,
        buffer: &OpenedBuffer,
        content: &str,
    ) -> Result<BufferSaved, SessionError> {
        let next_version = increment_version(&buffer.saved_version, 1);
        let update = UpdateBuffer {
            project_id: REMOTE_SERVER_PROJECT_ID,
            buffer_id: buffer.buffer_id,
            operations: vec![messages::Operation {
                variant: Some(messages::operation::Variant::Edit(messages::Edit {
                    replica_id: 1,
                    lamport_timestamp: next_version
                        .iter()
                        .find(|entry| entry.replica_id == 1)
                        .map(|entry| entry.timestamp)
                        .unwrap_or(1),
                    version: buffer.saved_version.clone(),
                    ranges: vec![messages::Range {
                        start: 0,
                        end: buffer.base_text.len() as u64,
                    }],
                    new_text: vec![content.to_string()],
                })),
            }],
        };

        let _: messages::Ack = self.request(update).await?;
        let saved: BufferSaved = self
            .request(SaveBuffer {
                project_id: REMOTE_SERVER_PROJECT_ID,
                buffer_id: buffer.buffer_id,
                version: next_version,
                new_path: None,
            })
            .await?;
        self.cache_opened_buffer(OpenedBuffer {
            buffer_id: buffer.buffer_id,
            file: buffer.file.clone(),
            base_text: content.to_string(),
            saved_version: saved.version.clone(),
        })
        .await;
        Ok(saved)
    }

    async fn cached_opened_buffer(&self, buffer_id: u64) -> Option<OpenedBuffer> {
        let state = self.state.lock().await;
        state.opened_buffers.get(&buffer_id).cloned()
    }

    async fn cache_opened_buffer(&self, buffer: OpenedBuffer) {
        let mut state = self.state.lock().await;
        state.opened_buffers.insert(buffer.buffer_id, buffer);
    }

    async fn request<T, R>(&self, payload: T) -> Result<R, SessionError>
    where
        T: IntoEnvelope,
        R: FromEnvelope,
    {
        let message_id = self
            .write_buffered_envelope(payload.into_envelope(0, None))
            .await?;

        loop {
            let envelope = self.read_envelope().await?;
            if envelope.responding_to == Some(message_id) {
                return R::from_envelope(envelope);
            }
            self.handle_unsolicited(envelope).await?;
        }
    }

    async fn handle_unsolicited(&self, envelope: Envelope) -> Result<(), SessionError> {
        match envelope.payload {
            Some(messages::envelope::Payload::AllocateWorktreeId(_)) => {
                let worktree_id = {
                    let mut state = self.state.lock().await;
                    let worktree_id = state.next_worktree_id;
                    state.next_worktree_id += 1;
                    worktree_id
                };
                self.respond(envelope.id, AllocateWorktreeIdResponse { worktree_id })
                    .await
            }
            Some(messages::envelope::Payload::Ping(_)) => self.send_ack(envelope.id).await,
            Some(messages::envelope::Payload::FlushBufferedMessages(_)) => {
                self.replay_buffered_messages().await?;
                self.send_special_ack(envelope.id).await
            }
            _ => self.ack_if_needed(&envelope).await,
        }
    }

    async fn ack_if_needed(&self, envelope: &Envelope) -> Result<(), SessionError> {
        if envelope.responding_to.is_none() {
            self.send_ack(envelope.id).await?;
        }
        Ok(())
    }

    async fn send_ack(&self, responding_to: u32) -> Result<(), SessionError> {
        self.respond(responding_to, messages::Ack {}).await
    }

    async fn send_special_ack(&self, responding_to: u32) -> Result<(), SessionError> {
        self.write_unbuffered_envelope(messages::Ack {}.into_envelope(0, Some(responding_to)))
            .await
            .map(|_| ())
    }

    async fn respond<T>(&self, responding_to: u32, payload: T) -> Result<(), SessionError>
    where
        T: IntoEnvelope,
    {
        self.write_buffered_envelope(payload.into_envelope(0, Some(responding_to)))
            .await
            .map(|_| ())
    }

    async fn write_buffered_envelope(&self, mut envelope: Envelope) -> Result<u32, SessionError> {
        let mut state = self.state.lock().await;
        assign_outgoing_metadata(&mut state, &mut envelope);
        let message_id = envelope.id;
        state.buffered_outgoing.push_back(envelope.clone());

        write_encoded_envelope(state.writer.as_mut(), &envelope).await?;
        Ok(message_id)
    }

    async fn write_unbuffered_envelope(&self, mut envelope: Envelope) -> Result<u32, SessionError> {
        let mut state = self.state.lock().await;
        assign_outgoing_metadata(&mut state, &mut envelope);
        let message_id = envelope.id;

        write_encoded_envelope(state.writer.as_mut(), &envelope).await?;
        Ok(message_id)
    }

    async fn replay_buffered_messages(&self) -> Result<(), SessionError> {
        let buffered_messages = {
            let state = self.state.lock().await;
            state.buffered_outgoing.iter().cloned().collect::<Vec<_>>()
        };

        if buffered_messages.is_empty() {
            return Ok(());
        }

        let mut state = self.state.lock().await;
        for envelope in &buffered_messages {
            write_encoded_envelope(state.writer.as_mut(), envelope).await?;
        }
        Ok(())
    }

    async fn read_envelope(&self) -> Result<Envelope, SessionError> {
        let mut state = self.state.lock().await;
        let mut length = [0_u8; 4];
        state.reader.read_exact(&mut length).await?;
        let message_len = u32::from_le_bytes(length) as usize;
        let mut buffer = vec![0_u8; message_len];
        state.reader.read_exact(&mut buffer).await?;
        let envelope = Envelope::decode(buffer.as_slice())
            .map_err(|error| SessionError::Decode(error.to_string()))?;

        if let Some(ack_id) = envelope.ack_id {
            while state
                .buffered_outgoing
                .front()
                .is_some_and(|buffered_envelope| buffered_envelope.id <= ack_id)
            {
                state.buffered_outgoing.pop_front();
            }
        }

        if should_track_received(&envelope) {
            state.max_received = envelope.id;
        }

        Ok(envelope)
    }
}

pub trait IntoEnvelope {
    fn into_envelope(self, id: u32, responding_to: Option<u32>) -> Envelope;
}

pub trait FromEnvelope: Sized {
    fn from_envelope(envelope: Envelope) -> Result<Self, SessionError>;
}

macro_rules! impl_envelope_message {
    ($type:ty, $variant:ident) => {
        impl IntoEnvelope for $type {
            fn into_envelope(self, id: u32, responding_to: Option<u32>) -> Envelope {
                Envelope {
                    id,
                    responding_to,
                    original_sender_id: None,
                    ack_id: None,
                    payload: Some(messages::envelope::Payload::$variant(self)),
                }
            }
        }

        impl FromEnvelope for $type {
            fn from_envelope(envelope: Envelope) -> Result<Self, SessionError> {
                let actual_payload = envelope
                    .payload
                    .as_ref()
                    .map(payload_name)
                    .unwrap_or("None");
                match envelope.payload {
                    Some(messages::envelope::Payload::$variant(message)) => Ok(message),
                    Some(messages::envelope::Payload::Error(error)) => {
                        Err(SessionError::SshCommand(error.message))
                    }
                    _ => Err(SessionError::Decode(format!(
                        "unexpected response envelope: expected {}, got {actual_payload}",
                        stringify!($variant),
                    ))),
                }
            }
        }
    };
}

impl_envelope_message!(messages::RemoteStarted, RemoteStarted);
impl_envelope_message!(messages::Ack, Ack);
impl_envelope_message!(messages::Ping, Ping);
impl_envelope_message!(
    messages::FlushBufferedMessagesResponse,
    FlushBufferedMessagesResponse
);
impl_envelope_message!(AddWorktree, AddWorktree);
impl_envelope_message!(AddWorktreeResponse, AddWorktreeResponse);
impl_envelope_message!(
    messages::AllocateWorktreeIdResponse,
    AllocateWorktreeIdResponse
);
impl_envelope_message!(OpenBufferByPath, OpenBufferByPath);
impl_envelope_message!(OpenBufferResponse, OpenBufferResponse);
impl_envelope_message!(messages::CreateBufferForPeer, CreateBufferForPeer);
impl_envelope_message!(UpdateBuffer, UpdateBuffer);
impl_envelope_message!(SaveBuffer, SaveBuffer);
impl_envelope_message!(BufferSaved, BufferSaved);

impl IntoEnvelope for messages::FlushBufferedMessages {
    fn into_envelope(self, id: u32, responding_to: Option<u32>) -> Envelope {
        Envelope {
            id,
            responding_to,
            original_sender_id: None,
            ack_id: None,
            payload: Some(messages::envelope::Payload::FlushBufferedMessages(self)),
        }
    }
}

fn payload_name(payload: &messages::envelope::Payload) -> &'static str {
    match payload {
        messages::envelope::Payload::Ack(_) => "Ack",
        messages::envelope::Payload::Error(_) => "Error",
        messages::envelope::Payload::UpdateWorktree(_) => "UpdateWorktree",
        messages::envelope::Payload::OpenBufferByPath(_) => "OpenBufferByPath",
        messages::envelope::Payload::OpenBufferResponse(_) => "OpenBufferResponse",
        messages::envelope::Payload::CreateBufferForPeer(_) => "CreateBufferForPeer",
        messages::envelope::Payload::UpdateBuffer(_) => "UpdateBuffer",
        messages::envelope::Payload::UpdateBufferFile(_) => "UpdateBufferFile",
        messages::envelope::Payload::SaveBuffer(_) => "SaveBuffer",
        messages::envelope::Payload::BufferSaved(_) => "BufferSaved",
        messages::envelope::Payload::BufferReloaded(_) => "BufferReloaded",
        messages::envelope::Payload::SynchronizeBuffers(_) => "SynchronizeBuffers",
        messages::envelope::Payload::SynchronizeBuffersResponse(_) => "SynchronizeBuffersResponse",
        messages::envelope::Payload::RejoinRemoteProjects(_) => "RejoinRemoteProjects",
        messages::envelope::Payload::RejoinRemoteProjectsResponse(_) => {
            "RejoinRemoteProjectsResponse"
        }
        messages::envelope::Payload::Ping(_) => "Ping",
        messages::envelope::Payload::AddWorktree(_) => "AddWorktree",
        messages::envelope::Payload::AddWorktreeResponse(_) => "AddWorktreeResponse",
        messages::envelope::Payload::FlushBufferedMessages(_) => "FlushBufferedMessages",
        messages::envelope::Payload::FlushBufferedMessagesResponse(_) => {
            "FlushBufferedMessagesResponse"
        }
        messages::envelope::Payload::RemoteStarted(_) => "RemoteStarted",
        messages::envelope::Payload::AllocateWorktreeId(_) => "AllocateWorktreeId",
        messages::envelope::Payload::AllocateWorktreeIdResponse(_) => "AllocateWorktreeIdResponse",
    }
}

fn should_track_received(envelope: &Envelope) -> bool {
    !matches!(
        envelope.payload,
        Some(messages::envelope::Payload::FlushBufferedMessages(_))
            | Some(messages::envelope::Payload::RemoteStarted(_))
    )
}

fn assign_outgoing_metadata(state: &mut ClientState, envelope: &mut Envelope) {
    envelope.id = state.next_message_id;
    state.next_message_id += 1;
    envelope.ack_id = Some(state.max_received);
}

async fn write_encoded_envelope(
    writer: &mut (dyn AsyncWrite + Send + Unpin),
    envelope: &Envelope,
) -> Result<(), SessionError> {
    let mut buffer = Vec::new();
    envelope
        .encode(&mut buffer)
        .map_err(|error| SessionError::Decode(error.to_string()))?;
    writer
        .write_all(&(buffer.len() as u32).to_le_bytes())
        .await?;
    writer.write_all(&buffer).await?;
    writer.flush().await?;
    Ok(())
}

fn apply_operations(
    base_text: &str,
    mut version: Vec<messages::VectorClockEntry>,
    operations: &[messages::Operation],
) -> Result<String, SessionError> {
    let mut text = base_text.to_string();

    for operation in operations {
        let Some(messages::operation::Variant::Edit(edit)) = &operation.variant else {
            continue;
        };

        let mut replacements = edit
            .ranges
            .iter()
            .zip(edit.new_text.iter())
            .map(|(range, new_text)| (range.start as usize, range.end as usize, new_text.clone()))
            .collect::<Vec<_>>();
        replacements.sort_by(|left, right| right.0.cmp(&left.0));

        for (start, end, new_text) in replacements {
            if start > end || end > text.len() {
                return Err(SessionError::Decode("invalid edit range from proxy".into()));
            }
            text.replace_range(start..end, &new_text);
        }

        version = increment_version(&version, edit.replica_id);
    }

    let _ = version;
    Ok(text)
}

fn increment_version(
    current_version: &[messages::VectorClockEntry],
    replica_id: u32,
) -> Vec<messages::VectorClockEntry> {
    let mut version = current_version.to_vec();
    if let Some(entry) = version
        .iter_mut()
        .find(|entry| entry.replica_id == replica_id)
    {
        entry.timestamp += 1;
    } else {
        version.push(messages::VectorClockEntry {
            replica_id,
            timestamp: 1,
        });
    }
    version
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    #[ignore = "covered by gateway-web integration tests; in-memory duplex test remains flaky"]
    async fn proxy_client_reads_buffer_chunks() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(1, None),
            )
            .await;

            let request = loop {
                let envelope = read_envelope(&mut server_side).await;
                if matches!(
                    envelope.payload,
                    Some(messages::envelope::Payload::RemoteStarted(_))
                ) {
                    break envelope;
                }
            };

            write_envelope(
                &mut server_side,
                messages::Ack {}.into_envelope(2, Some(request.id)),
            )
            .await;

            loop {
                let envelope = read_envelope(&mut server_side).await;
                if matches!(envelope.payload, Some(messages::envelope::Payload::Ack(_))) {
                    break;
                }
            }

            let request = loop {
                let envelope = read_envelope(&mut server_side).await;
                if matches!(
                    envelope.payload,
                    Some(messages::envelope::Payload::AddWorktree(_))
                ) {
                    break envelope;
                }
            };
            write_envelope(
                &mut server_side,
                AddWorktreeResponse {
                    worktree_id: 9,
                    canonicalized_path: "/tmp/test".into(),
                    root_repo_common_dir: None,
                }
                .into_envelope(2, Some(request.id)),
            )
            .await;

            let request = loop {
                let envelope = read_envelope(&mut server_side).await;
                if matches!(
                    envelope.payload,
                    Some(messages::envelope::Payload::OpenBufferByPath(_))
                ) {
                    break envelope;
                }
            };
            write_envelope(
                &mut server_side,
                OpenBufferResponse { buffer_id: 11 }.into_envelope(3, Some(request.id)),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::CreateBufferForPeer {
                    project_id: REMOTE_SERVER_PROJECT_ID,
                    peer_id: Some(REMOTE_SERVER_PEER_ID),
                    variant: Some(messages::create_buffer_for_peer::Variant::State(
                        messages::BufferState {
                            id: 11,
                            file: Some(messages::File {
                                worktree_id: 9,
                                entry_id: None,
                                path: "hello.txt".into(),
                                mtime: None,
                                is_deleted: false,
                                is_historic: false,
                            }),
                            base_text: "hello".into(),
                            line_ending: 0,
                            saved_version: vec![messages::VectorClockEntry {
                                replica_id: 1,
                                timestamp: 1,
                            }],
                            saved_mtime: None,
                        },
                    )),
                }
                .into_envelope(4, None),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::CreateBufferForPeer {
                    project_id: REMOTE_SERVER_PROJECT_ID,
                    peer_id: Some(REMOTE_SERVER_PEER_ID),
                    variant: Some(messages::create_buffer_for_peer::Variant::Chunk(
                        messages::BufferChunk {
                            buffer_id: 11,
                            operations: vec![messages::Operation {
                                variant: Some(messages::operation::Variant::Edit(messages::Edit {
                                    replica_id: 1,
                                    lamport_timestamp: 2,
                                    version: vec![messages::VectorClockEntry {
                                        replica_id: 1,
                                        timestamp: 1,
                                    }],
                                    ranges: vec![messages::Range { start: 5, end: 5 }],
                                    new_text: vec![" world".into()],
                                })),
                            }],
                            is_last: true,
                        },
                    )),
                }
                .into_envelope(5, None),
            )
            .await;
        });

        client.initialize().await.expect("initialize proxy");
        let worktree = client
            .add_worktree("/tmp/test")
            .await
            .expect("add worktree");
        let buffer = client
            .open_buffer_by_path(worktree.worktree_id, "hello.txt")
            .await
            .expect("open buffer");

        assert_eq!(buffer.base_text, "hello world");
        assert_eq!(buffer.buffer_id, 11);
        server.await.expect("join fake server");
    }

    #[tokio::test]
    async fn open_buffer_by_path_reuses_cached_buffer_when_proxy_returns_existing_buffer_id() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            let remote_started = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                ack_with_ack_id(2, Some(remote_started.id), remote_started.id),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(3, None),
            )
            .await;
            let _remote_started_ack = read_envelope(&mut server_side).await;

            let add_worktree_request = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                AddWorktreeResponse {
                    worktree_id: 9,
                    canonicalized_path: "/tmp/test".into(),
                    root_repo_common_dir: None,
                }
                .into_envelope(4, Some(add_worktree_request.id)),
            )
            .await;

            let first_open = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                OpenBufferResponse { buffer_id: 11 }.into_envelope(5, Some(first_open.id)),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::CreateBufferForPeer {
                    project_id: REMOTE_SERVER_PROJECT_ID,
                    peer_id: Some(REMOTE_SERVER_PEER_ID),
                    variant: Some(messages::create_buffer_for_peer::Variant::State(
                        messages::BufferState {
                            id: 11,
                            file: Some(messages::File {
                                worktree_id: 9,
                                entry_id: None,
                                path: "hello.txt".into(),
                                mtime: None,
                                is_deleted: false,
                                is_historic: false,
                            }),
                            base_text: "cached text".into(),
                            line_ending: 0,
                            saved_version: vec![messages::VectorClockEntry {
                                replica_id: 1,
                                timestamp: 1,
                            }],
                            saved_mtime: None,
                        },
                    )),
                }
                .into_envelope(6, None),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::CreateBufferForPeer {
                    project_id: REMOTE_SERVER_PROJECT_ID,
                    peer_id: Some(REMOTE_SERVER_PEER_ID),
                    variant: Some(messages::create_buffer_for_peer::Variant::Chunk(
                        messages::BufferChunk {
                            buffer_id: 11,
                            operations: Vec::new(),
                            is_last: true,
                        },
                    )),
                }
                .into_envelope(7, None),
            )
            .await;

            let second_open = loop {
                let envelope = read_envelope(&mut server_side).await;
                if matches!(
                    envelope.payload,
                    Some(messages::envelope::Payload::OpenBufferByPath(_))
                ) {
                    break envelope;
                }
            };
            write_envelope(
                &mut server_side,
                OpenBufferResponse { buffer_id: 11 }.into_envelope(8, Some(second_open.id)),
            )
            .await;
        });

        client.initialize().await.expect("initialize proxy");
        let worktree = client
            .add_worktree("/tmp/test")
            .await
            .expect("add worktree");
        let first = client
            .open_buffer_by_path(worktree.worktree_id, "hello.txt")
            .await
            .expect("first open");
        let second = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            client.open_buffer_by_path(worktree.worktree_id, "hello.txt"),
        )
        .await
        .expect("cached open timed out")
        .expect("second open");

        assert_eq!(first.buffer_id, 11);
        assert_eq!(second.buffer_id, 11);
        assert_eq!(second.base_text, "cached text");
        server.await.expect("join fake server");
    }

    #[tokio::test]
    async fn initialize_should_ack_flush_buffered_messages() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            let request = read_envelope(&mut server_side).await;
            assert!(matches!(
                request.payload,
                Some(messages::envelope::Payload::RemoteStarted(_))
            ));

            write_envelope(
                &mut server_side,
                ack_with_ack_id(2, Some(request.id), request.id),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::FlushBufferedMessages {}.into_envelope(3, None),
            )
            .await;

            let flush_response = read_envelope(&mut server_side).await;
            assert_eq!(flush_response.responding_to, Some(3));
            assert!(matches!(
                flush_response.payload,
                Some(messages::envelope::Payload::Ack(_))
            ));

            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(4, None),
            )
            .await;

            let remote_started_response = read_envelope(&mut server_side).await;
            assert_eq!(remote_started_response.responding_to, Some(4));
            assert!(matches!(
                remote_started_response.payload,
                Some(messages::envelope::Payload::Ack(_))
            ));
        });

        client.initialize().await.expect("initialize proxy");
        server.await.expect("join fake server");
    }

    #[tokio::test]
    async fn add_worktree_replays_unacked_request_on_flush_buffered_messages() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            let remote_started = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                ack_with_ack_id(2, Some(remote_started.id), remote_started.id),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(3, None),
            )
            .await;

            let remote_started_ack = read_envelope(&mut server_side).await;
            assert_eq!(remote_started_ack.responding_to, Some(3));

            let add_worktree_request = read_envelope(&mut server_side).await;
            assert!(matches!(
                add_worktree_request.payload,
                Some(messages::envelope::Payload::AddWorktree(_))
            ));

            write_envelope(
                &mut server_side,
                messages::FlushBufferedMessages {}.into_envelope(5, None),
            )
            .await;

            let replayed_request = read_envelope(&mut server_side).await;
            assert_eq!(replayed_request.id, add_worktree_request.id);
            assert!(matches!(
                replayed_request.payload,
                Some(messages::envelope::Payload::AddWorktree(_))
            ));

            let flush_ack = read_envelope(&mut server_side).await;
            assert_eq!(flush_ack.responding_to, Some(5));
            assert!(matches!(
                flush_ack.payload,
                Some(messages::envelope::Payload::Ack(_))
            ));

            write_envelope(
                &mut server_side,
                AddWorktreeResponse {
                    worktree_id: 9,
                    canonicalized_path: "/tmp/test".into(),
                    root_repo_common_dir: None,
                }
                .into_envelope(6, Some(add_worktree_request.id)),
            )
            .await;
        });

        client.initialize().await.expect("initialize proxy");
        let worktree = client
            .add_worktree("/tmp/test")
            .await
            .expect("add worktree");

        assert_eq!(worktree.worktree_id, 9);
        server.await.expect("join fake server");
    }

    #[tokio::test]
    async fn ack_id_retires_buffered_messages_before_flush() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            let remote_started = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                ack_with_ack_id(2, Some(remote_started.id), remote_started.id),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(3, None),
            )
            .await;
            let _remote_started_ack = read_envelope(&mut server_side).await;

            let first_request = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                with_ack_id(
                    AddWorktreeResponse {
                        worktree_id: 9,
                        canonicalized_path: "/tmp/first".into(),
                        root_repo_common_dir: None,
                    }
                    .into_envelope(4, Some(first_request.id)),
                    first_request.id,
                ),
            )
            .await;

            let second_request = read_envelope(&mut server_side).await;
            assert!(matches!(
                second_request.payload,
                Some(messages::envelope::Payload::AddWorktree(_))
            ));

            write_envelope(
                &mut server_side,
                messages::FlushBufferedMessages {}.into_envelope(6, None),
            )
            .await;

            let replayed_request = read_envelope(&mut server_side).await;
            assert_eq!(replayed_request.id, second_request.id);

            let flush_ack = read_envelope(&mut server_side).await;
            assert_eq!(flush_ack.responding_to, Some(6));

            write_envelope(
                &mut server_side,
                AddWorktreeResponse {
                    worktree_id: 10,
                    canonicalized_path: "/tmp/second".into(),
                    root_repo_common_dir: None,
                }
                .into_envelope(7, Some(second_request.id)),
            )
            .await;
        });

        client.initialize().await.expect("initialize proxy");
        let first_worktree = client
            .add_worktree("/tmp/first")
            .await
            .expect("first worktree");
        let second_worktree = client
            .add_worktree("/tmp/second")
            .await
            .expect("second worktree");

        assert_eq!(first_worktree.worktree_id, 9);
        assert_eq!(second_worktree.worktree_id, 10);
        server.await.expect("join fake server");
    }

    #[tokio::test]
    async fn request_loop_acks_unsolicited_ping() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            let remote_started = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                ack_with_ack_id(2, Some(remote_started.id), remote_started.id),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(3, None),
            )
            .await;
            let _remote_started_ack = read_envelope(&mut server_side).await;

            let add_worktree_request = read_envelope(&mut server_side).await;

            write_envelope(&mut server_side, messages::Ping {}.into_envelope(4, None)).await;

            let ping_ack = read_envelope(&mut server_side).await;
            assert_eq!(ping_ack.responding_to, Some(4));
            assert!(matches!(
                ping_ack.payload,
                Some(messages::envelope::Payload::Ack(_))
            ));

            write_envelope(
                &mut server_side,
                AddWorktreeResponse {
                    worktree_id: 11,
                    canonicalized_path: "/tmp/ping".into(),
                    root_repo_common_dir: None,
                }
                .into_envelope(5, Some(add_worktree_request.id)),
            )
            .await;
        });

        client.initialize().await.expect("initialize proxy");
        let worktree = client
            .add_worktree("/tmp/ping")
            .await
            .expect("add worktree");

        assert_eq!(worktree.worktree_id, 11);
        server.await.expect("join fake server");
    }

    #[tokio::test]
    async fn client_ping_receives_ack() {
        let (client_side, mut server_side) = duplex(4096);
        let (server_read, server_write) = tokio::io::split(client_side);
        let client = ZedProxyClient::new(Box::new(server_read), Box::new(server_write));

        let server = tokio::spawn(async move {
            let remote_started = read_envelope(&mut server_side).await;
            write_envelope(
                &mut server_side,
                ack_with_ack_id(2, Some(remote_started.id), remote_started.id),
            )
            .await;
            write_envelope(
                &mut server_side,
                messages::RemoteStarted {}.into_envelope(3, None),
            )
            .await;
            let _remote_started_ack = read_envelope(&mut server_side).await;

            let ping_request = read_envelope(&mut server_side).await;
            assert!(matches!(
                ping_request.payload,
                Some(messages::envelope::Payload::Ping(_))
            ));

            write_envelope(
                &mut server_side,
                ack_with_ack_id(4, Some(ping_request.id), ping_request.id),
            )
            .await;
        });

        client.initialize().await.expect("initialize proxy");
        client.ping().await.expect("ping proxy");
        server.await.expect("join fake server");
    }

    fn with_ack_id(mut envelope: Envelope, ack_id: u32) -> Envelope {
        envelope.ack_id = Some(ack_id);
        envelope
    }

    fn ack_with_ack_id(id: u32, responding_to: Option<u32>, ack_id: u32) -> Envelope {
        with_ack_id(messages::Ack {}.into_envelope(id, responding_to), ack_id)
    }

    async fn write_envelope(stream: &mut (impl AsyncWrite + Unpin), envelope: Envelope) {
        let mut buffer = Vec::new();
        envelope.encode(&mut buffer).expect("encode envelope");
        stream
            .write_all(&(buffer.len() as u32).to_le_bytes())
            .await
            .expect("write len");
        stream.write_all(&buffer).await.expect("write body");
        stream.flush().await.expect("flush");
    }

    async fn read_envelope(stream: &mut (impl AsyncRead + Unpin)) -> Envelope {
        let mut len = [0_u8; 4];
        stream.read_exact(&mut len).await.expect("read len");
        let mut buffer = vec![0_u8; u32::from_le_bytes(len) as usize];
        stream.read_exact(&mut buffer).await.expect("read body");
        Envelope::decode(buffer.as_slice()).expect("decode envelope")
    }
}
