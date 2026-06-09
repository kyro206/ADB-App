import { useCallback, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm, save } from '@tauri-apps/plugin-dialog';
import { useDevices, type DeviceDetails } from '../context/DeviceContext';
import { useI18n } from '../locales';
import { MaterialIcon } from '../components/MaterialIcon';
import { PowerDialog } from '../components/dialogs/PowerDialog';
import './HomePage.css';

const formatMemory = (mb: number) => mb <= 0 ? '-' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
const formatStorage = (mb: number) => mb <= 0 ? '-' : mb >= 1024 * 1024 ? `${(mb / 1024 / 1024).toFixed(2)} TB` : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
const secondaryTitle = (details: DeviceDetails) => [details.manufacturer, details.soc, details.model].filter(value => value && value !== '-').join(' · ');

function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`material-surface ${className}`}>{children}</section>;
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
    if (label !== 'apagar pantalla' && !await confirm(`${label}${exitHint ? `\n\n${t('home.power.confirm.exit')}\n${exitHint}` : ''}\n\n${t('home.power.confirm.prompt')}`, { title: t('home.power.confirm.title'), kind: 'warning', okLabel: t('common.continue'), cancelLabel: t('common.cancel') })) return;
    setPowerBusy(true); setPowerOpen(false); setPowerStatus(t('home.power.sending', { label }));
    try { await invoke<string>('run_device_action', { serial: selectedDevice.serial, args }); setPowerStatus(t('home.power.sent', { label })); window.setTimeout(refreshDevices, 4000); }
    catch (error) { setPowerStatus(String(error)); }
    finally { setPowerBusy(false); }
  };

  const facts = [
    ['check_circle', t('home.field.state'), stateLabel], ['devices', t('home.field.deviceType'), dd ? t(`device.type.${dd.device_type}`) : '-'],
    ['tablet_android', t('home.field.model'), dd?.model || '-'], ['factory', t('home.field.manufacturer'), dd?.manufacturer || '-'],
    ['verified', t('home.field.brand'), dd?.brand || '-'], ['developer_board', t('home.field.architecture'), dd?.architecture || '-'],
    ['inventory_2', t('home.field.product'), dd?.product_name || '-'], ['tag', t('home.field.codename'), dd?.codename || '-'],
    ['fingerprint', t('home.field.serial'), dd?.serial || '-'],
  ];

  return <main className="home-material">
    {/* Contenido Izquierdo */}
    <div className="home-material__content">
      <Surface className="home-hero">
        <div><h2>ADB App</h2><p>{dd ? secondaryTitle(dd) : t('home.summary.empty')}</p>
          <div className="home-chips"><md-assist-chip label={stateLabel} /><md-assist-chip label={dd ? `Android ${dd.android_version} · API ${dd.api_level}` : t('common.noData')} /></div>
        </div>
        <div className="home-hero__actions"><md-filled-tonal-icon-button aria-label={t('home.power.options')} title={t('home.power.options')} disabled={!selectedDevice || powerBusy || undefined} onClick={() => setPowerOpen(true)}><MaterialIcon name="power_settings_new" /></md-filled-tonal-icon-button></div>
        {powerStatus && <small className="home-power-status">{powerStatus}</small>}
      </Surface>

      <div className="home-metrics">
        <Metric icon="battery_android_full" title={t('home.field.battery')} value={dd?.battery_level_percent != null && dd.battery_level_percent >= 0 ? `${dd.battery_level_percent}%` : '-'} total="100%" progress={dd?.battery_level_percent || 0} />
        <Metric icon="memory" title={t('home.ram.inUse')} value={dd ? formatMemory(dd.used_ram_mb) : '-'} total={dd ? formatMemory(dd.total_ram_mb) : '-'} progress={dd?.total_ram_mb ? dd.used_ram_mb * 100 / dd.total_ram_mb : 0} />
        <Metric icon="hard_drive" title={t('home.storage.inUse')} value={dd ? formatStorage(dd.used_storage_mb) : '-'} total={dd ? formatStorage(dd.total_storage_mb) : '-'} progress={dd?.total_storage_mb ? dd.used_storage_mb * 100 / dd.total_storage_mb : 0} />
      </div>

      {/* Nueva Sección de Datos Estilo Lista Material 3 */}
      <section className="home-facts">
        <div className="home-facts__list">
          {facts.map(([icon, label, value]) => (
            <div className="home-facts__item" key={label}>
              <div className="home-facts__item-leading">
                <MaterialIcon name={icon} />
              </div>
              <div className="home-facts__item-content">
                <span className="home-facts__item-label">{label}</span>
                <strong className="home-facts__item-value" title={value}>{value}</strong>
              </div>
              <button
                className="home-facts__item-copy"
                title={t('common.copy')}
                onClick={(e) => {
                  e.currentTarget.blur();
                  navigator.clipboard.writeText(value);
                }}
              >
                <MaterialIcon name="content_copy" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>

    {/* Contenido Derecho (Vista Previa Estilizada) */}
    <Surface className="home-preview">
      <header><div><h3>{t('home.preview.title')}</h3></div><div className="home-preview__actions"><md-icon-button aria-label={t('home.saveCapture')} title={t('home.saveCapture')} disabled={!screenshot || savingScreenshot || undefined} onClick={saveScreenshot}><MaterialIcon name="save" /></md-icon-button><md-filled-icon-button aria-label={t('home.capture')} title={t('home.capture')} disabled={capturing || !selectedDevice || selectedDevice.state !== 'device' || undefined} onClick={captureScreenshot}><MaterialIcon name="screenshot_monitor" /></md-filled-icon-button></div></header>
      <div className="home-preview__body">{screenshot ? <img src={screenshot} alt={t('home.preview.alt')} /> : <div><MaterialIcon name="smartphone" /><strong>{t('home.preview.empty.title')}</strong><span>{t('home.preview.empty.subtitle')}</span></div>}</div>
    </Surface>

    <PowerDialog open={powerOpen} busy={powerBusy} onClose={() => setPowerOpen(false)} onAction={performPowerAction} />
  </main>;
}