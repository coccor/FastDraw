#![forbid(unsafe_code)]
#![doc = include_str!("../README.md")]

use std::path::{Path, PathBuf};

// The internal modules mirror the TypeScript modules. They are public only so that the integration tests can reach
// them, hidden from the documentation, and not part of the API: they may change in any release.
#[doc(hidden)]
pub mod chart;
#[doc(hidden)]
pub mod data;
#[doc(hidden)]
pub mod disk;
#[doc(hidden)]
pub mod fontmeta;
#[doc(hidden)]
pub mod iconfiles;
#[doc(hidden)]
pub mod icons;
#[doc(hidden)]
pub mod js;
#[doc(hidden)]
pub mod look;
#[doc(hidden)]
pub mod parse;
#[doc(hidden)]
pub mod render;
#[doc(hidden)]
pub mod router;
#[doc(hidden)]
pub mod scene;
#[doc(hidden)]
pub mod share;
#[doc(hidden)]
pub mod sketch;

/// One diagram to draw.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Source<'a> {
    pub text: &'a str,
    pub file: Option<&'a Path>,
    pub dark: bool,
}

/// The result of drawing a diagram.
#[derive(Debug, Clone, PartialEq)]
pub struct Drawing {
    /// Standalone SVG; text names font families, no `@font-face`.
    pub svg: String,
    /// The look's paper colour (sRGB).
    pub paper: [u8; 3],
    /// x, y, w, h in diagram units.
    pub bounds: [f64; 4],
    /// Errors and warnings, as `loadScene` reports them.
    pub issues: Vec<Issue>,
    /// TTF/OTF files from the look's fontdir.
    pub font_files: Vec<PathBuf>,
    /// The diagram's own `.look` file, as read (for the share link).
    pub look: Option<LookFile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub line: u32,
    pub level: Level,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Error,
    Warning,
}

/// A look file: its path as written in the diagram, and its text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LookFile {
    pub path: String,
    pub text: String,
}

/// This crate's version, the same as the npm package's.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Draws a diagram. Never fails.
///
/// The composition FastDraw's command-line tool and its embed perform (spec §4.1): with a file, the look is read
/// from disk as `loadScene` reads it; without one, as `buildScene(text, null, '')`. On a dark page the diagram is
/// drawn in its look's dark counterpart when that can be read, else as on a light page.
pub fn render(source: &Source) -> Drawing {
    // the diagram's own look file, read once: what is drawn with and what is returned are the same text
    let p = parse::look_path(source.text);
    let own = source.file.map(|f| disk::read_look(f, p.as_deref()));
    let sc = drawn(source, own.clone());
    // the diagram's own look file as read: the light text's, never the dark one
    let look = own.and_then(|(text, _)| text).map(|text| LookFile {
        path: p.unwrap_or_default(),
        text,
    });
    let paper = look::color(
        &sc.look,
        Some(sc.look.canvas.get("paper").map_or("paper", String::as_str)),
        None,
    );
    Drawing {
        svg: render::render_svg(&sc),
        paper: parse_paper(&paper),
        bounds: [sc.x, sc.y, sc.w, sc.h],
        issues: sc
            .issues
            .iter()
            .filter_map(|i| {
                let level = match i.level {
                    look::IssueLevel::Error => Level::Error,
                    look::IssueLevel::Warn => Level::Warning,
                    look::IssueLevel::Hint => return None,
                };
                Some(Issue {
                    line: i.line,
                    level,
                    message: i.msg.clone(),
                })
            })
            .collect(),
        font_files: sc
            .font_files
            .unwrap_or_default()
            .into_iter()
            .map(PathBuf::from)
            .collect(),
        look,
    }
}

/// The scene `render` draws (`drawnScene` in tools/rust-parity.ts), for the parity tests.
#[doc(hidden)]
pub fn drawn_scene(source: &Source) -> scene::Scene {
    let p = parse::look_path(source.text);
    drawn(
        source,
        source.file.map(|f| disk::read_look(f, p.as_deref())),
    )
}

