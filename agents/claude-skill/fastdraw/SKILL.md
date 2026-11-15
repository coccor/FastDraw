---
name: fastdraw
description: Draw or change a diagram (architecture, flowchart, sequence, or any boxes-and-arrows picture) as a FastDraw .fdraw file that people can later edit visually. Use when asked to create, update or fix a diagram in a repo that uses FastDraw, or when a .fdraw or .look file is involved.
---

# FastDraw

FastDraw diagrams are small text files (`.fdraw`). You place every element yourself; a look file (`.look`) decides how styles are drawn. People edit the same file in a browser editor afterwards.

1. Run `fastdraw guide` and follow it. It is the single source for the language and the way of working, and it points to `fastdraw guide architecture|flowchart|sequence` and `fastdraw sizes`.
2. Always finish with `fastdraw check <file>` clean and a look at the PNG from `fastdraw render <file>`.
3. When the diagram is done, ask the person what to do next with AskUserQuestion: **Preview as PNG** (open the rendered PNG in their image viewer), **Open in fastdraw.dev** (run `fastdraw open <file>` in the background; it saves their edits back to the file) or **Nothing**. Do not open anything before they choose.
4. For a site with light and dark themes, `fastdraw render <file or folder> --dark` writes `x.png` and `x-dark.png` (the look's dark version, Night for the built-in look). Do not copy the file to swap its look line; `--look <name|file.look>` draws with another look. A folder means every `.fdraw` file under it, for `check` too.
5. When changing an existing diagram, do not move, resize or restyle what is already there unless asked. A person may have arranged it by hand.
6. For a docs site (a web page, not a GitHub README), put the diagram on the page with `<fastdraw-diagram src="....fdraw">` from https://fastdraw.dev/embed.js, with the rendered PNG inside it as the fallback image. It draws the file live, pannable and zoomable, and follows the page's dark mode.

If the `fastdraw` command is not on the PATH, run it as `npx fastdraw` (for example `npx fastdraw guide`).
