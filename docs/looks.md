# Looks

A look decides how a diagram is drawn: its styles, colours, fonts and icons.

A look is a text file of named styles. Start from the built-in one and change anything:

```
npx fastdraw init-look team.look
npx fastdraw preview-look team.look
```

A diagram picks its look with one line, `look "./team.look"`, or names one that ships with FastDraw:
`look reference`, `look shade`, `look sketch` or `look whiteboard`. Each of these and the built-in look comes in a light and
a dark version: the editor and an embedded diagram draw the one for their theme (Night for the built-in look,
`shade-dark` for Shade), and `fastdraw render --dark` draws the dark one. The file names the light version. A look in a public GitHub repository
is named by its address, `look "https://raw.githubusercontent.com/coccor/fastdraw-looks/main/engraved.look"`;
[coccor/fastdraw-looks](https://github.com/coccor/fastdraw-looks) has Azure, AWS, Google Cloud and Kubernetes looks
(each one's colours, icons and groups such as `vpc`, `resource-group` and `namespace`), looks for a use (Print for black
and white, Blueprint, High contrast for low vision and colour blindness, Terminal) and six styles of drawing: Engraved,
Headline, Keys, Listing, Offset and Transit. In the editor, the **Look** button previews the diagram in each one before you keep it, and **From GitHub**
lists the looks in any public repository. A look can also bring its own fonts and
colour icons, best by their https:// address (`font sans "Inter" "https://..."`, `icondir "https://.../{name}.svg"`;
the look guide lists recommended sources) or from folders next to it (`fontdir`, `icondir`), and name its dark version (`dark "./team-night.look"`)
for the dark theme and `fastdraw render --dark`. `fastdraw guide look` explains the format.

A docs site with light and dark themes can draw both images of every diagram with one command:

```bash
fastdraw render docs/diagrams --dark    # x.png with each file's look, x-dark.png with its dark version
```
