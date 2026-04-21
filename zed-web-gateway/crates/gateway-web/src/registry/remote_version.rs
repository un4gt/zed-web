use gateway_core::api::{RemoteServerPolicy, RemoteServerUpdateMode};
use gateway_core::error::SessionError;

pub const DEFAULT_ZED_RELEASE_VERSION: &str = "v0.232.3";

#[derive(Clone, Debug)]
pub struct ResolvedRemoteServerPolicy {
    pub mode: RemoteServerUpdateMode,
    pub selected_version: Option<String>,
}

pub fn resolve_remote_server_policy(
    policy: Option<RemoteServerPolicy>,
) -> Result<ResolvedRemoteServerPolicy, SessionError> {
    let policy = policy.unwrap_or(RemoteServerPolicy {
        mode: RemoteServerUpdateMode::Latest,
        version: None,
    });

    match policy.mode {
        RemoteServerUpdateMode::Latest => Ok(ResolvedRemoteServerPolicy {
            mode: RemoteServerUpdateMode::Latest,
            selected_version: Some(DEFAULT_ZED_RELEASE_VERSION.to_string()),
        }),
        RemoteServerUpdateMode::Pinned => {
            let version = policy
                .version
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    SessionError::InvalidRequest(
                        "remote_server.version is required when mode is pinned".into(),
                    )
                })?;
            Ok(ResolvedRemoteServerPolicy {
                mode: RemoteServerUpdateMode::Pinned,
                selected_version: Some(normalize_version_tag(&version)),
            })
        }
        RemoteServerUpdateMode::Disabled => Ok(ResolvedRemoteServerPolicy {
            mode: RemoteServerUpdateMode::Disabled,
            selected_version: None,
        }),
    }
}

fn normalize_version_tag(version: &str) -> String {
    let trimmed = version.trim();
    if trimmed.starts_with('v') {
        trimmed.to_string()
    } else {
        format!("v{trimmed}")
    }
}
