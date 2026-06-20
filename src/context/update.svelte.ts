import { getVersion } from '@tauri-apps/api/app';

type UpdateHandle = {
  version: string;
  download: (callback: (event: any) => void) => Promise<void>;
  install: () => Promise<void>;
};

class UpdateState {
  updateInfo = $state<UpdateHandle | null>(null);
  showUpdateDialog = $state(false);
  hasUpdate = $derived(this.updateInfo !== null);
  currentVersion = $state<string>('');
  busy = $state(false);
  status = $state('');
  error = $state('');
  downloadedBytes = $state(0);
  totalBytes = $state<number | null>(null);
  progress = $derived(this.totalBytes ? Math.min(100, Math.round((this.downloadedBytes / this.totalBytes) * 100)) : 0);

  async init() {
    try {
      this.error = '';
      this.currentVersion = await getVersion();
      if (import.meta.env.VITE_STORE_BUILD) return;

      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        this.updateInfo = update;
        this.showUpdateDialog = true;
      }
    } catch (error) {
      this.error = readableError(error);
    }
  }

  async install() {
    if (import.meta.env.VITE_STORE_BUILD || !this.updateInfo || this.busy) return;

    this.busy = true;
    this.error = '';
    this.status = 'downloading';
    this.downloadedBytes = 0;
    this.totalBytes = null;

    try {
      await this.updateInfo.download(event => {
        if (event.event === 'Started') {
          this.totalBytes = event.data.contentLength ?? null;
          this.downloadedBytes = 0;
          this.status = 'downloading';
        } else if (event.event === 'Progress') {
          this.downloadedBytes += event.data.chunkLength;
        } else if (event.event === 'Finished') {
          this.status = 'installing';
        }
      });
      await this.updateInfo.install();
      this.status = 'restarting';
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      this.error = readableError(error);
      this.status = '';
    } finally {
      this.busy = false;
    }
  }
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const updateState = new UpdateState();
