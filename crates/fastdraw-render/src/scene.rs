//! scene.ts: the scene types, text measuring, the helpers `build_scene` leans on (sides, routes,
//! curves, labels, table layout, connector ends), and `build_scene` itself. `look_path` and `with_look` live in parse.rs.
//! The helpers are public so the crate's later modules (and tests) can reach them.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock};

use indexmap::IndexMap;
use regex::Regex;

use crate::data::{font_widths, width_chars};
use crate::icons::{icon_matches, is_built_in};
use crate::js::{self, num_str, round, to_number, utf16_len};
use crate::look::{
    IssueLevel, Kind, Look, LookIssue, Props, bundled_look, bundled_look_names, default_look,
    empty_look,
};
use crate::parse::{Stmt, TokKind, parse_statements};
use crate::router::{Pt, Rect, crosses, route_around};

/// The names `m[2] in DIRS` accepts besides the four sides: the properties of Object.prototype that match
/// `[A-Za-z_][\w-]*` (`Object.getOwnPropertyNames(Object.prototype)`).
const PROTO_NAMES: [&str; 12] = [
    "constructor",
    "__defineGetter__",
    "__defineSetter__",
    "hasOwnProperty",
    "__lookupGetter__",
    "__lookupSetter__",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toString",
    "valueOf",
    "__proto__",
    "toLocaleString",
];

/// `name in DIRS`: a side, or (as in the TypeScript, which tests an object literal) an Object.prototype name.
pub fn in_dirs(name: &str) -> bool {
    Side::from_name(name).is_some()
}

/// A side of a shape. `Proto` is a name `in DIRS` accepts only through the prototype chain ("constructor",
/// "toString", ...): the TypeScript then holds that string as the side. `side_point` gives it the "right"
/// formula (it is not top or bottom, and falls through the left test). `DIRS[side]` is a function or object
/// there, so `.x` and `.y` are undefined: arithmetic on them is NaN while the direction itself stays truthy
/// (`dir()` returns it as Some(NaN, NaN) for that reason); `e.side === 'top'` style tests are all false.
/// Two such directions are equal coordinate by coordinate (`undefined === undefined`), which `route` honours.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Top,
    Bottom,
    Left,
    Right,
    Proto(&'static str),
}

impl Side {
    pub fn as_str(self) -> &'static str {
        match self {
            Side::Top => "top",
            Side::Bottom => "bottom",
            Side::Left => "left",
            Side::Right => "right",
            Side::Proto(name) => name,
        }
    }

    /// The side `name` stands for when `name in DIRS`.
    pub fn from_name(s: &str) -> Option<Side> {
        match s {
            "top" => Some(Side::Top),
            "bottom" => Some(Side::Bottom),
            "left" => Some(Side::Left),
            "right" => Some(Side::Right),
            _ => PROTO_NAMES
                .iter()
                .find(|&&n| n == s)
                .map(|&n| Side::Proto(n)),
        }
    }

    /// `DIRS[side]`.
    pub fn dir(self) -> Pt {
        match self {
            Side::Top => Pt { x: 0.0, y: -1.0 },
            Side::Bottom => Pt { x: 0.0, y: 1.0 },
            Side::Left => Pt { x: -1.0, y: 0.0 },
            Side::Right => Pt { x: 1.0, y: 0.0 },
            Side::Proto(_) => Pt {
                x: f64::NAN,
                y: f64::NAN,
            },
        }
    }
}

