# Gantt charts

Shows a plan: tasks as bars against a time axis, grouped into phases, so the reader sees what overlaps and what comes after what.

FastDraw has no Gantt element. You build one from zones, plain rects, lines and text.

## Building blocks

```
text "Product launch plan" at 40,52 style=h1
// time: week 1 starts at x=232, 64px per week, 12 weeks (ends at 1000)
p1: zone "Discovery" at 40,136 1000x96 title.align=left dash=none stroke=ink/0.1   // a phase, behind its rows

zone at 296,124 1x356 fill=ink/0.06 stroke=none radius=0         // a week line
zone at 488,92 1x388 fill=ink/0.16 stroke=none radius=0          // a month boundary

text "April" at 360,108 size=9 weight=600 color=ink anchor=middle
text "W1" at 264,120 style=small size=8 color=soft anchor=middle
232,124 -- 1000,124 stroke=ink/0.2 sw=0.8                        // under the header
232,92 -- 232,480 stroke=ink/0.2 sw=0.8                          // after the name column

text "Market research" at 56,176 size=10 weight=600 color=ink
t1: rect at 232,160 128x24 radius=4 fill=muted/0.15 stroke=muted // weeks 1 and 2
```

## Composition

- Fix the scale first and write it in a comment: the x where time starts and the px per unit. A bar starts at `start + (first unit - 1) * pitch` and is `units * pitch` wide. Pick a pitch that is a multiple of 4 (64px per week). Canvas width = start + n * pitch + 80, so the phase zones (x=40, width = start + n * pitch - 40) end 40px short of the right edge.
- Names are in a column on the left, x=56 to 232, on the zones' inner side. Time runs from x=232 to the right.
- Rows are 40px apart. A bar is 24px high. The task name's baseline is 16px below the top of its bar.
- A phase is a `zone` across the full width with `title.align=left`; write `dash=none stroke=ink/0.1` (the built-in zone is dashed). Its first bar starts 24px below the zone's top and the zone ends 8px below its last bar: height = 40 * rows + 16. The first zone starts at y=136; each next one 8px below the previous.
- Header, under the title: the larger unit (months) as names centred over their span at y=108, the smaller unit (weeks) as tiny labels centred in each column at y=120, then a line at y=124. Without the unit named, the chart cannot be read.
- Draw the vertical grid as zones 1px wide, not as lines (or as lines with `layer=back`). A plain line that runs behind a bar makes `check` report "passes through"; a zone is drawn behind everything and is not reported. Write them after the phase zones. Week lines run from y=124 to the bottom of the last phase; boundaries of the larger unit are darker and start at y=92.
- A "today" marker is one more 1px zone with `fill=accent/0.6` starting at y=92, with a small label above it at y=86.
- Twelve tasks at most, and no more than five running at once in one phase. For a bigger plan, draw one bar per phase and put the detail in a second diagram.

## Focus

- One bar is the task everything depends on: `fill=accent/0.12 stroke=accent`, with its name in `color=accent`. All other bars look alike.
- A word on a bar (`GATE`) is `small` text centred on it, `anchor=middle`, baseline 16px below the bar top. Do not write dates on bars; the axis carries them.

## Arrows

None, as a rule. Bar positions already show order. Add a dependency arrow only where one task cannot start before another ends and the reader would not guess it, and no more than three. Leave the bottom of the earlier bar 16px before its end and enter the left side of the later bar: `t4.bottom@632 -> t5.left`. Do not write `t4.right -> t5.left`: when one bar ends where the next begins, the two points have the same x and nothing is drawn.

## Legend

The bars are not styles of the look, so use tinted swatches, 24px under the last phase: `legend at 40,Y swatch.accent/0.2="The gate" swatch.muted/0.2="Task" swatch.ink/0.06="Phase"` (add `line.accent="Today"` if there is a marker). Canvas height = bottom of the last phase + 80.
