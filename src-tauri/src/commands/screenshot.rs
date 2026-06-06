use base64::{engine::general_purpose::STANDARD, Engine};

use crate::adb;

/// Capture a screenshot from the device and return it as base64 PNG.
#[tauri::command]
pub async fn capture_screenshot(serial: String) -> Result<String, String> {
    let (exit_code, bytes) =
        adb::run_adb_binary_for_serial(&serial, &["exec-out", "screencap", "-p"]).await?;

    if exit_code != 0 || bytes.is_empty() {
        return Err("Failed to capture screenshot".to_string());
    }

    // Verify it's a valid PNG (starts with PNG header)
    if bytes.len() < 8 || &bytes[0..4] != b"\x89PNG" {
        return Err("Invalid screenshot data received".to_string());
    }

    Ok(STANDARD.encode(&bytes))
}
