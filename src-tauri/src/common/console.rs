//! Shared Geekfun console API plumbing: base URL resolution and a process
//! wide HTTP client (the console endpoints are low-frequency, so one client
//! is built once and reused).

use std::sync::OnceLock;
use std::time::Duration;

const CONSOLE_PROD_URL: &str = "https://console-geekfun.wentsen.com";
const CONSOLE_DEV_URL: &str = "http://localhost:5174";

pub fn api_base_url() -> &'static str {
    if cfg!(debug_assertions) {
        CONSOLE_DEV_URL
    } else {
        CONSOLE_PROD_URL
    }
}

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("reqwest client with static configuration")
    })
}
