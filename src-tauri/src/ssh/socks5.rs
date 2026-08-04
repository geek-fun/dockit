//! Local SOCKS5 proxy server bridged into an SSH tunnel (ssh -D equivalent).
//!
//! Drivers keep the real hostname (TLS SNI / certificate validation stay
//! correct) while TCP goes through this proxy into the SSH channel.

use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;

use fast_socks5::server::{transfer, Socks5ServerProtocol};
use fast_socks5::util::target_addr::TargetAddr;
use fast_socks5::{ReplyError, Socks5Command};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpListener;

/// A bidirectional byte stream usable as an outbound SOCKS5 target
/// (trait-object-friendly alias of AsyncRead + AsyncWrite).
pub trait DuplexStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> DuplexStream for T {}

/// Creates the outbound stream for a SOCKS5 CONNECT target.
/// Production: opens an SSH direct-tcpip channel (russh ChannelStream).
/// Tests: connects directly to a local echo server.
pub type OutboundFn = Arc<
    dyn Fn(&str, u16) -> Pin<Box<dyn Future<Output = Result<Box<dyn DuplexStream>, String>> + Send>>
        + Send
        + Sync,
>;

/// Accepts SOCKS5 clients on `listener` and forwards each CONNECT through
/// `outbound`. Rejects non-CONNECT commands (UDP ASSOCIATE / BIND).
pub async fn run_socks5_server(listener: TcpListener, outbound: OutboundFn) {
    loop {
        let (socket, _) = match listener.accept().await {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        let outbound = Arc::clone(&outbound);
        tokio::spawn(async move {
            let _ = handle_socks5_conn(socket, &outbound).await;
        });
    }
}

/// Handles a single accepted connection using the SOCKS5 protocol.
/// Exposed for the dual-protocol tunnel (first-byte dispatch).
pub async fn handle_socks5_conn<S>(socket: S, outbound: &OutboundFn) -> Result<(), String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let proto = Socks5ServerProtocol::accept_no_auth(socket)
        .await
        .map_err(|e| e.to_string())?;
    let (proto, cmd, target) = proto.read_command().await.map_err(|e| e.to_string())?;
    if !matches!(cmd, Socks5Command::TCPConnect) {
        let _ = proto.reply_error(&ReplyError::CommandNotSupported).await;
        return Err("Unsupported SOCKS5 command".to_string());
    }
    let (host, port) = match target {
        TargetAddr::Domain(h, p) => (h, p),
        TargetAddr::Ip(addr) => (addr.ip().to_string(), addr.port()),
    };
    let outbound_stream = match outbound(&host, port).await {
        Ok(stream) => stream,
        Err(e) => {
            // Reply before closing so clients see a failure, not a bare
            // TCP drop (mirrors the HTTP CONNECT path's 502 response).
            let _ = proto.reply_error(&ReplyError::ConnectionRefused).await;
            return Err(e);
        }
    };
    let bind_addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let client_stream = proto
        .reply_success(bind_addr)
        .await
        .map_err(|e| e.to_string())?;
    let _ = transfer(client_stream, outbound_stream).await;
    Ok(())
}

