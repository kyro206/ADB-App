<script lang="ts">
  import * as m from '../paraglide/messages';


  import { onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { words, translateError } from './workbench/utils';
  import type { ControlState, SoundMode } from './workbench/types';
  import { materialTextFieldValue } from '../actions/materialTextFieldValue';
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
  let loadRequestId = 0;
  let loadingDeviceState = false;
  let loadQueued = false;
  let refreshInterval: number | undefined;

  async function loadDeviceState() {
    if (!serial) return;
    if (loadingDeviceState) {
      loadQueued = true;
      return;
    }

    const requestId = ++loadRequestId;
    loadingDeviceState = true;
    loadQueued = false;

    try {
      const value = await invoke<ControlState>('get_control_state', { serial });
      if (requestId !== loadRequestId) return;
      controlBrightness = value.brightness;
      controlVolume = value.volume_level;
      controlVolumeMax = value.volume_maximum;
      rotationAuto = value.rotation_auto;
      rotation = value.rotation;
      soundMode = value.sound_mode;
    } catch {
      // Fallo silencioso, mantenemos los controles actuales
    } finally {
      loadingDeviceState = false;
      if (loadQueued) void loadDeviceState();
    }
  }

  $effect(() => {
    if (serial) {
      loadDeviceState();
    }
  });

  onMount(() => {
    refreshInterval = window.setInterval(() => {
      if (serial) void loadDeviceState();
    }, 5000);

    return () => {
      if (refreshInterval !== undefined) window.clearInterval(refreshInterval);
    };
  });

  onDestroy(() => {
    loadRequestId++;
  });

  const sendKey = async (code: string) => {
    if (!serial) return;
    try {
      await invoke('run_device_action', { serial, args: ['shell', 'input', 'keyevent', code] });
    } catch (error: any) {
      status = translateError(error);
    }
  };
  
  async function applyMediaVolume(value: number) {
    if (!serial) { status = m.control_error_noDevice(); return; }
    const safeValue = Math.max(0, Math.min(value, controlVolumeMax));
    controlVolume = safeValue;
    busy = true;
    try {
      await invoke<string>('set_media_volume', { serial, volume: safeValue });
      void loadDeviceState();
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
    void loadDeviceState();
  }

  async function setDeviceSoundMode(mode: SoundMode) {
    soundMode = mode;
    await run(['shell', 'cmd', 'audio', 'set-ringer-mode', mode]);
    void loadDeviceState();
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
          use:materialTextFieldValue={inputText}
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

      <details class="md3-details">
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
              rows={Math.max(3, inputArgs.split('\n').length)}
              label={m.control_input_advancedDesc()}
              use:materialTextFieldValue={inputArgs}
              oninput={(e: any) => inputArgs = e.target.value}
              style="flex: 1; resize: none;"
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

<style>
:global {
.control-page {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(420px, 1fr) minmax(350px, 380px);
  gap: 24px;
  align-items: flex-start;
}

.control-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* MD3 Cards */
.md3-card {
  background: var(--surface-container-low);
  border-radius: var(--radius-xl, 24px);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--outline-variant);
}

.md3-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.md3-card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--on-surface);
  letter-spacing: 0.1px;
}

.md3-slider-group {
  display: flex;
  flex-direction: column;
  gap: 24px; /* Espacio entre el grupo de brillo y el de volumen */
}

/* El contenedor principal ahora apila la info arriba y el slider abajo */
.md3-slider-container {
  display: flex;
  flex-direction: column; 
  gap: 8px;               /* Espacio entre la fila de texto y el medidor */
  width: 100%;
}

/* Fila de información (Icono + Texto a la izquierda, Valor a la derecha) */
.md3-slider-info {
  display: flex;
  align-items: center;
  width: 100%;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 500;
}

/* Separación pequeña entre el icono y la palabra (Brillo/Volumen) */
.md3-slider-info span {
  margin-left: 12px;
}

/* El truco: 'margin-left: auto' empuja el valor numérico al extremo derecho */
.md3-slider-info strong {
  color: var(--primary);
  font-weight: 600;
  margin-left: auto; 
}

/* El componente Slider abajo, ocupando el 100% del ancho */
.md3-slider-container md-slider {
  width: 100%;
  margin: 0; /* Resetea márgenes por si el componente trae alguno por defecto */
  --md-slider-active-track-color: var(--primary);
  --md-slider-inactive-track-color: var(--surface-container-highest);
  --md-slider-handle-color: var(--primary);
}

/* Contenedor del Switch con @material/web */
.md3-switch-container {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--on-surface-variant);
  font-weight: 500;
}

