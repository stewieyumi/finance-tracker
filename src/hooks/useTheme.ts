import { useEffect } from 'react';
import { AppSettings } from '../types/finance';

export type ThemeMode = 'dark' | 'light' | 'system';

export function applyTheme(theme: ThemeMode = 'dark'): () => void {
  if (typeof window === 'undefined' || !window.document?.documentElement) {
    return () => {};
  }
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const mql = hasMatchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const systemTheme = mql?.matches ? 'dark' : 'light';
    root.classList.add(systemTheme);

    if (mql && typeof mql.addEventListener === 'function') {
      const listener = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark');
        root.classList.add(e.matches ? 'dark' : 'light');
      };
      mql.addEventListener('change', listener);
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', listener);
        }
      };
    }
    return () => {};
  }

  root.classList.add(theme);
  return () => {};
}

export function useTheme(settings?: AppSettings) {
  useEffect(() => {
    const theme = (settings?.theme as ThemeMode) || 'dark';
    return applyTheme(theme);
  }, [settings?.theme]);
}