/// Dual-protocol tunnel server: reads the first byte and dispatches to the
/// SOCKS5 protocol (0x05) or HTTP CONNECT ('C'). One local port serves both
/// — SOCKS5 for Mongo/ES drivers, HTTP CONNECT for drivers whose SDK only
/// supports CONNECT proxies (AWS SDK for DynamoDB).
pub async fn run_dual_proxy_server(listener: TcpListener, outbound: OutboundFn) {
    loop {
        let (socket, _) = match listener.accept().await {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        let outbound = Arc::clone(&outbound);
        tokio::spawn(async move {
            let mut socket = socket;
            let mut first = [0u8; 1];
            if tokio::io::AsyncReadExt::read(&mut socket, &mut first)
                .await
                .unwrap_or(0)
                == 0
            {
                return;
            }
            let socket = crate::ssh::http_proxy::PrefixedStream {
                prefix: first.to_vec(),
                inner: socket,
            };
            if first[0] == 0x05 {
                let _ = handle_socks5_conn(socket, &outbound).await;
            } else if first[0] == b'C' {
                let _ = crate::ssh::http_proxy::handle_http_connect_conn(socket, &outbound).await;
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    async fn echo_server() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = match listener.accept().await {
                    Ok(pair) => pair,
                    Err(_) => return,
                };
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 1024];
                    loop {
                        match sock.read(&mut buf).await {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                if sock.write_all(&buf[..n]).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                });
            }
        });
        port
    }

    fn direct_outbound() -> OutboundFn {
        Arc::new(|host: &str, port: u16| {
            let host = host.to_string();
            Box::pin(async move {
                let stream = TcpStream::connect((host.as_str(), port))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(Box::new(stream) as Box<dyn DuplexStream>)
            })
        })
    }

    async fn spawn_socks5(outbound: OutboundFn) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(run_socks5_server(listener, outbound));
        port
    }

    #[tokio::test]
    async fn socks5_connect_forwards_to_injected_outbound() {
        let echo_port = echo_server().await;
        let socks_port = spawn_socks5(direct_outbound()).await;

        let mut client = fast_socks5::client::Socks5Stream::connect(
            ("127.0.0.1", socks_port),
            "127.0.0.1".to_string(),
            echo_port,
            fast_socks5::client::Config::default(),
        )
        .await
        .expect("SOCKS5 handshake");

        client.write_all(b"ping").await.unwrap();
        let mut buf = [0u8; 4];
        client.read_exact(&mut buf).await.unwrap();
        assert_eq!(&buf, b"ping", "echo round-trip through SOCKS5");
    }

    #[tokio::test]
    async fn socks5_rejects_udp_associate() {
        let socks_port = spawn_socks5(direct_outbound()).await;
        let mut tcp = TcpStream::connect(("127.0.0.1", socks_port)).await.unwrap();
        // no-auth greeting, then UDP ASSOCIATE (cmd=3)
        tcp.write_all(&[0x05, 0x01, 0x00]).await.unwrap();
        let mut reply = [0u8; 2];
        tcp.read_exact(&mut reply).await.unwrap();
        assert_eq!(reply, [0x05, 0x00]);
        tcp.write_all(&[0x05, 0x03, 0x00, 0x01, 127, 0, 0, 1, 0, 0])
            .await
            .unwrap();
        let mut status = [0u8; 2];
        tcp.read_exact(&mut status).await.unwrap();
        assert_eq!(
            status[1], 0x07,
            "UDP ASSOCIATE must reply Command not supported"
        );
    }

    #[tokio::test]
    async fn socks5_rejects_tcp_bind() {
        let socks_port = spawn_socks5(direct_outbound()).await;
        let mut tcp = TcpStream::connect(("127.0.0.1", socks_port)).await.unwrap();
        tcp.write_all(&[0x05, 0x01, 0x00]).await.unwrap();
        let mut reply = [0u8; 2];
        tcp.read_exact(&mut reply).await.unwrap();
        assert_eq!(reply, [0x05, 0x00]);
        tcp.write_all(&[0x05, 0x02, 0x00, 0x01, 127, 0, 0, 1, 0, 0])
            .await
            .unwrap();
        let mut status = [0u8; 2];
        tcp.read_exact(&mut status).await.unwrap();
        assert_eq!(status[1], 0x07, "BIND must reply Command not supported");
    }

    #[tokio::test]
    async fn socks5_outbound_failure_replies_connection_refused() {
        let failing: OutboundFn = std::sync::Arc::new(|_h: &str, _p: u16| {
            Box::pin(async { Err("no route".to_string()) })
        });
        let socks_port = spawn_socks5(failing).await;
        let mut tcp = TcpStream::connect(("127.0.0.1", socks_port)).await.unwrap();
        tcp.write_all(&[0x05, 0x01, 0x00]).await.unwrap();
        let mut reply = [0u8; 2];
        tcp.read_exact(&mut reply).await.unwrap();
        assert_eq!(reply, [0x05, 0x00]);
        // CONNECT to db.internal.corp:27017 — outbound will fail
        let domain = b"db.internal.corp";
        tcp.write_all(&[0x05, 0x01, 0x00, 0x03, domain.len() as u8])
            .await
            .unwrap();
        tcp.write_all(domain).await.unwrap();
        tcp.write_all(&[0x69, 0x41]).await.unwrap();
        let mut status = [0u8; 2];
        tcp.read_exact(&mut status).await.unwrap();
        assert_eq!(
            status[1], 0x05,
            "outbound failure must reply Connection refused, got {:?}",
            status
        );
    }

    #[tokio::test]
    async fn dual_proxy_server_serves_both_protocols_on_one_port() {
        use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

        // echo server (accept loop) as the outbound target
        let echo = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let echo_port = echo.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = match echo.accept().await {
                    Ok(pair) => pair,
                    Err(_) => return,
                };
                tokio::spawn(async move {
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
            }
        });

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let outbound: OutboundFn = Arc::new(move |_h: &str, _p: u16| {
            let target = ("127.0.0.1", echo_port);
            Box::pin(async move {
                let stream = TcpStream::connect(target)
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(Box::new(stream) as Box<dyn DuplexStream>)
            })
        });
        tokio::spawn(run_dual_proxy_server(listener, outbound));

        // 1) SOCKS5 through the dual port
        let mut socks = fast_socks5::client::Socks5Stream::connect(
            ("127.0.0.1", port),
            "127.0.0.1".to_string(),
            echo_port,
            fast_socks5::client::Config::default(),
        )
        .await
        .expect("SOCKS5 handshake on dual port");
        socks.write_all(b"s5").await.unwrap();
        let mut r5 = [0u8; 2];
        socks.read_exact(&mut r5).await.unwrap();
        assert_eq!(&r5, b"s5", "SOCKS5 round-trip on dual port");

        // 2) HTTP CONNECT through the same dual port
        let mut c = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        c.write_all(b"CONNECT t:1 HTTP/1.1\r\nHost: t:1\r\n\r\n")
            .await
            .unwrap();
        let mut resp = [0u8; 64];
        let n = c.read(&mut resp).await.unwrap();
        assert!(
            String::from_utf8_lossy(&resp[..n]).contains("200"),
            "CONNECT must succeed on dual port, got: {:?}",
            String::from_utf8_lossy(&resp[..n])
        );
        c.write_all(b"hc").await.unwrap();
        let mut r6 = [0u8; 2];
        c.read_exact(&mut r6).await.unwrap();
        assert_eq!(&r6, b"hc", "HTTP CONNECT round-trip on dual port");
    }

    #[tokio::test]
    async fn socks5_target_addr_domain_forwarded_verbatim() {
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let outbound: OutboundFn = {
            let seen = Arc::clone(&seen);
            Arc::new(move |host: &str, _port: u16| {
                let seen = Arc::clone(&seen);
                let host = host.to_string();
                Box::pin(async move {
                    seen.lock().unwrap().push(host);
                    Err("no real connection in this test".to_string())
                })
            })
        };
        let socks_port = spawn_socks5(outbound).await;

        let mut tcp = TcpStream::connect(("127.0.0.1", socks_port)).await.unwrap();
        tcp.write_all(&[0x05, 0x01, 0x00]).await.unwrap();
        let mut reply = [0u8; 2];
        tcp.read_exact(&mut reply).await.unwrap();
        // domain-type CONNECT to db.internal.corp:27017
        let domain = b"db.internal.corp";
        tcp.write_all(&[0x05, 0x01, 0x00, 0x03, domain.len() as u8])
            .await
            .unwrap();
        tcp.write_all(domain).await.unwrap();
        tcp.write_all(&[0x69, 0x41]).await.unwrap(); // 27017

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let received = seen.lock().unwrap();
        assert_eq!(
            received.as_slice(),
            &["db.internal.corp".to_string()],
            "domain passed through verbatim"
        );
    }
}
