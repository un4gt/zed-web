use actix_web::{App, test, web};
use gateway_web::app::AppState;
use gateway_web::registry::SessionRegistry;
use gateway_web::routes::api_scope;
use serde_json::Value;
use uuid::Uuid;

#[actix_web::test]
async fn create_session_should_return_json_bad_request_when_host_missing() {
    let app = test::init_service(App::new().app_data(test_state()).service(api_scope())).await;
    let request = test::TestRequest::post()
        .uri("/api/sessions")
        .set_json(serde_json::json!({
            "host": "",
            "project_path": "/tmp",
            "remote_server": {
                "mode": "disabled"
            }
        }))
        .to_request();

    let response = test::call_service(&app, request).await;

    assert_eq!(response.status(), actix_web::http::StatusCode::BAD_REQUEST);
    assert_json_error(response).await;
}

#[actix_web::test]
async fn get_file_should_return_json_not_found_when_session_missing() {
    let app = test::init_service(App::new().app_data(test_state()).service(api_scope())).await;
    let request = test::TestRequest::get()
        .uri(&format!(
            "/api/sessions/{}/file?path=hello.txt",
            Uuid::new_v4()
        ))
        .to_request();

    let response = test::call_service(&app, request).await;

    assert_eq!(response.status(), actix_web::http::StatusCode::NOT_FOUND);
    assert_json_error(response).await;
}

fn test_state() -> web::Data<AppState> {
    AppState {
        registry: SessionRegistry::new(),
    }
    .data()
}

async fn assert_json_error(response: actix_web::dev::ServiceResponse) {
    let content_type = response
        .headers()
        .get(actix_web::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let body: Value = test::read_body_json(response).await;

    assert!(content_type.starts_with("application/json"));
    assert!(
        body["error"]
            .as_str()
            .is_some_and(|message| !message.is_empty())
    );
}
