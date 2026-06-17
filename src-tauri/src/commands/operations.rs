use std::collections::HashSet;
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine};
use qrcode::{render::svg, QrCode};
use rand::{distr::Alphanumeric, Rng};
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::adb;
use crate::models::{AndroidUser, KeyboardInputMethod, SystemState};
use crate::tools::{self, ToolsStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSummary {
    pub package_name: String,
    pub display_name: String,
    pub apk_path: String,
    pub system_app: bool,
    pub disabled: bool,
    pub icon_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedAppPresentation {
    display_name: String,
    icon_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPermissionInfo {
    pub name: String,
    pub granted: bool,
    pub runtime: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDetailsInfo {
    pub package_name: String,
    pub display_name: String,
    pub apk_path: String,
    pub is_split: bool,
    pub system_app: bool,
    pub disabled: bool,
    pub version_name: String,
    pub version_code: String,
    pub target_sdk: String,
    pub min_sdk: String,
    pub installer: String,
    pub data_dir: String,
    pub code_size_bytes: i64,
    pub data_size_bytes: i64,
    pub cache_size_bytes: i64,
    pub background_mode: String,
    pub permissions: Vec<AppPermissionInfo>,
    pub icon_data_url: String,
    pub install_date: String,
    pub update_date: String,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub permissions: String,
    pub size: i64,
    pub modified: String,
    pub is_directory: bool,
    pub is_link: bool,
    pub link_target: String,
}

#[derive(Debug, Serialize)]
pub struct MediaVolumeState {
    pub level: i32,
    pub maximum: i32,
}

#[derive(Debug, Serialize)]
pub struct WirelessQrPayload {
    pub service_name: String,
    pub password: String,
    pub qr_data_url: String,
}

#[derive(Debug, Deserialize)]
pub struct AppInstallOptions {
    pub replace_existing: bool,
    pub grant_runtime_permissions: bool,
    pub allow_test_packages: bool,
    pub bypass_low_target_sdk_block: bool,
}

fn refs(values: &[String]) -> Vec<&str> {
    values.iter().map(String::as_str).collect()
}

fn last_integer(value: &str) -> Option<i32> {
    value
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<i32>().ok())
        .last()
}

fn package_set(output: &str) -> HashSet<String> {
    output
        .lines()
        .filter_map(|line| line.trim().strip_prefix("package:"))
        .map(|value| value.rsplit_once('=').map_or(value, |(_, package)| package))
        .map(str::trim)
        .map(str::to_string)
        .collect()
}

fn settings_path() -> PathBuf {
    crate::app_paths::config_dir().join("settings.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub cache_enabled: bool,
    pub cache_path: String,
    pub kill_adb_on_exit: bool,
    pub material_you_enabled: bool,
    pub material_you_background_tint: bool,
    pub theme: String,
    pub language: String,
    pub adb_path: String,
    pub scrcpy_path: String,
    pub java_path: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            cache_enabled: false,
            cache_path: String::new(),
            kill_adb_on_exit: true,
            material_you_enabled: true,
            material_you_background_tint: true,
            theme: String::new(),
            language: String::new(),
            adb_path: String::new(),
            scrcpy_path: String::new(),
            java_path: String::new(),
        }
    }
}

pub fn read_settings() -> AppSettings {
    let mut settings: AppSettings = fs::read_to_string(settings_path())
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();

    if !settings.cache_path.trim().is_empty() {
        let path = std::path::Path::new(&settings.cache_path);
        if !path.exists() {
            settings.cache_path = String::new();
            if let Ok(serialized) = serde_json::to_string_pretty(&settings) {
                let _ = fs::create_dir_all(crate::app_paths::config_dir());
                let _ = fs::write(settings_path(), serialized);
            }
        }
    }

    settings
}

#[tauri::command]
pub fn get_app_settings() -> AppSettings {
    read_settings()
}

pub fn write_settings_sync(settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(crate::app_paths::config_dir()).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(settings_path(), serialized).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<Option<String>, String> {
    let old_settings = read_settings();
    let old_data_dir = crate::app_paths::data_dir();

    write_settings_sync(&settings)?;

    let path_changed = old_settings.cache_path != settings.cache_path;

    if path_changed {
        let _ = crate::adb::run_adb(&["kill-server"]).await;
        #[cfg(windows)]
        let _ = crate::process::command("taskkill").args(["/F", "/IM", "scrcpy.exe"]).output();
        #[cfg(not(windows))]
        let _ = crate::process::command("killall").arg("scrcpy").output();

        crate::app_paths::update_base_path(
            if !settings.cache_path.trim().is_empty() {
                Some(&settings.cache_path)
            } else {
                None
            }
        );

        let new_data_dir = crate::app_paths::data_dir();

        if old_data_dir != new_data_dir && old_data_dir.exists() {
            fs::create_dir_all(&new_data_dir).map_err(|e| e.to_string())?;
            if let Err(e) = move_directory_contents(&old_data_dir, &new_data_dir) {
                eprintln!("Error moving directory: {}", e);
            }
        }
        
        return Ok(Some(old_data_dir.to_string_lossy().into_owned()));
    }

    Ok(None)
}

#[tauri::command]
pub async fn get_device_wallpaper(serial: String) -> Result<String, String> {
    if WALLPAPER_DAEMON_BYTES.is_empty() {
        return Err("Wallpaper Extractor JAR is not compiled yet.".to_string());
    }

    let java_tools_dir = crate::app_paths::cache_dir().join("tools").join("java");
    if !java_tools_dir.exists() {
        let _ = fs::create_dir_all(&java_tools_dir);
    }
    
    let daemon_local_path = java_tools_dir.join("wallpaper_extractor.jar");
    let daemon_device_path = "/data/local/tmp/wallpaper_extractor.jar";

    // Escribimos temporalmente en el PC porque `adb shell cat` corrompe binarios en Windows
    fs::write(&daemon_local_path, WALLPAPER_DAEMON_BYTES).map_err(|e| e.to_string())?;

    // Comprobamos si el JAR ya está en el móvil y si el tamaño coincide para ahorrar escrituras
    let check_daemon = adb::run_adb_for_serial(&serial, &["shell", "ls", "-l", daemon_device_path]).await?;
    let needs_push = if check_daemon.ok() && !check_daemon.output.contains("No such file") {
        let size_str = check_daemon.output.split_whitespace().nth(4).unwrap_or("");
        size_str.parse::<usize>().unwrap_or(0) != WALLPAPER_DAEMON_BYTES.len()
    } else {
        true
    };

    if needs_push {
        adb::run_adb_for_serial(&serial, &["shell", "mkdir", "-p", "/data/local/tmp/tools/java"]).await?;
        adb::run_adb_for_serial(&serial, &["push", &daemon_local_path.to_string_lossy(), daemon_device_path]).await?;
        adb::run_adb_for_serial(&serial, &["shell", "chmod", "777", daemon_device_path]).await?;
    }

    // Ejecutar el jar
    let result = adb::run_adb_for_serial(
        &serial,
        &[
            "shell",
            &format!("CLASSPATH={} app_process / com.kyro.adbapp.extractwallpaper.WallpaperExtractor", daemon_device_path)
        ]
    ).await?;

    if !result.ok() {
        return Err(format!("Failed to extract wallpaper: {}", result.output));
    }

    let output = result.output;
    if let (Some(start_idx), Some(end_idx)) = (output.find("WALLPAPER_START"), output.find("WALLPAPER_END")) {
        let base64 = output[start_idx + 15..end_idx].replace("\r", "").replace("\n", "").replace(" ", "");
        if !base64.is_empty() {
            return Ok(base64);
        }
    }

    Err("Extractor did not return encoded image.".to_string())
}

#[tauri::command]
pub fn set_window_theme(window: tauri::Window, theme: String) {
    let tauri_theme = match theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    let _ = window.set_theme(tauri_theme);
}

#[tauri::command]
pub async fn close_app(app: tauri::AppHandle, old_data_dir: String) -> Result<(), String> {
    let old_dir_path = std::path::PathBuf::from(old_data_dir);
    use tauri::Manager;
    for (_, window) in app.webview_windows() {
        let _ = window.close();
    }

    for _ in 0..20 {
        if !old_dir_path.exists() || std::fs::remove_dir_all(&old_dir_path).is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    app.exit(0);
    Ok(())
}

fn move_directory_contents(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() { return Ok(()); }
    let mut stack = vec![(src.to_path_buf(), dst.to_path_buf())];
    while let Some((s, d)) = stack.pop() {
        if !d.exists() {
            fs::create_dir_all(&d).map_err(|e| format!("Failed to create dir {}: {}", d.display(), e))?;
        }
        for entry in fs::read_dir(&s).map_err(|e| format!("Failed to read dir {}: {}", s.display(), e))? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_type = entry.file_type().map_err(|e| e.to_string())?;
            let target = d.join(entry.file_name());
            if file_type.is_dir() {
                stack.push((entry.path(), target));
            } else {
                let _ = fs::copy(entry.path(), &target);
            }
        }
    }
    let _ = fs::remove_dir_all(src);
    Ok(())
}

fn application_cache_dir() -> PathBuf {
    crate::app_paths::cache_dir().join("app-icons")
}

#[tauri::command]
pub fn get_default_cache_dir() -> String {
    crate::app_paths::default_data_dir().to_string_lossy().to_string()
}

fn app_summary_cache_path(package_name: &str, apk_path: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    package_name.hash(&mut hasher);
    apk_path.hash(&mut hasher);
    application_cache_dir().join(format!("{:x}.json", hasher.finish()))
}

fn install_working_dir() -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let path = crate::app_paths::cache_dir()
        .join("installs")
        .join(nonce.to_string());
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn run_local_command(program: &Path, args: &[String]) -> Result<String, String> {
    let output = crate::process::command(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Couldn't run {}: {error}", program.display()))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}").trim().to_string();
    if output.status.success() {
        Ok(combined)
    } else {
        Err(if combined.is_empty() {
            format!("{} finished with error", program.display())
        } else {
            combined
        })
    }
}

fn bundletool_jar() -> Result<PathBuf, String> {
    crate::dependencies::ensure_bundletool()
}

fn modern_java_path() -> Result<PathBuf, String> {
    let java = tools::resolve_tool_path("java").ok_or_else(|| {
        "Java is not configured. Set its path in Settings. It is recommended to install the latest LTS version of Temurin from https://adoptium.net/temurin/releases".to_string()
    })?;
    let output = run_local_command(&java, &["-version".into()])?;
    let version = Regex::new(r#"version "(\d+)(?:\.(\d+))?"#)
        .ok()
        .and_then(|regex| regex.captures(&output))
        .and_then(|capture| {
            let first = capture.get(1)?.as_str().parse::<i32>().ok()?;
            let major = if first == 1 {
                capture.get(2)?.as_str().parse::<i32>().ok()?
            } else {
                first
            };
            Some(major)
        })
        .unwrap_or(0);
    if version < 11 {
        Err(format!(
            "Java {version} is not compatible with bundletool. Configure Java 11 or higher in Settings; the latest LTS version of Temurin is recommended."
        ))
    } else {
        Ok(java)
    }
}

fn collect_apks(directory: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(path: &Path, result: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                visit(&path, result)?;
            } else if path
                .extension()
                .is_some_and(|value| value.to_string_lossy().eq_ignore_ascii_case("apk"))
            {
                result.push(path);
            }
        }
        Ok(())
    }
    let mut result = Vec::new();
    visit(directory, &mut result)?;
    result.sort();
    Ok(result)
}

fn resolve_install_files(
    serial: &str,
    package_file: &Path,
    working_directory: &Path,
) -> Result<Vec<PathBuf>, String> {
    let extension = package_file
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    
    if extension == "apk" {
        return Ok(vec![package_file.to_path_buf()]);
    }

    let extraction_directory = working_directory.join(
        package_file
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .replace(|character: char| !character.is_ascii_alphanumeric(), "_"),
    );
    fs::create_dir_all(&extraction_directory).map_err(|error| error.to_string())?;

    // Evaluamos si Java y Bundletool están disponibles (y lo hacemos solo una vez)
    let (java_path, jar_path) = match (modern_java_path(), bundletool_jar()) {
        (Ok(java), Ok(jar)) => (Some(java), Some(jar)),
        _ => (None, None),
    };
    let bundletool_available = java_path.is_some() && jar_path.is_some();

    if extension == "aab" {
        if !bundletool_available {
            return Err("To install .aab files, you need to configure Java 11+ in Settings and have Bundletool downloaded.".to_string());
        }
        let java = java_path.unwrap();
        let jar = jar_path.unwrap();
        let adb_path = tools::resolve_tool_path("adb").ok_or_else(|| "ADB is not available".to_string())?;
        let device_spec = working_directory.join("device-spec.json");
        
        run_local_command(
            &java,
            &[
                "-jar".into(),
                jar.to_string_lossy().into_owned(),
                "get-device-spec".into(),
                format!("--output={}", device_spec.display()),
                format!("--adb={}", adb_path.display()),
                format!("--device-id={serial}"),
            ],
        )?;

        let apks_archive = working_directory.join("device.apks");
        run_local_command(
            &java,
            &[
                "-jar".into(),
                jar.to_string_lossy().into_owned(),
                "build-apks".into(),
                format!("--bundle={}", package_file.display()),
                format!("--output={}", apks_archive.display()),
                format!("--device-spec={}", device_spec.display()),
                "--overwrite".into(),
            ],
        )?;

        run_local_command(
            &java,
            &[
                "-jar".into(),
                jar.to_string_lossy().into_owned(),
                "extract-apks".into(),
                format!("--apks={}", apks_archive.display()),
                format!("--output-dir={}", extraction_directory.display()),
                format!("--device-spec={}", device_spec.display()),
            ],
        )?;

        let apks = collect_apks(&extraction_directory)?;
        if apks.is_empty() {
            return Err(format!("No compatible APKs found in {}", package_file.display()));
        }
        return Ok(apks);

    } else if extension == "apks" && bundletool_available {
        // Vía original para .apks si Java/Bundletool están instalados
        let java = java_path.unwrap();
        let jar = jar_path.unwrap();
        let adb_path = tools::resolve_tool_path("adb").ok_or_else(|| "ADB is not available".to_string())?;
        let device_spec = working_directory.join("device-spec.json");
        
        run_local_command(
            &java,
            &[
                "-jar".into(),
                jar.to_string_lossy().into_owned(),
                "get-device-spec".into(),
                format!("--output={}", device_spec.display()),
                format!("--adb={}", adb_path.display()),
                format!("--device-id={serial}"),
            ],
        )?;
        
        run_local_command(
            &java,
            &[
                "-jar".into(),
                jar.to_string_lossy().into_owned(),
                "extract-apks".into(),
                format!("--apks={}", package_file.display()),
                format!("--output-dir={}", extraction_directory.display()),
                format!("--device-spec={}", device_spec.display()),
            ],
        )?;

        let apks = collect_apks(&extraction_directory)?;
        if apks.is_empty() {
            return Err(format!("No compatible APKs found in {}", package_file.display()));
        }
        return Ok(apks);

    } else if matches!(extension.as_str(), "apks" | "apkm" | "xapk" | "zip") {
        // Extracción manual nativa y filtrado inteligente sin Java
        run_local_command(
            Path::new("tar"),
            &[
                "-xf".into(),
                package_file.to_string_lossy().into_owned(),
                "-C".into(),
                extraction_directory.to_string_lossy().into_owned(),
            ],
        )?;

        let adb_path = tools::resolve_tool_path("adb").ok_or_else(|| "ADB is not available".to_string())?;
        
        // 1. Obtener la arquitectura del dispositivo conectado
        let abi_output = run_local_command(
            &adb_path, 
            &["-s".into(), serial.to_string(), "shell".into(), "getprop".into(), "ro.product.cpu.abilist".into()]
        ).unwrap_or_default();
        
        let mut supported_abis: Vec<String> = abi_output
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        
        // Dispositivos viejos (Android 4.4/5.0) pueden no tener abilist, usamos abi como respaldo
        if supported_abis.is_empty() {
            let fallback_abi = run_local_command(
                &adb_path, 
                &["-s".into(), serial.to_string(), "shell".into(), "getprop".into(), "ro.product.cpu.abi".into()]
            ).unwrap_or_default();
            if !fallback_abi.trim().is_empty() {
                supported_abis.push(fallback_abi.trim().to_lowercase());
            }
        }

        let known_abi_markers = ["arm64_v8a", "armeabi_v7a", "armeabi", "x86_64", "x86", "mips"];
        let all_apks = collect_apks(&extraction_directory)?;
        let mut filtered_apks = Vec::new();

        // 2. Filtrar los APKs extraídos
        for apk in all_apks {
            let filename = apk.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            let mut is_abi_split = false;
            let mut matches_device_abi = false;

            for marker in &known_abi_markers {
                // Buscamos tanto con guion bajo como medio (ej: arm64_v8a y arm64-v8a)
                if filename.contains(marker) || filename.contains(&marker.replace('_', "-")) {
                    is_abi_split = true;
                    // Comprobamos si este APK pertenece a las arquitecturas soportadas
                    for supported_abi in &supported_abis {
                        let normalized_supported = supported_abi.replace('-', "_");
                        if filename.contains(&normalized_supported) || filename.contains(supported_abi) {
                            matches_device_abi = true;
                            break;
                        }
                    }
                    break;
                }
            }

            // Mantenemos el APK si es un archivo base, idiomas/densidades, o una arquitectura compatible
            if !is_abi_split || matches_device_abi {
                filtered_apks.push(apk);
            }
        }

        if filtered_apks.is_empty() {
            return Err(format!("No compatible APKs found for your device in {}", package_file.display()));
        }

        return Ok(filtered_apks);
    } else {
        return Err(format!("Unsupported format: {}", package_file.display()));
    }
}

fn dump_value(output: &str, key: &str) -> String {
    output
        .split_whitespace()
        .find_map(|token| token.strip_prefix(&format!("{key}=")))
        .map(|value| value.trim_matches(['\'', '"', ',']).to_string())
        .filter(|value| !value.is_empty() && value != "null")
        .unwrap_or_else(|| "-".to_string())
}

fn dump_date_value(output: &str, key: &str) -> String {
    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix(&format!("{key}=")) {
            let mut parts = value.split_whitespace();
            if let Some(date) = parts.next() {
                if let Some(time) = parts.next() {
                    let time_without_seconds = time.rsplit_once(':').map(|(h_m, _)| h_m).unwrap_or(time);
                    return format!("{} {}", date, time_without_seconds);
                }
                return date.to_string();
            }
        }
    }
    "-".to_string()
}

fn display_name_from_dump(output: &str, fallback: &str) -> String {
    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("application-label:") {
            let label = value.trim().trim_matches(['\'', '"']);
            if !label.is_empty() {
                return label.to_string();
            }
        }
        if let Some(index) = trimmed.find("nonLocalizedLabel=") {
            let label = trimmed[index + "nonLocalizedLabel=".len()..]
                .split(" icon=")
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches(['\'', '"']);
            if !label.is_empty() && label != "null" {
                return label.to_string();
            }
        }
    }
    fallback.to_string()
}

fn parse_permissions(output: &str) -> Vec<AppPermissionInfo> {
    let mut permissions: Vec<AppPermissionInfo> = Vec::new();
    let mut section = "";
    for line in output.lines() {
        let trimmed = line.trim();
        match trimmed {
            "requested permissions:" => {
                section = "requested";
                continue;
            }
            "install permissions:" => {
                section = "install";
                continue;
            }
            "runtime permissions:" => {
                section = "runtime";
                continue;
            }
            _ => {}
        }
        if trimmed.ends_with(':') && !trimmed.contains(".permission.") {
            section = "";
            continue;
        }
        if section.is_empty() || !trimmed.contains(".permission.") {
            continue;
        }
        let name = trimmed.split(':').next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        if let Some(permission) = permissions
            .iter_mut()
            .find(|permission| permission.name == name)
        {
            permission.granted =
                permission.granted || trimmed.contains("granted=true") || section == "install";
            permission.runtime = permission.runtime || section == "runtime";
            continue;
        }
        permissions.push(AppPermissionInfo {
            name: name.to_string(),
            granted: trimmed.contains("granted=true") || section == "install",
            runtime: section == "runtime",
        });
    }
    permissions
}

async fn remote_size(serial: &str, path: &str) -> i64 {
    if path.is_empty() || path == "-" {
        return -1;
    }
    match adb::run_adb_for_serial(serial, &["shell", "du", "-sk", path]).await {
        Ok(result) if result.ok() => result
            .output
            .split_whitespace()
            .next()
            .and_then(|value| value.parse::<i64>().ok())
            .map(|value| value * 1024)
            .unwrap_or(-1),
        _ => -1,
    }
}

#[tauri::command]
pub async fn run_device_action(serial: String, args: Vec<String>) -> Result<String, String> {
    if args.is_empty() {
        return Err("No ADB arguments supplied".to_string());
    }
    let arg_refs = refs(&args);
    let result = adb::run_adb_for_serial(&serial, &arg_refs).await?;
    if result.ok() {
        Ok(result.output.trim().to_string())
    } else {
        Err(result.output.trim().to_string())
    }
}

#[tauri::command]
pub async fn connect_wireless_device(endpoint: String) -> Result<String, String> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() || !endpoint.contains(':') {
        return Err("Please enter a valid IP address and port".to_string());
    }
    let result = adb::run_adb(&["connect", endpoint]).await?;
    if result.ok() && !result.output.to_ascii_lowercase().contains("failed") {
        Ok(result.output.trim().to_string())
    } else {
        Err(result.output.trim().to_string())
    }
}

