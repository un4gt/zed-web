use std::sync::Arc;
use std::time::Instant;

use gateway_core::api::{
    CreateSessionRequest, FileResponse, RemoteServerUpdateMode, SaveFileRequest, SaveFileResponse,
    SessionSnapshot, TreeResponse,
};
use gateway_core::error::SessionError;
use gateway_core::events::GatewayEvent;
use gateway_core::session::{ConnectionState, ProxyState};
use gateway_core::ssh::SshTarget;
use gateway_ssh::proxy::spawn_proxy;
use gateway_ssh::terminal::{TerminalProcess, open_terminal};
use gateway_ssh::transport;
use gateway_zed_proxy::client::ZedProxyClient;
use tokio::io::AsyncReadExt;
use tokio::process::Child;
use tokio::sync::{Mutex, RwLock, broadcast};
use tracing::warn;
use uuid::Uuid;

use super::managed_remote::prepare_managed_remote_binary;
use super::remote_version::resolve_remote_server_policy;

const EVENT_BUFFER: usize = 256;

pub struct SessionHandle {
    pub id: Uuid,
    event_tx: broadcast::Sender<GatewayEvent>,
    inner: RwLock<SessionState>,
    proxy: Mutex<Option<Child>>,
    zed_client: Mutex<Option<ZedProxyClient>>,
}

fn with_stage(stage: &'static str, error: SessionError) -> SessionError {
    match error {
        SessionError::InvalidRequest(message) => {
            SessionError::InvalidRequest(format!("{stage}: {message}"))
        }
        SessionError::SshCommand(message) => {
            SessionError::SshCommand(format!("{stage}: {message}"))
        }
        SessionError::Decode(message) => SessionError::Decode(format!("{stage}: {message}")),
        other => other,
    }
}

struct SessionState {
    target: SshTarget,
    project_path: String,
    session_label: String,
    identifier: String,
    zed_remote_binary: String,
    managed_remote_exec: Option<String>,
    remote_server_mode: RemoteServerUpdateMode,
    remote_server_version: Option<String>,
    managed_data_dir: std::path::PathBuf,
    worktree_id: Option<u64>,
    connection_state: ConnectionState,
    last_heartbeat_at: Instant,
    last_error: Option<String>,
    proxy: Option<ProxyState>,
}

