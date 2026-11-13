# Nested diagrams

Shows hierarchy by containment: each ring sits inside a broader one. Use it for scopes, trust boundaries, folders inside folders, how far a failure spreads.

## Composition

- Title at `40,52` (`style=h1`). The outermost ring starts at y=96.
- Three to five levels: n outer rings (`zone`) and one innermost box. With more, the inner ones become too small to read.
- The outermost ring is `W` wide: 920 for four rings, 760 for three, 600 for two (canvas `W+80`), so the innermost box does not turn into a wide empty bar. Its height is `H = 72n + 92`: 308 for three rings, 380 for four.
- Ring i (from 0) is inset from the one around it by 32px left and right and 36px top and bottom: `at 40+32i, 96+36i` and size `(W-64i) x (H-72i)`. The innermost box is the same step again: `at 40+32n, 96+36n`, size `(W-64n) x 92`. Uneven insets look like a mistake.
- Rings are `zone` shapes without text, written outermost first. Write `dash=none` on each ring so every outline is solid, whatever the look does with zones. The innermost level is a `focal` box with `radius=8`: it is the subject and holds the only centred text (main text and `sub=`).
- The outline gets stronger and the fill a little darker with each step inward, so the eye is drawn to the middle. Override the zone's colours ring by ring (four rings, n=4, W=920):

```
l1: zone at 40,96   920x380 dash=none stroke=ink/0.30 sw=1 fill=ink/0.015
l2: zone at 72,132  856x308 dash=none stroke=ink/0.35 sw=1 fill=ink/0.02
l3: zone at 104,168 792x236 dash=none stroke=ink/0.45 sw=1 fill=ink/0.025
l4: zone at 136,204 728x164 dash=none stroke=muted    sw=1 fill=ink/0.03
core: focal "Project guidance" sub="inherits every level above" at 168,240 664x92 radius=8
```

- The accent appears on the innermost box only.

## Text

- Name every ring at its top-left corner with free text, not with the zone's own caption (that one is centred, and centred names stack up in a column): `text "/business" at 120,190 style=eyebrow`. x is the ring's left edge plus 16; the baseline is the ring's top edge plus 22, which puts the name in the strip between this ring and the next. Ring names stay in `muted` (the default); the innermost level is named by its own box.
- For names that must keep their case (paths, identifiers) add `caps=0`.
- Never put free text over the focal box. If you must, give it a colour that reads on the focal fill; `fastdraw check` warns when it does not.
- Rings hold nothing but their name and the next ring. Items that are not levels of the hierarchy belong in another diagram.

## Callouts and lines

- A nested diagram has no arrows. Containment is the relationship.
- At most two short remarks in `style=note`, outside the rings: one above the top-right corner (baseline y=84, `anchor=end` at the ring's right edge), one under the bottom-left (baseline 32px under the outer ring).
- A remark may point at the level it is about with one faint curved line ending in a dot: `820,88 -- core.top@560 style=lifeline route=curve head=dot`.
- A legend is not needed when every ring is named. Leave it out.
