import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { en, TranslationKey } from './en';
import { es } from './es';

export type Language = 'en' | 'es';

const translations: Record<Language, Record<string, string>> = { en, es };

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<{ language: string }>('get_app_settings').then(settings => {
      let lang: Language;
      if (settings.language === 'en' || settings.language === 'es') {
        lang = settings.language;
      } else {
        lang = navigator.language.startsWith('es') ? 'es' : 'en';
      }
      setLanguageState(lang);
      setLoaded(true);
    }).catch(() => {
      setLanguageState(navigator.language.startsWith('es') ? 'es' : 'en');
      setLoaded(true);
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback((key: TranslationKey | string, params?: Record<string, string | number>): string => {
    const dict = translations[language];
    let result = dict[key] ?? translations['en'][key] ?? `!${key}!`;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  }, [language]);

  if (!loaded) return null;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
