use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

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
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolsSnapshot {
    pub tools: ToolsStatus,
    pub checking_updates: bool,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
}

static TOOLS_STATUS_CACHE: OnceLock<Mutex<Option<ToolsStatus>>> = OnceLock::new();
static TOOLS_STATUS_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
static TOOLS_UPDATES_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
static TOOLS_UPDATES_FINISHED: AtomicBool = AtomicBool::new(false);

fn cached_status() -> &'static Mutex<Option<ToolsStatus>> {
    TOOLS_STATUS_CACHE.get_or_init(|| Mutex::new(None))
}

fn updates_lock() -> &'static tokio::sync::Mutex<()> {
    TOOLS_UPDATES_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn status_lock() -> &'static tokio::sync::Mutex<()> {
    TOOLS_STATUS_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

pub fn invalidate_tools_cache() {
    if let Ok(mut cache) = cached_status().lock() {
        *cache = None;
    }
}

pub(crate) fn managed_dir(tool: &str) -> PathBuf {
    if tool == "adb" {
        crate::app_paths::data_dir().join("tools").join("platform-tools")
    } else {
        crate::app_paths::data_dir().join("tools").join(tool)
    }
}

pub(crate) fn executable_name(tool: &str) -> String {
    if cfg!(windows) {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    }
}

pub(crate) fn managed_executable(tool: &str) -> PathBuf {
    managed_dir(tool).join(executable_name(tool))
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
        _ => return Err(format!("Unknown tool: {tool}")),
    }
    crate::commands::operations::write_settings_sync(&config)?;
    invalidate_tools_cache();
    Ok(tools_status())
}

fn configured_path<'a>(
    config: &'a crate::commands::operations::AppSettings,
    tool: &str,
) -> &'a str {
    match tool {
        "adb" => &config.adb_path,
        "scrcpy" => &config.scrcpy_path,
        _ => "",
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
    let expected_name = executable_name(tool);
    let output = crate::process::command(lookup)
        .arg(&expected_name)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .find(|path| {
            path.is_file() && path.file_name().map_or(false, |name| {
                name.to_string_lossy().eq_ignore_ascii_case(&expected_name)
            })
        })
}


