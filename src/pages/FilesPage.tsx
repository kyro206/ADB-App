import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { MaterialIcon } from '../components/MaterialIcon';
import { formatBytes } from './workbench/utils';
import type { FileEntry, FileSortKey, FileView } from './workbench/types';
import './FilesPage.css';

export interface FilesPageProps {
  serial: string;
  setStatus: (status: string) => void;
  setBusy: (busy: boolean) => void;
  run: (args: string[], success?: string) => Promise<any>;
}

export function FilesPage({ serial, setStatus, setBusy, run }: FilesPageProps) {
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
      // 1. Forzar a que las carpetas siempre vayan arriba
      if (left.is_directory !== right.is_directory) {
        return left.is_directory ? -1 : 1;
      }

      // 2. Ordenamiento normal por la clave seleccionada
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
    refreshFiles();
    // eslint-disable-next-deps
  }, [serial]);

  useEffect(() => {
    if (fileView !== 'grid' || !serial) return;
    filteredFiles.filter(file => !file.is_directory && !file.is_link && file.size <= 5 * 1024 * 1024 && /\.(png|jpe?g|webp|gif)$/i.test(file.name) && !fileThumbnails[filePath(file)]).slice(0, 12).forEach(file => {
      const remotePath = filePath(file);
      invoke<string>('get_file_thumbnail', { serial, path: remotePath }).then(value => setFileThumbnails(current => ({ ...current, [remotePath]: value }))).catch(() => undefined);
    });
  }, [fileView, serial, path, filteredFiles]);

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
  const currentFolderName = path === '/' ? 'root' : path.split('/').pop();

  return (
    <div className="file-explorer">
      <section className="file-material-toolbar">
        <div className="file-navigation">
          <md-icon-button aria-label="Atrás" title="Atrás" disabled={fileHistoryIndex <= 0 ? true : undefined} onClick={() => goFileHistory(fileHistoryIndex - 1)}><MaterialIcon name="arrow_back" /></md-icon-button>
          <md-icon-button aria-label="Adelante" title="Adelante" disabled={fileHistoryIndex >= fileHistory.length - 1 ? true : undefined} onClick={() => goFileHistory(fileHistoryIndex + 1)}><MaterialIcon name="arrow_forward" /></md-icon-button>
          <md-icon-button aria-label="Subir" title="Subir" disabled={path === '/' ? true : undefined} onClick={() => refreshFiles(path.substring(0, path.lastIndexOf('/')) || '/', true)}><MaterialIcon name="arrow_upward" /></md-icon-button>
          <md-icon-button aria-label="Recargar" title="Recargar" onClick={() => refreshFiles()}><MaterialIcon name="refresh" /></md-icon-button>
        </div>
        <div className={`file-address ${filePathEditing ? 'editing' : ''}`} onClick={() => setFilePathEditing(true)}>
          {filePathEditing
            ? <md-outlined-text-field autoFocus value={path} aria-label="Ruta" onFocus={(event: any) => event.currentTarget.select()} onBlur={() => setFilePathEditing(false)} onInput={(event: any) => setPath(event.currentTarget.value)} onKeyDown={(event: any) => { if (event.key === 'Enter') { refreshFiles(path, true); setFilePathEditing(false); } if (event.key === 'Escape') setFilePathEditing(false); }} />
            : <nav className="file-breadcrumbs"><MaterialIcon name="smartphone" /><button onClick={event => { event.stopPropagation(); refreshFiles('/', true); }}>/</button>{pathParts.map((part, index) => <span key={`${part}-${index}`}><MaterialIcon name="chevron_right" /><button onClick={event => { event.stopPropagation(); refreshFiles(`/${pathParts.slice(0, index + 1).join('/')}`, true); }}>{part}</button></span>)}</nav>}
        </div>
        <md-outlined-text-field 
          className="file-search" 
          value={fileFilter} 
          placeholder={`Buscar en ${currentFolderName}`}
          type="search" 
          onInput={(event: any) => setFileFilter(event.currentTarget.value)}
        >
          <MaterialIcon slot="leading-icon" name="search" />
        </md-outlined-text-field>

        <div className="file-view-switch">
          <button className={fileView === 'list' ? 'active' : ''} aria-label="Vista en lista" title="Vista en lista" onClick={() => setFileView('list')}><MaterialIcon name="view_list" /></button>
          <button className={fileView === 'grid' ? 'active' : ''} aria-label="Vista en cuadrícula" title="Vista en cuadrícula" onClick={() => setFileView('grid')}><MaterialIcon name="grid_view" /></button>
        </div>
      </section>
      
      <section className="file-command-bar">
        <div className="file-primary-actions">
          <md-filled-tonal-button onClick={createDeviceFolder}><MaterialIcon slot="icon" name="create_new_folder" />Nueva carpeta</md-filled-tonal-button>
          <md-filled-button onClick={uploadFiles}><MaterialIcon slot="icon" name="upload" />Enviar</md-filled-button>
          <md-filled-tonal-button disabled={selectedFileEntries.length === 0 ? true : undefined} onClick={downloadSelectedFiles}><MaterialIcon slot="icon" name="download" />Descargar</md-filled-tonal-button>
        </div>
        <div className="file-selection-actions">
          <md-icon-button aria-label="Renombrar" title="Renombrar" disabled={selectedFileEntries.length !== 1 ? true : undefined} onClick={renameSelectedFile}><MaterialIcon name="edit" /></md-icon-button>
          <md-icon-button aria-label="Duplicar" title="Duplicar" disabled={selectedFileEntries.length !== 1 ? true : undefined} onClick={duplicateSelectedFile}><MaterialIcon name="content_copy" /></md-icon-button>
          <md-icon-button aria-label="Permisos" title="Permisos" disabled={selectedFileEntries.length === 0 ? true : undefined} onClick={changeSelectedPermissions}><MaterialIcon name="admin_panel_settings" /></md-icon-button>
          <md-icon-button className="danger" aria-label="Eliminar" title="Eliminar" disabled={selectedFileEntries.length === 0 ? true : undefined} onClick={deleteSelectedFiles}><MaterialIcon name="delete" /></md-icon-button>
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
    </div>
  );
}