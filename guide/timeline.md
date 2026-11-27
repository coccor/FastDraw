# Timelines

Shows events in the order they happened, on one axis, with the distance between them equal to the time between them.

FastDraw has no timeline element. You build one from a line, small circles and text. Plain lines (axis, ticks, stems) are written with `--`.

## Building blocks

Title at `40,52` (`style=h1`); a one-line `caption` at `40,74` says "Spacing follows real elapsed time." The axis is at `Y = 232` (below). Below, `Y` stands for the axis y.

```
// the axis, with a short cap at each end and a tick at each boundary that matters
axis: 80,232 -- 920,232 stroke=muted/0.45 sw=1
80,224 -- 80,240 stroke=ink/0.2 sw=1
text "JAN '26" at 680,254 style=eyebrow anchor=middle color=soft

// an event: a stem, a dot centred on the axis, a date, a name, an optional detail
240,176 -- 240,232 stroke=ink/0.3 sw=1
e2: ellipse at 236,228 8x8 fill=ink stroke=none
text "APR 2025" at 240,148 style=eyebrow anchor=middle
text "Design v1" at 240,164 anchor=middle weight=600 color=ink
```

## Composition

- Work out the scale first and write it in a comment: the x of the first date and the pt per day, month or year. Every event's x comes from that sum. Never space events evenly because it looks tidier; if two are close in time they are close on the axis.
- The axis is one horizontal line from x=80 to 920. That length holds five to seven events.
- A dot is an `ellipse` 8x8 placed at `x-4, Y-4`. A major milestone is 12x12 at `x-6, Y-6` in the accent colour. At most two are major.
- Labels alternate: one event below the axis, the next above. This is what stops neighbours from colliding. If two events are still closer than their labels are wide (about 110pt), give one of them a longer stem (+40pt) so its label sits on a second level.
- Every label is centred on the event's x with `anchor=middle`, three lines on a 16pt pitch:
  - **Below**: stem from `Y` to `Y+56`; date baseline `Y+72`, name `Y+88`, detail `Y+104`.
  - **Above, no detail**: stem from `Y-56` to `Y`; name baseline `Y-68`, date `Y-84`.
  - **Above, with detail**: stem from `Y-72` to `Y`; detail baseline `Y-80`, name `Y-96`, date `Y-112`.
- Put a tick and a small label wherever the unit changes (a new year, a new quarter): tick `Y-8` to `Y+8`, label baseline `Y+22` under it. If an event stem below the axis is within 36pt of that x, put the label above instead (baseline `Y-14`). A reader must be able to tell what the unit is without reading every date.
- A faint large year helps when the timeline spans two or three years: `font=mono size=56 weight=600 color=ink/0.06` with baseline `Y+156`, centred on the middle of that year's stretch. That is under the lowest label (`Y+104`) and above the legend, where it overlaps nothing; `check` reports text that overlaps other text.

## Text

- The date is the `eyebrow` style (it does not upper-case: type the capitals), the name is plain text with `weight=600 color=ink`, the detail is `small`. Keep names to two or three words.
- A major milestone's stem and date take `stroke=accent` and `color=accent`; its name stays ink and may be `size=14`.

## Legend

The dots are not styles of the look, but `legend` takes dot entries: `legend at 40,408 dot.ink="Event" dot.accent="Major milestone"` (rule at `Y+176`).

## Traps

- If one stretch of the axis is empty for a long time, do not shrink it silently. Either keep it, or cut the axis there: end the line, leave a 16pt gap with two short slanted strokes, and start again.
- A stem must stop short of the label it points at; start it 12pt from the nearest text (the positions above do).
