import { invoke } from '@tauri-apps/api/core';
import { en, type TranslationKey } from './en';
import { es } from './es';

export type Language = 'en' | 'es';

const translations: Record<Language, Record<string, string>> = { en, es };

class I18nState {
  language = $state<Language>('en');
  loaded = $state(false);

  constructor() {
    this.init();
  }

  async init() {
    try {
      const settings = await invoke<{ language: string }>('get_app_settings');
      if (settings.language === 'en' || settings.language === 'es') {
        this.language = settings.language;
      } else {
        this.language = navigator.language.startsWith('es') ? 'es' : 'en';
      }
    } catch {
      this.language = navigator.language.startsWith('es') ? 'es' : 'en';
    } finally {
      this.loaded = true;
    }
  }

  setLanguage(lang: Language) {
    this.language = lang;
  }

  t(key: TranslationKey | string, params?: Record<string, string | number>): string {
    const dict = translations[this.language];
    let result = dict[key] ?? translations['en'][key] ?? `!${key}!`;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  }
}

export const i18n = new I18nState();
