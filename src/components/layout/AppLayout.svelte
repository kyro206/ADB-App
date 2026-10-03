<script lang="ts">
  import * as m from '../../paraglide/messages';

  import { onMount } from 'svelte';
  import type { TabId } from '../../context/layout.svelte';
  import Sidebar from './Sidebar.svelte';
  import TopBar from './TopBar.svelte';
  import AppModal from '../dialogs/AppModal.svelte';
  import { applyWindowEffectClass } from '../../context/windowEffects';
  import { toolsState } from '../../context/tools.svelte';

  import HomePage from '../../pages/HomePage.svelte';
  import WorkbenchPage from '../../pages/WorkbenchPage.svelte';
  import OperationsMenu from './OperationsMenu.svelte';
  import { layoutState } from '../../context/layout.svelte';

  let activeTab = $derived(layoutState.activeTab);
  let adbAvailable = $derived(toolsState.status?.adb.available ?? true);
  let showAdbModal = $state(false);
  let adbWarningShown = false;
  let pageElement: HTMLDivElement | undefined = $state();

  let showOutdatedModal = $state(false);
  let outdatedWarningShown = false;
  let ignoreOutdatedWarning = $state(false);

  function parseVersion(version: string): number[] {
    const match = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1] || '0', 10), parseInt(match[2] || '0', 10), parseInt(match[3] || '0', 10)];
  }

  function isVersionOlder(version: string, minVersion: string): boolean {
    const v1 = parseVersion(version);
    const v2 = parseVersion(minVersion);
    for (let i = 0; i < 3; i++) {
      if (v1[i] < v2[i]) return true;
      if (v1[i] > v2[i]) return false;
    }
    return false;
  }

  $effect(() => {
    if (toolsState.status) {
      if (!adbAvailable && !adbWarningShown) {
        showAdbModal = true;
        adbWarningShown = true;
      } else if (adbAvailable && toolsState.status.scrcpy.available && !showAdbModal && !outdatedWarningShown) {
        const adbVersion = toolsState.status.adb.version;
        const scrcpyVersion = toolsState.status.scrcpy.version;
        const ignore = (window as any).__APP_SETTINGS__?.ignore_outdated_warning === true;

        if (!ignore && (isVersionOlder(adbVersion, '37.0.1') || isVersionOlder(scrcpyVersion, '4.0'))) {
          showOutdatedModal = true;
          outdatedWarningShown = true;
        } else {
          outdatedWarningShown = true;
        }
      }
    }
  });

async function closeOutdatedModal() {
  showOutdatedModal = false;
  if (ignoreOutdatedWarning) {
    if ((window as any).__APP_SETTINGS__) {
      (window as any).__APP_SETTINGS__.ignore_outdated_warning = true;
    }
    try {
      const result: any = await invoke('get_app_settings');
      const settings = result.settings;
      settings.ignore_outdated_warning = true;
      await invoke('save_app_settings', { settings });
    } catch (e) {
    }
  }
}

  function changeTab(tab: TabId) {
    if (tab === activeTab) return;
    layoutState.activeTab = tab;
  }

  let isFirstTabEffect = true;
  $effect(() => {
    activeTab;
    if (isFirstTabEffect) {
      isFirstTabEffect = false;
      return;
    }
    if (pageElement && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pageElement.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' },
      );
    }
  });

  onMount(() => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('win')) {
      document.documentElement.classList.add('platform-windows');
    } else if (platform.includes('mac')) {
      document.documentElement.classList.add('platform-macos');
    }
    applyWindowEffectClass((window as any).__APP_SETTINGS__);

    let lastTabChangeTime = 0;
    const tabOrder: TabId[] = ['home', 'display', 'mirroring', 'control', 'apps', 'files', 'system', 'settings'];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();

        const now = Date.now();
        if (e.repeat && now - lastTabChangeTime < 250) {
          return;
        }
        lastTabChangeTime = now;

        const currentIndex = tabOrder.indexOf(activeTab);
        if (currentIndex === -1) return;

        let nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= tabOrder.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = tabOrder.length - 1;

        changeTab(tabOrder[nextIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<TabId>;
      changeTab(customEvent.detail);
    };
    window.addEventListener('change-tab', handleTabChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('change-tab', handleTabChange);
    };
  });
</script>

<div class="app-layout">
  <TopBar {adbAvailable} />
  <div class="app-layout__body">
    <Sidebar {activeTab} onTabChange={changeTab} {adbAvailable} />
    <main class="app-layout__content">
      <div bind:this={pageElement} class="app-layout__page">
        {#if activeTab === 'home'}
          <HomePage />
        {:else}
          <WorkbenchPage tab={activeTab} />
        {/if}
      </div>
    </main>
  </div>
  
  <OperationsMenu />
  
  <AppModal 
    open={showAdbModal} 
    onClose={() => showAdbModal = false} 
    title={m.dialog_missingTool_title({ tool: 'ADB' })}
  >
    <p>{m.dialog_missingTool_adbDesc()}</p>
    {#snippet actions()}
      <md-filled-button onclick={() => { showAdbModal = false; changeTab('settings'); }}>
        {m.dialog_missingTool_goToSettings()}
      </md-filled-button>
    {/snippet}
  </AppModal>

  <AppModal
    open={showOutdatedModal}
    onClose={closeOutdatedModal}
    title={m.dialog_outdatedTool_title()}
  >
    <p>{m.dialog_outdatedTool_desc()}</p>
    <label style="display: flex; align-items: center; gap: 8px; margin-top: 16px; cursor: pointer;">
      <md-checkbox
        checked={ignoreOutdatedWarning}
        onchange={(e: Event) => ignoreOutdatedWarning = (e.target as HTMLInputElement).checked}
      ></md-checkbox>
      <span>{m.dialog_outdatedTool_ignore_label()}</span>
    </label>
    {#snippet actions()}
      <md-filled-button onclick={() => {closeOutdatedModal(); changeTab('settings')}}>
        {m.dialog_missingTool_goToSettings()}
      </md-filled-button>
    {/snippet}
  </AppModal>
</div>

<style>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg);
}

.app-layout__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-container-low);
}

.app-layout__content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--bg);
  border-top: 1px solid var(--outline-variant);
  border-left: 1px solid var(--outline-variant);
  border-radius: 8px 0 0;
}

.app-layout__page {
  width: 100%;
  height: 100%;
}
</style>
