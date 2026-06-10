import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getName } from '@tauri-apps/api/app';
import { useDevices } from '../../context/DeviceContext';
import { useI18n } from '../../locales';
import { WirelessDialog } from '../dialogs/WirelessDialog';
import { MaterialIcon } from '../MaterialIcon';
import { DeviceSelector } from './DeviceSelector';
import './TopBar.css';

type DesktopPlatform = 'windows' | 'macos' | 'linux';

function detectPlatform(): DesktopPlatform {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('linux')) return 'linux';
  return 'windows';
}

export function TopBar() {
  const { t } = useI18n();
  const { devices, selectedDevice, loading, refreshDevices, selectDevice } = useDevices();
  const [wirelessOpen, setWirelessOpen] = useState(false);
  const [tcpipBusy, setTcpipBusy] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [appName, setAppName] = useState('ADB App');
  const platform = detectPlatform();
  const appWindow = getCurrentWindow();

  useEffect(() => {
    getName().then(setAppName).catch(() => {});
    void appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => void appWindow.isMaximized().then(setMaximized));
    return () => { void unlisten.then(stop => stop()); };
  }, []);

  const connectUsbOverTcpip = async () => {
    if (!selectedDevice || tcpipBusy) return;
    setTcpipBusy(true);
    try {
      await invoke<string>('connect_usb_over_tcpip', { serial: selectedDevice.serial });
      await refreshDevices();
    } finally {
      setTcpipBusy(false);
    }
  };

  const windowControls = <div className="topbar__window-controls">
    <button className="topbar__window-control minimize" onClick={() => appWindow.minimize()} title={t('topbar.window.minimize')}><MaterialIcon name="remove" /></button>
    <button className="topbar__window-control maximize" onClick={async () => { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }} title={maximized ? t('topbar.window.restore') : t('topbar.window.maximize')}><MaterialIcon name={maximized ? 'filter_none' : 'crop_square'} /></button>
    <button className="topbar__window-control close" onClick={() => appWindow.close()} title={t('topbar.window.close')}><MaterialIcon name="close" /></button>
  </div>;

  return <>
    <header className={`topbar topbar--${platform}`} data-tauri-drag-region onDoubleClick={() => appWindow.toggleMaximize()}>
      {platform === 'macos' && windowControls}
      <div className="topbar__identity" data-tauri-drag-region><img src="/icon.webp" alt="" /><h1 data-tauri-drag-region>{appName}</h1></div>
      <div className="topbar__drag-zone" data-tauri-drag-region />
      <div className="topbar__device-section" onDoubleClick={event => event.stopPropagation()}>
        <button className="topbar__tcpip" disabled={!selectedDevice || selectedDevice.state !== 'device' || (selectedDevice.serial.includes(':') || selectedDevice.serial.includes('._tcp')) || tcpipBusy} onClick={connectUsbOverTcpip} title={t('topbar.tcpip.tooltip')}><MaterialIcon name="usb" /><MaterialIcon name="arrow_forward" /><MaterialIcon name="wifi" /></button>
        <DeviceSelector devices={devices} selectedDevice={selectedDevice} loading={loading} loadingLabel={t('common.loading')} emptyLabel={t('common.noData')} onSelect={selectDevice} onDisconnect={async (serial) => {
          await invoke('disconnect_wireless_device', { endpoint: serial });
          await refreshDevices();
        }} />
        <button className={`topbar__wireless ${wirelessOpen ? 'active' : ''}`} onClick={() => setWirelessOpen(true)} title={t('topbar.wireless.tooltip')}><MaterialIcon name="add" /></button>
        <button className="topbar__action-btn" onClick={() => refreshDevices()} disabled={loading} title={t('main.refresh')}><MaterialIcon name="refresh" className={loading ? 'topbar__refresh-icon--spinning' : ''} /></button>
      </div>
      <div className="topbar__drag-zone" data-tauri-drag-region />
      {platform !== 'macos' && windowControls}
    </header>
    <WirelessDialog open={wirelessOpen} onClose={() => setWirelessOpen(false)} />
  </>;
}
