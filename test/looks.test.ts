import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUNDLED_LOOK_NAMES, bundledLook, bundledLookSource, defaultLook } from '../src/look.ts';
import { DEFAULT_LOOK } from '../src/defaultLook.ts';
import { parseStatements } from '../src/parse.ts';
import { buildScene } from '../src/scene.ts';
import { renderSvg } from '../src/render.ts';
import { check } from '../src/check.ts';
import { parseLook, color } from '../src/look.ts';
// @ts-expect-error a plain JS tool
import { generate } from '../tools/bundle-looks.mjs';

const looks = () => [['built-in', defaultLook()] as const, ...BUNDLED_LOOK_NAMES.map((n) => [n, bundledLook(n)!] as const)];

test('the bundled looks match looks/*.look (run node tools/bundle-looks.mjs after editing one)', () => {
  assert.equal(readFileSync(new URL('../src/bundledLooks.ts', import.meta.url), 'utf8'), generate());
});

test('every look parses cleanly', () => {
  for (const [name, l] of looks()) assert.deepEqual(l.issues, [], name);
});

test('every look defines the same styles, so switching looks never drops one to a plain style', () => {
  // the styles a look writes out itself, not the plain ones every look falls back on
  const declared = (src: string) => new Set(parseStatements(src).filter((s) => s.toks[0]?.v === 'style').map((s) => s.toks[1]!.v));
  const sets = [['built-in', declared(DEFAULT_LOOK)] as const, ...BUNDLED_LOOK_NAMES.map((n) => [n, declared(bundledLookSource(n)!)] as const)];
  const all = new Set(sets.flatMap(([, d]) => [...d]));
  for (const [name, d] of sets) {
    const missing = [...all].filter((s) => !d.has(s));
    assert.deepEqual(missing, [], `${name} look lacks ${missing.join(', ')}`);
  }
  // and a style keeps its kind across looks, so a box stays a box
  for (const s of all) assert.equal(new Set(looks().map(([, l]) => l.styles.get(s)!.kind)).size, 1, s);
});

test('look <name> uses a bundled look; an unknown name or missing file is an error naming the choices', () => {
  const body = 'a: sticky "Idea" at 40,40\nb: node "B" at 240,40\na -> b';
  for (const n of BUNDLED_LOOK_NAMES) {
    const sc = buildScene(`look ${n}\n${body}`, null);
    assert.equal(sc.issues.filter((i) => i.level === 'error').length, 0, n);
    assert.equal(sc.look, bundledLook(n));
    assert.ok(renderSvg(sc).length > 0);
  }
  assert.match(buildScene(`look nope\n${body}`, null).issues[0]!.msg, new RegExp(`no look named nope; named looks: ${BUNDLED_LOOK_NAMES.join(', ')}, or give a path`));
  assert.match(buildScene(`look "./x.look"\n${body}`, null).issues[0]!.msg, /look file not found/);
  // a bare name wins over whatever look a caller passed in
  assert.equal(buildScene(`look sketch\n${body}`, defaultLook()).look, bundledLook('sketch'));
});

// ---- the six style looks: each is a way of drawing, built from look properties any look can use ----

const SAMPLE = 'z: zone "Zone" at 20,20 400x300\na: node "A" at 40,60\nb: focal "B" at 40,220\nc: store "C" at 240,60\na -> b "calls" style=primary\na -> c\ntext "Title" at 40,360 style=h1\n';
const draw = (look: string, body = SAMPLE) => renderSvg(buildScene(`look ${look}\n${body}`, null));

