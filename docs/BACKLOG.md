# Backlog

Work that waits, each item with why it waits and what reopens it. Remove an item when it ships; move one to **Parked** when the owner sets it aside.

## Next

| Item | Size | Why it waits | Reopens when |
|---|---|---|---|
| Table name field in the editor panel | small | Planned 2026-11-23 after the table-rows and legend editors (PRs #88, #89) | Next feature pick |
| Chart settings in the editor panel (axes, categories), its own PR | medium | The format for chart categories is not settled; needs a plan first | The owner picks it; the plan settles the category format |
| Polygon corner editing in the editor | medium | Planned 2026-11-23; needs a plan | The owner picks it |

## Parked

| Item | Why it is parked | Reopens when |
|---|---|---|
| The Rust crate as FastDraw's only renderer, through WebAssembly | 2026-11-19, owner: not worth the effort yet; WebAssembly would be about as fast as the TypeScript, so the gain is maintenance only | The owner brings it back |
| Export to draw.io and other tools in core | 2026-11-23, owner: it "takes users away from us"; it lives in `coccor/fastdraw-drawio` | The owner asks for it in core |
