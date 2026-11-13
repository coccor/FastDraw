# Telling agents about FastDraw

All three are thin pointers to `fastdraw guide`, so there is one place to maintain.
`npx fastdraw setup` writes them into a repository; running it again updates them in place.

| Agent | Command | What it writes |
|---|---|---|
| Claude Code | `npx fastdraw setup claude` (`--global` for every repo) | `claude-skill/fastdraw/` as `.claude/skills/fastdraw/` |
| Codex, OpenCode | `npx fastdraw setup agents` | `AGENTS-snippet.md` as a section of `AGENTS.md` |
| GitHub Copilot | `npx fastdraw setup copilot` | `AGENTS-snippet.md` as a section of `.github/copilot-instructions.md` |
| Chat assistants | none | Ask it to read https://fastdraw.dev/llms.txt first (or paste that file in), then paste the reply into the editor with "Paste diagram text" |
