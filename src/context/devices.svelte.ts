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

export interface HomeIdentity {
  serial: string;
  deviceName: string;
  carrierName: string;
}

class DeviceState {
  devices = $state.raw<Device[]>([]);
  selectedDevice = $state.raw<Device | null>(null);
  deviceDetails = $state.raw<DeviceDetails | null>(null);
  loading = $state(false);
  operationalLoading = $state(false);
  connectionRevision = $state(0);
  error = $state<string | null>(null);
  homeIdentity = $state.raw<HomeIdentity | null>(null);

  wallpaperImage = $state.raw<string | null>(null);
  screenshot = $state.raw<string | null>(null);
  wallpaperLoading = $state(false);

  #unlisten: (() => void) | undefined;
  #refreshRequested = false;
  #queuedTargetSerial: string | undefined;
  #refreshPromise: Promise<void> | null = null;
  #detailsRequestId = 0;
  #wallpaperRequestId = 0;
  #wallpaperSerial: string | null = null;
  #homeDetailsCache = new Map<string, DeviceDetails>();
  #homeIdentityCache = new Map<string, HomeIdentity>();

  async init() {
    if (this.#unlisten) return;
    this.#unlisten = await listen('device-list-changed', () => {
      void this.refreshDevices();
    });
    await this.refreshDevices();
  }

  destroy() {
    if (this.#unlisten) this.#unlisten();
    this.#unlisten = undefined;
  }

  async refreshDevices(targetSerialToSelect?: string) {
    if (targetSerialToSelect) this.#queuedTargetSerial = targetSerialToSelect;
    this.#refreshRequested = true;

    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = this.#drainDeviceRefreshes();
    try {
      await this.#refreshPromise;
    } finally {
      this.#refreshPromise = null;
      if (this.#refreshRequested) void this.refreshDevices();
    }
  }

  async #drainDeviceRefreshes() {
    while (this.#refreshRequested) {
      this.#refreshRequested = false;
      const targetSerial = this.#queuedTargetSerial;
      this.#queuedTargetSerial = undefined;
      await this.#refreshDeviceList(targetSerial);
    }
  }

  async #refreshDeviceList(targetSerialToSelect?: string) {
    const previous = this.selectedDevice;
    const previousSerial = previous?.serial;
    const previousOnline = previous?.state === 'device';
    if (!previous) this.loading = true;
    this.error = null;

    try {
      const deviceList: Device[] = await invoke('list_devices');
      this.devices = deviceList;

      let targetDevice = targetSerialToSelect
        ? deviceList.find(device => device.serial === targetSerialToSelect) ?? null
        : null;
      let samePhysicalDevice = false;
      if (!targetDevice && previousSerial && previous) {
        targetDevice = deviceList.find(device => device.serial === previousSerial) ?? null;
        if (!targetDevice && this.#isWireless(previous.serial)) {
          const onlineDevices = deviceList.filter(device => device.state === 'device');
          const matchingDevices = onlineDevices.filter(device => this.#sameDeviceIdentity(previous, device));
          targetDevice = matchingDevices.length === 1
            ? matchingDevices[0]
            : onlineDevices.length === 1 ? onlineDevices[0] : null;
          samePhysicalDevice = !!targetDevice;
        }
        targetDevice ??= { ...previous, state: 'offline' };
      }
      if (!targetDevice) {
        targetDevice = deviceList.find(device => device.state === 'device')
          ?? deviceList[0]
          ?? null;
      }

      if (!targetDevice) {
        this.#detailsRequestId++;
        this.#wallpaperRequestId++;
        this.#wallpaperSerial = null;
        this.selectedDevice = null;
        this.deviceDetails = null;
        this.homeIdentity = null;
        this.wallpaperImage = null;
        this.screenshot = null;
        this.operationalLoading = false;
        return;
      }

      const serialChanged = targetDevice.serial !== previousSerial;
      const reconnected = targetDevice.state === 'device' && (serialChanged || !previousOnline);
      this.selectedDevice = targetDevice;

      if (targetDevice.state !== 'device') {
        this.#detailsRequestId++;
        this.operationalLoading = true;
        return;
      }

      if (serialChanged) {
        this.#wallpaperRequestId++;
        this.#wallpaperSerial = null;
        this.screenshot = null;
        const preservedDetails = samePhysicalDevice ? this.deviceDetails : null;
        this.deviceDetails = this.#homeDetailsCache.get(targetDevice.serial) ?? preservedDetails;
        if (this.deviceDetails) this.#homeDetailsCache.set(targetDevice.serial, this.deviceDetails);

        const preservedIdentity = samePhysicalDevice ? this.homeIdentity : null;
        const cachedIdentity = this.#homeIdentityCache.get(targetDevice.serial) ?? preservedIdentity;
        this.homeIdentity = cachedIdentity ? { ...cachedIdentity, serial: targetDevice.serial } : null;
        if (this.homeIdentity) this.#homeIdentityCache.set(targetDevice.serial, this.homeIdentity);
        if (!samePhysicalDevice) this.wallpaperImage = null;
      }

      if (reconnected || !this.deviceDetails) {
        this.connectionRevision++;
        this.operationalLoading = true;
        void this.#completeConnectedRefresh(targetDevice, this.connectionRevision);
        return;
      }

      if (!this.wallpaperImage) void this.loadWallpaper(targetDevice.serial);
      this.operationalLoading = false;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.devices = [];
      if (previous) {
        this.selectedDevice = { ...previous, state: 'offline' };
        this.operationalLoading = true;
      } else {
        this.selectedDevice = null;
        this.deviceDetails = null;
        this.homeIdentity = null;
        this.wallpaperImage = null;
        this.screenshot = null;
        this.operationalLoading = false;
      }
    } finally {
      this.loading = false;
    }
  }

  #isWireless(serial: string) {
    return serial.includes(':') || serial.includes('._tcp') || serial.startsWith('adb-');
  }

  #sameDeviceIdentity(left: Device, right: Device) {
    const fields: Array<keyof Pick<Device, 'product' | 'model' | 'device'>> = [
      'product', 'model', 'device',
    ];
    return fields.some(field => left[field] && left[field] === right[field]);
  }

  async #completeConnectedRefresh(device: Device, revision: number) {
    await this.#loadFreshDetails(device);
    if (revision !== this.connectionRevision
      || this.selectedDevice?.serial !== device.serial
      || this.selectedDevice.state !== 'device') return;
    if (!this.wallpaperImage) void this.loadWallpaper(device.serial);
    this.operationalLoading = false;
  }

  async #loadFreshDetails(device: Device) {
    const requestId = ++this.#detailsRequestId;
    try {
      const details = await invoke<DeviceDetails>('get_device_details', { device });
      if (requestId !== this.#detailsRequestId
        || this.selectedDevice?.serial !== device.serial
        || this.selectedDevice.state !== 'device') return;
      this.deviceDetails = details;
      if (details.total_ram_mb >= 0 && details.uptime_seconds >= 0) {
        this.#homeDetailsCache.set(device.serial, details);
      }
    } catch (error) {
      if (requestId === this.#detailsRequestId && this.selectedDevice?.serial === device.serial) {
        this.error = error instanceof Error ? error.message : String(error);
        this.deviceDetails = this.#homeDetailsCache.get(device.serial) ?? this.deviceDetails;
      }
    }
  }

  async refreshDeviceDetailsSilent() {
    if (this.operationalLoading) return;
    if (!this.selectedDevice || this.selectedDevice.state !== 'device') return;
    const serial = this.selectedDevice.serial;
    const requestId = ++this.#detailsRequestId;
    try {
      const details: DeviceDetails = await invoke('get_device_details', { device: this.selectedDevice });
      if (requestId === this.#detailsRequestId
        && this.selectedDevice?.serial === serial
        && this.selectedDevice.state === 'device') {
        this.deviceDetails = details;
        if (details.total_ram_mb !== -1 && details.uptime_seconds >= 0) {
          this.#homeDetailsCache.set(serial, details);
        }
      }
    } catch {
      // Fallo silencioso, mantenemos los datos antiguos
    }
  }

  cacheHomeIdentity(serial: string, deviceName: string, carrierName: string) {
    if (!serial || this.selectedDevice?.serial !== serial) return;
    const identity = { serial, deviceName, carrierName };
    this.#homeIdentityCache.set(serial, identity);
    this.homeIdentity = identity;
  }

  async selectDevice(serial: string) {
    const device = this.devices.find(d => d.serial === serial);
    if (!device) return;

    this.selectedDevice = device;
    this.deviceDetails = this.#homeDetailsCache.get(serial) ?? null;
    this.homeIdentity = this.#homeIdentityCache.get(serial) ?? null;
    this.#wallpaperRequestId++;
    this.#wallpaperSerial = null;
    this.wallpaperImage = null;
    this.screenshot = null;
    this.loading = true;
    this.operationalLoading = device.state === 'device';
    this.connectionRevision++;
    this.error = null;

    try {
      if (device.state === 'device') {
        void this.loadWallpaper(serial);
        await this.#loadFreshDetails(device);
      }
    } finally {
      if (this.selectedDevice?.serial === serial) {
        this.operationalLoading = this.selectedDevice.state !== 'device';
      }
      this.loading = false;
    }
  }

  async loadWallpaper(serial: string) {
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
}

export const devicesState = new DeviceState();
