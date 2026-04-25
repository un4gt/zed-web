use std::sync::Arc;

use actix_web::web::{Data, Json, Path as WebPath, Query};
use actix_web::{HttpResponse, Responder, ResponseError};
use gateway_core::api::{
    CreateSessionRequest, CreateSessionResponse, FileQuery, SaveFileRequest, TerminalQuery,
    TreeQuery,
};
use gateway_core::error::SessionError;
use serde::Serialize;
use uuid::Uuid;

use crate::app::AppState;
use crate::registry::SessionHandle;

pub async fn create_session(
    state: Data<AppState>,
    payload: Json<CreateSessionRequest>,
) -> Result<impl Responder, ApiError> {
    let session = state
        .registry
        .create_session(payload.into_inner())
        .await
        .map_err(ApiError::from_session_error)?;

    Ok(Json(CreateSessionResponse { session }))
}

pub async fn get_session(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
) -> Result<impl Responder, ApiError> {
    let session = require_session(state, session_id.into_inner()).await?;
    Ok(Json(session.snapshot().await))
}

pub async fn reconnect_session(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
) -> Result<impl Responder, ApiError> {
    let session = require_session(state, session_id.into_inner()).await?;
    let snapshot = session
        .reconnect()
        .await
        .map_err(ApiError::from_session_error)?;
    Ok(Json(snapshot))
}

pub async fn get_tree(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
    query: Query<TreeQuery>,
) -> Result<impl Responder, ApiError> {
    let session = require_session(state, session_id.into_inner()).await?;
    let tree = session
        .list_directory(query.path.clone())
        .await
        .map_err(ApiError::from_session_error)?;
    Ok(Json(tree))
}

pub async fn get_file(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
    query: Query<FileQuery>,
) -> Result<impl Responder, ApiError> {
    let session = require_session(state, session_id.into_inner()).await?;
    let file = session
        .read_file(&query.path)
        .await
        .map_err(ApiError::from_session_error)?;
    Ok(Json(file))
}

pub async fn put_file(
    state: Data<AppState>,
    session_id: WebPath<Uuid>,
    payload: Json<SaveFileRequest>,
) -> Result<impl Responder, ApiError> {
    let session = require_session(state, session_id.into_inner()).await?;
    let response = session
        .save_file(payload.into_inner())
        .await
        .map_err(ApiError::from_session_error)?;
    Ok(Json(response))
}

pub async fn get_terminal_query(query: Query<TerminalQuery>) -> TerminalQuery {
    query.into_inner()
}

pub async fn require_session(
    state: Data<AppState>,
    session_id: Uuid,
) -> Result<Arc<SessionHandle>, ApiError> {
    state
        .registry
        .get(session_id)
        .await
        .ok_or(ApiError::NotFound("session not found".into()))
}

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Internal(String),
    NotFound(String),
}

impl ApiError {
    pub fn from_session_error(error: SessionError) -> Self {
        match error {
            SessionError::InvalidRequest(message) => Self::BadRequest(message),
            other => Self::Internal(other.to_string()),
        }
    }
}

#[derive(Serialize)]
struct ApiErrorBody<'a> {
    error: &'a str,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BadRequest(message) | Self::Internal(message) | Self::NotFound(message) => {
                formatter.write_str(message)
            }
        }
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            Self::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
            Self::Internal(_) => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
            Self::NotFound(_) => actix_web::http::StatusCode::NOT_FOUND,
        }
    }

    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status_code()).json(ApiErrorBody {
            error: &self.to_string(),
        })
    }
}
