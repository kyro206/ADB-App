use std::collections::HashSet;
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
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

fn aapt2_path() -> Option<PathBuf> {
    let executable = if cfg!(windows) { "aapt2.exe" } else { "aapt2" };
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = PathBuf::from(home);
        candidates.push(home.join(".adbapp").join("tools").join("aapt2").join("managed").join(executable));
        candidates.push(home.join(".adbmanager").join("tools").join("aapt2").join("managed").join(executable));
        candidates.extend([
            home.join("Android").join("Sdk"),
            home.join("Android").join("sdk"),
            home.join("Library").join("Android").join("sdk"),
        ].into_iter().flat_map(|root| aapt2_build_tools_candidates(&root, executable)));
    }
    for variable in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Some(root) = std::env::var_os(variable) {
            candidates.extend(aapt2_build_tools_candidates(&PathBuf::from(root), executable));
        }
    }
    if let Some(adb_path) = tools::resolve_tool_path("adb") {
        if let Some(sdk_root) = adb_path.parent().and_then(Path::parent) {
            candidates.extend(aapt2_build_tools_candidates(sdk_root, executable));
        }
    }
    let lookup = if cfg!(windows) { "where" } else { "which" };
    if let Ok(output) = Command::new(lookup).arg(executable).output() {
        candidates.extend(String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from));
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn aapt2_build_tools_candidates(sdk_root: &Path, executable: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(sdk_root.join("build-tools")) else {
        return Vec::new();
    };
    let mut candidates = entries.flatten().map(|entry| entry.path().join(executable)).filter(|path| path.is_file()).collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.cmp(left));
    candidates
}

fn app_summary_cache_path(package_name: &str, apk_path: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    package_name.hash(&mut hasher);
    apk_path.hash(&mut hasher);
    let root = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir);
    root.join("ADB App")
        .join("app-icons")
        .join(format!("{:x}.json", hasher.finish()))
}

fn application_cache_dir() -> PathBuf {
    let root = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir);
    root.join("ADB App").join("app-icons")
}

fn install_working_dir() -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let path = std::env::temp_dir()
        .join("adb-app-installs")
        .join(nonce.to_string());
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn run_local_command(program: &Path, args: &[String]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("No se pudo ejecutar {}: {error}", program.display()))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}").trim().to_string();
    if output.status.success() {
        Ok(combined)
    } else {
        Err(if combined.is_empty() {
            format!("{} terminó con error", program.display())
        } else {
            combined
        })
    }
}

fn bundletool_jar() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or_else(|| "No se pudo localizar la carpeta del usuario".to_string())?;
    let directory = PathBuf::from(home)
        .join(".adbapp")
        .join("tools")
        .join("bundletool");
    let jar = directory.join("bundletool-all.jar");
    if jar.is_file() {
        return Ok(jar);
    }
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let escaped_directory = directory.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop';$target='{escaped_directory}';$release=Invoke-RestMethod -Headers @{{'User-Agent'='ADB-App'}} 'https://api.github.com/repos/google/bundletool/releases/latest';$asset=$release.assets|Where-Object{{$_.name -like 'bundletool-all-*.jar'}}|Select-Object -First 1;if(-not $asset){{throw 'No se encontró bundletool'}};Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile (Join-Path $target 'bundletool-all.jar')"
    );
    run_local_command(
        Path::new("powershell.exe"),
        &[
            "-NoProfile".into(),
            "-ExecutionPolicy".into(),
            "Bypass".into(),
            "-Command".into(),
            script,
        ],
    )?;
    jar.is_file()
        .then_some(jar)
        .ok_or_else(|| "No se pudo descargar bundletool".to_string())
}

