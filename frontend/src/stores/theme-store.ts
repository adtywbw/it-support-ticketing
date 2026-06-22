import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark' | 'high-contrast';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove('dark', 'high-contrast');
  if (mode === 'dark') root.classList.add('dark');
  if (mode === 'high-contrast') root.classList.add('high-contrast');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      setMode: (mode: ThemeMode) => {
        applyTheme(mode);
        set({ mode });
      },
    }),
    { name: 'theme-storage', onRehydrateStorage: () => (state) => { if (state) applyTheme(state.mode); } },
  ),
);
