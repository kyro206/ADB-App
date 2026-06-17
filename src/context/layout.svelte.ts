import type { TabId } from '../components/layout/Sidebar.svelte';

class LayoutState {
  activeTab = $state<TabId>('home');
}

export const layoutState = new LayoutState();
