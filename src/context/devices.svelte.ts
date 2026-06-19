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

export interface MockHomeDetails {
  deviceName: string;
  carrier: string;
  lockscreenDate: string;
  lockscreenTime: Date;
}

class DeviceState {
  devices = $state.raw<Device[]>([]);
  selectedDevice = $state.raw<Device | null>(null);
  deviceDetails = $state.raw<DeviceDetails | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  mockMode = $state(false);
  mockHomeDetails = $state.raw<MockHomeDetails | null>(null);

  wallpaperImage = $state.raw<string | null>(null);
  screenshot = $state.raw<string | null>(null);
  wallpaperLoading = $state(false);

  #loadingInternally = false;
  #unlisten: (() => void) | undefined;
  #detailsRequestId = 0;
  #wallpaperRequestId = 0;
  #wallpaperSerial: string | null = null;
  #detailsCache = new Map<string, DeviceDetails>();

  async init() {
    if (this.#unlisten) return;
    if (await this.#enableMockIfRequested()) return;
    this.refreshDevices();
    this.#unlisten = await listen('device-list-changed', () => {
      this.refreshDevices();
    });
  }

  destroy() {
    if (this.#unlisten) this.#unlisten();
    this.#unlisten = undefined;
  }

  async refreshDevices(targetSerialToSelect?: string) {
    if (this.mockMode) {
      if (targetSerialToSelect && this.selectedDevice?.serial !== targetSerialToSelect) return;
      return;
    }
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
          this.#wallpaperRequestId++;
          this.#wallpaperSerial = null;
          this.wallpaperImage = null;
          this.screenshot = null;
          this.deviceDetails = this.#detailsCache.get(targetDevice.serial) ?? null;
          if (targetDevice.state === 'device') {
            void this.loadWallpaper(targetDevice.serial);
          }
          
          try {
            const requestId = ++this.#detailsRequestId;
            const details: DeviceDetails = await invoke('get_device_details', {
              device: targetDevice,
            });
            if (requestId === this.#detailsRequestId && this.selectedDevice?.serial === targetDevice.serial) {
              this.deviceDetails = details;
              this.#detailsCache.set(targetDevice.serial, details);
            }
          } catch (detailsError) {
            this.error = detailsError instanceof Error ? detailsError.message : String(detailsError);
            this.deviceDetails = this.#detailsCache.get(targetDevice.serial) ?? null;
          }
        }

        if (targetDevice.state === 'device' && !this.wallpaperImage) {
          void this.loadWallpaper(targetDevice.serial);
        }
      } else {
        this.#detailsRequestId++;
        this.#wallpaperRequestId++;
        this.#wallpaperSerial = null;
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

  async refreshDeviceDetailsSilent() {
    if (this.mockMode) return;
    if (!this.selectedDevice || this.selectedDevice.state !== 'device') return;
    const serial = this.selectedDevice.serial;
    const requestId = ++this.#detailsRequestId;
    try {
      const details: DeviceDetails = await invoke('get_device_details', { device: this.selectedDevice });
      if (requestId === this.#detailsRequestId && this.selectedDevice?.serial === serial) {
        this.deviceDetails = details;
        this.#detailsCache.set(serial, details);
      }
    } catch {
      // Fallo silencioso, mantenemos los datos antiguos
    }
  }

  async selectDevice(serial: string) {
    if (this.mockMode) return;
    const device = this.devices.find(d => d.serial === serial);
    if (!device) return;

    this.selectedDevice = device;
    this.deviceDetails = this.#detailsCache.get(serial) ?? null;
    this.#wallpaperRequestId++;
    this.#wallpaperSerial = null;
    this.wallpaperImage = null;
    this.screenshot = null;
    this.loading = true;
    this.error = null;
    const requestId = ++this.#detailsRequestId;

    try {
      void this.loadWallpaper(serial);
      const details: DeviceDetails = await invoke('get_device_details', { device: this.selectedDevice });
      if (requestId === this.#detailsRequestId && this.selectedDevice?.serial === serial) {
        this.deviceDetails = details;
        this.#detailsCache.set(serial, details);
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (requestId === this.#detailsRequestId) {
        this.loading = false;
      }
    }
  }

  async loadWallpaper(serial: string) {
    if (this.mockMode) return;
    if (!serial || this.selectedDevice?.serial !== serial) return;
    if (this.wallpaperImage || (this.wallpaperLoading && this.#wallpaperSerial === serial)) return;

    const requestId = ++this.#wallpaperRequestId;
    this.#wallpaperSerial = serial;
    this.wallpaperLoading = true;

    try {
      const base64 = await invoke<string>('get_device_wallpaper', { serial });
      if (requestId === this.#wallpaperRequestId && this.selectedDevice?.serial === serial) {
        this.wallpaperImage = `data:image/jpeg;base64,${base64}`;
      }
    } catch {
      if (requestId === this.#wallpaperRequestId && this.selectedDevice?.serial === serial) {
        this.wallpaperImage = null;
      }
    } finally {
      if (requestId === this.#wallpaperRequestId) {
        this.wallpaperLoading = false;
        this.#wallpaperSerial = null;
      }
    }
  }

  async #enableMockIfRequested() {
    if (!import.meta.env.DEV || import.meta.env.VITE_ADB_APP_MOCK_DEVICE !== 'pixel10') return false;

    try {
      const { createPixel10MockState } = await import('../dev/deviceMock');
      const mock = createPixel10MockState();
      this.mockMode = true;
      this.devices = mock.devices;
      this.selectedDevice = mock.selectedDevice;
      this.deviceDetails = mock.deviceDetails;
      this.wallpaperImage = mock.wallpaperImage;
      this.mockHomeDetails = mock.homeDetails;
      this.screenshot = null;
      this.wallpaperLoading = false;
      this.loading = false;
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }

    return true;
  }
}

export const devicesState = new DeviceState();
