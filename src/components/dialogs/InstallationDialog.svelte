<script lang="ts" module>
  export type InstallOptions = {
    replace: boolean;
    grant: boolean;
    test: boolean;
    bypass: boolean;
  };
</script>

<script lang="ts">
  import { i18n } from '../../locales/index.svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  import './InstallationDialog.css';

  let {
    open = false,
    files,
    installing,
    installStatuses,
    installErrors,
    options,
    canInstall,
    onClose,
    onChooseFiles,
    onRemoveFile,
    onOptionChange,
    onInstall,
    javaAvailable = true
  } = $props<{
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
  }>();

  let showJavaModal = $state(false);
  let hasAab = $derived(files.some(f => f.toLowerCase().endsWith('.aab')));

  let optionDefinitions = $derived<Array<[keyof InstallOptions, string, string]>>([
    ['replace', i18n.t('install.option.replace'), i18n.t('install.option.replaceDesc')],
    ['grant', i18n.t('install.option.grant'), i18n.t('install.option.grantDesc')],
    ['test', i18n.t('install.option.test'), i18n.t('install.option.testDesc')],
    ['bypass', i18n.t('install.option.bypass'), i18n.t('install.option.bypassDesc')],
  ]);

  function handleInstallClick() {
    if (hasAab && !javaAvailable) {
      showJavaModal = true;
    } else {
      onInstall();
    }
  }

  function handleCloseJavaModal() {
    showJavaModal = false;
  }

  function handleGoToSettings() {
    showJavaModal = false;
    onClose();
    // Dispatch an event so AppLayout can change to the settings tab
    window.dispatchEvent(new CustomEvent('change-tab', { detail: 'settings' }));
  }
</script>

<AppModal {open} {onClose} width="large" title={i18n.t('install.title')} subtitle={i18n.t('install.subtitle')}>
  <section class="install-dialog-section">
    <header>
      <h3>{i18n.t('install.files.title')}</h3>
      <md-filled-button disabled={installing ? true : undefined} onclick={onChooseFiles}>
        {i18n.t('install.files.choose')}
      </md-filled-button>
    </header>
    
    {#if !files.length}
      <p class="install-dialog-empty">{i18n.t('install.files.empty')}</p>
    {:else}
      <div class="install-dialog-files">
        {#each files as file}
          {@const status = installStatuses[file] || 'idle'}
          <div>
            <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
              {#if status === 'installing'}
                <md-circular-progress indeterminate style="--md-circular-progress-size: 20px"></md-circular-progress>
              {:else if status === 'success'}
                <MaterialIcon name="check_circle" style="color: var(--md-sys-color-primary);" />
              {:else if status === 'error'}
                <MaterialIcon name="cancel" style="color: var(--md-sys-color-error);" />
              {:else}
                <MaterialIcon name="android" />
              {/if}
            </div>
            <p>
              <strong>{file.split(/[\\/]/).pop()}</strong>
              <small>{file}</small>
            </p>
            <md-icon-button disabled={installing ? true : undefined} aria-label={i18n.t('install.files.remove')} onclick={() => onRemoveFile(file)}>
              <MaterialIcon name="close" />
            </md-icon-button>
          </div>
        {/each}
      </div>
    {/if}
    
    {#if Object.values(installErrors).some(err => !!err)}
      <div style="color: var(--md-sys-color-on-error-container); margin-top: 12px; font-size: 13px; white-space: pre-wrap; max-height: 120px; overflow: auto; background: var(--md-sys-color-error-container); padding: 12px; border-radius: 8px;">
        {#each Object.entries(installErrors).filter(([, err]) => !!err) as [file, err]}
          <div style="margin-bottom: 8px;">
            <strong>{file.split(/[\\/]/).pop()}</strong>: {err}
          </div>
        {/each}
      </div>
    {/if}
  </section>
  
  <md-divider></md-divider>
  
  <section class="install-dialog-section">
    <h3>{i18n.t('install.options.title')}</h3>
    <div class="install-dialog-options">
      {#each optionDefinitions as [key, title, description]}
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>
          <md-checkbox checked={options[key] ? true : undefined} onclick={() => onOptionChange(key, !options[key])}></md-checkbox>
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </label>
      {/each}
    </div>
  </section>

  {#snippet actions()}
    <md-filled-button disabled={!canInstall || installing ? true : undefined} onclick={handleInstallClick}>
      {installing ? i18n.t('install.action.installing') : `${i18n.t('install.action.install')}${files.length ? ` (${files.length})` : ''}`}
    </md-filled-button>
  {/snippet}
</AppModal>

<AppModal 
  open={showJavaModal} 
  onClose={handleCloseJavaModal} 
  title={i18n.t('dialog.missingTool.title', { tool: 'Java' })}
>
  <p>{i18n.t('dialog.missingTool.desc', { tool: 'Java' })}</p>
  
  {#snippet actions()}
    <md-filled-button onclick={handleGoToSettings}>
      {i18n.t('dialog.missingTool.goToSettings')}
    </md-filled-button>
  {/snippet}
</AppModal>
