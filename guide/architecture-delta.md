# Architecture delta diagrams

Shows a change to a system as two pictures of the same topology, before and after, with a list of the changes between them. Use it for a migration, an extraction or a rewiring. It has exactly two states: it does not show the order of the migration. If only properties change and no box or arrow does, write a table instead.

## Composition

- Title at 40,52 (`style=h1`). Three panels side by side: Before, the list of changes, After. Each has a heading at y=104 (`text "Before" at X,104 size=14 weight=600`) and a caption naming the version at y=122 (`style=caption`). Separate the panels with `X,88 -- X,BOTTOM style=rule` (`--`: a plain line), 32pt clear of the content on both sides. Positions follow from the widths: Before from x=40 with width Wb (a column of 160-wide boxes is 160, or 216 with a moved box indented 56); rule at 40+Wb+32; the table 32 after it at x1 with width T; the second rule at x1+T+32; After 32 after that.
- Draw Before first: one column of boxes 160x64, rows every 104pt from y=152 (`y = 152 + 104*i`), so a labelled vertical arrow fits in the 40pt between them. Write `160x64` on every box. The rules end at the last row's bottom; the legend row goes 24 under it.
- Make After by copying Before and adding one number to every x. A box that survives stays exactly where it was. Move a box only when the move is itself a change. Never lay the two panels out separately: every shift reads as a change.
- A moved box is shifted sideways by 56pt or more in one panel, so the move can be seen but the box still overlaps the column and its arrows stay straight. Indent the column by that much from the panel's left edge to make room.
- A box that exists only in After keeps its slot in Before empty (the gap shows where it arrives), or sits beside its neighbour in After if the column is full; it gets no Before copy. The same for a box only in Before.
- Limits: 8 different components, 10 different relationships, 8 changes. A box drawn in both panels counts once.

## Marking change

Every box that changes carries a `tag=` with a sign and the word, and an outline that says the same thing without colour:

| Change | Tag | Drawn as |
|---|---|---|
| unchanged | none | `node` |
| changed (same thing, new version or contract) | `tag="~ CHANGED"` | `focal`, in both panels |
| added (After only) | `tag="+ ADDED"` | `node` with `sw=2` |
| removed (Before only) | `tag="− REMOVED"` | `optional` (dashed) |
| moved | `tag="→ MOVED"` | `node` with `dash=1,3` (dotted), in both panels |

Put the old value in `sub=` in Before and the new one in After (`/orders · v1`, `/orders · v2`). The accent goes to the changed component only. Do not give each kind of change its own colour.

## Arrows

- Label every arrow with a short id and its protocol or change: `"r1 · HTTPS"`, `"r2 · rewired"`. The list refers to these ids.
- Unchanged: plain arrow. Added: `sw=1.8`. Removed: `style=return`. Rewired (same relationship, another end): `dash=2,3`, in both panels, always with the word "rewired" in its label. A moved box has a dotted outline and a rewired arrow a dotted line: the label and the tag, not the dots, tell them apart.
- To or from a moved box, give the same x on both ends so the line is straight: `b_legacy.bottom@148 -> b_worker.top@148`. Choose an x at least 40pt inside both boxes.

## The list of changes

A table in the middle panel, its top level with the first row of boxes:

```
ledger: table "7 changes" at 320,152
  | "01" "CHANGED" "api" "Orders API v1 → v2"
  | "06" "REMOVED" "r3"  "Dispatcher → worker"
  | ---
  | ""   "KEPT"    ""    "Storefront · database · r1 · r5"
```

- One row for every mark in the pictures, and no mark without a row. A box that is changed and moved gets two rows.
- Each row names the change, the id, and what is different ("v1 → v2", "dispatcher → queue"). "Updated" says nothing.
- Give the table its width, so the panels can be planned: `T = 164 + 6*L` for the longest description of L characters, rounded up to 4 (L=30 gives 344, L=38 gives 392). Keep descriptions under 40 characters. Write it as `at 320,152 344x0`.

## Legend

The marks are overrides, so `legend` cannot draw them. Build one row by hand 24pt under the panels: `40,Y -- RIGHT,Y style=rule` (RIGHT = the right edge of After's widest box), `text "Legend" at 40,Y+16 style=eyebrow`, then, left to right on one row, for each mark a 14x10 swatch with the same style and overrides (`node at X,Y+28 14x10 radius=2 sw=2`) and its name (`text "Added" at X+20,Y+36 style=caption`), and for each arrow kind a 28pt sample (`X,Y+33 -> X+28,Y+33 dash=2,3`, or `--` for a plain one) with its name at X+34. Each next X is the last name's x plus `6 * its characters + 24`: "Unchanged" at 60 makes the next swatch at 60+54+24=138. The `legend` statement cannot draw the dotted and heavy marks, so this row is hand-built.
