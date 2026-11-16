// The heading and first sentence of a kind's guide: what that kind of diagram shows. Used for
// `fastdraw guide list` and the site's llms.txt, so an agent choosing a kind sees what each one is for.
export function about(md: string, name: string): { title: string; line: string } {
  const lines = md.split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) ?? name).replace(/^# /, '');
  const para = lines.slice(1).find((l) => l.trim()) ?? '';
  return { title, line: (/^.*?[.!?](?=\s|$)/.exec(para)?.[0] ?? para).replace(/`/g, '') };
}
