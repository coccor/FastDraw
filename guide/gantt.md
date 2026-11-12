# Gantt charts

Shows a plan: tasks as bars against a time axis, grouped into phases, so the reader sees what overlaps and what comes after what.

FastDraw has no Gantt element. You build one from zones, plain rects, lines and text.

## Building blocks

```
// time: week 1 starts at x=200, 64px per week, 12 weeks (ends at 968)
p1: zone "Discovery" at 12,76 976x96 title.align=left            // a phase, behind its rows

zone at 264,64 1x364 fill=ink/0.06 stroke=none radius=0          // a week line
zone at 456,36 1x392 fill=ink/0.16 stroke=none radius=0          // a month boundary

text "April" at 328,48 size=9 weight=600 color=ink anchor=middle
text "W1" at 232,59 style=small size=7 color=soft anchor=middle
200,64 -- 968,64 stroke=ink/0.2 sw=0.8                           // under the header
200,36 -- 200,428 stroke=ink/0.2 sw=0.8                          // after the name column

text "Market research" at 24,116 size=10 weight=600 color=ink
t1: rect at 200,100 128x24 radius=4 fill=muted/0.15 stroke=muted // weeks 1 and 2
```

## Composition

- Fix the scale first and write it in a comment: the x where time starts and the px per unit. A bar starts at `start + (first unit - 1) * pitch` and is `units * pitch` wide. Pick a pitch that is a multiple of 4 (64px per week fits 12 weeks in a 1000px canvas).
- Names are in a column on the left, x=24 to 200. Time runs from x=200 to the right.
- Rows are 40px apart. A bar is 24px high. The task name's baseline is 16px below the top of its bar.
- A phase is a `zone` across the full width with `title.align=left`. Its first bar starts 24px below the zone's top and the zone ends 8px below its last bar. Leave 8px between zones.
- Header: the larger unit (months) as names centred over their span, the smaller unit (weeks) as tiny labels centred in each column, then a line. Without the unit named, the chart cannot be read.
- Draw the vertical grid as zones 1px wide, not as lines. A line that runs behind a bar makes `check` report "passes through"; a zone is drawn behind everything and is not reported. Write them after the phase zones. Make boundaries of the larger unit darker and taller than the others.
- A "today" marker is one more 1px zone with `fill=accent/0.6`, with a small label above the header line.
- Twelve tasks at most, and no more than five running at once in one phase. For a bigger plan, draw one bar per phase and put the detail in a second diagram.

## Focus

- One bar is the task everything depends on: `fill=accent/0.12 stroke=accent`, with its name in `color=accent`. All other bars look alike.
- A word on a bar (`GATE`) is `small` text centred on it, `anchor=middle`, baseline 16px below the bar top. Do not write dates on bars; the axis carries them.

## Arrows

None, as a rule. Bar positions already show order. Add a dependency arrow only where one task cannot start before another ends and the reader would not guess it, and no more than three. Leave the bottom of the earlier bar 16px before its end and enter the left side of the later bar: `t4.bottom@632 -> t5.left`. Do not write `t4.right -> t5.left`: when one bar ends where the next begins, the two points have the same x and nothing is drawn.

## Legend

The bars are not styles of the look, so draw the legend by hand: a `rule` line 16px under the grid, "Legend" in `eyebrow`, then a 20x12 `rect` for the accent bar, one for a plain bar and one with the zone's fill for a phase, each with a `caption`.
