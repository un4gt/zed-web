use std::path::{Path, PathBuf};

use reqwest::Client;
use serde::Deserialize;
use tokio::fs;
use sha2::Digest;

use gateway_core::api::RemoteServerUpdateMode;
use gateway_core::error::SessionError;
use gateway_core::ssh::SshTarget;
use gateway_ssh::transport;

use super::remote_version::ResolvedRemoteServerPolicy;

const GITHUB_LATEST_RELEASE_URL: &str = "https://api.github.com/repos/zed-industries/zed/releases/latest";

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[derive(Deserialize)]
struct ReleaseResponse {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
}

#[derive(Clone, Debug)]
pub struct ManagedRemoteBinary {
    pub effective_version: Option<String>,
    pub remote_binary_path: String,
}

#[derive(Clone, Debug)]
pub struct RemotePlatform {
    pub os: String,
    pub arch: String,
}

pub async fn prepare_managed_remote_binary(
    target: &SshTarget,
    zed_remote_binary: &str,
    policy: &ResolvedRemoteServerPolicy,
    data_dir: &Path,
    managed_remote_exec_override: Option<&str>,
) -> Result<ManagedRemoteBinary, SessionError> {
    if matches!(policy.mode, RemoteServerUpdateMode::Disabled) {
        return Ok(ManagedRemoteBinary {
            effective_version: None,
            remote_binary_path: zed_remote_binary.to_string(),
        });
    }

    let requested_version = match policy.mode {
        RemoteServerUpdateMode::Latest => resolve_latest_release_version().await?,
        RemoteServerUpdateMode::Pinned => policy
            .selected_version
            .clone()
            .ok_or_else(|| SessionError::InvalidRequest("missing pinned remote-server version".into()))?,
        RemoteServerUpdateMode::Disabled => unreachable!(),
    };

    let platform = detect_remote_platform(target).await?;
    let local_binary = ensure_local_cached_binary(
        data_dir,
        &requested_version,
        &platform,
        managed_remote_exec_override,
    )
    .await?;
    let remote_binary_path = upload_remote_binary(target, &local_binary, &requested_version, &platform).await?;

    Ok(ManagedRemoteBinary {
        effective_version: Some(requested_version),
        remote_binary_path,
    })
}

async fn resolve_latest_release_version() -> Result<String, SessionError> {
    let release = fetch_release_metadata(GITHUB_LATEST_RELEASE_URL).await?;
    Ok(release.tag_name)
}

async fn fetch_release_metadata(url: &str) -> Result<ReleaseResponse, SessionError> {
    let response = Client::new()
        .get(url)
        .header("User-Agent", "zed-web-gateway")
        .send()
        .await
        .map_err(|error| SessionError::SshCommand(format!("failed to query zed release metadata: {error}")))?;

    let response = response.error_for_status().map_err(|error| {
        SessionError::SshCommand(format!("failed to fetch zed release metadata: {error}"))
    })?;

    response
        .json::<ReleaseResponse>()
        .await
        .map_err(|error| SessionError::SshCommand(format!("failed to parse zed release metadata: {error}")))
}

async fn detect_remote_platform(target: &SshTarget) -> Result<RemotePlatform, SessionError> {
    let output = transport::run_ssh_capture(target, "sh -lc 'uname -s && uname -m'").await?;
    let mut lines = output.lines();
    let os = lines
        .next()
        .ok_or_else(|| SessionError::Decode("missing remote os from uname".into()))?
        .trim()
        .to_ascii_lowercase();
    let arch = lines
        .next()
        .ok_or_else(|| SessionError::Decode("missing remote arch from uname".into()))?
        .trim()
        .to_ascii_lowercase();

    Ok(RemotePlatform { os, arch })
}

