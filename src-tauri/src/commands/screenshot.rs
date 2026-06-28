use base64::{engine::general_purpose::STANDARD, Engine};

use crate::adb;

/// Capture a screenshot from the device and return it as base64 PNG.
#[tauri::command]
pub async fn capture_screenshot(serial: String) -> Result<String, String> {
    if crate::mock::enabled() {
        return crate::mock::wallpaper_base64();
    }

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

/// Save a captured screenshot automatically to the Pictures/ADB App/DeviceName folder
#[tauri::command]
pub async fn save_screenshot_auto(
    app: tauri::AppHandle,
    device_name: String,
    png_base64: String,
) -> Result<String, String> {
    use tauri::Manager;

    let bytes = STANDARD
        .decode(png_base64)
        .map_err(|error| format!("Invalid screenshot data: {error}"))?;

    let is_png = &bytes[0..4] == b"\x89PNG";
    let is_jpeg = &bytes[0..3] == b"\xFF\xD8\xFF";

    if bytes.len() < 8 || (!is_png && !is_jpeg) {
        return Err("Invalid screenshot data received".to_string());
    }

    let pictures_dir = app
        .path()
        .picture_dir()
        .map_err(|e| format!("Could not find pictures directory: {}", e))?;

    // Sanitize device name for safe folder creation
    let sanitized_device_name = device_name.replace(|c: char| {
        c == '<' || c == '>' || c == ':' || c == '"' || c == '/' || c == '\\' || c == '|' || c == '?' || c == '*' || c < '\x20'
    }, "_");

    let device_folder = pictures_dir.join("ADB App").join(sanitized_device_name);

    tokio::fs::create_dir_all(&device_folder)
        .await
        .map_err(|e| format!("Could not create directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_name = format!("{}.png", timestamp);
    let path = device_folder.join(file_name);

    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| format!("Could not save screenshot: {error}"))?;

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn delete_screenshot_auto(path: String) -> Result<(), String> {
    tokio::fs::remove_file(&path)
        .await
        .map_err(|error| format!("Could not delete screenshot: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn open_screenshot_auto(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|error| format!("Could not open screenshot: {error}"))
}
