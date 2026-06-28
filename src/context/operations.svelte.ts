import { invoke } from '@tauri-apps/api/core';
import { devicesState } from './devices.svelte';
import * as m from '../paraglide/messages';

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
      $effect(() => {
        this.#processNextJob();
      });
      $effect(() => {
        this.#syncCloseGuard(this.isProcessing);
      });
      return () => {};
    });
  }

  enqueue(type: OperationType, source: string, destination: string | undefined, name: string, isDirectory: boolean) {
    const id = Date.now().toString() + Math.random().toString();
    this.jobs.push({ id, type, name, source, destination, isDirectory, status: 'idle' });
  }

  clearCompleted() {
    this.jobs = this.jobs.filter(j => j.status !== 'success');
  }

  retry(id: string, parentId?: string) {
    if (parentId) {
      const parent = this.jobs.find(j => j.id === parentId);
      if (!parent || !parent.children) return;
      const childIndex = parent.children.findIndex(c => c.id === id);
      if (childIndex === -1) return;
      
      const child = parent.children[childIndex];
      parent.children.splice(childIndex, 1);
      child.status = 'idle';
      child.error = undefined;
      this.jobs.push(child);
    } else {
      const job = this.jobs.find(j => j.id === id);
      if (job) {
        job.status = 'idle';
        job.error = undefined;
      }
    }
  }

  remove(id: string, parentId?: string) {
    if (parentId) {
      const parent = this.jobs.find(j => j.id === parentId);
      if (parent && parent.children) {
        parent.children = parent.children.filter(c => c.id !== id);
      }
    } else {
      this.jobs = this.jobs.filter(j => j.id !== id);
    }
  }

  async #processNextJob() {
    const activeJob = this.jobs.find(j => j.status === 'transferring' || j.status === 'installing');
    if (activeJob) return;

    const nextJob = this.jobs.find(j => j.status === 'idle');
    if (!nextJob) return;

    const serial = devicesState.selectedDevice?.serial;
    if (!serial) {
      this.#markError(nextJob.id, 'No device connected');
      return;
    }

    const processStatus = nextJob.type === 'install' ? 'installing' : 'transferring';
    
    // update status
    const jobIndex = this.jobs.findIndex(j => j.id === nextJob.id);
    if (jobIndex !== -1) {
      this.jobs[jobIndex] = { ...this.jobs[jobIndex], status: processStatus, error: undefined, children: undefined };
    }

    try {
      if (nextJob.type === 'upload') {
        await invoke<string>('run_device_action', { serial, args: ['push', '--sync', nextJob.source, nextJob.destination] });
      } else if (nextJob.type === 'download') {
        await invoke<string>('pull_file', { serial, remotePath: nextJob.source, localPath: nextJob.destination });
      } else if (nextJob.type === 'install') {
        let installOptions = {
          replace_existing: false,
          grant_runtime_permissions: false,
          bypass_low_target_sdk_block: false,
        };
        if (nextJob.destination) {
          try {
            const options = JSON.parse(nextJob.destination);
            installOptions = {
              replace_existing: !!options.replace,
              grant_runtime_permissions: !!options.grant,
              bypass_low_target_sdk_block: !!options.bypass,
            };
          } catch (e) {}
        }
        await invoke<string>('install_application_packages', {
          serial,
          files: [nextJob.source],
          options: installOptions
        });
      }
      
      const idx = this.jobs.findIndex(j => j.id === nextJob.id);
      if (idx !== -1) this.jobs[idx] = { ...this.jobs[idx], status: 'success' };
      
    } catch (error: any) {
      let errStr = String(error);
      const children: OperationJob[] = [];
      const regex = /adb: error: failed to copy '([^']+)' to '([^']+)': ([^\n]+)/g;
      let match;
      while ((match = regex.exec(errStr)) !== null) {
        const src = match[1];
        const dest = match[2];
        const reason = match[3];
        const name = src.split(/[\\/]/).pop() || src;
        children.push({
          id: Date.now().toString() + Math.random().toString(),
          type: nextJob.type,
          name,
          source: src,
          destination: dest,
          isDirectory: false,
          status: 'error',
          error: reason
        });
      }
      
      if (children.length === 0) {
        errStr = errStr.replace(/adb: error: /, '').trim();
      }
      
      // Attempt to translate transfers_error (fallback to raw error)
      let defaultErrorMsg = errStr;
      try {
        defaultErrorMsg = (m as any).operations_error?.() ?? errStr;
      } catch(e) {}

      const idx = this.jobs.findIndex(j => j.id === nextJob.id);
      if (idx !== -1) {
        this.jobs[idx] = { 
          ...this.jobs[idx], 
          status: 'error', 
          error: children.length > 0 ? defaultErrorMsg : errStr,
          children: children.length > 0 ? children : undefined
        };
      }
    }
  }

  #markError(id: string, error: string) {
    const jobIndex = this.jobs.findIndex(j => j.id === id);
    if (jobIndex !== -1) {
        this.jobs[jobIndex] = { ...this.jobs[jobIndex], status: 'error', error };
    }
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
