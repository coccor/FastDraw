# Heatmaps

Shows a number for every combination of two lists (service by sprint, team by week) as a grid of cells, darker for larger. The reader scans the whole grid and one cell or cluster stands out.

FastDraw has no heatmap element. Each cell is a plain `rect` with its value as text.

## Building blocks

```
// 5 rows. Title y=52. Grid: 6 columns from x=184, 120pt apart; rows from y=136, 60pt apart; cells 116x56 with a 4pt gap
// fill = ink at (value / 9 * 0.65), at least 0.07: 9 is the largest value outside the focal cell
title: text "CI failures peaked on payments in sprint 4" at 40,52 style=h1
text "SPRINT" at 542,100 style=eyebrow anchor=middle                 // list name, centred over the grid
text "SERVICE" at 74,284 style=eyebrow anchor=middle rotate=-90     // x0 - 110, level with the middle of the grid
text "S1" at 242,124 style=small size=10 color=muted anchor=middle   // column name: cell x + 58, baseline 12pt above the grid
text "auth" at 172,168 style=small size=10 color=ink anchor=end      // row name: x0 - 12, baseline cell y + 32
a1: rect "4%" at 184,136 116x56 fill=ink/0.29 stroke=none radius=0 title.size=9 title.font=mono title.weight=400
a3: rect "6%" at 424,136 116x56 fill=ink/0.43 stroke=none radius=0 title.size=9 title.font=mono title.weight=400 title.color=#ffffff
p4: rect "47%" sub="REGRESSION" at 544,196 116x56 fill=accent/0.85 stroke=accent sw=1.2 radius=0 title.size=12 title.weight=700 title.font=mono title.color=#ffffff sub.color=#ffffff sub.size=8
```

## Composition

- Three to seven rows and three to eight columns. Fewer is a table; more makes the cells too small to read.
- Cells are 116x56 with a 4pt gap (pitch 120 across, 60 down) for up to six columns. For seven or eight columns narrow them to 88pt (pitch 92); never below 80pt.
- Centre the grid: `x0 = 40 + (1000 - grid width) / 2`, rounded to 4 (six columns: grid width 716, x0 = 184). The 40 makes room for the row names. Column `c` is at `x0 + pitch * c`, row `r` at `136 + 60 * r`.
- Row names are right-aligned at `x0 - 12`, baseline 32pt below the cell top. Column names are centred over each column, baseline at 124 (12pt above the grid).
- Name both lists with `eyebrow` text, **typed in capitals** (`eyebrow` does not change case): one centred over the grid at y=100, one turned with `rotate=-90` at `x0 - 110` (clear of the longest row name), level with the middle of the grid.
- Grid bottom = `136 + 60 * rows - 4`. Legend rule at grid bottom + 24.
- Keep the order the reader expects (time left to right; rows alphabetical or by size) and show every row and column. If you leave any out, say so under the legend.

## Colour

- One scale of one colour: `fill=ink/OPACITY`, with opacity rising with the value from 0.07 (smallest; lower cannot be told from the paper) to 0.65 (largest). Work out `value / largest * 0.65` to two decimals and write the rule in a comment.
- No second hue and no colour per row or column. A two-colour scale is right only for values that run both sides of a meaningful zero.
- One cell, the one the diagram is about, is `fill=accent/0.85 stroke=accent` with white text (`title.color=#ffffff sub.color=#ffffff`: ink on that fill is hard to read). If its value is far above the rest, leave it out of the scale (take "largest" from the other cells), or every other cell turns equally pale. Then state its value in the legend.

## Text

- Every cell shows its value, in mono size 9. From opacity 0.40 up, the text is white (`title.color=#ffffff`); below, it keeps the default ink.
- The focal cell has a larger bold value (size 12) and may carry one word under it in `sub=`.
- Put the unit in the cells (`4%`) or in the note under the legend, not in both.

## Legend

By hand, because the cells are not styles of the look. With `G` the grid bottom (432 for five rows), `n` the number of ramp steps (six to eight):

```
40,456 -- 960,456 style=rule                                      // G + 24
text "Legend" at 40,476 style=eyebrow                             // G + 44
text "Low" at 132,476 style=eyebrow color=soft anchor=end
rect at 140,466 20x12 fill=ink/0.07 stroke=none radius=0          // step k at x = 140 + 22 * k, y = G + 34
text "High" at 324,476 style=eyebrow color=soft                   // 140 + 22 * n + 4 (n = 8)
rect at 400,466 20x12 fill=accent/0.85 stroke=accent radius=0     // the focal swatch, 76pt after High
text "payments · S4 · 47%: a deploy regression, since fixed" at 428,476 style=caption
text "CI failure rate per service and sprint. The grey scale covers 1% to 9%; the accent cell is outside it." at 40,504 style=caption   // G + 72
```

Step the ramp swatches through the opacities used, 0.07 up to 0.65.
