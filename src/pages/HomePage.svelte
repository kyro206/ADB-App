<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { save } from '@tauri-apps/plugin-dialog';
  import { getName } from '@tauri-apps/api/app';
  import { devicesState, type DeviceDetails } from '../context/devices.svelte';
  import { i18n } from '../locales/index.svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import PowerDialog from '../components/dialogs/PowerDialog.svelte';
  import './HomePage.css';

  const formatMemory = (mb: number) => mb <= 0 ? '-' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  const formatStorage = (mb: number) => mb <= 0 ? '-' : mb >= 1024 * 1024 ? `${(mb / 1024 / 1024).toFixed(2)} TB` : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  const secondaryTitle = (details: DeviceDetails) => [details.manufacturer, details.soc, details.model].filter(value => value && value !== '-').join(' · ');

  let screenshot = $state<string | null>(null);
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
  });

  $effect(() => {
    if (devicesState.selectedDevice?.serial && devicesState.selectedDevice.state === 'device') {
      invoke<string>('run_device_action', {
        serial: devicesState.selectedDevice.serial,
        args: ['shell', 'settings', 'get', 'global', 'device_name']
      }).then(name => {
        if (name && name.trim() !== 'null') {
          deviceName = name.trim();
        } else {
          deviceName = appName;
        }
      }).catch(() => deviceName = appName);
    } else {
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
    if (!dd) return '-';
    const labels: Record<string, string> = { 
      device: i18n.t('state.connected'), 
      connecting: i18n.t('state.connecting'), 
      unauthorized: i18n.t('state.unauthorized'), 
      offline: i18n.t('state.offline'), 
      recovery: i18n.t('state.recovery') 
    };
    return labels[dd.state] || i18n.t('state.unknown');
  });

  async function captureScreenshot() {
    if (!devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device') return;
    capturing = true;
    try { 
      screenshot = `data:image/png;base64,${await invoke<string>('capture_screenshot', { serial: devicesState.selectedDevice.serial })}`; 
    }
    finally { capturing = false; }
  }

  async function saveScreenshotData() {
    if (!screenshot || savingScreenshot) return;
    const destination = await save({
      title: i18n.t('home.saveCapture'),
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

  async function startShizuku() {
    if (!devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device' || shizukuStatus === 'busy') return;
    shizukuStatus = 'busy';
    try {
      await invoke('run_device_action', { serial: devicesState.selectedDevice.serial, args: ['shell', 'sh', '/sdcard/Android/data/moe.shizuku.privileged.api/start.sh'] });
      shizukuStatus = 'success';
    } catch (e) {
      shizukuStatus = 'error';
    } finally {
      setTimeout(() => shizukuStatus = 'idle', 2000);
    }
  }

  let facts = $derived<Array<[string, string, string, string?]>>([
    ['check_circle', i18n.t('home.field.state'), stateLabel],
    ['android', "Android", dd ? `${dd.android_version} (API ${dd.api_level})` : '-'],
    ['devices', i18n.t('home.field.deviceType'), dd ? i18n.t(`device.type.${dd.device_type}`) : '-'],
    ['tablet_android', i18n.t('home.field.model'), dd?.model || '-'], 
    ['factory', i18n.t('home.field.manufacturer'), dd?.manufacturer || '-'],
    ['verified', i18n.t('home.field.brand'), dd?.brand || '-'], 
    ['developer_board', i18n.t('home.field.architecture'), dd?.architecture || '-'],
    ['inventory_2', i18n.t('home.field.product'), dd?.product_name || '-'], 
    ['tag', i18n.t('home.field.codename'), dd?.codename || '-'],
    ['fingerprint', i18n.t('home.field.serial'), dd?.serial || '-'], 
    ['schedule', i18n.t('home.field.uptime'), bootDate?.short || '-', bootDate?.full || '-'],
  ]);
</script>

<main class="home-material">
  <div class="home-material__content">
    <section class="material-surface home-hero">
      <div>
        <h2>{deviceName}</h2>
        <p>{dd ? secondaryTitle(dd) : i18n.t('home.summary.empty')}</p>
        <div class="home-popular-actions" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
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
            {i18n.t('home.action.shizuku')}
          </md-filled-tonal-button>
        </div>
      </div>
      <div class="home-hero__actions">
        <md-filled-tonal-icon-button 
          aria-label={i18n.t('home.power.options')} 
          title={i18n.t('home.power.options')} 
          disabled={!devicesState.selectedDevice || powerBusy ? true : undefined} 
          onclick={() => powerOpen = true}
        >
          <MaterialIcon name="power_settings_new" />
        </md-filled-tonal-icon-button>
      </div>
    </section>

    <div class="home-metrics">
      <section class="material-surface home-metric">
        <MaterialIcon name="battery_android_full" />
        <div>
          <span>{i18n.t('home.field.battery')}</span>
          <strong>{dd?.battery_level_percent != null && dd.battery_level_percent >= 0 ? `${dd.battery_level_percent}%` : '-'}</strong>
          <small>{i18n.t('home.battery.health')}: {dd?.battery_health ? (dd.battery_health.includes('%') ? dd.battery_health : i18n.t(`battery.health.${dd.battery_health}`)) : '-'}</small>
          <md-linear-progress value={Math.max(0, Math.min(1, (dd?.battery_level_percent || 0) / 100))}></md-linear-progress>
        </div>
      </section>

      <section class="material-surface home-metric">
        <MaterialIcon name="memory" />
        <div>
          <span>{i18n.t('home.ram.inUse')}</span>
          <strong>{dd ? formatMemory(dd.used_ram_mb) : '-'}</strong>
          <small>{i18n.t('home.field.total')}: {dd ? formatMemory(dd.total_ram_mb) : '-'}</small>
          <md-linear-progress value={dd?.total_ram_mb ? Math.max(0, Math.min(1, dd.used_ram_mb / dd.total_ram_mb)) : 0}></md-linear-progress>
        </div>
      </section>

      <section class="material-surface home-metric">
        <MaterialIcon name="hard_drive" />
        <div>
          <span>{i18n.t('home.storage.inUse')}</span>
          <strong>{dd ? formatStorage(dd.used_storage_mb) : '-'}</strong>
          <small>{i18n.t('home.field.total')}: {dd ? formatStorage(dd.total_storage_mb) : '-'}</small>
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
              title={i18n.t('common.copy')}
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

  <section class="material-surface home-preview">
    <header>
      <div><h3>{i18n.t('home.preview.title')}</h3></div>
      <div class="home-preview__actions">
        <md-icon-button 
          aria-label={i18n.t('home.saveCapture')} 
          title={i18n.t('home.saveCapture')} 
          disabled={!screenshot || savingScreenshot ? true : undefined} 
          onclick={saveScreenshotData}
        >
          <MaterialIcon name="save" />
        </md-icon-button>
        <md-filled-icon-button 
          aria-label={i18n.t('home.capture')} 
          title={i18n.t('home.capture')} 
          disabled={capturing || !devicesState.selectedDevice || devicesState.selectedDevice.state !== 'device' ? true : undefined} 
          onclick={captureScreenshot}
        >
          <MaterialIcon name="screenshot_monitor" />
        </md-filled-icon-button>
      </div>
    </header>
    <div class="home-preview__body">
      {#if screenshot}
        <img src={screenshot} alt={i18n.t('home.preview.alt')} />
      {:else}
        <div>
          <MaterialIcon name="smartphone" />
          <strong>{i18n.t('home.preview.empty.title')}</strong>
          <span>{i18n.t('home.preview.empty.subtitle')}</span>
        </div>
      {/if}
    </div>
  </section>

  <PowerDialog open={powerOpen} busy={powerBusy} onClose={() => powerOpen = false} onAction={performPowerAction} />
</main>
