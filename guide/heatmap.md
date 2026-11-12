# Heatmaps

Shows a number for every combination of two lists (service by sprint, team by week) as a grid of cells, darker for larger. The reader scans the whole grid and one cell or cluster stands out.

FastDraw has no heatmap element. Each cell is a plain `rect` with its value as text.

## Building blocks

```
// grid: columns from x=172, 120px apart; rows from y=72, 60px apart; cells 116x56 with a 4px gap
// fill = ink at (value / 9 * 0.65), at least 0.07: 9 is the largest value outside the focal cell
text "S1" at 230,60 style=small size=10 color=muted anchor=middle             // column name, centred over the cell
text "auth" at 160,104 style=small size=10 color=ink anchor=end                // row name, 12px left of the grid
a1: rect "4%" at 172,72 116x56 fill=ink/0.29 stroke=none radius=0 title.size=9 title.font=mono title.weight=400
a3: rect "6%" at 412,72 116x56 fill=ink/0.43 stroke=none radius=0 title.size=9 title.font=mono title.weight=400 title.color=#ffffff
p4: rect "47%" sub="REGRESSION" at 532,132 116x56 fill=accent/0.85 stroke=accent sw=1.2 radius=0 title.size=12 title.weight=700 title.font=mono sub.color=ink sub.size=8
```

## Composition

- Three to seven rows and three to eight columns. Fewer is a table; more makes the cells too small to read.
- Cells are 116x56 with a 4px gap for up to six columns on a 1000px canvas. For seven or eight columns narrow them to 88px (pitch 92); never below 80px.
- The grid starts at x=172, leaving room for row names. Row names are right-aligned at 12px left of the grid, baseline 32px below the cell top. Column names are centred over each column, baseline 12px above the grid.
- Name both lists with `eyebrow` text: one centred above the column names, one turned with `rotate=-90` at the far left, level with the middle of the grid.
- Canvas height = grid bottom + 100 for the legend.
- Keep the order the reader expects (time left to right; rows alphabetical or by size) and show every row and column. If you leave any out, say so under the legend.

## Colour

- One scale of one colour: `fill=ink/OPACITY`, with opacity rising with the value from 0.07 (smallest; lower cannot be told from the paper) to 0.65 (largest). Work out `value / largest * 0.65` to two decimals and write the rule in a comment.
- No second hue and no colour per row or column. A two-colour scale is right only for values that run both sides of a meaningful zero.
- One cell, the one the diagram is about, is `fill=accent/0.85 stroke=accent`. If its value is far above the rest, leave it out of the scale (take "largest" from the other cells), or every other cell turns equally pale. Then state its value in the legend.

## Text

- Every cell shows its value, in mono size 9. From opacity 0.40 up, the text is white (`title.color=#ffffff`); below, it keeps the default ink.
- The focal cell has a larger bold value and may carry one word under it in `sub=`.
- Put the unit in the cells (`4%`) or in the note under the legend, not in both.

## Legend

By hand, because the cells are not styles of the look: a `rule` line 20px under the grid; on one line "Legend" in `eyebrow`, then "Low", six to eight 20x12 rects stepping through the opacities used, "High", then a rect in the focal fill with a `caption` that says what happened there. One more `caption` line below states what the number is and the range the grey scale covers.
