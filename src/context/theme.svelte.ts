import { invoke } from '@tauri-apps/api/core';
import { devicesState } from './devices.svelte';

export type Theme = 'dark' | 'light' | 'auto';
type ResolvedTheme = 'dark' | 'light';
type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

class ThemeState {
  theme = $state<Theme>('auto');
  resolvedTheme = $state<ResolvedTheme>('dark');
  materialYouEnabled = $state(true);
  materialYouBackgroundTint = $state(true);
  hasActiveDynamicPalette = $state(false);
  loaded = $state(false);
  dynamicPaletteError = $state<string | null>(null);
  wallpaperClockColor = $state('');

  constructor() {
    this.init();
  }

  async init() {
    try {
      const w = window as any;
      const cached = sessionStorage.getItem('cached_settings');
      let settings;
      if (cached) {
        settings = JSON.parse(cached);
      } else if (w.__APP_SETTINGS__) {
        settings = w.__APP_SETTINGS__;
      } else {
        settings = await invoke<{ theme: string; material_you_enabled?: boolean; material_you_background_tint?: boolean }>('get_app_settings');
      }
      
      let t: Theme = 'auto';
      if (settings.theme === '1') t = 'dark';
      else if (settings.theme === '0') t = 'light';
      this.theme = t;
      this.materialYouEnabled = settings.material_you_enabled ?? true;
      this.materialYouBackgroundTint = settings.material_you_background_tint ?? true;
    } catch {
      // default auto
    } finally {
      this.loaded = true;
    }
  }

