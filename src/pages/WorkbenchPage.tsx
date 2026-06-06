import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDevices } from '../context/DeviceContext';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { type TabId } from '../components/layout/Sidebar';
import './WorkbenchPage.css';

type WorkTab = Exclude<TabId, 'home'>;
type AppSummary = { package_name: string; display_name: string; apk_path: string; system_app: boolean; disabled: boolean; icon_data_url: string };
type AppPermissionInfo = { name: string; granted: boolean; runtime: boolean };
type AppDetailsInfo = AppSummary & { version_name: string; version_code: string; target_sdk: string; min_sdk: string; installer: string; data_dir: string; code_size_bytes: number; data_size_bytes: number; cache_size_bytes: number; background_mode: string; permissions: AppPermissionInfo[] };
type AppFilter = 'user' | 'all' | 'system' | 'disabled';
type FileEntry = { name: string; permissions: string; size: number; modified: string; is_directory: boolean; is_link: boolean };
type ToolStatus = { name: string; available: boolean; version: string; path: string; source: string };
type ToolsStatus = { adb: ToolStatus; scrcpy: ToolStatus };
type MediaVolumeState = { level: number; maximum: number };
type MirrorMode = 'display' | 'virtual' | 'camera';
type SoundMode = 'NORMAL' | 'VIBRATE' | 'SILENT';

