<script lang="ts" module>
  export type Suggestion = { width: number; height: number; density: number };
</script>

<script lang="ts">
  import type { DeviceDetails } from '../context/devices.svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { i18n } from '../locales/index.svelte';
  import { formatRate } from './workbench/utils';
  import './DisplayPage.css';

  let {
    details,
    deviceType,
    width,
    setWidth,
    height,
    setHeight,
    density,
    setDensity,
    timeout,
    setTimeout,
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
    deviceType: string;
    width: number; setWidth: (v: number) => void;
    height: number; setHeight: (v: number) => void;
    density: number; setDensity: (v: number) => void;
    timeout: number; setTimeout: (v: number) => void;
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
  <!-- svelte-ignore a11y_missing_attribute -->
  <md-outlined-text-field 
    label={label} 
    type="number" 
    min={String(min)} 
    suffix-text={suffix} 
    value={value || ''} 
    oninput={(event: any) => onValue(Number(event.currentTarget.value))} 
  ></md-outlined-text-field>
{/snippet}

<div class="display-page">
  <section class="display-info-grid">
    {@render InfoCard("screenshot_monitor", i18n.t('display.info.currentRes'), details ? `${details.current_width} × ${details.current_height}` : '-')}
    {@render InfoCard("aspect_ratio", i18n.t('display.info.physicalRes'), details ? `${details.physical_width} × ${details.physical_height}` : '-')}
    {@render InfoCard("density_medium", i18n.t('display.info.physicalDensity'), details?.physical_density ? `${details.physical_density} dpi` : '-')}
    {@render InfoCard("width", i18n.t('display.info.smallestWidth'), details?.smallest_width_dp ? `${details.smallest_width_dp} dp` : '-')}
  </section>

  <section class="display-editor-grid">
    {#snippet resChildren()}
      <div class="display-fields two">
        {@render Field(i18n.t('display.edit.width'), width, 320, "px", setWidth)}
        {@render Field(i18n.t('display.edit.height'), height, 320, "px", setHeight)}
      </div>
    {/snippet}
    {@render EditCard("aspect_ratio", i18n.t('display.edit.res'), resChildren)}

    {#snippet densityChildren()}
      <div class="display-fields">
        {@render Field(i18n.t('display.edit.density'), density, 120, "dpi", setDensity)}
      </div>
    {/snippet}
    {@render EditCard("density_medium", i18n.t('display.edit.density'), densityChildren)}

    {#snippet timeoutChildren()}
      <div class="display-fields">
        {@render Field(i18n.t('display.edit.time'), timeout, 1, "s", setTimeout)}
      </div>
    {/snippet}
    {@render EditCard("timer", i18n.t('display.edit.timeout'), timeoutChildren)}

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <article class="display-dark-card {darkModeLoading ? 'loading' : ''}">
      <span class="display-dark-card__icon">
        <MaterialIcon name={darkMode ? 'dark_mode' : 'light_mode'} filled />
      </span>
      <div>
        <span>{i18n.t('display.dark.title')}</span>
        <strong>
          {darkModeLoading ? i18n.t('display.dark.changing') : darkMode ? i18n.t('display.dark.on') : i18n.t('display.dark.off')}
        </strong>
      </div>
      <!-- svelte-ignore a11y_missing_attribute -->
      <md-switch 
        selected={darkMode ? true : undefined} 
        disabled={!details || darkModeLoading ? true : undefined} 
        onclick={onToggleDarkMode} 
      ></md-switch>
    </article>
  </section>

  <section class="display-actions">
    <md-outlined-button disabled={!details ? true : undefined} onclick={onReset}>
      <span slot="icon"><MaterialIcon name="restart_alt" size={22} /></span>
      {i18n.t('common.reset')}
    </md-outlined-button>
    <md-filled-button disabled={!canApply ? true : undefined} onclick={onApply}>
      <span slot="icon"><MaterialIcon name="check" filled size={22} /></span>
      {i18n.t('common.apply')}
    </md-filled-button>
  </section>

  <section class="display-bottom-grid">
    <article class="display-panel">
      <header>
        <MaterialIcon name="auto_awesome" filled />
        <h3>{i18n.t('display.presets.title')}</h3>
      </header>
      <div class="display-presets">
        {#each suggestions as item (`${item.width}-${item.height}`)}
          <button onclick={() => { setWidth(item.width); setHeight(item.height); setDensity(item.density); }}>
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
        <h3>{i18n.t('display.rates.title')}</h3>
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
          <span>{i18n.t('display.rates.empty')}</span>
        {/if}
      </div>
    </article>
  </section>
</div>
