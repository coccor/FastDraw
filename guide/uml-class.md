# UML class diagrams

Shows classes with their operations and how they relate: what inherits from what, what owns what, what only uses what. If there is no inheritance and no operation worth showing, draw an ER diagram instead.

## Building blocks

```
pm: table "«interface»\nPaymentMethod" at 520,112 360x0 stroke=accent fill=accent/0.08
  | "+ authorize(amount: Money): AuthResult"
  | "+ capture(ref: String): void"

card: table "Card" at 456,264 200x0
  | "- number: String"
  | "- expiry: Date"
  | ---
  | "+ mask(): String"
```

- A class is a `table` with one cell per row: the header is the class name, each row is one member written whole, `+ name(arg: Type): Return` or `- name: Type`. `+` public, `-` private, `#` protected.
- Attributes first, then `| ---`, then operations. A class with only one of the two has no divider.
- An interface has `«interface»` on a first header line, its name on the second: `table "«interface»\nRenderer"`. An abstract class is the same with `«abstract»`. Mark nothing else with a stereotype. A two-line header makes the table 8px off the 4px grid; the hint is expected.
- The look has no class style; the built-in `table` is the plain class. The one class or interface the others implement or extend takes `stroke=accent fill=accent/0.08`.

## Relationships

The line end carries the meaning, so use exactly these:

| Relationship | Write |
|---|---|
| Inheritance (extends) | `child.top -> parent.bottom head=triangle` |
| Realization (implements) | `impl.top -> iface.bottom style=return head=triangle` |
| Composition (the part dies with the owner) | `owner -- part style=arrow tail=diamond-solid` |
| Aggregation (the part lives on) | `owner -- part style=arrow tail=diamond` |
| Association | `a -> b head=open` |
| Dependency (uses) | `a -> b "uses" style=return head=open` |

- The triangle points at the parent; the diamond sits on the owner.
- Lines into the accent class take `stroke=accent`. Together with the class they are the diagram's accent; nothing else is.
- Composition, aggregation and association need a multiplicity at both ends (`1`, `0..*`, `1..*`): `text "1..*" at x,y style=small`, baseline 8px above a horizontal line and starting 24px from the box edge (clear of a diamond). At the right-hand end of a horizontal line, the text must end 24px before the box, so write it `anchor=end` at that x (`text "0..*" at 688,176 style=small anchor=end` for a box starting at 712). On a vertical line it sits 8px to the right and 20px from the box.

## Composition

- Four or five classes is normal, seven the limit; eight relationships at most; five members per compartment (put `"…"` as the last row if there are more). Leave out getters and setters. Past the limit, split by package.
- Title at 40,52 (`style=h1`); the top row of classes at y=112. Parents and interfaces go above, children in a row below them, 64px or more below the parent's bottom edge (a table is 32 + 24 per row high, 8 more with a two-line header). Put each child's centre under the parent so the line is straight: `card.top -> pm.bottom@556`, where 556 is the child's centre x. Make the parent wide enough to span its children's centres: children of width w, gap g, n of them start at x0; the parent is at `x0`, `n*w + (n-1)*g` wide, or narrower as long as each centre `x0 + w/2 + i*(w+g)` stays inside it.
- A class that depends on the interface, or owns the parent, sits beside it on the same row, at least 120px away, tops level, and the two rows of that relationship at the same y so the line is straight. With a parent at the right and its children below, the left of the lower row stays free: put the interface and the classes that use it there instead of on the top row if the picture is lopsided.
- Classes joined by composition or association share a row, 120px or more apart, so the diamond and both multiplicities fit.
- An association between classes that are not neighbours runs under the row: `order.bottom -> cust.bottom head=open via=172,580;832,580`, 36px below the boxes.
- Give every table a width: the longest member at about 6px a character plus 48. Heights follow the rows; never pad classes to equal height.

## Legend

`legend at 40,Y focal="…"` for the accent class. Under it, draw the six relationships as 40px samples with a `caption` each, on a row at Y+73 (text baseline Y+76), even the ones the diagram does not use: the reader needs the whole vocabulary to tell the ends apart. Each sample starts at the previous start plus `88 + 6 * (characters of the previous caption)`: 154 after "Inheritance", 196 after "Composition · owns". Six samples take about 1000px; in a narrower diagram use two rows of three, 24px apart.

```
40,685 -> 80,685 head=triangle
text "Inheritance" at 88,688 style=caption
348,685 -- 388,685 style=arrow tail=diamond-solid
text "Composition · owns" at 396,688 style=caption
```
