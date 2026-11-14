import React from 'react';
import type { Look } from '../../src/look.ts';
import { isIconUri } from '../../src/iconfiles.ts';
import { iconMatches } from '../../src/icons.ts';
import { SOLID_BOX, SOLID_ICONS } from '../../src/solidIcons.ts';
import { DUOTONE_ICONS } from '../../src/duotoneIcons.ts';
import { ICONS } from '../../src/icons.ts';

export type IconStyle = 'outline' | 'solid' | 'duotone';

// One icon drawn small, the way the diagram draws it: a look's outline in the current colour, its solid
// twin filled in the current colour, its duotone (the outline over a light tint), or an icon file as an image.
export function IconGlyph({ look, name, size = 22, iconStyle = 'outline' }: { look: Look; name: string; size?: number; iconStyle?: IconStyle }) {
  const img = look.images.get(name);
  if (img) return isIconUri(img) ? <img src={img} width={size} height={size} alt="" draggable={false} /> : null;
  const filled = iconStyle === 'solid' ? SOLID_ICONS[name] : undefined;
  const outline = look.icons.get(name) ?? [];
  const tint = iconStyle === 'duotone' && outline === ICONS[name] ? DUOTONE_ICONS[name] : undefined;
  if (filled) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${SOLID_BOX} ${SOLID_BOX}`} fill="currentColor" aria-hidden="true">
        {filled.map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tint && <path d={tint} fill="currentColor" fillOpacity={0.2} stroke="none" />}
      {outline.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// Every icon the look has, as tiles to click, with a search box, in three tabs: Outline (the look's folder
// icons first, then the built-in outlines), Solid (the built-in icons filled in one colour) and Duotone
// (the built-in outlines over a light tint of their main part).
export function IconPicker({ look, value, iconStyle, onPick }: { look: Look; value: string | undefined; iconStyle: IconStyle; onPick: (name: string | null, style: IconStyle) => void }) {
  const [q, setQ] = React.useState('');
  // open on the tab of the chosen icon; with none chosen, on outline
  const [tab, setTab] = React.useState<IconStyle>(iconStyle);
  React.useEffect(() => { if (value) setTab(iconStyle); }, [value, iconStyle]);
  const match = (n: string) => iconMatches(n, q);
  const isSolid = tab === 'solid';
  const folder = tab === 'outline' ? [...look.images.keys()].filter(match) : [];
  const names = isSolid ? Object.keys(SOLID_ICONS) : tab === 'duotone' ? Object.keys(ICONS) : [...look.icons.keys()];
  const builtIn = names.filter((n) => !look.images.has(n)).filter(match).sort();
  const first = folder[0] ?? builtIn[0];
  const on = (n: string) => value === n && iconStyle === tab;
  // keep the chosen icon in sight when the panel opens on a box that has one
  const grid = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const g = grid.current, el = g?.querySelector<HTMLElement>('.icontile.on');
    if (g && el) g.scrollTop = el.offsetTop - g.offsetTop - g.clientHeight / 2 + el.clientHeight / 2;
  }, [value, tab]);
  const tile = (n: string) => (
    <button key={n} type="button" className={'icontile' + (on(n) ? ' on' : '')} title={on(n) ? `${n} (click again to remove)` : n} role="radio" aria-label={n} aria-checked={on(n)} onClick={() => onPick(on(n) ? null : n, tab)}>
      <IconGlyph look={look} name={n} iconStyle={tab} />
    </button>
  );
  const count = tab === 'outline' ? new Set([...look.images.keys(), ...look.icons.keys()]).size : names.length;
  return (
    <div className="iconpicker">
      <div className="seg icontabs" role="tablist" aria-label="Icon set">
        {([['outline', 'Outline'], ['solid', 'Solid'], ['duotone', 'Duotone']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="iconsearch">
        <input type="search" aria-label="Search icons" placeholder="Search icons" title={`${count} icons; search by name or meaning`} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) onPick(first, tab);
            if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); }
          }} />
      </div>
      <div className="icongrid" ref={grid} role="radiogroup" aria-label={isSolid ? 'Solid icons' : tab === 'duotone' ? 'Duotone icons' : 'Icons'}>
        {folder.length > 0 && <div className="iconhead">From the look's folder</div>}
        {folder.map(tile)}
        {folder.length > 0 && builtIn.length > 0 && <div className="iconhead">Built in</div>}
        {builtIn.map(tile)}
        {!folder.length && !builtIn.length && <p className="muted small">No icon is called anything like “{q.trim()}”.</p>}
      </div>
    </div>
  );
}
