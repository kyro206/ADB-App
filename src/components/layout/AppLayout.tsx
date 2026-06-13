import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar, TabId } from './Sidebar';
import { TopBar } from './TopBar';
import type { ToolsStatus } from '../../pages/workbench/types';
import { AppModal } from '../dialogs/AppModal';
import { useI18n } from '../../locales';
import { HomePage } from '../../pages/HomePage';
import { WorkbenchPage } from '../../pages/WorkbenchPage';
import { useDevices } from '../../context/DeviceContext';
import './AppLayout.css';

export function AppLayout() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [adbAvailable, setAdbAvailable] = useState(true);
  const [showAdbModal, setShowAdbModal] = useState(false);
  const adbWarningShown = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const { refreshDevices } = useDevices();

  const checkAdb = useCallback(async () => {
    try {
      const tools = await invoke<ToolsStatus>('get_tools_status');
      setAdbAvailable(tools.adb.available);
      if (!tools.adb.available && !adbWarningShown.current) {
        setShowAdbModal(true);
        adbWarningShown.current = true;
      }
    } catch {
      setAdbAvailable(false);
      if (!adbWarningShown.current) {
        setShowAdbModal(true);
        adbWarningShown.current = true;
      }
    }
  }, []);

  useEffect(() => {
    checkAdb();
    window.addEventListener('focus', checkAdb);
    return () => window.removeEventListener('focus', checkAdb);
  }, [checkAdb]);

  useEffect(() => {
    refreshDevices();
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('win')) {
      document.documentElement.classList.add('platform-windows');
    } else if (platform.includes('mac')) {
      document.documentElement.classList.add('platform-macos');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
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

        setActiveTab((current) => {
          const currentIndex = tabOrder.indexOf(current);
          if (currentIndex === -1) return current;

          let nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
          if (nextIndex >= tabOrder.length) nextIndex = 0;
          if (nextIndex < 0) nextIndex = tabOrder.length - 1;

          return tabOrder[nextIndex];
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    pageRef.current?.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'both' },
    );
  }, [activeTab]);

  const changeTab = (tab: TabId) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  return (
    <div className="app-layout">
      <TopBar adbAvailable={adbAvailable} />
      <div className="app-layout__body">
        <Sidebar activeTab={activeTab} onTabChange={changeTab} adbAvailable={adbAvailable} />
        <main className="app-layout__content">
          <div ref={pageRef} className="app-layout__page">
            {activeTab === 'home' ? <HomePage /> : <WorkbenchPage tab={activeTab} />}
          </div>
        </main>
      </div>
      <AppModal 
        open={showAdbModal} 
        onClose={() => setShowAdbModal(false)} 
        title={t('dialog.missingTool.title', { tool: 'ADB' })}
        actions={<>
          <md-filled-button onClick={() => { setShowAdbModal(false); changeTab('settings'); }}>{t('dialog.missingTool.goToSettings')}</md-filled-button>
        </>}
      >
        <p>{t('dialog.missingTool.adbDesc')}</p>
      </AppModal>
    </div>
  );
}
