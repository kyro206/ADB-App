export type TabId = 'home' | 'display' | 'mirroring' | 'control' | 'apps' | 'files' | 'system' | 'settings';
class LayoutState {
  activeTab = $state<TabId>('home');
}

export const layoutState = new LayoutState();
