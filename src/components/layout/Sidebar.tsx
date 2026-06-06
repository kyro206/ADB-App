import { useState } from 'react';
import { useI18n } from '../../i18n';
import './Sidebar.css';

export type TabId = 'home' | 'display' | 'mirroring' | 'control' | 'apps' | 'files' | 'system' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TAB_ICONS: Record<TabId, string> = {
  home: '⌂',
  display: '▣',
  mirroring: '◫',
  control: '⌨',
  apps: '⊞',
  files: '📁',
  system: '⚙',
  settings: '☰',
};

const NAV_TABS: TabId[] = ['home', 'display', 'mirroring', 'control', 'apps', 'files', 'system'];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const tabLabels: Record<TabId, string> = {
    home: t('nav.home'),
    display: t('nav.display'),
    mirroring: t('nav.mirroring'),
    control: t('nav.control'),
    apps: t('nav.apps'),
    files: t('nav.files'),
    system: t('nav.system'),
    settings: t('nav.settings'),
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__nav">
        {NAV_TABS.map(tab => (
          <button
            key={tab}
            className={`sidebar__tab ${activeTab === tab ? 'sidebar__tab--active' : ''}`}
            onClick={() => onTabChange(tab)}
            title={tabLabels[tab]}
          >
            <span className="sidebar__tab-icon">{TAB_ICONS[tab]}</span>
            {!collapsed && <span className="sidebar__tab-label">{tabLabels[tab]}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar__footer">
        <button
          className={`sidebar__tab ${activeTab === 'settings' ? 'sidebar__tab--active' : ''}`}
          onClick={() => onTabChange('settings')}
          title={tabLabels.settings}
        >
          <span className="sidebar__tab-icon">{TAB_ICONS.settings}</span>
          {!collapsed && <span className="sidebar__tab-label">{tabLabels.settings}</span>}
        </button>

        <button
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className="sidebar__collapse-icon">
            {collapsed ? '»' : '«'}
          </span>
        </button>
      </div>
    </aside>
  );
}
