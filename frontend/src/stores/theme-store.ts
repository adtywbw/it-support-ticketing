import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark';
type ThemePref = ThemeMode | 'system';

interface ThemeState {
  mode: ThemeMode;
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
  setMode: (mode: ThemeMode) => void;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
}

function resolveSystemMode(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function attachSystemListener(onChange: (mode: ThemeMode) => void) {
  detachSystemListener();
  if (typeof window === 'undefined' || !window.matchMedia) return;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light');
  mediaQuery.addEventListener('change', mediaListener);
}

function detachSystemListener() {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
  }
  mediaQuery = null;
  mediaListener = null;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      pref: 'system',
      setPref: (pref: ThemePref) => {
        if (pref === 'system') {
          const mode = resolveSystemMode();
          applyTheme(mode);
          set({ pref, mode });
          attachSystemListener((newMode) => {
            applyTheme(newMode);
            set({ mode: newMode });
          });
        } else {
          detachSystemListener();
          applyTheme(pref);
          set({ pref, mode: pref });
        }
      },
      setMode: (mode: ThemeMode) => {
        detachSystemListener();
        applyTheme(mode);
        set({ pref: mode, mode });
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.pref === 'system' || !state.pref) {
            const mode = resolveSystemMode();
            applyTheme(mode);
            state.mode = mode;
            state.pref = state.pref || 'system';
            attachSystemListener((newMode) => {
              applyTheme(newMode);
              useThemeStore.setState({ mode: newMode });
            });
          } else {
            applyTheme(state.mode);
          }
        }
      },
    },
  ),
);
