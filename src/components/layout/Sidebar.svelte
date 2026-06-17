<script lang="ts" module>
import * as m from '../../paraglide/messages';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { TabId } from '../../context/layout.svelte';
  import { updateState } from '../../context/update.svelte';
  
  import MaterialIcon from '../MaterialIcon.svelte';
  let {
    activeTab,
    onTabChange,
    adbAvailable = true
  } = $props<{
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    adbAvailable?: boolean;
  }>();

  let transferState = $state({ hasError: false, isTransferring: false });

  onMount(() => {
    const handleTransferBadge = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      transferState = detail;
    };
    window.addEventListener('transfer-badge-update', handleTransferBadge);
    return () => window.removeEventListener('transfer-badge-update', handleTransferBadge);
  });

  const TAB_ICONS: Record<TabId, string> = {
    home: 'home', display: 'display_settings', mirroring: 'cast', control: 'remote_gen',
    apps: 'apps', files: 'folder', system: 'android', settings: 'settings',
  };

  const NAV_TABS: TabId[] = ['home', 'display', 'mirroring', 'control', 'apps', 'files', 'system'];

  let labels = $derived({
    home: m.nav_home(), display: m.nav_display(), mirroring: m.nav_mirroring(), control: m.nav_control(),
    apps: m.nav_apps(), files: m.nav_files(), system: m.nav_system(), settings: m.nav_settings(),
  });
</script>

<aside class="sidebar">
  <nav class="sidebar__nav">
    {#each NAV_TABS as tab}
      <button 
        data-no-material-ripple="true" 
        class="sidebar__tab {activeTab === tab ? 'sidebar__tab--active' : ''}" 
        onclick={() => onTabChange(tab)} 
        title={labels[tab]}
      >
        <span class="sidebar__tab-icon">
          <MaterialIcon name={TAB_ICONS[tab]} filled={activeTab === tab} />
          {#if tab === 'files' && (transferState.hasError || transferState.isTransferring)}
            <div class="sidebar__badge {transferState.hasError ? 'error' : 'blue'}"></div>
          {/if}
        </span>
        <span class="sidebar__tab-label">{labels[tab]}</span>
      </button>
    {/each}
  </nav>
  <footer class="sidebar__footer">
    <button 
      data-no-material-ripple="true" 
      class="sidebar__tab {activeTab === 'settings' ? 'sidebar__tab--active' : ''}" 
      onclick={() => onTabChange('settings')} 
      title={labels['settings']}
    >
      <span class="sidebar__tab-icon">
        <MaterialIcon name={TAB_ICONS['settings']} filled={activeTab === 'settings'} />
        {#if !adbAvailable}
          <div class="sidebar__badge error"></div>
        {:else if updateState.hasUpdate}
          <div class="sidebar__badge blue"></div>
        {/if}
      </span>
      <span class="sidebar__tab-label">{labels['settings']}</span>
    </button>
  </footer>
</aside>

<style>
.sidebar{display:flex;flex-direction:column;flex:0 0 112px;width:112px;height:100%;padding:14px 8px 12px;background:var(--surface-container-low);overflow:hidden}.sidebar__nav{display:flex;min-height:0;flex:1;flex-direction:column;align-items:center;gap:4px;overflow:hidden;padding:3px 0;scrollbar-width:none}.sidebar__nav::-webkit-scrollbar{display:none}.sidebar__footer{display:flex;flex-direction:column;align-items:center;padding-top:12px;overflow:hidden}.sidebar__tab{position:relative;display:flex;width:96px;min-height:74px;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:7px 3px;color:var(--on-surface-variant);border-radius:18px;overflow:hidden}.sidebar__tab-icon{position:relative;z-index:1;display:grid;place-items:center;width:56px;height:32px;border-radius:var(--radius-full);transition:background-color var(--transition-fast),color var(--transition-fast)}.sidebar__tab-icon :global(.material-symbols-rounded){font-size:26px}.sidebar__tab-label{position:relative;z-index:1;max-width:92px;overflow:hidden;text-overflow:ellipsis;color:inherit;font-size:12px;font-weight:600;line-height:1.15;text-align:center;white-space:nowrap}.sidebar__tab:not(.sidebar__tab--active):hover .sidebar__tab-icon{color:var(--on-surface);background:color-mix(in srgb,var(--on-surface) 8%,transparent)}.sidebar__tab--active{color:var(--on-surface)}.sidebar__tab--active .sidebar__tab-icon{color:var(--on-primary-container);background:var(--primary-container)}.sidebar__tab--active .sidebar__tab-label{font-weight:700}@media(max-height:720px){.sidebar__tab{min-height:62px}.sidebar__tab-icon{height:28px}.sidebar__tab-icon :global(.material-symbols-rounded){font-size:23px}.sidebar__tab-label{font-size:11px}.sidebar__footer{padding-top:6px}}
.sidebar__badge { position: absolute; top: 4px; right: 14px; width: 10px; height: 10px; background-color: var(--md-sys-color-error); border-radius: 50%; border: 2px solid var(--surface-container-low); }
.sidebar__badge.blue { background-color: var(--md-sys-color-primary); }
.sidebar__badge.error { background-color: var(--md-sys-color-error); }
</style>
