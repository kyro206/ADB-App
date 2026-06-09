import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDevices } from '../../context/DeviceContext';
import { useI18n } from '../../locales';
import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './WirelessDialog.css';

type WirelessMode = 'connect' | 'pair' | 'qr';
type WirelessQrPayload = { service_name: string; password: string; qr_data_url: string };

export function WirelessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { refreshDevices } = useDevices();
  const [mode, setMode] = useState<WirelessMode>('connect');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
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
    setBusy(true); setStatus(t('wireless.status.generatingQr'));
    try { setQrPayload(await invoke<WirelessQrPayload>('generate_wireless_qr')); setStatus(t('wireless.status.scanQr')); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };

  // Efecto para autogenerar el código QR al entrar en la pestaña correspondiente
  useEffect(() => {
    if (open && status === '') setStatus(t('wireless.status.ready'));
    if (mode === 'qr' && !qrPayload) {
      generateQr();
    }
  }, [mode, qrPayload, open, status, t]);

  return <AppModal open={open} onClose={onClose} title={t('wireless.title')} subtitle={t('wireless.subtitle')}>
    <md-tabs className="wireless-tabs">
      <md-primary-tab active={mode === 'connect' || undefined} onClick={() => setMode('connect')}>{t('wireless.tab.connect')}</md-primary-tab>
      <md-primary-tab active={mode === 'pair' || undefined} onClick={() => setMode('pair')}>{t('wireless.tab.code')}</md-primary-tab>
      <md-primary-tab active={mode === 'qr' || undefined} onClick={() => setMode('qr')}>{t('wireless.tab.qr')}</md-primary-tab>
    </md-tabs>
    
    {mode === 'connect' && <section className="wireless-form">
      <p>{t('wireless.connect.desc')}</p>
      <md-outlined-text-field label={t('wireless.connect.endpoint')} value={connectEndpoint} onInput={(event: any) => setConnectEndpoint(event.currentTarget.value)} />
      <md-filled-button disabled={!connectEndpoint.trim() || busy || undefined} onClick={() => run('connect_wireless_device', { endpoint: connectEndpoint }, t('wireless.connect.pending'), t('wireless.connect.success'))}>{t('wireless.tab.connect')}</md-filled-button>
    </section>}
    
    {mode === 'pair' && <section className="wireless-form">
      <p>{t('wireless.pair.desc')}</p>
      <md-outlined-text-field label={t('wireless.pair.endpoint')} value={pairEndpoint} onInput={(event: any) => setPairEndpoint(event.currentTarget.value)} />
      <md-outlined-text-field label={t('wireless.pair.code')} value={pairCode} onInput={(event: any) => setPairCode(event.currentTarget.value)} />
      <md-filled-button disabled={!pairEndpoint.trim() || !pairCode.trim() || busy || undefined} onClick={() => run('pair_wireless_device', { endpoint: pairEndpoint, code: pairCode }, t('wireless.pair.pending'), t('wireless.pair.success'))}>{t('wireless.action.pair')}</md-filled-button>
    </section>}
    
    {mode === 'qr' && <section className="wireless-qr">
      <div className="wireless-qr__preview">
        {qrPayload ? <img src={qrPayload.qr_data_url} alt={t('wireless.qr.alt')} /> : <MaterialIcon name="qr_code_2" />}
      </div>
      <div>
        <p>{t('wireless.qr.desc')}</p>
        <div className="wireless-qr__actions">
          {/* Se ha eliminado el botón de Generar QR */}
          <md-filled-button disabled={!qrPayload || busy || undefined} onClick={() => qrPayload && run('pair_wireless_qr', { serviceName: qrPayload.service_name, password: qrPayload.password }, t('wireless.qr.pending'), t('wireless.pair.success'))}>{t('wireless.action.pair')}</md-filled-button>
        </div>
      </div>
    </section>}
    
    <div className="wireless-status">{busy ? <md-circular-progress indeterminate /> : <MaterialIcon name="check_circle" filled />}<span>{status}</span></div>
  </AppModal>;
}