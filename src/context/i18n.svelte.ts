import { invoke } from '@tauri-apps/api/core';
import { setLocale, getLocale, locales } from '../paraglide/runtime';

export type Language = typeof locales[number];
export const languages = locales;

export function getLanguageName(tag: Language): string {
    const names = new Intl.DisplayNames([tag], { type: 'language' });
    const name = names.of(tag) || tag;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

class I18nState {
  language = $state<Language>('en');
  loaded = $state(false);

  constructor() {
    this.init();
  }

  async init() {
    try {
      this.language = getLocale() as Language;
      
      const w = window as any;
      const cached = sessionStorage.getItem('cached_settings');
      let settings;
      if (cached) {
        settings = JSON.parse(cached);
      } else if (w.__APP_SETTINGS__) {
        settings = w.__APP_SETTINGS__;
      } else {
        settings = await invoke<{ language: string }>('get_app_settings');
      }
      let targetLang: Language = 'en';
      if (settings.language === 'en' || settings.language === 'es') {
        targetLang = settings.language;
      } else {
        targetLang = navigator.language.startsWith('es') ? 'es' : 'en';
      }
      
      if (this.language !== targetLang) {
          setLocale(targetLang, { reload: false });
          this.language = targetLang;
      }
    } catch {
      const targetLang = navigator.language.startsWith('es') ? 'es' : 'en';
      if (this.language !== targetLang) {
          setLocale(targetLang, { reload: false });
          this.language = targetLang;
      }
    } finally {
      this.loaded = true;
    }
  }

  setLanguage(lang: Language) {
    if (this.language !== lang) {
      this.language = lang;
      setLocale(lang, { reload: false });
    }
  }
}

export const i18n = new I18nState();
