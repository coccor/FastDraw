// A diagram drawn on the site is drawn in its look's version for the page's theme: the built-in look in Night
// on a dark page, shade in shade-dark, and a diagram that names a dark version in its light look on a light
// page. A look the site does not ship (a file or an address) is kept.
import type { Theme } from '../theme.ts';
import { isBundledLook, lookForTheme } from '../../../src/look.ts';

const LOOK_LINE = /^look[ \t]+(\S+)[ \t]*$/m;

export function inTheme(text: string, theme: Theme): string {
  const m = LOOK_LINE.exec(text), named = m ? m[1]! : null;
  if (named !== null && !isBundledLook(named)) return text;
  const want = lookForTheme(named, theme);
  if (want === named) return text;
  if (want === null) return text.replace(/^look[ \t]+\S+[ \t]*\r?\n?/m, '');
  return named === null ? `look ${want}\n${text}` : text.replace(LOOK_LINE, `look ${want}`);
}
