import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useDevices, DeviceDetails } from '../context/DeviceContext';
import { useI18n } from '../i18n';
import './HomePage.css';

function formatMemory(mb: number): string {
  if (mb <= 0) return '-';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatStorage(mb: number): string {
  if (mb <= 0) return '-';
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(2)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function getStateLabel(state: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    device: t('state.connected'),
    connecting: t('state.connecting'),
    unauthorized: t('state.unauthorized'),
    offline: t('state.offline'),
    recovery: t('state.recovery'),
  };
  return map[state] ?? t('state.unknown');
}

function getDeviceTypeLabel(type: string, t: (key: string) => string): string {
  return t(`device.type.${type}`) || t('device.type.unknown');
}

function primaryTitle(details: DeviceDetails): string {
  if (details.marketing_name && details.marketing_name !== '-') return details.marketing_name;
  if (details.model && details.model !== '-') return details.model;
  return details.serial;
}

function secondaryTitle(details: DeviceDetails): string {
  const parts: string[] = [];
  if (details.manufacturer && details.manufacturer !== '-') parts.push(details.manufacturer);
  if (details.soc && details.soc !== '-') parts.push(details.soc);
  if (details.model && details.model !== '-') parts.push(details.model);
  return parts.length > 0 ? parts.join(' | ') : '';
}

interface FactCardProps {
  label: string;
  value: string;
  wide?: boolean;
}

function FactCard({ label, value, wide }: FactCardProps) {
  return (
    <div className={`fact-card ${wide ? 'fact-card--wide' : ''}`}>
      <span className="fact-card__label">{label}</span>
      <span className="fact-card__value" title={value}>{value}</span>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  total: string;
  percent: number;
  color: string;
}

function MetricCard({ title, value, total, percent, color }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-card__header">
        <span className="metric-card__title">{title}</span>
        <span className="metric-card__value">{value}</span>
      </div>
      <div className="metric-card__bar-track">
        <div
          className="metric-card__bar-fill"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }}
        />
      </div>
      <span className="metric-card__footer">Total: {total}</span>
    </div>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const { selectedDevice, deviceDetails, refreshDevices } = useDevices();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [powerMenuOpen, setPowerMenuOpen] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const [powerStatus, setPowerStatus] = useState('');

  const captureScreenshot = useCallback(async () => {
    if (!selectedDevice || selectedDevice.state !== 'device') return;
    setCapturing(true);
    try {
      const base64: string = await invoke('capture_screenshot', { serial: selectedDevice.serial });
      setScreenshot(`data:image/png;base64,${base64}`);
    } catch (err) {
      console.error('Screenshot failed:', err);
    } finally {
      setCapturing(false);
    }
  }, [selectedDevice]);

  const performPowerAction = async (label: string, args: string[], exitHint = '') => {
    if (!selectedDevice || powerBusy) return;
    if (exitHint) {
      const accepted = await confirm(
        `El dispositivo se reiniciará en ${label}.\n\nCómo salir:\n${exitHint}\n\n¿Seguro que quieres continuar?`,
        { title: `Reiniciar en ${label}`, kind: 'warning', okLabel: 'Reiniciar', cancelLabel: 'Cancelar' },
      );
      if (!accepted) return;
    } else if (label !== 'apagar pantalla') {
      const accepted = await confirm(
        `Se ejecutará "${label}" sobre el dispositivo ${selectedDevice.serial}.\n\n¿Quieres continuar?`,
        { title: 'Confirmar acción de energía', kind: 'warning', okLabel: 'Continuar', cancelLabel: 'Cancelar' },
      );
      if (!accepted) return;
    }
    setPowerBusy(true);
    setPowerMenuOpen(false);
    setPowerStatus(`Enviando orden: ${label}...`);
    try {
      await invoke<string>('run_device_action', { serial: selectedDevice.serial, args });
      setPowerStatus(`Orden enviada: ${label}`);
      window.setTimeout(() => refreshDevices(), 4000);
      window.setTimeout(() => refreshDevices(), 12000);
    } catch (error) {
      setPowerStatus(String(error));
    } finally {
      setPowerBusy(false);
    }
  };

  const hasDevice = !!deviceDetails;
  const dd = deviceDetails;

  return (
    <div className="home-page">
      <div className="home-page__summary">
        {/* Hero */}
        <div className="hero-card">
          <div className="hero-card__text">
            <h2 className="hero-card__title">
              {hasDevice ? primaryTitle(dd!) : t('app.name')}
            </h2>
            <p className="hero-card__subtitle">
              {hasDevice ? secondaryTitle(dd!) : t('home.summary.empty')}
            </p>
            <div className="hero-card__chips">
              <span className="chip">
                {hasDevice ? getStateLabel(dd!.state, t) : t('common.noData')}
              </span>
              <span className="chip">
                {hasDevice
                  ? dd!.api_level !== '-'
                    ? `Android ${dd!.android_version} / API ${dd!.api_level}`
                    : `Android ${dd!.android_version}`
                  : t('common.noData')
                }
              </span>
            </div>
          </div>
          <div className="hero-card__power">
            <button className="hero-power-button" disabled={!selectedDevice || powerBusy} onClick={() => setPowerMenuOpen(current => !current)} title="Opciones de energía">⏻</button>
            {powerMenuOpen && <div className="power-menu">
              <header><div><b>Opciones de energía</b><span>{selectedDevice?.model || selectedDevice?.serial}</span></div><button onClick={() => setPowerMenuOpen(false)}>×</button></header>
              <div className="power-menu__quick">
                <button onClick={() => performPowerAction('apagar pantalla', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}><b>◐</b><span>Apagar pantalla</span></button>
                <button onClick={() => performPowerAction('reiniciar Android', ['reboot'])}><b>↻</b><span>Reiniciar</span></button>
                <button className="danger" onClick={() => performPowerAction('apagar dispositivo', ['shell', 'reboot', '-p'])}><b>⏻</b><span>Apagar</span></button>
              </div>
              <p>Modos de arranque avanzados</p>
              <div className="power-menu__advanced">
                <button onClick={() => performPowerAction('Recovery', ['reboot', 'recovery'], 'Selecciona "Reboot system now" en el menú Recovery para volver a Android.')}><span><b>Recovery</b><small>Recuperación y mantenimiento</small></span><i>›</i></button>
                <button onClick={() => performPowerAction('Bootloader', ['reboot', 'bootloader'], 'Conecta el dispositivo al PC y ejecuta "fastboot reboot", o elige Start con los botones físicos.')}><span><b>Bootloader</b><small>Gestor de arranque</small></span><i>›</i></button>
                <button onClick={() => performPowerAction('Fastbootd', ['reboot', 'fastboot'], 'Selecciona "Reboot system now" o ejecuta "fastboot reboot" desde el PC.')}><span><b>Fastbootd</b><small>Fastboot en espacio de usuario</small></span><i>›</i></button>
                <button onClick={() => performPowerAction('modo descarga', ['reboot', 'download'], 'Normalmente debes mantener Power y Volumen abajo varios segundos. La combinación exacta depende del fabricante.')}><span><b>Modo descarga</b><small>Flasheo específico del fabricante</small></span><i>›</i></button>
              </div>
            </div>}
          </div>
          {powerStatus && <span className="hero-power-status">{powerStatus}</span>}
        </div>

        {/* Facts Grid */}
        <div className="facts-grid">
          <FactCard label={t('home.field.state')} value={hasDevice ? getStateLabel(dd!.state, t) : '-'} />
          <FactCard label={t('home.field.deviceType')} value={hasDevice ? getDeviceTypeLabel(dd!.device_type, t) : '-'} />
          <FactCard label={t('home.field.battery')} value={hasDevice && dd!.battery_level_percent >= 0 ? `${dd!.battery_level_percent}%` : '-'} />
          <FactCard label={t('home.field.model')} value={dd?.model ?? '-'} />
          <FactCard label={t('home.field.manufacturer')} value={dd?.manufacturer ?? '-'} />
          <FactCard label={t('home.field.brand')} value={dd?.brand ?? '-'} />
          <FactCard label={t('home.field.architecture')} value={dd?.architecture ?? '-'} />
          <FactCard label={t('home.field.product')} value={dd?.product_name ?? '-'} />
          <FactCard label={t('home.field.codename')} value={dd?.codename ?? '-'} />
          <FactCard label={t('home.field.serial')} value={dd?.serial ?? '-'} wide />
        </div>

        {/* Metrics */}
        <div className="metrics-grid">
          <MetricCard
            title={t('home.field.battery')}
            value={dd?.battery_level_percent != null && dd.battery_level_percent >= 0 ? `${dd.battery_level_percent}%` : '-'}
            total="100%"
            percent={dd?.battery_level_percent ?? 0}
            color="rgb(40, 205, 98)"
          />
          <MetricCard
            title={t('home.ram.inUse')}
            value={dd ? formatMemory(dd.used_ram_mb) : '-'}
            total={dd ? formatMemory(dd.total_ram_mb) : '-'}
            percent={dd && dd.total_ram_mb > 0 ? Math.round((dd.used_ram_mb * 100) / dd.total_ram_mb) : 0}
            color="rgb(40, 205, 98)"
          />
          <MetricCard
            title={t('home.storage.inUse')}
            value={dd ? formatStorage(dd.used_storage_mb) : '-'}
            total={dd ? formatStorage(dd.total_storage_mb) : '-'}
            percent={dd && dd.total_storage_mb > 0 ? Math.round((dd.used_storage_mb * 100) / dd.total_storage_mb) : 0}
            color="rgb(255, 69, 78)"
          />
        </div>
      </div>

      {/* Screenshot Panel */}
      <div className="home-page__capture">
        <div className="capture-actions">
          <button
            className="capture-btn capture-btn--primary"
            onClick={captureScreenshot}
            disabled={capturing || !selectedDevice || selectedDevice.state !== 'device'}
            title={t('home.capture')}
          >
            📷
          </button>
          <button
            className="capture-btn"
            disabled={!screenshot}
            title={t('home.saveCapture')}
          >
            💾
          </button>
        </div>
        <div className="screenshot-preview">
          {screenshot ? (
            <img src={screenshot} alt="Device screenshot" className="screenshot-preview__image" />
          ) : (
            <div className="screenshot-preview__empty">
              <span className="screenshot-preview__empty-icon">📱</span>
              <span className="screenshot-preview__empty-title">{t('home.preview.empty.title')}</span>
              <span className="screenshot-preview__empty-subtitle">{t('home.preview.empty.subtitle')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
