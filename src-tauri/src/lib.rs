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
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            app_paths::initialize(&app.handle())?;
            let settings = crate::commands::operations::read_settings();
            crate::app_paths::update_base_path(if !settings.cache_path.trim().is_empty() {
                Some(&settings.cache_path)
            } else {
                None
            });

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::adb::start_device_tracker(app_handle).await;
            });
            let tools_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let status = crate::tools::tools_status_with_updates().await;
                let _ = tools_app.emit("tools-updates-checked", status);
            });

            let mut settings_value = serde_json::to_value(&settings).unwrap_or_default();
            if let Some(settings_object) = settings_value.as_object_mut() {
                settings_object.insert(
                    "packaged".to_string(),
                    serde_json::Value::Bool(crate::app_paths::is_packaged()),
                );
            }
            let settings_json =
                serde_json::to_string(&settings_value).unwrap_or_else(|_| "{}".to_string());
            let init_script = format!("window.__APP_SETTINGS__ = {};", settings_json);

            #[allow(unused_mut)]
            let mut builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("ADB App")
            .inner_size(1180.0, 760.0)
            .min_inner_size(920.0, 620.0)
            .data_directory(crate::app_paths::webview_data_dir())
            .initialization_script(&init_script);

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .transparent(true);
            }

            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.transparent(true).decorations(false);
            }

            let window = builder.build().map_err(|e| e.to_string())?;
            operations::apply_window_effect(&window, &settings.window_effect);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(
        tauri_plugin_prevent_default::Builder::new()
            .with_flags(
                tauri_plugin_prevent_default::Flags::all()
                    .difference(tauri_plugin_prevent_default::Flags::DEV_TOOLS | tauri_plugin_prevent_default::Flags::RELOAD)
            )
            .build()
    );

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_prevent_default::init());

    #[cfg(not(store_build))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
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
            operations::run_device_action_batch,
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
            operations::set_app_permission,
            operations::export_apk,
            operations::get_home_details,
            operations::clear_application_cache,
            operations::get_app_settings,
            operations::save_app_settings,
            operations::close_app,
            operations::get_default_cache_dir,
            operations::list_directory,
            operations::pull_file,
            operations::read_file_bytes,
            operations::get_file_thumbnail,
            operations::launch_scrcpy,
            operations::list_scrcpy_cameras,
            operations::get_tools_snapshot,
            operations::set_tool_path,
            operations::install_or_update_tool,
            operations::set_window_theme,
            operations::get_window_effect_info,
            operations::get_device_wallpaper,
            operations::sideload_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
