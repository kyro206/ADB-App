<script lang="ts">
  import MaterialIcon from './MaterialIcon.svelte';

  let { icon, text } = $props<{
    icon: string;
    text: string;
  }>();
</script>

<div class="drag-overlay">
  <MaterialIcon name={icon} />
  <span>{text}</span>
</div>

<style>
  .drag-overlay {
    position: absolute;
    z-index: 99;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    color: var(--action-bg);
    font-size: 24px;
    font-weight: 700;
  }
  .drag-overlay :global(.material-symbols-rounded) {
    font-size: 64px;
    color: var(--action-bg);
  }
</style>
