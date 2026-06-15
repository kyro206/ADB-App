<script lang="ts" module>
  export interface MirroringPageProps {
    serial: string;
    tools: ToolsStatus | null;
    mode: MirrorMode;
    setMode: (m: MirrorMode) => void;
    fullscreen: boolean;
    setFullscreen: (v: boolean) => void;
    turnScreenOff: boolean;
    setTurnScreenOff: (v: boolean) => void;
    readOnly: boolean;
    setReadOnly: (v: boolean) => void;
    maxSize: string;
    setMaxSize: (v: string) => void;
    maxFps: string;
    setMaxFps: (v: string) => void;
    audio: string;
    setAudio: (v: string) => void;
    keyboard: string;
    setKeyboard: (v: string) => void;
    mouse: string;
    setMouse: (v: string) => void;
    record: boolean;
    setRecord: (v: boolean) => void;
    recordPath: string;
    setRecordPath: (v: string) => void;
    app: string;
    setApp: (v: string) => void;
    apps: AppSummary[];
    virtualWidth: string;
    setVirtualWidth: (v: string) => void;
    virtualHeight: string;
    setVirtualHeight: (v: string) => void;
    virtualDpi: string;
    setVirtualDpi: (v: string) => void;
    virtualResizable: boolean;
    setVirtualResizable: (v: boolean) => void;
    cameraId: string;
    setCameraId: (v: string) => void;
    cameraWidth: string;
    setCameraWidth: (v: string) => void;
    cameraHeight: string;
    setCameraHeight: (v: string) => void;
    cameras: string[];
    onRefreshData: () => void;
    onLaunch: () => void;
    onDirectLaunch: (args: string) => void;
  }
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { i18n } from '../locales/index.svelte';
  import AppModal from '../components/dialogs/AppModal.svelte';
  import { save } from '@tauri-apps/plugin-dialog';
  import type { AppSummary, MirrorMode, ToolsStatus } from './workbench/types';
  import './MirroringPage.css';

  let props = $props<MirroringPageProps>();

  const MODES = [
    { id: 'display', icon: 'smartphone', titleKey: 'mirror.mode.display' },
    { id: 'virtual', icon: 'ad_group', titleKey: 'mirror.mode.virtual' },
    { id: 'camera', icon: 'photo_camera', titleKey: 'mirror.mode.camera' },
  ];

  let advancedArgs = $state('');
  let cameraMode = $derived(props.mode === 'camera');
  let inputDisabled = $derived(props.readOnly || cameraMode);
  let scrcpyReady = $derived(Boolean(props.tools?.scrcpy.available));
  let showScrcpyModal = $state(false);
  let scrcpyWarningShown = $state(false);

  $effect(() => {
    if (props.tools && !props.tools.scrcpy.available && !scrcpyWarningShown) {
      showScrcpyModal = true;
      scrcpyWarningShown = true;
    }
  });

  async function pickRecordPath() {
    const selected = await save({ filters: [{ name: 'Video', extensions: ['mkv', 'mp4'] }] });
    if (selected && typeof selected === 'string') {
      props.setRecordPath(selected);
    }
  }

</script>

