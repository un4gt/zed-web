use std::sync::Arc;

use actix_web::error::{ErrorBadRequest, ErrorInternalServerError, ErrorNotFound};
use actix_web::web::{Data, Json, Path as WebPath, Query};
use actix_web::{Error, Responder};
use gateway_core::api::{
    CreateSessionRequest, CreateSessionResponse, FileQuery, SaveFileRequest, TerminalQuery,
    TreeQuery,
};
use uuid::Uuid;

use crate::app::AppState;
use crate::registry::SessionHandle;

pub async fn create_session(
    state: Data<AppState>,
    payload: Json<CreateSessionRequest>,
) -> Result<impl Responder, Error> {
    let session = state
        .registry
        .create_session(payload.into_inner())
        .await
        .map_err(ErrorBadRequest)?;

    Ok(Json(CreateSessionResponse { session }))
}

pub async fn get_session(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
) -> Result<impl Responder, Error> {
    let session = require_session(state, session_id.into_inner()).await?;
    Ok(Json(session.snapshot().await))
}

pub async fn reconnect_session(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
) -> Result<impl Responder, Error> {
    let session = require_session(state, session_id.into_inner()).await?;
    let snapshot = session.reconnect().await.map_err(ErrorInternalServerError)?;
    Ok(Json(snapshot))
}

pub async fn get_tree(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
    query: Query<TreeQuery>,
) -> Result<impl Responder, Error> {
    let session = require_session(state, session_id.into_inner()).await?;
    let tree = session
        .list_directory(query.path.clone())
        .await
        .map_err(ErrorInternalServerError)?;
    Ok(Json(tree))
}

pub async fn get_file(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
    query: Query<FileQuery>,
) -> Result<impl Responder, Error> {
    let session = require_session(state, session_id.into_inner()).await?;
    let file = session
        .read_file(&query.path)
        .await
        .map_err(ErrorInternalServerError)?;
    Ok(Json(file))
}

pub async fn put_file(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
    payload: Json<SaveFileRequest>,
) -> Result<impl Responder, Error> {
    let session = require_session(state, session_id.into_inner()).await?;
    let response = session
        .save_file(payload.into_inner())
        .await
        .map_err(ErrorInternalServerError)?;
    Ok(Json(response))
}

pub async fn get_terminal_query(query: Query<TerminalQuery>) -> TerminalQuery {
    query.into_inner()
}

async fn require_session(state: Data<AppState>, session_id: Uuid) -> Result<Arc<SessionHandle>, Error> {
    state
        .registry
        .get(session_id)
        .await
        .ok_or_else(|| ErrorNotFound("session not found"))
}
