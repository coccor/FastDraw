# Polar charts

Shows one number for each of four to eight categories whose order runs in a circle: hours of the day, days of the week, months, compass directions. Each category is a ray from the centre; its length is the value.

FastDraw has no polar element. Rings are `ellipse`s, rays are plain lines with a small ring on the end.

## Building blocks

```
// centre 500,232, radius 160 = 100, so 1.6px per point. Eight categories, the first straight up, then clockwise.
ellipse at 436,168 128x128 fill=none stroke=ink/0.1 sw=1 overlap=ok mask=0      // ring at 40: at = centre - r, size = 2r
ellipse at 340,72 320x320 fill=none stroke=ink/0.25 sw=1 overlap=ok mask=0      // outer ring, 100

500,232 -- 613,119 stroke=ink/0.14 sw=1                                         // spoke of the second category, to the outer ring
500,232 -- 520,212 stroke=muted sw=1.5                                          // its ray: value 18
ellipse at 516,208 8x8 fill=paper stroke=muted sw=1.5 overlap=ok                // the end of the ray, minus 4
text "03–06" at 627,107 size=11 weight=600 color=ink                            // 20px beyond the outer ring
text "18" at 627,120 style=small color=muted                                    // the value, 13px below the name
```

## Working out the points

A value `v` in category `i` ends at `centre + v * px per point * direction of i`. Directions (x, y), first category up, clockwise:

| Categories | Directions |
|---|---|
| 4 | 0,-1 · 1,0 · 0,1 · -1,0 |
| 6 | 0,-1 · 0.866,-0.5 · 0.866,0.5 · 0,1 · -0.866,0.5 · -0.866,-0.5 |
| 8 | 0,-1 · 0.707,-0.707 · 1,0 · 0.707,0.707 · 0,1 · -0.707,0.707 · -1,0 · -0.707,-0.707 |

For 5 or 7 categories the direction of `i` is `sin(360° * i / N), -cos(360° * i / N)`. Round to whole px.

## Composition

- Canvas 1000x520, centre 500,232, radius 160, legend at y=452. The lowest label ends near y=434; with the legend any higher they collide.
- Four to eight categories, in their natural order. Do not sort by value: the circle is the order. If the order does not wrap around, use a bar chart; it is easier to read.
- One number per category. The scale starts at 0 in the centre and every ray uses it.
- Five rings at equal steps of the scale: the inner four `stroke=ink/0.1`, the outer `ink/0.25`. They need `overlap=ok mask=0`.
- Each category has a faint spoke to the outer ring and, on top of it, its ray to the value. Both start at the centre; write the spoke first.
- A missing value is not zero. Leave the ray out and write "no data" in place of the value.

## Colour

- All rays `stroke=muted sw=1.5` with an 8x8 end ring (`fill=paper stroke=muted`).
- One category may be the subject: `stroke=accent sw=2`, a 10x10 end ring, name and value in `color=accent`.

## Text

- Name and value sit outside the outer ring, 20px beyond the spoke end. Above and below the circle: `anchor=middle`. On the right: text starts at that point. On the left: `anchor=end`.
- Scale numbers (`20`, `40` ...) go beside the first spoke only: `small` text, size 8, `color=soft`, right-aligned 6px left of it, level with each ring. Leave out the outermost one; the first category's name sits there.
- Title and unit go in the top-left corner (`text ... at 40,48 size=12 weight=600`, unit below in `eyebrow`): there is no axis to hang them on.

## Legend

`legend at 40,452 dot.accent="12–15 UTC · the daily peak" dot.muted="Other windows" title="Distance from the centre = demand"`. The heading says what length means.
