import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './InstallationDialog.css';

type InstallOptions = {
  replace: boolean;
  grant: boolean;
  test: boolean;
  bypass: boolean;
};

type InstallationDialogProps = {
  open: boolean;
  files: string[];
  installing: boolean;
  result: string;
  options: InstallOptions;
  canInstall: boolean;
  onClose: () => void;
  onChooseFiles: () => void;
  onRemoveFile: (file: string) => void;
  onOptionChange: (option: keyof InstallOptions, value: boolean) => void;
  onInstall: () => void;
};

const optionDefinitions: Array<[keyof InstallOptions, string, string]> = [
  ['replace', 'Reemplazar si ya está instalada', 'Conserva los datos existentes de la aplicación.'],
  ['grant', 'Conceder permisos runtime', 'Concede automáticamente los permisos solicitados.'],
  ['test', 'Permitir paquetes de prueba', 'Admite APK marcadas como test-only.'],
  ['bypass', 'Omitir bloqueo de SDK antiguo', 'Activa --bypass-low-target-sdk-block.'],
];

export function InstallationDialog({ open, files, installing, result, options, canInstall, onClose, onChooseFiles, onRemoveFile, onOptionChange, onInstall }: InstallationDialogProps) {
  const actions = <>
    <md-text-button disabled={installing} onClick={onClose}>Cerrar</md-text-button>
    <md-filled-button disabled={!canInstall || installing} onClick={onInstall}>{installing ? 'Instalando…' : `Instalar${files.length ? ` (${files.length})` : ''}`}</md-filled-button>
  </>;

  return <AppModal open={open} onClose={onClose} width="large" title="Instalar aplicaciones" subtitle="Selecciona paquetes APK o bundles para instalarlos en el dispositivo conectado." actions={actions}>
    <section className="install-dialog-section">
      <header><h3>Archivos seleccionados</h3><md-filled-button disabled={installing} onClick={onChooseFiles}>Elegir archivos</md-filled-button></header>
      {!files.length ? <p className="install-dialog-empty">Todavía no has seleccionado ningún archivo.</p> : <div className="install-dialog-files">{files.map(file => <div key={file}><MaterialIcon name="android_package" /><p><strong>{file.split(/[\\/]/).pop()}</strong><small>{file}</small></p><md-icon-button disabled={installing} aria-label="Quitar archivo" onClick={() => onRemoveFile(file)}><MaterialIcon name="close" /></md-icon-button></div>)}</div>}
    </section>
    <md-divider />
    <section className="install-dialog-section">
      <h3>Opciones de instalación</h3>
      <div className="install-dialog-options">
        {optionDefinitions.map(([key, title, description]) => <label key={key}><md-checkbox checked={options[key] || undefined} onClick={() => onOptionChange(key, !options[key])} /><span><strong>{title}</strong><small>{description}</small></span></label>)}
      </div>
    </section>
    <md-divider />
    <section className="install-dialog-section"><h3>Resultado de la instalación</h3><pre>{result || 'Selecciona los archivos y pulsa Instalar cuando quieras iniciar el proceso.'}</pre></section>
  </AppModal>;
}