test('the style looks ship, and each draws the thing it is named for', () => {
  for (const n of ['shade', 'engraved', 'keys', 'transit', 'offset', 'listing']) assert.ok(BUNDLED_LOOK_NAMES.includes(n), n);
  // shade: a hatched shadow, the box shape again 5px down and right, filled with a pattern
  assert.match(draw('shade'), /<pattern id="fd-hatch-\d+"[^>]*rotate\(-41\)/);
  assert.match(draw('shade'), /<rect x="45" y="65" width="144" height="64" rx="2" fill="url\(#fd-hatch-\d+\)" stroke="none"\/>/);
  // engraved: a second rule inside the outline, and the main line drawn as two rails
  assert.match(draw('engraved'), /<rect x="43\.5" y="63\.5" width="137" height="57" fill="none" stroke="[^"]+" stroke-width="0\.5"\/>/);
  assert.equal((draw('engraved').match(/<path d="M 112,124 L 112,[\d.]+" fill="none"/g) ?? []).length, 2);
  // keys: every box stands on a slab 7px below it
  assert.match(draw('keys'), /<rect x="40" y="67" width="144" height="64" rx="12" fill="#[0-9a-f]{6}" stroke="[^"]+" stroke-width="2"\/>\n<rect x="40" y="60" width="144" height="64" rx="12"/);
  // transit: a route has a casing under it and starts at a stop
  assert.match(draw('transit'), /stroke-width="11" stroke-linecap="round" stroke-linejoin="round"\/>\n<path [^>]*stroke-width="6"/);
  assert.match(draw('transit'), /<circle cx="184" cy="92" r="6" fill="#ffffff" stroke="#14213d"/);
  // offset: the fill is printed out of register and overprints; the page has grain
  assert.match(draw('offset'), /<rect x="45" y="225" width="144" height="64" fill="[^"]+" stroke="none" style="mix-blend-mode:multiply"\/>/);
  assert.match(draw('offset'), /<filter id="fd-grain"/);
  // listing: striped paper with sprocket holes, and a plus on each corner of a box
  assert.match(draw('listing'), /<pattern id="fd-bars" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="32"/);
  assert.match(draw('listing'), /<pattern id="fd-feed-l" [^>]*><circle cx="13" cy="12" r="4\.2"/);
  // the page dressing does not grow with the picture: a diagram a million pixels tall draws no more elements
  const tall = (y: number) => draw('listing', `a: node "A" at 40,40\nb: node "B" at 40,${y}\n`).split('<').length;
  assert.equal(tall(1_000_000), tall(400));
  assert.match(draw('listing'), /<path d="M 36\.5,60 H 43\.5 M 40,56\.5 V 63\.5"/);
  // none of the page dressing is drawn on a transparent export
  for (const n of ['offset', 'listing']) assert.doesNotMatch(renderSvg(buildScene(`look ${n}\n${SAMPLE}`, null), undefined, { background: false }), /fd-page|fd-grain/);
});

test('the style looks keep the built-in look\'s type sizes, so a diagram laid out for it still fits', () => {
  const body = 'a: node "Publish Dashboard" sub="merge · deploy · verify" at 40,40 144x64\nb: node "B" at 40,200 144x64\na -> b "restrict" lpos=170,171\n';
  const warns = (look: string) => check(buildScene(look ? `look ${look}\n${body}` : body, null)).filter((i) => i.level === 'warn').map((i) => i.msg);
  assert.deepEqual(warns(''), []);
  for (const n of ['shade', 'engraved', 'keys', 'transit', 'offset', 'listing']) assert.deepEqual(warns(n), [], n);
});

test('text a diagram lays on a box stays readable when the look fills that box dark', () => {
  const body = 'f: focal at 40,40 200x80\ntext "Assess damage" at 60,70 size=12 weight=600\ntext "mobile app" at 60,90 size=9 color=soft\nn: node at 40,200 200x80\ntext "Plain" at 60,230\n';
  // on a dark subject the text takes the box's own light colours; on a plain box it is left alone
  const sc = buildScene(`look engraved\n${body}`, null), svg = renderSvg(sc);
  assert.match(svg, /fill="#f3eee2" font-weight="600">Assess damage</);
  assert.doesNotMatch(svg, /fill="#f3eee2"[^>]*>Plain</);
  assert.deepEqual(check(sc).filter((i) => /cannot be read/.test(i.msg)), []);
  // a small chip with no fill, sitting on the subject, follows it too
  assert.match(draw('transit', 'f: focal "Core" at 40,40 200x80\nchip: rect "4 in" at 180,48 40x16 fill=none stroke=ink/0.4 title.size=8 overlap=ok\n'), /fill="#ffffff"[^>]*>4 in</);
  // the built-in look draws exactly what the diagram says: its subject is a tint, nothing needs changing
  assert.match(renderSvg(buildScene(body, null)), /fill="#0f172a" font-weight="600">Assess damage</);
  // and a fill the diagram chose itself is not second-guessed: the checker reports it instead
  const own = buildScene('f: focal "A" at 40,40 160x80 fill=accent\ntext "case" at 60,100 size=9 color=accent\n', null);
  assert.match(check(own).map((i) => i.msg).join('\n'), /almost the same colour as f behind it/);
});

