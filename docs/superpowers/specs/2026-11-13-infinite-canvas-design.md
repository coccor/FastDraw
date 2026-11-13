# Infinite canvas (no page size)

## Intent

FastDraw should feel like Excalidraw: there is no page. You draw anywhere,
including left of and above where you started, and nothing is ever "outside".
The picture is whatever you drew; export crops to it.

Today every diagram has a fixed page from `canvas WxH`. The editor draws its
border, export uses it, `fastdraw check` warns about anything outside it, and
the guides teach agents to plan around it.

## Goals

- No page in the editor: no border, the look's background (paper colour and
  dots) fills the whole viewport, pan/zoom anywhere, place things at any
  coordinate, negative included.
- The picture's extent is computed from the content: the bounding box of every
  shape, text and connector point, plus a fixed margin on all four sides.
  SVG/PNG export, `fastdraw render`, and the editor's PNG/SVG export all use it.
- The size on the `canvas` line is gone from the language. The line stays for
  page settings that are not a size (e.g. the background work on branch
  `editor-background`).
- Agents stop sizing pages: guides, README and examples no longer write or
  reason about a canvas size.

## Non-goals

- Fixed-size exports (e.g. pinning 1920x1080). Dropped on purpose (option 1
  was chosen over "optional export frame").
- Excalidraw frames or multiple pages.
- Changing how any element is laid out other than the legend default width
  (below).

## Anti-goals

- Opening a file must not change it. Only an actual edit writes.
- Old files with `canvas WxH` must still open, render and check without
  errors.
- Existing diagrams drawn with the guides' 40px margins must not visibly shift
  or crop in export.

## Approaches considered

1. **Drop the size entirely (chosen).** Pure Excalidraw model; one rule for
   extent; agents have nothing to guess. Loses fixed-size exports.
2. Optional size as an export frame. Keeps fixed-size exports, but agents keep
   writing frames unless every guide changes, and legacy files keep showing a
   page. Rejected by the user.
3. Auto-growing page (grow right/down when content passes the edge). Still a
   page with a top-left corner at 0,0; not what Excalidraw does.

## Design

### Language and scene (`src/scene.ts`)

- `canvas` accepts props and no size. A legacy `WxH` token is accepted and
  ignored (no error). `fastdraw check` reports it once as a note: "canvas
  size is no longer used; remove `WxH`" so agents learn.
- The scene gains an origin: `Scene` carries `x, y, w, h` = content bounding
  box (shapes `x..x+w`, texts `x..x+w`, all connector points, connector
  labels) expanded by **40px on every side** (matches the guides' margin, so
  a diagram drawn from 40,40 keeps its origin at 0,0). Round outward to the
  4px grid.
- Empty diagram: `0, 0, 400x240` so there is still something to show/export.
- Legend default width (no `WxH` given) used `canvas.w - 2*x`. It becomes the
  right edge of all non-legend content minus the legend's `x`, floor 200 (and
  920 if there is no other content). Legends with a written size are
  unchanged.

### Render (`src/render.ts`)

- `viewBox="x y w h"`, `width=w height=h`; the paper and dot-pattern rects are
  placed at `x,y` with `w,h`. Dots stay aligned to world coordinates (pattern
  in user space anchored at 0,0), so they do not jump when the extent changes.

### Check (`src/check.ts`)

- Remove the three "outside the canvas" warnings (connector ends, text,
  shapes). Add the legacy-size note above.

### CLI (`src/cli.ts`)

- The message after render prints the computed size. Any generated source
  (line ~166) stops writing a size.

### Editor (`editor/src`)

- Remove the page border rect and the "Canvas size" fields in the menu, and
  `ops.setCanvas`. `addLegend` stops growing the canvas.
- The viewport background is the look's paper colour, with the dot pattern
  drawn over the whole visible area, aligned to world coordinates and scaled
  with zoom. The paper/dots `<rect>`s from `renderBody` are not drawn in the
  editor.
- Opening a file fits the view to the content extent (same fit rule as today,
  using `x,y,w,h`).
- Editor PNG/SVG export uses the scene extent including origin.
- Gallery and template thumbnails keep working (they currently filter the
  paper rect by matching `<rect width="${sc.w}"`; update to the new markup).
- First real edit to a file whose `canvas` line has a size also removes the
  size token in the same write (never on open).

### Docs and examples

- `guide/guide.md` and all kind guides: remove canvas sizes from examples and
  rewrite size-based advice ("canvas is 70px taller than the legend's y",
  "size the canvas to the content", "spans the canvas width") in terms of
  content (margins between elements, legend 24px under the lowest element,
  legend width = content width unless set).
- README example drops the size.
- `examples/**/*.fdraw`: strip `WxH` from `canvas` lines (drop the line if it
  has nothing else). Re-render and compare against current output to confirm
  nothing shifts beyond the right/bottom margin changing to 40px.

### Tests

- Unit: extent with negative coordinates; empty diagram; legacy `canvas WxH`
  accepted and noted; no outside-canvas warnings; legend default width from
  content; viewBox origin in rendered SVG.
- Browser (e2e): no border/canvas-size fields; drag a shape to negative
  coordinates and it saves and stays visible; export includes it; opening a
  file with `canvas WxH` does not write; first edit strips the size.

## Left to the builder

- Exact markup for the editor's infinite background (CSS vs a large rect
  recomputed on pan/zoom), as long as dots stay world-aligned.
- Wording of the legacy-size note.
- How guides phrase composition advice once there is no page, keeping the
  existing 40px margin convention.

## Interaction with other work

- Branch `editor-background` (unmerged) puts the background on the `canvas`
  line via the menu. Compatible: the line stays for props. Whichever merges
  second resolves the menu section (Canvas size fields go away; Background
  stays).