fn modern_java_path() -> Result<PathBuf, String> {
    let java = tools::resolve_tool_path("java").ok_or_else(|| {
        "Java no está configurado. Indica su ruta en Ajustes. Se recomienda instalar la última versión LTS de Temurin desde https://adoptium.net/es/temurin/releases".to_string()
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
            "Java {version} no es compatible con bundletool. Configura Java 11 o superior en Ajustes; se recomienda la última versión LTS de Temurin."
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

    if extension == "aab" || extension == "apks" {
        let jar = bundletool_jar()?;
        let java = modern_java_path()?;
        let adb_path =
            tools::resolve_tool_path("adb").ok_or_else(|| "ADB no está disponible".to_string())?;
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
        let apks_archive = if extension == "aab" {
            let output = working_directory.join("device.apks");
            run_local_command(
                &java,
                &[
                    "-jar".into(),
                    jar.to_string_lossy().into_owned(),
                    "build-apks".into(),
                    format!("--bundle={}", package_file.display()),
                    format!("--output={}", output.display()),
                    format!("--device-spec={}", device_spec.display()),
                    "--overwrite".into(),
                ],
            )?;
            output
        } else {
            package_file.to_path_buf()
        };
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
    } else if matches!(extension.as_str(), "apkm" | "xapk" | "zip") {
        run_local_command(
            Path::new("tar"),
            &[
                "-xf".into(),
                package_file.to_string_lossy().into_owned(),
                "-C".into(),
                extraction_directory.to_string_lossy().into_owned(),
            ],
        )?;
    } else {
        return Err(format!("Formato no compatible: {}", package_file.display()));
    }

    let apks = collect_apks(&extraction_directory)?;
    if apks.is_empty() {
        Err(format!(
            "No se encontraron APK compatibles en {}",
            package_file.display()
        ))
    } else {
        Ok(apks)
    }
}

fn resolved_icon_path(aapt2: &Path, apk_path: &Path, entry_name: &str) -> String {
    if !entry_name.to_lowercase().ends_with(".xml") {
        return entry_name.to_string();
    }
    let xml = Command::new(aapt2)
        .args(["dump", "xmltree"])
        .args(["--file", entry_name])
        .arg(apk_path)
        .output()
        .ok()
        .map(|value| String::from_utf8_lossy(&value.stdout).to_string())
        .unwrap_or_default();
    let mut foreground = false;
    let mut fallback_id = None;
    let mut resource_id = None;
    for line in xml.lines() {
        if line.contains("E: foreground") {
            foreground = true;
            continue;
        }
        if !line.contains("drawable") || !line.contains("@0x") {
            continue;
        }
        let Some(start) = line.find("@0x").map(|index| index + 1) else {
            continue;
        };
        let Some(value) = line[start..].split_whitespace().next() else {
            continue;
        };
        fallback_id.get_or_insert_with(|| value.to_string());
        if foreground {
            resource_id = Some(value.to_string());
            break;
        }
    }
    let resource_id = resource_id.or(fallback_id);
    let Some(resource_id) = resource_id else {
        return entry_name.to_string();
    };
    let resources = Command::new(aapt2)
        .args(["dump", "resources"])
        .arg(apk_path)
        .output()
        .ok()
        .map(|value| String::from_utf8_lossy(&value.stdout).to_string())
        .unwrap_or_default();
    let mut in_resource = false;
    let mut candidates = Vec::new();
    for line in resources.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("resource 0x") {
            in_resource = trimmed.contains(&resource_id);
            continue;
        }
        if in_resource && trimmed.contains("(file)") {
            if let Some(path) = trimmed
                .split("(file)")
                .nth(1)
                .and_then(|value| value.split_whitespace().next())
            {
                if matches!(
                    Path::new(path).extension().and_then(|value| value.to_str()),
                    Some("png" | "webp" | "jpg" | "jpeg")
                ) {
                    candidates.push(path.to_string());
                }
            }
        }
    }
    candidates.pop().unwrap_or_else(|| entry_name.to_string())
}

fn extract_badging_value(output: &str, prefix: &str) -> String {
    output
        .lines()
        .find_map(|line| line.trim().strip_prefix(prefix))
        .map(|value| value.trim().trim_matches('\'').to_string())
        .unwrap_or_default()
}

fn extract_icon_from_apk(apk_path: &Path, entry_name: &str) -> String {
    if entry_name.is_empty() {
        return String::new();
    }
    let output = Command::new("tar")
        .arg("-xOf")
        .arg(apk_path)
        .arg(entry_name)
        .output();
    let bytes = match output {
        Ok(value) if value.status.success() => value.stdout,
        _ => Vec::new(),
    };
    if bytes.is_empty() {
        return String::new();
    }
    let mime = if entry_name.to_lowercase().ends_with(".webp") {
        "image/webp"
    } else if entry_name.to_lowercase().ends_with(".jpg")
        || entry_name.to_lowercase().ends_with(".jpeg")
    {
        "image/jpeg"
    } else {
        "image/png"
    };
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

fn dump_value(output: &str, key: &str) -> String {
    output
        .split_whitespace()
        .find_map(|token| token.strip_prefix(&format!("{key}=")))
        .map(|value| value.trim_matches(['\'', '"', ',']).to_string())
        .filter(|value| !value.is_empty() && value != "null")
        .unwrap_or_else(|| "-".to_string())
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
        return Err("Introduce una dirección IP y puerto válidos".to_string());
    }
    let result = adb::run_adb(&["connect", endpoint]).await?;
    if result.ok() && !result.output.to_ascii_lowercase().contains("failed") {
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
        return Err("Introduce el endpoint y el código de emparejamiento".to_string());
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
    let service_name = format!("studio-{}", random_wireless_token(8));
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
        return Err("Genera y escanea primero un código QR".to_string());
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
    Err("No se encontró el dispositivo. Genera otro QR y vuelve a escanearlo.".to_string())
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
        Err("No se pudo detectar la IP Wi-Fi del dispositivo".to_string())
    }
}

#[tauri::command]
pub async fn connect_usb_over_tcpip(serial: String) -> Result<String, String> {
    if serial.contains(':') || serial.starts_with("emulator-") {
        return Err("Selecciona un dispositivo conectado físicamente por USB".to_string());
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
            "Modo oscuro {}",
            if enabled { "activado" } else { "desactivado" }
        ))
    } else {
        Err("Android no confirmó el cambio del modo oscuro".to_string())
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
            return Ok(format!("Volumen multimedia: {safe_volume}"));
        }
        last_output = result.output;
    }

    Err(if last_output.trim().is_empty() {
        "No se pudo aplicar el volumen multimedia".to_string()
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
    let result =
        adb::run_adb_for_serial(&serial, &["shell", "pm", "list", "packages", "-f"]).await?;
    let system =
        adb::run_adb_for_serial(&serial, &["shell", "pm", "list", "packages", "-s"]).await?;
    let disabled =
        adb::run_adb_for_serial(&serial, &["shell", "pm", "list", "packages", "-d"]).await?;
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
        if let Ok(cached) =
            fs::read_to_string(app_summary_cache_path(&app.package_name, &app.apk_path))
        {
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

#[tauri::command]
pub async fn enrich_app_summary(
    serial: String,
    package_name: String,
    apk_path: String,
    system_app: bool,
    disabled: bool,
) -> Result<AppSummary, String> {
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
    let aapt2 = aapt2_path().ok_or_else(|| "AAPT2 no está disponible".to_string())?;
    let safe_name = package_name.replace(|character: char| !character.is_ascii_alphanumeric(), "_");
    let local_apk = std::env::temp_dir().join(format!("adb-app-{safe_name}.apk"));
    let local_value = local_apk.to_string_lossy().to_string();
    let pull = adb::run_adb_for_serial(&serial, &["pull", &apk_path, &local_value]).await?;
    if !pull.ok() {
        return Err(pull.output);
    }

    let result = tauri::async_runtime::spawn_blocking({
        let local_apk = local_apk.clone();
        let package_name = package_name.clone();
        move || {
            let output = Command::new(&aapt2)
                .args(["dump", "badging"])
                .arg(&local_apk)
                .output()
                .map_err(|error| error.to_string())?;
            let badging = String::from_utf8_lossy(&output.stdout);
            let mut display_name = extract_badging_value(&badging, "application-label:");
            if display_name.is_empty() {
                display_name = package_name.clone();
            }
            let icon_path = badging
                .lines()
                .filter_map(|line| {
                    let trimmed = line.trim();
                    if !trimmed.starts_with("application-icon-") {
                        return None;
                    }
                    trimmed
                        .split_once(':')
                        .map(|(_, value)| value.trim().trim_matches('\'').to_string())
                })
                .last()
                .or_else(|| {
                    badging.lines().find_map(|line| {
                        let trimmed = line.trim();
                        let start = trimmed.find(" icon='")? + 7;
                        let end = trimmed[start..].find('\'')? + start;
                        Some(trimmed[start..end].to_string())
                    })
                })
                .unwrap_or_default();
            let resolved_icon = resolved_icon_path(&aapt2, &local_apk, &icon_path);
            Ok::<AppSummary, String>(AppSummary {
                package_name,
                display_name,
                apk_path,
                system_app,
                disabled,
                icon_data_url: extract_icon_from_apk(&local_apk, &resolved_icon),
            })
        }
    })
    .await
    .map_err(|error| error.to_string())?;
    let _ = fs::remove_file(local_apk);
    if let Ok(value) = &result {
        if let Some(parent) = cache_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let presentation = CachedAppPresentation {
            display_name: value.display_name.clone(),
            icon_data_url: value.icon_data_url.clone(),
        };
        if let Ok(serialized) = serde_json::to_string(&presentation) {
            let _ = fs::write(cache_path, serialized);
        }
    }
    result
}

#[tauri::command]
pub async fn install_application_packages(
    serial: String,
    files: Vec<String>,
    options: AppInstallOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if files.is_empty() {
            return Err("Selecciona al menos un paquete para instalar".to_string());
        }
        let adb_path =
            tools::resolve_tool_path("adb").ok_or_else(|| "ADB no está disponible".to_string())?;
        let working_directory = install_working_dir()?;
        let mut log = Vec::new();

        for file in files {
            let package_file = PathBuf::from(&file);
            if !package_file.is_file() {
                log.push(format!("ERROR · No existe: {}", package_file.display()));
                continue;
            }
            log.push(format!(
                "Preparando {}...",
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
    let apk_path = paths
        .output
        .lines()
        .find_map(|line| line.trim().strip_prefix("package:"))
        .unwrap_or("-")
        .to_string();
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
    Ok(format!("Caché de aplicaciones eliminada: {count} entradas"))
}

#[tauri::command]
pub async fn list_directory(serial: String, path: String) -> Result<Vec<FileEntry>, String> {
    let listing_path = if path == "/" {
        path.clone()
    } else {
        format!("{}/", path.trim_end_matches('/'))
    };
    let result = adb::run_adb_for_serial(&serial, &["shell", "ls", "-la", &listing_path]).await?;
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
        return Err("No se pudo obtener la miniatura".to_string());
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
        assert!(qr.service_name.starts_with("studio-"));
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
    let mut command = Command::new(executable);
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
        let output = Command::new(executable)
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
pub fn get_tools_status() -> ToolsStatus {
    tools::tools_status()
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
