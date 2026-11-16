//! render.ts: draws a resolved scene as SVG. The same output feeds PNG export.
//!
//! The TypeScript keeps the per-render state (how rough the look draws, the fill patterns it needs) in a
//! module-level variable; here it is a `RenderCtx` made by each `render_body` call and passed down.

use std::sync::OnceLock;

use indexmap::IndexMap;
use regex::{NoExpand, Regex};

use crate::chart::draw_chart;
use crate::iconfiles::is_icon_uri;
use crate::icons::{ICON_BOX, IconStyle, icon_layers, is_built_in, weight_for};
use crate::js::{self, hypot, num_str, round, to_fixed, to_number};
use crate::look::{Kind, Look, Props, color, font_family};
use crate::router::Pt;
use crate::scene::{
    Conn, ICON_CAPTION_GAP, RowKind, Scene, Shape, TextEl, measure_text, text_width,
};
use crate::sketch::{can_sketch, ellipse_d, rect_d, sketch_svg};

pub use crate::js::r2;
pub use crate::scene::num;

/// `String(n)`, as a template literal writes a number.
fn n(x: f64) -> String {
    num_str(x)
}

/// `p[k]`
fn g<'a>(p: &'a Props, k: &str) -> Option<&'a str> {
    p.get(k).map(String::as_str)
}

/// Whether a property is set to something other than '' (a string's truthiness).
fn truthy(v: Option<&str>) -> bool {
    v.is_some_and(|v| !v.is_empty())
}

/// `v && v !== 'none'`
fn set_not_none(v: Option<&str>) -> bool {
    truthy(v) && v != Some("none")
}

/// A number's truthiness: neither 0 nor NaN.
fn nz(x: f64) -> bool {
    x != 0.0 && !x.is_nan()
}

/// `{ ...p, k: v }`
fn with(p: &Props, k: &str, v: String) -> Props {
    let mut q = p.clone();
    q.insert(k.to_string(), v);
    q
}

/// `Math.min(a, b, ...)`
fn mins(v: &[f64]) -> f64 {
    v.iter().fold(f64::INFINITY, |a, &b| js::min(a, b))
}

fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).unwrap())
}
fn fill_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r#"fill="[^"]*""#)
}
fn stroke_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r#"stroke="[^"]*""#)
}
/// `s.replace(regex, rep)`: the first match, `rep` taken literally.
fn replace_first(r: &Regex, s: &str, rep: &str) -> String {
    r.replace(s, NoExpand(rep)).into_owned()
}

/// Per render: how rough the look draws (canvas sketch=, 0 for clean lines) and the fill patterns it needs.
pub struct RenderCtx {
    pub amt: f64,
    /// pattern key -> id, in the order first asked for
    pub defs: IndexMap<String, String>,
}

impl RenderCtx {
    fn rough_of(&self, p: &Props) -> f64 {
        if g(p, "sketch") == Some("0") {
            0.0
        } else {
            self.amt
        }
    }

    // A fill pattern, defined once per render however many shapes use it. kind is hatch (diagonal lines,
    // a = gap, b = line weight) or dots (a halftone, a = gap, b = dot radius).
    fn pattern(&mut self, kind: &str, c: &str, a: f64, b: f64) -> String {
        let key = format!("{kind}|{c}|{}|{}", n(a), n(b));
        let size = self.defs.len();
        let id = self
            .defs
            .entry(key)
            .or_insert_with(|| format!("fd-{kind}-{size}"));
        format!("url(#{id})")
    }

    // hatch=colour fills a shape with diagonal pencil lines; hatch.gap and hatch.sw space and weigh them.
    fn hatch_fill(&mut self, look: &Look, p: &Props) -> Option<String> {
        if !set_not_none(g(p, "hatch")) {
            return None;
        }
        Some(self.pattern(
            "hatch",
            &col(look, g(p, "hatch"), None),
            num(g(p, "hatch.gap"), 6.0),
            num(g(p, "hatch.sw"), 1.0),
        ))
    }

    // halftone=colour fills a shape with a field of printed dots; halftone.gap spaces them, halftone.r sizes them.
    fn dot_fill(&mut self, look: &Look, p: &Props) -> Option<String> {
        if !set_not_none(g(p, "halftone")) {
            return None;
        }
        Some(self.pattern(
            "dots",
            &col(look, g(p, "halftone"), None),
            js::max(2.0, num(g(p, "halftone.gap"), 6.0)),
            num(g(p, "halftone.r"), 1.05),
        ))
    }

    fn hatch_defs(&self) -> String {
        self.defs
            .iter()
            .map(|(key, id)| {
                // `const [kind, c, a, b] = key.split('|')`: a colour with a '|' in it shifts the rest along
                let parts: Vec<&str> = key.split('|').collect();
                let part = |i: usize| parts.get(i).copied().unwrap_or("undefined");
                let (kind, c, a, b) = (part(0), part(1), part(2), part(3));
                if kind == "dots" {
                    let an = to_number(a);
                    return format!(
                        "<pattern id=\"{id}\" width=\"{a}\" height=\"{a}\" patternUnits=\"userSpaceOnUse\"><circle cx=\"{}\" cy=\"{}\" r=\"{b}\" fill=\"{c}\"/><circle cx=\"{}\" cy=\"{}\" r=\"{b}\" fill=\"{c}\"/></pattern>",
                        n(an / 4.0),
                        n(an / 4.0),
                        n((an * 3.0) / 4.0),
                        n((an * 3.0) / 4.0)
                    );
                }
                format!(
                    "<pattern id=\"{id}\" width=\"{a}\" height=\"{a}\" patternUnits=\"userSpaceOnUse\" patternTransform=\"rotate(-41)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"{a}\" stroke=\"{c}\" stroke-width=\"{b}\" stroke-linecap=\"round\"/></pattern>"
                )
            })
            .collect()
    }
}

const BLEND: &str = " style=\"mix-blend-mode:multiply\"";
fn blend_of(p: &Props) -> &'static str {
    if g(p, "blend") == Some("multiply") {
        BLEND
    } else {
        ""
    }
}
// The same shape somewhere else: for a slab under it, a shadow beside it, a fill printed out of register.
fn shifted(s: &Shape, dx: f64, dy: f64) -> Shape {
    Shape {
        x: s.x + dx,
        y: s.y + dy,
        poly: s.poly.as_ref().map(|poly| {
            poly.iter()
                .map(|q| Pt {
                    x: q.x + dx,
                    y: q.y + dy,
                })
                .collect()
        }),
        ..s.clone()
    }
}
fn boxy(s: &Shape) -> bool {
    s.shape != "polygon" && s.shape != "arc"
}

// What is drawn under a shape before the shape itself:
//   shade=colour  a shadow of fine diagonal lines down its right and bottom (shade.size, shade.gap, shade.sw)
//   depth=N       a slab N pixels below it, so it reads as a solid with a side (depth.fill, depth.stroke)
fn underlay(cx: &mut RenderCtx, look: &Look, s: &Shape) -> Vec<String> {
    let p = &s.p;
    let mut out = Vec::new();
    if set_not_none(g(p, "shade")) {
        let k = num(g(p, "shade.size"), 5.0);
        let fill = cx.pattern(
            "hatch",
            &col(look, g(p, "shade"), None),
            num(g(p, "shade.gap"), 2.6),
            num(g(p, "shade.sw"), 0.6),
        );
        out.push(outline_plain(
            &shifted(s, k, k),
            &format!("fill=\"{fill}\" stroke=\"none\""),
        ));
    }
    let d = num(g(p, "depth"), 0.0);
    if d > 0.0 {
        let under = shifted(s, 0.0, d);
        let paper = col(look, Some(paper_of(look)), None);
        let mut a = format!(
            "fill=\"{}\" stroke=\"{}\"",
            col(look, Some(g(p, "depth.fill").unwrap_or("ink/0.2")), None),
            col(look, g(p, "depth.stroke").or(g(p, "stroke")), None)
        );
        if set_not_none(g(p, "stroke")) {
            a += &format!(" stroke-width=\"{}\"", n(num(g(p, "sw"), 1.0)));
        }
        out.push(outline_plain(&under, &format!("fill=\"{paper}\"")));
        out.push(outline_plain(&under, &a));
    }
    out
}

/// `look.canvas.paper ?? 'paper'`
fn paper_of(look: &Look) -> &str {
    g(&look.canvas, "paper").unwrap_or("paper")
}

// What is drawn on a shape after its outline:
//   inner=colour    a second, finer rule just inside the outline (inner.gap, inner.sw)
//   corners=plus    a mark on each corner of a box: plus or square (corners.color, corners.size)
fn overlay(look: &Look, s: &Shape) -> Vec<String> {
    let p = &s.p;
    let mut out = Vec::new();
    if set_not_none(g(p, "inner")) && boxy(s) {
        let gap = num(g(p, "inner.gap"), 3.5);
        if s.w > gap * 2.0 + 4.0 && s.h > gap * 2.0 + 4.0 {
            let inset = Shape {
                x: s.x + gap,
                y: s.y + gap,
                w: s.w - gap * 2.0,
                h: s.h - gap * 2.0,
                p: with(p, "radius", n(js::max(0.0, num(g(p, "radius"), 0.0) - gap))),
                ..s.clone()
            };
            out.push(outline_plain(
                &inset,
                &format!(
                    "fill=\"none\" stroke=\"{}\" stroke-width=\"{}\"",
                    col(look, g(p, "inner"), None),
                    n(num(g(p, "inner.sw"), 0.6))
                ),
            ));
        }
    }
    if set_not_none(g(p, "corners")) && (s.shape == "rect" || s.shape == "table") {
        let c = col(
            look,
            Some(g(p, "corners.color").or(g(p, "stroke")).unwrap_or("ink")),
            None,
        );
        let plus = g(p, "corners") == Some("plus");
        let k = num(g(p, "corners.size"), if plus { 7.0 } else { 5.0 }) / 2.0;
        for (x, y) in [
            (s.x, s.y),
            (s.x + s.w, s.y),
            (s.x, s.y + s.h),
            (s.x + s.w, s.y + s.h),
        ] {
            out.push(if plus {
                format!(
                    "<path d=\"M {},{} H {} M {},{} V {}\" stroke=\"{c}\" stroke-width=\"1.2\" fill=\"none\"/>",
                    n(x - k),
                    n(y),
                    n(x + k),
                    n(x),
                    n(y - k),
                    n(y + k)
                )
            } else {
                format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{c}\"/>",
                    n(x - k),
                    n(y - k),
                    n(k * 2.0),
                    n(k * 2.0)
                )
            });
        }
    }
    out
}

pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// Everything interpolated into an attribute goes through esc: diagram files are untrusted input
// and the editor injects this markup into the page.
pub fn col(look: &Look, v: Option<&str>, over: Option<&str>) -> String {
    esc(&color(look, v, over))
}
fn fam(look: &Look, v: Option<&str>) -> String {
    esc(&font_family(look, v))
}

/// The defaults `textAttrs` falls back on.
pub struct TextDefaults {
    pub font: String,
    pub size: f64,
    pub weight: f64,
    pub color: String,
}

pub(crate) fn td(font: &str, size: f64, weight: f64, color: &str) -> TextDefaults {
    TextDefaults {
        font: font.to_string(),
        size,
        weight,
        color: color.to_string(),
    }
}

/// What `textAttrs` gives back: the attributes, and the numbers they were made from.
#[derive(Debug, Clone)]
pub struct TextAttrs {
    pub a: String,
    pub size: f64,
    pub spacing: f64,
    pub font: String,
    pub weight: f64,
}

pub fn text_attrs(look: &Look, p: &Props, pre: &str, d: &TextDefaults) -> TextAttrs {
    let get = |k: &str| p.get(&format!("{pre}{k}")).map(String::as_str);
    let size = num(get("size"), d.size);
    let spacing = num(get("spacing"), 0.0);
    let font = get("font").unwrap_or(&d.font).to_string();
    let mut a = format!(
        "font-family=\"{}\" font-size=\"{}\" fill=\"{}\"",
        fam(look, Some(&font)),
        n(size),
        col(look, Some(get("color").unwrap_or(&d.color)), None)
    );
    let weight = num(get("weight"), d.weight);
    if weight != 400.0 {
        a += &format!(" font-weight=\"{}\"", n(weight));
    }
    if get("italic") == Some("1") {
        a += " font-style=\"italic\"";
    }
    if nz(spacing) {
        a += &format!(" letter-spacing=\"{}\"", n(r2(spacing * size)));
    }
    TextAttrs {
        a,
        size,
        spacing,
        font,
        weight,
    }
}

