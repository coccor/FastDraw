# Kanban boards

Shows where work stands right now: columns are states, cards are pieces of work, and each column says how many cards it holds against how many it may hold.

A board has no arrows. If you need to show how work moves, draw a flowchart or a swimlane instead.

## Building blocks

```
text "Platform team board, week 14" at 40,52 style=h1

// a column: a zone with no outline, a name, a count chip, a line under the header
c2: zone at 312,96 240x324 stroke=none
text "In progress" at 328,116 weight=600 color=ink
w2: rect "4/3" at 496,104 40x16 radius=2 fill=none stroke=accent sw=0.8 title.font=mono title.size=8 title.weight=400 title.color=accent
312,132 -- 552,132 stroke=ink/0.2 sw=1

// cards: write the size on every one (the default node is 144x64)
p2: node "K8s node pool migration" sub="AVA-142 · priya" at 328,212 208x56 title.align=left
p1: focal "Postgres 16 upgrade" sub="AVA-118 · sam" at 328,144 208x56 title.align=left dash=4,4 fill=accent/0.08 title.color=ink sub.color=muted
rect at 328,144 4x56 fill=accent stroke=none overlap=ok        // strip on the blocked card
```

## Composition

- Title at 40,52; columns start at y=96. Columns are 240 wide with 32px between them, starting at x=40. Canvas width = 48 + 272 * columns: four columns 1136, five 1408. Five is the limit.
- All columns have the same height: 52 + 68 * (cards in the fullest column). The space left under a short column is its free capacity; leave it.
- Header: the name at column x+16, baseline 20px below the column top. The chip is 40x16, at column x+184 (its right edge 16px in), 8px below the top. The line under the header is 36px below the top and spans the column.
- A card is 208x56 (the column width minus 16px each side). The first card starts 12px under the header line (column top + 48); the next starts 68px lower (56 plus a 12px gap).
- Four cards per column and twelve on the whole board at most. If a column has more, show three and a last card that counts the rest (`optional "+14 more"`).
- Cards are pieces of work, not people. Put the owner in `sub=`.

## Card states

| State | Write it as |
|---|---|
| open | `node` |
| blocked | `focal dash=4,4 fill=accent/0.08 title.color=ink sub.color=muted` (white text would vanish on the pale fill), plus a 4px-wide accent `rect` on its left edge (`overlap=ok`) |
| waiting on someone outside the team | `optional` |
| done | `node fill=ink/0.05 stroke=ink/0.3 title.color=muted` (not `store`: that is a cylinder) |

Every card has `title.align=left`, a short title and a `sub=` of ticket id and owner.

## Counts and limits

- A column that work passes through shows `count/limit` in its chip. The first column (the queue) and the last (done) show the count alone.
- When the count is above the limit, the chip's outline and text turn accent (`stroke=accent title.color=accent`).
- The accent appears twice at most: one over-limit chip and one blocked card. If three cards are blocked, mark the oldest and say so in the legend.
- Keep the chip a rectangle with `radius=2`. Keep the done column short: show the latest two or three and say in a caption where the rest went.

## Legend

The blocked card, the done card and the chip are overrides, not styles, so mix styles and marks in one statement, 24px under the columns (column top + height + 24): `legend at 40,Y node="Open" optional="Waiting on someone outside" swatch.accent/0.15="Blocked" swatch.ink/0.08="Done" line.accent="Over its limit"`. Leave 70px of canvas below it.