{#snippet Field(label: string, value: string, onValue: (v: string) => void, type = 'text', placeholder = '', disabled = false, actionIcon?: string, onActionClick?: () => void)}
  <!-- svelte-ignore a11y_missing_attribute -->
  <md-outlined-text-field 
    {label} 
    {type} 
    {value} 
    {placeholder} 
    disabled={disabled ? true : undefined}
    oninput={(event: any) => onValue(event.currentTarget.value)}
  >
    {#if actionIcon && onActionClick}
      <md-icon-button slot="trailing-icon" disabled={disabled ? true : undefined} onclick={onActionClick}>
        <MaterialIcon name={actionIcon} />
      </md-icon-button>
    {:else if value}
      <md-icon-button slot="trailing-icon" onclick={() => onValue('')}>
        <MaterialIcon name="close" />
      </md-icon-button>
    {/if}
  </md-outlined-text-field>
{/snippet}

{#snippet Select(label: string, value: string, options: Array<[string, string]>, onValue: (v: string) => void, disabled = false)}
  <md-outlined-select 
    {label} 
    {value} 
    disabled={disabled ? true : undefined}
    oninput={(event: any) => onValue(event.currentTarget.value)}
  >
    {#each options as [optionValue, text] (optionValue)}
      <md-select-option value={optionValue} selected={value === optionValue ? true : undefined}>
        <div slot="headline">{text}</div>
      </md-select-option>
    {/each}
  </md-outlined-select>
{/snippet}

{#snippet Toggle(icon: string, title: string, checked: boolean, onChange: (v: boolean) => void, disabled = false)}
  <label class="mirror-material-toggle {disabled ? 'disabled' : ''}">
    <span class="mirror-material-toggle__icon"><MaterialIcon name={icon} filled={checked} /></span>
    <span class="mirror-material-toggle__label">{title}</span>
    <!-- svelte-ignore a11y_missing_attribute -->
    <md-switch selected={checked ? true : undefined} disabled={disabled ? true : undefined} onclick={() => !disabled && onChange(!checked)}></md-switch>
  </label>
{/snippet}

<div class="mirror-material-page">
  <section class="mirror-material-source-tabs" aria-label={i18n.t('mirror.source')}>
    <md-tabs>
      {#each MODES as item}
        <md-primary-tab 
          active={props.mode === item.id ? true : undefined} 
          onclick={() => props.setMode(item.id as MirrorMode)}
        >
          <MaterialIcon slot="icon" name={item.icon} filled={props.mode === item.id} />
          {i18n.t(item.titleKey)}
        </md-primary-tab>
      {/each}
    </md-tabs>
  </section>

  <div class="mirror-material-layout">
    <main class="mirror-material-main">
      <section class="mirror-material-card">
        <header><MaterialIcon name="image" filled /><h3>{i18n.t('mirror.image.title')}</h3></header>
        <div class="mirror-material-fields">
          {#if !cameraMode}
            {@render Field(i18n.t('mirror.image.maxSize'), props.maxSize, props.setMaxSize, 'number', i18n.t('mirror.image.noLimit'))}
          {/if}
          {@render Field(i18n.t('mirror.image.maxFps'), props.maxFps, props.setMaxFps, 'number', i18n.t('mirror.image.noLimit'))}
        </div>
        <div class="mirror-material-toggles">
          {@render Toggle('fullscreen', i18n.t('mirror.image.fullscreen'), props.fullscreen, props.setFullscreen)}
          {@render Toggle('screen_lock_portrait', i18n.t('mirror.image.turnScreenOff'), props.turnScreenOff, props.setTurnScreenOff, cameraMode)}
        </div>
      </section>

      {#if props.mode === 'virtual'}
        <section class="mirror-material-card">
          <header><MaterialIcon name="ad_group" filled /><h3>{i18n.t('mirror.virtual.title')}</h3></header>
          <div class="mirror-material-fields three">
            {@render Field(i18n.t('mirror.virtual.width'), props.virtualWidth, props.setVirtualWidth, 'number', i18n.t('mirror.virtual.auto'))}
            {@render Field(i18n.t('mirror.virtual.height'), props.virtualHeight, props.setVirtualHeight, 'number', i18n.t('mirror.virtual.auto'))}
            {@render Field('DPI', props.virtualDpi, props.setVirtualDpi, 'number', i18n.t('mirror.virtual.auto'))}
          </div>
          {@render Toggle('aspect_ratio', i18n.t('mirror.virtual.resizable'), props.virtualResizable, props.setVirtualResizable)}
        </section>
      {/if}

      {#if cameraMode}
        <section class="mirror-material-card">
          <header>
            <MaterialIcon name="photo_camera" filled />
            <h3>{i18n.t('mirror.camera.title')}</h3>
            <div class="mirror-material-spacer"></div>
            <md-icon-button title={i18n.t('mirror.camera.refresh')} onclick={props.onRefreshData}>
              <MaterialIcon name="refresh" />
            </md-icon-button>
          </header>
          {@render Select(i18n.t('mirror.camera.id'), props.cameraId, [['', i18n.t('mirror.camera.auto')], ...props.cameras.map(c => [c, c] as [string, string])], props.setCameraId)}
          <div class="mirror-material-fields">
            {@render Field(i18n.t('mirror.camera.width'), props.cameraWidth, props.setCameraWidth, 'number', i18n.t('mirror.virtual.auto'))}
            {@render Field(i18n.t('mirror.camera.height'), props.cameraHeight, props.setCameraHeight, 'number', i18n.t('mirror.virtual.auto'))}
          </div>
        </section>
      {/if}

      <section class="mirror-material-card">
        <header><MaterialIcon name="fiber_manual_record" filled /><h3>{i18n.t('mirror.record.title')}</h3></header>
        <div class="mirror-material-toggles">
          {@render Toggle('videocam', i18n.t('mirror.record.toggle'), props.record, props.setRecord)}
          {@render Field(i18n.t('mirror.record.path'), props.recordPath, props.setRecordPath, 'text', 'C:\\Videos\\captura.mkv', !props.record, 'folder_open', pickRecordPath)}
        </div>
      </section>
    </main>

    <aside class="mirror-material-side">
      <section class="mirror-material-card">
        <header><MaterialIcon name="tune" filled /><h3>{i18n.t('mirror.input.title')}</h3></header>
        {#if !cameraMode}
          {@render Toggle('visibility', i18n.t('mirror.input.readOnly'), props.readOnly, props.setReadOnly)}
        {/if}
        {@render Select(i18n.t('mirror.input.audio'), props.audio, [['default', i18n.t('mirror.input.default')], ['none', i18n.t('mirror.input.none')], ['output', i18n.t('mirror.input.output')], ['mic', i18n.t('mirror.input.mic')]], props.setAudio)}
        {@render Select(i18n.t('mirror.input.keyboard'), props.keyboard, [['default', i18n.t('mirror.input.default')], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', i18n.t('mirror.input.disabled')]], props.setKeyboard, inputDisabled)}
        {@render Select(i18n.t('mirror.input.mouse'), props.mouse, [['default', i18n.t('mirror.input.default')], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', i18n.t('mirror.input.disabled')]], props.setMouse, inputDisabled)}
      </section>

      {#if !cameraMode}
        <section class="mirror-material-card">
          <header><MaterialIcon name="rocket_launch" filled /><h3>{i18n.t('mirror.start.title')}</h3></header>
          {@render Select(i18n.t('mirror.start.app'), props.app, [['', i18n.t('mirror.start.appPlaceholder')], ...props.apps.map(app => [app.package_name, app.display_name || app.package_name] as [string, string])], props.setApp)}
        </section>
      {/if}

      <section class="mirror-material-card">
        <header><MaterialIcon name="terminal" /><h3>{i18n.t('mirror.advanced.title')}</h3></header>
        {@render Field(i18n.t('mirror.advanced.args'), advancedArgs, (v) => advancedArgs = v, 'text', '--video-bit-rate=8M')}
      </section>
    </aside>
  </div>

  <footer class="mirror-material-footer">
    <div class="mirror-material-footer__info">
      <MaterialIcon name="info" />
      <span>{cameraMode ? i18n.t('mirror.footer.cameraInfo') : i18n.t('mirror.footer.audioInfo')}</span>
    </div>
    <div class="mirror-material-footer__actions">
      {#if advancedArgs}
        <md-outlined-button disabled={!props.serial ? true : undefined} onclick={() => props.onDirectLaunch(advancedArgs)}>
          <span slot="icon"><MaterialIcon name="terminal" /></span>
          {i18n.t('mirror.advanced.run')}
        </md-outlined-button>
      {/if}
      <md-filled-button disabled={!props.serial || !scrcpyReady ? true : undefined} onclick={props.onLaunch}>
        <span slot="icon"><MaterialIcon name="cast" filled /></span>
        {i18n.t('mirror.action.launch')}
      </md-filled-button>
    </div>
  </footer>
  
  <AppModal 
    open={showScrcpyModal} 
    onClose={() => showScrcpyModal = false} 
    title={i18n.t('dialog.missingTool.title', { tool: 'scrcpy' })}
  >
    <p>{i18n.t('dialog.missingTool.desc', { tool: 'scrcpy' })}</p>
    {#snippet actions()}
      <md-filled-button onclick={() => { showScrcpyModal = false; window.dispatchEvent(new CustomEvent('change-tab', { detail: 'settings' })); }}>
        {i18n.t('dialog.missingTool.goToSettings')}
      </md-filled-button>
    {/snippet}
  </AppModal>
</div>
