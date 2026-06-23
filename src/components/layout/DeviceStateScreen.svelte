<script lang="ts">
import * as m from '../../paraglide/messages';

  
  import MaterialIcon from '../MaterialIcon.svelte';
  let {
    serial,
    loading = false,
    children
  } = $props<{
    serial: string | null;
    loading?: boolean;
    children?: import('svelte').Snippet;
  }>();
</script>

{#if !serial}
  <div class="device-state-screen empty">
    <MaterialIcon name="phonelink_off" size={48} class="device-state-icon" />
    <h2>{m.common_device_empty_title()}</h2>
    <p>{m.common_device_empty_desc()}</p>
  </div>
{:else}
  <div style="display: contents">
    {@render children?.()}
  </div>
  {#if loading}
    <div class="device-state-screen loading overlay">
      <md-circular-progress indeterminate></md-circular-progress>
    </div>
  {/if}
{/if}

<style>
:global {
.device-state-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  flex: 1;
  color: var(--on-surface-variant);
  text-align: center;
  padding: 32px;
  box-sizing: border-box;
}

.device-state-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.device-state-screen h2 {
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--on-surface);
}

.device-state-screen p {
  font-size: 14px;
  margin: 0;
  max-width: 400px;
}

.device-state-screen.loading.overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  gap: 14px;
  padding: 0;
}
}
</style>
