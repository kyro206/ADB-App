<script lang="ts">
import * as m from './paraglide/messages';

  import { onMount } from 'svelte';
  import { check } from '@tauri-apps/plugin-updater';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { relaunch } from '@tauri-apps/plugin-process';
  
  import MaterialWebEnhancer from './components/MaterialWebEnhancer.svelte';
  import AppLayout from './components/layout/AppLayout.svelte';
  import { i18n } from './context/i18n.svelte';
  import { themeState, initThemeEffects } from './context/theme.svelte';
  import { devicesState } from './context/devices.svelte';
  import AppModal from './components/dialogs/AppModal.svelte';
  import { updateState } from './context/update.svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';

  onMount(() => {
    // Initialize global singletons
    const cleanupTheme = initThemeEffects();
    devicesState.init();
    updateState.init();

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F5' || 
        e.key === 'F3' ||
        e.key === 'F7' ||
        ((e.ctrlKey || e.metaKey) && e.key === 'r') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'R') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'f') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'F') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'p') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'P')
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
      </div>
      {#snippet actions()}
        <md-text-button onclick={() => openUrl('https://github.com/kyro206/ADB-App/blob/main/CHANGELOG.md')}>
          {m.updater_changelog()}
        </md-text-button>
        <md-filled-button onclick={async () => await updateState.install()}>
          {m.updater_updateNow()}
        </md-filled-button>
      {/snippet}
    </AppModal>
  {/if}
{/if}
