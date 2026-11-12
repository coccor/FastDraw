# Kanban boards

Shows where work stands right now: columns are states, cards are pieces of work, and each column says how many cards it holds against how many it may hold.

A board has no arrows. If you need to show how work moves, draw a flowchart or a swimlane instead.

## Building blocks

```
// a column: a zone with no outline, a name, a count chip, a line under the header
c2: zone at 304,40 240x324 stroke=none
text "In progress" at 320,60 weight=600 color=ink
w2: rect "4/3" at 488,48 40x16 radius=2 fill=none stroke=accent sw=0.8 title.font=mono title.size=8 title.weight=400 title.color=accent
304,76 -- 544,76 stroke=ink/0.2 sw=1

// cards
p2: node "K8s node pool migration" sub="AVA-142 · priya" at 320,156 208x56 title.align=left
p1: focal "Postgres 16 upgrade" sub="AVA-118 · sam" at 320,88 208x56 title.align=left dash=4,4 fill=accent/0.05
rect at 320,88 4x56 fill=accent stroke=none overlap=ok        // strip on the blocked card
```

## Composition

- Columns are 240 wide with 32px between them, starting at x=32. Four columns need a canvas 1120 wide; five need 1392. Five is the limit.
- All columns have the same height: 36px of header, then room for the fullest column's cards, then 16px.
- Header: the name at column x+16, baseline 20px below the column top. The chip is 40x16, its right edge 16px in from the column's right edge, 8px below the top. The line under the header is 36px below the top and spans the column.
- A card is 208x56 (the column width minus 16px each side). The first card starts 12px under the header line; the next starts 68px lower (56 plus a 12px gap).
- Four cards per column and twelve on the whole board at most. If a column has more, show three and a last card that counts the rest (`optional "+14 more"`).
- Cards are pieces of work, not people. Put the owner in `sub=`.

## Card states

| State | Write it as |
|---|---|
| open | `node` |
| blocked | `focal` with `dash=4,4 fill=accent/0.05`, plus a 4px-wide accent `rect` on its left edge (`overlap=ok`) |
| waiting on someone outside the team | `optional` |
| done | `store` |

Every card has `title.align=left`, a short title and a `sub=` of ticket id and owner.

## Counts and limits

- A column that work passes through shows `count/limit` in its chip. The first column (the queue) and the last (done) show the count alone.
- When the count is above the limit, the chip's outline and text turn accent (`stroke=accent title.color=accent`).
- The accent appears twice at most: one over-limit chip and one blocked card. If three cards are blocked, mark the oldest and say so in the legend.
- Keep the chip a rectangle with `radius=2`. Keep the done column short: show the latest two or three and say in a caption where the rest went.

## Legend

Draw it by hand, because the blocked card and the chip are overrides, not styles: a `rule` line 24px under the columns, "Legend" in `eyebrow`, then a 16x10 swatch per state used (`node at x,y 16x10 radius=2`, and the same for `focal` with its overrides, `optional`, `store`) and one `rect` with the accent outline for "over its limit", each with a `caption`.
