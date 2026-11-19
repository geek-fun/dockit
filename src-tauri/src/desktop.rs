use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{App, AppHandle, Manager, WindowEvent, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::mcp_bridge::{BridgeStopReason, McpSessionRegistry};

const MAIN_WINDOW: &str = "main";
const SHOW_WINDOW: &str = "tray-show-window";
const COPY_BRIDGE_URL: &str = "tray-copy-bridge-url";
const QUIT: &str = "tray-quit";
const STATUS_REFRESH: Duration = Duration::from_secs(5);
/// Client names rendered on one tray line; the rest collapses into "+N".
const MAX_CLIENTS_DISPLAYED: usize = 3;

/// Localized tray copy. Product nouns ("Data Studio Bridge", backend client
/// names) stay untranslated; only the status phrasing is localized.
struct TrayLabels {
    show_window: &'static str,
    quit: &'static str,
    copy_url: &'static str,
    /// "{}" → port
    bridge_running: &'static str,
    bridge_stopped: &'static str,
    bridge_stopped_gate: &'static str,
    /// "{count}" → session count, "{clients}" → client names
    server_sessions: &'static str,
    /// "{}" → seconds since last anonymous request
    server_anonymous: &'static str,
    server_none: &'static str,
}

impl TrayLabels {
    fn bridge_running_line(&self, port: u16) -> String {
        self.bridge_running.replace("{}", &port.to_string())
    }

    fn server_sessions_line(&self, count: usize, clients: &str) -> String {
        self.server_sessions
            .replace("{count}", &count.to_string())
            .replace("{clients}", clients)
    }

    fn server_anonymous_line(&self, secs: u64) -> String {
        self.server_anonymous.replace("{}", &secs.to_string())
    }
}

fn tray_labels(locale: &str) -> TrayLabels {
    let normalized = locale.to_ascii_lowercase();
    let mut locale_parts = normalized.split(['-', '_']);
    match locale_parts.next() {
        Some("zh") if locale_parts.any(|part| matches!(part, "hant" | "tw" | "hk" | "mo")) => {
            TrayLabels {
                show_window: "顯示視窗",
                quit: "結束",
                copy_url: "複製 Bridge 地址",
                bridge_running: "運行中（連接埠 {}）",
                bridge_stopped: "已停止",
                bridge_stopped_gate: "已停止（需要訂閱）",
                server_sessions: "{count} 個會話 — {clients}",
                server_anonymous: "活躍（{} 秒前有活動）",
                server_none: "無活躍會話",
            }
        }
        Some("zh") => TrayLabels {
            show_window: "显示窗口",
            quit: "退出",
            copy_url: "复制 Bridge 地址",
            bridge_running: "运行中（端口 {}）",
            bridge_stopped: "已停止",
            bridge_stopped_gate: "已停止（需要订阅）",
            server_sessions: "{count} 个会话 — {clients}",
            server_anonymous: "活跃（{} 秒前有活动）",
            server_none: "无活跃会话",
        },
        Some("pt") => TrayLabels {
            show_window: "Mostrar janela",
            quit: "Sair",
            copy_url: "Copiar URL do Bridge",
            bridge_running: "Em execução (porta {})",
            bridge_stopped: "Parado",
            bridge_stopped_gate: "Parado (assinatura necessária)",
            server_sessions: "{count} sessão(ões) — {clients}",
            server_anonymous: "ativo (visto há {}s)",
            server_none: "sem sessões ativas",
        },
        Some("ja") => TrayLabels {
            show_window: "ウィンドウを表示",
            quit: "終了",
            copy_url: "Bridge URL をコピー",
            bridge_running: "実行中（ポート {}）",
            bridge_stopped: "停止中",
            bridge_stopped_gate: "停止中（サブスクリプションが必要）",
            server_sessions: "{count} セッション — {clients}",
            server_anonymous: "アクティブ（{} 秒前に活動）",
            server_none: "アクティブなセッションなし",
        },
        Some("ko") => TrayLabels {
            show_window: "창 표시",
            quit: "종료",
            copy_url: "Bridge URL 복사",
            bridge_running: "실행 중 (포트 {})",
            bridge_stopped: "중지됨",
            bridge_stopped_gate: "중지됨 (구독 필요)",
            server_sessions: "{count}개 세션 — {clients}",
            server_anonymous: "활성 ({}초 전 활동)",
            server_none: "활성 세션 없음",
        },
        Some("es") => TrayLabels {
            show_window: "Mostrar ventana",
            quit: "Salir",
            copy_url: "Copiar URL del Bridge",
            bridge_running: "En ejecución (puerto {})",
            bridge_stopped: "Detenido",
            bridge_stopped_gate: "Detenido (se requiere suscripción)",
            server_sessions: "{count} sesión(es) — {clients}",
            server_anonymous: "activo (visto hace {}s)",
            server_none: "sin sesiones activas",
        },
        _ => TrayLabels {
            show_window: "Show Window",
            quit: "Quit",
            copy_url: "Copy Bridge URL",
            bridge_running: "Running (port {})",
            bridge_stopped: "Stopped",
            bridge_stopped_gate: "Stopped (subscription required)",
            server_sessions: "{count} session(s) — {clients}",
            server_anonymous: "active (last seen {}s ago)",
            server_none: "no active sessions",
        },
    }
}

/// Tray widgets the refresh loop and the copy handler share. Managed as Tauri
/// state so the menu event handler can reach the last known port without
/// touching the filesystem.
struct TrayStatusItems {
    tray: TrayIcon<Wry>,
    bridge_line: MenuItem<Wry>,
    server_line: MenuItem<Wry>,
    copy_url: MenuItem<Wry>,
    labels: TrayLabels,
    app_name: String,
    /// Last seen bridge port, kept fresh by the refresh loop.
    port: Mutex<Option<u16>>,
}

pub(crate) fn setup(app: &App) {
    let tray = match create_tray(app) {
        Ok(items) => {
            app.manage(items);
            true
        }
        Err(error) => {
            eprintln!("Could not create the system tray: {error}");
            false
        }
    };

    if tray {
        let app_handle = app.handle().clone();
        if let Some(items) = app_handle.try_state::<TrayStatusItems>() {
            // Paint the first status lines synchronously; the loop only has to
            // keep them fresh afterwards.
            refresh_status_lines(&app_handle, &items);
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(STATUS_REFRESH).await;
                    if let Some(items) = app_handle.try_state::<TrayStatusItems>() {
                        refresh_status_lines(&app_handle, &items);
                    }
                }
            });
        }
    }

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let main_window = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if tray && main_window.hide().is_ok() {
                    return;
                }
                if let Err(error) = main_window.minimize() {
                    eprintln!("Could not minimize the main window: {error}");
                }
            }
        });
    }
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        if let Err(error) = window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())
        {
            eprintln!("Could not restore the main window: {error}");
        }
    }
}

