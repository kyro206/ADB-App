import { invoke } from '@tauri-apps/api/core';

export type Theme = 'dark' | 'light' | 'auto';

class ThemeState {
  theme = $state<Theme>('auto');
  loaded = $state(false);

  constructor() {
    this.init();
  }

  async init() {
    try {
      const settings = await invoke<{ theme: string }>('get_app_settings');
      let t: Theme = 'auto';
      if (settings.theme === '1') t = 'dark';
      else if (settings.theme === '0') t = 'light';
      this.theme = t;
    } catch {
      // default auto
    } finally {
      this.loaded = true;
    }
  }

  async applyTheme(currentTheme: Theme) {
    if (!this.loaded) return;
    
    let resolvedTheme = currentTheme;
    if (currentTheme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = isDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    
    try {
      await invoke('set_window_theme', { theme: resolvedTheme });
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setTheme(resolvedTheme === 'dark' ? 'dark' : 'light');
    } catch (e) {
      // ignore
    }
  }

  setTheme(newTheme: Theme) {
    this.theme = newTheme;
  }
}

export const themeState = new ThemeState();

export function initThemeEffects() {
  $effect(() => {
    themeState.applyTheme(themeState.theme);
  });

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (themeState.theme === 'auto') {
      themeState.applyTheme('auto');
    }
  };
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}
