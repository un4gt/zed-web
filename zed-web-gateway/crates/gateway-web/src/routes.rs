use actix_web::web;
use actix_web::{HttpRequest, HttpResponse, Scope};
use actix_ws::{CloseCode, CloseReason, Message};
use futures_util::StreamExt;
use gateway_core::events::GatewayEvent;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::error;
use uuid::Uuid;

use crate::app::AppState;
use crate::handlers;
use crate::terminal::{terminal_socket_channel, TerminalSocketCommand};

pub fn api_scope() -> Scope {
    web::scope("/api")
        .route("/health", web::get().to(health))
        .route("/sessions", web::post().to(handlers::create_session))
        .route("/sessions/{session_id}", web::get().to(handlers::get_session))
        .route(
            "/sessions/{session_id}/reconnect",
            web::post().to(handlers::reconnect_session),
        )
        .route("/sessions/{session_id}/tree", web::get().to(handlers::get_tree))
        .route("/sessions/{session_id}/file", web::get().to(handlers::get_file))
        .route("/sessions/{session_id}/file", web::put().to(handlers::put_file))
        .route("/sessions/{session_id}/events", web::get().to(session_events))
        .route("/sessions/{session_id}/terminal", web::get().to(terminal_ws))
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "ok": true }))
}

async fn session_events(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
    session_id: web::Path<Uuid>,
) -> Result<HttpResponse, actix_web::Error> {
    let session = state
        .registry
        .get(session_id.into_inner())
        .await
        .ok_or_else(|| actix_web::error::ErrorNotFound("session not found"))?;

    let (response, mut session_ws, _) = actix_ws::handle(&req, stream)?;
    let mut event_rx = session.subscribe();
    let snapshot = session.snapshot().await;

    actix_web::rt::spawn(async move {
        if let Ok(message) = serde_json::to_string(&GatewayEvent::SessionState {
            session_id: snapshot.id,
            state: snapshot.state.clone(),
            detail: "subscribed".into(),
        }) {
            let _ = session_ws.text(message).await;
        }

        while let Ok(event) = event_rx.recv().await {
            match serde_json::to_string(&event) {
                Ok(message) => {
                    if session_ws.text(message).await.is_err() {
                        break;
                    }
                }
                Err(error) => {
                    error!(?error, "failed to serialize gateway event");
                    break;
                }
            }
        }

        let _ = session_ws
            .close(Some(CloseReason {
                code: CloseCode::Normal,
                description: Some("event stream closed".into()),
            }))
            .await;
    });

    Ok(response)
}

async fn terminal_ws(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
    session_id: web::Path<Uuid>,
    query: web::Query<gateway_core::api::TerminalQuery>,
) -> Result<HttpResponse, actix_web::Error> {
    let session = state
        .registry
        .get(session_id.into_inner())
        .await
        .ok_or_else(|| actix_web::error::ErrorNotFound("session not found"))?;

    let terminal = session
        .open_terminal(query.into_inner().cwd)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let (response, mut socket, mut messages) = actix_ws::handle(&req, stream)?;
    let terminal = std::sync::Arc::new(terminal);
    let (socket_tx, mut socket_rx) = terminal_socket_channel();

    actix_web::rt::spawn(async move {
        while let Some(command) = socket_rx.recv().await {
            match command {
                TerminalSocketCommand::Binary(bytes) => {
                    if socket.binary(bytes).await.is_err() {
                        break;
                    }
                }
                TerminalSocketCommand::Pong(bytes) => {
                    if socket.pong(&bytes).await.is_err() {
                        break;
                    }
                }
                TerminalSocketCommand::Close => {
                    let _ = socket.close(None).await;
                    break;
                }
            }
        }
    });

    let reader_terminal = terminal.clone();
    let reader_socket_tx = socket_tx.clone();
    actix_web::rt::spawn(async move {
        let mut buffer = vec![0_u8; 4096];
        loop {
            let bytes_read = {
                let mut stdout = reader_terminal.stdout.lock().await;
                match stdout.read(&mut buffer).await {
                    Ok(0) => break,
                    Ok(count) => count,
                    Err(error) => {
                        error!(?error, "terminal stdout read failed");
                        break;
                    }
                }
            };

            if reader_socket_tx
                .send(TerminalSocketCommand::Binary(buffer[..bytes_read].to_vec()))
                .is_err()
            {
                break;
            }
        }

        let _ = reader_socket_tx.send(TerminalSocketCommand::Close);
    });

    let writer_terminal = terminal.clone();
    let writer_socket_tx = socket_tx.clone();
    actix_web::rt::spawn(async move {
        while let Some(message_result) = messages.next().await {
            match message_result {
                Ok(Message::Binary(bytes)) => {
                    let mut stdin = writer_terminal.stdin.lock().await;
                    if stdin.write_all(&bytes).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Text(text)) => {
                    let mut stdin = writer_terminal.stdin.lock().await;
                    if stdin.write_all(text.as_bytes()).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Ping(bytes)) => {
                    if writer_socket_tx.send(TerminalSocketCommand::Pong(bytes.to_vec())).is_err() {
                        break;
                    }
                }
                Ok(Message::Pong(_)) => {}
                Ok(Message::Close(_)) => break,
                Ok(Message::Continuation(_)) => {}
                Ok(Message::Nop) => {}
                Err(error) => {
                    error!(?error, "terminal websocket receive failed");
                    break;
                }
            }
        }

        let mut child = writer_terminal.child.lock().await;
        let _ = child.kill().await;
        let _ = writer_socket_tx.send(TerminalSocketCommand::Close);
    });

    Ok(response)
}
