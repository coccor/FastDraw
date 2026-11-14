// How a built-in icon is drawn in each style: which Phosphor layers, in its 256 box. The renderer and the
// editor's icon tiles both draw from here, so a tile looks like the icon on the canvas.
import type { Look } from './look.ts';
import { ICONS } from './icons.ts';
import { ICON_WEIGHTS, WEIGHT_WIDTH, DUOTONE_TINT } from './iconSet.ts';
import type { IconWeight } from './iconSet.ts';

export { ICON_BOX } from './iconSet.ts';
export type IconStyle = 'outline' | 'solid' | 'duotone';
export const ICON_STYLES: IconStyle[] = ['outline', 'solid', 'duotone'];

// A built-in icon is one the look has not redrawn with its own `icon` statement (or an icon file).
export const isBuiltIn = (look: Look, name: string) => !look.images.has(name) && !!ICONS[name] && look.icons.get(name) === ICONS[name];

// The outline weight nearest a line width, given in the icon's 256 box; regular when none is asked for.
export function weightFor(width?: number): Exclude<IconWeight, 'fill'> {
  if (!(width! > 0)) return 'regular';
  return (Object.entries(WEIGHT_WIDTH) as [Exclude<IconWeight, 'fill'>, number][]).reduce((a, b) => (Math.abs(b[1] - width!) < Math.abs(a[1] - width!) ? b : a))[0];
}

// The two layers of a built-in icon: a tint drawn under it (duotone, or an outline with icon.fill), and
// the icon itself, filled in its colour.
export function iconLayers(name: string, style: IconStyle, weight: Exclude<IconWeight, 'fill'> = 'regular'): { tint: string[]; front: string[] } {
  if (style === 'solid') return { tint: [], front: ICON_WEIGHTS.fill[name] ?? [] };
  return { tint: DUOTONE_TINT[name] ?? [], front: ICON_WEIGHTS[weight][name] ?? [] };
}
