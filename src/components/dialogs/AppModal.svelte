<script lang="ts">
import * as m from '../../paraglide/messages';

  import { onMount, type Snippet } from 'svelte';
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import './AppModal.css';

  let {
    open = false,
    title,
    subtitle = '',
    width = 'medium',
    onClose,
    children,
    actions
  } = $props<{
    open: boolean;
    title: string;
    subtitle?: string;
    width?: 'compact' | 'medium' | 'large';
    onClose: () => void;
    children?: Snippet;
    actions?: Snippet;
  }>();

  onMount(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  });
</script>

{#if open}
  <div class="app-modal-layer" ondblclick={e => e.stopPropagation()}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="app-modal-scrim" onclick={onClose} aria-hidden="true"></div>
    
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <section 
      class="app-modal app-modal--{width}" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="app-modal-title" 
      onclick={e => e.stopPropagation()}
    >
      <md-elevation></md-elevation>
      <header class="app-modal__header">
        <div>
          <h2 id="app-modal-title">{title}</h2>
          {#if subtitle}
            <p>{subtitle}</p>
          {/if}
        </div>
        <md-icon-button aria-label={m.common_close()} onclick={onClose}>
          <MaterialIcon name="close" />
        </md-icon-button>
      </header>
      
      <div class="app-modal__content">
        {@render children?.()}
      </div>
      
      {#if actions}
        <footer class="app-modal__actions">
          {@render actions()}
        </footer>
      {/if}
    </section>
  </div>
{/if}