const words = (value: string) =>
  value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, '')) ?? [];

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function aspectRatio(width: number, height: number): string {
  if (!width || !height) return '-';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function formatRate(rate: number): string {
  return rate > 0 ? `${Number.isInteger(rate) ? rate : rate.toFixed(2)} Hz` : '-';
}

function formatBytes(bytes: number): string {
  if (bytes < 0) return '-';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function appTone(packageName: string): string {
  return `tone-${[...packageName].reduce((total, character) => total + character.charCodeAt(0), 0) % 6}`;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="work-panel"><h3>{title}</h3>{children}</section>;
}

export function WorkbenchPage({ tab }: { tab: WorkTab }) {
  const { selectedDevice, deviceDetails, refreshDevices } = useDevices();
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const serial = selectedDevice?.serial ?? '';
  const [status, setStatus] = useState('Listo');
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [filter, setFilter] = useState('');
  const [appFilter, setAppFilter] = useState<AppFilter>('user');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [appDetails, setAppDetails] = useState<AppDetailsInfo | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installFiles, setInstallFiles] = useState<string[]>([]);
  const [installingApps, setInstallingApps] = useState(false);
  const [installResult, setInstallResult] = useState('');
  const [installReplace, setInstallReplace] = useState(true);
  const [installGrant, setInstallGrant] = useState(false);
  const [installTest, setInstallTest] = useState(false);
  const [installBypass, setInstallBypass] = useState(false);
  const [path, setPath] = useState('/sdcard');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [toolInfo, setToolInfo] = useState('');
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [adbPath, setAdbPath] = useState('');
  const [scrcpyPath, setScrcpyPath] = useState('');
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
  const [controlBrightness, setControlBrightness] = useState(128);
  const [controlVolume, setControlVolume] = useState(7);
  const [controlVolumeMax, setControlVolumeMax] = useState(15);
  const [rotationAuto, setRotationAuto] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [soundMode, setSoundMode] = useState<SoundMode>('NORMAL');

  const run = async (args: string[], success = 'Acción completada') => {
    if (!serial) { setStatus('Selecciona un dispositivo'); return; }
    setBusy(true);
    try {
      const output = await invoke<string>('run_device_action', { serial, args });
      setStatus(output || success);
      return output;
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const host = async (args: string[]) => {
    setBusy(true);
    try {
      const output = await invoke<string>('run_host_action', { args });
      setStatus(output || 'Acción completada');
      await refreshDevices();
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const refreshApps = async () => {
    if (!serial) return;
    setBusy(true);
    try {
      const value = await invoke<AppSummary[]>('list_apps', { serial });
      setApps(value); setStatus(`${value.length} aplicaciones`);
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
    setStatus(`Cargando nombres e iconos de ${appsNeedingMetadata.length} aplicaciones pendientes...`);
    try {
      for (let start = 0; start < appsNeedingMetadata.length; start += 3) {
        const batch = appsNeedingMetadata.slice(start, start + 3);
        const summaries = await Promise.all(batch.map(app => invoke<AppSummary>('enrich_app_summary', {
          serial, packageName: app.package_name, apkPath: app.apk_path, systemApp: app.system_app, disabled: app.disabled,
        }).catch(() => app)));
        setApps(current => current.map(app => summaries.find(summary => summary.package_name === app.package_name) || app));
        setAppDetails(current => {
          if (!current) return current;
          const summary = summaries.find(item => item.package_name === current.package_name);
          return summary ? { ...current, display_name: summary.display_name, icon_data_url: summary.icon_data_url } : current;
        });
        setStatus(`Nombres e iconos cargados: ${Math.min(start + batch.length, appsNeedingMetadata.length)} / ${appsNeedingMetadata.length}`);
      }
      setStatus('Nombres e iconos guardados en caché');
    } finally { setMetadataLoading(false); }
  };

  const chooseInstallFiles = async () => {
    try {
      const selected = await invoke<string[]>('select_application_packages');
      if (selected.length) {
        setInstallFiles(current => [...new Set([...current, ...selected])]);
        setInstallResult('');
      }
    } catch (error) { setInstallResult(String(error)); }
  };

  const installSelectedApps = async () => {
    if (!serial || !installFiles.length || installingApps) return;
    setInstallingApps(true);
    setInstallResult('Preparando paquetes e instalando…');
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

  const refreshFiles = async (nextPath = path) => {
    if (!serial) return;
    setBusy(true);
    try {
      const value = await invoke<FileEntry[]>('list_directory', { serial, path: nextPath });
      setFiles(value); setPath(nextPath); setStatus(`${value.length} elementos`);
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const scrcpy = async (extraArgs: string[]) => {
    if (!serial) return setStatus('Selecciona un dispositivo');
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
    } catch (error) { setStatus(String(error)); }
  };

  const saveToolPath = async (tool: 'adb' | 'scrcpy', pathValue: string) => {
    setBusy(true);
    try {
      const value = await invoke<ToolsStatus>('set_tool_path', { tool, path: pathValue });
      setTools(value);
      setAdbPath(value.adb.path);
      setScrcpyPath(value.scrcpy.path);
      setStatus(`Ruta de ${tool} guardada`);
      if (tool === 'adb') await refreshDevices();
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const installTool = async (tool: 'adb' | 'scrcpy') => {
    setBusy(true);
    setStatus(`Descargando e instalando ${tool}...`);
    try {
      const value = await invoke<ToolsStatus>('install_or_update_tool', { tool });
      setTools(value);
      setAdbPath(value.adb.path);
      setScrcpyPath(value.scrcpy.path);
      setStatus(`${tool} instalado o actualizado correctamente`);
      if (tool === 'adb') await refreshDevices();
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (tab === 'apps') refreshApps();
    if (tab === 'files') refreshFiles();
    if (tab === 'settings') {
      invoke<string>('get_adb_info').then(setToolInfo).catch(error => setToolInfo(String(error)));
      refreshTools();
    }
    if (tab === 'mirroring') {
      refreshTools();
      refreshMirrorData();
    }
    if (tab === 'control' && serial) {
      invoke<MediaVolumeState>('get_media_volume', { serial }).then(value => {
        setControlVolume(value.level);
        setControlVolumeMax(value.maximum);
      }).catch(() => undefined);
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

  const display = <div className="display-page">
    <section className="display-overview">
      <div className="display-facts">
        <div className="display-fact wide"><span>Tipo de dispositivo</span><strong>{deviceDetails ? t(`device.type.${deviceDetails.device_type}`) : '-'}</strong></div>
        <div className="display-fact"><span>Resolución actual</span><strong>{deviceDetails ? `${deviceDetails.current_width} x ${deviceDetails.current_height} px` : '-'}</strong></div>
        <div className="display-fact"><span>Resolución física</span><strong>{deviceDetails ? `${deviceDetails.physical_width} x ${deviceDetails.physical_height} px` : '-'}</strong></div>
        <div className="display-fact"><span>Densidad actual</span><strong>{deviceDetails?.current_density ? `${deviceDetails.current_density} dpi` : '-'}</strong></div>
        <div className="display-fact"><span>Densidad física</span><strong>{deviceDetails?.physical_density ? `${deviceDetails.physical_density} dpi` : '-'}</strong></div>
        <div className="display-fact"><span>Hz actuales</span><strong>{formatRate(deviceDetails?.refresh_rate_hz || 0)}</strong></div>
        <div className="display-fact"><span>Hz soportados</span><strong>{deviceDetails?.supported_refresh_rates_hz?.length ? deviceDetails.supported_refresh_rates_hz.map(formatRate).join(', ') : '-'}</strong></div>
      </div>
      <div className="display-behavior">
        <section className={`display-theme-card ${displayDarkMode ? 'active' : ''}`}>
          <div className="display-theme-icon" aria-hidden="true">{displayDarkMode ? '☾' : '☀'}</div>
          <div className="display-theme-copy">
            <span>APARIENCIA DEL DISPOSITIVO</span>
            <strong>Modo oscuro</strong>
            <small>{darkModeLoading ? 'Aplicando cambio…' : displayDarkMode ? 'Activado' : 'Desactivado'}</small>
          </div>
          <button className={`display-theme-switch ${displayDarkMode ? 'checked' : ''}`} type="button" role="switch" aria-checked={displayDarkMode} aria-label="Cambiar modo oscuro del dispositivo" disabled={!deviceDetails || darkModeLoading} onClick={toggleDeviceDarkMode}><span /></button>
        </section>
        <div className="display-fact"><span>Ancho mínimo</span><strong>{deviceDetails?.smallest_width_dp ? `${deviceDetails.smallest_width_dp} dp` : '-'}</strong></div>
        <div className="display-fact"><span>Tiempo de apagado</span><strong>{deviceDetails ? `${Math.round(deviceDetails.screen_off_timeout_ms / 1000)} s` : '-'}</strong></div>
      </div>
    </section>
    <section className="display-manual">
      <h3>Valores manuales</h3>
      <div className="suggestion-bar"><strong>Sugerencias rápidas:</strong>{displaySuggestions.map(item => <button key={`${item.width}-${item.height}`} onClick={() => { setDisplayWidth(item.width); setDisplayHeight(item.height); setDisplayDensity(item.density); }}>{item.width} x {item.height} · {item.density} dpi</button>)}</div>
      <div className="display-form">
        <label>Ancho<input type="number" min="320" value={displayWidth || ''} onChange={event => setDisplayWidth(Number(event.target.value))} /></label>
        <label>Alto<input type="number" min="320" value={displayHeight || ''} onChange={event => setDisplayHeight(Number(event.target.value))} /></label>
        <label>DPI<input type="number" min="120" value={displayDensity || ''} onChange={event => setDisplayDensity(Number(event.target.value))} /></label>
        <label>Timeout (s)<input type="number" min="1" value={displayTimeout || ''} onChange={event => setDisplayTimeout(Number(event.target.value))} /></label>
        <div className="display-actions"><button onClick={resetDisplay}>Restablecer</button><button className="primary" disabled={!displayWidth || !displayHeight || !displayDensity || !displayTimeout} onClick={applyDisplay}>Aplicar</button></div>
      </div>
      <div className="aspect-row"><span>Aspect ratio original: <strong>{aspectRatio(deviceDetails?.physical_width || 0, deviceDetails?.physical_height || 0)}</strong></span><span>Aspect ratio introducido: <strong>{aspectRatio(displayWidth, displayHeight)}</strong></span></div>
    </section>
  </div>;

  const sendKey = (code: string) => run(['shell', 'input', 'keyevent', code]);
  const applyMediaVolume = async (value: number) => {
    if (!serial) { setStatus('Selecciona un dispositivo'); return; }
    const safeValue = Math.max(0, Math.min(value, controlVolumeMax));
    setControlVolume(safeValue);
    setBusy(true);
    try {
      setStatus(await invoke<string>('set_media_volume', { serial, volume: safeValue }));
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };
  const setDeviceRotation = async (value: number) => {
    setRotation(value);
    setRotationAuto(false);
    await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    await run(['shell', 'settings', 'put', 'system', 'user_rotation', String(value)]);
  };
  const setDeviceSoundMode = async (mode: SoundMode) => {
    setSoundMode(mode);
    await run(['shell', 'cmd', 'audio', 'set-ringer-mode', mode]);
  };

  const control = <div className="control-page">
    <div className="control-settings">
      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">DISPOSITIVO</span><h3>Brillo y volumen</h3></div><span className="control-card-icon">◐</span></div>
        <label className="control-slider">
          <span><b>Brillo</b><strong>{controlBrightness} / 255</strong></span>
          <input type="range" min="0" max="255" value={controlBrightness} onChange={event => setControlBrightness(Number(event.target.value))} onMouseUp={event => run(['shell', 'settings', 'put', 'system', 'screen_brightness', event.currentTarget.value])} />
        </label>
        <label className="control-slider">
          <span><b>Volumen multimedia</b><strong>{controlVolume} / {controlVolumeMax}</strong></span>
          <input type="range" min="0" max={controlVolumeMax} value={controlVolume} onChange={event => setControlVolume(Number(event.target.value))} onPointerUp={event => applyMediaVolume(Number(event.currentTarget.value))} onKeyUp={event => applyMediaVolume(Number(event.currentTarget.value))} />
        </label>
        <p className="control-hint">Los cambios se aplican al soltar el control.</p>
      </section>

      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">PANTALLA</span><h3>Rotación</h3></div><label className="control-toggle"><span>Automática</span><input type="checkbox" checked={rotationAuto} onChange={async event => { setRotationAuto(event.target.checked); await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', event.target.checked ? '1' : '0']); }} /></label></div>
        <div className="rotation-grid">
          {[['▯', 'Vertical', 0], ['▭', 'Horizontal', 1], ['▯', 'Vertical inversa', 2], ['▭', 'Horizontal inversa', 3]].map(([icon, label, value]) => <button key={String(value)} className={!rotationAuto && rotation === value ? 'active' : ''} onClick={() => setDeviceRotation(Number(value))}><b className={`rotation-icon rotation-${value}`}>{icon}</b><span>{label}</span></button>)}
        </div>
      </section>

      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">AUDIO</span><h3>Modo de sonido</h3></div></div>
        <div className="sound-grid">
          <button className={soundMode === 'NORMAL' ? 'active' : ''} onClick={() => setDeviceSoundMode('NORMAL')}><b>♪</b><span>Sonido</span></button>
          <button className={soundMode === 'VIBRATE' ? 'active' : ''} onClick={() => setDeviceSoundMode('VIBRATE')}><b>≈</b><span>Vibración</span></button>
          <button className={soundMode === 'SILENT' ? 'active' : ''} onClick={() => setDeviceSoundMode('SILENT')}><b>×</b><span>Silencio</span></button>
        </div>
      </section>

      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">ENTRADA</span><h3>Introducir texto</h3></div></div>
        <form className="control-text-form" onSubmit={event => { event.preventDefault(); run(['shell', 'input', 'text', String(new FormData(event.currentTarget).get('text')).replace(/ /g, '%s')]); }}><input name="text" placeholder="Texto a enviar (espacios incluidos)" /><button className="primary">Enviar texto</button></form>
        <details className="control-advanced"><summary>Entrada avanzada</summary><form className="control-text-form" onSubmit={event => { event.preventDefault(); run(['shell', 'input', ...words(String(new FormData(event.currentTarget).get('args')))]); }}><input name="args" placeholder="tap 500 800 / swipe 100 500 900 500 300" /><button>Ejecutar</button></form></details>
      </section>
    </div>

    <aside className="remote-panel">
      <div className="remote-heading"><div><span className="control-kicker">ACCIONES RÁPIDAS</span><h3>Mando Android TV</h3></div><button className="remote-power" title="Encender o apagar" onClick={() => sendKey('KEYCODE_POWER')}>⏻</button></div>
      <div className="remote-body">
        <div className="remote-dpad" aria-label="Control direccional">
          <button className="remote-up" title="Arriba" onClick={() => sendKey('KEYCODE_DPAD_UP')}>⌃</button>
          <button className="remote-left" title="Izquierda" onClick={() => sendKey('KEYCODE_DPAD_LEFT')}>‹</button>
          <button className="remote-ok" onClick={() => sendKey('KEYCODE_DPAD_CENTER')}><span>OK</span></button>
          <button className="remote-right" title="Derecha" onClick={() => sendKey('KEYCODE_DPAD_RIGHT')}>›</button>
          <button className="remote-down" title="Abajo" onClick={() => sendKey('KEYCODE_DPAD_DOWN')}>⌄</button>
        </div>

        <div className="remote-main-actions">
          <button onClick={() => sendKey('KEYCODE_BACK')}><b>←</b><span>Volver</span></button>
          <button onClick={() => sendKey('KEYCODE_HOME')}><b>⌂</b><span>Inicio</span></button>
          <button className="assistant" onClick={() => sendKey('KEYCODE_ASSIST')}><b>✦</b><span>Asistente</span></button>
        </div>
        <div className="remote-volume">
          <button className="remote-mute" onClick={() => sendKey('KEYCODE_VOLUME_MUTE')}><b>×</b><span>Silenciar</span></button>
          <div className="remote-volume-pill"><button title="Bajar volumen" onClick={() => applyMediaVolume(controlVolume - 1)}>−</button><span>{controlVolume}<small>VOL</small></span><button title="Subir volumen" onClick={() => applyMediaVolume(controlVolume + 1)}>+</button></div>
        </div>
        <div className="remote-media">
          <button onClick={() => sendKey('KEYCODE_APP_SWITCH')}><b>▦</b><span>Recientes</span></button>
          <button onClick={() => sendKey('KEYCODE_MENU')}><b>☰</b><span>Menú</span></button>
          <button onClick={() => sendKey('KEYCODE_MEDIA_PREVIOUS')}><b>Ⅰ◀</b><span>Anterior</span></button>
          <button onClick={() => sendKey('KEYCODE_MEDIA_PLAY_PAUSE')}><b>▶</b><span>Play / Pausa</span></button>
          <button onClick={() => sendKey('KEYCODE_MEDIA_NEXT')}><b>▶Ⅰ</b><span>Siguiente</span></button>
          <button onClick={() => sendKey('KEYCODE_INFO')}><b>i</b><span>Info</span></button>
          <button onClick={() => sendKey('KEYCODE_GUIDE')}><b>▤</b><span>Guía</span></button>
          <button onClick={() => sendKey('KEYCODE_CHANNEL_DOWN')}><b>CH−</b><span>Canal</span></button>
          <button onClick={() => sendKey('KEYCODE_CHANNEL_UP')}><b>CH+</b><span>Canal</span></button>
        </div>
      </div>
    </aside>
  </div>;

  const toggleAppEnabled = async () => {
    if (!appDetails) return;
    const willDisable = !appDetails.disabled;
    const command = willDisable
      ? ['shell', 'pm', 'disable-user', '--user', '0', selectedPackage]
      : ['shell', 'pm', 'enable', '--user', '0', selectedPackage];
    const result = await run(command, willDisable ? 'Aplicación deshabilitada' : 'Aplicación habilitada');
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
      const destination = await invoke<string>('select_apk_destination', { packageName: appDetails.package_name });
      if (destination) await run(['pull', appDetails.apk_path, destination], `APK guardado en ${destination}`);
    } catch (error) { setStatus(String(error)); }
  };
  const clearApplicationCache = async () => {
    try {
      setStatus(await invoke<string>('clear_application_cache'));
      setApps(current => current.map(app => ({ ...app, display_name: app.package_name, icon_data_url: '' })));
      setAppDetails(current => current ? { ...current, display_name: current.package_name, icon_data_url: '' } : current);
    } catch (error) { setStatus(String(error)); }
  };

  const appsPage = <div className={`apps-page ${selectedPackage ? 'detail-open' : ''}`}>
    <section className="apps-catalog">
      <div className="apps-toolbar">
        <div className="apps-search"><span>⌕</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar por nombre o paquete" /></div>
        <button className="metadata-button" disabled={metadataLoading || !appsNeedingMetadata.length} onClick={loadVisibleMetadata}>{metadataLoading ? 'Cargando nombres e iconos…' : appsNeedingMetadata.length ? `Cargar nombres e iconos (${appsNeedingMetadata.length})` : 'Nombres e iconos cargados'}</button>
        <button onClick={refreshApps}>Actualizar</button>
        <button className="apps-install-open" title="Instalar aplicaciones" aria-label="Instalar aplicaciones" onClick={() => setInstallOpen(true)}>+</button>
      </div>
      <div className="apps-filters">
        {([['user', 'Usuario'], ['all', 'Todas'], ['system', 'Sistema'], ['disabled', 'Deshabilitadas']] as const).map(([value, label]) => <button key={value} className={appFilter === value ? 'active' : ''} onClick={() => setAppFilter(value)}>{label}<span>{apps.filter(app => value === 'all' ? true : value === 'disabled' ? app.disabled : value === 'system' ? app.system_app && !app.disabled : !app.system_app && !app.disabled).length}</span></button>)}
      </div>
      <div className="apps-grid">
        {filteredApps.map(app => <button className={`app-tile ${selectedPackage === app.package_name ? 'selected' : ''}`} key={app.package_name} onClick={() => selectApplication(app)}>
          <span className="app-icon-frame">
            {app.icon_data_url ? <img src={app.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(app.package_name)}`}>{app.display_name.slice(0, 2).toUpperCase()}</span>}
          </span>
          <strong>{app.display_name}</strong><small>{app.package_name}</small>
          <em>{app.disabled ? 'Deshabilitada' : app.system_app ? 'Sistema' : 'Usuario'}</em>
        </button>)}
        {!filteredApps.length && <div className="apps-empty"><b>Sin aplicaciones</b><span>No hay resultados para este filtro.</span></div>}
      </div>
    </section>

    <aside className="app-detail">
      {!appDetails ? <div className="app-detail-empty"><b>Selecciona una aplicación</b><span>Consulta sus detalles, acciones y permisos.</span></div> : <>
        <button className="app-detail-back" onClick={() => { setSelectedPackage(''); setAppDetails(null); }}>← Volver a aplicaciones</button>
        <header className="app-detail-header">
          <span className="app-icon-frame">
            {appDetails.icon_data_url ? <img src={appDetails.icon_data_url} alt="" /> : <span className={`app-fallback ${appTone(appDetails.package_name)}`}>{appDetails.display_name.slice(0, 2).toUpperCase()}</span>}
          </span>
          <div><h3>{appDetails.display_name}</h3><p>{appDetails.package_name}</p><span>{appDetails.disabled ? 'Deshabilitada' : appDetails.system_app ? 'Aplicación del sistema' : 'Aplicación de usuario'}</span></div>
        </header>

        <section className="app-detail-section"><h4>Acciones</h4><div className="app-actions">
          <button className="primary" onClick={() => run(['shell', 'monkey', '-p', selectedPackage, '1'])}>↗ Abrir</button>
          <button onClick={() => run(['shell', 'am', 'force-stop', selectedPackage])}>■ Detener</button>
          <button className="danger" onClick={async () => { await run(['uninstall', selectedPackage]); setSelectedPackage(''); await refreshApps(); }}>Desinstalar</button>
          <button className={appDetails.disabled ? 'enable-action' : ''} onClick={toggleAppEnabled}>{appDetails.disabled ? 'Habilitar' : 'Deshabilitar'}</button>
          <button onClick={async () => { await run(['shell', 'pm', 'clear', selectedPackage]); await refreshAppDetails(); }}>Borrar datos</button>
          <button onClick={async () => { await run(['shell', 'run-as', selectedPackage, 'sh', '-c', 'rm -rf cache/* code_cache/* 2>/dev/null || true']); await refreshAppDetails(); }}>Borrar caché</button>
        </div><button className="app-export-button primary" onClick={exportApk}>Guardar APK…</button></section>

        <section className="app-detail-section"><h4>Energía</h4><div className="energy-options">{([['unrestricted', 'Sin restricciones'], ['optimized', 'Optimizada'], ['restricted', 'Restringida']] as const).map(([value, label]) => <button key={value} className={appDetails.background_mode === value ? 'active' : ''} onClick={() => setBackgroundMode(value)}><b>{label}</b><span>{value === 'unrestricted' ? 'Permite actividad en segundo plano' : value === 'optimized' ? 'Android decide cuándo limitarla' : 'Limita el uso en segundo plano'}</span></button>)}</div></section>

        <section className="app-detail-section"><div className="detail-section-title"><h4>Información</h4>{detailsLoading && <span>Cargando detalles…</span>}</div><dl className="app-info">
          <div><dt>Versión</dt><dd>{appDetails.version_name} ({appDetails.version_code})</dd></div><div><dt>Target SDK</dt><dd>{appDetails.target_sdk}</dd></div><div><dt>Min SDK</dt><dd>{appDetails.min_sdk}</dd></div><div><dt>Instalador</dt><dd>{appDetails.installer}</dd></div>
          <div><dt>Tamaño APK</dt><dd>{formatBytes(appDetails.code_size_bytes)}</dd></div><div><dt>Datos</dt><dd>{formatBytes(appDetails.data_size_bytes)}</dd></div><div><dt>Caché</dt><dd>{formatBytes(appDetails.cache_size_bytes)}</dd></div><div><dt>Ruta APK</dt><dd>{appDetails.apk_path}</dd></div>
        </dl></section>

        <section className="app-detail-section permissions-section"><div className="permissions-title"><h4>Permisos</h4><span>{detailsLoading ? 'Cargando permisos…' : `${appDetails.permissions.filter(permission => permission.granted).length} de ${appDetails.permissions.length} concedidos`}</span></div><div className="permissions-list">
          {appDetails.permissions.map(permission => <div className="permission-row" key={permission.name}><div><strong>{permission.name.split('.').pop()}</strong><span>{permission.name}</span></div><label><input type="checkbox" checked={permission.granted} disabled={!permission.runtime} onChange={() => togglePermission(permission)} /><span>{permission.granted ? 'Permitido' : 'No permitido'}</span></label></div>)}
          {!appDetails.permissions.length && <p className="muted">Esta aplicación no declara permisos.</p>}
        </div></section>
      </>}
    </aside>

    {installOpen && <div className="install-overlay" role="dialog" aria-modal="true" aria-label="Instalar aplicaciones">
      <section className="install-dialog">
        <header className="install-header"><div><span>APLICACIONES</span><h2>Instalar aplicaciones</h2><p>Selecciona paquetes APK o bundles para instalarlos en el dispositivo conectado.</p></div><button aria-label="Cerrar" disabled={installingApps} onClick={() => setInstallOpen(false)}>×</button></header>
        <div className="install-scroll">
          <section className="install-section">
            <div className="install-section-title"><div><span>1</span><h3>Archivos seleccionados</h3></div><button className="primary" disabled={installingApps} onClick={chooseInstallFiles}>Elegir archivos</button></div>
            {!installFiles.length ? <div className="install-empty">Todavía no has seleccionado ningún archivo para instalar.</div> : <div className="install-file-list">{installFiles.map(file => <div key={file}><span className="install-file-icon">APK</span><p><strong>{file.split(/[\\/]/).pop()}</strong><small>{file}</small></p><button disabled={installingApps} aria-label="Quitar archivo" onClick={() => setInstallFiles(current => current.filter(value => value !== file))}>×</button></div>)}</div>}
          </section>
          <section className="install-section">
            <div className="install-section-title"><div><span>2</span><h3>Opciones de instalación</h3></div></div>
            <div className="install-options">
              <label><input type="checkbox" checked={installReplace} onChange={event => setInstallReplace(event.target.checked)} /><span><strong>Reemplazar si ya está instalada</strong><small>Conserva los datos existentes de la aplicación.</small></span></label>
              <label><input type="checkbox" checked={installGrant} onChange={event => setInstallGrant(event.target.checked)} /><span><strong>Conceder permisos runtime</strong><small>Concede automáticamente los permisos solicitados.</small></span></label>
              <label><input type="checkbox" checked={installTest} onChange={event => setInstallTest(event.target.checked)} /><span><strong>Permitir paquetes de prueba</strong><small>Admite APK marcadas como test-only.</small></span></label>
              <label><input type="checkbox" checked={installBypass} onChange={event => setInstallBypass(event.target.checked)} /><span><strong>Omitir bloqueo de SDK antiguo</strong><small>Activa --bypass-low-target-sdk-block.</small></span></label>
            </div>
            <p className="install-note">Los formatos .aab y .apks se resuelven para el dispositivo mediante bundletool. Los archivos .apkm, .xapk y .zip se extraen e instalan usando sus APK internas.</p>
          </section>
          <section className="install-section install-result"><div className="install-section-title"><div><span>3</span><h3>Resultado de la instalación</h3></div></div><pre>{installResult || 'Selecciona los archivos y pulsa Instalar cuando quieras iniciar el proceso.'}</pre></section>
        </div>
        <footer className="install-footer"><button disabled={installingApps} onClick={() => setInstallOpen(false)}>Cerrar</button><button className="primary" disabled={!serial || !installFiles.length || installingApps} onClick={installSelectedApps}>{installingApps ? 'Instalando…' : `Instalar${installFiles.length ? ` (${installFiles.length})` : ''}`}</button></footer>
      </section>
    </div>}
  </div>;

  const filesPage = <div className="work-panel file-page">
    <div className="panel-toolbar"><button onClick={() => refreshFiles(path.substring(0, path.lastIndexOf('/')) || '/')}>Subir</button><input value={path} onChange={e => setPath(e.target.value)} onKeyDown={e => e.key === 'Enter' && refreshFiles()} /><button onClick={() => refreshFiles()}>Actualizar</button></div>
    <div className="file-actions">
      <form onSubmit={e => { e.preventDefault(); run(['shell', 'mkdir', '-p', `${path}/${new FormData(e.currentTarget).get('name')}`]).then(() => refreshFiles()); }}><input name="name" placeholder="Nueva carpeta" /><button>Crear</button></form>
      <form onSubmit={e => { e.preventDefault(); run(['push', String(new FormData(e.currentTarget).get('local')), path]).then(() => refreshFiles()); }}><input name="local" placeholder="Ruta local para subir" /><button>Subir</button></form>
      <form onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(['pull', String(d.get('remote')), String(d.get('local'))]); }}><input name="remote" placeholder="Ruta remota" /><input name="local" placeholder="Destino local" /><button>Descargar</button></form>
    </div>
    <div className="file-table">{files.map(file => <div className="file-row" key={file.name} onDoubleClick={() => file.is_directory && refreshFiles(`${path.replace(/\/$/, '')}/${file.name}`)}><span>{file.is_directory ? 'DIR' : 'FILE'}</span><strong>{file.name}</strong><span>{file.permissions}</span><span>{file.size}</span><button className="danger" onClick={() => run(['shell', 'rm', '-rf', `${path.replace(/\/$/, '')}/${file.name}`]).then(() => refreshFiles())}>Eliminar</button></div>)}</div>
  </div>;

  const system = <div className="work-grid">
    <Panel title="Energía"><div className="button-row"><button onClick={() => run(['reboot'])}>Reiniciar</button><button onClick={() => run(['reboot', 'recovery'])}>Recovery</button><button onClick={() => run(['reboot', 'bootloader'])}>Bootloader</button><button onClick={() => run(['shell', 'reboot', '-p'])}>Apagar</button></div></Panel>
    <Panel title="Usuarios"><div className="button-row"><button onClick={() => run(['shell', 'pm', 'list', 'users'])}>Listar usuarios</button><button onClick={() => run(['shell', 'am', 'get-current-user'])}>Usuario actual</button></div><form className="form-row" onSubmit={e => { e.preventDefault(); run(['shell', 'pm', 'create-user', String(new FormData(e.currentTarget).get('name'))]); }}><input name="name" placeholder="Nuevo usuario" /><button>Crear</button></form></Panel>
    <Panel title="Diagnóstico"><div className="button-row"><button onClick={() => run(['shell', 'ime', 'list', '-s'])}>Teclados</button><button onClick={() => run(['shell', 'getprop'])}>Propiedades</button><button onClick={() => run(['shell', 'dumpsys', 'battery'])}>Batería</button></div></Panel>
  </div>;

  const mirroring = <div className="mirror-page">
    <div className="mirror-intro"><div><h2>Mirroring <em>scrcpy</em></h2><p>Muestra la pantalla principal, crea una pantalla virtual o transmite una cámara del dispositivo.</p></div><span className={tools?.scrcpy.available ? 'mirror-ready' : 'mirror-missing'}>{tools?.scrcpy.available ? `scrcpy ${tools.scrcpy.version}` : 'scrcpy no instalado'}</span></div>
    <div className="mirror-mode-tabs">
      <button className={mirrorMode === 'display' ? 'active' : ''} onClick={() => setMirrorMode('display')}><b>▯</b><strong>Pantalla principal</strong><span>Duplica la pantalla actual</span></button>
      <button className={mirrorMode === 'virtual' ? 'active' : ''} onClick={() => setMirrorMode('virtual')}><b>▣</b><strong>Pantalla virtual</strong><span>Crea una pantalla nueva</span></button>
      <button className={mirrorMode === 'camera' ? 'active' : ''} onClick={() => setMirrorMode('camera')}><b>●</b><strong>Cámara</strong><span>Muestra una cámara</span></button>
    </div>
    <div className="mirror-quick">
      <label><input type="checkbox" checked={mirrorFullscreen} onChange={event => setMirrorFullscreen(event.target.checked)} /> Pantalla completa</label>
      <label className={mirrorMode === 'camera' ? 'disabled' : ''}><input type="checkbox" checked={mirrorTurnScreenOff} disabled={mirrorMode === 'camera'} onChange={event => setMirrorTurnScreenOff(event.target.checked)} /> Apagar pantalla del dispositivo</label>
      <span>{mirrorMode === 'camera' ? 'La cámara requiere Android 12 o superior y no admite control.' : 'El audio del dispositivo requiere Android 11 o superior.'}</span>
    </div>
    <div className="mirror-options">
      <section className="mirror-card">
        <h3>Imagen</h3>
        <div className="mirror-fields">
          {mirrorMode !== 'camera' && <label>Tamaño máximo (px)<input type="number" min="0" value={mirrorMaxSize} onChange={event => setMirrorMaxSize(event.target.value)} placeholder="Sin límite" /></label>}
          <label>FPS máximos<input type="number" min="1" step="0.01" value={mirrorMaxFps} onChange={event => setMirrorMaxFps(event.target.value)} placeholder="Sin límite" /></label>
        </div>
        {mirrorMode === 'virtual' && <div className="mirror-subsection"><h4>Pantalla virtual</h4><div className="mirror-fields"><label>Ancho virtual<input type="number" value={virtualWidth} onChange={event => setVirtualWidth(event.target.value)} placeholder="Automático" /></label><label>Alto virtual<input type="number" value={virtualHeight} onChange={event => setVirtualHeight(event.target.value)} placeholder="Automático" /></label><label>DPI virtual<input type="number" value={virtualDpi} onChange={event => setVirtualDpi(event.target.value)} placeholder="Automático" /></label></div><label className="mirror-check"><input type="checkbox" checked={virtualResizable} onChange={event => setVirtualResizable(event.target.checked)} /> Permitir redimensionar ventana</label></div>}
        {mirrorMode === 'camera' && <div className="mirror-subsection"><div className="mirror-section-title"><h4>Cámara</h4><button onClick={refreshMirrorData}>Actualizar cámaras</button></div><label>Cámara / ID<select value={cameraId} onChange={event => setCameraId(event.target.value)}><option value="">Selección automática</option>{cameras.map(camera => <option key={camera} value={camera}>{camera}</option>)}</select></label><div className="mirror-fields"><label>Ancho cámara<input type="number" value={cameraWidth} onChange={event => setCameraWidth(event.target.value)} placeholder="Automático" /></label><label>Alto cámara<input type="number" value={cameraHeight} onChange={event => setCameraHeight(event.target.value)} placeholder="Automático" /></label></div></div>}
        <div className="mirror-subsection"><label className="mirror-check"><input type="checkbox" checked={mirrorRecord} onChange={event => setMirrorRecord(event.target.checked)} /> Grabar la vista</label><input value={mirrorRecordPath} disabled={!mirrorRecord} onChange={event => setMirrorRecordPath(event.target.value)} placeholder="Ruta de grabación, por ejemplo C:\Videos\captura.mkv" /></div>
      </section>
      <section className="mirror-card">
        <h3>Entrada y sonido</h3>
        {mirrorMode !== 'camera' && <label className="mirror-check"><input type="checkbox" checked={mirrorReadOnly} onChange={event => setMirrorReadOnly(event.target.checked)} /> Solo ver, sin control</label>}
        <label>Audio<select value={mirrorAudio} onChange={event => setMirrorAudio(event.target.value)}><option value="default">Por defecto</option><option value="none">Sin audio</option><option value="output">Salida del dispositivo</option><option value="mic">Micrófono</option></select></label>
        <label className={mirrorReadOnly || mirrorMode === 'camera' ? 'disabled' : ''}>Teclado<select disabled={mirrorReadOnly || mirrorMode === 'camera'} value={mirrorKeyboard} onChange={event => setMirrorKeyboard(event.target.value)}><option value="default">Por defecto</option><option value="sdk">SDK</option><option value="uhid">UHID</option><option value="aoa">AOA</option><option value="disabled">Deshabilitado</option></select></label>
        <label className={mirrorReadOnly || mirrorMode === 'camera' ? 'disabled' : ''}>Ratón<select disabled={mirrorReadOnly || mirrorMode === 'camera'} value={mirrorMouse} onChange={event => setMirrorMouse(event.target.value)}><option value="default">Por defecto</option><option value="sdk">SDK</option><option value="uhid">UHID</option><option value="aoa">AOA</option><option value="disabled">Deshabilitado</option></select></label>
        {mirrorMode !== 'camera' && <div className="mirror-subsection"><label className="mirror-check"><input type="checkbox" checked={mirrorStartApp} onChange={event => setMirrorStartApp(event.target.checked)} /> Abrir una app al iniciar</label><select disabled={!mirrorStartApp} value={mirrorApp} onChange={event => setMirrorApp(event.target.value)}><option value="">Selecciona una app</option>{mirrorApps.map(app => <option key={app.package_name} value={app.package_name}>{app.package_name}</option>)}</select></div>}
        <div className="mirror-advanced"><span>Argumentos adicionales</span><form className="form-row" onSubmit={event => { event.preventDefault(); scrcpy(words(String(new FormData(event.currentTarget).get('args')))); }}><input name="args" placeholder="--video-bit-rate=8M ..." /><button>Ejecutar directo</button></form></div>
      </section>
    </div>
    <button className="mirror-launch" disabled={!serial || !tools?.scrcpy.available} onClick={launchMirror}>Abrir vista con scrcpy</button>
  </div>;

  const settings = <div className="work-grid">
    <Panel title="Apariencia"><div className="button-row"><button className={theme === 'light' ? 'primary' : ''} onClick={() => setTheme('light')}>Claro</button><button className={theme === 'dark' ? 'primary' : ''} onClick={() => setTheme('dark')}>Oscuro</button></div><label className="settings-select">Idioma<select value={language} onChange={event => setLanguage(event.target.value as 'es' | 'en')}><option value="es">Español</option><option value="en">English</option></select></label></Panel>
    <Panel title="Conexión inalámbrica"><form className="form-row" onSubmit={e => { e.preventDefault(); host(['connect', String(new FormData(e.currentTarget).get('endpoint'))]); }}><input name="endpoint" placeholder="192.168.1.10:5555" /><button>Conectar</button></form><form className="form-row" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); host(['pair', String(d.get('endpoint')), String(d.get('code'))]); }}><input name="endpoint" placeholder="IP:puerto" /><input name="code" placeholder="Código" /><button>Emparejar</button></form></Panel>
    <Panel title="ADB"><div className="tool-status"><strong>{tools?.adb.available ? 'Disponible' : 'No instalado'}</strong><span>Origen: {tools?.adb.source || '-'}</span><span>Versión: {tools?.adb.version || '-'}</span></div><div className="form-stack"><input value={adbPath} onChange={event => setAdbPath(event.target.value)} placeholder="Ruta a adb.exe o su carpeta" /><div className="button-row"><button onClick={() => saveToolPath('adb', adbPath)}>Guardar ruta</button><button onClick={() => saveToolPath('adb', '')}>Detección automática</button><button className="primary" onClick={() => installTool('adb')}>{tools?.adb.available ? 'Actualizar ADB' : 'Instalar ADB'}</button></div></div><pre>{toolInfo || 'Consultando ADB...'}</pre></Panel>
    <Panel title="scrcpy"><div className="tool-status"><strong>{tools?.scrcpy.available ? 'Disponible' : 'No instalado'}</strong><span>Origen: {tools?.scrcpy.source || '-'}</span><span>Versión: {tools?.scrcpy.version || '-'}</span></div><div className="form-stack"><input value={scrcpyPath} onChange={event => setScrcpyPath(event.target.value)} placeholder="Ruta a scrcpy.exe o su carpeta" /><div className="button-row"><button onClick={() => saveToolPath('scrcpy', scrcpyPath)}>Guardar ruta</button><button onClick={() => saveToolPath('scrcpy', '')}>Detección automática</button><button className="primary" onClick={() => installTool('scrcpy')}>{tools?.scrcpy.available ? 'Actualizar scrcpy' : 'Instalar scrcpy'}</button></div></div></Panel>
    <Panel title="Caché de aplicaciones"><p className="muted">Solo almacena localmente los nombres e iconos obtenidos de las aplicaciones.</p><div className="button-row settings-cache-actions"><button className="danger" onClick={clearApplicationCache}>Borrar caché de nombres e iconos</button></div></Panel>
    <Panel title="Herramientas de red"><button onClick={() => host(['mdns', 'services'])}>Descubrir dispositivos Wi-Fi</button></Panel>
  </div>;

  const pages: Record<WorkTab, ReactNode> = { display, mirroring, control, apps: appsPage, files: filesPage, system, settings };
  return <div className="workbench"><header className="page-header"><div><h2>{t(`nav.${tab}`)}</h2><p>{serial || 'No hay dispositivo seleccionado'}</p></div><span className={busy ? 'status busy' : 'status'}>{busy ? 'Trabajando...' : status}</span></header><div className="workbench-content">{pages[tab]}</div></div>;
}
