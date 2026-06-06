mod adb;
mod commands;
mod models;
mod parsers;
mod tools;

use commands::devices;
use commands::operations;
use commands::screenshot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            devices::list_devices,
            devices::get_device_details,
            screenshot::capture_screenshot,
            operations::run_device_action,
            operations::run_host_action,
            operations::set_device_dark_mode,
            operations::get_media_volume,
            operations::set_media_volume,
            operations::list_apps,
            operations::enrich_app_summary,
            operations::select_apk_destination,
            operations::select_application_packages,
            operations::install_application_packages,
            operations::get_app_details,
            operations::clear_application_cache,
            operations::list_directory,
            operations::pull_file,
            operations::get_file_thumbnail,
            operations::launch_scrcpy,
            operations::list_scrcpy_cameras,
            operations::get_adb_info,
            operations::get_tools_status,
            operations::set_tool_path,
            operations::install_or_update_tool,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
