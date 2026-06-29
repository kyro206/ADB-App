<script lang="ts">
import * as m from './paraglide/messages';

  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  
  import MaterialWebEnhancer from './components/MaterialWebEnhancer.svelte';
  import AppLayout from './components/layout/AppLayout.svelte';
  import { i18n } from './context/i18n.svelte';
  import { themeState, initThemeEffects } from './context/theme.svelte';
  import { devicesState } from './context/devices.svelte';
  import { toolsState } from './context/tools.svelte';
  import AppModal from './components/dialogs/AppModal.svelte';
  import { updateState } from './context/update.svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';

  let showOperationsCloseDialog = $state(false);
  let closingWithOperations = $state(false);

  function updaterStatusLabel() {
    if (updateState.status === 'downloading') {
      return updateState.totalBytes ? `${m.updater_status_downloading()} (${updateState.progress}%)` : m.updater_status_downloading();
    }
    return '';
  }

  async function confirmCloseWithOperations() {
    if (closingWithOperations) return;
    closingWithOperations = true;
    try {
      await invoke('confirm_close_with_operations');
    } finally {
      closingWithOperations = false;
    }
  }

  onMount(() => {
    // Initialize global singletons
    const cleanupTheme = initThemeEffects();
    let cleanupCloseRequest: (() => void) | undefined;
    listen('operations-close-requested', () => {
      showOperationsCloseDialog = true;
    }).then(unlisten => {
      cleanupCloseRequest = unlisten;
    });
    devicesState.init();
    toolsState.init();
    if (!import.meta.env.VITE_STORE_BUILD && !(window as any).__APP_SETTINGS__?.packaged) {
      updateState.init();
    }

    return () => {
      cleanupTheme();
      cleanupCloseRequest?.();
      devicesState.destroy();
      toolsState.destroy();
    };
  });
</script>

{#if i18n.loaded && themeState.loaded}
  <MaterialWebEnhancer />
  {#key i18n.language}
    <AppLayout />
  {/key}
  
  {#if updateState.hasUpdate}
    <AppModal
      open={updateState.showUpdateDialog}
      title={m.updater_availableTitle()}
      onClose={() => updateState.showUpdateDialog = false}
      width="compact"
    >
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <p style="margin: 0; color: var(--on-surface-variant); line-height: 1.5; white-space: pre-wrap;">
          {m.updater_availableMessage({ 
            newVersion: updateState.updateInfo!.version,
            currentVersion: updateState.currentVersion 
          })}
        </p>
        {#if updaterStatusLabel()}
          <div style="display: flex; align-items: center; gap: 10px; color: var(--md-sys-color-primary);">
            <md-circular-progress indeterminate></md-circular-progress>
            <span>{updaterStatusLabel()}</span>
          </div>
        {/if}
        {#if updateState.error}
          <p style="margin: 0; color: var(--md-sys-color-error); line-height: 1.5; white-space: pre-wrap;">
            {m.updater_error({ error: updateState.error })}
          </p>
        {/if}
      </div>
      {#snippet actions()}
        <md-text-button disabled={updateState.busy ? true : undefined} onclick={() => openUrl('https://github.com/kyro206/ADB-App/blob/main/CHANGELOG.md')}>
          {m.updater_changelog()}
        </md-text-button>
        <md-filled-button disabled={updateState.busy ? true : undefined} onclick={async () => await updateState.install()}>
          {updateState.busy ? m.updater_status_downloading() : m.updater_updateNow()}
        </md-filled-button>
      {/snippet}
    </AppModal>
  {/if}

  <AppModal
    open={showOperationsCloseDialog}
    title={m.operations_close_title()}
    onClose={() => showOperationsCloseDialog = false}
    width="compact"
    cancelDisabled={closingWithOperations}
  >
    <p style="margin: 0; color: var(--on-surface-variant); line-height: 1.5;">
      {m.operations_close_message()}
    </p>
    {#snippet actions()}
      <md-filled-button disabled={closingWithOperations ? true : undefined} onclick={confirmCloseWithOperations}>
        {m.operations_close_confirm()}
      </md-filled-button>
    {/snippet}
  </AppModal>
{/if}
