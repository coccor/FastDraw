# Polar charts

Shows one number for each of four to twelve categories whose order runs in a circle: hours of the day, days of the week, months, compass directions. Each category is a ray from the centre; its length is the value.

FastDraw has no polar element. Rings are `ellipse`s, rays are plain lines with a small ring on the end.

## Building blocks

```
// title at y=52. Centre 500,300, radius 160 = 100, so 1.6pt per unit of value. Eight categories, the first straight up, then clockwise.
title: text "Request demand by UTC window" at 40,52 style=h1
text "% of daily peak · 0 to 100" at 40,74 style=caption
ellipse at 436,236 128x128 fill=none stroke=ink/0.1 sw=1 overlap=ok mask=0      // ring at 40: at = centre - r, size = 2r
ellipse at 340,140 320x320 fill=none stroke=ink/0.25 sw=1 overlap=ok mask=0     // outer ring, 100

500,300 -- 613,187 stroke=ink/0.14 sw=1                                         // spoke of the second category, to the outer ring
500,300 -- 520,280 stroke=muted sw=1.5                                          // its ray: value 18
ellipse at 516,276 8x8 fill=paper stroke=muted sw=1.5 overlap=ok                // the end of the ray, minus 4
text "03–06" at 627,175 size=11 weight=600 color=ink                            // 20pt beyond the outer ring
text "18" at 627,188 style=small color=muted                                    // the value, 13pt below the name
legend at 40,520 dot.accent="12–15 UTC · the daily peak" dot.muted="Other windows" title="Distance from the centre = demand"
```

## Working out the points

A value `v` in category `i` ends at `centre + v * (pt per unit of value) * direction of i`. For N categories the direction of `i` (first up, clockwise) is `sin(360° * i / N), -cos(360° * i / N)`; round to whole pt. Common ones:

| Categories | Directions |
|---|---|
| 4 | 0,-1 · 1,0 · 0,1 · -1,0 |
| 6 | 0,-1 · 0.866,-0.5 · 0.866,0.5 · 0,1 · -0.866,0.5 · -0.866,-0.5 |
| 8 | 0,-1 · 0.707,-0.707 · 1,0 · 0.707,0.707 · 0,1 · -0.707,0.707 · -1,0 · -0.707,-0.707 |
| 12 | every 30°: 0,-1 · 0.5,-0.866 · 0.866,-0.5 · 1,0 · 0.866,0.5 · 0.5,0.866 · 0,1, then the same mirrored to the left |

## Composition

- Centre 500,300, radius 160, legend at y=520. The top label (name baseline 110) clears the title; the bottom one ends near y=502, so the legend cannot go higher.
- Four to twelve categories, in their natural order. Twelve still reads (the spokes are 30° apart); with more, group them. Do not sort by value: the circle is the order. If the order does not wrap around, use a bar chart; it is easier to read.
- One number per category. The scale starts at 0 in the centre and every ray uses it.
- Five rings at equal steps of the scale: the inner four `stroke=ink/0.1`, the outer `ink/0.25`. They need `overlap=ok mask=0`.
- Each category has a faint spoke to the outer ring and, on top of it, its ray to the value. Both start at the centre; write the spoke first. Spokes and rays are written with `--`.
- A missing value is not zero. Leave the ray out and write "no data" in place of the value.

## Colour

- All rays `stroke=muted sw=1.5` with an 8x8 end ring (`fill=paper stroke=muted`).
- One category may be the subject: `stroke=accent sw=2`, a 10x10 end ring, name and value in `color=accent`.

## Text

- Name and value sit outside the outer ring. Take `P = spoke end + 20 * direction`. If the direction's x is above 0.3, the text starts at `P.x`; below -0.3, `anchor=end` at `P.x`; otherwise `anchor=middle` at `P.x`. Baselines: on the sides (and diagonals) name at `P.y + 2`, value 13pt below it; at the top name at `P.y - 10`, value at `P.y + 3`; at the bottom name at `P.y + 8`, value at `P.y + 22`.
- Scale numbers (`20`, `40` ...) go beside the first spoke: `small` text, size 8, `color=soft`, right-aligned 6pt left of it, level with each ring. Leave out the outermost one; the first category's name sits there. Write them after the rays. The last category's ray runs just left of the first spoke and crosses a number when it is long and close (twelve categories, a high last value): then move the numbers to the spoke of a category whose neighbours are short, or leave them out and say the rings in the unit line ("rings every 20").
- Title and unit: the `h1` title, then the unit under it in `caption` (`text ... at 40,74 style=caption`): there is no axis to hang them on.

## Legend

`legend at 40,520 dot.accent="12–15 UTC · the daily peak" dot.muted="Other windows" title="Distance from the centre = demand"`. The heading says what length means.
