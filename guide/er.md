# ER diagrams

Shows the things a domain is made of (entities), the fields that matter, and how many of one belong to how many of another. Use it for a conceptual or logical model. For real tables with SQL types, constraints and ON DELETE rules, draw a db-schema diagram instead.

## Building blocks

```
author: table "Author" at 40,152 216x0
  | id "# id"   "uuid"
  |    "handle" "text"

article: table "Article" at 376,128 248x0 stroke=accent fill=accent/0.08
  | id     "# id"        "uuid"
  | author "→ author_id" "uuid"
  |        "title"       "text"

author.id -- article.author "writes" style=arrow tail=only-one head=many
```

- An entity is a `table`: the entity name is the header, each row is a field name and its type. Start a primary key with `# ` and a foreign key with `→ `.
- Give a row id only to rows a relationship ends on.
- The look has no entity or relationship style. The built-in `table` is the plain entity. The one entity the model is built around takes `stroke=accent fill=accent/0.08`. A join entity (it exists only to link two others) takes `dash=4,3 stroke=muted fill=ink/0.05`.

## Composition

- Title at 40,52 (`style=h1`); tables start at y=112 or lower. Three to six entities in columns 200 to 248 wide with 104 to 120pt between columns, so a relationship has room for both end marks and a label. If one entity joins the rest (a hub), put it in the middle with the others around it. If the model is a chain (A to B to C to D), lay it out left to right in one row, the accent on the entity the model is about wherever it falls; six in a chain go in two rows of three, the second row running back under the first.
- Give every table a width (`216x0`); the height follows the rows. Do not pad entities to the same height.
- A row's centre is at `table y + 44 + 24 * n` (n = 0 for the first row). Place the tables so the two rows of every relationship are at the same y: that line is then straight. Going along a chain, each next table's y is the previous one's plus 24 times (its key row number minus the previous table's foreign-key row number): a 4-entity chain steps down 24 or 48 each time, as a staircase. Putting a foreign key right under the primary key makes this easy.
- Six to eight fields per entity at most. Leave out fields that say nothing about the model (timestamps, flags).
- Two relationships must not leave the same row on the same side (their lines jog onto each other): move one to another row or end it on the top or bottom edge (`a.bottom -- b.top`).
- With more than about six relationships, do not draw them all: group related entities close together and draw only the ones the diagram is about.

## Relationships

- Always write `style=arrow` on a relationship. A bare `--` is a straight line and comes out diagonal between rows at different heights; with `style=arrow` it turns at right angles.
- Cardinality is drawn by the end marks, not written as text: `tail=` is the mark at the first end, `head=` at the second. `only-one` (exactly one), `zero-one`, `many`, `one-many`, `zero-many`. Mark both ends of every relationship, in the same notation throughout.
- Between entities side by side, end on the key rows: `author.id -- article.author`. Between entities stacked in one column, join the boxes: `tag.bottom -- atag.top`, with at least 56pt between them for the two marks.
- A label is one verb ("writes", "tagged"). Leave it out when the field names already say it.

## Legend

`legend at 40,Y 360x0 focal="Aggregate root" node="Entity" optional="Join entity"`, 24pt under the lowest table. The `node` swatch stands for the plain table. Give the legend a width (360 holds three entries; add 120 for each more) so the entries stay on the left. The statement cannot show key prefixes or end marks, so add them by hand to its right, from `x = 40 + legend width + 40`, on the entries' line (text baseline Y+40, the line sample at Y+37); each next x is the last text's x plus `6 * its characters + 24`:

```
text "#" at 440,452 style=small color=ink
text "Primary key" at 452,452 style=caption
560,449 -- 608,449 style=arrow tail=only-one head=many
text "Exactly one to many" at 620,452 style=caption
```
