# Waterfall charts

Shows how a starting total becomes an end total through a series of additions and subtractions: a budget bridge, a headcount walk. Every bar is either a total standing on the axis or a step floating between two running totals.

## Building blocks

```
// title at 40,52; plot 96,104 to 960,424; y 0..400 over 320pt, so 0.8pt per unit: value v is at y = 424 - 0.8v
wf: chart at 96,104 864x320 y=0..400 step=100 labels=1 stack=1 key=0 ytitle="Cloud spend · $k / month"
    x="FY25 base,Headcount,Reserved inst.,ML workloads,Storage tiering,FY26 plan"
  | bars "Total"   0,240 _       _       _       _       0,236 fill=ink
  | bars "Added"   _     240,304 _       266,288 _       _     fill=muted
  | bars "Removed" _     _       304,266 _       _       _     fill=soft
  | bars "Focus"   _     _       _       _       288,236 _     fill=accent

213,232 -- 267,232 stroke=ink/0.55 sw=1          // carry (plain line, --): the total of 240 crosses the gap to the next bar
```

- Write every bar as a pair `from,to`: the running total before it and after it. A total is `0,value`. A step down is written high to low (`304,266`); its label is then printed below the bar with a minus sign.
- One `bars` series per kind of bar, with `_` in the columns that belong to another series, and `stack=1` on the chart so that each bar keeps the full column width.
- Check the sums before drawing: each `from` equals the `to` of the bar before it, and the last step ends on the end total. A waterfall that does not add up is wrong, not approximate.

## Composition

- Title at 40,52 (`style=h1`). Plot `at 96,104 864x320` (the axis title sits above the plot, clear of the heading), legend at y=472.
- Three to eight bars, totals included, in the order of the story: start total, steps, end total. One subtotal in the middle at most (a pair `0,value` in the Total series). Merge small steps into one named "Other".
- The y axis starts at 0 (`y=0..N`). Pick N and the plot height so that a unit is a simple number of pt; it makes the carry lines easy to place.
- Leave out a step of zero. It would be an invisible bar holding a column.
- All bars are in one unit, named once in `ytitle=`.

## Carry lines

A thin line joins each bar to the next at the running total between them. Without it the chart is bars at odd heights. The chart element does not draw these; add one plain line per gap:

- There are n-1 carries, one per gap. y is the level of the running total after bar i: `plot bottom - value * pt per unit` (424 - 0.8v here).
- With n columns, column width `cw = plot width / n`, column i (from 0) is centred at `cx_i = plot x + cw * (i + 0.5)`, and a bar reaches `h = 0.32 * cw - 1` pt either side. Carry i runs from `cx_i + h` to `cx_(i+1) - h` (n=6, 864pt: cw 144, h 45, so the first carry is x=213 to 267; n=7: cw 123.4, h 38.5, first carry 197 to 242).
- `stroke=ink/0.55 sw=1`, written with `--`. These coordinates follow the data; do not round them to multiples of 4.

## Colour

- Totals `fill=ink`, the heaviest marks. Increases `fill=muted`, decreases `fill=soft`: direction is told by dark and light, not by red and green.
- At most one step, the one the chart is about, takes `fill=accent`.
- `labels=1` prints every value: increases with a plus sign (`+60`), decreases with a minus (`-45`), totals bare. The bar colour says the same.

## Legend

`legend at 40,472 swatch.ink="Start and end total" swatch.muted="Added" swatch.soft="Removed" swatch.accent="..."`: one entry per colour used.
