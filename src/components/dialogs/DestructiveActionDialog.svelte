<script lang="ts" module>
  export type DestructiveAppAction = 'uninstall' | 'clear-data';
</script>

<script lang="ts">
  import { i18n } from '../../locales/index.svelte';
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
  let title = $derived(uninstall ? i18n.t('app.action.uninstallApp') : i18n.t('app.action.clearData'));
  let description = $derived(uninstall ? i18n.t('app.desc.uninstall') : i18n.t('app.desc.clearData'));
</script>

<AppModal
  open={Boolean(action)}
  {onClose}
  width="compact"
  {title}
  subtitle={i18n.t('common.cannotUndo')}
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
      {i18n.t('common.cancel')}
    </md-text-button>
    <md-filled-button 
      class="destructive-dialog__confirm" 
      disabled={busy ? true : undefined} 
      onclick={onConfirm}
    >
      {busy ? i18n.t('common.processing') : uninstall ? i18n.t('common.uninstall') : i18n.t('common.clearData')}
    </md-filled-button>
  {/snippet}
</AppModal>
