import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../locales';
import type { AppSummary, AppDetailsInfo, AppPermissionInfo } from './workbench/types';

export interface AppSettings { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; }
import { DestructiveActionDialog } from '../components/dialogs/DestructiveActionDialog';
import { InstallationDialog } from '../components/dialogs/InstallationDialog';
import { MaterialIcon } from '../components/MaterialIcon';
import { appTone, formatBytes } from './workbench/utils';
import './AppsPage.css';

export function AppsPage({ serial, setStatus, setBusy, run, scrcpy, tab, appSettings }: { serial: string; setStatus: (s: string) => void; setBusy: (b: boolean) => void; run: (args: string[], success?: string) => Promise<string | undefined>; scrcpy?: (args: string[]) => Promise<void>; tab: string; appSettings: AppSettings | null; }) {
  const { t } = useI18n();
  
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [appDetails, setAppDetails] = useState<AppDetailsInfo | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [attemptedMetadata, setAttemptedMetadata] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [installingApps, setInstallingApps] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installFiles, setInstallFiles] = useState<string[]>([]);
  const [installResult, setInstallResult] = useState('');

  const [installReplace, setInstallReplace] = useState(true);
  const [installGrant, setInstallGrant] = useState(true);
  const [installTest, setInstallTest] = useState(true);
  const [installBypass, setInstallBypass] = useState(false);
  const [filter, setFilter] = useState<'all' | 'user' | 'system' | 'disabled'>('user');
  const [appFilter, setAppFilter] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [destructiveAction, setDestructiveAction] = useState<'uninstall' | 'clear-data' | null>(null);
  const [destructiveBusy, setDestructiveBusy] = useState(false);

  const filteredApps = useMemo(() => {
    let result = apps;
    if (filter === 'user') result = result.filter(app => !app.system_app);
    if (filter === 'system') result = result.filter(app => app.system_app);
    if (appFilter) {
      const lower = appFilter.toLowerCase();
      result = result.filter(app => app.display_name.toLowerCase().includes(lower) || app.package_name.toLowerCase().includes(lower));
    }
    return result;
  }, [apps, filter, appFilter]);

  const appsNeedingMetadata = useMemo(() => filteredApps.filter(app => !app.icon_data_url), [filteredApps]);
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  const filterRef = useRef(filter);
  useEffect(() => { filterRef.current = filter; }, [filter]);

  const refreshApps = async () => {
    if (!serial) return;
    setBusy(true);
    setAttemptedMetadata(false);
    try {
      const value = await invoke<AppSummary[]>('list_apps', { serial });
      setApps(value); setStatus('');
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (tab === 'apps' && serial && !apps.length) refreshApps();
  }, [tab, serial]);

  useEffect(() => {
    if (tab === 'apps' && appSettings && !appSettings.cache_enabled && appsNeedingMetadata.length > 0 && !metadataLoading && !attemptedMetadata) {
      setAttemptedMetadata(true);
      loadVisibleMetadata();
    }
  }, [tab, appSettings?.cache_enabled, appsNeedingMetadata.length, metadataLoading, attemptedMetadata]);

  useEffect(() => {
    setAttemptedMetadata(false);
  }, [filter, tab]);

  const refreshAppDetails = async (packageName = selectedPackage) => {
    if (!serial || !packageName) return;
    setDetailsLoading(true);
    try {
      const value = await invoke<AppDetailsInfo>('get_app_details', { serial, packageName });
      const summary = apps.find(app => app.package_name === packageName);
      setAppDetails((current: AppDetailsInfo | null) => current?.package_name === packageName
        ? { ...value, display_name: summary && summary.display_name !== summary.package_name ? summary.display_name : value.display_name, icon_data_url: summary?.icon_data_url || value.icon_data_url }
        : current);
      setApps((current: AppSummary[]) => current.map(app => app.package_name === packageName ? {
        ...app,
        display_name: value.display_name !== value.package_name ? value.display_name : app.display_name,
        disabled: value.disabled,
        system_app: value.system_app,
        icon_data_url: value.icon_data_url || app.icon_data_url,
      } : app));
    } catch (error) { setStatus(String(error)); } finally { setDetailsLoading(false); }
  };

  const selectApplication = async (app: AppSummary) => {
    setSelectedPackage(app.package_name);
    setAppDetails({
      ...app,
      version_name: '-',
      version_code: '-',
      target_sdk: '-',
      min_sdk: '-',
      installer: '-',
      data_dir: '-',
      code_size_bytes: -1,
      data_size_bytes: -1,
      cache_size_bytes: -1,
      background_mode: 'optimized',
      permissions: [],
      install_date: '-',
      update_date: '-',
    });
    void refreshAppDetails(app.package_name);
  };

  const loadVisibleMetadata = async () => {
    if (!serial || !appsNeedingMetadata.length || metadataLoading) return;
    setMetadataLoading(true);
    setStatus(t('workbench.status.metadataLoading', { count: appsNeedingMetadata.length }));
    let loaded = 0;
    let failed = 0;
    const currentFilter = filterRef.current;
    try {
      for (let start = 0; start < appsNeedingMetadata.length; start += 3) {
        if (filterRef.current !== currentFilter || tabRef.current !== 'apps') {
          break;
        }
        const batch = appsNeedingMetadata.slice(start, start + 3);
        const results = await Promise.allSettled(batch.map(app => invoke<AppSummary>('enrich_app_summary', {
          serial, packageName: app.package_name, apkPath: app.apk_path, systemApp: app.system_app, disabled: app.disabled,
        })));
        const summaries = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        loaded += summaries.length;
        failed += results.length - summaries.length;
        setApps((current: AppSummary[]) => current.map(app => summaries.find(summary => summary.package_name === app.package_name) || app));
        setAppDetails((current: AppDetailsInfo | null) => {
          if (!current) return current;
          const summary = summaries.find(item => item.package_name === current.package_name);
          return summary ? { ...current, display_name: summary.display_name, icon_data_url: summary.icon_data_url } : current;
        });
        setStatus(t('workbench.status.metadataProgress', { processed: Math.min(start + batch.length, appsNeedingMetadata.length), total: appsNeedingMetadata.length }));
      }
      setStatus(failed ? t('workbench.status.metadataFailed', { failed }) : '');
    } finally { setMetadataLoading(false); }
  };

  const chooseInstallFiles = async () => {
    try {
      const selected = await open({
        title: t('apps.action.install'),
        multiple: true,
        directory: false,
        filters: [{ name: 'Paquetes Android', extensions: ['apk', 'apks', 'apkm', 'xapk', 'zip', 'aab'] }],
      });
      const selectedFiles = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (selectedFiles.length) {
        setInstallFiles((current: string[]) => [...new Set([...current, ...selectedFiles])]);
        setInstallResult('');
      }
    } catch (error) { setInstallResult(String(error)); }
  };

  const installSelectedApps = async () => {
    if (!serial || !installFiles.length || installingApps) return;
    setInstallingApps(true);
    setInstallResult(t('workbench.status.installing'));
    try {
      const result = await invoke<string>('install_application_packages', {
        serial,
        files: installFiles,
        options: {
          replace_existing: installReplace,
          grant_runtime_permissions: installGrant,
          allow_test_packages: installTest,
          bypass_low_target_sdk_block: installBypass,
        },
      });
      setInstallResult(result);
      await refreshApps();
    } catch (error) {
      setInstallResult(String(error));
    } finally {
      setInstallingApps(false);
    }
  };

  const toggleAppEnabled = async () => {
    if (!appDetails) return;
    const willDisable = !appDetails.disabled;
    const command = willDisable
      ? ['shell', 'pm', 'disable-user', '--user', '0', selectedPackage]
      : ['shell', 'pm', 'enable', '--user', '0', selectedPackage];
    const result = await run(command, willDisable ? t('workbench.status.appDisabled') : t('workbench.status.appEnabled'));
    if (result === undefined) return;
    setAppDetails((current: AppDetailsInfo | null) => current ? { ...current, disabled: willDisable } : current);
    setApps((current: AppSummary[]) => current.map(app => app.package_name === selectedPackage ? { ...app, disabled: willDisable } : app));
  };

  const setBackgroundMode = async (mode: 'unrestricted' | 'optimized' | 'restricted') => {
    if (!selectedPackage) return;
    const values = mode === 'unrestricted' ? ['allow', 'allow'] : mode === 'restricted' ? ['ignore', 'ignore'] : ['default', 'default'];
    await run(['shell', 'cmd', 'appops', 'set', selectedPackage, 'RUN_ANY_IN_BACKGROUND', values[0]]);
    await run(['shell', 'cmd', 'appops', 'set', selectedPackage, 'RUN_IN_BACKGROUND', values[1]]);
    await refreshAppDetails();
  };

  const togglePermission = async (permission: AppPermissionInfo) => {
    if (!selectedPackage) return;
    await run(['shell', 'pm', permission.granted ? 'revoke' : 'grant', selectedPackage, permission.name]);
    await refreshAppDetails();
  };

  const exportApk = async () => {
    if (!appDetails) return;
    try {
      const destination = await save({
        title: t('apps.action.saveApk'),
        defaultPath: `${appDetails.package_name}.apk`,
        filters: [{ name: 'Paquete Android', extensions: ['apk'] }],
      });
      if (destination) await run(['pull', appDetails.apk_path, destination], t('workbench.status.apkSaved', { path: destination }));
    } catch (error) { setStatus(String(error)); }
  };

  const clearApplicationCache = async () => {
    if (!selectedPackage) return;
    await run(['shell', 'run-as', selectedPackage, 'sh', '-c', 'rm -rf cache/* code_cache/* 2>/dev/null || true']); 
    await refreshAppDetails();
  };

  const performDestructiveAppAction = async () => {
    if (!destructiveAction || !selectedPackage) return;
    setDestructiveBusy(true);
    try {
      if (destructiveAction === 'uninstall') {
        await run(['uninstall', selectedPackage], t('workbench.status.appUninstalled'));
        setSelectedPackage('');
        setAppDetails(null);
        await refreshApps();
      } else {
        await run(['shell', 'pm', 'clear', selectedPackage], t('workbench.status.appDataCleared'));
        await refreshAppDetails();
      }
      setDestructiveAction(null);
    } finally {
      setDestructiveBusy(false);
    }
  };

  const openAppInScrcpy = async (pkg: string) => {
    setStatus(t('workbench.status.launchingApp', { pkg }));
    try {
      await invoke<string>('run_device_action', { serial, args: ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'] });
      if (scrcpy) await scrcpy([]);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const filters: Array<['user' | 'all' | 'system' | 'disabled', string, string]> = [
    ['user', t('apps.filter.user'), 'person'], ['all', t('apps.filter.all'), 'apps'], ['system', t('apps.filter.system'), 'settings'], ['disabled', t('apps.filter.disabled'), 'block'],
  ];
  const pending = filteredApps.filter(app => !app.icon_data_url || app.display_name === app.package_name).length;
  const count = (value: string) => apps.filter(app => value === 'all' ? true : value === 'disabled' ? app.disabled : value === 'system' ? app.system_app && !app.disabled : !app.system_app && !app.disabled).length;
  
  return (
    <div className="apps-material-host">
      <div className={`apps-material-page ${selectedPackage ? 'detail-open' : ''}`}>
        <section className="apps-material-catalog">
          <header className="apps-material-toolbar">
            <md-outlined-text-field className="apps-material-search" label={t('apps.search.placeholder')} value={appFilter} onInput={(event: Event) => setAppFilter((event.target as HTMLInputElement).value)}>
              <MaterialIcon slot="leading-icon" name="search" />
              {appFilter && (
                <md-icon-button slot="trailing-icon" onClick={() => setAppFilter('')}>
                  <MaterialIcon name="close" />
                </md-icon-button>
              )}
            </md-outlined-text-field>
            {(appSettings?.cache_enabled && pending > 0) && (
              <md-filled-tonal-button disabled={metadataLoading || undefined} onClick={loadVisibleMetadata}>
                <MaterialIcon slot="icon" name="image_search" />
                {metadataLoading ? t('common.loading') : t('apps.action.loadMetadata', { pending })}
              </md-filled-tonal-button>
            )}
            <md-icon-button aria-label={t('apps.action.refresh')} title={t('apps.action.refresh')} disabled={false || undefined} onClick={refreshApps}><MaterialIcon name="refresh" className={false ? 'apps-material-spin' : ''} /></md-icon-button>
            <md-filled-icon-button aria-label={t('apps.action.install')} title={t('apps.action.install')} onClick={() => setInstallOpen(true)}><MaterialIcon name="add" /></md-filled-icon-button>
          </header>
          <nav className="apps-material-filters">
            {filters.map(([value, label, icon]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}><MaterialIcon name={icon} filled={filter === value} /><span>{label}</span><strong>{count(value)}</strong><md-ripple /></button>)}
          </nav>
          <div className="apps-material-grid">
            {filteredApps.map(app => <button className={`apps-material-tile ${selectedPackage === app.package_name ? 'selected' : ''}`} key={app.package_name} onClick={() => selectApplication(app)} onDoubleClick={() => openAppInScrcpy(app.package_name)}>
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
          {!appDetails ? <div className="apps-material-empty detail"><MaterialIcon name="touch_app" /><strong>{t('apps.detail.empty.title')}</strong><span>{t('apps.detail.empty.subtitle')}</span></div> : <>
            <md-text-button className="apps-material-back" onClick={() => { setSelectedPackage(''); setAppDetails(null); }}><MaterialIcon slot="icon" name="arrow_back" />{t('nav.apps')}</md-text-button>
            <header className="apps-material-detail__hero" style={{ position: 'relative' }}>
              <span className="app-icon-frame">{appDetails.icon_data_url ? <img src={appDetails.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(appDetails.package_name)}`}>{appDetails.display_name.slice(0, 2).toUpperCase()}</span>}</span>
              <div style={{ flex: 1, minWidth: 0, paddingRight: '130px' }}>
                <h2>{appDetails.display_name}</h2>
                <p>{appDetails.package_name}</p>
                <div className={`apps-material-status-icon ${appDetails.disabled ? 'disabled' : ''}`} title={appDetails.disabled ? t('apps.status.disabled') : appDetails.system_app ? t('apps.detail.type.system') : t('apps.detail.type.user')}>
                  <MaterialIcon name={appDetails.disabled ? 'block' : appDetails.system_app ? 'settings' : 'person'} />
                </div>
              </div>
              <md-text-button onClick={() => openAppInScrcpy(appDetails.package_name)} style={{ position: 'absolute', top: 0, right: 0 }}>
                <MaterialIcon slot="icon" name="desktop_windows" />
                {t('apps.action.openScrcpy')}
              </md-text-button>
            </header>
            
            <section className="apps-material-section">
              <header><span className="apps-material-section__title"><MaterialIcon name="bolt" /><h3>{t('apps.detail.actions')}</h3></span></header>
              <div className="apps-material-actions">
                <md-filled-button onClick={() => run(['shell', 'monkey', '-p', selectedPackage, '1'])}><MaterialIcon slot="icon" name="open_in_new" />{t('apps.action.open')}</md-filled-button>
                <md-filled-tonal-button onClick={() => run(['shell', 'am', 'force-stop', selectedPackage])}><MaterialIcon slot="icon" name="stop_circle" />{t('apps.action.stop')}</md-filled-tonal-button>
                <md-filled-tonal-button onClick={toggleAppEnabled}><MaterialIcon slot="icon" name={appDetails.disabled ? 'check_circle' : 'block'} />{appDetails.disabled ? t('apps.action.enable') : t('apps.action.disable')}</md-filled-tonal-button>
                <md-filled-tonal-button onClick={clearApplicationCache}><MaterialIcon slot="icon" name="cleaning_services" />{t('common.clearCache')}</md-filled-tonal-button>
                <md-outlined-button onClick={() => setDestructiveAction('clear-data')}><MaterialIcon slot="icon" name="delete_sweep" />{t('common.clearData')}</md-outlined-button>
                <md-outlined-button className="apps-material-danger" onClick={() => setDestructiveAction('uninstall')}><MaterialIcon slot="icon" name="delete_forever" />{t('apps.action.uninstall')}</md-outlined-button>
                <md-filled-tonal-button onClick={exportApk}><MaterialIcon slot="icon" name="download" />{t('apps.action.saveApk')}</md-filled-tonal-button>
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
                  <div className="apps-material-energy">{([['unrestricted',t('apps.energy.unrestricted'),'speed'],['optimized',t('apps.energy.optimized'),'eco'],['restricted',t('apps.energy.restricted'),'battery_saver']] as const).map(([value,label,icon])=><button key={value} className={appDetails.background_mode===value?'active':''} onClick={()=>setBackgroundMode(value)}><MaterialIcon name={icon}/><span><strong>{label}</strong><small>{value==='unrestricted'?t('apps.energy.unrestricted.desc'):value==='optimized'?t('apps.energy.optimized.desc'):t('apps.energy.restricted.desc')}</small></span><md-ripple/></button>)}</div>
                </section>

                <section className="apps-material-section">
                  <header><span className="apps-material-section__title"><MaterialIcon name="info" /><h3>{t('apps.detail.info')}</h3></span></header>
                  <dl className="apps-material-info">
                    <div><dt>{t('apps.info.version')}</dt><dd>{appDetails.version_name} ({appDetails.version_code})</dd></div><div><dt>{t('apps.info.installDate')}</dt><dd>{appDetails.install_date}</dd></div><div><dt>{t('apps.info.updateDate')}</dt><dd>{appDetails.update_date}</dd></div><div><dt>{t('apps.info.targetSdk')}</dt><dd>{appDetails.target_sdk}</dd></div><div><dt>{t('apps.info.minSdk')}</dt><dd>{appDetails.min_sdk}</dd></div><div><dt>{t('apps.info.installer')}</dt><dd>{appDetails.installer}</dd></div><div><dt>{t('apps.info.apkSize')}</dt><dd>{formatBytes(appDetails.code_size_bytes)}</dd></div><div><dt>{t('apps.info.dataSize')}</dt><dd>{formatBytes(appDetails.data_size_bytes)}</dd></div><div><dt>{t('apps.info.cacheSize')}</dt><dd>{formatBytes(appDetails.cache_size_bytes)}</dd></div><div className="wide"><dt>{t('apps.info.apkPath')}</dt><dd>{appDetails.apk_path}</dd></div>
                  </dl>
                </section>

                <section className="apps-material-section">
                  <header>
                    <span className="apps-material-section__title"><MaterialIcon name="shield" /><h3>{t('apps.detail.permissions')}</h3></span>
                    <span className="apps-material-section__meta"><span>{t('apps.permissions.count', { granted: appDetails.permissions.filter((permission: AppPermissionInfo)=>permission.granted).length, total: appDetails.permissions.length })}</span></span>
                  </header>
                  <div className="apps-material-permissions">
                    {appDetails.permissions.map((permission: AppPermissionInfo)=><div key={permission.name}><span><strong>{permission.name.split('.').pop()}</strong><small>{permission.name}</small></span><md-switch selected={permission.granted||undefined} disabled={!permission.runtime||undefined} onClick={()=>togglePermission(permission)}/></div>)}{!appDetails.permissions.length&&<p>{t('apps.permissions.empty')}</p>}
                  </div>
                </section>
              </>
            )}
          </>}
        </aside>
      </div>
      <DestructiveActionDialog action={destructiveAction} appName={appDetails?.display_name || selectedPackage} packageName={selectedPackage} iconDataUrl={appDetails?.icon_data_url || ''} busy={destructiveBusy} onClose={() => setDestructiveAction(null)} onConfirm={performDestructiveAppAction} />
      <InstallationDialog open={installOpen} files={installFiles} installing={installingApps} result={installResult} options={{ replace: installReplace, grant: installGrant, test: installTest, bypass: installBypass }} canInstall={Boolean(serial && installFiles.length)} onClose={() => setInstallOpen(false)} onChooseFiles={chooseInstallFiles} onRemoveFile={file => setInstallFiles(current => current.filter(value => value !== file))} onOptionChange={(option, value) => ({ replace: setInstallReplace, grant: setInstallGrant, test: setInstallTest, bypass: setInstallBypass })[option](value)} onInstall={installSelectedApps} />
    </div>
  );
}
