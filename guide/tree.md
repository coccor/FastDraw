# Tree diagrams

Shows a hierarchy of things: a taxonomy, a dependency tree, a breakdown of one idea into parts. For people, teams and who owns what, use the org-chart guide instead.

## Composition

- The root sits at the top, centred. Each level is one row; all boxes in a row share a top edge and a height of 48.
- Rows are 120px apart (48px box, 72px gap).
- Plan from the bottom. Place the leaves first: 144 wide, 24px apart, the whole row centred in the canvas. Then centre each parent over its own children, and the root over the canvas centre.
- Use two box widths at most: 160 for the root and branches, 144 for leaves.
- When the order of branches means nothing, order them so the tree is symmetrical (for children counts 2, 1, 2 rather than 2, 2, 1).
- Limits: four levels including the root, and five children under one parent. A bigger tree is split into an overview and one diagram per branch.
- Never skip a level: a box connects only to the row directly above it.
- Styles: `focal` for one box, either the root or the one leaf the diagram is about, never both. `node` for branches. `cloud` for leaves, so the bottom row reads as quieter.
- Main text is the name; `sub=` is two or three words of detail. Leave `tag=` out: a 48px box has no room for it.

## Connectors

Connectors are plain lines with square corners: no arrowheads, no diagonals, no labels. A parent's children hang from a horizontal bus half-way between the rows (36px under the parent). Draw the trunk, the bus and each drop as separate lines:

```
root.bottom -- 500,188     // trunk: from the parent down to the bus
248,188 -- 752,188         // bus: from the first child's centre x to the last child's
248,188 -- design.top      // one drop per child
500,188 -- research.top
752,188 -- eng.top
```

- A parent with one child needs no bus: `research.bottom -- investigate.top`. Keep the two centred on each other so the line is straight.
- Do not write `root -> design` once per child. Those arrows are spread along the parent's bottom edge, and when forced to one point `check` reports them as running on top of each other.
- If a box moves, update the bus coordinates: the bus is not attached to anything.

## Legend

One `legend at 40,Y` statement, 32px under the leaf row, with an entry for each box style used.
