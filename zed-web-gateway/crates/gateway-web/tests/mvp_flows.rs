use std::fs;
use std::future::Future;
use std::net::TcpListener;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use actix_web::{App, test};
use gateway_core::api::{
    CreateSessionRequest, RemoteServerPolicy, RemoteServerUpdateMode, SaveFileRequest,
};
use gateway_web::app::AppState;
use gateway_web::registry::SessionRegistry;
use gateway_web::routes::api_scope;
use serde_json::Value;
use tempfile::TempDir;
use tokio::io::AsyncWriteExt;

#[tokio::test]
async fn open_file_save_and_terminal_work_locally() {
    let harness = TestHarness::start().expect("start test ssh harness");
    let registry = SessionRegistry::new();

    let snapshot = await_with_timeout(
        registry.create_session(CreateSessionRequest {
            host: "127.0.0.1".into(),
            user: Some(harness.username.clone()),
            port: Some(harness.port),
            ssh_args: harness.ssh_args(),
            project_path: harness.project_dir.to_string_lossy().to_string(),
            zed_remote_binary: Some(harness.remote_binary_path.to_string_lossy().to_string()),
            managed_remote_exec: Some(harness.remote_binary_path.to_string_lossy().to_string()),
            managed_data_dir: Some(
                harness
                    .root_dir
                    .join("managed-data")
                    .to_string_lossy()
                    .to_string(),
            ),
            remote_server: Some(RemoteServerPolicy {
                mode: RemoteServerUpdateMode::Disabled,
                version: None,
            }),
        }),
        "create session",
    )
    .await
    .expect("create session");

    assert_eq!(
        snapshot.state,
        gateway_core::session::ConnectionState::Ready
    );
    assert!(snapshot.proxy_active);

    let session = registry.get(snapshot.id).await.expect("lookup session");

    let file = session
        .read_file("hello.txt")
        .await
        .expect("read initial file");
    assert_eq!(file.content, "hello from ssh test\n");

    session
        .save_file(SaveFileRequest {
            path: "hello.txt".into(),
            content: "changed through gateway\n".into(),
        })
        .await
        .expect("save file");

    let saved_contents =
        fs::read_to_string(harness.project_dir.join("hello.txt")).expect("read saved contents");
    assert_eq!(saved_contents, "changed through gateway\n");

    let terminal = session.open_terminal(None).await.expect("open terminal");
    {
        let mut stdin = terminal.stdin.lock().await;
        stdin
            .write_all(b"printf terminal-ok\\n; exit\\n")
            .await
            .expect("write terminal command");
    }

    let mut output = String::new();
    {
        let mut stdout = terminal.stdout.lock().await;
        let mut buffer = [0_u8; 4096];
        let read = tokio::time::timeout(
            Duration::from_secs(5),
            tokio::io::AsyncReadExt::read(&mut *stdout, &mut buffer),
        )
        .await
        .expect("terminal timeout")
        .expect("terminal read");
        output.push_str(&String::from_utf8_lossy(&buffer[..read]));
    }

    assert!(
        output.contains("terminal-ok"),
        "terminal output was: {output}"
    );

    let reconnected = session.reconnect().await.expect("reconnect session");
    assert!(reconnected.proxy_active);
    assert_eq!(reconnected.reconnect_count, 1);
}

