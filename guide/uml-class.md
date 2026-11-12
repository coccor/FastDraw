# UML class diagrams

Shows classes with their operations and how they relate: what inherits from what, what owns what, what only uses what. If there is no inheritance and no operation worth showing, draw an ER diagram instead.

## Building blocks

```
pm: table "«interface» PaymentMethod" at 520,100 360x0 stroke=accent fill=accent/0.08
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
- An interface has `«interface» ` before its name in the header (the header is one line). Mark nothing else with a stereotype.
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
- Composition, aggregation and association need a multiplicity at both ends (`1`, `0..*`, `1..*`): `text "1..*" at x,y style=small`, baseline 8px above a horizontal line and starting 24px from the box edge (clear of a diamond), or 8px to the right of a vertical line and 20px from the box.

## Composition

- Four or five classes is normal, seven the limit; eight relationships at most; five members per compartment (put `"…"` as the last row if there are more). Leave out getters and setters. Past the limit, split by package.
- Parents and interfaces go above, children in a row below them, 64px lower than the parent's bottom edge. Put each child's centre under the parent so the line is straight: `card.top -> pm.bottom@556`, where 556 is the child's centre x. Make the parent wide enough to span its children's centres.
- A class that depends on the interface sits beside it on the same row, at least 120px away.
- Classes joined by composition or association share a row, 120px or more apart, so the diamond and both multiplicities fit.
- An association between classes that are not neighbours runs under the row: `order.bottom -> cust.bottom head=open via=172,580;832,580`, 36px below the boxes.
- Give every table a width: the longest member at about 6px a character plus 48. Heights follow the rows; never pad classes to equal height.

## Legend

`legend at 40,Y focal="…"` for the accent class. Under it (canvas 100px taller than Y), draw the six relationships as 40px samples with a `caption` each, 152px apart, even the ones the diagram does not use: the reader needs the whole vocabulary to tell the ends apart.

```
40,685 -> 80,685 head=triangle
text "Inheritance" at 88,688 style=caption
344,685 -- 384,685 style=arrow tail=diamond-solid
text "Composition · owns" at 392,688 style=caption
```