fn stroke_attrs(look: &Look, p: &Props) -> String {
    let mut a = format!(
        "fill=\"{}\" stroke=\"{}\"",
        col(look, g(p, "fill"), None),
        col(look, g(p, "stroke"), None)
    );
    if set_not_none(g(p, "stroke")) {
        a += &format!(" stroke-width=\"{}\"", n(num(g(p, "sw"), 1.0)));
    }
    if set_not_none(g(p, "dash")) {
        a += &format!(" stroke-dasharray=\"{}\"", esc(g(p, "dash").unwrap()));
    }
    if g(p, "cap") == Some("round") {
        a += " stroke-linecap=\"round\"";
    }
    a
}

// The outline as path data, so it can be drawn by hand. Arcs keep their clean outline.
fn shape_d(s: &Shape) -> Option<String> {
    let (x, y, w, h) = (s.x, s.y, s.w, s.h);
    match s.shape.as_str() {
        "ellipse" => Some(ellipse_d(x, y, w, h)),
        "diamond" => Some(format!(
            "M {},{} L {},{} L {},{} L {},{} Z",
            n(x + w / 2.0),
            n(y),
            n(x + w),
            n(y + h / 2.0),
            n(x + w / 2.0),
            n(y + h),
            n(x),
            n(y + h / 2.0)
        )),
        "polygon" => s.poly.as_ref().map(|_| poly_d(s)),
        "path" => truthy(g(&s.p, "path")).then(|| scaled_path(s)),
        "arc" => None,
        _ => Some(rect_d(
            x,
            y,
            w,
            h,
            mins(&[num(g(&s.p, "radius"), 0.0), w / 2.0, h / 2.0]),
        )),
    }
}

// path is written in a 0..1 box and scaled to the element (M, L, C, Q, Z only)
fn scaled_path(s: &Shape) -> String {
    static NUM: OnceLock<Regex> = OnceLock::new();
    let mut is_x = true;
    re(&NUM, r"-?[0-9]*\.?[0-9]+")
        .replace_all(g(&s.p, "path").unwrap_or(""), |c: &regex::Captures| {
            let v = to_number(&c[0]);
            let v = if is_x { s.x + v * s.w } else { s.y + v * s.h };
            is_x = !is_x;
            n(r2(v))
        })
        .into_owned()
}

/// `M p0 C ...`: a smooth line through every corner of a polygon.
fn smooth_d(pts: &[Pt], open: bool) -> String {
    let len = pts.len() as isize;
    let at = |i: isize| {
        if open {
            pts[i.clamp(0, len - 1) as usize]
        } else {
            pts[((i + len) % len) as usize]
        }
    };
    let mut d = format!("M {},{}", n(pts[0].x), n(pts[0].y));
    let end = if open { len - 1 } else { len };
    for i in 0..end {
        let (p0, p1, p2, p3) = (at(i - 1), at(i), at(i + 1), at(i + 2));
        d += &format!(
            " C {},{} {},{} {},{}",
            n(r2(p1.x + (p2.x - p0.x) / 6.0)),
            n(r2(p1.y + (p2.y - p0.y) / 6.0)),
            n(r2(p2.x - (p3.x - p1.x) / 6.0)),
            n(r2(p2.y - (p3.y - p1.y) / 6.0)),
            n(p2.x),
            n(p2.y)
        );
    }
    d
}

fn pts_list(pts: &[Pt], sep: &str) -> String {
    pts.iter()
        .map(|q| format!("{},{}", n(q.x), n(q.y)))
        .collect::<Vec<_>>()
        .join(sep)
}

fn poly_d(s: &Shape) -> String {
    let pts = s.poly.as_deref().unwrap_or(&[]);
    let open = g(&s.p, "open") == Some("1");
    if g(&s.p, "smooth") == Some("1") && pts.len() > 2 {
        // a smooth line through every corner
        return smooth_d(pts, open) + if open { "" } else { " Z" };
    }
    format!("M {}{}", pts_list(pts, " L "), if open { "" } else { " Z" })
}

// under: a fill painted between the shape's own fill and its stroke (a hatch)
fn outline(cx: &RenderCtx, s: &Shape, attrs: &str, under: Option<&str>) -> String {
    let amt = cx.rough_of(&s.p);
    if nz(amt)
        && let Some(d) = shape_d(s)
        && can_sketch(&d)
    {
        let a = if s.shape == "polygon" && g(&s.p, "open") == Some("1") {
            replace_first(fill_re(), attrs, "fill=\"none\"")
        } else {
            attrs.to_string()
        };
        let u = under.map_or(String::new(), |u| {
            format!("<path d=\"{{d}}\" fill=\"{u}\" stroke=\"none\"/>")
        });
        return sketch_svg(&d, &a, amt, &u);
    }
    let Some(under) = under else {
        return outline_plain(s, attrs);
    };
    [
        outline_plain(s, &replace_first(stroke_re(), attrs, "stroke=\"none\"")),
        outline_plain(s, &format!("fill=\"{under}\" stroke=\"none\"")),
        outline_plain(s, &replace_first(fill_re(), attrs, "fill=\"none\"")),
    ]
    .join("\n")
}

fn outline_plain(s: &Shape, attrs: &str) -> String {
    let (x, y, w, h) = (s.x, s.y, s.w, s.h);
    if s.shape == "ellipse" {
        return format!(
            "<ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" {attrs}/>",
            n(x + w / 2.0),
            n(y + h / 2.0),
            n(w / 2.0),
            n(h / 2.0)
        );
    }
    if s.shape == "diamond" {
        return format!(
            "<polygon points=\"{},{} {},{} {},{} {},{}\" {attrs}/>",
            n(x + w / 2.0),
            n(y),
            n(x + w),
            n(y + h / 2.0),
            n(x + w / 2.0),
            n(y + h),
            n(x),
            n(y + h / 2.0)
        );
    }
    if s.shape == "path" && truthy(g(&s.p, "path")) {
        // path is written in a 0..1 box and scaled to the element (M, L, C, Q, Z only)
        return format!("<path d=\"{}\" {attrs}/>", esc(&scaled_path(s)));
    }
    if s.shape == "polygon"
        && let Some(pts) = &s.poly
    {
        let open = g(&s.p, "open") == Some("1");
        let a = if open {
            replace_first(fill_re(), attrs, "fill=\"none\"")
        } else {
            attrs.to_string()
        };
        if g(&s.p, "smooth") == Some("1") && pts.len() > 2 {
            // a smooth line through every corner
            return format!(
                "<path d=\"{}{}\" stroke-linejoin=\"round\" {a}/>",
                smooth_d(pts, open),
                if open { "" } else { " Z" }
            );
        }
        return format!(
            "<{} points=\"{}\" stroke-linejoin=\"round\" {a}/>",
            if open { "polyline" } else { "polygon" },
            pts_list(pts, " ")
        );
    }
    if s.shape == "arc" {
        // a slice of the ellipse that fills the box: from= and to= in degrees clockwise from the top
        let p = &s.p;
        let a0 = num(g(p, "from"), 0.0);
        let a1 = num(g(p, "to"), 360.0);
        let inner = js::min(js::max(num(g(p, "inner"), 0.0), 0.0), 0.98);
        let open = g(p, "open") == Some("1");
        let (cx0, cy0) = (x + w / 2.0, y + h / 2.0);
        let pt = |deg: f64, k: f64| {
            format!(
                "{},{}",
                n(r2(cx0
                    + (w / 2.0)
                        * k
                        * js::sin((deg * std::f64::consts::PI) / 180.0))),
                n(r2(cy0
                    - (h / 2.0)
                        * k
                        * js::cos((deg * std::f64::consts::PI) / 180.0)))
            )
        };
        let sweep = |k: f64, f: f64, t: f64| {
            // an arc cannot draw a full turn in one go, so it is drawn in two halves
            let mid = (f + t) / 2.0;
            let dir = if t > f { 1 } else { 0 };
            let r = format!("{} {}", n(r2((w / 2.0) * k)), n(r2((h / 2.0) * k)));
            format!(
                "A {r} 0 0 {dir} {} A {r} 0 0 {dir} {}",
                pt(mid, k),
                pt(t, k)
            )
        };
        let full = (a1 - a0).abs() >= 360.0;
        let mut d = format!("M {} {}", pt(a0, 1.0), sweep(1.0, a0, a1));
        if open {
            return format!(
                "<path d=\"{d}\" {} stroke-linecap=\"round\"/>",
                replace_first(fill_re(), attrs, "fill=\"none\"")
            );
        }
        if inner > 0.0 {
            d += &if full {
                format!(" Z M {} {} Z", pt(a1, inner), sweep(inner, a1, a0))
            } else {
                format!(" L {} {} Z", pt(a1, inner), sweep(inner, a1, a0))
            };
        } else if full {
            d += " Z";
        } else {
            d += &format!(" L {},{} Z", n(r2(cx0)), n(r2(cy0)));
        }
        return format!(
            "<path d=\"{d}\" fill-rule=\"evenodd\" stroke-linejoin=\"round\" {attrs}/>"
        );
    }
    let rx = mins(&[num(g(&s.p, "radius"), 0.0), w / 2.0, h / 2.0]);
    format!(
        "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{} {attrs}/>",
        n(x),
        n(y),
        n(w),
        n(h),
        if nz(rx) {
            format!(" rx=\"{}\"", n(rx))
        } else {
            String::new()
        }
    )
}

fn draw_legend(cx: &RenderCtx, look: &Look, s: &Shape) -> String {
    static SIZE: OnceLock<Regex> = OnceLock::new();
    let p = &s.p;
    let mut out = Vec::new();
    out.push(format!(
        "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{}\" stroke-width=\"0.8\"/>",
        n(s.x),
        n(s.y),
        n(s.x + s.w),
        n(s.y),
        col(look, Some(g(p, "rule").unwrap_or("ink/0.12")), None)
    ));
    if g(p, "title").unwrap_or("none") != "none" {
        let t = text_attrs(look, p, "title.", &td("mono", 8.0, 400.0, "muted"));
        let title = g(p, "title").unwrap();
        let title = if g(p, "title.caps") == Some("0") {
            title.to_string()
        } else {
            title.to_uppercase()
        };
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" {}>{}</text>",
            n(s.x),
            n(s.y + 16.0),
            t.a,
            esc(&title)
        ));
    }
    let it = text_attrs(look, p, "item.", &td("sans", 8.5, 400.0, "muted"));
    let empty = Props::new();
    for e in s.legend.as_deref().unwrap_or(&[]) {
        let sp = e
            .props
            .as_ref()
            .or_else(|| look.styles.get(&e.style).map(|st| &st.props))
            .unwrap_or(&empty);
        let y = e.baseline;
        if e.kind == Kind::Line {
            let sw = js::min(num(g(sp, "sw"), 1.2), 1.6);
            let stroke = col(look, Some(g(sp, "stroke").unwrap_or("muted")), None);
            let mk = if g(sp, "head") == Some("none") || g(sp, "route") == Some("straight") {
                "none"
            } else {
                g(sp, "head").unwrap_or("arrow")
            };
            let head = mk != "none";
            let paper = col(look, Some(paper_of(look)), None);
            let hm = marker(
                cx,
                mk,
                Pt {
                    x: e.x + 28.0,
                    y: y - 3.0,
                },
                Pt { x: e.x, y: y - 3.0 },
                sw,
                &stroke,
                &paper,
                1.0,
                &stroke,
            );
            let dash = if set_not_none(g(sp, "dash")) {
                format!(" stroke-dasharray=\"{}\"", esc(g(sp, "dash").unwrap()))
            } else {
                String::new()
            };
            out.push(if nz(cx.amt) {
                sketch_svg(
                    &format!(
                        "M {},{} L {},{}",
                        n(e.x),
                        n(y - 3.0),
                        n(r2(e.x + 28.0 - hm.1)),
                        n(y - 3.0)
                    ),
                    &format!("fill=\"none\" stroke=\"{stroke}\" stroke-width=\"{}\"{dash}", n(sw)),
                    cx.amt * 0.6,
                    "",
                )
            } else {
                format!(
                    "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{stroke}\" stroke-width=\"{}\"{dash}/>",
                    n(e.x),
                    n(y - 3.0),
                    n(r2(e.x + 28.0 - hm.1)),
                    n(y - 3.0),
                    n(sw)
                )
            });
            if head {
                out.push(hm.0);
            }
        } else if e.kind == Kind::Text {
            let tp = with(sp, "size", n(js::min(num(g(sp, "size"), 12.0), 11.0)));
            let t = text_attrs(look, &tp, "", &td("sans", 11.0, 400.0, "ink"));
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" {}>Aa</text>",
                n(e.x),
                n(y),
                t.a
            ));
        } else {
            let a = stroke_attrs(
                look,
                &with(sp, "sw", n(js::min(num(g(sp, "sw"), 1.0), 1.2))),
            );
            let m = re(&SIZE, r"^([0-9]+(?:\.[0-9]+)?)x").captures(g(sp, "size").unwrap_or(""));
            if g(sp, "shape") == Some("dot") {
                out.push(format!(
                    "<circle cx=\"{}\" cy=\"{}\" r=\"4.5\" {a}/>",
                    n(e.x + 7.0),
                    n(y - 3.0)
                ));
            } else if g(sp, "shape") == Some("diamond") {
                out.push(format!(
                    "<polygon points=\"{},{} {},{} {},{} {},{}\" {a}/>",
                    n(e.x + 11.0),
                    n(y - 9.0),
                    n(e.x + 22.0),
                    n(y - 3.0),
                    n(e.x + 11.0),
                    n(y + 3.0),
                    n(e.x),
                    n(y - 3.0)
                ));
            } else if m.is_some_and(|m| to_number(&m[1]) <= 12.0) {
                out.push(format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"4\" height=\"14\" {a}/>",
                    n(e.x + 5.0),
                    n(y - 11.0)
                ));
            } else {
                out.push(format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"14\" height=\"10\" rx=\"{}\" {a}/>",
                    n(e.x),
                    n(y - 8.0),
                    if num(g(sp, "radius"), 0.0) >= 12.0 {
                        5
                    } else {
                        2
                    }
                ));
            }
        }
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" {}>{}</text>",
            n(e.x + e.sample + 6.0),
            n(y),
            it.a,
            esc(&e.label)
        ));
    }
    out.join("\n")
}