#[actix_web::test]
async fn open_file_save_should_work_over_http() {
    let harness = TestHarness::start().expect("start test ssh harness");
    let state = AppState {
        registry: SessionRegistry::new(),
    }
    .data();
    let app = test::init_service(App::new().app_data(state).service(api_scope())).await;

    let create_request = test::TestRequest::post()
        .uri("/api/sessions")
        .set_json(serde_json::json!({
            "host": "127.0.0.1",
            "user": harness.username,
            "port": harness.port,
            "ssh_args": harness.ssh_args(),
            "project_path": harness.project_dir,
            "zed_remote_binary": harness.remote_binary_path,
            "managed_data_dir": harness.root_dir.join("managed-data"),
            "remote_server": {
                "mode": "disabled"
            }
        }))
        .to_request();
    let create_response = await_with_timeout(
        test::call_service(&app, create_request),
        "create session request",
    )
    .await;
    assert!(create_response.status().is_success());
    let create_body: Value = test::read_body_json(create_response).await;
    let session_id = create_body["session"]["id"]
        .as_str()
        .expect("session id in response");

    let read_request = test::TestRequest::get()
        .uri(&format!("/api/sessions/{session_id}/file?path=hello.txt"))
        .to_request();
    let read_response =
        await_with_timeout(test::call_service(&app, read_request), "read file request").await;
    assert!(read_response.status().is_success());
    let read_body: Value = test::read_body_json(read_response).await;
    assert_eq!(read_body["content"], "hello from ssh test\n");

    let absolute_path = harness.project_dir.join("hello.txt");
    let read_absolute_request = test::TestRequest::get()
        .uri(&format!(
            "/api/sessions/{session_id}/file?path={}",
            absolute_path.to_string_lossy()
        ))
        .to_request();
    let read_absolute_response = await_with_timeout(
        test::call_service(&app, read_absolute_request),
        "read absolute file request",
    )
    .await;
    assert!(read_absolute_response.status().is_success());
    let read_absolute_body: Value = test::read_body_json(read_absolute_response).await;
    assert_eq!(read_absolute_body["path"], "hello.txt");
    assert_eq!(read_absolute_body["content"], "hello from ssh test\n");

    let save_request = test::TestRequest::put()
        .uri(&format!("/api/sessions/{session_id}/file"))
        .set_json(serde_json::json!({
            "path": "hello.txt",
            "content": "changed through http\n"
        }))
        .to_request();
    let save_response =
        await_with_timeout(test::call_service(&app, save_request), "save file request").await;
    assert!(save_response.status().is_success());
    let save_body: Value = test::read_body_json(save_response).await;
    assert_eq!(save_body["bytes_written"], "changed through http\n".len());

    let saved_contents =
        fs::read_to_string(harness.project_dir.join("hello.txt")).expect("read saved contents");
    assert_eq!(saved_contents, "changed through http\n");

    let save_absolute_request = test::TestRequest::put()
        .uri(&format!("/api/sessions/{session_id}/file"))
        .set_json(serde_json::json!({
            "path": absolute_path,
            "content": "changed through absolute http\n"
        }))
        .to_request();
    let save_absolute_response = await_with_timeout(
        test::call_service(&app, save_absolute_request),
        "save absolute file request",
    )
    .await;
    assert!(save_absolute_response.status().is_success());
    let save_absolute_body: Value = test::read_body_json(save_absolute_response).await;
    assert_eq!(save_absolute_body["path"], "hello.txt");

    let saved_absolute_contents =
        fs::read_to_string(harness.project_dir.join("hello.txt")).expect("read saved contents");
    assert_eq!(saved_absolute_contents, "changed through absolute http\n");
}

#[actix_web::test]
async fn open_file_should_reject_absolute_path_outside_project() {
    let harness = TestHarness::start().expect("start test ssh harness");
    let state = AppState {
        registry: SessionRegistry::new(),
    }
    .data();
    let app = test::init_service(App::new().app_data(state).service(api_scope())).await;

    let create_request = test::TestRequest::post()
        .uri("/api/sessions")
        .set_json(serde_json::json!({
            "host": "127.0.0.1",
            "user": harness.username,
            "port": harness.port,
            "ssh_args": harness.ssh_args(),
            "project_path": harness.project_dir,
            "zed_remote_binary": harness.remote_binary_path,
            "managed_data_dir": harness.root_dir.join("managed-data"),
            "remote_server": {
                "mode": "disabled"
            }
        }))
        .to_request();
    let create_response = await_with_timeout(
        test::call_service(&app, create_request),
        "create session request",
    )
    .await;
    assert!(create_response.status().is_success());
    let create_body: Value = test::read_body_json(create_response).await;
    let session_id = create_body["session"]["id"]
        .as_str()
        .expect("session id in response");

    let read_request = test::TestRequest::get()
        .uri(&format!("/api/sessions/{session_id}/file?path=/etc/passwd"))
        .to_request();
    let read_response =
        await_with_timeout(test::call_service(&app, read_request), "read file request").await;

    assert_eq!(
        read_response.status(),
        actix_web::http::StatusCode::BAD_REQUEST
    );
    let read_body: Value = test::read_body_json(read_response).await;
    assert_eq!(
        read_body["error"],
        "absolute path is outside project root: /etc/passwd"
    );
}

async fn await_with_timeout<T>(future: impl Future<Output = T>, label: &'static str) -> T {
    tokio::time::timeout(Duration::from_secs(15), future)
        .await
        .unwrap_or_else(|_| panic!("{label} timed out"))
}

struct TestHarness {
    _temp_dir: TempDir,
    root_dir: std::path::PathBuf,
    sshd_child: Child,
    port: u16,
    username: String,
    project_dir: std::path::PathBuf,
    remote_binary_path: std::path::PathBuf,
    known_hosts: std::path::PathBuf,
    private_key: std::path::PathBuf,
}

