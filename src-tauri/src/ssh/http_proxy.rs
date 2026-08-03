//! HTTP CONNECT proxy handshake — lets the SSH connection to the bastion go
//! through a corporate proxy (OpenSSH ProxyCommand equivalent).

use std::time::Duration;

use base64::Engine;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;

const MAX_RESPONSE_HEADER_BYTES: usize = 8192;

/// Establishes a TCP stream to `target_host:target_port` through an HTTP
/// CONNECT proxy. `proxy_url` is `http://[user:pass@]host:port`.
/// HTTP CONNECT proxy server: accepts a `CONNECT host:port` request, replies
/// `200 Connection established`, then forwards the connection through
/// `outbound` (production: SSH direct-tcpip channel; tests: direct TCP).
/// Rejects non-CONNECT methods. Used by drivers whose SDK supports only
/// HTTP CONNECT proxies (e.g. the AWS SDK for DynamoDB).
pub async fn run_http_proxy_server(
    listener: tokio::net::TcpListener,
    outbound: crate::ssh::socks5::OutboundFn,
) {
    loop {
        let (socket, _) = match listener.accept().await {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        let outbound = std::sync::Arc::clone(&outbound);
        tokio::spawn(async move {
            let _ = handle_http_connect_conn(socket, &outbound).await;
        });
    }
}

/// Handles a single accepted connection using the HTTP CONNECT protocol.
/// Exposed for the dual-protocol tunnel (first-byte dispatch).
pub async fn handle_http_connect_conn<S>(
    socket: S,
    outbound: &crate::ssh::socks5::OutboundFn,
) -> Result<(), String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let mut socket = socket;
    let mut buf = vec![0u8; 8192];
    let mut read = 0usize;
    let header_end = loop {
        if read >= buf.len() {
            return Err("HTTP CONNECT request too large".to_string());
        }
        match socket.read(&mut buf[read..]).await {
            Ok(0) | Err(_) => return Err("HTTP CONNECT request read failed".to_string()),
            Ok(n) => {
                read += n;
                if let Some(pos) = buf[..read].windows(4).position(|w| w == b"\r\n\r\n") {
                    break pos;
                }
            }
        }
    };
    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let request_line = head.lines().next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() != 3 || parts[0] != "CONNECT" {
        let _ = socket
            .write_all(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
            .await;
        return Err("Non-CONNECT method".to_string());
    }
    let authority = parts[1];
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => match p.parse::<u16>() {
            Ok(port) => (h.to_string(), port),
            Err(_) => return Err("Bad CONNECT port".to_string()),
        },
        None => return Err("Bad CONNECT authority".to_string()),
    };
    // Open the upstream channel BEFORE replying 200: per RFC 7231 §4.3.6 a
    // 2xx CONNECT response promises the tunnel is established, so a client
    // that gets 200 must not then hit a closed stream when outbound fails.
    let outbound_stream = match outbound(&host, port).await {
        Ok(stream) => stream,
        Err(e) => {
            let _ = socket
                .write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                .await;
            return Err(e);
        }
    };
    if socket
        .write_all(b"HTTP/1.1 200 Connection established\r\n\r\n")
        .await
        .is_err()
    {
        return Err("CONNECT reply failed".to_string());
    }
    let _ = fast_socks5::server::transfer(socket, outbound_stream).await;
    Ok(())
}

