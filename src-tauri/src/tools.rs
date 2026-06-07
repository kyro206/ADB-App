use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ToolConfig {
    pub adb_path: String,
    pub scrcpy_path: String,
    pub java_path: String,
    pub aapt2_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolStatus {
    pub name: String,
    pub available: bool,
    pub version: String,
    pub latest_version: String,
    pub update_checked: bool,
    pub update_available: bool,
    pub path: String,
    pub source: String,
    pub install_supported: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolsStatus {
    pub adb: ToolStatus,
    pub scrcpy: ToolStatus,
    pub java: ToolStatus,
    pub aapt2: ToolStatus,
}

fn config_path() -> PathBuf {
    crate::app_paths::config_dir().join("tools.json")
}

pub(crate) fn managed_dir(tool: &str) -> PathBuf {
    crate::app_paths::data_dir()
        .join("tools")
        .join(tool)
        .join("managed")
}

pub(crate) fn executable_name(tool: &str) -> String {
    if cfg!(windows) {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    }
}

pub(crate) fn managed_executable(tool: &str) -> PathBuf {
    if tool == "adb" {
        managed_dir(tool)
            .join("platform-tools")
            .join(executable_name(tool))
    } else {
        managed_dir(tool).join(executable_name(tool))
    }
}

pub fn read_config() -> ToolConfig {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default()
}

pub fn save_tool_path(tool: &str, path: &str) -> Result<ToolsStatus, String> {
    let mut config = read_config();
    let normalized = path.trim().trim_matches('"').to_string();
    match tool {
        "adb" => config.adb_path = normalized,
        "scrcpy" => config.scrcpy_path = normalized,
        "java" => config.java_path = normalized,
        "aapt2" => config.aapt2_path = normalized,
        _ => return Err(format!("Unknown tool: {tool}")),
    }
    fs::create_dir_all(crate::app_paths::config_dir()).map_err(|error| error.to_string())?;
    fs::write(
        config_path(),
        serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(tools_status())
}

fn custom_path(tool: &str) -> String {
    let config = read_config();
    match tool {
        "adb" => config.adb_path,
        "scrcpy" => config.scrcpy_path,
        "java" => config.java_path,
        "aapt2" => config.aapt2_path,
        _ => String::new(),
    }
}

fn normalize_candidate(tool: &str, value: &str) -> Option<PathBuf> {
    if value.trim().is_empty() {
        return None;
    }
    let candidate = PathBuf::from(value);
    let candidate = if candidate.is_dir() {
        let direct = candidate.join(executable_name(tool));
        if direct.is_file() {
            direct
        } else if tool == "java" {
            candidate.join("bin").join(executable_name(tool))
        } else {
            direct
        }
    } else {
        candidate
    };
    candidate.is_file().then_some(candidate)
}

fn system_path(tool: &str) -> Option<PathBuf> {
    let lookup = if cfg!(windows) { "where" } else { "which" };
    let output = Command::new(lookup)
        .arg(executable_name(tool))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file())
}

fn java_from_windows_registry() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let keys = [
        r"HKLM\SOFTWARE\Eclipse Adoptium\JDK",
        r"HKLM\SOFTWARE\Eclipse Adoptium\JRE",
        r"HKLM\SOFTWARE\JavaSoft\JDK",
        r"HKLM\SOFTWARE\JavaSoft\Java Runtime Environment",
    ];
    for key in keys {
        let versions = Command::new("reg")
            .args(["query", key])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
            .unwrap_or_default();
        for version_key in versions
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("HKEY"))
        {
            for value_name in ["Path", "JavaHome"] {
                let output = Command::new("reg")
                    .args(["query", version_key, "/v", value_name])
                    .output()
                    .ok()
                    .filter(|output| output.status.success())
                    .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
                    .unwrap_or_default();
                if let Some(path) = output
                    .lines()
                    .find(|line| line.contains("REG_SZ"))
                    .and_then(|line| line.split("REG_SZ").nth(1))
                    .map(str::trim)
                    .and_then(|path| normalize_candidate("java", path))
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn java_from_common_directories() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let roots = [
        PathBuf::from(r"C:\Program Files\Eclipse Adoptium"),
        PathBuf::from(r"C:\Program Files\Java"),
        PathBuf::from(r"C:\Program Files\Microsoft"),
        PathBuf::from(r"C:\Program Files\Android\Android Studio\jbr"),
    ];
    for root in roots {
        if let Some(path) = normalize_candidate("java", root.to_string_lossy().as_ref()) {
            return Some(path);
        }
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            if let Some(path) = normalize_candidate("java", entry.path().to_string_lossy().as_ref())
            {
                return Some(path);
            }
        }
    }
    None
}

fn detected_java_path() -> Option<PathBuf> {
    env::var("JAVA_HOME")
        .ok()
        .and_then(|path| normalize_candidate("java", &path))
        .or_else(|| system_path("java"))
        .or_else(java_from_windows_registry)
        .or_else(java_from_common_directories)
}

fn aapt2_build_tools_candidates(sdk_root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(sdk_root.join("build-tools")) else {
        return Vec::new();
    };
    let mut candidates = entries
        .flatten()
        .map(|entry| entry.path().join(executable_name("aapt2")))
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.cmp(left));
    candidates
}

fn detected_aapt2_path() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for variable in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Some(root) = env::var_os(variable) {
            candidates.extend(aapt2_build_tools_candidates(&PathBuf::from(root)));
        }
    }
    if let Some(adb_path) = resolve_tool_path("adb") {
        if let Some(sdk_root) = adb_path.parent().and_then(Path::parent) {
            candidates.extend(aapt2_build_tools_candidates(sdk_root));
        }
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .or_else(|| system_path("aapt2"))
}