impl TestHarness {
    fn start() -> Result<Self, Box<dyn std::error::Error>> {
        let temp_dir = tempfile::tempdir()?;
        let root_dir = temp_dir.path().to_path_buf();
        let root = root_dir.as_path();
        let home_dir = root.join("home");
        let ssh_dir = home_dir.join(".ssh");
        let project_dir = root.join("project");
        let remote_binary_path = root.join("zed-remote-server");
        let helper_log_path = root.join("fake-remote-proxy.log");
        let helper_binary = locate_helper_binary();
        let host_key = root.join("ssh_host_ed25519_key");
        let user_key = root.join("user_key");
        let authorized_keys = ssh_dir.join("authorized_keys");
        let known_hosts = root.join("known_hosts");
        let sshd_config = root.join("sshd_config");
        let sftp_server = locate_sftp_server();

        fs::create_dir_all(&ssh_dir)?;
        fs::create_dir_all(&project_dir)?;
        fs::set_permissions(&ssh_dir, fs::Permissions::from_mode(0o700))?;

        run(Command::new("ssh-keygen")
            .args(["-t", "ed25519", "-N", "", "-f"])
            .arg(&host_key))?;
        run(Command::new("ssh-keygen")
            .args(["-t", "ed25519", "-N", "", "-f"])
            .arg(&user_key))?;

        let public_key = fs::read_to_string(user_key.with_extension("pub"))?;
        fs::write(&authorized_keys, public_key)?;
        fs::set_permissions(&authorized_keys, fs::Permissions::from_mode(0o600))?;

        fs::write(project_dir.join("hello.txt"), "hello from ssh test\n")?;
        write_remote_binary(&remote_binary_path, &helper_binary, &helper_log_path)?;

        let port = pick_port()?;
        let username = current_username();
        fs::write(
            &sshd_config,
            format!(
                "Port {port}\nListenAddress 127.0.0.1\nHostKey {}\nPidFile {}\nAuthorizedKeysFile {}\nPasswordAuthentication no\nChallengeResponseAuthentication no\nPubkeyAuthentication yes\nPermitRootLogin yes\nUsePAM no\nAllowUsers {username}\nSubsystem sftp {sftp_server}\nLogLevel VERBOSE\nStrictModes no\n",
                host_key.display(),
                root.join("sshd.pid").display(),
                authorized_keys.display(),
            ),
        )?;

        let sshd_child = Command::new("/usr/sbin/sshd")
            .arg("-D")
            .arg("-f")
            .arg(&sshd_config)
            .env("HOME", &home_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;

        wait_for_sshd(port)?;

        let keyscan = Command::new("ssh-keyscan")
            .arg("-p")
            .arg(port.to_string())
            .arg("127.0.0.1")
            .output()?;
        if !keyscan.status.success() {
            return Err(format!(
                "ssh-keyscan failed: stdout={} stderr={}",
                String::from_utf8_lossy(&keyscan.stdout),
                String::from_utf8_lossy(&keyscan.stderr)
            )
            .into());
        }
        fs::write(&known_hosts, keyscan.stdout)?;

        Ok(Self {
            _temp_dir: temp_dir,
            root_dir,
            sshd_child,
            port,
            username,
            project_dir,
            remote_binary_path,
            known_hosts,
            private_key: user_key,
        })
    }

    fn ssh_args(&self) -> Vec<String> {
        vec![
            "-i".into(),
            self.private_key.to_string_lossy().to_string(),
            "-o".into(),
            format!("UserKnownHostsFile={}", self.known_hosts.display()),
            "-o".into(),
            "StrictHostKeyChecking=yes".into(),
            "-o".into(),
            "LogLevel=ERROR".into(),
        ]
    }
}

impl Drop for TestHarness {
    fn drop(&mut self) {
        let _ = self.sshd_child.kill();
        let _ = self.sshd_child.wait();
    }
}

fn run(command: &mut Command) -> Result<(), Box<dyn std::error::Error>> {
    let output = command.output()?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "command failed: status={} stdout={} stderr={}",
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
        .into())
    }
}

fn pick_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn wait_for_sshd(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    for _ in 0..50 {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Err("sshd did not start in time".into())
}

fn current_username() -> String {
    std::env::var("USER").unwrap_or_else(|_| "root".into())
}

fn write_remote_binary(
    path: &Path,
    helper_binary: &Path,
    helper_log_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    fs::write(
        path,
        format!(
            r#"#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "version" ]; then
  printf 'test-remote-version\n'
  exit 0
fi
if [ "$1" = "proxy" ]; then
  exec "{helper}" "$@" 2>>"{log_file}"
fi
printf 'unsupported command\n' >&2
exit 1
"#,
            helper = helper_binary.display(),
            log_file = helper_log_path.display()
        ),
    )?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

fn locate_helper_binary() -> std::path::PathBuf {
    let current_test = std::env::current_exe().expect("current exe path");
    current_test
        .parent()
        .expect("test binary dir")
        .parent()
        .expect("target debug dir")
        .join("fake-remote-proxy")
}

fn locate_sftp_server() -> &'static str {
    for candidate in [
        "/usr/lib/openssh/sftp-server",
        "/usr/lib/ssh/sftp-server",
        "/usr/libexec/openssh/sftp-server",
    ] {
        if Path::new(candidate).exists() {
            return candidate;
        }
    }
    "/usr/lib/openssh/sftp-server"
}
