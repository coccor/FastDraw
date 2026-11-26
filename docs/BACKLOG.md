# Backlog

Work that waits: why, and what reopens it. Remove an item when it ships; move it to **Parked** when the owner sets it aside.

## Next

| Item | Size | Why it waits | Reopens when |
|---|---|---|---|
| Table name field in the editor panel | small | Planned 2026-11-23 after the table-rows and legend editors (#88, #89) | The next pick |
| Chart settings (axes, categories) in the panel, its own PR | medium | The format for chart categories is not settled; needs a plan first | The owner picks it; the plan settles the category format |
| Polygon corners in the editor panel: add and remove (dragging on the canvas works since 2026-11-12) | medium | Planned 2026-11-23 with the panel editors; a plan settles what it covers | The owner picks it |

## Later

Listed 2026-11-23 after the 0.5.0 release; none picked yet.

| Item | Reopens when |
|---|---|
| Visual diff of rendered diagrams in a GitHub Action | The owner picks it |
| More Mermaid types in `fastdraw import` (pie, Gantt, mindmap and timeline are refused today) | The owner picks it, or a user asks for one |
| `fastdraw check --json` and `fastdraw describe` | The owner picks it |
| Four e2e tests flaky under load (two double-click, two icon; seen 2026-11-23, not named yet): a full CI run can fail for no real reason | A CI run fails on one of them, or the owner picks it |

## Parked

| Item | Why it is parked | Reopens when |
|---|---|---|
| The Rust crate as FastDraw's only renderer, through WebAssembly | 2026-11-19, owner: not worth it yet; WebAssembly would be about as fast as the TypeScript, so the gain is maintenance only | The owner brings it back |
| A whole folder through `fastdraw open` and VS Code (other diagrams, new files), as a paid feature | 2026-11-26, owner: one diagram for the free version, "keep the folder in mind when we have enough users and want to create a paid tier". Folder server: `src/serve.ts` at 6e47298 | Enough users to create a paid tier |
| Export to draw.io and other tools in core | 2026-11-23, owner: it "takes users away from us"; it lives in `coccor/fastdraw-drawio` | The owner asks for it in core |
