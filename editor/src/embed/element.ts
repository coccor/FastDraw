// <fastdraw-diagram src="diagram.fdraw"><img src="diagram.png" alt="..."></fastdraw-diagram>
//
// Draws a .fdraw file as a live SVG in the page, with the renderer the editor uses: drag to pan, pinch or
// Ctrl/Cmd+wheel to zoom, a small toolbar, light and dark following the page, and a link that opens the
// diagram in the editor. The children (an image of the diagram) show until the drawing is ready and stay
// when anything fails. This file is embed.js; the renderer is in a second file loaded on first use.
import { resolveTheme, pageTheme, type Theme } from './theme.ts';
import { editorLink } from './share.ts';
import type { Source, Drawn } from './draw.ts';

const EDITOR = 'https://fastdraw.dev/edit/';
// the fonts are served next to embed.js, wherever that is (fastdraw.dev, or a site that hosts its own copy)
const FONTS = new URL('fonts/', import.meta.url).href;
const renderer = () => import('./draw.ts');

const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  in: icon('M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13zM15.3 15.3 20 20M7.5 10.5h6M10.5 7.5v6'),
  out: icon('M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13zM15.3 15.3 20 20M7.5 10.5h6'),
  fit: icon('M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15'),
  full: icon('M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5'),
  exit: icon('M20 10h-6V4M4 14h6v6M14 10l6.5-6.5M10 14l-6.5 6.5'),
  open: icon('M13 4h7v7M20 4l-9 9M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10'),
};

const CSS = `
:host { display: block; position: relative; }
:host([hidden]) { display: none; }
[hidden] { display: none !important; }
.frame { position: relative; width: 100%; aspect-ratio: var(--fd-ratio, 2); overflow: hidden; outline: none; }
.frame:fullscreen { width: 100vw; height: 100vh; max-height: none !important; aspect-ratio: auto; }
.view { position: absolute; inset: 0; touch-action: pan-y; cursor: default; outline: none; }
.view.pannable { touch-action: none; cursor: grab; }
.view.dragging { cursor: grabbing; }
.view:focus-visible { box-shadow: inset 0 0 0 2px #dc2f2f; }
.view svg { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-select: none; }
.bar {
  position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 1px; padding: 3px;
  background: rgba(255, 255, 255, 0.94); border: 1px solid #e4e4e7; border-radius: 10px;
  box-shadow: 0 1px 2px rgba(24, 24, 27, 0.06), 0 2px 8px rgba(24, 24, 27, 0.05);
  opacity: 0; transition: opacity 0.15s;
}
.frame:hover .bar, .frame:focus-within .bar { opacity: 1; }
@media (hover: none) { .bar { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
.bar button, .bar a {
  all: unset; box-sizing: border-box; display: grid; place-items: center; width: 28px; height: 28px;
  border-radius: 7px; color: #52525b; cursor: pointer;
}
.bar button:hover, .bar a:hover { background: #fde3e1; color: #dc2f2f; }
.bar button:focus-visible, .bar a:focus-visible { outline: 2px solid #dc2f2f; outline-offset: -1px; }
.bar button:disabled { opacity: 0.35; cursor: default; background: none; color: #52525b; }
.bar .sep { width: 1px; height: 16px; margin: 0 3px; background: #e4e4e7; }
.bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.frame.dark .bar { background: rgba(24, 24, 27, 0.92); border-color: #3f3f46; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.frame.dark .bar button, .frame.dark .bar a { color: #a1a1aa; }
.frame.dark .bar button:hover, .frame.dark .bar a:hover { background: rgba(255, 107, 95, 0.2); color: #ffb4ab; }
.frame.dark .bar .sep { background: #3f3f46; }
.frame.dark .view:focus-visible { box-shadow: inset 0 0 0 2px #ff6b5f; }
`;

const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const darkSystem = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

// one watch on the page's theme, shared by every diagram on it
const live = new Set<FastDrawDiagram>();
let watching = false;
function watchPage() {
  if (watching) return;
  watching = true;
  const all = () => live.forEach((d) => d.themeChanged());
  new MutationObserver(all).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  darkSystem?.addEventListener('change', all);
}

