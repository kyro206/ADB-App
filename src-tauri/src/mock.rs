use crate::commands::operations::{HomeDetails, MediaVolumeState};
use crate::models::{AndroidUser, Device, DeviceDetails, KeyboardInputMethod, SystemState};
use crate::tools::{ToolStatus, ToolsSnapshot, ToolsStatus};

pub fn enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        std::env::var_os("ADB_APP_MOCK").is_some()
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

pub fn device() -> Device {
    Device {
        serial: "0A4312B01795714827".to_string(),
        state: "device".to_string(),
        product: "frankel".to_string(),
        model: "Pixel 10".to_string(),
        device: "frankel".to_string(),
        transport_id: "mock".to_string(),
    }
}

pub fn device_details() -> DeviceDetails {
    let device = device();
    DeviceDetails {
        serial: device.serial,
        state: "device".to_string(),
        manufacturer: "Google".to_string(),
        brand: "google".to_string(),
        model: "Pixel 10".to_string(),
        marketing_name: "Google Pixel 10".to_string(),
        codename: "frankel".to_string(),
        product_name: "frankel".to_string(),
        android_version: "17".to_string(),
        api_level: "37".to_string(),
        soc: "Google Tensor G5".to_string(),
        architecture: "arm64-v8a".to_string(),
        device_type: "phone".to_string(),
        physical_width: 1080,
        physical_height: 2424,
        current_width: 1080,
        current_height: 2424,
        physical_density: 420,
        current_density: 420,
        smallest_width_dp: 411,
        refresh_rate_hz: 120.0,
        supported_refresh_rates_hz: vec![60.0, 90.0, 120.0],
        total_ram_mb: 12186,
        used_ram_mb: 4301,
        battery_level_percent: 100,
        battery_health: "97%".to_string(),
        total_storage_mb: 126566,
        used_storage_mb: 110899,
        dark_mode_enabled: true,
        screen_off_timeout_ms: 30000,
        uptime_seconds: 826320.0,
        window_animation_scale: 1.0,
        transition_animation_scale: 1.0,
        animator_duration_scale: 1.0,
        font_scale: 1.0,
    }
}

pub fn wallpaper_base64() -> Result<String, String> {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Could not resolve app directory".to_string())?
        .join("public")
        .join("mock.jpg");
    std::fs::read(path)
        .map(|bytes| base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes))
        .map_err(|error| error.to_string())
}

pub fn home_details() -> HomeDetails {
    HomeDetails {
        device_name: "Kyro's Pixel".to_string(),
        airplane_mode: false,
        carrier: "Google Fi".to_string(),
    }
}

pub fn media_volume() -> MediaVolumeState {
    MediaVolumeState {
        level: 18,
        maximum: 25,
    }
}

pub fn system_state() -> SystemState {
    let swiftkey = "com.touchtype.swiftkey/com.touchtype.KeyboardService".to_string();
    SystemState {
        users: vec![AndroidUser {
            id: 0,
            name: "Kyro".to_string(),
            is_running: true,
        }],
        current_user_id: 0,
        gestural_navigation: true,
        app_languages_enabled: true,
        captive_portal_mode: Some("1".to_string()),
        keyboards: vec![
            KeyboardInputMethod {
                id: swiftkey.clone(),
                label: "Microsoft SwiftKey".to_string(),
                enabled: true,
                is_default: true,
            },
            KeyboardInputMethod {
                id: "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME"
                    .to_string(),
                label: "Gboard".to_string(),
                enabled: true,
                is_default: false,
            },
        ],
        current_keyboard_id: swiftkey,
    }
}

pub fn tools_snapshot() -> ToolsSnapshot {
    ToolsSnapshot {
        tools: ToolsStatus {
            adb: tool("ADB", "37.0.0", "37.0.0", "C:\\Android\\platform-tools\\adb.exe", true),
            scrcpy: tool("scrcpy", "4.0", "4.0", "C:\\Android\\scrcpy\\scrcpy.exe", true),
            java: tool(
                "Java",
                "25.0.3",
                "",
                "C:\\Program Files\\Java\\bin\\java.exe",
                false,
            ),
        },
        checking_updates: false,
    }
}

fn tool(name: &str, version: &str, latest: &str, path: &str, install_supported: bool) -> ToolStatus {
    ToolStatus {
        name: name.to_string(),
        available: true,
        version: version.to_string(),
        latest_version: latest.to_string(),
        update_checked: !latest.is_empty(),
        update_available: false,
        path: path.to_string(),
        source: "mock".to_string(),
        install_supported,
    }
}
