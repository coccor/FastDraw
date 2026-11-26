// Light or dark, for the site and the editor. The page's own <head> script sets data-theme on <html>
// before anything paints (from a saved choice, else the system setting); this module keeps it in
// step afterwards: a person's choice is saved, and without one the system setting is followed live.
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'fastdraw-theme';
const listeners = new Set<() => void>();

function saved(): Theme | null {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}
const system = (): Theme => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function apply(t: Theme) {
  if (document.documentElement.dataset.theme === t) return;
  document.documentElement.dataset.theme = t;
  listeners.forEach((f) => f());
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* the choice lasts for this visit only */ }
  apply(t);
}

// the local editor is light only (its page has no dark start-up script either)
const LIGHT_ONLY = typeof __FASTDRAW_LOCAL__ !== 'undefined' && !!__FASTDRAW_LOCAL__;
if (typeof document !== 'undefined' && LIGHT_ONLY) apply('light');
else if (typeof document !== 'undefined') {
  apply(saved() ?? system());
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!saved()) apply(system()); });
}

export function useTheme(): Theme {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, currentTheme, () => 'light');
}

