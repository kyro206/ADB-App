import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
}

interface DeviceContextType {
  devices: Device[];
  selectedDevice: Device | null;
  deviceDetails: DeviceDetails | null;
  loading: boolean;
  error: string | null;
  refreshDevices: () => Promise<void>;
  selectDevice: (serial: string) => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceDetails, setDeviceDetails] = useState<DeviceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const deviceList: Device[] = await invoke('list_devices');
      setDevices(deviceList);

      // Auto-select first connected device if none selected
      const currentSerial = selectedDevice?.serial;
      const stillExists = deviceList.find(d => d.serial === currentSerial);

      let targetDevice: Device | null = null;

      if (stillExists) {
        targetDevice = stillExists;
      } else {
        // Pick first connected device
        const connected = deviceList.find(d => d.state === 'device');
        targetDevice = connected || (deviceList.length > 0 ? deviceList[0] : null);
      }

      if (targetDevice) {
        setSelectedDevice(targetDevice);
        try {
          const details: DeviceDetails = await invoke('get_device_details', {
            serial: targetDevice.serial,
          });
          setDeviceDetails(details);
        } catch (detailsError) {
          console.error('Failed to get device details:', detailsError);
          setDeviceDetails(null);
        }
      } else {
        setSelectedDevice(null);
        setDeviceDetails(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setDevices([]);
      setSelectedDevice(null);
      setDeviceDetails(null);
    } finally {
      setLoading(false);
    }
  }, [loading, selectedDevice?.serial]);

  const selectDevice = useCallback(async (serial: string) => {
    const device = devices.find(d => d.serial === serial);
    if (!device) return;

    setSelectedDevice(device);
    setDeviceDetails(null);

    try {
      const details: DeviceDetails = await invoke('get_device_details', { serial });
      setDeviceDetails(details);
    } catch (err) {
      console.error('Failed to get device details:', err);
    }
  }, [devices]);

  return (
    <DeviceContext.Provider
      value={{
        devices,
        selectedDevice,
        deviceDetails,
        loading,
        error,
        refreshDevices,
        selectDevice,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices(): DeviceContextType {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevices must be used within a DeviceProvider');
  }
  return context;
}
