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
