//! scene.ts, part 1: the scene types, text measuring, and the helpers `build_scene` leans on (sides, routes,
//! curves, labels, table layout, connector ends). `look_path` and `with_look` live in parse.rs.
//! The helpers are public so the crate's later modules (and tests) can reach them.

use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use regex::Regex;

use crate::data::{font_widths, width_chars};
use crate::js::{self, num_str, round, to_number, utf16_len};
use crate::look::{IssueLevel, Kind, Look, LookIssue, Props};
use crate::router::{Pt, Rect};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Top,
    Bottom,
    Left,
    Right,
}

impl Side {
    pub fn as_str(self) -> &'static str {
        match self {
            Side::Top => "top",
            Side::Bottom => "bottom",
            Side::Left => "left",
            Side::Right => "right",
        }
    }

    /// `side in DIRS` for the four sides (see `parse_end` for the prototype names).
    pub fn from_name(s: &str) -> Option<Side> {
        match s {
            "top" => Some(Side::Top),
            "bottom" => Some(Side::Bottom),
            "left" => Some(Side::Left),
            "right" => Some(Side::Right),
            _ => None,
        }
    }

    /// `DIRS[side]`.
    pub fn dir(self) -> Pt {
        match self {
            Side::Top => Pt { x: 0.0, y: -1.0 },
            Side::Bottom => Pt { x: 0.0, y: 1.0 },
            Side::Left => Pt { x: -1.0, y: 0.0 },
            Side::Right => Pt { x: 1.0, y: 0.0 },
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
        Side::Right => Pt {
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
            let same = d0.x == d1.x && d0.y == d1.y;
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
/// Note: TypeScript's `m[2] in DIRS` also accepts Object.prototype names ("constructor", "toString", ...) as a
/// side; here only the four real sides count, so those names read as a table row.
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
