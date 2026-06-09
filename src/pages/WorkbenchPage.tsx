import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useDevices } from '../context/DeviceContext';
import { useI18n } from '../locales';
import { useTheme } from '../context/ThemeContext';
import { InstallationDialog } from '../components/dialogs/InstallationDialog';
import { DestructiveActionDialog, type DestructiveAppAction } from '../components/dialogs/DestructiveActionDialog';
import { DisplayPage } from './DisplayPage';
import { MirroringPage } from './MirroringPage';
import {ControlPage} from './ControlPage';
import { AppsView } from './workbench/AppsView';
import { FilesPage } from './FilesPage';
import { SystemPage } from './SystemPage';
import { SettingsPage } from './SettingsPage';
import { WorkbenchShell } from './workbench/WorkbenchShell';
import { words } from './workbench/utils';
import type { AppDetailsInfo, AppFilter, AppPermissionInfo, AppSummary, MirrorMode, ToolsStatus, WorkTab } from './workbench/types';
import './WorkbenchPage.css';

export function WorkbenchPage({ tab }: { tab: WorkTab }) {
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const { selectedDevice, deviceDetails, refreshDevices } = useDevices();
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const serial = selectedDevice?.serial ?? '';
  const [status, setStatus] = useState(t('workbench.status.ready'));
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [filter, setFilter] = useState('');
  const [appFilter, setAppFilter] = useState<AppFilter>('user');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [appDetails, setAppDetails] = useState<AppDetailsInfo | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAppAction | null>(null);
  const [destructiveBusy, setDestructiveBusy] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installFiles, setInstallFiles] = useState<string[]>([]);
  const [installingApps, setInstallingApps] = useState(false);
  const [installResult, setInstallResult] = useState('');
  const [installReplace, setInstallReplace] = useState(true);
  const [installGrant, setInstallGrant] = useState(false);
  const [installTest, setInstallTest] = useState(false);
  const [installBypass, setInstallBypass] = useState(false);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [appSettings, setAppSettings] = useState<{ cache_enabled: boolean; cache_path: string } | null>(null);
  const [defaultCacheDir, setDefaultCacheDir] = useState('');
  const [toolUpdatesChecking, setToolUpdatesChecking] = useState(false);
  const [adbPath, setAdbPath] = useState('');
  const [scrcpyPath, setScrcpyPath] = useState('');
  const [javaPath, setJavaPath] = useState('');
  const [displayWidth, setDisplayWidth] = useState(0);
  const [displayHeight, setDisplayHeight] = useState(0);
  const [displayDensity, setDisplayDensity] = useState(0);
  const [displayTimeout, setDisplayTimeout] = useState(60);
  const [displayDarkMode, setDisplayDarkMode] = useState(false);
  const [darkModeLoading, setDarkModeLoading] = useState(false);
  const [mirrorMode, setMirrorMode] = useState<MirrorMode>('display');
  const [mirrorFullscreen, setMirrorFullscreen] = useState(false);
  const [mirrorTurnScreenOff, setMirrorTurnScreenOff] = useState(false);
  const [mirrorReadOnly, setMirrorReadOnly] = useState(false);
  const [mirrorMaxSize, setMirrorMaxSize] = useState('');
  const [mirrorMaxFps, setMirrorMaxFps] = useState('');
  const [mirrorAudio, setMirrorAudio] = useState('default');
  const [mirrorKeyboard, setMirrorKeyboard] = useState('default');
  const [mirrorMouse, setMirrorMouse] = useState('default');
  const [mirrorRecord, setMirrorRecord] = useState(false);
  const [mirrorRecordPath, setMirrorRecordPath] = useState('');
  const [mirrorStartApp, setMirrorStartApp] = useState(false);
  const [mirrorApp, setMirrorApp] = useState('');
  const [mirrorApps, setMirrorApps] = useState<AppSummary[]>([]);
  const [virtualWidth, setVirtualWidth] = useState('');
  const [virtualHeight, setVirtualHeight] = useState('');
  const [virtualDpi, setVirtualDpi] = useState('');
  const [virtualResizable, setVirtualResizable] = useState(true);
  const [cameraId, setCameraId] = useState('');
  const [cameraWidth, setCameraWidth] = useState('');
  const [cameraHeight, setCameraHeight] = useState('');
  const [cameras, setCameras] = useState<string[]>([]);

  const run = async (args: string[], success = t('workbench.status.success')) => {
    if (!serial) { setStatus(t('workbench.status.selectDevice')); return; }
    setBusy(true);
    try {
      const output = await invoke<string>('run_device_action', { serial, args });
      setStatus(output || success);
      return output;
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const refreshApps = async () => {
    if (!serial) return;
    setBusy(true);
    try {
      const value = await invoke<AppSummary[]>('list_apps', { serial });
      setApps(value); setStatus(t('workbench.status.appsLoaded', { count: value.length }));
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const refreshAppDetails = async (packageName = selectedPackage) => {
    if (!serial || !packageName) return;
    setDetailsLoading(true);
    try {
      const value = await invoke<AppDetailsInfo>('get_app_details', { serial, packageName });
      const summary = apps.find(app => app.package_name === packageName);
      setAppDetails(current => current?.package_name === packageName
        ? { ...value, display_name: summary && summary.display_name !== summary.package_name ? summary.display_name : value.display_name, icon_data_url: summary?.icon_data_url || value.icon_data_url }
        : current);
      setApps(current => current.map(app => app.package_name === packageName ? {
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
    });
    void refreshAppDetails(app.package_name);
  };

  const loadVisibleMetadata = async () => {
    if (!serial || !appsNeedingMetadata.length || metadataLoading) return;
    setMetadataLoading(true);
    setStatus(t('workbench.status.metadataLoading', { count: appsNeedingMetadata.length }));
    let loaded = 0;
    let failed = 0;
    try {
      for (let start = 0; start < appsNeedingMetadata.length; start += 3) {
        if (appSettings && !appSettings.cache_enabled && tabRef.current !== 'apps') {
          break;
        }
        const batch = appsNeedingMetadata.slice(start, start + 3);
        const results = await Promise.allSettled(batch.map(app => invoke<AppSummary>('enrich_app_summary', {
          serial, packageName: app.package_name, apkPath: app.apk_path, systemApp: app.system_app, disabled: app.disabled,
        })));
        const summaries = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        loaded += summaries.length;
        failed += results.length - summaries.length;
        setApps(current => current.map(app => summaries.find(summary => summary.package_name === app.package_name) || app));
        setAppDetails(current => {
          if (!current) return current;
          const summary = summaries.find(item => item.package_name === current.package_name);
          return summary ? { ...current, display_name: summary.display_name, icon_data_url: summary.icon_data_url } : current;
        });
        setStatus(t('workbench.status.metadataProgress', { processed: Math.min(start + batch.length, appsNeedingMetadata.length), total: appsNeedingMetadata.length }));
      }
      setStatus(failed ? t('workbench.status.metadataFailed', { loaded, failed }) : t('workbench.status.metadataDone', { loaded }));
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
        setInstallFiles(current => [...new Set([...current, ...selectedFiles])]);
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

  const scrcpy = async (extraArgs: string[]) => {
    if (!serial) return setStatus(t('workbench.status.selectDevice'));
    try { setStatus(await invoke<string>('launch_scrcpy', { serial, extraArgs })); }
    catch (error) { setStatus(String(error)); }
  };

  const refreshMirrorData = async () => {
    if (!serial) return;
    try {
      const value = await invoke<AppSummary[]>('list_apps', { serial });
      setMirrorApps(value.filter(app => !app.system_app));
    } catch { setMirrorApps([]); }
    invoke<string[]>('list_scrcpy_cameras', { serial }).then(setCameras).catch(() => setCameras([]));
  };

  const launchMirror = () => {
    const args: string[] = [];
    if (mirrorMode === 'virtual') {
      const size = virtualWidth && virtualHeight ? `${virtualWidth}x${virtualHeight}` : '';
      const value = size ? `${size}${virtualDpi ? `/${virtualDpi}` : ''}` : '';
      args.push(value ? `--new-display=${value}` : '--new-display');
      if (virtualResizable) args.push('--flex-display');
    }
    if (mirrorMode === 'camera') {
      args.push('--video-source=camera');
      const id = cameraId.match(/--camera-id=([^\s]+)/)?.[1] || cameraId;
      if (id) args.push(`--camera-id=${id}`);
      if (cameraWidth && cameraHeight) args.push(`--camera-size=${cameraWidth}x${cameraHeight}`);
    }
    if (mirrorFullscreen) args.push('--fullscreen');
    if (mirrorTurnScreenOff && mirrorMode !== 'camera') args.push('--turn-screen-off');
    if (mirrorReadOnly || mirrorMode === 'camera') args.push('--no-control');
    if (mirrorMaxSize && mirrorMode !== 'camera') args.push(`--max-size=${mirrorMaxSize}`);
    if (mirrorMaxFps) args.push(`--max-fps=${mirrorMaxFps}`);
    if (mirrorAudio === 'none') args.push('--no-audio');
    if (mirrorAudio !== 'default' && mirrorAudio !== 'none') args.push(`--audio-source=${mirrorAudio}`);
    if (!mirrorReadOnly && mirrorMode !== 'camera') {
      if (mirrorKeyboard !== 'default') args.push(`--keyboard=${mirrorKeyboard}`);
      if (mirrorMouse !== 'default') args.push(`--mouse=${mirrorMouse}`);
    }
    if (mirrorStartApp && mirrorApp && mirrorMode !== 'camera') args.push(`--start-app=${mirrorApp}`);
    if (mirrorRecord && mirrorRecordPath) args.push(`--record=${mirrorRecordPath}`);
    scrcpy(args);
  };

  const refreshTools = async () => {
    try {
      const value = await invoke<ToolsStatus>('get_tools_status');
      setTools(value);
      setAdbPath(value.adb.path);
      setScrcpyPath(value.scrcpy.path);
      setJavaPath(value.java.path);
      setToolUpdatesChecking(true);
      const updated = await invoke<ToolsStatus>('check_tool_updates');
      setTools(updated);
    } catch (error) { setStatus(String(error)); }
    finally { setToolUpdatesChecking(false); }
  };

  const refreshSettings = async () => {
    try {
      const value = await invoke<{ cache_enabled: boolean; cache_path: string }>('get_app_settings');
      const defaultDir = await invoke<string>('get_default_cache_dir');
      setAppSettings(value);
      setDefaultCacheDir(defaultDir);
    } catch (error) { setStatus(String(error)); }
  };

  const saveAppSettings = async (settings: { cache_enabled: boolean; cache_path: string }) => {
    setBusy(true);
    try {
      await invoke('save_app_settings', { settings });
      setAppSettings(settings);
      setStatus(t('workbench.status.settingsSaved'));
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const saveToolPath = async (tool: 'adb' | 'scrcpy' | 'java', pathValue: string) => {
    setBusy(true);
    try {
      const value = await invoke<ToolsStatus>('set_tool_path', { tool, path: pathValue });
      setTools(value);
      setAdbPath(value.adb.path);
      setScrcpyPath(value.scrcpy.path);
      setJavaPath(value.java.path);
      setStatus(t('workbench.status.toolPathSaved', { tool }));
      if (tool === 'adb') await refreshDevices();
      await refreshTools();
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const installTool = async (tool: 'adb' | 'scrcpy') => {
    setBusy(true);
    setStatus(t('workbench.status.toolDownloading', { tool }));
    try {
      const value = await invoke<ToolsStatus>('install_or_update_tool', { tool });
      setTools(value);
      setAdbPath(value.adb.path);
      setScrcpyPath(value.scrcpy.path);
      setJavaPath(value.java.path);
      setStatus(t('workbench.status.toolInstalled', { tool }));
      if (tool === 'adb') await refreshDevices();
      await refreshTools();
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (tab === 'apps') refreshApps();
    if (tab === 'settings') {
      refreshTools();
      refreshSettings();
    }
    if (tab === 'mirroring') {
      refreshTools();
      refreshMirrorData();
    }
  }, [tab, serial]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!deviceDetails) return;
    setDisplayWidth(deviceDetails.current_width);
    setDisplayHeight(deviceDetails.current_height);
    setDisplayDensity(deviceDetails.current_density);
    setDisplayTimeout(Math.max(1, Math.round(deviceDetails.screen_off_timeout_ms / 1000)));
    setDisplayDarkMode(deviceDetails.dark_mode_enabled);
  }, [deviceDetails]);

  const filteredApps = useMemo(
    () => apps.filter(app => {
      const matchesType = appFilter === 'all' ? true : appFilter === 'disabled' ? app.disabled : appFilter === 'system' ? app.system_app && !app.disabled : !app.system_app && !app.disabled;
      const query = filter.trim().toLowerCase();
      return matchesType && (!query || app.package_name.toLowerCase().includes(query) || app.display_name.toLowerCase().includes(query));
    }),
    [apps, filter, appFilter],
  );
  const appsNeedingMetadata = useMemo(
    () => filteredApps.filter(app => !app.icon_data_url || app.display_name === app.package_name),
    [filteredApps],
  );

  useEffect(() => {
    if (tab === 'apps' && appSettings && !appSettings.cache_enabled && appsNeedingMetadata.length > 0 && !metadataLoading) {
      // Usamos setTimeout para no bloquear el renderizado actual
      setTimeout(() => loadVisibleMetadata(), 0);
    }
  }, [tab, appSettings, appsNeedingMetadata, metadataLoading]);

  const displaySuggestions = useMemo(() => {
    if (!deviceDetails?.physical_width || !deviceDetails?.physical_height || !deviceDetails?.physical_density) return [];
    return [0.9, 0.8, 0.7, 0.6].map(scale => ({
      width: Math.round(deviceDetails.physical_width * scale / 8) * 8,
      height: Math.round(deviceDetails.physical_height * scale / 8) * 8,
      density: Math.max(120, Math.round(deviceDetails.physical_density * scale / 8) * 8),
    }));
  }, [deviceDetails]);

  const applyDisplay = async () => {
    await run(['shell', 'wm', 'size', `${displayWidth}x${displayHeight}`]);
    await run(['shell', 'wm', 'density', String(displayDensity)]);
    await run(['shell', 'settings', 'put', 'system', 'screen_off_timeout', String(displayTimeout * 1000)]);
    await refreshDevices();
  };

  const resetDisplay = async () => {
    await run(['shell', 'wm', 'size', 'reset']);
    await run(['shell', 'wm', 'density', 'reset']);
    await refreshDevices();
  };

  const toggleDeviceDarkMode = async () => {
    if (!serial || darkModeLoading) return;
    const nextValue = !displayDarkMode;
    setDisplayDarkMode(nextValue);
    setDarkModeLoading(true);
    try {
      setStatus(await invoke<string>('set_device_dark_mode', { serial, enabled: nextValue }));
      await refreshDevices();
    } catch (error) {
      setDisplayDarkMode(!nextValue);
      setStatus(String(error));
    } finally {
      setDarkModeLoading(false);
    }
  };

  const setDisplayRefreshRate = async (rate: number) => {
    await run(['shell', 'settings', 'put', 'system', 'peak_refresh_rate', String(rate)]);
    await run(['shell', 'settings', 'put', 'system', 'min_refresh_rate', String(rate)]);
    await refreshDevices();
  };

  const display = <DisplayPage
    details={deviceDetails} deviceType={deviceDetails ? t(`device.type.${deviceDetails.device_type}`) : '-'}
    width={displayWidth} setWidth={setDisplayWidth} height={displayHeight} setHeight={setDisplayHeight}
    density={displayDensity} setDensity={setDisplayDensity} timeout={displayTimeout} setTimeout={setDisplayTimeout}
    darkMode={displayDarkMode} darkModeLoading={darkModeLoading} suggestions={displaySuggestions}
    onToggleDarkMode={toggleDeviceDarkMode} onSetRefreshRate={setDisplayRefreshRate} onReset={resetDisplay} onApply={applyDisplay}
  />;

  const toggleAppEnabled = async () => {
    if (!appDetails) return;
    const willDisable = !appDetails.disabled;
    const command = willDisable
      ? ['shell', 'pm', 'disable-user', '--user', '0', selectedPackage]
      : ['shell', 'pm', 'enable', '--user', '0', selectedPackage];
    const result = await run(command, willDisable ? t('workbench.status.appDisabled') : t('workbench.status.appEnabled'));
    if (result === undefined) return;
    setAppDetails(current => current ? { ...current, disabled: willDisable } : current);
    setApps(current => current.map(app => app.package_name === selectedPackage ? { ...app, disabled: willDisable } : app));
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
    try {
      setStatus(await invoke<string>('clear_application_cache'));
      setApps(current => current.map(app => ({ ...app, display_name: app.package_name, icon_data_url: '' })));
      setAppDetails(current => current ? { ...current, display_name: current.package_name, icon_data_url: '' } : current);
    } catch (error) { setStatus(String(error)); }
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

  const materialAppsPage = <div className="apps-material-host">
    <AppsView
      apps={apps}
      filteredApps={filteredApps}
      filter={filter}
      appFilter={appFilter}
      selectedPackage={selectedPackage}
      details={appDetails}
      metadataLoading={metadataLoading}
      detailsLoading={detailsLoading}
      busy={busy}
      onFilterChange={setFilter}
      onAppFilterChange={setAppFilter}
      onSelect={selectApplication}
      onCloseDetail={() => { setSelectedPackage(''); setAppDetails(null); }}
      onLoadMetadata={loadVisibleMetadata}
      onRefresh={refreshApps}
      onInstall={() => setInstallOpen(true)}
      onOpen={() => run(['shell', 'monkey', '-p', selectedPackage, '1'])}
      onStop={() => run(['shell', 'am', 'force-stop', selectedPackage])}
      onUninstall={() => setDestructiveAction('uninstall')}
      onToggleEnabled={toggleAppEnabled}
      onClearData={() => setDestructiveAction('clear-data')}
      onClearCache={async () => { await run(['shell', 'run-as', selectedPackage, 'sh', '-c', 'rm -rf cache/* code_cache/* 2>/dev/null || true']); await refreshAppDetails(); }}
      onExport={exportApk}
      onBackgroundMode={setBackgroundMode}
      onTogglePermission={togglePermission}
    />
    <DestructiveActionDialog action={destructiveAction} appName={appDetails?.display_name || selectedPackage} packageName={selectedPackage} iconDataUrl={appDetails?.icon_data_url || ''} busy={destructiveBusy} onClose={() => setDestructiveAction(null)} onConfirm={performDestructiveAppAction} />
    <InstallationDialog open={installOpen} files={installFiles} installing={installingApps} result={installResult} options={{ replace: installReplace, grant: installGrant, test: installTest, bypass: installBypass }} canInstall={Boolean(serial && installFiles.length)} onClose={() => setInstallOpen(false)} onChooseFiles={chooseInstallFiles} onRemoveFile={file => setInstallFiles(current => current.filter(value => value !== file))} onOptionChange={(option, value) => ({ replace: setInstallReplace, grant: setInstallGrant, test: setInstallTest, bypass: setInstallBypass })[option](value)} onInstall={installSelectedApps} />
  </div>;

  const mirroring = <MirroringPage
    serial={serial} tools={tools} mode={mirrorMode} setMode={setMirrorMode}
    fullscreen={mirrorFullscreen} setFullscreen={setMirrorFullscreen}
    turnScreenOff={mirrorTurnScreenOff} setTurnScreenOff={setMirrorTurnScreenOff}
    readOnly={mirrorReadOnly} setReadOnly={setMirrorReadOnly}
    maxSize={mirrorMaxSize} setMaxSize={setMirrorMaxSize} maxFps={mirrorMaxFps} setMaxFps={setMirrorMaxFps}
    audio={mirrorAudio} setAudio={setMirrorAudio} keyboard={mirrorKeyboard} setKeyboard={setMirrorKeyboard} mouse={mirrorMouse} setMouse={setMirrorMouse}
    record={mirrorRecord} setRecord={setMirrorRecord} recordPath={mirrorRecordPath} setRecordPath={setMirrorRecordPath}
    startApp={mirrorStartApp} setStartApp={setMirrorStartApp} app={mirrorApp} setApp={setMirrorApp} apps={mirrorApps}
    virtualWidth={virtualWidth} setVirtualWidth={setVirtualWidth} virtualHeight={virtualHeight} setVirtualHeight={setVirtualHeight}
    virtualDpi={virtualDpi} setVirtualDpi={setVirtualDpi} virtualResizable={virtualResizable} setVirtualResizable={setVirtualResizable}
    cameraId={cameraId} setCameraId={setCameraId} cameraWidth={cameraWidth} setCameraWidth={setCameraWidth}
    cameraHeight={cameraHeight} setCameraHeight={setCameraHeight} cameras={cameras}
    onRefreshData={refreshMirrorData} onLaunch={launchMirror} onDirectLaunch={args => scrcpy(words(args))}
  />;

const settings = <SettingsPage theme={theme} language={language} tools={tools} checkingUpdates={toolUpdatesChecking} adbPath={adbPath} scrcpyPath={scrcpyPath} javaPath={javaPath} onThemeChange={setTheme} onLanguageChange={setLanguage} onAdbPathChange={setAdbPath} onScrcpyPathChange={setScrcpyPath} onJavaPathChange={setJavaPath} onSaveToolPath={saveToolPath} onInstallTool={installTool} onClearCache={clearApplicationCache} appSettings={appSettings} onSaveAppSettings={saveAppSettings} defaultCacheDir={defaultCacheDir} />;

const pages: Record<WorkTab, ReactNode> = {
    display,
    mirroring,
    control: <ControlPage serial={serial} run={run} setStatus={setStatus} setBusy={setBusy} />,
    apps: materialAppsPage,
    files: <FilesPage serial={serial} setStatus={setStatus} setBusy={setBusy} run={run} />,
    system: <SystemPage serial={serial} setStatus={setStatus} />,
    settings,
  };
  return <WorkbenchShell title={t(`nav.${tab}`)} busy={busy} status={status}>{pages[tab]}</WorkbenchShell>;
}