#[tauri::command]
pub async fn disconnect_wireless_device(endpoint: String) -> Result<String, String> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() {
        return Err("Please enter a valid device serial".to_string());
    }
    let result = adb::run_adb(&["disconnect", endpoint]).await?;
    if result.ok() {
        Ok(result.output.trim().to_string())
    } else {
        Err(result.output.trim().to_string())
    }
}

#[tauri::command]
pub async fn pair_wireless_device(endpoint: String, code: String) -> Result<String, String> {
    let endpoint = endpoint.trim();
    let code = code.trim();
    if endpoint.is_empty() || !endpoint.contains(':') || code.is_empty() {
        return Err("Please enter the endpoint and pairing code".to_string());
    }
    let result = adb::run_adb(&["pair", endpoint, code]).await?;
    if result.ok() && !result.output.to_ascii_lowercase().contains("failed") {
        Ok(result.output.trim().to_string())
    } else {
        Err(result.output.trim().to_string())
    }
}

fn random_wireless_token(length: usize) -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect::<String>()
        .to_ascii_uppercase()
}

#[tauri::command]
pub fn generate_wireless_qr() -> Result<WirelessQrPayload, String> {
    let service_name = format!("adb-{}", random_wireless_token(8));
    let password = random_wireless_token(12);
    let payload = format!("WIFI:T:ADB;S:{service_name};P:{password};;");
    let svg = QrCode::new(payload.as_bytes())
        .map_err(|error| error.to_string())?
        .render::<svg::Color>()
        .min_dimensions(360, 360)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build();
    Ok(WirelessQrPayload {
        service_name,
        password,
        qr_data_url: format!("data:image/svg+xml;base64,{}", STANDARD.encode(svg)),
    })
}

