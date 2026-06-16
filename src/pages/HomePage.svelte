<script lang="ts">
import * as m from '../paraglide/messages';

  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { save } from '@tauri-apps/plugin-dialog';
  import { getName } from '@tauri-apps/api/app';
  import { devicesState, type DeviceDetails } from '../context/devices.svelte';
  
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import PowerDialog from '../components/dialogs/PowerDialog.svelte';
  import './HomePage.css';

  const formatMemory = (mb: number) => mb <= 0 ? '-' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  const formatStorage = (mb: number) => mb <= 0 ? '-' : mb >= 1024 * 1024 ? `${(mb / 1024 / 1024).toFixed(2)} TB` : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  const secondaryTitle = (details: DeviceDetails) => [details.manufacturer, details.soc, details.model].filter(value => value && value !== '-').join(' · ');

  let timeNow = $state(new Date());
  let capturing = $state(false);
  let savingScreenshot = $state(false);
  let powerOpen = $state(false);
  let powerBusy = $state(false);
  let shizukuStatus = $state<'idle' | 'busy' | 'success' | 'error'>('idle');
  let appName = $state('ADB App');
  let deviceName = $state('ADB App');

  let dd = $derived(devicesState.deviceDetails);

  onMount(() => {
    getName().then(name => {
      appName = name;
      deviceName = name;
    }).catch(() => { });

    const clockInterval = setInterval(() => {
      timeNow = new Date();
    }, 1000);

    return () => clearInterval(clockInterval);
  });

  $effect(() => {
    if (devicesState.selectedDevice?.serial && devicesState.selectedDevice.state === 'device') {
      const serial = devicesState.selectedDevice.serial;
      invoke<string>('run_device_action', {
        serial,
        args: ['shell', 'settings', 'get', 'global', 'device_name']
      }).then(name => {
        if (name && name.trim() !== 'null') {
          deviceName = name.trim();
        } else {
          deviceName = appName;
        }
      }).catch(() => deviceName = appName);

      // Cargar fondo de pantalla (si no está cargado ya en el store)
      if (!devicesState.wallpaperImage && !devicesState.wallpaperLoading) {
        devicesState.wallpaperLoading = true;
        invoke<string>('get_device_wallpaper', { serial })
          .then(base64 => {
            devicesState.wallpaperImage = `data:image/jpeg;base64,${base64}`;
          })
          .catch(() => {
            devicesState.wallpaperImage = null;
          })
          .finally(() => {
            devicesState.wallpaperLoading = false;
          });
      }
    } else if (!devicesState.selectedDevice) {
      deviceName = appName;
    }
  });

  let bootDate = $derived.by(() => {
    if (dd && dd.uptime_seconds >= 0) {
      const date = new Date(Date.now() - dd.uptime_seconds * 1000);
      return {
        short: date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }).replace(',', ''),
        full: date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'medium' })
      };
    }
    return null;
  });

  let stateLabel = $derived.by(() => {
    if (!devicesState.selectedDevice) return '-';
    const state = devicesState.selectedDevice.state;
    const labels: Record<string, string> = { 
      device: m.state_connected(), 
      connecting: m.state_connecting(), 
      unauthorized: m.state_unauthorized(), 
      offline: m.state_offline(), 
      recovery: m.power_btn_recovery ? m.power_btn_recovery() : 'Recovery',
      bootloader: m.power_btn_bootloader ? m.power_btn_bootloader() : 'Bootloader',
      fastboot: m.power_btn_fastbootd ? m.power_btn_fastbootd() : 'Fastbootd',
      download: m.power_btn_download ? m.power_btn_download() : 'Download'
    };
    return labels[state] || state.charAt(0).toUpperCase() + state.slice(1);
  });

  let previewStateIcon = $derived.by(() => {
    if (!devicesState.selectedDevice) return 'smartphone';
    switch (devicesState.selectedDevice.state) {
      case 'device': return 'check_circle';
      case 'recovery': return 'health_and_safety';
      case 'bootloader': return 'developer_board';
      case 'fastboot': return 'terminal';
      case 'fastbootd': return 'terminal';
      case 'download': return 'download';
      case 'unauthorized': return 'lock';
      case 'offline': return 'phonelink_off';
      case 'connecting': return 'sync';
      default: return 'smartphone';
    }
  });

  let previewStateColor = $derived.by(() => {
    if (!devicesState.selectedDevice) return '';
    switch (devicesState.selectedDevice.state) {
      case 'device': return 'color: #4caf50;';
      case 'recovery': return 'color: var(--md-sys-color-error, #f44336);';
      case 'unauthorized': return 'color: var(--md-sys-color-error, #f44336);';
      case 'offline': return 'color: var(--md-sys-color-outline, #9e9e9e);';
      default: return 'color: var(--md-sys-color-primary);';
    }
  });

  let previewStateHint = $derived.by(() => {
    if (!devicesState.selectedDevice) return null;
    switch (devicesState.selectedDevice.state) {
      case 'recovery': return m.power_hint_recovery ? m.power_hint_recovery() : null;
      case 'bootloader': return m.power_hint_bootloader ? m.power_hint_bootloader() : null;
      case 'fastboot':
      case 'fastbootd': return m.power_hint_fastbootd ? m.power_hint_fastbootd() : null;
      case 'download': return m.power_hint_download ? m.power_hint_download() : null;
      default: return null;
    }
  });

  async function captureScreenshot() {
    if (!devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device') return;
    capturing = true;
    try { 
      devicesState.screenshot = `data:image/png;base64,${await invoke<string>('capture_screenshot', { serial: devicesState.selectedDevice.serial })}`; 
    } catch (e) {
      console.error(e);
    } finally {
      capturing = false;
    }
  }

  async function saveScreenshotData() {
    if (!devicesState.screenshot || !devicesState.selectedDevice || savingScreenshot) return;
    const destination = await save({
      title: m.home_saveCapture(),
      defaultPath: `adb-captura-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      filters: [{ name: 'Imagen PNG', extensions: ['png'] }],
    });
    if (!destination) return;
    savingScreenshot = true;
    try {
      await invoke<string>('save_screenshot', { path: destination, pngBase64: screenshot.replace(/^data:image\/png;base64,/, '') });
    } finally {
      savingScreenshot = false;
    }
  }

  async function performPowerAction(_label: string, args: string[]) {
    if (!devicesState.selectedDevice || powerBusy) return;
    powerBusy = true; 
    powerOpen = false;
    try { 
      await invoke<string>('run_device_action', { serial: devicesState.selectedDevice.serial, args }); 
      window.setTimeout(() => devicesState.refreshDevices(), 4000); 
    }
    catch (error) { console.error(error); }
    finally { powerBusy = false; }
  }

  let shizukuError = $state<string | null>(null);

  async function startShizuku() {
    if (!devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device' || shizukuStatus === 'busy') return;
    shizukuStatus = 'busy';
    shizukuError = null;
    try {
      await invoke('run_device_action', { serial: devicesState.selectedDevice.serial, args: ['shell', 'sh /sdcard/Android/data/moe.shizuku.privileged.api/start.sh &'] });
      shizukuStatus = 'success';
    } catch (e) {
      shizukuError = String(e);
      shizukuStatus = 'error';
    } finally {
      setTimeout(() => {
        if (shizukuStatus !== 'error') shizukuStatus = 'idle';
      }, 2000);
    }
  }

  let facts = $derived<Array<[string, string, string, string?]>>([
    ['android', "Android", dd ? `${dd.android_version} (API ${dd.api_level})` : '-'],
    ['devices', m.home_field_deviceType(), dd ? (m as any)[`device_type_${dd.device_type}`]?.() ?? '-' : '-'],
    ['tablet_android', m.home_field_model(), dd?.model || '-'], 
    ['factory', m.home_field_manufacturer(), dd?.manufacturer || '-'],
    ['verified', m.home_field_brand(), dd?.brand || '-'], 
    ['developer_board', m.home_field_architecture(), dd?.architecture || '-'],
    ['inventory_2', m.home_field_product(), dd?.product_name || '-'], 
    ['tag', m.home_field_codename(), dd?.codename || '-'],
    ['fingerprint', m.home_field_serial(), dd?.serial || '-'], 
    ['schedule', m.home_field_uptime(), bootDate?.short || '-', bootDate?.full || '-'],
  ]);
</script>

<main class="home-material">
  <div class="home-material__content">
    <section class="material-surface home-hero">
      <div>
        <h2>{deviceName}</h2>
        <p>{dd ? secondaryTitle(dd) : m.home_summary_empty()}</p>
        <div class="home-popular-actions" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
          <md-filled-tonal-button 
            disabled={!devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device' || shizukuStatus === 'busy' ? true : undefined} 
            onclick={startShizuku}
          >
            <span slot="icon">
              <MaterialIcon 
                name={shizukuStatus === 'success' ? 'check' : shizukuStatus === 'error' ? 'close' : shizukuStatus === 'busy' ? 'sync' : 'adb'} 
                class={shizukuStatus === 'busy' ? 'home-spin' : ''} 
              />
            </span>
            {m.home_action_shizuku()}
          </md-filled-tonal-button>
          {#if shizukuError}
            <span style="color: var(--md-sys-color-error, #f44336); font-size: 0.85rem; max-width: 250px; line-height: 1.2;">{shizukuError}</span>
          {/if}
        </div>
      </div>
      <div class="home-hero__actions">
        <md-filled-tonal-icon-button 
          aria-label={m.home_power_options()} 
          title={m.home_power_options()} 
          disabled={!devicesState.selectedDevice || powerBusy ? true : undefined} 
          onclick={() => powerOpen = true}
        >
          <span class="material-symbols-rounded">power_settings_new</span>
        </md-filled-tonal-icon-button>
      </div>
    </section>

    <div class="home-metrics">
      <section class="material-surface home-metric">
        <MaterialIcon name="battery_android_full" />
        <div>
          <span>{m.home_field_battery()}</span>
          <strong>{dd?.battery_level_percent != null && dd.battery_level_percent >= 0 ? `${dd.battery_level_percent}%` : '-'}</strong>
          <small>{m.home_battery_health()}: {dd?.battery_health ? (dd.battery_health.includes('%') ? dd.battery_health : (m as any)[`battery_health_${dd.battery_health}`]?.() ?? '-') : '-'}</small>
          <md-linear-progress value={Math.max(0, Math.min(1, (dd?.battery_level_percent || 0) / 100))}></md-linear-progress>
        </div>
      </section>

      <section class="material-surface home-metric">
        <MaterialIcon name="memory" />
        <div>
          <span>{m.home_ram_inUse()}</span>
          <strong>{dd ? formatMemory(dd.used_ram_mb) : '-'}</strong>
          <small>{m.home_field_total()}: {dd ? formatMemory(dd.total_ram_mb) : '-'}</small>
          <md-linear-progress value={dd?.total_ram_mb ? Math.max(0, Math.min(1, dd.used_ram_mb / dd.total_ram_mb)) : 0}></md-linear-progress>
        </div>
      </section>

      <section class="material-surface home-metric">
        <MaterialIcon name="hard_drive" />
        <div>
          <span>{m.home_storage_inUse()}</span>
          <strong>{dd ? formatStorage(dd.used_storage_mb) : '-'}</strong>
          <small>{m.home_field_total()}: {dd ? formatStorage(dd.total_storage_mb) : '-'}</small>
          <md-linear-progress value={dd?.total_storage_mb ? Math.max(0, Math.min(1, dd.used_storage_mb / dd.total_storage_mb)) : 0}></md-linear-progress>
        </div>
      </section>
    </div>

    <section class="home-facts">
      <div class="home-facts__list">
        {#each facts as [icon, label, value, fullValue]}
          {@const copyValue = fullValue ?? value}
          <div class="home-facts__item">
            <div class="home-facts__item-leading">
              <MaterialIcon name={icon} />
            </div>
            <div class="home-facts__item-content">
              <span class="home-facts__item-label">{label}</span>
              <strong class="home-facts__item-value" title={copyValue}>{value}</strong>
            </div>
            <button
              class="home-facts__item-copy"
              title={m.common_copy()}
              onclick={(e) => {
                e.currentTarget.blur();
                navigator.clipboard.writeText(copyValue);
              }}
            >
              <MaterialIcon name="content_copy" />
            </button>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <section class="home-preview">
    <div class="home-preview__body" style={devicesState.wallpaperImage && !devicesState.screenshot ? `background-image: url('${devicesState.wallpaperImage}'); background-size: cover; background-position: center; position: relative; overflow: hidden;` : (previewStateHint ? 'position: relative; z-index: 1; background: var(--surface-container-low);' : 'position: relative; z-index: 1;')}>
      
      {#if capturing}
        <div class="home-flash"></div>
      {/if}

      {#if devicesState.wallpaperImage && !devicesState.screenshot}
        <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%); z-index: 0;"></div>
      {/if}
      
      {#if devicesState.screenshot}
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 16px; box-sizing: border-box;">
          <img src={devicesState.screenshot} alt={m.home_preview_alt()} style="max-height: calc(100% - 70px); object-fit: contain; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
          
          <div class="home-screenshot-review">
            <md-text-button onclick={() => devicesState.screenshot = null} disabled={savingScreenshot ? true : undefined}>
              <span slot="icon"><MaterialIcon name="close" size={18} /></span>
              {m.common_cancel()}
            </md-text-button>
            <md-filled-button onclick={saveScreenshotData} disabled={savingScreenshot ? true : undefined}>
              <span slot="icon">
                {#if savingScreenshot}
                  <MaterialIcon name="sync" class="home-spin" size={18} />
                {:else}
                  <MaterialIcon name="save" size={18} />
                {/if}
              </span>
              {#if savingScreenshot}
                {m.common_processing()}
              {:else}
                {m.home_saveCapture()}
              {/if}
            </md-filled-button>
          </div>
        </div>
      {:else if devicesState.wallpaperImage}
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; width: 100%; padding: 24px 0; color: white; text-shadow: 0 2px 10px rgba(0,0,0,0.5); box-sizing: border-box;">
          <div style="display: flex; flex-direction: column; align-items: center; margin-top: 30%;">
            <div style="font-size: 4.5rem; font-weight: 300; letter-spacing: -2px; line-height: 1;">
              {timeNow.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style="font-size: 1.1rem; opacity: 0.8; margin-top: 8px;">
              {timeNow.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <div style="margin-top: 32px; display: flex; align-items: center; gap: 8px; opacity: 0.9; font-weight: 500; font-size: 0.9rem;">
              {#if !devicesState.selectedDevice}
                <MaterialIcon name="phonelink_off" size={16} />
                {m.home_preview_empty_title()}
              {:else if devicesState.selectedDevice.state === 'offline'}
                <md-circular-progress indeterminate style="--md-circular-progress-size: 22px;"></md-circular-progress>
                {m.state_connecting ? m.state_connecting() : 'Connecting...'}
              {:else if devicesState.selectedDevice.state === 'device'}
                <MaterialIcon name="check_circle" size={16} />
                {m.state_connected()}
              {:else}
                <MaterialIcon name={previewStateIcon} size={16} />
                {stateLabel}
              {/if}
            </div>
          </div>
          
          <md-elevated-button onclick={captureScreenshot} disabled={capturing ? true : undefined} title={m.home_capture()}>
            <span slot="icon">
              {#if capturing}
                <MaterialIcon name="sync" class="home-spin" size={18} />
              {:else}
                <MaterialIcon name="screenshot_monitor" size={18} />
              {/if}
            </span>
            {#if capturing}
              {m.common_processing()}
            {:else}
              {m.home_capture()}
            {/if}
          </md-elevated-button>
        </div>
      {:else if !devicesState.selectedDevice}
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;">
          <MaterialIcon name="phonelink_off" size={48} />
          <strong style="margin-top: 16px; font-size: 1.1rem; color: var(--on-surface-variant);">
            {m.home_preview_empty_title()}
          </strong>
        </div>
      {:else if devicesState.selectedDevice.state === 'offline'}
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;">
          <md-circular-progress indeterminate style="--md-circular-progress-size: 48px;"></md-circular-progress>
          <strong style="margin-top: 16px; font-size: 1.1rem; color: var(--on-surface-variant);">
            {m.state_connecting ? m.state_connecting() : 'Connecting...'}
          </strong>
        </div>
      {:else if devicesState.selectedDevice.state === 'device'}
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 32px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <MaterialIcon name="check_circle" size={48} />
            <strong style="margin-top: 16px; font-size: 1.1rem;">{m.state_connected()}</strong>
            <span style="opacity: 0.7; margin-top: 4px;">{devicesState.selectedDevice.model}</span>
          </div>

          <md-filled-button onclick={captureScreenshot} disabled={capturing ? true : undefined} title={m.home_capture()}>
            <span slot="icon">
              {#if capturing}
                <MaterialIcon name="sync" class="home-spin" size={18} />
              {:else}
                <MaterialIcon name="screenshot_monitor" size={18} />
              {/if}
            </span>
            {#if capturing}
              {m.common_processing()}
            {:else}
              {m.home_capture()}
            {/if}
          </md-filled-button>
        </div>
      {:else}
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 32px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <MaterialIcon name={previewStateIcon} size={48} style={previewStateColor} />
            <strong style="margin-top: 16px; font-size: 1.1rem; {previewStateColor}">{stateLabel}</strong>
            {#if devicesState.selectedDevice.model}
              <span style="opacity: 0.7; margin-top: 4px;">{devicesState.selectedDevice.model}</span>
            {/if}
            
            {#if previewStateHint}
              <div style="margin-top: 24px; font-size: 0.85rem; text-align: center; width: 90%; background: var(--surface-container-high); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--outline-variant); color: var(--on-surface-variant); display: flex; flex-direction: column; gap: 4px; align-items: center; box-sizing: border-box;">
                <span style="display: flex; align-items: center; gap: 6px; font-weight: 500;">
                  <MaterialIcon name="info" size={18} />
                  {m.home_power_confirm_exit ? m.home_power_confirm_exit() : 'Exit:'}
                </span>
                <span style="opacity: 0.9;">{previewStateHint}</span>
              </div>
            {/if}
          </div>

          <md-filled-tonal-button onclick={() => invoke('run_device_action', { serial: devicesState.selectedDevice!.serial, args: ['reboot'] }).catch(e => console.error(e))}>
            <span slot="icon"><MaterialIcon name="restart_alt" size={18} /></span>
            {m.power_btn_reboot ? m.power_btn_reboot() : 'Reboot'}
          </md-filled-tonal-button>
        </div>
      {/if}
    </div>
  </section>

  <PowerDialog open={powerOpen} busy={powerBusy} onClose={() => powerOpen = false} onAction={performPowerAction} />
</main>
