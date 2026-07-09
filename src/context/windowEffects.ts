import { invoke } from '@tauri-apps/api/core';

export type WindowEffectMode = 'system' | 'acrylic' | 'disabled';

export type WindowEffectInfo = {
  platform: string;
  mica: boolean;
  acrylic: boolean;
};

export type WindowEffectSettings = {
  window_effect?: WindowEffectMode | string;
};

export async function applyWindowEffectClass(settings: WindowEffectSettings | null | undefined) {
  let mode = settings?.window_effect ?? 'system';
  
  try {
    const info: WindowEffectInfo = await invoke('get_window_effect_info');
    if (info.platform === 'windows' && !info.mica && !info.acrylic) {
      mode = 'disabled';
    }
  } catch (e) {
    // Fallback if invoke fails
  }

  const enabled = mode !== 'disabled';
  document.documentElement.classList.toggle('window-effect-enabled', enabled);
  document.documentElement.classList.toggle('window-effect-mica', enabled && mode !== 'acrylic');
  document.documentElement.classList.toggle('window-effect-acrylic', enabled && mode === 'acrylic');
  document.documentElement.classList.toggle('window-effect-disabled', !enabled);
}