test('look properties: depth lands lines on the slab, plates, stops, echo and caption placement', () => {
  const look = (extra: string) => parseLook(`color paper #ffffff\ncolor ink #111111\ncolor muted #555555\nfont sans "Geist"\nfont mono "Geist Mono"\nfont serif "Newsreader"\n${extra}\n`);
  const svg = (extra: string, body: string) => renderSvg(buildScene(body, look(extra)));
  // depth: a line coming up into the bottom edge stops on the slab, 6px lower; one into the top is untouched
  const two = 'a: node at 40,40\nb: node at 40,200\nb.top -> a.bottom\n';
  const flat = svg('style node shape=rect size=120x60 fill=#ffffff stroke=ink\nstyle arrow line stroke=ink sw=1 route=ortho', two);
  const deep = svg('style node shape=rect size=120x60 fill=#ffffff stroke=ink depth=6 depth.fill=#cccccc\nstyle arrow line stroke=ink sw=1 route=ortho', two);
  assert.match(flat, /<polygon points="100,100 /);
  assert.match(deep, /<polygon points="100,106 /);
  assert.match(deep, /<rect x="40" y="46" width="120" height="60" fill="#cccccc" stroke="#111111" stroke-width="1"\/>/);
  // a label plate, a stop at the tail, a scaled head, round caps, a casing and a second rail
  const line = svg('style node shape=rect size=120x60 fill=#ffffff stroke=ink\nstyle arrow line stroke=ink sw=4 route=ortho tail=stop stop.color=#ff0000 head.size=2 cap=round casing=#ffffff casing.width=2 double=#ffffff double.sw=1 label.fill=#eeeeee label.border=ink label.pad=4 label.radius=6',
    'a: node at 40,40\nb: node at 400,40\na -> b "go"\n');
  assert.match(line, /<path d="[^"]+" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"\/>\n<path d="[^"]+" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"\/>\n<path d="[^"]+" fill="none" stroke="#ffffff" stroke-width="1"/);
  assert.match(line, /<circle cx="160" cy="70" r="5" fill="#ffffff" stroke="#ff0000"/);
  assert.match(line, /rx="6" fill="#eeeeee" stroke="#111111" stroke-width="1"\/>\n<text [^>]*>GO</);
  // echo prints text twice; a caption can leave the edge and lose its patch
  assert.match(svg('style h1 text size=20 color=ink echo=#ff0000 echo.dx=2 echo.dy=2', 'text "Hi" at 40,40 style=h1\n'), /<text x="42" y="42" [^>]*fill="#ff0000">Hi<\/text>\n<text x="40" y="40" [^>]*fill="#111111">Hi</);
  const cap = svg('style zone shape=rect fill=none stroke=ink layer=back title.pos=top title.dy=-12 title.fill=none title.size=10', 'z: zone "Area" at 40,40 200x100\n');
  assert.doesNotMatch(cap, /<rect [^>]*height="14" rx="2"/);
  assert.match(cap, /<text x="140" y="42\.6"/);
  // the new marker is known to the language, and unknown look values raise no issue
  assert.deepEqual(look('style arrow line stroke=ink tail=stop\nstyle node shape=rect shade=ink depth=4 inner=ink corners=plus offset=3,3 blend=multiply halftone=ink').issues, []);
});

