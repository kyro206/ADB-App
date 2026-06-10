import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDevices } from '../context/DeviceContext';
import { useI18n } from '../locales';
import { useTheme } from '../context/ThemeContext';

import { DisplayPage } from './DisplayPage';
import { MirroringPage } from './MirroringPage';
import { ControlPage } from './ControlPage';
import { AppsPage } from './AppsPage';
import { FilesPage } from './FilesPage';
import { SystemPage } from './SystemPage';
import { SettingsPage } from './SettingsPage';
import { WorkbenchShell } from './workbench/WorkbenchShell';
import { DeviceStateScreen } from '../components/layout/DeviceStateScreen';
import { words } from './workbench/utils';
import type { AppSummary, MirrorMode, ToolsStatus, WorkTab } from './workbench/types';
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
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [mountedTabs, setMountedTabs] = useState<Set<WorkTab>>(new Set([tab]));

  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [appSettings, setAppSettings] = useState<{ cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean } | null>(null);
  const [defaultCacheDir, setDefaultCacheDir] = useState('');
  const [toolUpdatesChecking, setToolUpdatesChecking] = useState(false);
  const [adbPath, setAdbPath] = useState('');
  const [scrcpyPath, setScrcpyPath] = useState('');
  const [javaPath, setJavaPath] = useState('');
  const [displayWidth, setDisplayWidth] = useState(0);
  const [displayHeight, setDisplayHeight] = useState(0);
  const [displayDensity, setDisplayDensity] = useState(0);
  const [displayRefreshRate, setDisplayRefreshRateState] = useState(0);
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

  const run = async (args: string[], success = '') => {
    if (!serial) { setStatus(t('workbench.status.selectDevice')); return; }
    setBusy(true);
    try {
      const output = await invoke<string>('run_device_action', { serial, args });
      setStatus(output || success);
      return output;
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
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
      const value = await invoke<{ cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean }>('get_app_settings');
      const defaultDir = await invoke<string>('get_default_cache_dir');
      setAppSettings(value);
      setDefaultCacheDir(defaultDir);
    } catch (error) { setStatus(String(error)); }
  };

  const saveAppSettings = async (settings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean }) => {
    setBusy(true);
    try {
      await invoke('save_app_settings', { settings });
      setAppSettings(settings);
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const clearApplicationCache = async () => {
    setBusy(true);
    try {
      await invoke('clear_cache');
      setStatus(t('workbench.status.cacheCleared'));
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
    setDisplayRefreshRateState(deviceDetails.refresh_rate_hz);
    setDisplayTimeout(Math.max(1, Math.round(deviceDetails.screen_off_timeout_ms / 1000)));
    setDisplayDarkMode(deviceDetails.dark_mode_enabled);
  }, [deviceDetails]);



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
    setDisplayRefreshRateState(rate);
    await run(['shell', 'settings', 'put', 'system', 'peak_refresh_rate', String(rate)]);
    await run(['shell', 'settings', 'put', 'system', 'min_refresh_rate', String(rate)]);
    await refreshDevices();
  };

  const display = <DisplayPage
    details={deviceDetails} deviceType={deviceDetails ? t(`device.type.${deviceDetails.device_type}`) : '-'}
    width={displayWidth} setWidth={setDisplayWidth} height={displayHeight} setHeight={setDisplayHeight}
    density={displayDensity} setDensity={setDisplayDensity} timeout={displayTimeout} setTimeout={setDisplayTimeout}
    refreshRate={displayRefreshRate}
    darkMode={displayDarkMode} darkModeLoading={darkModeLoading} suggestions={displaySuggestions}
    onToggleDarkMode={toggleDeviceDarkMode} onSetRefreshRate={setDisplayRefreshRate} onReset={resetDisplay} onApply={applyDisplay}
  />;



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

  const wrap = (content: ReactNode, loading?: boolean) => <DeviceStateScreen serial={serial} loading={loading}>{serial ? content : null}</DeviceStateScreen>;

  const pages: Record<WorkTab, ReactNode> = {
    display: wrap(display),
    mirroring: wrap(mirroring),
    control: wrap(<ControlPage serial={serial!} run={run} setStatus={setStatus} setBusy={setBusy} />),
    apps: wrap(<AppsPage serial={serial!} setStatus={setStatus} setBusy={setBusy} run={run} scrcpy={scrcpy} tab={tab} appSettings={appSettings} />, tab === 'apps' && busy),
    files: wrap(<FilesPage serial={serial!} setStatus={setStatus} setBusy={setBusy} run={run} tab={tab} />),
    system: wrap(<SystemPage serial={serial!} setStatus={setStatus} />),
    settings,
  };
  return (
    <WorkbenchShell title={t(`nav.${tab}`)} busy={busy} status={status}>
      {Object.entries(pages).map(([key, node]) => {
        if (!mountedTabs.has(key as WorkTab)) return null;
        return (
          <div key={key} style={{ display: tab === key ? 'contents' : 'none' }}>
            {node}
          </div>
        );
      })}
    </WorkbenchShell>
  );
}
