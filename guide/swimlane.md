# Swimlane diagrams

Shows a process that passes between people or teams: who does each step, and where the work changes hands.

## Lanes

One horizontal lane per actor, in the order they first act. The look has no lane style; draw lanes with plain lines (`--`) and text. Title at `40,52` (`style=h1`); the first lane line is y=96. Lanes are 112px tall: lane k (from 0) has its top line at `y = 96 + 112k`. (Tall lanes leave a 64px vertical handoff, long enough for a head and a label.)

```
40,96  -- 960,96  stroke=ink/0.22        // top of the first lane
40,208 -- 960,208 style=rule             // between lanes: one every 112px
40,544 -- 960,544 stroke=ink/0.22        // bottom of the last lane (96 + 112 * lanes)
160,96 -- 160,544 stroke=ink/0.22        // closes the column that holds the lane names
text "Reviewer" at 60,268 style=eyebrow  // baseline 60px under the lane's top line
```

- All lanes have the same height. The name column is 120px wide (x 40 to 160). Every lane has a name; keep it to about 14 characters.
- Three to five lanes. With more, merge actors that never act separately. The lines run to the canvas width minus 40.

## Steps

- A step is a `node` written `120x48` (the default 144x64 does not fit the lane), placed 32px under its lane's top line, so it is centred in the lane. Widths 120 to 136; 80 for a one-word step. Main text is the action; `sub=` (small sans) is the tool or detail.
- A step belongs to one lane. Never stretch a step across two.
- Time runs left to right. The first step starts 24px right of the name column (x=184). Leave 40px between steps in the same lane.
- When work moves to another lane, put the next step straight below (or above) the step that hands over, with the same centre x, so the handoff is a vertical arrow 64px long. If the lanes are not neighbours, or the step would collide, put it one column to the right instead and let the arrow turn once: `pr.right -> review.top`.
- Give each step at most one arrow in at its top. When a second arrow has to arrive, take it to the left side (`x.left`) or the bottom. Two arrows that leave the same side of one step also run on top of each other for a stretch: send one from the bottom.
- Lanes need not have the same number of steps. A lane with one step is fine.
- The step the process exists to reach gets `focal` (white text by default).

## Arrows

- Arrows inside a lane are plain, straight and unlabelled.
- Arrows that cross a lane line are the handoffs, the point of the diagram. Label them. The handoff that costs most (waiting, coupling, an approval) uses `style=primary`.
- A step that sends work back for revision uses `style=return`.
- A label on a segment that crosses a lane line lands on that line, and `check` reports it. Move it into the gap above the line with `lpos=x,y`: x is the segment's x plus 12 plus half the label's width (a label is about 5px wide per character), y is the lane line minus 6. This holds for a vertical handoff and for the vertical leg of an elbow alike. A label on a horizontal leg sits 10px above that leg and needs no `lpos`.
- If the flow snakes back to the left, reorder the steps or the lanes until it runs mostly left to right and downward.

## Legend

One `legend at 40,Y` statement, 32px under the last lane line, with entries for the step, the focal step and each arrow style used. The canvas is Y + 70 tall.
