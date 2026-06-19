import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

class UpdateState {
  updateInfo = $state<Update | null>(null);
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
    if (!this.updateInfo || this.busy) return;

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
