import { useState, useEffect } from 'react';
import { useI18n } from '../../locales';
import { MaterialIcon } from '../MaterialIcon';
import './Sidebar.css';

export type TabId = 'home' | 'display' | 'mirroring' | 'control' | 'apps' | 'files' | 'system' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  adbAvailable?: boolean;
}

const TAB_ICONS: Record<TabId, string> = {
  home: 'home', display: 'display_settings', mirroring: 'cast', control: 'remote_gen',
  apps: 'apps', files: 'folder', system: 'android', settings: 'settings',
};

const NAV_TABS: TabId[] = ['home', 'display', 'mirroring', 'control', 'apps', 'files', 'system'];

export function Sidebar({ activeTab, onTabChange, adbAvailable = true }: SidebarProps) {
  const { t } = useI18n();
  const [transferState, setTransferState] = useState({ hasError: false, isTransferring: false });

  useEffect(() => {
    const handleTransferBadge = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTransferState(detail);
    };
    window.addEventListener('transfer-badge-update', handleTransferBadge);
    return () => window.removeEventListener('transfer-badge-update', handleTransferBadge);
  }, []);

  const labels: Record<TabId, string> = {
    home: t('nav.home'), display: t('nav.display'), mirroring: t('nav.mirroring'), control: t('nav.control'),
    apps: t('nav.apps'), files: t('nav.files'), system: t('nav.system'), settings: t('nav.settings'),
  };
  const item = (tab: TabId) => <button key={tab} data-no-material-ripple="true" className={`sidebar__tab ${activeTab === tab ? 'sidebar__tab--active' : ''}`} onClick={() => onTabChange(tab)} title={labels[tab]}>
    <span className="sidebar__tab-icon">
      <MaterialIcon name={TAB_ICONS[tab]} filled={activeTab === tab} />
      {tab === 'settings' && !adbAvailable && <div className="sidebar__badge error" />}
      {tab === 'files' && (transferState.hasError || transferState.isTransferring) && (
        <div className={`sidebar__badge ${transferState.hasError ? 'error' : 'blue'}`} />
      )}
    </span>
    <span className="sidebar__tab-label">{labels[tab]}</span>
  </button>;

  return <aside className="sidebar">
    <nav className="sidebar__nav">{NAV_TABS.map(item)}</nav>
    <footer className="sidebar__footer">
      {item('settings')}
    </footer>
  </aside>;
}
