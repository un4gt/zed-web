#[derive(Clone, Debug)]
pub struct SshTarget {
    pub host: String,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub args: Vec<String>,
}

impl SshTarget {
    pub fn display(&self) -> String {
        let host = if let Some(user) = &self.user {
            format!("{}@{}", user, self.host)
        } else {
            self.host.clone()
        };

        if let Some(port) = self.port {
            format!("{}:{}", host, port)
        } else {
            host
        }
    }

    pub fn destination(&self) -> String {
        if let Some(user) = &self.user {
            format!("{}@{}", user, self.host)
        } else {
            self.host.clone()
        }
    }
}

pub fn shell_escape(input: &str) -> String {
    let escaped = input.replace('\'', "'\"'\"'");
    format!("'{}'", escaped)
}
