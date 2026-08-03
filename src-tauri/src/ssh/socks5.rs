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
            let proto = match Socks5ServerProtocol::accept_no_auth(socket).await {
                Ok(p) => p,
                Err(_) => return,
            };
            let (proto, cmd, target) = match proto.read_command().await {
                Ok(t) => t,
                Err(_) => return,
            };
            if !matches!(cmd, Socks5Command::TCPConnect) {
                let _ = proto.reply_error(&ReplyError::CommandNotSupported).await;
                return;
            }
            let (host, port) = match target {
                TargetAddr::Domain(h, p) => (h, p),
                TargetAddr::Ip(addr) => (addr.ip().to_string(), addr.port()),
            };
            let outbound_stream = match outbound(&host, port).await {
                Ok(s) => s,
                Err(_) => {
                    let _ = proto.reply_error(&ReplyError::GeneralFailure).await;
                    return;
                }
            };
            let bind_addr = SocketAddr::from(([127, 0, 0, 1], 0));
            let client_stream = match proto.reply_success(bind_addr).await {
                Ok(s) => s,
                Err(_) => return,
            };
            let _ = transfer(client_stream, outbound_stream).await;
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
