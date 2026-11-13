// A diagram drawn on the site in the built-in look is drawn in its dark twin, Night, on a dark page.
// Diagrams that name a look keep it.
import type { Theme } from '../theme.ts';

export const inTheme = (text: string, theme: Theme) => (theme === 'dark' && !/^look /m.test(text) ? `look night\n${text}` : text);
