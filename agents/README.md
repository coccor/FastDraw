# Telling agents about FastDraw

There is one skill, in [`../plugins/fastdraw/skills/fastdraw/SKILL.md`](../plugins/fastdraw/skills/fastdraw/SKILL.md).
It is a thin pointer to `fastdraw guide`, so there is one place to maintain. It reaches agents three ways:

| Agent | How | What it installs |
|---|---|---|
| Claude Code | `/plugin install fastdraw --marketplace coccor/fastdraw` | the `fastdraw` plugin from [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json), for the user |
| Codex, OpenCode, Cursor and others | `npx skills add coccor/fastdraw -g` | the skill in `~/.agents/skills/fastdraw/` and each chosen agent's folder ([skills.sh](https://skills.sh) finds it through the plugin manifest) |
| GitHub Copilot | `npx fastdraw setup copilot` | `AGENTS-snippet.md` as a section of `.github/copilot-instructions.md` |
| A repository that commits its instructions | `npx fastdraw setup claude` or `setup agents` | the skill as `.claude/skills/fastdraw/`, or `AGENTS-snippet.md` as a section of `AGENTS.md` |
| Chat assistants | none | Ask it to read https://fastdraw.dev/llms.txt first (or paste that file in), then paste the reply into the editor with "Paste diagram text" |

The plugin has no `version`, so Claude Code users follow the commits on `main` when they update.
`claude plugin validate .` checks the marketplace and the plugin.

## Diagrams on a docs site

A README on GitHub can only show the PNG from `fastdraw render`. A docs site (Starlight, Docusaurus,
VitePress, plain HTML) can show the `.fdraw` file itself with the `<fastdraw-diagram>` element from
https://fastdraw.dev/embed.js, keeping the PNG inside it for readers without JavaScript. Both instruction
files above tell the agent to do that; the element is described under "Embedding a diagram" in the
main README.
