use std::sync::Arc;

use gateway_core::error::SessionError;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::messages::{
    self, AddWorktree, AddWorktreeResponse, BufferSaved, Envelope, OpenBufferByPath,
    OpenBufferResponse, SaveBuffer, UpdateBuffer,
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
    writer: Box<dyn AsyncWrite + Send + Unpin>,
    reader: Box<dyn AsyncRead + Send + Unpin>,
    max_received: u32,
}

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
                writer,
                reader,
                max_received: 0,
            })),
        }
    }

    pub async fn initialize(&self) -> Result<(), SessionError> {
        self.send(messages::RemoteStarted {}).await?;
        loop {
            let envelope = self.read_envelope().await?;
            match envelope.payload {
                Some(messages::envelope::Payload::RemoteStarted(_)) => {
                    self.send_ack(envelope.id).await?;
                    return Ok(());
                }
                Some(messages::envelope::Payload::FlushBufferedMessages(_)) => {
                    self.respond(envelope.id, messages::FlushBufferedMessagesResponse {}).await?;
                }
                _ => {}
            }
        }
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
        self.write_envelope(payload.into_envelope(0, None))
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
                                return Ok(OpenedBuffer {
                                    buffer_id,
                                    file: buffer_state.file,
                                    base_text: content,
                                    saved_version: buffer_state.saved_version,
                                });
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
        self.request(SaveBuffer {
            project_id: REMOTE_SERVER_PROJECT_ID,
            buffer_id: buffer.buffer_id,
            version: next_version,
        })
        .await
    }

    async fn request<T, R>(&self, payload: T) -> Result<R, SessionError>
    where
        T: IntoEnvelope,
        R: FromEnvelope,
    {
        let message_id = self.write_envelope(payload.into_envelope(0, None)).await?;

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
            Some(messages::envelope::Payload::FlushBufferedMessages(_)) => {
                self.respond(envelope.id, messages::FlushBufferedMessagesResponse {})
                    .await
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
        self.write_envelope(messages::Ack {}.into_envelope(0, Some(responding_to)))
            .await
            .map(|_| ())
    }

    async fn respond<T>(&self, responding_to: u32, payload: T) -> Result<(), SessionError>
    where
        T: IntoEnvelope,
    {
        self.write_envelope(payload.into_envelope(0, Some(responding_to)))
            .await
            .map(|_| ())
    }

    async fn write_envelope(&self, mut envelope: Envelope) -> Result<u32, SessionError> {
        let mut state = self.state.lock().await;
        let message_id = state.next_message_id;
        state.next_message_id += 1;
        envelope.id = message_id;
        envelope.ack_id = Some(state.max_received);

        let mut buffer = Vec::new();
        envelope
            .encode(&mut buffer)
            .map_err(|error| SessionError::Decode(error.to_string()))?;
        state
            .writer
            .write_all(&(buffer.len() as u32).to_le_bytes())
            .await?;
        state.writer.write_all(&buffer).await?;
        state.writer.flush().await?;
        Ok(message_id)
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
        state.max_received = envelope.id;
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
                match envelope.payload {
                    Some(messages::envelope::Payload::$variant(message)) => Ok(message),
                    Some(messages::envelope::Payload::Error(error)) => {
                        Err(SessionError::SshCommand(error.message))
                    }
                    _ => Err(SessionError::Decode("unexpected response envelope".into())),
                }
            }
        }
    };
}

impl_envelope_message!(messages::RemoteStarted, RemoteStarted);
impl_envelope_message!(messages::Ack, Ack);
impl_envelope_message!(messages::FlushBufferedMessagesResponse, FlushBufferedMessagesResponse);
impl_envelope_message!(AddWorktree, AddWorktree);
impl_envelope_message!(AddWorktreeResponse, AddWorktreeResponse);
impl_envelope_message!(OpenBufferByPath, OpenBufferByPath);
impl_envelope_message!(OpenBufferResponse, OpenBufferResponse);
impl_envelope_message!(messages::CreateBufferForPeer, CreateBufferForPeer);
impl_envelope_message!(UpdateBuffer, UpdateBuffer);
impl_envelope_message!(SaveBuffer, SaveBuffer);
impl_envelope_message!(BufferSaved, BufferSaved);

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
    if let Some(entry) = version.iter_mut().find(|entry| entry.replica_id == replica_id) {
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
        let worktree = client.add_worktree("/tmp/test").await.expect("add worktree");
        let buffer = client
            .open_buffer_by_path(worktree.worktree_id, "hello.txt")
            .await
            .expect("open buffer");

        assert_eq!(buffer.base_text, "hello world");
        assert_eq!(buffer.buffer_id, 11);
        server.await.expect("join fake server");
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
