<script lang="ts">
import * as m from '../../paraglide/messages';

  import { onMount, type Snippet } from 'svelte';
  
  import MaterialIcon from '../MaterialIcon.svelte';
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

<style>
:global {
.app-modal-layer{position:fixed;z-index:60;inset:var(--topbar-height) 0 0;display:grid;place-items:center;padding:24px;animation: fadeIn 0.2s ease-out forwards;}.app-modal-scrim{position:absolute;inset:0;width:100%;height:100%;padding:0;background:rgba(0,0,0,.56);border:0;border-radius:0}.app-modal{position:relative;display:flex;width:min(100%,720px);max-height:calc(100vh - var(--topbar-height) - 48px);flex-direction:column;overflow:hidden;color:var(--on-surface);background:var(--surface-container-high);border-radius:var(--radius-xl);animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;}.app-modal>md-elevation{--md-elevation-level:4}.app-modal--compact{max-width:560px}.app-modal--large{max-width:920px}.app-modal__header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 24px 16px}.app-modal__header h2{font-size:24px;font-weight:500;line-height:1.25}.app-modal__header p{margin-top:4px;color:var(--on-surface-variant)}.app-modal__content{min-height:0;overflow:auto;padding:8px 24px 20px}.app-modal__actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 24px 20px;border-top:1px solid var(--outline-variant)}@media(max-width:700px){.app-modal-layer{padding:12px}.app-modal{max-height:calc(100vh - var(--topbar-height) - 24px)}.app-modal__header{padding:18px 18px 12px}.app-modal__content{padding:6px 18px 16px}.app-modal__actions{padding:10px 18px 16px}}
@keyframes fadeIn {from { opacity: 0; }to { opacity: 1; }}
@keyframes scaleUp {from { opacity: 0; transform: scale(0.95) translateY(10px); }to { opacity: 1; transform: scale(1) translateY(0); }}
}
</style>
