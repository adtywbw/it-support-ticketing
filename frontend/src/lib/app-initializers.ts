import { QueryClient } from '@tanstack/react-query';

type ThemeMode = 'light' | 'dark';
type ThemePref = ThemeMode | 'system';

interface PersistedThemeState {
  state?: {
    pref?: ThemePref;
    mode?: ThemeMode;
  };
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnMount: 'always',
      },
    },
  });
}

function resolveSystemMode(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyInitialTheme() {
  const savedTheme = localStorage.getItem('theme-storage');
  if (!savedTheme) return;

  try {
    const parsed = JSON.parse(savedTheme) as PersistedThemeState;
    const pref = parsed?.state?.pref ?? 'system';
    const mode = pref === 'system' ? resolveSystemMode() : parsed?.state?.mode ?? pref;
    document.documentElement.classList.toggle('dark', mode === 'dark');
  } catch {
    document.documentElement.classList.remove('dark');
  }
}