test('a zone caption has a plate as wide as its words, in the zone\'s own colour when it sits inside', async () => {
  const { measureText } = await import('../src/scene.ts');
  const plates = (src: string) => [...renderSvg(buildScene(src, null)).matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="\d+" rx="2" fill="([^"]+)"\/>/g)].map((m) => ({ x: +m[1], w: +m[2], fill: m[3] }));
  // measured in the font as drawn: narrow letters, dots and slashes count for what they are (it was 152 wide)
  const look = defaultLook();
  assert.ok(Math.abs(measureText(look, '1. The project on disk', 11, 'sans', 600, 0) - 113) < 2);
  assert.ok(measureText(look, 'iiii', 11, 'sans', 600, 0) < measureText(look, 'MMMM', 11, 'sans', 600, 0) / 2);
  assert.equal(measureText(look, 'ab', 10, 'mono', 400, 0), 12);
  assert.equal(measureText(look, 'ab', 10, 'mono', 400, 0.1), 13); // spacing between letters
  for (const lk of ['', 'look night\n']) {
    const [paper, tint] = plates(`${lk}z: zone ".pz/state/ · outlives runs" at 40,40 300x120 fill=accent/0.05 stroke=accent\n`);
    assert.equal(paper.w, Math.ceil(measureText(look, '.pz/state/ · outlives runs', 11, 'sans', 600, 0) + 12));
    assert.equal(paper.x, 52); // left-aligned: the words start 6px into the plate, 18px into the zone
    // inside the zone the plate is paper with the zone's tint over it, so it reads as the zone itself
    assert.equal(tint.w, paper.w);
    // (on Night the tint is mixed to keep its hue, so it is not a plain 0.05 alpha; it is the zone's own fill)
    assert.equal(tint.fill, color(lk ? bundledLook('night')! : look, 'accent/0.05'));  }
  // a caption on the edge keeps a plain paper plate, its tint would show outside the zone
  const edge = renderSvg(buildScene('look engraved\nz: zone "Area" at 40,40 300x120\n', null));
  assert.equal([...edge.matchAll(/rx="2"/g)].length, 1);
  // a font named after an Object property is just an unknown family, measured as the bundled one for its role
  for (const name of ['constructor', '__proto__', 'toString']) {
    const odd = parseLook(`font sans "${name}"\nfont mono "${name}"\nfont serif "${name}"\nstyle zone shape=rect title.pos=top\n`);
    assert.equal(measureText(odd, 'ab', 10, 'sans', 600, 0), measureText(look, 'ab', 10, 'sans', 600, 0), name);
    assert.equal(measureText(odd, 'ab', 10, 'mono', 400, 0), 12, name);
    assert.ok(measureText(odd, 'ab', 10, 'serif', 400, 0) > 0, name);
    assert.match(renderSvg(buildScene('z: zone "Area" at 40,40 200x100\n', odd)), /Area/);
  }
});

test('a tag on a shape of any size is placed in bounded time', () => {
  // a diamond two billion pixels across: placing its corner tag samples the outline, and that sampling must not
  // grow with the shape (it used to run out of memory)
  const t0 = performance.now();
  const svg = renderSvg(buildScene('d: decision "Huge" at 0,0 2000000000x2000000000 tag=A\n', null));
  assert.ok(svg.includes('>A<'));
  assert.ok(performance.now() - t0 < 2000, `took ${Math.round(performance.now() - t0)}ms`);
  // and an ordinary one is still moved clear of its outline, exactly as before
  assert.match(renderSvg(buildScene('d: decision "Ship?" at 40,40 200x96 tag=Q\n', null)), />Q</);
});

