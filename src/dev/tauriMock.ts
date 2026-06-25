import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { InvokeArgs } from '@tauri-apps/api/core';
import {
  mockDetails,
  mockDevice,
  mockHomeDetails,
  mockSystemState,
  mockToolsStatus,
} from './deviceMock';

let mediaVolume = 18;
let brightness = 180;
let rotationAuto = true;
let rotation = 0;
let ringerMode = '2';
let settings = {
  cache_enabled: true,
  cache_path: '',
  kill_adb_on_exit: true,
  material_you_enabled: true,
  material_you_background_tint: true,
  window_effect: 'system',
  theme: '',
  language: 'en',
  packaged: false,
};

async function imageBase64(path: string) {
  const response = await fetch(path);
  if (!response.ok) return '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function shellOutput(args: string[]) {
  const command = args.join(' ');
  const lastArg = args[args.length - 1];
  if (command.includes('settings get system screen_brightness')) {
    return [
      String(brightness),
      rotationAuto ? '1' : '0',
      String(rotation),
      ringerMode,
    ].join('\n---ADBAPPSEP---\n');
  }
  if (command.includes('settings put system screen_brightness')) {
    brightness = Number(lastArg) || brightness;
    return 'OK';
  }
  if (command.includes('settings put system accelerometer_rotation')) {
    rotationAuto = lastArg === '1';
    return 'OK';
  }
  if (command.includes('settings put system user_rotation')) {
    rotation = Number(lastArg) || 0;
    return 'OK';
  }
  if (command.includes('cmd audio set-ringer-mode')) {
    const mode = lastArg;
    ringerMode = mode === 'SILENT' ? '0' : mode === 'VIBRATE' ? '1' : '2';
    return 'OK';
  }
  if (command.includes('wallpaper_extractor.jar')) {
    return 'WALLPAPER_STARTWALLPAPER_END';
  }
  return 'OK';
}

function appSettings() {
  return settings;
}

export function installTauriMock() {
  mockWindows('main');
  mockIPC(async (cmd, payload?: InvokeArgs) => {
    const args = payload as Record<string, unknown> | undefined;
    switch (cmd) {
      case 'plugin:app|name':
        return 'ADB App';
      case 'get_app_settings':
        return appSettings();
      case 'save_app_settings':
        settings = { ...settings, ...(args?.settings as typeof settings) };
        return null;
      case 'get_default_cache_dir':
        return 'C:\\Users\\Kyro\\AppData\\Local\\ADB App';
      case 'get_tools_snapshot':
        return { tools: mockToolsStatus, checking_updates: false };
      case 'set_tool_path':
      case 'install_or_update_tool':
        return mockToolsStatus;
      case 'clear_application_cache':
      case 'set_window_theme':
      case 'set_window_effect':
      case 'close_app':
      case 'open_store_review':
        return null;
      case 'get_window_effect_info':
        return { platform: 'windows11', supported: true };
      case 'list_devices':
        return [mockDevice];
      case 'get_device_details':
        return mockDetails;
      case 'get_device_wallpaper':
      case 'capture_screenshot':
        return imageBase64('/mock.jpg');
      case 'get_home_details':
        return {
          device_name: mockHomeDetails.deviceName,
          airplane_mode: false,
          carrier: mockHomeDetails.carrier,
        };
      case 'get_media_volume':
        return { level: mediaVolume, maximum: 25 };
      case 'set_media_volume':
        mediaVolume = Number(args?.volume) || mediaVolume;
        return 'OK';
      case 'get_system_state':
        return mockSystemState;
      case 'run_device_action':
        return shellOutput((args?.args as string[] | undefined) ?? []);
      case 'run_device_action_batch':
      case 'save_screenshot':
      case 'sideload_device':
      case 'set_device_dark_mode':
      case 'launch_scrcpy':
      case 'connect_usb_over_tcpip':
      case 'disconnect_wireless_device':
      case 'pair_wireless_device':
      case 'pair_wireless_qr':
        return 'OK';
      case 'list_scrcpy_cameras':
        return ['0 (Back)', '1 (Front)'];
      case 'list_apps':
        return [];
      case 'get_app_details':
        return null;
      case 'list_directory':
        return [];
      case 'read_file_bytes':
        return [];
      case 'download_and_open_file':
      case 'pull_file':
      case 'get_file_thumbnail':
        return null;
      case 'generate_wireless_qr':
        return { service_name: 'ADB App Mock', password: '000000' };
      default:
        return null;
    }
  }, { shouldMockEvents: true });
}
