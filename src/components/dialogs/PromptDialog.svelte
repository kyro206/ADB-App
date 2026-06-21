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
    onConfirm: (value: string) => void | Promise<void>;
    onCancel: () => void;
  }>();

  let value = $state('');
  let errorText = $state('');
  let submitting = $state(false);
  let finalConfirmText = $derived(confirmText || m.common_confirm());
  let finalCancelText = $derived(cancelText || m.common_cancel());

  $effect(() => {
    if (open) {
      value = initialValue;
      errorText = '';
      submitting = false;
    }
  });

  async function handleConfirm() {
    if (submitting) return;
    errorText = '';
    if (!value.trim()) {
      errorText = m.common_required();
      return;
    }
    submitting = true;
    try {
      await onConfirm(value);
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
    } finally {
      submitting = false;
    }
  }

  function handleCancel() {
    if (!submitting) onCancel();
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
  onClose={handleCancel}
  width="compact"
  cancelText={finalCancelText}
  cancelDisabled={submitting}
>
  <div style="margin-top: 8px;">
    <md-outlined-text-field
      style="width: 100%;"
      label={m.common_name()}
      use:materialTextFieldValue={value}
      oninput={(e: any) => { value = e.target.value; errorText = ''; }}
      onkeydown={handleKeyDown}
      error={errorText ? true : undefined}
      error-text={errorText}
    ></md-outlined-text-field>
  </div>

  {#snippet actions()}
    <md-filled-button disabled={submitting ? true : undefined} onclick={handleConfirm}>
      {finalConfirmText}
    </md-filled-button>
  {/snippet}
</AppModal>
