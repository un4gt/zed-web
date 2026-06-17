use std::sync::Arc;

use actix_ws::{CloseCode, CloseReason, Message, Session};
use base64::Engine;
use futures_util::StreamExt;
use gateway_core::api::{
    BufferChunkPayload, BufferOpenCommand, BufferOpenCompletePayload, BufferOpenStartedPayload,
    BufferSaveCommand, BufferSyncCommand, CommandEnvelope, CommandErrorPayload, CommandResponse,
    FileChunkPayload, FileCompletePayload, FileOpenCommand, FileOpenStartedPayload,
    MAX_STREAMED_FILE_BYTES, SaveFileRequest, TreeListCommand,
};
use gateway_core::error::SessionError;
use gateway_ssh::transport::{StreamedFileChunk, StreamedFileSummary};
use serde::Serialize;
use tokio::sync::mpsc;
use tracing::error;

use crate::registry::SessionHandle;

type SocketTx = mpsc::UnboundedSender<String>;

pub async fn command_socket(
    session: Arc<SessionHandle>,
    mut socket: Session,
    mut messages: actix_ws::MessageStream,
) {
    let (socket_tx, mut socket_rx) = mpsc::unbounded_channel::<String>();

    loop {
        tokio::select! {
            Some(message) = socket_rx.recv() => {
                if socket.text(message).await.is_err() {
                    break;
                }
            }
            message_result = messages.next() => {
                match message_result {
                    Some(Ok(Message::Text(text))) => {
                        let envelope = match serde_json::from_str::<CommandEnvelope>(&text) {
                            Ok(envelope) => envelope,
                            Err(error) => {
                                if send_error(
                                    &socket_tx,
                                    "",
                                    format!("invalid command payload: {error}"),
                                )
                                .is_err()
                                {
                                    break;
                                }
                                continue;
                            }
                        };

                        let command_session = session.clone();
                        let command_socket_tx = socket_tx.clone();
                        actix_web::rt::spawn(async move {
                            handle_command(command_session, command_socket_tx, envelope).await;
                        });
                    }
                    Some(Ok(Message::Ping(bytes))) => {
                        if socket.pong(&bytes).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(reason))) => {
                        let _ = socket.close(reason).await;
                        return;
                    }
                    Some(Ok(Message::Binary(_))) | Some(Ok(Message::Continuation(_))) | Some(Ok(Message::Nop)) => {}
                    Some(Err(error)) => {
                        error!(?error, "command websocket receive failed");
                        break;
                    }
                    None => break,
                }
            }
        }
    }

    let _ = socket
        .close(Some(CloseReason {
            code: CloseCode::Normal,
            description: Some("command stream closed".into()),
        }))
        .await;
}

async fn handle_command(
    session: Arc<SessionHandle>,
    socket_tx: SocketTx,
    envelope: CommandEnvelope,
) {
    let result = match envelope.command_type.as_str() {
        "buffer.open" => handle_buffer_open(session, &socket_tx, &envelope).await,
        "buffer.save" => handle_buffer_save(session, &socket_tx, &envelope).await,
        "buffer.sync" => handle_buffer_sync(session, &socket_tx, &envelope).await,
        "file.open" => handle_file_open(session, &socket_tx, &envelope).await,
        "file.save" => handle_file_save(session, &socket_tx, &envelope).await,
        "tree.list" => handle_tree_list(session, &socket_tx, &envelope).await,
        "session.reconnect" => handle_session_reconnect(session, &socket_tx, &envelope).await,
        command_type => {
            let _ = send_error(
                &socket_tx,
                &envelope.id,
                format!("unsupported command type: {command_type}"),
            );
            return;
        }
    };

    if let Err(error) = result {
        let _ = send_error(&socket_tx, &envelope.id, error.to_string());
    }
}

