<script lang="ts" module>
  export interface ContextMenuItem {
    icon?: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  let {
    x,
    y,
    items,
    onClose
  } = $props<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
  }>();

  let ref: HTMLDivElement | null = $state(null);
  let finalX = $state(x);
  let finalY = $state(y);

  function handleClick(e: MouseEvent) {
    if (ref && !ref.contains(e.target as Node)) {
      onClose();
    }
  }

  function handleContext(e: MouseEvent) {
    if (ref && !ref.contains(e.target as Node)) {
      onClose();
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('contextmenu', handleContext);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('contextmenu', handleContext);
    };
  });

  $effect(() => {
    if (!ref) return;
    
    // Only re-calculate if x or y changes

    
    // Small delay to ensure the DOM is updated and rect is correct
    setTimeout(() => {
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let nextX = x;
      let nextY = y;
      
      if (nextX + rect.width > viewportWidth) nextX = viewportWidth - rect.width - 8;
      if (nextY + rect.height > viewportHeight) nextY = viewportHeight - rect.height - 8;
      
      finalX = nextX;
      finalY = nextY;
    }, 0);
  });
</script>

<div class="context-menu" bind:this={ref} style="left: {finalX}px; top: {finalY}px;">
  {#each items as item}
    <button
      class="context-menu-item {item.danger ? 'danger' : ''}"
      disabled={item.disabled ? true : undefined}
      onclick={() => {
        if (!item.disabled) {
          item.onClick();
          onClose();
        }
      }}
    >
      {#if item.icon}
        <MaterialIcon name={item.icon} size={20} />
      {/if}
      <span>{item.label}</span>
    </button>
  {/each}
</div>

<style>
:global {
.context-menu {
  position: fixed;
  background: var(--md-sys-color-surface-container);
  border-radius: 8px;
  padding: 8px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  pointer-events: auto;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.context-menu-item:hover:not(:disabled) {
  background: var(--md-sys-color-surface-container-highest);
}

.context-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.context-menu-item.danger {
  color: var(--md-sys-color-error);
}
}
</style>
