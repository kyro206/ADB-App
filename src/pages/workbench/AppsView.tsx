import { MaterialIcon } from '../../components/MaterialIcon';
import { appTone, formatBytes } from './utils';
import type { AppDetailsInfo, AppFilter, AppPermissionInfo, AppSummary } from './types';
import './AppsView.css';

const filters: Array<[AppFilter, string, string]> = [
  ['user', 'Usuario', 'person'], ['all', 'Todas', 'apps'], ['system', 'Sistema', 'settings'], ['disabled', 'Deshabilitadas', 'block'],
];

export function AppsView({ apps, filteredApps, filter, appFilter, selectedPackage, details, metadataLoading, detailsLoading, busy, onFilterChange, onAppFilterChange, onSelect, onCloseDetail, onLoadMetadata, onRefresh, onInstall, onOpen, onStop, onUninstall, onToggleEnabled, onClearData, onClearCache, onExport, onBackgroundMode, onTogglePermission }: {
  apps: AppSummary[]; filteredApps: AppSummary[]; filter: string; appFilter: AppFilter; selectedPackage: string; details: AppDetailsInfo | null;
  metadataLoading: boolean; detailsLoading: boolean; busy: boolean;
  onFilterChange: (value: string) => void; onAppFilterChange: (value: AppFilter) => void; onSelect: (app: AppSummary) => void; onCloseDetail: () => void;
  onLoadMetadata: () => void; onRefresh: () => void; onInstall: () => void; onOpen: () => void; onStop: () => void; onUninstall: () => void; onToggleEnabled: () => void; onClearData: () => void; onClearCache: () => void; onExport: () => void;
  onBackgroundMode: (mode: 'unrestricted' | 'optimized' | 'restricted') => void; onTogglePermission: (permission: AppPermissionInfo) => void;
}) {
  const pending = filteredApps.filter(app => !app.icon_data_url || app.display_name === app.package_name).length;
  const count = (value: AppFilter) => apps.filter(app => value === 'all' ? true : value === 'disabled' ? app.disabled : value === 'system' ? app.system_app && !app.disabled : !app.system_app && !app.disabled).length;
  return <div className={`apps-material-page ${selectedPackage ? 'detail-open' : ''}`}>
    <section className="apps-material-catalog">
      <header className="apps-material-toolbar">
        <md-outlined-text-field className="apps-material-search" label="Buscar por nombre o paquete" value={filter} onInput={(event: Event) => onFilterChange((event.target as HTMLInputElement).value)}><MaterialIcon slot="leading-icon" name="search" />{filter && <MaterialIcon slot="trailing-icon" name="close" />}</md-outlined-text-field>
        <md-filled-tonal-button disabled={metadataLoading || !pending || undefined} onClick={onLoadMetadata}><MaterialIcon slot="icon" name="image_search" />{metadataLoading ? 'Cargando…' : pending ? `Cargar metadatos (${pending})` : 'Metadatos cargados'}</md-filled-tonal-button>
        <md-icon-button aria-label="Actualizar aplicaciones" title="Actualizar aplicaciones" disabled={busy || undefined} onClick={onRefresh}><MaterialIcon name="refresh" className={busy ? 'apps-material-spin' : ''} /></md-icon-button>
        <md-filled-icon-button aria-label="Instalar aplicaciones" title="Instalar aplicaciones" onClick={onInstall}><MaterialIcon name="add" /></md-filled-icon-button>
      </header>
      <nav className="apps-material-filters">
        {filters.map(([value, label, icon]) => <button key={value} className={appFilter === value ? 'active' : ''} onClick={() => onAppFilterChange(value)}><MaterialIcon name={icon} filled={appFilter === value} /><span>{label}</span><strong>{count(value)}</strong><md-ripple /></button>)}
      </nav>
      <div className="apps-material-grid">
        {filteredApps.map(app => <button className={`apps-material-tile ${selectedPackage === app.package_name ? 'selected' : ''}`} key={app.package_name} onClick={() => onSelect(app)}>
          <span className="app-icon-frame">{app.icon_data_url ? <img src={app.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(app.package_name)}`}>{app.display_name.slice(0, 2).toUpperCase()}</span>}</span>
          <span className="apps-material-tile__copy"><strong>{app.display_name}</strong><small>{app.package_name}</small></span>
          <span className="apps-material-chip">{app.disabled ? 'Deshabilitada' : app.system_app ? 'Sistema' : 'Usuario'}</span><md-ripple />
        </button>)}
        {!filteredApps.length && <div className="apps-material-empty"><MaterialIcon name="search_off" /><strong>Sin aplicaciones</strong><span>No hay resultados para este filtro.</span></div>}
      </div>
    </section>
    <aside className="apps-material-detail">
      {!details ? <div className="apps-material-empty detail"><MaterialIcon name="touch_app" /><strong>Selecciona una aplicación</strong><span>Consulta detalles, acciones, energía y permisos.</span></div> : <>
        <md-text-button className="apps-material-back" onClick={onCloseDetail}><MaterialIcon slot="icon" name="arrow_back" />Aplicaciones</md-text-button>
        <header className="apps-material-detail__hero">
          <span className="app-icon-frame">{details.icon_data_url ? <img src={details.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(details.package_name)}`}>{details.display_name.slice(0, 2).toUpperCase()}</span>}</span>
          <div><h2>{details.display_name}</h2><p>{details.package_name}</p><span className="apps-material-chip">{details.disabled ? 'Deshabilitada' : details.system_app ? 'Aplicación del sistema' : 'Aplicación de usuario'}</span></div>
        </header>
        <section className="apps-material-section"><header><span className="apps-material-section__title"><MaterialIcon name="bolt" /><h3>Acciones</h3></span></header><div className="apps-material-actions">
          <md-filled-button onClick={onOpen}><MaterialIcon slot="icon" name="open_in_new" />Abrir</md-filled-button>
          <md-filled-tonal-button onClick={onStop}><MaterialIcon slot="icon" name="stop_circle" />Detener</md-filled-tonal-button>
          <md-filled-tonal-button onClick={onToggleEnabled}><MaterialIcon slot="icon" name={details.disabled ? 'check_circle' : 'block'} />{details.disabled ? 'Habilitar' : 'Deshabilitar'}</md-filled-tonal-button>
          <md-filled-tonal-button onClick={onClearCache}><MaterialIcon slot="icon" name="cleaning_services" />Borrar caché</md-filled-tonal-button>
          <md-outlined-button onClick={onClearData}><MaterialIcon slot="icon" name="delete_sweep" />Borrar datos</md-outlined-button>
          <md-outlined-button className="apps-material-danger" onClick={onUninstall}><MaterialIcon slot="icon" name="delete_forever" />Desinstalar</md-outlined-button>
          <md-filled-tonal-button onClick={onExport}><MaterialIcon slot="icon" name="download" />Guardar APK</md-filled-tonal-button>
        </div></section>
        <section className="apps-material-section"><header><span className="apps-material-section__title"><MaterialIcon name="battery_android_frame_full" /><h3>Uso en segundo plano</h3></span>{detailsLoading&&<md-circular-progress indeterminate/>}</header><div className="apps-material-energy">{([['unrestricted','Sin restricciones','speed'],['optimized','Optimizada','eco'],['restricted','Restringida','battery_saver']] as const).map(([value,label,icon])=><button key={value} className={details.background_mode===value?'active':''} onClick={()=>onBackgroundMode(value)}><MaterialIcon name={icon}/><span><strong>{label}</strong><small>{value==='unrestricted'?'Permite actividad continua':value==='optimized'?'Android administra el consumo':'Limita la actividad de fondo'}</small></span><md-ripple/></button>)}</div></section>
        <section className="apps-material-section"><header><span className="apps-material-section__title"><MaterialIcon name="info" /><h3>Información</h3></span>{detailsLoading&&<md-circular-progress indeterminate/>}</header><dl className="apps-material-info">
          <div><dt>Versión</dt><dd>{details.version_name} ({details.version_code})</dd></div><div><dt>Target SDK</dt><dd>{details.target_sdk}</dd></div><div><dt>Min SDK</dt><dd>{details.min_sdk}</dd></div><div><dt>Instalador</dt><dd>{details.installer}</dd></div><div><dt>Tamaño APK</dt><dd>{formatBytes(details.code_size_bytes)}</dd></div><div><dt>Datos</dt><dd>{formatBytes(details.data_size_bytes)}</dd></div><div><dt>Caché</dt><dd>{formatBytes(details.cache_size_bytes)}</dd></div><div className="wide"><dt>Ruta APK</dt><dd>{details.apk_path}</dd></div>
        </dl></section>
        <section className="apps-material-section"><header><span className="apps-material-section__title"><MaterialIcon name="shield" /><h3>Permisos</h3></span><span className="apps-material-section__meta">{detailsLoading&&<md-circular-progress indeterminate/>}<span>{details.permissions.filter(permission=>permission.granted).length} de {details.permissions.length}</span></span></header><div className="apps-material-permissions">
          {details.permissions.map(permission=><div key={permission.name}><span><strong>{permission.name.split('.').pop()}</strong><small>{permission.name}</small></span><md-switch selected={permission.granted||undefined} disabled={!permission.runtime||undefined} onClick={()=>onTogglePermission(permission)}/></div>)}{!details.permissions.length&&<p>Esta aplicación no declara permisos.</p>}
        </div></section>
      </>}
    </aside>
  </div>;
}