/// `<rect x y width height[ rx]`, the start of a table's box.
fn table_rect(s: &Shape, r: f64) -> String {
    format!(
        "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{}",
        n(s.x),
        n(s.y),
        n(s.w),
        n(s.h),
        if nz(r) {
            format!(" rx=\"{}\"", n(r))
        } else {
            String::new()
        }
    )
}

// A table box: a header band with the title, then rows of cells. Geometry comes from the scene.
fn draw_table(cx: &mut RenderCtx, look: &Look, s: &Shape) -> String {
    let p = &s.p;
    let mut out: Vec<String> = Vec::new();
    let rows = s.rows.as_deref().unwrap_or(&[]);
    let cols = s.cols.as_deref().unwrap_or(&[]);
    let head_h = s.head_h.unwrap_or(0.0);
    let paper = col(look, Some(paper_of(look)), None);
    let stroke = col(look, g(p, "stroke"), None);
    let sw = num(g(p, "sw"), 1.0);
    let r = mins(&[num(g(p, "radius"), 0.0), s.w / 2.0, s.h / 2.0]);
    let x2 = s.x + s.w;
    out.extend(underlay(cx, look, s));
    out.push(format!("{} fill=\"{paper}\"/>", table_rect(s, r)));
    out.push(format!(
        "{} fill=\"{}\"/>",
        table_rect(s, r),
        col(look, g(p, "fill"), None)
    ));
    if nz(head_h) {
        let hy = s.y + head_h;
        out.push(format!(
            "<path d=\"M {},{} L {},{} Q {},{} {},{} L {},{} Q {},{} {},{} L {},{} Z\" fill=\"{}\"/>",
            n(s.x),
            n(hy),
            n(s.x),
            n(s.y + r),
            n(s.x),
            n(s.y),
            n(s.x + r),
            n(s.y),
            n(x2 - r),
            n(s.y),
            n(x2),
            n(s.y),
            n(x2),
            n(s.y + r),
            n(x2),
            n(hy),
            col(
                look,
                Some(g(p, "head.fill").unwrap_or("ink/0.06")),
                g(p, "fill")
            )
        ));
        let t = text_attrs(look, p, "title.", &td("sans", 12.0, 600.0, "ink"));
        let text = s.text.as_deref().unwrap_or("");
        let txt = if g(p, "title.caps") == Some("1") {
            text.to_uppercase()
        } else {
            text.to_string()
        };
        let tl: Vec<&str> = txt.split('\n').collect();
        let tlh = round(t.size * 1.25);
        let left = g(p, "title.align") == Some("left");
        for (i, l) in tl.iter().enumerate() {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"{}\" {}>{}</text>",
                n(if left {
                    s.x + num(g(p, "cell.pad"), 12.0)
                } else {
                    s.x + s.w / 2.0
                }),
                n(r2(hy - head_h / 2.0
                    + t.size * 0.36
                    + (i as f64 - (tl.len() as f64 - 1.0) / 2.0) * tlh)),
                if left { "start" } else { "middle" },
                t.a,
                esc(l)
            ));
        }
        if !rows.is_empty() {
            out.push(format!(
                "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{stroke}\" stroke-width=\"{}\"/>",
                n(s.x),
                n(hy),
                n(x2),
                n(hy),
                n(sw)
            ));
        }
    }
    let first = text_attrs(look, p, "cell.", &td("mono", 10.0, 400.0, "ink"));
    let rest = text_attrs(
        look,
        &with(
            p,
            "cell.color",
            g(p, "detail.color").unwrap_or("muted").to_string(),
        ),
        "cell.",
        &td("mono", 10.0, 400.0, "muted"),
    );
    let strong = text_attrs(
        look,
        &with(p, "cell.weight", "600".to_string()),
        "cell.",
        &td("mono", 10.0, 600.0, "ink"),
    );
    let center = g(p, "align") == Some("center");
    let rule = col(look, Some(g(p, "rule").unwrap_or("ink/0.1")), None);
    for (i, row) in rows.iter().enumerate() {
        if row.kind == RowKind::Rule {
            out.push(format!(
                "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{stroke}\" stroke-width=\"{}\"/>",
                n(s.x),
                n(row.y),
                n(x2),
                n(row.y),
                n(sw)
            ));
            continue;
        }
        let fill = g(&row.p, "fill").or(if row.kind == RowKind::Head {
            Some(g(p, "head.fill").unwrap_or("ink/0.06"))
        } else {
            None
        });
        if set_not_none(fill) {
            out.push(format!(
                "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{}\"/>",
                n(s.x + sw / 2.0),
                n(row.y),
                n(s.w - sw),
                n(row.h - if i == rows.len() - 1 { sw / 2.0 } else { 0.0 }),
                col(look, fill, g(p, "fill"))
            ));
        }
        if i > 0 && rows[i - 1].kind != RowKind::Rule && g(p, "rules") != Some("0") {
            out.push(format!(
                "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{rule}\" stroke-width=\"0.8\"/>",
                n(s.x),
                n(row.y),
                n(x2),
                n(row.y)
            ));
        }
        for (j, cell) in row.cells.iter().enumerate() {
            let Some(c) = cols.get(j) else { continue };
            // one cell can have its own tint and text colour: fill.2=accent/0.2 color.2=accent (columns count from 1)
            let cf = g(&row.p, &format!("fill.{}", j + 1));
            let cc = g(&row.p, &format!("color.{}", j + 1));
            let gap = num(g(p, "cell.gap"), 16.0);
            if set_not_none(cf) {
                let x0 = if j == 0 {
                    s.x + sw / 2.0
                } else {
                    s.x + c.x - gap / 2.0
                };
                let x1 = if j == cols.len() - 1 {
                    x2 - sw / 2.0
                } else {
                    s.x + cols[j + 1].x - gap / 2.0
                };
                out.push(format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{}\"/>",
                    n(r2(x0)),
                    n(row.y),
                    n(r2(x1 - x0)),
                    n(row.h),
                    col(look, cf, g(p, "fill"))
                ));
            }
            if cell.is_empty() {
                continue;
            }
            let base = if row.kind == RowKind::Head {
                &strong
            } else if j == 0 {
                &first
            } else {
                &rest
            };
            // a replacer function, never a replacement string: "$'" and "$`" in a colour from the file must stay plain text
            let a = if truthy(cc) {
                replace_first(
                    fill_re(),
                    &base.a,
                    &format!("fill=\"{}\"", col(look, cc, None)),
                )
            } else {
                base.a.clone()
            };
            let mid = center && j > 0;
            out.push(format!(
                "<text x=\"{}\" y=\"{}\"{} {a}>{}</text>",
                n(r2(s.x + c.x + if mid { c.w / 2.0 } else { 0.0 })),
                n(r2(row.y + row.h / 2.0 + base.size * 0.36)),
                if mid { " text-anchor=\"middle\"" } else { "" },
                esc(cell)
            ));
        }
    }
    if g(p, "grid") == Some("1") && !rows.is_empty() {
        for c in cols.iter().skip(1) {
            let gx = r2(s.x + c.x - num(g(p, "cell.gap"), 16.0) / 2.0);
            out.push(format!(
                "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{rule}\" stroke-width=\"0.8\"/>",
                n(gx),
                n(s.y + head_h),
                n(gx),
                n(s.y + s.h)
            ));
        }
    }
    let mut border = format!("fill=\"none\" stroke=\"{stroke}\"");
    if set_not_none(g(p, "stroke")) {
        border += &format!(" stroke-width=\"{}\"", n(sw));
    }
    if set_not_none(g(p, "dash")) {
        border += &format!(" stroke-dasharray=\"{}\"", esc(g(p, "dash").unwrap()));
    }
    let rough = cx.rough_of(p);
    out.push(if nz(rough) {
        sketch_svg(&rect_d(s.x, s.y, s.w, s.h, r), &border, rough, "")
    } else {
        format!("{} {border}/>", table_rect(s, r))
    });
    out.extend(overlay(look, s));
    out.join("\n")
}

/// Where a shape's icon goes and how far it pushes the text.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IconBox {
    pub x: f64,
    pub y: f64,
    pub size: f64,
    pub dx: f64,
    pub dy: f64,
}

// Where a shape's icon goes and how far it pushes the text. Shared with the checker.
pub fn icon_box(s: &Shape) -> Option<IconBox> {
    let p = &s.p;
    if !set_not_none(g(p, "icon")) {
        return None;
    }
    let has_text =
        (truthy(s.text.as_deref()) || truthy(g(p, "sub"))) && g(p, "title.pos") != Some("top");
    let size = num(
        g(p, "icon.size"),
        if has_text {
            20.0
        } else {
            js::max(
                8.0,
                mins(&[s.w, s.h, 96.0]) - if s.style == "icon" { 0.0 } else { 16.0 },
            )
        },
    );
    if !has_text {
        return Some(IconBox {
            x: s.x + (s.w - size) / 2.0,
            y: s.y + (s.h - size) / 2.0,
            size,
            dx: 0.0,
            dy: 0.0,
        });
    }
    if g(p, "icon.pos") == Some("top") {
        // y set by the caller from the text block
        return Some(IconBox {
            x: s.x + (s.w - size) / 2.0,
            y: 0.0,
            size,
            dx: 0.0,
            dy: (size + 6.0) / 2.0,
        });
    }
    let align = g(p, "title.align");
    if align == Some("left") || align == Some("right") {
        return Some(IconBox {
            x: s.x + 12.0,
            y: s.y + (s.h - size) / 2.0,
            size,
            dx: (size + 8.0) / 2.0,
            dy: 0.0,
        });
    }
    // centred text: the icon sits right beside it, and the pair is centred in the box
    let mut widths = Vec::new();
    if let Some(text) = s.text.as_deref().filter(|t| !t.is_empty()) {
        for l in text.split('\n') {
            let l = if g(p, "title.caps") == Some("1") {
                l.to_uppercase()
            } else {
                l.to_string()
            };
            widths.push(text_width(
                &l,
                num(g(p, "title.size"), 12.0),
                g(p, "title.font").unwrap_or("sans"),
                num(g(p, "title.weight"), 600.0),
                num(g(p, "title.spacing"), 0.0),
            ));
        }
    }
    if let Some(sub) = g(p, "sub").filter(|t| !t.is_empty()) {
        for l in sub.split('\n') {
            widths.push(text_width(
                l,
                num(g(p, "sub.size"), 9.0),
                g(p, "sub.font").unwrap_or("mono"),
                400.0,
                0.0,
            ));
        }
    }
    let tw = widths.iter().fold(0.0, |a, &b| js::max(a, b));
    let x = js::max(s.x + 8.0, s.x + (s.w - (size + 8.0 + tw)) / 2.0);
    Some(IconBox {
        x,
        y: s.y + (s.h - size) / 2.0,
        size,
        dx: (size + 8.0) / 2.0,
        dy: 0.0,
    })
}

