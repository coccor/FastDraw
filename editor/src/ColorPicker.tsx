import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The colour popover, as Excalidraw lays it out: the diagram's own custom colours, the look's palette
// (keys q w e r t / a s d f g / z x c v b), five shades of the picked colour (Shift+1..5) and a hex field
// with an eyedropper. It opens beside the panel it was opened from.

const KEYS = 'qwertasdfgzxcvb';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function normHex(v: string): string | null {
  let s = v.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = [...s].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? '#' + s : null;
}

const isHex = (c: string | null | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
const mix = (hex: string, to: number, t: number) => toHex(rgb(hex).map((x) => x + (to - x) * t));

// lightest to darkest, the colour itself fourth
export function shades(hex: string): string[] {
  return [mix(hex, 255, 0.85), mix(hex, 255, 0.6), mix(hex, 255, 0.32), hex.toLowerCase(), mix(hex, 0, 0.3)];
}

// dark or light, whichever reads on the swatch
function inkOn(c: string): string {
  if (!isHex(c)) return 'var(--ink)';
  const [r, g, b] = rgb(c);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 'rgba(15, 23, 42, .75)' : 'rgba(255, 255, 255, .9)';
}

type PickerProps = {
  value: string | undefined; // the current value as written (a colour name, name/alpha, hex or none)
  palette: string[]; recent: string[];
  resolve: (v: string) => string; // a value as a CSS colour, or 'none'
  onPick: (v: string) => void; label: string; className?: string; style?: React.CSSProperties; title?: string;
};

export function ColorPicker({ label, className, style, title, ...rest }: PickerProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className={className} style={style} aria-label={label} title={title}
        aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && <Popover anchor={btn.current!} label={label} onClose={() => setOpen(false)} {...rest} />}
    </>
  );
}

function Popover({ anchor, label, value, palette, recent, resolve, onPick, onClose }: Omit<PickerProps, 'className' | 'style' | 'title'> & { anchor: HTMLElement; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const cur = value ? resolve(value) : null;
  // the colour the shades are of: the one last picked from the palette, or the current one
  const [base, setBase] = useState(value);
  const baseHex = base ? resolve(base) : null;
  const tones = isHex(baseHex) ? shades(baseHex) : null;
  useEffect(() => {
    if (value && !(tones && isHex(cur) && tones.includes(cur.toLowerCase()))) setBase(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const [text, setText] = useState(isHex(cur) ? cur.slice(1) : '');
  useEffect(() => setText(isHex(cur) ? cur.slice(1) : ''), [cur]);
  const commitText = () => {
    const h = normHex(text);
    if (!h) { setText(isHex(cur) ? cur.slice(1) : ''); return; }
    if (h !== cur?.toLowerCase()) onPick(h);
  };

  // fixed beside the panel (or menu) it was opened from, so the scrolling panel does not clip it
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), side = (anchor.closest('.panel, .dropdown') ?? anchor).getBoundingClientRect();
    const w = box.current!.offsetWidth, h = box.current!.offsetHeight;
    const left = side.right + 8 + w <= innerWidth - 8 ? side.right + 8 : Math.max(8, side.left - 8 - w);
    setPos({ left, top: clamp(a.top - 12, 8, innerHeight - h - 8) });
  }, [anchor]);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [anchor, onClose]);

  const fromPalette = (v: string) => { setBase(v); onPick(v); };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { onClose(); anchor.focus(); return; }
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    const shade = /^Digit([1-5])$/.exec(e.code);
    if (e.shiftKey && shade && tones) { e.preventDefault(); onPick(tones[+shade[1]! - 1]!); return; }
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (!e.shiftKey && i >= 0 && palette[i]) { e.preventDefault(); fromPalette(palette[i]!); }
  };

  const swatch = (v: string, pick: (v: string) => void, key?: string, on = v === value) => {
    const c = resolve(v);
    return (
      <button key={v} type="button" title={v === 'none' ? 'None' : v} aria-label={v} aria-pressed={on}
        className={'pswatch' + (on ? ' on' : '') + (c === 'none' ? ' none' : '')}
        style={c === 'none' ? undefined : { background: c, color: inkOn(c) }} onClick={() => pick(v)}>
        {key && <kbd>{key}</kbd>}
      </button>
    );
  };
  const dropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return createPortal(
    <div ref={box} tabIndex={-1} className="colorpop island" role="dialog" aria-label={label} style={pos}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={keys}>
      {recent.length > 0 && (
        <section>
          <h5>Custom colours</h5>
          <div className="pgrid">{recent.slice(0, 5).map((v) => swatch(v, onPick, undefined, isHex(cur) && v === cur.toLowerCase()))}</div>
        </section>
      )}
      <section>
        <h5>Colours</h5>
        <div className="pgrid" role="group" aria-label="Palette">{palette.map((v, i) => swatch(v, fromPalette, KEYS[i]))}</div>
      </section>
      {tones && (
        <section>
          <h5>Shades</h5>
          <div className="pgrid" role="group" aria-label="Shades">
            {tones.map((h, i) => swatch(h, onPick, `⇧${i + 1}`, isHex(cur) && cur.toLowerCase() === h))}
          </div>
        </section>
      )}
      <section>
        <h5>Hex code</h5>
        <label className="hexrow">
          <b>#</b>
          <input aria-label="Hex colour" value={text} spellCheck={false} maxLength={7} placeholder={cur === 'none' ? 'none' : ''}
            onChange={(e) => setText(e.target.value.replace(/^#/, ''))} onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Enter') { commitText(); onClose(); anchor.focus(); } }} />
          {dropper && (
            <button type="button" className="dropper" title="Pick a colour from the screen" aria-label="Pick a colour from the screen"
              onClick={() => new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open()
                .then((r) => { const h = normHex(r.sRGBHex); if (h) onPick(h); }).catch(() => {})}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
              </svg>
            </button>
          )}
        </label>
      </section>
    </div>,
    document.body,
  );
}
