use std::sync::Arc;
use std::time::{Duration, Instant};

use gateway_core::api::{
    BufferSaveCommand, BufferSaveCompletePayload, BufferSyncCommand, BufferSyncCompletePayload,
    BufferSyncResponseItem, BufferSyncStatus, CreateSessionRequest, FileResponse,
    RemoteServerUpdateMode, ResourceVersion, ResourceVersionScheme, SaveFileRequest,
    SaveFileResponse, SessionSnapshot, TreeResponse,
};
use gateway_core::error::SessionError;
use gateway_core::events::GatewayEvent;
use gateway_core::session::{ConnectionState, ProxyState, normalize_worktree_relative_path};
use gateway_core::ssh::SshTarget;
use gateway_ssh::proxy::spawn_proxy;
use gateway_ssh::terminal::{TerminalProcess, open_terminal};
use gateway_ssh::transport;
use gateway_zed_proxy::client::ZedProxyClient;
use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;
use tokio::process::Child;
use tokio::sync::{Mutex, RwLock, broadcast};
use tokio::time::timeout;
use tracing::warn;
use uuid::Uuid;

use super::managed_remote::prepare_managed_remote_binary;
use super::remote_version::resolve_remote_server_policy;
use crate::text_edits::apply_text_change_batches;

const EVENT_BUFFER: usize = 256;
const FILE_PROXY_TIMEOUT: Duration = Duration::from_secs(8);

pub struct SessionHandle {
    pub id: Uuid,
    event_tx: broadcast::Sender<GatewayEvent>,
    inner: RwLock<SessionState>,
    proxy: Mutex<Option<Child>>,
    zed_client: Mutex<Option<ZedProxyClient>>,
}