// A built-in icon (Phosphor) is drawn in icon.color, as an outline (the default), solid, or duotone: the
// outline over a tint, which is icon.fill when set and a light shade of icon.color otherwise. An outline
// with icon.fill gets the same tint under it. icon.width picks the outline's weight (thin, light, regular,
// bold) nearest that line thickness, in pixels at the size the icon is drawn.
// A look's own icon is an outline in a 24 box, drawn with icon.color as its line, icon.fill inside its
// closed parts, and icon.width as the line's thickness; it has no solid or duotone version.
fn draw_icon(look: &Look, p: &Props, x: f64, y: f64, size: f64) -> String {
    let name = g(p, "icon").unwrap_or("");
    // an icon file is shown as an image, in its own colours; it is never inlined
    if let Some(img) = look.images.get(name).filter(|i| !i.is_empty()) {
        return if is_icon_uri(img) {
            format!(
                "<image x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" href=\"{}\"/>",
                n(r2(x)),
                n(r2(y)),
                n(r2(size)),
                n(r2(size)),
                esc(img)
            )
        } else {
            String::new()
        };
    }
    let ink = col(
        look,
        Some(g(p, "icon.color").or(g(p, "title.color")).unwrap_or("ink")),
        None,
    );
    let own_fill = set_not_none(g(p, "icon.fill")).then(|| col(look, g(p, "icon.fill"), None));
    let px = num(g(p, "icon.width"), 0.0);
    if is_built_in(look, name) {
        let style = match g(p, "icon.style") {
            Some("solid") => IconStyle::Solid,
            Some("duotone") => IconStyle::Duotone,
            _ => IconStyle::Outline,
        };
        let (tint, front) = icon_layers(
            name,
            style,
            weight_for((px > 0.0).then(|| (px * ICON_BOX) / size)),
        );
        let under = match style {
            IconStyle::Duotone => Some(own_fill.clone().unwrap_or_else(|| ink.clone())),
            IconStyle::Outline => own_fill.clone(),
            IconStyle::Solid => None,
        };
        let tint_paths: String = match under.filter(|u| !u.is_empty()) {
            Some(under) => tint
                .iter()
                .map(|d| {
                    format!(
                        "<path d=\"{}\" fill=\"{under}\"{}/>",
                        esc(d),
                        if own_fill.is_some() {
                            ""
                        } else {
                            " fill-opacity=\"0.2\""
                        }
                    )
                })
                .collect(),
            None => String::new(),
        };
        let front: String = front
            .iter()
            .map(|d| format!("<path d=\"{}\"/>", esc(d)))
            .collect();
        return format!(
            "<g transform=\"translate({} {}) scale({})\">{tint_paths}<g fill=\"{ink}\">{front}</g></g>",
            n(r2(x)),
            n(r2(y)),
            n(to_number(&to_fixed(size / ICON_BOX, 5)))
        );
    }
    let k = r2(size / 24.0);
    let fill = own_fill.unwrap_or_else(|| "none".to_string());
    let sw = if px > 0.0 {
        js::min(px, 8.0) / k
    } else {
        js::max(1.5, 1.2 / k)
    };
    let paths: String = look
        .icons
        .get(name)
        .unwrap_or(&[])
        .iter()
        .map(|d| format!("<path d=\"{}\"/>", esc(d)))
        .collect();
    format!(
        "<g transform=\"translate({} {}) scale({})\" fill=\"{fill}\" stroke=\"{ink}\" stroke-width=\"{}\" stroke-linecap=\"round\" stroke-linejoin=\"round\">{paths}</g>",
        n(r2(x)),
        n(r2(y)),
        n(k),
        n(r2(sw))
    )
}

// An icon that is the shape itself, with no box around it: fill=, stroke= and sw= style the icon,
// and its text is a caption centred underneath (captionBox in scene.ts measures it the same way).
fn draw_icon_shape(look: &Look, s: &Shape) -> String {
    let p = &s.p;
    let size = js::min(s.w, s.h);
    let mut out = Vec::new();
    let mut ip = p.clone();
    ip.insert(
        "icon.fill".into(),
        g(p, "fill")
            .or(g(p, "icon.fill"))
            .unwrap_or("none")
            .to_string(),
    );
    ip.insert(
        "icon.color".into(),
        g(p, "stroke")
            .or(g(p, "icon.color"))
            .unwrap_or("ink")
            .to_string(),
    );
    ip.insert(
        "icon.width".into(),
        g(p, "sw").or(g(p, "icon.width")).unwrap_or("").to_string(),
    );
    if set_not_none(g(p, "icon")) {
        out.push(draw_icon(
            look,
            &ip,
            s.x + (s.w - size) / 2.0,
            s.y + (s.h - size) / 2.0,
            size,
        ));
    }
    let cx = s.x + s.w / 2.0;
    let mut y = s.y + s.h + ICON_CAPTION_GAP;
    if let Some(text) = s.text.as_deref().filter(|t| !t.is_empty()) {
        let t = text_attrs(look, p, "title.", &td("sans", 11.0, 600.0, "ink"));
        let lh = round(t.size * 1.17);
        let text = if g(p, "title.caps") == Some("1") {
            text.to_uppercase()
        } else {
            text.to_string()
        };
        for l in text.split('\n') {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
                n(cx),
                n(r2(y + t.size * 0.86)),
                t.a,
                esc(l)
            ));
            y += lh;
        }
    }
    if let Some(sub) = g(p, "sub").filter(|t| !t.is_empty()) {
        let t = text_attrs(look, p, "sub.", &td("mono", 9.0, 400.0, "muted"));
        let lh = round(t.size * 1.3);
        y += 2.0;
        for l in sub.split('\n') {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
                n(cx),
                n(r2(y + t.size * 0.86)),
                t.a,
                esc(l)
            ));
            y += lh;
        }
    }
    out.join("\n")
}

fn draw_shape(cx: &mut RenderCtx, look: &Look, s: &Shape) -> String {
    static OFFSET: OnceLock<Regex> = OnceLock::new();
    match s.shape.as_str() {
        "legend" => return draw_legend(cx, look, s),
        "table" => return draw_table(cx, look, s),
        "chart" => return draw_chart(look, s),
        "icon" => return draw_icon_shape(look, s),
        _ => {}
    }
    let p = &s.p;
    let mut out: Vec<String> = Vec::new();
    let paper = col(look, Some(paper_of(look)), None);
    out.extend(underlay(cx, look, s));
    if !s.back && g(p, "mask") != Some("0") && set_not_none(g(p, "fill")) {
        out.push(outline(cx, s, &format!("fill=\"{paper}\""), None));
    }
    let under = match cx.hatch_fill(look, p) {
        Some(h) => Some(h),
        None => cx.dot_fill(look, p),
    };
    // offset=dx,dy prints the fill out of register with the outline; blend=multiply lets inks overprint
    let off = re(
        &OFFSET,
        r"^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$",
    )
    .captures(g(p, "offset").unwrap_or(""));
    let blend = blend_of(p);
    if off.is_some() || !blend.is_empty() {
        let f = match &off {
            Some(m) => shifted(s, to_number(&m[1]), to_number(&m[2])),
            None => s.clone(),
        };
        if set_not_none(g(p, "fill")) {
            out.push(outline_plain(
                &f,
                &format!(
                    "fill=\"{}\" stroke=\"none\"{blend}",
                    col(look, g(p, "fill"), None)
                ),
            ));
        }
        if let Some(u) = &under {
            out.push(outline_plain(
                &f,
                &format!("fill=\"{u}\" stroke=\"none\"{blend}"),
            ));
        }
        out.push(outline(
            cx,
            s,
            &stroke_attrs(look, &with(p, "fill", "none".into())),
            None,
        ));
    } else {
        out.push(outline(cx, s, &stroke_attrs(look, p), under.as_deref()));
    }
    out.extend(overlay(look, s));
    let mut cxm = s.x + s.w / 2.0;
    let mut cym = s.y + s.h / 2.0;
    if s.shape == "polygon"
        && let Some(poly) = &s.poly
        && g(p, "open") != Some("1")
    {
        // text sits at the centre of the outline's area, so it lands in the wide part of a triangle
        let (mut a, mut gx, mut gy) = (0.0, 0.0, 0.0);
        for (i, q) in poly.iter().enumerate() {
            let nx = poly[(i + 1) % poly.len()];
            let k = q.x * nx.y - nx.x * q.y;
            a += k;
            gx += (q.x + nx.x) * k;
            gy += (q.y + nx.y) * k;
        }
        if f64::abs(a) > 1.0 {
            cxm = r2(gx / (3.0 * a));
            cym = r2(gy / (3.0 * a));
        }
    }
    if s.shape == "arc" && (num(g(p, "to"), 360.0) - num(g(p, "from"), 0.0)).abs() < 360.0 {
        // text sits in the middle of the slice, not the middle of the whole circle
        let mid = ((num(g(p, "from"), 0.0) + num(g(p, "to"), 360.0)) / 2.0)
            * (std::f64::consts::PI / 180.0);
        let inner = num(g(p, "inner"), 0.0);
        let k = if inner > 0.0 {
            (1.0 + inner) / 2.0
        } else {
            0.62
        };
        cxm = r2(cxm + (s.w / 2.0) * k * js::sin(mid));
        cym = r2(cym - (s.h / 2.0) * k * js::cos(mid));
    }
    if let Some(ghost) = g(p, "ghost").filter(|v| !v.is_empty()) {
        let t = text_attrs(look, p, "ghost.", &td("mono", 32.0, 600.0, "ink/0.06"));
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" text-anchor=\"end\" {}>{}</text>",
            n(s.x + s.w - 8.0),
            n(s.y + s.h - 4.0),
            t.a,
            esc(ghost)
        ));
    }
    let title = text_attrs(look, p, "title.", &td("sans", 12.0, 600.0, "ink"));
    let mut tb = if truthy(g(p, "tag")) {
        Some(tag_layout(
            s,
            look,
            text_block(s, title.size),
            title.size,
            cym + icon_box(s).map_or(0.0, |b| b.dy),
        ))
    } else {
        None
    };
    // with a caption across the top (a zone's), the tag sits on the caption's row at its left end, and a
    // left-aligned caption starts after it, so the two never overlap
    let cap_top = truthy(s.text.as_deref()) && g(p, "title.pos") == Some("top");
    let cap_own = g(p, "title.dy").is_some() || g(p, "title.fill").is_some();
    let cap_h = if cap_own {
        js::max(12.0, (title.size + 4.0).ceil())
    } else {
        12.0
    };
    let cap_y = num(g(p, "title.dy"), 0.0) + 4.0;
    if cap_top && let Some(t) = &mut tb {
        t.x = 12.0;
        t.y = cap_y + round((cap_h - t.h) / 2.0);
    }
    let tag_room = if tb.is_some() && cap_top {
        tag_width(look, p) + 4.0
    } else {
        0.0
    };
    if let Some(tb) = &tb {
        let t = text_attrs(look, p, "tag.", &td("mono", 7.0, 400.0, "muted"));
        let tw = tag_width(look, p);
        out.push(format!(
            "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"2\" fill=\"none\" stroke=\"{}\" stroke-width=\"0.8\"/>",
            n(s.x + tb.x),
            n(s.y + tb.y),
            n(tw),
            n(tb.h),
            col(look, Some(g(p, "tag.border").unwrap_or("muted/0.4")), None)
        ));
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
            n(s.x + tb.x + tw / 2.0),
            n(r2(s.y + tb.y + tb.h / 2.0 + t.size * 0.36)),
            t.a,
            esc(g(p, "tag").unwrap())
        ));
    }
    let ib = icon_box(s);
    if let Some(ib) = &ib {
        cxm += ib.dx;
        cym += ib.dy;
        // an icon on top waits for the text block (a NaN dy draws it here, as `!(ib.dy > 0)` does)
        let on_top = ib.dy > 0.0;
        if !on_top {
            out.push(draw_icon(look, p, ib.x, ib.y, ib.size));
        }
    }
    if let Some(text) = s.text.as_deref().filter(|t| !t.is_empty())
        && g(p, "title.pos") == Some("top")
    {
        let txt = if g(p, "title.caps") == Some("1") {
            text.to_uppercase()
        } else {
            text.to_string()
        };
        // the plate is the text as drawn in the look's font plus 6px either side
        let tw = (measure_text(
            look,
            &txt,
            title.size,
            &title.font,
            title.weight,
            title.spacing,
        ) + 12.0)
            .ceil();
        // a caption on the top edge: centred, or at the left or right corner with title.align
        let al = g(p, "title.align");
        let mid = if al == Some("left") {
            s.x + 12.0 + tag_room + tw / 2.0
        } else if al == Some("right") {
            s.x + s.w - 12.0 - tw / 2.0
        } else {
            cxm
        };
        // title.dy moves the caption off the edge and title.fill colours its plate (none for no plate); a look that
        // sets either gets a plate sized to its type, the others keep the 12px plate they have always had
        let own = cap_own;
        let ty = s.y + num(g(p, "title.dy"), 0.0);
        let th = if own {
            js::max(12.0, (title.size + 4.0).ceil())
        } else {
            12.0
        };
        // A plate that crosses the outline is paper, so the edge stops at the words. One that sits inside the
        // shape is the shape's own fill laid over paper, so it reads as the shape and only keeps the page's
        // dots and hatching off the text.
        if g(p, "title.fill") != Some("none") {
            let rect = |fill: &str| {
                format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"2\" fill=\"{fill}\"/>",
                    n(r2(mid - tw / 2.0)),
                    n(ty + 4.0),
                    n(tw),
                    n(th)
                )
            };
            out.push(rect(&col(
                look,
                Some(g(p, "title.fill").unwrap_or(paper_of(look))),
                None,
            )));
            let inside = g(p, "title.fill").is_none()
                && ty + 4.0 >= s.y + num(g(p, "sw"), 1.0) / 2.0
                && !truthy(g(p, "offset"))
                && blend.is_empty();
            if inside && set_not_none(g(p, "fill")) {
                out.push(rect(&col(look, g(p, "fill"), None)));
            }
        }
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
            n(mid),
            n(if own {
                r2(ty + 4.0 + th / 2.0 + title.size * 0.36)
            } else {
                s.y + 13.0
            }),
            title.a,
            esc(&txt)
        ));
    } else if truthy(s.text.as_deref()) || truthy(g(p, "sub")) {
        let lines: Vec<String> = match s.text.as_deref().filter(|t| !t.is_empty()) {
            Some(text) => {
                let text = if g(p, "title.caps") == Some("1") {
                    text.to_uppercase()
                } else {
                    text.to_string()
                };
                text.split('\n').map(str::to_string).collect()
            }
            None => Vec::new(),
        };
        let lh = round(title.size * 1.17);
        let sub = text_attrs(look, p, "sub.", &td("mono", 9.0, 400.0, "muted"));
        let subs: Vec<&str> = g(p, "sub")
            .filter(|t| !t.is_empty())
            .map_or_else(Vec::new, |t| t.split('\n').collect());
        let slh = round(sub.size * 1.3);
        let block = lines.len() as f64 * lh
            + if subs.is_empty() {
                0.0
            } else {
                sub.size + 7.0 + (subs.len() as f64 - 1.0) * slh
            };
        // centred a little low under a corner tag, and never closer than 3px below it
        let top = tb.as_ref().map_or(cym - block / 2.0, |t| t.top);
        if let Some(ib) = &ib
            && ib.dy > 0.0
        {
            out.push(draw_icon(look, p, ib.x, top - ib.size - 6.0, ib.size));
        }
        let al = g(p, "title.align");
        let tx = if al == Some("left") {
            s.x + 12.0
                + match &ib {
                    Some(ib) if nz(ib.dx) => ib.size + 8.0,
                    _ => 0.0,
                }
        } else if al == Some("right") {
            s.x + s.w - 12.0
        } else {
            cxm
        };
        let anchor = if al == Some("left") {
            "start"
        } else if al == Some("right") {
            "end"
        } else {
            "middle"
        };
        for (i, l) in lines.iter().enumerate() {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"{anchor}\" {}>{}</text>",
                n(tx),
                n(r2(top + title.size * 0.86 + i as f64 * lh)),
                title.a,
                esc(l)
            ));
        }
        for (i, l) in subs.iter().enumerate() {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"{anchor}\" {}>{}</text>",
                n(tx),
                n(r2(top
                    + lines.len() as f64 * lh
                    + sub.size
                    + 3.0
                    + i as f64 * slh)),
                sub.a,
                esc(l)
            ));
        }
    }
    out.join("\n")
}

