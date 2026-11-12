# IT current-state diagrams

Shows the landscape as it is today, before a change is proposed: the systems, files and people, grouped by phase or department, the hand-offs between them, and where it hurts. It is the "before" picture that a proposal answers, so the pain points must be the first thing the reader sees.

## Composition

- Title at 40,52 (`style=h1`), optional summary at 40,88. Two to four zones side by side, one per phase or department (Collection, Processing, Dissemination), in the order the work moves, each `dash=none` for a solid outline (the built-in look dashes zones). All start at y=136 and have the same height.
- Inside a zone, one column of boxes: 64 high, the first 40px below the zone's top edge, then every 112px (48px between boxes, room for a labelled arrow). Rows are shared by all zones: y=176, 288, 400. A zone with three rows is 352 high, with r rows `40 + 112*r - 48 + 16` = `112*r + 8`.
- A zone is its boxes plus 16px on each side. Boxes are 208 wide; a zone whose names are long may use 240.
- Leave 104px between zones: for a zone's right edge Z, the gap is x=Z to Z+104. Arrows that cross turn in this gap, and their labels sit in it. Zones at x=40, 384, 728 with 240 width fit a 1008 canvas; for n zones the canvas is `40 + 344*n`.
- A zone with only one or two boxes: start it at the row of its first box minus 40 (y=248 for row 2) and end it at the common bottom, so it holds no empty rows. Do not leave a free row inside a zone.
- At most five boxes in a zone and sixteen in all. Beyond that, draw two diagrams.
- Main text is the name people use for the thing. `sub=` says what makes it what it is: format, schedule, or the problem ("no version control", "manual refresh").
- Styles: `node` for an ordinary system or file, `store` (a cylinder in the built-in look) for a system of record, `optional` (dashed) for anything outside the organisation, `focal` for a pain point. Boxes are 208x64 or 240x64: write the size on each, a `store` too (its default is 144x72). An `icon=` per box (`file`, `excel`, `database`, `server`, `laptop`, `user`, `phone`) shows what kind of thing it is; use it on every box or none.
- A one-line summary under the title helps: `text "..." at 40,88`.

## Focus

At most two `focal` boxes: the pain points the proposal is about. If everything that is bad is marked, nothing is. Say what is wrong in `sub=`. If you find a third, the diagram is telling two stories: split it.

## Arrows

- Every hand-off is labelled with what is passed or how: CSV, XLSX, copy, email. These labels are the evidence, so do not drop them.
- Inside a zone: a straight vertical arrow to the box below, `drive -> sheets "copy"`. The label is drawn to the right of the line.
- Into the next zone on the same row: a straight arrow. Label it over the gap: `lpos=X,Y` with X = Z+52 (the middle of the gap) and Y the line's y minus 10. Labels up to about 12 characters fit.
- Into the next zone on another row: give the turning points, in the gap: `online.right -> drive.left@208 "export" via=356,320;356,208 lpos=316,310`. The vertical is at x=Z+76 (356 for Z=280), and the label stays on the first stretch, centred at Z+36 (316), where it clears both the zone border (Z) and the vertical. So a label here is at most about 7 characters ("export", "XLSX"); for a longer one use Z+88 for the vertical and a 128px gap.
- Several arrows into one box: one point each, 16px apart (`drive.left@192`, `@208`, `@224`), and one vertical each, 16px apart (Z+76, Z+92), with the arrow from the lowest source turning nearest to the target and entering lowest. Then none of them cross. Let one be straight by starting it at the same y: `pos.right@192 -> drive.left@192`.
- Styles: a plain arrow for an ordinary hand-off, `style=return` (dashed) for one that crosses the organisation's edge, `style=primary` for the one or two hand-offs that cause the pain (the manual copy, the file sent around).
- Work moves left to right and downwards. An arrow pointing back is allowed only to or from an outside party, dashed.

## Legend

`legend at 40,Y` 24px under the zones (zones end at y=488 for three rows, so Y=512), with only the styles used: `focal="Pain point"`, `optional=`, `store=`, `arrow=`, `primary=`, `return=`.