type View = { x: number; y: number; k: number }; // the diagram point at the top-left, and pixels per diagram unit

export class FastDrawDiagram extends HTMLElement {
  static observedAttributes = ['src', 'theme', 'max-height', 'editor'];

  #fallback: HTMLElement; #frame: HTMLElement; #view: HTMLElement; #open: HTMLAnchorElement; #full: HTMLButtonElement;
  #source: Source | null = null;
  #drawn: Drawn | null = null;
  #theme: Theme | null = null;
  #gen = 0; // bumped by every new load or draw, so a slow one that finishes late is dropped
  #v: View = { x: 0, y: 0, k: 1 };
  #W = 0; #H = 0;
  #home = true; // still at the first view: a resize fits it again
  #anim = 0;
  #pointers = new Map<number, { x: number; y: number }>();
  #moved = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="fallback"><slot></slot></div>` +
      `<div class="frame" part="frame" hidden><div class="view" part="view" tabindex="0" role="img"></div>` +
      `<div class="bar" part="toolbar" role="toolbar" aria-label="Diagram controls">` +
      `<button type="button" data-act="in" aria-label="Zoom in" title="Zoom in (+)">${ICON.in}</button>` +
      `<button type="button" data-act="out" aria-label="Zoom out" title="Zoom out (−)">${ICON.out}</button>` +
      `<button type="button" data-act="fit" aria-label="Fit to view" title="Fit (0)">${ICON.fit}</button>` +
      `<button type="button" data-act="full" aria-label="Full screen" title="Full screen">${ICON.full}</button>` +
      `<span class="sep"></span><a class="open" target="_blank" rel="noopener" aria-label="Open in FastDraw" title="Open in FastDraw">${ICON.open}</a>` +
      `</div></div>`;
    this.#fallback = root.querySelector('.fallback')!;
    this.#frame = root.querySelector('.frame')!;
    this.#view = root.querySelector('.view')!;
    this.#open = root.querySelector('a.open')!;
    this.#full = root.querySelector('[data-act=full]')!;
    if (!document.fullscreenEnabled) this.#full.hidden = true;

