import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

class UpdateState {
  updateInfo = $state<Update | null>(null);
  showUpdateDialog = $state(false);
  hasUpdate = $derived(this.updateInfo !== null);
  currentVersion = $state<string>('');

  async init() {
    try {
      this.currentVersion = await getVersion();
      const update = await check();
      if (update) {
        this.updateInfo = update;
        this.showUpdateDialog = true;
      }
    } catch (error) {
      console.error('Failed to check for updates', error);
    }
  }

  async install() {
    if (this.updateInfo) {
      try {
        await this.updateInfo.downloadAndInstall();
        await relaunch();
      } catch (error) {
        console.error('Failed to install update', error);
      }
    }
  }
}

export const updateState = new UpdateState();
