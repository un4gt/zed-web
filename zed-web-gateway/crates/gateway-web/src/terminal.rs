use actix_ws::Message;
use tokio::sync::mpsc;

pub enum TerminalSocketCommand {
    Binary(Vec<u8>),
    Pong(Vec<u8>),
    Close,
}

pub type TerminalSocketTx = mpsc::UnboundedSender<TerminalSocketCommand>;
pub type TerminalSocketRx = mpsc::UnboundedReceiver<TerminalSocketCommand>;

pub fn terminal_socket_channel() -> (TerminalSocketTx, TerminalSocketRx) {
    mpsc::unbounded_channel()
}

pub fn is_terminal_input(message: &Message) -> bool {
    matches!(message, Message::Binary(_) | Message::Text(_) | Message::Ping(_) | Message::Pong(_) | Message::Close(_))
}
