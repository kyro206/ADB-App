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

/// Save a previously captured base64 PNG to a path chosen by the user.
#[tauri::command]
pub async fn save_screenshot(path: String, png_base64: String) -> Result<String, String> {
    let bytes = STANDARD
        .decode(png_base64)
        .map_err(|error| format!("Invalid screenshot data: {error}"))?;

    let is_png = &bytes[0..4] == b"\x89PNG";
    let is_jpeg = &bytes[0..3] == b"\xFF\xD8\xFF";

    if bytes.len() < 8 || (!is_png && !is_jpeg) {
        return Err("Invalid screenshot data received".to_string());
    }

    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| format!("Could not save screenshot: {error}"))?;

    Ok(path)
}