pub async fn connect_via_http_proxy(
    proxy_url: &str,
    target_host: &str,
    target_port: u16,
    timeout: Duration,
) -> Result<Box<dyn crate::ssh::socks5::DuplexStream>, String> {
    let parsed = url::Url::parse(proxy_url).map_err(|e| format!("Invalid proxy URL: {}", e))?;
    if parsed.scheme() != "http" {
        return Err(format!(
            "Only http:// proxy URLs are supported, got '{}'",
            parsed.scheme()
        ));
    }
    let proxy_host = parsed
        .host_str()
        .ok_or_else(|| "Proxy URL missing host".to_string())?;
    let proxy_port = parsed.port_or_known_default().unwrap_or(8080);

    let mut stream = tokio::time::timeout(timeout, TcpStream::connect((proxy_host, proxy_port)))
        .await
        .map_err(|_| format!("HTTP proxy connect timed out ({}s)", timeout.as_secs()))?
        .map_err(|e| {
            format!(
                "Failed to connect to HTTP proxy {}:{}: {}",
                proxy_host, proxy_port, e
            )
        })?;

    let authority = format!("{}:{}", target_host, target_port);
    let mut request = format!("CONNECT {} HTTP/1.1\r\nHost: {}\r\n", authority, authority);
    // url::Url keeps credentials percent-encoded; proxies expect the raw
    // form in Proxy-Authorization, so decode before base64.
    let user = parsed.username();
    if !user.is_empty() {
        if let Some(pass) = parsed.password() {
            let user = percent_encoding::percent_decode_str(user).decode_utf8_lossy();
            let pass = percent_encoding::percent_decode_str(pass).decode_utf8_lossy();
            let creds =
                base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", user, pass));
            request.push_str(&format!("Proxy-Authorization: Basic {}\r\n", creds));
        }
    }
    request.push_str("\r\n");

    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("Failed to send CONNECT request: {}", e))?;

    let mut buf = vec![0u8; MAX_RESPONSE_HEADER_BYTES];
    let mut read = 0usize;
    let header_end = loop {
        if read >= buf.len() {
            return Err("HTTP proxy response headers too large".to_string());
        }
        let n = tokio::time::timeout(timeout, stream.read(&mut buf[read..]))
            .await
            .map_err(|_| "HTTP proxy response timed out".to_string())?
            .map_err(|e| format!("Failed to read proxy response: {}", e))?;
        if n == 0 {
            return Err("HTTP proxy closed connection during handshake".to_string());
        }
        read += n;
        let haystack = &buf[..read];
        if let Some(pos) = haystack.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos;
        }
    };

    let status_line = String::from_utf8_lossy(
        &buf[..buf[..read].iter().position(|&b| b == b'\r').unwrap_or(read)],
    );
    if !status_line.starts_with("HTTP/1.1 200") && !status_line.starts_with("HTTP/1.0 200") {
        return Err(format!("HTTP proxy CONNECT failed: {}", status_line.trim()));
    }

    let consumed = header_end + 4;
    let remainder = buf[consumed..read].to_vec();
    // The SSH server may send its banner in the same segment as the proxy's
    // 200 response — keep those bytes readable by the SSH transport.
    if remainder.is_empty() {
        Ok(Box::new(stream))
    } else {
        Ok(Box::new(PrefixedStream {
            prefix: remainder,
            inner: stream,
        }))
    }
}

/// A stream that replays buffered prefix bytes before forwarding to the
/// underlying connection (used to preserve bytes read past the CONNECT
/// response header).
pub struct PrefixedStream<S> {
    pub prefix: Vec<u8>,
    pub inner: S,
}

