# Axonometric plans

Shows one floor or one site from above at an angle, with what stands on it: rooms with their walls and furniture, or buildings on a plot. Use it when the reader needs to see where things are in relation to each other. A list of rooms is a table; parts of one object pulled apart are an `exploded` view.

FastDraw has no 3D. You keep a plan in model units (x, y on the floor, z up), project every corner yourself, and draw each box as four polygons. A short script that prints the polygons is the safe way; do not do 25 boxes by hand.

## Projection

`screen x = ox + x - y` and `screen y = oy + (x + y)/2 - z`, where `ox,oy` is where the plan's corner 0,0,0 lands. x runs right and down, y left and down, z straight up. Keep model numbers even so every point is a whole pixel. Write the origin and the formula in a comment at the top.

For a plan of `X` by `Y` units: `ox = (1000 - (X + Y)) / 2 + Y` (centres it), `oy = 96 + 6 + wall height` (the back corner's top then sits at y=96, under the title at y=52), canvas height = `oy + (X + Y) / 2 + 76`, caption at the canvas height minus 28. A plan of 300x200 with 40-high walls: `ox=450, oy=142`, canvas 1000x468. Keep `X + Y` at 600 or less. Below 300x200 two furnished rooms no longer fit their tags (see Text).

## A box

A box from `x0,y0` to `x1,y1`, standing from z to z+h, has four top corners: A (x0,y0) at the back, B (x1,y0) right, C (x1,y1) front, D (x0,y1) left. Project them at height z+h, and B, C, D again at z (Bb, Cb, Db). Four polygons, each `at` the smallest x and y of its points, points measured from there:

```
// desk: 24,28 to 68,52, z 6 to 16 · origin 450,142
polygon at 422,152 points=24,0;68,22;68,32;44,44;0,22;0,12 fill=#ffffff stroke=ink sw=1 overlap=ok          // silhouette A B Bb Cb Db D
polygon at 422,164 points=0,0;44,22;44,32;0,10 fill=ink/0.07 stroke=none overlap=ok mask=0                  // left face: D C Cb Db
polygon at 466,174 points=0,12;24,0;24,10;0,22 fill=ink/0.15 stroke=none overlap=ok mask=0                  // right face: C B Bb Cb
polygon at 422,164 points=0,0;44,22;44,32;44,22;68,10 open=1 stroke=ink/0.55 sw=0.8 overlap=ok              // inner edges: D C Cb C B
```

- The white silhouette hides what is behind the box; the two tints give it form (left lit, right in shade). Without them the box reads as flat. A wall that is long in x shows mostly its left face (light); one long in y shows its right face (darker): that is why the two back walls read differently.
- Draw the inner edges as an open polygon, not as lines: lines are painted under all shapes and would vanish.

## Composition

- Start with the slab: one box the size of the whole plan, 6 thick (z 0 to 6). Everything else stands on it at z=6 and nothing reaches past its edge.
- Walls are boxes 6 thick. Only the two back walls (along y=0 and along x=0) are full walls, **40 high**; the front sides stay open so every room can be seen. Partitions are 32 high, with a door as a gap of 40 between two partition boxes. At 22 high a wall reads as a kerb. A wall of height `h` hides the floor up to `2h` units behind it: keep furniture and tags out of that strip. Where walls meet, one runs through and the other stops at its face; boxes never overlap in plan.
- Furniture is much lower than the walls: 8 to 16 (bed 12, desk 10, counter 16), a wardrobe or locker up to 24 against a wall. A few plain boxes per room say what it is for.
- Order in the file is paint order: slab, flat tints, then boxes from back to front. A box must come after every box that lies behind it, that is, every box that ends before it starts in x or in y (`x1 ≤ its x0` or `y1 ≤ its y0`) and overlaps it on screen. Sorting by x+y alone goes wrong for long walls: place those by the rule.
- About 25 boxes is the limit for the reader, and each is four statements. Write a comment with the model numbers above each box.
- Floor tints are flat polygons on the slab (four corners at z=6, `stroke=none overlap=ok mask=0`), written right after the slab. Tint only the focal room, `fill=accent/0.12`; leave the other floors white. If you tint a second room, use `ink/0.04` and let both tints run to the same coordinate (the partition's centre line, say x=143 for a partition from 140 to 146), or a white sliver shows between them.

## Focus

One room or one building: the accent floor tint and an accent tag. Its furniture stays plain.

## Text

- Each room is named by a tag: `rect "Kitchen" sub="café, lockers" at 456,300 96x32 radius=2 fill=#ffffff stroke=ink/0.12 sw=0.8 title.size=12 sub.size=8 overlap=ok`. The focal tag has `stroke=accent title.color=accent sub.color=accent`. Tags are level, never tilted onto the floor, and written after every box so no wall cuts them. One or two words per name.
- A tag goes on open floor inside its room: project a floor point (z=6), centre the 96x32 tag on it. Accept the spot only if the whole tag rectangle lies inside the slab outline and does not touch the silhouette of any box (tall boxes in front of the spot reach 2h units up the screen) or another tag. Step the point in 5-unit moves until it passes; a script can test the rectangle's corners and edge midpoints with a point-in-polygon check. On a 300x200 plan with two furnished rooms there is room for about one spot per room.
- When no spot passes (a small plan, a crowded room, a building tag that would sit on furniture), put the tag outside the slab: a 6x6 dot (`ellipse ... fill=ink stroke=none overlap=ok`) on the floor point, a level leader to the tag (`px,py -- tagright,py stroke=ink/0.4 sw=0.8 layer=front`) and the tag 12px beyond the slab's left corner (`ox - Y`) or right corner (`ox + X`), at the same height as the dot. Pick a height where the leader crosses no tall box. A building's tag may instead sit on its roof.

## Legend

None. A one-line `caption` under the plan may say what the accent marks.

## Traps

- Every polygon needs `overlap=ok`, and the tints `mask=0`, or boxes are reported and the tints hide the edges under them.
- Round tag positions to multiples of 4. Polygon corners will not all be.
