use gateway_core::api::{RemoteServerPolicy, RemoteServerUpdateMode};
use gateway_web::registry::{resolve_remote_server_policy, DEFAULT_ZED_RELEASE_VERSION};

#[test]
fn latest_policy_should_default_to_current_release_version() {
    let resolved = resolve_remote_server_policy(None).expect("resolve latest policy");
    assert!(matches!(resolved.mode, RemoteServerUpdateMode::Latest));
    assert_eq!(resolved.selected_version.as_deref(), Some(DEFAULT_ZED_RELEASE_VERSION));
}

#[test]
fn pinned_policy_should_normalize_version_tag() {
    let resolved = resolve_remote_server_policy(Some(RemoteServerPolicy {
        mode: RemoteServerUpdateMode::Pinned,
        version: Some("0.232.3".into()),
    }))
    .expect("resolve pinned policy");

    assert_eq!(resolved.selected_version.as_deref(), Some("v0.232.3"));
}

#[test]
fn disabled_policy_should_skip_managed_version_selection() {
    let resolved = resolve_remote_server_policy(Some(RemoteServerPolicy {
        mode: RemoteServerUpdateMode::Disabled,
        version: None,
    }))
    .expect("resolve disabled policy");

    assert!(matches!(resolved.mode, RemoteServerUpdateMode::Disabled));
    assert_eq!(resolved.selected_version, None);
}