fn path_d(pts: &[Pt], radius: f64, trim_end: f64, trim_start: f64) -> String {
    let mut pp: Vec<Pt> = pts.to_vec();
    let trim = |pp: &mut Vec<Pt>, i: usize, j: usize, by: f64| {
        let dx = pp[j].x - pp[i].x;
        let dy = pp[j].y - pp[i].y;
        let len = hypot(&[dx, dy]);
        if len > by + 1.0 {
            pp[i].x += (dx / len) * by;
            pp[i].y += (dy / len) * by;
        }
    };
    if nz(trim_end) {
        let l = pp.len();
        trim(&mut pp, l - 1, l - 2, trim_end);
    }
    if nz(trim_start) {
        trim(&mut pp, 0, 1, trim_start);
    }
    let mut d = format!("M {},{}", n(r2(pp[0].x)), n(r2(pp[0].y)));
    for i in 1..pp.len() {
        let (cur, prev) = (pp[i], pp[i - 1]);
        let next = pp.get(i + 1).copied();
        let Some(next) = next.filter(|_| nz(radius)) else {
            d += &format!(" L {},{}", n(r2(cur.x)), n(r2(cur.y)));
            continue;
        };
        let l1 = hypot(&[cur.x - prev.x, cur.y - prev.y]);
        let l2 = hypot(&[next.x - cur.x, next.y - cur.y]);
        let r = mins(&[radius, l1 / 2.0, l2 / 2.0]);
        let a = Pt {
            x: cur.x - ((cur.x - prev.x) / l1) * r,
            y: cur.y - ((cur.y - prev.y) / l1) * r,
        };
        let b = Pt {
            x: cur.x + ((next.x - cur.x) / l2) * r,
            y: cur.y + ((next.y - cur.y) / l2) * r,
        };
        d += &format!(
            " L {},{} Q {},{} {},{}",
            n(r2(a.x)),
            n(r2(a.y)),
            n(cur.x),
            n(cur.y),
            n(r2(b.x)),
            n(r2(b.y))
        );
    }
    d
}

// How tall a shape's title and sub lines are together.
pub fn text_block(s: &Shape, title_size: f64) -> f64 {
    let p = &s.p;
    let sub_size = num(g(p, "sub.size"), 9.0);
    let subs = g(p, "sub")
        .filter(|t| !t.is_empty())
        .map_or(0, |t| t.split('\n').count());
    let lines = s
        .text
        .as_deref()
        .filter(|t| !t.is_empty())
        .map_or(0, |t| t.split('\n').count());
    lines as f64 * round(title_size * 1.17)
        + if subs > 0 {
            sub_size + 7.0 + (subs as f64 - 1.0) * round(sub_size * 1.3)
        } else {
            0.0
        }
}

/// Where a corner tag and the text under it sit on a shape (`tagLayout`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TagLayout {
    pub x: f64,
    pub h: f64,
    pub y: f64,
    pub top: f64,
    pub fits: bool,
}

// Where a corner tag and the text under it sit on a shape. The tag keeps clear of the outline (further
// from a hand-drawn one, whose wobble would touch it) and is as tall as its text needs; the text block
// sits a little below centre, moved down to start 3px under the tag. A box short of room first gives up
// some margin (the tag 2px higher, the text 2px nearer the bottom); fits says whether that was enough.
pub fn tag_layout(s: &Shape, look: &Look, block: f64, title_size: f64, cym: f64) -> TagLayout {
    let p = &s.p;
    let rough = if g(p, "sketch") == Some("0") {
        0.0
    } else {
        js::max(0.0, js::min(num(g(&look.canvas, "sketch"), 0.0), 4.0))
    };
    let x = 8.0 + if nz(rough) { 2.0 } else { 0.0 };
    let h = js::max(12.0, (num(g(p, "tag.size"), 7.0) + 4.0).ceil());
    let glyph = title_size * 0.14;
    // on a shape that is not a box (a cylinder's cap, an ellipse, a diamond) the tag moves down off the outline
    let below = outline_clear(s, x, tag_width(look, p), h, 6.0, 3.0 + rough);
    let at = |y: f64, pad: f64| {
        let clear = s.y + y + h + 3.0 - glyph;
        let floor = s.y + s.h - pad - block;
        TagLayout {
            x,
            h,
            y,
            top: js::min(
                js::max(cym - block / 2.0 + 8.0, clear),
                js::max(floor, cym - block / 2.0),
            ),
            fits: clear <= floor + 0.5,
        }
    };
    let roomy = at(js::max(8.0, below), 4.0);
    let tight = if roomy.fits {
        roomy
    } else {
        at(js::max(6.0, below), 2.0)
    };
    if !roomy.fits && !tight.fits {
        // the centred lines level with the tag start right of it: the two never touch, so the text keeps its place
        let y = js::max(8.0, below);
        let top = js::min(
            cym - block / 2.0 + 8.0,
            js::max(s.y + s.h - 4.0 - block, cym - block / 2.0),
        );
        if beside_tag(
            s,
            look,
            x + tag_width(look, p),
            s.y + y - 2.0,
            s.y + y + h + 2.0,
            top,
        ) {
            return TagLayout {
                x,
                h,
                y,
                top,
                fits: true,
            };
        }
    }
    if tight.fits { tight } else { roomy }
}

// Whether every line of a shape's centred text that is level with y0..y1 starts at least 2px right of
// `right` (measured from the shape's left), with the text block starting at `top`.
fn beside_tag(s: &Shape, look: &Look, right: f64, y0: f64, y1: f64, top: f64) -> bool {
    let p = &s.p;
    if truthy(g(p, "title.align")) || truthy(g(p, "icon")) {
        return false;
    }
    let title = text_attrs(look, p, "title.", &td("sans", 12.0, 600.0, "ink"));
    let sub = text_attrs(look, p, "sub.", &td("mono", 9.0, 400.0, "muted"));
    let lines: Vec<String> = match s.text.as_deref().filter(|t| !t.is_empty()) {
        Some(text) => {
            let text = if g(p, "title.caps") == Some("1") {
                text.to_uppercase()
            } else {
                text.to_string()
            };
            text.split('\n').map(str::to_string).collect()
        }
        None => Vec::new(),
    };
    let lh = round(title.size * 1.17);
    let slh = round(sub.size * 1.3);
    let subs: Vec<&str> = g(p, "sub")
        .filter(|t| !t.is_empty())
        .map_or_else(Vec::new, |t| t.split('\n').collect());
    // each line's ink, from its cap top to just under its baseline
    let mut rows: Vec<(f64, f64, f64)> = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        rows.push((
            text_width(l, title.size, &title.font, title.weight, title.spacing),
            top + i as f64 * lh + title.size * 0.14,
            top + i as f64 * lh + title.size * 1.05,
        ));
    }
    for (i, l) in subs.iter().enumerate() {
        let base = top + lines.len() as f64 * lh + sub.size + 3.0 + i as f64 * slh;
        rows.push((
            text_width(l, sub.size, &sub.font, 400.0, sub.spacing),
            base - sub.size * 0.75,
            base + sub.size * 0.2,
        ));
    }
    rows.iter()
        .all(|&(w, a, b)| b < y0 || a > y1 || s.w / 2.0 - w / 2.0 >= right + 2.0)
}

