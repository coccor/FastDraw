# FastDraw plugin for Claude Code

This plugin adds one skill, `fastdraw`. When you ask Claude Code for a diagram (architecture, request flow, sequence, flowchart, swimlane, data model, chart), the skill has it write the diagram as a `.fdraw` text file: one element per line, with exact coordinates. Claude then runs `fastdraw check` on the file, which reports overlapping boxes, arrows that cross a box, colliding labels and text that does not fit, each with a line number, and fixes them before showing you the result. You can open the same file in the browser editor and move things by hand; your edits are saved back into the file as small text changes.

```
/plugin install fastdraw --marketplace coccor/fastdraw
```

Then ask for a diagram in any repository. Language reference, examples and the editor: https://fastdraw.dev and https://github.com/coccor/FastDraw.

## What it runs, sends and fetches

The plugin has no hooks and no MCP server. The skill lets Claude run one command, the `fastdraw` command-line tool, as `npx -y fastdraw …` (or `fastdraw …` when it is installed): mostly `guide`, `check`, `render` and `open`, sometimes `import` or `sizes`. Its `allowed-tools` line lets Claude run that command without asking while the skill is in use; no other command is pre-approved.

- **npm:** `npx` downloads the `fastdraw` package from registry.npmjs.org. An installed copy asks the registry once a day whether a newer version exists (skipped on CI and when `FASTDRAW_NO_UPDATE_CHECK` is set).
- **`fastdraw check`** reads the `.fdraw` file and reports problems; **`fastdraw render`** writes a PNG or SVG next to it. They fetch something only when the diagram or its look names an `https://` address: a look file, an icon or a font, for example on raw.githubusercontent.com or jsDelivr (cdn.jsdelivr.net, with data.jsdelivr.com to list an icon package's files). Fetched files are kept in a cache folder; `--offline` uses only that cache.
- **`fastdraw open`** starts a server on 127.0.0.1, under a random token, that reads files in the diagram's folder and writes only `.fdraw` and `.look` files there. It opens the editor at https://fastdraw.dev/edit/ in your browser, which loads the diagram from that local server. The diagram is not uploaded; `--editor` points it at another copy of the editor and `--no-browser` prints the address instead.

Nothing else is fetched or sent. FastDraw has no analytics or telemetry.

## License

MIT, as the rest of the repository (`LICENSE` at its root).
