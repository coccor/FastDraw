# Story maps

Shows a whole product story and where the first release stops. Columns are activities in the order the user meets them; rows are releases, most urgent on top. The line under the first release is the point of the diagram: without it you have drawn a backlog. If the columns are states (to do, doing, done), draw a board instead; if you want to show how a person feels along the way, draw a journey.

## Composition

- Title: `text "..." at 40,52 style=h1`. The backbone starts at y=96.
- Columns: 200px wide, 24px apart. Leave an 88px margin on the left for the release names, so the first column starts at x=128 and the next ones at 352, 576, 800 (128 + 224 * i).
- Row 1, the backbone: one `node` box per activity, `200x64 fill=ink/0.08`, with the activity name as text and `sub="ACTIVITY 1"`. Write them in story order, never by priority. Not `store`: that means data, and many looks draw it as a cylinder.
- Row 2, the steps: under each activity, one or two `node` boxes 176x32 with `title.weight=400` (lighter than the stories), 12px in from the column edge, y=176 and 216. Keep room for two even where an activity has one, so the bands start level.
- Rows 3 to 5, the releases: one band per release, 80px high, the full width from x=40 to the last column's right edge, the first at y=272 (24px under the steps), the next at 352, 432. Tint the first, third, ... band: `zone at 40,272 960x80 radius=0 stroke=none` with no text; leave the others empty. Name each band with `text "MVP" at 56,<band middle + 4> style=eyebrow`.
- Stories: `node` boxes 176x48 with `sub="RPT-101 · 3pt"` (ticket, size), 16px under the top of their band, in the column of their activity. A story with no card in a band leaves the cell empty.
- When any cell is empty, draw a faint dashed line down each gutter (`x,y -- x,y style=rule dash=4,4`, 12px left of each column, from under the backbone to the bottom of the last band). They tie cards to their column.
- The release cut: `cut: 40,352 -- 1000,352 "Release cut" style=primary lpos=76,368`, on the border under the first band, across the full width. The label always goes in the left margin, centre x=76, baseline 16px under the line: the cells are full on a full map, and the margin is the one place nothing else sits. It must clear the first gutter line (x=116); `check` warns when it does not.

## Emphasis

The accent is used twice: the cut line, and the one story most likely to go wrong. Draw that story as `focal` with `dash=4,3`, and put a small chip on its top edge: `rect "RISK" at x,y 44x12 radius=2 fill=paper stroke=accent sw=0.8 overlap=ok title.font=mono title.size=8 title.weight=400 title.color=accent`, x = card right - 56, y = card top - 6. Do not use `tag=` here: on a 48px card it lands on the title.

## Limits

- Five activities, three releases, twelve stories, four stories per band. More than that: one map per activity, or one card that says "6 more".
- Name releases by scope (MVP, Release 2, Later), not by date.
- A story is something the user can see ("Public link"), not an engineering task.
- One kind of user per map. No arrows: position says everything.

## Legend

`legend at 40,Y node="Step or story" swatch.ink/0.08="Activity" focal="Riskiest story" line.accent="Release cut"`, 24px under the last band. Use `line.accent=` for the cut: a `primary` entry would show an arrowhead the line does not have.
