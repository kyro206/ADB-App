export type WindowEffectMode = 'system' | 'mica' | 'acrylic' | 'disabled';

export type WindowEffectInfo = {
  platform: string;
  windows_11: boolean;
};

export type WindowEffectSettings = {
  window_effect?: WindowEffectMode | string;
};

export function applyWindowEffectClass(settings: WindowEffectSettings | null | undefined) {
  const mode = settings?.window_effect ?? 'system';
  const enabled = mode !== 'disabled';
  document.documentElement.classList.toggle('window-effect-enabled', enabled);
  document.documentElement.classList.toggle('window-effect-mica', enabled && mode !== 'acrylic');
  document.documentElement.classList.toggle('window-effect-acrylic', enabled && mode === 'acrylic');
  document.documentElement.classList.toggle('window-effect-disabled', !enabled);
}
