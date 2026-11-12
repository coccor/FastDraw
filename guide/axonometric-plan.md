# Axonometric plans

Shows one floor or one site from above at an angle, with what stands on it: rooms with their walls and furniture, or buildings on a plot. Use it when the reader needs to see where things are in relation to each other. A list of rooms is a table; parts of one object pulled apart are an `exploded` view.

FastDraw has no 3D. You keep a plan in model units (x, y on the floor, z up), project every corner yourself, and draw each box as four polygons.

## Projection

`screen x = ox + x - y` and `screen y = oy + (x + y)/2 - z`, where `ox,oy` is where the plan's corner 0,0,0 lands. x runs right and down, y left and down, z straight up. Keep model numbers even so every point is a whole pixel. Write the origin and the formula in a comment at the top.

## A box

A box from `x0,y0` to `x1,y1`, standing from z to z+h, has four top corners: A (x0,y0) at the back, B (x1,y0) right, C (x1,y1) front, D (x0,y1) left. Project them at height z+h, and B, C, D again at z (Bb, Cb, Db).

```
// desk: 24,28 to 68,52, z 6 to 16 · origin 440,76
polygon at 412,86 points=24,0;68,22;68,32;44,44;0,22;0,12 fill=#ffffff stroke=ink sw=1 overlap=ok          // A B Bb Cb Db D
polygon at 412,98 points=0,0;44,22;44,32;0,10 fill=ink/0.07 stroke=none overlap=ok mask=0                  // left face: D C Cb Db
polygon at 456,108 points=0,12;24,0;24,10;0,22 fill=ink/0.15 stroke=none overlap=ok mask=0                 // right face: C B Bb Cb
polygon at 412,98 points=0,0;44,22;44,32;44,22;68,10 open=1 stroke=ink/0.55 sw=0.8 overlap=ok              // inner edges: D C Cb C B
```

- A polygon's `at` is the smallest x and smallest y of its points; the points are measured from there.
- The white silhouette hides what is behind the box; the two tints give it form (left lit, right in shade). Without them the box reads as flat.
- Draw the inner edges as an open polygon, not as lines: lines are painted under all shapes and would vanish.

## Composition

- Start with the slab: one box the size of the whole plan, 6 thick (z 0 to 6). Everything else stands on it at z=6 and nothing reaches past its edge.
- Walls are boxes 6 thick and only 22 high, so no wall hides a room. A door is a gap between two wall boxes. Where walls meet, one runs through and the other stops at its face; boxes never overlap in plan.
- Furniture is lower than the walls (desks 10, counters 14 to 16). A few plain boxes per room are enough to say what the room is for.
- Order in the file is paint order: slab, flat tints, then boxes from back to front. A box must come after every box that lies behind it, that is, every box that ends before it starts in x or in y (`x1 ≤ its x0` or `y1 ≤ its y0`) and overlaps it on screen. Sorting by x+y alone goes wrong for long walls: place those by the rule.
- A floor of 360x240 units with the origin at 440,76 fills a 1000x448 canvas. For another plan, set `ox` to the left margin plus the plan's y size, and `oy` to the top margin plus the tallest box.
- This kind is many lines: about 25 boxes is the limit for the reader, and each is four statements. Work out the projected corners in a table first (or with a few lines of script) and write a comment with the model numbers above each box.
- Roads, paths and floor tints are flat polygons on the slab (four corners at z=6, `fill=ink/0.07 stroke=none overlap=ok mask=0`), written right after the slab.

## Focus

One room or one building. A room gets a flat tint on its floor, `fill=accent/0.12`, and an accent tag. Its furniture stays plain.

## Text

- Each room is named by a tag: `rect "Kitchen" sub="café, lockers" at 456,300 92x32 radius=2 fill=#ffffff stroke=ink/0.12 sw=0.8 title.size=12 sub.size=8 overlap=ok`. The focal tag has `stroke=accent title.color=accent sub.color=accent`.
- Tags are level, never tilted onto the floor. Write them after every box so no wall cuts them.
- Put a tag over open floor inside its room (project a floor point and centre the tag near it); a building's tag sits on its roof. Tags must not overlap each other; move a tag before shortening a name.
- One or two words per name. No leader lines, no numbered key.

## Legend

None. A one-line `caption` under the plan may say what the accent marks.

## Traps

- `check` prints many "line them up?" hints for the polygons. They do not apply here; read only the errors and warnings.
- Every polygon needs `overlap=ok`, and the tints `mask=0`, or boxes are reported and the tints hide the edges under them.
