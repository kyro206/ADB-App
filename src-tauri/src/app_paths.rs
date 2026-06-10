use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

use tauri::{AppHandle, Manager};

struct AppPaths {
    default_data: PathBuf,
    default_cache: PathBuf,
    config: PathBuf,
    identifier: String,
    current_data: PathBuf,
    current_cache: PathBuf,
}

static PATHS: OnceLock<RwLock<AppPaths>> = OnceLock::new();

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let default_data = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let default_cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    let config = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    
    let identifier = app.config().identifier.clone();

    let paths = AppPaths {
        current_data: default_data.clone(),
        current_cache: default_cache.clone(),
        default_data,
        default_cache,
        config,
        identifier,
    };
    
    PATHS
        .set(RwLock::new(paths))
        .map_err(|_| "Las rutas de ADB App ya estaban inicializadas".to_string())
}

pub fn update_base_path(custom_parent_path: Option<&str>) {
    if let Some(lock) = PATHS.get() {
        let mut paths = lock.write().unwrap();
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

pub fn data_dir() -> PathBuf {
    PATHS.get().expect("ADB App paths must be initialized").read().unwrap().current_data.clone()
}

pub fn default_data_dir() -> PathBuf {
    PATHS.get().expect("ADB App paths must be initialized").read().unwrap().default_data.clone()
}

pub fn config_dir() -> PathBuf {
    PATHS.get().expect("ADB App paths must be initialized").read().unwrap().config.clone()
}

pub fn cache_dir() -> PathBuf {
    PATHS.get().expect("ADB App paths must be initialized").read().unwrap().current_cache.clone()
}
