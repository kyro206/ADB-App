<script lang="ts">
  import { i18n } from '../../locales/index.svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  import './DeviceStateScreen.css';

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
    <h2>{i18n.t('common.device.empty.title')}</h2>
    <p>{i18n.t('common.device.empty.desc')}</p>
  </div>
{:else}
  {#if loading}
    <div class="device-state-screen loading">
      <md-circular-progress indeterminate></md-circular-progress>
    </div>
  {/if}
  <div style="display: {loading ? 'none' : 'contents'}">
    {@render children?.()}
  </div>
{/if}
