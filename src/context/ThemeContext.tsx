import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Theme = 'dark' | 'light' | 'auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('auto');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<{ theme: string }>('get_app_settings').then(settings => {
      let t: Theme = 'auto';
      if (settings.theme === '1') t = 'dark';
      else if (settings.theme === '0') t = 'light';
      setThemeState(t);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    
    const applyTheme = async () => {
      let resolvedTheme = theme;
      if (theme === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolvedTheme = isDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      
      try {
        await invoke('set_window_theme', { theme: resolvedTheme });
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setTheme(resolvedTheme === 'dark' ? 'dark' : 'light');
      } catch (e) {
        // Ignorar el error si falla el seteo del tema de ventana
      }
    };

    applyTheme();

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme, loaded]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
