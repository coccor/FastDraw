import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A colour picker of our own, so it opens on a hex field (the browser's picker opens in RGB and
// cannot be told otherwise): a saturation/brightness square, a hue strip and the hex value, under an
// optional palette (`children`). A pick is one change: the square and strip apply on release, the field on Enter or when left.

type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export function normHex(v: string): string | null {
  let s = v.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = [...s].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? '#' + s : null;
}

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (k: number) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

export function ColorPicker({ value, onPick, label, className, style, title, children }: {
  value: string | null; onPick: (hex: string) => void; label: string; className?: string; style?: React.CSSProperties; title?: string; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className={className} style={style} aria-label={label} title={title ?? (value ? `${value} (pick another)` : 'Any colour')}
        aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && <Popover anchor={btn.current!} start={value ?? '#4f46e5'} label={label} onPick={onPick} onClose={() => setOpen(false)}>{children}</Popover>}
    </>
  );
}

function Popover({ anchor, start, label, onPick, onClose, children }: { anchor: HTMLElement; start: string; label: string; onPick: (hex: string) => void; onClose: () => void; children?: React.ReactNode }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normHex(start) ?? '#4f46e5'));
  const hex = hsvToHex(hsv);
  const [text, setText] = useState(hex.slice(1));
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  // the value last handed out, so leaving the field after a drag does not apply it twice
  const sent = useRef(normHex(start));
  const pick = (h: string) => { if (h !== sent.current) { sent.current = h; onPick(h); } };
  // a colour picked from the palette moves the square, strip and field to it
  useEffect(() => {
    const h = normHex(start);
    if (h && h !== sent.current) { sent.current = h; setHsv(hexToHsv(h)); setText(h.slice(1)); }
  }, [start]);

  // fixed, so the scrolling panel does not clip it; flipped up or left when it would leave the window
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), w = box.current!.offsetWidth, h = box.current!.offsetHeight;
    const top = a.bottom + 6 + h > innerHeight - 8 ? Math.max(8, a.top - 6 - h) : a.bottom + 6;
    setPos({ left: clamp(a.left, 8, innerWidth - w - 8), top });
  }, [anchor]);
  useEffect(() => { field.current?.focus(); field.current?.select(); }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [anchor, onClose]);

  const set = (next: Hsv) => { setHsv(next); setText(hsvToHex(next).slice(1)); };
  const drag = (e: React.PointerEvent<HTMLDivElement>, f: (x: number, y: number) => Hsv) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) => f(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
    let last = at(e);
    set(last);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { last = at(ev); set(last); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); pick(hsvToHex(last)); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const commitText = () => {
    const h = normHex(text);
    if (!h) { setText(hex.slice(1)); return; }
    setHsv(hexToHsv(h)); setText(h.slice(1));
    pick(h);
  };

  return createPortal(
    <div ref={box} className="colorpop island" role="dialog" aria-label={label} style={pos}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      {children}
      <div className="sv" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={(e) => drag(e, (x, y) => ({ h: hsv.h, s: x, v: 1 - y }))}>
        <span style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div className="hue" onPointerDown={(e) => drag(e, (x) => ({ ...hsv, h: Math.min(359.9, x * 360) }))}>
        <span style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <label className="hexrow">
        <i style={{ background: hex }} />
        <b>#</b>
        <input ref={field} aria-label="Hex colour" value={text} spellCheck={false} maxLength={7}
          onChange={(e) => setText(e.target.value.replace(/^#/, ''))} onBlur={commitText}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitText(); onClose(); } }} />
      </label>
    </div>,
    document.body,
  );
}