pub fn resolve_tool_path(tool: &str) -> Option<PathBuf> {
    normalize_candidate(tool, &custom_path(tool))
        .or_else(|| {
            (tool != "java" && managed_executable(tool).is_file()).then(|| managed_executable(tool))
        })
        .or_else(|| match tool {
            "java" => detected_java_path(),
            "aapt2" => detected_aapt2_path(),
            _ => system_path(tool),
        })
}

fn version_for(tool: &str, path: &Path) -> String {
    let argument = match tool {
        "adb" => "version",
        "java" => "-version",
        "aapt2" => "version",
        _ => "--version",
    };
    let output = Command::new(path).arg(argument).output();
    output
        .ok()
        .map(|result| {
            let stdout = String::from_utf8_lossy(&result.stdout);
            let stderr = String::from_utf8_lossy(&result.stderr);
            let combined = format!("{stdout}\n{stderr}");
            if tool == "adb" {
                return adb_platform_tools_version(&combined).unwrap_or_else(|| "-".to_string());
            }
            combined
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("-")
                .trim()
                .to_string()
        })
        .unwrap_or_else(|| "-".to_string())
}

fn adb_platform_tools_version(output: &str) -> Option<String> {
    Regex::new(r"(?m)^\s*Version\s+(\d+\.\d+\.\d+)(?:-\d+)?\s*$")
        .ok()?
        .captures(output)?
        .get(1)
        .map(|value| value.as_str().to_string())
}

fn java_major_version(path: &Path) -> i32 {
    let output = Command::new(path).arg("-version").output();
    let text = output
        .ok()
        .map(|result| {
            format!(
                "{}{}",
                String::from_utf8_lossy(&result.stdout),
                String::from_utf8_lossy(&result.stderr)
            )
        })
        .unwrap_or_default();
    let Some(version) = text.split('"').nth(1) else {
        return 0;
    };
    let mut parts = version.split('.');
    let first = parts
        .next()
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(0);
    if first == 1 {
        parts
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0)
    } else {
        first
    }
}

fn status_for(tool: &str) -> ToolStatus {
    let path = resolve_tool_path(tool);
    let custom = custom_path(tool);
    let source = path
        .as_ref()
        .map(|candidate| {
            if !custom.is_empty() && normalize_candidate(tool, &custom).as_ref() == Some(candidate)
            {
                "custom"
            } else if tool != "java" && candidate == &managed_executable(tool) {
                "managed"
            } else {
                "system"
            }
        })
        .unwrap_or("missing")
        .to_string();
    ToolStatus {
        name: tool.to_string(),
        available: path
            .as_ref()
            .is_some_and(|value| tool != "java" || java_major_version(value) >= 11),
        version: path
            .as_ref()
            .map(|value| version_for(tool, value))
            .unwrap_or_else(|| "-".to_string()),
        latest_version: String::new(),
        update_checked: false,
        update_available: false,
        path: path
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default(),
        source,
        install_supported: !cfg!(target_os = "linux") && tool != "java",
    }
}

