use serde::Serialize;
use uuid::Uuid;

use crate::session::ConnectionState;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GatewayEvent {
    SessionState {
        session_id: Uuid,
        state: ConnectionState,
        detail: String,
    },
    ProxyStatus {
        session_id: Uuid,
        active: bool,
        identifier: String,
    },
    TerminalNotice {
        session_id: Uuid,
        detail: String,
    },
    Error {
        session_id: Uuid,
        detail: String,
    },
}
