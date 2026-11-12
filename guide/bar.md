# Bar charts

Compares one number per category: velocity per sprint, revenue per month. The dumbbell variant compares two numbers per category and shows the gap between them.

## Building blocks

```
// title at 40,52; plot area 96,112 to 960,404 on a 1000x528 canvas
text "Velocity per sprint" at 40,52 style=h1
vel: chart at 96,112 864x292 x="S1,S2,S3,S4,S5" y=0..120 step=20 labels=1 key=0 ytitle="Story points per sprint"
  | bars "Velocity" 72 88 95 78 110 fill=soft fill.5=accent
legend at 40,456 swatch.accent="Sprint 5 · record high" swatch.soft="Other sprints"
```

- The `chart` element draws axes, grid, tick labels, bars and values. Never work out bar heights yourself.
- A series has one colour; one bar of it takes its own with its position from 1: `fill=soft fill.5=accent` (the fifth bar). Do not make a second series for it: that needs `stack=1` and `_` gaps to keep the bars centred.

## Composition

- Title at 40,52 (`style=h1`). Canvas 1000x528. Plot area `at 96,112 864x292`: that leaves room for the axis title above the plot (it sits about 28px over the top edge), tick labels on the left, category names below (to y=432) and the legend at y=456, with 70px of canvas under it.
- Four to eight bars. With more, group them into longer periods or draw two charts.
- The y axis starts at 0. Always write `y=0..N` with N a round number just above the largest value; a cut axis makes small differences look large.
- `step=` gives four to six grid lines.
- `labels=1` writes each value over its bar. Name the unit once with `ytitle=` (it is drawn above the top-left corner of the plot); do not repeat it in every label.
- Category names are short (`S1`, `Q3`, `Mar`). Names longer than about 12 characters collide: shorten them, or use the dumbbell layout below, which has room for names on the left.
- Keep the default bar width (`bar.width=0.64`). The gap must stay narrower than the bar.

## Focus

- One bar takes `fill=accent`: the one the chart is about. Every other bar is `fill=soft`.
- Two series compared across categories: two `bars` rows without `stack=1`, the main one `fill=accent`, the other `fill=soft`. No more than two.
- Stacked parts of a total: `stack=1`, the part that matters in accent and the rest in `soft`, `muted`, `ink`. `labels=1` then labels every segment; three segments per bar at most.

## Dumbbell

Two dots per row on one horizontal scale, joined by a line: before and after, target and actual. The chart element has no horizontal bars, so use it with a numeric x axis and put each row at a height of your choosing:

```
// 5 rows: y runs 0..n for n rows, and row i (from the top, from 0) sits at y = n - 0.5 - i
// plot top 104, 320 high: row i is centred at 104 + 320 * (i + 0.5) / n
db: chart at 200,104 760x320 x=0..100 xstep=20 xunit="%" y=0..5 step=10 yaxis=0 grid=both key=0 xtitle="Builds passing first time"
  | line 34,4.5 71,4.5 stroke=ink/0.55 sw=1         // one connector per row, written before the dots
  | line 52,3.5 80,3.5 stroke=ink/0.55 sw=1
  | dots "2024" 34,4.5 52,3.5 fill=muted r=5
  | dots "2025" 71,4.5 80,3.5 fill=accent r=6
text "Platform" at 188,140 anchor=end size=11 weight=600 color=ink    // baseline = row centre (136) + 4
text "34" at 446,139 anchor=end style=small color=muted               // x of value v = 200 + 760 * v / 100, then 12px outside the dot; baseline = centre + 3
text "71" at 752,139 style=small color=muted
legend at 40,484 dot.muted="2024" dot.accent="2025" title="Rows ordered by 2025 value"
```

- `step=10` (larger than the y range) and `yaxis=0` remove the horizontal grid and the row axis numbers; `grid=both` draws the vertical lines.
- Title at 40,52. Leave 200px on the left for row names, right-aligned 12px before the plot, baseline 4px below the row centre. The legend goes 24px under the axis title (y=484 here), canvas 560 high. With fewer than five rows keep `y=0..n` and shrink the plot height (64px per row) so it does not end in empty space.
- Four to eight rows, 48 to 88px apart. Sort them and say by what in the legend heading.
- The scale starts at 0, as for bars. Write both values beside each pair, outside it: the smaller one right-aligned 12px left of the left dot, the larger 12px right of the right dot. A value at 0 would land on the row name; write it above its dot instead.
- The accent marks the same end on every row (the newer or the actual value). Do not also highlight one row.
- Two dots only. With three per row the line means nothing.

## Legend

One `legend` statement with `swatch.COLOUR=` entries (bars) or `dot.COLOUR=` entries (dumbbell), 24px under the category names (y=456 for the bar layout above). Use plain colour names in bar fills (`soft`, not `soft/0.4`) so the legend swatch matches the bars.
