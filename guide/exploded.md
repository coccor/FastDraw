# Exploded views

Shows the parts of one object pulled apart along one axis, drawn as solid plates seen from above at an angle, each named at the side. Use it when the parts are physical or stack like physical things (a device, a package, the tiers of a product). No arrows: position along the axis is the only relation. For rows of text about abstract levels use `layers`.

FastDraw has no 3D. A plate is four `rect`s with the same `at` and size, each with its own outline (`shape=path`): the silhouette, the two side faces, and the rim line.

## Building blocks

```
// canvas 1000x612, title at y=52. One plate: a square slab with rounded corners, 384 wide and 208 high on screen (16 of that is its thickness).
// This is the bottom one of three: y = 96 + 116 * 2
title: text "What the thermostat is made of" at 40,52 style=h1
data: rect at 208,328 384x208 fill=#ffffff stroke=ink sw=1.2 overlap=ok shape=path
    path="M0,0.462 Q0.003,0.442 0.013,0.433 L0.469,0.029 Q0.5,0 0.531,0.029 L0.987,0.433 Q0.997,0.442 1,0.462 L1,0.538 Q0.997,0.558 0.987,0.567 L0.531,0.971 Q0.5,1 0.469,0.971 L0.013,0.567 Q0.003,0.558 0,0.538 Z"
rect at 208,328 384x208 fill=ink/0.07 stroke=none overlap=ok mask=0 shape=path     // left face, lit
    path="M0,0.462 Q0.003,0.481 0.013,0.49 L0.469,0.894 Q0.484,0.909 0.5,0.909 L0.5,0.986 Q0.484,0.986 0.469,0.971 L0.013,0.567 Q0.003,0.558 0,0.538 Z"
rect at 208,328 384x208 fill=ink/0.15 stroke=none overlap=ok mask=0 shape=path     // right face, in shade
    path="M1,0.462 Q0.997,0.481 0.987,0.49 L0.531,0.894 Q0.516,0.909 0.5,0.909 L0.5,0.986 Q0.516,0.986 0.531,0.971 L0.987,0.567 Q0.997,0.558 1,0.538 Z"
rect at 208,328 384x208 fill=none stroke=ink/0.55 sw=0.8 overlap=ok mask=0 shape=path   // rim of the top face
    path="M0,0.462 Q0.003,0.481 0.013,0.49 L0.469,0.894 Q0.5,0.923 0.531,0.894 L0.987,0.49 Q0.997,0.481 1,0.462"

ellipse at 590,430 4x4 fill=ink stroke=none overlap=ok               // dot on the right corner, mid-thickness: y + 102
598,432 -- 644,432 stroke=ink/0.4 sw=0.8                             // leader: y + 104
text "Data" at 656,431 size=16 weight=600 color=ink                  // y + 103
text "postgres, object store" at 656,447 style=small size=10         // y + 119
```

Copy the four paths as they are. They are fractions of the box, so the same four serve every plate; only `at` changes.

## Composition

- Two to five parts. Write them bottom part first: shapes are drawn in file order and each plate must cover the one below it.
- All plates share one x and one size, and sit one above the other with the same step of 116px (with 384x208 plates the gap shows about half of each lower plate's top). Never shrink one gap to fit; make the canvas taller or drop a part. The top plate is at y=96 (under the title); the plate `k` from the top (0 is the top) is at `y = 96 + 116 * k`. Three parts: 96, 212, 328; four: 96, 212, 328, 444.
- Canvas height = `bottom plate y + 284`: 496 for two parts, 612 for three, 728 for four, 844 for five. Plates at x=208 so that plates plus labels (which end near x=800) sit centred on a 1000px canvas.
- For a smaller or larger plate give another size with the same proportions (288x156) and scale the 116 step and the offsets below with it. A size with other proportions distorts the angle and the thickness.
- Always keep the two face tints. A plate with only an outline can be read two ways.
- One part at most is the focus: `stroke=accent` on its silhouette, a second silhouette rect over it with `fill=accent/0.1 stroke=none mask=0`, faces `accent/0.1` and `accent/0.22`, rim `stroke=accent/0.7`. Do not fade the other parts.
- Two dashed lines tie the stack together, from the bottom plate's left and right corners up to the top plate: `208,424 -- 208,208 stroke=ink/0.3 sw=0.8 dash=4,3 layer=back` and the same at x=592 (x = plate left and plate right; y from the bottom plate's `y + 96` to the top plate's `y + 112`; here three parts, 424 and 208). Plain lines are written with `--`.

## Text

- One label per part, all in one column 64px right of the plates (x=656). With `y` the plate's top: the name (`size=16 weight=600`, one or two words) with its baseline at `y + 103`, and a detail line at `y + 119` in `small size=10`.
- The leader is level with the middle of the plate's side (`y + 104`): a 4x4 dot at `590,y+102` (centred on the right corner), then a line from `598,y+104` to `644,y+104`. Leaders are level, never bent, and never cross a plate.
- The focal part's dot, leader and detail line take the accent; its name stays ink.
- No text on the plates, no numbers with a key.

## Legend

None. A one-line `caption` at the bottom, at `y = bottom plate y + 256` (with a short `eyebrow` lead such as "Focal layer" at x=208, the caption from x=312), may say why the accent part matters.

## Limits

Only this one plate shape is given here. A part with another footprint (a long board, a cylinder) or details on its top face needs its own paths, worked out point by point with the projection in `axonometric-plan`; keep to plain plates unless the subject demands more.
