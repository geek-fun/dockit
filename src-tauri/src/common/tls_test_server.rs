//! Test-only TLS server harness for SSH-tunnel TLS verification.
//!
//! Serves a self-signed certificate for `es.example.com` (SAN dNSName) on a
//! local socket, so tests can prove that a client which preserves the real
//! hostname (reqwest `ClientBuilder::resolve`) completes the TLS handshake,
//! while a client connecting to the bare IP (the legacy SSH-tunnel behavior)
//! fails certificate validation.
//!
//! The certificate and key below were generated once with:
//! `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 \
//!   -pkeyopt ec_param_enc:named_curve -out key.pem`
//! `openssl req -x509 -new -key key.pem -out cert.pem -days 397 \
//!   -addext subjectAltName=DNS:es.example.com \
//!   -addext extendedKeyUsage=serverAuth -subj /CN=es.example.com`
//! and are intentionally embedded so tests stay hermetic (no external deps).
//! Constraints: EC P-256 with named-curve encoding (ring rejects explicit
//! params), SAN + serverAuth EKU (webpki requires them), validity <= 398
//! days (webpki maximum for trust anchors).

use std::net::SocketAddr;
use std::sync::Arc;

use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;

const TEST_CERT_PEM: &str = "-----BEGIN CERTIFICATE-----
MIIBWzCCAQGgAwIBAgIJAJzP0UT7CpHOMAoGCCqGSM49BAMCMBkxFzAVBgNVBAMM
DmVzLmV4YW1wbGUuY29tMB4XDTI2MDgwMzA0MDY1M1oXDTI3MDkwNDA0MDY1M1ow
GTEXMBUGA1UEAwwOZXMuZXhhbXBsZS5jb20wWTATBgcqhkjOPQIBBggqhkjOPQMB
BwNCAARX2yCA+Y6DP66xAu5MGKCNc3I49nL+bnW1NO3Jr9NN7T9S3taP8p0qtPqM
J/9tiJF9D3DCzwphluh5CEOPRBi0ozIwMDAZBgNVHREEEjAQgg5lcy5leGFtcGxl
LmNvbTATBgNVHSUEDDAKBggrBgEFBQcDATAKBggqhkjOPQQDAgNIADBFAiBqXg0y
noKHFWzfVarrQr4805zyp7tOJtD5DcFyRhzvCAIhAKouaO8opbjBS5QcgJ/fPkxT
VVMDwhLNzt3CuURLlKRG
-----END CERTIFICATE-----";

const TEST_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgMHsXc/RPLggXnYvp
uLs8M/e8IS7L2YGw44AxXDQSAsShRANCAARX2yCA+Y6DP66xAu5MGKCNc3I49nL+
bnW1NO3Jr9NN7T9S3taP8p0qtPqMJ/9tiJF9D3DCzwphluh5CEOPRBi0
-----END PRIVATE KEY-----";

fn pem_to_der(pem: &str, header: &str, footer: &str) -> Vec<u8> {
    use base64::Engine;
    let body = pem
        .trim()
        .trim_start_matches(header)
        .trim_end_matches(footer)
        .split_whitespace()
        .collect::<String>();
    base64::engine::general_purpose::STANDARD
        .decode(body)
        .expect("embedded test PEM must be valid base64")
}

fn server_config() -> ServerConfig {
    let provider = rustls::crypto::ring::default_provider();
    let cert_der = CertificateDer::from(pem_to_der(
        TEST_CERT_PEM,
        "-----BEGIN CERTIFICATE-----",
        "-----END CERTIFICATE-----",
    ));
    let key_der = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(pem_to_der(
        TEST_KEY_PEM,
        "-----BEGIN PRIVATE KEY-----",
        "-----END PRIVATE KEY-----",
    )));
    ServerConfig::builder_with_provider(Arc::new(provider))
        .with_safe_default_protocol_versions()
        .expect("tls1.2/tls1.3 enabled by ring provider")
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], key_der)
        .expect("embedded test cert/key must be valid")
}

/// Fixed HTTP/1.1 response served to every request (reqwest only needs a
/// valid status line + content-length to report a successful response).
const HTTP_200_BODY: &[u8] = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}";

/// Spawn a TLS server on 127.0.0.1:0 that accepts ONE connection, answers
/// with a fixed 200 response, then exits.
/// Returns the bound address so tests can point their tunnel at it.
pub async fn spawn_tls_server() -> SocketAddr {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio_rustls::TlsAcceptor;

    let acceptor = TlsAcceptor::from(Arc::new(server_config()));
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind 127.0.0.1:0");
    let addr = listener
        .local_addr()
        .expect("bound listener has local addr");

    tokio::spawn(async move {
        let (tcp, _) = match listener.accept().await {
            Ok(x) => x,
            Err(e) => {
                eprintln!("TLS-SERVER accept err: {}", e);
                return;
            }
        };
        let mut tls = match acceptor.accept(tcp).await {
            Ok(stream) => stream,
            Err(e) => {
                eprintln!("TLS-SERVER handshake err: {}", e);
                return;
            }
        };
        // Read the client's request (single read — the client waits for the
        // response, so waiting for EOF here would deadlock), then answer.
        let mut buf = [0u8; 4096];
        let _ = tls.read(&mut buf).await;
        let _ = tls.write_all(HTTP_200_BODY).await;
        let _ = tls.shutdown().await;
    });

    addr
}

/// A reqwest client with certificate validation ENABLED (no proxy) — the
/// control client for proving that connecting to a bare IP fails.
pub fn verifying_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .no_proxy()
        .build()
        .expect("verifying client builds")
}

/// The embedded self-signed certificate as a reqwest root certificate, so
/// tests can inject trust for the handshake-success scenarios.
pub fn test_root_certificate() -> reqwest::Certificate {
    reqwest::Certificate::from_pem(TEST_CERT_PEM.as_bytes())
        .expect("embedded test certificate is valid PEM")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Locks the bug semantics from issue #472: a TLS client pointed at
    /// `https://127.0.0.1:<port>` (the legacy SSH-tunnel behavior) must FAIL
    /// the handshake against a certificate issued for a real hostname,
    /// because no SNI is sent for IP literals and the cert SAN does not
    /// match the IP.
    #[tokio::test]
    async fn negative_control_bare_ip_fails_handshake() {
        let addr = spawn_tls_server().await;
        let client = verifying_client();
        let url = format!("https://127.0.0.1:{}/", addr.port());

        let result = client.get(&url).send().await;
        assert!(
            result.is_err(),
            "bare-IP request must fail TLS validation, got: {:?}",
            result
        );
    }
}
