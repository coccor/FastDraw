# Nested diagrams

Shows hierarchy by containment: each ring sits inside a broader one. Use it for scopes, trust boundaries, folders inside folders, how far a failure spreads.

## Composition

- Three to five rings. With six or more the inner ones become too small to read.
- The outermost ring spans the canvas between the 40px margins. Every ring is inset from the one around it by the same amount: 32px on the left and right, 36px at the top and bottom. Uneven insets look like a mistake.
- Outer rings are `zone` shapes without text, written outermost first. The innermost level is a `focal` box with `radius=8`: it is the subject and holds the only centred text (main text and `sub=`). It is at least 80px tall.
- The outline gets stronger and the fill a little darker with each step inward, so the eye is drawn to the middle. Override the zone's colours ring by ring:

```
l1: zone at 40,96   920x380 stroke=ink/0.30 sw=1 fill=ink/0.015
l2: zone at 72,132  856x308 stroke=ink/0.35 sw=1 fill=ink/0.02
l3: zone at 104,168 792x236 stroke=ink/0.45 sw=1 fill=ink/0.025
l4: zone at 136,204 728x164 stroke=muted    sw=1 fill=ink/0.03
core: focal "Project guidance" sub="inherits every level above" at 168,240 664x92 radius=8
```

- The accent appears on the innermost level only.

## Text

- Name every ring at its top-left corner with free text, not with the zone's own caption (that one is centred, and centred names stack up in a column): `text "/business" at 120,190 style=eyebrow`. x is the ring's left edge plus 16; the baseline is the ring's top edge plus 22, which puts the name in the strip between this ring and the next.
- For names that must keep their case (paths, identifiers) add `caps=0`.
- The innermost name takes `color=accent`.
- Rings hold nothing but their name and the next ring. Items that are not levels of the hierarchy belong in another diagram.

## Callouts and lines

- A nested diagram has no arrows. Containment is the relationship.
- At most two short remarks in `style=note`, outside the rings: one above the top-right corner, one under the bottom-left.
- A remark may point at the level it is about with one faint curved line ending in a dot: `820,80 -- core.top@560 style=lifeline route=curve head=dot`.
- A legend is not needed when every ring is named. Leave it out.
