use std::path::{Path, PathBuf};
use std::sync::Arc;

use actix_cors::Cors;
use actix_files::{Files, NamedFile};
use actix_web::dev::{Service, ServiceRequest, ServiceResponse, fn_service};
use actix_web::http::header::{self, HeaderValue};
use actix_web::middleware::{Compress, Logger};
use actix_web::{App, HttpRequest, HttpResponse, HttpServer};
use base64::Engine as _;
use futures_util::future::{Either, ready};
use gateway_web::app::AppState;
use gateway_web::registry::SessionRegistry;
use gateway_web::routes::api_scope;
use tracing::{info, warn};

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 8080;
const DEFAULT_FRONTEND_DIR: &str = "../frontend";
const AUTH_USERNAME_ENV: &str = "ZEW_USERNAME";
const AUTH_PASSWORD_ENV: &str = "ZEW_PASSWORD";

#[derive(Clone, Debug)]
struct AuthConfig {
    username: String,
    password: String,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,actix_web=info".into()),
        )
        .init();

    let host = std::env::var("GATEWAY_HOST").unwrap_or_else(|_| DEFAULT_HOST.into());
    let port = std::env::var("GATEWAY_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);
    let frontend_dir = resolve_frontend_dir();
    let auth_config = load_auth_config()?.map(Arc::new);

    let state = AppState {
        registry: SessionRegistry::new(),
    }
    .data();

    info!(
        %host,
        %port,
        frontend_dir = %frontend_dir.display(),
        auth_enabled = auth_config.is_some(),
        "starting zed web gateway"
    );

    HttpServer::new(move || {
        let frontend_dir = frontend_dir.clone();
        let auth_config = auth_config.clone();
        App::new()
            .app_data(state.clone())
            .wrap(Logger::default())
            .wrap(Compress::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST", "PUT"])
                    .allowed_headers(vec![
                        header::CONTENT_TYPE,
                        header::ACCEPT,
                        header::AUTHORIZATION,
                    ]),
            )
            .wrap_fn(move |req, service| {
                let auth_config = auth_config.clone();
                let path = req.path().to_owned();
                if !is_request_authorized(
                    req.headers().get(header::AUTHORIZATION),
                    auth_config.as_deref(),
                ) {
                    return Either::Left(ready(Ok(req
                        .into_response(unauthorized_response())
                        .map_into_right_body())));
                }

                let response = service.call(req);
                Either::Right(async move {
                    let mut response = response.await?;
                    apply_frontend_cache_headers(&path, &mut response);
                    Ok(response.map_into_left_body())
                })
            })
            .service(api_scope())
            .service(
                Files::new("/", frontend_dir.clone())
                    .index_file("index.html")
                    .prefer_utf8(true)
                    .disable_content_disposition()
                    .default_handler(fn_service(move |req: ServiceRequest| {
                        spa_index(req, frontend_dir.clone())
                    })),
            )
    })
    .bind((host, port))?
    .run()
    .await
}

fn load_auth_config() -> std::io::Result<Option<AuthConfig>> {
    let username = read_env_var(AUTH_USERNAME_ENV)?;
    let password = read_env_var(AUTH_PASSWORD_ENV)?;
    let auth_config = auth_config_from_env_values(username, password)?;

    if auth_config.is_some() {
        info!("HTTP basic auth is enabled");
    } else {
        warn!(
            "HTTP basic auth is disabled because ZEW_USERNAME and ZEW_PASSWORD are not set; set both before exposing the gateway"
        );
    }

    Ok(auth_config)
}

fn read_env_var(name: &str) -> std::io::Result<Option<String>> {
    match std::env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(std::env::VarError::NotUnicode(_)) => {
            Err(invalid_auth_config(format!("{name} must be valid UTF-8")))
        }
    }
}

