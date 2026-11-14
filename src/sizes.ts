// What `fastdraw sizes` prints: a look's styles, fonts, icons and guidance, as plain text.
// Pure, so the website can put the built-in look's report into llms.txt as well.
import type { Look } from './look.ts';

export function sizesReport(look: Look, missingFonts: string[] = []): string {
  const out: string[] = [];
  for (const i of look.issues) out.push(`look:${i.line}  ${i.level}  ${i.msg}`);
  const rows = [...look.styles.values()];
  for (const kind of ['shape', 'line', 'text'] as const) {
    out.push(`\n${kind} styles`);
    for (const s of rows.filter((r) => r.kind === kind)) {
      const p = s.props;
      const bits: string[] = [];
      if (kind === 'shape') bits.push(`shape=${p.shape ?? 'rect'}`, p.shape === 'table' ? 'sizes itself from its rows' : p.shape === 'polygon' ? 'sized by its points' : p.shape === 'chart' ? 'always give WxH: the plot area' : p.size ? `default size ${p.size}` : 'no default size: always give WxH', p.layer === 'back' ? 'drawn behind everything' : '');
      if (kind === 'line') bits.push(`route=${p.route ?? 'ortho'}`, p.dash ? `dash=${p.dash}` : 'solid', `stroke=${p.stroke ?? 'muted'}`);
      if (kind === 'text') bits.push(`font=${p.font ?? 'sans'}`, `size=${p.size ?? 12}`, p.caps === '1' ? 'caps' : '');
      if (p.use) bits.push(`use: ${p.use}`);
      out.push(`  ${s.name.padEnd(12)} ${bits.filter(Boolean).join(' · ')}`);
    }
  }
  out.push('\nfonts');
  for (const [role, fam] of look.fonts) out.push(`  ${role.padEnd(12)} ${fam}${missingFonts.includes(fam) ? '   (no font file found: will fall back)' : ''}`);
  const own = [...look.images.keys()];
  if (own.length) out.push(`\nicons from the look's folders (${own.length}; "fastdraw icons <look> [word]" lists or searches them)\n  ${own.slice(0, 60).join(', ')}${own.length > 60 ? ', ...' : ''}`);
  out.push(`\n${own.length ? 'built-in icons' : 'icons'} (icon=name on any box, or a box of style "icon")\n  ${[...look.icons.keys()].join(', ')}`);
  if (look.guidance.length) { out.push('\nguidance from this look'); for (const g of look.guidance) out.push(`  - ${g}`); }
  return out.join('\n');
}
