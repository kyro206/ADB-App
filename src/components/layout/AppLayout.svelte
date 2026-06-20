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
  import { layoutState } from '../../context/layout.svelte';

  let activeTab = $derived(layoutState.activeTab);
  let adbAvailable = $derived(toolsState.status?.adb.available ?? true);
  let showAdbModal = $state(false);
  let adbWarningShown = false;
  let pageElement: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (toolsState.status && !adbAvailable && !adbWarningShown) {
      showAdbModal = true;
      adbWarningShown = true;
    }
  });

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
