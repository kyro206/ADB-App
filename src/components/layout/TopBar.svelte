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
  import Logo from '../Logo.svelte';
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

<header class="topbar topbar--{platform}" data-tauri-drag-region>
  {#if platform !== 'macos'}
    <div class="topbar__identity" data-tauri-drag-region>
      <Logo size={26} />
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

<style>
:global {
.topbar {
  position: relative;
  display: flex;
  align-items: center;
  height: var(--topbar-height);
  min-height: var(--topbar-height);
  padding: 0;
  background: var(--surface-container-low);
  z-index: 100;
  user-select: none;
}

.topbar__identity{display:flex;align-items:center;flex:0 0 160px;gap:8px;padding-left:12px;font-weight:700}.topbar__identity img{width:28px;height:28px;object-fit:contain}.topbar__identity h1{font-size:13px;font-weight:700;white-space:nowrap}.topbar__drag-zone{align-self:stretch;flex:1;min-width:55px}
.topbar__tcpip,.topbar__wireless,.topbar__action-btn{display:flex;align-items:center;justify-content:center;height:30px;color:var(--on-surface-variant);background:var(--surface-container-high);border:0;border-radius:var(--radius-full)}
.topbar__tcpip{gap:2px;width:82px;padding:0 8px;white-space:nowrap}.topbar__tcpip :global(.material-symbols-rounded){font-size:17px}.topbar__tcpip :global(.material-symbols-rounded):nth-of-type(2){font-size:13px}.topbar__tcpip:hover:not(:disabled),.topbar__wireless:hover,.topbar__wireless.active,.topbar__action-btn:hover:not(:disabled){color:var(--on-primary-container);background:var(--primary-container)}
.topbar__wireless,.topbar__action-btn{flex:0 0 30px;width:30px}

.topbar__device-section {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: calc(100% - 410px);
}

.topbar-device-picker{position:relative;width:clamp(250px,28vw,340px)}
.topbar-device-picker__field{position:relative;display:grid;width:100%;height:30px;grid-template-columns:18px minmax(0,1fr) 6px 18px;align-items:center;gap:8px;padding:0 10px;overflow:hidden;color:var(--on-surface);background:var(--surface-container-high);border:1px solid transparent;border-radius:var(--radius-full);text-align:left;transition:background-color var(--transition-fast),border-color var(--transition-fast)}
.topbar-device-picker__field:hover:not(:disabled),.topbar-device-picker__field.open{background:var(--surface-container-highest)}
.topbar-device-picker__field.open{border-color:var(--primary)}
.topbar-device-picker__field:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.topbar-device-picker__field>:global(.material-symbols-rounded){font-size:17px;color:var(--on-surface-variant)}
.topbar-device-picker__field.open>:global(.material-symbols-rounded):first-child{color:var(--primary)}
.topbar-device-picker__label{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600;text-align:center;white-space:nowrap}
.topbar-device-picker__status{width:6px;height:6px;background:var(--outline);border-radius:50%}.topbar-device-picker__status.connected{background:var(--color-green)}
.topbar-device-picker__arrow{transition:transform var(--transition-fast)}.topbar-device-picker__field.open .topbar-device-picker__arrow{transform:rotate(180deg)}
.topbar-device-picker__menu{max-width:calc(100vw - 24px);--md-menu-container-color:var(--surface-container-high);--md-menu-container-shape:14px;--md-menu-top-space:6px;--md-menu-bottom-space:6px;--md-menu-item-two-line-container-height:52px;--md-menu-item-top-space:5px;--md-menu-item-bottom-space:5px;--md-menu-item-leading-space:11px;--md-menu-item-trailing-space:11px;--md-menu-item-label-text-color:var(--on-surface);--md-menu-item-label-text-size:12px;--md-menu-item-label-text-line-height:15px;--md-menu-item-supporting-text-color:var(--on-surface-variant);--md-menu-item-supporting-text-size:10px;--md-menu-item-supporting-text-line-height:13px;--md-menu-item-leading-icon-color:var(--on-surface-variant);--md-menu-item-trailing-icon-color:var(--primary);--md-menu-item-selected-container-color:var(--primary-container);--md-menu-item-selected-label-text-color:var(--on-primary-container)}
.topbar-device-picker__option :global(.material-symbols-rounded){font-size:18px}

.topbar__action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.topbar__window-controls{display:flex;align-self:stretch;margin-left:auto}.topbar__window-control{display:grid;place-items:center;width:46px;color:var(--on-surface-variant);border-radius:0}.topbar__window-control:hover{background:var(--surface-container-high)}.topbar__window-control.close:hover{color:#fff;background:#c42b1c}.topbar__window-control :global(.material-symbols-rounded){font-size:17px}

.topbar__refresh-icon {
  display: inline-block;
  transition: transform var(--transition-base);
}

.topbar__refresh-icon--spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media(max-width:1100px){.topbar-device-picker{width:clamp(220px,28vw,290px)}}@media(max-width:980px){.topbar__identity{flex-basis:52px}.topbar__device-section{max-width:calc(100% - 220px)}.topbar-device-picker{width:clamp(190px,28vw,250px)}}@media(max-width:720px){.topbar__tcpip{width:38px}.topbar__tcpip :global(.material-symbols-rounded):nth-of-type(2),.topbar__tcpip :global(.material-symbols-rounded):nth-of-type(3){display:none}.topbar-device-picker{width:180px}.topbar__window-control{width:38px}.topbar__device-section{max-width:calc(100% - 170px)}}@media(max-width:600px){.topbar__identity{display:none}.topbar__device-section{position:static;transform:none;margin:auto}.topbar-device-picker{width:clamp(180px,45vw,240px)}}

.topbar__window-control{width:44px}.topbar__window-control :global(.material-symbols-rounded){font-size:16px}
}
</style>
