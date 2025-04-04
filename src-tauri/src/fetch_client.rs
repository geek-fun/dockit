use std::collections::HashMap;
use std::env;
use std::option::Option;
use std::str::FromStr;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::json;

use crate::common::http_client::create_http_client;

fn headermap_from_hashmap<'a, I, S>(headers: I) -> HeaderMap
where
    I: Iterator<Item = (S, S)> + 'a,
    S: AsRef<str> + 'a,
{
    headers
        .map(|(name, val)| {
            (
                HeaderName::from_str(name.as_ref()),
                HeaderValue::from_str(val.as_ref()),
            )
        })
        // We ignore the errors here. If you want to get a list of failed conversions, you can use Iterator::partition
        // to help you out here
        .filter(|(k, v)| k.is_ok() && v.is_ok())
        .map(|(k, v)| (k.unwrap(), v.unwrap()))
        .collect()
}


static mut FETCH_SECURE_CLIENT: Option<reqwest::Client> = None;
static mut FETCH_INSECURE_CLIENT: Option<reqwest::Client> = None;

#[derive(Deserialize)]
struct Agent {
    ssl: bool,
    http_proxy: Option<String>,
}

#[derive(Deserialize)]
pub struct FetchApiOptions {
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    agent: Agent,
}

#[tauri::command]
pub async fn fetch_api(url: String, options: FetchApiOptions) -> Result<String, String> {
    let client = unsafe {
        match options.agent.ssl {
            true => {
                if FETCH_SECURE_CLIENT.is_none() {
                    FETCH_SECURE_CLIENT = Option::from(create_http_client(
                        options.agent.http_proxy,
                        Some(options.agent.ssl),
                    ));
                }
                FETCH_SECURE_CLIENT.as_ref().unwrap()
            }
            false => {
                if FETCH_INSECURE_CLIENT.is_none() {
                    FETCH_INSECURE_CLIENT = Option::from(create_http_client(
                        options.agent.http_proxy,
                        Some(options.agent.ssl),
                    ));
                }
                FETCH_INSECURE_CLIENT.as_ref().unwrap()
            }
        }
    };

    let response = client
        .request(
            reqwest::Method::from_bytes(options.method.as_bytes()).unwrap(),
            &url,
        )
        .headers(headermap_from_hashmap(options.headers.iter()))
        .body(options.body.unwrap_or_default())
        .send()
        .await;

    match response {
        Ok(resp) => {
            let status_code = resp.status().as_u16();
            let is_success = resp.status().is_success();
            let body = resp.text().await;
            match body {
                Ok(body) => {
                    let data: serde_json::Value =
                        serde_json::from_str(&body).unwrap_or(json!(&body));
                    let message = if is_success {
                        "Success".to_string()
                    } else {
                        "Failed to fetch API".to_string()
                    };
                    let result = json!({
                        "status": status_code,
                        "message": message,
                        "data": data
                    });
                    Ok(result.to_string())
                }
                Err(e) => {
                    let result = json!({
                        "status": 500,
                        "message": format!("Failed to read response body {}", e),
                        "data": Option::<serde_json::Value>::None,
                    });
                    Err(result.to_string())
                }
            }
        }
        Err(e) => {
            let result = json!({
                "status": 500,
                "message": format!("Failed to fetch API {}", e),
                "data": Option::<serde_json::Value>::None,
            });
            Err(result.to_string())
        }
    }
}