fn create_tray(app: &App) -> Result<TrayStatusItems, Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .ok_or("missing application icon")?
        .clone();
    let locale = tauri_plugin_os::locale().unwrap_or_default();
    let labels = tray_labels(&locale);
    let app_name = app.package_info().name.clone();

    let bridge_line = MenuItem::with_id(app, "tray-bridge-status", "", false, None::<&str>)?;
    let server_line = MenuItem::with_id(app, "tray-server-status", "", false, None::<&str>)?;
    let copy_url = MenuItem::with_id(app, COPY_BRIDGE_URL, labels.copy_url, true, None::<&str>)?;
    let show = MenuItem::with_id(app, SHOW_WINDOW, labels.show_window, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, labels.quit, true, None::<&str>)?;
    let menu = MenuBuilder::new(app)
        .item(&bridge_line)
        .item(&server_line)
        .item(&copy_url)
        .separator()
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    let tray = TrayIconBuilder::with_id(app.config().identifier.as_str())
        .icon(icon)
        .tooltip(&app_name)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW_WINDOW => show_main_window(app),
            COPY_BRIDGE_URL => copy_bridge_url(app),
            QUIT => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(TrayStatusItems {
        tray,
        bridge_line,
        server_line,
        copy_url,
        labels,
        app_name,
        port: Mutex::new(None),
    })
}

fn refresh_status_lines(app: &AppHandle, items: &TrayStatusItems) {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };
    let running_port = crate::mcp_bridge::get_actual_port(&app_data_dir);
    *items.port.lock().unwrap() = running_port;

    let bridge_text = match running_port {
        Some(port) => items.labels.bridge_running_line(port),
        None => {
            let gated = app
                .try_state::<crate::mcp_bridge::BridgeStopStatus>()
                .is_some_and(|status| {
                    *status.reason.lock().unwrap() == Some(BridgeStopReason::SubscriptionRequired)
                });
            if gated {
                items.labels.bridge_stopped_gate.to_string()
            } else {
                items.labels.bridge_stopped.to_string()
            }
        }
    };

    let server_text = app
        .try_state::<McpSessionRegistry>()
        .map(|registry| server_line(&registry, &items.labels))
        .unwrap_or_else(|| items.labels.server_none.to_string());

    let _ = items.bridge_line.set_text(&bridge_text);
    let _ = items.server_line.set_text(&server_text);
    let _ = items.copy_url.set_enabled(running_port.is_some());
    let tooltip = match running_port {
        Some(port) => format!("{} — Data Studio Bridge on :{port}", items.app_name),
        None => items.app_name.clone(),
    };
    let _ = items.tray.set_tooltip(Some(tooltip));
}

fn server_line(registry: &McpSessionRegistry, labels: &TrayLabels) -> String {
    let sessions = registry.live_sessions();
    if sessions.is_empty() {
        return registry
            .anonymous_age_secs()
            .map(|secs| labels.server_anonymous_line(secs))
            .unwrap_or_else(|| labels.server_none.to_string());
    }

    let names: Vec<String> = sessions
        .iter()
        .map(|entry| {
            entry
                .client
                .clone()
                .or_else(|| {
                    entry
                        .version
                        .clone()
                        .map(|v| format!("data-studio-mcp/{v}"))
                })
                .unwrap_or_else(|| "data-studio-mcp".to_string())
        })
        .collect();
    let shown = &names[..names.len().min(MAX_CLIENTS_DISPLAYED)];
    let clients = if names.len() > MAX_CLIENTS_DISPLAYED {
        format!(
            "{} +{}",
            shown.join(", "),
            names.len() - MAX_CLIENTS_DISPLAYED
        )
    } else {
        shown.join(", ")
    };
    labels.server_sessions_line(names.len(), &clients)
}

fn copy_bridge_url(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayStatusItems>() else {
        return;
    };
    let Some(port) = *items.port.lock().unwrap() else {
        return;
    };
    if let Err(error) = app
        .clipboard()
        .write_text(format!("http://127.0.0.1:{port}"))
    {
        eprintln!("Could not copy the bridge URL: {error}");
    }
}