async fn handle_buffer_open(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let command: BufferOpenCommand = serde_json::from_value(envelope.payload.clone())?;
    let chunk_bytes = command.chunk_bytes.clamp(1, MAX_STREAMED_FILE_BYTES);
    let initial_bytes = command.initial_bytes.clamp(1, MAX_STREAMED_FILE_BYTES);

    send_response(
        socket_tx,
        &envelope.id,
        "buffer.open.started",
        BufferOpenStartedPayload {
            path: command.path.clone(),
            read_only: true,
        },
    )?;

    let opened = session
        .open_buffer(&command.path, MAX_STREAMED_FILE_BYTES)
        .await?;
    stream_buffer_content(
        socket_tx,
        &envelope.id,
        &opened.path,
        &opened.content,
        initial_bytes,
        chunk_bytes,
    )?;
    send_response(
        socket_tx,
        &envelope.id,
        "buffer.open.complete",
        BufferOpenCompletePayload {
            path: opened.path,
            bytes_read: opened.bytes_read,
            truncated: opened.truncated,
            read_only: opened.read_only,
            resource_version: opened.resource_version,
        },
    )?;
    Ok(())
}

async fn handle_file_open(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let command: FileOpenCommand = serde_json::from_value(envelope.payload.clone())?;
    let chunk_bytes = command.chunk_bytes.clamp(1, MAX_STREAMED_FILE_BYTES);
    let initial_bytes = command.initial_bytes.clamp(1, MAX_STREAMED_FILE_BYTES);
    send_response(
        socket_tx,
        &envelope.id,
        "file.open.started",
        FileOpenStartedPayload {
            path: command.path.clone(),
            read_only: true,
        },
    )?;

    let response_id = envelope.id.clone();
    let path = command.path.clone();
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<FileOpenProgress>();
    actix_web::rt::spawn(async move {
        let chunk_tx = progress_tx.clone();
        let summary = session
            .stream_file(
                &path,
                initial_bytes,
                chunk_bytes,
                MAX_STREAMED_FILE_BYTES,
                |chunk| {
                    chunk_tx
                        .send(FileOpenProgress::Chunk(chunk))
                        .map_err(|_| SessionError::SshCommand("command websocket closed".into()))
                },
            )
            .await;

        let _ = progress_tx.send(FileOpenProgress::Complete(summary));
    });

    while let Some(progress) = progress_rx.recv().await {
        match progress {
            FileOpenProgress::Chunk(chunk) => {
                send_file_chunk(socket_tx, &response_id, chunk)?;
            }
            FileOpenProgress::Complete(Ok(summary)) => {
                send_response(
                    socket_tx,
                    &envelope.id,
                    "file.complete",
                    FileCompletePayload {
                        path: summary.path,
                        bytes_read: summary.bytes_read,
                        truncated: summary.truncated,
                    },
                )?;
                return Ok(());
            }
            FileOpenProgress::Complete(Err(error)) => return Err(error.into()),
        }
    }

    Err(CommandHandlerError::Session(SessionError::SshCommand(
        "file open task stopped before completion".into(),
    )))
}

enum FileOpenProgress {
    Chunk(StreamedFileChunk),
    Complete(Result<StreamedFileSummary, SessionError>),
}

async fn handle_file_save(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let request: SaveFileRequest = serde_json::from_value(envelope.payload.clone())?;
    let response = session.save_file(request).await?;
    send_response(socket_tx, &envelope.id, "file.save.complete", response)?;
    Ok(())
}

async fn handle_buffer_save(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let request: BufferSaveCommand = serde_json::from_value(envelope.payload.clone())?;
    let response = session.save_buffer(request).await?;
    send_response(socket_tx, &envelope.id, "buffer.save.complete", response)?;
    Ok(())
}

async fn handle_buffer_sync(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let request: BufferSyncCommand = serde_json::from_value(envelope.payload.clone())?;
    let response = session.sync_buffers(request).await?;
    send_response(socket_tx, &envelope.id, "buffer.sync.complete", response)?;
    Ok(())
}

