# Radar charts

Compares three to five options on three to five scored criteria. Each option is a polygon; the reader compares shapes: which is large all round, which has a dent.

FastDraw has no radar element. Rings and options are `polygon`s, spokes are plain lines.

## Building blocks

```
// centre 500,236, radius 160 = score 10, so 16px per point. Five axes, the first straight up, then clockwise.
// every polygon is written "at 0,0", so its points are canvas coordinates
polygon at 0,0 points=500,172;561,216;538,288;462,288;439,216 fill=none stroke=ink/0.1 sw=1 overlap=ok mask=0     // ring at 4
polygon at 0,0 points=500,76;652,187;594,365;406,365;348,187 fill=none stroke=ink/0.25 sw=1 overlap=ok mask=0     // outer ring, 10
500,236 -- 652,187 stroke=ink/0.2 sw=1                                                                            // a spoke
s3:    polygon at 0,0 points=500,140;652,187;585,352;453,301;378,196 fill=link/0.06 stroke=link sw=1.5 overlap=ok mask=0
minio: polygon at 0,0 points=500,92;622,196;585,352;415,352;363,192 fill=accent/0.14 stroke=accent sw=2 overlap=ok mask=0
ellipse at 496,88 8x8 fill=accent stroke=none overlap=ok                                                          // a dot on each corner of the subject
```

- Every polygon and dot needs `overlap=ok`, and every polygon `mask=0`, or a later shape hides the earlier ones.

## Working out the points

A score `v` on axis `i` is at `centre + v * px per point * direction of axis i`. Directions (x, y), first axis up, clockwise:

| Axes | Directions |
|---|---|
| 3 | 0,-1 · 0.866,0.5 · -0.866,0.5 |
| 4 | 0,-1 · 1,0 · 0,1 · -1,0 |
| 5 | 0,-1 · 0.951,-0.309 · 0.588,0.809 · -0.588,0.809 · -0.951,-0.309 |

Example: score 8 on the second of five axes, 16px per point: `500 + 8*16*0.951, 236 - 8*16*0.309` = `622,196`. Round to whole px.

## Composition

- Canvas 1000x500, centre 500,236, radius 160. Legend at y=424.
- Three to five axes and three to five options. With more of either, use a table (`align=center grid=1`). With two options, use grouped bars.
- All axes share one scale that starts at 0 in the centre (0 to 10, 0 to 5). Convert raw measurements to that scale first. Do not start the rings at a higher value to make differences look bigger.
- Five rings at equal steps: the inner four `stroke=ink/0.1`, the outer one `ink/0.25`. Spokes `ink/0.2`.
- Order in the file: rings, spokes, then options from smallest area to largest, the subject last, then its dots.

## Colour

- The subject: `stroke=accent sw=2 fill=accent/0.14`, with an 8x8 accent dot on each corner (`at` = corner minus 4).
- The others: `sw=1.5`, strokes `link`, `muted`, `soft`, each with its own colour at `/0.06` as fill. Keep these fills that faint: several tints on top of each other turn the middle to mud.
- Dots on the subject only.

## Text

- Axis names: one to three words, `size=11 weight=600 color=ink`, 16px beyond the end of the spoke. Top and bottom names `anchor=middle`; names on the right start at the spoke end; names on the left take `anchor=end`.
- Scale numbers on the first axis only: `small` text, size 8, right-aligned 6px left of the spoke, level with each ring.
- No values on the corners; the rings carry the scale.

## Legend

`legend at 40,424 swatch.accent="MinIO · recommended" swatch.link="..." swatch.muted="..." swatch.soft="..."`: the subject first, with the reason it is the subject.