pub struct OpenBufferResult {
    pub path: String,
    pub content: String,
    pub bytes_read: usize,
    pub truncated: bool,
    pub read_only: bool,
    pub resource_version: ResourceVersion,
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
        requested_depth: Option<usize>,
    ) -> Result<TreeResponse, SessionError> {
        let (target, project_path) = self.target_and_path().await;
        let tree = transport::list_directory(
            &target,
            &project_path,
            requested_path.as_deref(),
            requested_depth,
        )
        .await?;
        self.touch_heartbeat().await;
        Ok(tree)
    }

    pub async fn read_file(&self, requested_path: &str) -> Result<FileResponse, SessionError> {
        let file = match timeout(FILE_PROXY_TIMEOUT, self.read_file_via_proxy(requested_path)).await
        {
            Ok(Ok(file)) => file,
            Ok(Err(error)) => {
                warn!(
                    session_id = %self.id,
                    path = %requested_path,
                    %error,
                    "zed proxy file open failed; falling back to ssh file read"
                );
                self.read_file_via_transport(requested_path).await?
            }
            Err(_) => {
                warn!(
                    session_id = %self.id,
                    path = %requested_path,
                    "zed proxy file open timed out; falling back to ssh file read"
                );
                self.read_file_via_transport(requested_path).await?
            }
        };
        self.touch_heartbeat().await;
        Ok(file)
    }

    pub async fn open_buffer(
        &self,
        requested_path: &str,
        max_bytes: usize,
    ) -> Result<OpenBufferResult, SessionError> {
        let buffer = match timeout(
            FILE_PROXY_TIMEOUT,
            self.open_buffer_via_proxy(requested_path, max_bytes),
        )
        .await
        {
            Ok(Ok(buffer)) => buffer,
            Ok(Err(error)) => {
                warn!(
                    session_id = %self.id,
                    path = %requested_path,
                    %error,
                    "zed proxy buffer open failed; falling back to ssh file read"
                );
                self.open_buffer_via_transport(requested_path, max_bytes)
                    .await?
            }
            Err(_) => {
                warn!(
                    session_id = %self.id,
                    path = %requested_path,
                    "zed proxy buffer open timed out; falling back to ssh file read"
                );
                self.open_buffer_via_transport(requested_path, max_bytes)
                    .await?
            }
        };
        self.touch_heartbeat().await;
        Ok(buffer)
    }

    pub async fn save_file(
        &self,
        request: SaveFileRequest,
    ) -> Result<SaveFileResponse, SessionError> {
        let fallback_request = request.clone();
        let path = request.path.clone();
        let response = match timeout(FILE_PROXY_TIMEOUT, self.save_file_via_proxy(request)).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                warn!(
                    session_id = %self.id,
                    path = %path,
                    %error,
                    "zed proxy file save failed; falling back to ssh file save"
                );
                self.save_file_via_transport(fallback_request).await?
            }
            Err(_) => {
                warn!(
                    session_id = %self.id,
                    path = %path,
                    "zed proxy file save timed out; falling back to ssh file save"
                );
                self.save_file_via_transport(fallback_request).await?
            }
        };
        self.touch_heartbeat().await;

        self.send_event(GatewayEvent::SessionState {
            session_id: self.id,
            state: ConnectionState::Ready,
            detail: format!("saved {}", response.path),
        })
        .await;

        Ok(response)
    }

    pub async fn save_buffer(
        &self,
        request: BufferSaveCommand,
    ) -> Result<BufferSaveCompletePayload, SessionError> {
        let response = match request.base_resource_version.scheme {
            ResourceVersionScheme::ZedVectorClock => self.save_buffer_via_proxy(request).await?,
            ResourceVersionScheme::SshStat => self.save_buffer_via_transport(request).await?,
        };

        if let BufferSaveCompletePayload::Saved { path, .. } = &response {
            self.touch_heartbeat().await;
            self.send_event(GatewayEvent::SessionState {
                session_id: self.id,
                state: ConnectionState::Ready,
                detail: format!("saved {path}"),
            })
            .await;
        }

        Ok(response)
    }

    pub async fn sync_buffers(
        &self,
        request: BufferSyncCommand,
    ) -> Result<BufferSyncCompletePayload, SessionError> {
        let mut buffers = Vec::with_capacity(request.buffers.len());

        for buffer in request.buffers {
            let current_resource_version = match buffer.base_resource_version.scheme {
                ResourceVersionScheme::ZedVectorClock => {
                    self.current_proxy_resource_version(&buffer.path).await
                }
                ResourceVersionScheme::SshStat => {
                    self.current_transport_resource_version(&buffer.path).await
                }
            };

            match current_resource_version {
                Ok(current) if current == buffer.base_resource_version => {
                    buffers.push(BufferSyncResponseItem {
                        path: buffer.path,
                        status: BufferSyncStatus::Unchanged,
                        current_resource_version: Some(current),
                    });
                }
                Ok(current) => {
                    buffers.push(BufferSyncResponseItem {
                        path: buffer.path,
                        status: BufferSyncStatus::RemoteChanged,
                        current_resource_version: Some(current),
                    });
                }
                Err(error) => {
                    warn!(
                        session_id = %self.id,
                        path = %buffer.path,
                        dirty = buffer.dirty,
                        last_seq = buffer.last_seq,
                        %error,
                        "buffer sync failed for path"
                    );
                    buffers.push(BufferSyncResponseItem {
                        path: buffer.path,
                        status: BufferSyncStatus::Missing,
                        current_resource_version: None,
                    });
                }
            }
        }

        self.touch_heartbeat().await;
        Ok(BufferSyncCompletePayload { buffers })
    }

    pub async fn stream_file<F>(
        &self,
        requested_path: &str,
        initial_chunk_bytes: usize,
        chunk_bytes: usize,
        max_bytes: usize,
        on_chunk: F,
    ) -> Result<transport::StreamedFileSummary, SessionError>
    where
        F: FnMut(transport::StreamedFileChunk) -> Result<(), SessionError>,
    {
        let (target, project_path) = self.target_and_path().await;
        let summary = transport::stream_file(
            &target,
            &project_path,
            requested_path,
            initial_chunk_bytes,
            chunk_bytes,
            max_bytes,
            on_chunk,
        )
        .await?;
        self.touch_heartbeat().await;
        Ok(summary)
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
        let inner = self.inner.read().await;
        let worktree_id = inner
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let relative_path = normalize_worktree_relative_path(&inner.project_path, requested_path)
            .map_err(SessionError::InvalidRequest)?;
        drop(inner);

        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        let buffer = client
            .open_buffer_by_path(worktree_id, &relative_path)
            .await?;
        Ok(FileResponse {
            path: buffer
                .file
                .as_ref()
                .map(|file| file.path.clone())
                .unwrap_or(relative_path),
            content: buffer.base_text,
            truncated: false,
        })
    }

    async fn open_buffer_via_proxy(
        &self,
        requested_path: &str,
        max_bytes: usize,
    ) -> Result<OpenBufferResult, SessionError> {
        let inner = self.inner.read().await;
        let worktree_id = inner
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let relative_path = normalize_worktree_relative_path(&inner.project_path, requested_path)
            .map_err(SessionError::InvalidRequest)?;
        drop(inner);

        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        let buffer = client
            .open_buffer_by_path(worktree_id, &relative_path)
            .await?;
        let path = buffer
            .file
            .as_ref()
            .map(|file| file.path.clone())
            .unwrap_or(relative_path);
        let (content, truncated) = truncate_utf8(&buffer.base_text, max_bytes);
        let bytes_read = content.len();

        Ok(OpenBufferResult {
            path,
            content,
            bytes_read,
            truncated,
            read_only: truncated,
            resource_version: buffer.resource_version()?,
        })
    }

    async fn read_file_via_transport(
        &self,
        requested_path: &str,
    ) -> Result<FileResponse, SessionError> {
        let (target, project_path) = self.target_and_path().await;
        transport::read_file(&target, &project_path, requested_path).await
    }

    async fn open_buffer_via_transport(
        &self,
        requested_path: &str,
        max_bytes: usize,
    ) -> Result<OpenBufferResult, SessionError> {
        let file = self.read_file_via_transport(requested_path).await?;
        let resource_version = ssh_stat_resource_version(&file.content);
        let (content, max_truncated) = truncate_utf8(&file.content, max_bytes);
        let truncated = file.truncated || max_truncated;
        let bytes_read = content.len();

        Ok(OpenBufferResult {
            path: file.path,
            content,
            bytes_read,
            truncated,
            read_only: truncated,
            resource_version,
        })
    }

    async fn save_file_via_proxy(
        &self,
        request: SaveFileRequest,
    ) -> Result<SaveFileResponse, SessionError> {
        let inner = self.inner.read().await;
        let worktree_id = inner
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let relative_path = normalize_worktree_relative_path(&inner.project_path, &request.path)
            .map_err(SessionError::InvalidRequest)?;
        drop(inner);

        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        let buffer = client
            .open_buffer_by_path(worktree_id, &relative_path)
            .await?;
        client.overwrite_and_save(&buffer, &request.content).await?;
        Ok(SaveFileResponse {
            path: relative_path,
            bytes_written: request.content.len(),
        })
    }

    async fn save_buffer_via_proxy(
        &self,
        request: BufferSaveCommand,
    ) -> Result<BufferSaveCompletePayload, SessionError> {
        let inner = self.inner.read().await;
        let worktree_id = inner
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let relative_path = normalize_worktree_relative_path(&inner.project_path, &request.path)
            .map_err(SessionError::InvalidRequest)?;
        drop(inner);

        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        let buffer = client
            .open_buffer_by_path(worktree_id, &relative_path)
            .await?;
        let current_resource_version = buffer.resource_version()?;

        if current_resource_version != request.base_resource_version {
            return Ok(BufferSaveCompletePayload::Conflict {
                path: relative_path,
                current_resource_version: Some(current_resource_version),
                message: "remote buffer changed since it was opened".into(),
            });
        }

        let (saved, next_content) = client
            .apply_batches_and_save(&buffer, &request.batches, request.expected_content_length)
            .await?;
        let applied_seq = request
            .batches
            .iter()
            .map(|batch| batch.seq)
            .max()
            .unwrap_or(0);
        Ok(BufferSaveCompletePayload::Saved {
            path: relative_path,
            applied_seq,
            bytes_written: next_content.len(),
            resource_version: gateway_zed_proxy::client::encode_vector_clock_resource_version(
                &saved.version,
            )?,
        })
    }

    async fn save_file_via_transport(
        &self,
        request: SaveFileRequest,
    ) -> Result<SaveFileResponse, SessionError> {
        let (target, project_path) = self.target_and_path().await;
        transport::save_file(&target, &project_path, request).await
    }

    async fn save_buffer_via_transport(
        &self,
        request: BufferSaveCommand,
    ) -> Result<BufferSaveCompletePayload, SessionError> {
        let current = self.read_file_via_transport(&request.path).await?;
        let current_resource_version = ssh_stat_resource_version(&current.content);
        if current_resource_version != request.base_resource_version {
            return Ok(BufferSaveCompletePayload::Conflict {
                path: current.path,
                current_resource_version: Some(current_resource_version),
                message: "remote file changed since it was opened".into(),
            });
        }

        let next_content = apply_text_change_batches(&current.content, &request.batches)?;
        validate_expected_content_length(&next_content, request.expected_content_length)?;
        let response = self
            .save_file_via_transport(SaveFileRequest {
                path: current.path,
                content: next_content.clone(),
            })
            .await?;
        let applied_seq = request
            .batches
            .iter()
            .map(|batch| batch.seq)
            .max()
            .unwrap_or(0);

        Ok(BufferSaveCompletePayload::Saved {
            path: response.path,
            applied_seq,
            bytes_written: response.bytes_written,
            resource_version: ssh_stat_resource_version(&next_content),
        })
    }

    async fn current_proxy_resource_version(
        &self,
        requested_path: &str,
    ) -> Result<ResourceVersion, SessionError> {
        let inner = self.inner.read().await;
        let worktree_id = inner
            .worktree_id
            .ok_or_else(|| SessionError::SshCommand("missing remote worktree".into()))?;
        let relative_path = normalize_worktree_relative_path(&inner.project_path, requested_path)
            .map_err(SessionError::InvalidRequest)?;
        drop(inner);

        let mut client_slot = self.zed_client.lock().await;
        let client = client_slot
            .as_mut()
            .ok_or_else(|| SessionError::SshCommand("missing zed proxy client".into()))?;
        client
            .open_buffer_by_path(worktree_id, &relative_path)
            .await?
            .resource_version()
    }

    async fn current_transport_resource_version(
        &self,
        requested_path: &str,
    ) -> Result<ResourceVersion, SessionError> {
        let file = self.read_file_via_transport(requested_path).await?;
        Ok(ssh_stat_resource_version(&file.content))
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

fn truncate_utf8(content: &str, max_bytes: usize) -> (String, bool) {
    if content.len() <= max_bytes {
        return (content.to_string(), false);
    }

    let mut end = max_bytes;
    while end > 0 && !content.is_char_boundary(end) {
        end -= 1;
    }

    (content[..end].to_string(), true)
}

fn ssh_stat_resource_version(content: &str) -> ResourceVersion {
    let digest = Sha256::digest(content.as_bytes());
    ResourceVersion {
        scheme: ResourceVersionScheme::SshStat,
        value: format!("len:{}:sha256:{digest:x}", content.len()),
    }
}

fn validate_expected_content_length(
    content: &str,
    expected_content_length: usize,
) -> Result<(), SessionError> {
    if content.len() == expected_content_length {
        return Ok(());
    }

    Err(SessionError::InvalidRequest(format!(
        "expected content length {expected_content_length}, got {}",
        content.len()
    )))
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