// How wide a shape's corner tag is.
pub fn tag_width(look: &Look, p: &Props) -> f64 {
    let t = text_attrs(look, p, "tag.", &td("mono", 7.0, 400.0, "muted"));
    ((text_width(g(p, "tag").unwrap_or(""), t.size, &t.font, 400.0, t.spacing) + 12.0) / 4.0).ceil()
        * 4.0
}

/// The box `outlinePts` keeps points inside.
struct Near {
    x0: f64,
    x1: f64,
    y0: f64,
    y1: f64,
}

// Points along a shape's outline that fall inside the box `near`, relative to the shape's top-left corner; None
// for a plain box. A diagram file is untrusted and a shape can be any size, so an edge is sampled at most
// EDGE_SAMPLES times and only the points the caller can use are kept: neither the work nor the memory grows
// with the size of the shape.
const EDGE_SAMPLES: f64 = 20000.0;
fn outline_pts(s: &Shape, near: &Near) -> Option<Vec<Pt>> {
    static TOK: OnceLock<Regex> = OnceLock::new();
    let (w, h) = (s.w, s.h);
    let mut out: Vec<Pt> = Vec::new();
    let line = |out: &mut Vec<Pt>, a: Pt, b: Pt| {
        if js::max(a.x, b.x) < near.x0
            || js::min(a.x, b.x) > near.x1
            || js::max(a.y, b.y) < near.y0
            || js::min(a.y, b.y) > near.y1
        {
            return;
        }
        let cnt = js::min(
            EDGE_SAMPLES,
            js::max(1.0, (hypot(&[b.x - a.x, b.y - a.y]) / 2.0).ceil()),
        );
        let mut i = 0.0;
        while i <= cnt {
            let q = Pt {
                x: a.x + ((b.x - a.x) * i) / cnt,
                y: a.y + ((b.y - a.y) * i) / cnt,
            };
            if q.x >= near.x0 && q.x <= near.x1 && q.y >= near.y0 && q.y <= near.y1 {
                out.push(q);
            }
            i += 1.0;
        }
    };
    let ring = |out: &mut Vec<Pt>, c: &[Pt]| {
        for (i, &a) in c.iter().enumerate() {
            line(out, a, c[(i + 1) % c.len()]);
        }
    };
    match s.shape.as_str() {
        "ellipse" => {
            for i in 0..180 {
                let t = (f64::from(i) / 180.0) * 2.0 * std::f64::consts::PI;
                out.push(Pt {
                    x: w / 2.0 + (w / 2.0) * js::cos(t),
                    y: h / 2.0 + (h / 2.0) * js::sin(t),
                });
            }
            Some(out)
        }
        "diamond" => {
            let c = [
                Pt { x: w / 2.0, y: 0.0 },
                Pt { x: w, y: h / 2.0 },
                Pt { x: w / 2.0, y: h },
                Pt { x: 0.0, y: h / 2.0 },
            ];
            ring(&mut out, &c);
            Some(out)
        }
        "polygon" if s.poly.is_some() => {
            let c: Vec<Pt> = s
                .poly
                .as_ref()
                .unwrap()
                .iter()
                .map(|q| Pt {
                    x: q.x - s.x,
                    y: q.y - s.y,
                })
                .collect();
            ring(&mut out, &c);
            Some(out)
        }
        "path" if truthy(g(&s.p, "path")) => {
            // path data in 0..1 of the box, absolute M L C Z, as looks write it
            let tok: Vec<&str> = re(&TOK, r"(?i)[MLCZ]|-?[0-9]*\.?[0-9]+")
                .find_iter(g(&s.p, "path").unwrap())
                .map(|m| m.as_str())
                .collect();
            let mut cmd = "M".to_string();
            let mut cur = Pt { x: 0.0, y: 0.0 };
            let mut start = cur;
            let mut i = 0usize;
            // `+tok[i++]`: past the end it is undefined, which is NaN
            let pt = |i: &mut usize| {
                let mut next = || {
                    let v = tok.get(*i).map_or(f64::NAN, |t| to_number(t));
                    *i += 1;
                    v
                };
                let x = next() * w;
                let y = next() * h;
                Pt { x, y }
            };
            while i < tok.len() {
                if tok[i].chars().any(|c| c.is_ascii_alphabetic()) {
                    cmd = tok[i].to_uppercase();
                    i += 1;
                    if cmd == "Z" {
                        line(&mut out, cur, start);
                        cur = start;
                    }
                    continue;
                }
                match cmd.as_str() {
                    "M" => {
                        cur = pt(&mut i);
                        start = cur;
                        cmd = "L".to_string();
                    }
                    "L" => {
                        let b = pt(&mut i);
                        line(&mut out, cur, b);
                        cur = b;
                    }
                    "C" => {
                        let c1 = pt(&mut i);
                        let c2 = pt(&mut i);
                        let b = pt(&mut i);
                        let mut prev = cur;
                        for k in 1..=24 {
                            let t = f64::from(k) / 24.0;
                            let m = 1.0 - t;
                            let q = Pt {
                                x: m * m * m * cur.x
                                    + 3.0 * m * m * t * c1.x
                                    + 3.0 * m * t * t * c2.x
                                    + t * t * t * b.x,
                                y: m * m * m * cur.y
                                    + 3.0 * m * m * t * c1.y
                                    + 3.0 * m * t * t * c2.y
                                    + t * t * t * b.y,
                            };
                            line(&mut out, prev, q);
                            prev = q;
                        }
                        cur = b;
                    }
                    _ => i += 1,
                }
            }
            Some(out)
        }
        _ => None,
    }
}

// The smallest top offset, from `from`, at which a tag of w x h at left offset x keeps `gap` clear of
// the shape's outline (0 for a plain box, which has nothing inside to avoid).
// The search goes at most CLEAR_SEARCH pixels down: a tag that has not found room by then is not going to sit in
// its corner anyway, and the search must not grow with the height of the shape.
const CLEAR_SEARCH: f64 = 400.0;
fn outline_clear(s: &Shape, x: f64, w: f64, h: f64, from: f64, gap: f64) -> f64 {
    let end = js::min(s.h / 2.0, from + CLEAR_SEARCH);
    let Some(pts) = outline_pts(
        s,
        &Near {
            x0: x - gap,
            x1: x + w + gap,
            y0: from - gap,
            y1: end + h + gap,
        },
    ) else {
        return 0.0;
    };
    let mut y = from;
    while y < end {
        if !pts
            .iter()
            .any(|q| q.x > x - gap && q.x < x + w + gap && q.y > y - gap && q.y < y + h + gap)
        {
            return y;
        }
        y += 1.0;
    }
    0.0
}

// An end marker drawn at tip, pointing away from `from`. The second value (trim) is how much of the line to cut
// back so it does not show through the marker.
#[allow(clippy::too_many_arguments)]
fn marker(
    cx: &RenderCtx,
    kind: &str,
    tip: Pt,
    from: Pt,
    sw: f64,
    stroke: &str,
    paper: &str,
    k: f64,
    ring2: &str,
) -> (String, f64) {
    let dx = tip.x - from.x;
    let dy = tip.y - from.y;
    let len = hypot(&[dx, dy]);
    let len = if nz(len) { len } else { 1.0 };
    let ux = dx / len;
    let uy = dy / len;
    // heads are one size whatever the line's weight, so a bold line and a thin one in the same diagram
    // carry the same arrow
    // a point `back` along the line from the tip and `side` across it
    let at = |back: f64, side: f64| {
        format!(
            "{},{}",
            n(r2(tip.x - ux * back - uy * side)),
            n(r2(tip.y - uy * back + ux * side))
        )
    };
    let swn = n(sw);
    let line = format!(
        "fill=\"none\" stroke=\"{stroke}\" stroke-width=\"{swn}\" stroke-linecap=\"round\" stroke-linejoin=\"round\""
    );
    let hollow = format!(
        "fill=\"{paper}\" stroke=\"{stroke}\" stroke-width=\"{swn}\" stroke-linejoin=\"round\""
    );
    let bar = |b: f64| format!("<path d=\"M {} L {}\" {line}/>", at(b, 6.0), at(b, -6.0));
    let ring = |b: f64, r: f64, a: &str| {
        format!(
            "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" {a}/>",
            n(r2(tip.x - ux * b)),
            n(r2(tip.y - uy * b)),
            n(r)
        )
    };
    let crow = || {
        format!(
            "<path d=\"M {} L {} L {}\" {line}/>",
            at(0.0, 6.0),
            at(12.0, 0.0),
            at(0.0, -6.0)
        )
    };
    if nz(cx.amt) && (kind == "arrow" || kind == "open") {
        // drawn by hand an arrowhead is two quick strokes, a little larger than the clean one
        let (b, w) = (13.0, 6.0);
        return (
            sketch_svg(
                &format!("M {} L {} L {}", at(b, w), at(0.0, 0.0), at(b, -w)),
                &format!("fill=\"none\" stroke=\"{stroke}\" stroke-width=\"{swn}\""),
                cx.amt * 0.6,
                "",
            ),
            0.0,
        );
    }
    match kind {
        "none" => (String::new(), 0.0),
        "open" => (
            format!(
                "<path d=\"M {} L {} L {}\" {line}/>",
                at(10.0 * k, 5.0 * k),
                at(0.0, 0.0),
                at(10.0 * k, -5.0 * k)
            ),
            0.0,
        ),
        "triangle" => (
            format!(
                "<polygon points=\"{} {} {}\" {hollow}/>",
                at(0.0, 0.0),
                at(11.0 * k, 6.0 * k),
                at(11.0 * k, -6.0 * k)
            ),
            11.0 * k,
        ),
        // a stop on a route: a ring the line runs into, in the colour of the boxes' outline
        "stop" => {
            let r = js::max(4.0, sw / 2.0 + 3.0);
            (
                format!(
                    "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{paper}\" stroke=\"{ring2}\" stroke-width=\"{}\"/>",
                    n(r2(tip.x)),
                    n(r2(tip.y)),
                    n(r),
                    n(js::max(2.0, r2(sw * 0.45)))
                ),
                0.0,
            )
        }
        "diamond" => (
            format!(
                "<polygon points=\"{} {} {} {}\" {hollow}/>",
                at(0.0, 0.0),
                at(8.0, 4.5),
                at(16.0, 0.0),
                at(8.0, -4.5)
            ),
            16.0,
        ),
        "diamond-solid" => (
            format!(
                "<polygon points=\"{} {} {} {}\" fill=\"{stroke}\" stroke=\"{stroke}\" stroke-width=\"{swn}\" stroke-linejoin=\"round\"/>",
                at(0.0, 0.0),
                at(8.0, 4.5),
                at(16.0, 0.0),
                at(8.0, -4.5)
            ),
            16.0,
        ),
        "dot" => (ring(3.5, 3.5, &format!("fill=\"{stroke}\"")), 3.5),
        "circle" => (ring(4.0, 4.0, &hollow), 8.0),
        "one" => (bar(8.0), 0.0),
        "only-one" => (bar(7.0) + &bar(12.0), 0.0),
        "many" => (crow(), 0.0),
        "one-many" => (crow() + &bar(16.0), 0.0),
        "zero-one" => (bar(8.0) + &ring(16.0, 4.0, &hollow), 0.0),
        "zero-many" => (crow() + &ring(17.0, 4.0, &hollow), 0.0),
        _ => (
            format!(
                "<polygon points=\"{} {} {}\" fill=\"{stroke}\"/>",
                at(0.0, 0.0),
                at(10.0 * k, 4.0 * k),
                at(10.0 * k, -4.0 * k)
            ),
            7.0 * k,
        ),
    }
}

// The point `dist` back along a polyline from its last point (or the first one, if it is the farthest).
fn back_along(pts: &[Pt], dist: f64) -> Pt {
    let mut left = dist;
    for i in (1..pts.len()).rev() {
        let (a, b) = (pts[i], pts[i - 1]);
        let l = hypot(&[a.x - b.x, a.y - b.y]);
        if l >= left {
            return Pt {
                x: a.x + ((b.x - a.x) / l) * left,
                y: a.y + ((b.y - a.y) / l) * left,
            };
        }
        left -= l;
    }
    pts[0]
}

