# Architecture diagrams

Shows the parts of one system and how a request or data moves between them.

## Composition

- Lay the main path out left to right on one row, vertically centred in the drawing area. This row is the spine.
- Things that branch off the spine (stores, side services) go in a column at the end or beside the box that uses them, one above the spine row and one below, so the two arrows fan out symmetrically.
- Group related boxes with a zone drawn behind them. Give the zone 12pt of padding around its boxes and extra room at the top for its name. Draw the zone statement before the boxes.
- Box widths may differ a little by importance (128 for a minor actor, 144 normal, 160 for the focal box). Heights stay equal along a row.
- Leave 52pt between spine boxes so a short arrow label fits above the arrow.

## Arrows

- The main path uses the look's primary arrow once, on the step that matters most.
- A request that crosses a network boundary uses the link arrow, if the look has one.
- A response or async flow uses the dashed return arrow. When a request and its response connect the same two boxes, write both; they are spread apart automatically. Put the response label under its line with `lside=below`.
- An arrow from the spine into a column: let it leave the right side and turn once into the top or bottom of the target (`a -> b` does this by default when the boxes don't line up).
- If a label lands on a zone border or too close to an elbow, place it with `lpos=x,y` on the clear part of the line.

## Text

- Main text is the name of the thing. `sub=` is the technology or detail. `tag=` is a short type marker.
- `ghost="01"`, `ghost="02"` may number the main steps of the path; use on two or three boxes at most.

## Legend

One `legend at 40,Y` statement, 24pt below the lowest element, with an entry for each box style and arrow style you used.
