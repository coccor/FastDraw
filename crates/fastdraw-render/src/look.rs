//! look.ts: a look (colours, fonts, styles, icons, canvas settings) read from a `.look` file, and the colour,
//! font and tint helpers that resolve names against it.

use std::sync::{Arc, OnceLock};

use indexmap::IndexMap;

use crate::data::{DEFAULT_LOOK, bundled_looks};
use crate::icons::IconMap;
use crate::js;
use crate::parse::{TokKind, parse_statements};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Shape,
    Line,
    Text,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Shape => "shape",
            Kind::Line => "line",
            Kind::Text => "text",
        }
    }
}

/// `Record<string, string>`: keys keep the order they were first set in.
pub type Props = IndexMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Style {
    pub name: String,
    pub kind: Kind,
    pub props: Props,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueLevel {
    Error,
    Warn,
    Hint,
}

impl IssueLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            IssueLevel::Error => "error",
            IssueLevel::Warn => "warn",
            IssueLevel::Hint => "hint",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LookIssue {
    pub line: u32,
    pub level: IssueLevel,
    pub msg: String,
    pub file: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Look {
    pub colors: IndexMap<String, String>,
    pub fonts: IndexMap<String, String>,
    /// folders of TTF/OTF files, relative to the look file
    pub font_dirs: Vec<String>,
    pub canvas: Props,
    pub styles: IndexMap<String, Style>,
    /// name -> SVG path data, drawn as outlines in a 24x24 box
    pub icons: IconMap,
    /// folders of SVG icon files, relative to the look file, or https:// addresses
    pub icon_dirs: Vec<String>,
    /// name -> https:// address of one SVG file (`icon name "https://..."`)
    pub icon_urls: IndexMap<String, String>,
    /// family -> https:// address of its files, with {weight} and {style} (`font sans "Inter" "https://..."`)
    pub font_urls: IndexMap<String, String>,
    /// name -> data URI of an icon file, filled in by whoever can read the folders
    pub images: IndexMap<String, String>,
    pub guidance: Vec<String>,
    /// the look that draws the same diagrams on a dark page: a bundled look's name, or a .look path relative to this look's file
    pub dark: Option<String>,
    pub issues: Vec<LookIssue>,
}

fn pairs(p: &[(&str, &str)]) -> IndexMap<String, String> {
    p.iter()
        .map(|&(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

fn builtin() -> Vec<Style> {
    let style = |name: &str, kind: Kind, p: &[(&str, &str)]| Style {
        name: name.to_string(),
        kind,
        props: pairs(p),
    };
    vec![
        style(
            "rect",
            Kind::Shape,
            &[
                ("shape", "rect"),
                ("fill", "none"),
                ("stroke", "ink"),
                ("sw", "1"),
            ],
        ),
        style(
            "ellipse",
            Kind::Shape,
            &[
                ("shape", "ellipse"),
                ("fill", "none"),
                ("stroke", "ink"),
                ("sw", "1"),
            ],
        ),
        style(
            "diamond",
            Kind::Shape,
            &[
                ("shape", "diamond"),
                ("fill", "none"),
                ("stroke", "ink"),
                ("sw", "1"),
            ],
        ),
        style(
            "polygon",
            Kind::Shape,
            &[
                ("shape", "polygon"),
                ("fill", "none"),
                ("stroke", "ink"),
                ("sw", "1"),
                ("size", "automatic"),
                (
                    "use",
                    "any outline from exact corners: polygon at x,y points=60,0;120,100;0,100 (measured from at). open=1 leaves it unclosed, smooth=1 rounds it",
                ),
            ],
        ),
        style(
            "freehand",
            Kind::Shape,
            &[
                ("shape", "polygon"),
                ("open", "1"),
                ("smooth", "1"),
                ("fill", "none"),
                ("stroke", "ink"),
                ("sw", "2"),
                ("cap", "round"),
                ("overlap", "ok"),
                ("mask", "0"),
                ("size", "automatic"),
                (
                    "use",
                    "a stroke drawn by hand in the editor: freehand at x,y points=0,12;18,2;40,9 (measured from at), a smooth open line through the points. Not for diagrams written as text: use lines, arrows and polygons there",
                ),
            ],
        ),
        style(
            "arc",
            Kind::Shape,
            &[
                ("shape", "arc"),
                ("fill", "none"),
                ("stroke", "ink"),
                ("sw", "1"),
                (
                    "use",
                    "a slice of a circle: arc at x,y WxH from=0 to=90 (degrees clockwise from the top). inner=0.6 makes it a ring segment, open=1 draws only the curved edge",
                ),
            ],
        ),
        style(
            "icon",
            Kind::Shape,
            &[
                ("shape", "icon"),
                ("mask", "0"),
                ("size", "24x24"),
                (
                    "use",
                    "an icon on its own, with no box: icon at x,y icon=database. fill=, stroke= and sw= style the icon itself; its text is a caption underneath (give WxH for another size)",
                ),
            ],
        ),
        style(
            "text",
            Kind::Text,
            &[("font", "sans"), ("size", "12"), ("color", "ink")],
        ),
        style(
            "arrow",
            Kind::Line,
            &[
                ("stroke", "muted"),
                ("sw", "1.2"),
                ("head", "arrow"),
                ("route", "ortho"),
                ("radius", "8"),
            ],
        ),
        style(
            "line",
            Kind::Line,
            &[
                ("stroke", "muted"),
                ("sw", "1"),
                ("head", "none"),
                ("route", "straight"),
            ],
        ),
        style(
            "relation",
            Kind::Line,
            &[
                ("stroke", "ink"),
                ("sw", "1.2"),
                ("head", "none"),
                ("route", "ortho"),
                ("radius", "6"),
                (
                    "use",
                    "a relationship between two tables or classes; write it with -- and choose the ends with head= and tail=",
                ),
            ],
        ),
        style(
            "table",
            Kind::Shape,
            &[
                ("shape", "table"),
                ("fill", "paper"),
                ("stroke", "ink"),
                ("sw", "1"),
                ("size", "automatic"),
                (
                    "use",
                    "a box with a header and rows; add a line per row: | id \"cell\" \"cell\". An arrow can end on a row: other -> table.id",
                ),
            ],
        ),
        style(
            "chart",
            Kind::Shape,
            &[
                ("shape", "chart"),
                ("fill", "none"),
                ("stroke", "ink/0.5"),
                ("sw", "1"),
                ("mask", "0"),
                (
                    "use",
                    "axes with your numbers drawn for you: chart at x,y WxH x=\"Q1,Q2,Q3\" y=0..100, then a line per series: | bars \"Revenue\" 42 61 75",
                ),
            ],
        ),
        style(
            "legend",
            Kind::Shape,
            &[
                ("shape", "legend"),
                ("fill", "none"),
                ("stroke", "none"),
                ("mask", "0"),
                ("rule", "ink/0.12"),
                ("title", "Legend"),
                ("size", "automatic"),
                (
                    "use",
                    "a whole legend in one statement: legend at x,y focal=\"what it means\" primary=\"what it means\" ...",
                ),
                ("title.font", "mono"),
                ("title.size", "8"),
                ("title.color", "muted"),
                ("title.spacing", "0.18"),
                ("title.caps", "1"),
                ("item.font", "sans"),
                ("item.size", "8.5"),
                ("item.color", "muted"),
            ],
        ),
    ]
}

pub fn empty_look() -> Look {
    let mut look = Look {
        colors: pairs(&[
            ("ink", "#222222"),
            ("muted", "#666666"),
            ("paper", "#ffffff"),
            ("card", "#ffffff"),
        ]),
        fonts: pairs(&[
            ("sans", "Helvetica"),
            ("mono", "monospace"),
            ("serif", "serif"),
        ]),
        font_dirs: Vec::new(),
        canvas: Props::new(),
        styles: IndexMap::new(),
        icons: IconMap::builtin(),
        icon_dirs: Vec::new(),
        icon_urls: IndexMap::new(),
        font_urls: IndexMap::new(),
        images: IndexMap::new(),
        guidance: Vec::new(),
        dark: None,
        issues: Vec::new(),
    };
    for s in builtin() {
        look.styles.insert(s.name.clone(), s);
    }
    look
}

// `/^[a-z][a-z0-9-]*$/`
fn is_icon_name(s: &str) -> bool {
    let mut cs = s.chars();
    cs.next().is_some_and(|c| c.is_ascii_lowercase())
        && cs.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// An address a look may fetch an icon or font file from (look.ts `isWebUrl`):
/// `/^https:\/\/[^\s\x00-\x1f\x7f"'<>\\`]+$/i` and at most 500 UTF-16 units.
pub fn is_web_url(s: &str) -> bool {
    s.get(..8)
        .is_some_and(|h| h.eq_ignore_ascii_case("https://"))
        && s.len() > 8
        && s[8..]
            .chars()
            .all(|c| !js::is_js_space(c) && !c.is_ascii_control() && !"\"'<>\\`".contains(c))
        && js::utf16_len(s) <= 500
}

/// `/^[a-z][a-z0-9+.-]*:/i`
fn has_scheme(s: &str) -> bool {
    let mut cs = s.chars();
    if !cs.next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    for c in cs {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || "+.-".contains(c)) {
            return false;
        }
    }
    false
}

// `/^[MmLlHhVvCcSsQqTtAaZz0-9eE\s,.+-]+$/`
fn is_path_data(s: &str) -> bool {
    !s.is_empty()
        && s.chars().all(|c| {
            c.is_ascii_digit() || "MmLlHhVvCcSsQqTtAaZzeE,.+-".contains(c) || js::is_js_space(c)
        })
}

// `/\.look$/i`
fn ends_with_look(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 5 && b[b.len() - 5..].eq_ignore_ascii_case(b".look")
}

pub fn parse_look(src: &str, path: &str) -> Look {
    let mut look = empty_look();
    for st in parse_statements(src) {
        let Some((head, rest)) = st.toks.split_first() else {
            continue;
        };
        let line = st.line;
        macro_rules! err {
            ($msg:expr) => {
                look.issues.push(LookIssue {
                    line,
                    level: IssueLevel::Error,
                    msg: $msg,
                    file: Some(path.to_string()),
                })
            };
        }
        if head.t != TokKind::Word {
            err!("a look statement must start with canvas, color, font, fontdir, style, icon, icondir, guidance or dark".to_string());
            continue;
        }
        match head.v.as_str() {
            "dark" => {
                // dark night | dark "./team-night.look": the look `fastdraw render --dark` uses for the dark image
                let v = rest.first().map(|t| t.v.as_str()).filter(|v| !v.is_empty());
                match v {
                    Some(v)
                        if rest.len() == 1
                            && (bundled_looks().contains_key(v) || ends_with_look(v)) =>
                    {
                        look.dark = Some(v.to_string());
                    }
                    _ => {
                        let names = bundled_look_names().join(", ");
                        err!(format!(
                            "dark needs one look: the name of a look that ships with FastDraw or a path to a .look file, e.g. dark night or dark \"./team-night.look\" (named looks: {names})"
                        ));
                    }
                }
            }
            "icondir" => match rest.first() {
                Some(t) if has_scheme(&t.v) && !is_web_url(&t.v) => err!(format!(
                    "icondir takes a folder next to the look or an https:// address, e.g. icondir \"https://cdn.jsdelivr.net/npm/simple-icons@16.38.0/icons/{{name}}.svg\"; \"{}\" is neither",
                    t.v
                )),
                Some(t) => look.icon_dirs.push(t.v.clone()),
                None => err!(
                    "icondir needs a folder of SVG files, e.g. icondir \"./icons\"".to_string()
                ),
            },
            "icon" => {
                // icon name "path data" ["more path data" ...]: outlines in a 24x24 box
                let name = rest
                    .first()
                    .filter(|t| t.t == TokKind::Word)
                    .map(|t| t.v.as_str());
                let paths: Vec<String> = rest
                    .iter()
                    .skip(1)
                    .filter(|t| t.t == TokKind::Str)
                    .map(|t| t.v.clone())
                    .collect();
                match name {
                    Some(name) if is_icon_name(name) && paths.len() == 1 && has_scheme(&paths[0]) => {
                        // icon name "https://.../file.svg": one icon file on the web
                        if is_web_url(&paths[0]) {
                            look.icon_urls.insert(name.to_string(), paths[0].clone());
                        } else {
                            err!(format!(
                                "icon {name} takes the https:// address of an SVG file, e.g. icon {name} \"https://cdn.jsdelivr.net/npm/aws-icons@3.3.0/icons/architecture-service/AWSLambda.svg\""
                            ));
                        }
                    }
                    Some(name) if is_icon_name(name) => {
                        if paths.is_empty()
                            || paths.iter().any(|d| !is_path_data(d) || js::utf16_len(d) > 4000)
                            || paths.len() > 12
                        {
                            err!(format!(
                                "icon {name} needs its outline as SVG path data in quotes, drawn in a 24x24 box, e.g. \"M4 6h16 M4 12h16\""
                            ));
                        } else {
                            look.icons.set(name.to_string(), paths);
                        }
                    }
                    _ => err!("icon needs a name in small letters, e.g. icon queue \"M4 6h16 M4 12h16 M4 18h16\"".to_string()),
                }
            }
            "fontdir" => match rest.first() {
                Some(t) => look.font_dirs.push(t.v.clone()),
                None => err!("fontdir needs a folder, e.g. fontdir \"./fonts\"".to_string()),
            },
            "canvas" => {
                for t in rest {
                    if t.t == TokKind::Prop {
                        look.canvas
                            .insert(t.k.clone().unwrap_or_default(), t.v.clone());
                    }
                }
            }
            h @ ("color" | "font") => {
                if rest.len() < 2 {
                    err!(format!("{h} needs a name and a value"));
                    continue;
                }
                let map = if h == "color" {
                    &mut look.colors
                } else {
                    &mut look.fonts
                };
                map.insert(rest[0].v.clone(), rest[1].v.clone());
                // font sans "Inter" "https://.../latin-{weight}-{style}.ttf": where the family's files are on the web
                if let Some(at) = rest.get(2).filter(|_| h == "font") {
                    if is_web_url(&at.v) {
                        look.font_urls.insert(rest[1].v.clone(), at.v.clone());
                    } else {
                        err!(format!(
                            "font {} \"{}\" takes the https:// address of its files as the third value, with {{weight}} and {{style}} where they differ, e.g. \"https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-{{weight}}-{{style}}.ttf\"",
                            rest[0].v, rest[1].v
                        ));
                    }
                }
            }
            "guidance" => {
                for t in rest {
                    if t.t == TokKind::Str {
                        look.guidance.push(t.v.clone());
                    }
                }
            }
            "style" => {
                let Some(name) = rest.first().map(|t| t.v.as_str()).filter(|n| !n.is_empty())
                else {
                    err!("style needs a name".to_string());
                    continue;
                };
                let mut kind: Option<Kind> = None;
                let mut props = Props::new();
                let mut i = 1;
                while i < rest.len() {
                    let t = &rest[i];
                    i += 1;
                    if t.t == TokKind::Prop {
                        props.insert(t.k.clone().unwrap_or_default(), t.v.clone());
                        continue;
                    }
                    if t.v == "extends" {
                        let base_name = rest.get(i).map(|t| t.v.as_str());
                        i += 1;
                        let Some(base) = base_name.and_then(|n| look.styles.get(n)) else {
                            let shown = base_name.unwrap_or("undefined");
                            err!(format!(
                                "style \"{name}\" extends an unknown style \"{shown}\" (define the base first)"
                            ));
                            continue;
                        };
                        kind = kind.or(Some(base.kind));
                        // { ...base.props, ...props }
                        let mut merged = base.props.clone();
                        for (k, v) in props {
                            merged.insert(k, v);
                        }
                        props = merged;
                    } else if t.v == "line" {
                        kind = Some(Kind::Line);
                    } else if t.v == "text" {
                        kind = Some(Kind::Text);
                    } else if t.v == "shape" {
                        kind = Some(Kind::Shape);
                    } else {
                        err!(format!("unexpected word \"{}\" in style \"{name}\"", t.v));
                    }
                }
                look.styles.insert(
                    name.to_string(),
                    Style {
                        name: name.to_string(),
                        kind: kind.unwrap_or(Kind::Shape),
                        props,
                    },
                );
            }
            other => err!(format!("unknown look statement \"{other}\"")),
        }
    }
    look
}

type Rgb = [f64; 3];
type Lab = [f64; 3];

// `hex` starts with '#'. A 3-digit form is doubled; then it must match `/^[0-9a-fA-F]{6}$/`.
fn hex_to_rgb(hex: &str) -> Option<Rgb> {
    let h = hex.get(1..)?;
    let doubled: String;
    let h = if js::utf16_len(h) == 3 {
        doubled = h.chars().flat_map(|c| [c, c]).collect();
        &doubled
    } else {
        h
    };
    if h.len() != 6 || !h.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let byte = |i: usize| f64::from(u8::from_str_radix(&h[i..i + 2], 16).unwrap());
    Some([byte(0), byte(2), byte(4)])
}

fn lin(v: f64) -> f64 {
    let v = v / 255.0;
    if v <= 0.04045 {
        v / 12.92
    } else {
        js::pow((v + 0.055) / 1.055, 2.4)
    }
}

fn unlin(v: f64) -> f64 {
    255.0
        * (if v <= 0.0031308 {
            12.92 * v
        } else {
            1.055 * js::pow(v, 1.0 / 2.4) - 0.055
        })
}

fn to_oklab(c: Rgb) -> Lab {
    let [r, g, b] = c.map(lin);
    let l = js::cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    let m = js::cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    let s = js::cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
}

// sRGB from OKLab, unclamped: a channel outside 0..255 means the colour is out of gamut
fn from_oklab([big_l, a, b]: Lab) -> Rgb {
    let l = js::pow(big_l + 0.3963377774 * a + 0.2158037573 * b, 3.0);
    let m = js::pow(big_l - 0.1055613458 * a - 0.0638541728 * b, 3.0);
    let s = js::pow(big_l - 0.0894841775 * a - 1.291485548 * b, 3.0);
    [
        unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ]
}

fn in_gamut(c: Rgb) -> bool {
    c.iter().all(|&v| (-0.5..=255.5).contains(&v))
}

// Whether a look mixes colour/alpha tints so they keep their hue. canvas tint=hue or tint=alpha says so; without
// it, a dark page keeps the hue and a light page uses a plain alpha blend. On a dark page a plain blend of a warm
// colour over a cool one cancels out: amber/0.1 over navy is a flat grey.
pub fn tint_keeps_hue(look: &Look) -> bool {
    match look.canvas.get("tint").map(String::as_str) {
        Some("hue") => return true,
        Some("alpha") => return false,
        _ => {}
    }
    let paper = resolve_base(look, canvas_paper(look));
    let rgb = if paper.starts_with('#') {
        hex_to_rgb(&paper)
    } else {
        None
    };
    rgb.is_some_and(|rgb| to_oklab(rgb)[0] < 0.5)
}

// `look.canvas.paper ?? 'paper'`
fn canvas_paper(look: &Look) -> &str {
    look.canvas.get("paper").map_or("paper", String::as_str)
}

fn resolve_base(look: &Look, v: &str) -> String {
    let base = look.colors.get(v).map_or(v, String::as_str);
    look.colors
        .get(base)
        .map_or(base, String::as_str)
        .to_string()
}

// The tint `rgb` at `alpha` laid over `over`, mixed in OKLCH so it keeps the tint's hue: lightness moves from the
// backdrop's towards the tint's, chroma is the tint's share, the hue is the tint's. Written back as rgba whose plain alpha blend over
// `over` gives exactly that colour, so it stays see-through like any other tint. Grey tints are left as they are.
fn hue_tint(rgb: Rgb, alpha: f64, over: Rgb) -> Option<String> {
    let t = to_oklab(rgb);
    let b = to_oklab(over);
    let ct = js::hypot(&[t[1], t[2]]);
    let cb = js::hypot(&[b[1], b[2]]);
    if ct < 0.05 || alpha <= 0.0 || alpha >= 1.0 {
        return None;
    }
    // Colour is seen less the darker it is, so on a dark backdrop the tint's share of chroma is raised (up to 3x on
    // a page as dark as Night's) to read as strongly as the same tint does on a light page; otherwise rose and amber
    // at 0.1 are both the same brown. Lightness moves half as much again, which gives cyans and greens (narrow in
    // gamut when dark) room for that chroma and leaves text on the tint as readable. A light backdrop is unchanged.
    let dark = js::min(1.0, js::max(0.0, (0.5 - b[0]) / 0.25));
    let boost = 1.0 + 2.0 * dark;
    let l = b[0] + (t[0] - b[0]) * alpha * (1.0 + 0.5 * dark);
    let h = js::atan2(t[2], t[1]);
    // the backdrop's own colour counts only as far as it leans the tint's way, so a warm tint on a navy page is as
    // strong as it would be on a grey one, and an indigo tint on navy comes out as a plain blend would
    let lean = if cb != 0.0 && !cb.is_nan() {
        js::max(0.0, (b[1] * t[1] + b[2] * t[2]) / (cb * ct))
    } else {
        0.0
    };
    // never more chroma than the tint colour itself has
    let mut c = js::min(ct, ct * alpha * boost + cb * lean * (1.0 - alpha));
    let mut target = from_oklab([l, c * js::cos(h), c * js::sin(h)]);
    while !in_gamut(target) && c > 0.001 {
        c *= 0.95;
        target = from_oklab([l, c * js::cos(h), c * js::sin(h)]);
    }
    let target = target.map(|v| js::min(255.0, js::max(0.0, v)));
    // the least opacity at or above the author's whose colour, blended over the backdrop, can reach the target
    let mut a = alpha;
    for i in 0..3 {
        let d = target[i] - over[i];
        if d > 0.0 {
            a = js::max(a, d / or_one(255.0 - over[i]));
        }
        if d < 0.0 {
            a = js::max(a, -d / or_one(over[i]));
        }
    }
    a = js::min(1.0, (a * 1000.0).ceil() / 1000.0);
    let ch = |i: usize| {
        js::num_str(js::round(js::min(
            255.0,
            js::max(0.0, over[i] + (target[i] - over[i]) / a),
        )))
    };
    Some(format!(
        "rgba({},{},{},{})",
        ch(0),
        ch(1),
        ch(2),
        js::num_str(a)
    ))
}

// `x || 1`
fn or_one(x: f64) -> f64 {
    if x == 0.0 || x.is_nan() { 1.0 } else { x }
}

// `/^(.*)\/([0-9.]+)$/`: the text before the last `/` and the alpha digits after it.
fn split_alpha(v: &str) -> Option<(&str, &str)> {
    let (head, tail) = v.rsplit_once('/')?;
    let tail_ok = !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit() || b == b'.');
    let head_ok = !head.contains(['\n', '\r', '\u{2028}', '\u{2029}']);
    (tail_ok && head_ok).then_some((head, tail))
}

// Accepts: none, #hex, a colour name from the look, and any of those followed by /alpha.
// `over` is what the colour will be laid on (a colour as a look writes it); the page when not given. It matters
// only for tints on a look whose tints keep their hue.
pub fn color(look: &Look, v: Option<&str>, over: Option<&str>) -> String {
    let Some(mut v) = v.filter(|v| !v.is_empty() && *v != "none" && *v != "transparent") else {
        return "none".to_string();
    };
    let mut alpha: Option<f64> = None;
    if let Some((head, tail)) = split_alpha(v)
        && !v.starts_with("rgb")
    {
        v = head;
        alpha = Some(js::parse_float(tail));
    }
    let base = resolve_base(look, v);
    let Some(alpha) = alpha else {
        return base;
    };
    let rgb = if base.starts_with('#') {
        hex_to_rgb(&base)
    } else {
        None
    };
    let Some(rgb) = rgb else {
        return base;
    };
    if tint_keeps_hue(look) {
        let under = backdrop(look, over).or_else(|| backdrop(look, Some(canvas_paper(look))));
        if let Some(mixed) = under.and_then(|under| hue_tint(rgb, alpha, under)) {
            return mixed;
        }
    }
    format!(
        "rgba({},{},{},{})",
        js::num_str(rgb[0]),
        js::num_str(rgb[1]),
        js::num_str(rgb[2]),
        js::num_str(alpha)
    )
}

// An opaque colour to mix a tint against; a see-through one is laid over the page first.
fn backdrop(look: &Look, v: Option<&str>) -> Option<Rgb> {
    let v = v.filter(|v| !v.is_empty() && *v != "none")?;
    let rgb = |c: &str| {
        let b = resolve_base(look, c);
        if b.starts_with('#') {
            hex_to_rgb(&b)
        } else {
            None
        }
    };
    let Some((head, tail)) = split_alpha(v) else {
        return rgb(v);
    };
    let top = rgb(head);
    let page = rgb(canvas_paper(look));
    let a = js::parse_float(tail);
    let (Some(top), Some(page)) = (top, page) else {
        return top;
    };
    Some([0, 1, 2].map(|i| top[i] * a + page[i] * (1.0 - a)))
}

pub fn is_color(look: &Look, v: &str) -> bool {
    if v == "none" || v == "transparent" || v.starts_with("rgb") {
        return true;
    }
    // v.replace(/\/[0-9.]+$/, '')
    let base = match v.rsplit_once('/') {
        Some((head, tail))
            if !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit() || b == b'.') =>
        {
            head
        }
        _ => v,
    };
    if look.colors.contains_key(base) {
        return true;
    }
    base.starts_with('#') && hex_to_rgb(base).is_some()
}

/// The font families that ship with FastDraw (fonts/). A look may name any other; where its files cannot be
/// read, text falls back to the shipped family for its role (`fallback_family`). Mirrors look.ts.
pub const SHIPPED_FAMILIES: [&str; 6] = [
    "Geist",
    "Geist Mono",
    "Newsreader",
    "Libre Franklin",
    "Instrument Serif",
    "Sketch Hand",
];
const SYSTEM_FAMILIES: [&str; 4] = ["sans-serif", "serif", "monospace", "helvetica"];

pub fn is_shipped_family(fam: &str) -> bool {
    SHIPPED_FAMILIES
        .iter()
        .chain(SYSTEM_FAMILIES.iter())
        .any(|f| f.eq_ignore_ascii_case(fam))
}

/// The shipped family that stands in for `fam` (used for `role`) when its files are not there.
pub fn fallback_family(role: &str, fam: &str) -> &'static str {
    if role == "mono" || fam.to_ascii_lowercase().contains("mono") {
        "Geist Mono"
    } else if role == "serif" {
        "Newsreader"
    } else {
        "Geist"
    }
}

pub fn font_family(look: &Look, v: Option<&str>) -> String {
    let name = v.unwrap_or("sans");
    let fam = look.fonts.get(name).map_or(name, String::as_str);
    let generic = match name {
        "mono" => "monospace",
        "serif" => "serif",
        _ => "sans-serif",
    };
    if is_shipped_family(fam) {
        format!("'{fam}', {generic}")
    } else {
        format!("'{fam}', '{}', {generic}", fallback_family(name, fam))
    }
}

/// The looks that ship inside FastDraw, by the name a diagram gives them: `look sketch`. A name is a
/// bare word; anything with a slash or ending in .look is a file path.
pub fn bundled_look_names() -> Vec<&'static str> {
    bundled_looks().keys().copied().collect()
}

pub fn is_bundled_look(p: &str) -> bool {
    bundled_looks().contains_key(p)
}

/// A bundled look, parsed once and shared.
pub fn bundled_look(name: &str) -> Option<Arc<Look>> {
    static CACHE: OnceLock<IndexMap<&'static str, Arc<Look>>> = OnceLock::new();
    if !is_bundled_look(name) {
        return None;
    }
    let cache = CACHE.get_or_init(|| {
        bundled_looks()
            .iter()
            .map(|(&n, &src)| (n, Arc::new(parse_look(src, &format!("{n} look")))))
            .collect()
    });
    cache.get(name).cloned()
}

pub fn bundled_look_source(name: &str) -> Option<&'static str> {
    bundled_looks().get(name).copied()
}