  async applyTheme(currentTheme: Theme) {
    if (!this.loaded) return;
    
    try {
      await invoke('set_window_theme', { theme: currentTheme });
      // If we switched to auto, give the webview a moment to adopt the OS theme
      if (currentTheme === 'auto') {
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e) {}

    let resolvedTheme: ResolvedTheme = currentTheme === 'light' || currentTheme === 'dark' ? currentTheme : 'dark';
    if (currentTheme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = isDark ? 'dark' : 'light';
    }
    this.resolvedTheme = resolvedTheme;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }

  setTheme(newTheme: Theme) {
    this.theme = newTheme;
  }

  setMaterialYouEnabled(enabled: boolean) {
    this.materialYouEnabled = enabled;
  }

  setMaterialYouBackgroundTint(enabled: boolean) {
    this.materialYouBackgroundTint = enabled;
  }
}

export const themeState = new ThemeState();

const dynamicPaletteProperties = [
  '--bg',
  '--surface',
  '--surface-secondary',
  '--border',
  '--selection-bg',
  '--action-bg',
  '--primary',
  '--on-primary',
  '--primary-container',
  '--on-primary-container',
  '--surface-container-lowest',
  '--surface-container-low',
  '--surface-container',
  '--surface-container-high',
  '--surface-container-highest',
  '--on-surface',
  '--on-surface-variant',
  '--outline',
  '--outline-variant',
  '--scrollbar-track',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  '--md-sys-color-background',
  '--md-sys-color-on-background',
  '--md-sys-color-surface',
  '--md-sys-color-surface-dim',
  '--md-sys-color-surface-bright',
  '--md-sys-color-surface-container-lowest',
  '--md-sys-color-surface-container-low',
  '--md-sys-color-surface-container',
  '--md-sys-color-surface-container-high',
  '--md-sys-color-surface-container-highest',
  '--md-sys-color-surface-variant',
  '--md-sys-color-on-surface',
  '--md-sys-color-on-surface-variant',
  '--md-sys-color-outline',
  '--md-sys-color-outline-variant',
  '--md-sys-color-primary',
  '--md-sys-color-on-primary',
  '--md-sys-color-primary-container',
  '--md-sys-color-on-primary-container',
] as const;

let paletteRequestId = 0;
let lastPaletteSource: string | null = null;
let lastPaletteSeed: Rgb | null = null;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 220, s: 0.2, l: lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return { h: (hue * 60 + 360) % 360, s: saturation, l: lightness };
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round((h + 360) % 360)} ${Math.round(clamp(s) * 100)}% ${Math.round(clamp(l) * 100)}%)`;
}

function createDynamicPalette(seed: Rgb, theme: ResolvedTheme, backgroundTint: boolean) {
  const color = rgbToHsl(seed);
  const hue = color.h;
  const saturation = clamp(Math.max(0.34, color.s * 0.88), 0.28, 0.72);
  const neutralHue = (hue + 8) % 360;
  const neutralSaturation = clamp(saturation * 0.14, 0.04, 0.12);

  if (theme === 'light') {
    const surfaceSaturation = backgroundTint ? clamp(saturation * 0.38, 0.14, 0.3) : neutralSaturation;
    const surfaceHue = backgroundTint ? hue : neutralHue;
    return {
      '--bg': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.94 : 0.975),
      '--surface': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.95 : 0.975),
      '--surface-secondary': hsl(surfaceHue, surfaceSaturation + 0.03, backgroundTint ? 0.9 : 0.94),
      '--border': hsl(neutralHue, neutralSaturation + 0.04, 0.82),
      '--selection-bg': hsl(hue, saturation, 0.9),
      '--action-bg': hsl(hue, saturation, 0.42),
      '--primary': hsl(hue, saturation, 0.38),
      '--on-primary': '#ffffff',
      '--primary-container': hsl(hue, saturation, 0.88),
      '--on-primary-container': hsl(hue, saturation, 0.16),
      '--surface-container-lowest': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.975 : 1),
      '--surface-container-low': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.925 : 0.955),
      '--surface-container': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.89 : 0.925),
      '--surface-container-high': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.86 : 0.895),
      '--surface-container-highest': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.825 : 0.865),
      '--on-surface': hsl(neutralHue, 0.1, 0.12),
      '--on-surface-variant': hsl(neutralHue, 0.1, 0.32),
      '--outline': hsl(neutralHue, 0.1, 0.48),
      '--outline-variant': hsl(neutralHue, 0.12, 0.78),
      '--scrollbar-track': hsl(neutralHue, neutralSaturation, 0.93),
      '--scrollbar-thumb': hsl(neutralHue, 0.12, 0.76),
      '--scrollbar-thumb-hover': hsl(neutralHue, 0.13, 0.66),
    };
  }

  const surfaceHue = backgroundTint ? hue : neutralHue;
  const surfaceSaturation = backgroundTint ? clamp(saturation * 0.34, 0.12, 0.26) : neutralSaturation;

  return {
    '--bg': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.075 : 0.055),
    '--surface': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.105 : 0.09),
    '--surface-secondary': hsl(surfaceHue, surfaceSaturation + 0.03, backgroundTint ? 0.17 : 0.145),
    '--border': hsl(neutralHue, neutralSaturation + 0.04, 0.25),
    '--selection-bg': hsl(hue, saturation * 0.7, 0.22),
    '--action-bg': hsl(hue, saturation, 0.68),
    '--primary': hsl(hue, saturation, 0.78),
    '--on-primary': hsl(hue, saturation, 0.16),
    '--primary-container': hsl(hue, saturation, 0.28),
    '--on-primary-container': hsl(hue, saturation, 0.9),
    '--surface-container-lowest': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.06 : 0.045),
    '--surface-container-low': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.13 : 0.105),
    '--surface-container': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.165 : 0.13),
    '--surface-container-high': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.205 : 0.17),
    '--surface-container-highest': hsl(surfaceHue, surfaceSaturation, backgroundTint ? 0.26 : 0.22),
    '--on-surface': hsl(neutralHue, 0.08, 0.9),
    '--on-surface-variant': hsl(neutralHue, 0.08, 0.78),
    '--outline': hsl(neutralHue, 0.08, 0.58),
    '--outline-variant': hsl(neutralHue, 0.1, 0.3),
    '--scrollbar-track': hsl(neutralHue, neutralSaturation, 0.1),
    '--scrollbar-thumb': hsl(neutralHue, 0.1, 0.24),
    '--scrollbar-thumb-hover': hsl(neutralHue, 0.1, 0.31),
  };
}

function createWallpaperClockColor(seed: Rgb) {
  const color = rgbToHsl(seed);
  const saturation = clamp(Math.max(0.38, color.s * 0.78), 0.34, 0.68);
  return hsl(color.h, saturation, 0.88);
}

function withMaterialAliases(palette: Record<string, string>, theme: ResolvedTheme): Record<string, string> {
  const surface = palette['--surface'];
  const surfaceContainerLowest = palette['--surface-container-lowest'];
  const surfaceContainerLow = palette['--surface-container-low'];
  const surfaceContainer = palette['--surface-container'];
  const surfaceContainerHigh = palette['--surface-container-high'];
  const surfaceContainerHighest = palette['--surface-container-highest'];

  return {
    ...palette,
    '--md-sys-color-background': palette['--bg'],
    '--md-sys-color-on-background': palette['--on-surface'],
    '--md-sys-color-surface': surface,
    '--md-sys-color-surface-dim': theme === 'light' ? surfaceContainerHigh : surfaceContainerLowest,
    '--md-sys-color-surface-bright': theme === 'light' ? surfaceContainerLowest : surfaceContainerHigh,
    '--md-sys-color-surface-container-lowest': surfaceContainerLowest,
    '--md-sys-color-surface-container-low': surfaceContainerLow,
    '--md-sys-color-surface-container': surfaceContainer,
    '--md-sys-color-surface-container-high': surfaceContainerHigh,
    '--md-sys-color-surface-container-highest': surfaceContainerHighest,
    '--md-sys-color-surface-variant': palette['--surface-secondary'],
    '--md-sys-color-on-surface': palette['--on-surface'],
    '--md-sys-color-on-surface-variant': palette['--on-surface-variant'],
    '--md-sys-color-outline': palette['--outline'],
    '--md-sys-color-outline-variant': palette['--outline-variant'],
    '--md-sys-color-primary': palette['--primary'],
    '--md-sys-color-on-primary': palette['--on-primary'],
    '--md-sys-color-primary-container': palette['--primary-container'],
    '--md-sys-color-on-primary-container': palette['--on-primary-container'],
  };
}

function applyDynamicPalette(seed: Rgb, theme: ResolvedTheme, backgroundTint: boolean) {
  const palette: Record<string, string> = withMaterialAliases(createDynamicPalette(seed, theme, backgroundTint), theme);
  const style = document.documentElement.style;
  for (const [property, value] of Object.entries(palette)) {
    style.setProperty(property, value);
  }
  style.backgroundColor = palette['--bg'];
}

function resetDynamicPalette() {
  const style = document.documentElement.style;
  for (const property of dynamicPaletteProperties) {
    style.removeProperty(property);
  }
  style.removeProperty('background-color');
}

async function extractSeedColor(source: string): Promise<Rgb> {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  await image.decode();

  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D unavailable');

  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let totalWeight = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.35) continue;

    const sample = { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
    const { s, l } = rgbToHsl(sample);
    if (l < 0.08 || l > 0.94) continue;

    const colorWeight = 0.35 + s * 1.7 + (1 - Math.abs(l - 0.52) * 1.5);
    const weight = alpha * Math.max(0.15, colorWeight);
    red += sample.r * weight;
    green += sample.g * weight;
    blue += sample.b * weight;
    totalWeight += weight;
  }

  if (!totalWeight) return { r: 31, g: 122, b: 255 };
  return {
    r: Math.round(red / totalWeight),
    g: Math.round(green / totalWeight),
    b: Math.round(blue / totalWeight),
  };
}

export function initThemeEffects() {
  $effect(() => {
    themeState.applyTheme(themeState.theme);
  });

  $effect(() => {
    const source = devicesState.wallpaperImage;
    const theme = themeState.resolvedTheme;
    const materialYouEnabled = themeState.materialYouEnabled;
    const backgroundTint = themeState.materialYouBackgroundTint;
    const requestId = ++paletteRequestId;

    if (!source) {
      lastPaletteSource = null;
      lastPaletteSeed = null;
      themeState.wallpaperClockColor = '';
      themeState.dynamicPaletteError = null;
      themeState.hasActiveDynamicPalette = false;
      resetDynamicPalette();
      return;
    }

    if (source === lastPaletteSource && lastPaletteSeed) {
      themeState.wallpaperClockColor = createWallpaperClockColor(lastPaletteSeed);
      if (materialYouEnabled) {
        applyDynamicPalette(lastPaletteSeed, theme, backgroundTint);
        themeState.hasActiveDynamicPalette = true;
      } else {
        resetDynamicPalette();
        themeState.hasActiveDynamicPalette = false;
      }
      return;
    }

    extractSeedColor(source)
      .then(seed => {
        if (requestId !== paletteRequestId) return;
        lastPaletteSource = source;
        lastPaletteSeed = seed;
        themeState.wallpaperClockColor = createWallpaperClockColor(seed);
        themeState.dynamicPaletteError = null;
        if (materialYouEnabled) {
          applyDynamicPalette(seed, theme, backgroundTint);
          themeState.hasActiveDynamicPalette = true;
        } else {
          resetDynamicPalette();
          themeState.hasActiveDynamicPalette = false;
        }
      })
      .catch(error => {
        if (requestId !== paletteRequestId) return;
        themeState.dynamicPaletteError = error instanceof Error ? error.message : String(error);
        lastPaletteSource = null;
        lastPaletteSeed = null;
        themeState.wallpaperClockColor = '';
        themeState.hasActiveDynamicPalette = false;
        resetDynamicPalette();
      });
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