// A polyline cut back by `dist` at its end, across as many steps as that takes.
fn cut_end(pts: Vec<Pt>, dist: f64) -> Vec<Pt> {
    if !nz(dist) {
        return pts;
    }
    let mut left = dist;
    for i in (1..pts.len()).rev() {
        let (a, b) = (pts[i], pts[i - 1]);
        let l = hypot(&[a.x - b.x, a.y - b.y]);
        if l > left {
            let mut out = pts[..i].to_vec();
            out.push(Pt {
                x: a.x + ((b.x - a.x) / l) * left,
                y: a.y + ((b.y - a.y) / l) * left,
            });
            return out;
        }
        left -= l;
    }
    pts[..pts.len().min(2)].to_vec()
}

fn draw_conn(cx: &RenderCtx, look: &Look, c: &Conn) -> String {
    let p = &c.p;
    let sw = num(g(p, "sw"), 1.2);
    let stroke = col(look, Some(g(p, "stroke").unwrap_or("muted")), None);
    let cnt = c.pts.len();
    let paper = col(look, Some(paper_of(look)), None);
    // a curve is many short steps: aim its ends along the last stretch of it, not the last step alone
    let h_from = if c.curve {
        back_along(&c.pts, 10.0)
    } else {
        c.pts[cnt - 2]
    };
    let t_from = if c.curve {
        let rev: Vec<Pt> = c.pts.iter().rev().copied().collect();
        back_along(&rev, 10.0)
    } else {
        c.pts[1]
    };
    // head.size scales the arrowhead (a wide line needs a wide head); stop.color is the ring of a stop marker
    let hk = js::max(0.5, js::min(num(g(p, "head.size"), 1.0), 4.0));
    let ring_col = col(
        look,
        Some(g(p, "stop.color").or(g(p, "stroke")).unwrap_or("muted")),
        None,
    );
    let head = marker(
        cx,
        &c.head_m,
        c.pts[cnt - 1],
        h_from,
        sw,
        &stroke,
        &paper,
        hk,
        &ring_col,
    );
    let tail = marker(
        cx, &c.tail_m, c.pts[0], t_from, sw, &stroke, &paper, hk, &ring_col,
    );
    let d = if c.curve {
        let mut v = cut_end(c.pts.clone(), head.1);
        v.reverse();
        let mut v = cut_end(v, tail.1);
        v.reverse();
        path_d(&v, 0.0, 0.0, 0.0)
    } else {
        path_d(
            &c.pts,
            if c.ortho {
                num(g(p, "radius"), 8.0)
            } else {
                0.0
            },
            head.1,
            tail.1,
        )
    };
    let cap = if g(p, "cap") == Some("round") {
        " stroke-linecap=\"round\" stroke-linejoin=\"round\""
    } else {
        ""
    };
    let a = format!(
        "fill=\"none\" stroke=\"{stroke}\" stroke-width=\"{}\"{}{cap}{}",
        n(sw),
        if set_not_none(g(p, "dash")) {
            format!(" stroke-dasharray=\"{}\"", esc(g(p, "dash").unwrap()))
        } else {
            String::new()
        },
        blend_of(p)
    );
    let rough = cx.rough_of(p);
    let mut s = if nz(rough) {
        sketch_svg(&d, &a, rough, "")
    } else {
        format!("<path d=\"{d}\" {a}/>")
    };
    // casing=colour is a wider line underneath, so routes cross cleanly; double=colour is a finer line on top, making two rails
    if set_not_none(g(p, "casing")) {
        s = format!(
            "<path d=\"{d}\" fill=\"none\" stroke=\"{}\" stroke-width=\"{}\"{cap}/>\n{s}",
            col(look, g(p, "casing"), None),
            n(r2(sw + 2.0 * num(g(p, "casing.width"), 2.5)))
        );
    }
    if set_not_none(g(p, "double")) {
        s += &format!(
            "\n<path d=\"{d}\" fill=\"none\" stroke=\"{}\" stroke-width=\"{}\"{cap}/>",
            col(look, g(p, "double"), None),
            n(num(g(p, "double.sw"), r2(sw * 0.42)))
        );
    }
    if !head.0.is_empty() {
        s += "\n";
        s += &head.0;
    }
    if !tail.0.is_empty() {
        s += "\n";
        s += &tail.0;
    }
    s
}

fn draw_label(look: &Look, c: &Conn) -> String {
    let Some(l) = &c.label else {
        return String::new();
    };
    let paper = col(look, Some(paper_of(look)), None);
    let p = &c.p;
    let fill = col(
        look,
        Some(g(p, "label.color").or(g(p, "stroke")).unwrap_or("muted")),
        None,
    );
    // label.fill and label.border make the label a plate (label.radius, label.pad); without them it is a patch of paper
    let plate = set_not_none(g(p, "label.fill")) || set_not_none(g(p, "label.border"));
    let pad = if plate {
        num(g(p, "label.pad"), 3.0)
    } else {
        0.0
    };
    let rx = num(g(p, "label.radius"), 2.0);
    let border = if set_not_none(g(p, "label.border")) {
        format!(
            " stroke=\"{}\" stroke-width=\"{}\"",
            col(look, g(p, "label.border"), None),
            n(num(g(p, "label.sw"), 1.0))
        )
    } else {
        String::new()
    };
    let weight = num(g(p, "label.weight"), 400.0);
    format!(
        "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" fill=\"{}\"{border}/>\n<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" font-family=\"{}\" font-size=\"{}\" fill=\"{fill}\"{}{}{}>{}</text>",
        n(r2(l.x - pad)),
        n(r2(l.y - pad / 2.0)),
        n(l.w + pad * 2.0),
        n(l.h + pad),
        n(js::min(rx, (l.h + pad) / 2.0)),
        if plate && set_not_none(g(p, "label.fill")) {
            col(look, g(p, "label.fill"), None)
        } else {
            paper
        },
        n(r2(l.cx)),
        n(r2(l.baseline)),
        fam(look, Some(&l.font)),
        n(l.size),
        if weight != 400.0 {
            format!(" font-weight=\"{}\"", n(weight))
        } else {
            String::new()
        },
        if g(p, "label.italic") == Some("1") {
            " font-style=\"italic\""
        } else {
            ""
        },
        if nz(l.spacing) {
            format!(" letter-spacing=\"{}\"", n(r2(l.spacing * l.size)))
        } else {
            String::new()
        },
        esc(&l.text)
    )
}

