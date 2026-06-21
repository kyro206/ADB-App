use crate::adb;
use crate::models::{Device, DeviceDetails};
use crate::parsers::device_parser;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

static DEVICE_DETAILS_CACHE: OnceLock<Mutex<HashMap<String, (Instant, DeviceDetails)>>> =
    OnceLock::new();

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

    let cache = DEVICE_DETAILS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(cache) = cache.lock() {
        if let Some((created_at, details)) = cache.get(&serial) {
            if created_at.elapsed() < Duration::from_secs(6) {
                return Ok(details.clone());
            }
        }
    }

    let script = "\
        getprop; echo '---ADBAPPSEP---'; \
        cat /proc/meminfo; echo '---ADBAPPSEP---'; \
        dumpsys battery; echo '---ADBAPPSEP---'; \
        df -k /data; echo '---ADBAPPSEP---'; \
        pm list features; echo '---ADBAPPSEP---'; \
        wm size; echo '---ADBAPPSEP---'; \
        wm density; echo '---ADBAPPSEP---'; \
        dumpsys display; echo '---ADBAPPSEP---'; \
        cmd uimode night 2>/dev/null; echo '---ADBAPPSEP---'; \
        settings get secure ui_night_mode 2>/dev/null; echo '---ADBAPPSEP---'; \
        settings get system screen_off_timeout 2>/dev/null; echo '---ADBAPPSEP---'; \
        cat /proc/uptime\
    ";

    let result = run_or_empty(&serial, &["shell", script]).await;
    let mut parts = result.split("---ADBAPPSEP---");

    let getprop = parts.next().unwrap_or("").trim();
    let meminfo = parts.next().unwrap_or("").trim();
    let battery = parts.next().unwrap_or("").trim();
    let storage = parts.next().unwrap_or("").trim();
    let features = parts.next().unwrap_or("").trim();
    let wm_size = parts.next().unwrap_or("").trim();
    let wm_density = parts.next().unwrap_or("").trim();
    let display = parts.next().unwrap_or("").trim();
    let uimode = parts.next().unwrap_or("").trim();
    let secure_uimode = parts.next().unwrap_or("").trim();
    let screen_timeout = parts.next().unwrap_or("").trim();
    let uptime = parts.next().unwrap_or("").trim();

    let mut dark_mode = uimode.to_string();
    if dark_mode.is_empty() {
        dark_mode = secure_uimode.to_string();
    }

    let details = device_parser::build_device_details(
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
    );

    if let Ok(mut cache) = cache.lock() {
        cache.insert(serial, (Instant::now(), details.clone()));
    }

    Ok(details)
}

/// Helper to run an ADB command and return empty string on failure.
async fn run_or_empty(serial: &str, args: &[&str]) -> String {
    match adb::run_adb_for_serial(serial, args).await {
        Ok(result) if result.ok() => result.output,
        _ => String::new(),
    }
}
