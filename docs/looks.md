# Looks

A look decides how a diagram is drawn: its styles, colours, fonts and icons.

A look is a text file of named styles. Start from the built-in one and change anything:

```
npx fastdraw init-look team.look
npx fastdraw preview-look team.look
```

A diagram picks its look with one line, `look "./team.look"`, or names one that ships with FastDraw:
`look headline`, `look night`, `look reference`, `look sketch`, `look whiteboard`, or one of six styles of drawing:
`look shade`, `look engraved`, `look keys`, `look transit`, `look offset`, `look listing`. In the editor, the **Look** button
previews the diagram in each one before you keep it. A look can also bring its own fonts and
colour icons, best by their https:// address (`font sans "Inter" "https://..."`, `icondir "https://.../{name}.svg"`;
the look guide lists recommended sources) or from folders next to it (`fontdir`, `icondir`), and name its dark version (`dark "./team-night.look"`)
for `fastdraw render --dark`. `fastdraw guide look` explains the format.

A docs site with light and dark themes can draw both images of every diagram with one command:

```bash
fastdraw render docs/diagrams --dark    # x.png with each file's look, x-dark.png with its dark version
```