    root.querySelector('.bar')!.addEventListener('click', (e) => {
      const act = (e.target as Element).closest('button')?.dataset.act;
      if (act === 'in') this.zoomBy(1.4);
      else if (act === 'out') this.zoomBy(1 / 1.4);
      else if (act === 'fit') this.fit();
      else if (act === 'full') this.#toggleFull();
    });
    this.addEventListener('keydown', (e) => this.#key(e));
    const v = this.#view;
    v.addEventListener('pointerdown', (e) => this.#down(e));
    v.addEventListener('pointermove', (e) => this.#move(e));
    v.addEventListener('pointerup', (e) => this.#up(e));
    v.addEventListener('pointercancel', (e) => this.#up(e));
    v.addEventListener('wheel', (e) => this.#wheel(e), { passive: false });
    v.addEventListener('dblclick', () => this.fit());
    new ResizeObserver(() => this.#resized()).observe(this.#frame);
    document.addEventListener('fullscreenchange', () => this.#fullChanged());
  }

  connectedCallback() {
    live.add(this);
    watchPage();
    this.#maxHeight();
    if (!this.#source) this.#load();
  }
  disconnectedCallback() { live.delete(this); }

  attributeChangedCallback(name: string, old: string | null, now: string | null) {
    if (old === now || !this.isConnected) return;
    if (name === 'src') this.#load();
    else if (name === 'theme') this.themeChanged();
    else if (name === 'max-height') this.#maxHeight();
    else if (name === 'editor') this.#link();
  }

  /** The theme the diagram is drawn in now. */
  get theme(): Theme { return resolveTheme(this.getAttribute('theme'), pageTheme(document.documentElement), !!darkSystem?.matches); }

  /** Called when the page's theme may have changed: draws the diagram again if its theme did. */
  themeChanged() {
    if (this.#source && this.theme !== this.#theme) this.#draw();
  }

  // ---- loading and drawing ----------------------------------------------
  async #load() {
    const src = this.getAttribute('src');
    const gen = ++this.#gen;
    if (!src) return;
    try {
      const m = await renderer();
      const source = await m.fetchSource(new URL(src, document.baseURI).href);
      if (gen !== this.#gen) return;
      this.#source = source;
      this.#home = true;
      await this.#draw();
      this.#link();
    } catch (e) {
      if (gen === this.#gen) this.#failed(e);
    }
  }

  async #draw() {
    const source = this.#source!, theme = this.theme, gen = ++this.#gen;
    try {
      const m = await renderer();
      const drawn = await m.draw(source, theme === 'dark', this.getAttribute('fonts') ?? FONTS);
      if (gen !== this.#gen) return;
      const same = this.#drawn && this.#drawn.w === drawn.w && this.#drawn.h === drawn.h && this.#drawn.x === drawn.x && this.#drawn.y === drawn.y;
      this.#drawn = drawn;
      this.#theme = theme;
      this.#view.innerHTML = drawn.svg;
      const svg = this.#view.querySelector('svg')!;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      this.#view.setAttribute('aria-label', this.#label());
      this.#frame.style.background = drawn.paper;
      this.#frame.style.setProperty('--fd-ratio', `${drawn.w} / ${drawn.h}`);
      this.#frame.classList.toggle('dark', theme === 'dark');
      this.#frame.hidden = false;
      this.#fallback.hidden = true;
      this.#measure();
      if (this.#home || !same) this.#goHome(); else this.#set(this.#v);
      this.dataset.ready = '';
      this.dispatchEvent(new CustomEvent('fastdraw-ready', { detail: { theme } }));
    } catch (e) {
      if (gen === this.#gen) this.#failed(e);
    }
  }

  #failed(e: unknown) {
    console.error(`fastdraw-diagram: could not draw ${this.getAttribute('src')}`, e);
    // what was drawn before stays; the first time, the fallback does
    if (this.#drawn) return;
    this.#frame.hidden = true;
    this.#fallback.hidden = false;
    this.dispatchEvent(new CustomEvent('fastdraw-error', { detail: { error: e } }));
  }

  #label(): string {
    const alt = this.getAttribute('alt') ?? this.querySelector('img')?.getAttribute('alt');
    return alt || `Diagram ${this.#name()}`;
  }
  #name(): string {
    const path = new URL(this.#source?.url ?? this.getAttribute('src') ?? 'diagram.fdraw', document.baseURI).pathname;
    let n = path.slice(path.lastIndexOf('/') + 1) || 'diagram.fdraw';
    try { n = decodeURIComponent(n); } catch { /* keep it encoded */ }
    return n;
  }

  async #link() {
    const s = this.#source;
    if (!s) return;
    try {
      this.#open.href = await editorLink(this.getAttribute('editor') || EDITOR, { name: this.#name(), text: s.text, ...(s.look ? { look: { path: s.look.path, text: s.look.text } } : {}) });
      this.#open.hidden = false;
    } catch (e) {
      console.warn('fastdraw-diagram: no link to the editor', e);
      this.#open.hidden = true;
    }
  }

  #maxHeight() {
    const m = this.getAttribute('max-height');
    this.#frame.style.maxHeight = m ? (/^\d+(\.\d+)?$/.test(m) ? `${m}px` : m) : 'inherit';
  }

  // ---- the view -----------------------------------------------------------
  #measure() { const r = this.#view.getBoundingClientRect(); this.#W = r.width; this.#H = r.height; }
  #kWidth() { return this.#W / this.#drawn!.w; }
  #kAll() { const d = this.#drawn!; return Math.min(this.#W / d.w, this.#H / d.h); }
  #limits() { const a = this.#kAll(); return { min: Math.min(a, this.#kWidth()) * 0.75, max: Math.max(this.#kWidth() * 8, 4) }; }

  // keeps the diagram on screen: centred along an axis where it fits, else no blank beyond its edges
  #clamp(v: View): View {
    const d = this.#drawn!, { min, max } = this.#limits();
    const k = Math.min(max, Math.max(min, v.k)), sw = this.#W / k, sh = this.#H / k;
    const axis = (p: number, lo: number, len: number, span: number) => (len <= span ? lo + len / 2 - span / 2 : Math.min(lo + len - span, Math.max(lo, p)));
    return { k, x: axis(v.x, d.x, d.w, sw), y: axis(v.y, d.y, d.h, sh) };
  }
  #set(v: View) {
    if (!this.#drawn || !this.#W || !this.#H) return;
    this.#v = this.#clamp(v);
    const { x, y, k } = this.#v, d = this.#drawn;
    this.#view.querySelector('svg')?.setAttribute('viewBox', `${x} ${y} ${this.#W / k} ${this.#H / k}`);
    const pannable = d.w * k > this.#W + 0.5 || d.h * k > this.#H + 0.5;
    this.#view.classList.toggle('pannable', pannable);
    const { min, max } = this.#limits();
    (this.shadowRoot!.querySelector('[data-act=in]') as HTMLButtonElement).disabled = k >= max - 1e-6;
    (this.shadowRoot!.querySelector('[data-act=out]') as HTMLButtonElement).disabled = k <= min + 1e-6;
  }
  // to the target, eased, unless the reader asked for less motion
  #to(v: View) {
    cancelAnimationFrame(this.#anim);
    const target = this.#clamp(v);
    if (motion?.matches) { this.#set(target); return; }
    const from = { ...this.#v }, t0 = performance.now(), T = 180;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / T), e = 1 - (1 - t) ** 3;
      // zoom eased in proportion, so the point held still stays still
      const k = from.k * (target.k / from.k) ** e;
      const fx = (target.x - from.x) / (1 / target.k - 1 / from.k || 1), fy = (target.y - from.y) / (1 / target.k - 1 / from.k || 1);
      const still = Math.abs(target.k - from.k) > 1e-9;
      this.#set(still ? { k, x: from.x + fx * (1 / k - 1 / from.k), y: from.y + fy * (1 / k - 1 / from.k) } : { k, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
      if (t < 1) this.#anim = requestAnimationFrame(step);
    };
    this.#anim = requestAnimationFrame(step);
  }
  #zoomAt(k: number, px: number, py: number, animate = false): void {
    const v = this.#v, { min, max } = this.#limits();
    const k2 = Math.min(max, Math.max(min, k));
    const next = { k: k2, x: v.x + px / v.k - px / k2, y: v.y + py / v.k - py / k2 };
    this.#home = false;
    if (animate) this.#to(next); else this.#set(next);
  }

  /** The first view: the diagram as wide as the element, from its top. In full screen, all of it. */
  #goHome() {
    if (!this.#drawn) return;
    this.#home = true;
    cancelAnimationFrame(this.#anim);
    if (this.#isFull()) { this.#set({ k: this.#kAll(), x: 0, y: 0 }); return; }
    this.#set({ k: this.#kWidth(), x: this.#drawn.x, y: this.#drawn.y });
  }
  /** Zooms by a factor around the middle of the view. */
  zoomBy(f: number) { if (this.#drawn) this.#zoomAt(this.#v.k * f, this.#W / 2, this.#H / 2, true); }
  /** Shows the whole diagram. */
  fit() {
    if (!this.#drawn) return;
    this.#home = !this.#isFull() && this.#kAll() >= this.#kWidth() - 1e-6;
    this.#to({ k: this.#kAll(), x: 0, y: 0 });
  }
  /** Pixels per diagram unit, for tests and for pages that want to know. */
  get zoom(): number { return this.#v.k; }

  #resized() {
    if (!this.#drawn) return;
    const cx = this.#v.x + this.#W / 2 / this.#v.k, cy = this.#v.y + this.#H / 2 / this.#v.k;
    this.#measure();
    if (this.#home) this.#goHome();
    else this.#set({ k: this.#v.k, x: cx - this.#W / 2 / this.#v.k, y: cy - this.#H / 2 / this.#v.k });
  }

  // ---- pointer, wheel, keys ----------------------------------------------
  #local(e: { clientX: number; clientY: number }) { const r = this.#view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  #down(e: PointerEvent) {
    if (!this.#drawn || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.#view.setPointerCapture(e.pointerId);
    this.#pointers.set(e.pointerId, this.#local(e));
    this.#moved = false;
    cancelAnimationFrame(this.#anim);
  }
  #move(e: PointerEvent) {
    const prev = this.#pointers.get(e.pointerId);
    if (!prev) return;
    const p = this.#local(e);
    if (this.#pointers.size === 1) {
      if (!this.#moved && Math.hypot(p.x - prev.x, p.y - prev.y) < 3) return;
      this.#moved = true;
      this.#view.classList.add('dragging');
      this.#home = false;
      this.#set({ k: this.#v.k, x: this.#v.x - (p.x - prev.x) / this.#v.k, y: this.#v.y - (p.y - prev.y) / this.#v.k });
      this.#pointers.set(e.pointerId, p);
      return;
    }
    // two fingers: zoom by how far apart they have moved, around their middle, and follow the middle
    const [a, b] = [...this.#pointers.entries()].slice(0, 2).map(([id, q]) => (id === e.pointerId ? p : q));
    const [a0, b0] = [...this.#pointers.values()].slice(0, 2);
    const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b.x - a.x, b.y - a.y);
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.#pointers.set(e.pointerId, p);
    if (!d0) return;
    this.#moved = true;
    this.#zoomAt(this.#v.k * (d1 / d0), m0.x, m0.y);
    this.#set({ k: this.#v.k, x: this.#v.x - (m1.x - m0.x) / this.#v.k, y: this.#v.y - (m1.y - m0.y) / this.#v.k });
  }
  #up(e: PointerEvent) {
    this.#pointers.delete(e.pointerId);
    if (!this.#pointers.size) this.#view.classList.remove('dragging');
  }
  // only Ctrl/Cmd+wheel (and a trackpad pinch, which arrives as one) zooms; a plain wheel scrolls the page
  #wheel(e: WheelEvent) {
    if (!this.#drawn || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.#H : 1);
    const p = this.#local(e);
    this.#zoomAt(this.#v.k * Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.006), p.x, p.y);
  }
  #key(e: KeyboardEvent) {
    if (!this.#drawn || e.ctrlKey || e.metaKey || e.altKey) return;
    const pan: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key === '+' || e.key === '=') this.zoomBy(1.4);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.4);
    else if (e.key === '0') this.fit();
    else if (pan[e.key] && e.composedPath()[0] === this.#view && this.#view.classList.contains('pannable')) {
      this.#home = false;
      this.#to({ k: this.#v.k, x: this.#v.x + (pan[e.key][0] * 60) / this.#v.k, y: this.#v.y + (pan[e.key][1] * 60) / this.#v.k });
    } else return;
    e.preventDefault();
  }

  // ---- full screen --------------------------------------------------------
  #isFull() { return this.shadowRoot!.fullscreenElement === this.#frame; }
  #toggleFull() {
    if (this.#isFull()) document.exitFullscreen().catch(() => undefined);
    else this.#frame.requestFullscreen().catch((e) => console.warn('fastdraw-diagram: full screen was refused', e));
  }
  #fullChanged() {
    const full = this.#isFull();
    this.#full.innerHTML = full ? ICON.exit : ICON.full;
    this.#full.setAttribute('aria-label', full ? 'Leave full screen' : 'Full screen');
    this.#full.title = full ? 'Leave full screen (Esc)' : 'Full screen';
    if (!this.#drawn) return;
    requestAnimationFrame(() => { this.#measure(); this.#goHome(); });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('fastdraw-diagram')) customElements.define('fastdraw-diagram', FastDrawDiagram);
