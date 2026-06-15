<script lang="ts" module>
import * as m from '../../paraglide/messages';

  export type TabId = 'home' | 'display' | 'mirroring' | 'control' | 'apps' | 'files' | 'system' | 'settings';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import './Sidebar.css';

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
        {/if}
      </span>
      <span class="sidebar__tab-label">{labels['settings']}</span>
    </button>
  </footer>
</aside>
