<script lang="ts" module>
  export type TransferStatus = 'idle' | 'transferring' | 'success' | 'error';
  export type TransferType = 'upload' | 'download';

  export interface TransferJob {
    id: string;
    type: TransferType;
    name: string;
    source: string;
    destination: string;
    isDirectory: boolean;
    status: TransferStatus;
    error?: string;
    children?: TransferJob[];
  }
</script>

<script lang="ts">
  import { i18n } from '../../locales/index.svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  import './TransferMenu.css';

  let {
    open = false,
    jobs = [],
    onClose,
    onClear,
    onRetry
  } = $props<{
    open: boolean;
    jobs: TransferJob[];
    onClose: () => void;
    onClear: () => void;
    onRetry: (id: string, parentId?: string) => void;
  }>();
</script>

{#snippet statusIcon(status: TransferStatus)}
  {#if status === 'idle'}
    <MaterialIcon name="schedule" class="transfer-status-icon idle" />
  {:else if status === 'transferring'}
    <md-circular-progress indeterminate style="--md-circular-progress-size: 32px"></md-circular-progress>
  {:else if status === 'success'}
    <MaterialIcon name="check_circle" class="transfer-status-icon success" />
  {:else if status === 'error'}
    <MaterialIcon name="error" class="transfer-status-icon error" />
  {/if}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="transfer-menu-overlay {open ? 'open' : ''}" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside class="transfer-menu" onclick={e => e.stopPropagation()}>
    <header class="transfer-menu__header">
      <h3>
        <MaterialIcon name="swap_vert" />
        {i18n.t('transfers.title')}
      </h3>
      <div class="transfer-menu__actions">
        <md-icon-button title={i18n.t('transfers.clear')} onclick={onClear}>
          <MaterialIcon name="clear_all" />
        </md-icon-button>
        <md-icon-button onclick={onClose}>
          <MaterialIcon name="close" />
        </md-icon-button>
      </div>
    </header>
    
    <div class="transfer-menu__content">
      {#if jobs.length === 0}
        <div class="transfer-menu__empty">
          <MaterialIcon name="done_all" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5" />
          <p>{i18n.t('transfers.empty')}</p>
        </div>
      {:else}
        <ul class="transfer-list">
          {#each jobs as job (job.id)}
            <li class="transfer-item-container">
              <div class="transfer-item {job.status}">
                <div class="transfer-item__icon">
                  <MaterialIcon name={job.isDirectory ? 'folder' : (job.type === 'upload' ? 'upload_file' : 'download')} />
                </div>
                <div class="transfer-item__details">
                  <span class="transfer-item__name">{job.name}</span>
                  <span class="transfer-item__status-text">
                    {#if job.status === 'error' && job.error}
                      {job.error}
                    {:else}
                      {i18n.t(`transfers.${job.status}`)}
                    {/if}
                  </span>
                </div>
                <div class="transfer-item__trailing">
                  {#if job.status === 'error'}
                    <md-icon-button onclick={() => onRetry(job.id)} title={i18n.t('transfers.retry')}>
                      <MaterialIcon name="refresh" />
                    </md-icon-button>
                  {/if}
                  {@render statusIcon(job.status)}
                </div>
              </div>
              
              {#if job.children && job.children.length > 0}
                <ul class="transfer-sublist">
                  {#each job.children as child (child.id)}
                    <li class="transfer-subitem {child.status}">
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
                        {#if child.status === 'error'}
                          <md-icon-button onclick={() => onRetry(child.id, job.id)} title={i18n.t('transfers.retry')}>
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