async fn ensure_local_cached_binary(
    data_dir: &Path,
    version: &str,
    platform: &RemotePlatform,
    managed_remote_exec_override: Option<&str>,
) -> Result<PathBuf, SessionError> {
    let cache_dir = data_dir
        .join("remote-server-cache")
        .join(version)
        .join(format!("{}-{}", platform.os, platform.arch));
    let binary_path = cache_dir.join("zed-remote-server");

    if fs::try_exists(&binary_path).await? {
        return Ok(binary_path);
    }

    if let Some(exec_override) = managed_remote_exec_override {
        return write_managed_wrapper(&cache_dir, &binary_path, exec_override).await;
    }

    download_release_binary(version, platform, &binary_path).await?;
    Ok(binary_path)
}

async fn write_managed_wrapper(
    cache_dir: &Path,
    binary_path: &Path,
    exec_override: &str,
) -> Result<PathBuf, SessionError> {
    fs::create_dir_all(&cache_dir).await?;
    fs::write(
        &binary_path,
        format!(
            "#!/usr/bin/env bash
set -euo pipefail
exec {exec_override} \"$@\"
"
        ),
    )
    .await?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&binary_path, std::fs::Permissions::from_mode(0o755)).await?;
    }

    Ok(binary_path.to_path_buf())
}

async fn download_release_binary(
    version: &str,
    platform: &RemotePlatform,
    binary_path: &Path,
) -> Result<(), SessionError> {
    let release_url = format!(
        "https://api.github.com/repos/zed-industries/zed/releases/tags/{version}"
    );
    let release = fetch_release_metadata(&release_url).await?;
    let asset_name = format!("zed-remote-server-{}-{}.gz", platform.os, normalized_arch(&platform.arch));
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| SessionError::SshCommand(format!("missing release asset {asset_name}")))?;

    let bytes = Client::new()
        .get(asset.browser_download_url)
        .header("User-Agent", "zed-web-gateway")
        .send()
        .await
        .map_err(|error| SessionError::SshCommand(format!("failed to download remote-server asset: {error}")))?
        .error_for_status()
        .map_err(|error| SessionError::SshCommand(format!("failed to fetch remote-server asset: {error}")))?
        .bytes()
        .await
        .map_err(|error| SessionError::SshCommand(format!("failed to read remote-server asset bytes: {error}")))?;

    if let Some(digest) = asset.digest {
        verify_digest(&bytes, &digest)?;
    }

    if let Some(parent) = binary_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let mut decoder = flate2::read::GzDecoder::new(bytes.as_ref());
    let mut output = std::fs::File::create(binary_path)?;
    std::io::copy(&mut decoder, &mut output)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(binary_path, std::fs::Permissions::from_mode(0o755)).await?;
    }

    Ok(())
}

fn verify_digest(bytes: &[u8], digest: &str) -> Result<(), SessionError> {
    let expected = digest
        .strip_prefix("sha256:")
        .ok_or_else(|| SessionError::Decode("unsupported release digest format".into()))?;
    let actual = format!("{:x}", sha2::Sha256::digest(bytes));
    if actual == expected {
        Ok(())
    } else {
        Err(SessionError::SshCommand("downloaded remote-server digest mismatch".into()))
    }
}

fn normalized_arch(arch: &str) -> &str {
    match arch {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        other => other,
    }
}

async fn upload_remote_binary(
    target: &SshTarget,
    local_binary: &Path,
    version: &str,
    platform: &RemotePlatform,
) -> Result<String, SessionError> {
    let remote_dir = format!(
        "~/.local/share/zed-web/remote-server/{version}/{}-{}",
        platform.os, platform.arch
    );
    let remote_binary_path = format!("{remote_dir}/zed-remote-server");

    transport::run_ssh_capture(
        target,
        &format!("sh -lc 'mkdir -p {remote_dir}'", remote_dir = gateway_core::ssh::shell_escape(&remote_dir)),
    )
    .await?;

    transport::copy_file_to_remote(target, local_binary, &remote_binary_path).await?;
    transport::run_ssh_capture(
        target,
        &format!("sh -lc 'chmod +x {path}'", path = gateway_core::ssh::shell_escape(&remote_binary_path)),
    )
    .await?;

    Ok(remote_binary_path)
}
