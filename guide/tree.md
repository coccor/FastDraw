# Tree diagrams

Shows a hierarchy of things: a taxonomy, a dependency tree, a breakdown of one idea into parts. For people, teams and who owns what, use the org-chart guide instead.

## Composition

- Title at `40,52` (`style=h1`). The root's top edge is y=96. Write `WxH` on every box (the default 144x64 is wrong here).
- The root sits at the top, centred. Each level is one row; all boxes in a row share a top edge and a height of 48. Rows are 120pt apart (48pt box, 72pt gap): y = 96, 216, 336, 456.
- Plan from the bottom. Place the leaves first: 144 wide, 24pt apart. A row of n leaves is `168n - 24` wide; start it at x=40. Then centre each parent over its own children (its centre x is the mean of its first and last child's centre x), and the root over the centre of the leaf row.
- Use two box widths at most: 160 for the root and branches, 144 for leaves.
- When the order of branches means nothing, order them so the tree is symmetrical (for children counts 2, 1, 2 rather than 2, 2, 1).
- Limits: four levels including the root, and five children under one parent. A bigger tree is split into an overview and one diagram per branch.
- Never skip a level: a box connects only to the row directly above it.
- Styles: `focal` for one box, either the root or the one leaf the diagram is about, never both. `node` for branches. `cloud` for leaves, so the bottom row reads as quieter. (Not `store`: that means data, and many looks draw it as a cylinder.)
- Main text is the name; `sub=` (small sans) is two or three words of detail. Leave `tag=` out: a 48pt box has no room for it. Leave icons out too: a tree of text needs none.

## Connectors

Connectors are plain lines with square corners: no arrowheads, no diagonals, no labels. Write them with `--` and `style=relation` (a plain `--` is a straight slanted line). Lines that start at the same point share a trunk, so give every child the same start point on the parent and the bus appears by itself, half-way between the rows:

```
root.bottom@0.5 -- design.top style=relation
root.bottom@0.5 -- research.top style=relation
root.bottom@0.5 -- eng.top style=relation
```

- Do not write `root.bottom -- x.top` without `@0.5`: the lines are then spread along the parent's edge and `check` reports them.
- A parent with one child: `research.bottom -- investigate.top style=relation`. Keep the two centred on each other so the line is straight.
- Nothing needs updating by hand when a box moves.

## Legend

One `legend at 40,Y` statement, 32pt under the leaf row, with an entry for each box style used.
