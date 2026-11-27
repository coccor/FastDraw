# Flowcharts

Shows a decision process: steps, yes/no questions, outcomes.

## Composition

- The main path runs straight down the centre of the drawing. Every shape on it shares the same centre x.
- Shape carries meaning: a rounded terminal for start and end, a rectangle for an action, a diamond for a question. Use the look's styles for these.
- Each question has one answer that continues down the spine and one that branches sideways to an outcome placed level with the diamond (same centre y). Put all side outcomes in one column, on the same side.
- Vertical gaps: 24–32pt between a step and the next shape; 40pt below a diamond, so the answer label has room.
- Horizontal gap from a diamond's tip to a side outcome: about 120pt, so the answer label sits on a clear stretch of line.
- Question text goes on two short lines (`"Reusable across\nprojects?"`). Keep it under 16 characters per line so it fits the diamond.
- The outcome the chart is really about gets the accent style, and the arrow into it gets the primary arrow style. Nothing else does.

## Arrows

- Label only the answers leaving a diamond (YES, NO). Do not label plain step-to-step arrows.
- Arrows on the spine are straight vertical lines; branches are straight horizontal lines. If one isn't straight, the shapes aren't lined up: fix the positions, not the route.

## Legend

One `legend at 40,Y` statement under the chart, explaining the shape meanings (start/end, step, decision) and the arrow kinds used.
