import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface Device {
  serial: string;
  state: string;
  product: string;
  model: string;
  device: string;
  transport_id: string;
}

export interface DeviceDetails {
  serial: string;
  state: string;
  manufacturer: string;
  brand: string;
  model: string;
  marketing_name: string;
  codename: string;
  product_name: string;
  android_version: string;
  api_level: string;
  soc: string;
  architecture: string;
  device_type: string;
  physical_width: number;
  physical_height: number;
  current_width: number;
  current_height: number;
  physical_density: number;
  current_density: number;
  smallest_width_dp: number;
  refresh_rate_hz: number;
  supported_refresh_rates_hz: number[];
  total_ram_mb: number;
  used_ram_mb: number;
  battery_level_percent: number;
  battery_health: string;
  total_storage_mb: number;
  used_storage_mb: number;
  dark_mode_enabled: boolean;
  screen_off_timeout_ms: number;
  uptime_seconds: number;
}

class DeviceState {
  devices = $state.raw<Device[]>([]);
  selectedDevice = $state.raw<Device | null>(null);
  deviceDetails = $state.raw<DeviceDetails | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  wallpaperImage = $state.raw<string | null>(null);
  screenshot = $state.raw<string | null>(null);
  wallpaperLoading = $state(false);

  #loadingInternally = false;
  #unlisten: (() => void) | undefined;

  async init() {
    this.refreshDevices();
    this.#unlisten = await listen('device-list-changed', () => {
      this.refreshDevices();
    });
  }

  destroy() {
    if (this.#unlisten) this.#unlisten();
  }

  async refreshDevices(targetSerialToSelect?: string) {
    if (this.#loadingInternally) return;
    this.#loadingInternally = true;
    this.loading = true;
    this.error = null;

    try {
      const deviceList: Device[] = await invoke('list_devices');
      this.devices = deviceList;

      const currentSerial = this.selectedDevice?.serial;
      const stillExists = deviceList.find(d => d.serial === currentSerial);

      let targetDevice: Device | null = null;

      if (targetSerialToSelect) {
        targetDevice = deviceList.find(d => d.serial === targetSerialToSelect) || null;
      }

      if (!targetDevice) {
        if (currentSerial && this.selectedDevice) {
          if (stillExists) {
            targetDevice = stillExists;
          } else {
            targetDevice = { ...this.selectedDevice, state: 'offline' };
          }
        } else {
          const connected = deviceList.find(d => d.state === 'device');
          targetDevice = connected || (deviceList.length > 0 ? deviceList[0] : null);
        }
      }

      if (targetDevice) {
        this.selectedDevice = targetDevice;
        
        if (targetDevice.serial !== currentSerial || !this.deviceDetails) {
          this.wallpaperImage = null;
          this.screenshot = null;
          
          try {
            const details: DeviceDetails = await invoke('get_device_details', {
              serial: targetDevice.serial,
            });
            this.deviceDetails = details;
          } catch (detailsError) {
            console.error('Failed to get device details:', detailsError);
            this.deviceDetails = null;
          }
        }
      } else {
        this.selectedDevice = null;
        this.deviceDetails = null;
        this.wallpaperImage = null;
        this.screenshot = null;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.devices = [];
      this.selectedDevice = null;
      this.deviceDetails = null;
      this.wallpaperImage = null;
      this.screenshot = null;
    } finally {
      this.#loadingInternally = false;
      this.loading = false;
    }
  }

  async selectDevice(serial: string) {
    const device = this.devices.find(d => d.serial === serial);
    if (!device) return;

    this.selectedDevice = device;
    this.deviceDetails = null;
    this.wallpaperImage = null;
    this.screenshot = null;
    this.loading = true;

    try {
      const details: DeviceDetails = await invoke('get_device_details', { serial });
      this.deviceDetails = details;
    } catch (err) {
      console.error('Failed to get device details:', err);
    } finally {
      this.loading = false;
    }
  }
}

export const devicesState = new DeviceState();
