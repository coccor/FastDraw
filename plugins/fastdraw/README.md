# FastDraw plugin for Claude Code

This plugin adds one skill, `fastdraw`. When you ask Claude Code for a diagram (architecture, request flow, sequence, flowchart, swimlane, data model, chart), the skill has it write the diagram as a `.fdraw` text file: one element per line, with exact coordinates. Claude then runs `fastdraw check` on the file, which reports overlapping boxes, arrows that cross a box, colliding labels and text that does not fit, each with a line number, and fixes them before showing you the result. You can open the same file in the browser editor and move things by hand; your edits are saved back into the file as small text changes.

```
/plugin install fastdraw --marketplace coccor/fastdraw
```

Then ask for a diagram in any repository. Language reference, examples and the editor: https://fastdraw.dev and https://github.com/coccor/FastDraw.

## What it runs, sends and fetches

The plugin has no hooks and no MCP server. The skill lets Claude run one command, the `fastdraw` command-line tool, as `npx -y fastdraw …` (or `fastdraw …` when it is installed): mostly `guide`, `check`, `render` and `open`, sometimes `import` or `sizes`. Its `allowed-tools` line lets Claude run that command without asking while the skill is in use; no other command is pre-approved.

- **npm:** `npx` downloads the `fastdraw` package from registry.npmjs.org. `fastdraw guide` (without a topic) also asks the registry, at most once a day, whether a newer version exists; skipped on CI and when `FASTDRAW_NO_UPDATE_CHECK` is set.
- **`fastdraw check`** reads the `.fdraw` file and reports problems; **`fastdraw render`** writes a PNG or SVG next to it. They fetch something only when the diagram or its look names an `https://` address: a look file, an icon or a font, for example on raw.githubusercontent.com or jsDelivr (cdn.jsdelivr.net, with data.jsdelivr.com to list an icon package's files). Fetched files are kept in a cache folder; `--offline` uses only that cache.
- **`fastdraw open`** starts a server on 127.0.0.1 under a random token. It serves the diagram's folder, or the nearest parent folder that also holds the diagram's own look file, never above the folder the command runs in. It lists at most 2,000 files (6 folders deep), reads files there, and writes only `.fdraw` and `.look` files of up to 2 MiB. It then opens the editor at https://fastdraw.dev/edit/ in your browser; the address it opens carries the local server's address (with its token) and the diagram's path inside that folder. The editor loads the diagram from the local server, so the diagram is not uploaded. `--editor` points it at another copy of the editor; `--no-browser` prints the address instead.
- **In the editor**, like the CLI, a look, icon or font named by an `https://` address is fetched from that address, and its **From GitHub** look picker asks api.github.com for a repository's `.look` files.
- **Docs pages:** when you ask for a diagram on a documentation site, the skill has Claude add `<fastdraw-diagram>` with a script tag for https://fastdraw.dev/embed.js, which that page's readers then load.

FastDraw has no analytics or telemetry, and sends your diagrams nowhere.

## License

MIT, as the rest of the repository (`LICENSE` at its root).
