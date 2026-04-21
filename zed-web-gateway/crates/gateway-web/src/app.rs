use actix_web::web::Data;

use crate::registry::SessionRegistry;

#[derive(Clone)]
pub struct AppState {
    pub registry: SessionRegistry,
}

impl AppState {
    pub fn data(self) -> Data<Self> {
        Data::new(self)
    }
}
