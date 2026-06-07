use std::fs;
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use regex::Regex;

#[cfg(unix)]
use crate::tools::managed_executable;
use crate::tools::{executable_name, managed_dir};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArchiveKind {
    Zip,
    TarGz,
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())
}

fn download_bytes(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, String> {
    client
        .get(url)
        .header(reqwest::header::USER_AGENT, "ADB-App")
        .send()
        .map_err(|error| format!("No se pudo descargar la dependencia: {error}"))?
        .error_for_status()
        .map_err(|error| format!("La descarga de la dependencia falló: {error}"))?
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("No se pudo leer la descarga: {error}"))
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

fn aapt2_classifier() -> Result<&'static str, String> {
    match std::env::consts::OS {
        "windows" => Ok("windows"),
        "macos" => Ok("osx"),
        "linux" => Err(
            "La instalación automática está deshabilitada en Linux. Instala AAPT2 con tu gestor de paquetes o Android SDK."
                .to_string(),
        ),
        _ => Err("AAPT2 no ofrece un binario para este sistema operativo".to_string()),
    }
}

fn tool_asset(
    tool: &str,
    client: &reqwest::blocking::Client,
) -> Result<(String, ArchiveKind), String> {
    if std::env::consts::OS == "linux" {
        return Err("La instalación automática está deshabilitada en Linux. Usa el gestor de paquetes de tu distribución y Detección automática.".to_string());
    }
    match tool {
        "adb" => Ok((
            match std::env::consts::OS {
                "windows" => {
                    "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
                }
                "macos" => {
                    "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
                }
                _ => {
                    return Err(
                        "ADB no ofrece Platform Tools para este sistema operativo".to_string()
                    )
                }
            }
            .to_string(),
            ArchiveKind::Zip,
        )),
        "scrcpy" => {
            let (prefix, kind) = match (std::env::consts::OS, std::env::consts::ARCH) {
                ("windows", "x86_64") => ("scrcpy-win64-", ArchiveKind::Zip),
                ("windows", "x86") => ("scrcpy-win32-", ArchiveKind::Zip),
                ("macos", "x86_64") => ("scrcpy-macos-x86_64-", ArchiveKind::TarGz),
                ("macos", "aarch64") => ("scrcpy-macos-aarch64-", ArchiveKind::TarGz),
                _ => {
                    return Err(
                        "scrcpy no publica un binario compatible con este equipo".to_string()
                    )
                }
            };
            let release = client
                .get("https://api.github.com/repos/Genymobile/scrcpy/releases/latest")
                .header(reqwest::header::USER_AGENT, "ADB-App")
                .send()
                .map_err(|error| error.to_string())?
                .error_for_status()
                .map_err(|error| error.to_string())?
                .json::<serde_json::Value>()
                .map_err(|error| error.to_string())?;
            let url = release
                .get("assets")
                .and_then(serde_json::Value::as_array)
                .and_then(|assets| {
                    assets.iter().find_map(|asset| {
                        let name = asset.get("name")?.as_str()?;
                        let valid_extension = matches!(kind, ArchiveKind::Zip)
                            && name.ends_with(".zip")
                            || matches!(kind, ArchiveKind::TarGz) && name.ends_with(".tar.gz");
                        (name.starts_with(prefix) && valid_extension)
                            .then(|| {
                                asset
                                    .get("browser_download_url")?
                                    .as_str()
                                    .map(str::to_string)
                            })
                            .flatten()
                    })
                })
                .ok_or_else(|| "No se encontró una descarga de scrcpy compatible".to_string())?;
            Ok((url, kind))
        }
        "aapt2" => {
            let metadata = client
                .get("https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/maven-metadata.xml")
                .header(reqwest::header::USER_AGENT, "ADB-App")
                .send().map_err(|error| error.to_string())?
                .error_for_status().map_err(|error| error.to_string())?
                .text().map_err(|error| error.to_string())?;
            let version = latest_stable_aapt2_version(&metadata).ok_or_else(|| {
                "No se pudo determinar la última versión estable de AAPT2".to_string()
            })?;
            let classifier = aapt2_classifier()?;
            Ok((format!("https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/{version}/aapt2-{version}-{classifier}.jar"), ArchiveKind::Zip))
        }
        _ => Err(format!("Dependencia desconocida: {tool}")),
    }
}

fn extract(bytes: &[u8], kind: ArchiveKind, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    match kind {
        ArchiveKind::Zip => {
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
                .map_err(|error| format!("ZIP no válido: {error}"))?;
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
                let relative = entry
                    .enclosed_name()
                    .ok_or_else(|| "El ZIP contiene una ruta no segura".to_string())?;
                let output = destination.join(relative);
                if entry.is_dir() {
                    fs::create_dir_all(output).map_err(|error| error.to_string())?;
                } else {
                    if let Some(parent) = output.parent() {
                        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                    }
                    io::copy(
                        &mut entry,
                        &mut fs::File::create(output).map_err(|error| error.to_string())?,
                    )
                    .map_err(|error| error.to_string())?;
                }
            }
        }
        ArchiveKind::TarGz => {
            tar::Archive::new(GzDecoder::new(Cursor::new(bytes)))
                .unpack(destination)
                .map_err(|error| format!("No se pudo extraer TAR.GZ: {error}"))?;
        }
    }
    Ok(())
}

fn find_file(directory: &Path, name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(directory).ok()?.flatten() {
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

fn remove_dir(path: &Path) -> Result<(), String> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn install_tool(tool: &str) -> Result<(), String> {
    let client = client()?;
    let (url, kind) = tool_asset(tool, &client)?;
    let target = managed_dir(tool);
    let staging = crate::app_paths::cache_dir()
        .join("dependency-install")
        .join(tool);
    remove_dir(&staging)?;
    extract(&download_bytes(&client, &url)?, kind, &staging)?;
    let executable = find_file(&staging, &executable_name(tool))
        .ok_or_else(|| format!("La descarga no contiene {}", executable_name(tool)))?;
    let extracted_root = if tool == "adb" {
        staging.clone()
    } else {
        executable.parent().unwrap_or(&staging).to_path_buf()
    };
    remove_dir(&target)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(&extracted_root, &target).map_err(|error| error.to_string())?;
    if staging != target {
        remove_dir(&staging)?;
    }
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
    Ok(())
}

pub fn ensure_bundletool() -> Result<PathBuf, String> {
    let directory = crate::app_paths::data_dir()
        .join("tools")
        .join("bundletool");
    let jar = directory.join("bundletool-all.jar");
    if jar.is_file() {
        return Ok(jar);
    }
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let client = client()?;
    let release = client
        .get("https://api.github.com/repos/google/bundletool/releases/latest")
        .header(reqwest::header::USER_AGENT, "ADB-App")
        .send()
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<serde_json::Value>()
        .map_err(|error| error.to_string())?;
    let url = release
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .and_then(|assets| {
            assets.iter().find_map(|asset| {
                let name = asset.get("name")?.as_str()?;
                name.starts_with("bundletool-all-")
                    .then(|| {
                        asset
                            .get("browser_download_url")?
                            .as_str()
                            .map(str::to_string)
                    })
                    .flatten()
            })
        })
        .ok_or_else(|| "No se encontró bundletool".to_string())?;
    fs::write(&jar, download_bytes(&client, &url)?).map_err(|error| error.to_string())?;
    Ok(jar)
}