/// own: `read_look(file, look_path(text))` when there is a file.
fn drawn(source: &Source, own: Option<(Option<String>, bool)>) -> scene::Scene {
    if source.dark {
        dark_scene(source.text, source.file, own)
    } else {
        light_scene(source.text, source.file, own)
    }
}

/// Light: `loadScene` (with `read`, the look file `text` names, already read), or `buildScene` with no file.
fn light_scene(
    text: &str,
    file: Option<&Path>,
    read: Option<(Option<String>, bool)>,
) -> scene::Scene {
    match (file, read) {
        (Some(f), Some(read)) => disk::load_scene_read(f, text, read),
        (Some(f), None) => disk::load_scene(f, text),
        (None, _) => scene::build_scene(text, None, ""),
    }
}

/// Dark: the look's dark counterpart (`darkCounterpart`, as the embed decides it) when it can be read.
fn dark_scene(
    text: &str,
    file: Option<&Path>,
    own_read: Option<(Option<String>, bool)>,
) -> scene::Scene {
    let r = parse::look_path(text);
    let r = r.as_deref();
    let bundled = r.is_some_and(look::is_bundled_look);
    // the diagram's own look: the built-in one, a bundled one, or the look file parsed (None when it cannot be read)
    let own: Option<std::sync::Arc<look::Look>> = match (r.filter(|r| !r.is_empty()), &own_read) {
        (None, _) => Some(look::default_look()),
        (Some(name), _) if bundled => look::bundled_look(name),
        (Some(_), Some((Some(t), _))) => Some(std::sync::Arc::new(look::parse_look(t, ""))),
        (Some(_), _) => None,
    };
    let d = share::dark_counterpart(r, own.as_deref());
    match (d, file) {
        // a bundled look is not read from disk
        (Some(d), _) if look::is_bundled_look(&d) => {
            light_scene(&parse::with_look(text, &d), file, None)
        }
        (Some(d), Some(f)) => {
            // relative to the look file's folder; with no look file of its own (cannot happen with a bundled or the
            // built-in look, whose dark lines are names) the embed resolves it against the diagram, so this does too
            let base = match r.filter(|r| !r.is_empty() && !bundled) {
                Some(r) => disk::folder_of(&disk::resolve(&disk::folder_of(f), r)),
                None => disk::folder_of(f),
            };
            let rel = disk::look_ref_text(f, &disk::resolve(&base, &d));
            // only a .look file can be read by loadScene, so any other dark path cannot be read: drawn as light
            let dark_read = disk::read_look(f, Some(&rel));
            if dark_read.0.is_some() {
                // withLook writes `rel` so that lookPath reads it back, so dark_read is what loadScene would read
                light_scene(&parse::with_look(text, &rel), file, Some(dark_read))
            } else {
                light_scene(text, file, own_read)
            }
        }
        _ => light_scene(text, file, own_read),
    }
}

/// `#rrggbb`, `#rgb`, `#rrggbbaa`, `rgb(...)` or `rgba(...)` as sRGB, the alpha ignored; anything else is white.
fn parse_paper(c: &str) -> [u8; 3] {
    const WHITE: [u8; 3] = [255, 255, 255];
    let c = c.trim();
    let Some(h) = c.strip_prefix('#') else {
        return parse_rgb_function(c).unwrap_or(WHITE);
    };
    if !h.bytes().all(|b| b.is_ascii_hexdigit()) {
        return WHITE;
    }
    let hex = |s: &str| u8::from_str_radix(s, 16).ok();
    let rgb = match h.len() {
        6 | 8 => (hex(&h[0..2]), hex(&h[2..4]), hex(&h[4..6])),
        3 => {
            let one = |i: usize| hex(&h[i..=i]).map(|v| v * 17);
            (one(0), one(1), one(2))
        }
        _ => (None, None, None),
    };
    match rgb {
        (Some(r), Some(g), Some(b)) => [r, g, b],
        _ => WHITE,
    }
}

