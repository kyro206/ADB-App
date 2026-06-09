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
  result: string;
  options: InstallOptions;
  canInstall: boolean;
  onClose: () => void;
  onChooseFiles: () => void;
  onRemoveFile: (file: string) => void;
  onOptionChange: (option: keyof InstallOptions, value: boolean) => void;
  onInstall: () => void;
};

export function InstallationDialog({ open, files, installing, result, options, canInstall, onClose, onChooseFiles, onRemoveFile, onOptionChange, onInstall }: InstallationDialogProps) {
  const { t } = useI18n();

  const optionDefinitions: Array<[keyof InstallOptions, string, string]> = [
    ['replace', t('install.option.replace'), t('install.option.replaceDesc')],
    ['grant', t('install.option.grant'), t('install.option.grantDesc')],
    ['test', t('install.option.test'), t('install.option.testDesc')],
    ['bypass', t('install.option.bypass'), t('install.option.bypassDesc')],
  ];

  const actions = <>
    <md-filled-button disabled={!canInstall || installing || undefined} onClick={onInstall}>{installing ? t('install.action.installing') : `${t('install.action.install')}${files.length ? ` (${files.length})` : ''}`}</md-filled-button>
  </>;

  return <AppModal open={open} onClose={onClose} width="large" title={t('install.title')} subtitle={t('install.subtitle')} actions={actions}>
    <section className="install-dialog-section">
      <header><h3>{t('install.files.title')}</h3><md-filled-button disabled={installing || undefined} onClick={onChooseFiles}>{t('install.files.choose')}</md-filled-button></header>
      {!files.length ? <p className="install-dialog-empty">{t('install.files.empty')}</p> : <div className="install-dialog-files">{files.map(file => <div key={file}><MaterialIcon name="android_package" /><p><strong>{file.split(/[\\/]/).pop()}</strong><small>{file}</small></p><md-icon-button disabled={installing || undefined} aria-label={t('install.files.remove')} onClick={() => onRemoveFile(file)}><MaterialIcon name="close" /></md-icon-button></div>)}</div>}
    </section>
    <md-divider />
    <section className="install-dialog-section">
      <h3>{t('install.options.title')}</h3>
      <div className="install-dialog-options">
        {optionDefinitions.map(([key, title, description]) => <label key={key}><md-checkbox checked={options[key] || undefined} onClick={() => onOptionChange(key, !options[key])} /><span><strong>{title}</strong><small>{description}</small></span></label>)}
      </div>
    </section>
    <md-divider />
    <section className="install-dialog-section"><h3>{t('install.result.title')}</h3><pre>{result || t('install.result.empty')}</pre></section>
  </AppModal>;
}
