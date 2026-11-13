# Magazine-grade looks: references and principles

Researched 2026-11-13 from newsroom graphics (Reuters, Bloomberg, Scientific American, FT Visual
Vocabulary, Quanta) and Dribbble (Plaid diagram system, a NASA-manual block diagram, editorial
serif charts, editorial infographic posters). Screenshots were kept privately, not in the repo.

## What the references share

1. Flat shapes: no shadows, no gradients, square or barely rounded corners. Outlines only where a
   boundary means something (Bloomberg treemaps: pale grey blocks with white gaps).
2. Grey carries the picture; one or two rich, muted colours mark the subject (Bloomberg slate and
   ochre, Reuters muted blue and crimson). Never black or neon as the highlight.
3. One family, hierarchy by weight: a bold name and a regular second line in the same label.
4. Labels sit on the graphic: hairline leaders, or tracked mono caps riding on the line (Plaid,
   block diagrams). Legends are rare.
5. Print furniture: bold title + one-line dek (takeaway) + small source line; numbered steps;
   thin solid or dotted rules between sections.
6. Literary magazines pair a serif for titles and names with a grotesque for details.

## The three looks

| Look | Voice | Type | Subject | Shapes |
|---|---|---|---|---|
| `headline-sans.look` | newsroom graphics desk | Libre Franklin | muted crimson; slate platforms | flat pale-grey blocks, no outline |
| `literary.look` | literary magazine | Newsreader + Schibsted Grotesk | deep teal; ochre second voice | 1px square outlines, dotted zones |
| `schematic-mag.look` | technical explainer | IBM Plex Sans Condensed + Plex Mono | solid blue; pale cyan platforms | 1.5px outlines, open heads, doubled outline (mocked) |

## Follow-ups if one is chosen

- Guides should stop drawing black banners/terminals (`fill=ink`); use the look's tints instead.
- Diagrams that write text in `color=paper` on the focal box assume a dark subject; keep focal dark
  enough for white text, or give looks a named "on-accent" colour.
- Add a `dek` and `source` line to the guides' title recipe.
- Fonts: replace the Fontsource files with upstream static TTFs (Libre Franklin and Newsreader
  carry odd family names in these builds).
