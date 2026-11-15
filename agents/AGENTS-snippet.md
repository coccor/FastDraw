<!-- Paste into AGENTS.md (Codex, OpenCode) or .github/copilot-instructions.md (GitHub Copilot). -->

## Diagrams

Diagrams in this repo are FastDraw files (`.fdraw`), drawn with the look in `.look` files. People edit them visually afterwards.

- Before writing or changing one, run `fastdraw guide` and follow it; it is the only reference for the language.
- Finish with `fastdraw check <file>` clean, then run `fastdraw render <file>` and look at the PNG.
- `fastdraw check <folder>` and `fastdraw render <folder>` work on every `.fdraw` file under a folder. `fastdraw render <file> --dark` also writes `<file>-dark.png` with the look's dark version, for sites with a dark theme; `--look <name|file.look>` draws with another look without changing the file.
- When the diagram is done, ask the person what to do next: preview the PNG (open it in their image viewer), open it in fastdraw.dev (run `fastdraw open <file>` in the background; edits save back to the file), or nothing. Do not open anything before they choose.
- When changing an existing diagram, leave the position, size and styling of existing elements alone unless asked.
- If `fastdraw` is not on the PATH, run it as `npx fastdraw`.
