<script lang="ts" module>
import * as m from '../paraglide/messages';

  export interface MirroringPageProps {
    serial: string;
    tools: ToolsStatus | null;
    mode: MirrorMode;
    fullscreen: boolean;
    turnScreenOff: boolean;
    readOnly: boolean;
    maxSize: string;
    maxFps: string;
    audio: string;
    keyboard: string;
    mouse: string;
    record: boolean;
    recordPath: string;
    app: string;
    apps: AppSummary[];
    virtualWidth: string;
    virtualHeight: string;
    virtualDpi: string;
    virtualResizable: boolean;
    cameraId: string;
    cameraWidth: string;
    cameraHeight: string;
    cameras: string[];
    onRefreshData: () => void;
    onLaunch: () => void;
    onDirectLaunch: (args: string) => void;
  }
</script>

<script lang="ts">
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import AppModal from '../components/dialogs/AppModal.svelte';
  import { save } from '@tauri-apps/plugin-dialog';
  import type { AppSummary, MirrorMode, ToolsStatus } from './workbench/types';
  let {
    serial,
    tools,
    mode = $bindable(),
    fullscreen = $bindable(),
    turnScreenOff = $bindable(),
    readOnly = $bindable(),
    maxSize = $bindable(),
    maxFps = $bindable(),
    audio = $bindable(),
    keyboard = $bindable(),
    mouse = $bindable(),
    record = $bindable(),
    recordPath = $bindable(),
    app = $bindable(),
    apps,
    virtualWidth = $bindable(),
    virtualHeight = $bindable(),
    virtualDpi = $bindable(),
    virtualResizable = $bindable(),
    cameraId = $bindable(),
    cameraWidth = $bindable(),
    cameraHeight = $bindable(),
    cameras,
    onRefreshData,
    onLaunch,
    onDirectLaunch
  }: MirroringPageProps = $props();

  const MODES = [
    { id: 'display', icon: 'smartphone', title: () => m.mirror_mode_display() },
    { id: 'virtual', icon: 'ad_group', title: () => m.mirror_mode_virtual() },
    { id: 'camera', icon: 'photo_camera', title: () => m.mirror_mode_camera() },
  ];

  let advancedArgs = $state('');
  let cameraMode = $derived(mode === 'camera');
  let inputDisabled = $derived(readOnly || cameraMode);
  let showScrcpyModal = $state(false);
  let scrcpyWarningShown = $state(false);

  $effect(() => {
    if (tools && !tools.scrcpy.available && !scrcpyWarningShown) {
      showScrcpyModal = true;
      scrcpyWarningShown = true;
    }
  });

  async function pickRecordPath() {
    const selected = await save({ filters: [{ name: 'Video', extensions: ['mkv', 'mp4'] }] });
    if (selected && typeof selected === 'string') {
      recordPath = selected;
    }
  }

</script>

