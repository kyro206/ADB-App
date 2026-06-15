<script lang="ts">
  import { onMount } from 'svelte';
  import { check } from '@tauri-apps/plugin-updater';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { relaunch } from '@tauri-apps/plugin-process';
  
  import MaterialWebEnhancer from './components/MaterialWebEnhancer.svelte';
  import AppLayout from './components/layout/AppLayout.svelte';
  import { i18n } from './locales/index.svelte';
  import { themeState, initThemeEffects } from './context/theme.svelte';
  import { devicesState } from './context/devices.svelte';

  onMount(() => {
    // Initialize global singletons
    const cleanupTheme = initThemeEffects();
    devicesState.init();

    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          const yes = await ask(
            i18n.t('updater.availableMessage', { version: update.version }),
            { 
              title: i18n.t('updater.availableTitle'),
              kind: 'info',
              okLabel: i18n.t('updater.updateNow'),
              cancelLabel: i18n.t('updater.later')
            }
          );
          if (yes) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch (error) {}
    };
    checkForUpdates();

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
  <AppLayout />
{/if}
