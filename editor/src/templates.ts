// Starting points for a new diagram: one per diagram kind, all drawn in the built-in look.
// The diagrams are the checked examples in examples/trial (plus the three classics in
// examples/test); the title and the one-line description come from the kind's guide.

const trial = import.meta.glob('../../examples/trial/*.fdraw', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const classic = import.meta.glob(['../../examples/test/architecture.fdraw', '../../examples/test/flowchart.fdraw', '../../examples/test/sequence.fdraw'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const guides = import.meta.glob('../../guide/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export type Template = { kind: string; title: string; about: string; text: string };

const kindOf = (path: string) => path.replace(/^.*\//, '').replace(/\.\w+$/, '');
const FIRST = ['architecture', 'flowchart', 'sequence'];

function describe(kind: string): { title: string; about: string } {
  const md = Object.entries(guides).find(([p]) => kindOf(p) === kind)?.[1] ?? '';
  const lines = md.split('\n');
  const h1 = (lines.find((l) => l.startsWith('# ')) ?? kind).replace(/^# /, '');
  // "Swimlane diagrams" → "Swimlane diagram"; "Pyramids and funnels" stays as it is
  const title = / and /.test(h1) ? h1 : h1.replace(/s$/, '');
  const para = lines.slice(1).find((l) => l.trim()) ?? '';
  const about = (/^.*?[.!?](?=\s|$)/.exec(para)?.[0] ?? para).replace(/`/g, '');
  return { title, about };
}

export const TEMPLATES: Template[] = Object.entries({ ...classic, ...trial })
  .map(([path, text]) => ({ kind: kindOf(path), text: text.replace(/^look .*\n/m, '') }))
  .map((t) => ({ ...t, ...describe(t.kind) }))
  .sort((a, b) => {
    const ia = FIRST.indexOf(a.kind), ib = FIRST.indexOf(b.kind);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.title.localeCompare(b.title);
  });
