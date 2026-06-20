<script lang="ts">
import * as m from './paraglide/messages';

  import { onMount } from 'svelte';
  
  import MaterialWebEnhancer from './components/MaterialWebEnhancer.svelte';
  import AppLayout from './components/layout/AppLayout.svelte';
  import { i18n } from './context/i18n.svelte';
  import { themeState, initThemeEffects } from './context/theme.svelte';
  import { devicesState } from './context/devices.svelte';
  import AppModal from './components/dialogs/AppModal.svelte';
  import { updateState } from './context/update.svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';

  function updaterStatusLabel() {
    if (updateState.status === 'downloading') {
      return updateState.totalBytes ? `${m.updater_status_downloading()} (${updateState.progress}%)` : m.updater_status_downloading();
    }
    if (updateState.status === 'installing') return m.updater_status_installing();
    if (updateState.status === 'restarting') return m.updater_status_restarting();
    return '';
  }

  onMount(() => {
    // Initialize global singletons
    const cleanupTheme = initThemeEffects();
    devicesState.init();
    if (!import.meta.env.VITE_STORE_BUILD && !(window as any).__APP_SETTINGS__?.packaged) {
      updateState.init();
    }

    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si no es producción, salir de la función y permitir todo
      if (!import.meta.env.PROD) return;
      
      const key = e.key.toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (
        key === 'f5' ||
        key === 'f3' ||
        key === 'f7' ||
        (ctrlOrMeta && key === 'r') ||
        (ctrlOrMeta && key === 'f') ||
        (ctrlOrMeta && key === 'p') ||
        (ctrlOrMeta && e.shiftKey && (key === 'j' || key === 'c')) ||
        (ctrlOrMeta && e.altKey && (key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      cleanupTheme();
      devicesState.destroy();
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
{/if}
