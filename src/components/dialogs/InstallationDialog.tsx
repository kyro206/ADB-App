import { useState } from 'react';
import { useI18n } from '../../locales';
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
  installStatuses: Record<string, 'idle' | 'installing' | 'success' | 'error'>;
  installErrors: Record<string, string>;
  options: InstallOptions;
  canInstall: boolean;
  onClose: () => void;
  onChooseFiles: () => void;
  onRemoveFile: (file: string) => void;
  onOptionChange: (option: keyof InstallOptions, value: boolean) => void;
  onInstall: () => void;
  javaAvailable?: boolean;
};

export function InstallationDialog({ open, files, installing, installStatuses, installErrors, options, canInstall, onClose, onChooseFiles, onRemoveFile, onOptionChange, onInstall, javaAvailable = true }: InstallationDialogProps) {
  const { t } = useI18n();

  const optionDefinitions: Array<[keyof InstallOptions, string, string]> = [
    ['replace', t('install.option.replace'), t('install.option.replaceDesc')],
    ['grant', t('install.option.grant'), t('install.option.grantDesc')],
    ['test', t('install.option.test'), t('install.option.testDesc')],
    ['bypass', t('install.option.bypass'), t('install.option.bypassDesc')],
  ];

  const hasAab = files.some(f => f.toLowerCase().endsWith('.aab'));
  const [showJavaModal, setShowJavaModal] = useState(false);

  const handleInstallClick = () => {
    if (hasAab && !javaAvailable) {
      setShowJavaModal(true);
    } else {
      onInstall();
    }
  };

  const actions = <>
    <md-filled-button disabled={!canInstall || installing || undefined} onClick={handleInstallClick}>{installing ? t('install.action.installing') : `${t('install.action.install')}${files.length ? ` (${files.length})` : ''}`}</md-filled-button>
  </>;

  return <>
    <AppModal open={open} onClose={onClose} width="large" title={t('install.title')} subtitle={t('install.subtitle')} actions={actions}>
    <section className="install-dialog-section">
      <header><h3>{t('install.files.title')}</h3><md-filled-button disabled={installing || undefined} onClick={onChooseFiles}>{t('install.files.choose')}</md-filled-button></header>
      {!files.length ? <p className="install-dialog-empty">{t('install.files.empty')}</p> : <div className="install-dialog-files">{files.map(file => {
        const status = installStatuses[file] || 'idle';
        return <div key={file}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
          {status === 'installing' ? (
            <md-circular-progress indeterminate style={{ '--md-circular-progress-size': '20px' }}></md-circular-progress>
          ) : status === 'success' ? (
            <MaterialIcon name="check_circle" style={{ color: 'var(--md-sys-color-primary)' }} />
          ) : status === 'error' ? (
            <MaterialIcon name="cancel" style={{ color: 'var(--md-sys-color-error)' }} />
          ) : (
            <MaterialIcon name="android" />
          )}
        </div>
        <p><strong>{file.split(/[\\/]/).pop()}</strong><small>{file}</small></p>
        <md-icon-button disabled={installing || undefined} aria-label={t('install.files.remove')} onClick={() => onRemoveFile(file)}><MaterialIcon name="close" /></md-icon-button>
      </div>})}</div>}
      
      {Object.values(installErrors).some(err => !!err) && (
        <div style={{ color: 'var(--md-sys-color-on-error-container)', marginTop: '12px', fontSize: '13px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto', background: 'var(--md-sys-color-error-container)', padding: '12px', borderRadius: '8px' }}>
          {Object.entries(installErrors).filter(([, err]) => !!err).map(([file, err]) => (
            <div key={file} style={{ marginBottom: '8px' }}>
              <strong>{file.split(/[\\/]/).pop()}</strong>: {err}
            </div>
          ))}
        </div>
      )}
    </section>
    <md-divider />
    <section className="install-dialog-section">
      <h3>{t('install.options.title')}</h3>
      <div className="install-dialog-options">
        {optionDefinitions.map(([key, title, description]) => <label key={key}><md-checkbox checked={options[key] || undefined} onClick={() => onOptionChange(key, !options[key])} /><span><strong>{title}</strong><small>{description}</small></span></label>)}
      </div>
    </section>
  </AppModal>
  <AppModal 
    open={showJavaModal} 
    onClose={() => setShowJavaModal(false)} 
    title={t('dialog.missingTool.title', { tool: 'Java' })}
    actions={<>
      <md-filled-button onClick={() => { setShowJavaModal(false); onClose(); window.dispatchEvent(new CustomEvent('change-tab', { detail: 'settings' })); }}>{t('dialog.missingTool.goToSettings')}</md-filled-button>
    </>}
  >
    <p>{t('dialog.missingTool.desc', { tool: 'Java' })}</p>
  </AppModal>
  </>;
}
