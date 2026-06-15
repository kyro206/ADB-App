<script lang="ts">
  import { type Snippet } from 'svelte';
  import { i18n } from '../../locales/index.svelte';
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

  let finalConfirmText = $derived(confirmText || i18n.t('common.confirm'));
  let finalCancelText = $derived(cancelText || i18n.t('common.cancel'));

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

<AppModal {open} {title} onClose={onCancel} width="compact">
  <p style="margin: 0; color: var(--on-surface-variant); line-height: 1.5;">
    {#if messageSnippet}
      {@render messageSnippet()}
    {:else}
      {message}
    {/if}
  </p>
  
  {#snippet actions()}
    <md-text-button onclick={onCancel}>{finalCancelText}</md-text-button>
    <md-filled-button 
      onclick={onConfirm} 
      class={isDanger ? 'md-btn-danger' : ''}
    >
      {finalConfirmText}
    </md-filled-button>
  {/snippet}
</AppModal>
