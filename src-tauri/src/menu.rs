use tauri::Menu;
use tauri::MenuItem;
use tauri::{AboutMetadata, CustomMenuItem, Manager, Submenu, WindowMenuEvent, Wry};

pub fn create_menu() -> Menu {
    let about_menu = Submenu::new(
        "DocKit",
        Menu::new()
            .add_native_item(MenuItem::About("DocKit".into(), AboutMetadata::default()))
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Services)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Hide)
            .add_native_item(MenuItem::HideOthers)
            .add_native_item(MenuItem::ShowAll)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Quit),
    );

    let file_menu = Submenu::new(
        "File",
        Menu::new().add_item(
            CustomMenuItem::new("save".to_string(), "Save").accelerator("CommandOrControl+S"),
        ),
    );

    let edit_menu = Submenu::new(
        "Edit",
        Menu::new()
            .add_native_item(MenuItem::Undo)
            .add_native_item(MenuItem::Redo)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Cut)
            .add_native_item(MenuItem::Copy)
            .add_native_item(MenuItem::Paste)
            .add_native_item(MenuItem::SelectAll),
    );

    let window_menu = Submenu::new(
        "Window",
        Menu::new()
            .add_native_item(MenuItem::Minimize)
            .add_native_item(MenuItem::EnterFullScreen)
            .add_native_item(MenuItem::CloseWindow)
            .add_native_item(MenuItem::Separator)
            .add_item(CustomMenuItem::new("front".to_string(), "Front")),
    );

    let developer_menu = Submenu::new(
        "Developer",
        Menu::new().add_item(
            CustomMenuItem::new("toggle_dev_tools".to_string(), "Toggle Developer Tools")
                .accelerator("F12"),
        ),
    );

    Menu::new()
        .add_submenu(about_menu)
        .add_submenu(file_menu)
        .add_submenu(edit_menu)
        .add_submenu(window_menu)
        .add_submenu(developer_menu)
}

pub fn menu_event_handler(event: WindowMenuEvent<Wry>) {
    let window = event.window();
    match event.menu_item_id() {
        "save" => {
            // handle save event
            window.emit_all("saveFile", ()).unwrap();
        }
        "toggle_dev_tools" =>
        {
            #[cfg(debug_assertions)]
            if window.is_devtools_open() {
                window.close_devtools();
            } else {
                window.open_devtools();
            }
        }
        _ => {}
    }
}
