use std::process::Stdio;

use gateway_core::error::SessionError;
use gateway_core::ssh::SshTarget;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

pub struct ProxyProcess {
    pub child: Child,
    pub stderr: ChildStderr,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
}

pub async fn spawn_proxy(
    target: &SshTarget,
    zed_remote_binary: &str,
    identifier: &str,
    reconnect: bool,
) -> Result<ProxyProcess, SessionError> {
    let mut command = Command::new("ssh");

    if let Some(port) = target.port {
        command.arg("-p").arg(port.to_string());
    }

    command.args(&target.args);

    let remote_command = if reconnect {
        format!(
            "{binary} proxy --identifier {identifier} --reconnect",
            binary = zed_remote_binary,
            identifier = identifier,
        )
    } else {
        format!(
            "{binary} proxy --identifier {identifier}",
            binary = zed_remote_binary,
            identifier = identifier,
        )
    };

    command
        .arg(target.destination())
        .arg(remote_command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| SessionError::SshCommand("failed to open proxy stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| SessionError::SshCommand("failed to open proxy stdout".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| SessionError::SshCommand("failed to open proxy stderr".into()))?;

    Ok(ProxyProcess {
        child,
        stderr,
        stdin,
        stdout,
    })
}
