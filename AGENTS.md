# AGENTS.md

Master instructions for every coding agent in this repository. Claude Code reads this file because there is no `CLAUDE.md`; a `CLAUDE.md` or `CLAUDE.local.md` that does not import `@AGENTS.md` stops it loading, so keep none (or one whose first line is `@AGENTS.md`). Codex reads it directly. Keep must-follow rules in the first 32 KiB.

Two sections. **Section 1 is how we build** — the mechanics and the owner's choices. **Section 2 is FastDraw** — what it is and what it will not do. Section 1 wins on mechanics, Section 2 on product. What neither says follows the installed skills' defaults; where those are silent too, decide and say so in the summary. Depth lives in `CONTRIBUTING.md` and `docs/` (indexed in `docs/README.md`). **§ 1.5 says what opens when — find the moment you are in before every new task.**

---

# 1. How we build

## 1.1 Stack

TypeScript run directly by Node 22.18+ (`--experimental-strip-types`) · core in `src/` (parser, look loader, arrow router, SVG renderer, checker, text edits) · CLI bundled by esbuild · editor and `<fastdraw-diagram>` embed on Vite + React in `editor/` · the fastdraw.dev Worker in `worker/` on Cloudflare Workers · the VS Code extension in `vscode/` (its own `npm ci`) · a Rust port of the renderer in `crates/fastdraw-render`, held to the TypeScript by parity tests · `node --test` for core, Playwright for the editor.

## 1.2 Testing and delivery

- **The gate:** `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build:editor`, plus the Rust parity steps when the renderer changed and the `vscode/` checks when the extension changed (`CONTRIBUTING.md` § Checks). CI runs all of it on every PR.
- **Read the exit code from the log, never the notification.** An inherited report is a claim, not evidence: re-run the gate yourself before repeating a count.
- **Merging to `main` deploys fastdraw.dev** (Cloudflare Workers Builds). A merge is a deploying push: it needs a green gate and a clean independent round first (`independent-review`). The owner merges.
- **Version tags publish:** `vX.Y.Z` publishes to npm (`release.yml`), `vscode-vX.Y.Z` to the VS Code Marketplace and Open VSX (`vscode-release.yml`). A tag is pushed only after the owner's go, for that release.
- The harness: the `test-harness` skill. How a change ships: the `release-gate` skill.

### Owner's choices and installed packs

