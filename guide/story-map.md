# Story maps

Shows a whole product story and where the first release stops. Columns are activities in the order the user meets them; rows are releases, most urgent on top. The line under the first release is the point of the diagram: without it you have drawn a backlog. If the columns are states (to do, doing, done), draw a board instead; if you want to show how a person feels along the way, draw a journey.

## Composition

- Columns: 200px wide, 24px apart. Leave an 88px margin on the left for the release names, so the first column starts at x=128 and the next ones at 352, 576, 800. Canvas width = 128 + columns × 224 + 16.
- Row 1, the backbone: one `store` box per activity, 200x64, with the activity name as text and `sub="ACTIVITY 1"`. Write them in story order, never by priority.
- Row 2, the steps: under each activity, one or two `node` boxes 176x32 with `title.weight=400` (lighter than the stories), 12px in from the column edge, 16px under the backbone and 8px apart. Keep room for two even where an activity has one, so the bands start level.
- Rows 3 to 5, the releases: one band per release, 80px high, the full width from the left margin to the last column, starting 24px under the steps. Draw every second band as `zone at x,y WxH radius=0 stroke=none` with no text; leave the others empty. Name each band with `text "MVP" at 56,<band middle + 4> style=eyebrow`.
- Stories: `node` boxes 176x48 with `sub="RPT-101 · 3pt"` (ticket, size), 16px under the top of their band, in the column of their activity. A story with no card in a band leaves the cell empty.
- When any cell is empty, draw a faint dashed line down each gutter (`x,y -- x,y style=rule dash=4,4`, 12px left of each column, from under the backbone to the bottom of the last band). They tie cards to their column.
- The release cut: `cut: x1,y -- x2,y "Release cut" style=primary`, on the border under the first band, across the full width. Put its label in an empty cell just under the line with `lpos=`; if the row below is full, put it at the right end.

## Emphasis

The accent is used twice: the cut line, and the one story most likely to go wrong. Draw that story as `focal` with `dash=4,3`, and put a small chip on its top edge: `rect "RISK" at x,y 44x12 radius=2 fill=paper stroke=accent sw=0.8 overlap=ok title.font=mono title.size=8 title.weight=400 title.color=accent`. Do not use `tag=` here: on a 48px card it lands on the title.

## Limits

- Five activities, three releases, twelve stories, four stories per band. More than that: one map per activity, or one card that says "6 more".
- Name releases by scope (MVP, Release 2, Later), not by date.
- A story is something the user can see ("Public link"), not an engineering task.
- One kind of user per map. No arrows: position says everything.

## Legend

`legend at 40,Y store="Activity" node="Step or story" focal="Riskiest story" primary="Release cut"`, 24px under the last band.
