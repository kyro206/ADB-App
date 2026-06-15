<script lang="ts">
  import { i18n } from '../../locales/index.svelte';
  import AppModal from './AppModal.svelte';

  let {
    open = false,
    title,
    initialValue = '',
    confirmText,
    cancelText,
    onConfirm,
    onCancel
  } = $props<{
    open: boolean;
    title: string;
    initialValue?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  }>();

  let value = $state(initialValue);
  let finalConfirmText = $derived(confirmText || i18n.t('common.confirm'));
  let finalCancelText = $derived(cancelText || i18n.t('common.cancel'));

  $effect(() => {
    if (open) {
      value = initialValue;
    }
  });

  function handleConfirm() {
    onConfirm(value);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  }
</script>

<AppModal
  {open}
  {title}
  onClose={onCancel}
  width="compact"
>
  <div style="margin-top: 8px;">
    <md-outlined-text-field
      style="width: 100%;"
      label={i18n.t('common.name')}
      {value}
      oninput={(e: any) => value = e.target.value}
      onkeydown={handleKeyDown}
    ></md-outlined-text-field>
  </div>

  {#snippet actions()}
    <md-text-button onclick={onCancel}>{finalCancelText}</md-text-button>
    <md-filled-button onclick={handleConfirm}>
      {finalConfirmText}
    </md-filled-button>
  {/snippet}
</AppModal>
