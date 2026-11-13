// One button that switches between the light and the dark theme; it shows the one you would switch to.
import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { setTheme, useTheme } from './theme.ts';

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Dark theme' : 'Light theme';
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={() => setTheme(next)}>
      {next === 'dark' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    </button>
  );
}
