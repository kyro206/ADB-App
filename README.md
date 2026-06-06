# ADB Manager (Tauri prototype)

Functional Tauri 2 + React + TypeScript migration of the Java Swing ADB Manager.

## Requirements

- Rust stable
- Bun
- Android platform-tools (`adb`) in `PATH`
- Optional: `scrcpy` in `PATH` for mirroring

## Run in development

```powershell
bun install
bun run tauri dev
```

Connect an Android device with USB debugging enabled or use **Settings > Wireless
connection**. The device must authorize the host before device actions are enabled.

## Verification

```powershell
bun run build
cd src-tauri
cargo test
cargo build
```

The prototype includes device discovery/details, screenshots, display overrides,
input/control, app management, file browsing/transfers, system actions, wireless
pair/connect, themes/languages, and external scrcpy launch.

In **Settings**, ADB and scrcpy can be detected automatically, configured with a
custom executable path, or installed/updated as app-managed tools. Managed
installation currently downloads the official Windows releases from Google and
GitHub.
