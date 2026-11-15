// Light or dark for an embedded diagram, and the look it is drawn in on a dark page.
import type { Look } from '../../../src/look.ts';

export type Theme = 'light' | 'dark';

/**
 * attr: the element's `theme` attribute (auto when missing or anything else).
 * page: what the page says about itself: `data-theme` on <html> (Starlight, Docusaurus), else null.
 * prefersDark: the system setting, used when the page says nothing.
 */
export function resolveTheme(attr: string | null, page: string | null | undefined, prefersDark: boolean): Theme {
  if (attr === 'light' || attr === 'dark') return attr;
  if (page === 'light' || page === 'dark') return page;
  return prefersDark ? 'dark' : 'light';
}

/** What the page's <html> says its theme is: `data-theme`, else a `dark` or `light` class (VitePress and others). */
export function pageTheme(html: { dataset: DOMStringMap; classList: DOMTokenList }): string | null {
  const t = html.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return html.classList.contains('dark') ? 'dark' : html.classList.contains('light') ? 'light' : null;
}

/**
 * The look to draw a diagram in on a dark page (a bundled name, or a path relative to the look file), or null
 * to keep its own: what the look's `dark` line names (parseLook reads it into `dark`). A diagram with no look
 * line is in the built-in look, whose dark version is `night`, also when its look could not be parsed.
 * ref: the diagram's `look` line (undefined for the built-in look).
 */
export function darkCounterpart(ref: string | undefined, look: Pick<Look, 'dark'> | null): string | null {
  const v = look?.dark ?? (ref ? undefined : 'night');
  return v && v !== ref ? v : null;
}
