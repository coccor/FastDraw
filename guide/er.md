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

- Three to six entities. Put the central entity in the middle and the others around it, in two or three columns 216 to 248 wide with 120px between columns, so a relationship has room for both end marks and a label.
- Give every table a width (`216x0`); the height follows the rows. Do not pad entities to the same height.
- A row's centre is at `table y + 44 + 24 * n` (n = 0 for the first row). Place the tables so the two rows of the main relationship are at the same y: that line is then straight. Putting a foreign key right under the primary key makes this easy.
- Six to eight fields per entity at most. Leave out fields that say nothing about the model (timestamps, flags).
- With more than about six relationships, do not draw them all: group related entities close together and draw only the ones the diagram is about.

## Relationships

- Always write `style=arrow` on a relationship. A bare `--` is a straight line and comes out diagonal between rows at different heights; with `style=arrow` it turns at right angles.
- Cardinality is drawn by the end marks, not written as text: `tail=` is the mark at the first end, `head=` at the second. `only-one` (exactly one), `zero-one`, `many`, `one-many`, `zero-many`. Mark both ends of every relationship, in the same notation throughout.
- Between entities side by side, end on the key rows: `author.id -- article.author`. Between entities stacked in one column, join the boxes: `tag.bottom -- atag.top`, with at least 56px between them for the two marks.
- A label is one verb ("writes", "tagged"). Leave it out when the field names already say it.

## Legend

`legend at 40,Y focal="Aggregate root" node="Entity" optional="Join entity"`, 24px under the lowest table. The `node` swatch stands for the plain table. The statement cannot show key prefixes or end marks, so add them by hand on the same line as the entries (their text baseline is at Y+40), to the right of the last entry:

```
text "#" at 420,452 style=small color=ink
text "Primary key" at 432,452 style=caption
600,449 -- 648,449 style=arrow tail=only-one head=many
text "Exactly one to many" at 660,452 style=caption
```