{#snippet Field(label: string, value: string, onValue: (v: string) => void, type = 'text', placeholder = '', disabled = false, actionIcon?: string, onActionClick?: () => void)}
  <md-outlined-text-field 
    {label} 
    {type} 
    {value} 
    {placeholder} 
    {...(disabled ? { disabled: true } : {})}
    oninput={(event: any) => onValue(event.currentTarget.value)}
  >
    {#if actionIcon && onActionClick}
      <md-icon-button slot="trailing-icon" {...(disabled ? { disabled: true } : {})} onclick={onActionClick}>
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
    {...(disabled ? { disabled: true } : {})}
    oninput={(event: any) => onValue(event.currentTarget.value)}
  >
    {#each options as [optionValue, text] (optionValue)}
      <md-select-option value={optionValue} {...(value === optionValue ? { selected: true } : {})}>
        <div slot="headline">{text}</div>
      </md-select-option>
    {/each}
  </md-outlined-select>
{/snippet}

{#snippet Toggle(icon: string, title: string, checked: boolean, onChange: (v: boolean) => void, disabled = false)}
  <label class="mirror-material-toggle {disabled ? 'disabled' : ''}">
    <span class="mirror-material-toggle__icon"><MaterialIcon name={icon} filled={checked} /></span>
    <span class="mirror-material-toggle__label">{title}</span>
    <md-switch {...(checked ? { selected: true } : {})} {...(disabled ? { disabled: true } : {})} onclick={() => !disabled && onChange(!checked)}></md-switch>
  </label>
{/snippet}

<div class="mirror-material-page">
  <div class="mirror-material-content">
    <section class="mirror-material-source-tabs" aria-label={m.mirror_source()}>
    <md-tabs>
      {#each MODES as item}
        <md-primary-tab 
          {...(mode === item.id ? { active: true } : {})} 
          onclick={() => mode = item.id as MirrorMode}
        >
          <MaterialIcon slot="icon" name={item.icon} filled={mode === item.id} />
          {item.title()}
        </md-primary-tab>
      {/each}
    </md-tabs>
  </section>

  <div class="mirror-material-layout">
    <main class="mirror-material-main">
      <section class="mirror-material-card">
        <header><MaterialIcon name="image" filled /><h3>{m.mirror_image_title()}</h3></header>
        <div class="mirror-material-fields">
          {#if !cameraMode}
            {@render Field(m.mirror_image_maxSize(), maxSize, v => maxSize = v, 'number', m.mirror_image_noLimit())}
          {/if}
          {@render Field(m.mirror_image_maxFps(), maxFps, v => maxFps = v, 'number', m.mirror_image_noLimit())}
        </div>
        <div class="mirror-material-toggles">
          {@render Toggle('fullscreen', m.mirror_image_fullscreen(), fullscreen, v => fullscreen = v)}
          {@render Toggle('screen_lock_portrait', m.mirror_image_turnScreenOff(), turnScreenOff, v => turnScreenOff = v, cameraMode)}
        </div>
      </section>

      {#if mode === 'virtual'}
        <section class="mirror-material-card">
          <header><MaterialIcon name="ad_group" filled /><h3>{m.mirror_virtual_title()}</h3></header>
          <div class="mirror-material-fields three">
            {@render Field(m.mirror_virtual_width(), virtualWidth, v => virtualWidth = v, 'number', m.mirror_virtual_auto())}
            {@render Field(m.mirror_virtual_height(), virtualHeight, v => virtualHeight = v, 'number', m.mirror_virtual_auto())}
            {@render Field('DPI', virtualDpi, v => virtualDpi = v, 'number', m.mirror_virtual_auto())}
          </div>
          {@render Toggle('aspect_ratio', m.mirror_virtual_resizable(), virtualResizable, v => virtualResizable = v)}
        </section>
      {/if}

      {#if cameraMode}
        <section class="mirror-material-card">
          <header>
            <MaterialIcon name="photo_camera" filled />
            <h3>{m.mirror_camera_title()}</h3>
            <div class="mirror-material-spacer"></div>
            <md-icon-button title={m.mirror_camera_refresh()} onclick={onRefreshData}>
              <MaterialIcon name="refresh" />
            </md-icon-button>
          </header>
          {@render Select(m.mirror_camera_id(), cameraId, [['', m.mirror_camera_auto()], ...cameras.map((c: string) => [c, c] as [string, string])], v => cameraId = v)}
          <div class="mirror-material-fields">
            {@render Field(m.mirror_camera_width(), cameraWidth, v => cameraWidth = v, 'number', m.mirror_virtual_auto())}
            {@render Field(m.mirror_camera_height(), cameraHeight, v => cameraHeight = v, 'number', m.mirror_virtual_auto())}
          </div>
        </section>
      {/if}

      <section class="mirror-material-card">
        <header><MaterialIcon name="fiber_manual_record" filled /><h3>{m.mirror_record_title()}</h3></header>
        <div class="mirror-material-toggles">
          {@render Toggle('videocam', m.mirror_record_toggle(), record, v => record = v)}
          {@render Field(m.mirror_record_path(), recordPath, v => recordPath = v, 'text', 'C:\\Videos\\captura.mkv', !record, 'folder_open', pickRecordPath)}
        </div>
      </section>
    </main>

    <aside class="mirror-material-side">
      <section class="mirror-material-card">
        <header><MaterialIcon name="tune" filled /><h3>{m.mirror_input_title()}</h3></header>
        {#if !cameraMode}
          {@render Toggle('visibility', m.mirror_input_readOnly(), readOnly, v => readOnly = v)}
        {/if}
        {@render Select(m.mirror_input_audio(), audio, [['default', m.mirror_input_default()], ['none', m.mirror_input_none()], ['output', m.mirror_input_output()], ['mic', m.mirror_input_mic()]], v => audio = v)}
        {@render Select(m.mirror_input_keyboard(), keyboard, [['default', m.mirror_input_default()], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', m.mirror_input_disabled()]], v => keyboard = v, inputDisabled)}
        {@render Select(m.mirror_input_mouse(), mouse, [['default', m.mirror_input_default()], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', m.mirror_input_disabled()]], v => mouse = v, inputDisabled)}
      </section>

      {#if !cameraMode}
        <section class="mirror-material-card">
          <header><MaterialIcon name="rocket_launch" filled /><h3>{m.mirror_start_title()}</h3></header>
          {@render Select(m.mirror_start_app(), app, [['', m.mirror_start_appPlaceholder()], ...apps.map((a: AppSummary) => [a.package_name, a.display_name || a.package_name] as [string, string])], v => app = v)}
        </section>
      {/if}

      <section class="mirror-material-card">
        <header><MaterialIcon name="terminal" /><h3>{m.mirror_advanced_title()}</h3></header>
        {@render Field(m.mirror_advanced_args(), advancedArgs, (v) => advancedArgs = v, 'text', '--video-bit-rate=8M')}
      </section>
    </aside>
  </div>
  </div>

  <footer class="mirror-material-footer">
    <div class="mirror-material-footer__info">
      <MaterialIcon name="info" />
      <span>{cameraMode ? m.mirror_footer_cameraInfo() : m.mirror_footer_audioInfo()}</span>
    </div>
    <div class="mirror-material-footer__actions">
      {#if advancedArgs}
        <md-outlined-button {...(!serial ? { disabled: true } : {})} onclick={() => onDirectLaunch(advancedArgs)}>
          <span slot="icon"><MaterialIcon name="terminal" /></span>
          {m.mirror_advanced_run()}
        </md-outlined-button>
      {/if}
      <md-filled-button {...(!serial ? { disabled: true } : {})} onclick={onLaunch}>
        <span slot="icon"><MaterialIcon name="cast" filled /></span>
        {m.mirror_action_launch()}
      </md-filled-button>
    </div>
  </footer>
  
  <AppModal 
    open={showScrcpyModal} 
    onClose={() => showScrcpyModal = false} 
    title={m.dialog_missingTool_title({ tool: 'scrcpy' })}
  >
    <p>{m.dialog_missingTool_desc({ tool: 'scrcpy' })}</p>
    {#snippet actions()}
      <md-filled-button onclick={() => { showScrcpyModal = false; window.dispatchEvent(new CustomEvent('change-tab', { detail: 'settings' })); }}>
        {m.dialog_missingTool_goToSettings()}
      </md-filled-button>
    {/snippet}
  </AppModal>
</div>

<style>
.mirror-material-page{display:flex;flex-direction:column;flex:1;margin:-20px;overflow:hidden}
.mirror-material-content{display:flex;flex-direction:column;flex:1;gap:20px;padding:20px;overflow-y:auto;overflow-x:hidden}
.mirror-material-source-tabs{margin-bottom:8px}
.mirror-material-source-tabs md-tabs{background:transparent;--md-primary-tab-container-color:transparent}
.mirror-material-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(320px,.7fr);align-items:start;gap:20px}
.mirror-material-main,.mirror-material-side{display:flex;min-width:0;flex-direction:column;gap:20px}
.mirror-material-card{display:flex;min-width:0;flex-direction:column;gap:16px;padding:20px;background:var(--surface-container-low);border-radius:24px}
.mirror-material-card>header{display:flex;align-items:center;gap:12px;cursor:help}
.mirror-material-card>header>:global(.material-symbols-rounded){display:grid;place-items:center;width:40px;height:40px;color:var(--primary);background:var(--surface-container-high);border-radius:12px;font-size:22px}
.mirror-material-card h3{font-size:16px;font-weight:600;flex:1}
.mirror-material-spacer{flex:1}
.mirror-material-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.mirror-material-fields.three{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.mirror-material-card md-outlined-text-field,.mirror-material-card md-outlined-select{width:100%;--md-outlined-field-container-shape:12px}
.mirror-material-toggles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.mirror-material-app-select{display:flex;align-items:center;gap:8px}
.mirror-material-toggle{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px;background:var(--surface-container);border-radius:14px;cursor:pointer;transition:background 0.2s ease}
.mirror-material-toggle:hover:not(.disabled){background:var(--surface-container-highest)}
.mirror-material-toggle.disabled{cursor:default;opacity:.5}
.mirror-material-toggle__icon{display:grid;place-items:center;width:34px;height:34px;color:var(--primary);background:var(--surface-container-high);border-radius:10px}
.mirror-material-toggle__label{font-size:13px;font-weight:500}
.mirror-material-toggle md-switch{transform:scale(.85);transform-origin:right center}
.mirror-material-footer{z-index:100;display:flex;align-items:center;justify-content:space-between;width:100%;gap:32px;padding:12px 16px 12px 24px;background:var(--surface-container-high);box-shadow:0 -4px 12px rgba(0,0,0,0.05),0 -1px 3px rgba(0,0,0,0.1);box-sizing:border-box}
.mirror-material-footer__info{display:flex;align-items:center;gap:10px;color:var(--on-surface-variant);font-size:12px;font-weight:500;flex:1;min-width:0}
.mirror-material-footer__info :global(.material-symbols-rounded){font-size:20px}
.mirror-material-footer__info span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mirror-material-footer__actions{display:flex;align-items:center;gap:12px}
.mirror-material-footer md-filled-button{height:48px}
.mirror-material-footer md-outlined-button{height:48px}
@media(max-width:1100px){.mirror-material-layout{grid-template-columns:1fr}.mirror-material-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.mirror-material-side {grid-column:1/-1}}
@media(max-width:800px){.mirror-material-side{grid-template-columns:1fr}.mirror-material-footer{flex-direction:column;align-items:stretch;padding:16px}.mirror-material-footer__actions{flex-direction:column}.mirror-material-footer__actions>*{width:100%}}
</style>