/// `rgb(r, g, b)`, `rgba(r, g, b, a)` or `rgb(r g b / a)`: each channel a number (0 to 255) or a percentage,
/// rounded and clamped; the alpha is ignored. None when it is not one of these.
fn parse_rgb_function(c: &str) -> Option<[u8; 3]> {
    let lower = c.to_ascii_lowercase();
    let inner = lower
        .strip_prefix("rgba(")
        .or_else(|| lower.strip_prefix("rgb("))?
        .strip_suffix(')')?;
    let (colour, alpha) = match inner.split_once('/') {
        Some((colour, alpha)) => (colour, Some(alpha)),
        None => (inner, None),
    };
    let parts: Vec<&str> = colour
        .split(|ch: char| ch == ',' || ch.is_ascii_whitespace())
        .filter(|p| !p.is_empty())
        .collect();
    // three channels, and a fourth (the alpha) only when it is not after a `/`
    if !(parts.len() == 3 || parts.len() == 4 && alpha.is_none()) {
        return None;
    }
    let channel = |p: &str| -> Option<u8> {
        let v = match p.strip_suffix('%') {
            Some(n) => n.parse::<f64>().ok()? * 255.0 / 100.0,
            None => p.parse::<f64>().ok()?,
        };
        // finite only: Rust's parse accepts "NaN" and "inf"
        v.is_finite().then(|| v.round().clamp(0.0, 255.0) as u8)
    };
    Some([channel(parts[0])?, channel(parts[1])?, channel(parts[2])?])
}

/// The look path the diagram's look line names, as written (`look "./team.look"` gives `./team.look`), or `None`
/// when the diagram has no look line or nothing follows `look`.
///
/// This is the path `render` reads when given a file, relative to the diagram's folder, so a host can check it
/// (an absolute or UNC path, say) before rendering a diagram it does not trust. A bundled look's name (`look
/// blueprint`) is returned as written too; it names no file.
///
/// ```
/// use fastdraw_render::look_path;
///
/// let text = "look \"./team.look\"\na: rect at 0,0\n";
/// assert_eq!(look_path(text).as_deref(), Some("./team.look"));
/// assert_eq!(look_path("a: rect at 0,0\n"), None);
/// ```
pub fn look_path(text: &str) -> Option<String> {
    parse::look_path(text)
}

/// The share link that opens a diagram in the online editor.
pub fn editor_link(name: &str, text: &str, look: Option<&LookFile>) -> String {
    share::editor_link(name, text, look)
}