/* Botones Segmentados (Segmented Buttons) */
.md3-segmented-button {
  display: flex;
  border-radius: var(--radius-full, 20px);
  border: 1px solid var(--outline-variant);
  overflow: hidden;
}

.md3-segmented-button button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 4px;
  background: transparent;
  border: none;
  border-right: 1px solid var(--outline-variant);
  color: var(--on-surface);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.md3-segmented-button button:last-child {
  border-right: none;
}

.md3-segmented-button button:hover {
  background: var(--surface-container-highest);
}

.md3-segmented-button button.active {
  background: var(--primary-container);
  color: var(--on-primary-container);
}

.rotation-2 { transform: rotate(180deg); }
.rotation-3 { transform: rotate(180deg); }

/* Campos de Texto e Inputs */
.md3-text-form {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.md3-text-field {
  position: relative;
  flex: 1;
  background: var(--surface-container-highest);
  border-radius: 4px 4px 0 0;
  border-bottom: 1px solid var(--on-surface-variant);
}

.md3-text-field input {
  width: 100%;
  padding: 24px 16px 8px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--on-surface);
  font-size: 16px;
}

.md3-text-field label {
  position: absolute;
  left: 16px;
  top: 16px;
  font-size: 16px;
  color: var(--on-surface-variant);
  transition: all 0.2s ease;
  pointer-events: none;
}

.md3-text-field input:focus ~ label,
.md3-text-field input:not(:placeholder-shown) ~ label {
  top: 6px;
  font-size: 12px;
  color: var(--primary);
}

.md3-text-field input:focus {
  border-bottom: 2px solid var(--primary);
  margin-bottom: -1px;
}

/* Botones MD3 Estándar */
.md3-btn-filled {
  padding: 0 24px;
  border-radius: var(--radius-full, 20px);
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.md3-btn-filled {
  background: var(--primary);
  color: var(--surface-container-lowest, #fff);
}

.md3-btn-filled:hover {
  opacity: 0.85;
  opacity: 0.9;
}

.md3-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--outline-variant);
}

.md3-details summary {
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 16px;
}

/* =========================================
   MANDO ANDROID TV
   ========================================= */

.md3-remote-container {
  position: sticky;
}

.md3-remote {
  background: var(--surface-container-low);
  border: 1px solid var(--outline-variant);
  border-radius: 32px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.md3-remote-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
}

.md3-remote-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: var(--on-surface);
}

.md3-remote-power {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: color-mix(in srgb, var(--error) 20%, transparent);
  color: var(--error);
  display: grid;
  place-items: center;
  cursor: pointer;
  font-size: 24px;
  transition: opacity 0.2s;
}

.md3-remote-power:hover {
  opacity: 0.85;
}

/* =========================================
   D-PAD CON APARIENCIA ORIGINAL + HOVER SECTORIAL
   ========================================= */

.md3-remote-dpad {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--surface-container-highest);
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--outline-variant);
}

/* Los botones ahora cubren el 100% pero se recortan en forma de triángulo */
.dpad-btn {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--on-surface);
  cursor: pointer;
  transition: background 0.2s;
}



