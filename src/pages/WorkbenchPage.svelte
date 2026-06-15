<script lang="ts">
import * as m from '../paraglide/messages';

  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { devicesState } from '../context/devices.svelte';
  import { i18n, type Language } from '../context/i18n.svelte';
  import { themeState } from '../context/theme.svelte';
  
  import DisplayPage from './DisplayPage.svelte';
  import MirroringPage from './MirroringPage.svelte';
  import ControlPage from './ControlPage.svelte';
  import AppsPage from './AppsPage.svelte';
  import FilesPage from './FilesPage.svelte';
  import SystemPage from './SystemPage.svelte';
  import SettingsPage from './SettingsPage.svelte';
  import WorkbenchShell from './workbench/WorkbenchShell.svelte';
  import DeviceStateScreen from '../components/layout/DeviceStateScreen.svelte';
  import { words } from './workbench/utils';
  import type { AppSummary, MirrorMode, ToolsStatus, WorkTab } from './workbench/types';
  import './WorkbenchPage.css';

  let { tab } = $props<{ tab: WorkTab }>();



  let selectedDevice = $derived(devicesState.selectedDevice);
  let deviceDetails = $derived(devicesState.deviceDetails);
  let loading = $derived(devicesState.loading);
  
  let language = $derived(i18n.language);
  let theme = $derived(themeState.theme);
  
  let serial = $derived(selectedDevice?.serial ?? '');
  let status = $state('');
  let busy = $state(false);
  let mountedTabs = $state<Set<WorkTab>>(new Set([tab]));

  $effect(() => {
    if (!mountedTabs.has(tab)) {
      mountedTabs = new Set(mountedTabs).add(tab);
    }
  });

  let tools = $state<ToolsStatus | null>(null);
  let appSettings = $state<{ cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; theme: string; language: string } | null>(null);
  let defaultCacheDir = $state('');
  let toolUpdatesChecking = $state(false);
  
  let adbPath = $state('');
  let scrcpyPath = $state('');
  let javaPath = $state('');
  
  let displayWidth = $state(0);
  let displayHeight = $state(0);
  let displayDensity = $state(0);
  let displayRefreshRate = $state(0);
  let displayTimeout = $state(60);
  let displayDarkMode = $state(false);
  let darkModeLoading = $state(false);
  
  let mirrorMode = $state<MirrorMode>('display');
  let mirrorFullscreen = $state(false);
  let mirrorTurnScreenOff = $state(false);
  let mirrorReadOnly = $state(false);
  let mirrorMaxSize = $state('');
  let mirrorMaxFps = $state('');
  let mirrorAudio = $state('default');
  let mirrorKeyboard = $state('default');
  let mirrorMouse = $state('default');
  let mirrorRecord = $state(false);
  let mirrorRecordPath = $state('');
  let mirrorApp = $state('');
  let mirrorApps = $state<AppSummary[]>([]);
  
  let virtualWidth = $state('');
  let virtualHeight = $state('');
  let virtualDpi = $state('');
  let virtualResizable = $state(true);
  
  let cameraId = $state('');
  let cameraWidth = $state('');
  let cameraHeight = $state('');
  let cameras = $state<string[]>([]);

  async function run(args: string[], success = '') {
    if (!serial) { status = m.workbench_status_selectDevice(); return; }
    busy = true;
    try {
      const output = await invoke<string>('run_device_action', { serial, args });
      status = output || success;
      return output;
    } catch (error) { 
      status = String(error); 
    } finally { 
      busy = false; 
    }
  }

  async function scrcpy(extraArgs: string[]) {
    if (!serial) {
      status = m.workbench_status_selectDevice();
      return;
    }
    try { 
      status = await invoke<string>('launch_scrcpy', { serial, extraArgs });
    } catch (error) { 
      status = String(error); 
    }
  }

  async function refreshMirrorData() {
    if (!serial) return;
    if (mirrorApps.length === 0) {
      try {
        const value = await invoke<AppSummary[]>('list_apps', { serial });
        mirrorApps = value.filter(app => !app.system_app);
      } catch { mirrorApps = []; }
    }
    if (cameras.length === 0) {
      invoke<string[]>('list_scrcpy_cameras', { serial })
        .then(res => cameras = res)
        .catch(() => cameras = []);
    }
  }

  function launchMirror() {
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
    if (mirrorApp && mirrorMode !== 'camera') args.push(`--start-app=${mirrorApp}`);
    if (mirrorRecord && mirrorRecordPath) args.push(`--record=${mirrorRecordPath}`);
    scrcpy(args);
  }

  async function refreshTools() {
    try {
      const value = await invoke<ToolsStatus>('get_tools_status');
      tools = value;
      adbPath = value.adb.path;
      scrcpyPath = value.scrcpy.path;
      javaPath = value.java.path;
      
      toolUpdatesChecking = true;
      const updated = await invoke<ToolsStatus>('check_tool_updates');
      tools = updated;
    } catch (error) { 
      status = String(error); 
    } finally { 
      toolUpdatesChecking = false; 
    }
  }

  async function refreshSettings() {
    try {
      const value = await invoke<{ cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; theme: string; language: string }>('get_app_settings');
      const defaultDir = await invoke<string>('get_default_cache_dir');
      appSettings = value;
      defaultCacheDir = defaultDir;
    } catch (error) { status = String(error); }
  }

  async function saveAppSettings(settings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; theme: string; language: string }) {
    busy = true;
    try {
      const oldPath = await invoke<string | null>('save_app_settings', { settings });
      appSettings = settings;
      
      if (oldPath) {
        await refreshTools();
        await invoke('close_app', { oldDataDir: oldPath });
      }
    } catch (error) { 
      status = String(error); 
    } finally { 
      busy = false; 
    }
  }

  async function clearApplicationCache() {
    busy = true;
    try {
      await invoke('clear_cache');
      status = m.workbench_status_cacheCleared();
    } catch (error) { 
      status = String(error); 
    } finally { 
      busy = false; 
    }
  }

  async function saveToolPath(tool: 'adb' | 'scrcpy' | 'java', pathValue: string) {
    busy = true;
    try {
      const value = await invoke<ToolsStatus>('set_tool_path', { tool, path: pathValue });
      tools = value;
      adbPath = value.adb.path;
      scrcpyPath = value.scrcpy.path;
      javaPath = value.java.path;
      status = m.workbench_status_toolPathSaved({ tool });
      if (tool === 'adb') await devicesState.refreshDevices();
      await refreshTools();
    } catch (error) { 
      status = String(error); 
    } finally { 
      busy = false; 
    }
  }

  async function installTool(tool: 'adb' | 'scrcpy') {
    busy = true;
    status = m.workbench_status_toolDownloading({ tool });
    try {
      const value = await invoke<ToolsStatus>('install_or_update_tool', { tool });
      tools = value;
      adbPath = value.adb.path;
      scrcpyPath = value.scrcpy.path;
      javaPath = value.java.path;
      status = m.workbench_status_toolInstalled({ tool });
      if (tool === 'adb') await devicesState.refreshDevices();
      await refreshTools();
    } catch (error) { 
      status = String(error); 
    } finally { 
      busy = false; 
    }
  }

  $effect(() => {
    if (tab === 'settings') {
      refreshTools();
    }
    if (tab === 'mirroring') {
      refreshTools();
      refreshMirrorData();
    }
    serial; // Re-run when serial changes
  });

  onMount(() => {
    refreshSettings();
  });

  $effect(() => {
    if (!deviceDetails) return;
    displayWidth = deviceDetails.current_width;
    displayHeight = deviceDetails.current_height;
    displayDensity = deviceDetails.current_density;
    displayRefreshRate = deviceDetails.refresh_rate_hz;
    displayTimeout = Math.max(1, Math.round(deviceDetails.screen_off_timeout_ms / 1000));
    displayDarkMode = deviceDetails.dark_mode_enabled;
  });

  let displaySuggestions = $derived.by(() => {
    if (!deviceDetails?.physical_width || !deviceDetails?.physical_height || !deviceDetails?.physical_density) return [];
    return [0.9, 0.8, 0.7, 0.6].map(scale => ({
      width: Math.round(deviceDetails!.physical_width * scale / 8) * 8,
      height: Math.round(deviceDetails!.physical_height * scale / 8) * 8,
      density: Math.max(120, Math.round(deviceDetails!.physical_density * scale / 8) * 8),
    }));
  });

  async function applyDisplay() {
    await run(['shell', 'wm', 'size', `${displayWidth}x${displayHeight}`]);
    await run(['shell', 'wm', 'density', String(displayDensity)]);
    await run(['shell', 'settings', 'put', 'system', 'screen_off_timeout', String(displayTimeout * 1000)]);
    await devicesState.refreshDevices();
  }

  async function resetDisplay() {
    await run(['shell', 'wm', 'size', 'reset']);
    await run(['shell', 'wm', 'density', 'reset']);
    await devicesState.refreshDevices();
  }

  async function toggleDeviceDarkMode() {
    if (!serial || darkModeLoading) return;
    const nextValue = !displayDarkMode;
    displayDarkMode = nextValue;
    darkModeLoading = true;
    try {
      status = await invoke<string>('set_device_dark_mode', { serial, enabled: nextValue });
      await devicesState.refreshDevices();
    } catch (error) {
      displayDarkMode = !nextValue;
      status = String(error);
    } finally {
      darkModeLoading = false;
    }
  }

  async function setDisplayRefreshRate(rate: number) {
    displayRefreshRate = rate;
    await run(['shell', 'settings', 'put', 'system', 'peak_refresh_rate', String(rate)]);
    await run(['shell', 'settings', 'put', 'system', 'min_refresh_rate', String(rate)]);
    await devicesState.refreshDevices();
  }

  async function handleThemeChange(newTheme: 'light' | 'dark' | 'auto') {
    themeState.setTheme(newTheme);
    if (appSettings) {
      let val = '';
      if (newTheme === 'dark') val = '1';
      else if (newTheme === 'light') val = '0';
      const updated = { ...appSettings, theme: val };
      await saveAppSettings(updated);
    }
  }

  async function handleLanguageChange(newLang: string) {
    i18n.setLanguage(newLang as Language);
    if (appSettings) {
      const updated = { ...appSettings, language: newLang };
      await saveAppSettings(updated);
    }
  }
