fn main() {
    println!("cargo:rerun-if-env-changed=ADB_APP_STORE_BUILD");
    println!("cargo:rustc-check-cfg=cfg(store_build)");
    if std::env::var_os("ADB_APP_STORE_BUILD").is_some() {
        println!("cargo:rustc-cfg=store_build");
    }
    tauri_build::build()
}
