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

    {wirelessOpen && <md-dialog className="wireless-dialog" open>
      <div slot="headline">Conectar dispositivo</div>
      <div slot="content" className="wireless-dialog__content">
        <p>Elige el método que muestra Android en Depuración inalámbrica.</p>
        <md-tabs>
          <md-primary-tab active={wirelessMode === 'connect'} onClick={() => setWirelessMode('connect')}>Conectar</md-primary-tab>
          <md-primary-tab active={wirelessMode === 'pair'} onClick={() => setWirelessMode('pair')}>Código</md-primary-tab>
          <md-primary-tab active={wirelessMode === 'qr'} onClick={() => setWirelessMode('qr')}>QR</md-primary-tab>
        </md-tabs>
        {wirelessMode === 'connect' && <section className="wireless-dialog__form">
          <p>Introduce la dirección que aparece en “Dirección IP y puerto”.</p>
          <md-outlined-text-field label="Dirección IP y puerto" value={connectEndpoint} onInput={(event: any) => setConnectEndpoint(event.currentTarget.value)} />
          <md-filled-button disabled={!connectEndpoint.trim() || wirelessBusy} onClick={() => runWireless('connect_wireless_device', { endpoint: connectEndpoint }, 'Conectando...', 'Conexión establecida')}>Conectar</md-filled-button>
        </section>}
        {wirelessMode === 'pair' && <section className="wireless-dialog__form">
          <p>Abre “Emparejar dispositivo con código de emparejamiento” en Android.</p>
          <md-outlined-text-field label="IP y puerto de emparejamiento" value={pairEndpoint} onInput={(event: any) => setPairEndpoint(event.currentTarget.value)} />
          <md-outlined-text-field label="Código de emparejamiento" value={pairCode} onInput={(event: any) => setPairCode(event.currentTarget.value)} />
          <md-filled-button disabled={!pairEndpoint.trim() || !pairCode.trim() || wirelessBusy} onClick={() => runWireless('pair_wireless_device', { endpoint: pairEndpoint, code: pairCode }, 'Emparejando...', 'Dispositivo emparejado')}>Emparejar</md-filled-button>
        </section>}
        {wirelessMode === 'qr' && <section className="wireless-dialog__qr">
          <div className="wireless-dialog__qr-preview">{qrPayload ? <img src={qrPayload.qr_data_url} alt="Código QR para emparejar ADB" /> : <MaterialIcon name="qr_code_2" />}</div>
          <p>Escanea el código desde Depuración inalámbrica. No necesitas introducir datos técnicos.</p>
          <div><md-outlined-button disabled={wirelessBusy} onClick={generateQr}>{qrPayload ? 'Generar otro QR' : 'Generar QR'}</md-outlined-button><md-filled-button disabled={!qrPayload || wirelessBusy} onClick={pairQr}>Ya lo he escaneado</md-filled-button></div>
        </section>}
        <div className="wireless-dialog__status">{wirelessBusy ? <md-circular-progress indeterminate /> : <MaterialIcon name="check_circle" filled />}<span>{wirelessStatus}</span></div>
      </div>
      <div slot="actions"><md-text-button onClick={() => setWirelessOpen(false)}>Cerrar</md-text-button></div>
    </md-dialog>}
  </header>;
}