Skill defaults apply, with these departures (each dated, in the owner's words where there are some):

- **One worktree and branch per change, one PR each.** When the owner says a PR merged, check the work is on `origin/main`, then delete the worktree and the local and remote branch in the same turn, unasked (2026-11-15: asked for a standing rule instead of being asked each time).
- **Open the app for the owner when a user-visible editor feature is done, and again when its PR opens**, from that branch (2026-11-13/14). Restart Vite with `--force` on a free port and load `/edit/` headlessly for page errors first (2026-11-19: a stale hot update handed over a broken page).
- **Redesigns start as a design doc** with several directions drawn on the real diagrams, the current look as the baseline to beat, and wait for a pick (2026-11-14: "usually designers first create a design doc. you went straight to changing it"). Directions must differ in how they draw (what a box or line is made of), not only colour and type.
- **Copy reads like a README:** what it is, then what happens, with concrete names; no two-beat slogans, taglines or "not X, but Y" (2026-11-14: "The text feels like ai slop").
- **Pickers show the drawing and the name, no descriptions** (2026-11-19: "remove the descriptions").
- **Reviewer:** the `independent-review` default order (Codex, then headless Claude Code, then Grok; Codex and Grok are installed here). Fallback: a fresh headless Claude Code session.

Installed packs: Claude Code → `product`, `ai-shipping`, `agent-teams`, `agent-harness`, `app-stack`, `work-humanizer` from `phuryn/product-engineering`, project scope (`.claude/settings.json`, auto-update on). Codex → none. They update themselves; nothing pins a version. **Precedence: current session owner instruction > this file > user-level instructions > skill defaults.** Record standing choices here, not only in one agent's memory.

## 1.3 Working rules

- Read this file before the first plan.
- **Apply skill defaults without asking.** Get the owner's clear go each time before anything irreversible or outward-facing: merging, tagging a release, publishing, writing to another repository, deleting anything public. Questions about what FastDraw should do are the owner's.
- **Tests and docs are part of the change.** A bug fix lands with a test that fails before the fix; every change updates the doc and guide lines it made false.
- **A doc that disagrees with code you did not change:** say so in the summary; the owner decides which side moves.
- **No play-by-play.** Plan, build, summarize once.
- **Commit messages go through a heredoc (`git commit -F -`), never `-m "…"`**: a backtick inside `-m` is command substitution, and the text vanishes silently.
- **A fix that carries an exclusion says in its comment why the excluded case does not need it.** A comment stating an invariant about a value protects only its own file: check every route that can receive the value.
- **When a flag's meaning widens, rename it to what it does**, not to one of its reasons.
- **Before handing the owner a task, do every part you can** (an API, a CLI, `gh`) and pass up only what needs a person: a dashboard-only click, a secret, taste.

## 1.4 Always on

- **Never put a secret in the repository, a URL, a log line or the client bundle.** npm, the Marketplace and Open VSX publish through trusted publishing (OIDC) and the `release` environment holds no secrets; don't add a token (2026-11-23, owner: "why access token and not trusted profile?").

## 1.5 What opens when

At the start of every new task, find the moment you are in — several can hold at once — and open what its row names **before** you act, even a file read earlier in the session. The rule column is the part that is easy to miss; the file holds the depth.

| When you are… | The rule that applies | Open |
|---|---|---|
| starting a session, or asking what comes next | Read this file; the backlog says what waits and why | `docs/BACKLOG.md` · type `/product:start-here` |
| planning a change you can't say in a sentence | A plan first: key assumptions up front, parts with rough hours, how to test it, acceptance criteria | the `product:start-here` skill (§ Plan) · `docs/superpowers/plans/` for earlier plans |
| building a feature or changing behaviour | Its tests land with it: core in `test/`, editor in `e2e/` | `CONTRIBUTING.md` § Checks · the doc that describes it (`docs/cli.md`, `docs/editor.md`, `docs/embedding.md`, `docs/looks.md`) |
| fixing a bug | A test that fails before the fix; the doc that described the old behaviour, corrected | the `test-harness` skill |
| **changing the renderer** — `src/` drawing, bundled looks, icons, fonts or `editor/src/embed/theme.ts` | The same change in `crates/fastdraw-render` in the same PR; `crates/fastdraw-render/data/` is regenerated by `npm run rust:data`, never edited | `CONTRIBUTING.md` § The Rust renderer |
| adding to the diagram language — a keyword, attribute or element | The guide an agent reads learns it too, the checker knows it, and a parity case in `crates/fastdraw-render/tests/coverage/` uses it | `guide/` · `CONTRIBUTING.md` § The Rust renderer |
| changing the editor's screens or panels, or mocking one | Apply `ui-design` within the existing editor UI; pickers show drawing + name only; a restyle bigger than a tweak starts as a design doc | the `ui-design` skill · `docs/editor.md` · `docs/design/` |
| changing a look, or the built-in look | Small one-decision steps, each shown beside the current one; never name a look after a publication or a brand; the six community looks change in `coccor/fastdraw-looks`, not here | `docs/looks.md` · `src/defaultLook.ts` |
| writing copy — site, README, guide, editor text | README voice, no slogans | the `work-humanizer` skill |
| finishing a user-visible editor feature, or opening its PR | Restart Vite with `--force`, load-check `/edit/`, then open it for the owner from the branch | § 1.2 Owner's choices |
| writing or running a test, or claiming something is verified | Read exit codes from the log; an e2e test that fails in the suite and passes alone is reported by name as flaky, never dropped | `CONTRIBUTING.md` § Checks · the `test-harness` skill |
| **asking the owner to merge a PR** — merging deploys fastdraw.dev | Gate green in CI and locally, and a clean independent round over the whole PR; the round reruns after any fix | the `independent-review` skill · the `release-gate` skill |
| touching the Worker or `wrangler.jsonc` | `wrangler.jsonc` mirrors the dashboard's settings; a mismatch breaks Workers Builds | `wrangler.jsonc` comments · `worker/` |
| **releasing** — a version bump, an npm or VS Code tag | Version-bump PR first; the tag only after the owner's go; an npm `E404` on publish means the trusted publisher's repository name no longer matches `coccor/FastDraw` | `CONTRIBUTING.md` § Releases and deployment · `vscode/README.md` · the `release-gate` skill |
| working on the VS Code extension | Its own `npm ci`, tests and `.vsix`; CI runs its integration test under xvfb | `vscode/README.md` |
| asked for export to another tool (draw.io and the like) | Not in this repository's CLI, editor, README, guide or skill; draw.io export lives in `coccor/fastdraw-drawio` | `docs/BACKLOG.md` (parked work) |
| creating or removing a git worktree, or after a PR merged | Check the branch is on `origin/main` before deleting; never remove a worktree whose `node_modules` links to another checkout | § 1.2 Owner's choices · the `independent-review` skill (worktree recipe) |
| running a review loop or triaging a finding | A finding and its severity are claims; verify each against the code | the `independent-review` skill |
| delegating a build, review or research | Brief with the why; write it yourself when the brief would be as long as the diff | the `delegation` skill |
| reading a doc that disagrees with the code | Say so in the summary; the owner decides | the `document-app` skill in `check` mode |
| deferring anything, or asked what remains | Every deferral has a reason and a trigger that reopens it | `docs/BACKLOG.md` |
| editing this file, or after a mistake it should have prevented | Fix it in the moment with the receipt; route, don't summarize; keep within `budgets.json` (`python3 tools/check_budgets.py`) | the `agent-instructions` skill |
| learning a lesson for the shared skill collection | Keep FastDraw's incident here; send only the general lesson | type `/agent-harness:retro` |

## 1.6 This file is yours to manage

Edit it without asking, except removing a rule's text, which you propose and the owner decides. At every release, read it top to bottom: what is obsolete, what belongs in `docs/` with a pointer here, what did this release teach. When a mistake happens that this file should have prevented, fix it here with the receipt (date, what went wrong). Every rule placed in a doc gets a § 1.5 row. Word budgets are in `budgets.json`, checked in CI; one in, one out.

---

# 2. FastDraw

## 2.1 What it is

A diagram format and tools for diagrams that AI coding agents write and people edit. A diagram is a `.fdraw` text file, one element per line with exact coordinates. `fastdraw check` reports overlaps, crossings, label collisions and overflowing text with line numbers so an agent fixes its own layout; `fastdraw` renders PNG or SVG. The editor at fastdraw.dev/edit opens the same file and saves changes back as small text edits.

## 2.2 Users

Coding agents (Claude Code, Codex and others) that read `fastdraw guide` and write `.fdraw` files; the developers who ask for the diagrams and finish them in the editor, the VS Code preview, or an embed on their own pages. No accounts.

## 2.3 Shape

- **Distribution:** npm package `fastdraw` (CLI, embed, guides, agent skills in `agents/` and `plugins/`); VS Code extension `coccor.fastdraw`; fastdraw.dev (landing page, editor, `/gh/*` and `/s/*` SVG images for READMEs).
- **Server side:** only the Worker, which draws a diagram from GitHub (`/gh/*`) or a share link (`/s/*`) as an SVG image.
- **Consumers of the Rust crate:** FastPad, at a pinned commit; it is not on crates.io.

## 2.4 Not in scope

- Automatic layout: what the file says is what is drawn.
- Export to other diagram tools in this repository (2026-11-23, owner: it "takes users away from us").
- The Rust crate as the only renderer, through WebAssembly: parked 2026-11-19 as not worth it yet; don't start it unasked.

## 2.5 Constraints

- The file is the source of truth: the editor writes minimal text edits, so a diff stays readable.
- The TypeScript and Rust renderers draw identical output for every parity case.
- Brand: accent tomato `#dc2f2f`; title font Libre Caslon Display, names Geist.

## 2.6 Status

0.5.0 is on npm (Mermaid import, VS Code preview, panel editing); the VS Code extension is on the Marketplace. Next: the table name field, then chart settings and polygon corner editing (`docs/BACKLOG.md`).
