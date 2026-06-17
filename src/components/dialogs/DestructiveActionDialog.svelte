<script lang="ts" module>
import * as m from '../../paraglide/messages';

  export type DestructiveAppAction = 'uninstall' | 'clear-data';
</script>

<script lang="ts">
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
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

<style>
:global {
.destructive-dialog{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:16px;padding:12px 0}.destructive-dialog__package{margin:0!important}.destructive-dialog__icon{display:grid;width:56px;height:56px;overflow:hidden;place-items:center;color:var(--error);background:color-mix(in srgb,var(--error) 14%,transparent);border-radius:16px}.destructive-dialog__icon img{display:block;width:100%;height:100%;object-fit:cover}.destructive-dialog__icon :global(.material-symbols-rounded){font-size:28px}.destructive-dialog strong,.destructive-dialog code{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.destructive-dialog strong{font-size:16px}.destructive-dialog code{margin-top:3px;color:var(--on-surface-variant);font-size:11px}.destructive-dialog p{margin-top:14px;color:var(--on-surface-variant);font-size:12px;line-height:1.5}.destructive-dialog__confirm{--md-filled-button-container-color:var(--error);--md-filled-button-label-text-color:var(--surface);--md-filled-button-hover-label-text-color:var(--surface);--md-filled-button-pressed-label-text-color:var(--surface)}
}
</style>
