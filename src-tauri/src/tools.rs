use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use regex::Regex;
use serde::Serialize;

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
}

static TOOLS_STATUS_CACHE: OnceLock<Mutex<Option<ToolsStatus>>> = OnceLock::new();
static TOOLS_UPDATES_CACHE: OnceLock<Mutex<Option<ToolsStatus>>> = OnceLock::new();
static TOOLS_UPDATES_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn cached_status() -> &'static Mutex<Option<ToolsStatus>> {
    TOOLS_STATUS_CACHE.get_or_init(|| Mutex::new(None))
}

fn cached_updates() -> &'static Mutex<Option<ToolsStatus>> {
    TOOLS_UPDATES_CACHE.get_or_init(|| Mutex::new(None))
}

fn updates_lock() -> &'static tokio::sync::Mutex<()> {
    TOOLS_UPDATES_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

pub fn invalidate_tools_cache() {
    if let Ok(mut cache) = cached_status().lock() {
        *cache = None;
    }
    if let Ok(mut cache) = cached_updates().lock() {
        *cache = None;
    }
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

pub fn read_config() -> crate::commands::operations::AppSettings {
    crate::commands::operations::read_settings()
}

pub fn save_tool_path(tool: &str, path: &str) -> Result<ToolsStatus, String> {
    let mut config = read_config();
    let normalized = path.trim().trim_matches('"').to_string();
    match tool {
        "adb" => config.adb_path = normalized,
        "scrcpy" => config.scrcpy_path = normalized,
        "java" => config.java_path = normalized,
        _ => return Err(format!("Unknown tool: {tool}")),
    }
    crate::commands::operations::write_settings_sync(&config)?;
    invalidate_tools_cache();
    Ok(tools_status())
}

fn custom_path(tool: &str) -> String {
    let config = read_config();
    match tool {
        "adb" => config.adb_path,
        "scrcpy" => config.scrcpy_path,
        "java" => config.java_path,
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
    let output = crate::process::command(lookup)
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

fn common_directories(tool: &str) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    #[cfg(windows)]
    {
        if tool == "java" {
            dirs.extend(vec![
                PathBuf::from(r"C:\Program Files\Eclipse Adoptium"),
                PathBuf::from(r"C:\Program Files\Java"),
                PathBuf::from(r"C:\Program Files\Microsoft"),
                PathBuf::from(r"C:\Program Files\Android\Android Studio\jbr"),
            ]);
        } else if tool == "adb" {
            if let Ok(localappdata) = env::var("LOCALAPPDATA") {
                dirs.push(PathBuf::from(localappdata).join(r"Android\Sdk\platform-tools"));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if tool == "java" {
            dirs.extend(vec![
                PathBuf::from("/Library/Java/JavaVirtualMachines"),
                PathBuf::from("/System/Library/Java/JavaVirtualMachines"),
            ]);
        } else if tool == "adb" {
            if let Ok(home) = env::var("HOME") {
                dirs.push(PathBuf::from(home).join("Library/Android/sdk/platform-tools"));
            }
            dirs.push(PathBuf::from("/opt/homebrew/bin"));
            dirs.push(PathBuf::from("/usr/local/bin"));
        } else if tool == "scrcpy" {
            dirs.push(PathBuf::from("/opt/homebrew/bin"));
            dirs.push(PathBuf::from("/usr/local/bin"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if tool == "java" {
            dirs.extend(vec![PathBuf::from("/usr/lib/jvm")]);
        } else if tool == "adb" {
            if let Ok(home) = env::var("HOME") {
                dirs.push(PathBuf::from(home).join("Android/Sdk/platform-tools"));
            }
        }
    }

    dirs
}

fn tool_from_windows_registry(tool: &str) -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    if tool == "java" {
        let keys = [
            r"HKLM\SOFTWARE\Eclipse Adoptium\JDK",
            r"HKLM\SOFTWARE\Eclipse Adoptium\JRE",
            r"HKLM\SOFTWARE\JavaSoft\JDK",
            r"HKLM\SOFTWARE\JavaSoft\Java Runtime Environment",
        ];
        for key in keys {
            let versions = crate::process::command("reg")
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
                    let output = crate::process::command("reg")
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
    }
    None
}

fn detect_tool_path(tool: &str) -> Option<PathBuf> {
    let env_candidate = match tool {
        "java" => env::var("JAVA_HOME").ok(),
        "adb" => env::var("ANDROID_HOME").ok().map(|p| {
            PathBuf::from(p)
                .join("platform-tools")
                .to_string_lossy()
                .to_string()
        }),
        _ => None,
    };

    if let Some(val) = env_candidate {
        if let Some(path) = normalize_candidate(tool, &val) {
            return Some(path);
        }
    }

    if let Some(path) = system_path(tool) {
        return Some(path);
    }

    if let Some(path) = tool_from_windows_registry(tool) {
        return Some(path);
    }

    for root in common_directories(tool) {
        if let Some(path) = normalize_candidate(tool, root.to_string_lossy().as_ref()) {
            return Some(path);
        }
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let candidate_path = entry.path();
                #[cfg(target_os = "macos")]
                {
                    if tool == "java" {
                        if let Some(path) = normalize_candidate(
                            tool,
                            candidate_path
                                .join("Contents/Home")
                                .to_string_lossy()
                                .as_ref(),
                        ) {
                            return Some(path);
                        }
                    }
                }

                if let Some(path) =
                    normalize_candidate(tool, candidate_path.to_string_lossy().as_ref())
                {
                    return Some(path);
                }
            }
        }
    }

    None
}

pub fn resolve_tool_path(tool: &str) -> Option<PathBuf> {
    normalize_candidate(tool, &custom_path(tool))
        .or_else(|| {
            (tool != "java" && managed_executable(tool).is_file()).then(|| managed_executable(tool))
        })
        .or_else(|| detect_tool_path(tool))
}

fn version_for(tool: &str, path: &Path) -> String {
    let argument = match tool {
        "adb" => "version",
        "java" => "-version",
        _ => "--version",
    };
    let output = crate::process::command(path).arg(argument).output();
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
    let output = crate::process::command(path).arg("-version").output();
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
    if let Ok(cache) = cached_status().lock() {
        if let Some(status) = cache.clone() {
            return status;
        }
    }

    let status = ToolsStatus {
        adb: status_for("adb"),
        scrcpy: status_for("scrcpy"),
        java: status_for("java"),
    };

    if let Ok(mut cache) = cached_status().lock() {
        *cache = Some(status.clone());
    }

    status
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
    .ok_or_else(|| "Could not read the latest Platform Tools version".to_string())?;
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
        .ok_or_else(|| "Could not download the latest scrcpy version".to_string())
}

fn update_available(_tool: &str, latest: &str, installed: &str) -> bool {
    is_newer_version(latest, installed)
}

pub async fn tools_status_with_updates() -> ToolsStatus {
    if let Ok(cache) = cached_updates().lock() {
        if let Some(status) = cache.clone() {
            return status;
        }
    }

    let _guard = updates_lock().lock().await;
    if let Ok(cache) = cached_updates().lock() {
        if let Some(status) = cache.clone() {
            return status;
        }
    }

    let mut status = tools_status();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .unwrap_or_default();
    let (adb_latest, scrcpy_latest) =
        tokio::join!(latest_adb_version(&client), latest_scrcpy_version(&client),);
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
    if let Ok(mut cache) = cached_updates().lock() {
        *cache = Some(status.clone());
    }
    status
}

pub fn install_or_update(tool: &str) -> Result<ToolsStatus, String> {
    crate::dependencies::install_tool(tool)?;
    let mut config = read_config();
    match tool {
        "adb" => config.adb_path.clear(),
        "scrcpy" => config.scrcpy_path.clear(),
        _ => {}
    }
    crate::commands::operations::write_settings_sync(&config)?;
    invalidate_tools_cache();
    Ok(tools_status())
}

#[cfg(test)]
mod tests {
    use super::{adb_platform_tools_version, is_newer_version};

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
}
