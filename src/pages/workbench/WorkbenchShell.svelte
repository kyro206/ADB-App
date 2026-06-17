<script lang="ts">
  import '@material/web/progress/circular-progress.js';

  let {
    title,
    busy,
    status,
    children
  } = $props<{
    title: string;
    busy: boolean;
    status: string;
    children?: import('svelte').Snippet;
  }>();
</script>

<div class="workbench">
  <header class="page-header">
    <h2>{title}</h2>
    <span class="status {busy ? 'busy' : ''}" style="display: flex; align-items: center; padding: 0">
      {#if busy}
        <md-circular-progress 
          indeterminate 
          style="--md-circular-progress-size: 30px;"
        ></md-circular-progress>
      {:else}
        {status}
      {/if}
    </span>
  </header>
  <div class="workbench-content">
    {@render children?.()}
  </div>
</div>

<style>
:global {
.workbench {
    display: flex;
    position: relative;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface);
}

.page-header {
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 24px;
    background: var(--surface-container-low);
    border-bottom: 1px solid var(--outline-variant);
}

.page-header h2 {
    margin: 0;
    color: var(--on-surface);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0;
}

.page-header p,
.muted {
    margin: 0;
    color: var(--on-surface-variant);
    font-size: 12px;
}

.status {
    max-width: min(52%, 560px);
    min-width: 0;
    color: var(--on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status.busy {
    color: var(--primary);
}

.workbench-content {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: auto;
    padding: 24px;
    background: var(--surface);
}

@media (max-width: 720px) {
    .page-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .status {
        max-width: 100%;
    }

    .workbench-content {
        padding: 16px;
    }
}
}
</style>