/* Clip-paths para dar el área de clic en forma de sector circular exacto */
.dpad-up    { clip-path: polygon(50% 50%, 0 0, 100% 0); }
.dpad-right { clip-path: polygon(50% 50%, 100% 0, 100% 100%); }
.dpad-down  { clip-path: polygon(50% 50%, 100% 100%, 0 100%); }
.dpad-left  { clip-path: polygon(50% 50%, 0 100%, 0 0); }

/* Reposicionamiento del icono para mantener su tamaño y lugar original (a 1/4 del borde) */
.dpad-btn > span {
  position: absolute;
  font-size: 32px;
}
.dpad-up > span    { top: 12.5%; left: 50%; transform: translateX(-50%); }
.dpad-down > span  { bottom: 12.5%; left: 50%; transform: translateX(-50%); }
.dpad-left > span  { left: 12.5%; top: 50%; transform: translateY(-50%); }
.dpad-right > span { right: 12.5%; top: 50%; transform: translateY(-50%); }

/* Botón OK restaurado completamente a su estética y tamaño original */
.dpad-ok {
  position: absolute;
  inset: 25%;
  background: var(--primary-container) !important;
  color: var(--on-primary-container) !important;
  border-radius: 50%;
  font-weight: 700;
  font-size: 16px;
  border: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 10;
  width: 50%;
  height: 50%;
}

/* =========================================
   OTRAS ACCIONES
   ========================================= */

.md3-remote-main-actions {
  display: flex;
  justify-content: space-evenly;
  padding: 0 16px;
}

.md3-icon-btn-tonal {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid var(--outline-variant);
  background: var(--surface-container-high);
  color: var(--on-surface);
  display: grid;
  place-items: center;
  font-size: 24px;
  cursor: pointer;
  transition: background 0.2s;
}.md3-icon-btn-tonal:hover {background: var(--surface-container-highest);}.assistant-btn {background: var(--primary-container);color: var(--on-primary-container);border: none;transform: scale(1.1);}.assistant-btn:hover {opacity: 0.9;}.md3-remote-volume-row {display: flex;gap: 16px;padding: 0 16px;}
.mute-btn {flex: 0 0 56px;}.md3-volume-pill {flex: 1;background: var(--surface-container-high);border: 1px solid var(--outline-variant);border-radius: 28px;display: flex;align-items: center;justify-content: space-between;padding: 4px;overflow: hidden;}.md3-volume-pill button {width: 48px;height: 48px;border-radius: 50%;background: transparent;border: none;color: var(--on-surface);font-size: 24px;cursor: pointer;}.md3-volume-pill button:hover {background: var(--surface-container-highest);}
.volume-label {display: flex;flex-direction: column;align-items: center;color: var(--on-surface);}.volume-label span { font-weight: 700; font-size: 16px; }.volume-label small { font-size: 10px; opacity: 0.7; font-weight: 600; letter-spacing: 0.5px; }
.md3-remote-media-grid {display: grid;grid-template-columns: repeat(3, 1fr);gap: 8px;padding: 16px 8px 0;border-top: 1px solid var(--outline-variant);}.md3-remote-media-grid button {display: flex;flex-direction: column;align-items: center;justify-content: center;gap: 8px;padding: 16px 8px;max-height: 60px;border-radius: var(--radius-lg, 16px);background: var(--surface-container);border: 1px solid var(--outline-variant);color: var(--on-surface);cursor: pointer;transition: background 0.2s;}.md3-remote-media-grid button:hover {background: var(--surface-container-highest);}.md3-remote-media-grid span {font-size: 12px;font-weight: 500;color: var(--on-surface-variant);}

@media (max-width: 1000px) {.control-page { grid-template-columns: 1fr; }.md3-remote-container { position: static; }.md3-remote { max-width: 400px; margin: 0 auto; }}
@media (max-width: 600px) {.md3-text-form { flex-direction: column; }.md3-btn-filled { padding: 12px 24px; }}
}
</style>
