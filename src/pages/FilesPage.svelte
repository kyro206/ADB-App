<script lang="ts" module>
import * as m from '../paraglide/messages';

  export interface FilesPageProps {
    serial: string;
    setStatus: (status: string) => void;
    setBusy: (busy: boolean) => void;
    run: (args: string[], success?: string) => Promise<any>;
    tab: string;
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { stat } from '@tauri-apps/plugin-fs';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import PromptDialog from '../components/dialogs/PromptDialog.svelte';
  import PermissionsDialog from '../components/dialogs/PermissionsDialog.svelte';
  import ConfirmDialog from '../components/dialogs/ConfirmDialog.svelte';
  import ContextMenu from '../components/layout/ContextMenu.svelte';
  
  import { formatBytes } from './workbench/utils';
  import type { FileEntry, FileSortKey, FileView } from './workbench/types';
  import TransferMenu from '../components/layout/TransferMenu.svelte';
  import type { TransferJob, TransferStatus, TransferType } from '../components/layout/TransferMenu.svelte';
  import './FilesPage.css';

  let props: FilesPageProps = $props();

  let path = $state('/sdcard');
  let files = $state.raw<FileEntry[]>([]);
  let fileView = $state<FileView>('list');
  let fileFilter = $state('');
  let filePathEditing = $state(false);
  let fileSort = $state<{ key: FileSortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  let selectedFiles = $state<string[]>([]);
  let lastSelectedIndex = $state<number | null>(null);
  let keyboardFocusIndex = $state<number | null>(null);
  let fileHistory = $state<string[]>(['/sdcard']);
  let fileHistoryIndex = $state(0);
  let fileThumbnails = $state<Record<string, string>>({});
  
  let promptConfig = $state<{ open: boolean; title: string; initialValue: string; onConfirm: (val: string) => void; onCancel: () => void } | null>(null);
  let permissionsConfig = $state<{ open: boolean; title: string; initialMode: string; onConfirm: (val: string) => void; onCancel: () => void } | null>(null);
  let confirmConfig = $state<{ open: boolean; title: string; message: string; isDanger: boolean; confirmText: string; onConfirm: () => void; onCancel: () => void } | null>(null);
  let contextMenu = $state<{ x: number; y: number; file: FileEntry } | null>(null);
  
  let osDragHover = $state(false);
  let thumbnailRefresh = $state(0);
  let transfersOpen = $state(false);
  let transferJobs = $state<TransferJob[]>([]);
  let pendingThumbnails = new Set<string>();
  
  let audioPlayer: HTMLAudioElement | undefined = $state();
  let audioPlayingPath = $state<string | null>(null);
  let audioIsPlaying = $state(false);
  let audioLoading = $state(false);
  let audioUrl = $state<string | null>(null);
  let audioProgress = $state(0);

  async function toggleAudioPlay(event: Event, file: FileEntry) {
    event.stopPropagation();
    const remotePath = filePath(file);
    
    if (audioPlayingPath === remotePath) {
      if (audioIsPlaying) audioPlayer?.pause();
      else audioPlayer?.play();
      return;
    }
    
    audioLoading = true;
    audioProgress = 0;
    audioPlayingPath = remotePath;
    try {
      const bytes = await invoke<Uint8Array>('read_file_bytes', { serial: props.serial, path: remotePath });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mpeg' });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(blob);
      
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: file.name,
        });
        navigator.mediaSession.setActionHandler('play', () => audioPlayer?.play());
        navigator.mediaSession.setActionHandler('pause', () => audioPlayer?.pause());
      }
      
      // Wait for Svelte to update the audio element's src
      setTimeout(() => {
        if (audioPlayer) {
          audioPlayer.play().catch(console.error);
        }
      }, 50);
    } catch (e) {
      console.error(e);
      audioPlayingPath = null;
    } finally {
      audioLoading = false;
    }
  }

  function onAudioPlay() { audioIsPlaying = true; }
  function onAudioPause() { audioIsPlaying = false; }
  function onAudioEnded() { 
    audioIsPlaying = false;
    audioPlayingPath = null;
  }

  onDestroy(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  });



  async function asyncPrompt(title: string, initialValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      promptConfig = {
        open: true,
        title,
        initialValue,
        onConfirm: (val) => {
          promptConfig = null;
          resolve(val);
        },
        onCancel: () => {
          promptConfig = null;
          resolve(null);
        }
      };
    });
  }

  async function asyncPermissions(title: string, initialMode: string = '755'): Promise<string | null> {
    return new Promise((resolve) => {
      permissionsConfig = {
        open: true,
        title,
        initialMode,
        onConfirm: (val) => {
          permissionsConfig = null;
          resolve(val);
        },
        onCancel: () => {
          permissionsConfig = null;
          resolve(null);
        }
      };
    });
  }

  async function asyncConfirm(title: string, message: string, confirmText: string, isDanger: boolean = false): Promise<boolean> {
    return new Promise((resolve) => {
      confirmConfig = {
        open: true,
        title,
        message,
        confirmText,
        isDanger,
        onConfirm: () => {
          confirmConfig = null;
          resolve(true);
        },
        onCancel: () => {
          confirmConfig = null;
          resolve(false);
        }
      };
    });
  }

  function normalizeDevicePath(value: string) {
    const parts: string[] = [];
    for (const part of value.replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop(); else parts.push(part);
    }
    return `/${parts.join('/')}`;
  }

  const filePath = (file: FileEntry) => normalizeDevicePath(`${path}/${file.name}`);
  const linkPath = (file: FileEntry) => normalizeDevicePath(file.link_target.startsWith('/') ? file.link_target : `${path}/${file.link_target}`);

  let filteredFiles = $derived.by(() => {
    const query = fileFilter.trim().toLowerCase();
    const matching = files.filter(file => !query || file.name.toLowerCase().includes(query) || file.link_target.toLowerCase().includes(query));
    const direction = fileSort.direction === 'asc' ? 1 : -1;
    
    return [...matching].sort((left, right) => {
      if (left.is_directory !== right.is_directory) {
        return left.is_directory ? -1 : 1;
      }
      const leftValue = fileSort.key === 'type' ? (left.is_link ? 'link' : left.is_directory ? 'directory' : 'file') : left[fileSort.key];
      const rightValue = fileSort.key === 'type' ? (right.is_link ? 'link' : right.is_directory ? 'directory' : 'file') : right[fileSort.key];
      return (typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'es', { numeric: true, sensitivity: 'base' })) * direction;
    });
  });

  let selectedFileEntries = $derived.by(() => {
    if (!selectedFiles.length) return [];
    const set = new Set(selectedFiles);
    return files.filter(file => set.has(file.name));
  });

  async function refreshFiles(nextPath = path, addHistory = false) {
    if (!props.serial) return;
    props.busy = true;
    try {
      const normalized = normalizeDevicePath(nextPath);
      const value = await invoke<FileEntry[]>('list_directory', { serial: props.serial, path: normalized });
      files = value;
      path = normalized;
      selectedFiles = [];
      lastSelectedIndex = null;
      props.status = '';
      if (addHistory && normalized !== fileHistory[fileHistoryIndex]) {
        fileHistory = [...fileHistory.slice(0, fileHistoryIndex + 1), normalized];
        fileHistoryIndex++;
      }
    } catch (error) { 
      props.status = String(error); 
    } finally { 
      props.busy = false; 
    }
  }

  async function openFileEntry(file: FileEntry) {
    if (file.is_directory) return refreshFiles(filePath(file), true);
    if (file.is_link) return refreshFiles(linkPath(file), true);
  }

  async function goFileHistory(index: number) {
    if (index < 0 || index >= fileHistory.length) return;
    await refreshFiles(fileHistory[index]);
    fileHistoryIndex = index;
  }

  function enqueueTransfer(type: TransferType, source: string, destination: string, name: string, isDirectory: boolean) {
    const id = Date.now().toString() + Math.random().toString();
    transferJobs = [...transferJobs, { id, type, name, source, destination, isDirectory, status: 'idle' }];
  }

  $effect(() => {
    const activeJob = transferJobs.find(j => j.status === 'transferring');
    if (activeJob) return;

    const nextJob = transferJobs.find(j => j.status === 'idle');
    if (!nextJob) return;

    const processJob = async (job: TransferJob) => {
      transferJobs = transferJobs.map(j => j.id === job.id ? { ...j, status: 'transferring', error: undefined, children: undefined } : j);
      try {
        if (job.type === 'upload') {
          await invoke<string>('run_device_action', { serial: props.serial, args: ['push', job.source, job.destination] });
          if (path === job.destination) refreshFiles(path);
        } else {
          await invoke<string>('pull_file', { serial: props.serial, remotePath: job.source, localPath: job.destination });
        }
        transferJobs = transferJobs.map(j => j.id === job.id ? { ...j, status: 'success' } : j);
      } catch (error: any) {
        let errStr = String(error);
        const children: TransferJob[] = [];
        const regex = /adb: error: failed to copy '([^']+)' to '([^']+)': ([^\n]+)/g;
        let match;
        while ((match = regex.exec(errStr)) !== null) {
          const src = match[1];
          const dest = match[2];
          const reason = match[3];
          const name = src.split(/[\\/]/).pop() || src;
          children.push({
            id: Date.now().toString() + Math.random().toString(),
            type: job.type,
            name,
            source: src,
            destination: dest,
            isDirectory: false,
            status: 'error',
            error: reason
          });
        }
        if (children.length === 0) {
           errStr = errStr.replace(/adb: error: /, '').trim();
        }
        transferJobs = transferJobs.map(j => j.id === job.id ? { 
          ...j, 
          status: 'error', 
          error: children.length > 0 ? m.transfers_error() : errStr,
          children: children.length > 0 ? children : undefined
        } : j);
      }
    };
    
    processJob(nextJob);
  });

  $effect(() => {
    const hasError = transferJobs.some(j => j.status === 'error' || j.children?.some(c => c.status === 'error'));
    const isTransferring = transferJobs.some(j => j.status === 'transferring' || j.status === 'idle');
    window.dispatchEvent(new CustomEvent('transfer-badge-update', { detail: { hasError, isTransferring } }));
  });

  function handleRetryTransfer(id: string, parentId?: string) {
    if (parentId) {
      transferJobs = transferJobs.map(j => {
        if (j.id !== parentId || !j.children) return j;
        const child = j.children.find(c => c.id === id);
        if (!child) return j;
        const updatedParent = { ...j, children: j.children.filter(c => c.id !== id) };
        const newJob = { ...child, status: 'idle' as TransferStatus, error: undefined };
        // This is a bit tricky, we push the new job and return the updated parent
        // Svelte reactivity handles the mutation differently so we just do it via setTimeout
        setTimeout(() => {
           transferJobs = [...transferJobs, newJob];
        }, 0);
        return updatedParent;
      });
    } else {
      transferJobs = transferJobs.map(j => j.id === id ? { ...j, status: 'idle', error: undefined } : j);
    }
  }

  async function uploadLocalPaths(paths: string[]) {
    if (!paths.length) return;
    for (const localPath of paths) {
      let isDirectory = false;
      try {
        const metadata = await stat(localPath);
        isDirectory = metadata.isDirectory;
      } catch (e) {
        console.error(e);
      }
      const name = localPath.split(/[\\/]/).pop() || localPath;
      enqueueTransfer('upload', localPath, path, name, isDirectory);
    }
    if (!transfersOpen) transfersOpen = true;
  }

  async function uploadFiles() {
    const selected = await open({ multiple: true, directory: false });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    await uploadLocalPaths(paths);
  }

  async function downloadSelectedFiles() {
    if (!selectedFileEntries.length) return;
    const destination = await open({ directory: true, multiple: false });
    if (!destination || Array.isArray(destination)) return;
    
    for (const file of selectedFileEntries) {
      const localPath = `${destination}\\${file.name}`;
      enqueueTransfer('download', filePath(file), localPath, file.name, file.is_directory);
    }
    if (!transfersOpen) transfersOpen = true;
  }

  function escapeAdbPath(p: string) {
    return `'${p.replace(/'/g, "'\\''")}'`;
  }

  async function createDeviceFolder() {
    const defaultName = m.files_prompt_defaultNewFolder();
    const name = await asyncPrompt(m.files_prompt_newFolder(), defaultName);
    if (name?.trim() && name !== defaultName) await props.run(['shell', 'mkdir', '-p', escapeAdbPath(`${path}/${name.trim()}`)]).then(() => refreshFiles());
    else if (name?.trim() === defaultName) await props.run(['shell', 'mkdir', '-p', escapeAdbPath(`${path}/${name.trim()}`)]).then(() => refreshFiles());
  }

  async function renameSelectedFile() {
    const file = selectedFileEntries[0];
    if (!file) return;
    const name = await asyncPrompt(m.files_prompt_rename(), file.name);
    if (name?.trim() && name !== file.name) await props.run(['shell', 'mv', escapeAdbPath(filePath(file)), escapeAdbPath(`${path}/${name.trim()}`)]).then(() => refreshFiles());
  }

  async function duplicateSelectedFile() {
    const file = selectedFileEntries[0];
    if (!file) return;
    const extensionIndex = file.is_directory ? -1 : file.name.lastIndexOf('.');
    const suggestedName = extensionIndex > 0
      ? `${file.name.slice(0, extensionIndex)}${m.files_prompt_copySuffix()}${file.name.slice(extensionIndex)}`
      : `${file.name}${m.files_prompt_copySuffix()}`;
    const name = await asyncPrompt(m.files_prompt_copyName(), suggestedName);
    if (name?.trim()) await props.run(['shell', 'cp', '-r', escapeAdbPath(filePath(file)), escapeAdbPath(`${path}/${name.trim()}`)]).then(() => refreshFiles());
  }

  async function deleteSelectedFiles() {
    if (!selectedFileEntries.length) return;
    const accepted = await asyncConfirm(
      m.files_confirm_deleteTitle(),
      m.files_confirm_deleteDesc({ count: selectedFileEntries.length }),
      m.common_delete(),
      true
    );
    if (!accepted) return;
    
    for (const file of selectedFileEntries) await props.run(['shell', 'rm', '-rf', escapeAdbPath(filePath(file))]);
    await refreshFiles();
  }

  async function changeSelectedPermissions() {
    if (!selectedFileEntries.length) return;
    
    let initialMode = '755';
    if (selectedFileEntries.length === 1) {
      const p = selectedFileEntries[0].permissions;
      if (p && p.length >= 10) {
        let owner = 0, group = 0, others = 0;
        if (p[1] === 'r') owner += 4;
        if (p[2] === 'w') owner += 2;
        if (p[3] === 'x' || p[3] === 's') owner += 1;
        
        if (p[4] === 'r') group += 4;
        if (p[5] === 'w') group += 2;
        if (p[6] === 'x' || p[6] === 's') group += 1;
        
        if (p[7] === 'r') others += 4;
        if (p[8] === 'w') others += 2;
        if (p[9] === 'x' || p[9] === 't') others += 1;
        
        initialMode = `${owner}${group}${others}`;
      }
    }

    const mode = await asyncPermissions(m.files_action_permissions(), initialMode);
    if (!mode?.match(/^[0-7]{3,4}$/)) return;
    for (const file of selectedFileEntries) await props.run(['shell', 'chmod', mode, escapeAdbPath(filePath(file))]);
    await refreshFiles();
  }

  $effect(() => {
    // only runs on serial change because serial is a prop
    refreshFiles();
  });

  $effect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    if (props.tab === 'files') {
      getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'over' || event.payload.type === 'enter') {
          osDragHover = true;
        } else if (event.payload.type === 'leave') {
          osDragHover = false;
        } else if (event.payload.type === 'drop') {
          osDragHover = false;
          const paths = (event.payload as any).paths || [];
          if (paths && paths.length > 0) {
            uploadLocalPaths(paths);
          }
        }
      }).then((fn) => {
        unlisten = fn;
        if (!isMounted) unlisten();
      });
    }

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  });

  $effect(() => {
    if (fileView !== 'grid' || !props.serial) return;
    
    const toRequest = filteredFiles.filter(file => {
      if (file.is_directory || file.is_link || file.size > 5 * 1024 * 1024 || !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) return false;
      const remotePath = filePath(file);
      return fileThumbnails[remotePath] === undefined && !pendingThumbnails.has(remotePath);
    });

    toRequest.slice(0, 12).forEach(file => {
      const remotePath = filePath(file);
      pendingThumbnails.add(remotePath);
      
      invoke<string>('get_file_thumbnail', { serial: props.serial, path: remotePath })
        .then(value => { fileThumbnails = { ...fileThumbnails, [remotePath]: value }; })
        .catch(() => { fileThumbnails = { ...fileThumbnails, [remotePath]: '' }; })
        .finally(() => {
          pendingThumbnails.delete(remotePath);
          thumbnailRefresh++;
        });
    });
  });

  function selectFileEntry(event: MouseEvent, file: FileEntry, index: number) {
    keyboardFocusIndex = index;
    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const range = filteredFiles.slice(start, end + 1).map(f => f.name);
      selectedFiles = event.ctrlKey || event.metaKey ? [...new Set([...selectedFiles, ...range])] : range;
    } else {
      selectedFiles = event.ctrlKey || event.metaKey
        ? selectedFiles.includes(file.name) ? selectedFiles.filter(name => name !== file.name) : [...selectedFiles, file.name]
        : [file.name];
      lastSelectedIndex = index;
    }
  }

  function handleContextMenu(e: MouseEvent, file: FileEntry) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedFiles.includes(file.name)) selectedFiles = [file.name];
    contextMenu = { x: e.clientX, y: e.clientY, file };
  }

  const fileType = (file: FileEntry) => file.is_link ? m.files_type_symlink() : file.is_directory ? m.files_type_folder() : m.files_type_file();
  const fileSize = (file: FileEntry) => file.is_directory || file.is_link ? '-' : formatBytes(file.size);
  const fileIcon = (file: FileEntry) => file.is_link ? 'shortcut' : file.is_directory ? 'folder' : 'draft';
  
  let pathParts = $derived(path.split('/').filter(Boolean));
  
  function changeFileSort(key: FileSortKey) {
    fileSort = fileSort.key === key
      ? { key, direction: fileSort.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' };
  }
  
  const sortIcon = (key: FileSortKey) => fileSort.key === key ? (fileSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
  let currentFolderName = $derived(path === '/' ? 'root' : path.split('/').pop());

  function handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if (e.key === 'Delete') {
      if (selectedFileEntries.length > 0 && !promptConfig && !permissionsConfig && !confirmConfig) {
        deleteSelectedFiles();
      }
    } else if (e.key === 'Enter') {
      if (selectedFileEntries.length === 1 && !promptConfig && !permissionsConfig && !confirmConfig) {
        openFileEntry(selectedFileEntries[0]);
      }
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (filteredFiles.length === 0 || promptConfig || permissionsConfig || confirmConfig) return;
      
      e.preventDefault();
      
      let currentIndex = keyboardFocusIndex !== null ? keyboardFocusIndex : (lastSelectedIndex !== null ? lastSelectedIndex : -1);
      
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        currentIndex = Math.min(currentIndex + 1, filteredFiles.length - 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        currentIndex = Math.max(currentIndex - 1, 0);
      }
      
      keyboardFocusIndex = currentIndex;
      const file = filteredFiles[currentIndex];
      
      if (file) {
        if (e.shiftKey && lastSelectedIndex !== null) {
          const start = Math.min(lastSelectedIndex, currentIndex);
          const end = Math.max(lastSelectedIndex, currentIndex);
          selectedFiles = filteredFiles.slice(start, end + 1).map(f => f.name);
        } else {
          lastSelectedIndex = currentIndex;
          selectedFiles = [file.name];
        }
        
        setTimeout(() => {
          const container = document.querySelector('.file-browser');
          if (!container) return;
          const selector = fileView === 'list' ? '.file-list-row' : '.file-grid-card';
          const elements = container.querySelectorAll(selector);
          if (elements[currentIndex]) {
            (elements[currentIndex] as HTMLElement).focus();
            (elements[currentIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
          }
        }, 10);
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="file-explorer {osDragHover ? 'os-drag-hover' : ''}" onkeydown={handleKeyDown}>
  {#if osDragHover}
    <div class="file-os-drag-overlay">
      <MaterialIcon name="upload_file" />
      <span>{m.files_action_upload()}</span>
    </div>
  {/if}
  <section class="file-material-toolbar">
    <div class="file-navigation">
      <md-icon-button aria-label={m.files_nav_back()} title={m.files_nav_back()} disabled={fileHistoryIndex <= 0 ? true : undefined} onclick={() => goFileHistory(fileHistoryIndex - 1)}>
        <MaterialIcon name="arrow_back" />
      </md-icon-button>
      <md-icon-button aria-label={m.files_nav_forward()} title={m.files_nav_forward()} disabled={fileHistoryIndex >= fileHistory.length - 1 ? true : undefined} onclick={() => goFileHistory(fileHistoryIndex + 1)}>
        <MaterialIcon name="arrow_forward" />
      </md-icon-button>
      <md-icon-button aria-label={m.files_nav_up()} title={m.files_nav_up()} disabled={path === '/' ? true : undefined} onclick={() => refreshFiles(path.substring(0, path.lastIndexOf('/')) || '/', true)}>
        <MaterialIcon name="arrow_upward" />
      </md-icon-button>
      <md-icon-button aria-label={m.files_nav_refresh()} title={m.files_nav_refresh()} onclick={() => refreshFiles()}>
        <MaterialIcon name="refresh" />
      </md-icon-button>
    </div>
    
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="file-address {filePathEditing ? 'editing' : ''}" onclick={() => filePathEditing = true}>
      {#if filePathEditing}
        <!-- svelte-ignore a11y_autofocus -->
        <md-outlined-text-field 
          autofocus 
          value={path} 
          aria-label={m.files_nav_path()} 
          onfocus={(event: any) => event.currentTarget.select()} 
          onblur={() => filePathEditing = false} 
          oninput={(event: any) => path = event.currentTarget.value} 
          onkeydown={(event: any) => { 
            if (event.key === 'Enter') { refreshFiles(path, true); filePathEditing = false; } 
            if (event.key === 'Escape') filePathEditing = false; 
          }} 
        ></md-outlined-text-field>
      {:else}
        <nav class="file-breadcrumbs">
          <MaterialIcon name="smartphone" />
          <button onclick={event => { event.stopPropagation(); refreshFiles('/', true); }}>/</button>
          {#each pathParts as part, index}
            {@const breadcrumbPath = `/${pathParts.slice(0, index + 1).join('/')}`}
            <span>
              <MaterialIcon name="chevron_right" />
              <button onclick={event => { event.stopPropagation(); refreshFiles(breadcrumbPath, true); }}>{part}</button>
            </span>
          {/each}
        </nav>
      {/if}
    </div>
    
    <md-outlined-text-field 
      class="file-search" 
      value={fileFilter} 
      placeholder={m.files_search_placeholder({ folder: currentFolderName || '' })}
      type="search" 
      oninput={(event: any) => fileFilter = event.currentTarget.value}
    >
      <MaterialIcon slot="leading-icon" name="search" />
      {#if fileFilter}
        <md-icon-button slot="trailing-icon" onclick={() => fileFilter = ''}>
          <MaterialIcon name="close" />
        </md-icon-button>
      {/if}
    </md-outlined-text-field>

    <div class="file-view-switch">
      <button class={fileView === 'list' ? 'active' : ''} aria-label={m.files_view_list()} title={m.files_view_list()} onclick={() => fileView = 'list'}>
        <MaterialIcon name="view_list" />
      </button>
      <button class={fileView === 'grid' ? 'active' : ''} aria-label={m.files_view_grid()} title={m.files_view_grid()} onclick={() => fileView = 'grid'}>
        <MaterialIcon name="grid_view" />
      </button>
      <div style="width: 1px; background: var(--md-sys-color-outline-variant); margin: 4px 8px"></div>
      <button class={transfersOpen ? 'active' : ''} onclick={() => transfersOpen = !transfersOpen} title={m.transfers_title()} style="position: relative">
        <MaterialIcon name="swap_vert" />
        {#if transferJobs.some(j => j.status === 'error' || j.children?.some(c => c.status === 'error')) || transferJobs.some(j => j.status === 'transferring' || j.status === 'idle')}
          <span class="transfer-badge {transferJobs.some(j => j.status === 'error' || j.children?.some(c => c.status === 'error')) ? 'error' : ''}"></span>
        {/if}
      </button>
    </div>
  </section>
  
  <section class="file-command-bar">
    <div class="file-primary-actions">
      <md-filled-tonal-button onclick={createDeviceFolder}>
        <MaterialIcon slot="icon" name="create_new_folder" />
        {m.files_action_newFolder()}
      </md-filled-tonal-button>
      <md-filled-button onclick={uploadFiles}>
        <MaterialIcon slot="icon" name="upload" />
        {m.files_action_upload()}
      </md-filled-button>
      <md-filled-tonal-button disabled={selectedFileEntries.length === 0 ? true : undefined} onclick={downloadSelectedFiles}>
        <MaterialIcon slot="icon" name="download" />
        {m.files_action_download()}
      </md-filled-tonal-button>
    </div>
    <div class="file-selection-actions">
      <md-icon-button aria-label={m.files_action_rename()} title={m.files_action_rename()} disabled={selectedFileEntries.length !== 1 ? true : undefined} onclick={renameSelectedFile}>
        <MaterialIcon name="edit" />
      </md-icon-button>
      <md-icon-button aria-label={m.files_action_duplicate()} title={m.files_action_duplicate()} disabled={selectedFileEntries.length !== 1 ? true : undefined} onclick={duplicateSelectedFile}>
        <MaterialIcon name="content_copy" />
      </md-icon-button>
      <md-icon-button aria-label={m.files_action_permissions()} title={m.files_action_permissions()} disabled={selectedFileEntries.length === 0 ? true : undefined} onclick={changeSelectedPermissions}>
        <MaterialIcon name="admin_panel_settings" />
      </md-icon-button>
      <md-icon-button class="danger" aria-label={m.common_delete()} title={`${m.common_delete()} (Supr)`} disabled={selectedFileEntries.length === 0 ? true : undefined} onclick={deleteSelectedFiles}>
        <MaterialIcon name="delete" />
      </md-icon-button>
    </div>
  </section>

  <section class="file-browser {fileView}">
    {#if fileView === 'list'}
      <div class="file-list-table">
        <div class="file-list-header">
          {#each [['name', m.files_sort_name()], ['type', m.files_sort_type()], ['size', m.files_sort_size()], ['permissions', m.files_sort_permissions()], ['modified', m.files_sort_modified()]] as [key, label] (key)}
            <button class={fileSort.key === key ? 'active' : ''} onclick={() => changeFileSort(key as FileSortKey)}>
              {label}
              <MaterialIcon name={sortIcon(key as FileSortKey)} />
            </button>
          {/each}
        </div>
        {#each filteredFiles as file, index (file.name)}
          <button 
            class="file-list-row {selectedFiles.includes(file.name) ? 'selected' : ''}" 
            onclick={event => selectFileEntry(event, file, index)} 
            ondblclick={() => openFileEntry(file)}
            oncontextmenu={e => handleContextMenu(e, file)}
          >
            <span class="file-name-cell {file.is_link ? 'symbolic' : ''}">
              <b style="position: relative;">
                <MaterialIcon name={fileIcon(file)} />
                {#if /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div class="file-audio-play list-mode {audioPlayingPath === filePath(file) && (audioIsPlaying || audioProgress > 0) ? 'playing' : ''}" role="button" tabindex="0" onclick={e => toggleAudioPlay(e, file)}>
                    {#if audioPlayingPath === filePath(file)}
                      {#if audioLoading}
                        <md-circular-progress indeterminate style="--md-circular-progress-size: 36px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
                      {:else}
                        <md-circular-progress value={audioProgress} style="--md-circular-progress-size: 36px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
                      {/if}
                    {/if}
                    <MaterialIcon name={audioPlayingPath === filePath(file) && audioIsPlaying ? 'pause' : 'play_arrow'} />
                  </div>
                {/if}
              </b>
              <span>
                <strong>{file.name}{#if file.is_link}<small title={file.link_target}> → {file.link_target}</small>{/if}</strong>
              </span>
            </span>
            <span>{fileType(file)}</span>
            <span>{fileSize(file)}</span>
            <code>{file.permissions}</code>
            <span>{file.modified}</span>
            <md-ripple></md-ripple>
          </button>
        {/each}
      </div>
    {/if}
    
    {#if fileView === 'grid'}
      <div class="file-grid-view">
        {#each filteredFiles as file, index (file.name)}
          <button 
            class="file-grid-card {selectedFiles.includes(file.name) ? 'selected' : ''}" 
            onclick={event => selectFileEntry(event, file, index)} 
            ondblclick={() => openFileEntry(file)}
            oncontextmenu={e => handleContextMenu(e, file)}
          >
            {#if file.is_link}
              <span class="file-grid-symbolic">
                <MaterialIcon name="shortcut" />
                <strong>{file.name}</strong>
                <small title={file.link_target}> → {file.link_target}</small>
              </span>
            {:else}
              <span class="file-grid-preview">
                {#if fileThumbnails[filePath(file)]}
                  <img src={fileThumbnails[filePath(file)]} alt="" loading="lazy" />
                {:else}
                  <MaterialIcon name={fileIcon(file)} size={48} />
                {/if}
                {#if /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div class="file-audio-play {audioPlayingPath === filePath(file) && (audioIsPlaying || audioProgress > 0) ? 'playing' : ''}" role="button" tabindex="0" onclick={e => toggleAudioPlay(e, file)}>
                    {#if audioPlayingPath === filePath(file)}
                      {#if audioLoading}
                        <md-circular-progress indeterminate style="--md-circular-progress-size: 40px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
                      {:else}
                        <md-circular-progress value={audioProgress} style="--md-circular-progress-size: 40px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
                      {/if}
                    {/if}
                    <MaterialIcon name={audioPlayingPath === filePath(file) && audioIsPlaying ? 'pause' : 'play_arrow'} />
                  </div>
                {/if}
              </span>
            {/if}
            {#if !file.is_link}
              <strong title={file.name}>{file.name}</strong>
            {/if}
            <span>{fileType(file)} · {fileSize(file)}</span>
            <code>{file.permissions}</code>
            <md-ripple></md-ripple>
          </button>
        {/each}
      </div>
    {/if}
    
    {#if !filteredFiles.length}
      <div class="file-empty">
        <MaterialIcon name="folder_off" />
        <b>{m.files_empty_title()}</b>
        <span>{m.files_empty_desc()}</span>
      </div>
    {/if}
    
    <!-- Hidden audio element for streaming -->
    <audio 
      bind:this={audioPlayer} 
      src={audioUrl}
      ontimeupdate={() => { if (audioPlayer && audioPlayer.duration) audioProgress = audioPlayer.currentTime / audioPlayer.duration; }}
      onplay={onAudioPlay} 
      onpause={onAudioPause} 
      onended={onAudioEnded} 
      onerror={onAudioEnded} 
      style="display: none;"
    ></audio>
  </section>
  
  <footer class="file-status-bar">
    <span><MaterialIcon name="folder" />{m.files_status_items({ count: filteredFiles.length })}</span>
    <span><MaterialIcon name="check_circle" />{selectedFileEntries.length ? m.files_status_selected({ count: selectedFileEntries.length }) : m.files_status_noSelection()}</span>
  </footer>
  
  {#if promptConfig}
    <PromptDialog
      open={promptConfig.open}
      title={promptConfig.title}
      initialValue={promptConfig.initialValue}
      onConfirm={promptConfig.onConfirm}
      onCancel={promptConfig.onCancel}
    />
  {/if}
  
  {#if permissionsConfig}
    <PermissionsDialog
      open={permissionsConfig.open}
      title={permissionsConfig.title}
      initialMode={permissionsConfig.initialMode}
      onConfirm={permissionsConfig.onConfirm}
      onCancel={permissionsConfig.onCancel}
    />
  {/if}
  
  {#if confirmConfig}
    <ConfirmDialog
      open={confirmConfig.open}
      title={confirmConfig.title}
      message={confirmConfig.message}
      confirmText={confirmConfig.confirmText}
      isDanger={confirmConfig.isDanger}
      onConfirm={confirmConfig.onConfirm}
      onCancel={confirmConfig.onCancel}
    />
  {/if}

  {#if contextMenu}
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      onClose={() => contextMenu = null}
      items={[
        { icon: 'open_in_new', label: m.files_action_open(), onClick: () => openFileEntry(contextMenu!.file), disabled: !contextMenu.file.is_directory && !contextMenu.file.is_link },
        { icon: 'download', label: m.files_action_download(), onClick: () => setTimeout(downloadSelectedFiles, 10), disabled: contextMenu.file.is_directory },
        { icon: 'edit', label: m.files_action_rename(), onClick: () => setTimeout(renameSelectedFile, 10) },
        { icon: 'content_copy', label: m.files_action_duplicate(), onClick: () => setTimeout(duplicateSelectedFile, 10) },
        { icon: 'admin_panel_settings', label: m.files_action_permissions(), onClick: () => setTimeout(changeSelectedPermissions, 10) },
        { icon: 'delete', label: m.common_delete(), onClick: () => setTimeout(deleteSelectedFiles, 10), danger: true }
      ]}
    />
  {/if}

  <TransferMenu
    open={transfersOpen}
    jobs={transferJobs}
    onClose={() => transfersOpen = false}
    onClear={() => transferJobs = transferJobs.filter(j => j.status !== 'success' && j.status !== 'error')}
    onRetry={handleRetryTransfer}
  />
</div>
