//! Shared Geekfun console API plumbing: base URL resolution and a process
//! wide HTTP client (the console endpoints are low-frequency, so one client
//! is built once and reused).

use std::sync::OnceLock;
use std::time::Duration;

// Console API (data plane) — the console web app lives at
// console.geekfun.club, the API it and the desktop clients talk to is
// served from geekfun-api.wentsen.com (see geekfun iac/serverlessinsight.yml).
const CONSOLE_PROD_URL: &str = "https://geekfun-api.wentsen.com";
const CONSOLE_DEV_URL: &str = "http://localhost:5174";

pub fn api_base_url() -> &'static str {
    if cfg!(debug_assertions) {
        // Debug builds default to the local console dev server;
        // DOCKIT_CONSOLE_API_URL repoints them (e.g. at prod) without a
        // rebuild. Release builds always use the production URL.
        static DEV_BASE: OnceLock<Box<str>> = OnceLock::new();
        DEV_BASE
            .get_or_init(|| {
                std::env::var("DOCKIT_CONSOLE_API_URL")
                    .ok()
                    .filter(|raw| !raw.trim().is_empty())
                    .map(Into::into)
                    .unwrap_or_else(|| CONSOLE_DEV_URL.into())
            })
            .as_ref()
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
