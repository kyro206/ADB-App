import type { Device, DeviceDetails, MockHomeDetails } from '../context/devices.svelte';

const mockDevice: Device = {
  serial: 'MOCK-PIXEL10-FRANKEL',
  state: 'device',
  product: 'frankel',
  model: "Pixel 10",
  device: 'frankel',
  transport_id: 'mock',
};

const mockDetails: DeviceDetails = {
  serial: mockDevice.serial,
  state: 'device',
  manufacturer: 'Google',
  brand: 'google',
  model: 'Google Pixel 10',
  marketing_name: 'Google Pixel 10',
  codename: 'frankel',
  product_name: 'frankel',
  android_version: '17',
  api_level: '37',
  soc: 'Google Tensor G5',
  architecture: 'arm64-v8a',
  device_type: 'device',
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

const mockHomeDetails: MockHomeDetails = {
  deviceName: "Kyro's Pixel",
  carrier: 'Google Fi',
  lockscreenDate: 'Mon, 15 Jun',
  lockscreenTime: new Date('2026-06-15T09:45:00'),
};

export function createPixel10MockState() {
  return {
    devices: [mockDevice],
    selectedDevice: mockDevice,
    deviceDetails: mockDetails,
    wallpaperImage: '/mock.jpg',
    homeDetails: mockHomeDetails,
  };
}
