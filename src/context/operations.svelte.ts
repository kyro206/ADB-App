import { invoke } from '@tauri-apps/api/core';
import { devicesState } from './devices.svelte';
import { listen } from '@tauri-apps/api/event';

export type OperationStatus = 'idle' | 'transferring' | 'installing' | 'success' | 'error';
export type OperationType = 'upload' | 'download' | 'install';

export interface OperationJob {
  id: string;
  type: OperationType;
  name: string;
  source: string;
  destination?: string;
  isDirectory: boolean;
  status: OperationStatus;
  error?: string;
  children?: OperationJob[];
  serial?: string;
}

class OperationsState {
  jobs = $state<OperationJob[]>([]);
  isOpen = $state(false);

  hasJobs = $derived(this.jobs.length > 0);
  hasError = $derived(this.jobs.some(j => j.status === 'error' || j.children?.some(c => c.status === 'error')));
  isProcessing = $derived(this.jobs.some(j => j.status === 'transferring' || j.status === 'installing' || j.status === 'idle'));
  #lastCloseGuard: boolean | null = null;
  
  constructor() {
    $effect.root(() => {
      // Sync close guard
      $effect(() => {
        this.#syncCloseGuard(this.isProcessing);
      });
      return () => {};
    });

    // Initialize from backend
    invoke<OperationJob[]>('get_jobs').then((jobs) => {
      this.jobs = jobs;
    }).catch(console.error);

    // Listen for updates from backend
    listen<OperationJob[]>('operations-update', (event) => {
      this.jobs = event.payload;
    });
  }

  enqueue(type: OperationType, source: string, destination: string | undefined, name: string, isDirectory: boolean) {
    const serial = devicesState.selectedDevice?.serial;
    if (!serial) return;

    const id = Date.now().toString() + Math.random().toString();
    const job: OperationJob = { id, type, name, source, destination, isDirectory, status: 'idle', serial };
    invoke('enqueue_job', { job }).catch(console.error);
  }

  clearCompleted() {
    invoke('clear_completed_jobs').catch(console.error);
  }

  retry(id: string, parentId?: string) {
    invoke('retry_job', { id, parentId }).catch(console.error);
  }

  remove(id: string, parentId?: string) {
    invoke('remove_job', { id, parentId }).catch(console.error);
  }

  async #syncCloseGuard(active: boolean) {
    if (this.#lastCloseGuard === active) return;
    this.#lastCloseGuard = active;
    try {
      await invoke('set_operations_active', { active });
    } catch {
      this.#lastCloseGuard = null;
    }
  }
}

export const operationsState = new OperationsState();
