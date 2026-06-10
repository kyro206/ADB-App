

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
            let settings = crate::commands::operations::read_settings();
            crate::app_paths::update_base_path(
                if !settings.cache_path.trim().is_empty() {
                    Some(&settings.cache_path)
                } else {
                    None
                }
            );

            let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title("ADB App")
                .inner_size(1180.0, 760.0)
                .min_inner_size(920.0, 620.0)
                .decorations(false)
                .transparent(true)
                .data_directory(crate::app_paths::data_dir());

            let window = builder.build().map_err(|e| e.to_string())?;

            #[cfg(target_os = "windows")]
            {
                let _ = window_vibrancy::apply_mica(&window, None);
            }

            #[cfg(target_os = "macos")]
            {
                let _ = window_vibrancy::apply_vibrancy(&window, window_vibrancy::NSVisualEffectMaterial::Sidebar, None, None);
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let settings = crate::commands::operations::read_settings();
                if settings.kill_adb_on_exit {
                    if let Some(path) = crate::tools::resolve_tool_path("adb") {
                        let _ = crate::process::command(path).arg("kill-server").status();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            devices::list_devices,
            devices::get_device_details,
            screenshot::capture_screenshot,
            screenshot::save_screenshot,
            operations::run_device_action,
            operations::connect_wireless_device,
            operations::disconnect_wireless_device,
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
            operations::get_app_settings,
            operations::save_app_settings,
            operations::close_app,
            operations::get_default_cache_dir,
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
