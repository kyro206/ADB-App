use crate::adb;
use crate::models::{Device, DeviceDetails};
use crate::parsers::device_parser;

/// List all connected ADB devices.
#[tauri::command]
pub async fn list_devices() -> Result<Vec<Device>, String> {
    let result = adb::run_adb(&["devices", "-l"]).await?;
    if !result.ok() {
        return Err(format!("adb devices -l failed: {}", result.output));
    }
    Ok(device_parser::parse_devices(&result.output))
}

/// Get detailed information about a specific device.
#[tauri::command]
pub async fn get_device_details(serial: String) -> Result<DeviceDetails, String> {
    // First get the device from the list to have basic info
    let devices_result = adb::run_adb(&["devices", "-l"]).await?;
    let devices = device_parser::parse_devices(&devices_result.output);

    let device = devices
        .iter()
        .find(|d| d.serial == serial)
        .cloned()
        .ok_or_else(|| format!("Device not found: {}", serial))?;

    if device.state != "device" {
        // Device not fully connected, return minimal details
        return Ok(DeviceDetails {
            serial: device.serial,
            state: device.state,
            manufacturer: "-".to_string(),
            brand: "-".to_string(),
            model: if device.model.is_empty() {
                "-".to_string()
            } else {
                device.model
            },
            marketing_name: "-".to_string(),
            codename: if device.device.is_empty() {
                "-".to_string()
            } else {
                device.device
            },
            product_name: if device.product.is_empty() {
                "-".to_string()
            } else {
                device.product
            },
            android_version: "-".to_string(),
            api_level: "-".to_string(),
            soc: "-".to_string(),
            architecture: "-".to_string(),
            device_type: "unknown".to_string(),
            physical_width: 0,
            physical_height: 0,
            current_width: 0,
            current_height: 0,
            physical_density: 0,
            current_density: 0,
            smallest_width_dp: 0,
            refresh_rate_hz: 0.0,
            supported_refresh_rates_hz: Vec::new(),
            total_ram_mb: -1,
            used_ram_mb: -1,
            battery_level_percent: -1,
            battery_health: "-".to_string(),
            total_storage_mb: -1,
            used_storage_mb: -1,
            dark_mode_enabled: false,
            screen_off_timeout_ms: 60000,
        });
    }

    // Run all info queries
    let getprop = run_or_empty(&serial, &["shell", "getprop"]).await;
    let dumpsys_meminfo = run_or_empty(&serial, &["shell", "dumpsys", "meminfo"]).await;
    let proc_meminfo = run_or_empty(&serial, &["shell", "cat", "/proc/meminfo"]).await;
    let meminfo = format!("{dumpsys_meminfo}\n{proc_meminfo}");
    let battery = run_or_empty(&serial, &["shell", "dumpsys", "battery"]).await;
    let storage = run_or_empty(&serial, &["shell", "df", "-k", "/data"]).await;
    let features = run_or_empty(&serial, &["shell", "pm", "list", "features"]).await;
    let wm_size = run_or_empty(&serial, &["shell", "wm", "size"]).await;
    let wm_density = run_or_empty(&serial, &["shell", "wm", "density"]).await;
    let display = run_or_empty(&serial, &["shell", "dumpsys", "display"]).await;
    let mut dark_mode = run_or_empty(&serial, &["shell", "cmd", "uimode", "night"]).await;
    if dark_mode.trim().is_empty() {
        dark_mode = run_or_empty(
            &serial,
            &["shell", "settings", "get", "secure", "ui_night_mode"],
        )
        .await;
    }
    let screen_timeout = run_or_empty(
        &serial,
        &["shell", "settings", "get", "system", "screen_off_timeout"],
    )
    .await;

    Ok(device_parser::build_device_details(
        &device,
        &getprop,
        &meminfo,
        &battery,
        &storage,
        &features,
        &wm_size,
        &wm_density,
        &display,
        &dark_mode,
        &screen_timeout,
    ))
}

/// Helper to run an ADB command and return empty string on failure.
async fn run_or_empty(serial: &str, args: &[&str]) -> String {
    match adb::run_adb_for_serial(serial, args).await {
        Ok(result) if result.ok() => result.output,
        _ => String::new(),
    }
}
