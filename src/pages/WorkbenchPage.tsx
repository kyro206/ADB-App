import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { useDevices } from '../context/DeviceContext';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcon } from '../components/MaterialIcon';
import { InstallationDialog } from '../components/dialogs/InstallationDialog';
import { DestructiveActionDialog, type DestructiveAppAction } from '../components/dialogs/DestructiveActionDialog';
import { DisplayPage } from './DisplayPage';
import { MirroringPage } from './MirroringPage';
import { SettingsView } from './workbench/SettingsView';
import { AppsView } from './workbench/AppsView';
import { SystemView } from './workbench/SystemView';
import { WorkbenchShell } from './workbench/WorkbenchShell';
import { formatBytes, words } from './workbench/utils';
import type { AppDetailsInfo, AppFilter, AppPermissionInfo, AppSummary, FileEntry, FileSortKey, FileView, MediaVolumeState, MirrorMode, SoundMode, SystemState, ToolsStatus, WorkTab } from './workbench/types';
import './WorkbenchPage.css';

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
  const [path, setPath] = useState('/sdcard');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [fileView, setFileView] = useState<FileView>('list');
  const [fileFilter, setFileFilter] = useState('');
  const [filePathEditing, setFilePathEditing] = useState(false);
  const [fileSort, setFileSort] = useState<{ key: FileSortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [fileHistory, setFileHistory] = useState<string[]>(['/sdcard']);
  const [fileHistoryIndex, setFileHistoryIndex] = useState(0);
  const [fileThumbnails, setFileThumbnails] = useState<Record<string, string>>({});
  const [tools, setTools] = useState<ToolsStatus | null>(null);
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
  const [controlBrightness, setControlBrightness] = useState(128);
  const [controlVolume, setControlVolume] = useState(7);
  const [controlVolumeMax, setControlVolumeMax] = useState(15);
  const [rotationAuto, setRotationAuto] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [soundMode, setSoundMode] = useState<SoundMode>('NORMAL');
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [selectedSystemUser, setSelectedSystemUser] = useState('');
  const [newSystemUser, setNewSystemUser] = useState('');
  const [selectedKeyboard, setSelectedKeyboard] = useState('');
  const [systemLoading, setSystemLoading] = useState(false);

  const run = async (args: string[], success = 'Acción completada') => {
    if (!serial) { setStatus('Selecciona un dispositivo'); return; }
    setBusy(true);
    try {
      const output = await invoke<string>('run_device_action', { serial, args });
      setStatus(output || success);
      return output;
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const refreshSystemState = async () => {
    if (!serial) return;
    setSystemLoading(true);
    try {
      const value = await invoke<SystemState>('get_system_state', { serial });
      setSystemState(value);
      setSelectedSystemUser(current => value.users.some(user => String(user.id) === current) ? current : String(value.current_user_id));
      setSelectedKeyboard(current => value.keyboards.some(keyboard => keyboard.id === current) ? current : value.current_keyboard_id);
      setStatus('Ajustes del sistema actualizados');
    } catch (error) {
      setStatus(String(error));
    } finally {
      setSystemLoading(false);
    }
  };

  const applySystemAction = async (args: string[], success: string) => {
    if (!serial) return setStatus('Selecciona un dispositivo');
    setSystemLoading(true);
    try {
      await invoke<string>('run_device_action', { serial, args });
      setStatus(success);
      await refreshSystemState();
    } catch (error) {
      setStatus(String(error));
    } finally {
      setSystemLoading(false);
    }
  };

  const createSystemUser = async () => {
    const name = newSystemUser.trim();
    if (!name) return setStatus('Introduce un nombre para el nuevo usuario');
    await applySystemAction(['shell', 'pm', 'create-user', name], `Usuario "${name}" creado`);
    setNewSystemUser('');
  };

  const removeSystemUser = async () => {
    if (!selectedSystemUser) return;
    const user = systemState?.users.find(item => String(item.id) === selectedSystemUser);
    const accepted = await confirm(
      `Se eliminará el usuario ${user?.name || selectedSystemUser} y sus datos del dispositivo.\n\nEsta acción no se puede deshacer.`,
      { title: 'Eliminar usuario', kind: 'warning', okLabel: 'Eliminar', cancelLabel: 'Cancelar' },
    );
    if (accepted) await applySystemAction(['shell', 'pm', 'remove-user', selectedSystemUser], `Usuario ${selectedSystemUser} eliminado`);
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
    let loaded = 0;
    let failed = 0;
    try {
      for (let start = 0; start < appsNeedingMetadata.length; start += 3) {
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
        setStatus(`Nombres e iconos procesados: ${Math.min(start + batch.length, appsNeedingMetadata.length)} / ${appsNeedingMetadata.length}`);
      }
      setStatus(failed ? `Metadatos cargados: ${loaded}. No se pudieron cargar: ${failed}.` : `${loaded} nombres e iconos guardados en caché`);
    } finally { setMetadataLoading(false); }
  };

  const chooseInstallFiles = async () => {
    try {
      const selected = await open({
        title: 'Seleccionar aplicaciones para instalar',
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

  const normalizeDevicePath = (value: string) => {
    const parts: string[] = [];
    for (const part of value.replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop(); else parts.push(part);
    }
    return `/${parts.join('/')}`;
  };

  const filePath = (file: FileEntry) => normalizeDevicePath(`${path}/${file.name}`);
  const linkPath = (file: FileEntry) => normalizeDevicePath(file.link_target.startsWith('/') ? file.link_target : `${path}/${file.link_target}`);
  const filteredFiles = useMemo(() => {
    const query = fileFilter.trim().toLowerCase();
    const matching = files.filter(file => !query || file.name.toLowerCase().includes(query) || file.link_target.toLowerCase().includes(query));
    const direction = fileSort.direction === 'asc' ? 1 : -1;
    return [...matching].sort((left, right) => {
      const leftValue = fileSort.key === 'type' ? (left.is_link ? 'link' : left.is_directory ? 'directory' : 'file') : left[fileSort.key];
      const rightValue = fileSort.key === 'type' ? (right.is_link ? 'link' : right.is_directory ? 'directory' : 'file') : right[fileSort.key];
      return (typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'es', { numeric: true, sensitivity: 'base' })) * direction;
    });
  }, [files, fileFilter, fileSort]);
  const selectedFileEntries = useMemo(() => files.filter(file => selectedFiles.includes(file.name)), [files, selectedFiles]);

  const refreshFiles = async (nextPath = path, addHistory = false) => {
    if (!serial) return;
    setBusy(true);
    try {
      const normalized = normalizeDevicePath(nextPath);
      const value = await invoke<FileEntry[]>('list_directory', { serial, path: normalized });
      setFiles(value); setPath(normalized); setSelectedFiles([]); setStatus(`${value.length} elementos`);
      if (addHistory && normalized !== fileHistory[fileHistoryIndex]) {
        setFileHistory(current => [...current.slice(0, fileHistoryIndex + 1), normalized]);
        setFileHistoryIndex(fileHistoryIndex + 1);
      }
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const openFileEntry = async (file: FileEntry) => {
    if (file.is_directory) return refreshFiles(filePath(file), true);
    if (file.is_link) return refreshFiles(linkPath(file), true);
  };

  const goFileHistory = async (index: number) => {
    if (index < 0 || index >= fileHistory.length) return;
    await refreshFiles(fileHistory[index]);
    setFileHistoryIndex(index);
  };

  const uploadFiles = async () => {
    const selected = await open({ multiple: true, directory: false });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    for (const localPath of paths) {
      await run(['push', localPath, path]);
    }
    if (paths.length) await refreshFiles();
  };

  const downloadSelectedFiles = async () => {
    if (!selectedFileEntries.length) return;
    const destination = await open({ directory: true, multiple: false });
    if (!destination || Array.isArray(destination)) return;
    setBusy(true);
    try {
      for (const file of selectedFileEntries) {
        const localPath = `${destination}\\${file.name}`;
        setStatus(await invoke<string>('pull_file', { serial, remotePath: filePath(file), localPath }));
      }
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const createDeviceFolder = async () => {
    const name = window.prompt('Nombre de la nueva carpeta');
    if (name?.trim()) await run(['shell', 'mkdir', '-p', `${path}/${name.trim()}`]).then(() => refreshFiles());
  };

  const renameSelectedFile = async () => {
    const file = selectedFileEntries[0];
    if (!file) return;
    const name = window.prompt('Nuevo nombre', file.name);
    if (name?.trim() && name !== file.name) await run(['shell', 'mv', filePath(file), `${path}/${name.trim()}`]).then(() => refreshFiles());
  };

  const duplicateSelectedFile = async () => {
    const file = selectedFileEntries[0];
    if (!file) return;
    const extensionIndex = file.is_directory ? -1 : file.name.lastIndexOf('.');
    const suggestedName = extensionIndex > 0
      ? `${file.name.slice(0, extensionIndex)} - copia${file.name.slice(extensionIndex)}`
      : `${file.name} - copia`;
    const name = window.prompt('Nombre de la copia', suggestedName);
    if (name?.trim()) await run(['shell', 'cp', '-r', filePath(file), `${path}/${name.trim()}`]).then(() => refreshFiles());
  };

  const deleteSelectedFiles = async () => {
    if (!selectedFileEntries.length) return;
    const accepted = await confirm(
      `Se eliminarán permanentemente ${selectedFileEntries.length} elemento(s) del dispositivo.\n\nEsta acción no se puede deshacer.`,
      { title: 'Confirmar eliminación', kind: 'warning', okLabel: 'Eliminar', cancelLabel: 'Cancelar' },
    );
    if (!accepted) return;
    for (const file of selectedFileEntries) await run(['shell', 'rm', '-rf', filePath(file)]);
    await refreshFiles();
  };

  const changeSelectedPermissions = async () => {
    if (!selectedFileEntries.length) return;
    const mode = window.prompt('Permisos octales, por ejemplo 755 o 644', '755');
    if (!mode?.match(/^[0-7]{3,4}$/)) return;
    for (const file of selectedFileEntries) await run(['shell', 'chmod', mode, filePath(file)]);
    await refreshFiles();
  };

  useEffect(() => {
    if (tab !== 'files' || fileView !== 'grid' || !serial) return;
    filteredFiles.filter(file => !file.is_directory && !file.is_link && file.size <= 5 * 1024 * 1024 && /\.(png|jpe?g|webp|gif)$/i.test(file.name) && !fileThumbnails[filePath(file)]).slice(0, 12).forEach(file => {
      const remotePath = filePath(file);
      invoke<string>('get_file_thumbnail', { serial, path: remotePath }).then(value => setFileThumbnails(current => ({ ...current, [remotePath]: value }))).catch(() => undefined);
    });
  }, [tab, fileView, serial, path, filteredFiles]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setJavaPath(value.java.path);
      setToolUpdatesChecking(true);
      const updated = await invoke<ToolsStatus>('check_tool_updates');
      setTools(updated);
    } catch (error) { setStatus(String(error)); }
    finally { setToolUpdatesChecking(false); }
  };

  const saveToolPath = async (tool: 'adb' | 'scrcpy' | 'java', pathValue: string) => {
    setBusy(true);
    try {
      const value = await invoke<ToolsStatus>('set_tool_path', { tool, path: pathValue });
      setTools(value);
      setAdbPath(value.adb.path);
      setScrcpyPath(value.scrcpy.path);
      setJavaPath(value.java.path);
      setStatus(`Ruta de ${tool} guardada`);
      if (tool === 'adb') await refreshDevices();
      await refreshTools();
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
      setJavaPath(value.java.path);
      setStatus(`${tool} instalado o actualizado correctamente`);
      if (tool === 'adb') await refreshDevices();
      await refreshTools();
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (tab === 'apps') refreshApps();
    if (tab === 'files') refreshFiles();
    if (tab === 'settings') {
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
    if (tab === 'system') refreshSystemState();
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
        <div className="control-card-title"><div><span className="control-kicker">DISPOSITIVO</span><h3>Brillo y volumen</h3></div></div>
        <label className="control-slider">
          <span><b>Brillo</b><strong>{controlBrightness} / 255</strong></span>
          <input type="range" min="0" max="255" value={controlBrightness} onChange={event => setControlBrightness(Number(event.target.value))} onMouseUp={event => run(['shell', 'settings', 'put', 'system', 'screen_brightness', event.currentTarget.value])} />
        </label>
        <label className="control-slider">
          <span><b>Volumen multimedia</b><strong>{controlVolume} / {controlVolumeMax}</strong></span>
          <input type="range" min="0" max={controlVolumeMax} value={controlVolume} onChange={event => setControlVolume(Number(event.target.value))} onPointerUp={event => applyMediaVolume(Number(event.currentTarget.value))} onKeyUp={event => applyMediaVolume(Number(event.currentTarget.value))} />
        </label>
      </section>

      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">PANTALLA</span><h3>Rotación</h3></div><label className="control-toggle"><span>Automática</span><input type="checkbox" checked={rotationAuto} onChange={async event => { setRotationAuto(event.target.checked); await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', event.target.checked ? '1' : '0']); }} /></label></div>
        <div className="rotation-grid">
          {[['stay_current_portrait', 'Vertical', 0], ['stay_current_landscape', 'Horizontal', 1], ['stay_current_portrait', 'Vertical inversa', 2], ['stay_current_landscape', 'Horizontal inversa', 3]].map(([icon, label, value]) => <button key={String(value)} className={!rotationAuto && rotation === value ? 'active' : ''} onClick={() => setDeviceRotation(Number(value))}><b className={`rotation-icon rotation-${value}`}><MaterialIcon name={String(icon)} /></b><span>{label}</span></button>)}
        </div>
      </section>

      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">AUDIO</span><h3>Modo de sonido</h3></div></div>
        <div className="sound-grid">
          <button className={soundMode === 'NORMAL' ? 'active' : ''} onClick={() => setDeviceSoundMode('NORMAL')}><b><MaterialIcon name="volume_up" filled /></b><span>Sonido</span></button>
          <button className={soundMode === 'VIBRATE' ? 'active' : ''} onClick={() => setDeviceSoundMode('VIBRATE')}><b><MaterialIcon name="vibration" filled /></b><span>Vibración</span></button>
          <button className={soundMode === 'SILENT' ? 'active' : ''} onClick={() => setDeviceSoundMode('SILENT')}><b><MaterialIcon name="volume_off" filled /></b><span>Silencio</span></button>
        </div>
      </section>

      <section className="control-card">
        <div className="control-card-title"><div><span className="control-kicker">ENTRADA</span><h3>Introducir texto</h3></div></div>
        <form className="control-text-form" onSubmit={event => { event.preventDefault(); run(['shell', 'input', 'text', String(new FormData(event.currentTarget).get('text')).replace(/ /g, '%s')]); }}><input name="text" placeholder="Texto a enviar (espacios incluidos)" /><button className="primary">Enviar texto</button></form>
        <details className="control-advanced"><summary>Entrada avanzada</summary><form className="control-text-form" onSubmit={event => { event.preventDefault(); run(['shell', 'input', ...words(String(new FormData(event.currentTarget).get('args')))]); }}><input name="args" placeholder="tap 500 800 / swipe 100 500 900 500 300" /><button>Ejecutar</button></form></details>
      </section>
    </div>

    <aside className="remote-panel">
      <div className="remote-heading"><div><span className="control-kicker">ACCIONES RÁPIDAS</span><h3>Mando Android TV</h3></div><button className="remote-power" title="Encender o apagar" onClick={() => sendKey('KEYCODE_POWER')}><MaterialIcon name="power_settings_new" /></button></div>
      <div className="remote-body">
        <div className="remote-dpad" aria-label="Control direccional">
          <button className="remote-up" title="Arriba" onClick={() => sendKey('KEYCODE_DPAD_UP')}><MaterialIcon name="keyboard_arrow_up" /></button>
          <button className="remote-left" title="Izquierda" onClick={() => sendKey('KEYCODE_DPAD_LEFT')}><MaterialIcon name="keyboard_arrow_left" /></button>
          <button className="remote-ok" onClick={() => sendKey('KEYCODE_DPAD_CENTER')}><span>OK</span></button>
          <button className="remote-right" title="Derecha" onClick={() => sendKey('KEYCODE_DPAD_RIGHT')}><MaterialIcon name="keyboard_arrow_right" /></button>
          <button className="remote-down" title="Abajo" onClick={() => sendKey('KEYCODE_DPAD_DOWN')}><MaterialIcon name="keyboard_arrow_down" /></button>
        </div>

        <div className="remote-main-actions">
          <button onClick={() => sendKey('KEYCODE_BACK')}><b><MaterialIcon name="arrow_back" /></b><span>Volver</span></button>
          <button onClick={() => sendKey('KEYCODE_HOME')}><b><MaterialIcon name="home" /></b><span>Inicio</span></button>
          <button className="assistant" onClick={() => sendKey('KEYCODE_ASSIST')}><b><MaterialIcon name="assistant" filled /></b><span>Asistente</span></button>
        </div>
        <div className="remote-volume">
          <button className="remote-mute" onClick={() => sendKey('KEYCODE_VOLUME_MUTE')}><b><MaterialIcon name="volume_off" /></b><span>Silenciar</span></button>
          <div className="remote-volume-pill"><button title="Bajar volumen" onClick={() => applyMediaVolume(controlVolume - 1)}><MaterialIcon name="remove" /></button><span>{controlVolume}<small>VOL</small></span><button title="Subir volumen" onClick={() => applyMediaVolume(controlVolume + 1)}><MaterialIcon name="add" /></button></div>
        </div>
        <div className="remote-media">
          <button onClick={() => sendKey('KEYCODE_APP_SWITCH')}><b><MaterialIcon name="recent_actors" /></b><span>Recientes</span></button>
          <button onClick={() => sendKey('KEYCODE_MENU')}><b><MaterialIcon name="menu" /></b><span>Menú</span></button>
          <button onClick={() => sendKey('KEYCODE_MEDIA_PREVIOUS')}><b><MaterialIcon name="skip_previous" /></b><span>Anterior</span></button>
          <button onClick={() => sendKey('KEYCODE_MEDIA_PLAY_PAUSE')}><b><MaterialIcon name="play_pause" /></b><span>Play / Pausa</span></button>
          <button onClick={() => sendKey('KEYCODE_MEDIA_NEXT')}><b><MaterialIcon name="skip_next" /></b><span>Siguiente</span></button>
          <button onClick={() => sendKey('KEYCODE_INFO')}><b><MaterialIcon name="info" /></b><span>Info</span></button>
          <button onClick={() => sendKey('KEYCODE_GUIDE')}><b><MaterialIcon name="live_tv" /></b><span>Guía</span></button>
          <button onClick={() => sendKey('KEYCODE_CHANNEL_DOWN')}><b><MaterialIcon name="keyboard_arrow_down" /></b><span>Canal -</span></button>
          <button onClick={() => sendKey('KEYCODE_CHANNEL_UP')}><b><MaterialIcon name="keyboard_arrow_up" /></b><span>Canal +</span></button>
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
      const destination = await save({
        title: 'Guardar APK',
        defaultPath: `${appDetails.package_name}.apk`,
        filters: [{ name: 'Paquete Android', extensions: ['apk'] }],
      });
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

  const performDestructiveAppAction = async () => {
    if (!destructiveAction || !selectedPackage) return;
    setDestructiveBusy(true);
    try {
      if (destructiveAction === 'uninstall') {
        await run(['uninstall', selectedPackage], 'Aplicación desinstalada');
        setSelectedPackage('');
        setAppDetails(null);
        await refreshApps();
      } else {
        await run(['shell', 'pm', 'clear', selectedPackage], 'Datos de la aplicación eliminados');
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

  const selectFileEntry = (event: MouseEvent, file: FileEntry) => {
    setSelectedFiles(current => event.ctrlKey || event.metaKey
      ? current.includes(file.name) ? current.filter(name => name !== file.name) : [...current, file.name]
      : [file.name]);
  };
  const fileType = (file: FileEntry) => file.is_link ? 'Enlace simbólico' : file.is_directory ? 'Carpeta' : 'Archivo';
  const fileSize = (file: FileEntry) => file.is_directory || file.is_link ? '-' : formatBytes(file.size);
  const fileIcon = (file: FileEntry) => file.is_link ? 'shortcut' : file.is_directory ? 'folder' : 'draft';
  const pathParts = path.split('/').filter(Boolean);
  const changeFileSort = (key: FileSortKey) => setFileSort(current => current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' });
  const sortIcon = (key: FileSortKey) => fileSort.key === key ? (fileSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';

  const filesPage = <div className="file-explorer">
    <section className="file-material-toolbar">
      <div className="file-navigation">
        <md-icon-button aria-label="Atrás" title="Atrás" disabled={fileHistoryIndex <= 0 || undefined} onClick={() => goFileHistory(fileHistoryIndex - 1)}><MaterialIcon name="arrow_back" /></md-icon-button>
        <md-icon-button aria-label="Adelante" title="Adelante" disabled={fileHistoryIndex >= fileHistory.length - 1 || undefined} onClick={() => goFileHistory(fileHistoryIndex + 1)}><MaterialIcon name="arrow_forward" /></md-icon-button>
        <md-icon-button aria-label="Subir" title="Subir" disabled={path === '/' || undefined} onClick={() => refreshFiles(path.substring(0, path.lastIndexOf('/')) || '/', true)}><MaterialIcon name="arrow_upward" /></md-icon-button>
        <md-icon-button aria-label="Recargar" title="Recargar" disabled={busy || undefined} onClick={() => refreshFiles()}><MaterialIcon name="refresh" /></md-icon-button>
      </div>
      <div className={`file-address ${filePathEditing ? 'editing' : ''}`} onClick={() => setFilePathEditing(true)}>
        {filePathEditing
          ? <md-outlined-text-field autoFocus value={path} aria-label="Ruta" onFocus={(event: any) => event.currentTarget.select()} onBlur={() => setFilePathEditing(false)} onInput={(event: any) => setPath(event.currentTarget.value)} onKeyDown={(event: any) => { if (event.key === 'Enter') { refreshFiles(path, true); setFilePathEditing(false); } if (event.key === 'Escape') setFilePathEditing(false); }} />
          : <nav className="file-breadcrumbs"><MaterialIcon name="smartphone" /><button onClick={event => { event.stopPropagation(); refreshFiles('/', true); }}>Raíz</button>{pathParts.map((part, index) => <span key={`${part}-${index}`}><MaterialIcon name="chevron_right" /><button onClick={event => { event.stopPropagation(); refreshFiles(`/${pathParts.slice(0, index + 1).join('/')}`, true); }}>{part}</button></span>)}</nav>}
      </div>
      <md-outlined-text-field className="file-filter" value={fileFilter} label="Buscar" type="search" onInput={(event: any) => setFileFilter(event.currentTarget.value)}><MaterialIcon slot="leading-icon" name="search" /></md-outlined-text-field>
      <div className="file-view-switch">
        <md-icon-button className={fileView === 'list' ? 'active' : ''} aria-label="Vista en lista" title="Vista en lista" onClick={() => setFileView('list')}><MaterialIcon name="view_list" /></md-icon-button>
        <md-icon-button className={fileView === 'grid' ? 'active' : ''} aria-label="Vista en cuadrícula" title="Vista en cuadrícula" onClick={() => setFileView('grid')}><MaterialIcon name="grid_view" /></md-icon-button>
      </div>
    </section>
    <section className="file-command-bar">
      <div className="file-primary-actions">
        <md-filled-tonal-button onClick={createDeviceFolder}><MaterialIcon slot="icon" name="create_new_folder" />Nueva carpeta</md-filled-tonal-button>
        <md-filled-button onClick={uploadFiles}><MaterialIcon slot="icon" name="upload" />Enviar</md-filled-button>
        <md-filled-tonal-button disabled={!selectedFileEntries.length || undefined} onClick={downloadSelectedFiles}><MaterialIcon slot="icon" name="download" />Descargar</md-filled-tonal-button>
      </div>
      <div className="file-selection-actions">
        <span>{selectedFileEntries.length ? `${selectedFileEntries.length} seleccionados` : 'Selecciona archivos para ver acciones'}</span>
        <md-icon-button aria-label="Renombrar" title="Renombrar" disabled={selectedFileEntries.length !== 1 || undefined} onClick={renameSelectedFile}><MaterialIcon name="edit" /></md-icon-button>
        <md-icon-button aria-label="Duplicar" title="Duplicar" disabled={selectedFileEntries.length !== 1 || undefined} onClick={duplicateSelectedFile}><MaterialIcon name="content_copy" /></md-icon-button>
        <md-icon-button aria-label="Permisos" title="Permisos" disabled={!selectedFileEntries.length || undefined} onClick={changeSelectedPermissions}><MaterialIcon name="admin_panel_settings" /></md-icon-button>
        <md-icon-button className="danger" aria-label="Eliminar" title="Eliminar" disabled={!selectedFileEntries.length || undefined} onClick={deleteSelectedFiles}><MaterialIcon name="delete" /></md-icon-button>
      </div>
    </section>
    <section className={`file-browser ${fileView}`}>
      {fileView === 'list' && <div className="file-list-table">
        <div className="file-list-header">{([['name', 'Nombre'], ['type', 'Tipo'], ['size', 'Tamaño'], ['permissions', 'Permisos'], ['modified', 'Modificado']] as [FileSortKey, string][]).map(([key, label]) => <button className={fileSort.key === key ? 'active' : ''} key={key} onClick={() => changeFileSort(key)}>{label}<MaterialIcon name={sortIcon(key)} /></button>)}</div>
        {filteredFiles.map(file => <button className={`file-list-row ${selectedFiles.includes(file.name) ? 'selected' : ''}`} key={file.name} onClick={event => selectFileEntry(event, file)} onDoubleClick={() => openFileEntry(file)}>
          <span className={`file-name-cell ${file.is_link ? 'symbolic' : ''}`}><b><MaterialIcon name={fileIcon(file)} /></b><span><strong>{file.name}{file.is_link && <small title={file.link_target}> → {file.link_target}</small>}</strong></span></span>
          <span>{fileType(file)}</span><span>{fileSize(file)}</span><code>{file.permissions}</code><span>{file.modified}</span>
          <md-ripple />
        </button>)}
      </div>}
      {fileView === 'grid' && <div className="file-grid-view">
        {filteredFiles.map(file => <button className={`file-grid-card ${selectedFiles.includes(file.name) ? 'selected' : ''}`} key={file.name} onClick={event => selectFileEntry(event, file)} onDoubleClick={() => openFileEntry(file)}>
          {file.is_link ? <span className="file-grid-symbolic"><MaterialIcon name="shortcut" /><strong>{file.name}</strong><small title={file.link_target}> → {file.link_target}</small></span> : <span className="file-grid-preview">{fileThumbnails[filePath(file)] ? <img src={fileThumbnails[filePath(file)]} alt="" /> : <MaterialIcon name={fileIcon(file)} />}</span>}
          {!file.is_link && <strong title={file.name}>{file.name}</strong>}
          <span>{fileType(file)} · {fileSize(file)}</span>
          <code>{file.permissions}</code>
          <md-ripple />
        </button>)}
      </div>}
      {!filteredFiles.length && <div className="file-empty"><MaterialIcon name="folder_off" /><b>Carpeta vacía</b><span>No hay elementos que coincidan con el filtro.</span></div>}
    </section>
    <footer className="file-status-bar"><span><MaterialIcon name="folder" />{filteredFiles.length} elementos</span><span><MaterialIcon name="check_circle" />{selectedFileEntries.length ? `${selectedFileEntries.length} seleccionados` : 'Sin selección'}</span></footer>
  </div>;

  const materialSystem = <SystemView
    connected={Boolean(serial)}
    state={systemState}
    loading={systemLoading}
    selectedUser={selectedSystemUser}
    newUser={newSystemUser}
    selectedKeyboard={selectedKeyboard}
    onSelectedUserChange={setSelectedSystemUser}
    onNewUserChange={setNewSystemUser}
    onSelectedKeyboardChange={setSelectedKeyboard}
    onCreateUser={createSystemUser}
    onRemoveUser={removeSystemUser}
    onSwitchUser={() => applySystemAction(['shell', 'am', 'switch-user', selectedSystemUser], `Cambiado al usuario ${selectedSystemUser}`)}
    onToggleAppLanguages={() => applySystemAction(['shell', 'settings', 'put', 'global', 'settings_app_locale_opt_in_enabled', systemState?.app_languages_enabled ? 'true' : 'false'], 'Lista de idiomas por aplicación actualizada')}
    onToggleGestures={() => applySystemAction(['shell', 'cmd', 'overlay', systemState?.gestural_navigation ? 'disable' : 'enable', 'com.android.internal.systemui.navbar.gestural'], 'Navegación del sistema actualizada')}
    onToggleKeyboard={keyboard => applySystemAction(['shell', 'ime', keyboard.enabled ? 'disable' : 'enable', keyboard.id], keyboard.enabled ? 'Teclado deshabilitado' : 'Teclado habilitado')}
    onSetDefaultKeyboard={async keyboard => { await applySystemAction(['shell', 'ime', 'enable', keyboard.id], 'Teclado habilitado'); await applySystemAction(['shell', 'settings', 'put', 'secure', 'default_input_method', keyboard.id], 'Teclado predeterminado actualizado'); }}
    onRefresh={refreshSystemState}
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

  const settings = <SettingsView theme={theme} language={language} tools={tools} checkingUpdates={toolUpdatesChecking} adbPath={adbPath} scrcpyPath={scrcpyPath} javaPath={javaPath} onThemeChange={setTheme} onLanguageChange={setLanguage} onAdbPathChange={setAdbPath} onScrcpyPathChange={setScrcpyPath} onJavaPathChange={setJavaPath} onSaveToolPath={saveToolPath} onInstallTool={installTool} onClearCache={clearApplicationCache} />;

  const pages: Record<WorkTab, ReactNode> = {
    display,
    mirroring,
    control,
    apps: materialAppsPage,
    files: filesPage,
    system: materialSystem,
    settings,
  };
  return <WorkbenchShell title={t(`nav.${tab}`)} busy={busy} status={status}>{pages[tab]}</WorkbenchShell>;
}
