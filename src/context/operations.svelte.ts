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
  
  constructor() {
    $effect.root(() => {
      $effect(() => {
        this.#processNextJob();
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
        const args = ['install'];
        // Parse options from destination string since we need to pass them through.
        // Or we can just use source for install and assume arguments are passed in destination JSON string.
        if (nextJob.destination) {
          try {
            const options = JSON.parse(nextJob.destination);
            if (options.replace) args.push('-r');
            if (options.grant) args.push('-g');
            if (options.test) args.push('-t');
            if (options.bypass) args.push('--bypass-low-target-sdk-block');
          } catch (e) {}
        }
        args.push(nextJob.source);
        await invoke<string>('run_device_action', { serial, args });
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
}

export const operationsState = new OperationsState();
