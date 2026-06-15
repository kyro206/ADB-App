<script lang="ts" module>
import * as m from '../../paraglide/messages';

  export type DestructiveAppAction = 'uninstall' | 'clear-data';
</script>

<script lang="ts">
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  import './DestructiveActionDialog.css';

  let {
    action,
    appName,
    packageName,
    iconDataUrl,
    busy,
    onClose,
    onConfirm
  } = $props<{
    action: DestructiveAppAction | null;
    appName: string;
    packageName: string;
    iconDataUrl: string;
    busy: boolean;
    onClose: () => void;
    onConfirm: () => void;
  }>();

  let uninstall = $derived(action === 'uninstall');
  let title = $derived(uninstall ? m.app_action_uninstallApp() : m.app_action_clearData());
  let description = $derived(uninstall ? m.app_desc_uninstall() : m.app_desc_clearData());
</script>

<AppModal
  open={Boolean(action)}
  {onClose}
  width="compact"
  {title}
  subtitle={m.common_cannotUndo()}
>
  <div class="destructive-dialog">
    <span class="destructive-dialog__icon">
      {#if iconDataUrl}
        <img src={iconDataUrl} alt="" />
      {:else}
        <MaterialIcon name={uninstall ? 'delete_forever' : 'delete_sweep'} />
      {/if}
    </span>
    <div>
      <strong>{appName}</strong>
      <p class="destructive-dialog__package">{packageName}</p>
      <p>{description}</p>
    </div>
  </div>

  {#snippet actions()}
    <md-text-button disabled={busy ? true : undefined} onclick={onClose}>
      {m.common_cancel()}
    </md-text-button>
    <md-filled-button 
      class="destructive-dialog__confirm" 
      disabled={busy ? true : undefined} 
      onclick={onConfirm}
    >
      {busy ? m.common_processing() : uninstall ? m.common_uninstall() : m.common_clearData()}
    </md-filled-button>
  {/snippet}
</AppModal>
