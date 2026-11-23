// A layered layout for imported graphs (Mermaid flowcharts, state machines, ER and class diagrams): boxes in ranks
// along the flow, ordered to cross few lines, spread so each sits near what it connects to. A group (a subgraph, a
// composite state) is laid out on its own first and then placed in its parent as one block, so a group's zone holds
// exactly its own boxes and nothing else.

export type Dir = 'TB' | 'BT' | 'LR' | 'RL';
export type Box = { x: number; y: number; w: number; h: number };
export interface LayoutNode { id: string; w: number; h: number; group: string | null }
export interface LayoutGroup { id: string; parent: string | null; dir?: Dir }
// from/to are node or group ids. label: the size of the edge's label, which the gap between ranks must hold.
export interface LayoutEdge { from: string; to: string; minlen?: number; label?: { w: number; h: number } }
export interface LayoutIn {
  nodes: LayoutNode[]; edges: LayoutEdge[]; groups: LayoutGroup[]; dir: Dir;
  rankGap: number; sibGap: number;
  // room inside a group around its content: above (for its caption), at the sides and below
  pad: { top: number; side: number; bottom: number };
}
export interface LayoutOut { boxes: Map<string, Box>; w: number; h: number }

const snap = (v: number) => Math.round(v / 4) * 4;

interface Item { id: string; w: number; h: number; dummy?: boolean }
interface Placed { w: number; h: number; pos: Map<string, { x: number; y: number }> }

export function layered(input: LayoutIn): LayoutOut {
  const groups = new Map(input.groups.map((g) => [g.id, g]));
  const nodeGroup = new Map(input.nodes.map((n) => [n.id, n.group]));
  // the chain of groups something sits in, innermost first; a group's chain starts with its parent
  const chain = (id: string): (string | null)[] => {
    const out: (string | null)[] = [];
    let g = groups.has(id) ? groups.get(id)!.parent : nodeGroup.get(id) ?? null;
    while (g !== null && g !== undefined) { out.push(g); g = groups.get(g)?.parent ?? null; }
    out.push(null);
    return out;
  };
  // what stands for `id` among the items of `scope`: itself, or the group of that scope it sits in
  const itemIn = (id: string, scope: string | null): string | null => {
    const c = chain(id);
    if (c[0] === scope) return id;
    for (let i = 0; i < c.length - 1; i++) if (c[i + 1] === scope) return c[i]!;
    return null;
  };
  const boxes = new Map<string, Box>();
  const laid = new Map<string | null, Placed>();

  const layScope = (scope: string | null, dir: Dir): Placed => {
    const items: Item[] = [];
    for (const g of input.groups) if (g.parent === scope) {
      const inner = layScope(g.id, g.dir ?? dir);
      items.push({ id: g.id, w: inner.w + 2 * input.pad.side, h: inner.h + input.pad.top + input.pad.bottom });
    }
    for (const n of input.nodes) if (n.group === scope) items.push({ id: n.id, w: n.w, h: n.h });
    // keep the order things were written in: groups by where their first member was written
    const firstSeen = new Map<string, number>();
    input.nodes.forEach((n, i) => { const it = itemIn(n.id, scope); if (it && !firstSeen.has(it)) firstSeen.set(it, i); });
    items.sort((a, b) => (firstSeen.get(a.id) ?? 1e9) - (firstSeen.get(b.id) ?? 1e9));
    const edges: LayoutEdge[] = [];
    for (const e of input.edges) {
      const a = itemIn(e.from, scope), b = itemIn(e.to, scope);
      if (a && b && a !== b) edges.push({ ...e, from: a, to: b });
    }
    const placed = layItems(items, edges, dir, input.rankGap, input.sibGap);
    laid.set(scope, placed);
    return placed;
  };
  const top = layScope(null, input.dir);
  // positions from the outside in: a group's items are placed inside its box, under its caption
  const place = (scope: string | null, ox: number, oy: number) => {
    for (const [id, p] of laid.get(scope)!.pos) {
      const x = ox + p.x, y = oy + p.y;
      if (groups.has(id)) {
        const inner = laid.get(id)!;
        boxes.set(id, { x, y, w: inner.w + 2 * input.pad.side, h: inner.h + input.pad.top + input.pad.bottom });
        place(id, x + input.pad.side, y + input.pad.top);
      } else {
        const n = input.nodes.find((m) => m.id === id)!;
        boxes.set(id, { x, y, w: n.w, h: n.h });
      }
    }
  };
  place(null, 0, 0);
  return { boxes, w: top.w, h: top.h };
}

