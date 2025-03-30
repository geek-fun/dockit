use tauri::{App, Error, Emitter, Window, Manager};
use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItem};

pub fn create_menu(app: &App) -> Result<(), Error> {
    let about_menu = SubmenuBuilder::new(app, "DocKit")
        .about(None) // Provide the required argument
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?; // Unwrap the Result

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItem::with_id(app, "save", &"Save".to_string(), true, Some("CommandOrControl+S")).unwrap())
        .build()?; // Unwrap the Result

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?; // Unwrap the Result

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .fullscreen()
        .close_window()
        .separator()
        .build()?; // Unwrap the Result

    let developer_menu = SubmenuBuilder::new(app, "Developer")
        .item(&MenuItem::with_id(app, "toggle_dev_tools", &"Toggle Developer Tools".to_string(), true, Some("F12")).unwrap())
        .build()?; // Unwrap the Result

    let menu = MenuBuilder::new(app)
        .item(&about_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .item(&developer_menu)
        .build()?; // Use the `?` operator

    app.set_menu(menu)?; // Set the built menu

    app.on_menu_event(move |app_handle: &tauri::AppHandle, event| {
        println!("menu event: {:?}", event.id());

        let window = app_handle.get_webview_window("main").unwrap();

        match event.id().0.as_str() {
            "save" => { }
            "close" => { }
            "toggle_dev_tools" => {
                #[cfg(debug_assertions)]
                if window.is_devtools_open() {
                    window.close_devtools();
                } else {
                    window.open_devtools();
                }
            }
            _ => {
                println!("unexpected menu event");
            }
        }
    });

    Ok(())
}
