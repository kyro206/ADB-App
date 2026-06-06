import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { en, TranslationKey } from './en';
import { es } from './es';

export type Language = 'en' | 'es';

const translations: Record<Language, Record<string, string>> = { en, es };

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey | string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('adb-app-language');
    if (saved === 'en' || saved === 'es') return saved;
    return navigator.language.startsWith('es') ? 'es' : 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('adb-app-language', lang);
  }, []);

  const t = useCallback((key: TranslationKey | string): string => {
    const dict = translations[language];
    return dict[key] ?? translations['en'][key] ?? `!${key}!`;
  }, [language]);

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
