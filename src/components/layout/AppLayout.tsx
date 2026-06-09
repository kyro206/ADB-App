import { useEffect, useRef, useState } from 'react';
import { Sidebar, TabId } from './Sidebar';
import { TopBar } from './TopBar';
import { HomePage } from '../../pages/HomePage';
import { WorkbenchPage } from '../../pages/WorkbenchPage';
import { useDevices } from '../../context/DeviceContext';
import './AppLayout.css';

export function AppLayout() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const pageRef = useRef<HTMLDivElement>(null);
  const { refreshDevices } = useDevices();

  useEffect(() => {
    refreshDevices();
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
      <TopBar />
      <div className="app-layout__body">
        <Sidebar activeTab={activeTab} onTabChange={changeTab} />
        <main className="app-layout__content">
          <div ref={pageRef} className="app-layout__page">
            {activeTab === 'home' ? <HomePage /> : <WorkbenchPage tab={activeTab} />}
          </div>
        </main>
      </div>
    </div>
  );
}