</script>

<WorkbenchShell title={(m as any)[`nav_${tab}`]?.() ?? tab} {busy} {status}>
  {#if mountedTabs.has('display')}
    <div style="display: {tab === 'display' ? 'contents' : 'none'}">
      <DeviceStateScreen {serial} loading={loading}>
        {#if serial}
          <DisplayPage
            details={deviceDetails}
            width={displayWidth} setWidth={w => displayWidth = w} height={displayHeight} setHeight={h => displayHeight = h}
            density={displayDensity} setDensity={d => displayDensity = d} timeout={displayTimeout} setTimeout={t => displayTimeout = t}
            refreshRate={displayRefreshRate}
            darkMode={displayDarkMode} {darkModeLoading} suggestions={displaySuggestions}
            onToggleDarkMode={toggleDeviceDarkMode} onSetRefreshRate={setDisplayRefreshRate} onReset={resetDisplay} onApply={applyDisplay}
          />
        {/if}
      </DeviceStateScreen>
    </div>
  {/if}

  {#if mountedTabs.has('mirroring')}
    <div style="display: {tab === 'mirroring' ? 'contents' : 'none'}">
      <DeviceStateScreen {serial} loading={loading}>
        {#if serial}
          <MirroringPage
            {serial} {tools} mode={mirrorMode} setMode={m => mirrorMode = m}
            fullscreen={mirrorFullscreen} setFullscreen={f => mirrorFullscreen = f}
            turnScreenOff={mirrorTurnScreenOff} setTurnScreenOff={t => mirrorTurnScreenOff = t}
            readOnly={mirrorReadOnly} setReadOnly={r => mirrorReadOnly = r}
            maxSize={mirrorMaxSize} setMaxSize={s => mirrorMaxSize = s} maxFps={mirrorMaxFps} setMaxFps={f => mirrorMaxFps = f}
            audio={mirrorAudio} setAudio={a => mirrorAudio = a} keyboard={mirrorKeyboard} setKeyboard={k => mirrorKeyboard = k} mouse={mirrorMouse} setMouse={m => mirrorMouse = m}
            record={mirrorRecord} setRecord={r => mirrorRecord = r} recordPath={mirrorRecordPath} setRecordPath={p => mirrorRecordPath = p}
            app={mirrorApp} setApp={a => mirrorApp = a} apps={mirrorApps}
            {virtualWidth} setVirtualWidth={w => virtualWidth = w} {virtualHeight} setVirtualHeight={h => virtualHeight = h}
            {virtualDpi} setVirtualDpi={d => virtualDpi = d} {virtualResizable} setVirtualResizable={r => virtualResizable = r}
            {cameraId} setCameraId={c => cameraId = c} {cameraWidth} setCameraWidth={w => cameraWidth = w}
            {cameraHeight} setCameraHeight={h => cameraHeight = h} {cameras}
            onRefreshData={refreshMirrorData} onLaunch={launchMirror} onDirectLaunch={args => scrcpy(words(args))}
          />
        {/if}
      </DeviceStateScreen>
    </div>
  {/if}

  {#if mountedTabs.has('control')}
    <div style="display: {tab === 'control' ? 'contents' : 'none'}">
      <DeviceStateScreen {serial} loading={loading}>
        {#if serial}
          <ControlPage {serial} {run} setStatus={s => status = s} setBusy={b => busy = b} />
        {/if}
      </DeviceStateScreen>
    </div>
  {/if}

  {#if mountedTabs.has('apps')}
    <div style="display: {tab === 'apps' ? 'contents' : 'none'}">
      <DeviceStateScreen {serial} loading={tab === 'apps' && busy}>
        {#if serial}
          <AppsPage {serial} setStatus={s => status = s} setBusy={b => busy = b} {run} {scrcpy} {tab} {appSettings} javaAvailable={tools?.java.available ?? false} />
        {/if}
      </DeviceStateScreen>
    </div>
  {/if}

  {#if mountedTabs.has('files')}
    <div style="display: {tab === 'files' ? 'contents' : 'none'}">
      <DeviceStateScreen {serial} loading={loading}>
        {#if serial}
          <FilesPage {serial} setStatus={s => status = s} setBusy={b => busy = b} {run} {tab} />
        {/if}
      </DeviceStateScreen>
    </div>
  {/if}

  {#if mountedTabs.has('system')}
    <div style="display: {tab === 'system' ? 'contents' : 'none'}">
      <DeviceStateScreen {serial} loading={loading}>
        {#if serial}
          <SystemPage {serial} setStatus={s => status = s} />
        {/if}
      </DeviceStateScreen>
    </div>
  {/if}

  {#if mountedTabs.has('settings')}
    <div style="display: {tab === 'settings' ? 'contents' : 'none'}">
      <SettingsPage {theme} {language} {tools} checkingUpdates={toolUpdatesChecking} {adbPath} {scrcpyPath} {javaPath} onThemeChange={handleThemeChange} onLanguageChange={handleLanguageChange} onAdbPathChange={p => adbPath = p} onScrcpyPathChange={p => scrcpyPath = p} onJavaPathChange={p => javaPath = p} onSaveToolPath={saveToolPath} onInstallTool={installTool} onClearCache={clearApplicationCache} {appSettings} onSaveAppSettings={saveAppSettings} {defaultCacheDir} />
    </div>
  {/if}
</WorkbenchShell>
