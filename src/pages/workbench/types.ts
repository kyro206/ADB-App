import type { TabId } from '../../components/layout/Sidebar';

export type WorkTab = Exclude<TabId, 'home'>;
export type AppSummary = { package_name: string; display_name: string; apk_path: string; system_app: boolean; disabled: boolean; icon_data_url: string };
export type AppPermissionInfo = { name: string; granted: boolean; runtime: boolean };
export type AppDetailsInfo = AppSummary & { version_name: string; version_code: string; target_sdk: string; min_sdk: string; installer: string; data_dir: string; code_size_bytes: number; data_size_bytes: number; cache_size_bytes: number; background_mode: string; permissions: AppPermissionInfo[] };
export type AppFilter = 'user' | 'all' | 'system' | 'disabled';
export type FileEntry = { name: string; permissions: string; size: number; modified: string; is_directory: boolean; is_link: boolean; link_target: string };
export type FileView = 'list' | 'grid';
export type FileSortKey = 'name' | 'type' | 'size' | 'permissions' | 'modified';
export type ToolStatus = { name: string; available: boolean; version: string; latest_version: string; update_checked: boolean; update_available: boolean; path: string; source: string; install_supported: boolean };
export type ToolsStatus = { adb: ToolStatus; scrcpy: ToolStatus; java: ToolStatus; aapt2: ToolStatus };
export type MediaVolumeState = { level: number; maximum: number };
export type MirrorMode = 'display' | 'virtual' | 'camera';
export type SoundMode = 'NORMAL' | 'VIBRATE' | 'SILENT';
export type AndroidUser = { id: number; name: string; is_running: boolean };
export type KeyboardInputMethod = { id: string; label: string; enabled: boolean; is_default: boolean };
export type SystemState = { users: AndroidUser[]; current_user_id: number; gestural_navigation: boolean; app_languages_enabled: boolean; keyboards: KeyboardInputMethod[]; current_keyboard_id: string };