impl SessionHandle {
    pub async fn create(request: CreateSessionRequest) -> Result<Arc<Self>, SessionError> {
        validate_request(&request)?;

        let target = SshTarget {
            host: request.host.trim().to_string(),
            user: request
                .user
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            port: request.port,
            args: request.ssh_args,
        };
        let id = Uuid::new_v4();
        let identifier = format!("workspace-{}", id.simple());
        let zed_remote_binary = request
            .zed_remote_binary
            .unwrap_or_else(|| "zed-remote-server".to_string());
        let resolved_remote_server = resolve_remote_server_policy(request.remote_server.clone())?;
        let managed_data_dir = request
            .managed_data_dir
            .clone()
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var("ZED_WEB_DATA_DIR")
                    .ok()
                    .map(std::path::PathBuf::from)
            })
            .unwrap_or_else(|| std::path::PathBuf::from("/var/lib/zed-web"));
        let (event_tx, _) = broadcast::channel(EVENT_BUFFER);

        let handle = Arc::new(Self {
            id,
            event_tx,
            inner: RwLock::new(SessionState {
                session_label: target.display(),
                target,
                project_path: request.project_path,
                identifier,
                zed_remote_binary,
                managed_remote_exec: request.managed_remote_exec,
                remote_server_mode: resolved_remote_server.mode,
                remote_server_version: resolved_remote_server.selected_version,
                managed_data_dir,
                worktree_id: None,
                connection_state: ConnectionState::Connecting,
                last_heartbeat_at: Instant::now(),
                last_error: None,
                proxy: None,
            }),
            proxy: Mutex::new(None),
            zed_client: Mutex::new(None),
        });

        handle
            .send_event(GatewayEvent::SessionState {
                session_id: id,
                state: ConnectionState::Connecting,
                detail: "opening project and starting remote proxy".into(),
            })
            .await;

        handle.start_proxy(false).await?;
        Ok(handle)
    }

    pub async fn snapshot(&self) -> SessionSnapshot {
        let inner = self.inner.read().await;
        let (proxy_active, reconnect_count) = if let Some(proxy) = &inner.proxy {
            (proxy.active, proxy.reconnect_count)
        } else {
            (false, 0)
        };

        SessionSnapshot {
            id: self.id,
            target: inner.session_label.clone(),
            project_path: inner.project_path.clone(),
            identifier: inner.identifier.clone(),
            state: inner.connection_state.clone(),
            proxy_active,
            reconnect_count,
            last_error: inner.last_error.clone(),
            remote_server_mode: inner.remote_server_mode.clone(),
            remote_server_version: inner.remote_server_version.clone(),
        }
    }

    pub async fn reconnect(&self) -> Result<SessionSnapshot, SessionError> {
        {
            let mut inner = self.inner.write().await;
            inner.connection_state = ConnectionState::Reconnecting;
            inner.last_heartbeat_at = Instant::now();
        }

        self.send_event(GatewayEvent::SessionState {
            session_id: self.id,
            state: ConnectionState::Reconnecting,
            detail: "restarting remote proxy with the same session identifier".into(),
        })
        .await;

        self.stop_proxy().await;
        self.start_proxy(true).await?;
        Ok(self.snapshot().await)
    }

    pub async fn list_directory(
        &self,
        requested_path: Option<String>,
    ) -> Result<TreeResponse, SessionError> {
        let (target, project_path) = self.target_and_path().await;
        let tree =
            transport::list_directory(&target, &project_path, requested_path.as_deref()).await?;
        self.touch_heartbeat().await;
        Ok(tree)
    }

    pub async fn read_file(&self, requested_path: &str) -> Result<FileResponse, SessionError> {
        let file = self.read_file_via_proxy(requested_path).await?;
        self.touch_heartbeat().await;
        Ok(file)
    }

    pub async fn save_file(
        &self,
        request: SaveFileRequest,
    ) -> Result<SaveFileResponse, SessionError> {
        let response = self.save_file_via_proxy(request).await?;
        self.touch_heartbeat().await;

        self.send_event(GatewayEvent::SessionState {
            session_id: self.id,
            state: ConnectionState::Ready,
            detail: format!("saved {}", response.path),
        })
        .await;

        Ok(response)
    }

    pub async fn open_terminal(
        &self,
        cwd: Option<String>,
    ) -> Result<TerminalProcess, SessionError> {
        let (target, project_path) = self.target_and_path().await;
        let terminal = open_terminal(&target, &project_path, cwd.as_deref()).await?;
        self.touch_heartbeat().await;

        self.send_event(GatewayEvent::TerminalNotice {
            session_id: self.id,
            detail: format!("terminal opened in {}", cwd.unwrap_or(project_path)),
        })
        .await;

        Ok(terminal)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<GatewayEvent> {
        self.event_tx.subscribe()
    }

    async fn start_proxy(&self, reconnect: bool) -> Result<(), SessionError> {
        let (
            target,
            project_path,
            identifier,
            zed_remote_binary,
            managed_remote_exec,
            remote_server_mode,
            remote_server_version,
            managed_data_dir,
        ) = self.proxy_context().await;

        let managed_binary = prepare_managed_remote_binary(
            &target,
            &zed_remote_binary,
            &super::remote_version::ResolvedRemoteServerPolicy {
                mode: remote_server_mode,
                selected_version: remote_server_version,
            },
            &managed_data_dir,
            managed_remote_exec.as_deref(),
        )
        .await
        .map_err(|error| with_stage("prepare_managed_remote_binary", error))?;

        let version =
            transport::probe_remote(&target, &project_path, &managed_binary.remote_binary_path)
                .await
                .map_err(|error| with_stage("probe_remote", error))?;
        let proxy = spawn_proxy(
            &target,
            &managed_binary.remote_binary_path,
            &identifier,
            reconnect,
        )
        .await
        .map_err(|error| with_stage("spawn_proxy", error))?;
        let gateway_ssh::proxy::ProxyProcess {
            child,
            mut stderr,
            stdin,
            stdout,
        } = proxy;
        let zed_client = ZedProxyClient::new(Box::new(stdout), Box::new(stdin));
        if let Err(error) = zed_client.initialize().await {
            let error = with_stage("zed_proxy.initialize", error);
            let mut stderr_buffer = String::new();
            let _ = stderr.read_to_string(&mut stderr_buffer).await;
            if !stderr_buffer.trim().is_empty() {
                let stderr_trimmed = stderr_buffer.trim();
                let message = match &error {
                    SessionError::SshCommand(message) => {
                        format!("{message}; proxy stderr: {stderr_trimmed}")
                    }
                    _ => format!("{error}; proxy stderr: {stderr_trimmed}"),
                };
                return Err(SessionError::SshCommand(message));
            }
            return Err(error);
        }
        let worktree = zed_client
            .add_worktree(&project_path)
            .await
            .map_err(|error| with_stage("zed_proxy.add_worktree", error))?;

        {
            let mut slot = self.proxy.lock().await;
            *slot = Some(child);
        }

        {
            let mut client_slot = self.zed_client.lock().await;
            *client_slot = Some(zed_client);
        }

        {
            let mut inner = self.inner.write().await;
            inner.remote_server_version = managed_binary.effective_version.clone();
            inner.worktree_id = Some(worktree.worktree_id);
            inner.connection_state = ConnectionState::Ready;
            inner.last_error = None;
            match &mut inner.proxy {
                Some(proxy_state) => {
                    proxy_state.active = true;
                    if reconnect {
                        proxy_state.reconnect_count += 1;
                    }
                }
                None => {
                    inner.proxy = Some(ProxyState {
                        active: true,
                        reconnect_count: if reconnect { 1 } else { 0 },
                    });
                }
            }
        }

        self.touch_heartbeat().await;
        self.send_event(GatewayEvent::ProxyStatus {
            session_id: self.id,
            active: true,
            identifier,
        })
        .await;

        let version_line = version.lines().next().unwrap_or("unknown");
        self.send_event(GatewayEvent::SessionState {
            session_id: self.id,
            state: ConnectionState::Ready,
            detail: format!("remote proxy started ({version_line})"),
        })
        .await;

        Ok(())
    }

    async fn stop_proxy(&self) {
        let mut slot = self.proxy.lock().await;
        if let Some(proxy) = slot.as_mut() {
            let _ = proxy.kill().await;
        }
        *slot = None;

        let mut client_slot = self.zed_client.lock().await;
        *client_slot = None;

        let mut inner = self.inner.write().await;
        inner.worktree_id = None;
        if let Some(proxy_state) = &mut inner.proxy {
            proxy_state.active = false;
        }
    }

    async fn target_and_path(&self) -> (SshTarget, String) {
        let inner = self.inner.read().await;
        (inner.target.clone(), inner.project_path.clone())
    }

    async fn proxy_context(
        &self,
    ) -> (
        SshTarget,
        String,
        String,
        String,
        Option<String>,
        RemoteServerUpdateMode,
        Option<String>,
        std::path::PathBuf,
    ) {
        let inner = self.inner.read().await;
        (
            inner.target.clone(),
            inner.project_path.clone(),
            inner.identifier.clone(),
            inner.zed_remote_binary.clone(),
            inner.managed_remote_exec.clone(),
            inner.remote_server_mode.clone(),
            inner.remote_server_version.clone(),
            inner.managed_data_dir.clone(),
        )
    }

    async fn read_file_via_proxy(
        &self,
        requested_path: &str,
    ) -> Result<FileResponse, SessionError> {
        let worktree_id = self
            .inner
            .read()
            .await
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        let buffer = client
            .open_buffer_by_path(worktree_id, requested_path)
            .await?;
        Ok(FileResponse {
            path: buffer
                .file
                .as_ref()
                .map(|file| file.path.clone())
                .unwrap_or_else(|| requested_path.to_string()),
            content: buffer.base_text,
            truncated: false,
        })
    }

    async fn save_file_via_proxy(
        &self,
        request: SaveFileRequest,
    ) -> Result<SaveFileResponse, SessionError> {
        let worktree_id = self
            .inner
            .read()
            .await
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        let buffer = client
            .open_buffer_by_path(worktree_id, &request.path)
            .await?;
        client.overwrite_and_save(&buffer, &request.content).await?;
        Ok(SaveFileResponse {
            path: request.path,
            bytes_written: request.content.len(),
        })
    }

    async fn touch_heartbeat(&self) {
        let mut inner = self.inner.write().await;
        inner.last_heartbeat_at = Instant::now();
    }

    async fn send_event(&self, event: GatewayEvent) {
        if self.event_tx.send(event).is_err() {
            warn!(session_id = %self.id, "dropped gateway event without listeners");
        }
    }
}

fn validate_request(request: &CreateSessionRequest) -> Result<(), SessionError> {
    if request.host.trim().is_empty() {
        return Err(SessionError::InvalidRequest("host is required".into()));
    }

    if request.project_path.trim().is_empty() {
        return Err(SessionError::InvalidRequest(
            "project_path is required".into(),
        ));
    }

    Ok(())
}
