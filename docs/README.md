# Docs

What each file in `docs/` holds. `AGENTS.md` § 1.5 says which to open for a task; this is the catalog.

| File | What it holds |
|---|---|
| `cli.md` | The `fastdraw` command and its subcommands (`fastdraw --help` lists every option) |
| `editor.md` | The browser editor: what it does and how its edits reach the file |
| `embedding.md` | `<fastdraw-diagram>` and the README images served at `/gh/*` and `/s/*` |
| `looks.md` | Look files: the styles, shapes and fonts a look sets |
| `BACKLOG.md` | Work that waits, with why and what reopens it |
| `design/` | Design explorations as HTML pages (the panel redesign, the revamp, the home page swatches) |
| `superpowers/specs/`, `superpowers/plans/` | Earlier designs and plans (infinite canvas, look switcher, the Rust render crate) |

`CONTRIBUTING.md` at the root holds the checks, the Rust parity steps, releases and the repository layout; the guides an agent reads are in `guide/`. Where a doc and the code disagree, the code is what runs: report it, and the owner decides which side moves.