/// The built-in look, used when a diagram names no look of its own.
pub fn default_look() -> Arc<Look> {
    static CACHE: OnceLock<Arc<Look>> = OnceLock::new();
    CACHE
        .get_or_init(|| Arc::new(parse_look(DEFAULT_LOOK, "default look")))
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_look() {
        let src = "color ink #112233\nstyle node fill=ink stroke=muted\nstyle hot extends node fill=accent sw=2\nicon q \"M4 6h16\"\nicon Bad \"M0\"\ndark night\nfontdir \"./f\"";
        let l = parse_look(src, "p");
        assert_eq!(l.colors.get("ink").unwrap(), "#112233");
        let hot = &l.styles["hot"];
        assert_eq!(hot.kind, Kind::Shape);
        // the base's props keep their place; later ones override in place or go last
        let got: Vec<_> = hot.props.iter().map(|(k, v)| format!("{k}={v}")).collect();
        assert_eq!(got, ["fill=accent", "stroke=muted", "sw=2"]);
        assert_eq!(l.icons.get("q"), Some(&["M4 6h16".to_string()][..]));
        assert_eq!(
            l.issues,
            [LookIssue {
                line: 5,
                level: IssueLevel::Error,
                msg: "icon needs a name in small letters, e.g. icon queue \"M4 6h16 M4 12h16 M4 18h16\"".into(),
                file: Some("p".into()),
            }]
        );
        assert_eq!(l.dark.as_deref(), Some("night"));
        assert_eq!(l.font_dirs, ["./f"]);
    }

    #[test]
    fn reports_bad_statements() {
        let l = parse_look(
            "style a extends nope\nstyle b wat\ndark\nicon x \"Q!\"\nfoo\n\"x\"\ncolor a",
            "f.look",
        );
        let msgs: Vec<_> = l.issues.iter().map(|i| (i.line, i.msg.as_str())).collect();
        assert_eq!(
            msgs[0],
            (
                1,
                "style \"a\" extends an unknown style \"nope\" (define the base first)"
            )
        );
        assert_eq!(msgs[1], (2, "unexpected word \"wat\" in style \"b\""));
        assert!(
            msgs[2].1.starts_with("dark needs one look:") && msgs[2].1.contains("(named looks: ")
        );
        assert_eq!(
            msgs[3],
            (
                4,
                "icon x needs its outline as SVG path data in quotes, drawn in a 24x24 box, e.g. \"M4 6h16 M4 12h16\""
            )
        );
        assert_eq!(msgs[4], (5, "unknown look statement \"foo\""));
        assert_eq!(msgs[5].0, 6);
        assert_eq!(msgs[6], (7, "color needs a name and a value"));
        assert!(l.issues.iter().all(|i| i.file.as_deref() == Some("f.look")));
    }

    #[test]
    fn colours_match_node() {
        let d = default_look();
        let c = |v, over| color(&d, Some(v), over);
        assert_eq!(c("ink/0.5", None), "rgba(18,19,24,0.5)");
        assert_eq!(c("accent", Some("paper")), "#dc2f2f");
        assert_eq!(c("#abc", None), "#abc");
        assert_eq!(c("#abc/0.5", None), "rgba(170,187,204,0.5)");
        assert_eq!(c("accent/0.1", None), "rgba(220,47,47,0.1)");
        assert_eq!(c("ink/.", None), "rgba(18,19,24,NaN)");
        assert_eq!(c("ink/1.2.3", None), "rgba(18,19,24,1.2)");
        assert_eq!(c("#ff0000/x", None), "#ff0000/x");
        assert_eq!(c("rgb(1,2,3)/0.5", None), "rgb(1,2,3)/0.5");
        assert_eq!(color(&d, None, None), "none");
        assert_eq!(color(&d, Some("transparent"), None), "none");
    }

    #[test]
    fn hue_tints_match_node() {
        let n = bundled_look("night").unwrap();
        let c = |v, over| color(&n, Some(v), over);
        assert!(tint_keeps_hue(&n) && !tint_keeps_hue(&default_look()));
        assert_eq!(c("accent/0.1", None), "rgba(129,37,0,0.415)");
        assert_eq!(c("#f59e0b/0.1", Some("#0b1020")), "rgba(63,37,0,0.798)");
        assert_eq!(c("#f59e0b/0.1", Some("ink/0.5")), "rgba(252,152,0,0.138)");
        assert_eq!(c("#ff0000/0.5", Some("#00f/0.3")), "rgba(231,22,0,0.87)");
        assert_eq!(c("#ff0000/0.3", None), "rgba(143,5,0,0.908)");
        assert_eq!(c("#888/0.0", None), "rgba(136,136,136,0)");
    }

    #[test]
    fn is_color_and_font_family() {
        let d = default_look();
        assert!(is_color(&d, "ink/0.5") && is_color(&d, "#abc/2") && is_color(&d, "rgb(1)"));
        assert!(!is_color(&d, "#abcd") && !is_color(&d, "zzz"));
        assert_eq!(font_family(&d, Some("mono")), "'Geist Mono', monospace");
        assert_eq!(font_family(&d, None), "'Geist', sans-serif");
        assert_eq!(font_family(&d, Some("Foo")), "'Foo', 'Geist', sans-serif");
        assert_eq!(font_family(&d, Some("Geist")), "'Geist', sans-serif");
    }

    #[test]
    fn bundled_looks_are_shared() {
        assert!(bundled_look("nope").is_none() && !is_bundled_look(""));
        let (a, b) = (
            bundled_look("night").unwrap(),
            bundled_look("night").unwrap(),
        );
        assert!(Arc::ptr_eq(&a, &b));
        assert!(bundled_look_names().contains(&"night"));
        assert_eq!(default_look().issues, []);
        fn assert_send_sync<T: Send + Sync + Clone>() {}
        assert_send_sync::<Look>();
    }
}