fn draw_text(look: &Look, t: &TextEl) -> String {
    let a = text_attrs(look, &t.p, "", &td("sans", 12.0, 400.0, "ink"));
    let anchor = match g(&t.p, "anchor") {
        Some(v) if !v.is_empty() && v != "start" => format!(" text-anchor=\"{}\"", esc(v)),
        _ => String::new(),
    };
    let rot = num(g(&t.p, "rotate"), 0.0);
    let lines: Vec<&str> = t.text.split('\n').collect();
    let blend = blend_of(&t.p);
    let mut body = lines
        .iter()
        .enumerate()
        .map(|(i, l)| {
            format!(
                "<text x=\"{}\" y=\"{}\"{anchor} {}{blend}>{}</text>",
                n(t.ax),
                n(r2(t.ay + i as f64 * a.size * 1.3)),
                a.a,
                esc(l)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    if set_not_none(g(&t.p, "echo")) {
        // echo=colour prints the text a second time underneath, a little off (echo.dx, echo.dy)
        let dx = num(g(&t.p, "echo.dx"), 3.0);
        let dy = num(g(&t.p, "echo.dy"), 3.0);
        let ea = replace_first(
            fill_re(),
            &a.a,
            &format!("fill=\"{}\"", col(look, g(&t.p, "echo"), None)),
        );
        body = lines
            .iter()
            .enumerate()
            .map(|(i, l)| {
                format!(
                    "<text x=\"{}\" y=\"{}\"{anchor} {ea}>{}</text>",
                    n(t.ax + dx),
                    n(r2(t.ay + dy + i as f64 * a.size * 1.3)),
                    esc(l)
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
            + "\n"
            + &body;
    }
    if rot == 90.0 || rot == -90.0 {
        format!(
            "<g transform=\"rotate({} {} {})\">{body}</g>",
            n(rot),
            n(t.ax),
            n(t.ay)
        )
    } else {
        body
    }
}

type Rgb = [f64; 3];

/// JavaScript's `\s`, for the colour pattern below.
const JS_SPACE: &str = r"[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";

// A colour as numbers, laid over the page when it is see-through; None for anything that is not a plain colour.
fn rgb_of(look: &Look, v: Option<&str>, over: Option<Rgb>) -> Option<Rgb> {
    static HEX: OnceLock<Regex> = OnceLock::new();
    static RGBA: OnceLock<Regex> = OnceLock::new();
    let c = color(look, v, None);
    if let Some(m) = re(&HEX, r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$").captures(&c) {
        let h = &m[1];
        let h = if h.len() == 3 {
            h.chars().flat_map(|x| [x, x]).collect::<String>()
        } else {
            h.to_string()
        };
        let part = |i: usize| f64::from(u8::from_str_radix(&h[i..i + 2], 16).unwrap());
        return Some([part(0), part(2), part(4)]);
    }
    let pattern = format!(
        r"^rgba?\(([0-9.]+),{s}*([0-9.]+),{s}*([0-9.]+)(?:,{s}*([0-9.]+))?\)$",
        s = JS_SPACE
    );
    let m = re(&RGBA, &pattern).captures(&c)?;
    let al = m.get(4).map_or(1.0, |a| to_number(a.as_str()));
    let o = over.unwrap_or([255.0, 255.0, 255.0]);
    Some([0, 1, 2].map(|i| to_number(&m[i + 1]) * al + o[i] * (1.0 - al)))
}

fn contrast(x: Rgb, y: Rgb) -> f64 {
    let lum = |c: Rgb| {
        let [r, g, b] = c.map(|v| {
            let v = v / 255.0;
            if v <= 0.03928 {
                v / 12.92
            } else {
                js::pow((v + 0.055) / 1.055, 2.4)
            }
        });
        0.2126 * r + 0.7152 * g + 0.0722 * b
    };
    let (p, q) = (lum(x), lum(y));
    (js::max(p, q) + 0.05) / (js::min(p, q) + 0.05)
}

const FAINT: f64 = 1.8; // below this contrast text is close to invisible: the checker's threshold too

// Text laid on a filled box (a caption over the subject, a small chip on a card) has to stay readable whatever a
// look fills that box with. So when the fill is the look's own choice for that style and the text's colour would
// sink into it, the text takes the colour the box gives its title. A fill the diagram chose itself is left alone,
// for the checker to report. The checker reads the scene through this, so it reports only what is really drawn.
pub fn legible(sc: Scene) -> Scene {
    static FAINT_RE: OnceLock<Regex> = OnceLock::new();
    static ALPHA: OnceLock<Regex> = OnceLock::new();
    let look = sc.look.clone();
    let look = &*look;
    let paper = rgb_of(look, Some(paper_of(look)), None).unwrap_or([255.0, 255.0, 255.0]);
    let filled = |s: &Shape| {
        s.rows.is_none()
            && s.shape != "legend"
            && s.shape != "chart"
            && s.shape != "icon"
            && set_not_none(g(&s.p, "fill"))
    };
    // the last-drawn filled shape under a point, among the first up_to shapes
    let under = |x: f64, y: f64, up_to: usize| {
        sc.shapes[..up_to]
            .iter()
            .rev()
            .find(|s| filled(s) && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h)
    };
    // the colour to use instead of c on top of shape `on`, or None when c reads well enough. A box whose own
    // title is light on dark (it would vanish on the page) asks more of the text on it than one that is merely tinted.
    let swap = |on: Option<&Shape>, c: &str| -> Option<String> {
        let on = on?;
        if on.back
            || g(&on.p, "fill")
                != look
                    .styles
                    .get(&on.style)
                    .and_then(|st| g(&st.props, "fill"))
        {
            return None;
        }
        let bg = rgb_of(look, g(&on.p, "fill"), Some(paper))?;
        let fg = rgb_of(look, Some(c), Some(bg))?;
        let tc = g(&on.p, "title.color");
        let trgb = tc
            .filter(|t| !t.is_empty())
            .and_then(|t| rgb_of(look, Some(t), Some(bg)));
        let inverse = trgb.is_some_and(|t| contrast(paper, t) < 2.0);
        let now = contrast(bg, fg);
        if now >= if inverse { 4.5 } else { FAINT } {
            return None;
        }
        // the main text takes the box's title colour, quieter text its second-line colour
        let quiet = if color(look, Some(c), None) != color(look, Some("ink"), None) {
            g(&on.p, "sub.color")
        } else {
            None
        };
        [quiet, tc, Some("paper"), Some("ink"), Some("#ffffff")]
            .into_iter()
            .find(|v| {
                let k = v
                    .filter(|v| !v.is_empty())
                    .and_then(|v| rgb_of(look, Some(v), Some(bg)));
                k.is_some_and(|k| contrast(bg, k) >= 3.0 && contrast(bg, k) > now)
            })
            .flatten()
            .map(str::to_string)
    };
    let mut changed = false;
    let texts: Vec<TextEl> = sc
        .texts
        .iter()
        .map(|t| {
            // a watermark is meant to be faint
            if re(&FAINT_RE, r"/0?\.[0-3][0-9]*$").is_match(g(&t.p, "color").unwrap_or("")) {
                return t.clone();
            }
            let Some(c) = swap(
                under(t.x + t.w / 2.0, t.y + t.h / 2.0, sc.shapes.len()),
                g(&t.p, "color").unwrap_or("ink"),
            ) else {
                return t.clone();
            };
            changed = true;
            TextEl {
                p: with(&t.p, "color", c),
                ..t.clone()
            }
        })
        .collect();
    let shapes: Vec<Shape> = sc
        .shapes
        .iter()
        .enumerate()
        .map(|(at, s)| {
            // a box with no fill of its own shows the box under it
            if s.back
                || !truthy(s.text.as_deref())
                || s.rows.is_some()
                || !boxy(s)
                || s.shape == "icon"
                || s.shape == "legend"
                || s.shape == "chart"
                || set_not_none(g(&s.p, "fill"))
                || g(&s.p, "title.pos") == Some("top")
            {
                return s.clone();
            }
            let Some(c) = swap(
                under(s.x + s.w / 2.0, s.y + s.h / 2.0, at),
                g(&s.p, "title.color").unwrap_or("ink"),
            ) else {
                return s.clone();
            };
            changed = true;
            let mut p = with(&s.p, "title.color", c.clone());
            if set_not_none(g(&s.p, "stroke")) {
                let stroke = if re(&ALPHA, r"/[0-9.]+$").is_match(&c) {
                    c
                } else {
                    c + "/0.6"
                };
                p.insert("stroke".into(), stroke);
            }
            Shape { p, ..s.clone() }
        })
        .collect();
    if changed {
        Scene {
            texts,
            shapes,
            ..sc
        }
    } else {
        sc
    }
}

// A box with depth has its foot below its outline: a line that ends on the bottom edge ends on the foot instead,
// so its arrowhead is not buried under the slab.
fn footed(c: &Conn, shapes: &[Shape]) -> Conn {
    if c.curve || c.pts.len() < 2 {
        return c.clone();
    }
    let mut pts = c.pts.clone();
    let mut moved = false;
    let last = pts.len() - 1;
    for (i, j) in [(0, 1), (last, last - 1)] {
        let (q, nb) = (pts[i], pts[j]);
        if (q.x - nb.x).abs() > 0.5 || nb.y < q.y {
            continue; // only a line coming straight up into the edge
        }
        for s in shapes {
            let d = num(g(&s.p, "depth"), 0.0);
            if d > 0.0
                && !s.back
                && (q.y - (s.y + s.h)).abs() < 1.0
                && q.x > s.x
                && q.x < s.x + s.w
                && nb.y - q.y > d + 6.0
            {
                pts[i].y += d;
                moved = true;
                break;
            }
        }
    }
    if moved {
        Conn { pts, ..c.clone() }
    } else {
        c.clone()
    }
}

// Text is drawn as written: no ligatures, and glyphs placed at their true widths. A browser otherwise rounds
// each glyph's advance to whole screen pixels at small sizes, so a zoomed-out diagram (the embed, the editor
// zoomed out) loses its word spaces ("DuckDBexecutes"); geometricPrecision keeps the widths measureText assumes.
const TEXT_STYLE: &str = "font-variant-ligatures:none;text-rendering:geometricPrecision";

// background: false leaves the page out (no paper, no dots), for an image laid over something else
pub fn render_body(sc: &Scene, background: bool) -> String {
    let sc = legible(sc.clone());
    let look = &*sc.look;
    let cv = &look.canvas;
    let mut out: Vec<String> = Vec::new();
    let mut cx = RenderCtx {
        amt: js::max(0.0, js::min(num(g(cv, "sketch"), 0.0), 4.0)),
        defs: IndexMap::new(),
    };
    let page = |extra: &str| {
        format!(
            "<rect class=\"fd-page\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" {extra}/>",
            n(sc.x),
            n(sc.y),
            n(sc.w),
            n(sc.h)
        )
    };
    if background {
        out.push(page(&format!(
            "fill=\"{}\"",
            col(look, Some(paper_of(look)), None)
        )));
    }
    if background && set_not_none(g(cv, "dots")) {
        let gap = n(num(g(cv, "dotgap"), 22.0));
        out.push(format!(
            "<defs><pattern id=\"fd-dots\" width=\"{gap}\" height=\"{gap}\" patternUnits=\"userSpaceOnUse\"><circle cx=\"1\" cy=\"1\" r=\"0.9\" fill=\"{}\"/></pattern></defs>",
            col(look, g(cv, "dots"), None)
        ));
        out.push(page("fill=\"url(#fd-dots)\""));
    }
    // The page dressing below is drawn as pattern fills, one element each: a diagram file is untrusted and can be
    // any size, so nothing here may grow with the extent of the picture.
    if background && set_not_none(g(cv, "bars")) {
        // bars=colour: the page as listing paper, a band of colour every other bargap
        let gap = js::max(8.0, num(g(cv, "bargap"), 32.0));
        out.push(format!(
            "<defs><pattern id=\"fd-bars\" width=\"{}\" height=\"{}\" patternUnits=\"userSpaceOnUse\"><rect width=\"{}\" height=\"{}\" fill=\"{}\"/></pattern></defs>",
            n(gap * 2.0),
            n(gap * 2.0),
            n(gap * 2.0),
            n(gap),
            col(look, g(cv, "bars"), None)
        ));
        out.push(page("fill=\"url(#fd-bars)\""));
    }
    if background && set_not_none(g(cv, "feed")) {
        // feed=colour: sprocket holes down both edges, and the line where the strip tears off
        let c = col(look, g(cv, "feed"), None);
        let paper = col(look, Some(paper_of(look)), None);
        let hole = |id: &str, x: f64| {
            format!(
                "<pattern id=\"{id}\" x=\"{}\" y=\"0\" width=\"26\" height=\"24\" patternUnits=\"userSpaceOnUse\"><circle cx=\"13\" cy=\"12\" r=\"4.2\" fill=\"{paper}\" stroke=\"{c}\" stroke-width=\"1\"/></pattern>",
                n(x)
            )
        };
        out.push(format!(
            "<defs>{}{}</defs>",
            hole("fd-feed-l", sc.x),
            hole("fd-feed-r", sc.x + sc.w - 26.0)
        ));
        out.push(format!(
            "<rect class=\"fd-page\" x=\"{}\" y=\"{}\" width=\"26\" height=\"{}\" fill=\"url(#fd-feed-l)\"/><rect class=\"fd-page\" x=\"{}\" y=\"{}\" width=\"26\" height=\"{}\" fill=\"url(#fd-feed-r)\"/>",
            n(sc.x),
            n(sc.y),
            n(sc.h),
            n(sc.x + sc.w - 26.0),
            n(sc.y),
            n(sc.h)
        ));
        out.push(format!(
            "<path class=\"fd-page\" d=\"M {},{} v {} M {},{} v {}\" stroke=\"{c}\" stroke-width=\"1\" stroke-dasharray=\"2 3\" fill=\"none\"/>",
            n(sc.x + 26.0),
            n(sc.y),
            n(sc.h),
            n(sc.x + sc.w - 26.0),
            n(sc.y),
            n(sc.h)
        ));
    }
    for s in &sc.shapes {
        if s.back {
            out.push(draw_shape(&mut cx, look, s));
        }
    }
    // lines go under the shapes, except those marked layer=front (an edge drawn on a face)
    let footed_conns: Vec<Conn>;
    let conns: &[Conn] = if sc.shapes.iter().any(|s| num(g(&s.p, "depth"), 0.0) > 0.0) {
        footed_conns = sc.conns.iter().map(|c| footed(c, &sc.shapes)).collect();
        &footed_conns
    } else {
        &sc.conns
    };
    let front = |c: &&Conn| g(&c.p, "layer") == Some("front");
    let under: Vec<&Conn> = conns.iter().filter(|c| !front(c)).collect();
    let over: Vec<&Conn> = conns.iter().filter(front).collect();
    for c in &under {
        out.push(draw_conn(&cx, look, c));
    }
    for c in &under {
        if c.label.is_some() {
            out.push(draw_label(look, c));
        }
    }
    for s in &sc.shapes {
        if !s.back {
            out.push(draw_shape(&mut cx, look, s));
        }
    }
    for c in &over {
        out.push(draw_conn(&cx, look, c));
    }
    for c in &over {
        if c.label.is_some() {
            out.push(draw_label(look, c));
        }
    }
    for t in &sc.texts {
        out.push(draw_text(look, t));
    }
    if background && num(g(cv, "grain"), 0.0) > 0.0 {
        // grain=0..1: the tooth of printed paper, laid over everything
        out.push("<defs><filter id=\"fd-grain\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"1.1\" numOctaves=\"2\" seed=\"4\"/><feColorMatrix values=\"0 0 0 0 .25  0 0 0 0 .22  0 0 0 0 .2  0 0 0 .5 -.2\"/></filter></defs>".to_string());
        out.push(page(&format!(
            "filter=\"url(#fd-grain)\" opacity=\"{}\" pointer-events=\"none\"",
            n(js::min(1.0, num(g(cv, "grain"), 0.0)))
        )));
    }
    if !cx.defs.is_empty() {
        let at = out.len().min(1);
        out.insert(at, format!("<defs>{}</defs>", cx.hatch_defs()));
    }
    // Text is drawn as written: no font turns `--`, `->`, `>=` or `...` into one glyph (the PNG renderer gets
    // fonts with their ligatures turned off instead, withoutLigatureFonts), and spaces are kept (keepSpaces).
    let mut all = vec![format!("<g style=\"{TEXT_STYLE}\">")];
    all.extend(out);
    all.push("</g>".to_string());
    keep_spaces(&all.join("\n"))
}

// SVG collapses runs of spaces and drops leading and trailing ones. A text that has any of those is marked
// xml:space="preserve" (which resvg and SVG files opened on their own honour) and white-space:pre (which a browser
// honours when the SVG sits inside a page, as on the editor canvas), so indented code and lined-up columns are drawn
// as written. Texts with a line break or tab are left alone: those come from icon files, not from the diagram.
fn keep_spaces(svg: &str) -> String {
    static TEXT: OnceLock<Regex> = OnceLock::new();
    re(&TEXT, r"<text(?-u:\b)([^>]*)>([^<]*)</text>")
        .replace_all(svg, |c: &regex::Captures| {
            let (a, t) = (&c[1], &c[2]);
            let spaced = t.starts_with(' ') || t.ends_with(' ') || t.contains("  ");
            if spaced
                && !t.contains(['\n', '\t'])
                && !a.contains("xml:space")
                && !a.contains("style=")
            {
                format!("<text xml:space=\"preserve\" style=\"white-space:pre\"{a}>{t}</text>")
            } else {
                c[0].to_string()
            }
        })
        .into_owned()
}

/// `renderSvg(sc)`: the whole picture, with its page, and no stylesheet.
pub fn render_svg(sc: &Scene) -> String {
    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\">\n{}\n</svg>",
        n(sc.x),
        n(sc.y),
        n(sc.w),
        n(sc.h),
        n(sc.w),
        n(sc.h),
        render_body(sc, true)
    )
}
