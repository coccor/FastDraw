# Venn diagrams

Shows two or three sets as circles and what they share where the circles overlap.

## Building blocks

```
// three equal sets, r=140: centres 500,180 · 428,320 · 572,320
want:  ellipse at 360,40  280x280 fill=ink/0.04   stroke=ink   sw=1 overlap=ok mask=0
build: ellipse at 288,180 280x280 fill=muted/0.05 stroke=muted sw=1 overlap=ok mask=0
pay:   ellipse at 432,180 280x280 fill=soft/0.05  stroke=soft  sw=1 overlap=ok mask=0

// the region all three share
core: polygon at 432,200 fill=ink stroke=none overlap=ok
    points=68,0;57,7;47,15;38,24;30,33;23,44;16,55;11,66;6,78;3,90;1,103;14,109;27,114;40,117;54,119;68,120;82,119;96,117;109,114;122,109;135,103;133,90;130,78;125,66;120,55;113,44;106,33;98,24;89,15;79,7
text "Shippable" at 500,268 anchor=middle size=14 weight=600 color=#ffffff
```

- Every circle needs `overlap=ok` (or `check` reports the overlap) and `mask=0`. Without `mask=0` a shape hides what is under it, so the later circles would cut the outlines of the earlier ones and the tints would not add up where sets overlap.
- Give each set its own outline colour (`ink`, `muted`, `soft`) and a fill of the same colour at 0.04 to 0.05.

## Composition

- Two or three circles. With four or more the regions cannot be read; use a table with `align=center grid=1` instead.
- Three sets: the layout above, on a canvas 1000x480. The centres form a triangle; each circle is 280x280. To move it, shift every `at` by the same amount.
- Two sets: circles of 280x280 side by side with centres 176px apart, for example `at 220,100` and `at 396,100`. The shared lens is then 104 wide and 218 high, at the second circle's `x` and the circles' `y + 31`:
  `points=52,0;74,22;90,49;101,78;104,109;101,140;90,169;74,196;52,218;30,196;14,169;3,140;0,109;3,78;14,49;30,22`
- For another radius, keep the proportions and stretch the polygon by giving it a size (`WxH`) scaled by the same factor as the circles.
- Equal circles say the sets are comparable. If one set is clearly larger, make its circle larger; then trace the shared region yourself: take points every 10 degrees along each circle edge that bounds it.
- The circles must really overlap. If two sets share nothing, a Venn diagram is the wrong kind.

## Focus

- One region is what the diagram is about, usually the one all sets share. Draw it as a polygon over the circles, with `stroke=none` (an outline would show the polygon's corners). Fill it with `ink` and write on it in white, or fill it with `accent/0.12` and write in ink.
- Never mark two regions. The other overlaps stay as the plain darker tint the circles make by themselves.

## Text

- Name each set inside the part of its circle that no other circle covers: plain text `size=14 weight=600 color=ink`, with an optional line 16px below in `eyebrow size=9`. Centre both with `anchor=middle`. In the layout above: 500,96 for the top set, 364,340 and 636,340 for the bottom two.
- Work out the width of every label and keep it at least 8px clear of every circle outline. A label that crosses an outline is the most common fault in this kind.
- A label for an overlap goes inside the overlap. If the overlap is too small for it, put the text in clear space outside and join it with a thin line (`x,y -- x,y style=rule stroke=ink/0.3`).
- Every region the reader is expected to notice has a label.

## Legend

Usually none: the labels say everything. Add a one-line `caption` under the circles only when the size of the circles means something.
