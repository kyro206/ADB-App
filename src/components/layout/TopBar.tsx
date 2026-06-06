import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useDevices } from '../../context/DeviceContext';
import { useI18n } from '../../i18n';
import { MaterialIcon } from '../MaterialIcon';
import './TopBar.css';

type WirelessMode = 'connect' | 'pair' | 'qr';
type WirelessQrPayload = { service_name: string; password: string; qr_data_url: string };
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
  const [wirelessMode, setWirelessMode] = useState<WirelessMode>('connect');
  const [wirelessBusy, setWirelessBusy] = useState(false);
  const [wirelessStatus, setWirelessStatus] = useState('Listo para conectar');
  const [connectEndpoint, setConnectEndpoint] = useState('');
  const [pairEndpoint, setPairEndpoint] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [qrPayload, setQrPayload] = useState<WirelessQrPayload | null>(null);
  const [maximized, setMaximized] = useState(false);
  const platform = detectPlatform();
  const appWindow = getCurrentWindow();

  useEffect(() => {
    void appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => void appWindow.isMaximized().then(setMaximized));
    return () => { void unlisten.then(stop => stop()); };
  }, []);

  const runWireless = async (command: string, payload: Record<string, unknown>, pending: string, success: string) => {
    setWirelessBusy(true); setWirelessStatus(pending);
    try { setWirelessStatus(await invoke<string>(command, payload) || success); await refreshDevices(); }
    catch (error) { setWirelessStatus(String(error)); }
    finally { setWirelessBusy(false); }
  };
  const connectUsbOverTcpip = () => selectedDevice && runWireless('connect_usb_over_tcpip', { serial: selectedDevice.serial }, 'Activando TCP/IP y detectando la dirección Wi-Fi...', 'Conexión TCP/IP preparada');
  const generateQr = async () => {
    setWirelessBusy(true); setWirelessStatus('Generando código QR seguro...');
    try { setQrPayload(await invoke<WirelessQrPayload>('generate_wireless_qr')); setWirelessStatus('Escanea el QR desde Depuración inalámbrica y pulsa Emparejar'); }
    catch (error) { setWirelessStatus(String(error)); }
    finally { setWirelessBusy(false); }
  };
  const pairQr = () => qrPayload && runWireless('pair_wireless_qr', { serviceName: qrPayload.service_name, password: qrPayload.password }, 'Esperando al dispositivo después de escanear el QR...', 'Dispositivo emparejado');

  const windowControls = <div className="topbar__window-controls">
    <button className="topbar__window-control minimize" onClick={() => appWindow.minimize()} title="Minimizar"><MaterialIcon name="remove" /></button>
    <button className="topbar__window-control maximize" onClick={async () => { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }} title={maximized ? 'Restaurar' : 'Maximizar'}><MaterialIcon name={maximized ? 'filter_none' : 'crop_square'} /></button>
    <button className="topbar__window-control close" onClick={() => appWindow.close()} title="Cerrar"><MaterialIcon name="close" /></button>
  </div>;

  return <header className={`topbar topbar--${platform}`} data-tauri-drag-region onDoubleClick={() => appWindow.toggleMaximize()}>
    {platform === 'macos' && windowControls}
    <div className="topbar__identity" data-tauri-drag-region><img src="/icon.webp" alt="" /><h1 data-tauri-drag-region>{t('app.name')}</h1></div>
    <div className="topbar__drag-zone" data-tauri-drag-region />
    <div className="topbar__device-section" onDoubleClick={event => event.stopPropagation()}>
      <button className="topbar__tcpip" disabled={!selectedDevice || selectedDevice.state !== 'device' || selectedDevice.serial.includes(':') || wirelessBusy} onClick={connectUsbOverTcpip} title="Pasar la conexión USB actual a Wi-Fi"><MaterialIcon name="usb" /><MaterialIcon name="arrow_forward" /><MaterialIcon name="wifi" /></button>
      <select className="topbar__device-selector" value={selectedDevice?.serial ?? ''} onChange={event => selectDevice(event.target.value)} disabled={loading || devices.length === 0}>
        {devices.length === 0 && <option value="">{loading ? t('common.loading') : t('common.noData')}</option>}
        {devices.map(device => <option key={device.serial} value={device.serial}>{device.model || device.serial} - {device.state}</option>)}
      </select>
      <button className={`topbar__wireless ${wirelessOpen ? 'active' : ''}`} onClick={() => setWirelessOpen(current => !current)} title="Conectar o emparejar dispositivo"><MaterialIcon name="add" /></button>
      <button className="topbar__action-btn" onClick={() => refreshDevices()} disabled={loading} title={t('main.refresh')}><MaterialIcon name="refresh" className={loading ? 'topbar__refresh-icon--spinning' : ''} /></button>
    </div>
    <div className="topbar__drag-zone" data-tauri-drag-region />
    {platform !== 'macos' && windowControls}

    {wirelessOpen && <div className="wireless-panel">
      <div className="wireless-panel__header"><div><span>ADB INALÁMBRICO</span><h2>Conectar dispositivo</h2><p>Elige el método que muestra Android en Depuración inalámbrica.</p></div><button onClick={() => setWirelessOpen(false)}><MaterialIcon name="close" /></button></div>
      <div className="wireless-panel__tabs">
        <button className={wirelessMode === 'connect' ? 'active' : ''} onClick={() => setWirelessMode('connect')}><b><MaterialIcon name="wifi" /></b><span>Ya emparejado</span><small>Conectar por IP y puerto</small></button>
        <button className={wirelessMode === 'pair' ? 'active' : ''} onClick={() => setWirelessMode('pair')}><b><MaterialIcon name="pin" /></b><span>Código</span><small>Emparejar con código</small></button>
        <button className={wirelessMode === 'qr' ? 'active' : ''} onClick={() => setWirelessMode('qr')}><b><MaterialIcon name="qr_code_2" /></b><span>Código QR</span><small>Escanear y emparejar</small></button>
      </div>
      <div className="wireless-panel__content">
        {wirelessMode === 'connect' && <section className="wireless-method"><div className="wireless-method__intro"><b>Conectar un dispositivo ya emparejado</b><span>Introduce la dirección que aparece en Dirección IP y puerto.</span></div><label>Dirección IP y puerto<input value={connectEndpoint} onChange={event => setConnectEndpoint(event.target.value)} placeholder="192.168.1.38:44757" /></label><button className="primary" disabled={!connectEndpoint.trim() || wirelessBusy} onClick={() => runWireless('connect_wireless_device', { endpoint: connectEndpoint }, 'Conectando...', 'Conexión establecida')}>Conectar</button></section>}
        {wirelessMode === 'pair' && <section className="wireless-method"><div className="wireless-method__intro"><b>Emparejar con código</b><span>En Android abre Emparejar dispositivo con código de emparejamiento.</span></div><label>IP y puerto de emparejamiento<input value={pairEndpoint} onChange={event => setPairEndpoint(event.target.value)} placeholder="192.168.1.38:37845" /></label><label>Código de emparejamiento<input value={pairCode} onChange={event => setPairCode(event.target.value)} placeholder="123456" inputMode="numeric" /></label><button className="primary" disabled={!pairEndpoint.trim() || !pairCode.trim() || wirelessBusy} onClick={() => runWireless('pair_wireless_device', { endpoint: pairEndpoint, code: pairCode }, 'Emparejando...', 'Dispositivo emparejado')}>Emparejar</button></section>}
        {wirelessMode === 'qr' && <section className="wireless-method wireless-qr"><div className="wireless-method__intro"><b>Emparejar con QR</b><span>Escanea el código desde Depuración inalámbrica. No necesitas introducir datos técnicos.</span></div><div className="wireless-qr__preview">{qrPayload ? <img src={qrPayload.qr_data_url} alt="Código QR para emparejar ADB" /> : <span><MaterialIcon name="qr_code_2" /><small>Genera un QR para comenzar</small></span>}</div><div className="wireless-qr__actions"><button disabled={wirelessBusy} onClick={generateQr}>{qrPayload ? 'Generar otro QR' : 'Generar QR'}</button><button className="primary" disabled={!qrPayload || wirelessBusy} onClick={pairQr}>Ya lo he escaneado</button></div></section>}
      </div>
      <div className={`wireless-panel__status ${wirelessBusy ? 'busy' : ''}`}><MaterialIcon name={wirelessBusy ? 'progress_activity' : 'check_circle'} /><p>{wirelessStatus}</p></div>
    </div>}
  </header>;
}
