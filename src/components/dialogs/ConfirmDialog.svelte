<script lang="ts">
import * as m from '../../paraglide/messages';

  import { type Snippet } from 'svelte';
  
  import AppModal from './AppModal.svelte';

  let {
    open = false,
    title,
    message,
    confirmText,
    cancelText,
    isDanger = false,
    onConfirm,
    onCancel,
    messageSnippet
  } = $props<{
    open: boolean;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    messageSnippet?: Snippet;
  }>();

  let finalConfirmText = $derived(confirmText || m.common_confirm());
  let finalCancelText = $derived(cancelText || m.common_cancel());

  import { onMount } from 'svelte';
  onMount(() => {
    const handleEnter = (event: KeyboardEvent) => {
      if (open && event.key === 'Enter') {
        event.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  });
</script>

<AppModal {open} {title} onClose={onCancel} width="compact" cancelText={finalCancelText}>
  <p style="margin: 0; color: var(--on-surface-variant); line-height: 1.5;">
    {#if messageSnippet}
      {@render messageSnippet()}
    {:else}
      {message}
    {/if}
  </p>
  
  {#snippet actions()}
    <md-filled-button 
      onclick={onConfirm} 
      class={isDanger ? 'md-btn-danger' : ''}
    >
      {finalConfirmText}
    </md-filled-button>
  {/snippet}
</AppModal>
