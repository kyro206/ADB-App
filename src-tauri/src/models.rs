use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub message: String,
}

impl From<String> for AppError {
    fn from(error: String) -> Self {
        Self { message: error }
    }
}

impl From<&str> for AppError {
    fn from(error: &str) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.message
    }
}

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
    pub battery_health: String,
    pub total_storage_mb: i64,
    pub used_storage_mb: i64,
    pub dark_mode_enabled: bool,
    pub screen_off_timeout_ms: i32,
    pub uptime_seconds: f64,
}

/// System state (users, keyboards, settings).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemState {
    pub users: Vec<AndroidUser>,
    pub current_user_id: i32,
    pub gestural_navigation: bool,
    pub app_languages_enabled: bool,
    pub captive_portal_mode: Option<String>,
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
