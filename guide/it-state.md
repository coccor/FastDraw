# IT current-state diagrams

Shows the landscape as it is today, before a change is proposed: the systems, files and people, grouped by phase or department, the hand-offs between them, and where it hurts. It is the "before" picture that a proposal answers, so the pain points must be the first thing the reader sees.

## Composition

- Two to four zones side by side, one per phase or department (Collection, Processing, Dissemination), in the order the work moves. All zones start at y=136 and have the same height.
- Inside a zone, one column of boxes: 64 high, the first 40px below the zone's top edge, then every 112px (48px between boxes, room for a labelled arrow). Rows are shared by all zones: y=176, 288, 400. A zone with three rows is 352 high.
- A zone is its boxes plus 16px on each side. Boxes are 208 wide; a zone whose names are long may use 240.
- Leave 104px between zones. Arrows that cross from one zone to the next turn in this gap, and their labels sit in it.
- At most five boxes in a zone and sixteen in all. Beyond that, draw two diagrams.
- Main text is the name people use for the thing. `sub=` says what makes it what it is: format, schedule, or the problem ("no version control", "manual refresh").
- Styles: `node` for an ordinary system or file, `store` for a system of record, `optional` (dashed) for anything outside the organisation, `focal` for a pain point.
- A one-line summary under the title helps: `text "..." at 40,88`.

## Focus

At most two `focal` boxes: the pain points the proposal is about. If everything that is bad is marked, nothing is. Say what is wrong in `sub=`. If you find a third, the diagram is telling two stories: split it.

## Arrows

- Every hand-off is labelled with what is passed or how: CSV, XLSX, copy, email. These labels are the evidence, so do not drop them.
- Inside a zone: a straight vertical arrow to the box below, `drive -> sheets "copy"`. The label is drawn to the right of the line.
- Into the next zone on the same row: a straight arrow. Label it over the gap: `lpos=X,Y` with X the middle of the gap and Y the line's y minus 10.
- Into the next zone on another row: give the turning points, in the gap: `online.right -> drive.left@208 "export" via=356,320;356,208 lpos=316,310`. Keep the label on the first stretch, beside the source, where it says what leaves that box.
- Several arrows into one box: one point each, 16px apart (`drive.left@192`, `@208`, `@224`), and one vertical each, 16px apart, with the arrow from the lowest source turning nearest to the target and entering lowest. Then none of them cross. Let one be straight by starting it at the same y: `pos.right@192 -> drive.left@192`.
- Styles: a plain arrow for an ordinary hand-off, `style=return` (dashed) for one that crosses the organisation's edge, `style=primary` for the one or two hand-offs that cause the pain (the manual copy, the file sent around).
- Work moves left to right and downwards. An arrow pointing back is allowed only to or from an outside party, dashed.

## Legend

`legend at 40,Y` 24px under the zones, with only the styles used: `focal="Pain point"`, `optional=`, `store=`, `arrow=`, `primary=`, `return=`.