pub fn tools_status() -> ToolsStatus {
    ToolsStatus {
        adb: status_for("adb"),
        scrcpy: status_for("scrcpy"),
        java: status_for("java"),
        aapt2: status_for("aapt2"),
    }
}

fn numeric_version(value: &str) -> Vec<u64> {
    Regex::new(r"\d+(?:\.\d+)+")
        .ok()
        .and_then(|pattern| pattern.find(value))
        .map(|matched| {
            matched
                .as_str()
                .split('.')
                .filter_map(|part| part.parse::<u64>().ok())
                .collect()
        })
        .unwrap_or_default()
}

fn is_newer_version(latest: &str, installed: &str) -> bool {
    let mut latest_parts = numeric_version(latest);
    let mut installed_parts = numeric_version(installed);
    let length = latest_parts.len().max(installed_parts.len());
    latest_parts.resize(length, 0);
    installed_parts.resize(length, 0);
    !latest_parts.is_empty() && latest_parts > installed_parts
}

async fn latest_adb_version(client: &reqwest::Client) -> Result<String, String> {
    let repository = client
        .get("https://dl.google.com/android/repository/repository2-1.xml")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let package = Regex::new(
        r#"(?s)<remotePackage path="platform-tools".*?<revision>\s*<major>(\d+)</major>(?:\s*<minor>(\d+)</minor>)?(?:\s*<micro>(\d+)</micro>)?"#,
    )
    .map_err(|error| error.to_string())?
    .captures(&repository)
    .ok_or_else(|| "No se pudo leer la última versión de Platform Tools".to_string())?;
    Ok(format!(
        "{}.{}.{}",
        package.get(1).map_or("0", |value| value.as_str()),
        package.get(2).map_or("0", |value| value.as_str()),
        package.get(3).map_or("0", |value| value.as_str())
    ))
}

async fn latest_scrcpy_version(client: &reqwest::Client) -> Result<String, String> {
    let release = client
        .get("https://api.github.com/repos/Genymobile/scrcpy/releases/latest")
        .header(reqwest::header::USER_AGENT, "ADB-Manager")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|error| error.to_string())?;
    release
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .map(|value| value.trim_start_matches('v').to_string())
        .ok_or_else(|| "No se pudo leer la última versión de scrcpy".to_string())
}