/// The bundled fonts, inflated on first call.
pub fn fonts() -> &'static [(&'static str, Vec<u8>)] {
    data::fonts()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_fonts() {
        let f = fonts();
        assert!(!f.is_empty());
        assert!(f.iter().all(|(n, b)| n.ends_with(".ttf") && b.len() > 1000));
    }

    #[test]
    fn look_paths() {
        let team = "look \"./team.look\"\na: rect at 0,0\n";
        assert_eq!(look_path(team).as_deref(), Some("./team.look"));
        let unc = "# c\nlook \"//server/share/t.look\"\n";
        assert_eq!(look_path(unc).as_deref(), Some("//server/share/t.look"));
        assert_eq!(look_path("look blueprint\n").as_deref(), Some("blueprint"));
        assert_eq!(look_path("a: rect at 0,0\n"), None);
        assert_eq!(look_path("look\n"), None);
        assert_eq!(look_path(""), None);
    }

    #[test]
    fn papers() {
        assert_eq!(parse_paper("#0b1226"), [11, 18, 38]);
        assert_eq!(parse_paper("#FFF"), [255, 255, 255]);
        assert_eq!(parse_paper("#a0c"), [170, 0, 204]);
        assert_eq!(parse_paper("#12345678"), [0x12, 0x34, 0x56]);
        assert_eq!(parse_paper("#1234"), [255, 255, 255]);
        assert_eq!(parse_paper("#1234567"), [255, 255, 255]);
        assert_eq!(parse_paper("rgba(1,2,3,0.5)"), [1, 2, 3]);
        assert_eq!(parse_paper("rgb(11, 18, 38)"), [11, 18, 38]);
        assert_eq!(parse_paper(" RGB(11 18 38 / 50%) "), [11, 18, 38]);
        assert_eq!(parse_paper("rgb(100%, 0%, 50%)"), [255, 0, 128]);
        assert_eq!(parse_paper("rgb(300, -4, 1.6)"), [255, 0, 2]);
        assert_eq!(parse_paper("rgb(1, 2)"), [255, 255, 255]);
        assert_eq!(parse_paper("rgb(1, 2, 3, 4, 5)"), [255, 255, 255]);
        assert_eq!(parse_paper("rgb(1 2 3 4 / 5)"), [255, 255, 255]);
        assert_eq!(parse_paper("rgb(1, 2, x)"), [255, 255, 255]);
        assert_eq!(parse_paper("rgb(1, 2, 3"), [255, 255, 255]);
        assert_eq!(parse_paper("rgb(NaN, 2, 3)"), [255, 255, 255]);
        assert_eq!(parse_paper("rgb(inf, 2, 3)"), [255, 255, 255]);
        assert_eq!(parse_paper("hsl(1, 2%, 3%)"), [255, 255, 255]);
        assert_eq!(parse_paper(""), [255, 255, 255]);
        assert_eq!(parse_paper("#zzzzzz"), [255, 255, 255]);
        assert_eq!(parse_paper("#+1+2+3"), [255, 255, 255]);
    }

    /// A folder of diagrams and looks under the system's temporary folder, removed when dropped.
    struct Fixture(PathBuf);
    impl Fixture {
        fn new(name: &str) -> Fixture {
            let dir =
                std::env::temp_dir().join(format!("fastdraw-render-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            let put = |rel: &str, bytes: &[u8]| {
                let p = dir.join(rel);
                std::fs::create_dir_all(p.parent().unwrap()).unwrap();
                std::fs::write(p, bytes).unwrap();
            };
            let fira = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../examples/look-test/fonts/FiraSans-Regular.ttf");
            put("fonts/FiraSans-Regular.ttf", &std::fs::read(fira).unwrap());
            put("icons/Load Balancer.svg", b"<svg></svg>");
            put("team.look", TEAM_LOOK.as_bytes());
            put(
                "night/team-night.look",
                b"color paper #102030\ncolor ink #eeeeee\nicondir \"../icons\"\n",
            );
            put("x.txt", b"color paper #000\n");
            put(
                "big.look",
                format!("color paper #123456\n{}", " ".repeat(1_000_001)).as_bytes(),
            );
            put("tobig.look", b"dark \"./big.look\"\ncolor paper #fed\n");
            put(
                "bom.look",
                b"\xef\xbb\xbfcolor paper #fefefe\n\xff\xfe bogus\n",
            );
            Fixture(dir)
        }
        fn render(&self, rel: &str, text: &str, dark: bool) -> Drawing {
            let file = self.0.join(rel);
            render(&Source {
                text,
                file: Some(&file),
                dark,
            })
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    const TEAM_LOOK: &str = "font sans \"Nope Font\"\nfont mono \"Fira Sans\"\nicondir \"../out\"\nicondir \"./icons\"\ndark \"./night/team-night.look\"\nfontdir \"./fonts\"\nbogus line here\nicon q \"M4 6h16\"\n";
    const NODE: &str = "unknown style \"node\"; available: rect, ellipse, diamond, polygon, freehand, arc, icon, text, table, chart, legend";

    fn issues(d: &Drawing) -> Vec<(u32, Level, &str)> {
        d.issues
            .iter()
            .map(|i| (i.line, i.level, i.message.as_str()))
            .collect()
    }

    // Expected values from tools/rust-parity.ts run on the same files.
    #[test]
    fn reads_the_look_its_folders_and_its_dark_version() {
        use Level::*;
        let f = Fixture::new("render-look");
        let text = "look \"./team.look\"\na: node \"A\" at 0,0\n";
        let d = f.render("d.fdraw", text, false);
        assert_eq!(d.paper, [255, 255, 255]);
        let fira = f.0.join("fonts").join("FiraSans-Regular.ttf");
        assert_eq!(d.font_files, [PathBuf::from(disk::path_string(&fira))]);
        let own = LookFile {
            path: "./team.look".into(),
            text: TEAM_LOOK.into(),
        };
        assert_eq!(d.look, Some(own));
        assert_eq!(
            issues(&d),
            [
                (
                    1,
                    Error,
                    "unknown look statement \"bogus\" (in look, line 7)"
                ),
                (
                    1,
                    Warning,
                    "icon folder not used: ../out (icondir must be a folder inside the folder that holds the look file) (in look, line 0)"
                ),
                (2, Error, NODE),
                (
                    1,
                    Warning,
                    "the look names the font \"Nope Font\", but no TTF or OTF file for it was found, so text will be drawn in a fallback font; put its files in a folder next to the look and add  fontdir \"./fonts\"  to the look"
                ),
            ]
        );
        // dark: the look's dark line, relative to the look file; the light look file is still the one returned.
        // Also from a diagram in another folder than the look.
        let other = "look \"../team.look\"\na: node \"A\" at 0,0\n";
        for (rel, text) in [("d.fdraw", text), ("sub/d.fdraw", other)] {
            let d = f.render(rel, text, true);
            assert_eq!(d.paper, [0x10, 0x20, 0x30], "{rel}");
            assert!(d.font_files.is_empty());
            assert_eq!(d.look.as_ref().unwrap().text, TEAM_LOOK);
            assert_eq!(
                issues(&d),
                [
                    (
                        1,
                        Warning,
                        "icon folder not used: ../icons (icondir must be a folder inside the folder that holds the look file) (in look, line 0)"
                    ),
                    (2, Error, NODE),
                ]
            );
        }
    }

    #[test]
    fn looks_it_cannot_read() {
        use Level::*;
        let f = Fixture::new("render-unread");
        // only *.look files are read
        let d = f.render("d.fdraw", "look \"./x.txt\"\na: node \"A\" at 0,0\n", false);
        let refused = "the look path must end in .look; \"./x.txt\" was not read";
        assert_eq!(issues(&d), [(1, Error, refused), (2, Error, NODE)]);
        assert_eq!(d.look, None);
        // over 1 MB: as if missing, light and dark
        for dark in [false, true] {
            let d = f.render(
                "d.fdraw",
                "look \"./big.look\"\na: node \"A\" at 0,0\n",
                dark,
            );
            let missing = "look file not found: ./big.look";
            assert_eq!(issues(&d), [(1, Error, missing), (2, Error, NODE)]);
            assert_eq!((d.look, d.paper), (None, [255, 255, 255]));
        }
        // a dark version over 1 MB: drawn in the look itself
        let d = f.render(
            "d.fdraw",
            "look \"./tobig.look\"\na: node \"A\" at 0,0\n",
            true,
        );
        assert_eq!(issues(&d), [(2, Error, NODE)]);
        assert_eq!(d.paper, [0xff, 0xee, 0xdd]);
        // no file: nothing is read
        let text = "look \"./team.look\"\na: node \"A\" at 0,0\n";
        let d = render(&Source {
            text,
            file: None,
            dark: true,
        });
        assert_eq!(
            issues(&d)[0],
            (1, Error, "look file not found: ./team.look")
        );
        assert_eq!(d.look, None);
        // a byte order mark is kept, bad bytes are U+FFFD
        let d = f.render(
            "d.fdraw",
            "look \"./bom.look\"\na: node \"A\" at 0,0\n",
            false,
        );
        assert_eq!(d.paper, [0xfe, 0xfe, 0xfe]);
        let bad = "unknown look statement \"\u{fffd}\u{fffd}\" (in look, line 2)";
        assert_eq!(issues(&d)[0], (1, Error, bad));
        let read = "\u{feff}color paper #fefefe\n\u{fffd}\u{fffd} bogus\n";
        assert_eq!(d.look.unwrap().text, read);
    }
}
