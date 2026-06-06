import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDevices } from '../../context/DeviceContext';
import { useI18n } from '../../i18n';
import './TopBar.css';

type WirelessMode = 'connect' | 'pair' | 'qr';
type WirelessQrPayload = { service_name: string; password: string; qr_data_url: string };

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

  const runWireless = async (command: string, payload: Record<string, unknown>, pending: string, success: string) => {
    setWirelessBusy(true);
    setWirelessStatus(pending);
    try {
      const result = await invoke<string>(command, payload);
      setWirelessStatus(result || success);
      await refreshDevices();
    } catch (error) {
      setWirelessStatus(String(error));
    } finally {
      setWirelessBusy(false);
    }
  };

  const connectUsbOverTcpip = async () => {
    if (!selectedDevice) return;
    await runWireless(
      'connect_usb_over_tcpip',
      { serial: selectedDevice.serial },
      'Activando TCP/IP y detectando la dirección Wi-Fi...',
      'Conexión TCP/IP preparada',
    );
  };

  const generateQr = async () => {
    setWirelessBusy(true);
    setWirelessStatus('Generando código QR seguro...');
    try {
      const value = await invoke<WirelessQrPayload>('generate_wireless_qr');
      setQrPayload(value);
      setWirelessStatus('Escanea el QR desde Depuración inalámbrica y pulsa Emparejar');
    } catch (error) {
      setWirelessStatus(String(error));
    } finally {
      setWirelessBusy(false);
    }
  };

  const pairQr = async () => {
    if (!qrPayload) return;
    await runWireless(
      'pair_wireless_qr',
      { serviceName: qrPayload.service_name, password: qrPayload.password },
      'Esperando al dispositivo después de escanear el QR...',
      'Dispositivo emparejado',
    );
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__logo">⬡</span>
        <h1 className="topbar__title">{t('app.name')}</h1>
        <span className="topbar__version">v{t('app.version')}</span>
      </div>

      <div className="topbar__device-section">
        <button
          className="topbar__tcpip"
          disabled={!selectedDevice || selectedDevice.state !== 'device' || selectedDevice.serial.includes(':') || wirelessBusy}
          onClick={connectUsbOverTcpip}
          title="Mantener conectado por Wi-Fi al retirar el USB"
        >
          <b>USB</b><span>→</span><b>IP</b>
        </button>
        <label className="topbar__device-label">{t('main.device.label')}</label>
        <select
          className="topbar__device-selector"
          value={selectedDevice?.serial ?? ''}
          onChange={(event) => selectDevice(event.target.value)}
          disabled={loading || devices.length === 0}
        >
          {devices.length === 0 && <option value="">{loading ? t('common.loading') : t('common.noData')}</option>}
          {devices.map(device => (
            <option key={device.serial} value={device.serial}>
              {device.model || device.serial} — {device.state === 'device' ? '●' : '○'} {device.state}
            </option>
          ))}
        </select>
        <button className={`topbar__wireless ${wirelessOpen ? 'active' : ''}`} onClick={() => setWirelessOpen(current => !current)} title="Conectar o emparejar por Wi-Fi">⌁</button>
      </div>

      <div className="topbar__actions">
        <button className="topbar__action-btn" onClick={() => refreshDevices()} disabled={loading} title={t('main.refresh')}>
          <span className={`topbar__refresh-icon ${loading ? 'topbar__refresh-icon--spinning' : ''}`}>⟳</span>
        </button>
      </div>

      {wirelessOpen && <div className="wireless-panel">
        <div className="wireless-panel__header">
          <div><span>ADB INALÁMBRICO</span><h2>Conectar dispositivo</h2><p>Elige el método que muestra Android en Depuración inalámbrica.</p></div>
          <button onClick={() => setWirelessOpen(false)}>×</button>
        </div>
        <div className="wireless-panel__tabs">
          <button className={wirelessMode === 'connect' ? 'active' : ''} onClick={() => setWirelessMode('connect')}><b>⌁</b><span>Ya emparejado</span><small>Conectar por IP y puerto</small></button>
          <button className={wirelessMode === 'pair' ? 'active' : ''} onClick={() => setWirelessMode('pair')}><b>#</b><span>Código</span><small>Emparejar con código</small></button>
          <button className={wirelessMode === 'qr' ? 'active' : ''} onClick={() => setWirelessMode('qr')}><b>▦</b><span>Código QR</span><small>Escanear y emparejar</small></button>
        </div>

        <div className="wireless-panel__content">
          {wirelessMode === 'connect' && <section className="wireless-method">
            <div className="wireless-method__intro"><b>Conectar un dispositivo ya emparejado</b><span>Introduce la dirección que aparece en “Dirección IP y puerto”.</span></div>
            <label>Dirección IP y puerto<input value={connectEndpoint} onChange={event => setConnectEndpoint(event.target.value)} placeholder="192.168.1.38:44757" /></label>
            <button className="primary" disabled={!connectEndpoint.trim() || wirelessBusy} onClick={() => runWireless('connect_wireless_device', { endpoint: connectEndpoint }, 'Conectando...', 'Conexión establecida')}>Conectar</button>
          </section>}

          {wirelessMode === 'pair' && <section className="wireless-method">
            <div className="wireless-method__intro"><b>Emparejar con código</b><span>En Android abre “Emparejar dispositivo con código de emparejamiento”.</span></div>
            <label>IP y puerto de emparejamiento<input value={pairEndpoint} onChange={event => setPairEndpoint(event.target.value)} placeholder="192.168.1.38:37845" /></label>
            <label>Código de emparejamiento<input value={pairCode} onChange={event => setPairCode(event.target.value)} placeholder="123456" inputMode="numeric" /></label>
            <button className="primary" disabled={!pairEndpoint.trim() || !pairCode.trim() || wirelessBusy} onClick={() => runWireless('pair_wireless_device', { endpoint: pairEndpoint, code: pairCode }, 'Emparejando...', 'Dispositivo emparejado')}>Emparejar</button>
          </section>}

          {wirelessMode === 'qr' && <section className="wireless-method wireless-qr">
            <div className="wireless-method__intro"><b>Emparejar con QR</b><span>En Android pulsa “Emparejar dispositivo con código QR”. No necesitas introducir ningún dato técnico.</span></div>
            <div className="wireless-qr__preview">{qrPayload ? <img src={qrPayload.qr_data_url} alt="Código QR para emparejar ADB" /> : <span><b>▦</b><small>Genera un QR para comenzar</small></span>}</div>
            <div className="wireless-qr__actions"><button disabled={wirelessBusy} onClick={generateQr}>{qrPayload ? 'Generar otro QR' : 'Generar QR'}</button><button className="primary" disabled={!qrPayload || wirelessBusy} onClick={pairQr}>Ya lo he escaneado</button></div>
          </section>}
        </div>
        <div className={`wireless-panel__status ${wirelessBusy ? 'busy' : ''}`}><span>{wirelessBusy ? '●' : '✓'}</span><p>{wirelessStatus}</p></div>
      </div>}
    </header>
  );
}
