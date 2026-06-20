# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.0.0] - 2026-06-20

### Added
- The program detects and adds devices automatically upon connection, no manual refresh needed.
- The system recognizes and displays the name of installed keyboards through their package.
- Added the option to choose between responsive or normal mode in "View on PC" within the apps section.
- Implemented a dedicated file transfer menu.
- Incorporated direct preview for audio files within the file explorer.
- Better screenshot UI and a dedicated button to download the current wallpaper.
- Visual customization: implemented the Acrylic effect for Windows 10 and as a selector in Windows 11, along with a button to disable it on macOS and Windows.
- Added terms of use licenses.

### Changed
- Apps can be mirrored in normal or desktop mode. Double-clicking will select desktop mode, with normal mode as the fallback.
- Improved file navigation using keyboard arrows.
- Complete Material You redesign: the interface now adapts its colors based on the connected device's wallpaper, and the remaining native dialogs were replaced by Material dialogs.
- Redesigned right screen on home: shows current wallpaper, the device status, and has options for Recovery mode such as adb sideload.
- The updater was implemented.
- The main page reloads data automatically from time to time.
- Improved the design of the APK installation menu.
- Migration to Svelte: frontend complete redesign achieving a massive performance boost, much faster app load times...
- Internationalization optimization: migrated to `paraglide-js` for better performance. Less reliance on declaring languages in files, and ADB error messages are now translated as well.
- Much faster loading of devices, wallpapers, and the app list.
- CSS combined directly into the Svelte files.

### Fixed
- Fixed the macOS traffic lights.
- Due to the migration, many bugs appeared and disappeared, so they are not counted here.

### Removed
- The `window-vibrancy` dependency was removed and replaced with native Tauri.

## [1.0.0] - 2026-06-11
- Initial release.
