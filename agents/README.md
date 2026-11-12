# Telling agents about FastDraw

All three are thin pointers to `fastdraw guide`, so there is one place to maintain.

| Agent | What to do |
|---|---|
| Claude Code | Copy `claude-skill/fastdraw/` into `.claude/skills/` in your repo (or `~/.claude/skills/` for all repos) |
| Codex, OpenCode | Paste `AGENTS-snippet.md` into your repo's `AGENTS.md` |
| GitHub Copilot | Paste `AGENTS-snippet.md` into `.github/copilot-instructions.md` |
| Chat assistants with no tools (ChatGPT) | Paste the output of `fastdraw guide` into the chat, then paste the reply into the editor with "Paste diagram text" |
