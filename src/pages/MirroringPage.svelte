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
  import './MirroringPage.css';

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
  <!-- svelte-ignore a11y_missing_attribute -->
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
    <!-- svelte-ignore a11y_missing_attribute -->
    <md-switch {...(checked ? { selected: true } : {})} {...(disabled ? { disabled: true } : {})} onclick={() => !disabled && onChange(!checked)}></md-switch>
  </label>
{/snippet}

<div class="mirror-material-page">
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
