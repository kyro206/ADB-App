use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

use tauri::{AppHandle, Manager};

struct AppPaths {
    default_data: PathBuf,
    default_cache: PathBuf,
    config: PathBuf,
    webview_data: PathBuf,
    identifier: String,
    packaged: bool,
    current_data: PathBuf,
    current_cache: PathBuf,
}

static PATHS: OnceLock<RwLock<AppPaths>> = OnceLock::new();

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let identifier = app.config().identifier.clone();
    let packaged_paths = package_family_name().and_then(|family| {
        let root = PathBuf::from(std::env::var_os("LOCALAPPDATA")?)
            .join("Packages")
            .join(family);
        let data = root.join("LocalState").join(&identifier);
        let cache = root.join("LocalCache").join(&identifier);
        Some((data, cache))
    });
    let packaged = packaged_paths.is_some();
    let (default_data, default_cache, config, webview_data) =
        if let Some((data, cache)) = packaged_paths {
            let config = data.clone();
            let webview_data = cache.join("WebView2");
            (data, cache, config, webview_data)
        } else {
            let data = app
                .path()
                .app_local_data_dir()
                .map_err(|error| error.to_string())?;
            let cache = app
                .path()
                .app_cache_dir()
                .map_err(|error| error.to_string())?;
            let config = app
                .path()
                .app_config_dir()
                .map_err(|error| error.to_string())?;
            let webview_data = data.clone();
            (data, cache, config, webview_data)
        };

    if packaged {
        std::fs::create_dir_all(&default_data).map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&default_cache).map_err(|error| error.to_string())?;
    }

    let paths = AppPaths {
        current_data: default_data.clone(),
        current_cache: default_cache.clone(),
        default_data,
        default_cache,
        config,
        webview_data,
        identifier,
        packaged,
    };

    PATHS
        .set(RwLock::new(paths))
        .map_err(|_| "Las rutas de ADB App ya estaban inicializadas".to_string())
}

pub fn update_base_path(custom_parent_path: Option<&str>) {
    if let Some(lock) = PATHS.get() {
        let mut paths = lock.write().unwrap();
        if paths.packaged {
            paths.current_data = paths.default_data.clone();
            paths.current_cache = paths.default_cache.clone();
            return;
        }
        if let Some(parent) = custom_parent_path.filter(|s| !s.trim().is_empty()) {
            let parent_path = PathBuf::from(parent.trim());
            if parent_path.is_dir() {
                let custom_dir = parent_path.join(&paths.identifier);
                paths.current_data = custom_dir.clone();
                paths.current_cache = custom_dir;
                return;
            }
        }
        paths.current_data = paths.default_data.clone();
        paths.current_cache = paths.default_cache.clone();
    }
}

pub fn is_packaged() -> bool {
    PATHS
        .get()
        .is_some_and(|paths| paths.read().unwrap().packaged)
}

pub fn webview_data_dir() -> PathBuf {
    PATHS
        .get()
        .expect("ADB App paths must be initialized")
        .read()
        .unwrap()
        .webview_data
        .clone()
}

pub fn data_dir() -> PathBuf {
    PATHS
        .get()
        .expect("ADB App paths must be initialized")
        .read()
        .unwrap()
        .current_data
        .clone()
}

pub fn default_data_dir() -> PathBuf {
    PATHS
        .get()
        .expect("ADB App paths must be initialized")
        .read()
        .unwrap()
        .default_data
        .clone()
}

pub fn config_dir() -> PathBuf {
    PATHS
        .get()
        .expect("ADB App paths must be initialized")
        .read()
        .unwrap()
        .config
        .clone()
}

pub fn cache_dir() -> PathBuf {
    PATHS
        .get()
        .expect("ADB App paths must be initialized")
        .read()
        .unwrap()
        .current_cache
        .clone()
}

#[cfg(windows)]
fn package_family_name() -> Option<String> {
    const ERROR_INSUFFICIENT_BUFFER: i32 = 122;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentPackageFamilyName(length: *mut u32, family_name: *mut u16) -> i32;
    }

    let mut length = 0;
    if unsafe { GetCurrentPackageFamilyName(&mut length, std::ptr::null_mut()) }
        != ERROR_INSUFFICIENT_BUFFER
        || length == 0
    {
        return None;
    }

    let mut family_name = vec![0u16; length as usize];
    if unsafe { GetCurrentPackageFamilyName(&mut length, family_name.as_mut_ptr()) } != 0 {
        return None;
    }
    if family_name.last() == Some(&0) {
        family_name.pop();
    }
    String::from_utf16(&family_name).ok()
}

#[cfg(not(windows))]
fn package_family_name() -> Option<String> {
    None
}
