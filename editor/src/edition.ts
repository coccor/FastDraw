// Which editor this is. LOCAL: the one `fastdraw open --editor local` serves from this computer. It edits and saves
// like the editor at fastdraw.dev, with the built-in look's ~130 icons, the light theme, no look picker and no
// templates; it leads to fastdraw.dev for those (owner, 2026-11-26). The constant is folded at build time, so what
// LOCAL leaves out is not in its bundle at all.
export const LOCAL: boolean = typeof __FASTDRAW_LOCAL__ !== 'undefined' && !!__FASTDRAW_LOCAL__;
export const SITE = 'https://fastdraw.dev/';
export const HOSTED_EDITOR = 'https://fastdraw.dev/edit/';