#[tauri::command]
pub async fn pair_wireless_qr(service_name: String, password: String) -> Result<String, String> {
    if service_name.trim().is_empty() || password.trim().is_empty() {
        return Err("Generate and scan a QR code first".to_string());
    }
    let endpoint_pattern =
        Regex::new(r"(?m)^(\S+)\s+(_adb-tls-pairing\._tcp)\s+((?:\d{1,3}\.){3}\d{1,3}):(\d+)")
            .map_err(|error| error.to_string())?;
    for _ in 0..30 {
        let result = adb::run_adb(&["mdns", "services"]).await?;
        if result.ok() {
            for captures in endpoint_pattern.captures_iter(&result.output) {
                if captures.get(1).map_or("", |value| value.as_str()) == service_name.trim() {
                    let endpoint = format!("{}:{}", &captures[3], &captures[4]);
                    return pair_wireless_device(endpoint, password).await;
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
    Err("Device not found. Generate another QR and scan it again.".to_string())
}

async fn wireless_host_for_serial(serial: &str) -> Result<String, String> {
    let patterns = [
        (
            vec!["shell", "ip", "route", "show", "dev", "wlan0"],
            r"\bsrc\s+((?:\d{1,3}\.){3}\d{1,3})\b",
        ),
        (
            vec!["shell", "ip", "route"],
            r"\bsrc\s+((?:\d{1,3}\.){3}\d{1,3})\b",
        ),
        (
            vec!["shell", "ip", "-f", "inet", "addr", "show", "wlan0"],
            r"\binet\s+((?:\d{1,3}\.){3}\d{1,3})\b",
        ),
    ];
    for (args, pattern) in patterns {
        let result = adb::run_adb_for_serial(serial, &args).await?;
        if result.ok() {
            let regex = Regex::new(pattern).map_err(|error| error.to_string())?;
            if let Some(host) = regex
                .captures(&result.output)
                .and_then(|captures| captures.get(1))
                .map(|value| value.as_str().to_string())
            {
                return Ok(host);
            }
        }
    }
    let property =
        adb::run_adb_for_serial(serial, &["shell", "getprop", "dhcp.wlan0.ipaddress"]).await?;
    let host = property.output.trim();
    if property.ok() && !host.is_empty() {
        Ok(host.to_string())
    } else {
        Err("Could not detect the Wi-Fi IP of the device".to_string())
    }
}

#[tauri::command]
pub async fn connect_usb_over_tcpip(serial: String) -> Result<String, String> {
    if serial.contains(':') || serial.starts_with("emulator-") {
        return Err("Select a physically connected USB device".to_string());
    }
    let host = wireless_host_for_serial(&serial).await?;
    let tcpip = adb::run_adb_for_serial(&serial, &["tcpip", "5555"]).await?;
    if !tcpip.ok() || tcpip.output.to_ascii_lowercase().contains("failed") {
        return Err(tcpip.output.trim().to_string());
    }
    tokio::time::sleep(std::time::Duration::from_millis(1400)).await;
    let endpoint = format!("{host}:5555");
    connect_wireless_device(endpoint.clone()).await?;
    Ok(endpoint)
}

async fn run_system_query(serial: &str, args: &[&str]) -> Result<String, String> {
    let result = adb::run_adb_for_serial(serial, args).await?;
    if result.ok() {
        Ok(result.output.trim().to_string())
    } else {
        Err(result.output.trim().to_string())
    }
}

fn parse_system_users(output: &str, current_user_id: i32) -> Vec<AndroidUser> {
    let pattern = Regex::new(r"UserInfo\{(\d+):([^:}]+):[^}]*\}(.*)$").unwrap();
    let mut users = output
        .lines()
        .filter_map(|line| {
            let captures = pattern.captures(line.trim())?;
            let id = captures.get(1)?.as_str().parse::<i32>().ok()?;
            let suffix = captures.get(3).map_or("", |value| value.as_str());
            Some(AndroidUser {
                id,
                name: captures.get(2)?.as_str().trim().to_string(),
                is_running: id == current_user_id
                    || suffix.to_ascii_lowercase().contains("running"),
            })
        })
        .collect::<Vec<_>>();
    users.sort_by_key(|user| user.id);
    users
}

fn parse_keyboard_ids(output: &str) -> Vec<String> {
    let mut ids = Vec::new();
    for line in output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let candidate = if let Some(id) = line.strip_prefix("mId=") {
            Some(id.trim())
        } else if line.contains('/') && !line.contains(' ') {
            Some(line)
        } else {
            None
        };
        if let Some(id) = candidate {
            if !ids.iter().any(|current| current == id) {
                ids.push(id.to_string());
            }
        }
    }
    ids
}

#[tauri::command]
pub async fn get_system_state(serial: String) -> Result<SystemState, String> {
    let users_output = run_system_query(&serial, &["shell", "pm", "list", "users"]).await?;
    let current_user_output =
        run_system_query(&serial, &["shell", "am", "get-current-user"]).await?;
    let app_languages_output = run_system_query(
        &serial,
        &[
            "shell",
            "settings",
            "get",
            "global",
            "settings_app_locale_opt_in_enabled",
        ],
    )
    .await?;
    let overlays_output = run_system_query(&serial, &["shell", "cmd", "overlay", "list"]).await?;
    let all_keyboards_output =
        match run_system_query(&serial, &["shell", "ime", "list", "-a", "-s"]).await {
            Ok(output) => output,
            Err(_) => run_system_query(&serial, &["shell", "ime", "list", "-a"]).await?,
        };
    let enabled_keyboards_output =
        run_system_query(&serial, &["shell", "ime", "list", "-s"]).await?;
    let current_keyboard_id = run_system_query(
        &serial,
        &["shell", "settings", "get", "secure", "default_input_method"],
    )
    .await?;

    let current_user_id = last_integer(&current_user_output).unwrap_or(-1);
    let mut all_keyboard_ids = parse_keyboard_ids(&all_keyboards_output);
    let enabled_keyboard_ids = parse_keyboard_ids(&enabled_keyboards_output);
    if !current_keyboard_id.is_empty()
        && !all_keyboard_ids
            .iter()
            .any(|keyboard| keyboard == &current_keyboard_id)
    {
        all_keyboard_ids.push(current_keyboard_id.clone());
    }

    Ok(SystemState {
        users: parse_system_users(&users_output, current_user_id),
        current_user_id,
        gestural_navigation: overlays_output.lines().any(|line| {
            line.contains("com.android.internal.systemui.navbar.gestural")
                && (line.trim_start().starts_with("[x]") || line.trim_start().starts_with("[X]"))
        }),
        app_languages_enabled: matches!(
            app_languages_output.trim().to_ascii_lowercase().as_str(),
            "false" | "0"
        ),
        keyboards: all_keyboard_ids
            .into_iter()
            .map(|id| KeyboardInputMethod {
                label: id.clone(),
                enabled: enabled_keyboard_ids.iter().any(|keyboard| keyboard == &id),
                is_default: id == current_keyboard_id,
                id,
            })
            .collect(),
        current_keyboard_id,
    })
}

#[tauri::command]
pub async fn set_device_dark_mode(serial: String, enabled: bool) -> Result<String, String> {
    let mode = if enabled { "yes" } else { "no" };
    let command =
        adb::run_adb_for_serial(&serial, &["shell", "cmd", "uimode", "night", mode]).await?;

    if !command.ok() {
        let value = if enabled { "2" } else { "1" };
        let fallback = adb::run_adb_for_serial(
            &serial,
            &["shell", "settings", "put", "secure", "ui_night_mode", value],
        )
        .await?;
        if !fallback.ok() {
            return Err(fallback.output.trim().to_string());
        }
    }

    let current = adb::run_adb_for_serial(&serial, &["shell", "cmd", "uimode", "night"]).await?;
    let expected = if enabled { "yes" } else { "no" };
    if current.ok() && current.output.to_ascii_lowercase().contains(expected) {
        Ok(format!(
            "Dark mode {}",
            if enabled { "enabled" } else { "disabled" }
        ))
    } else {
        Err("Android did not confirm the dark mode change".to_string())
    }
}

#[tauri::command]
pub async fn get_media_volume(serial: String) -> Result<MediaVolumeState, String> {
    let current = adb::run_adb_for_serial(
        &serial,
        &["shell", "cmd", "audio", "get-stream-volume", "3"],
    )
    .await?;
    let maximum =
        adb::run_adb_for_serial(&serial, &["shell", "cmd", "audio", "get-max-volume", "3"]).await?;

    Ok(MediaVolumeState {
        level: last_integer(&current.output).unwrap_or(7),
        maximum: last_integer(&maximum.output).unwrap_or(15).max(1),
    })
}

#[tauri::command]
pub async fn set_media_volume(serial: String, volume: i32) -> Result<String, String> {
    let maximum =
        adb::run_adb_for_serial(&serial, &["shell", "cmd", "audio", "get-max-volume", "3"]).await?;
    let safe_volume = volume.clamp(0, last_integer(&maximum.output).unwrap_or(30).max(1));
    let value = safe_volume.to_string();
    let commands: [&[&str]; 4] = [
        &["shell", "cmd", "audio", "set-volume", "3", &value],
        &[
            "shell",
            "cmd",
            "media_session",
            "volume",
            "--stream",
            "3",
            "--set",
            &value,
        ],
        &["shell", "media", "volume", "--stream", "3", "--set", &value],
        &["shell", "settings", "put", "system", "volume_music", &value],
    ];
    let mut last_output = String::new();

    for (index, command) in commands.into_iter().enumerate() {
        let result = adb::run_adb_for_serial(&serial, command).await?;
        if result.ok() {
            if index == 0 {
                let current = adb::run_adb_for_serial(
                    &serial,
                    &["shell", "cmd", "audio", "get-stream-volume", "3"],
                )
                .await?;
                if last_integer(&current.output) != Some(safe_volume) {
                    last_output = current.output;
                    continue;
                }
            }
            return Ok(format!("Media volume: {safe_volume}"));
        }
        last_output = result.output;
    }

    Err(if last_output.trim().is_empty() {
        "Could not apply the media volume".to_string()
    } else {
        last_output
    })
}

#[tauri::command]
pub async fn list_apps(serial: String) -> Result<Vec<AppSummary>, String> {
    let cache_dir = application_cache_dir();
    let legacy_details = cache_dir.parent().unwrap_or(&cache_dir).join("app-details");
    if legacy_details.exists() {
        let _ = fs::remove_dir_all(legacy_details);
    }
    let (result, system, disabled) = tokio::join!(
        adb::run_adb_for_serial(&serial, &["shell", "pm", "list", "packages", "-f"]),
        adb::run_adb_for_serial(&serial, &["shell", "pm", "list", "packages", "-s"]),
        adb::run_adb_for_serial(&serial, &["shell", "pm", "list", "packages", "-d"])
    );

    let result = result?;
    let system = system?;
    let disabled = disabled?;

    if !result.ok() {
        return Err(result.output);
    }
    let system_packages = package_set(&system.output);
    let disabled_packages = package_set(&disabled.output);

    let mut apps = result
        .output
        .lines()
        .filter_map(|line| {
            let value = line.trim().strip_prefix("package:")?;
            let (apk_path, package_name) = value.rsplit_once('=')?;
            Some(AppSummary {
                package_name: package_name.to_string(),
                display_name: package_name.to_string(),
                apk_path: apk_path.to_string(),
                system_app: system_packages.contains(package_name),
                disabled: disabled_packages.contains(package_name),
                icon_data_url: String::new(),
            })
        })
        .collect::<Vec<_>>();
    for app in &mut apps {
        let cache_path = app_summary_cache_path(&app.package_name, &app.apk_path);
        if let Ok(cached) = fs::read_to_string(&cache_path) {
            if let Ok(presentation) = serde_json::from_str::<CachedAppPresentation>(&cached) {
                if presentation.display_name != app.package_name
                    || !presentation.icon_data_url.is_empty()
                {
                    app.display_name = presentation.display_name;
                    app.icon_data_url = presentation.icon_data_url;
                }
            }
        }
    }
    apps.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    Ok(apps)
}

#[derive(Deserialize)]
struct DaemonResponse {
    label: Option<String>,
    icon: Option<String>,
    error: Option<String>,
}

static DAEMON_BYTES: &[u8] = include_bytes!("../../../tools/java/info_apps.jar");
static WALLPAPER_DAEMON_BYTES: &[u8] = include_bytes!("../../../tools/java/wallpaper_extractor.jar");

static PUSHED_DAEMONS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> = std::sync::OnceLock::new();

#[tauri::command]
pub async fn enrich_app_summary(
    serial: String,
    package_name: String,
    apk_path: String,
    system_app: bool,
    disabled: bool,
) -> Result<AppSummary, String> {
    
    // Comprobar caché local (Se mantiene intacto)
    let cache_path = app_summary_cache_path(&package_name, &apk_path);
    if let Ok(cached) = fs::read_to_string(&cache_path) {
        if let Ok(presentation) = serde_json::from_str::<CachedAppPresentation>(&cached) {
            if !presentation.icon_data_url.is_empty() {
                return Ok(AppSummary {
                    package_name,
                    display_name: presentation.display_name,
                    apk_path,
                    system_app,
                    disabled,
                    icon_data_url: presentation.icon_data_url,
                });
            }
        }
    }

    let java_tools_dir = crate::app_paths::cache_dir().join("tools").join("java");
    if !java_tools_dir.exists() {
        let _ = fs::create_dir_all(&java_tools_dir);
    }
    let daemon_local_path = java_tools_dir.join("info_apps.jar");
    let daemon_device_path = "/data/local/tmp/tools/java/info_apps.jar";

    if !daemon_local_path.exists() {
        fs::write(&daemon_local_path, DAEMON_BYTES).map_err(|e| e.to_string())?;
    }

    let daemons_cache = PUSHED_DAEMONS.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()));
    let needs_push = {
        let cache = daemons_cache.lock().unwrap();
        !cache.contains(&serial)
    };

    if needs_push {
        let check_daemon = adb::run_adb_for_serial(&serial, &["shell", "ls", daemon_device_path]).await?;
        if !check_daemon.ok() || check_daemon.output.contains("No such file") {
            adb::run_adb_for_serial(&serial, &["shell", "mkdir", "-p", "/data/local/tmp/tools/java"]).await?;
            adb::run_adb_for_serial(&serial, &["push", &daemon_local_path.to_string_lossy(), daemon_device_path]).await?;
            adb::run_adb_for_serial(&serial, &["shell", "chmod", "777", daemon_device_path]).await?;
        }
        let mut cache = daemons_cache.lock().unwrap();
        cache.insert(serial.clone());
    }

    let result = adb::run_adb_for_serial(
        &serial,
        &[
            "shell",
            &format!("CLASSPATH={} app_process / com.kyro.adbapp.extractapktool.Main {}", daemon_device_path, package_name)
        ]
    ).await?;

    if !result.ok() {
        return Err(format!("Daemon execution failed: {}", result.output));
    }

    let daemon_output = result.output.lines().last().unwrap_or("{}");
    let parsed: DaemonResponse = serde_json::from_str(daemon_output).unwrap_or(DaemonResponse {
        label: None,
        icon: None,
        error: Some("Failed to parse JSON from device".into())
    });

    if let Some(err) = parsed.error {
        return Err(format!("Device Error: {}", err));
    }

    let display_name = parsed.label.unwrap_or_else(|| package_name.clone());
    let icon_data_url = parsed.icon.unwrap_or_default();

    // 4. Guardar en caché y devolver el AppSummary
    let settings = read_settings();
    if settings.cache_enabled {
        if let Some(parent) = cache_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        
        let presentation = CachedAppPresentation {
            display_name: display_name.clone(),
            icon_data_url: icon_data_url.clone(),
        };
        
        if let Ok(serialized) = serde_json::to_string(&presentation) {
            let _ = fs::write(cache_path, serialized);
        }
    }

    Ok(AppSummary {
        package_name,
        display_name,
        apk_path,
        system_app,
        disabled,
        icon_data_url,
    })
}

#[tauri::command]
pub async fn install_application_packages(
    serial: String,
    files: Vec<String>,
    options: AppInstallOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if files.is_empty() {
            return Err("Select at least one package to install".to_string());
        }
        let adb_path =
            tools::resolve_tool_path("adb").ok_or_else(|| "ADB is not available".to_string())?;
        let working_directory = install_working_dir()?;
        let mut log = Vec::new();

        for file in files {
            let package_file = PathBuf::from(&file);
            if !package_file.is_file() {
                log.push(format!("ERROR · Does not exist: {}", package_file.display()));
                continue;
            }
            log.push(format!(
                "Preparing {}...",
                package_file
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ));
            match resolve_install_files(&serial, &package_file, &working_directory) {
                Ok(apks) => {
                    let mut args = vec!["-s".to_string(), serial.clone()];
                    args.push(if apks.len() > 1 {
                        "install-multiple".into()
                    } else {
                        "install".into()
                    });
                    if options.replace_existing {
                        args.push("-r".into());
                    }
                    if options.grant_runtime_permissions {
                        args.push("-g".into());
                    }
                    if options.allow_test_packages {
                        args.push("-t".into());
                    }
                    if options.bypass_low_target_sdk_block {
                        args.push("--bypass-low-target-sdk-block".into());
                    }
                    args.extend(apks.iter().map(|apk| apk.to_string_lossy().into_owned()));
                    match run_local_command(&adb_path, &args) {
                        Ok(output) => log.push(format!(
                            "OK · {}{}\n{}",
                            package_file
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy(),
                            if apks.len() > 1 {
                                format!(" ({} APKs)", apks.len())
                            } else {
                                String::new()
                            },
                            output
                        )),
                        Err(error) => log.push(format!(
                            "ERROR · {}\n{}",
                            package_file
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy(),
                            error
                        )),
                    }
                }
                Err(error) => log.push(format!(
                    "ERROR · {}\n{}",
                    package_file
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy(),
                    error
                )),
            }
        }
        let _ = fs::remove_dir_all(&working_directory);
        Ok(log.join("\n\n"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_app_details(
    serial: String,
    package_name: String,
) -> Result<AppDetailsInfo, String> {
    let dump =
        adb::run_adb_for_serial(&serial, &["shell", "dumpsys", "package", &package_name]).await?;
    if !dump.ok() {
        return Err(dump.output);
    }
    let paths = adb::run_adb_for_serial(&serial, &["shell", "pm", "path", &package_name]).await?;
    let system = adb::run_adb_for_serial(
        &serial,
        &["shell", "pm", "list", "packages", "-s", &package_name],
    )
    .await?;
    let disabled = adb::run_adb_for_serial(
        &serial,
        &["shell", "pm", "list", "packages", "-d", &package_name],
    )
    .await?;
    let appops =
        adb::run_adb_for_serial(&serial, &["shell", "cmd", "appops", "get", &package_name]).await?;
    let apk_paths: Vec<String> = paths
        .output
        .lines()
        .filter_map(|line| line.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect();
    let is_split = apk_paths.len() > 1;
    let apk_path = apk_paths.first().cloned().unwrap_or_else(|| "-".to_string());
    let data_dir = dump_value(&dump.output, "dataDir");
    let code_size_bytes = remote_size(&serial, &apk_path).await;
    let total_data_bytes = remote_size(&serial, &data_dir).await;
    let cache_size_bytes = remote_size(&serial, &format!("{data_dir}/cache")).await;
    let data_size_bytes = if total_data_bytes >= 0 {
        (total_data_bytes - cache_size_bytes.max(0)).max(0)
    } else {
        -1
    };
    let background_mode = if appops.output.contains("RUN_ANY_IN_BACKGROUND: allow") {
        "unrestricted"
    } else if appops.output.contains("RUN_ANY_IN_BACKGROUND: ignore")
        || appops.output.contains("RUN_IN_BACKGROUND: ignore")
    {
        "restricted"
    } else {
        "optimized"
    };

    Ok(AppDetailsInfo {
        package_name: package_name.clone(),
        display_name: display_name_from_dump(&dump.output, &package_name),
        apk_path,
        is_split,
        system_app: package_set(&system.output).contains(&package_name),
        disabled: package_set(&disabled.output).contains(&package_name),
        version_name: dump_value(&dump.output, "versionName"),
        version_code: dump_value(&dump.output, "versionCode"),
        target_sdk: dump_value(&dump.output, "targetSdk"),
        min_sdk: dump_value(&dump.output, "minSdk"),
        installer: dump_value(&dump.output, "installerPackageName"),
        data_dir,
        code_size_bytes,
        data_size_bytes,
        cache_size_bytes,
        background_mode: background_mode.to_string(),
        permissions: parse_permissions(&dump.output),
        icon_data_url: String::new(),
        install_date: dump_date_value(&dump.output, "firstInstallTime"),
        update_date: dump_date_value(&dump.output, "lastUpdateTime"),
    })
}

#[tauri::command]
pub fn clear_application_cache() -> Result<String, String> {
    let cache_dir = application_cache_dir();
    let legacy_details = cache_dir.parent().unwrap_or(&cache_dir).join("app-details");
    let count = fs::read_dir(&cache_dir)
        .ok()
        .map(|entries| entries.filter_map(Result::ok).count())
        .unwrap_or(0);
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    }
    if legacy_details.exists() {
        fs::remove_dir_all(legacy_details).map_err(|error| error.to_string())?;
    }
    Ok(format!("Application cache cleared: {count} entries"))
}

#[tauri::command]
pub async fn list_directory(serial: String, path: String) -> Result<Vec<FileEntry>, String> {
    let listing_path = if path == "/" {
        path.clone()
    } else {
        format!("{}/", path.trim_end_matches('/'))
    };
    
    // Escape single quotes and wrap in single quotes to prevent shell variable expansion
    let escaped_path = format!("'{}'", listing_path.replace("'", "'\\''"));
    let result = adb::run_adb_for_serial(&serial, &["shell", "ls", "-la", &escaped_path]).await?;
    if !result.ok() {
        return Err(result.output);
    }

    let entries = result
        .output
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 8 || !parts[0].starts_with(['d', '-', 'l']) {
                return None;
            }
            let raw_name = parts[7..].join(" ");
            let (name, link_target) = if parts[0].starts_with('l') {
                raw_name
                    .split_once(" -> ")
                    .map(|(name, target)| (name.to_string(), target.to_string()))
                    .unwrap_or((raw_name, String::new()))
            } else {
                (raw_name, String::new())
            };
            if name == "." || name == ".." {
                return None;
            }
            Some(FileEntry {
                name,
                permissions: parts[0].to_string(),
                size: parts[4].parse().unwrap_or(0),
                modified: format!("{} {}", parts[5], parts[6]),
                is_directory: parts[0].starts_with('d'),
                is_link: parts[0].starts_with('l'),
                link_target,
            })
        })
        .collect();
    Ok(entries)
}

#[tauri::command]
pub async fn read_file_bytes(serial: String, path: String) -> Result<tauri::ipc::Response, String> {
    let adb_path = tools::resolve_tool_path("adb").ok_or_else(|| "ADB is not available".to_string())?;
    
    let output = std::process::Command::new(adb_path)
        .args(["-s", &serial, "exec-out", "cat", &path])
        .output()
        .map_err(|e| format!("Failed to read file: {}", e))?;
        
    if output.status.success() {
        Ok(tauri::ipc::Response::new(output.stdout))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn pull_file(
    serial: String,
    remote_path: String,
    local_path: String,
) -> Result<String, String> {
    let result = adb::run_adb_for_serial(&serial, &["pull", &remote_path, &local_path]).await?;
    if result.ok() {
        Ok(result.output.trim().to_string())
    } else {
        Err(result.output.trim().to_string())
    }
}

#[tauri::command]
pub async fn get_file_thumbnail(serial: String, path: String) -> Result<String, String> {
    let (exit_code, bytes) =
        adb::run_adb_binary_for_serial(&serial, &["exec-out", "cat", &path]).await?;
    if exit_code != 0 {
        return Err("Could not get the thumbnail".to_string());
    }
    let extension = Path::new(&path)
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod wireless_tests {
    use super::generate_wireless_qr;

    #[test]
    fn generates_hidden_credentials_and_scannable_qr() {
        let qr = generate_wireless_qr().expect("QR generation should succeed");
        assert!(qr.service_name.starts_with("adb-"));
        assert_eq!(qr.password.len(), 12);
        assert!(qr.qr_data_url.starts_with("data:image/svg+xml;base64,"));
    }
}

#[tauri::command]
pub fn launch_scrcpy(serial: String, extra_args: Vec<String>) -> Result<String, String> {
    let executable = tools::resolve_tool_path("scrcpy").ok_or_else(|| {
        "scrcpy is not installed. Configure or install it in Settings.".to_string()
    })?;
    if let Some(record_path) = extra_args
        .iter()
        .find_map(|argument| argument.strip_prefix("--record="))
    {
        if let Some(parent) = Path::new(record_path).parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create recording directory: {error}"))?;
        }
    }
    let mut command = crate::process::command(executable);
    command
        .arg("--serial")
        .arg(&serial)
        .args(extra_args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
        .spawn()
        .map_err(|error| format!("Could not launch scrcpy: {error}"))?;
    Ok(format!("scrcpy launched for {serial}"))
}

#[tauri::command]
pub async fn list_scrcpy_cameras(serial: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let executable = tools::resolve_tool_path("scrcpy").ok_or_else(|| {
            "scrcpy is not installed. Configure or install it in Settings.".to_string()
        })?;
        let output = crate::process::command(executable)
            .args(["--serial", &serial, "--list-cameras"])
            .output()
            .map_err(|error| format!("Could not query scrcpy cameras: {error}"))?;
        let combined = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let cameras = combined
            .lines()
            .map(str::trim)
            .filter(|line| line.contains("--camera-id="))
            .map(str::to_string)
            .collect::<Vec<_>>();
        if output.status.success() || !cameras.is_empty() {
            Ok(cameras)
        } else {
            Err(combined.trim().to_string())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_tools_status() -> ToolsStatus {
    tauri::async_runtime::spawn_blocking(tools::tools_status)
        .await
        .unwrap()
}

#[tauri::command]
pub async fn check_tool_updates() -> ToolsStatus {
    tools::tools_status_with_updates().await
}

#[tauri::command]
pub fn set_tool_path(tool: String, path: String) -> Result<ToolsStatus, String> {
    tools::save_tool_path(&tool, &path)
}

#[tauri::command]
pub async fn install_or_update_tool(tool: String) -> Result<ToolsStatus, String> {
    tauri::async_runtime::spawn_blocking(move || tools::install_or_update(&tool))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn export_apk(serial: String, package_name: String, destination: String) -> Result<(), String> {
    let paths_result = adb::run_adb_for_serial(&serial, &["shell", "pm", "path", &package_name]).await?;
    if !paths_result.ok() {
        return Err(paths_result.output);
    }
    let apk_paths: Vec<String> = paths_result
        .output
        .lines()
        .filter_map(|line| line.trim().strip_prefix("package:"))
        .map(|s| s.to_string())
        .collect();

    if apk_paths.is_empty() {
        return Err(format!("No APK paths found for {}", package_name));
    }

    if apk_paths.len() == 1 {
        // Single APK
        let result = adb::run_adb_for_serial(&serial, &["pull", &apk_paths[0], &destination]).await?;
        if result.ok() {
            Ok(())
        } else {
            Err(result.output)
        }
    } else {
        // Split APKs
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        let temp_dir = crate::app_paths::cache_dir()
            .join("exports")
            .join(nonce.to_string());
        fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;

        // Pull all APKs
        for path in &apk_paths {
            let result = adb::run_adb_for_serial(&serial, &["pull", path, &temp_dir.to_string_lossy()]).await?;
            if !result.ok() {
                let _ = fs::remove_dir_all(&temp_dir);
                return Err(format!("Failed to pull {}: {}", path, result.output));
            }
        }

        // Zip them into destination
        let file = std::fs::File::create(&destination).map_err(|e| format!("Failed to create destination file: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for entry in fs::read_dir(&temp_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().unwrap().to_string_lossy().into_owned();
                zip.start_file(file_name, options).map_err(|e| format!("Failed to start zip file: {}", e))?;
                let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut zip).map_err(|e| format!("Failed to write to zip: {}", e))?;
            }
        }

        zip.finish().map_err(|e| format!("Failed to finish zip: {}", e))?;
        let _ = fs::remove_dir_all(&temp_dir);
        Ok(())
    }
}

#[derive(serde::Serialize)]
pub struct HomeDetails {
    pub device_name: String,
    pub airplane_mode: bool,
    pub carrier: String,
}

#[tauri::command]
pub async fn get_home_details(serial: String) -> Result<HomeDetails, String> {
    let (name_res, airplane_res, carrier_res) = tokio::join!(
        adb::run_adb_for_serial(&serial, &["shell", "settings", "get", "global", "device_name"]),
        adb::run_adb_for_serial(&serial, &["shell", "settings", "get", "global", "airplane_mode_on"]),
        adb::run_adb_for_serial(&serial, &["shell", "getprop", "gsm.operator.alpha"])
    );

    let mut name = String::new();
    if let Ok(res) = name_res {
        if res.ok() && !res.output.trim().is_empty() && res.output.trim() != "null" {
            name = res.output.trim().to_string();
        }
    }

    let mut airplane = false;
    if let Ok(res) = airplane_res {
        if res.ok() && res.output.trim() == "1" {
            airplane = true;
        }
    }

    let mut carrier = String::new();
    if let Ok(res) = carrier_res {
        if res.ok() && !res.output.trim().is_empty() {
            let mut parts: Vec<String> = res.output
                .trim()
                .split(',')
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty() && p.to_lowercase() != "unknown" && p.to_lowercase() != "null")
                .collect();
            parts.dedup();
            carrier = parts.join(" / ");
        }
    }

    Ok(HomeDetails {
        device_name: name,
        airplane_mode: airplane,
        carrier,
    })
}