fn common_directories(tool: &str) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    #[cfg(windows)]
    {
        if tool == "adb" {
            if let Ok(localappdata) = env::var("LOCALAPPDATA") {
                dirs.push(PathBuf::from(localappdata).join(r"Android\Sdk\platform-tools"));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if tool == "adb" {
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
        if tool == "adb" {
            if let Ok(home) = env::var("HOME") {
                dirs.push(PathBuf::from(home).join("Android/Sdk/platform-tools"));
            }
        }
    }

    dirs
}

fn detect_tool_path(tool: &str) -> Option<PathBuf> {
    let env_candidate = if tool == "adb" {
        env::var("ANDROID_HOME").ok().map(|path| {
            PathBuf::from(path)
                .join("platform-tools")
                .to_string_lossy()
                .to_string()
        })
    } else {
        None
    };

    if let Some(val) = env_candidate {
        if let Some(path) = normalize_candidate(tool, &val) {
            return Some(path);
        }
    }

    if let Some(path) = system_path(tool) {
        return Some(path);
    }

    for root in common_directories(tool) {
        if let Some(path) = normalize_candidate(tool, root.to_string_lossy().as_ref()) {
            return Some(path);
        }
    }

    None
}

fn resolve_tool_path_with_config(
    tool: &str,
    config: &crate::commands::operations::AppSettings,
) -> Option<PathBuf> {
    #[cfg(store_build)]
    {
        let store_dir = crate::app_paths::resource_dir().join("store_tools");
        if tool == "scrcpy" {
            let scrcpy_bin = store_dir.join("scrcpy").join(executable_name(tool));
            return scrcpy_bin.is_file().then_some(scrcpy_bin);
        } else if tool == "adb" {
            let configured = configured_path(config, tool);
            let custom = normalize_candidate(tool, configured);
            if let Some(path) = custom {
                return Some(path);
            }
            let adb_bin = store_dir.join("platform-tools").join(executable_name(tool));
            return adb_bin.is_file().then_some(adb_bin);
        }
    }
    let configured = configured_path(config, tool);
    let custom = normalize_candidate(tool, configured);
    custom
        .or_else(|| {
            managed_executable(tool)
                .is_file()
                .then(|| managed_executable(tool))
        })
        .or_else(|| detect_tool_path(tool))
}

pub fn resolve_tool_path(tool: &str) -> Option<PathBuf> {
    if let Ok(cache) = cached_status().lock() {
        if let Some(status) = cache.as_ref() {
            let tool_status = match tool {
                "adb" => &status.adb,
                "scrcpy" => &status.scrcpy,
                _ => return None,
            };
            return (!tool_status.path.is_empty()).then(|| PathBuf::from(&tool_status.path));
        }
    }
    resolve_tool_path_with_config(tool, &read_config())
}

fn version_for(tool: &str, path: &Path) -> String {
    let argument = match tool {
        "adb" => "version",
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
            let first_line = combined
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("-")
                .trim();
            if tool == "scrcpy" {
                return first_line
                    .strip_prefix("scrcpy ")
                    .unwrap_or(first_line)
                    .split_whitespace()
                    .next()
                    .unwrap_or("-")
                    .to_string();
            }
            first_line.to_string()
        })
        .unwrap_or_else(|| "-".to_string())
}

fn adb_platform_tools_version(output: &str) -> Option<String> {
    output.lines()
        .map(str::trim)
        .find(|line| line.starts_with("Version "))
        .and_then(|line| {
            let version_part = line.strip_prefix("Version ")?.trim();
            let just_version = version_part.split('-').next()?;
            Some(just_version.to_string())
        })
}


fn status_for(tool: &str, config: &crate::commands::operations::AppSettings) -> ToolStatus {
    let path = resolve_tool_path_with_config(tool, config);
    let configured = configured_path(config, tool);
    let source = path
        .as_ref()
        .map(|candidate| {
            if !configured.is_empty()
                && normalize_candidate(tool, configured).as_ref() == Some(candidate)
            {
                "custom"
            } else if candidate == &managed_executable(tool) {
                "managed"
            } else {
                "system"
            }
        })
        .unwrap_or("missing")
        .to_string();
    ToolStatus {
        name: tool.to_string(),
        available: path.is_some(),
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
        install_supported: !cfg!(target_os = "linux"),
    }
}

fn persist_detected_paths(status: &ToolsStatus) {
    let detected = [&status.adb, &status.scrcpy];
    if !detected
        .iter()
        .any(|tool| tool.available && tool.source == "system" && !tool.path.is_empty())
    {
        return;
    }

    let mut config = read_config();
    let mut changed = false;
    for tool in detected {
        if !tool.available || tool.source != "system" || tool.path.is_empty() {
            continue;
        }
        let configured = match tool.name.as_str() {
            "adb" => &mut config.adb_path,
            "scrcpy" => &mut config.scrcpy_path,
            _ => continue,
        };
        if configured != &tool.path {
            configured.clone_from(&tool.path);
            changed = true;
        }
    }

    if changed {
        let _ = crate::commands::operations::write_settings_sync(&config);
    }
}
// REMOVER EN 2.5.0
#[cfg(not(store_build))]
fn migrate_legacy_adb_path() {
    let old_dir = crate::app_paths::data_dir().join("tools").join("adb").join("platform-tools");
    let new_dir = managed_dir("adb");
    if old_dir.is_dir() {
        if std::fs::create_dir_all(&new_dir).is_ok() {
            let _ = std::fs::rename(&old_dir, &new_dir);
            let _ = std::fs::remove_dir(crate::app_paths::data_dir().join("tools").join("adb"));
        }
    }
}
// REMOVER EN 2.5.0

pub fn tools_status() -> ToolsStatus {
    if let Ok(cache) = cached_status().lock() {
        if let Some(status) = cache.clone() {
            return status;
        }
    }
    // REMOVER EN 2.5.0
    #[cfg(not(store_build))]
    migrate_legacy_adb_path();
    // REMOVER EN 2.5.0

    let config = read_config();
    let mut adb = status_for("adb", &config);
    let mut scrcpy = status_for("scrcpy", &config);

    #[cfg(not(store_build))]
    {
        if let Ok(guard) = remote_adb().lock() {
            if let Some(latest) = guard.as_ref() {
                adb.update_checked = true;
                adb.update_available = adb.available && update_available("adb", latest, &adb.version);
                adb.latest_version = latest.clone();
            }
        }
        if let Ok(guard) = remote_scrcpy().lock() {
            if let Some(latest) = guard.as_ref() {
                scrcpy.update_checked = true;
                scrcpy.update_available = scrcpy.available && update_available("scrcpy", latest, &scrcpy.version);
                scrcpy.latest_version = latest.clone();
            }
        }
    }

    let status = ToolsStatus { adb, scrcpy };
    persist_detected_paths(&status);

    if let Ok(mut cache) = cached_status().lock() {
        *cache = Some(status.clone());
    }

    status
}

pub async fn tools_status_cached() -> ToolsStatus {
    if let Ok(cache) = cached_status().lock() {
        if let Some(status) = cache.clone() {
            return status;
        }
    }

    let _guard = status_lock().lock().await;
    if let Ok(cache) = cached_status().lock() {
        if let Some(status) = cache.clone() {
            return status;
        }
    }

    tauri::async_runtime::spawn_blocking(tools_status)
        .await
        .unwrap_or_else(|_| tools_status())
}

pub async fn tools_snapshot() -> ToolsSnapshot {
    let local = tools_status_cached().await;
    let finished = TOOLS_UPDATES_FINISHED.load(Ordering::Acquire);
    let tools = if finished {
        cached_status()
            .lock()
            .ok()
            .and_then(|cache| cache.clone())
            .unwrap_or(local)
    } else {
        local
    };
    ToolsSnapshot {
        tools,
        checking_updates: !finished,
    }
}

fn numeric_version(value: &str) -> Vec<u64> {
    value
        .split(|character: char| !character.is_ascii_digit() && character != '.')
        .find(|candidate| {
            candidate.contains('.') && candidate.bytes().any(|byte| byte.is_ascii_digit())
        })
        .map(|candidate| {
            candidate
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

#[cfg(not(store_build))]
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

    let mut current_idx = 0;
    while let Some(start_idx) = repository[current_idx..].find("<remotePackage path=\"platform-tools\"") {
        let block_start = current_idx + start_idx;
        let block_end = repository[block_start..].find("</remotePackage>").unwrap_or(repository.len() - block_start) + block_start;
        let block = &repository[block_start..block_end];

        // Google incluye múltiples canales en el XML (ej. channel-2 para Canary/Beta y channel-0 para Stable).
        // El archivo zip genérico 'latest' que descargamos corresponde a la versión Stable.
        // Iteramos los bloques y seleccionamos exclusivamente el channel-0.
        // Hacer esto evita coger la versión más alta (ej. 37.0.1) cuando el zip descargable
        // aún sigue entregando la antigua (37.0.0), lo que causaba un bucle de actualización falso.
        if block.contains("<channelRef ref=\"channel-0\"/>") {
            let rev_start = block.find("<revision>").ok_or_else(|| "Could not read the latest Platform Tools version".to_string())?;
            let rev_end = block[rev_start..].find("</revision>").unwrap_or(block.len() - rev_start) + rev_start;
            let revision_block = &block[rev_start..rev_end];

            let extract_tag = |tag: &str| -> Option<String> {
                let open_tag = format!("<{}>", tag);
                let close_tag = format!("</{}>", tag);
                let start = revision_block.find(&open_tag)? + open_tag.len();
                let end = revision_block[start..].find(&close_tag)?;
                Some(revision_block[start..start+end].trim().to_string())
            };

            let major = extract_tag("major").unwrap_or_else(|| "0".to_string());
            let minor = extract_tag("minor").unwrap_or_else(|| "0".to_string());
            let micro = extract_tag("micro").unwrap_or_else(|| "0".to_string());

            return Ok(format!("{}.{}.{}", major, minor, micro));
        }
        current_idx = block_end;
    }

    Err("Could not find the Stable Platform Tools version".to_string())
}

#[cfg(not(store_build))]
async fn latest_scrcpy_version(client: &reqwest::Client) -> Result<String, String> {
    let release = client
        .get("https://api.github.com/repos/Genymobile/scrcpy/releases/latest")
        .header(reqwest::header::USER_AGENT, "ADB App")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<GithubRelease>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(release.tag_name.trim_start_matches('v').to_string())
}

#[cfg(not(store_build))]
fn update_available(_tool: &str, latest: &str, installed: &str) -> bool {
    is_newer_version(latest, installed)
}

#[cfg(not(store_build))]
static LATEST_REMOTE_ADB: OnceLock<Mutex<Option<String>>> = OnceLock::new();
#[cfg(not(store_build))]
static LATEST_REMOTE_SCRCPY: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[cfg(not(store_build))]
fn remote_adb() -> &'static Mutex<Option<String>> {
    LATEST_REMOTE_ADB.get_or_init(|| Mutex::new(None))
}

#[cfg(not(store_build))]
fn remote_scrcpy() -> &'static Mutex<Option<String>> {
    LATEST_REMOTE_SCRCPY.get_or_init(|| Mutex::new(None))
}

pub fn force_check_updates_flag() {
    TOOLS_UPDATES_FINISHED.store(false, Ordering::Release);
}

pub async fn tools_status_with_updates() -> ToolsStatus {
    if TOOLS_UPDATES_FINISHED.load(Ordering::Acquire) {
        return tools_status_cached().await;
    }

    let _guard = updates_lock().lock().await;
    if TOOLS_UPDATES_FINISHED.load(Ordering::Acquire) {
        return tools_status_cached().await;
    }

    #[cfg(store_build)]
    {
        TOOLS_UPDATES_FINISHED.store(true, Ordering::Release);
        tools_status_cached().await
    }

    #[cfg(not(store_build))]
    {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .unwrap_or_default();
        let (adb_latest_res, scrcpy_latest_res) =
            tokio::join!(latest_adb_version(&client), latest_scrcpy_version(&client));

        if let Ok(latest) = adb_latest_res {
            if let Ok(mut guard) = remote_adb().lock() {
                *guard = Some(latest);
            }
        }

        if let Ok(latest) = scrcpy_latest_res {
            if let Ok(mut guard) = remote_scrcpy().lock() {
                *guard = Some(latest);
            }
        }

        invalidate_tools_cache();
        let status = tools_status_cached().await;

        TOOLS_UPDATES_FINISHED.store(true, Ordering::Release);

        status
    }
}

pub async fn install_or_update(tool: &str) -> Result<ToolsStatus, String> {
    let current_path = resolve_tool_path(tool);
    let target_dir = current_path.as_ref().and_then(|p| p.parent().map(|p| p.to_path_buf()));

    crate::dependencies::install_tool(tool, target_dir).await?;

    let is_managed = current_path.as_ref().map_or(false, |p| p == &managed_executable(tool));
    if current_path.is_none() || is_managed {
        let mut config = read_config();
        match tool {
            "adb" => config.adb_path.clear(),
            "scrcpy" => config.scrcpy_path.clear(),
            _ => {}
        }
        let _ = crate::commands::operations::write_settings_sync(&config);
    }

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
