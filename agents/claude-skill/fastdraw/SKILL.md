---
name: fastdraw
description: Draw or change a diagram (architecture, flowchart, sequence, or any boxes-and-arrows picture) as a FastDraw .fdraw file that people can later edit visually. Use when asked to create, update or fix a diagram in a repo that uses FastDraw, or when a .fdraw or .look file is involved.
---

# FastDraw

FastDraw diagrams are small text files (`.fdraw`). You place every element yourself; a look file (`.look`) decides how styles are drawn. People edit the same file in a browser editor afterwards.

1. Save a new diagram in `docs/diagrams/` (create the folder), unless the person names another place or the repo already keeps its `.fdraw` files somewhere. Never at the top of the repo: `fastdraw open` lends the diagram's whole folder to the editor.
2. Run `fastdraw guide` and follow it. It is the single source for the language and the way of working, and it points to `fastdraw guide list` (what each kind of diagram shows), `fastdraw guide <kind>` and `fastdraw sizes`.
   Choose the kind by what the reader has to understand, not by a word in the request ("request flow" is not a flowchart). Unless the request names the kind, tell the person which kind you would draw and the closest other kind, and ask with AskUserQuestion (your pick first) before drawing. If you cannot ask, draw your pick and say which other kind would also have worked.
3. Always finish with `fastdraw check <file>` clean and a look at the PNG from `fastdraw render <file>`.
4. When the diagram is done, always ask the person what to do next with AskUserQuestion; do not end your turn without asking. The choices: **Open in fastdraw.dev** (run `fastdraw open <file>` with `run_in_background`, then read its output and give the person the link it prints, in case no browser window appeared; it saves their edits back to the file), **Preview as PNG** (open the rendered PNG in their image viewer) or **Nothing**. Do not open anything before they choose.
5. For a site with light and dark themes, `fastdraw render <file or folder> --dark` writes `x.png` and `x-dark.png` (the look's dark version, Night for the built-in look). Do not copy the file to swap its look line; `--look <name|file.look>` draws with another look. A folder means every `.fdraw` file under it, for `check` too.
6. When changing an existing diagram, do not move, resize or restyle what is already there unless asked. A person may have arranged it by hand.
7. For a docs site (a web page, not a GitHub README), put the diagram on the page with `<fastdraw-diagram src="....fdraw">` from https://fastdraw.dev/embed.js, with the rendered PNG inside it as the fallback image. It draws the file live, pannable and zoomable, and follows the page's dark mode.

If the `fastdraw` command is not on the PATH, run it as `npx fastdraw` (for example `npx fastdraw guide`).
