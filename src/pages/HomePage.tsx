import { useCallback, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm, save } from '@tauri-apps/plugin-dialog';
import { useDevices, type DeviceDetails } from '../context/DeviceContext';
import { useI18n } from '../i18n';
import { MaterialIcon } from '../components/MaterialIcon';
import './HomePage.css';

const formatMemory = (mb: number) => mb <= 0 ? '-' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
const formatStorage = (mb: number) => mb <= 0 ? '-' : mb >= 1024 * 1024 ? `${(mb / 1024 / 1024).toFixed(2)} TB` : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
const primaryTitle = (details: DeviceDetails) => details.marketing_name !== '-' ? details.marketing_name : details.model !== '-' ? details.model : details.serial;
const secondaryTitle = (details: DeviceDetails) => [details.manufacturer, details.soc, details.model].filter(value => value && value !== '-').join(' · ');

function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`material-surface ${className}`}><md-elevation />{children}</section>;
}

function Metric({ icon, title, value, total, progress }: { icon: string; title: string; value: string; total: string; progress: number }) {
  return <Surface className="home-metric"><MaterialIcon name={icon} /><div><span>{title}</span><strong>{value}</strong><small>Total: {total}</small><md-linear-progress value={Math.max(0, Math.min(1, progress / 100))} /></div></Surface>;
}

