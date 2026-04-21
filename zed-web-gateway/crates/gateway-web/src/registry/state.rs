use std::collections::HashMap;
use std::sync::Arc;

use gateway_core::api::{CreateSessionRequest, SessionSnapshot};
use gateway_core::error::SessionError;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::handle::SessionHandle;

#[derive(Clone)]
pub struct SessionRegistry {
    sessions: Arc<RwLock<HashMap<Uuid, Arc<SessionHandle>>>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        request: CreateSessionRequest,
    ) -> Result<SessionSnapshot, SessionError> {
        let session = SessionHandle::create(request).await?;
        let snapshot = session.snapshot().await;
        self.sessions.write().await.insert(session.id, session);
        Ok(snapshot)
    }

    pub async fn get(&self, id: Uuid) -> Option<Arc<SessionHandle>> {
        self.sessions.read().await.get(&id).cloned()
    }
}