// One scope: items (boxes, or groups already laid out) and the edges between them.
function layItems(items: Item[], edges: LayoutEdge[], dir: Dir, rankGap: number, sibGap: number): Placed {
  const pos = new Map<string, { x: number; y: number }>();
  if (!items.length) return { w: 0, h: 0, pos };
  const across = dir === 'LR' || dir === 'RL';
  // work as if the flow ran top to bottom: thick is an item's size along the flow, broad its size across it
  const thick = (it: Item) => (across ? it.w : it.h), broad = (it: Item) => (across ? it.h : it.w);
  const byId = new Map(items.map((it) => [it.id, it]));

  // 1. break cycles: an edge back to something still being walked is turned round
  const out = new Map<string, number[]>(items.map((it) => [it.id, []]));
  edges.forEach((e, i) => { if (e.from !== e.to) out.get(e.from)!.push(i); });
  const state = new Map<string, number>(), back = new Set<number>();
  const walk = (v: string) => {
    state.set(v, 1);
    for (const i of out.get(v)!) {
      const w = edges[i]!.to, s = state.get(w) ?? 0;
      if (s === 1) back.add(i); else if (s === 0) walk(w);
    }
    state.set(v, 2);
  };
  for (const it of items) if (!state.get(it.id)) walk(it.id);
  type DEdge = { from: string; to: string; minlen: number; label?: { w: number; h: number } };
  const dag: DEdge[] = edges.flatMap((e, i) => e.from === e.to ? [] : [back.has(i)
    ? { from: e.to, to: e.from, minlen: e.minlen ?? 1, label: e.label }
    : { from: e.from, to: e.to, minlen: e.minlen ?? 1, label: e.label }]);

  // 2. ranks: each item as far along as its longest way in, then sources pulled up to just before what they lead to
  const rank = new Map<string, number>(items.map((it) => [it.id, 0]));
  const preds = new Map<string, DEdge[]>(items.map((it) => [it.id, []])), succs = new Map<string, DEdge[]>(items.map((it) => [it.id, []]));
  for (const e of dag) { preds.get(e.to)!.push(e); succs.get(e.from)!.push(e); }
  const indeg = new Map(items.map((it) => [it.id, preds.get(it.id)!.length]));
  const topo: string[] = [], queue = items.filter((it) => !indeg.get(it.id)).map((it) => it.id);
  while (queue.length) {
    const v = queue.shift()!;
    topo.push(v);
    for (const e of succs.get(v)!) {
      rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(v)! + e.minlen));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (!indeg.get(e.to)) queue.push(e.to);
    }
  }
  for (const v of [...topo].reverse()) {
    if (preds.get(v)!.length || !succs.get(v)!.length) continue;
    rank.set(v, Math.min(...succs.get(v)!.map((e) => rank.get(e.to)! - e.minlen)));
  }
  const minRank = Math.min(...rank.values());
  for (const [k, r] of rank) rank.set(k, r - minRank);
  const nRanks = Math.max(...rank.values()) + 1;

  // 3. a long edge passes through one placeholder per rank it crosses, so the ordering keeps a lane free for it
  const layers: Item[][] = Array.from({ length: nRanks }, () => []);
  for (const it of items) layers[rank.get(it.id)!]!.push(it);
  const adj: [string, string][] = []; // edges between neighbouring ranks, upper end first
  let dn = 0;
  for (const e of dag) {
    let prev = e.from;
    for (let r = rank.get(e.from)! + 1; r < rank.get(e.to)!; r++) {
      const d: Item = { id: `\u0000${dn++}`, w: 0, h: 0, dummy: true };
      byId.set(d.id, d); rank.set(d.id, r); layers[r]!.push(d);
      adj.push([prev, d.id]); prev = d.id;
    }
    adj.push([prev, e.to]);
  }
  const up = new Map<string, string[]>(), down = new Map<string, string[]>();
  for (const [a, b] of adj) {
    (down.get(a) ?? down.set(a, []).get(a)!).push(b);
    (up.get(b) ?? up.set(b, []).get(b)!).push(a);
  }

  // 4. order within ranks: barycentre sweeps, keeping the order with the fewest crossings
  const index = new Map<string, number>();
  const reindex = () => layers.forEach((l) => l.forEach((it, i) => index.set(it.id, i)));
  reindex();
  const crossings = () => {
    let c = 0;
    for (let r = 0; r + 1 < nRanks; r++) {
      const es: [number, number][] = [];
      for (const it of layers[r]!) for (const b of down.get(it.id) ?? []) es.push([index.get(it.id)!, index.get(b)!]);
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++)
        if ((es[i]![0] - es[j]![0]) * (es[i]![1] - es[j]![1]) < 0) c++;
    }
    return c;
  };
  let best = layers.map((l) => [...l]), bestC = crossings();
  for (let iter = 0; iter < 24 && bestC > 0; iter++) {
    const downward = iter % 2 === 0;
    for (let k = 1; k < nRanks; k++) {
      const r = downward ? k : nRanks - 1 - k;
      const nb = downward ? up : down;
      const bary = new Map<string, number>();
      for (const it of layers[r]!) {
        const ns = nb.get(it.id) ?? [];
        bary.set(it.id, ns.length ? ns.reduce((s, n) => s + index.get(n)!, 0) / ns.length : index.get(it.id)!);
      }
      layers[r]!.sort((a, b) => bary.get(a.id)! - bary.get(b.id)!);
      layers[r]!.forEach((it, i) => index.set(it.id, i));
    }
    const c = crossings();
    if (c < bestC) { bestC = c; best = layers.map((l) => [...l]); }
  }
  best.forEach((l, r) => { layers[r] = l; });
  reindex();

  // 5. across the flow: each item near the middle of what it connects to, never closer to its neighbour than the gap
  const centre = new Map<string, number>();
  const sep = (a: Item, b: Item) => (broad(a) + broad(b)) / 2 + (a.dummy && b.dummy ? 16 : a.dummy || b.dummy ? sibGap / 2 : sibGap);
  for (const l of layers) {
    let c = 0;
    l.forEach((it, i) => { if (i) c += sep(l[i - 1]!, it); centre.set(it.id, c); });
  }
  const widest = Math.max(...layers.map((l) => (l.length ? centre.get(l[l.length - 1]!.id)! + broad(l[l.length - 1]!) / 2 + broad(l[0]!) / 2 : 0)));
  for (const l of layers) {
    if (!l.length) continue;
    const span = centre.get(l[l.length - 1]!.id)! + broad(l[l.length - 1]!) / 2 + broad(l[0]!) / 2;
    const shift = (widest - span) / 2 + broad(l[0]!) / 2;
    for (const it of l) centre.set(it.id, centre.get(it.id)! + shift);
  }
  // the closest positions to the wished-for ones that keep the order and the gaps (pool adjacent violators)
  const settle = (l: Item[], want: number[]) => {
    const off: number[] = [0];
    for (let i = 1; i < l.length; i++) off.push(off[i - 1]! + sep(l[i - 1]!, l[i]!));
    const blocks: { sum: number; n: number }[] = [];
    for (let i = 0; i < l.length; i++) {
      blocks.push({ sum: want[i]! - off[i]!, n: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2]!.sum / blocks[blocks.length - 2]!.n > blocks[blocks.length - 1]!.sum / blocks[blocks.length - 1]!.n) {
        const b = blocks.pop()!; blocks[blocks.length - 1]!.sum += b.sum; blocks[blocks.length - 1]!.n += b.n;
      }
    }
    let i = 0;
    for (const b of blocks) for (let k = 0; k < b.n; k++, i++) centre.set(l[i]!.id, b.sum / b.n + off[i]!);
  };
  const mean = (ids: string[] | undefined) => (ids?.length ? ids.reduce((s, n) => s + centre.get(n)!, 0) / ids.length : undefined);
  for (let iter = 0; iter < 12; iter++) {
    const downward = iter % 2 === 0, both = iter >= 8;
    for (let k = 0; k < nRanks; k++) {
      const r = downward ? k : nRanks - 1 - k, l = layers[r]!;
      settle(l, l.map((it) => {
        const ns = both ? [...(up.get(it.id) ?? []), ...(down.get(it.id) ?? [])] : (downward ? up : down).get(it.id);
        return mean(ns) ?? centre.get(it.id)!;
      }));
    }
  }

  // small jogs straightened: an item with one neighbour on a side lines up with it when it is nearly in line already
  for (const nb of [up, down]) for (let k = 0; k < nRanks; k++) {
    const l = layers[nb === up ? k : nRanks - 1 - k]!;
    settle(l, l.map((it) => {
      const ns = nb.get(it.id) ?? [], c = centre.get(it.id)!;
      if (ns.length !== 1) return c;
      const t = centre.get(ns[0]!)!;
      return Math.abs(t - c) < 40 ? t : c;
    }));
  }

  // 6. along the flow: each rank as thick as its thickest item, with room between ranks for the labels that cross
  const bandThick = layers.map((l) => Math.max(0, ...l.filter((it) => !it.dummy).map(thick)));
  const gapAfter = Array.from({ length: Math.max(0, nRanks - 1) }, () => rankGap);
  for (const e of dag) {
    if (!e.label) continue;
    const r = rank.get(e.from)!;
    if (r >= nRanks - 1) continue;
    const need = across ? e.label.w + 48 : e.label.h + 40;
    gapAfter[r] = Math.max(gapAfter[r]!, need);
  }
  const bandStart: number[] = [];
  let at = 0;
  for (let r = 0; r < nRanks; r++) { bandStart.push(at); at += bandThick[r]! + (gapAfter[r] ?? 0); }
  const total = at;
  const minC = Math.min(...items.map((it) => centre.get(it.id)! - broad(it) / 2));
  let w = 0, h = 0;
  for (const it of items) {
    const r = rank.get(it.id)!;
    let along = bandStart[r]! + (bandThick[r]! - thick(it)) / 2;
    if (dir === 'BT' || dir === 'RL') along = total - along - thick(it);
    const acrossPos = centre.get(it.id)! - broad(it) / 2 - minC;
    const p = across ? { x: snap(along), y: snap(acrossPos) } : { x: snap(acrossPos), y: snap(along) };
    pos.set(it.id, p);
    w = Math.max(w, p.x + it.w); h = Math.max(h, p.y + it.h);
  }
  return { w, h, pos };
}
