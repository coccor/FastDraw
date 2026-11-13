# Process diagrams

Shows a business process that passes between several teams: who does each step, what goes into the step and what comes out, and with which tool. Rows are the actors, columns are the steps in order. If what goes in and out and the tools do not matter, a plain swimlane is enough; if there is one actor, draw a flowchart.

## Composition

- Columns: one per step, 152px apart. The first column centre is x=248; the left 128px (x=40 to 168) holds the lane names. Canvas width = 248 + (steps − 1) × 152 + 104.
- Title: `text "..." at 40,52 style=h1`. Step header above each column: a numbered chip, `ellipse "1" at cx-12,96 24x24 fill=ink/0.08 stroke=none title.size=9`, and under it `text "Order" at cx,136 style=eyebrow anchor=middle`. One word per step.
- Lanes: one per actor, 96px high, across the full width, the first starting at y=148 (lane i at 148 + 96 * i). Tint every second lane (the first, third, ...) with `zone at 40,y WxH radius=0 stroke=none` (no text), W = canvas width − 80. Draw a `style=rule` line (written with `--`) on every lane border and one vertical line at x=168 (`168,148 -- 168,<bottom> stroke=ink/0.2 sw=1`) to close off the names. Lane name: `text "Customer" at 104,<lane top + 51> style=eyebrow anchor=middle`.
- A box goes where an actor does a step: 128x72, centred on the column, 12px below the top of the lane. A cell where nothing happens stays empty: no box, no dash.
- Order the lanes so that the process moves down the page as it moves right, and neighbours in the process are neighbours on the page where possible.
- Six lanes and twelve steps at most. More: an overview diagram and a detail diagram.

## A box

`sub=` holds one line only, and this kind needs three, so leave the box's own text empty and write the lines as text, centred on the column:

```
alloc: focal tag="WHS" at 488,352 128x72
text "Allocate stock" at 552,388 weight=600 anchor=middle                              // what is done: box top + 36
text "order → pick list" at 552,403 style=caption anchor=middle                       // in → out: box top + 51
text "inventory system" at 552,415 style=caption anchor=middle color=soft              // tool: box top + 63
```

`tag=` is a three or four letter code for the actor (CUS, SUP, WHS): its first letters, or the usual short name; a lane called "Platform team" is PLAT. It lets a box say whose it is when quoted alone. The second and third lines are `style=caption`, the same sans as a box's own `sub=`, with the tool line in `color=soft`. Text on a `focal` box keeps the default ink on a pale fill, as above; only on a solid accent fill (a look that draws `focal` that way) does it need `color=#ffffff`. `fastdraw check` warns when text cannot be read. Keep the name under 17 characters and the other lines under 20.

## Arrows

- To a box in another lane: out of the right side, one bend, into the top (target below) or the bottom (target above): `place.right -> verify.top`. Never into the left side of a box in another lane, never diagonal.
- To the next box in the same lane: `pick -> pack`, a short straight arrow.
- No labels. The step number and the lane already say what happens. Label an arrow only when it is not a step (a retry, an escalation).
- An arrow may run through empty cells, never through a box. If two arrows would cross, reorder the lanes.
- Something that only triggers a step (a schedule, a manual override) uses `style=return`.

## Emphasis

One step is the one the process turns on. Its box is `focal`, its header chip and name are accent (`fill=accent/0.16 title.color=accent` on the chip, `color=accent` on the name), and the arrows into and out of it use `style=primary`. Nothing else.

## Legend

`legend at 40,Y node="A step, in the lane of who does it" focal="..." primary="Critical handoff" arrow="Handoff"`, 24px under the last lane (Y = 148 + 96 * lanes + 24); canvas height = Y + 68.
