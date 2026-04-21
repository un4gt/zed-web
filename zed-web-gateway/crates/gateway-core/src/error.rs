use thiserror::Error;

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("invalid session request: {0}")]
    InvalidRequest(String),
    #[error("ssh command failed: {0}")]
    SshCommand(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("utf8 decode error: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
    #[error("payload decode error: {0}")]
    Decode(String),
}
