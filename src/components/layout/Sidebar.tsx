import { useState } from 'react';
import { useI18n } from '../../i18n';
import { MaterialIcon } from '../MaterialIcon';
import './Sidebar.css';

export type TabId = 'home' | 'display' | 'mirroring' | 'control' | 'apps' | 'files' | 'system' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TAB_ICONS: Record<TabId, string> = {
  home: 'home',
  display: 'display_settings',
  mirroring: 'cast',
  control: 'remote_gen',
  apps: 'apps',
  files: 'folder',
  system: 'manufacturing',
  settings: 'settings',
};

const NAV_TABS: TabId[] = ['home', 'display', 'mirroring', 'control', 'apps', 'files', 'system'];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const tabLabels: Record<TabId, string> = {
    home: t('nav.home'), display: t('nav.display'), mirroring: t('nav.mirroring'), control: t('nav.control'),
    apps: t('nav.apps'), files: t('nav.files'), system: t('nav.system'), settings: t('nav.settings'),
  };

  const item = (tab: TabId) => <button key={tab} className={`sidebar__tab ${activeTab === tab ? 'sidebar__tab--active' : ''}`} onClick={() => onTabChange(tab)} title={tabLabels[tab]}>
    <span className="sidebar__tab-icon"><MaterialIcon name={TAB_ICONS[tab]} filled={activeTab === tab} /></span>
    {!collapsed && <span className="sidebar__tab-label">{tabLabels[tab]}</span>}
  </button>;

  return <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
    <div className="sidebar__nav">{NAV_TABS.map(item)}</div>
    <div className="sidebar__footer">
      {item('settings')}
      <button className="sidebar__collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'}>
        <MaterialIcon name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} />
      </button>
    </div>
  </aside>;
}
