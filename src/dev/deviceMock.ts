import type { Device, DeviceDetails } from '../context/devices.svelte';
import type { SystemState, ToolsStatus } from '../pages/workbench/types';

export const mockDevice: Device = {
  serial: '0A4312B01795714827',
  state: 'device',
  product: 'frankel',
  model: "Pixel 10",
  device: 'frankel',
  transport_id: 'mock',
};

export const mockDetails: DeviceDetails = {
  serial: mockDevice.serial,
  state: 'device',
  manufacturer: 'Google',
  brand: 'google',
  model: 'Pixel 10',
  marketing_name: 'Google Pixel 10',
  codename: 'frankel',
  product_name: 'frankel',
  android_version: '17',
  api_level: '37',
  soc: 'Google Tensor G5',
  architecture: 'arm64-v8a',
  device_type: 'phone',
  physical_width: 1080,
  physical_height: 2424,
  current_width: 1080,
  current_height: 2424,
  physical_density: 420,
  current_density: 420,
  smallest_width_dp: 411,
  refresh_rate_hz: 120,
  supported_refresh_rates_hz: [60, 90, 120],
  total_ram_mb: 12186,
  used_ram_mb: 4301,
  battery_level_percent: 100,
  battery_health: '97%',
  total_storage_mb: 126566,
  used_storage_mb: 110899,
  dark_mode_enabled: false,
  screen_off_timeout_ms: 30000,
  uptime_seconds: 826320,
};

export const mockHomeDetails = {
  deviceName: "Kyro's Pixel",
  carrier: 'Google Fi',
  lockscreenDate: 'Mon, 15 Jun',
  lockscreenTime: new Date('2026-06-15T09:45:00'),
};

export const mockSystemState: SystemState = {
  users: [{ id: 0, name: 'Kyro', is_running: true }],
  current_user_id: 0,
  gestural_navigation: true,
  app_languages_enabled: true,
  captive_portal_mode: '1',
  current_keyboard_id: 'com.touchtype.swiftkey/com.touchtype.KeyboardService',
  keyboards: [
    {
      id: 'com.touchtype.swiftkey/com.touchtype.KeyboardService',
      label: 'Microsoft SwiftKey',
      enabled: true,
      is_default: true,
    },
    {
      id: 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME',
      label: 'Gboard',
      enabled: true,
      is_default: false,
    },
  ],
};

export const mockToolsStatus: ToolsStatus = {
  adb: {
    name: 'ADB',
    available: true,
    version: '37.0.0',
    latest_version: '37.0.0',
    update_checked: true,
    update_available: false,
    path: 'C:\\Android\\platform-tools\\adb.exe',
    source: 'managed',
    install_supported: true,
  },
  scrcpy: {
    name: 'scrcpy',
    available: true,
    version: '4.0',
    latest_version: '4.0',
    update_checked: true,
    update_available: false,
    path: 'C:\\Android\\scrcpy\\scrcpy.exe',
    source: 'managed',
    install_supported: true,
  },
  java: {
    name: 'Java',
    available: true,
    version: '25.0.3',
    latest_version: '',
    update_checked: false,
    update_available: false,
    path: 'C:\\Program Files\\Java\\bin\\java.exe',
    source: 'system',
    install_supported: false,
  },
};
