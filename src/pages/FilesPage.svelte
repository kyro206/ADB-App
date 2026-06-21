

<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { stat } from '@tauri-apps/plugin-fs';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import FileActionDialogs from '../components/dialogs/FileActionDialogs.svelte';
  import type { FileConfirmConfig, FilePermissionsConfig, FilePromptConfig } from '../components/dialogs/FileActionDialogs.svelte';
  import ContextMenu from '../components/layout/ContextMenu.svelte';
  import { materialTextFieldValue } from '../actions/materialTextFieldValue';
  
  import { formatBytes, translateError } from './workbench/utils';
  import type { FileEntry, FileSortKey, FileView } from './workbench/types';
  import TransferMenu from '../components/layout/TransferMenu.svelte';
  import type { TransferJob, TransferStatus, TransferType } from '../components/layout/TransferMenu.svelte';
  import * as m from '../paraglide/messages';

  let {
    serial,
    tab,
    status = $bindable(),
    busy = $bindable()
  } = $props<{
    serial: string;
    tab: string;
    status: string;
    busy: boolean;
  }>();

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
  
  let promptConfig = $state<FilePromptConfig | null>(null);
  let permissionsConfig = $state<FilePermissionsConfig | null>(null);
  let confirmConfig = $state<FileConfirmConfig | null>(null);
  let contextMenu = $state<{ x: number; y: number; file: FileEntry } | null>(null);
  
  let osDragHover = $state(false);
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
      const response = await invoke<ArrayBuffer | Uint8Array | number[]>('read_file_bytes', { serial: serial, path: remotePath });
      const data = response instanceof ArrayBuffer ? response : new Uint8Array(response as any);
      const blob = new Blob([data], { type: 'audio/mpeg' });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(blob);
      
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: file.name,
        });
        navigator.mediaSession.setActionHandler('play', () => audioPlayer?.play());
        navigator.mediaSession.setActionHandler('pause', () => audioPlayer?.pause());
      }
      
      await tick();
      audioPlayer?.play().catch(error => {
        status = translateError(error);
      });
    } catch (e) {
      status = translateError(e);
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



  async function asyncPrompt(
    title: string,
    initialValue: string,
    action: (value: string) => Promise<void>
  ): Promise<void> {
    return new Promise((resolve) => {
      promptConfig = {
        open: true,
        title,
        initialValue,
        onConfirm: async (val) => {
          await action(val);
          promptConfig = null;
          resolve();
        },
        onCancel: () => {
          promptConfig = null;
          resolve();
        }
      };
    });
  }

  async function asyncPermissions(
    title: string,
    initialMode: string,
    action: (value: string) => Promise<void>
  ): Promise<void> {
    return new Promise((resolve) => {
      permissionsConfig = {
        open: true,
        title,
        initialMode,
        onConfirm: async (val) => {
          await action(val);
          permissionsConfig = null;
          resolve();
        },
        onCancel: () => {
          permissionsConfig = null;
          resolve();
        }
      };
    });
  }

  async function asyncConfirm(
    title: string,
    message: string,
    confirmText: string,
    action: () => Promise<void>,
    isDanger: boolean = false
  ): Promise<void> {
    return new Promise((resolve) => {
      confirmConfig = {
        open: true,
        title,
        message,
        confirmText,
        isDanger,
        onConfirm: async () => {
          await action();
          confirmConfig = null;
          resolve();
        },
        onCancel: () => {
          confirmConfig = null;
          resolve();
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
    const matching = files.filter(file => !query || (file.name || '').toLowerCase().includes(query) || (file.link_target || '').toLowerCase().includes(query));
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

  let selectedFileSet = $derived(new Set(selectedFiles));

  let selectedFileEntries = $derived.by(() => {
    if (!selectedFiles.length) return [];
    return files.filter(file => selectedFileSet.has(file.name));
  });

  async function refreshFiles(nextPath = path, addHistory = false) {
    if (!serial) return;
    busy = true;
    try {
      const normalized = normalizeDevicePath(nextPath);
      const value = await invoke<FileEntry[]>('list_directory', { serial: serial, path: normalized });
      files = value;
      path = normalized;
      selectedFiles = [];
      lastSelectedIndex = null;
      status = '';
      if (addHistory && normalized !== fileHistory[fileHistoryIndex]) {
        fileHistory = [...fileHistory.slice(0, fileHistoryIndex + 1), normalized];
        fileHistoryIndex++;
      }
    } catch (error) { 
      status = translateError(error);
    } finally { 
      busy = false; 
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
          await invoke<string>('run_device_action', { serial: serial, args: ['push', '--sync', job.source, job.destination] });
          if (path === job.destination) refreshFiles(path);
        } else {
          await invoke<string>('pull_file', { serial: serial, remotePath: job.source, localPath: job.destination });
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
      let statError: string | undefined = undefined;
      try {
        const metadata = await stat(localPath);
        isDirectory = metadata.isDirectory;
      } catch (e) {
        statError = translateError(e);
      }
      const name = localPath.split(/[\\/]/).pop() || localPath;
      
      if (statError) {
        transferJobs = [...transferJobs, { id: Date.now().toString() + Math.random().toString(), type: 'upload', name, source: localPath, destination: path, isDirectory: false, status: 'error', error: statError }];
      } else {
        enqueueTransfer('upload', localPath, path, name, isDirectory);
      }
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

  async function runFileAction(args: string[]) {
    if (!serial) throw new Error(m.workbench_status_selectDevice());
    busy = true;
    try {
      const output = await invoke<string>('run_device_action', { serial, args });
      status = output;
    } catch (error) {
      throw new Error(translateError(error));
    } finally {
      busy = false;
    }
  }

  async function createDeviceFolder() {
    const defaultName = m.files_prompt_defaultNewFolder();
    await asyncPrompt(m.files_prompt_newFolder(), defaultName, async name => {
      await runFileAction(['shell', 'mkdir', '-p', escapeAdbPath(`${path}/${name.trim()}`)]);
      await refreshFiles();
    });
  }

  async function renameSelectedFile() {
    const file = selectedFileEntries[0];
    if (!file) return;
    await asyncPrompt(m.files_prompt_rename(), file.name, async name => {
      if (name.trim() === file.name) return;
      await runFileAction(['shell', 'mv', escapeAdbPath(filePath(file)), escapeAdbPath(`${path}/${name.trim()}`)]);
      await refreshFiles();
    });
  }

  async function duplicateSelectedFile() {
    const file = selectedFileEntries[0];
    if (!file) return;
    const extensionIndex = file.is_directory ? -1 : file.name.lastIndexOf('.');
    const suggestedName = extensionIndex > 0
      ? `${file.name.slice(0, extensionIndex)}${m.files_prompt_copySuffix()}${file.name.slice(extensionIndex)}`
      : `${file.name}${m.files_prompt_copySuffix()}`;
    await asyncPrompt(m.files_prompt_copyName(), suggestedName, async name => {
      await runFileAction(['shell', 'cp', '-r', escapeAdbPath(filePath(file)), escapeAdbPath(`${path}/${name.trim()}`)]);
      await refreshFiles();
    });
  }

  async function deleteSelectedFiles() {
    if (!selectedFileEntries.length) return;
    await asyncConfirm(
      m.files_confirm_deleteTitle(),
      m.files_confirm_deleteDesc({ count: selectedFileEntries.length }),
      m.common_delete(),
      async () => {
        for (const file of selectedFileEntries) {
          await runFileAction(['shell', 'rm', '-rf', escapeAdbPath(filePath(file))]);
        }
        await refreshFiles();
      },
      true
    );
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

    await asyncPermissions(m.files_action_permissions(), initialMode, async mode => {
      for (const file of selectedFileEntries) {
        await runFileAction(['shell', 'chmod', mode, escapeAdbPath(filePath(file))]);
      }
      await refreshFiles();
    });
  }

  $effect(() => {
    // only runs on serial change because serial is a prop
    refreshFiles();
  });

  $effect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    if (tab === 'files') {
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

  import type { Action } from 'svelte/action';

  const lazyLoadThumbnail: Action<HTMLElement, string> = (node, remotePath) => {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(remotePath)) return;
    
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!pendingThumbnails.has(remotePath) && fileThumbnails[remotePath] === undefined) {
            pendingThumbnails.add(remotePath);
            invoke<string>('get_file_thumbnail', { serial, path: remotePath })
              .then(value => { fileThumbnails[remotePath] = value; })
              .catch(() => { fileThumbnails[remotePath] = ''; })
              .finally(() => { pendingThumbnails.delete(remotePath); });
          }
          observer.unobserve(node);
        }
      });
    }, { rootMargin: '100px' });
    
    observer.observe(node);
    
    return {
      destroy() { observer.disconnect(); }
    };
  };

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
    if (!selectedFileSet.has(file.name)) selectedFiles = [file.name];
    contextMenu = { x: e.clientX, y: e.clientY, file };
  }

  const fileType = (file: FileEntry) => file.is_link ? m.files_type_symlink() : file.is_directory ? m.files_type_folder() : m.files_type_file();
  const fileSize = (file: FileEntry) => file.is_directory || file.is_link ? '-' : formatBytes(file.size);
  const fileIcon = (file: FileEntry) => {
    if (file.is_link) return 'shortcut';
    if (file.is_directory) return 'folder';
    if (/\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(file.name)) return 'image';
    if (/\.(mp3|wav|ogg|oga|flac|m4a|aac)$/i.test(file.name)) return 'audio_file';
    if (/\.(mp4|mkv|avi|webm|mov)$/i.test(file.name)) return 'video_file';
    if (/\.(zip|tar|gz|rar|7z)$/i.test(file.name)) return 'folder_zip';
    if (/\.(apk)$/i.test(file.name)) return 'android';
    if (/\.(pdf)$/i.test(file.name)) return 'picture_as_pdf';
    return 'draft';
  };
  
  let pathParts = $derived(path.split('/').filter(Boolean));
  let hasTransferJobs = $derived(transferJobs.length > 0);
  
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
      <md-icon-button class="file-back-button" aria-label={m.files_nav_back()} title={m.files_nav_back()} disabled={fileHistoryIndex <= 0 ? true : undefined} onclick={() => goFileHistory(fileHistoryIndex - 1)}>
        <MaterialIcon name="arrow_back" />
      </md-icon-button>
      <md-icon-button class="file-forward-button" aria-label={m.files_nav_forward()} title={m.files_nav_forward()} disabled={fileHistoryIndex >= fileHistory.length - 1 ? true : undefined} onclick={() => goFileHistory(fileHistoryIndex + 1)}>
        <MaterialIcon name="arrow_forward" />
      </md-icon-button>
      <md-icon-button class="file-up-button" aria-label={m.files_nav_up()} title={m.files_nav_up()} disabled={path === '/' ? true : undefined} onclick={() => refreshFiles(path.substring(0, path.lastIndexOf('/')) || '/', true)}>
        <MaterialIcon name="arrow_upward" />
      </md-icon-button>
      <md-icon-button class="file-refresh-button" aria-label={m.files_nav_refresh()} title={m.files_nav_refresh()} onclick={() => refreshFiles()}>
        <MaterialIcon name="refresh" />
      </md-icon-button>
    </div>
    
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="file-address {filePathEditing ? 'editing' : ''}" onclick={() => filePathEditing = true}>
      {#if filePathEditing}
        <!-- svelte-ignore a11y_autofocus -->
        <md-outlined-text-field 
          autofocus 
          use:materialTextFieldValue={path}
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
      use:materialTextFieldValue={fileFilter}
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
      {#if hasTransferJobs}
        <div style="width: 1px; background: var(--md-sys-color-outline-variant); margin: 4px 8px"></div>
        <button class={transfersOpen ? 'active' : ''} onclick={() => transfersOpen = !transfersOpen} title={m.transfers_title()} style="position: relative">
          <MaterialIcon name="swap_vert" />
          {#if transferJobs.some(j => j.status === 'error' || j.children?.some(c => c.status === 'error')) || transferJobs.some(j => j.status === 'transferring' || j.status === 'idle')}
            <span class="transfer-badge {transferJobs.some(j => j.status === 'error' || j.children?.some(c => c.status === 'error')) ? 'error' : ''}"></span>
          {/if}
        </button>
      {/if}
    </div>
  </section>
  
  <section class="file-command-bar">
    <div class="file-primary-actions">
      <md-filled-tonal-button onclick={createDeviceFolder}>
        <MaterialIcon slot="icon" name="create_new_folder" />
        {m.files_action_newFolder()}
      </md-filled-tonal-button>
      <md-filled-button class="file-command-upload" onclick={uploadFiles}>
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
          {@render fileRow(file, index)}
        {/each}
      </div>
    {/if}
    
    {#if fileView === 'grid'}
      <div class="file-grid-view">
        {#each filteredFiles as file, index (file.name)}
          {@render fileCard(file, index)}
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
  
  <FileActionDialogs {promptConfig} {permissionsConfig} {confirmConfig} />

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

{#snippet fileRow(file: FileEntry, index: number)}
  {@const remotePath = filePath(file)}
  <button 
    class="file-list-row {selectedFileSet.has(file.name) ? 'selected' : ''}" 
    onclick={event => selectFileEntry(event, file, index)} 
    ondblclick={() => openFileEntry(file)}
    oncontextmenu={e => handleContextMenu(e, file)}
  >
    <span class="file-name-cell {file.is_link ? 'symbolic' : ''}">
      <b style="position: relative;">
        <MaterialIcon name={fileIcon(file)} />
        {#if /\.(mp3|wav|ogg|oga|flac|m4a|aac)$/i.test(file.name)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="file-audio-play list-mode {audioPlayingPath === remotePath && (audioIsPlaying || audioProgress > 0) ? 'playing' : ''}" role="button" tabindex="0" onclick={e => toggleAudioPlay(e, file)}>
            {#if audioPlayingPath === remotePath}
              {#if audioLoading}
                <md-circular-progress indeterminate style="--md-circular-progress-size: 36px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
              {:else}
                <md-circular-progress value={audioProgress} style="--md-circular-progress-size: 36px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
              {/if}
            {/if}
            <MaterialIcon name={audioPlayingPath === remotePath && audioIsPlaying ? 'pause' : 'play_arrow'} />
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
{/snippet}

{#snippet fileCard(file: FileEntry, index: number)}
  {@const remotePath = filePath(file)}
  <button 
    class="file-grid-card {selectedFileSet.has(file.name) ? 'selected' : ''}" 
    use:lazyLoadThumbnail={remotePath}
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
        {#if fileThumbnails[remotePath]}
          <img src={fileThumbnails[remotePath]} alt="" loading="lazy" />
        {:else}
          <MaterialIcon name={fileIcon(file)} size={48} />
        {/if}
        {#if /\.(mp3|wav|ogg|oga|flac|m4a|aac)$/i.test(file.name)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="file-audio-play {audioPlayingPath === remotePath && (audioIsPlaying || audioProgress > 0) ? 'playing' : ''}" role="button" tabindex="0" onclick={e => toggleAudioPlay(e, file)}>
            {#if audioPlayingPath === remotePath}
              {#if audioLoading}
                <md-circular-progress indeterminate style="--md-circular-progress-size: 40px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
              {:else}
                <md-circular-progress value={audioProgress} style="--md-circular-progress-size: 40px; position: absolute; inset: 0; width: 100%; height: 100%;"></md-circular-progress>
              {/if}
            {/if}
            <MaterialIcon name={audioPlayingPath === remotePath && audioIsPlaying ? 'pause' : 'play_arrow'} />
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
{/snippet}

<style>
:global {
.file-page{min-height:100%}
.file-actions{padding:12px 0;border-bottom:1px solid var(--border)}
.file-os-drag-overlay{position:absolute;z-index:99;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:color-mix(in srgb,var(--surface) 80%,transparent);backdrop-filter:blur(4px);color:var(--action-bg);font-size:24px;font-weight:700}
.file-os-drag-overlay :global(.material-symbols-rounded){font-size:64px;color:var(--action-bg)}
.file-explorer.os-drag-hover{border-color:var(--action-bg);box-shadow:0 0 0 4px color-mix(in srgb,var(--action-bg) 20%,transparent)}
.file-table{margin-top:10px}
.file-row{display:grid;grid-template-columns:42px minmax(180px,1fr) 110px 80px 70px;gap:8px;align-items:center;padding:7px;border-bottom:1px solid var(--border)}
.file-row:hover{background:var(--surface-secondary)}

.file-explorer{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg)}
.file-explorer-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 19px;border-bottom:1px solid var(--border);background:linear-gradient(140deg,var(--surface),var(--surface-secondary))}
.file-kicker{color:var(--action-bg);font-size:8px;font-weight:800;letter-spacing:.16em}
.file-explorer-header h2{font-size:20px}
.file-explorer-header p{color:var(--text-secondary);font-size:10px}
.file-command-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--border)}
.file-command-bar>div{display:flex;gap:6px}
.file-command-bar button{min-height:34px;padding:7px 10px;background:var(--surface-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:11px}
.file-command-bar button:hover:not(:disabled){border-color:var(--action-bg)}
.file-command-bar button.primary{background:var(--action-bg);border-color:var(--action-bg)}
.file-command-bar button.danger{color:var(--color-red)}
.file-navigation button{width:34px;padding:0;font-size:17px}
.file-selection-actions{margin-left:auto}
.file-location-bar{display:grid;grid-template-columns:minmax(220px,1fr) minmax(260px,1.5fr) minmax(150px,.65fr);gap:8px;padding:10px 12px;background:var(--surface-secondary);border-bottom:1px solid var(--border)}
.file-location-bar input{min-width:0;font-size:11px}
.file-browser{position:relative;flex:1;min-height:0;overflow:auto;background:var(--bg)}
.file-list-table{min-width:820px}
.file-list-header,.file-list-row{display:grid;grid-template-columns:minmax(260px,2fr) minmax(120px,.8fr) 100px 115px 150px;align-items:center;gap:10px}
.file-list-header{position:sticky;z-index:2;top:0;padding:7px 13px;color:var(--text-secondary);background:var(--surface-secondary);border-bottom:1px solid var(--border);font-size:10px;font-weight:700}
.file-list-row{width:100%;padding:8px 13px;background:transparent;border-bottom:1px solid var(--border);text-align:left}
.file-list-row:hover,.file-list-row.selected{background:var(--selection-bg)}
.file-list-row.selected{box-shadow:inset 3px 0 var(--action-bg)}
.file-list-row>span,.file-list-row code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:10px}
.file-name-cell{display:flex!important;align-items:center;gap:10px;color:var(--text-primary)!important}
.file-name-cell>b{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;color:var(--action-bg);background:var(--selection-bg);border-radius:7px;font-size:15px}
.file-name-cell>span{min-width:0}
.file-name-cell strong,.file-name-cell small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-name-cell strong{color:var(--text-primary);font-size:12px}
.file-name-cell small{color:var(--action-bg);font-size:8px}
.file-list-row code{font-family:var(--font-mono);color:var(--text-primary)}
.file-grid-view{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));align-content:start;gap:10px;padding:12px}
.file-grid-card{display:grid;grid-template-rows:78px 20px 17px 17px 17px;justify-items:center;gap:4px;min-width:0;height:174px;padding:11px 9px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);text-align:center}
.file-grid-card:hover,.file-grid-card.selected{border-color:var(--action-bg);background:var(--selection-bg)}
.file-grid-preview{position:relative;display:grid;place-items:center;width:78px;height:78px;overflow:hidden;color:var(--action-bg);background:var(--surface-secondary);border-radius:15px}
.file-grid-preview img{width:100%;height:100%;object-fit:cover}
.file-grid-preview b{font-size:35px}
.file-grid-preview i{position:absolute;right:5px;bottom:5px;display:grid;place-items:center;width:20px;height:20px;color:#fff;background:var(--action-bg);border-radius:50%;font-style:normal;font-size:11px}
.file-grid-card>strong,.file-grid-card>small,.file-grid-card>span,.file-grid-card>code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-grid-card>strong{font-size:11px}
.file-grid-card>small{color:var(--action-bg);font-size:8px}
.file-grid-card>span{color:var(--text-secondary);font-size:8px}
.file-grid-card>code{color:var(--text-secondary);font-family:var(--font-mono);font-size:8px}
.file-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;color:var(--text-secondary);font-size:11px}
.file-empty b{color:var(--text-primary);font-size:14px}
.file-status-bar{display:flex;align-items:center;gap:18px;padding:7px 12px;color:var(--text-secondary);background:var(--surface-secondary);border-top:1px solid var(--border);font-size:12px}

@media(max-width:1100px){
  .file-location-bar{grid-template-columns:1fr 1fr}
  .file-selection-actions{margin-left:0}
}
@media(max-width:720px){
  .file-explorer-header p{display:none}
  .file-primary-actions,.file-selection-actions{width:100%}
  .file-command-bar button{flex:1}
  .file-location-bar{grid-template-columns:1fr}
  .file-grid-view{grid-template-columns:repeat(2,minmax(0,1fr))}
}

/* Rediseño de legibilidad */
.file-explorer-header p{font-size:12px}
.file-kicker{font-size:9px}
.file-command-bar button{font-size:13px}
.file-location-bar{grid-template-columns:minmax(320px,1fr) minmax(180px,.42fr)}
.file-address{min-width:0;min-height:38px;cursor:text}
.file-address.editing input{width:100%;height:38px;font-size:14px;user-select:text}
.file-breadcrumbs{height:38px;cursor:text}
.file-breadcrumbs button{font-size:13px}
.file-list-header{padding:9px 13px}
.file-list-header button{color:var(--text-secondary);font-size:12px;font-weight:700;text-align:left}
.file-list-header button:hover{color:var(--action-bg)}
.file-list-row{min-height:48px;padding:9px 13px}
.file-list-row>span,.file-list-row code{font-size:12px}
.file-name-cell strong{font-size:14px}
.file-name-cell.symbolic{padding-left:4px}
.file-name-cell.symbolic strong{display:block}
.file-name-cell.symbolic small{display:inline;color:var(--text-secondary);font-size:12px;font-weight:400}
.file-grid-view{grid-template-columns:repeat(auto-fill,minmax(165px,1fr))}
.file-grid-card{grid-template-rows:82px 23px 20px 20px 20px;height:190px}
.file-grid-card>strong{font-size:13px}
.file-grid-card>small,.file-grid-card>span,.file-grid-card>code{font-size:10px}
.file-status-bar{font-size:11px}
.file-grid-symbolic{grid-row:1/3;align-self:center;display:block;width:100%;padding:12px;color:var(--text-primary);background:var(--surface-secondary);border-radius:var(--radius-md);text-align:left;white-space:normal!important}
.file-grid-symbolic strong,.file-grid-symbolic small{display:inline;font-size:12px}
.file-grid-symbolic small{color:var(--text-secondary);font-weight:400}

@media(max-width:1100px){
  .file-location-bar{grid-template-columns:1fr}
}

/* Material Design 3 y Ajustes */
.file-explorer{container-type:inline-size;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--surface-container-lowest);border:1px solid var(--outline-variant);border-radius:24px}
.file-material-toolbar{display:grid;grid-template-columns:auto minmax(260px,1fr) minmax(180px,260px) auto;align-items:center;gap:10px;padding:12px;background:var(--surface-container-low);border-bottom:1px solid var(--outline-variant)}

/* Navegación y Vistas */
.file-navigation,.file-view-switch{display:flex;align-items:center;gap:2px;padding:2px;background:var(--surface-container);border-radius:var(--radius-full)}
.file-navigation md-icon-button{--md-icon-button-icon-color:var(--on-surface-variant);--md-icon-button-hover-state-layer-color:var(--on-surface)}

/* Toggle standard para vista de lista/grid */
.file-view-switch button{display:grid;place-items:center;width:36px;height:36px;padding:0;color:var(--on-surface-variant);background:transparent;border:0;border-radius:50%;cursor:pointer;transition:all 0.2s ease}
.file-view-switch button:hover{color:var(--on-surface);background:var(--surface-container-high)}
.file-view-switch button.active{color:var(--on-primary-container);background:var(--primary-container)}
.file-view-switch button :global(.material-symbols-rounded){font-size:20px}

/* Barra de Direcciones */
.file-address{min-width:0;height:40px;cursor:text}
.file-address md-outlined-text-field{width:100%;height:40px;--md-outlined-field-container-shape:var(--radius-full);--md-outlined-field-top-space:8px;--md-outlined-field-bottom-space:8px;--md-outlined-field-content-size:13px}
.file-breadcrumbs{display:flex;height:40px;align-items:center;min-width:0;overflow:auto;padding:4px 8px;color:var(--on-surface-variant);background:var(--surface-container);border:1px solid transparent;border-radius:var(--radius-full);scrollbar-width:none}
.file-breadcrumbs::-webkit-scrollbar{display:none}
.file-breadcrumbs>:global(.material-symbols-rounded){flex:0 0 auto;margin:0 4px;font-size:18px}
.file-breadcrumbs span{display:flex;align-items:center;flex:0 0 auto}
.file-breadcrumbs span>:global(.material-symbols-rounded){font-size:16px}
.file-breadcrumbs button{height:30px;padding:0 8px;color:var(--on-surface-variant);border-radius:var(--radius-full);white-space:nowrap;font-size:13px;border:none;background:transparent;cursor:pointer}
.file-breadcrumbs button:hover{color:var(--on-primary-container);background:var(--primary-container)}

/* Barra de Búsqueda rediseñada a juego con la barra de direcciones */
.file-search {
  width: 100%;
  height: 40px;
  --md-outlined-field-container-shape: var(--radius-full);
  --md-outlined-field-top-space: 8px;
  --md-outlined-field-bottom-space: 8px;
  --md-outlined-field-content-size: 13px;
  --md-outlined-field-leading-content-color: var(--on-surface-variant);
  
  /* Ocultar borde y poner fondo de "pastilla" cuando está inactivo */
  --md-outlined-field-outline-color: transparent;
  --md-outlined-field-hover-outline-color: transparent;
  background-color: var(--surface-container);
  border-radius: var(--radius-full);
  transition: background-color 0.2s ease;
}

/* Recuperar el recuadro original y quitar el fondo al darle clic */
.file-search:focus-within {
  background-color: transparent;
}

/* Comando y Acciones */
.file-command-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:nowrap;padding:10px 12px;background:var(--surface-container-low);border-bottom:1px solid var(--outline-variant);overflow-x:auto;scrollbar-width:none}
.file-command-bar::-webkit-scrollbar{display:none}
.file-primary-actions,.file-selection-actions{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;flex-shrink:0}
.file-primary-actions md-filled-button,.file-primary-actions md-filled-tonal-button{--md-filled-button-container-shape:var(--radius-full);--md-filled-tonal-button-container-shape:var(--radius-full);font-size:12px}
.file-primary-actions :global(.material-symbols-rounded){font-size:18px}
.file-selection-actions{margin-left:auto;padding-left:10px}
.file-selection-actions>span{max-width:220px;margin-right:4px;overflow:hidden;color:var(--on-surface-variant);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.file-selection-actions md-icon-button{--md-icon-button-icon-color:var(--on-surface-variant)}
.file-selection-actions md-icon-button.danger{--md-icon-button-icon-color:var(--error)}

/* Explorador (Tablas y Grid) */
.file-browser{position:relative;flex:1;min-height:0;overflow:auto;background:var(--surface-container-lowest)}
.file-list-table{min-width:850px}
.file-list-header,.file-list-row{display:grid;grid-template-columns:minmax(280px,2fr) minmax(120px,.8fr) 100px 120px 160px;align-items:center;gap:12px}
.file-list-header{position:sticky;z-index:2;top:0;padding:7px 14px;background:var(--surface-container);border-bottom:1px solid var(--outline-variant)}
.file-list-header button{display:flex;height:30px;align-items:center;gap:4px;padding:0 8px;color:var(--on-surface-variant);background:transparent;border:none;border-radius:var(--radius-full);font-size:11px;font-weight:600;text-align:left;cursor:pointer}
.file-list-header button:hover,.file-list-header button.active{color:var(--on-primary-container);background:var(--primary-container)}
.file-list-header :global(.material-symbols-rounded){margin-left:auto;font-size:15px}
.file-list-row{position:relative;width:100%;min-height:54px;padding:7px 14px;overflow:hidden;background:transparent;border:none;border-bottom:1px solid color-mix(in srgb,var(--outline-variant) 65%,transparent);border-radius:0;text-align:left;cursor:pointer}
.file-list-row:hover{background:var(--surface-container-low)}
.file-list-row.selected{background:var(--primary-container);box-shadow:inset 3px 0 var(--primary)}
.file-list-row>span,.file-list-row code{min-width:0;overflow:hidden;color:var(--on-surface-variant);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.file-list-row code{color:var(--on-surface);font-family:var(--font-mono)}
.file-name-cell{display:flex!important;align-items:center;gap:11px;color:var(--on-surface)!important}
.file-name-cell>b{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;color:var(--on-primary-container);background:var(--primary-container);border-radius:11px}
.file-list-row.selected .file-name-cell>b{background:var(--surface-container-high)}
.file-name-cell>b :global(.material-symbols-rounded){font-size:21px}
.file-name-cell>span{min-width:0}
.file-name-cell strong{display:block;overflow:hidden;color:var(--on-surface);font-size:13px;text-overflow:ellipsis;white-space:nowrap}
.file-name-cell small{display:inline;color:var(--on-surface-variant);font-size:11px;font-weight:400}

.file-grid-view{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));align-content:start;gap:12px;padding:14px}
.file-grid-card{position:relative;display:flex;min-width:0;height:210px;flex-direction:column;align-items:flex-start;gap:5px;padding:12px;overflow:hidden;color:var(--on-surface);background:var(--surface-container-low);border:1px solid var(--outline-variant);border-radius:20px;text-align:left;cursor:pointer}
.file-grid-card:hover{background:var(--surface-container)}
.file-grid-card.selected{color:var(--on-primary-container);background:var(--primary-container);border-color:transparent}
.file-grid-preview{display:grid;width:100%;height:120px;place-items:center;overflow:hidden;color:var(--on-primary-container);background:var(--primary-container);border-radius:14px}
.file-grid-card.selected .file-grid-preview{background:var(--surface-container-high)}
.file-grid-preview img{width:100%;height:100%;object-fit:cover}
.file-grid-preview>:global(.material-symbols-rounded){font-size:48px}
.file-audio-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:rgba(0,0,0,.4);color:#fff;border:none;cursor:pointer;opacity:0;transition:all .2s ease;z-index:2}
.file-grid-card:hover .file-audio-play,.file-list-row:hover .file-audio-play,.file-audio-play.playing{opacity:1}
.file-audio-play:hover{background:rgba(0,0,0,.6);transform:translate(-50%,-50%) scale(1.1)}
.file-audio-play :global(.material-symbols-rounded){font-size:24px}
.file-audio-play.list-mode{width:36px;height:36px;border-radius:11px}
.file-audio-play.list-mode:hover{transform:translate(-50%,-50%) scale(1.05)}
.file-audio-play.list-mode :global(.material-symbols-rounded){font-size:20px}
.file-grid-card>strong,.file-grid-card>span,.file-grid-card>code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-grid-card>strong{font-size:13px}
.file-grid-card>span,.file-grid-card>code{color:var(--on-surface-variant);font-size:10px}
.file-grid-card>code{font-family:var(--font-mono)}
.file-grid-symbolic{display:grid;width:100%;height:145px;grid-template-columns:auto minmax(0,1fr);align-content:center;align-items:center;gap:7px;padding:14px;color:var(--on-surface);background:var(--surface-container);border-radius:14px;white-space:normal!important}
.file-grid-symbolic>:global(.material-symbols-rounded){font-size:25px}
.file-grid-symbolic strong{overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.file-grid-symbolic small{grid-column:1/-1;overflow:hidden;color:var(--on-surface-variant);font-size:10px;text-overflow:ellipsis;white-space:nowrap}

.file-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:var(--on-surface-variant);text-align:center}
.file-empty>:global(.material-symbols-rounded){margin-bottom:4px;color:var(--primary);font-size:54px}
.file-empty b{color:var(--on-surface);font-size:16px}
.file-empty span{font-size:11px}
.file-status-bar{display:flex;align-items:center;gap:18px;padding:7px 14px;color:var(--on-surface-variant);background:var(--surface-container-low);border-top:1px solid var(--outline-variant);font-size:10px}
.file-status-bar span{display:flex;align-items:center;gap:5px}
.file-status-bar :global(.material-symbols-rounded){font-size:15px}

@media(max-width:1200px){
  .file-material-toolbar{grid-template-columns:auto auto minmax(0,1fr) auto;gap:8px;padding:10px}
  .file-navigation{display:grid;grid-column:1/3;grid-row:1/3;grid-template-columns:repeat(2,40px);grid-template-rows:repeat(2,40px);align-self:start;border-radius:18px}
  .file-navigation md-icon-button{width:40px;height:40px}
  .file-back-button{grid-column:1;grid-row:1}
  .file-forward-button{grid-column:2;grid-row:1}
  .file-up-button{grid-column:1;grid-row:2}
  .file-refresh-button{grid-column:2;grid-row:2}
  .file-address{grid-column:3/-1;grid-row:1;min-width:0}
  .file-search{grid-column:3;grid-row:2}
  .file-view-switch{grid-column:4;grid-row:2;justify-self:end}
}
@media(max-width:780px){
  .file-primary-actions>*{flex:0 0 auto}
  .file-selection-actions>span{margin-right:auto}
  .file-grid-view{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px}
}
@media(max-width:520px){
  .file-grid-view{grid-template-columns:1fr}
  .file-primary-actions{display:grid;grid-template-columns:1fr}
  .file-selection-actions>span{width:100%;max-width:none}
  .file-navigation md-icon-button{width:36px;height:36px}
}

.transfer-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background-color: var(--md-sys-color-primary);
  border-radius: 50%;
}

.transfer-badge.error {
  background-color: var(--md-sys-color-error);
}
}
</style>
