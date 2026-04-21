use actix_cors::Cors;
use actix_web::http::header;
use actix_web::middleware::Logger;
use actix_web::{App, HttpServer};
use gateway_web::app::AppState;
use gateway_web::registry::SessionRegistry;
use gateway_web::routes::api_scope;
use tracing::info;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 8080;

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

    let state = AppState {
        registry: SessionRegistry::new(),
    }
    .data();

    info!(%host, %port, "starting zed web gateway");

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST", "PUT"])
                    .allowed_headers(vec![header::CONTENT_TYPE, header::ACCEPT]),
            )
            .service(api_scope())
    })
    .bind((host, port))?
    .run()
    .await
}
