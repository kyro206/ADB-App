<script lang="ts">
import * as m from '../../paraglide/messages';

  
  import AppModal from './AppModal.svelte';
  import { materialTextFieldValue } from '../../actions/materialTextFieldValue';

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
  let finalConfirmText = $derived(confirmText || m.common_confirm());
  let finalCancelText = $derived(cancelText || m.common_cancel());

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
  cancelText={finalCancelText}
>
  <div style="margin-top: 8px;">
    <md-outlined-text-field
      style="width: 100%;"
      label={m.common_name()}
      use:materialTextFieldValue={value}
      oninput={(e: any) => value = e.target.value}
      onkeydown={handleKeyDown}
    ></md-outlined-text-field>
  </div>

  {#snippet actions()}
    <md-filled-button onclick={handleConfirm}>
      {finalConfirmText}
    </md-filled-button>
  {/snippet}
</AppModal>
