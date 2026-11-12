# Waterfall charts

Shows how a starting total becomes an end total through a series of additions and subtractions: a budget bridge, a headcount walk. Every bar is either a total standing on the axis or a step floating between two running totals.

## Building blocks

```
// plot 96,52 to 960,372; y 0..400 over 320px, so 0.8px per unit: value v is at y = 372 - 0.8v
wf: chart at 96,52 864x320 y=0..400 step=100 labels=1 stack=1 key=0 ytitle="Cloud spend · $k / month"
    x="FY25 base,Headcount,Reserved inst.,ML workloads,Storage tiering,FY26 plan"
  | bars "Total"   0,240 _       _       _       _       0,236 fill=ink
  | bars "Added"   _     240,304 _       266,288 _       _     fill=muted
  | bars "Removed" _     _       304,266 _       _       _     fill=soft
  | bars "Focus"   _     _       _       _       288,236 _     fill=accent

213,180 -- 267,180 stroke=ink/0.55 sw=1          // carry: the total of 240 crosses the gap to the next bar
```

- Write every bar as a pair `from,to`: the running total before it and after it. A total is `0,value`. A step down is written high to low (`304,266`); its label is then printed below the bar with a minus sign.
- One `bars` series per kind of bar, with `_` in the columns that belong to another series, and `stack=1` on the chart so that each bar keeps the full column width.
- Check the sums before drawing: each `from` equals the `to` of the bar before it, and the last step ends on the end total. A waterfall that does not add up is wrong, not approximate.

## Composition

- Canvas 1000x500, plot `at 96,52 864x320`, legend at y=420.
- Three to eight bars, totals included, in the order of the story: start total, steps, end total. One subtotal in the middle at most (a pair `0,value` in the Total series). Merge small steps into one named "Other".
- The y axis starts at 0 (`y=0..N`). Pick N and the plot height so that a unit is a simple number of px; it makes the carry lines easy to place.
- Leave out a step of zero. It would be an invisible bar holding a column.
- All bars are in one unit, named once in `ytitle=`.

## Carry lines

A thin line joins each bar to the next at the running total between them. Without it the chart is bars at odd heights. The chart element does not draw these; add one plain line per gap:

- y is the level of the running total: `plot bottom - value * px per unit`.
- With n columns, column i (from 0) is centred at `plot x + plot width * (i + 0.5) / n`, and a bar reaches `0.32 * column width - 1` px either side of that. With six columns in 864px: centres 168, 312, 456 ..., bars 45px either side, so the first carry runs from x=213 to x=267.
- `stroke=ink/0.55 sw=1`. These coordinates follow the data; do not round them to multiples of 4.

## Colour

- Totals `fill=ink`, the heaviest marks. Increases `fill=muted`, decreases `fill=soft`: direction is told by dark and light, not by red and green.
- At most one step, the one the chart is about, takes `fill=accent`.
- `labels=1` prints every value. Increases are printed without a plus sign; the minus on decreases and the bar colour tell them apart.

## Legend

`legend at 40,420 swatch.ink="Start and end total" swatch.muted="Added" swatch.soft="Removed" swatch.accent="..."`: one entry per colour used.
