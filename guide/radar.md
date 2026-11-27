# Radar charts

Compares three to five options on three to five scored criteria. Each option is a polygon; the reader compares shapes: which is large all round, which has a dent.

FastDraw has no radar element. Rings and options are `polygon`s, spokes are plain lines.

## Building blocks

```
// Title y=52. Centre 500,288, radius 160 = score 10, so 16pt per score point. Five axes, the first straight up, then clockwise.
// every polygon is written "at 0,0", so its points are absolute coordinates
title: text "Why we picked MinIO" at 40,52 style=h1
text "Scores 0 to 10, higher is better · rings every 2" at 40,74 style=caption
polygon at 0,0 points=500,224;561,268;538,340;462,340;439,268 fill=none stroke=ink/0.1 sw=1 overlap=ok mask=0     // ring at 4
polygon at 0,0 points=500,128;652,239;594,417;406,417;348,239 fill=none stroke=ink/0.25 sw=1 overlap=ok mask=0    // outer ring, 10
500,288 -- 652,239 stroke=ink/0.2 sw=1                                                                            // a spoke, written with --
s3:    polygon at 0,0 points=500,192;652,239;585,404;453,353;378,248 fill=link/0.06 stroke=link sw=1.5 overlap=ok mask=0
minio: polygon at 0,0 points=500,144;622,248;585,404;415,404;363,244 fill=accent/0.14 stroke=accent sw=2 overlap=ok mask=0
ellipse at 496,140 8x8 fill=accent stroke=none overlap=ok                                                          // a dot on each corner of the subject
text "Small-file handling" at 500,108 anchor=middle size=11 weight=600 color=ink
legend at 40,476 swatch.accent="MinIO · recommended" swatch.link="Amazon S3"
```

- Every polygon and dot needs `overlap=ok`, and every polygon `mask=0`, or a later shape hides the earlier ones.

## Working out the points

A score `v` on axis `i` is at `centre + v * (pt per score point) * direction of axis i`. For N axes the direction of axis `i` (first up, clockwise) is `sin(360° * i / N), -cos(360° * i / N)`. Common ones:

| Axes | Directions |
|---|---|
| 3 | 0,-1 · 0.866,0.5 · -0.866,0.5 |
| 4 | 0,-1 · 1,0 · 0,1 · -1,0 |
| 5 | 0,-1 · 0.951,-0.309 · 0.588,0.809 · -0.588,0.809 · -0.951,-0.309 |

Example: score 8 on the second of five axes, 16pt per score point: `500 + 8*16*0.951, 288 - 8*16*0.309` = `622,248`. Round to whole pt.

## Composition

- Centre 500,288, radius 160, legend at y=476. The title leaves the top label (baseline 108) clear.
- Three to five axes and three to five options. With more of either, use a table (`align=center grid=1`). With two options, use grouped bars.
- All axes share one scale that starts at 0 in the centre (0 to 10, 0 to 5). Convert raw measurements to that scale first. Do not start the rings at a higher value to make differences look bigger.
- Five rings at equal steps: the inner four `stroke=ink/0.1`, the outer one `ink/0.25`. Spokes `ink/0.2`, written with `--`.
- Order in the file: rings, spokes, then options from smallest area to largest, the subject last, then its dots.

## Colour

- The subject: `stroke=accent sw=2 fill=accent/0.14`, with an 8x8 accent dot on each corner (`at` = corner minus 4).
- The others: `sw=1.5`, strokes `link`, `muted`, `soft`, each with its own colour at `/0.06` as fill. Keep these fills that faint: several tints on top of each other turn the middle to mud.
- Dots on the subject only.

## Text

- Axis names: one to three words, `size=11 weight=600 color=ink`. Take the point `P` 20pt beyond the end of the spoke, along its direction (`end + 20 * direction`). If the direction's x is above 0.3: text starts at `P.x`, baseline `P.y + 4`. Below -0.3: `anchor=end` at `P.x`, baseline `P.y + 4`. Otherwise `anchor=middle` at `P.x`, baseline `P.y` for the top name and `P.y + 10` for a bottom one. For five axes: 500,108 · 671,236 · 606,438 · 394,438 · 329,236.
- Scale numbers are optional. If written, they go on the first axis only, after the polygons: `small` text, size 8, right-aligned 6pt left of the spoke, level with each ring. A polygon edge that runs through a number makes it unreadable (the subject's first corner and its neighbours' edges often do): then leave the numbers out and say the scale in the subtitle ("rings every 2").
- No values on the corners; the rings carry the scale.

## Legend

`legend at 40,476 swatch.accent="MinIO · recommended" swatch.link="..." swatch.muted="..." swatch.soft="..."`: the subject first, with the reason it is the subject.
