<!-- Paste into AGENTS.md (Codex, OpenCode) or .github/copilot-instructions.md (GitHub Copilot). -->

## Diagrams

Diagrams in this repo are FastDraw files (`.fdraw`), drawn with the look in `.look` files. People edit them visually afterwards.

- Save a new diagram in `docs/diagrams/` unless the person names another place or the repo already keeps its `.fdraw` files somewhere; never at the top of the repo.
- Before writing or changing one, run `fastdraw guide` and follow it; it is the only reference for the language.
- For a diagram of the code, learn the system first: every project or service, how each talks to the others (HTTP clients, queues, shared stores, config), and the paths a request or event takes. Read every project, not only the first. Do not shrink a big system into a few vague boxes; propose an overview plus one diagram per main path, or the one path the person cares about.
- Choose the kind of diagram by what the reader has to understand, not by a word in the request ("request flow" is not a flowchart; "architecture diagram" is said of any system picture); `fastdraw guide list` says what each kind shows. Unless the request names exactly one kind and nothing in it pulls toward another, ask before drawing: the kind you would draw and the closest other kind, which path when there are several, and the split when the system is too big for one picture.
- Finish with `fastdraw check <file>` clean, then run `fastdraw render <file>` and look at the PNG.
- `fastdraw check <folder>` and `fastdraw render <folder>` work on every `.fdraw` file under a folder. `fastdraw render <file> --dark` also writes `<file>-dark.png` with the look's dark version, for sites with a dark theme; `--look <name|file.look>` draws with another look without changing the file.
- When the diagram is done, always ask the person what to do next: open it in fastdraw.dev (run `fastdraw open <file>` in the background, then give them the link it prints in case no browser window appeared; edits save back to the file), preview the PNG (open it in their image viewer), or nothing. Do not open anything before they choose.
- On a docs site (a web page, not a GitHub README), show a diagram with `<fastdraw-diagram src="....fdraw">` from https://fastdraw.dev/embed.js and keep the rendered PNG inside it as the fallback image; see "Embedding a diagram" in FastDraw's README.
- Where people use draw.io (a Confluence page with the draw.io app, say), `fastdraw render <file> -o <name>.drawio` writes a file draw.io opens and edits; the person imports it into the page's draw.io diagram (File → Import from → Device). Keep the `.fdraw` as the file you change, and export again after a change.
- When a diagram needs vendor icons (Azure, AWS, Google Cloud, Kubernetes, product logos) or a font that does not ship with FastDraw, add them to the look by their https:// address from the recommended sources in `fastdraw guide look`, with a fixed version in the address, rather than downloading files into the repo.
- When changing an existing diagram, leave the position, size and styling of existing elements alone unless asked.
- If `fastdraw` is not on the PATH, run it as `npx fastdraw`.
