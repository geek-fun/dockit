use serde::{Deserialize, Serialize};
use mongodb::{options::ClientOptions, Client};
use url::form_urlencoded;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum MongoAuth {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "scram")]
    Scram {
        username: String,
        password: String,
        #[serde(rename = "authSource")]
        auth_source: Option<String>,
        #[serde(rename = "authMechanism")]
        auth_mechanism: Option<String>,
    },
    #[serde(rename = "uri")]
    Uri { uri: String },
}

#[derive(Debug, Deserialize)]
pub struct MongoConnectionConfig {
    pub host: String,
    pub port: u16,
    pub auth: MongoAuth,
    pub database: Option<String>,
    pub tls: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct MongoTestResult {
    pub success: bool,
    pub message: String,
    pub collections: Option<Vec<String>>,
}

fn encode_component(s: &str) -> String {
    form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn build_uri(config: &MongoConnectionConfig) -> String {
    match &config.auth {
        MongoAuth::Uri { uri } => uri.clone(),
        _ => {
            let use_tls = config.tls.unwrap_or(false);
            let host = if config.host.is_empty() {
                "localhost".to_string()
            } else {
                config.host.clone()
            };

            let db_path = config
                .database
                .as_deref()
                .map(|d| format!("/{}", d))
                .unwrap_or_default();

            let mut params: Vec<String> = Vec::new();
            if use_tls {
                params.push("tls=true".to_string());
            }

            match &config.auth {
                MongoAuth::Scram {
                    username,
                    password,
                    auth_source,
                    auth_mechanism,
                } => {
                    let encoded_user = encode_component(username);
                    let encoded_pass = encode_component(password);
                    let source = auth_source.as_deref().unwrap_or("admin");
                    params.push(format!("authSource={}", source));
                    if let Some(mechanism) = auth_mechanism {
                        params.push(format!("authMechanism={}", mechanism));
                    }
                    let query = if params.is_empty() {
                        String::new()
                    } else {
                        format!("?{}", params.join("&"))
                    };
                    format!(
                        "mongodb://{}:{}@{}:{}{}{}",
                        encoded_user, encoded_pass, host, config.port, db_path, query
                    )
                }
                _ => {
                    let query = if params.is_empty() {
                        String::new()
                    } else {
                        format!("?{}", params.join("&"))
                    };
                    format!("mongodb://{}:{}{}{}", host, config.port, db_path, query)
                }
            }
        }
    }
}

#[tauri::command]
pub async fn mongo_test_connection(config: MongoConnectionConfig) -> Result<MongoTestResult, String> {
    let uri = build_uri(&config);

    let client_options = match ClientOptions::parse(&uri).await {
        Ok(opts) => opts,
        Err(e) => {
            return Ok(MongoTestResult {
                success: false,
                message: format!("Failed to parse connection options: {}", e),
                collections: None,
            });
        }
    };

    let client = match Client::with_options(client_options) {
        Ok(c) => c,
        Err(e) => {
            return Ok(MongoTestResult {
                success: false,
                message: format!("Failed to create client: {}", e),
                collections: None,
            });
        }
    };

    let db = client.database("admin");
    if let Err(e) = db.run_command(mongodb::bson::doc! { "ping": 1 }).await {
        return Ok(MongoTestResult {
            success: false,
            message: format!("Connection failed: {}", e),
            collections: None,
        });
    }

    let collections = if let Some(db_name) = &config.database {
        let target_db = client.database(db_name);
        match target_db.list_collection_names().await {
            Ok(names) => names,
            Err(e) => {
                return Ok(MongoTestResult {
                    success: false,
                    message: format!("Failed to list collections: {}", e),
                    collections: None,
                });
            }
        }
    } else {
        Vec::new()
    };

    Ok(MongoTestResult {
        success: true,
        message: "Connection successful".to_string(),
        collections: Some(collections),
    })
}
