import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyInitialTheme, createAppQueryClient } from '../app-initializers';

describe('app initializers', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    localStorage.clear();
  });

  it('creates a query client with fresh operational query defaults', () => {
    const client = createAppQueryClient();

    expect(client.getDefaultOptions().queries?.staleTime).toBe(0);
    expect(client.getDefaultOptions().queries?.retry).toBe(1);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
  });

  it('applies persisted dark mode before React renders', () => {
    localStorage.setItem('theme-storage', JSON.stringify({ state: { pref: 'dark', mode: 'dark' } }));

    applyInitialTheme();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies system dark preference from persisted system mode', () => {
    localStorage.setItem('theme-storage', JSON.stringify({ state: { pref: 'system', mode: 'light' } }));
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));

    applyInitialTheme();

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    vi.unstubAllGlobals();
  });
});
