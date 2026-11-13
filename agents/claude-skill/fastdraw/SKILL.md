---
name: fastdraw
description: Draw or change a diagram (architecture, flowchart, sequence, or any boxes-and-arrows picture) as a FastDraw .fdraw file that people can later edit visually. Use when asked to create, update or fix a diagram in a repo that uses FastDraw, or when a .fdraw or .look file is involved.
---

# FastDraw

FastDraw diagrams are small text files (`.fdraw`). You place every element yourself; a look file (`.look`) decides how styles are drawn. People edit the same file in a browser editor afterwards.

1. Run `fastdraw guide` and follow it. It is the single source for the language and the way of working, and it points to `fastdraw guide architecture|flowchart|sequence` and `fastdraw sizes`.
2. Always finish with `fastdraw check <file>` clean and a look at the PNG from `fastdraw render <file>`.
3. When changing an existing diagram, do not move, resize or restyle what is already there unless asked. A person may have arranged it by hand.

If the `fastdraw` command is not on the PATH, run it as `npx fastdraw` (for example `npx fastdraw guide`).
