import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useDevices } from '../../context/DeviceContext';
import { useI18n } from '../../i18n';
import { WirelessDialog } from '../dialogs/WirelessDialog';
import { MaterialIcon } from '../MaterialIcon';
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
  const platform = detectPlatform();
  const appWindow = getCurrentWindow();

  useEffect(() => {
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
    <button className="topbar__window-control minimize" onClick={() => appWindow.minimize()} title="Minimizar"><MaterialIcon name="remove" /></button>
    <button className="topbar__window-control maximize" onClick={async () => { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }} title={maximized ? 'Restaurar' : 'Maximizar'}><MaterialIcon name={maximized ? 'filter_none' : 'crop_square'} /></button>
    <button className="topbar__window-control close" onClick={() => appWindow.close()} title="Cerrar"><MaterialIcon name="close" /></button>
  </div>;

  return <>
    <header className={`topbar topbar--${platform}`} data-tauri-drag-region onDoubleClick={() => appWindow.toggleMaximize()}>
      {platform === 'macos' && windowControls}
      <div className="topbar__identity" data-tauri-drag-region><img src="/icon.webp" alt="" /><h1 data-tauri-drag-region>{t('app.name')}</h1></div>
      <div className="topbar__drag-zone" data-tauri-drag-region />
      <div className="topbar__device-section" onDoubleClick={event => event.stopPropagation()}>
        <button className="topbar__tcpip" disabled={!selectedDevice || selectedDevice.state !== 'device' || selectedDevice.serial.includes(':') || tcpipBusy} onClick={connectUsbOverTcpip} title="Pasar la conexión USB actual a Wi-Fi"><MaterialIcon name="usb" /><MaterialIcon name="arrow_forward" /><MaterialIcon name="wifi" /></button>
        <md-outlined-select
          className="topbar__device-selector"
          aria-label="Dispositivo seleccionado"
          value={selectedDevice?.serial ?? ''}
          disabled={loading || devices.length === 0 || undefined}
          onChange={(event: any) => selectDevice(event.currentTarget.value)}
          onDoubleClick={(event: MouseEvent) => event.stopPropagation()}
        >
          {devices.length === 0 && <md-select-option className="topbar__device-option" value="" selected><div slot="headline">{loading ? t('common.loading') : t('common.noData')}</div></md-select-option>}
          {devices.map(device => <md-select-option key={device.serial} value={device.serial} selected={selectedDevice?.serial === device.serial || undefined}>
            <div slot="headline">{device.model || device.serial} · {device.state}</div>
          </md-select-option>)}
        </md-outlined-select>
        <button className={`topbar__wireless ${wirelessOpen ? 'active' : ''}`} onClick={() => setWirelessOpen(true)} title="Conectar o emparejar dispositivo"><MaterialIcon name="add" /></button>
        <button className="topbar__action-btn" onClick={() => refreshDevices()} disabled={loading} title={t('main.refresh')}><MaterialIcon name="refresh" className={loading ? 'topbar__refresh-icon--spinning' : ''} /></button>
      </div>
      <div className="topbar__drag-zone" data-tauri-drag-region />
      {platform !== 'macos' && windowControls}
    </header>
    <WirelessDialog open={wirelessOpen} onClose={() => setWirelessOpen(false)} />
  </>;
}
