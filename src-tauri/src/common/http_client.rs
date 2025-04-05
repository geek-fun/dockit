use std::env;

fn get_proxy(http_proxy: Option<String>) -> Option<String> {
    let sys_proxy = env::var("HTTPS_PROXY")
        .ok()
        .or(env::var("https_proxy").ok());
    let proxy_url = match http_proxy {
        Some(proxy) => {
            if proxy.is_empty() {
                sys_proxy
            } else {
                Some(proxy.clone())
            }
        }
        None => sys_proxy,
    };
    return proxy_url;
}

pub fn create_http_client(proxy: Option<String>, ssl: Option<bool>) -> reqwest::Client {
    let mut builder =
        reqwest::ClientBuilder::new().danger_accept_invalid_certs(!ssl.unwrap_or(true));

    if let Some(proxy_url) = get_proxy(proxy) {
        match reqwest::Proxy::https(&proxy_url) {
            Ok(proxy) => {
                builder = builder.proxy(proxy);
            }
            Err(e) => {
                println!("Failed to create proxy: {}", e);
            }
        };
    }

    return builder.build().unwrap();
}
