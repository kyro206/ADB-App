import { useDevices } from '../../context/DeviceContext';
import { useI18n } from '../../i18n';
import './TopBar.css';

export function TopBar() {
  const { t } = useI18n();
  const { devices, selectedDevice, loading, refreshDevices, selectDevice } = useDevices();

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__logo">⬡</span>
        <h1 className="topbar__title">{t('app.name')}</h1>
        <span className="topbar__version">v{t('app.version')}</span>
      </div>

      <div className="topbar__device-section">
        <label className="topbar__device-label">{t('main.device.label')}</label>
        <select
          className="topbar__device-selector"
          value={selectedDevice?.serial ?? ''}
          onChange={(e) => selectDevice(e.target.value)}
          disabled={loading || devices.length === 0}
        >
          {devices.length === 0 && (
            <option value="">{loading ? t('common.loading') : t('common.noData')}</option>
          )}
          {devices.map(device => (
            <option key={device.serial} value={device.serial}>
              {device.model || device.serial} — {device.state === 'device' ? '●' : '○'} {device.state}
            </option>
          ))}
        </select>
      </div>

      <div className="topbar__actions">
        <button
          className="topbar__action-btn"
          onClick={() => refreshDevices()}
          disabled={loading}
          title={t('main.refresh')}
        >
          <span className={`topbar__refresh-icon ${loading ? 'topbar__refresh-icon--spinning' : ''}`}>
            ⟳
          </span>
        </button>
      </div>
    </header>
  );
}
