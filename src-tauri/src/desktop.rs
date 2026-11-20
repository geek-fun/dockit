use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{App, AppHandle, Manager, WindowEvent, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::mcp_bridge::BridgeStopReason;

const MAIN_WINDOW: &str = "main";
const SHOW_WINDOW: &str = "tray-show-window";
const UNLOCK_BRIDGE: &str = "tray-unlock-bridge";
const COPY_BRIDGE_URL: &str = "tray-copy-bridge-url";
const QUIT: &str = "tray-quit";
const STATUS_REFRESH: Duration = Duration::from_secs(5);

/// Localized tray copy. Product nouns ("MCP Bridge", backend client
/// names) stay untranslated; only the status phrasing is localized.
struct TrayLabels {
    show_window: &'static str,
    quit: &'static str,
    copy_url: &'static str,
    bridge_running: &'static str,
    bridge_stopped: &'static str,
    bridge_stopped_gate: &'static str,
    /// Action item shown under the gated-stop status; "…" = opens a dialog.
    unlock: &'static str,
}

impl TrayLabels {
    fn bridge_running_line(&self, port: u16) -> String {
        self.bridge_running.replace("{}", &port.to_string())
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
                bridge_running: "MCP Bridge：運行中（連接埠 {}）",
                bridge_stopped: "MCP Bridge：已停止",
                bridge_stopped_gate: "MCP Bridge：已停止（需要訂閱）",
                unlock: "解鎖 MCP Bridge…",
            }
        }
        Some("zh") => TrayLabels {
            show_window: "显示窗口",
            quit: "退出",
            copy_url: "复制 Bridge 地址",
            bridge_running: "MCP 桥接：运行中（端口 {}）",
            bridge_stopped: "MCP 桥接：已停止",
            bridge_stopped_gate: "MCP 桥接：已停止（需要订阅）",
            unlock: "解锁 MCP 桥接…",
        },
        Some("pt") => TrayLabels {
            show_window: "Mostrar janela",
            quit: "Sair",
            copy_url: "Copiar URL do Bridge",
            bridge_running: "Ponte MCP: em execução (porta {})",
            bridge_stopped: "Ponte MCP: parado",
            bridge_stopped_gate: "Ponte MCP: parado (assinatura necessária)",
            unlock: "Desbloquear Ponte MCP…",
        },
        Some("ja") => TrayLabels {
            show_window: "ウィンドウを表示",
            quit: "終了",
            copy_url: "Bridge URL をコピー",
            bridge_running: "MCPブリッジ：実行中（ポート {}）",
            bridge_stopped: "MCPブリッジ：停止中",
            bridge_stopped_gate: "MCPブリッジ：停止中（サブスクリプションが必要）",
            unlock: "MCPブリッジを解錠…",
        },
        Some("ko") => TrayLabels {
            show_window: "창 표시",
            quit: "종료",
            copy_url: "Bridge URL 복사",
            bridge_running: "MCP 브리지: 실행 중 (포트 {})",
            bridge_stopped: "MCP 브리지: 중지됨",
            bridge_stopped_gate: "MCP 브리지: 중지됨 (구독 필요)",
            unlock: "MCP 브리지 잠금 해제…",
        },
        Some("es") => TrayLabels {
            show_window: "Mostrar ventana",
            quit: "Salir",
            copy_url: "Copiar URL del Bridge",
            bridge_running: "Puente MCP: en ejecución (puerto {})",
            bridge_stopped: "Puente MCP: detenido",
            bridge_stopped_gate: "Puente MCP: detenido (se requiere suscripción)",
            unlock: "Desbloquear Puente MCP…",
        },
        _ => TrayLabels {
            show_window: "Show Window",
            quit: "Quit",
            copy_url: "Copy Bridge URL",
            bridge_running: "MCP Bridge: Running (port {})",
            bridge_stopped: "MCP Bridge: Stopped",
            bridge_stopped_gate: "MCP Bridge: Stopped (subscription required)",
            unlock: "Unlock MCP Bridge…",
        },
    }
}

/// Tray widgets the refresh loop and the copy handler share. Managed as Tauri
/// state so the menu event handler can reach the last known port without
/// touching the filesystem.
struct TrayStatusItems {
    tray: TrayIcon<Wry>,
    bridge_line: MenuItem<Wry>,
    unlock_line: MenuItem<Wry>,
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

    // Inert status line — its id is never matched; the unlock item below carries the click.
    let bridge_line = MenuItem::with_id(app, "tray-bridge-status", "", false, None::<&str>)?;
    let unlock_line = MenuItem::with_id(app, UNLOCK_BRIDGE, labels.unlock, false, None::<&str>)?;
    let copy_url = MenuItem::with_id(app, COPY_BRIDGE_URL, labels.copy_url, true, None::<&str>)?;
    let show = MenuItem::with_id(app, SHOW_WINDOW, labels.show_window, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, labels.quit, true, None::<&str>)?;
    let menu = MenuBuilder::new(app)
        .item(&bridge_line)
        .item(&unlock_line)
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
            UNLOCK_BRIDGE => {
                show_main_window(app);
                use tauri::Emitter;
                let _ = app.emit("mcp-bridge://subscription", ());
            }
            COPY_BRIDGE_URL => copy_bridge_url(app),
            QUIT => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(TrayStatusItems {
        tray,
        bridge_line,
        unlock_line,
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

    // The "Unlock …" action item appears only under the gated-stop status —
    // the status line itself stays inert; the action item carries the click.
    let gated_stop = running_port.is_none() && bridge_text == items.labels.bridge_stopped_gate;
    let _ = items.bridge_line.set_text(&bridge_text);
    let _ = items.unlock_line.set_enabled(gated_stop);
    let _ = items.copy_url.set_enabled(running_port.is_some());
    let tooltip = match running_port {
        Some(port) => format!("{} — MCP Bridge on :{port}", items.app_name),
        None => items.app_name.clone(),
    };
    let _ = items.tray.set_tooltip(Some(tooltip));
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
