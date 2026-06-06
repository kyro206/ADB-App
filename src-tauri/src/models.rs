use serde::{Deserialize, Serialize};

/// A connected ADB device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub serial: String,
    pub state: String,
    pub product: String,
    pub model: String,
    pub device: String,
    pub transport_id: String,
}

/// Detailed information about a device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDetails {
    pub serial: String,
    pub state: String,
    pub manufacturer: String,
    pub brand: String,
    pub model: String,
    pub marketing_name: String,
    pub codename: String,
    pub product_name: String,
    pub android_version: String,
    pub api_level: String,
    pub soc: String,
    pub architecture: String,
    pub device_type: String,
    pub physical_width: i32,
    pub physical_height: i32,
    pub current_width: i32,
    pub current_height: i32,
    pub physical_density: i32,
    pub current_density: i32,
    pub smallest_width_dp: i32,
    pub refresh_rate_hz: f64,
    pub supported_refresh_rates_hz: Vec<f64>,
    pub total_ram_mb: i64,
    pub used_ram_mb: i64,
    pub battery_level_percent: i32,
    pub total_storage_mb: i64,
    pub used_storage_mb: i64,
    pub dark_mode_enabled: bool,
    pub screen_off_timeout_ms: i32,
}

impl DeviceDetails {
    pub fn has_ram_info(&self) -> bool {
        self.total_ram_mb > 0
    }

    pub fn ram_usage_percent(&self) -> i32 {
        if !self.has_ram_info() {
            return 0;
        }
        ((self.used_ram_mb as f64 * 100.0) / self.total_ram_mb as f64)
            .round()
            .max(0.0)
            .min(100.0) as i32
    }

    pub fn has_storage_info(&self) -> bool {
        self.total_storage_mb > 0
    }

    pub fn storage_usage_percent(&self) -> i32 {
        if !self.has_storage_info() {
            return 0;
        }
        ((self.used_storage_mb as f64 * 100.0) / self.total_storage_mb as f64)
            .round()
            .max(0.0)
            .min(100.0) as i32
    }

    pub fn has_battery_info(&self) -> bool {
        self.battery_level_percent >= 0
    }

    pub fn battery_label(&self) -> String {
        if self.has_battery_info() {
            format!("{}%", self.battery_level_percent)
        } else {
            "-".to_string()
        }
    }
}

/// ADB tool info (version, path, capabilities).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbToolInfo {
    pub version: String,
    pub location: String,
    pub pair_supported: bool,
    pub mdns_supported: bool,
}

/// Installed application on a device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub package_name: String,
    pub display_name: String,
    pub apk_path: String,
    pub storage_bytes: i64,
    pub system_app: bool,
    pub disabled: bool,
    pub storage_label: String,
}

/// Detailed information about an installed application.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDetails {
    pub package_name: String,
    pub display_name: String,
    pub version_name: String,
    pub version_code: String,
    pub target_sdk: String,
    pub min_sdk: String,
    pub installer: String,
    pub data_dir: String,
    pub apk_path: String,
    pub code_size_bytes: i64,
    pub data_size_bytes: i64,
    pub cache_size_bytes: i64,
    pub system_app: bool,
    pub disabled: bool,
    pub permissions: Vec<AppPermission>,
}

/// A single permission for an app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPermission {
    pub name: String,
    pub granted: bool,
    pub is_runtime: bool,
}

/// A file entry in the device file system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceFileEntry {
    pub name: String,
    pub permissions: String,
    pub size: i64,
    pub modified: String,
    pub is_directory: bool,
    pub is_link: bool,
}

/// Directory listing result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDirectoryListing {
    pub path: String,
    pub entries: Vec<DeviceFileEntry>,
    pub parent_path: Option<String>,
}

/// Control state (brightness, volume, sound mode, rotation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlState {
    pub brightness: i32,
    pub max_brightness: i32,
    pub volume: i32,
    pub max_volume: i32,
    pub sound_mode: String,
    pub rotation_mode: String,
}

/// System state (users, keyboards, settings).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemState {
    pub users: Vec<AndroidUser>,
    pub current_user_id: i32,
    pub gestural_navigation: bool,
    pub app_languages_enabled: bool,
    pub keyboards: Vec<KeyboardInputMethod>,
    pub current_keyboard_id: String,
}

/// An Android user account.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AndroidUser {
    pub id: i32,
    pub name: String,
    pub is_running: bool,
}

/// A keyboard input method.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardInputMethod {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    pub is_default: bool,
}

/// User configuration for app settings persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfig {
    pub theme: String,
    pub language: String,
    pub auto_refresh_on_focus: bool,
    pub use_custom_adb_path: bool,
    pub custom_adb_path: String,
}

impl Default for UserConfig {
    fn default() -> Self {
        UserConfig {
            theme: "dark".to_string(),
            language: "en".to_string(),
            auto_refresh_on_focus: false,
            use_custom_adb_path: false,
            custom_adb_path: String::new(),
        }
    }
}
