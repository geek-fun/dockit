use serde_json::Value::String;
use tauri::{AboutMetadata, CustomMenuItem, Submenu};
use tauri::Menu;
use tauri::MenuItem;

pub fn create_menu() -> Menu {
    let about_menu = Submenu::new("DocKit", Menu::new()
        .add_native_item(MenuItem::About("DocKit".into(), AboutMetadata::default()))
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Services)
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Hide)
        .add_native_item(MenuItem::HideOthers)
        .add_native_item(MenuItem::ShowAll)
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Quit));
    let file_menu = Submenu::new("File", Menu::new()
        .add_item(CustomMenuItem::new("save".to_string(), "Save")));
    let edit_menu = Submenu::new("Edit", Menu::new()
        .add_native_item(MenuItem::Undo)
        .add_native_item(MenuItem::Redo)
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Cut)
        .add_native_item(MenuItem::Copy)
        .add_native_item(MenuItem::Paste)
        .add_native_item(MenuItem::SelectAll));
    let window_menu = Submenu::new("Window", Menu::new()
        .add_native_item(MenuItem::Minimize)
        .add_native_item(MenuItem::EnterFullScreen)
        .add_native_item(MenuItem::CloseWindow)
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("front".to_string(), "Front")));

    let developer_menu = Submenu::new("Developer", Menu::new()
        .add_item(CustomMenuItem::new("toggle_dev_tools".to_string(), "Toggle Developer Tools")),
    );

    Menu::new()
        .add_submenu(about_menu)
        .add_submenu(file_menu)
        .add_submenu(edit_menu)
        .add_submenu(window_menu)
        .add_submenu(developer_menu)
}
