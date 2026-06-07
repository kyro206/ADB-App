import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDevices } from '../../context/DeviceContext';
import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './WirelessDialog.css';

type WirelessMode = 'connect' | 'pair' | 'qr';
type WirelessQrPayload = { service_name: string; password: string; qr_data_url: string };

export function WirelessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshDevices } = useDevices();
  const [mode, setMode] = useState<WirelessMode>('connect');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Listo para conectar');
  const [connectEndpoint, setConnectEndpoint] = useState('');
  const [pairEndpoint, setPairEndpoint] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [qrPayload, setQrPayload] = useState<WirelessQrPayload | null>(null);

  const run = async (command: string, payload: Record<string, unknown>, pending: string, success: string) => {
    setBusy(true); setStatus(pending);
    try { setStatus(await invoke<string>(command, payload) || success); await refreshDevices(); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };
  const generateQr = async () => {
    setBusy(true); setStatus('Generando código QR seguro...');
    try { setQrPayload(await invoke<WirelessQrPayload>('generate_wireless_qr')); setStatus('Escanea el QR y pulsa Emparejar'); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };

  return <AppModal open={open} onClose={onClose} title="Conectar dispositivo" subtitle="Conecta o empareja mediante Depuración inalámbrica.">
    <md-tabs>
      <md-primary-tab active={mode === 'connect'} onClick={() => setMode('connect')}>Conectar</md-primary-tab>
      <md-primary-tab active={mode === 'pair'} onClick={() => setMode('pair')}>Código</md-primary-tab>
      <md-primary-tab active={mode === 'qr'} onClick={() => setMode('qr')}>QR</md-primary-tab>
    </md-tabs>
    {mode === 'connect' && <section className="wireless-form">
      <p>Introduce la dirección IP y el puerto mostrados por Android.</p>
      <md-outlined-text-field label="Dirección IP y puerto" value={connectEndpoint} onInput={(event: any) => setConnectEndpoint(event.currentTarget.value)} />
      <md-filled-button disabled={!connectEndpoint.trim() || busy || undefined} onClick={() => run('connect_wireless_device', { endpoint: connectEndpoint }, 'Conectando...', 'Conexión establecida')}>Conectar</md-filled-button>
    </section>}
    {mode === 'pair' && <section className="wireless-form">
      <p>Abre “Emparejar dispositivo con código de emparejamiento” en Android.</p>
      <md-outlined-text-field label="IP y puerto de emparejamiento" value={pairEndpoint} onInput={(event: any) => setPairEndpoint(event.currentTarget.value)} />
      <md-outlined-text-field label="Código de emparejamiento" value={pairCode} onInput={(event: any) => setPairCode(event.currentTarget.value)} />
      <md-filled-button disabled={!pairEndpoint.trim() || !pairCode.trim() || busy || undefined} onClick={() => run('pair_wireless_device', { endpoint: pairEndpoint, code: pairCode }, 'Emparejando...', 'Dispositivo emparejado')}>Emparejar</md-filled-button>
    </section>}
    {mode === 'qr' && <section className="wireless-qr">
      <div className="wireless-qr__preview">{qrPayload ? <img src={qrPayload.qr_data_url} alt="Código QR para emparejar ADB" /> : <MaterialIcon name="qr_code_2" />}</div>
      <div><p>Escanea el código desde Depuración inalámbrica. No necesitas introducir datos técnicos.</p><div className="wireless-qr__actions"><md-outlined-button disabled={busy || undefined} onClick={generateQr}>{qrPayload ? 'Generar otro QR' : 'Generar QR'}</md-outlined-button><md-filled-button disabled={!qrPayload || busy || undefined} onClick={() => qrPayload && run('pair_wireless_qr', { serviceName: qrPayload.service_name, password: qrPayload.password }, 'Esperando al dispositivo...', 'Dispositivo emparejado')}>Emparejar</md-filled-button></div></div>
    </section>}
    <div className="wireless-status">{busy ? <md-circular-progress indeterminate /> : <MaterialIcon name="check_circle" filled />}<span>{status}</span></div>
  </AppModal>;
}
