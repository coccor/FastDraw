# Database schema diagrams

Shows real tables: column names, SQL types, constraints, the indexes that matter, and foreign keys drawn from the referencing column to the column it references. Use it to review a migration or what a delete does. For what the entities mean, draw an ER diagram instead.

## Building blocks

```
billing: zone "billing" at 40,96 256x148 title.align=left     // a schema other than the default

orders: table "public.orders" at 392,152 296x0
  | id          "id"          "PK"    "uuid"
  | customer_id "customer_id" "FK NN" "uuid"
  |             "total"       "NN"    "numeric(12,2)"
  |= "Indexes"
  | "idx_orders_status"

items.order_id.right -> orders.id.right "cascade" style=primary
inv.order_id -> orders.id "restrict"
```

- Title at 40,52 (`style=h1`); the first table or zone at y=96 or lower. A table is a `table` named `schema.table`. Each row has three quoted cells: column name, constraints (`PK`, `FK`, `UQ`, `NN`, separated by a space), SQL type. Never leave the type out. A column with no constraint takes an empty cell `""`: `| "published_at" "" "timestamptz"`. Leaving it out slides the type into the constraints column.
- The row id is the unquoted first word of the line, before the cells (`| customer_id "customer_id" "FK NN" "uuid"`), and it is optional: a row without one starts straight with its first quoted cell. Give an id to every column a foreign key starts or ends on, and to no other.
- Indexes go under a `|= "Indexes"` row, one name per row. List only the ones the diagram is about.
- Eight columns per table at most. If you leave columns out, say so in a last row: `| "+ 3 more columns"`.
- The look has no table or key style: the built-in `table` is the plain table, `arrow` a foreign key.

## Composition

- Five tables and six foreign keys at most. Beyond that, show one subsystem and say so in the title.
- The table most keys point at goes in the middle column. Tables that reference it or that it references go left and right, 112px or more away.
- A row's centre is at `table y + 44 + 24 * n`. Set each neighbour's y so that the foreign-key row and the row it references are level; the key is then a straight line. Do this for as many keys as you can.
- Widths: the three columns need about 224px for short names. A one-cell row (an index name, the "more columns" line) widens the first column for the whole table, so a table with a 22-character index name needs 296. `check` tells you when a width is too small; fix the width, then re-place the neighbours.
- A key between two tables in the same column loops out on one side: name the side on both ends, `items.order_id.right -> orders.id.right`. Send it to the side with fewer lines, and leave 64px between the two tables.
- Plan the sides so no two keys cross. A key that leaves a row lower in its table should go to a table lower in the drawing.
- Tables of another schema sit inside a `zone` named after the schema: 16px of padding, 32px at the top. Height = the table's height + 44; the table is at zone x + 16, zone y + 32.

## Arrows

- The arrow points from the foreign-key column to the referenced column.
- The label is the ON DELETE action in one word: "restrict", "cascade", "set null". Every key has one.
- One key, the delete that destroys rows (cascade), takes `style=primary`, and the table whose rows are destroyed takes `stroke=accent fill=accent/0.08`. If no key cascades, nothing is accented.
- You may say what that key means in one `note` in free space ("Deleting an order deletes its items."), one `text` statement per line, 20px apart.

## Legend

`legend at 40,Y node="Table" focal="Rows deleted with their parent" zone="Schema other than public" arrow="Foreign key · label = ON DELETE" primary="Destructive delete"`, 24px under the lowest table. Keep each entry short or the last one wraps.
