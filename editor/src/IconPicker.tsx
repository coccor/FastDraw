import React from 'react';
import type { Look } from '../../src/look.ts';
import { isIconUri } from '../../src/iconfiles.ts';
import { iconMatches } from '../../src/icons.ts';
import { SOLID_BOX, SOLID_ICONS } from '../../src/solidIcons.ts';

// One icon drawn small, the way the diagram draws it: a look's outline in the current colour, its solid
// twin filled in the current colour, or an icon file as an image.
export function IconGlyph({ look, name, size = 22, solid = false }: { look: Look; name: string; size?: number; solid?: boolean }) {
  const img = look.images.get(name);
  if (img) return isIconUri(img) ? <img src={img} width={size} height={size} alt="" draggable={false} /> : null;
  const filled = solid ? SOLID_ICONS[name] : undefined;
  if (filled) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${SOLID_BOX} ${SOLID_BOX}`} fill="currentColor" aria-hidden="true">
        {filled.map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(look.icons.get(name) ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

type IconSet = 'outline' | 'solid';

// Every icon the look has, as tiles to click, with a search box, in two tabs: Outline (the look's folder
// icons first, then the built-in outlines) and Solid (the built-in icons filled in one colour).
export function IconPicker({ look, value, solid, onPick }: { look: Look; value: string | undefined; solid: boolean; onPick: (name: string | null, solid: boolean) => void }) {
  const [q, setQ] = React.useState('');
  // open on the tab of the chosen icon; with none chosen, on outline
  const [tab, setTab] = React.useState<IconSet>(solid ? 'solid' : 'outline');
  React.useEffect(() => { if (value) setTab(solid ? 'solid' : 'outline'); }, [value, solid]);
  const match = (n: string) => iconMatches(n, q);
  const isSolid = tab === 'solid';
  const folder = isSolid ? [] : [...look.images.keys()].filter(match);
  const builtIn = (isSolid ? Object.keys(SOLID_ICONS).filter((n) => !look.images.has(n)) : [...look.icons.keys()].filter((n) => !look.images.has(n))).filter(match).sort();
  const first = folder[0] ?? builtIn[0];
  const on = (n: string) => value === n && solid === isSolid;
  // keep the chosen icon in sight when the panel opens on a box that has one
  const grid = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const g = grid.current, el = g?.querySelector<HTMLElement>('.icontile.on');
    if (g && el) g.scrollTop = el.offsetTop - g.offsetTop - g.clientHeight / 2 + el.clientHeight / 2;
  }, [value, tab]);
  const tile = (n: string) => (
    <button key={n} type="button" className={'icontile' + (on(n) ? ' on' : '')} title={on(n) ? `${n} (click again to remove)` : n} role="radio" aria-label={n} aria-checked={on(n)} onClick={() => onPick(on(n) ? null : n, isSolid)}>
      <IconGlyph look={look} name={n} solid={isSolid} />
    </button>
  );
  const count = isSolid ? Object.keys(SOLID_ICONS).length : new Set([...look.images.keys(), ...look.icons.keys()]).size;
  return (
    <div className="iconpicker">
      <div className="seg icontabs" role="tablist" aria-label="Icon set">
        {([['outline', 'Outline'], ['solid', 'Solid']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="iconsearch">
        <input type="search" aria-label="Search icons" placeholder="Search icons" title={`${count} icons; search by name or meaning`} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) onPick(first, isSolid);
            if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); }
          }} />
      </div>
      <div className="icongrid" ref={grid} role="radiogroup" aria-label={isSolid ? 'Solid icons' : 'Icons'}>
        {folder.length > 0 && <div className="iconhead">From the look's folder</div>}
        {folder.map(tile)}
        {folder.length > 0 && builtIn.length > 0 && <div className="iconhead">Built in</div>}
        {builtIn.map(tile)}
        {!folder.length && !builtIn.length && <p className="muted small">No icon is called anything like “{q.trim()}”.</p>}
      </div>
    </div>
  );
}
