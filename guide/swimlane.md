# Swimlane diagrams

Shows a process that passes between people or teams: who does each step, and where the work changes hands.

## Lanes

One horizontal lane per actor, in the order they first act. The look has no lane style; draw lanes with plain lines and text:

```
40,96  -- 960,96  stroke=ink/0.22        // top of the first lane
40,176 -- 960,176 style=rule             // between lanes: one every 80px
40,416 -- 960,416 stroke=ink/0.22        // bottom of the last lane
160,96 -- 160,416 stroke=ink/0.22        // closes the column that holds the lane names
text "Reviewer" at 60,220 style=eyebrow  // baseline 44px under the lane's top line
```

- Lanes are 80px tall and all the same height. The name column is 120px wide (x 40 to 160). Every lane has a name.
- Three to five lanes. With more, merge actors that never act separately.

## Steps

- A step is a `node`, 48px tall, placed 16px under its lane's top line, so it is centred in the lane. Widths between 120 and 136; 80 for a one-word step. Main text is the action; `sub=` is the tool or detail.
- A step belongs to one lane. Never stretch a step across two.
- Time runs left to right. The first step starts 24px right of the name column. Leave 40px between steps in the same lane.
- When work moves to another lane, put the next step straight below (or above) the step that hands over, with the same centre x, so the handoff is a short vertical arrow. If the lanes are not neighbours, or the step would collide, put it one column to the right instead and let the arrow turn once: `pr.right -> review.top`.
- Lanes need not have the same number of steps. A lane with one step is fine.
- The step the process exists to reach gets `focal`.

## Arrows

- Arrows inside a lane are plain, straight and unlabelled.
- Arrows that cross a lane line are the handoffs, the point of the diagram. Label them. The handoff that costs most (waiting, coupling, an approval) uses `style=primary`.
- A step that sends work back for revision uses `style=return`.
- The label of a vertical handoff lands on the lane line by default and `check` reports it. Move it into the 16px gap above the line with `lpos=x,y`: x is the arrow's x plus 12 plus half the label's width (a label is about 5px wide per character), y is the lane line minus 5.
- If the flow snakes back to the left, reorder the steps or the lanes until it runs mostly left to right and downward.

## Legend

One `legend at 40,Y` statement, 32px under the last lane line, with entries for the step, the focal step and each arrow style used.
