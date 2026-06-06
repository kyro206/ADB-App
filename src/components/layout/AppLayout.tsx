import { useEffect, useState } from 'react';
import { Sidebar, TabId } from './Sidebar';
import { TopBar } from './TopBar';
import { HomePage } from '../../pages/HomePage';
import { WorkbenchPage } from '../../pages/WorkbenchPage';
import { useDevices } from '../../context/DeviceContext';
import './AppLayout.css';

export function AppLayout() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const { refreshDevices } = useDevices();

  useEffect(() => {
    refreshDevices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-layout">
      <TopBar />
      <div className="app-layout__body">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="app-layout__content">
          {activeTab === 'home' ? <HomePage /> : <WorkbenchPage tab={activeTab} />}
        </main>
      </div>
    </div>
  );
}
