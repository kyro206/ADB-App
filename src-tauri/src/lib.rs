mod adb;
mod app_paths;
mod commands;
mod dependencies;
mod models;
mod parsers;
mod process;
mod tools;

use commands::devices;
use commands::operations;
use commands::screenshot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app_paths::initialize(&app.handle())?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            devices::list_devices,
            devices::get_device_details,
            screenshot::capture_screenshot,
            screenshot::save_screenshot,
            operations::run_device_action,
            operations::connect_wireless_device,
            operations::pair_wireless_device,
            operations::generate_wireless_qr,
            operations::pair_wireless_qr,
            operations::connect_usb_over_tcpip,
            operations::get_system_state,
            operations::set_device_dark_mode,
            operations::get_media_volume,
            operations::set_media_volume,
            operations::list_apps,
            operations::enrich_app_summary,
            operations::install_application_packages,
            operations::get_app_details,
            operations::clear_application_cache,
            operations::list_directory,
            operations::pull_file,
            operations::get_file_thumbnail,
            operations::launch_scrcpy,
            operations::list_scrcpy_cameras,
            operations::get_tools_status,
            operations::check_tool_updates,
            operations::set_tool_path,
            operations::install_or_update_tool,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
