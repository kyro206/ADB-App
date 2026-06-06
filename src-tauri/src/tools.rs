use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToolConfig {
    pub adb_path: String,
    pub scrcpy_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolStatus {
    pub name: String,
    pub available: bool,
    pub version: String,
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolsStatus {
    pub adb: ToolStatus,
    pub scrcpy: ToolStatus,
}

fn app_data_dir() -> PathBuf {
    env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(env::temp_dir)
        .join("ADB Manager")
}

fn config_path() -> PathBuf {
    app_data_dir().join("tools.json")
}

fn managed_dir(tool: &str) -> PathBuf {
    app_data_dir().join("tools").join(tool).join("managed")
}

fn executable_name(tool: &str) -> String {
    if cfg!(windows) {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    }
}

fn managed_executable(tool: &str) -> PathBuf {
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
        _ => return Err(format!("Unknown tool: {tool}")),
    }
    fs::create_dir_all(app_data_dir()).map_err(|error| error.to_string())?;
    fs::write(
        config_path(),
        serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(tools_status())
}

fn custom_path(tool: &str) -> String {
    let config = read_config();
    if tool == "adb" {
        config.adb_path
    } else {
        config.scrcpy_path
    }
}

fn normalize_candidate(tool: &str, value: &str) -> Option<PathBuf> {
    if value.trim().is_empty() {
        return None;
    }
    let candidate = PathBuf::from(value);
    let candidate = if candidate.is_dir() {
        candidate.join(executable_name(tool))
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

pub fn resolve_tool_path(tool: &str) -> Option<PathBuf> {
    normalize_candidate(tool, &custom_path(tool))
        .or_else(|| {
            managed_executable(tool)
                .is_file()
                .then(|| managed_executable(tool))
        })
        .or_else(|| system_path(tool))
}

fn version_for(tool: &str, path: &Path) -> String {
    let argument = if tool == "adb" {
        "version"
    } else {
        "--version"
    };
    let output = Command::new(path).arg(argument).output();
    output
        .ok()
        .map(|result| {
            let stdout = String::from_utf8_lossy(&result.stdout);
            let stderr = String::from_utf8_lossy(&result.stderr);
            format!("{stdout}\n{stderr}")
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("-")
                .trim()
                .to_string()
        })
        .unwrap_or_else(|| "-".to_string())
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
        path: path
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default(),
        source,
    }
}

pub fn tools_status() -> ToolsStatus {
    ToolsStatus {
        adb: status_for("adb"),
        scrcpy: status_for("scrcpy"),
    }
}

fn run_powershell(script: &str) -> Result<(), String> {
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .status()
        .map_err(|error| format!("Could not start PowerShell: {error}"))?;
    status
        .success()
        .then_some(())
        .ok_or_else(|| "Tool download or extraction failed".to_string())
}

pub fn install_or_update(tool: &str) -> Result<ToolsStatus, String> {
    if !cfg!(windows) {
        return Err("Managed installation is currently available on Windows only".to_string());
    }
    let target = managed_dir(tool);
    fs::create_dir_all(target.parent().unwrap_or(&target)).map_err(|error| error.to_string())?;
    let escaped_target = target.to_string_lossy().replace('\'', "''");

    let script = match tool {
        "adb" => format!(
            "$ErrorActionPreference='Stop'; $target='{escaped_target}'; $zip=Join-Path $env:TEMP 'adb-manager-platform-tools.zip'; Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip; if(Test-Path $target){{Remove-Item $target -Recurse -Force}}; New-Item -ItemType Directory -Path $target -Force|Out-Null; Expand-Archive $zip $target -Force; Remove-Item $zip -Force"
        ),
        "scrcpy" => format!(
            "$ErrorActionPreference='Stop'; $target='{escaped_target}'; $release=Invoke-RestMethod -Headers @{{'User-Agent'='ADB-Manager'}} 'https://api.github.com/repos/Genymobile/scrcpy/releases/latest'; $asset=$release.assets|Where-Object{{$_.name -like 'scrcpy-win64-*.zip'}}|Select-Object -First 1; if(-not $asset){{throw 'No compatible scrcpy release found'}}; $zip=Join-Path $env:TEMP 'adb-manager-scrcpy.zip'; Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $zip; $temp=Join-Path $env:TEMP 'adb-manager-scrcpy-extract'; if(Test-Path $temp){{Remove-Item $temp -Recurse -Force}}; Expand-Archive $zip $temp -Force; $root=Get-ChildItem $temp -Directory|Select-Object -First 1; if(Test-Path $target){{Remove-Item $target -Recurse -Force}}; New-Item -ItemType Directory -Path $target -Force|Out-Null; Copy-Item (Join-Path $root.FullName '*') $target -Recurse -Force; Remove-Item $zip -Force; Remove-Item $temp -Recurse -Force"
        ),
        _ => return Err(format!("Unknown tool: {tool}")),
    };
    run_powershell(&script)?;
    let mut config = read_config();
    if tool == "adb" {
        config.adb_path.clear();
    } else {
        config.scrcpy_path.clear();
    }
    fs::create_dir_all(app_data_dir()).map_err(|error| error.to_string())?;
    fs::write(
        config_path(),
        serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(tools_status())
}
