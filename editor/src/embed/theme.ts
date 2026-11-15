// Light or dark for an embedded diagram, and the look it is drawn in on a dark page.
import { parseStatements } from '../../../src/parse.ts';

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
 * to keep its own. A look names its dark counterpart with a `dark <name or path>` statement, read here from
 * the parsed look's `dark` field, else from the look's text; with neither, the built-in look's is `night`.
 * ref: the diagram's `look` line (undefined for the built-in look).
 */
export function darkCounterpart(ref: string | undefined, look: object | null, source: string | null): string | null {
  const own = (look as { dark?: unknown } | null)?.dark;
  let v = typeof own === 'string' ? own : undefined;
  if (v === undefined && source) v = parseStatements(source).find((s) => s.toks[0]?.t === 'word' && s.toks[0].v === 'dark')?.toks[1]?.v;
  if (v === undefined && !ref) v = 'night';
  return v && v !== ref ? v : null;
}

/** The diagram's text with its look line naming `look` instead (or one added at the top). */
export function withLook(text: string, look: string): string {
  const line = `look ${/^[\w.-]+$/.test(look) ? look : JSON.stringify(look)}`;
  return /^look\s/m.test(text) ? text.replace(/^look\s.*$/m, line) : `${line}\n${text}`;
}
