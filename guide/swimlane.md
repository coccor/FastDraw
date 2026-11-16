# Swimlane diagrams

Shows a process that passes between people, teams or parts of a system: who does each step, and where the work changes hands.

## Rows or columns

Pick one before you start:

- **Columns** (one vertical lane per actor, time running down): for a request or call path through a system, such as browser, gateway, services and stores, or for any flow where each step hands over to the next. It reads top to bottom like a sequence diagram but keeps a box for each step. See "Columns" at the end.
- **Rows** (one horizontal lane per actor, time running right): for a business process between people or teams, where an actor often does several steps in a row.

## Rows

### Lanes

One horizontal lane per actor, in the order they first act. The look has no lane style; draw lanes with plain lines (`--`) and text. Title at `40,52` (`style=h1`); the first lane line is y=96. Lanes are 112px tall: lane k (from 0) has its top line at `y = 96 + 112k`. (Tall lanes leave a 64px vertical handoff, long enough for a head and a label.)

```
40,96  -- 960,96  stroke=ink/0.22        // top of the first lane
40,208 -- 960,208 style=rule             // between lanes: one every 112px
40,544 -- 960,544 stroke=ink/0.22        // bottom of the last lane (96 + 112 * lanes)
160,96 -- 160,544 stroke=ink/0.22        // closes the column that holds the lane names
text "Reviewer" at 60,268 style=eyebrow  // baseline 60px under the lane's top line
```

- All lanes have the same height. The name column is 120px wide (x 40 to 160). Every lane has a name; keep it to about 14 characters.
- Three to five lanes. With more, merge actors that never act separately. The lines run as far right as the steps need (x=960 above), all to the same x.

### Steps

- A step is a `node` written `120x48` (the default 144x64 does not fit the lane), placed 32px under its lane's top line, so it is centred in the lane. Widths 120 to 136; 80 for a one-word step. Main text is the action; `sub=` (small sans) is the tool or detail.
- A step belongs to one lane. Never stretch a step across two.
- Time runs left to right. The first step starts 24px right of the name column (x=184). Leave 40px between steps in the same lane.
- When work moves to another lane, put the next step straight below (or above) the step that hands over, with the same centre x, so the handoff is a vertical arrow 64px long. If the lanes are not neighbours, or the step would collide, put it one column to the right instead and let the arrow turn once: `pr.right -> review.top`.
- Give each step at most one arrow in at its top. When a second arrow has to arrive, take it to the left side (`x.left`) or the bottom. Two arrows that leave the same side of one step also run on top of each other for a stretch: send one from the bottom.
- Lanes need not have the same number of steps. A lane with one step is fine.
- The step the process exists to reach gets `focal`.

### Arrows

- Arrows inside a lane are plain, straight and unlabelled.
- Arrows that cross a lane line are the handoffs, the point of the diagram. Label them. The handoff that costs most (waiting, coupling, an approval) uses `style=primary`.
- A step that sends work back for revision uses `style=return`.
- A label on a segment that crosses a lane line lands on that line, and `check` reports it. Move it into the gap above the line with `lpos=x,y`: x is the segment's x plus 12 plus half the label's width (a label is about 5px wide per character), y is the lane line minus 6. This holds for a vertical handoff and for the vertical leg of an elbow alike. A label on a horizontal leg sits 10px above that leg and needs no `lpos`.
- If the flow snakes back to the left, reorder the steps or the lanes until it runs mostly left to right and downward.

### Legend

One `legend at 40,Y` statement, 32px under the last lane line, with entries for the step, the focal step and each arrow style used.

## Columns

### Lanes

One vertical lane per actor, left to right in the order they first act; the one that starts the flow (the browser, the user) is on the left. Title at `40,52` (`style=h1`). Columns are 208px wide: column k (from 0) starts at `x = 40 + 208k`. The names sit in a header row at the top.

```
40,96  -- 872,96  stroke=ink/0.22        // top of the header (872 = 40 + 208 * columns)
40,140 -- 872,140 stroke=ink/0.22        // under the names
248,96 -- 248,676 style=rule             // between columns: one every 208px
40,96  -- 40,676  stroke=ink/0.22        // left edge; the right edge is the same at x=872
40,676 -- 872,676 stroke=ink/0.22        // bottom line: 24px under the last step
text "API gateway" at 268,124 style=eyebrow  // 20px inside the column, baseline y=124
```

- Three to five columns. Every column has a name; keep it to about 16 characters.

### Steps

- A step is a `node` written `136x48`, 36px inside its column (`x = 40 + 208k + 36`), so it is centred in it. Main text is the action; `sub=` is the detail (an endpoint, a table, a tool).
- One step per row: row r has its top at `y = 164 + 88r`. Each step happens after the one above it, even in another column. This is what makes the order readable without numbers.
- The step the request exists for gets `focal`.

### Arrows

- To the next step in the same column: `a -> b`, straight down, unlabelled.
- To a step in another column, always on the next row: `a.right -> b.top` when it is to the right, `a.left -> b.top` when it is to the left. The arrow leaves the side, runs across and turns down onto the step.
- These handoffs are the point of the diagram. Label each with what is sent: the call (`"POST /orders"`) or the answer (`"201 Created"`). A label would sit across a column line, so place it inside the receiving column with `lpos=x,y`: y is the sending step's top plus 14. Going right, x is the last column line the arrow crosses plus 12 plus half the label's width (about 5px per character); going left, x is the receiving column's right line (`40 + 208(k + 1)` for column k) minus 12 minus half the label's width.
- A response or callback uses `style=return`. The call that costs most (the slowest, or the one that can fail the request) uses `style=primary`.
- A flow with more than about eight steps is two diagrams, or a sequence diagram.

### Legend

One `legend at 40,Y` statement, 32px under the bottom line, with entries for the step, the focal step and each arrow style used.

For example:

```
place:   node "Place order" sub="checkout page" at 76,164 136x48
token:   node "Check token" sub="JWT · rate limit" at 284,252 136x48
charge:  focal "Charge card" sub="Stripe" at 700,428 136x48
confirm: node "Confirm order" sub="status=paid" at 492,516 136x48

place.right -> token.top "POST /orders" lpos=290,178
charge.left -> confirm.top "paid" style=return lpos=642,442
```
