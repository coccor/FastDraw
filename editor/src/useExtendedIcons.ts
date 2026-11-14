import { useEffect, useSyncExternalStore } from 'react';
import { loadExtendedIcons, extendedIconsLoaded, subscribeExtendedIcons } from '../../src/extendedIcons.ts';

/**
 * True once every Phosphor icon is available, not only the ~130 built-in ones. The rest are about 1 MB
 * to fetch, so they load only when `wanted`: the icon dialog is open, or the diagram or the recent icons
 * use one of them. Everything that uses this re-renders when they arrive. If the fetch fails (offline),
 * the built-in icons still work.
 */
export function useExtendedIcons(wanted: boolean): boolean {
  const ready = useSyncExternalStore(subscribeExtendedIcons, extendedIconsLoaded);
  useEffect(() => {
    if (wanted && !ready) loadExtendedIcons().catch(() => { /* stays on the built-in icons */ });
  }, [wanted, ready]);
  return ready;
}
