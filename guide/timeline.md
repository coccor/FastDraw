# Timelines

Shows events in the order they happened, on one axis, with the distance between them equal to the time between them.

FastDraw has no timeline element. You build one from a line, small circles and text.

## Building blocks

```
// the axis, with a short cap at each end and a tick at each boundary that matters
axis: 80,240 -- 920,240 stroke=muted/0.45 sw=1
80,232 -- 80,248 stroke=ink/0.2 sw=1
text "JAN '26" at 680,262 style=eyebrow anchor=middle color=soft

// an event: a stem, a dot centred on the axis, a date, a name, an optional detail
240,184 -- 240,240 stroke=ink/0.3 sw=1
e2: ellipse at 236,236 8x8 fill=ink stroke=none
text "APR 2025" at 240,156 style=eyebrow anchor=middle
text "Design v1" at 240,172 anchor=middle weight=600 color=ink
text "typography pass" at 240,188 style=small anchor=middle    // then start the stem lower
```

## Composition

- Work out the scale first and write it in a comment: the x of the first date and the px per day, month or year. Every event's x comes from that sum. Never space events evenly because it looks tidier; if two are close in time they are close on the axis.
- The axis is one horizontal line across the middle of the canvas, 80px in from each side. A canvas 1000 wide and about 420 high holds five to seven events.
- A dot is an `ellipse` 8x8 placed at `x-4, axisY-4`. A major milestone is 12x12 at `x-6, axisY-6` in the accent colour. At most two are major.
- Labels alternate: one event below the axis, the next above. This is what stops neighbours from colliding. If two events are still closer than their labels are wide (about 110px), give one of them a longer stem so its label sits on a second level.
- Stems are 56px long. Below the axis: the date baseline is 72px under the axis, the name 16px under the date, the detail 16px under the name. Above: the name baseline is 68px over the axis, the date 16px above it. With a detail line above, move date and name up 20px and put the detail 4px above the top of the stem.
- All three lines of a label are centred on the event's x with `anchor=middle`.
- Put a tick and a small label wherever the unit changes (a new year, a new quarter). A reader must be able to tell what the unit is without reading every date.
- A faint large year behind the axis (`font=mono size=56 weight=600 color=ink/0.06`) helps when the timeline spans two or three years. Put it in a gap between labels: `check` reports text that overlaps other text.

## Text

- The date is the `eyebrow` style, the name is plain text with `weight=600 color=ink`, the detail is `small`. Keep names to two or three words.
- A major milestone's stem and date take `stroke=accent` and `color=accent`; its name stays ink and may be `size=14`.

## Legend

The dots are not styles of the look, so the `legend` statement cannot list them. Draw the legend by hand: a `rule` line, the word "Legend" in `eyebrow`, then a dot and a `caption` for each kind of event. Say in one caption that spacing follows real time.

## Traps

- If one stretch of the axis is empty for a long time, do not shrink it silently. Either keep it, or cut the axis there: end the line, leave a 16px gap with two short slanted strokes, and start again.
- A stem must stop short of the label it points at; start it 12px from the nearest text.
