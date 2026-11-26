# Backlog

Work that waits, each item with why it waits and what reopens it. Remove an item when it ships; move one to **Parked** when the owner sets it aside.

## Next

| Item | Size | Why it waits | Reopens when |
|---|---|---|---|
| Table name field in the editor panel | small | Planned 2026-11-23 after the table-rows and legend editors (PRs #88, #89) | Next feature pick |
| Chart settings in the editor panel (axes, categories), its own PR | medium | The format for chart categories is not settled; needs a plan first | The owner picks it; the plan settles the category format |
| Polygon corners in the editor panel (adding and removing corners; dragging one on the canvas works since 2026-11-12) | medium | Planned 2026-11-23 with the panel editors; what it covers needs settling in a plan | The owner picks it |

## Later

Listed 2026-11-23 after the 0.5.0 release, with no choice recorded.

| Item | Why it waits | Reopens when |
|---|---|---|
| Visual diff of rendered diagrams in a GitHub Action | Not picked yet | The owner picks it |
| More Mermaid types in `fastdraw import` (pie, Gantt, mindmap and timeline are refused today) | Not picked yet | The owner picks it, or a user asks for one |
| `fastdraw check --json` and `fastdraw describe` | Not picked yet | The owner picks it |
| Four e2e tests flaky under load (two double-click, two icon) | Not picked yet; a full CI run can fail for no real reason | A CI run fails on one of them, or the owner picks it |

## Parked

| Item | Why it is parked | Reopens when |
|---|---|---|
| The Rust crate as FastDraw's only renderer, through WebAssembly | 2026-11-19, owner: not worth the effort yet; WebAssembly would be about as fast as the TypeScript, so the gain is maintenance only | The owner brings it back |
| Export to draw.io and other tools in core | 2026-11-23, owner: it "takes users away from us"; it lives in `coccor/fastdraw-drawio` | The owner asks for it in core |
