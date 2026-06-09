use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

struct AppPaths {
    data: PathBuf,
    config: PathBuf,
    cache: PathBuf,
}

static PATHS: OnceLock<AppPaths> = OnceLock::new();

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let paths = AppPaths {
        data: app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?,
        config: app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?,
        cache: app
            .path()
            .app_cache_dir()
            .map_err(|error| error.to_string())?,
    };
    PATHS
        .set(paths)
        .map_err(|_| "Las rutas de ADB App ya estaban inicializadas".to_string())
}

fn paths() -> &'static AppPaths {
    PATHS.get().expect("ADB App paths must be initialized")
}

pub fn data_dir() -> &'static Path {
    &paths().data
}

pub fn config_dir() -> &'static Path {
    &paths().config
}

pub fn cache_dir() -> &'static Path {
    &paths().cache
}
