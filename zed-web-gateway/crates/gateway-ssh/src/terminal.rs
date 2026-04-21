use std::process::Stdio;

use gateway_core::error::SessionError;
use gateway_core::session::resolve_remote_path;
use gateway_core::ssh::{shell_escape, SshTarget};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

pub struct TerminalProcess {
    pub child: Mutex<Child>,
    pub stdin: Mutex<ChildStdin>,
    pub stdout: Mutex<ChildStdout>,
}

pub async fn open_terminal(
    target: &SshTarget,
    project_root: &str,
    cwd: Option<&str>,
) -> Result<TerminalProcess, SessionError> {
    let directory = resolve_remote_path(project_root, cwd);
    let mut command = Command::new("ssh");
    command.arg("-tt");

    if let Some(port) = target.port {
        command.arg("-p").arg(port.to_string());
    }

    command.args(&target.args);

    command
        .arg(target.destination())
        .arg(format!("cd {} && exec $SHELL -l", shell_escape(&directory)))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| SessionError::SshCommand("failed to open terminal stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| SessionError::SshCommand("failed to open terminal stdout".into()))?;

    Ok(TerminalProcess {
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        stdout: Mutex::new(stdout),
    })
}