fn latest_stable_aapt2_version(metadata: &str) -> Option<String> {
    let pattern = Regex::new(r"<version>([^<]+)</version>").ok()?;
    let versions = pattern
        .captures_iter(metadata)
        .filter_map(|capture| capture.get(1))
        .map(|value| value.as_str().trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    versions
        .iter()
        .rev()
        .find(|version| {
            let normalized = version.to_ascii_lowercase();
            !normalized.contains("alpha")
                && !normalized.contains("beta")
                && !normalized.contains("rc")
        })
        .or_else(|| versions.last())
        .map(|value| value.to_string())
}

async fn latest_aapt2_version(client: &reqwest::Client) -> Result<String, String> {
    let metadata = client
        .get("https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/maven-metadata.xml")
        .header(reqwest::header::USER_AGENT, "ADB-App")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    latest_stable_aapt2_version(&metadata)
        .ok_or_else(|| "No se pudo leer la última versión estable de AAPT2".to_string())
}

fn aapt2_build_id(value: &str) -> Option<u64> {
    Regex::new(r"-(\d{5,})")
        .ok()?
        .captures_iter(value)
        .last()?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

fn update_available(tool: &str, latest: &str, installed: &str) -> bool {
    if tool == "aapt2" {
        return match (aapt2_build_id(latest), aapt2_build_id(installed)) {
            (Some(latest), Some(installed)) => latest > installed,
            _ => false,
        };
    }
    is_newer_version(latest, installed)
}

pub async fn tools_status_with_updates() -> ToolsStatus {
    let mut status = tools_status();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .unwrap_or_default();
    let (adb_latest, scrcpy_latest, aapt2_latest) = tokio::join!(
        latest_adb_version(&client),
        latest_scrcpy_version(&client),
        latest_aapt2_version(&client)
    );
    if let Ok(latest) = adb_latest {
        status.adb.update_checked = true;
        status.adb.update_available =
            status.adb.available && update_available("adb", &latest, &status.adb.version);
        status.adb.latest_version = latest;
    }
    if let Ok(latest) = scrcpy_latest {
        status.scrcpy.update_checked = true;
        status.scrcpy.update_available =
            status.scrcpy.available && update_available("scrcpy", &latest, &status.scrcpy.version);
        status.scrcpy.latest_version = latest;
    }
    if let Ok(latest) = aapt2_latest {
        status.aapt2.update_checked = true;
        status.aapt2.update_available =
            status.aapt2.available && update_available("aapt2", &latest, &status.aapt2.version);
        status.aapt2.latest_version = latest;
    }
    status
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArchiveKind {
    Zip,
    TarGz,
}

fn adb_download() -> Result<(&'static str, ArchiveKind), String> {
    adb_download_for(env::consts::OS)
}

fn adb_download_for(os: &str) -> Result<(&'static str, ArchiveKind), String> {
    Ok((
        match os {
            "windows" => {
                "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
            }
            "macos" => "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip",
            "linux" => "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
            _ => return Err("ADB no ofrece Platform Tools para este sistema operativo".to_string()),
        },
        ArchiveKind::Zip,
    ))
}

fn scrcpy_asset_pattern() -> Result<(String, ArchiveKind), String> {
    scrcpy_asset_pattern_for(env::consts::OS, env::consts::ARCH)
}

fn scrcpy_asset_pattern_for(os: &str, architecture: &str) -> Result<(String, ArchiveKind), String> {
    match (os, architecture) {
        ("windows", "x86_64") => Ok(("scrcpy-win64-".to_string(), ArchiveKind::Zip)),
        ("windows", "x86") => Ok(("scrcpy-win32-".to_string(), ArchiveKind::Zip)),
        ("linux", "x86_64") => Ok(("scrcpy-linux-x86_64-".to_string(), ArchiveKind::TarGz)),
        ("macos", "x86_64") => Ok(("scrcpy-macos-x86_64-".to_string(), ArchiveKind::TarGz)),
        ("macos", "aarch64") => Ok(("scrcpy-macos-aarch64-".to_string(), ArchiveKind::TarGz)),
        _ => Err(format!(
            "scrcpy no publica un binario gestionado para {} {}. Instálalo con el gestor de paquetes del sistema y usa Detección automática.",
            os,
            architecture
        )),
    }
}

fn latest_scrcpy_asset(
    client: &reqwest::blocking::Client,
) -> Result<(String, ArchiveKind), String> {
    let (pattern, kind) = scrcpy_asset_pattern()?;
    let release = client
        .get("https://api.github.com/repos/Genymobile/scrcpy/releases/latest")
        .header(reqwest::header::USER_AGENT, "ADB-Manager")
        .send()
        .map_err(|error| format!("No se pudo consultar scrcpy: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub rechazó la consulta de scrcpy: {error}"))?
        .json::<serde_json::Value>()
        .map_err(|error| format!("No se pudo leer la respuesta de scrcpy: {error}"))?;
    release
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .and_then(|assets| {
            assets.iter().find_map(|asset| {
                let name = asset.get("name")?.as_str()?;
                let extension_matches = match kind {
                    ArchiveKind::Zip => name.ends_with(".zip"),
                    ArchiveKind::TarGz => name.ends_with(".tar.gz"),
                };
                (name.starts_with(&pattern) && extension_matches)
                    .then(|| {
                        asset
                            .get("browser_download_url")?
                            .as_str()
                            .map(str::to_string)
                    })
                    .flatten()
            })
        })
        .map(|url| (url, kind))
        .ok_or_else(|| {
            format!(
                "La última versión de scrcpy no incluye un archivo compatible con {} {}",
                env::consts::OS,
                env::consts::ARCH
            )
        })
}

fn aapt2_classifier_for(os: &str) -> Result<&'static str, String> {
    match os {
        "windows" => Ok("windows"),
        "macos" => Ok("osx"),
        "linux" => Ok("linux"),
        _ => Err("AAPT2 no ofrece un binario para este sistema operativo".to_string()),
    }
}

fn latest_aapt2_asset(client: &reqwest::blocking::Client) -> Result<(String, ArchiveKind), String> {
    let metadata = client
        .get("https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/maven-metadata.xml")
        .header(reqwest::header::USER_AGENT, "ADB-App")
        .send()
        .map_err(|error| format!("No se pudo consultar AAPT2: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Google Maven rechazó la consulta de AAPT2: {error}"))?
        .text()
        .map_err(|error| format!("No se pudo leer la respuesta de AAPT2: {error}"))?;
    let version = latest_stable_aapt2_version(&metadata)
        .ok_or_else(|| "No se pudo determinar la última versión estable de AAPT2".to_string())?;
    let classifier = aapt2_classifier_for(env::consts::OS)?;
    Ok((
        format!(
            "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/{version}/aapt2-{version}-{classifier}.jar"
        ),
        ArchiveKind::Zip,
    ))
}

fn download_bytes(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, String> {
    client
        .get(url)
        .header(reqwest::header::USER_AGENT, "ADB-Manager")
        .send()
        .map_err(|error| format!("No se pudo descargar la herramienta: {error}"))?
        .error_for_status()
        .map_err(|error| format!("La descarga de la herramienta falló: {error}"))?
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("No se pudo leer la descarga: {error}"))
}

fn extract_archive(bytes: &[u8], kind: ArchiveKind, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    if kind == ArchiveKind::Zip {
        let reader = std::io::Cursor::new(bytes);
        let mut archive =
            zip::ZipArchive::new(reader).map_err(|error| format!("ZIP no válido: {error}"))?;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| format!("No se pudo leer el ZIP: {error}"))?;
            let Some(relative_path) = entry.enclosed_name() else {
                return Err("El ZIP contiene una ruta no segura".to_string());
            };
            let output_path = destination.join(relative_path);
            if entry.is_dir() {
                fs::create_dir_all(&output_path).map_err(|error| error.to_string())?;
                continue;
            }
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut output = fs::File::create(&output_path).map_err(|error| error.to_string())?;
            io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let archive_path = destination.with_extension(match kind {
        ArchiveKind::Zip => "zip",
        ArchiveKind::TarGz => "tar.gz",
    });
    fs::write(&archive_path, bytes).map_err(|error| error.to_string())?;

    let status = Command::new("tar")
        .arg("-xzf")
        .arg(&archive_path)
        .arg("-C")
        .arg(destination)
        .status()
        .map_err(|error| format!("No se pudo iniciar el extractor del sistema: {error}"))?;
    let _ = fs::remove_file(&archive_path);
    if status.success() {
        Ok(())
    } else {
        Err("El extractor del sistema no pudo abrir la descarga".to_string())
    }
}

fn find_file(directory: &Path, name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(directory).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().is_some_and(|value| value == name) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

fn remove_directory_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn install_archive(tool: &str, bytes: &[u8], kind: ArchiveKind) -> Result<(), String> {
    let target = managed_dir(tool);
    let parent = target
        .parent()
        .ok_or_else(|| "No se pudo preparar la carpeta de la herramienta".to_string())?;
    let staging = parent.join("staging");
    remove_directory_if_present(&staging)?;
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    extract_archive(bytes, kind, &staging)?;

    let executable = find_file(&staging, &executable_name(tool)).ok_or_else(|| {
        format!(
            "El archivo descargado no contiene {}",
            executable_name(tool)
        )
    })?;
    let extracted_root = if tool == "adb" {
        staging.clone()
    } else {
        executable
            .parent()
            .ok_or_else(|| "La herramienta extraída no tiene una carpeta válida".to_string())?
            .to_path_buf()
    };

    remove_directory_if_present(&target)?;
    fs::rename(&extracted_root, &target)
        .map_err(|error| format!("No se pudo activar la herramienta descargada: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let installed = managed_executable(tool);
        let mut permissions = fs::metadata(&installed)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(permissions.mode() | 0o111);
        fs::set_permissions(installed, permissions).map_err(|error| error.to_string())?;
    }
    if staging != target {
        remove_directory_if_present(&staging)?;
    }
    Ok(())
}

pub fn install_or_update(tool: &str) -> Result<ToolsStatus, String> {
    crate::dependencies::install_tool(tool)?;
    let mut config = read_config();
    match tool {
        "adb" => config.adb_path.clear(),
        "scrcpy" => config.scrcpy_path.clear(),
        "aapt2" => config.aapt2_path.clear(),
        _ => {}
    }
    fs::create_dir_all(crate::app_paths::config_dir()).map_err(|error| error.to_string())?;
    fs::write(
        config_path(),
        serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(tools_status())
}

#[cfg(test)]
mod tests {
    use super::{
        aapt2_build_id, aapt2_classifier_for, adb_download_for, adb_platform_tools_version,
        is_newer_version, latest_stable_aapt2_version, scrcpy_asset_pattern_for, update_available,
        ArchiveKind,
    };

    #[test]
    fn compares_tool_versions_numerically() {
        assert!(is_newer_version("37.0.1", "37.0.0"));
        assert!(is_newer_version("4.1", "scrcpy 4.0"));
        assert!(!is_newer_version("4.0", "scrcpy 4.0"));
        assert!(!is_newer_version("36.0.2", "37.0.0"));
    }

    #[test]
    fn extracts_platform_tools_version_instead_of_adb_protocol_version() {
        let output = "Android Debug Bridge version 1.0.41\nVersion 37.0.0-14910828\nInstalled as C:\\Terminal\\adb\\adb.exe";
        assert_eq!(
            adb_platform_tools_version(output).as_deref(),
            Some("37.0.0")
        );
    }

    #[test]
    fn selects_adb_archives_for_all_supported_platforms() {
        for (os, suffix) in [
            ("windows", "windows.zip"),
            ("macos", "darwin.zip"),
            ("linux", "linux.zip"),
        ] {
            let (url, kind) = adb_download_for(os).expect("desktop platform should support adb");
            assert!(url.ends_with(suffix));
            assert_eq!(kind, ArchiveKind::Zip);
        }
        assert!(adb_download_for("freebsd").is_err());
    }

    #[test]
    fn selects_scrcpy_archives_for_supported_desktop_targets() {
        assert_eq!(
            scrcpy_asset_pattern_for("windows", "x86_64"),
            Ok(("scrcpy-win64-".to_string(), ArchiveKind::Zip))
        );
        assert_eq!(
            scrcpy_asset_pattern_for("linux", "x86_64"),
            Ok(("scrcpy-linux-x86_64-".to_string(), ArchiveKind::TarGz))
        );
        assert_eq!(
            scrcpy_asset_pattern_for("macos", "x86_64"),
            Ok(("scrcpy-macos-x86_64-".to_string(), ArchiveKind::TarGz))
        );
        assert_eq!(
            scrcpy_asset_pattern_for("macos", "aarch64"),
            Ok(("scrcpy-macos-aarch64-".to_string(), ArchiveKind::TarGz))
        );
        assert!(scrcpy_asset_pattern_for("linux", "aarch64").is_err());
    }

    #[test]
    fn selects_aapt2_classifiers_for_all_supported_platforms() {
        assert_eq!(aapt2_classifier_for("windows"), Ok("windows"));
        assert_eq!(aapt2_classifier_for("macos"), Ok("osx"));
        assert_eq!(aapt2_classifier_for("linux"), Ok("linux"));
        assert!(aapt2_classifier_for("freebsd").is_err());
    }

    #[test]
    fn selects_latest_stable_aapt2_and_compares_build_ids() {
        let metadata = "<version>8.9.0-alpha01-10000000</version><version>8.8.2-12000000</version><version>8.9.0-beta01-13000000</version>";
        assert_eq!(
            latest_stable_aapt2_version(metadata).as_deref(),
            Some("8.8.2-12000000")
        );
        assert_eq!(
            aapt2_build_id("Android Asset Packaging Tool (aapt) 2.20-15009934"),
            Some(15009934)
        );
        assert!(update_available(
            "aapt2",
            "8.12.0-16000000",
            "Android Asset Packaging Tool (aapt) 2.20-15009934"
        ));
    }
}
