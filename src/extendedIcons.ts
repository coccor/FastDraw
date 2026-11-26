// The rest of Phosphor's icons (iconSetAll.ts, a few MB) are not part of the first load: the editor and
// the command-line tool load them once with loadExtendedIcons(), which adds them to the built-in icons.
// Looks parsed after that offer them too; the looks already kept are parsed again.
import { ICON_WEIGHTS, DUOTONE_TINT } from './iconSet.ts';
import { ICON_WORDS } from './icons.ts';
import { resetLookCaches } from './look.ts';

// set by vite.local.config.ts for the local editor, which leaves this set out (and carries only its names);
// undefined everywhere else
declare const __FASTDRAW_LOCAL__: boolean | undefined;
declare const __FASTDRAW_FULL_ICON_NAMES__: string[] | undefined;
const FULL_SET_NAMES = typeof __FASTDRAW_FULL_ICON_NAMES__ !== 'undefined' ? new Set(__FASTDRAW_FULL_ICON_NAMES__) : null;

/** True for an icon of the full set in an editor that leaves the set out: it exists, but is not drawn here. */
export const leftOutIcon = (name: string): boolean => !loaded && !!FULL_SET_NAMES?.has(name);

let loading: Promise<void> | undefined;
let loaded = false;
const listeners = new Set<() => void>();

/** True once every icon is available (before that, only the first ~130 built-in icons are). */
export const extendedIconsLoaded = () => loaded;

/** Calls `fn` when the rest of the icons have loaded; returns the function that stops it. */
export function subscribeExtendedIcons(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Loads the rest of the icons; every call after the first returns the same promise. */
export function loadExtendedIcons(): Promise<void> {
  // the local editor (`fastdraw open --editor local`) has the first ~130 only: its build leaves the set out
  if (typeof __FASTDRAW_LOCAL__ !== 'undefined' && __FASTDRAW_LOCAL__) return (loading ??= Promise.resolve());
  loading ??= import('./iconSetAll.ts').then((m) => {
    for (const w of Object.keys(m.EXTRA_WEIGHTS) as (keyof typeof m.EXTRA_WEIGHTS)[]) Object.assign(ICON_WEIGHTS[w], m.EXTRA_WEIGHTS[w]);
    Object.assign(DUOTONE_TINT, m.EXTRA_TINT);
    Object.assign(ICON_WORDS, m.EXTRA_WORDS);
    loaded = true;
    resetLookCaches();
    listeners.forEach((fn) => fn());
  });
  return loading;
}