fn auth_config_from_env_values(
    username: Option<String>,
    password: Option<String>,
) -> std::io::Result<Option<AuthConfig>> {
    match (username, password) {
        (None, None) => Ok(None),
        (Some(username), Some(password)) => {
            if username.is_empty() || password.is_empty() {
                return Err(invalid_auth_config(
                    "ZEW_USERNAME and ZEW_PASSWORD must both be non-empty",
                ));
            }

            if username.contains(':') {
                return Err(invalid_auth_config(
                    "ZEW_USERNAME cannot contain ':' because HTTP Basic Auth uses it as a separator",
                ));
            }

            Ok(Some(AuthConfig { username, password }))
        }
        _ => Err(invalid_auth_config(
            "ZEW_USERNAME and ZEW_PASSWORD must either both be unset for local development or both be set",
        )),
    }
}

fn invalid_auth_config(message: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into())
}

fn is_request_authorized(
    authorization: Option<&HeaderValue>,
    auth_config: Option<&AuthConfig>,
) -> bool {
    let Some(auth_config) = auth_config else {
        return true;
    };

    let Some(authorization) = authorization else {
        return false;
    };

    is_basic_authorization_valid(authorization, auth_config)
}

fn is_basic_authorization_valid(authorization: &HeaderValue, auth_config: &AuthConfig) -> bool {
    let Ok(authorization) = authorization.to_str() else {
        return false;
    };

    let Some((scheme, credentials)) = authorization.split_once(' ') else {
        return false;
    };

    if !scheme.eq_ignore_ascii_case("Basic") {
        return false;
    }

    let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(credentials.trim()) else {
        return false;
    };

    let Some(separator_index) = decoded.iter().position(|byte| *byte == b':') else {
        return false;
    };

    let (username, password_with_separator) = decoded.split_at(separator_index);
    let password = &password_with_separator[1..];

    constant_time_eq(username, auth_config.username.as_bytes())
        & constant_time_eq(password, auth_config.password.as_bytes())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let max_len = left.len().max(right.len());
    let mut diff = left.len() ^ right.len();

    for index in 0..max_len {
        let left_byte = left.get(index).copied().unwrap_or(0);
        let right_byte = right.get(index).copied().unwrap_or(0);
        diff |= usize::from(left_byte ^ right_byte);
    }

    diff == 0
}

fn unauthorized_response() -> HttpResponse {
    HttpResponse::Unauthorized()
        .insert_header((
            header::WWW_AUTHENTICATE,
            r#"Basic realm="zew", charset="UTF-8""#,
        ))
        .insert_header((header::CACHE_CONTROL, "no-store"))
        .body("Authentication required")
}

fn apply_frontend_cache_headers<B>(path: &str, response: &mut ServiceResponse<B>) {
    if !response.status().is_success() {
        return;
    }

    if path == "/" || path.ends_with(".html") {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
        return;
    }

    let cache_control = if path.starts_with("/static/") {
        Some("private, max-age=31536000, immutable")
    } else if path.starts_with("/vs/") {
        Some("private, max-age=86400")
    } else {
        None
    };

    if let Some(value) = cache_control {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static(value));
    }
}

async fn spa_index(
    req: ServiceRequest,
    frontend_dir: PathBuf,
) -> Result<ServiceResponse, actix_web::Error> {
    let (request, _) = req.into_parts();
    if !should_fallback_to_spa(request.path()) {
        return Ok(ServiceResponse::new(
            request,
            HttpResponse::NotFound().finish(),
        ));
    }

    let response = frontend_response(&request, &frontend_dir).await?;
    Ok(ServiceResponse::new(request, response))
}

fn should_fallback_to_spa(path: &str) -> bool {
    !(path.starts_with("/api/")
        || path.starts_with("/static/")
        || path.starts_with("/vs/")
        || path.contains('.'))
}

async fn frontend_response(
    request: &HttpRequest,
    frontend_dir: &Path,
) -> Result<HttpResponse, actix_web::Error> {
    let file = NamedFile::open_async(frontend_dir.join("index.html"))
        .await?
        .prefer_utf8(true)
        .disable_content_disposition();
    let mut response = file.into_response(request);
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    Ok(response)
}