async fn handle_tree_list(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let request: TreeListCommand = serde_json::from_value(envelope.payload.clone())?;
    let response = session.list_directory(request.path, request.depth).await?;
    send_response(socket_tx, &envelope.id, "tree.list.complete", response)?;
    Ok(())
}

async fn handle_session_reconnect(
    session: Arc<SessionHandle>,
    socket_tx: &SocketTx,
    envelope: &CommandEnvelope,
) -> Result<(), CommandHandlerError> {
    let response = session.reconnect().await?;
    send_response(
        socket_tx,
        &envelope.id,
        "session.reconnect.complete",
        response,
    )?;
    Ok(())
}

fn send_file_chunk(
    socket_tx: &SocketTx,
    id: &str,
    chunk: StreamedFileChunk,
) -> Result<(), CommandHandlerError> {
    let data = base64::engine::general_purpose::STANDARD.encode(&chunk.bytes);
    send_response(
        socket_tx,
        id,
        "file.chunk",
        FileChunkPayload {
            path: chunk.path,
            offset: chunk.offset,
            encoding: "base64",
            data,
            done: false,
        },
    )
}

fn stream_buffer_content(
    socket_tx: &SocketTx,
    id: &str,
    path: &str,
    content: &str,
    initial_bytes: usize,
    chunk_bytes: usize,
) -> Result<(), CommandHandlerError> {
    let bytes = content.as_bytes();
    let mut offset = 0_usize;
    let mut next_chunk_bytes = initial_bytes.max(1);

    while offset < bytes.len() {
        let mut end = (offset + next_chunk_bytes).min(bytes.len());
        while end > offset && !content.is_char_boundary(end) {
            end -= 1;
        }
        if end == offset {
            end = (offset + 1).min(bytes.len());
            while end < bytes.len() && !content.is_char_boundary(end) {
                end += 1;
            }
        }

        send_response(
            socket_tx,
            id,
            "buffer.chunk",
            BufferChunkPayload {
                path: path.to_string(),
                offset,
                encoding: "base64",
                data: base64::engine::general_purpose::STANDARD.encode(&bytes[offset..end]),
                done: false,
            },
        )?;
        offset = end;
        next_chunk_bytes = chunk_bytes.max(1);
    }

    Ok(())
}

fn send_response<T>(
    socket_tx: &SocketTx,
    id: &str,
    response_type: &str,
    payload: T,
) -> Result<(), CommandHandlerError>
where
    T: Serialize,
{
    let response = CommandResponse {
        id: id.to_string(),
        response_type: response_type.to_string(),
        payload,
    };
    let message = serde_json::to_string(&response).map_err(|error| {
        error!(?error, "failed to serialize command response");
        CommandHandlerError::Serialize(error)
    })?;
    socket_tx
        .send(message)
        .map_err(|_| CommandHandlerError::SocketClosed)
}

fn send_error(socket_tx: &SocketTx, id: &str, message: String) -> Result<(), CommandHandlerError> {
    send_response(
        socket_tx,
        id,
        "error",
        CommandErrorPayload {
            message: if message.is_empty() {
                "command failed".into()
            } else {
                message
            },
        },
    )
}

#[derive(Debug)]
enum CommandHandlerError {
    Json(serde_json::Error),
    Serialize(serde_json::Error),
    Session(SessionError),
    SocketClosed,
}

impl std::fmt::Display for CommandHandlerError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "invalid command payload: {error}"),
            Self::Serialize(error) => write!(formatter, "failed to serialize response: {error}"),
            Self::Session(error) => write!(formatter, "{error}"),
            Self::SocketClosed => formatter.write_str("command websocket closed"),
        }
    }
}

impl From<serde_json::Error> for CommandHandlerError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<SessionError> for CommandHandlerError {
    fn from(error: SessionError) -> Self {
        Self::Session(error)
    }
}

impl From<actix_ws::Closed> for CommandHandlerError {
    fn from(_: actix_ws::Closed) -> Self {
        Self::SocketClosed
    }
}