impl<S: AsyncRead + Unpin> AsyncRead for PrefixedStream<S> {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        if !self.prefix.is_empty() && buf.remaining() > 0 {
            let n = std::cmp::min(buf.remaining(), self.prefix.len());
            buf.put_slice(&self.prefix[..n]);
            self.prefix.drain(..n);
            return std::task::Poll::Ready(Ok(()));
        }
        std::pin::Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl<S: AsyncWrite + Unpin> AsyncWrite for PrefixedStream<S> {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        std::pin::Pin::new(&mut self.inner).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    /// Fake HTTP proxy: asserts the CONNECT target, replies 200, then echoes.
    async fn fake_proxy(
        expect_auth: bool,
        status: &'static str,
    ) -> (u16, tokio::sync::oneshot::Receiver<bool>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let has_auth = req.contains("Proxy-Authorization: Basic ");
            let _ = tx.send(has_auth);
            if expect_auth && !has_auth {
                let _ = sock
                    .write_all(
                        b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n",
                    )
                    .await;
                return;
            }
            if !req.starts_with("CONNECT target.corp:22 HTTP/1.1") {
                let _ = sock
                    .write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
                    .await;
                return;
            }
            let _ = sock.write_all(status.as_bytes()).await;
            // echo loop
            let mut echo = vec![0u8; 64];
            loop {
                match sock.read(&mut echo).await {
                    Ok(0) | Err(_) => break,
                    Ok(k) => {
                        if sock.write_all(&echo[..k]).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });
        (port, rx)
    }

    #[tokio::test]
    async fn connect_via_http_proxy_sends_proxy_auth_basic() {
        let (port, rx) = fake_proxy(true, "HTTP/1.1 200 Connection established\r\n\r\n").await;
        let result = connect_via_http_proxy(
            &format!("http://user:secret@127.0.0.1:{}", port),
            "target.corp",
            22,
            Duration::from_secs(5),
        )
        .await;
        assert!(result.is_ok(), "auth must be accepted: {:?}", result.err());
        assert!(rx.await.unwrap(), "Proxy-Authorization header must be sent");
    }

    #[tokio::test]
    async fn connect_via_http_proxy_decodes_percent_encoded_credentials() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let _ = tx.send(req);
            let _ = sock
                .write_all(b"HTTP/1.1 200 Connection established\r\n\r\n")
                .await;
        });
        // url::Url percent-encodes reserved chars; the wire header must carry
        // the decoded form (user%40corp:p%40ss → user@corp:p@ss).
        let result = connect_via_http_proxy(
            &format!("http://user%40corp:p%40ss@127.0.0.1:{}", port),
            "target.corp",
            22,
            Duration::from_secs(5),
        )
        .await;
        assert!(result.is_ok(), "auth must be accepted: {:?}", result.err());
        let req = rx.await.unwrap();
        let header = req
            .lines()
            .find(|l| l.starts_with("Proxy-Authorization: Basic "))
            .expect("Proxy-Authorization header must be sent");
        let creds = header
            .trim_start_matches("Proxy-Authorization: Basic ")
            .trim();
        use base64::Engine;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(creds)
            .expect("valid base64");
        assert_eq!(decoded, b"user@corp:p@ss", "credentials must be decoded");
    }

    #[tokio::test]
    async fn connect_via_http_proxy_rejects_non_200() {
        let (port, _rx) = fake_proxy(
            false,
            "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let result = connect_via_http_proxy(
            &format!("http://127.0.0.1:{}", port),
            "target.corp",
            22,
            Duration::from_secs(5),
        )
        .await;
        match result {
            Err(e) => assert!(e.contains("407"), "expected 407, got: {}", e),
            Ok(_) => panic!("non-200 must fail"),
        }
    }

    #[tokio::test]
    async fn connect_via_http_proxy_keeps_bytes_after_connect_response() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            // 200 response AND SSH banner in the same write (single segment).
            let _ = sock
                .write_all(b"HTTP/1.1 200 Connection established\r\n\r\nSSH-2.0-OpenSSH_9.0\r\n")
                .await;
            let _ = n;
            // echo whatever the client sends afterwards
            let mut echo = vec![0u8; 64];
            loop {
                match sock.read(&mut echo).await {
                    Ok(0) | Err(_) => break,
                    Ok(k) => {
                        if sock.write_all(&echo[..k]).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        let mut stream = connect_via_http_proxy(
            &format!("http://127.0.0.1:{}", port),
            "target.corp",
            22,
            Duration::from_secs(5),
        )
        .await
        .expect("CONNECT succeeds with banner bytes");

        // The banner must be readable from the returned stream.
        let mut banner = [0u8; 21]; // "SSH-2.0-OpenSSH_9.0" + CRLF
        stream.read_exact(&mut banner).await.unwrap();
        assert_eq!(
            &banner[..21],
            b"SSH-2.0-OpenSSH_9.0\r\n",
            "banner bytes preserved"
        );
    }

    #[tokio::test]
    async fn http_proxy_server_connects_and_echoes() {
        use crate::ssh::socks5::DuplexStream;

        // echo target
        let echo = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let echo_port = echo.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut sock, _) = echo.accept().await.unwrap();
            let mut b = vec![0u8; 64];
            loop {
                match sock.read(&mut b).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if sock.write_all(&b[..n]).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // proxy server with outbound pinned to the echo server (proves the
        // CONNECT target is parsed and the tunnel established)
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_port = listener.local_addr().unwrap().port();
        let outbound: crate::ssh::socks5::OutboundFn =
            std::sync::Arc::new(move |_host: &str, _port: u16| {
                let target = ("127.0.0.1", echo_port);
                Box::pin(async move {
                    let stream = tokio::net::TcpStream::connect(target)
                        .await
                        .map_err(|e| e.to_string())?;
                    Ok(Box::new(stream) as Box<dyn DuplexStream>)
                })
            });
        tokio::spawn(run_http_proxy_server(listener, outbound));

        // client: CONNECT then send payload through the tunnel
        let mut tcp = tokio::net::TcpStream::connect(("127.0.0.1", proxy_port))
            .await
            .unwrap();
        tcp.write_all(
            format!(
                "CONNECT target.corp:{} HTTP/1.1\r\nHost: target.corp:{}\r\n\r\n",
                echo_port, echo_port
            )
            .as_bytes(),
        )
        .await
        .unwrap();
        // read the 200 response
        let mut resp = [0u8; 64];
        let mut n = 0;
        while n < resp.len() {
            let k = tcp.read(&mut resp[n..]).await.unwrap();
            if k == 0 {
                break;
            }
            n += k;
            if resp[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                break;
            }
        }
        assert!(
            String::from_utf8_lossy(&resp[..n]).contains("200 Connection established"),
            "got: {:?}",
            String::from_utf8_lossy(&resp[..n])
        );
        // payload round-trip through the CONNECT tunnel
        tcp.write_all(b"ping").await.unwrap();
        let mut echo_buf = [0u8; 4];
        tcp.read_exact(&mut echo_buf).await.unwrap();
        assert_eq!(&echo_buf, b"ping", "echo through CONNECT tunnel");
    }
}
