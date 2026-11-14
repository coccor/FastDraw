// The last icons chosen, newest first, kept in this browser: the sidebar offers them again, and the
// Icon tool in the top bar adds to them.
import { useSyncExternalStore } from 'react';
import { ICON_STYLES } from '../../src/iconStyle.ts';
import type { IconStyle } from '../../src/iconStyle.ts';

export type RecentIcon = { name: string; style: IconStyle };
export const RECENT_ICONS = 5;
const KEY = 'fastdraw.recentIcons';

function read(): RecentIcon[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is RecentIcon => !!x && typeof x.name === 'string' && ICON_STYLES.includes(x.style)).slice(0, RECENT_ICONS);
  } catch { return []; } // storage blocked or a bad value: start with none
}

let list: RecentIcon[] | undefined;
const listeners = new Set<() => void>();
const get = () => (list ??= read());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The recent icons, newest first; the page re-renders when one is added. */
export function useRecentIcons(): RecentIcon[] {
  return useSyncExternalStore(subscribe, get);
}

/** Puts an icon first in the list (an icon already in it moves up, keeping one entry per name). */
export function rememberIcon(icon: RecentIcon): void {
  list = [icon, ...get().filter((r) => r.name !== icon.name)].slice(0, RECENT_ICONS);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* not kept, still shown this session */ }
  listeners.forEach((fn) => fn());
}
