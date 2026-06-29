<script lang="ts">
import * as m from '../paraglide/messages';

  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { devicesState } from '../context/devices.svelte';
  import { i18n, type Language } from '../context/i18n.svelte';
  import { themeState } from '../context/theme.svelte';
  import { toolsState } from '../context/tools.svelte';
  import { applyWindowEffectClass, type WindowEffectMode } from '../context/windowEffects';
  
  import DisplayPage from './DisplayPage.svelte';
  import MirroringPage from './MirroringPage.svelte';
  import ControlPage from './ControlPage.svelte';
  import AppsPage from './AppsPage.svelte';
  import FilesPage from './FilesPage.svelte';
  import SystemPage from './SystemPage.svelte';
  import SettingsPage from './SettingsPage.svelte';
  import WorkbenchShell from './workbench/WorkbenchShell.svelte';
  import DeviceStateScreen from '../components/layout/DeviceStateScreen.svelte';
  import { words, translateError } from './workbench/utils';
  import type { AppSummary, MirrorMode, ToolsStatus, WorkTab } from './workbench/types';
  let { tab } = $props<{ tab: WorkTab }>();



  let selectedDevice = $derived(devicesState.selectedDevice);
  let deviceDetails = $derived(devicesState.deviceDetails);
  let loading = $derived(devicesState.loading
    || devicesState.operationalLoading
    || (!!selectedDevice && selectedDevice.state !== 'device'));
  let connectionRevision = $derived(devicesState.connectionRevision);
  
  let language = $derived(i18n.language);
  let theme = $derived(themeState.theme);
  
  let serial = $derived(selectedDevice?.serial ?? '');
  let status = $state('');
  let busy = $state(false);
  let tools = $derived(toolsState.status);
  type AppSettings = { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; auto_save_screenshots: boolean; material_you_enabled: boolean; material_you_background_tint: boolean; window_effect: WindowEffectMode; theme: string; language: string; packaged?: boolean };
  let appSettings = $state<AppSettings | null>(null);
  let defaultCacheDir = $state('');
  let toolUpdatesChecking = $derived(toolsState.checkingUpdates);
  
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
    } catch (error: any) { 
      status = translateError(error); 
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
    } catch (error: any) { 
      status = translateError(error); 
    }
  }

  async function refreshMirrorData() {
    if (!serial) return;
    if (mirrorApps.length === 0) {
      try {
        const value = await invoke<AppSummary[]>('list_apps', { serial, forceRefresh: false });
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

  async function refreshSettings() {
    try {
      const value = await invoke<AppSettings>('get_app_settings');
      const defaultDir = await invoke<string>('get_default_cache_dir');
      appSettings = value;
      themeState.setMaterialYouEnabled(value.material_you_enabled ?? true);
      themeState.setMaterialYouBackgroundTint(value.material_you_background_tint ?? true);
      applyWindowEffectClass(value);
      defaultCacheDir = defaultDir;
    } catch (error: any) { status = translateError(error); }
  }

  async function saveAppSettings(settings: AppSettings) {
    busy = true;
    appSettings = settings;
    themeState.setMaterialYouEnabled(settings.material_you_enabled ?? true);
    themeState.setMaterialYouBackgroundTint(settings.material_you_background_tint ?? true);
    applyWindowEffectClass(settings);
    try {
      const oldPath = await invoke<string | null>('save_app_settings', { settings });
      
      if (oldPath) {
        await invoke('close_app', { oldDataDir: oldPath });
      }
      sessionStorage.setItem('cached_settings', JSON.stringify(settings));
      const w = window as any;
      if (w.__APP_SETTINGS__) {
        w.__APP_SETTINGS__ = settings;
      }
    } catch (error: any) { 
      status = translateError(error); 
    } finally { 
      busy = false; 
    }
  }

  async function clearApplicationCache() {
    busy = true;
    try {
      await invoke('clear_application_cache');
      status = m.workbench_status_cacheCleared();
    } catch (error: any) { 
      status = translateError(error); 
    } finally { 
      busy = false; 
    }
  }

  async function saveToolPath(tool: 'adb' | 'scrcpy' | 'java', pathValue: string) {
    busy = true;
    try {
      const value = await invoke<ToolsStatus>('set_tool_path', { tool, path: pathValue });
      toolsState.set(value);
      status = m.workbench_status_toolPathSaved({ tool });
      if (tool === 'adb') await devicesState.refreshDevices();
    } catch (error: any) { 
      status = translateError(error); 
    } finally { 
      busy = false; 
    }
  }

  async function installTool(tool: 'adb' | 'scrcpy') {
    busy = true;
    status = m.workbench_status_toolDownloading({ tool });
    try {
      const value = await invoke<ToolsStatus>('install_or_update_tool', { tool });
      toolsState.set(value);
      status = m.workbench_status_toolInstalled({ tool });
      if (tool === 'adb') await devicesState.refreshDevices();
    } catch (error: any) { 
      status = translateError(error); 
    } finally { 
      busy = false; 
    }
  }

  async function forceCheckUpdates() {
    busy = true;
    try {
      const value = await invoke<ToolsSnapshot>('force_check_updates');
      toolsState.set(value.tools, value.checking_updates);
    } catch (error: any) { 
      status = translateError(error); 
    } finally { 
      busy = false; 
    }
  }

  $effect(() => {
    if (tab === 'mirroring') {
      refreshMirrorData();
    }
    serial; // Re-run when serial changes
  });

  onMount(() => {
    refreshSettings();
  });

  $effect(() => {
    if (!tools) return;
    adbPath = tools.adb.path;
    scrcpyPath = tools.scrcpy.path;
    javaPath = tools.java.path;
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
      await invoke('set_device_dark_mode', { serial, enabled: nextValue });
      await devicesState.refreshDevices();
    } catch (error: any) {
      displayDarkMode = !nextValue;
      status = translateError(error);
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
    if (appSettings) {
      const updated = { ...appSettings, language: newLang };
      await saveAppSettings(updated);
    }
    i18n.setLanguage(newLang as Language);
  }
</script>

<WorkbenchShell title={(m as any)[`nav_${tab}`]?.() ?? tab} {busy} {status}>
  {#if tab === 'settings'}
    <SettingsPage 
      {theme} 
      {language} 
      tools={tools} 
      checkingUpdates={toolUpdatesChecking} 
      bind:adbPath 
      bind:scrcpyPath 
      bind:javaPath 
      onThemeChange={handleThemeChange} 
      onLanguageChange={handleLanguageChange} 
      onSaveToolPath={saveToolPath} 
      onInstallTool={installTool} 
      onClearCache={clearApplicationCache} 
      appSettings={appSettings} 
      onSaveAppSettings={saveAppSettings} 
      {defaultCacheDir} 
      onForceCheckUpdates={forceCheckUpdates}
    />
  {:else}
    <DeviceStateScreen {serial} loading={loading || (tab !== 'files' && busy)}>
      {#if serial}
        {#key `${serial}:${connectionRevision}`}
          {#if tab === 'display'}
          <DisplayPage
            details={deviceDetails}
            {serial}
            bind:width={displayWidth} bind:height={displayHeight}
            bind:density={displayDensity} bind:timeout={displayTimeout}
            refreshRate={displayRefreshRate}
            darkMode={displayDarkMode} {darkModeLoading} suggestions={displaySuggestions}
            onToggleDarkMode={toggleDeviceDarkMode} onSetRefreshRate={setDisplayRefreshRate} onReset={resetDisplay} onApply={applyDisplay}
          />
          {:else if tab === 'mirroring'}
          <MirroringPage
            {serial} {tools} bind:mode={mirrorMode}
            bind:fullscreen={mirrorFullscreen}
            bind:turnScreenOff={mirrorTurnScreenOff}
            bind:readOnly={mirrorReadOnly}
            bind:maxSize={mirrorMaxSize} bind:maxFps={mirrorMaxFps}
            bind:audio={mirrorAudio} bind:keyboard={mirrorKeyboard} bind:mouse={mirrorMouse}
            bind:record={mirrorRecord} bind:recordPath={mirrorRecordPath}
            bind:app={mirrorApp} apps={mirrorApps}
            bind:virtualWidth bind:virtualHeight
            bind:virtualDpi bind:virtualResizable
            bind:cameraId bind:cameraWidth
            bind:cameraHeight {cameras}
            onRefreshData={refreshMirrorData} onLaunch={launchMirror} onDirectLaunch={args => scrcpy(words(args))}
          />
          {:else if tab === 'control'}
          <ControlPage {serial} {run} bind:status bind:busy />
          {:else if tab === 'apps'}
          <AppsPage {serial} bind:status bind:busy {scrcpy} {tab} {appSettings} javaAvailable={tools?.java.available ?? false} />
          {:else if tab === 'files'}
          <FilesPage {serial} bind:status bind:busy {tab} />
          {:else if tab === 'system'}
          <SystemPage {serial} bind:status />
          {/if}
        {/key}
      {/if}
    </DeviceStateScreen>
  {/if}
</WorkbenchShell>
