<script lang="ts" module>
import * as m from '../paraglide/messages';

  export type Suggestion = { width: number; height: number; density: number };
</script>

<script lang="ts">
  import type { DeviceDetails } from '../context/devices.svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { materialTextFieldValue } from '../actions/materialTextFieldValue';
  
  import { formatRate } from './workbench/utils';
  import { invoke } from '@tauri-apps/api/core';
  let {
    details = $bindable(),
    serial,
    width = $bindable(),
    height = $bindable(),
    density = $bindable(),
    timeout = $bindable(),
    refreshRate,
    darkMode,
    darkModeLoading,
    suggestions,
    onToggleDarkMode,
    onSetRefreshRate,
    onReset,
    onApply
  } = $props<{
    details: DeviceDetails | null;
    width: number;
    height: number;
    density: number;
    timeout: number;
    refreshRate: number;
    darkMode: boolean;
    darkModeLoading: boolean;
    suggestions: Suggestion[];
    serial: string;
    onToggleDarkMode: () => void;
    onSetRefreshRate: (rate: number) => void;
    onReset: () => void;
    onApply: () => void;
  }>();

  let canApply = $derived(Boolean(details && width && height && density && timeout));
  let currentAnimationScale = $state(1.0);

  let currentFontScale = $state(1.0);

  $effect(() => {
    if (details) {
      currentAnimationScale = details.window_animation_scale;
      currentFontScale = details.font_scale;
    }
  });

  async function setAnimationSpeed(speed: number) {
    if (!details || !serial) return;
    if (currentAnimationScale === speed) return;

    currentAnimationScale = speed;

    const s = String(speed);
    await invoke('run_device_action', { serial, args: ['shell', 'settings', 'put', 'global', 'window_animation_scale', s] });
    await invoke('run_device_action', { serial, args: ['shell', 'settings', 'put', 'global', 'transition_animation_scale', s] });
    await invoke('run_device_action', { serial, args: ['shell', 'settings', 'put', 'global', 'animator_duration_scale', s] });
  }

  async function applyFontScale(scale: number) {
    if (!details || !serial) return;
    const num = Number(scale);
    if (currentFontScale === num) return;
    currentFontScale = num;
    await invoke('run_device_action', { serial, args: ['shell', 'settings', 'put', 'system', 'font_scale', String(num)] });
  }

</script>