/// `style` is the key written in the legend statement: a style name, or swatch.colour / dot.colour / line.colour.
#[derive(Debug, Clone, PartialEq)]
pub struct LegendItem {
    pub style: String,
    pub kind: Kind,
    pub label: String,
    pub x: f64,
    pub baseline: f64,
    pub sample: f64,
    pub props: Option<Props>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RowKind {
    Row,
    Head,
    Rule,
}

/// One row of a table box. y and h are filled in by the layout; a 'rule' row is a dividing line with no height.
/// On a chart a row is one series: id is its kind (bars, line, area, dots), cells[0] its name, vals its numbers.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub id: Option<String>,
    pub kind: RowKind,
    pub cells: Vec<String>,
    pub vals: Vec<String>,
    pub p: Props,
    pub y: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Col {
    pub x: f64,
    pub w: f64,
}

/// `Box & { ... }`: the box is flattened into x, y, w, h.
#[derive(Debug, Clone, PartialEq)]
pub struct Shape {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub id: String,
    pub line: u32,
    pub style: String,
    pub p: Props,
    pub shape: String,
    pub text: Option<String>,
    pub back: bool,
    pub legend: Option<Vec<LegendItem>>,
    pub rows: Option<Vec<Row>>,
    pub cols: Option<Vec<Col>>,
    pub head_h: Option<f64>,
    /// shape=polygon: its corners on the canvas
    pub poly: Option<Vec<Pt>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TextEl {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub id: String,
    pub line: u32,
    pub style: String,
    pub p: Props,
    pub text: String,
    pub ax: f64,
    pub ay: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndKind {
    Point,
    Rel,
    Shape,
    Conn,
}

#[derive(Debug, Clone, PartialEq)]
pub struct End {
    pub raw: String,
    pub kind: EndKind,
    pub id: Option<String>,
    pub row: Option<String>,
    pub side: Option<Side>,
    pub v: Option<f64>,
    pub rel: Option<Pt>,
    pub pt: Pt,
    pub dir: Option<Pt>,
    pub fanned: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Label {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub text: String,
    pub cx: f64,
    pub baseline: f64,
    pub size: f64,
    pub spacing: f64,
    pub font: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Conn {
    pub id: String,
    pub line: u32,
    pub style: String,
    pub p: Props,
    pub a: End,
    pub b: End,
    pub pts: Vec<Pt>,
    pub head: bool,
    pub tail: bool,
    pub head_m: String,
    pub tail_m: String,
    pub ortho: bool,
    pub ushape: bool,
    /// route=curve: pts holds the smooth line as many short steps
    pub curve: bool,
    pub text: Option<String>,
    pub label: Option<Label>,
}

#[derive(Debug, Clone)]
pub struct Scene {
    /// the picture's extent: everything drawn, plus a margin all round (there is no fixed page)
    pub file: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub look: Arc<Look>,
    pub canvas_line: Option<u32>,
    /// the canvas line still carries a WxH, which is no longer used
    pub canvas_size: Option<bool>,
    /// the look's own canvas statement, before the diagram's canvas line overrides any of it
    pub base_canvas: Option<Props>,
    /// extra font files the look brings (command line only)
    pub font_files: Option<Vec<String>>,
    pub shapes: Vec<Shape>,
    pub texts: Vec<TextEl>,
    pub conns: Vec<Conn>,
    pub issues: Vec<LookIssue>,
}

/// What can sit on the end of a line. The last six are the entity-relationship cardinalities.
pub const SERIES: [&str; 4] = ["bars", "line", "area", "dots"];
/// The background keys a diagram's canvas line may set, overriding the look's canvas statement.
pub const CANVAS_KEYS: [&str; 3] = ["paper", "dots", "dotgap"];
pub const MARKERS: [&str; 15] = [
    "none",
    "arrow",
    "open",
    "triangle",
    "diamond",
    "diamond-solid",
    "dot",
    "circle",
    "stop",
    "one",
    "only-one",
    "many",
    "one-many",
    "zero-one",
    "zero-many",
];

/// `(v === undefined || v === '' || isNaN(+v)) ? d : +v`
pub fn num(v: Option<&str>, d: f64) -> f64 {
    match v {
        None | Some("") => d,
        Some(s) => {
            let n = to_number(s);
            if n.is_nan() { d } else { n }
        }
    }
}

/// `+(v ?? d) || d`: the number, or `d` when it is NaN or 0.
fn plus_or(v: Option<&str>, d: f64) -> f64 {
    let n = v.map_or(d, to_number);
    if n == 0.0 || n.is_nan() { d } else { n }
}

/// `x || 1`
fn or_one(x: f64) -> f64 {
    if x == 0.0 || x.is_nan() { 1.0 } else { x }
}

/// `Math.sign`
fn sign(x: f64) -> f64 {
    if x.is_nan() || x == 0.0 {
        x
    } else if x > 0.0 {
        1.0
    } else {
        -1.0
    }
}

pub fn text_width(text: &str, size: f64, font: &str, weight: f64, spacing: f64) -> f64 {
    let f = if font == "mono" {
        0.6
    } else if font == "serif" {
        0.46
    } else if weight >= 600.0 {
        0.58
    } else {
        0.56
    };
    utf16_len(text) as f64 * size * (f + spacing)
}

/// How wide text is when drawn in a look's font, letter by letter from the widths of the fonts FastDraw ships
/// (a family it does not ship is measured as the bundled font for its role), with the look's letter-spacing.
/// text_width above stays the generous guess that sizes boxes; this is for things that must hug their text.
pub fn measure_text(
    look: &Look,
    text: &str,
    size: f64,
    role: &str,
    weight: f64,
    spacing: f64,
) -> f64 {
    let fam = look
        .fonts
        .get(role)
        .map_or(role, String::as_str)
        .to_lowercase();
    let n = text.chars().count();
    let mut em = 0.0;
    // a family name comes from the look file, so only the table's own keys count
    let known = font_widths().get(&fam);
    if fam.contains("mono") || (role == "mono" && known.is_none()) {
        em = n as f64 * 0.6;
    } else {
        let by_weight = known.unwrap_or_else(|| {
            &font_widths()[if role == "serif" {
                "newsreader"
            } else {
                "geist"
            }]
        });
        // the nearest weight, the heavier of two equally near; a NaN or infinite difference falls to "heavier first"
        let cmp = |a: f64, b: f64| -> f64 {
            let d = (a - weight).abs() - (b - weight).abs();
            let d = if d == 0.0 || d.is_nan() { b - a } else { d };
            if d.is_nan() { 0.0 } else { d }
        };
        let mut near = &by_weight[0];
        for e in &by_weight[1..] {
            if cmp(f64::from(e.0), f64::from(near.0)) < 0.0 {
                near = e;
            }
        }
        let table = &near.1;
        let chars = width_chars();
        // WIDTH_CHARS.indexOf(ch): the table holds only BMP characters, so an astral one is never found
        let idx = |c: char| {
            if c.len_utf16() == 1 {
                let u = c as u32 as u16;
                chars.iter().position(|&x| x == u)
            } else {
                None
            }
        };
        let fallback = f64::from(table[idx('o').unwrap()]);
        for ch in text.chars() {
            let w = idx(ch)
                .and_then(|i| table.get(i))
                .map_or(-1.0, |&w| f64::from(w));
            em += (if w >= 0.0 {
                w
            } else if ch as u32 >= 0x1100 {
                100.0
            } else {
                fallback
            }) / 100.0;
        }
    }
    em * size + n.saturating_sub(1) as f64 * spacing * size
}

fn cx(b: &Rect) -> f64 {
    b.x + b.w / 2.0
}
fn cy(b: &Rect) -> f64 {
    b.y + b.h / 2.0
}
fn within(v: f64, lo: f64, hi: f64) -> bool {
    v >= lo && v <= hi
}

pub fn auto_sides(a: &Rect, b: &Rect) -> (Side, Side) {
    if within(cx(a), b.x, b.x + b.w) || within(cx(b), a.x, a.x + a.w) {
        return if cy(a) <= cy(b) {
            (Side::Bottom, Side::Top)
        } else {
            (Side::Top, Side::Bottom)
        };
    }
    if within(cy(a), b.y, b.y + b.h) || within(cy(b), a.y, a.y + a.h) {
        return if cx(a) <= cx(b) {
            (Side::Right, Side::Left)
        } else {
            (Side::Left, Side::Right)
        };
    }
    (
        if cx(b) > cx(a) {
            Side::Right
        } else {
            Side::Left
        },
        if cy(a) < cy(b) {
            Side::Top
        } else {
            Side::Bottom
        },
    )
}

/// Point on a shape's side. v: None = use fraction f; <= 1 = fraction; > 1 = absolute coordinate.
/// `shape` is the shape's `shape` property (diamonds and ellipses pull their sides in).
pub fn side_point(s: &Rect, shape: Option<&str>, side: Side, v: Option<f64>, f: f64) -> Pt {
    let horiz = side == Side::Top || side == Side::Bottom;
    let frac = match v {
        Some(v) if v <= 1.0 => v,
        _ => f,
    };
    let mut along = match v {
        Some(v) if v > 1.0 => v,
        _ if horiz => s.x + frac * s.w,
        _ => s.y + frac * s.h,
    };
    let (lo, hi) = if horiz {
        (s.x, s.x + s.w)
    } else {
        (s.y, s.y + s.h)
    };
    along = round(js::min(js::max(along, lo), hi));
    let mut inset = 0.0;
    let t = if horiz {
        (along - cx(s)).abs() / or_one(s.w / 2.0)
    } else {
        (along - cy(s)).abs() / or_one(s.h / 2.0)
    };
    let half = if horiz { s.h / 2.0 } else { s.w / 2.0 };
    if shape == Some("diamond") {
        inset = half * t;
    } else if shape == Some("ellipse") {
        inset = half * (1.0 - js::max(0.0, 1.0 - t * t).sqrt());
    }
    inset = round(inset);
    match side {
        Side::Top => Pt {
            x: along,
            y: s.y + inset,
        },
        Side::Bottom => Pt {
            x: along,
            y: s.y + s.h - inset,
        },
        Side::Left => Pt {
            x: s.x + inset,
            y: along,
        },
        // Side::Proto takes the TypeScript's final `return` too
        Side::Right | Side::Proto(_) => Pt {
            x: s.x + s.w - inset,
            y: along,
        },
    }
}

pub fn corner(a: Pt, b: Pt, horiz_first: bool) -> Pt {
    if horiz_first {
        Pt { x: b.x, y: a.y }
    } else {
        Pt { x: a.x, y: b.y }
    }
}

pub fn route(c: &mut Conn, via: &[Pt]) -> Vec<Pt> {
    let (p0, p1, d0, d1) = (c.a.pt, c.b.pt, c.a.dir, c.b.dir);
    if !c.ortho {
        let mut out = vec![p0];
        out.extend_from_slice(via);
        out.push(p1);
        return out;
    }
    if via.is_empty() {
        let aligned = p0.x == p1.x || p0.y == p1.y;
        if let (Some(d0), Some(d1)) = (d0, d1) {
            let (h0, h1) = (d0.x != 0.0, d1.x != 0.0);
            if h0 != h1 {
                return vec![p0, corner(p0, p1, h0), p1];
            }
            // a NaN coordinate is the `undefined` of a Side::Proto direction, and undefined === undefined
            let eq = |a: f64, b: f64| a == b || (a.is_nan() && b.is_nan());
            let same = eq(d0.x, d1.x) && eq(d0.y, d1.y);
            if same {
                c.ushape = true;
                let off = num(c.p.get("loop").map(String::as_str), 36.0);
                if h0 {
                    let ox = if d0.x > 0.0 {
                        js::max(p0.x, p1.x) + off
                    } else {
                        js::min(p0.x, p1.x) - off
                    };
                    return vec![p0, Pt { x: ox, y: p0.y }, Pt { x: ox, y: p1.y }, p1];
                }
                let oy = if d0.y > 0.0 {
                    js::max(p0.y, p1.y) + off
                } else {
                    js::min(p0.y, p1.y) - off
                };
                return vec![p0, Pt { x: p0.x, y: oy }, Pt { x: p1.x, y: oy }, p1];
            }
            if if h0 { p0.y == p1.y } else { p0.x == p1.x } {
                return vec![p0, p1];
            }
            if h0 {
                let mx = round((p0.x + p1.x) / 2.0);
                return vec![p0, Pt { x: mx, y: p0.y }, Pt { x: mx, y: p1.y }, p1];
            }
            let my = round((p0.y + p1.y) / 2.0);
            return vec![p0, Pt { x: p0.x, y: my }, Pt { x: p1.x, y: my }, p1];
        }
        if aligned {
            return vec![p0, p1];
        }
        // An end on a free point has no side to arrive from: it is met along the main direction of travel,
        // with the step in the middle, so its arrowhead does not turn up or down in the last few pixels.
        let (dx, dy) = (p1.x - p0.x, p1.y - p0.y);
        let horiz = dx.abs() >= dy.abs();
        let zig = || -> Vec<Pt> {
            if horiz {
                let mx = round((p0.x + p1.x) / 2.0);
                return vec![p0, Pt { x: mx, y: p0.y }, Pt { x: mx, y: p1.y }, p1];
            }
            let my = round((p0.y + p1.y) / 2.0);
            vec![p0, Pt { x: p0.x, y: my }, Pt { x: p1.x, y: my }, p1]
        };
        // a shape side that already faces the main direction leads into the same step
        let faces = |d: Pt, s: f64| {
            if horiz {
                d.x * dx * s > 0.0
            } else {
                d.y * dy * s > 0.0
            }
        };
        if let Some(d0) = d0 {
            return if faces(d0, 1.0) {
                zig()
            } else {
                vec![p0, corner(p0, p1, d0.x != 0.0), p1]
            };
        }
        if let Some(d1) = d1 {
            return if faces(d1, -1.0) {
                zig()
            } else {
                vec![p0, corner(p0, p1, d1.x == 0.0), p1]
            };
        }
        return zig();
    }
    let mut pts = vec![p0];
    pts.extend_from_slice(via);
    pts.push(p1);
    let mut out = vec![p0];
    for i in 0..pts.len() - 1 {
        let (a, b) = (pts[i], pts[i + 1]);
        if a.x != b.x && a.y != b.y {
            let hf = if let (true, Some(d1)) = (i == pts.len() - 2, d1) {
                d1.x == 0.0
            } else if let (0, Some(d0)) = (i, d0) {
                d0.x != 0.0
            } else if out.len() >= 2 {
                out[out.len() - 2].y != a.y
            } else {
                true
            };
            out.push(corner(a, b, hf));
        }
        out.push(b);
    }
    out
}

/// A smooth line from P0 to P1, returned as short straight steps so everything else can treat it as a polyline.
/// With via points it passes through each of them. With bend it bows that many px to the left of its direction
/// of travel (negative: to the right). Otherwise it leaves and arrives along the sides it is attached to.
pub fn curve_pts(p0: Pt, d0: Option<Pt>, p1: Pt, d1: Option<Pt>, via: &[Pt], bend: f64) -> Vec<Pt> {
    let mut segs: Vec<[Pt; 4]> = Vec::new();
    let (dx, dy) = (p1.x - p0.x, p1.y - p0.y);
    let dist = or_one(js::hypot(&[dx, dy]));
    if !via.is_empty() {
        // through each point along the line joining its neighbours; the ends leave and arrive along the sides
        // they are attached to. Each handle is a third of its own segment, so a short hop next to a long one
        // rounds the corner instead of swinging wide.
        let mut p = vec![p0];
        p.extend_from_slice(via);
        p.push(p1);
        let unit = |x: f64, y: f64| {
            let l = or_one(js::hypot(&[x, y]));
            Pt { x: x / l, y: y / l }
        };
        let last = p.len() - 1;
        let t: Vec<Pt> = p
            .iter()
            .enumerate()
            .map(|(i, q)| {
                if i == 0 {
                    d0.unwrap_or_else(|| unit(p[1].x - q.x, p[1].y - q.y))
                } else if i == last {
                    d1.map_or_else(
                        || unit(q.x - p[i - 1].x, q.y - p[i - 1].y),
                        |d| Pt { x: -d.x, y: -d.y },
                    )
                } else {
                    unit(p[i + 1].x - p[i - 1].x, p[i + 1].y - p[i - 1].y)
                }
            })
            .collect();
        for i in 0..last {
            let (q1, q2) = (p[i], p[i + 1]);
            let l = js::hypot(&[q2.x - q1.x, q2.y - q1.y]) / 3.0;
            segs.push([
                q1,
                Pt {
                    x: q1.x + t[i].x * l,
                    y: q1.y + t[i].y * l,
                },
                Pt {
                    x: q2.x - t[i + 1].x * l,
                    y: q2.y - t[i + 1].y * l,
                },
                q2,
            ]);
        }
    } else if !bend.is_nan() {
        let ox = (dy / dist) * bend * (4.0 / 3.0);
        let oy = (-dx / dist) * bend * (4.0 / 3.0);
        segs.push([
            p0,
            Pt {
                x: p0.x + dx / 3.0 + ox,
                y: p0.y + dy / 3.0 + oy,
            },
            Pt {
                x: p0.x + (2.0 * dx) / 3.0 + ox,
                y: p0.y + (2.0 * dy) / 3.0 + oy,
            },
            p1,
        ]);
    } else {
        let k = js::min(js::max(dist * 0.4, 24.0), 160.0);
        let flat = dx.abs() >= dy.abs();
        let u0 = d0.unwrap_or(if flat {
            Pt {
                x: or_one(sign(dx)),
                y: 0.0,
            }
        } else {
            Pt {
                x: 0.0,
                y: or_one(sign(dy)),
            }
        });
        let u1 = d1.unwrap_or(if flat {
            Pt {
                x: -or_one(sign(dx)),
                y: 0.0,
            }
        } else {
            Pt {
                x: 0.0,
                y: -or_one(sign(dy)),
            }
        });
        segs.push([
            p0,
            Pt {
                x: p0.x + u0.x * k,
                y: p0.y + u0.y * k,
            },
            Pt {
                x: p1.x + u1.x * k,
                y: p1.y + u1.y * k,
            },
            p1,
        ]);
    }
    let mut out = vec![p0];
    const N: u32 = 24;
    for [a, b, c, d] in segs {
        for i in 1..=N {
            let t = f64::from(i) / f64::from(N);
            let m = 1.0 - t;
            let f = |a: f64, b: f64, c: f64, d: f64| {
                m * m * m * a + 3.0 * m * m * t * b + 3.0 * m * t * t * c + t * t * t * d
            };
            out.push(if i == N {
                d
            } else {
                Pt {
                    x: round(f(a.x, b.x, c.x, d.x) * 10.0) / 10.0,
                    y: round(f(a.y, b.y, c.y, d.y) * 10.0) / 10.0,
                }
            });
        }
    }
    out
}

pub fn point_along(c: &Conn, v: f64) -> Pt {
    let (first, last) = (c.pts[0], c.pts[c.pts.len() - 1]);
    if v > 1.0 {
        if first.x == last.x {
            return Pt { x: first.x, y: v };
        }
        if first.y == last.y {
            return Pt { x: v, y: first.y };
        }
    }
    let f = js::min(js::max(v, 0.0), 1.0);
    Pt {
        x: round(first.x + (last.x - first.x) * f),
        y: round(first.y + (last.y - first.y) * f),
    }
}

pub fn make_label(c: &Conn, avoid: &[Rect]) -> Option<Label> {
    let ctext = c.text.as_deref().filter(|t| !t.is_empty())?;
    let prop = |k: &str| c.p.get(k).map(String::as_str);
    let size = num(prop("label.size"), 8.0);
    let spacing = num(prop("label.spacing"), 0.08);
    let font = prop("label.font").unwrap_or("mono").to_string();
    let text = if prop("label.caps") == Some("0") {
        ctext.to_string()
    } else {
        ctext.to_uppercase()
    };
    let w = ((text_width(&text, size, &font, 400.0, spacing) + 12.0) / 4.0).ceil() * 4.0;
    let h = size + 4.0;
    if let Some(lpos) = prop("lpos").filter(|s| !s.is_empty()) {
        // a missing number is `undefined` in the TypeScript, which every later use turns into NaN
        let mut it = lpos.split(',').map(to_number);
        let lx = it.next().unwrap_or(f64::NAN);
        let ly = it.next().unwrap_or(f64::NAN);
        return Some(Label {
            text,
            cx: lx,
            baseline: ly,
            x: lx - w / 2.0,
            y: ly - h + 2.0,
            w,
            h,
            size,
            spacing,
            font,
        });
    }
    let mut best = 0usize;
    if c.curve {
        best = (c.pts.len() - 1) / 2; // the middle of the curve
    } else if c.ushape && c.pts.len() == 4 {
        best = 1;
    } else {
        let mut len = -1.0;
        for i in 0..c.pts.len() - 1 {
            let l = (c.pts[i + 1].x - c.pts[i].x).abs() + (c.pts[i + 1].y - c.pts[i].y).abs();
            if l > len {
                len = l;
                best = i;
            }
        }
    }
    let (a, b) = (c.pts[best], c.pts[best + 1]);
    let (mx, my) = ((a.x + b.x) / 2.0, (a.y + b.y) / 2.0);
    let vertical = a.x == b.x && a.y != b.y;
    // with no side asked for, a label that would land on a box goes to the other side of its line
    let at = |side: Option<&str>| -> Label {
        let mk = |cx: f64, baseline: f64, x: f64, y: f64| Label {
            text: text.clone(),
            cx,
            baseline,
            x,
            y,
            w,
            h,
            size,
            spacing,
            font: font.clone(),
        };
        if c.curve {
            // beside the middle of the curve, pushed out square to it far enough to clear the line
            let p = c.pts[best];
            let q = c.pts[(best + 1).min(c.pts.len() - 1)];
            let o = c.pts[best.saturating_sub(1)];
            let (tx, ty) = (q.x - o.x, q.y - o.y);
            let tl = or_one(js::hypot(&[tx, ty]));
            let (mut nx, mut ny) = (ty / tl, -tx / tl);
            if ny > 0.0 || (ny == 0.0 && nx < 0.0) {
                // up, or right of a vertical stretch
                nx = -nx;
                ny = -ny;
            }
            if side == Some("below") || side == Some("left") {
                nx = -nx;
                ny = -ny;
            }
            let off = 6.0 + (nx.abs() * w + ny.abs() * h) / 2.0;
            let lx = round(p.x + nx * off);
            let ly = round(p.y + ny * off);
            return mk(lx, ly + h / 2.0 - 3.0, lx - w / 2.0, ly - h / 2.0);
        }
        if vertical {
            let x = if side == Some("left") {
                a.x - 8.0 - w
            } else {
                a.x + 8.0
            };
            return mk(x + w / 2.0, round(my) + 3.0, x, round(my) - h + 5.0);
        }
        let baseline = if side == Some("below") {
            round(my) + 18.0
        } else {
            round(my) - 10.0
        };
        mk(round(mx), baseline, round(mx) - w / 2.0, baseline - h + 2.0)
    };
    let hits = |l: &Label| {
        avoid
            .iter()
            .any(|o| l.x < o.x + o.w && l.x + l.w > o.x && l.y < o.y + o.h && l.y + l.h > o.y)
    };
    let lside = prop("lside").filter(|s| !s.is_empty());
    let first = at(lside);
    if lside.is_some() || !hits(&first) {
        return Some(first);
    }
    let other = at(Some(if vertical { "left" } else { "below" }));
    Some(if hits(&other) { first } else { other })
}

fn issue(issues: &mut Vec<LookIssue>, line: u32, level: IssueLevel, msg: String) {
    issues.push(LookIssue {
        line,
        level,
        msg,
        file: None,
    });
}

/// Lays out a table box: a header with the title, then rows of cells in columns. The height always follows
/// the rows. Problems go to `issues` as errors or warnings at `line`.
pub fn layout_table(
    sh: &mut Shape,
    mut rows: Vec<Row>,
    min_w: f64,
    issues: &mut Vec<LookIssue>,
    line: u32,
) {
    let p = &sh.p;
    let prop = |k: &str| p.get(k).map(String::as_str);
    let fs = num(prop("cell.size"), 10.0);
    let font = prop("cell.font").unwrap_or("mono").to_string();
    let row_h = num(prop("row.h"), 24.0);
    let pad = num(prop("cell.pad"), 12.0);
    let gap = num(prop("cell.gap"), 16.0);
    let tsize = num(prop("title.size"), 12.0);
    let title = sh.text.as_deref().filter(|t| !t.is_empty());
    let tlines: Vec<&str> = title.map_or_else(Vec::new, |t| t.split('\n').collect());
    // each extra line adds a multiple of 4, to stay on the grid
    let head_h = if title.is_some() {
        num(prop("head.h"), 32.0) + (tlines.len() - 1) as f64 * ((tsize * 1.25) / 4.0).ceil() * 4.0
    } else {
        0.0
    };
    let n = rows.iter().map(|r| r.cells.len()).max().unwrap_or(0);
    // a row with a single cell in a table of several columns runs across the whole width instead of widening column 1
    let spans = |r: &Row| n > 1 && r.cells.len() == 1 && r.kind != RowKind::Head;
    let max = |it: &mut dyn Iterator<Item = f64>| it.fold(0.0, js::max);
    let mut widths: Vec<f64> = (0..n)
        .map(|j| {
            max(&mut rows
                .iter()
                .filter(|r| !spans(r))
                .map(|r| match r.cells.get(j) {
                    None => 0.0,
                    Some(c) => {
                        let weight = if r.kind == RowKind::Head {
                            600.0
                        } else {
                            400.0
                        };
                        text_width(c, fs, &font, weight, 0.0)
                    }
                }))
        })
        .collect();
    if prop("align") == Some("center") && n > 1 {
        let m = widths[1..].iter().copied().fold(f64::NEG_INFINITY, js::max);
        for w in &mut widths[1..] {
            *w = m;
        }
    }
    let span_w = max(&mut rows
        .iter()
        .filter(|r| spans(r))
        .map(|r| text_width(&r.cells[0], fs, &font, 400.0, 0.0) + pad * 2.0));
    let cols_w = if n > 0 {
        pad * 2.0 + widths.iter().fold(0.0, |a, b| a + b) + gap * (n - 1) as f64
    } else {
        0.0
    };
    let natural = js::max(span_w, cols_w);
    let title_w = if title.is_some() {
        let tf = prop("title.font").unwrap_or("sans");
        let tw = num(prop("title.weight"), 600.0);
        let ts = num(prop("title.spacing"), 0.0);
        tlines
            .iter()
            .map(|l| text_width(l, tsize, tf, tw, ts))
            .fold(f64::NEG_INFINITY, js::max)
            + pad * 2.0
    } else {
        0.0
    };
    let w_total = [natural, title_w, 48.0].into_iter().fold(min_w, js::max);
    let w_total = (w_total / 4.0).ceil() * 4.0;
    if min_w != 0.0 && !min_w.is_nan() && js::max(natural, title_w) > min_w + 4.0 {
        let msg = format!(
            "{} was given a width of {} but its content needs {}, so it is drawn {} wide; shorten the cells or give it room",
            sh.id,
            num_str(min_w),
            num_str(w_total),
            num_str(w_total)
        );
        issue(issues, line, IssueLevel::Warn, msg);
    }
    if n > 0 {
        widths[0] += w_total - cols_w; // spare width goes to the first column, so the others sit against the right edge
    }
    let mut cols = Vec::with_capacity(widths.len());
    let mut x = pad;
    for w in &widths {
        cols.push(Col { x, w: *w });
        x += w + gap;
    }
    let mut y = sh.y + head_h;
    let mut seen: HashSet<String> = HashSet::new();
    for r in &mut rows {
        r.y = y;
        r.h = if r.kind == RowKind::Rule {
            0.0
        } else {
            num(r.p.get("h").map(String::as_str), row_h)
        };
        y += r.h;
        if let Some(id) = r.id.as_deref().filter(|i| !i.is_empty()) {
            if seen.contains(id) {
                let msg = format!("the row id \"{id}\" is used twice in {}", sh.id);
                issue(issues, line, IssueLevel::Error, msg);
            }
            seen.insert(id.to_string());
        }
    }
    sh.w = w_total;
    sh.h = js::max(y - sh.y, row_h);
    sh.rows = Some(rows);
    sh.cols = Some(cols);
    sh.head_h = Some(head_h);
}

fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).unwrap())
}

/// A connector end as written: a point, a relative offset, or a shape (with side, table row and position).
/// Like the TypeScript's `m[2] in DIRS`, Object.prototype names ("constructor", "toString", ...) count as
/// sides (`Side::Proto`).
pub fn parse_end(raw: &str) -> Option<End> {
    let base = End {
        raw: raw.to_string(),
        kind: EndKind::Point,
        id: None,
        row: None,
        side: None,
        v: None,
        rel: None,
        pt: Pt { x: 0.0, y: 0.0 },
        dir: None,
        fanned: None,
    };
    // relative end: one of the numbers carries a "+" (+0,260  +40,-20  -40,+0). Two minus signs are a
    // plain point (-40,-20), since the canvas runs on past 0 in every direction
    static REL1: OnceLock<Regex> = OnceLock::new();
    static REL2: OnceLock<Regex> = OnceLock::new();
    static POINT: OnceLock<Regex> = OnceLock::new();
    static SHAPE: OnceLock<Regex> = OnceLock::new();
    let m = re(
        &REL1,
        r"^(\+[0-9]+(?:\.[0-9]+)?),([+-]?[0-9]+(?:\.[0-9]+)?)$",
    )
    .captures(raw)
    .or_else(|| re(&REL2, r"^(-[0-9]+(?:\.[0-9]+)?),(\+[0-9]+(?:\.[0-9]+)?)$").captures(raw));
    if let Some(m) = m {
        return Some(End {
            kind: EndKind::Rel,
            rel: Some(Pt {
                x: to_number(&m[1]),
                y: to_number(&m[2]),
            }),
            ..base
        });
    }
    if let Some(m) = re(&POINT, r"^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$").captures(raw)
    {
        return Some(End {
            kind: EndKind::Point,
            pt: Pt {
                x: to_number(&m[1]),
                y: to_number(&m[2]),
            },
            ..base
        });
    }
    // id, id.side, id.side@pos, and for a table row: id.row or id.row.left|right
    let m = re(
        &SHAPE,
        r"^([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z_][A-Za-z0-9_-]*))?(?:\.(left|right))?(?:@(-?[0-9.]+))?$",
    )
    .captures(raw)?;
    let g2 = m.get(2).map(|x| x.as_str());
    let g3 = m.get(3).map(|x| x.as_str());
    let side2 = g2.and_then(Side::from_name);
    if side2.is_some() && g3.is_some() {
        return None;
    }
    Some(End {
        kind: EndKind::Shape,
        id: Some(m[1].to_string()),
        row: if side2.is_some() {
            None
        } else {
            g2.map(str::to_string)
        },
        side: side2.or_else(|| g3.and_then(Side::from_name)),
        v: m.get(4).map(|x| to_number(x.as_str())),
        ..base
    })
}

// ---- buildScene ---------------------------------------------------------------------------------------------------

/// A legend with no size of its own, laid out once the content's width is known (the TypeScript's `legends` closures).
struct LegendSpec {
    /// the legend's index in `shapes`
    shape: usize,
    /// every style="label" pair of the statement
    entries: Vec<(String, String)>,
    fs: f64,
    font: String,
    titled: bool,
}

/// `/^(swatch|dot|line)\.(.+)$/`: a legend entry for something that is not a style of the look.
fn adhoc(k: &str) -> Option<(&str, &str)> {
    static ADHOC: OnceLock<Regex> = OnceLock::new();
    let m = re(&ADHOC, r"^(swatch|dot|line)\.(.+)$").captures(k)?;
    Some((m.get(1).unwrap().as_str(), m.get(2).unwrap().as_str()))
}

fn props(p: &[(&str, &str)]) -> Props {
    p.iter()
        .map(|&(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// `{ ...a, ...b }`: a's keys in their order, b's values over them, b's new keys last.
fn spread(a: &Props, b: &Props) -> Props {
    let mut p = a.clone();
    for (k, v) in b {
        p.insert(k.clone(), v.clone());
    }
    p
}

/// `Math.max(...xs)`: -Infinity for none, NaN if any is NaN.
fn max_of(xs: impl IntoIterator<Item = f64>) -> f64 {
    xs.into_iter().fold(f64::NEG_INFINITY, js::max)
}

fn shape_rect(s: &Shape) -> Rect {
    Rect {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
    }
}

fn text_rect(t: &TextEl) -> Rect {
    Rect {
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
    }
}

/// The legend's layout at width `w_total`: its entries in rows, the legend's size following them.
fn lay_out_legend(look: &Look, sh: &mut Shape, lg: &LegendSpec, w_total: f64) {
    let items: Vec<LegendItem> = lg
        .entries
        .iter()
        .map(|(k, label)| {
            let item = |kind: Kind, sample: f64, props: Option<Props>| LegendItem {
                style: k.clone(),
                kind,
                label: label.clone(),
                x: 0.0,
                baseline: 0.0,
                sample,
                props,
            };
            if let Some((what, c)) = adhoc(k) {
                // an entry for something that is not a style of the look: a colour swatch, a dot or a line
                if what == "line" {
                    return item(
                        Kind::Line,
                        28.0,
                        Some(props(&[("stroke", c), ("sw", "1.6"), ("head", "none")])),
                    );
                }
                return item(
                    Kind::Shape,
                    14.0,
                    Some(if what == "dot" {
                        props(&[("shape", "dot"), ("fill", c), ("stroke", "none")])
                    } else {
                        props(&[
                            ("shape", "rect"),
                            ("fill", c),
                            ("stroke", "none"),
                            ("radius", "2"),
                        ])
                    }),
                );
            }
            let st = &look.styles[k.as_str()];
            let sample = match st.kind {
                Kind::Line => 28.0,
                Kind::Text => 16.0,
                Kind::Shape if st.props.get("shape").map(String::as_str) == Some("diamond") => 22.0,
                Kind::Shape => 14.0,
            };
            item(st.kind, sample, None)
        })
        .collect();
    let widths: Vec<f64> = items
        .iter()
        .map(|it| it.sample + 6.0 + text_width(&it.label, lg.fs, &lg.font, 400.0, 0.0))
        .collect();
    let mut rows: Vec<Vec<usize>> = vec![Vec::new()];
    let mut run = 0.0;
    for (i, &w) in widths.iter().enumerate() {
        let row = rows.last_mut().unwrap();
        if !row.is_empty() && run + 20.0 + w > w_total {
            rows.push(vec![i]);
            run = w;
        } else {
            run += (if row.is_empty() { 0.0 } else { 20.0 }) + w;
            row.push(i);
        }
    }
    let mut items = items;
    let first = sh.y + if lg.titled { 40.0 } else { 20.0 };
    for (r, row) in rows.iter().enumerate() {
        let sum = row.iter().fold(0.0, |a, &i| a + widths[i]);
        let gap = if rows.len() == 1 && row.len() > 1 {
            js::min(
                64.0,
                js::max(20.0, (w_total - sum) / (row.len() - 1) as f64),
            )
        } else {
            24.0
        };
        let mut x = sh.x;
        for &i in row {
            items[i].x = round(x);
            items[i].baseline = first + r as f64 * 20.0;
            x += widths[i] + gap;
        }
    }
    sh.w = w_total;
    sh.h = (if lg.titled { 40.0 } else { 20.0 }) + (rows.len() - 1) as f64 * 20.0 + 12.0;
    sh.legend = Some(items);
}

/// The scene as it is built, statement by statement.
struct Builder {
    look: Arc<Look>,
    issues: Vec<LookIssue>,
    shapes: Vec<Shape>,
    texts: Vec<TextEl>,
    conns: Vec<Conn>,
    ids: HashSet<String>,
    canvas_line: Option<u32>,
    canvas_size: bool,
    /// legends with no size of their own, laid out once the content's width is known
    legends: Vec<LegendSpec>,
    /// indexes of the shapes with no position
    unplaced: Vec<usize>,
}

impl Builder {
    fn err(&mut self, line: u32, msg: String) {
        issue(&mut self.issues, line, IssueLevel::Error, msg);
    }

    fn warn(&mut self, line: u32, msg: String) {
        issue(&mut self.issues, line, IssueLevel::Warn, msg);
    }

    /// The names of the look's styles of `kind` (or of every kind but lines), joined for a message.
    fn style_names(&self, lines: bool) -> String {
        self.look
            .styles
            .values()
            .filter(|s| (s.kind == Kind::Line) == lines)
            .map(|s| s.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn register(&mut self, id: Option<&str>, auto: &str, line: u32) -> String {
        let final_id = id.map_or_else(|| format!("_{auto}{line}"), str::to_string);
        if self.ids.contains(&final_id) {
            self.err(
                line,
                format!("the id \"{final_id}\" is already used; ids must be unique"),
            );
        }
        self.ids.insert(final_id.clone());
        final_id
    }

    /// The diagram's look statement: which look it names, and that look's own problems.
    fn look_statement(&mut self, look_stmt: &Stmt, named: bool, look_in: bool) {
        let line = look_stmt.line;
        let p = look_stmt
            .toks
            .get(1)
            .map(|t| t.v.as_str())
            .filter(|p| !p.is_empty());
        let names = bundled_look_names().join(", ");
        match p {
            None => self.err(
                line,
                format!(
                    "look needs a name or a path, e.g. look sketch or look \"./team.look\" (named looks: {names})"
                ),
            ),
            Some(p) if !named && !look_in => {
                let b = p.as_bytes();
                let is_path = p.contains(['\\', '/'])
                    || (b.len() >= 5 && b[b.len() - 5..].eq_ignore_ascii_case(b".look"));
                self.err(
                    line,
                    if is_path {
                        format!("look file not found: {p}")
                    } else {
                        format!(
                            "no look named {p}; named looks: {names}, or give a path to a .look file"
                        )
                    },
                );
            }
            Some(_) => {
                let look = self.look.clone();
                for i in &look.issues {
                    self.issues.push(LookIssue {
                        line,
                        level: i.level,
                        msg: format!("{} (in look, line {})", i.msg, i.line),
                        file: i.file.clone(),
                    });
                }
            }
        }
    }

    fn statement(&mut self, st: &Stmt) {
        let toks = &st.toks;
        let first = &toks[0];
        if first.t == TokKind::Word && first.v == "look" {
            return;
        }
        if first.t == TokKind::Word && first.v == "canvas" {
            self.canvas_statement(st);
            return;
        }
        let mut i = 0;
        let mut id: Option<&str> = None;
        if first.t == TokKind::Word && first.v.ends_with(':') && utf16_len(&first.v) > 1 {
            id = Some(&first.v[..first.v.len() - 1]);
            i = 1;
        }
        let op_idx = toks
            .iter()
            .position(|t| t.t == TokKind::Word && (t.v == "->" || t.v == "--" || t.v == "<->"));
        match op_idx {
            Some(op_idx) => self.connector_statement(st, id, i, op_idx),
            None => self.element_statement(st, id, i),
        }
    }

    fn canvas_statement(&mut self, st: &Stmt) {
        // the canvas has no size: the picture is as big as what is drawn. A WxH left from older files is ignored
        self.canvas_line = Some(st.line);
        // paper=, dots= and dotgap= on the diagram's canvas line override the look's background for this diagram
        static SIZE: OnceLock<Regex> = OnceLock::new();
        let mut bg = Props::new();
        for t in &st.toks[1..] {
            let key = t.k.as_deref().unwrap_or("");
            if re(&SIZE, r"^[0-9]+x[0-9]+$").is_match(&t.v) {
                self.canvas_size = true;
            } else if t.t == TokKind::Prop && CANVAS_KEYS.contains(&key) {
                bg.insert(key.to_string(), t.v.clone());
            } else {
                let keys: Vec<String> = CANVAS_KEYS.iter().map(|k| format!("{k}=")).collect();
                let what = if t.t == TokKind::Prop {
                    format!("{key}=")
                } else {
                    t.v.clone()
                };
                self.err(
                    st.line,
                    format!("canvas only takes {}; remove {what}", keys.join(", ")),
                );
            }
        }
        if !bg.is_empty() {
            let mut look = (*self.look).clone();
            look.canvas = spread(&look.canvas, &bg);
            self.look = Arc::new(look);
        }
    }

    fn connector_statement(&mut self, st: &Stmt, id: Option<&str>, i: usize, op_idx: usize) {
        let (toks, line) = (&st.toks, st.line);
        let a_tok = op_idx.checked_sub(1).and_then(|j| toks.get(j));
        let b_tok = toks.get(op_idx + 1);
        let (Some(a_tok), Some(b_tok)) = (a_tok, b_tok) else {
            self.err(
                line,
                "a connector needs something on both sides, e.g. a -> b".into(),
            );
            return;
        };
        if op_idx < i + 1 {
            self.err(
                line,
                "a connector needs something on both sides, e.g. a -> b".into(),
            );
            return;
        }
        let (Some(a), Some(b)) = (parse_end(&a_tok.v), parse_end(&b_tok.v)) else {
            let bad = if parse_end(&a_tok.v).is_none() {
                &a_tok.v
            } else {
                &b_tok.v
            };
            self.err(line, format!("cannot read the connector end \"{bad}\"; use an id, id.side, id.side@pos, id@pos or x,y"));
            return;
        };
        let op = toks[op_idx].v.as_str();
        let mut over = Props::new();
        let mut text: Option<String> = None;
        for t in &toks[op_idx + 2..] {
            match t.t {
                TokKind::Str => {
                    if text.is_none() {
                        text = Some(t.v.clone());
                    }
                }
                TokKind::Prop => {
                    over.insert(t.k.clone().unwrap(), t.v.clone());
                }
                TokKind::Word => self.err(
                    line,
                    format!(
                        "unexpected word \"{}\" after the connector; properties look like key=value",
                        t.v
                    ),
                ),
            }
        }
        // a plain -- that ends on a table row is a relationship: right-angled, not a slanted line
        let style_name = over.get("style").cloned().unwrap_or_else(|| {
            if op == "--" {
                if a.row.is_some() || b.row.is_some() {
                    "relation".into()
                } else {
                    "line".into()
                }
            } else {
                "arrow".into()
            }
        });
        let style = match self.look.styles.get(&style_name) {
            Some(s) if s.kind == Kind::Line => s.clone(),
            _ => {
                let names = self.style_names(true);
                self.err(
                    line,
                    format!(
                        "\"{style_name}\" is not a line style in the look; line styles: {names}"
                    ),
                );
                return;
            }
        };
        let p = spread(&style.props, &over);
        let route = p.get("route").map(String::as_str);
        if let Some(r) = route.filter(|r| !r.is_empty())
            && !["ortho", "straight", "curve"].contains(&r)
        {
            self.err(
                line,
                format!("route={r} is not a route; use ortho, straight or curve"),
            );
        }
        // -> and <-> put the style's head on the line; head= and tail= on the statement choose any marker for either end
        let style_head = style.props.get("head").map(String::as_str);
        let style_head = match style_head {
            Some(h) if !h.is_empty() && h != "none" => h,
            _ => "arrow",
        };
        // a style made for plain lines (head=none: a rule, a lifeline) never grows a head, even when written with ->
        let plain =
            style.props.get("head").map(String::as_str) == Some("none") && style_name != "line";
        let head_m = over.get("head").cloned().unwrap_or_else(|| {
            if op == "--" || plain {
                "none".into()
            } else {
                style_head.into()
            }
        });
        let tail_m = over.get("tail").cloned().unwrap_or_else(|| {
            if op == "<->" {
                head_m.clone()
            } else if op == "--" {
                "none".into()
            } else {
                style
                    .props
                    .get("tail")
                    .cloned()
                    .unwrap_or_else(|| "none".into())
            }
        });
        for mk in [&head_m, &tail_m] {
            if !MARKERS.contains(&mk.as_str()) {
                self.err(
                    line,
                    format!(
                        "\"{mk}\" is not an end marker; use one of: {}",
                        MARKERS.join(", ")
                    ),
                );
            }
        }
        let ok = |mk: &str| {
            if MARKERS.contains(&mk) {
                mk.to_string()
            } else {
                "arrow".to_string()
            }
        };
        let id = self.register(id, "c", line);
        let ortho = route.unwrap_or("ortho") == "ortho";
        let curve = route == Some("curve");
        self.conns.push(Conn {
            id,
            line,
            style: style_name,
            a,
            b,
            pts: Vec::new(),
            head: head_m != "none",
            tail: tail_m != "none",
            head_m: ok(&head_m),
            tail_m: ok(&tail_m),
            ortho,
            curve,
            ushape: false,
            text,
            label: None,
            p,
        });
    }

    fn element_statement(&mut self, st: &Stmt, id: Option<&str>, mut i: usize) {
        let (toks, line) = (&st.toks, st.line);
        let Some(kind_tok) = toks.get(i).filter(|t| t.t == TokKind::Word) else {
            self.err(line, "expected: id: style \"text\" at x,y".into());
            return;
        };
        i += 1;
        let style = match self.look.styles.get(&kind_tok.v) {
            Some(s) if s.kind != Kind::Line => s.clone(),
            _ => {
                let names = self.style_names(false);
                self.err(
                    line,
                    format!("unknown style \"{}\"; available: {names}", kind_tok.v),
                );
                return;
            }
        };
        static ROW_ID: OnceLock<Regex> = OnceLock::new();
        static ROW_VAL: OnceLock<Regex> = OnceLock::new();
        static AT: OnceLock<Regex> = OnceLock::new();
        static SIZE: OnceLock<Regex> = OnceLock::new();
        let mut text: Option<String> = None;
        let mut at: Option<Pt> = None;
        let mut size: Option<(f64, f64)> = None;
        let mut over = Props::new();
        let mut rows: Vec<Row> = Vec::new();
        while i < toks.len() {
            let t = &toks[i];
            if t.t == TokKind::Word && (t.v == "|" || t.v == "|=") {
                rows.push(Row {
                    id: None,
                    kind: if t.v == "|" {
                        RowKind::Row
                    } else {
                        RowKind::Head
                    },
                    cells: Vec::new(),
                    vals: Vec::new(),
                    p: Props::new(),
                    y: 0.0,
                    h: 0.0,
                });
                i += 1;
                continue;
            }
            if let Some(row) = rows.last_mut() {
                // everything after a "|" belongs to that row: an optional id, then one "text" per column
                match t.t {
                    TokKind::Str => row.cells.push(t.v.clone()),
                    TokKind::Prop => {
                        row.p.insert(t.k.clone().unwrap(), t.v.clone());
                    }
                    TokKind::Word => {
                        if t.v == "---" && row.cells.is_empty() && row.id.is_none() {
                            row.kind = RowKind::Rule;
                        } else if row.id.is_none()
                            && row.cells.is_empty()
                            && re(&ROW_ID, r"^[A-Za-z_][A-Za-z0-9_-]*$").is_match(&t.v)
                            && !in_dirs(&t.v)
                        {
                            row.id = Some(t.v.clone());
                        } else if re(
                            &ROW_VAL,
                            r"^([+-]?[0-9]*\.?[0-9]+(,[+-]?[0-9]*\.?[0-9]+){0,2}|_)$",
                        )
                        .is_match(&t.v)
                        {
                            // a number, a pair (3,40), a triple (x,y,radius), or _ for no value
                            row.vals.push(t.v.clone());
                        } else {
                            self.err(line, format!("unexpected word \"{}\" in a table row; a row is: | id \"cell\" \"cell\" (the id is optional, and cannot be top, bottom, left or right)", t.v));
                        }
                    }
                }
                i += 1;
                continue;
            }
            match t.t {
                TokKind::Str => {
                    if text.is_none() {
                        text = Some(t.v.clone());
                    }
                }
                TokKind::Prop => {
                    over.insert(t.k.clone().unwrap(), t.v.clone());
                }
                TokKind::Word if t.v == "at" => {
                    i += 1;
                    let v = toks.get(i).map_or("", |t| t.v.as_str());
                    match re(&AT, r"^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$").captures(v)
                    {
                        None => self.err(
                            line,
                            "after \"at\" write the position as x,y with no space, e.g. at 40,240"
                                .into(),
                        ),
                        Some(m) => {
                            at = Some(Pt {
                                x: to_number(&m[1]),
                                y: to_number(&m[2]),
                            });
                        }
                    }
                }
                TokKind::Word
                    if re(&SIZE, r"^[0-9]+(\.[0-9]+)?x[0-9]+(\.[0-9]+)?$").is_match(&t.v) =>
                {
                    let mut it = t.v.split('x').map(to_number);
                    size = Some((it.next().unwrap(), it.next().unwrap()));
                }
                TokKind::Word => self.err(
                    line,
                    format!(
                        "unexpected word \"{}\"; properties look like key=value and text goes in \"quotes\"",
                        t.v
                    ),
                ),
            }
            i += 1;
        }
        let mut base = style.props.clone();
        let mut style_name = style.name.clone();
        if let Some(os) = over.get("style").filter(|s| !s.is_empty()) {
            match self.look.styles.get(os) {
                Some(s2) if s2.kind == style.kind => {
                    base = spread(&base, &s2.props);
                    style_name = s2.name.clone();
                }
                _ => {
                    let msg = format!(
                        "style={os} is not a {} style in the look",
                        style.kind.as_str()
                    );
                    self.err(line, msg);
                }
            }
        }
        let p = spread(&base, &over);
        if style.kind == Kind::Text {
            self.text_element(line, id, style_name, p, text, at);
        } else {
            self.shape_element(line, id, style_name, p, over, text, at, size, rows);
        }
    }

    fn text_element(
        &mut self,
        line: u32,
        id: Option<&str>,
        style_name: String,
        p: Props,
        text: Option<String>,
        at: Option<Pt>,
    ) {
        let Some(at) = at else {
            self.err(line, "text needs a position: at x,y".into());
            return;
        };
        let prop = |k: &str| p.get(k).map(String::as_str);
        let fs = num(prop("size"), 12.0);
        let src = text.as_deref().unwrap_or("");
        let lines: Vec<&str> = src.split('\n').collect();
        let t2 = if prop("caps") == Some("1") {
            src.to_uppercase()
        } else {
            src.to_string()
        };
        let font = prop("font").unwrap_or("sans");
        let (weight, spacing) = (num(prop("weight"), 400.0), num(prop("spacing"), 0.0));
        let w = max_of(
            lines
                .iter()
                .map(|l| text_width(l, fs, font, weight, spacing)),
        );
        let anchor = prop("anchor").unwrap_or("start");
        let x = if anchor == "middle" {
            at.x - w / 2.0
        } else if anchor == "end" {
            at.x - w
        } else {
            at.x
        };
        let th = fs * 1.3 * lines.len() as f64;
        // rotate=-90 reads upwards, rotate=90 downwards; the text turns about its "at" point
        let rot = num(prop("rotate"), 0.0);
        if let Some(r) = prop("rotate")
            && ![0.0, 90.0, -90.0].contains(&rot)
        {
            let msg =
                format!("rotate={r}: text can be turned by 90 (reading down) or -90 (reading up)");
            self.err(line, msg);
        }
        let dx = x - at.x; // where the text starts, measured along its own baseline
        let bx = if rot == -90.0 {
            Rect {
                x: at.x - fs,
                y: at.y - dx - w,
                w: th,
                h: w,
            }
        } else if rot == 90.0 {
            Rect {
                x: at.x - th + fs,
                y: at.y + dx,
                w: th,
                h: w,
            }
        } else {
            Rect {
                x,
                y: at.y - fs,
                w,
                h: th,
            }
        };
        let id = self.register(id, "t", line);
        self.texts.push(TextEl {
            x: bx.x,
            y: bx.y,
            w: bx.w,
            h: bx.h,
            id,
            line,
            style: style_name,
            p,
            text: t2,
            ax: at.x,
            ay: at.y,
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn shape_element(
        &mut self,
        line: u32,
        id: Option<&str>,
        style_name: String,
        p: Props,
        over: Props,
        text: Option<String>,
        at: Option<Pt>,
        mut size: Option<(f64, f64)>,
        rows: Vec<Row>,
    ) {
        static SIZE: OnceLock<Regex> = OnceLock::new();
        if size.is_none()
            && let Some(ps) = p.get("size").filter(|s| !s.is_empty())
            && let Some(m) =
                re(&SIZE, r"^([0-9]+(?:\.[0-9]+)?)x([0-9]+(?:\.[0-9]+)?)$").captures(ps)
        {
            size = Some((to_number(&m[1]), to_number(&m[2])));
        }
        let size0 = size;
        let size = size.unwrap_or((120.0, 48.0));
        let id = self.register(id, "s", line);
        let mut sh = Shape {
            x: at.map_or(0.0, |a| a.x),
            y: at.map_or(0.0, |a| a.y),
            w: size.0,
            h: size.1,
            id,
            line,
            style: style_name.clone(),
            shape: p.get("shape").cloned().unwrap_or_else(|| "rect".into()),
            text,
            back: p.get("layer").map(String::as_str) == Some("back"),
            legend: None,
            rows: None,
            cols: None,
            head_h: None,
            poly: None,
            p,
        };
        self.icon_checks(line, &sh.p, &over);
        if sh.shape == "polygon" {
            self.polygon(line, &mut sh, size0.is_some());
        }
        if sh.shape == "arc" {
            for k in ["from", "to", "inner"] {
                if let Some(v) = sh.p.get(k)
                    && to_number(v).is_nan()
                {
                    let msg = format!(
                        "{k}={v} must be a number (from= and to= are degrees clockwise from the top; inner= is 0 to 1)"
                    );
                    self.err(line, msg);
                }
            }
        }
        if sh.shape == "table" {
            layout_table(
                &mut sh,
                rows,
                size0.map_or(0.0, |s| s.0),
                &mut self.issues,
                line,
            );
        } else if sh.shape == "chart" {
            self.chart(line, &mut sh, rows, size0.is_some());
        } else if !rows.is_empty() {
            self.err(line, format!("rows (the parts starting with \"|\") only work on a table style; \"{style_name}\" is not one"));
        }
        if sh.shape == "legend" {
            self.legend(line, &mut sh, &over, size0.is_some());
        }
        if at.is_none() {
            self.unplaced.push(self.shapes.len());
        }
        self.shapes.push(sh);
    }

    fn icon_checks(&mut self, line: u32, p: &Props, over: &Props) {
        let prop = |k: &str| p.get(k).map(String::as_str);
        let look = self.look.clone();
        let icon = prop("icon").filter(|i| !i.is_empty() && *i != "none");
        let known = |i: &str| look.icons.get(i).is_some() || look.images.contains_key(i);
        if let Some(icon) = icon
            && !known(icon)
        {
            let all: Vec<&str> = look
                .images
                .keys()
                .map(String::as_str)
                .chain(look.icons.keys())
                .collect();
            // name the closest ones first: a team's folder can hold hundreds
            let near = all
                .iter()
                .copied()
                .filter(|n| icon_matches(n, icon) || (utf16_len(n) > 2 && icon.contains(n)));
            let mut seen = HashSet::new();
            let mut list: Vec<&str> = Vec::new();
            for n in near.chain(all.iter().copied()) {
                if list.len() == 40 {
                    break;
                }
                if seen.insert(n) {
                    list.push(n);
                }
            }
            let folder = if !look.icon_dirs.is_empty() && look.images.is_empty() {
                format!(
                    " (the look's icon folder {} could not be read here)",
                    look.icon_dirs.join(", ")
                )
            } else {
                String::new()
            };
            let more = if all.len() > list.len() {
                format!(
                    ", and {} more (run \"fastdraw icons\" to see them all)",
                    all.len() - list.len()
                )
            } else {
                String::new()
            };
            self.err(
                line,
                format!(
                    "there is no icon called \"{icon}\"{folder}; the look has: {}{more}",
                    list.join(", ")
                ),
            );
        }
        if let Some(w) = prop("icon.width") {
            let n = to_number(w);
            if !(n > 0.0 && n <= 8.0) {
                self.err(line, format!("icon.width={w}: the icon's line thickness in pixels, a number from 0.5 to 8 (e.g. icon.width=2)"));
            }
        }
        let style = prop("icon.style");
        if let Some(s) = style
            && !["outline", "solid", "duotone"].contains(&s)
        {
            self.err(line, format!("icon.style={s}: an icon is drawn as an outline (the default), filled in one colour (icon.style=solid), or as an outline over a light tint (icon.style=duotone)"));
        } else if let Some(s) = style.filter(|s| *s == "solid" || *s == "duotone")
            && let Some(icon) = icon
            && known(icon)
            && !is_built_in(&look, icon)
        {
            self.warn(line, format!("icon {icon} is the look's own, with no {s} version (only the built-in icons have one), so it is drawn as it is; drop icon.style={s}"));
        }
        if let Some(pos) = prop("icon.pos").filter(|s| !s.is_empty())
            && !["left", "top"].contains(&pos)
        {
            self.err(line, format!("icon.pos={pos}: an icon sits left of the text or on top of it (icon.pos=left or icon.pos=top)"));
        }
        for k in ["color", "weight", "font", "italic"] {
            if over.contains_key(k) {
                self.warn(line, format!("{k}= does nothing on a shape; its text is set with title.{k}= (and sub.{k}= for the second line)"));
            }
        }
    }

    fn polygon(&mut self, line: u32, sh: &mut Shape, sized: bool) {
        // points are written relative to the element's position; a given WxH stretches them to fit
        let rel: Vec<Pt> =
            sh.p.get("points")
                .map_or("", String::as_str)
                .split(';')
                .filter(|q| !q.is_empty())
                .map(|q| {
                    let mut it = q.split(',').map(to_number);
                    Pt {
                        x: it.next().unwrap_or(f64::NAN),
                        y: it.next().unwrap_or(f64::NAN),
                    }
                })
                .collect();
        if rel.len() < 2 || rel.iter().any(|q| q.x.is_nan() || q.y.is_nan()) {
            self.err(line, "a polygon needs its corners: points=x,y;x,y;x,y measured from its \"at\" position, e.g. points=60,0;120,100;0,100".into());
            return;
        }
        let nw = max_of(rel.iter().map(|q| q.x));
        let nh = max_of(rel.iter().map(|q| q.y));
        if rel.iter().any(|q| q.x < 0.0 || q.y < 0.0) {
            self.err(line, "polygon points cannot be negative; they are measured from the \"at\" position, which is the top-left of the shape".into());
        }
        if !sized {
            sh.w = nw;
            sh.h = nh;
        }
        let kx = if nw == 0.0 || nw.is_nan() {
            1.0
        } else {
            sh.w / nw
        };
        let ky = if nh == 0.0 || nh.is_nan() {
            1.0
        } else {
            sh.h / nh
        };
        sh.poly = Some(
            rel.iter()
                .map(|q| Pt {
                    x: round((sh.x + q.x * kx) * 100.0) / 100.0,
                    y: round((sh.y + q.y * ky) * 100.0) / 100.0,
                })
                .collect(),
        );
    }

    #[allow(clippy::neg_cmp_op_on_partial_ord)] // NaN must fail the tests, as in the TypeScript
    fn chart(&mut self, line: u32, sh: &mut Shape, rows: Vec<Row>, sized: bool) {
        static RANGE: OnceLock<Regex> = OnceLock::new();
        static RANGE_TEST: OnceLock<Regex> = OnceLock::new();
        if !sized {
            self.err(
                line,
                "a chart needs a size for its plot area: at x,y WxH".into(),
            );
        }
        let p = &sh.p;
        for k in ["step", "xstep"] {
            if let Some(v) = p.get(k)
                && !(to_number(v) > 0.0)
            {
                self.err(line, format!("{k}={v} must be a number above 0"));
            }
        }
        for k in ["x", "y"] {
            let v = p.get(k).map_or("", String::as_str);
            if let Some(m) = re(&RANGE, r"^(-?[0-9.]+)\.\.(-?[0-9.]+)$").captures(v)
                && !(to_number(&m[2]) > to_number(&m[1]))
            {
                self.err(line, format!("{k}={v} must run upwards, e.g. {k}=0..100"));
            }
        }
        let n = match p.get("x").filter(|x| !x.is_empty()) {
            Some(x) if !re(&RANGE_TEST, r"^-?[0-9.]+\.\.-?[0-9.]+$").is_match(x) => {
                x.split(',').count()
            }
            _ => 0,
        };
        for r in &rows {
            let name = |r: &Row| match r.cells.first().filter(|c| !c.is_empty()) {
                Some(c) => format!("\"{c}\" "),
                None => String::new(),
            };
            match r.id.as_deref() {
                Some(id) if SERIES.contains(&id) => {
                    if r.vals.is_empty() {
                        self.err(line, format!("the {id} series {}has no numbers; write them after the name: | {id} \"Name\" 42 61 75", name(r)));
                    } else if n > 0 && r.vals.len() != n && !r.vals[0].contains(',') {
                        self.warn(
                            line,
                            format!(
                                "the {id} series {}has {} values but x= names {n} categories",
                                name(r),
                                r.vals.len()
                            ),
                        );
                    }
                }
                _ => self.err(line, format!("a chart row starts with the kind of series: {}; e.g. | bars \"Revenue\" 42 61 75", SERIES.join(", "))),
            }
        }
        sh.rows = Some(rows);
    }

    fn legend(&mut self, line: u32, sh: &mut Shape, over: &Props, sized: bool) {
        // one statement lays out a whole legend: every style="label" pair is an entry
        let entries: Vec<(String, String)> = over
            .iter()
            .filter(|(k, _)| {
                *k != "style" && (self.look.styles.contains_key(*k) || adhoc(k).is_some())
            })
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let prop = |k: &str| sh.p.get(k).map(String::as_str);
        let empty = entries.is_empty();
        let lg = LegendSpec {
            shape: self.shapes.len(),
            entries,
            fs: num(prop("item.size"), 8.5),
            font: prop("item.font").unwrap_or("sans").to_string(),
            titled: prop("title").unwrap_or("none") != "none",
        };
        if sized {
            let w = sh.w;
            lay_out_legend(&self.look, sh, &lg, w);
        } else {
            self.legends.push(lg);
        }
        if empty {
            self.warn(line, "this legend has no entries; add style=\"what it means\" for each style, e.g. focal=\"The main service\"".into());
        }
    }

    /// The legends with no size of their own: as wide as the rest of the drawing, measured from the legend's own
    /// left edge.
    fn lay_out_legends(&mut self) {
        for lg in std::mem::take(&mut self.legends) {
            let rights: Vec<f64> = self
                .shapes
                .iter()
                .filter(|o| o.shape != "legend")
                .map(|o| o.x + o.w)
                .chain(self.texts.iter().map(|t| t.x + t.w))
                // rules and axes drawn between free points
                .chain(self.conns.iter().flat_map(|c| {
                    [&c.a, &c.b]
                        .into_iter()
                        .filter(|e| e.kind == EndKind::Point)
                        .map(|e| e.pt.x)
                }))
                .collect();
            let sh = &mut self.shapes[lg.shape];
            let w = if rights.is_empty() {
                920.0
            } else {
                js::max(200.0, round((max_of(rights) - sh.x) / 4.0) * 4.0)
            };
            lay_out_legend(&self.look, sh, &lg, w);
        }
    }

    /// Fallback placement for shapes with no position: a row under everything else.
    fn fallback_placement(&mut self) {
        if self.unplaced.is_empty() {
            return;
        }
        let unplaced = std::mem::take(&mut self.unplaced);
        let placed: Vec<&Shape> = self
            .shapes
            .iter()
            .enumerate()
            .filter(|(i, _)| !unplaced.contains(i))
            .map(|(_, s)| s)
            .collect();
        let mut x = 40.0;
        let y = if placed.is_empty() {
            40.0
        } else {
            max_of(placed.iter().map(|s| s.y + s.h)) + 40.0
        };
        for i in unplaced {
            let s = &mut self.shapes[i];
            s.x = x;
            s.y = y;
            x += s.w + 40.0;
            let msg = format!(
                "{} has no position (\"at x,y\"); it was dropped in a row at {},{}",
                s.id,
                num_str(s.x),
                num_str(s.y)
            );
            let line = s.line;
            self.warn(line, msg);
        }
    }
}

// ---- connector resolution -------------------------------------------------

/// One end of a connector: the connector's index and which end (false: a, true: b). It stands for the End
/// object the TypeScript keys its maps and sets by.
type EndRef = (usize, bool);

fn end_of(conns: &[Conn], (ci, b): EndRef) -> &End {
    if b { &conns[ci].b } else { &conns[ci].a }
}

fn end_mut(conns: &mut [Conn], (ci, b): EndRef) -> &mut End {
    if b {
        &mut conns[ci].b
    } else {
        &mut conns[ci].a
    }
}

fn is_horiz(side: Option<Side>) -> bool {
    side == Some(Side::Top) || side == Some(Side::Bottom)
}

fn side_key(e: &End) -> String {
    format!(
        "{}{}|{}",
        e.id.as_deref().unwrap_or("undefined"),
        e.row.as_deref().map_or(String::new(), |r| format!(".{r}")),
        e.side.map_or("undefined", Side::as_str)
    )
}

/// An end of a group of ends sharing a side: its connector, itself, and the connector's other end.
struct Member {
    c: usize,
    e: EndRef,
    o: EndRef,
}

struct Resolver<'s> {
    shapes: &'s [Shape],
    shape_by_id: HashMap<&'s str, (Rect, Option<&'s str>)>,
    rows_by_id: HashMap<&'s str, &'s [Row]>,
    conn_by_id: HashMap<String, usize>,
    conns: Vec<Conn>,
    issues: &'s mut Vec<LookIssue>,
    /// segments already routed, so detours can keep off them
    taken: Vec<(Pt, Pt)>,
    done: HashSet<usize>,
    bad: HashSet<usize>,
}

impl<'s> Resolver<'s> {
    fn new(
        shapes: &'s [Shape],
        texts: &'s [TextEl],
        conns: Vec<Conn>,
        issues: &'s mut Vec<LookIssue>,
    ) -> Self {
        let mut shape_by_id = HashMap::new();
        for s in shapes {
            shape_by_id.insert(s.id.as_str(), (shape_rect(s), Some(s.shape.as_str())));
        }
        for t in texts {
            let r = Rect {
                x: t.x - 4.0,
                y: t.y - 2.0,
                w: t.w + 8.0,
                h: t.h + 4.0,
            };
            shape_by_id.insert(t.id.as_str(), (r, None));
        }
        let conn_by_id = conns
            .iter()
            .enumerate()
            .map(|(i, c)| (c.id.clone(), i))
            .collect();
        let rows_by_id = shapes
            .iter()
            .filter_map(|s| s.rows.as_deref().map(|r| (s.id.as_str(), r)))
            .collect();
        Resolver {
            shapes,
            shape_by_id,
            rows_by_id,
            conn_by_id,
            conns,
            issues,
            taken: Vec::new(),
            done: HashSet::new(),
            bad: HashSet::new(),
        }
    }

    fn err(&mut self, line: u32, msg: String) {
        issue(self.issues, line, IssueLevel::Error, msg);
    }

    fn warn(&mut self, line: u32, msg: String) {
        issue(self.issues, line, IssueLevel::Warn, msg);
    }

    /// What an end attaches to: the whole shape, or one row of a table (with no shape of its own).
    fn tgt(&self, e: &End) -> (Rect, Option<&'s str>) {
        let id = e.id.as_deref().unwrap();
        let (s, shape) = self.shape_by_id[id];
        let r = e.row.as_deref().and_then(|row| {
            self.rows_by_id
                .get(id)
                .and_then(|rows| rows.iter().find(|q| q.id.as_deref() == Some(row)))
        });
        match r {
            Some(r) => (
                Rect {
                    x: s.x,
                    y: r.y,
                    w: s.w,
                    h: r.h,
                },
                None,
            ),
            None => (s, shape),
        }
    }

    /// Every end names something that exists: a shape (and a row it has), a text, or another line.
    fn check_ends(&mut self) {
        for ci in 0..self.conns.len() {
            for which in [false, true] {
                let e = end_of(&self.conns, (ci, which)).clone();
                let line = self.conns[ci].line;
                if e.kind != EndKind::Shape {
                    continue;
                }
                let id = e.id.as_deref().unwrap();
                if self.shape_by_id.contains_key(id) {
                    if let Some(row) = e.row.as_deref() {
                        let rows = self.rows_by_id.get(id).copied().unwrap_or(&[]);
                        if !rows.iter().any(|r| r.id.as_deref() == Some(row)) {
                            let have: Vec<&str> =
                                rows.iter().filter_map(|r| r.id.as_deref()).collect();
                            let tail = if have.is_empty() {
                                " (only a table has rows; a side is top, bottom, left or right)"
                                    .to_string()
                            } else {
                                format!("; its rows: {}", have.join(", "))
                            };
                            self.err(
                                line,
                                format!("{}: \"{id}\" has no row called \"{row}\"{tail}", e.raw),
                            );
                            self.bad.insert(ci);
                        }
                    }
                    continue;
                }
                if self.conn_by_id.contains_key(id) {
                    let em = end_mut(&mut self.conns, (ci, which));
                    em.kind = EndKind::Conn;
                    if em.v.is_none() {
                        em.v = Some(0.5);
                    }
                    if e.side.is_some() {
                        self.err(
                            line,
                            format!(
                                "{}: \"{id}\" is a line, so it has no sides; use {id}@position",
                                e.raw
                            ),
                        );
                        self.bad.insert(ci);
                    }
                } else {
                    self.err(
                        line,
                        format!("connector refers to \"{id}\", which does not exist"),
                    );
                    self.bad.insert(ci);
                }
            }
        }
        for ci in 0..self.conns.len() {
            let c = &self.conns[ci];
            if c.a.kind == EndKind::Rel && c.b.kind == EndKind::Rel {
                let line = c.line;
                self.err(
                    line,
                    "only one end of a connector can be relative (+dx,+dy)".into(),
                );
                self.bad.insert(ci);
            }
        }
    }

    /// The box an end attaches to; for an end on another line, the point along it (which it also takes as its own).
    fn box_of(&mut self, r: EndRef) -> Option<Rect> {
        let e = end_of(&self.conns, r);
        match e.kind {
            EndKind::Shape => Some(self.tgt(e).0),
            EndKind::Point => Some(Rect {
                x: e.pt.x,
                y: e.pt.y,
                w: 0.0,
                h: 0.0,
            }),
            EndKind::Conn => {
                let other = self.conn_by_id[e.id.as_deref().unwrap()];
                let pt = point_along(&self.conns[other], e.v.unwrap());
                end_mut(&mut self.conns, r).pt = pt;
                Some(Rect {
                    x: pt.x,
                    y: pt.y,
                    w: 0.0,
                    h: 0.0,
                })
            }
            EndKind::Rel => None,
        }
    }

    fn resolve_pass(&mut self, batch: &[usize]) {
        self.sides(batch);
        let (groups, frac, single) = self.fan_out(batch);
        for &ci in batch {
            self.place_ends(ci, &frac);
            self.keep_straight(ci, &groups, &frac, &single);
            self.meet_free_ends(ci, &single);
            self.route_conn(ci);
        }
    }

    /// sides
    fn sides(&mut self, batch: &[usize]) {
        let rel_side = |r: Pt| {
            if r.y.abs() >= r.x.abs() {
                if r.y >= 0.0 { Side::Bottom } else { Side::Top }
            } else if r.x >= 0.0 {
                Side::Right
            } else {
                Side::Left
            }
        };
        // a table row is reached from the left or right edge of the table, whichever faces the other end
        let row_side = |me: Rect, other: Option<Rect>, rel: Pt| {
            let right = match other {
                Some(o) => cx(&o) >= cx(&me),
                None => rel.x >= 0.0,
            };
            if right { Side::Right } else { Side::Left }
        };
        for &ci in batch {
            let ba = self.box_of((ci, false));
            let bb = self.box_of((ci, true));
            let c = &mut self.conns[ci];
            if c.a.kind == EndKind::Shape && c.a.side.is_none() {
                c.a.side = Some(if c.a.row.is_some() {
                    row_side(ba.unwrap(), bb, c.b.rel.unwrap_or(Pt { x: 0.0, y: 0.0 }))
                } else if let Some(bb) = bb {
                    auto_sides(&ba.unwrap(), &bb).0
                } else {
                    rel_side(c.b.rel.unwrap())
                });
                c.a.fanned = Some(true);
            }
            if c.b.kind == EndKind::Shape && c.b.side.is_none() {
                let back =
                    c.a.rel
                        .map_or(Pt { x: 0.0, y: 0.0 }, |r| Pt { x: -r.x, y: -r.y });
                c.b.side = Some(if c.b.row.is_some() {
                    row_side(bb.unwrap(), ba, back)
                } else if let Some(ba) = ba {
                    auto_sides(&ba, &bb.unwrap()).1
                } else {
                    rel_side(back)
                });
                c.b.fanned = Some(true);
            }
        }
    }

    /// fan-out of ends that share a side and have no explicit position
    #[allow(clippy::type_complexity)]
    fn fan_out(
        &mut self,
        batch: &[usize],
    ) -> (
        IndexMap<String, Vec<Member>>,
        HashMap<EndRef, f64>,
        HashSet<EndRef>,
    ) {
        let mut groups: IndexMap<String, Vec<Member>> = IndexMap::new();
        for &ci in batch {
            for (e, o) in [((ci, false), (ci, true)), ((ci, true), (ci, false))] {
                let end = end_of(&self.conns, e);
                if end.kind != EndKind::Shape || end.v.is_some() {
                    continue;
                }
                groups
                    .entry(side_key(end))
                    .or_default()
                    .push(Member { c: ci, e, o });
            }
        }
        let mut frac = HashMap::new();
        let mut single = HashSet::new();
        for (k, g) in &groups {
            let horiz = k.ends_with("top") || k.ends_with("bottom");
            if g.len() == 1 {
                frac.insert(g[0].e, 0.5);
                single.insert(g[0].e);
                continue;
            }
            let mut order: Vec<(f64, usize)> = Vec::with_capacity(g.len());
            for (idx, m) in g.iter().enumerate() {
                let r = match self.box_of(m.o) {
                    Some(b) if horiz => cx(&b),
                    Some(b) => cy(&b),
                    None => 0.0,
                };
                order.push((r, idx));
            }
            // (p, q) => p.r - q.r || p.idx - q.idx
            js::sort_by(&mut order, |p, q| {
                let d = p.0 - q.0;
                if d == 0.0 || d.is_nan() {
                    p.1 as f64 - q.1 as f64
                } else {
                    d
                }
            });
            for (n, &(_, idx)) in order.iter().enumerate() {
                frac.insert(g[idx].e, (n + 1) as f64 / (g.len() + 1) as f64);
            }
        }
        (groups, frac, single)
    }

    /// Each end on a shape gets its point on its side and the direction it leaves in.
    fn place_ends(&mut self, ci: usize, frac: &HashMap<EndRef, f64>) {
        for which in [false, true] {
            let r = (ci, which);
            let e = end_of(&self.conns, r);
            if e.kind != EndKind::Shape {
                continue;
            }
            let (s, shape) = self.tgt(e);
            let side = e.side.unwrap();
            let v = e.v;
            let pt = side_point(&s, shape, side, v, frac.get(&r).copied().unwrap_or(0.5));
            let em = end_mut(&mut self.conns, r);
            em.pt = pt;
            em.dir = Some(side.dir());
            if let Some(v) = v
                && v > 1.0
            {
                let horiz = is_horiz(Some(side));
                let (lo, hi) = if horiz {
                    (s.x, s.x + s.w)
                } else {
                    (s.y, s.y + s.h)
                };
                if v < lo || v > hi {
                    let e = end_of(&self.conns, r);
                    let msg = format!(
                        "{}: {} is outside the {} side of {}, which runs from {} to {}; the end was moved to the nearest point",
                        e.raw,
                        num_str(v),
                        side.as_str(),
                        e.id.as_deref().unwrap(),
                        num_str(lo),
                        num_str(hi)
                    );
                    let line = self.conns[ci].line;
                    self.warn(line, msg);
                }
            }
        }
    }

    /// keep a lone connector straight when the two things line up
    #[allow(clippy::neg_cmp_op_on_partial_ord)] // NaN must fail the test, as in the TypeScript
    fn keep_straight(
        &mut self,
        ci: usize,
        groups: &IndexMap<String, Vec<Member>>,
        frac: &HashMap<EndRef, f64>,
        single: &HashSet<EndRef>,
    ) {
        let (ra, rb) = ((ci, false), (ci, true));
        let (a, b) = (&self.conns[ci].a, &self.conns[ci].b);
        let opposing = match (a.dir, b.dir) {
            (Some(da), Some(db)) => da.x == -db.x && da.y == -db.y,
            _ => false,
        };
        if a.kind != EndKind::Shape || b.kind != EndKind::Shape || !opposing {
            return;
        }
        let ((sa, shape_a), (sb, shape_b)) = (self.tgt(a), self.tgt(b));
        let horiz = is_horiz(a.side);
        let lo = if horiz {
            js::max(sa.x, sb.x)
        } else {
            js::max(sa.y, sb.y)
        };
        let hi = if horiz {
            js::min(sa.x + sa.w, sb.x + sb.w)
        } else {
            js::min(sa.y + sa.h, sb.y + sb.h)
        };
        if !(hi > lo) {
            return;
        }
        let (single_a, single_b) = (single.contains(&ra), single.contains(&rb));
        let pos = if single_a && single_b {
            let ca = if horiz { cx(&sa) } else { cy(&sa) };
            let cb = if horiz { cx(&sb) } else { cy(&sb) };
            let small = if if horiz { sa.w <= sb.w } else { sa.h <= sb.h } {
                ca
            } else {
                cb
            };
            let other = if small == ca { cb } else { ca };
            Some(if within(small, lo, hi) {
                small
            } else if within(other, lo, hi) {
                other
            } else {
                (lo + hi) / 2.0
            })
        } else if !single_a && !single_b && a.v.is_none() && b.v.is_none() {
            let ga = &groups[&side_key(a)];
            let gb = &groups[&side_key(b)];
            let same = ga.len() == gb.len() && ga.iter().all(|m| gb.iter().any(|n| n.c == m.c));
            same.then(|| lo + (hi - lo) * frac[&ra])
        } else if single_a && b.v.is_some() {
            Some(if horiz { b.pt.x } else { b.pt.y })
        } else if single_b && a.v.is_some() {
            Some(if horiz { a.pt.x } else { a.pt.y })
        } else {
            None
        };
        if let Some(pos) = pos
            && within(pos, lo, hi)
        {
            let v = Some(js::max(pos, 1.0001));
            let (side_a, side_b) = (a.side.unwrap(), b.side.unwrap());
            self.conns[ci].a.pt = side_point(&sa, shape_a, side_a, v, 0.5);
            self.conns[ci].b.pt = side_point(&sb, shape_b, side_b, v, 0.5);
        }
    }

    /// A lone end on a shape lines up with a free point or a point on a line at the other end, when its side
    /// reaches that far.
    fn meet_free_ends(&mut self, ci: usize, single: &HashSet<EndRef>) {
        for (e, o) in [((ci, false), (ci, true)), ((ci, true), (ci, false))] {
            let (ee, oe) = (end_of(&self.conns, e), end_of(&self.conns, o));
            if ee.kind != EndKind::Shape
                || !single.contains(&e)
                || (oe.kind != EndKind::Point && oe.kind != EndKind::Conn)
            {
                continue;
            }
            let (s, shape) = self.tgt(ee);
            let horiz = is_horiz(ee.side);
            let pos = if horiz { oe.pt.x } else { oe.pt.y };
            let (lo, hi) = if horiz {
                (s.x, s.x + s.w)
            } else {
                (s.y, s.y + s.h)
            };
            if within(pos, lo + 2.0, hi - 2.0) {
                let side = ee.side.unwrap();
                end_mut(&mut self.conns, e).pt =
                    side_point(&s, shape, side, Some(js::max(pos, 1.0001)), 0.5);
            }
        }
    }

    /// The relative ends, the via points, and the route (around boxes when the simple one cuts through one), then
    /// the label.
    fn route_conn(&mut self, ci: usize) {
        let c = &mut self.conns[ci];
        if c.a.kind == EndKind::Rel {
            let r = c.a.rel.unwrap();
            c.a.pt = Pt {
                x: c.b.pt.x + r.x,
                y: c.b.pt.y + r.y,
            };
        }
        if c.b.kind == EndKind::Rel {
            let r = c.b.rel.unwrap();
            c.b.pt = Pt {
                x: c.a.pt.x + r.x,
                y: c.a.pt.y + r.y,
            };
        }
        let line = c.line;
        let mut via: Vec<Pt> = Vec::new();
        if let Some(v) = c.p.get("via").filter(|v| !v.is_empty()) {
            via = v
                .split(';')
                .map(|s| {
                    let mut it = s.split(',').map(to_number);
                    Pt {
                        x: it.next().unwrap_or(f64::NAN),
                        y: it.next().unwrap_or(f64::NAN),
                    }
                })
                .collect();
            if via.iter().any(|v| v.x.is_nan() || v.y.is_nan()) {
                self.err(line, "via must look like via=x,y or via=x,y;x,y".into());
                via = Vec::new();
            }
        }
        let c = &self.conns[ci];
        let (a, b) = (c.a.pt, c.b.pt);
        if a.x == b.x && a.y == b.y {
            let msg = format!(
                "{} and {} meet at the same point ({},{}), so this line has no length and is not drawn; attach it to other sides",
                c.a.raw,
                c.b.raw,
                num_str(a.x),
                num_str(a.y)
            );
            self.warn(line, msg);
        }
        let c = &mut self.conns[ci];
        c.pts = if c.curve {
            curve_pts(
                a,
                c.a.dir,
                b,
                c.b.dir,
                &via,
                num(c.p.get("bend").map(String::as_str), f64::NAN),
            )
        } else {
            route(c, &via)
        };
        // the simple route cuts through a box: find a way around (hand-set via points are left alone)
        if c.ortho && via.is_empty() && !c.ushape {
            let strictly_in = |o: &Shape, p: Pt| {
                p.x > o.x + 1.0 && p.x < o.x + o.w - 1.0 && p.y > o.y + 1.0 && p.y < o.y + o.h - 1.0
            };
            // (an open outline is a line, not a box: nothing goes around it)
            let mut obs: Vec<Rect> = self
                .shapes
                .iter()
                .filter(|o| {
                    !o.back
                        && o.shape != "legend"
                        && !(o.poly.is_some() && o.p.get("open").map(String::as_str) == Some("1"))
                        && js::min(o.w, o.h) > 12.0
                        && !strictly_in(o, a)
                        && !strictly_in(o, b)
                })
                .map(shape_rect)
                .collect();
            // an icon's caption hangs below it: other lines go around it too
            for o in self.shapes {
                let cb = if Some(o.id.as_str()) != c.a.id.as_deref()
                    && Some(o.id.as_str()) != c.b.id.as_deref()
                {
                    caption_box(o)
                } else {
                    None
                };
                if let Some(cb) = cb {
                    obs.push(Rect {
                        x: cb.x - 4.0,
                        y: cb.y - 2.0,
                        w: cb.w + 8.0,
                        h: cb.h + 4.0,
                    });
                }
            }
            if crosses(&c.pts, &obs)
                && let Some(alt) = route_around(a, c.a.dir, b, c.b.dir, &obs, &self.taken)
            {
                c.pts = alt;
            }
        }
        if c.ortho {
            for w in c.pts.windows(2) {
                self.taken.push((w[0], w[1]));
            }
        }
        let avoid: Vec<Rect> = self
            .shapes
            .iter()
            .filter(|o| !o.back && o.shape != "legend")
            .map(shape_rect)
            .collect();
        c.label = make_label(c, &avoid);
        self.done.insert(ci);
    }

    /// The lines that start at shapes and points first, then those attached to them; a line attached to a line
    /// that is itself attached to a line is not drawn. Returns the connectors drawn.
    fn resolve(mut self) -> Vec<Conn> {
        self.check_ends();
        let good: Vec<usize> = (0..self.conns.len())
            .filter(|i| !self.bad.contains(i))
            .collect();
        let refs_conn = |c: &Conn| c.a.kind == EndKind::Conn || c.b.kind == EndKind::Conn;
        let first: Vec<usize> = good
            .iter()
            .copied()
            .filter(|&i| !refs_conn(&self.conns[i]))
            .collect();
        self.resolve_pass(&first);
        let second: Vec<usize> = good
            .iter()
            .copied()
            .filter(|&i| refs_conn(&self.conns[i]))
            .collect();
        for &ci in &second {
            for which in [false, true] {
                let e = end_of(&self.conns, (ci, which));
                if e.kind == EndKind::Conn {
                    let id = e.id.clone().unwrap();
                    if !self.done.contains(&self.conn_by_id[&id]) {
                        let line = self.conns[ci].line;
                        self.err(line, format!("\"{id}\" is itself attached to a line; attach to a line that starts at a shape or a point"));
                        self.bad.insert(ci);
                    }
                }
            }
        }
        let second: Vec<usize> = second
            .into_iter()
            .filter(|i| !self.bad.contains(i))
            .collect();
        self.resolve_pass(&second);
        let done = self.done;
        self.conns
            .into_iter()
            .enumerate()
            .filter(|(i, _)| done.contains(i))
            .map(|(_, c)| c)
            .collect()
    }
}

/// look_in: the already-parsed look the diagram points to, or None if it could not be found.
pub fn build_scene(src: &str, look_in: Option<Look>, file: &str) -> Scene {
    let stmts = parse_statements(src);
    let look_stmt = stmts.iter().find(|s| {
        s.toks
            .first()
            .is_some_and(|t| t.v == "look" && t.t == TokKind::Word)
    });
    // a bare name is one of the looks that ship with FastDraw, whatever file a caller may have read
    let named = bundled_look(
        look_stmt
            .and_then(|s| s.toks.get(1))
            .map_or("", |t| t.v.as_str()),
    );
    let has_look_in = look_in.is_some();
    let look: Arc<Look> = match (named.clone(), look_in) {
        (Some(l), _) => l,
        (None, Some(l)) => Arc::new(l),
        (None, None) if look_stmt.is_some() => Arc::new(empty_look()),
        (None, None) => default_look(),
    };
    let base_canvas = look.canvas.clone();
    let mut b = Builder {
        look,
        issues: Vec::new(),
        shapes: Vec::new(),
        texts: Vec::new(),
        conns: Vec::new(),
        ids: HashSet::new(),
        canvas_line: None,
        canvas_size: false,
        legends: Vec::new(),
        unplaced: Vec::new(),
    };
    if let Some(ls) = look_stmt {
        b.look_statement(ls, named.is_some(), has_look_in);
    }
    for st in &stmts {
        b.statement(st);
    }
    b.lay_out_legends();
    b.fallback_placement();

    let Builder {
        look,
        mut issues,
        shapes,
        texts,
        conns,
        canvas_line,
        canvas_size,
        ..
    } = b;
    let conns = Resolver::new(&shapes, &texts, conns, &mut issues).resolve();

    let shape_boxes: Vec<Rect> = shapes
        .iter()
        .map(shape_rect)
        .chain(shapes.iter().filter_map(caption_box))
        .collect();
    let text_boxes: Vec<Rect> = texts.iter().map(text_rect).collect();
    let ext = extent(&shape_boxes, &text_boxes, &conns);
    Scene {
        file: file.to_string(),
        x: ext.x,
        y: ext.y,
        w: ext.w,
        h: ext.h,
        look,
        canvas_line,
        canvas_size: Some(canvas_size),
        base_canvas: Some(base_canvas),
        font_files: None,
        shapes,
        texts,
        conns,
        issues,
    }
}

/// The caption under an icon shape: its text and second line, centred below the icon. None for any other shape.
pub const ICON_CAPTION_GAP: f64 = 6.0;
pub fn caption_box(s: &Shape) -> Option<Rect> {
    let sub_text = s.p.get("sub").map(String::as_str).filter(|t| !t.is_empty());
    let text = s.text.as_deref().filter(|t| !t.is_empty());
    if s.shape != "icon" || (text.is_none() && sub_text.is_none()) {
        return None;
    }
    let prop = |k: &str| s.p.get(k).map(String::as_str);
    let size = plus_or(prop("title.size"), 11.0);
    let sub = plus_or(prop("sub.size"), 9.0);
    let lines: Vec<&str> = text.map_or_else(Vec::new, |t| t.split('\n').collect());
    let subs: Vec<&str> = sub_text.map_or_else(Vec::new, |t| t.split('\n').collect());
    let tfont = prop("title.font").unwrap_or("sans");
    let tweight = plus_or(prop("title.weight"), 600.0);
    let sfont = prop("sub.font").unwrap_or("mono");
    let w = lines
        .iter()
        .map(|l| text_width(l, size, tfont, tweight, 0.0))
        .chain(subs.iter().map(|l| text_width(l, sub, sfont, 400.0, 0.0)))
        .fold(0.0, js::max);
    let h = lines.len() as f64 * round(size * 1.17)
        + if subs.is_empty() {
            0.0
        } else {
            2.0 + subs.len() as f64 * round(sub * 1.3)
        };
    Some(Rect {
        x: s.x + s.w / 2.0 - w / 2.0,
        y: s.y + s.h + ICON_CAPTION_GAP,
        w,
        h,
    })
}

/// The picture's extent: the box around every shape, text, line and line label, 40px clear on all sides,
/// on the 4px grid. An empty drawing still gets a small picture.
pub const MARGIN: f64 = 40.0;
pub fn extent(shapes: &[Rect], texts: &[Rect], conns: &[Conn]) -> Rect {
    let mut boxes: Vec<Rect> = shapes.iter().chain(texts).copied().collect();
    for c in conns {
        boxes.extend(c.pts.iter().map(|p| Rect {
            x: p.x,
            y: p.y,
            w: 0.0,
            h: 0.0,
        }));
        if let Some(l) = &c.label {
            boxes.push(Rect {
                x: l.x,
                y: l.y,
                w: l.w,
                h: l.h,
            });
        }
    }
    if boxes.is_empty() {
        return Rect {
            x: 0.0,
            y: 0.0,
            w: 400.0,
            h: 240.0,
        };
    }
    let x0 = boxes.iter().map(|b| b.x).fold(f64::INFINITY, js::min);
    let y0 = boxes.iter().map(|b| b.y).fold(f64::INFINITY, js::min);
    let x1 = boxes
        .iter()
        .map(|b| b.x + b.w)
        .fold(f64::NEG_INFINITY, js::max);
    let y1 = boxes
        .iter()
        .map(|b| b.y + b.h)
        .fold(f64::NEG_INFINITY, js::max);
    let x = ((x0 - MARGIN) / 4.0).floor() * 4.0;
    let y = ((y0 - MARGIN) / 4.0).floor() * 4.0;
    Rect {
        x,
        y,
        w: ((x1 + MARGIN) / 4.0).ceil() * 4.0 - x,
        h: ((y1 + MARGIN) / 4.0).ceil() * 4.0 - y,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iconfiles::with_icon_images;
    use crate::look::{IssueLevel, parse_look};

    /// A look file as loadScene hands it over: parsed, with one warning about an icon folder it could not use.
    fn team_look() -> Look {
        let mut l = parse_look(
            "style node shape=rect\nbogus\nicon q \"M4 6h16\"\nicondir \"./icons\"\n",
            "./t.look",
        );
        l.issues.push(LookIssue {
            line: 0,
            level: IssueLevel::Warn,
            msg: "icon folder not used: ../out (icondir must be a folder inside the folder that holds the look file)"
                .into(),
            file: None,
        });
        l
    }

    fn issues(sc: &Scene) -> Vec<(u32, &'static str, String, Option<String>)> {
        sc.issues
            .iter()
            .map(|i| (i.line, i.level.as_str(), i.msg.clone(), i.file.clone()))
            .collect()
    }

    // Expected values printed by Node: buildScene(src, look, '') after loadExtendedIcons().
    #[test]
    fn a_look_files_issues_are_the_diagrams() {
        let sc = build_scene(
            "look \"./t.look\"\na: node icon=q icon.style=solid\nb: node icon=zzzq",
            Some(team_look()),
            "",
        );
        let got = issues(&sc);
        let file = Some("./t.look".to_string());
        assert_eq!(
            got[0],
            (
                1,
                "error",
                "unknown look statement \"bogus\" (in look, line 2)".into(),
                file
            )
        );
        assert_eq!(
            got[1],
            (
                1,
                "warn",
                "icon folder not used: ../out (icondir must be a folder inside the folder that holds the look file) (in look, line 0)".into(),
                None
            )
        );
        assert_eq!(
            got[2],
            (
                2,
                "warn",
                "icon q is the look's own, with no solid version (only the built-in icons have one), so it is drawn as it is; drop icon.style=solid".into(),
                None
            )
        );
        let (line, level, msg, _) = &got[3];
        assert_eq!((*line, *level), (3, "error"));
        assert!(
            msg.starts_with("there is no icon called \"zzzq\" (the look's icon folder ./icons could not be read here); the look has: active-directory, admin, "),
            "{msg}"
        );
        assert!(
            msg.ends_with(", and 1555 more (run \"fastdraw icons\" to see them all)"),
            "{msg}"
        );
        assert_eq!(got.len(), 6);
    }

    #[test]
    fn a_look_without_a_look_line_adds_no_issues_of_its_own() {
        let sc = build_scene("a: node icon=q icon.style=duotone", Some(team_look()), "");
        assert_eq!(
            issues(&sc),
            [
                (
                    1,
                    "warn",
                    "icon q is the look's own, with no duotone version (only the built-in icons have one), so it is drawn as it is; drop icon.style=duotone".to_string(),
                    None
                ),
                (
                    1,
                    "warn",
                    "a has no position (\"at x,y\"); it was dropped in a row at 40,40".into(),
                    None
                ),
            ]
        );
    }

    #[test]
    fn icon_files_come_first_and_drop_the_folder_note() {
        let look = with_icon_images(
            &team_look(),
            vec![("Load Balancer.svg".into(), b"<svg></svg>".to_vec())],
        );
        let sc = build_scene(
            "look \"./t.look\"\na: node icon=load-balancer icon.style=solid\nb: node icon=nosuch",
            Some(look),
            "",
        );
        let got = issues(&sc);
        assert_eq!(
            got[2].2,
            "icon load-balancer is the look's own, with no solid version (only the built-in icons have one), so it is drawn as it is; drop icon.style=solid"
        );
        assert!(
            got[3].2.starts_with(
                "there is no icon called \"nosuch\"; the look has: load-balancer, active-directory, "
            ),
            "{}",
            got[3].2
        );
        assert!(
            got[3]
                .2
                .ends_with(", and 1556 more (run \"fastdraw icons\" to see them all)")
        );
    }
}
