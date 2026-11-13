# Look switcher — design

## Intent
Try the open diagram in each look with a live preview, then keep the one you like. Every look
must define every style, so nothing falls back to plain styles after a switch.

## Goals
- Bundled looks by name: `look headline`, `look reference`, `look sketch`, `look whiteboard`
  resolve to looks shipped inside FastDraw (CLI, editor, fastdraw.dev). No `look` line = built-in.
- Editor **Look** picker: thumbnails of the current diagram in each look; hover/click previews it
  live on the canvas without touching the file; **Apply** writes the `look` line (removes it for
  built-in); **Esc/Cancel** restores the original.
- A diagram already using its own look file keeps it as the "Current" entry in the picker.
- Every look (built-in + 4) defines the same style set — the union of today's names:
  node focal store cloud external optional sticky sticky-orange sticky-violet step terminal
  terminal-focal decision zone bar table matrix chart arrow primary link return relation lifeline
  rule h1 kicker dek eyebrow caption legend note small.
- Missing styles are designed in each look's own idiom (e.g. stickies in Headline are flat
  pale blocks), rendered and checked by eye.
- A unit test fails if any bundled look lacks a style another bundled look has.

## Non-goals
- Editor UI theme / dark mode.
- A side-by-side grid of all looks (could come later on top of this).
- Editing a look's contents from the editor.

## Anti-goals
- Picking a look must not rewrite anything but the `look` line.
- No paper/cream palettes, no black focal element (standing preferences).

## Constraints
- Bare name (no `/`, no `.look`) = bundled look; anything else stays a file path, as today.
- Sketch look needs the Sketch Hand font bundled with the editor (`looks/fonts`).
- Looks' own `fontdir`/`icons` folders are not needed by the bundled four beyond Sketch Hand.

## Approaches
1. **Bundled by name + editor picker (chosen).** Works everywhere, file stays portable.
2. Editor writes a file path to `looks/*.look` — breaks outside this repo and on fastdraw.dev.
3. Full-screen grid of all looks — tiny thumbnails, loses the live canvas; possible later add-on.

## Left to the builder
Exact placement of the Look button (toolbar vs menu), thumbnail size, how bundled look sources
are embedded (raw imports vs generated TS module), CLI `fastdraw looks` listing if cheap.
