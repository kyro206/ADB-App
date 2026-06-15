import { invoke } from '@tauri-apps/api/core';
import { setLocale, getLocale } from '../paraglide/runtime';

export type Language = 'en' | 'es';

class I18nState {
  language = $state<Language>('en');
  loaded = $state(false);

  constructor() {
    this.init();
  }

  async init() {
    try {
      this.language = getLocale() as Language;
      
      const settings = await invoke<{ language: string }>('get_app_settings');
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
      setLocale(lang); // By default reloads the page to re-render Paraglide strings
    }
  }
}

export const i18n = new I18nState();
