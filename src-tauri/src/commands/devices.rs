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
pub async fn get_device_details(device: Device) -> Result<DeviceDetails, String> {
    let serial = device.serial.clone();

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
            uptime_seconds: -1.0,
        });
    }

    // Run all info queries concurrently for maximum speed
    let (
        getprop,
        proc_meminfo,
        battery,
        storage,
        features,
        wm_size,
        wm_density,
        display,
        mut dark_mode,
        screen_timeout,
        uptime,
    ) = tokio::join!(
        run_or_empty(&serial, &["shell", "getprop"]),
        run_or_empty(&serial, &["shell", "cat", "/proc/meminfo"]),
        run_or_empty(&serial, &["shell", "dumpsys", "battery"]),
        run_or_empty(&serial, &["shell", "df", "-k", "/data"]),
        run_or_empty(&serial, &["shell", "pm", "list", "features"]),
        run_or_empty(&serial, &["shell", "wm", "size"]),
        run_or_empty(&serial, &["shell", "wm", "density"]),
        run_or_empty(&serial, &["shell", "dumpsys", "display"]),
        run_or_empty(&serial, &["shell", "cmd", "uimode", "night"]),
        run_or_empty(&serial, &["shell", "settings", "get", "system", "screen_off_timeout"]),
        run_or_empty(&serial, &["shell", "cat", "/proc/uptime"])
    );

    let meminfo = proc_meminfo;

    if dark_mode.trim().is_empty() {
        dark_mode = run_or_empty(
            &serial,
            &["shell", "settings", "get", "secure", "ui_night_mode"],
        )
        .await;
    }

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
        &uptime,
    ))
}

/// Helper to run an ADB command and return empty string on failure.
async fn run_or_empty(serial: &str, args: &[&str]) -> String {
    match adb::run_adb_for_serial(serial, args).await {
        Ok(result) if result.ok() => result.output,
        _ => String::new(),
    }
}
