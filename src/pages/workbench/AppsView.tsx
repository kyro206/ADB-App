import { MaterialIcon } from '../../components/MaterialIcon';
import { useI18n } from '../../locales';
import { appTone, formatBytes } from './utils';
import type { AppDetailsInfo, AppFilter, AppPermissionInfo, AppSummary } from './types';
import './AppsView.css';



export function AppsView({ apps, filteredApps, filter, appFilter, selectedPackage, details, metadataLoading, detailsLoading, busy, onFilterChange, onAppFilterChange, onSelect, onCloseDetail, onLoadMetadata, onRefresh, onInstall, onOpen, onStop, onUninstall, onToggleEnabled, onClearData, onClearCache, onExport, onBackgroundMode, onTogglePermission }: {
  apps: AppSummary[]; filteredApps: AppSummary[]; filter: string; appFilter: AppFilter; selectedPackage: string; details: AppDetailsInfo | null;
  metadataLoading: boolean; detailsLoading: boolean; busy: boolean;
  onFilterChange: (value: string) => void; onAppFilterChange: (value: AppFilter) => void; onSelect: (app: AppSummary) => void; onCloseDetail: () => void;
  onLoadMetadata: () => void; onRefresh: () => void; onInstall: () => void; onOpen: () => void; onStop: () => void; onUninstall: () => void; onToggleEnabled: () => void; onClearData: () => void; onClearCache: () => void; onExport: () => void;
  onBackgroundMode: (mode: 'unrestricted' | 'optimized' | 'restricted') => void; onTogglePermission: (permission: AppPermissionInfo) => void;
}) {
  const { t } = useI18n();
  const filters: Array<[AppFilter, string, string]> = [
    ['user', t('apps.filter.user'), 'person'], ['all', t('apps.filter.all'), 'apps'], ['system', t('apps.filter.system'), 'settings'], ['disabled', t('apps.filter.disabled'), 'block'],
  ];
  const pending = filteredApps.filter(app => !app.icon_data_url || app.display_name === app.package_name).length;
  const count = (value: AppFilter) => apps.filter(app => value === 'all' ? true : value === 'disabled' ? app.disabled : value === 'system' ? app.system_app && !app.disabled : !app.system_app && !app.disabled).length;
  return <div className="apps-material-host">
    <div className={`apps-material-page ${selectedPackage ? 'detail-open' : ''}`}>
      <section className="apps-material-catalog">
        <header className="apps-material-toolbar">
          <md-outlined-text-field className="apps-material-search" label={t('apps.search.placeholder')} value={filter} onInput={(event: Event) => onFilterChange((event.target as HTMLInputElement).value)}>
            <MaterialIcon slot="leading-icon" name="search" />
            {filter && (
              <md-icon-button slot="trailing-icon" onClick={() => onFilterChange('')}>
                <MaterialIcon name="close" />
              </md-icon-button>
            )}
          </md-outlined-text-field>
          <md-filled-tonal-button disabled={metadataLoading || !pending || undefined} onClick={onLoadMetadata}><MaterialIcon slot="icon" name="image_search" />{metadataLoading ? t('common.loading') : pending ? t('apps.action.loadMetadata', { pending }) : t('apps.action.metadataLoaded')}</md-filled-tonal-button>
          <md-icon-button aria-label={t('apps.action.refresh')} title={t('apps.action.refresh')} disabled={busy || undefined} onClick={onRefresh}><MaterialIcon name="refresh" className={busy ? 'apps-material-spin' : ''} /></md-icon-button>
          <md-filled-icon-button aria-label={t('apps.action.install')} title={t('apps.action.install')} onClick={onInstall}><MaterialIcon name="add" /></md-filled-icon-button>
        </header>
        <nav className="apps-material-filters">
          {filters.map(([value, label, icon]) => <button key={value} className={appFilter === value ? 'active' : ''} onClick={() => onAppFilterChange(value)}><MaterialIcon name={icon} filled={appFilter === value} /><span>{label}</span><strong>{count(value)}</strong><md-ripple /></button>)}
        </nav>
        <div className="apps-material-grid">
          {filteredApps.map(app => <button className={`apps-material-tile ${selectedPackage === app.package_name ? 'selected' : ''}`} key={app.package_name} onClick={() => onSelect(app)}>
            <div className={`apps-material-status-icon ${app.disabled ? 'disabled' : ''}`} title={app.disabled ? t('apps.status.disabled') : app.system_app ? t('apps.status.system') : t('apps.status.user')}>
              <MaterialIcon name={app.disabled ? 'block' : app.system_app ? 'settings' : 'person'} />
            </div>     
            <span className="app-icon-frame">{app.icon_data_url ? <img src={app.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(app.package_name)}`}>{app.display_name.slice(0, 2).toUpperCase()}</span>}</span>
            <span className="apps-material-tile__copy"><strong>{app.display_name}</strong><small>{app.package_name}</small></span>
            <md-ripple />
          </button>)}
          {!filteredApps.length && <div className="apps-material-empty"><MaterialIcon name="search_off" /><strong>{t('apps.empty.title')}</strong><span>{t('apps.empty.subtitle')}</span></div>}
        </div>
      </section>
      <aside className="apps-material-detail">
        {!details ? <div className="apps-material-empty detail"><MaterialIcon name="touch_app" /><strong>{t('apps.detail.empty.title')}</strong><span>{t('apps.detail.empty.subtitle')}</span></div> : <>
          <md-text-button className="apps-material-back" onClick={onCloseDetail}><MaterialIcon slot="icon" name="arrow_back" />{t('nav.apps')}</md-text-button>
          <header className="apps-material-detail__hero">
            <span className="app-icon-frame">{details.icon_data_url ? <img src={details.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(details.package_name)}`}>{details.display_name.slice(0, 2).toUpperCase()}</span>}</span>
            <div>
              <h2>{details.display_name}</h2>
              <p>{details.package_name}</p>
              <div className={`apps-material-status-icon ${details.disabled ? 'disabled' : ''}`} title={details.disabled ? t('apps.status.disabled') : details.system_app ? t('apps.detail.type.system') : t('apps.detail.type.user')}>
                <MaterialIcon name={details.disabled ? 'block' : details.system_app ? 'settings' : 'person'} />
              </div>
            </div>
          </header>
          
          <section className="apps-material-section">
            <header><span className="apps-material-section__title"><MaterialIcon name="bolt" /><h3>{t('apps.detail.actions')}</h3></span></header>
            <div className="apps-material-actions">
              <md-filled-button onClick={onOpen}><MaterialIcon slot="icon" name="open_in_new" />{t('apps.action.open')}</md-filled-button>
              <md-filled-tonal-button onClick={onStop}><MaterialIcon slot="icon" name="stop_circle" />{t('apps.action.stop')}</md-filled-tonal-button>
              <md-filled-tonal-button onClick={onToggleEnabled}><MaterialIcon slot="icon" name={details.disabled ? 'check_circle' : 'block'} />{details.disabled ? t('apps.action.enable') : t('apps.action.disable')}</md-filled-tonal-button>
              <md-filled-tonal-button onClick={onClearCache}><MaterialIcon slot="icon" name="cleaning_services" />{t('common.clearCache')}</md-filled-tonal-button>
              <md-outlined-button onClick={onClearData}><MaterialIcon slot="icon" name="delete_sweep" />{t('common.clearData')}</md-outlined-button>
              <md-outlined-button className="apps-material-danger" onClick={onUninstall}><MaterialIcon slot="icon" name="delete_forever" />{t('apps.action.uninstall')}</md-outlined-button>
              <md-filled-tonal-button onClick={onExport}><MaterialIcon slot="icon" name="download" />{t('apps.action.saveApk')}</md-filled-tonal-button>
            </div>
          </section>

          {detailsLoading ? (
            <div className="apps-material-section-loader" style={{ padding: '60px 0' }}>
              <md-circular-progress indeterminate />
            </div>
          ) : (
            <>
              <section className="apps-material-section">
                <header><span className="apps-material-section__title"><MaterialIcon name="battery_android_frame_full" /><h3>{t('apps.detail.energy')}</h3></span></header>
                <div className="apps-material-energy">{([['unrestricted',t('apps.energy.unrestricted'),'speed'],['optimized',t('apps.energy.optimized'),'eco'],['restricted',t('apps.energy.restricted'),'battery_saver']] as const).map(([value,label,icon])=><button key={value} className={details.background_mode===value?'active':''} onClick={()=>onBackgroundMode(value)}><MaterialIcon name={icon}/><span><strong>{label}</strong><small>{value==='unrestricted'?t('apps.energy.unrestricted.desc'):value==='optimized'?t('apps.energy.optimized.desc'):t('apps.energy.restricted.desc')}</small></span><md-ripple/></button>)}</div>
              </section>

              <section className="apps-material-section">
                <header><span className="apps-material-section__title"><MaterialIcon name="info" /><h3>{t('apps.detail.info')}</h3></span></header>
                <dl className="apps-material-info">
                  <div><dt>{t('apps.info.version')}</dt><dd>{details.version_name} ({details.version_code})</dd></div><div><dt>{t('apps.info.targetSdk')}</dt><dd>{details.target_sdk}</dd></div><div><dt>{t('apps.info.minSdk')}</dt><dd>{details.min_sdk}</dd></div><div><dt>{t('apps.info.installer')}</dt><dd>{details.installer}</dd></div><div><dt>{t('apps.info.apkSize')}</dt><dd>{formatBytes(details.code_size_bytes)}</dd></div><div><dt>{t('apps.info.dataSize')}</dt><dd>{formatBytes(details.data_size_bytes)}</dd></div><div><dt>{t('apps.info.cacheSize')}</dt><dd>{formatBytes(details.cache_size_bytes)}</dd></div><div className="wide"><dt>{t('apps.info.apkPath')}</dt><dd>{details.apk_path}</dd></div>
                </dl>
              </section>

              <section className="apps-material-section">
                <header>
                  <span className="apps-material-section__title"><MaterialIcon name="shield" /><h3>{t('apps.detail.permissions')}</h3></span>
                  <span className="apps-material-section__meta"><span>{t('apps.permissions.count', { granted: details.permissions.filter(permission=>permission.granted).length, total: details.permissions.length })}</span></span>
                </header>
                <div className="apps-material-permissions">
                  {details.permissions.map(permission=><div key={permission.name}><span><strong>{permission.name.split('.').pop()}</strong><small>{permission.name}</small></span><md-switch selected={permission.granted||undefined} disabled={!permission.runtime||undefined} onClick={()=>onTogglePermission(permission)}/></div>)}{!details.permissions.length&&<p>{t('apps.permissions.empty')}</p>}
                </div>
              </section>
            </>
          )}
        </>}
      </aside>
    </div>
  </div>;
}