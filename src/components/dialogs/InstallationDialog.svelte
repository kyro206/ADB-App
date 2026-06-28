<script lang="ts" module>
import * as m from '../../paraglide/messages';

  export type InstallOptions = {
    replace: boolean;
    grant: boolean;
    bypass: boolean;
  };
</script>

<script lang="ts">
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  let {
    open = false,
    files,
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
  let hasAab = $derived(files.some((f: string) => f.toLowerCase().endsWith('.aab')));

  let optionDefinitions = $derived<Array<[keyof InstallOptions, string, string]>>([
    ['replace', m.install_option_replace(), m.install_option_replaceDesc()],
    ['grant', m.install_option_grant(), m.install_option_grantDesc()],
    ['bypass', m.install_option_bypass(), m.install_option_bypassDesc()],
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

<AppModal {open} {onClose} width="large" title={m.install_title()} subtitle={m.install_subtitle()}>
  <section class="install-dialog-section">
    <header>
      <h3>{m.install_files_title()}</h3>
      <md-filled-button onclick={onChooseFiles}>
        {m.install_files_choose()}
      </md-filled-button>
    </header>
    
    {#if !files.length}
      <p class="install-dialog-empty">{m.install_files_empty()}</p>
    {:else}
      <div class="install-dialog-files">
        {#each files as file}
          <div>
            <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
              <MaterialIcon name="android" />
            </div>
            <p>
              <strong>{file.split(/[\\/]/).pop()}</strong>
              <small>{file}</small>
            </p>
            <md-icon-button aria-label={m.install_files_remove()} onclick={() => onRemoveFile(file)}>
              <MaterialIcon name="close" />
            </md-icon-button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
  
  <md-divider></md-divider>
  
  <section class="install-dialog-section">
    <h3>{m.install_options_title()}</h3>
    <div class="install-dialog-options">
      {#each optionDefinitions as [key, title, description]}
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
    <md-filled-button disabled={!canInstall ? true : undefined} onclick={handleInstallClick}>
      {`${m.install_action_install()}${files.length ? ` (${files.length})` : ''}`}
    </md-filled-button>
  {/snippet}
</AppModal>

<AppModal 
  open={showJavaModal} 
  onClose={handleCloseJavaModal} 
  title={m.dialog_missingTool_title({ tool: 'Java' })}
>
  <p>{m.dialog_missingTool_desc({ tool: 'Java' })}</p>
  
  {#snippet actions()}
    <md-filled-button onclick={handleGoToSettings}>
      {m.dialog_missingTool_goToSettings()}
    </md-filled-button>
  {/snippet}
</AppModal>

<style>
:global {
.install-dialog-section{display:flex;flex-direction:column;gap:12px;padding:18px 0}.install-dialog-section:first-child{padding-top:0}.install-dialog-section:last-child{padding-bottom:0}.install-dialog-section>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.install-dialog-section h3{font-size:16px}.install-dialog-empty,.install-dialog-options small,.install-dialog-files small{color:var(--on-surface-variant)}.install-dialog-files{display:flex;max-height:220px;flex-direction:column;gap:6px;overflow:auto}.install-dialog-files>div{display:grid;grid-template-columns:32px minmax(0,1fr) 48px;align-items:center;gap:10px}.install-dialog-files p{min-width:0}.install-dialog-files strong,.install-dialog-files small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.install-dialog-options{display:grid;grid-template-columns:1fr 1fr;gap:14px}.install-dialog-options label{display:flex;align-items:flex-start;gap:10px}.install-dialog-options md-checkbox{flex-shrink:0;margin-top:-2px}.install-dialog-options span,.install-dialog-options strong,.install-dialog-options small{display:block}.install-dialog-section pre{max-height:180px;overflow:auto;padding:14px;background:var(--surface-container);border-radius:var(--radius-md);user-select:text}@media(max-width:700px){.install-dialog-options{grid-template-columns:1fr}}
}
</style>