{#snippet InfoCard(icon: string, label: string, value: string)}
  <article class="display-info-card">
    <MaterialIcon name={icon} filled />
    <span>{label}</span><strong>{value}</strong>
  </article>
{/snippet}

{#snippet Field(label: string, value: number, min: number, suffix: string, onValue: (value: number) => void)}
  <md-outlined-text-field 
    label={label} 
    type="number" 
    min={String(min)} 
    suffix-text={suffix} 
    use:materialTextFieldValue={value || ''} 
    oninput={(event: any) => onValue(Number(event.currentTarget.value))} 
  ></md-outlined-text-field>
{/snippet}

<div class="display-page">
  <section class="display-info-grid">
    {@render InfoCard("aspect_ratio", m.display_info_physicalRes(), details ? `${details.physical_width} × ${details.physical_height}` : '-')}
    {@render InfoCard("density_medium", m.display_info_physicalDensity(), details?.physical_density ? `${details.physical_density} dpi` : '-')}
    {@render InfoCard("width", m.display_info_smallestWidth(), details?.smallest_width_dp ? `${details.smallest_width_dp} dp` : '-')}
  </section>

  <div class="display-tuner-layout">
    <!-- Left Column: Resolution & Screen -->
    <div class="tuner-column">
      
      <!-- Panel: Dimensions -->
      <article class="display-panel">
        <header>
          <h3>{m.display_dimensions()}</h3>
        </header>
        <div class="display-fields two">
          {@render Field(m.display_edit_width(), width, 320, "px", v => width = v)}
          {@render Field(m.display_edit_height(), height, 320, "px", v => height = v)}
        </div>
        <div class="display-fields">
          {@render Field(m.display_edit_density(), density, 120, "dpi", v => density = v)}
        </div>
        <div class="display-fields">
          {@render Field(m.display_edit_time(), timeout, 1, "s", v => timeout = v)}
        </div>
        <div class="display-actions">
          <md-text-button disabled={!details} onclick={onReset}>
            {m.common_reset()}
          </md-text-button>
          <button class="md3-btn-filled" disabled={!canApply} onclick={onApply}>
            {m.common_apply()}
          </button>
        </div>
      </article>

      <!-- Panel: Presets -->
      <article class="display-panel">
        <header>
          <h3>{m.display_presets_title()}</h3>
        </header>
        <div class="display-presets">
          {#each suggestions as item (`${item.width}-${item.height}`)}
            <button onclick={() => { width = item.width; height = item.height; density = item.density; }}>
              <MaterialIcon name="photo_size_select_large" />
              <span>
                <strong>{item.width} × {item.height}</strong>
                <small>{item.density} dpi</small>
              </span>
            </button>
          {/each}
        </div>
      </article>

    </div>

    <!-- Right Column: UI Tweaks -->
    <div class="tuner-column">

      <!-- Panel: Refresh Rate -->
      <article class="display-panel">
        <header>
          <h3>{m.display_rates_title()}</h3>
        </header>
        <div class="display-rates">
          {#if details?.supported_refresh_rates_hz?.length}
            {#each details.supported_refresh_rates_hz as rate (rate)}
              {@const isSelected = Math.abs(rate - refreshRate) < 0.6}
              <button class={isSelected ? 'selected' : ''} onclick={() => onSetRefreshRate(rate)}>
                <MaterialIcon name={isSelected ? 'check_circle' : 'radio_button_unchecked'} />
                {formatRate(rate)}
              </button>
            {/each}
          {:else}
            <span>{m.display_rates_empty()}</span>
          {/if}
        </div>
      </article>
      <article class="display-panel">
        <header>
          <h3>{m.display_appearance()}</h3>
        </header>
        
        <div class="md3-segmented-button" style="margin-bottom: 8px">
          <button class={!darkMode ? 'active' : ''} disabled={!details || darkModeLoading} onclick={() => { if (darkMode) onToggleDarkMode(); }}>
            <MaterialIcon name="light_mode" />
            {m.common_light()}
          </button>
          <button class={darkMode ? 'active' : ''} disabled={!details || darkModeLoading} onclick={() => { if (!darkMode) onToggleDarkMode(); }}>
            <MaterialIcon name="dark_mode" />
            {m.common_dark()}
          </button>
        </div>

        <div class="slider-block">
          <div class="slider-header">
            <span>{m.display_fontScale()}</span>
            <strong>{currentFontScale.toFixed(2)}x</strong>
          </div>
          <md-slider 
            min="0.5" max="2.0" step="0.05" 
            value={currentFontScale} 
            disabled={!details}
            onchange={(e: any) => applyFontScale(e.target.value)}
          ></md-slider>
        </div>
      </article>

      <!-- Panel: System Speed -->
      <article class="display-panel">
        <header>
          <h3>{m.display_animations()}</h3>
        </header>
        <div class="md3-segmented-button">
          {#each [
            { label: m.display_speed_off(), val: 0.0 },
            { label: m.display_speed_fast(), val: 0.5 },
            { label: m.display_speed_normal(), val: 1.0 },
            { label: m.display_speed_slow(), val: 1.5 }
          ] as btn}
            {@const isSelected = Math.abs(currentAnimationScale - btn.val) < 0.1}
            <button class={isSelected ? 'active' : ''} onclick={() => setAnimationSpeed(btn.val)}>
              {btn.label}
            </button>
          {/each}
        </div>
      </article>
      
    </div>
  </div>
</div>

<style>
.display-page{container-type:inline-size;display:flex;min-height:100%;flex-direction:column;gap:16px}
.display-info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.display-info-card{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:14px;row-gap:2px;align-items:center;padding:16px;background:var(--surface-container-low);border:1px solid var(--outline-variant);border-radius:18px}
.display-info-card>:global(.material-symbols-rounded){grid-row:1 / 3;display:grid;place-items:center;width:44px;height:44px;color:var(--on-primary-container);background:var(--primary-container);border-radius:13px;font-size:24px}
.display-info-card span{grid-column:2;font-size:12px;color:var(--on-surface-variant);font-weight:500;align-self:flex-end}
.display-info-card strong{grid-column:2;font-size:16px;color:var(--on-surface);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;align-self:flex-start}

.display-tuner-layout{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.tuner-column{display:flex;flex-direction:column;gap:12px}

.display-panel{padding:16px;background:var(--surface-container-low);border:1px solid var(--outline-variant);border-radius:20px;display:flex;flex-direction:column;gap:14px}
.display-panel header{display:flex;align-items:center;gap:12px;cursor:help}
.display-panel header>:global(.material-symbols-rounded){display:grid;place-items:center;width:40px;height:40px;color:var(--primary);background:var(--surface-container-high);border-radius:12px;font-size:22px}
.display-panel h3{font-size:16px;font-weight:600;flex:1;margin:0}

.display-fields{display:grid;grid-template-columns:1fr;gap:8px}.display-fields.two{grid-template-columns:repeat(2,minmax(0,1fr))}.display-fields md-outlined-text-field{width:100%;--md-outlined-field-container-shape:12px;--md-outlined-field-label-text-size:11px;--md-outlined-field-input-text-size:14px}

.display-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:4px}
.display-actions md-text-button{height:40px}

/* Botones MD3 Estándar */
.md3-btn-filled {
  padding: 0 24px;
  border-radius: var(--radius-full, 20px);
  height: 40px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
  background: var(--primary);
  color: var(--surface-container-lowest, #fff);
}

.md3-btn-filled:disabled {
  background: var(--surface-container-highest);
  color: var(--on-surface-variant);
  opacity: 0.5;
  cursor: not-allowed;
}

.md3-btn-filled:not(:disabled):hover {
  opacity: 0.9;
}

.display-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.display-presets button,.display-rates button{display:flex;align-items:center;gap:8px;min-height:42px;padding:8px 11px;color:var(--on-surface);background:var(--surface-container);border:1px solid var(--outline-variant);border-radius:12px;text-align:left}
.display-presets button:hover,.display-rates button:hover,.display-rates button.selected{color:var(--on-primary-container);background:var(--primary-container);border-color:transparent}
.display-presets button>:global(.material-symbols-rounded),.display-rates button>:global(.material-symbols-rounded){color:var(--primary);font-size:19px}
.display-presets button span{display:flex;flex-direction:column}
.display-presets small{color:var(--on-surface-variant);font-size:11px}
.display-rates{display:flex;flex-wrap:wrap;gap:8px}
.display-rates button{min-height:36px;padding:6px 11px}

.slider-block{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.slider-header{display:flex;justify-content:space-between;align-items:center;padding:0 8px}
.slider-header span{color:var(--on-surface-variant);font-size:14px}
.slider-header strong{color:var(--on-surface);font-size:14px;font-weight:600}
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
  font-size: 13px;
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

@media(max-width:850px){.display-tuner-layout{grid-template-columns:1fr}.display-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.display-info-card{aspect-ratio:auto;min-height:150px}}
@media(max-width:620px){.display-fields.two,.display-presets{grid-template-columns:1fr}}
</style>