// A colour as drawn: an rgba laid over an opaque backdrop, as linear sRGB and OKLab.
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const linear = (v: number) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
function drawn(c: string, over: string): { lin: number[]; lab: [number, number, number] } {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c)!, b = hexRgb(over), a = +m[4];
  const [r, g, bl] = [1, 2, 3].map((i) => linear(+m[i] * a + b[i - 1] * (1 - a)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
  return { lin: [r, g, bl], lab: [0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s] };
}
// The hue (degrees) and chroma of a colour as drawn, in OKLCH.
function drawnLch(c: string, over: string): [number, number] {
  const [, A, B] = drawn(c, over).lab;
  return [((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, Math.hypot(A, B)];
}
// WCAG contrast ratio between two linear-sRGB colours
const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (x: number[], y: number[]) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
const hueGap = (x: number, y: number) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));

test('a tint keeps its hue on a dark page: amber/0.1 over navy is a dark amber, not grey', () => {
  const night = bundledLook('night')!, paper = night.colors.get('paper')!, card = night.colors.get('card')!;
  for (const name of ['amber', 'violet', 'rose', 'teal']) {
    const [hue] = drawnLch(`rgba(${[1, 3, 5].map((i) => parseInt(night.colors.get(name)!.slice(i, i + 2), 16))},1)`, paper);
    for (const [over, under] of [[undefined, paper], ['card', card]] as const) {
      const [h, c] = drawnLch(color(night, `${name}/0.1`, over), under);
      assert.ok(hueGap(h, hue) < 6, `${name}/0.1 over ${under} has hue ${h.toFixed(0)}, the tint's is ${hue.toFixed(0)}`);
      assert.ok(c > 0.012, `${name}/0.1 over ${under} is nearly grey (chroma ${c.toFixed(3)})`);
    }
  }
  // grey tints are a plain blend, as before
  assert.equal(color(night, 'ink/0.03'), 'rgba(226,232,240,0.03)');
});

test('low tints on a dark page stay told apart: each keeps its hue, distinct from the others, with ink readable on it', () => {
  const night = bundledLook('night')!, names = ['rose', 'amber', 'teal', 'violet', 'link'];
  const ink = drawn('rgba(0,0,0,0)', night.colors.get('ink')!).lin;
  for (const over of ['paper', 'card']) {
    const under = night.colors.get(over)!;
    const seen = names.map((name) => {
      const c = color(night, `${name}/0.1`, over === 'paper' ? undefined : over);
      const [hue] = drawnLch(`rgba(${hexRgb(night.colors.get(name)!)},1)`, under), [h] = drawnLch(c, under);
      assert.ok(hueGap(h, hue) < 6, `${name}/0.1 over ${over} has hue ${h.toFixed(0)}, the tint's is ${hue.toFixed(0)}`);
      const d = drawn(c, under);
      assert.ok(contrast(d.lin, ink) >= 4.5, `ink on ${name}/0.1 over ${over}: contrast ${contrast(d.lin, ink).toFixed(2)}`);
      return [name, d.lab] as const;
    });
    for (const [i, [a, x]] of seen.entries()) for (const [b, y] of seen.slice(i + 1)) {
      const dE = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
      assert.ok(dE >= 0.04, `${a}/0.1 and ${b}/0.1 over ${over} are only ${dE.toFixed(3)} apart in OKLab`);
    }
  }
});

test('tints on a light page are a plain alpha blend, unchanged; canvas tint= chooses either way', () => {
  for (const [name, look] of looks()) if (name !== 'night') assert.equal(color(look, '#fbbf24/0.1'), 'rgba(251,191,36,0.1)', name);
  assert.equal(color(parseLook('canvas paper=#0b1226 tint=alpha'), '#fbbf24/0.1'), 'rgba(251,191,36,0.1)');
  assert.notEqual(color(parseLook('canvas paper=#ffffff tint=hue'), '#fbbf24/0.1'), 'rgba(251,191,36,0.1)');
});

test('row and cell tints in a table are mixed against the table\'s fill', () => {
  const svg = renderSvg(buildScene('look night\nt: table "t" at 0,0\n  | a "x" fill=amber/0.15\n  | b "y" fill.1=amber/0.15\n', null));
  const tint = color(bundledLook('night')!, 'amber/0.15', '#131c38');
  assert.notEqual(tint, color(bundledLook('night')!, 'amber/0.15'));
  assert.equal(svg.split(`fill="${tint}"`).length - 1, 2, 'the row and the cell tint use the colour mixed over the card');
});