export function HomePage() {
  const { t } = useI18n();
  const { selectedDevice, deviceDetails, refreshDevices } = useDevices();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const [powerStatus, setPowerStatus] = useState('');
  const dd = deviceDetails;

  const stateLabel = dd ? ({ device: t('state.connected'), connecting: t('state.connecting'), unauthorized: t('state.unauthorized'), offline: t('state.offline'), recovery: t('state.recovery') }[dd.state] || t('state.unknown')) : t('common.noData');
  const captureScreenshot = useCallback(async () => {
    if (!selectedDevice || selectedDevice.state !== 'device') return;
    setCapturing(true);
    try { setScreenshot(`data:image/png;base64,${await invoke<string>('capture_screenshot', { serial: selectedDevice.serial })}`); }
    finally { setCapturing(false); }
  }, [selectedDevice]);
  const saveScreenshot = useCallback(async () => {
    if (!screenshot || savingScreenshot) return;
    const destination = await save({
      title: t('home.saveCapture'),
      defaultPath: `adb-captura-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      filters: [{ name: 'Imagen PNG', extensions: ['png'] }],
    });
    if (!destination) return;
    setSavingScreenshot(true);
    try {
      await invoke<string>('save_screenshot', { path: destination, pngBase64: screenshot.replace(/^data:image\/png;base64,/, '') });
    } finally {
      setSavingScreenshot(false);
    }
  }, [savingScreenshot, screenshot, t]);
  const performPowerAction = async (label: string, args: string[], exitHint = '') => {
    if (!selectedDevice || powerBusy) return;
    if (label !== 'apagar pantalla' && !await confirm(`${label}${exitHint ? `\n\nCómo salir:\n${exitHint}` : ''}\n\n¿Quieres continuar?`, { title: 'Confirmar acción de energía', kind: 'warning', okLabel: 'Continuar', cancelLabel: 'Cancelar' })) return;
    setPowerBusy(true); setPowerOpen(false); setPowerStatus(`Enviando orden: ${label}...`);
    try { await invoke<string>('run_device_action', { serial: selectedDevice.serial, args }); setPowerStatus(`Orden enviada: ${label}`); window.setTimeout(refreshDevices, 4000); }
    catch (error) { setPowerStatus(String(error)); }
    finally { setPowerBusy(false); }
  };

  const facts = [
    [t('home.field.state'), stateLabel], [t('home.field.deviceType'), dd ? t(`device.type.${dd.device_type}`) : '-'],
    [t('home.field.model'), dd?.model || '-'], [t('home.field.manufacturer'), dd?.manufacturer || '-'],
    [t('home.field.brand'), dd?.brand || '-'], [t('home.field.architecture'), dd?.architecture || '-'],
    [t('home.field.product'), dd?.product_name || '-'], [t('home.field.codename'), dd?.codename || '-'],
    [t('home.field.serial'), dd?.serial || '-'],
  ];

  return <main className="home-material">
    <div className="home-material__content">
      <Surface className="home-hero">
        <div><span className="home-overline">DISPOSITIVO ACTUAL</span><h2>{dd ? primaryTitle(dd) : t('app.name')}</h2><p>{dd ? secondaryTitle(dd) : t('home.summary.empty')}</p>
          <div className="home-chips"><md-assist-chip label={stateLabel} /><md-assist-chip label={dd ? `Android ${dd.android_version} · API ${dd.api_level}` : t('common.noData')} /></div>
        </div>
        <div className="home-hero__actions"><md-filled-button disabled={!selectedDevice || powerBusy} onClick={() => setPowerOpen(true)}><MaterialIcon name="power_settings_new" /> Opciones de energía</md-filled-button></div>
        {powerStatus && <small className="home-power-status">{powerStatus}</small>}
      </Surface>

      <div className="home-metrics">
        <Metric icon="battery_android_full" title={t('home.field.battery')} value={dd?.battery_level_percent != null && dd.battery_level_percent >= 0 ? `${dd.battery_level_percent}%` : '-'} total="100%" progress={dd?.battery_level_percent || 0} />
        <Metric icon="memory" title={t('home.ram.inUse')} value={dd ? formatMemory(dd.used_ram_mb) : '-'} total={dd ? formatMemory(dd.total_ram_mb) : '-'} progress={dd?.total_ram_mb ? dd.used_ram_mb * 100 / dd.total_ram_mb : 0} />
        <Metric icon="hard_drive" title={t('home.storage.inUse')} value={dd ? formatStorage(dd.used_storage_mb) : '-'} total={dd ? formatStorage(dd.total_storage_mb) : '-'} progress={dd?.total_storage_mb ? dd.used_storage_mb * 100 / dd.total_storage_mb : 0} />
      </div>

      <Surface className="home-facts"><header><MaterialIcon name="info" /><h3>Información del dispositivo</h3></header><div>{facts.map(([label, value]) => <article key={label}><span>{label}</span><strong title={value}>{value}</strong></article>)}</div></Surface>
    </div>

    <Surface className="home-preview">
      <header><div><span className="home-overline">PANTALLA</span><h3>Vista previa</h3></div><div className="home-preview__actions"><md-outlined-button disabled={!screenshot || savingScreenshot} onClick={saveScreenshot}><MaterialIcon name="save" /> {savingScreenshot ? 'Guardando...' : t('home.saveCapture')}</md-outlined-button><md-filled-button disabled={capturing || !selectedDevice || selectedDevice.state !== 'device'} onClick={captureScreenshot}><MaterialIcon name="screenshot_monitor" /> {capturing ? 'Capturando...' : t('home.capture')}</md-filled-button></div></header>
      <div className="home-preview__body">{screenshot ? <img src={screenshot} alt="Captura del dispositivo" /> : <div><MaterialIcon name="smartphone" /><strong>{t('home.preview.empty.title')}</strong><span>{t('home.preview.empty.subtitle')}</span></div>}</div>
    </Surface>

    {powerOpen && <md-dialog className="power-material-dialog" open>
      <div slot="headline">Opciones de energía</div>
      <div slot="content" className="power-material-list">
        <md-tonal-button onClick={() => performPowerAction('apagar pantalla', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}><MaterialIcon name="screen_lock_portrait" /> Apagar pantalla</md-tonal-button>
        <md-tonal-button onClick={() => performPowerAction('reiniciar Android', ['reboot'])}><MaterialIcon name="restart_alt" /> Reiniciar</md-tonal-button>
        <md-tonal-button onClick={() => performPowerAction('apagar dispositivo', ['shell', 'reboot', '-p'])}><MaterialIcon name="power_settings_new" /> Apagar</md-tonal-button>
        <md-divider />
        <md-outlined-button onClick={() => performPowerAction('Recovery', ['reboot', 'recovery'], 'Selecciona Reboot system now.')}>Recovery</md-outlined-button>
        <md-outlined-button onClick={() => performPowerAction('Bootloader', ['reboot', 'bootloader'], 'Ejecuta fastboot reboot o selecciona Start.')}>Bootloader</md-outlined-button>
        <md-outlined-button onClick={() => performPowerAction('Fastbootd', ['reboot', 'fastboot'], 'Ejecuta fastboot reboot.')}>Fastbootd</md-outlined-button>
        <md-outlined-button onClick={() => performPowerAction('modo descarga', ['reboot', 'download'], 'La forma de salir depende del fabricante.')}>Modo descarga</md-outlined-button>
      </div>
      <div slot="actions"><md-text-button onClick={() => setPowerOpen(false)}>Cerrar</md-text-button></div>
    </md-dialog>}
  </main>;
}
