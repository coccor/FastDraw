// Which editor this is. LOCAL: the one `fastdraw open --editor local` serves from this computer. It edits and saves
// like the editor at fastdraw.dev, with 24 icons in its picker, the light theme, no look picker and no
// templates; it leads to fastdraw.dev for those (owner, 2026-11-26). The constant is folded at build time, so what
// LOCAL leaves out is not in its bundle at all.
declare const __FASTDRAW_LOCAL__: boolean | undefined;
export const LOCAL: boolean = typeof __FASTDRAW_LOCAL__ !== 'undefined' && !!__FASTDRAW_LOCAL__;
export const SITE = 'https://fastdraw.dev/';
export const HOSTED_EDITOR = 'https://fastdraw.dev/edit/';

// The icons the local editor's picker offers: a small everyday set. A diagram still draws the 128 icons that ship
// by default; one from the full set is not drawn, with a warning (scene.ts, leftOutIcon). The editor on
// fastdraw.dev has them all (about 1,600, in outline, solid and duotone).
export const LOCAL_ICONS = [
  'server', 'database', 'cloud', 'user', 'users', 'lock', 'key', 'cpu', 'file', 'folder', 'chat', 'shield',
  'bell', 'clock', 'code', 'terminal', 'browser', 'desktop', 'queue', 'package', 'robot', 'plug', 'network', 'bug',
];

// Opens the diagram in the editor at fastdraw.dev; the editor sets it once it has a diagram (App.tsx).
let onSite: () => void = () => { window.open(HOSTED_EDITOR, '_blank', 'noopener'); };
export const openOnSite = () => onSite();
export const setOpenOnSite = (fn: () => void) => { onSite = fn; };
