# Command-line tool

The `fastdraw` command checks, renders and opens diagrams. Run it with `npx fastdraw` or install the `fastdraw` package. It needs Node 20 or later.

## Commands

| Command | What it does |
|---|---|
| `fastdraw check <file.fdraw \| folder> ...` | Report problems, with line numbers. A folder means every `.fdraw` file under it |
| `fastdraw render <file.fdraw \| folder> ... [-o out.png\|.svg] [--scale 2] [--transparent] [--no-embed] [--look name\|file.look] [--dark]` | Draw the diagram (PNG by default) next to the file. `--transparent` leaves out the page colour and dots; `--no-embed` leaves the diagram out of the image. `--look` draws with another look without changing the file. `--dark` also writes `x-dark.png` with the look's dark version (Night for the built-in look). With several files or a folder, every file is checked first and nothing is drawn if any has an error; `-o` works with one file only |
| `fastdraw guide [topic]` | Print the language guide, or the guide for one kind of diagram |
| `fastdraw guide list` | List the kinds of diagram that have a guide |
| `fastdraw sizes [file]` | List a look's styles and their sizes (the built-in look when no file is given) |
| `fastdraw icons [file.look] [word]` | List the icons a look offers, or search them by name or meaning (`email` finds `mail`) |
| `fastdraw init-look [path]` | Write the built-in look to a file, to start your own |
| `fastdraw preview-look [file.look]` | Draw every style of a look on one sheet |
| `fastdraw setup [claude\|agents\|copilot] [--global]` | Tell a repo's coding agents about FastDraw: a Claude Code skill, a section in `AGENTS.md`, or in Copilot's instructions. With no name, sets up the agents the repo already uses. Running it again updates them |
| `fastdraw open <file.fdraw> [--editor URL]` | Open the diagram in the web editor with its look, fonts and icons; edits there save back to the file. Runs until Ctrl-C |

## Using it with an agent

An agent needs only the `fastdraw` command. `fastdraw guide` teaches it the language and the way
of working: write the file, run `check` until it is clean, then render and look at the picture.

| Agent | What to do |
|---|---|
| Claude Code | In a session: `/plugin install fastdraw --marketplace coccor/fastdraw` (updates through `/plugin`) |
| Codex, OpenCode, Cursor and others | `npx skills add coccor/fastdraw -g` (installs the skill in `~/.agents/skills` and the other agents' folders; `npx skills update` updates it) |
| GitHub Copilot | `npx fastdraw setup copilot` (adds a section to `.github/copilot-instructions.md`) |
| Chat assistants | Ask it to read https://fastdraw.dev/llms.txt first, or paste that file in; then paste the reply into the editor with "Paste diagram text" |

`npx fastdraw setup claude` and `setup agents` still write the skill into `.claude/skills/` or a section
into `AGENTS.md`, for a repository that wants the instructions committed. The files `setup` writes carry
the version that wrote them. When they are older than the fastdraw running, `fastdraw guide` begins with
a note saying so and giving the command to update them (`npx fastdraw@latest setup ...`). It also notes
a newer release on npm, checked at most once a day; `FASTDRAW_NO_UPDATE_CHECK=1` turns that check off,
and it is off on CI.

More detail is in [`agents/README.md`](../agents/README.md).