fn resolve_frontend_dir() -> PathBuf {
    if let Ok(frontend_dir) = std::env::var("FRONTEND_DIR") {
        return PathBuf::from(frontend_dir);
    }

    let executable_frontend_dir = std::env::current_exe().ok().and_then(|path| {
        path.parent()
            .map(|bin_dir| bin_dir.join(DEFAULT_FRONTEND_DIR))
    });

    if let Some(frontend_dir) = executable_frontend_dir
        && frontend_dir.join("index.html").is_file()
    {
        return frontend_dir;
    }

    let working_dir_frontend = PathBuf::from(DEFAULT_FRONTEND_DIR);
    if !working_dir_frontend.join("index.html").is_file() {
        warn!(
            frontend_dir = %working_dir_frontend.display(),
            "frontend assets were not found; only /api routes will be usable until FRONTEND_DIR points to a built frontend"
        );
    }

    working_dir_frontend
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_config_from_env_values_returns_none_when_credentials_are_unset() {
        let auth_config = auth_config_from_env_values(None, None).unwrap();

        assert!(auth_config.is_none());
    }

    #[test]
    fn auth_config_from_env_values_errors_when_username_is_missing() {
        let error = auth_config_from_env_values(None, Some("secret".into())).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }

    #[test]
    fn auth_config_from_env_values_errors_when_password_is_empty() {
        let error =
            auth_config_from_env_values(Some("alice".into()), Some(String::new())).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }

    #[test]
    fn auth_config_from_env_values_errors_when_username_contains_separator() {
        let error =
            auth_config_from_env_values(Some("ali:ce".into()), Some("secret".into())).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }

    #[test]
    fn is_request_authorized_allows_requests_when_auth_is_disabled() {
        assert!(is_request_authorized(None, None));
    }

    #[test]
    fn is_request_authorized_accepts_matching_basic_credentials() {
        let auth_config = AuthConfig {
            username: "alice".into(),
            password: "s3cr3t".into(),
        };
        let authorization = basic_authorization_header("alice:s3cr3t");

        assert!(is_request_authorized(
            Some(&authorization),
            Some(&auth_config)
        ));
    }

    #[test]
    fn is_request_authorized_rejects_wrong_password() {
        let auth_config = AuthConfig {
            username: "alice".into(),
            password: "s3cr3t".into(),
        };
        let authorization = basic_authorization_header("alice:wrong");

        assert!(!is_request_authorized(
            Some(&authorization),
            Some(&auth_config)
        ));
    }

    #[test]
    fn is_request_authorized_supports_colons_in_passwords() {
        let auth_config = AuthConfig {
            username: "alice".into(),
            password: "pa:ss".into(),
        };
        let authorization = basic_authorization_header("alice:pa:ss");

        assert!(is_request_authorized(
            Some(&authorization),
            Some(&auth_config)
        ));
    }

    #[test]
    fn is_request_authorized_rejects_malformed_basic_credentials() {
        let auth_config = AuthConfig {
            username: "alice".into(),
            password: "s3cr3t".into(),
        };
        let authorization = HeaderValue::from_static("Basic not-base64");

        assert!(!is_request_authorized(
            Some(&authorization),
            Some(&auth_config)
        ));
    }

    #[test]
    fn is_request_authorized_rejects_non_basic_authorization() {
        let auth_config = AuthConfig {
            username: "alice".into(),
            password: "s3cr3t".into(),
        };
        let authorization = HeaderValue::from_static("Bearer token");

        assert!(!is_request_authorized(
            Some(&authorization),
            Some(&auth_config)
        ));
    }

    fn basic_authorization_header(credentials: &str) -> HeaderValue {
        let credentials = base64::engine::general_purpose::STANDARD.encode(credentials);
        HeaderValue::from_str(&format!("Basic {credentials}")).unwrap()
    }
}
