import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type ToolStatus = {
  name: string;
  available: boolean;
  version: string;
  latest_version: string;
  update_checked: boolean;
  update_available: boolean;
  path: string;
  source: string;
  install_supported: boolean;
};

export type ToolsStatus = {
  adb: ToolStatus;
  scrcpy: ToolStatus;
  java: ToolStatus;
};

export type ToolsSnapshot = {
  tools: ToolsStatus;
  checking_updates: boolean;
};

class ToolsState {
  status = $state.raw<ToolsStatus | null>(null);
  checkingUpdates = $state(true);
  error = $state('');
  hasUpdate = $derived(Boolean(
    this.status?.adb.update_available || this.status?.scrcpy.update_available
  ));

  #unlisten: (() => void) | undefined;

  async init() {
    if (this.#unlisten) return;
    try {
      this.#unlisten = await listen<ToolsStatus>('tools-updates-checked', event => {
        this.set(event.payload);
      });
    } catch (error) {
      this.error = String(error);
    }
    await this.refresh();
  }

  async refresh() {
    try {
      const snapshot = await invoke<ToolsSnapshot>('get_tools_snapshot');
      this.status = snapshot.tools;
      this.checkingUpdates = snapshot.checking_updates;
      this.error = '';
    } catch (error) {
      this.error = String(error);
      this.checkingUpdates = false;
    }
  }

  set(status: ToolsStatus, checkingUpdates = false) {
    this.status = status;
    this.checkingUpdates = checkingUpdates;
    this.error = '';
  }

  destroy() {
    this.#unlisten?.();
    this.#unlisten = undefined;
  }
}

export const toolsState = new ToolsState();
