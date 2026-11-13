// Plain-text files the website serves for agents: llms.txt (how to use FastDraw, the language guide
// and the built-in look's styles) and every kind's guide under /guide/. Built from guide/ so the site
// and `fastdraw guide` never disagree.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defaultLook } from '../src/look.ts';
import { sizesReport } from '../src/sizes.ts';

const SITE = 'https://fastdraw.dev';

// The heading and first sentence of a guide, for the list of kinds.
function about(md: string, name: string): { title: string; line: string } {
  const lines = md.split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) ?? name).replace(/^# /, '');
  const para = lines.slice(1).find((l) => l.trim()) ?? '';
  return { title, line: (/^.*?[.!?](?=\s|$)/.exec(para)?.[0] ?? para).replace(/`/g, '') };
}

export function siteFiles(root: string): Map<string, string> {
  const dir = join(root, 'guide');
  const names = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  const files = new Map<string, string>();
  for (const n of names) files.set(`guide/${n}.md`, readFileSync(join(dir, `${n}.md`), 'utf8'));

  const kinds = names.filter((n) => n !== 'guide').map((n) => {
    const a = about(files.get(`guide/${n}.md`)!, n);
    return `- [${a.title}](${SITE}/guide/${n}.md): ${a.line}`;
  });
  files.set('llms.txt', `# FastDraw

> FastDraw diagrams are small text files (\`.fdraw\`) that an AI agent writes, placing every element itself, and a person edits afterwards on a canvas in the browser editor at ${SITE}/edit/. Edits there are saved back into the same text.

How to use this file:

- If you can run commands, use the command-line tool through npx; nothing needs installing first. Every \`fastdraw ...\` command below works as \`npx fastdraw ...\`. Always finish with \`npx fastdraw check <file>\` clean and look at the PNG from \`npx fastdraw render <file>\`.
- If you cannot run commands, follow the guide without them: \`fastdraw guide <kind>\` is the page ${SITE}/guide/<kind>.md listed below, and the output of \`fastdraw sizes\` for the built-in look is at the end of this file. Check your own work by the rules in the guide. Give the person the finished diagram as one code block and tell them to paste it into ${SITE}/edit/ with "Paste diagram text".
- To set up a repository so its coding agents always know about FastDraw, run \`npx fastdraw setup\` there.

## Guides for each kind of diagram

${kinds.join('\n')}

## The language guide (\`fastdraw guide\`)

${files.get('guide/guide.md')!.replace(/^# FastDraw guide\n+/, '')}

## The built-in look (\`fastdraw sizes\`)

\`\`\`
${sizesReport(defaultLook()).trim()}
\`\`\`
`);
  return files;
}
