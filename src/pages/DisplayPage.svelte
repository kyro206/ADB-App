<script lang="ts" module>
import * as m from '../paraglide/messages';

  export type Suggestion = { width: number; height: number; density: number };
</script>

<script lang="ts">
  import type { DeviceDetails } from '../context/devices.svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { materialTextFieldValue } from '../actions/materialTextFieldValue';
  
  import { formatRate } from './workbench/utils';
  let {
    details,
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
    onToggleDarkMode: () => void;
    onSetRefreshRate: (rate: number) => void;
    onReset: () => void;
    onApply: () => void;
  }>();

  let canApply = $derived(Boolean(details && width && height && density && timeout));
</script>

{#snippet InfoCard(icon: string, label: string, value: string)}
  <article class="display-info-card">
    <MaterialIcon name={icon} filled />
    <span>{label}</span><strong>{value}</strong>
  </article>
{/snippet}

{#snippet EditCard(icon: string, label: string, children: import('svelte').Snippet)}
  <article class="display-edit-card">
    <header>
      <MaterialIcon name={icon} filled />
      <h3>{label}</h3>
    </header>
    {@render children()}
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
    {@render InfoCard("screenshot_monitor", m.display_info_currentRes(), details ? `${details.current_width} × ${details.current_height}` : '-')}
    {@render InfoCard("aspect_ratio", m.display_info_physicalRes(), details ? `${details.physical_width} × ${details.physical_height}` : '-')}
    {@render InfoCard("density_medium", m.display_info_physicalDensity(), details?.physical_density ? `${details.physical_density} dpi` : '-')}
    {@render InfoCard("width", m.display_info_smallestWidth(), details?.smallest_width_dp ? `${details.smallest_width_dp} dp` : '-')}
  </section>

  <section class="display-editor-grid">
    {#snippet resChildren()}
      <div class="display-fields two">
        {@render Field(m.display_edit_width(), width, 320, "px", v => width = v)}
        {@render Field(m.display_edit_height(), height, 320, "px", v => height = v)}
      </div>
    {/snippet}
    {@render EditCard("aspect_ratio", m.display_edit_res(), resChildren)}

    {#snippet densityChildren()}
      <div class="display-fields">
        {@render Field(m.display_edit_density(), density, 120, "dpi", v => density = v)}
      </div>
    {/snippet}
    {@render EditCard("density_medium", m.display_edit_density(), densityChildren)}

    {#snippet timeoutChildren()}
      <div class="display-fields">
        {@render Field(m.display_edit_time(), timeout, 1, "s", v => timeout = v)}
      </div>
    {/snippet}
    {@render EditCard("timer", m.display_edit_timeout(), timeoutChildren)}

    <article class="display-dark-card {darkMode ? 'active' : ''} {darkModeLoading ? 'loading' : ''}">
      <span class="display-dark-card__icon">
        <MaterialIcon name={darkMode ? 'dark_mode' : 'light_mode'} filled />
      </span>
      <div>
        <span>{m.display_dark_title()}</span>
        <strong>
          {darkModeLoading ? m.display_dark_changing() : darkMode ? m.display_dark_on() : m.display_dark_off()}
        </strong>
      </div>
      <md-switch 
        selected={darkMode} 
        disabled={!details || darkModeLoading} 
        onclick={onToggleDarkMode} 
      ></md-switch>
    </article>
  </section>

  <section class="display-actions">
    <md-outlined-button disabled={!details} onclick={onReset}>
      <span slot="icon"><MaterialIcon name="restart_alt" size={18} /></span>
      {m.common_reset()}
    </md-outlined-button>
    <md-filled-button disabled={!canApply} onclick={onApply}>
      <span slot="icon"><MaterialIcon name="check" filled size={18} /></span>
      {m.common_apply()}
    </md-filled-button>
  </section>

  <section class="display-bottom-grid">
    <article class="display-panel">
      <header>
        <MaterialIcon name="auto_awesome" filled />
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
    <article class="display-panel">
      <header>
        <MaterialIcon name="speed" filled />
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
  </section>
</div>

<style>
.display-page{container-type:inline-size;display:flex;min-height:100%;flex-direction:column;gap:16px}
.display-info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.display-info-card{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:14px;row-gap:2px;align-items:center;padding:16px;background:var(--surface-container-low);border:1px solid var(--outline-variant);border-radius:18px}
.display-info-card>:global(.material-symbols-rounded){grid-row:1 / 3;display:grid;place-items:center;width:44px;height:44px;color:var(--on-primary-container);background:var(--primary-container);border-radius:13px;font-size:24px}
.display-info-card span{grid-column:2;font-size:12px;color:var(--on-surface-variant);font-weight:500;align-self:flex-end}
.display-info-card strong{grid-column:2;font-size:16px;color:var(--on-surface);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;align-self:flex-start}
.display-editor-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1.35fr;gap:12px}.display-edit-card,.display-dark-card,.display-panel,.display-actions{padding:16px;background:var(--surface-container-low);border:1px solid var(--outline-variant);border-radius:20px}.display-edit-card{display:flex;flex-direction:column;gap:14px}
.display-edit-card header, .display-panel header{display:flex;align-items:center;gap:12px;cursor:help}
.display-edit-card header>:global(.material-symbols-rounded), .display-panel header>:global(.material-symbols-rounded){display:grid;place-items:center;width:40px;height:40px;color:var(--primary);background:var(--surface-container-high);border-radius:12px;font-size:22px}
.display-edit-card h3, .display-panel h3{font-size:16px;font-weight:600;flex:1;margin:0}
.display-fields{display:grid;grid-template-columns:1fr;gap:8px}.display-fields.two{grid-template-columns:repeat(2,minmax(0,1fr))}.display-fields md-outlined-text-field{width:100%;--md-outlined-field-container-shape:12px;--md-outlined-field-label-text-size:11px;--md-outlined-field-input-text-size:14px}
.display-dark-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;transition:background 180ms cubic-bezier(.2,0,0,1)}.display-dark-card.active{background:var(--primary-container)}.display-dark-card.loading{opacity:.65}.display-dark-card__icon{display:grid;place-items:center;width:48px;height:48px;color:var(--primary);background:var(--surface-container-high);border-radius:15px}.display-dark-card div{display:flex;min-width:0;flex-direction:column;gap:3px}.display-dark-card div span{color:var(--on-surface-variant);font-size:10px}.display-dark-card strong{font-size:13px}.display-dark-card md-switch{transform:scale(.82)}
.display-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px}
.display-actions md-filled-button{--md-filled-button-container-shape:16px;height:48px}
.display-actions md-outlined-button{--md-outlined-button-container-shape:16px;height:48px}
.display-bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.display-panel{display:flex;flex-direction:column;gap:13px}.display-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.display-presets button,.display-rates button{display:flex;align-items:center;gap:8px;min-height:42px;padding:8px 11px;color:var(--on-surface);background:var(--surface-container);border:1px solid var(--outline-variant);border-radius:12px;text-align:left}.display-presets button:hover,.display-rates button:hover,.display-rates button.selected{color:var(--on-primary-container);background:var(--primary-container);border-color:transparent}.display-presets button>:global(.material-symbols-rounded),.display-rates button>:global(.material-symbols-rounded){color:var(--primary);font-size:19px}.display-presets button span{display:flex;flex-direction:column}.display-presets small{color:var(--on-surface-variant);font-size:11px}.display-rates{display:flex;flex-wrap:wrap;gap:8px}.display-rates button{min-height:36px;padding:6px 11px}
@media(max-width:1200px){.display-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:850px){.display-bottom-grid{grid-template-columns:1fr}.display-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.display-info-card{aspect-ratio:auto;min-height:150px}}@media(max-width:620px){.display-editor-grid,.display-fields.two,.display-presets{grid-template-columns:1fr}.display-actions{align-items:stretch;flex-wrap:wrap}}
</style>
