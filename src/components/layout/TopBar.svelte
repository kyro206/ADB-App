<script lang="ts">
import * as m from '../../paraglide/messages';

  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getName } from '@tauri-apps/api/app';
  import { devicesState } from '../../context/devices.svelte';
  
  import WirelessDialog from '../dialogs/WirelessDialog.svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  import DeviceSelector from './DeviceSelector.svelte';
  import './TopBar.css';

  let { adbAvailable = true } = $props<{ adbAvailable?: boolean }>();

  type DesktopPlatform = 'windows' | 'macos' | 'linux';

  function detectPlatform(): DesktopPlatform {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('linux')) return 'linux';
    return 'windows';
  }

  let wirelessOpen = $state(false);
  let tcpipBusy = $state(false);
  let maximized = $state(false);
  let appName = $state('ADB App');
  
  const platform = detectPlatform();
  const appWindow = getCurrentWindow();

  onMount(() => {
    getName().then(name => appName = name).catch(() => {});
    appWindow.isMaximized().then(m => maximized = m);
    
    let unlistenFn: (() => void) | null = null;
    appWindow.onResized(() => {
      appWindow.isMaximized().then(m => maximized = m);
    }).then(unlisten => {
      unlistenFn = unlisten;
    });
    
    return () => { 
      if (unlistenFn) unlistenFn(); 
    };
  });

  async function connectUsbOverTcpip() {
    if (!devicesState.selectedDevice || tcpipBusy) return;
    tcpipBusy = true;
    try {
      await invoke<string>('connect_usb_over_tcpip', { serial: devicesState.selectedDevice.serial });
      await devicesState.refreshDevices();
    } finally {
      tcpipBusy = false;
    }
  }

  async function handleDisconnect(serial: string) {
    await invoke('disconnect_wireless_device', { endpoint: serial });
    await devicesState.refreshDevices();
  }
</script>

<header class="topbar topbar--{platform}" data-tauri-drag-region ondblclick={() => appWindow.toggleMaximize()}>
  {#if platform !== 'macos'}
    <div class="topbar__identity" data-tauri-drag-region>
      <img src="/icon.webp" alt="" />
      <h1 data-tauri-drag-region>{appName}</h1>
    </div>
  {/if}
  
  <div class="topbar__drag-zone" data-tauri-drag-region></div>
  
  <div class="topbar__device-section" ondblclick={e => e.stopPropagation()}>
    <button 
      class="topbar__tcpip" 
      disabled={!devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device' || (devicesState.selectedDevice.serial.includes(':') || devicesState.selectedDevice.serial.includes('._tcp')) || tcpipBusy} 
      onclick={connectUsbOverTcpip} 
      title={m.topbar_tcpip_tooltip()}
    >
      <MaterialIcon name="usb" />
      <MaterialIcon name="arrow_forward" />
      <MaterialIcon name="wifi" />
    </button>
    
    <DeviceSelector 
      devices={devicesState.devices} 
      selectedDevice={devicesState.selectedDevice} 
      loading={devicesState.loading} 
      loadingLabel={m.common_loading()} 
      emptyLabel={m.common_device_empty_title()} 
      onSelect={(serial) => devicesState.selectDevice(serial)} 
      onDisconnect={handleDisconnect} 
    />
    
    <button 
      class="topbar__wireless {wirelessOpen ? 'active' : ''}" 
      onclick={() => wirelessOpen = true} 
      title={m.topbar_wireless_tooltip()} 
      disabled={!adbAvailable}
    >
      <MaterialIcon name="add" />
    </button>
  </div>
  
  <div class="topbar__drag-zone" data-tauri-drag-region></div>
  
  {#if platform !== 'macos'}
    <div class="topbar__window-controls">
      <button class="topbar__window-control minimize" onclick={() => appWindow.minimize()} title={m.topbar_window_minimize()}>
        <MaterialIcon name="remove" />
      </button>
      <button class="topbar__window-control maximize" onclick={async () => { await appWindow.toggleMaximize(); maximized = await appWindow.isMaximized(); }} title={maximized ? m.topbar_window_restore() : m.topbar_window_maximize()}>
        <MaterialIcon name={maximized ? 'filter_none' : 'crop_square'} />
      </button>
      <button class="topbar__window-control close" onclick={() => appWindow.close()} title={m.topbar_window_close()}>
        <MaterialIcon name="close" />
      </button>
    </div>
  {/if}
</header>

<WirelessDialog open={wirelessOpen} onClose={() => {
  wirelessOpen = false;
  devicesState.refreshDevices();
}} />
