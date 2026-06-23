<script lang="ts">
  import * as m from '../../paraglide/messages';
  import MaterialIcon from '../MaterialIcon.svelte';
  import { operationsState, type OperationStatus } from '../../context/operations.svelte';
  import { openPath } from '@tauri-apps/plugin-opener';
  import ContextMenu from './ContextMenu.svelte';
  
  function getIconForJob(job: any) {
    if (job.type === 'install') return 'android';
    if (job.isDirectory) return 'folder';
    if (job.type === 'upload') return 'upload_file';
    return 'download';
  }

  let contextMenu = $state<{ x: number; y: number; job: any } | null>(null);

  function handleContextMenu(e: MouseEvent, job: any) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, job };
  }
</script>

{#snippet statusIcon(status: OperationStatus)}
  {#if status === 'idle'}
    <MaterialIcon name="schedule" class="transfer-status-icon idle" />
  {:else if status === 'transferring' || status === 'installing'}
    <md-circular-progress indeterminate style="--md-circular-progress-size: 32px"></md-circular-progress>
  {:else if status === 'success'}
    <MaterialIcon name="check_circle" class="transfer-status-icon success" />
  {/if}
{/snippet}

<div class="transfer-menu-overlay {operationsState.isOpen ? 'open' : ''}" onclick={() => operationsState.isOpen = false}>
  <aside class="transfer-menu" onclick={e => e.stopPropagation()}>
    <md-elevation></md-elevation>
    <header class="transfer-menu__header">
      <h3>
        <MaterialIcon name="swap_vert" />
        {m.operations_title()}
      </h3>
      <div class="transfer-menu__actions">
        <md-icon-button title={m.operations_clear()} onclick={() => operationsState.clearCompleted()}>
          <MaterialIcon name="clear_all" />
        </md-icon-button>
        <md-icon-button onclick={() => operationsState.isOpen = false}>
          <MaterialIcon name="close" />
        </md-icon-button>
      </div>
    </header>
    
    <div class="transfer-menu__content">
      {#if operationsState.jobs.length === 0}
        <div class="transfer-menu__empty">
          <MaterialIcon name="done_all" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5" />
          <p>{m.operations_empty()}</p>
        </div>
      {:else}
        <ul class="transfer-list">
          {#each operationsState.jobs as job (job.id)}
            <li class="transfer-item-container" oncontextmenu={(e) => handleContextMenu(e, job)}>
              <div class="transfer-item {job.status}">
                <div class="transfer-item__icon">
                  <MaterialIcon name={getIconForJob(job)} />
                </div>
                <div class="transfer-item__details">
                  <span class="transfer-item__name">{job.name}</span>
                  <span class="transfer-item__status-text">
                    {#if job.status === 'error' && job.error}
                      {job.error}
                    {:else}
                      {(m as any)[`operations_${job.status}`]?.() ?? job.status}
                    {/if}
                  </span>
                </div>
                <div class="transfer-item__trailing">
                  {#if job.status === 'error' || job.status === 'success'}
                    <md-icon-button onclick={() => operationsState.remove(job.id)} title={m.common_delete()}>
                      <MaterialIcon name="close" />
                    </md-icon-button>
                  {/if}
                  {#if job.status === 'error'}
                    <md-icon-button onclick={() => operationsState.retry(job.id)} title={m.operations_retry()}>
                      <MaterialIcon name="refresh" />
                    </md-icon-button>
                  {/if}
                  {@render statusIcon(job.status)}
                </div>
              </div>
              
              {#if job.children && job.children.length > 0}
                <ul class="transfer-sublist">
                  {#each job.children as child (child.id)}
                    <li class="transfer-subitem {child.status}" oncontextmenu={(e) => { e.stopPropagation(); handleContextMenu(e, child); }}>
                      <MaterialIcon name={child.isDirectory ? 'folder' : 'draft'} />
                      <div class="transfer-subitem__details">
                        <span class="transfer-subitem__name">{child.name}</span>
                        {#if child.status === 'error' && child.error}
                          <span class="transfer-item__status-text" style="color: var(--md-sys-color-error); white-space: normal; word-break: break-word">
                            {child.error}
                          </span>
                        {/if}
                      </div>
                      <div class="transfer-subitem__trailing">
                        {#if child.status === 'error' || child.status === 'success'}
                          <md-icon-button onclick={() => operationsState.remove(child.id, job.id)} title={m.common_delete()}>
                            <MaterialIcon name="close" />
                          </md-icon-button>
                        {/if}
                        {#if child.status === 'error'}
                          <md-icon-button onclick={() => operationsState.retry(child.id, job.id)} title={m.operations_retry()}>
                            <MaterialIcon name="refresh" />
                          </md-icon-button>
                        {/if}
                        {@render statusIcon(child.status)}
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => contextMenu = null}
    items={[
      { 
        icon: 'open_in_new', 
        label: m.files_action_open(), 
        onClick: () => {
          const path = contextMenu!.job.type === 'download' ? contextMenu!.job.destination : contextMenu!.job.source;
          if (path) openPath(path).catch(console.error);
        },
        disabled: contextMenu.job.type === 'download' && contextMenu.job.status !== 'success'
      }
    ]}
  />
{/if}

<style>
.transfer-menu-overlay {
  position: fixed;
  inset: var(--topbar-height) 0 0;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
  opacity: 0;
  background: rgba(0, 0, 0, 0.32);
  transition: opacity 0.25s cubic-bezier(0.2, 0, 0, 1);
}

.transfer-menu-overlay.open {
  pointer-events: auto;
  opacity: 1;
}

.transfer-menu {
  position: relative;
  width: 360px;
  max-width: 100%;
  height: 100%;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1);
}

.transfer-menu > md-elevation {
  --md-elevation-level: 5;
}

.transfer-menu-overlay.open .transfer-menu {
  transform: translateX(0);
}

.transfer-menu__header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.transfer-menu__header h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 500;
}

.transfer-menu__actions {
  display: flex;
  gap: 4px;
}

.transfer-menu__content {
  flex: 1;
  overflow-y: auto;
}

.transfer-menu__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--md-sys-color-on-surface-variant);
  text-align: center;
  padding: 32px;
}

.transfer-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

.transfer-item-container {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--md-sys-color-surface-variant);
}

.transfer-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 16px;
}

.transfer-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--md-sys-color-surface-variant);
  color: var(--md-sys-color-on-surface-variant);
}

.transfer-item.error .transfer-item__icon {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
}

.transfer-item__details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.transfer-item__name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}

.transfer-item__status-text {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transfer-item.error .transfer-item__status-text {
  color: var(--md-sys-color-error);
  white-space: normal;
  word-break: break-word;
}

.transfer-item__trailing {
  display: flex;
  align-items: center;
  gap: 8px;
}

.transfer-status-icon {
  font-size: 20px;
}

.transfer-status-icon.idle { color: var(--md-sys-color-outline); }
.transfer-status-icon.success { color: #4caf50; }
.transfer-status-icon.error { color: var(--md-sys-color-error); }

.transfer-sublist {
  list-style: none;
  margin: 0;
  padding: 0 16px 12px 48px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transfer-subitem {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
}

.transfer-subitem :global(.material-symbols-outlined) {
  font-size: 16px;
}

.transfer-subitem__details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.transfer-subitem__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transfer-subitem__trailing {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
