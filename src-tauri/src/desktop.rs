use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Manager, WindowEvent};

const MAIN_WINDOW: &str = "main";
const SHOW_WINDOW: &str = "tray-show-window";
const QUIT: &str = "tray-quit";

pub(crate) fn setup(app: &App) {
    let tray_ready = match create_tray(app) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("Could not create the system tray: {error}");
            false
        }
    };

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let main_window = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if tray_ready && main_window.hide().is_ok() {
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

fn create_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .ok_or("missing application icon")?;
    let locale = tauri_plugin_os::locale()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut locale_parts = locale.split(['-', '_']);
    let (show_label, quit_label) = match locale_parts.next() {
        Some("zh") if locale_parts.any(|part| matches!(part, "hant" | "tw" | "hk" | "mo")) => {
            ("顯示視窗", "結束")
        }
        Some("zh") => ("显示窗口", "退出"),
        Some("pt") => ("Mostrar janela", "Sair"),
        Some("ja") => ("ウィンドウを表示", "終了"),
        Some("ko") => ("창 표시", "종료"),
        Some("es") => ("Mostrar ventana", "Salir"),
        _ => ("Show Window", "Quit"),
    };

    let show = MenuItem::with_id(app, SHOW_WINDOW, show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, quit_label, true, None::<&str>)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;
    TrayIconBuilder::with_id(app.config().identifier.as_str())
        .icon(icon.clone())
        .tooltip(&app.package_info().name)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW_WINDOW => show_main_window(app),
            QUIT => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
