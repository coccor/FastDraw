# Wardley maps

Shows the parts a product is made of, placed by two things: how close each is to the user (up) and how far it has travelled from new idea to commodity (right). It answers "what do we build, what do we buy, and what is about to change". It is a strategy picture: it says nothing about how requests travel, so no protocols and no direction of traffic. For that, draw an architecture diagram.

FastDraw has no map elements. You draw two axis lines, three dividers, dots, names and straight links at exact coordinates. A dot's position is the data, so choose positions first and never move a dot to make a line tidier.

## Composition

- Plot area 800px wide and about 320px high, with 128px free on the left for the axis words: axes `128,100 -- 128,420 stroke=ink/0.2 sw=1` and `128,420 -- 928,420 stroke=ink/0.2 sw=1`.
- Four bands of 200px: Genesis, Custom-built, Product, Commodity. Divide them with `328,100 -- 328,420 style=rule dash=4,4` (and at 528, 728). Name each under the axis: `text "Genesis" at 228,438 style=eyebrow anchor=middle`.
- The vertical axis gets words, not numbers: `text "Visible to" at 116,108 style=eyebrow anchor=end color=ink`, `"the user"` 12px lower, and `"Invisible"` at the bottom. Never rotate text.
- A component is a 12px dot: `id: ellipse at cx-6,cy-6 12x12 fill=paper stroke=ink`. Place it inside a band (the middle of the band unless you mean "early" or "late" in it), not on a divider. The user's need is the top dot.
- Give every dot its own height: step down 32 to 48px from one dot to the next, so no two links lie on top of each other and names have room.
- Nine dots at most.

## Links

- A link means "needs". Draw it as a thin straight line from the centre of one dot to the centre of the other, as free points: `428,132 -- 628,176 sw=0.8`. Do not write `need -- chat`: that attaches to the edge of the dot's box and the lines stop pointing at the centre. Lines are drawn under dots, so the paper fill hides the ends.
- No arrowheads and no labels on links. Twelve links at most. Every dot has at least one link; a dot with none does not belong on the map.
- After placing, look for a link that runs through another dot or crosses another link where swapping two dots of the same band would avoid it. Swap them.

## Names

- `text "Chat UI" at x,y weight=600`. Put the name beside the dot on the side where no link leaves it: to the right (`at cx+16,cy+4`), to the left (`at cx-12,cy+4 anchor=end`), above (`at cx,cy-12 anchor=middle`) or below-left. Most links run down and to the right, so right of the dot is free for the last dot of a chain and above-left is free for the first.
- A name must not touch a link. Check each one in the PNG.

## Emphasis

The accent marks what is moving: the dot (`stroke=accent sw=1.5`) and a short dashed arrow from its right edge towards the next band, `cx+6,cy -> cx+82,cy style=primary dash=5,4`. Movement only ever points right. Two moving components at most. Do not label the arrow unless the label adds a date or a cause.

## Legend

Draw it by hand (its entries are not styles of the look), 24px under the band names: a `style=rule` line, `text "Legend" style=eyebrow`, then a 10px dot + "Component", a 28px line `sw=0.8` + "Needs", an accent dot with a short dashed primary arrow + what the movement means, each followed by `text "..." style=caption`.
