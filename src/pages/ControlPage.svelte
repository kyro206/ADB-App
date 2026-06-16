<script lang="ts">
import * as m from '../paraglide/messages';


  import { invoke } from '@tauri-apps/api/core';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { words, translateError } from './workbench/utils';
  import type { MediaVolumeState, SoundMode } from './workbench/types';
  import './ControlPage.css';

  let {
    serial,
    run,
    status = $bindable(),
    busy = $bindable()
  } = $props<{
    serial: string;
    run: (args: string[], success?: string) => Promise<string | undefined>;
    status: string;
    busy: boolean;
  }>();

  let controlBrightness = $state(128);
  let controlVolume = $state(7);
  let controlVolumeMax = $state(15);
  let rotationAuto = $state(true);
  let rotation = $state(0);
  let soundMode = $state<SoundMode>('NORMAL');
  let inputText = $state('');
  let inputArgs = $state('');

  function loadDeviceState() {
    if (!serial) return;

    invoke<MediaVolumeState>('get_media_volume', { serial }).then(value => {
      controlVolume = value.level;
      controlVolumeMax = value.maximum;
    }).catch(() => {});

    invoke<string>('run_device_action', { serial, args: ['shell', 'settings', 'get', 'system', 'screen_brightness'] }).then(res => {
      if (res && !isNaN(Number(res))) controlBrightness = Number(res.trim());
    }).catch(() => {});

    invoke<string>('run_device_action', { serial, args: ['shell', 'settings', 'get', 'system', 'accelerometer_rotation'] }).then(res => {
      if (res) rotationAuto = res.trim() === '1';
    }).catch(() => {});

    invoke<string>('run_device_action', { serial, args: ['shell', 'settings', 'get', 'system', 'user_rotation'] }).then(res => {
      if (res && !isNaN(Number(res))) rotation = Number(res.trim());
    }).catch(() => {});

    invoke<string>('run_device_action', { serial, args: ['shell', 'settings', 'get', 'global', 'mode_ringer'] }).then(res => {
      const mode = res?.trim();
      if (mode === '0') soundMode = 'SILENT';
      else if (mode === '1') soundMode = 'VIBRATE';
      else if (mode === '2') soundMode = 'NORMAL';
    }).catch(() => {});
  }

  $effect(() => {
    if (serial) {
      loadDeviceState();
    }
  });

  const sendKey = (code: string) => run(['shell', 'input', 'keyevent', code]);

  async function applyMediaVolume(value: number) {
    if (!serial) { status = m.control_error_noDevice(); return; }
    const safeValue = Math.max(0, Math.min(value, controlVolumeMax));
    controlVolume = safeValue;
    busy = true;
    try {
      await invoke<string>('set_media_volume', { serial, volume: safeValue });
    } catch (error: any) { 
      status = translateError(error);
    } finally { 
      busy = false; 
    }
  }

  async function setDeviceRotation(value: number) {
    rotation = value;
    rotationAuto = false;
    await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    await run(['shell', 'settings', 'put', 'system', 'user_rotation', String(value)]);
  }

  async function setDeviceSoundMode(mode: SoundMode) {
    soundMode = mode;
    await run(['shell', 'cmd', 'audio', 'set-ringer-mode', mode]);
  }

  function importMacro() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') inputArgs = ev.target.result;
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportMacro() {
    if (!inputArgs) return;
    const blob = new Blob([inputArgs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'macro.txt';
    a.click();
    URL.revokeObjectURL(url);
    status = m.control_macro_saved() || 'Macro saved successfully';
  }

  async function runMacro() {
    if (!inputArgs) return;
    const lines = inputArgs.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    busy = true;
    try {
      for (const line of lines) {
        if (line.startsWith('sleep ')) {
          const ms = parseInt(line.split(' ')[1]) || 1000;
          await new Promise(r => setTimeout(r, ms));
        } else {
          const args = words(line);
          if (['keyevent', 'text', 'tap', 'swipe', 'roll', 'press'].includes(args[0])) {
            await run(['shell', 'input', ...args]);
          } else {
            await run(['shell', ...args]);
          }
        }
      }
    } catch (e: any) {
      status = e.message || String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="control-page">
  <div class="control-settings">
    <!-- BRILLO Y VOLUMEN -->
    <section class="md3-card">
      <div class="md3-card-header">
        <h3>{m.control_screenSound_title()}</h3>
      </div>
      <div class="md3-slider-group">
        <label class="md3-slider-container">
          <div class="md3-slider-info">
            <MaterialIcon name="light_mode" />
            <span>{m.control_screenSound_brightness()}</span>
            <strong>{controlBrightness} / 255</strong>
          </div>
          <md-slider
            min="0"
            max="255"
            value={controlBrightness}
            oninput={(event: any) => controlBrightness = Number(event.target.value)}
            onchange={(event: any) => run(['shell', 'settings', 'put', 'system', 'screen_brightness', String(event.target.value)])}
          ></md-slider>
        </label>

        <label class="md3-slider-container">
          <div class="md3-slider-info">
            <MaterialIcon name="volume_up" />
            <span>{m.control_screenSound_volume()}</span>
            <strong>{controlVolume} / {controlVolumeMax}</strong>
          </div>
          <md-slider
            min="0"
            max={controlVolumeMax}
            value={controlVolume}
            oninput={(event: any) => controlVolume = Number(event.target.value)}
            onchange={(event: any) => applyMediaVolume(Number(event.target.value))}
          ></md-slider>
        </label>
      </div>
    </section>

    <!-- ROTACIÓN -->
    <section class="md3-card">
      <div class="md3-card-header">
        <h3>{m.control_orientation_title()}</h3>
        <label class="md3-switch-container">
          <span>{m.control_orientation_auto()}</span>
          <!-- svelte-ignore a11y_missing_attribute -->
          <md-switch
            selected={rotationAuto ? true : undefined}
            onchange={async (event: any) => {
              const isAuto = event.target.selected;
              rotationAuto = isAuto;
              await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', isAuto ? '1' : '0']);
            }}
          ></md-switch>
        </label>
      </div>
      <div class="md3-segmented-button">
        {#each [
          ['stay_current_portrait', m.control_orientation_portrait(), 0], 
          ['stay_current_landscape', m.control_orientation_landscape(), 1], 
          ['stay_current_portrait', m.control_orientation_portraitRev(), 2], 
          ['stay_current_landscape', m.control_orientation_landscapeRev(), 3]
        ] as [icon, label, value]}
          <button class={!rotationAuto && rotation === value ? 'active' : ''} onclick={() => setDeviceRotation(Number(value))}>
            <MaterialIcon name={String(icon)} class={`rotation-${value}`} />
            <span>{label}</span>
          </button>
        {/each}
      </div>
    </section>

    <!-- MODO DE SONIDO -->
    <section class="md3-card">
      <div class="md3-card-header">
        <h3>{m.control_sound_title()}</h3>
      </div>
      <div class="md3-segmented-button">
        <button class={soundMode === 'NORMAL' ? 'active' : ''} onclick={() => setDeviceSoundMode('NORMAL')}>
          <MaterialIcon name="volume_up" filled={soundMode === 'NORMAL'} />
          <span>{m.control_sound_normal()}</span>
        </button>
        <button class={soundMode === 'VIBRATE' ? 'active' : ''} onclick={() => setDeviceSoundMode('VIBRATE')}>
          <MaterialIcon name="vibration" filled={soundMode === 'VIBRATE'} />
          <span>{m.control_sound_vibrate()}</span>
        </button>
        <button class={soundMode === 'SILENT' ? 'active' : ''} onclick={() => setDeviceSoundMode('SILENT')}>
          <MaterialIcon name="volume_off" filled={soundMode === 'SILENT'} />
          <span>{m.control_sound_silent()}</span>
        </button>
      </div>
    </section>

    <!-- INTRODUCIR TEXTO -->
    <section class="md3-card">
      <div class="md3-card-header">
        <h3>{m.control_input_title()}</h3>
      </div>
      <form class="md3-text-form" onsubmit={event => { event.preventDefault(); if (inputText) run(['shell', 'input', 'text', inputText.replace(/ /g, '%s')]); }}>
        <md-outlined-text-field
          label={m.control_input_text()}
          value={inputText}
          oninput={(e: any) => inputText = e.target.value}
          style="flex: 1"
        >
          {#if inputText}
            <md-icon-button slot="trailing-icon" type="button" onclick={() => inputText = ''}>
              <MaterialIcon name="close" />
            </md-icon-button>
          {/if}
        </md-outlined-text-field>
        <button class="md3-btn-filled">{m.control_input_send()}</button>
      </form>

      <details class="md3-details" open>
        <summary>{m.control_input_advanced()}</summary>
        <div class="md3-text-form" style="flex-direction: column">
          <md-chip-set style="margin-bottom: 8px">
            <md-suggestion-chip label="+ Tap" onclick={() => inputArgs = inputArgs + (inputArgs && !inputArgs.endsWith('\n') ? '\n' : '') + 'tap x y'}></md-suggestion-chip>
            <md-suggestion-chip label="+ Swipe" onclick={() => inputArgs = inputArgs + (inputArgs && !inputArgs.endsWith('\n') ? '\n' : '') + 'swipe x1 y1 x2 y2 duration'}></md-suggestion-chip>
            <md-suggestion-chip label="+ Text" onclick={() => inputArgs = inputArgs + (inputArgs && !inputArgs.endsWith('\n') ? '\n' : '') + 'text "hello"'}></md-suggestion-chip>
            <md-suggestion-chip label="+ Key" onclick={() => inputArgs = inputArgs + (inputArgs && !inputArgs.endsWith('\n') ? '\n' : '') + 'keyevent 26'}></md-suggestion-chip>
            <md-suggestion-chip label="+ Sleep" onclick={() => inputArgs = inputArgs + (inputArgs && !inputArgs.endsWith('\n') ? '\n' : '') + 'sleep 1000'}></md-suggestion-chip>
          </md-chip-set>
          <div style="display: flex; gap: 8px; width: 100%">
            <md-outlined-text-field
              type="textarea"
              rows="5"
              label={m.control_input_advancedDesc()}
              value={inputArgs}
              oninput={(e: any) => inputArgs = e.target.value}
              style="flex: 1; resize: vertical;"
            ></md-outlined-text-field>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px">
            <md-text-button onclick={importMacro}>
              <MaterialIcon name="folder_open" slot="icon" />
              {m.control_macro_import()}
            </md-text-button>
            <md-text-button onclick={exportMacro} disabled={!inputArgs ? true : undefined}>
              <MaterialIcon name="save" slot="icon" />
              {m.control_macro_export()}
            </md-text-button>
            <md-filled-button onclick={runMacro}>
              <MaterialIcon name="play_arrow" slot="icon" />
              {m.control_input_run()}
            </md-filled-button>
          </div>
        </div>
      </details>
    </section>
  </div>

  <!-- MANDO ANDROID TV -->
  <aside class="md3-remote-container">
    <div class="md3-remote">
      <div class="md3-remote-header">
        <h3>Android TV</h3>
        <button class="md3-remote-power" title={m.control_tv_power()} onclick={() => sendKey('KEYCODE_POWER')}>
          <MaterialIcon name="power_settings_new" />
        </button>
      </div>

      <div class="md3-remote-dpad">
        <button class="dpad-btn dpad-up" onclick={() => sendKey('KEYCODE_DPAD_UP')}><MaterialIcon name="keyboard_arrow_up" /></button>
        <button class="dpad-btn dpad-left" onclick={() => sendKey('KEYCODE_DPAD_LEFT')}><MaterialIcon name="keyboard_arrow_left" /></button>
        <button class="dpad-btn dpad-ok" onclick={() => sendKey('KEYCODE_DPAD_CENTER')}>OK</button>
        <button class="dpad-btn dpad-right" onclick={() => sendKey('KEYCODE_DPAD_RIGHT')}><MaterialIcon name="keyboard_arrow_right" /></button>
        <button class="dpad-btn dpad-down" onclick={() => sendKey('KEYCODE_DPAD_DOWN')}><MaterialIcon name="keyboard_arrow_down" /></button>
      </div>

      <div class="md3-remote-main-actions">
        <button class="md3-icon-btn-tonal" title={m.control_tv_back()} onclick={() => sendKey('KEYCODE_BACK')}><MaterialIcon name="arrow_back" /></button>
        <button class="md3-icon-btn-tonal assistant-btn" title={m.control_tv_assistant()} onclick={() => sendKey('KEYCODE_ASSIST')}><MaterialIcon name="assistant" filled /></button>
        <button class="md3-icon-btn-tonal" title={m.control_tv_home()} onclick={() => sendKey('KEYCODE_HOME')}><MaterialIcon name="home" filled /></button>
      </div>

      <div class="md3-remote-volume-row">
        <button class="md3-icon-btn-tonal mute-btn" title={m.control_tv_mute()} onclick={() => sendKey('KEYCODE_VOLUME_MUTE')}>
          <MaterialIcon name="volume_off" />
        </button>
        <div class="md3-volume-pill">
          <button onclick={() => applyMediaVolume(controlVolume - 1)}><MaterialIcon name="remove" /></button>
          <div class="volume-label"><span>{controlVolume}</span><small>VOL</small></div>
          <button onclick={() => applyMediaVolume(controlVolume + 1)}><MaterialIcon name="add" /></button>
        </div>
      </div>

      <div class="md3-remote-media-grid">
        <button onclick={() => sendKey('KEYCODE_APP_SWITCH')}><MaterialIcon name="recent_actors" /><span>{m.control_tv_recent()}</span></button>
        <button onclick={() => sendKey('KEYCODE_MENU')}><MaterialIcon name="menu" /><span>{m.control_tv_menu()}</span></button>
        <button onclick={() => sendKey('KEYCODE_INFO')}><MaterialIcon name="info" /><span>{m.control_tv_info()}</span></button>

        <button onclick={() => sendKey('KEYCODE_MEDIA_PREVIOUS')}><MaterialIcon name="skip_previous" filled /><span>{m.control_tv_previous()}</span></button>
        <button onclick={() => sendKey('KEYCODE_MEDIA_PLAY_PAUSE')}><MaterialIcon name="play_pause" filled /><span>{m.control_tv_playPause()}</span></button>
        <button onclick={() => sendKey('KEYCODE_MEDIA_NEXT')}><MaterialIcon name="skip_next" filled /><span>{m.control_tv_next()}</span></button>

        <button onclick={() => sendKey('KEYCODE_GUIDE')}><MaterialIcon name="tv" /><span>{m.control_tv_guide()}</span></button>
        <button onclick={() => sendKey('KEYCODE_CHANNEL_DOWN')}><MaterialIcon name="remove" /><span>{m.control_tv_chDown()}</span></button>
        <button onclick={() => sendKey('KEYCODE_CHANNEL_UP')}><MaterialIcon name="add" /><span>{m.control_tv_chUp()}</span></button>
      </div>
    </div>
  </aside>
</div>
