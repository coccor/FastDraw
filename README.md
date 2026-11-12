# FastDraw

Diagrams that an AI agent writes and a person can edit.

- An agent writes a diagram as a small text file (`.fdraw`), placing every element itself.
- A look file (`.look`) holds named styles, so each team decides how its diagrams are drawn.
- A browser editor opens the same file, lets a person change anything on a free canvas, and saves
  the change back as a minimal edit to the text.

Status: proof of concept. The design document lives outside this repo, in the planning folder.

## Layout

| Path | What it is |
|---|---|
| `src/` | Core: parser, look loader, arrow router, SVG renderer, checker, text-edit operations |
| `src/cli.ts`, `bin/fastdraw` | Command-line tool for agents: `check`, `render`, `sizes`, `guide` |
| `guide/` | What an agent reads to learn the language and how to compose each kind of diagram |
| `src/defaultLook.ts` | The built-in look, used when a diagram names none; `fastdraw init-look` writes it out as a starting point |
| `agents/` | Thin instruction files that point Claude Code, Codex, OpenCode and Copilot at `fastdraw guide` |
| `looks/reference.look` | Test look that mirrors diagram-design's default palette, for quality comparison. Not the look FastDraw will ship with |
| `looks/gazette.look` | Gazette: serif headline over flat newspaper-graphics blocks, one muted crimson accent. Kept as a named look; currently also the built-in one |
| `editor/` | The browser editor (Vite + React), built as a static site |
| `examples/test/` | Three diagrams written by agents from the guide alone |
| `compare/` | Those three next to the diagram-design originals, plus editor screenshots |
| `fonts/` | Libre Franklin and Newsreader (the built-in look), Geist, Geist Mono and Instrument Serif (SIL Open Font License, texts included). A look can bring more with `fontdir` |
| `test/` | Core tests |

## Commands

```
npm install
npm test                  # core tests
npm run typecheck
bin/fastdraw guide        # the language guide
bin/fastdraw check examples/test/architecture.fdraw
bin/fastdraw render examples/test/architecture.fdraw
bin/fastdraw init-look team.look   # start your own look from the built-in one
npm run dev               # editor at http://localhost:5199
npm run build:editor      # static site in dist-editor/
```

Needs Node 22.18 or later (the tool runs its TypeScript sources directly).

## Editor and files

In Chrome and Edge the editor saves in place and re-reads the file about once a second, so an
agent and a person can work on the same diagram at the same time. Other browsers keep changes in
memory and download the result. Nothing is uploaded; there is no server.

Exported PNG and SVG files carry the diagram and its look inside them. Drop one on the editor
(or open it) to keep editing, for example an image taken from a wiki page.

## Credits

The kinds of diagram FastDraw has guides for, and many of the composition ideas in those guides
(how few elements to use, one accent, legends, what makes each kind read well), follow
[diagram-design](https://github.com/cathrynlavery/diagram-design) by Cathryn Lavery (MIT licence,
copyright (c) 2025 Cathryn Lavery). The guides are written anew for FastDraw's language. The
pictures in `compare/kinds/*-ref.png` are renders of diagram-design's own example pages, kept for
side-by-side comparison; `looks/reference.look` mirrors its default palette for the same purpose.

The bundled icons (`src/icons.ts`) are from [Tabler Icons](https://tabler.io/icons) (MIT licence,
copyright (c) 2020-2024 Paweł Kuna), the same generic set diagram-design uses.
