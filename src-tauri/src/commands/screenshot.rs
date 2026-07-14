use base64::{engine::general_purpose::STANDARD, Engine};

use crate::adb;

async fn capture_screenshot_bytes(serial: &str) -> Result<Vec<u8>, String> {
    if crate::mock::enabled() {
        return STANDARD
            .decode(crate::mock::wallpaper_base64()?)
            .map_err(|e| format!("Mock decode error: {}", e));
    }

    let (exit_code, bytes) =
        adb::run_adb_binary_for_serial(serial, &["exec-out", "screencap", "-p"]).await?;

    if exit_code != 0 || bytes.is_empty() {
        return Err("Failed to capture screenshot".to_string());
    }

    // Verify it's a valid PNG (starts with PNG header)
    if bytes.len() < 8 || &bytes[0..4] != b"\x89PNG" {
        return Err("Invalid screenshot data received".to_string());
    }

    Ok(bytes)
}

/// Capture a screenshot from the device and return it as base64 PNG.
#[tauri::command]
pub async fn capture_screenshot(serial: String) -> Result<String, String> {
    let bytes = capture_screenshot_bytes(&serial).await?;
    Ok(STANDARD.encode(&bytes))
}

fn decode_and_verify_image(base64: &str) -> Result<Vec<u8>, String> {
    let bytes = STANDARD
        .decode(base64)
        .map_err(|error| format!("Invalid screenshot data: {error}"))?;

    let is_png = bytes.len() >= 4 && &bytes[0..4] == b"\x89PNG";
    let is_jpeg = bytes.len() >= 3 && &bytes[0..3] == b"\xFF\xD8\xFF";

    if bytes.len() < 8 || (!is_png && !is_jpeg) {
        return Err("Invalid screenshot data received".to_string());
    }

    Ok(bytes)
}

async fn save_bytes_to_auto_folder(app: &tauri::AppHandle, device_name: &str, file_name_base: &str, bytes: &[u8]) -> Result<String, String> {
    use tauri::Manager;
    let pictures_dir = app
        .path()
        .picture_dir()
        .map_err(|e| format!("Could not find pictures directory: {}", e))?;

    let sanitized_device_name = device_name.replace(|c: char| {
        matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\x00'..='\x1F')
    }, "_");

    let device_folder = pictures_dir.join("ADB App").join(sanitized_device_name);

    tokio::fs::create_dir_all(&device_folder)
        .await
        .map_err(|e| format!("Could not create directory: {}", e))?;
    
    // Determine extension based on magic bytes
    let ext = if bytes.len() >= 3 && &bytes[0..3] == b"\xFF\xD8\xFF" { "jpg" } else { "png" };
    let file_name = format!("{}.{}", file_name_base, ext);
    let path = device_folder.join(file_name);

    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| format!("Could not save screenshot: {error}"))?;

    Ok(path.to_string_lossy().into_owned())
}

/// Save a previously captured base64 PNG to a path chosen by the user.
#[tauri::command]
pub async fn save_screenshot(path: String, png_base64: String) -> Result<String, String> {
    let bytes = decode_and_verify_image(&png_base64)?;

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
    file_name_base: String,
    png_base64: String,
) -> Result<String, String> {
    let bytes = decode_and_verify_image(&png_base64)?;
    save_bytes_to_auto_folder(&app, &device_name, &file_name_base, &bytes).await
}

#[derive(serde::Serialize)]
pub struct ScreenshotResult {
    pub base64: String,
    pub saved_path: Option<String>,
    pub save_error: Option<String>,
}

#[tauri::command]
pub async fn capture_and_save_screenshot_auto(
    app: tauri::AppHandle,
    serial: String,
    device_name: String,
    file_name_base: String,
) -> Result<ScreenshotResult, String> {
    let bytes = capture_screenshot_bytes(&serial).await?;
    let base64 = STANDARD.encode(&bytes);

    let save_attempt: Result<String, String> = async {
        save_bytes_to_auto_folder(&app, &device_name, &file_name_base, &bytes).await
    }
    .await;

    match save_attempt {
        Ok(path) => Ok(ScreenshotResult {
            base64,
            saved_path: Some(path),
            save_error: None,
        }),
        Err(err) => Ok(ScreenshotResult {
            base64,
            saved_path: None,
            save_error: Some(err),
        }),
    }
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
