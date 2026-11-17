//! chart.ts: draws a chart element: axes, ticks and grid lines, and the series given as rows.
//! The element's box is the plot area; tick labels and titles are drawn just outside it.

use std::sync::OnceLock;

use regex::Regex;

use crate::js::{self, js_trim, num_str, r2, round, to_number};
use crate::look::{Look, Props};
use crate::render::{col, esc, num, td, text_attrs};
use crate::scene::{Row, Shape, text_width};

const PALETTE: [&str; 6] = [
    "accent",
    "link",
    "ink/0.55",
    "soft",
    "accent/0.5",
    "link/0.5",
];

fn n(x: f64) -> String {
    num_str(x)
}

fn g<'a>(p: &'a Props, k: &str) -> Option<&'a str> {
    p.get(k).map(String::as_str)
}

fn truthy(v: Option<&str>) -> bool {
    v.is_some_and(|v| !v.is_empty())
}

// A step of 1, 2, 2.5 or 5 times a power of ten that gives at most `max` steps across the span.
pub fn nice_step(span: f64, max: f64) -> f64 {
    #[allow(clippy::neg_cmp_op_on_partial_ord)] // NaN takes the first branch, as in the TypeScript
    if !(span > 0.0) {
        return 1.0;
    }
    let raw = span / max;
    let pow = js::pow(10.0, js::log10(raw).floor());
    for m in [1.0, 2.0, 2.5, 5.0, 10.0] {
        if m * pow >= raw {
            return m * pow;
        }
    }
    10.0 * pow
}

// A tick step from the file is only used if it is a real positive number that gives a sane number of ticks;
// diagram files are untrusted, and step=0 would otherwise never finish.
fn safe_step(v: Option<&str>, span: f64) -> f64 {
    match v {
        Some(v) => {
            let s = to_number(v);
            if s.is_finite() && s > 0.0 && span / s <= 200.0 {
                s
            } else {
                nice_step(span, 6.0)
            }
        }
        None => nice_step(span, 6.0),
    }
}

// Tick values across lo..hi. Counted, never "add the step until past the end": with very large numbers adding
// a small step changes nothing and such a loop would not finish.
fn ticks(lo: f64, hi: f64, step: f64) -> Vec<f64> {
    let k0 = (lo / step - 1e-9).ceil();
    let k1 = (hi / step + 1e-9).floor();
    let mut out = Vec::new();
    if !k0.is_finite() || !k1.is_finite() {
        return out;
    }
    let mut k = k0;
    while k <= k1 && out.len() <= 200 {
        out.push(k * step);
        k += 1.0;
    }
    out
}

fn fmt(v: f64) -> String {
    n(round(v * 1000.0) / 1000.0)
}

fn range(v: Option<&str>) -> Option<(f64, f64)> {
    static RANGE: OnceLock<Regex> = OnceLock::new();
    let m = RANGE
        .get_or_init(|| Regex::new(r"^(-?[0-9.]+)\.\.(-?[0-9.]+)$").unwrap())
        .captures(v.unwrap_or(""))?;
    let (a, b) = (to_number(&m[1]), to_number(&m[2]));
    // must run upwards
    (a.abs() < 1e15 && b.abs() < 1e15 && b > a).then_some((a, b))
}

/// `v === '_' ? [] : v.split(',').map(Number)`: _ leaves a gap
fn pairs(v: &str) -> Vec<f64> {
    if v == "_" {
        Vec::new()
    } else {
        v.split(',').map(to_number).collect()
    }
}

/// `/\/[\d.]+$/`: a colour that already says how see-through it is.
fn alpha_re() -> &'static Regex {
    static ALPHA: OnceLock<Regex> = OnceLock::new();
    ALPHA.get_or_init(|| Regex::new(r"/[0-9.]+$").unwrap())
}

/// One point of a line, area or dots series.
struct Point {
    x: f64,
    y: f64,
    v: f64,
    r: f64,
    i: usize,
}

pub fn draw_chart(look: &Look, s: &Shape) -> String {
    let p = &s.p;
    let rows: Vec<&Row> = s
        .rows
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|r| truthy(r.id.as_deref()) && !r.vals.is_empty())
        .collect();
    fn id(r: &Row) -> &str {
        r.id.as_deref().unwrap_or("")
    }
    let mut out: Vec<String> = Vec::new();
    let (x, y, w, h) = (s.x, s.y, s.w, s.h);
    // ---- scales --------------------------------------------------------------
    let xr = range(g(p, "x"));
    let cats: Vec<String> = match g(p, "x") {
        Some(v) if xr.is_none() && !v.is_empty() => {
            v.split(',').map(|c| js_trim(c).to_string()).collect()
        }
        _ => Vec::new(),
    };
    let cnt = if xr.is_some() {
        0
    } else {
        rows.iter()
            .map(|r| r.vals.len())
            .fold(cats.len().max(1), usize::max)
    };
    let mut ys: Vec<f64> = Vec::new();
    for r in &rows {
        for v in &r.vals {
            let q = pairs(v);
            if id(r) == "bars" || (id(r) == "dots" && xr.is_none()) {
                ys.extend(q);
            } else {
                ys.extend(q.last());
            }
        }
    }
    let stacked = g(p, "stack") == Some("1");
    if stacked {
        for i in 0..cnt {
            ys.push(rows.iter().filter(|r| id(r) == "bars").fold(0.0, |a, r| {
                let v = r.vals.get(i).map_or(f64::NAN, |v| to_number(v));
                a + if v == 0.0 || v.is_nan() { 0.0 } else { v }
            }));
        }
    }
    ys.retain(|v| v.is_finite() && v.abs() < 1e15);
    let yr = range(g(p, "y"));
    let mut y0 = yr.map_or_else(|| ys.iter().fold(0.0, |a, &b| js::min(a, b)), |r| r.0);
    let mut y1 = yr.map_or_else(|| ys.iter().fold(0.0, |a, &b| js::max(a, b)), |r| r.1);
    #[allow(clippy::neg_cmp_op_on_partial_ord)] // NaN takes the branch, as in the TypeScript
    if !(y1 > y0) {
        y1 = y0 + 1.0;
    }
    let step = safe_step(g(p, "step"), y1 - y0);
    if yr.is_none() {
        y0 = (y0 / step).floor() * step;
        y1 = (y1 / step).ceil() * step;
        if y1 == y0 {
            y1 = y0 + step;
        }
    }
    let ymap = |v: f64| r2(y + h - ((v - y0) / (y1 - y0)) * h);
    let bw = if cnt > 0 { w / cnt as f64 } else { 0.0 };
    let xcat = |i: usize| r2(x + bw * (i as f64 + 0.5)); // middle of category i
    let xval = |v: f64| match xr {
        Some((a, b)) => r2(x + ((v - a) / (b - a)) * w),
        None => 0.0,
    };
    let base = ymap(js::min(js::max(0.0, y0), y1));
    // ---- grid, axes and tick labels -----------------------------------------
    let tick = text_attrs(look, p, "tick.", &td("mono", 9.0, 400.0, "muted"));
    let axis = col(look, Some(g(p, "stroke").unwrap_or("ink/0.5")), None);
    let grid = col(look, Some(g(p, "grid.color").unwrap_or("ink/0.08")), None);
    let sw = num(g(p, "sw"), 1.0);
    let unit = g(p, "unit").unwrap_or("");
    let pre = g(p, "prefix").unwrap_or("");
    if truthy(g(p, "fill")) && g(p, "fill") != Some("none") {
        out.push(format!(
            "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{}\"/>",
            n(x),
            n(y),
            n(w),
            n(h),
            col(look, g(p, "fill"), None)
        ));
    }
    let pgrid = g(p, "grid");
    for v in ticks(y0, y1, step) {
        let gy = ymap(v);
        if pgrid != Some("0") && pgrid != Some("x") && (gy - (y + h)).abs() > 0.5 {
            out.push(format!(
                "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{grid}\" stroke-width=\"1\"/>",
                n(x),
                n(gy),
                n(x + w),
                n(gy)
            ));
        }
        if g(p, "yaxis") != Some("0") {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"end\" {}>{}</text>",
                n(x - 8.0),
                n(r2(gy + tick.size * 0.35)),
                tick.a,
                esc(&format!("{pre}{}{unit}", fmt(v)))
            ));
        }
    }
    if let Some((xa, xb)) = xr {
        let xs = safe_step(g(p, "xstep"), xb - xa);
        for v in ticks(xa, xb, xs) {
            if (pgrid == Some("both") || pgrid == Some("x")) && v > xa {
                out.push(format!(
                    "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{grid}\" stroke-width=\"1\"/>",
                    n(xval(v)),
                    n(y),
                    n(xval(v)),
                    n(y + h)
                ));
            }
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
                n(xval(v)),
                n(y + h + 8.0 + tick.size),
                tick.a,
                esc(&format!("{}{}", fmt(v), g(p, "xunit").unwrap_or("")))
            ));
        }
    } else {
        for (i, c) in cats.iter().enumerate() {
            if pgrid == Some("x") && i > 0 {
                out.push(format!(
                    "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{grid}\" stroke-width=\"1\"/>",
                    n(r2(x + bw * i as f64)),
                    n(y),
                    n(r2(x + bw * i as f64)),
                    n(y + h)
                ));
            }
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
                n(xcat(i)),
                n(y + h + 8.0 + tick.size),
                tick.a,
                esc(c)
            ));
        }
    }
    // ---- series ---------------------------------------------------------------
    let lab = text_attrs(look, p, "value.", &td("mono", 9.0, 400.0, "ink"));
    let labels = g(p, "labels") == Some("1");
    let value = |out: &mut Vec<String>, cx: f64, cy: f64, v: f64, plus: bool| {
        if labels {
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
                n(cx),
                n(r2(cy)),
                lab.a,
                esc(&format!(
                    "{}{pre}{}{unit}",
                    if plus { "+" } else { "" },
                    fmt(v)
                ))
            ));
        }
    };
    // rows.indexOf(r): each series' place among the drawn rows
    let colour = |ri: usize, k: &str| -> String {
        let r = rows[ri];
        g(&r.p, k)
            .or(g(&r.p, "fill"))
            .or(g(&r.p, "stroke"))
            .unwrap_or(PALETTE[ri % PALETTE.len()])
            .to_string()
    };
    let bars: Vec<usize> = (0..rows.len()).filter(|&i| id(rows[i]) == "bars").collect();
    let group = bw * num(g(p, "bar.width"), 0.64);
    let each = if stacked || bars.is_empty() {
        group
    } else {
        group / bars.len() as f64
    };
    let mut tops: Vec<Option<f64>> = Vec::new();
    for (k, &ri) in bars.iter().enumerate() {
        let r = rows[ri];
        let rad = num(g(p, "bar.radius"), 2.0);
        // fill.3=accent colours the third bar of the series on its own
        let outline = if truthy(g(&r.p, "stroke")) && truthy(g(&r.p, "fill")) {
            format!(
                " stroke=\"{}\" stroke-width=\"{}\"",
                col(look, g(&r.p, "stroke"), None),
                n(num(g(&r.p, "sw"), 1.0))
            )
        } else {
            String::new()
        };
        for (i, raw) in r.vals.iter().enumerate() {
            let q = pairs(raw);
            if q.is_empty() {
                continue;
            }
            let mut lo = if q.len() == 2 { q[0] } else { 0.0 };
            let mut hi = if q.len() == 2 { q[1] } else { q[0] };
            if stacked && q.len() == 1 {
                lo = tops.get(i).copied().flatten().unwrap_or(0.0);
                hi = lo + q[0];
                if tops.len() <= i {
                    tops.resize(i + 1, None);
                }
                tops[i] = Some(hi);
            }
            let top = js::min(ymap(lo), ymap(hi));
            let bh = (ymap(lo) - ymap(hi)).abs();
            let bx = r2(xcat(i) - group / 2.0
                + if stacked { 0.0 } else { k as f64 * each }
                + if each > 6.0 { 1.0 } else { 0.0 });
            let ww = r2(each - if each > 6.0 { 2.0 } else { 0.0 });
            let rx = if rad != 0.0 && bh > rad * 2.0 && !stacked {
                format!(" rx=\"{}\"", n(rad))
            } else {
                String::new()
            };
            let fill_key = format!("fill.{}", i + 1);
            let fill = g(&r.p, &fill_key)
                .map(str::to_string)
                .unwrap_or_else(|| colour(ri, "fill"));
            out.push(format!(
                "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{rx} fill=\"{}\"{outline}/>",
                n(bx),
                n(top),
                n(ww),
                n(r2(js::max(bh, 0.5))),
                col(look, Some(&fill), None)
            ));
            // a floating step that does not start at zero is a change: say so with a sign
            value(
                &mut out,
                r2(bx + ww / 2.0),
                if hi >= lo {
                    top - 4.0
                } else {
                    top + bh + lab.size + 2.0
                },
                if q.len() == 2 { hi - lo } else { q[0] },
                q.len() == 2 && lo != 0.0 && hi > lo,
            );
        }
    }
    for (ri, r) in rows.iter().enumerate() {
        let rid = id(r);
        if rid == "bars" {
            continue;
        }
        let stroke = col(look, Some(&colour(ri, "stroke")), None);
        let lw = num(g(&r.p, "sw"), 2.0);
        let pts: Vec<Point> = r
            .vals
            .iter()
            .enumerate()
            .filter(|(_, raw)| raw.as_str() != "_")
            .map(|(i, raw)| {
                let q = pairs(raw);
                let at = |k: usize| q.get(k).copied();
                if q.len() >= 2 && xr.is_some() {
                    Point {
                        x: xval(q[0]),
                        y: ymap(q[1]),
                        v: q[1],
                        r: at(2).unwrap_or(0.0),
                        i,
                    }
                } else {
                    Point {
                        x: xcat(i),
                        y: ymap(q[0]),
                        v: q[0],
                        r: at(1).unwrap_or(0.0),
                        i,
                    }
                }
            })
            .collect();
        let (Some(first), Some(last)) = (pts.first(), pts.last()) else {
            continue;
        };
        let d = pts
            .iter()
            .map(|q| format!("{},{}", n(q.x), n(q.y)))
            .collect::<Vec<_>>()
            .join(" ");
        if rid == "area" {
            let fill = match g(&r.p, "fill") {
                Some(f) => f.to_string(),
                None => {
                    let c = colour(ri, "stroke");
                    let tinted = alpha_re().is_match(&c);
                    if tinted { c } else { c + "/0.1" }
                }
            };
            out.push(format!(
                "<polygon points=\"{},{} {d} {},{}\" fill=\"{}\"/>",
                n(first.x),
                n(base),
                n(last.x),
                n(base),
                col(look, Some(&fill), None)
            ));
        }
        if rid != "dots" {
            out.push(format!(
                "<polyline points=\"{d}\" fill=\"none\" stroke=\"{stroke}\" stroke-width=\"{}\" stroke-linejoin=\"round\" stroke-linecap=\"round\"{}/>",
                n(lw),
                match g(&r.p, "dash").filter(|v| !v.is_empty()) {
                    Some(dash) => format!(" stroke-dasharray=\"{}\"", esc(dash)),
                    None => String::new(),
                }
            ));
        }
        let dots = rid == "dots";
        if dots || g(&r.p, "dots") == Some("1") {
            for q in &pts {
                let rr = if dots {
                    num(
                        g(&r.p, "r"),
                        if q.r == 0.0 || q.r.is_nan() { 4.0 } else { q.r },
                    )
                } else {
                    3.0
                };
                let fill = if dots {
                    let fill_key = format!("fill.{}", q.i + 1);
                    let c = g(&r.p, &fill_key)
                        .or(g(&r.p, "fill"))
                        .map(str::to_string)
                        .unwrap_or_else(|| colour(ri, "stroke"));
                    col(look, Some(&c), None)
                } else {
                    col(
                        look,
                        Some(g(&look.canvas, "paper").unwrap_or("paper")),
                        None,
                    )
                };
                let st = if dots && !(truthy(g(&r.p, "fill")) && truthy(g(&r.p, "stroke"))) {
                    "none"
                } else {
                    &stroke
                };
                out.push(format!(
                    "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{fill}\" stroke=\"{st}\" stroke-width=\"{}\"{}/>",
                    n(q.x),
                    n(q.y),
                    n(rr),
                    n(if dots { num(g(&r.p, "sw"), 1.2) } else { lw }),
                    if dots && truthy(g(&r.p, "opacity")) {
                        format!(" fill-opacity=\"{}\"", n(num(g(&r.p, "opacity"), 1.0)))
                    } else {
                        String::new()
                    }
                ));
            }
        }
        for q in &pts {
            value(&mut out, q.x, q.y - 8.0, q.v, false);
        }
    }
    // ---- axis lines, titles and the key ----------------------------------------
    out.push(format!(
        "<path d=\"M {},{} L {},{} L {},{}\" fill=\"none\" stroke=\"{axis}\" stroke-width=\"{}\"/>",
        n(x),
        n(y),
        n(x),
        n(y + h),
        n(x + w),
        n(y + h),
        n(sw)
    ));
    if y0 < 0.0 && y1 > 0.0 && g(p, "zero") != Some("0") {
        out.push(format!(
            "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{axis}\" stroke-width=\"{}\"/>",
            n(x),
            n(base),
            n(x + w),
            n(base),
            n(sw)
        ));
    }
    let ttl = text_attrs(look, p, "axis.", &td("sans", 10.0, 400.0, "muted"));
    if let Some(t) = g(p, "xtitle").filter(|v| !v.is_empty()) {
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" text-anchor=\"middle\" {}>{}</text>",
            n(x + w / 2.0),
            n(y + h + 36.0),
            ttl.a,
            esc(t)
        ));
    }
    if let Some(t) = g(p, "ytitle").filter(|v| !v.is_empty()) {
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" {}>{}</text>",
            n(x),
            n(y - 12.0),
            ttl.a,
            esc(t)
        ));
    }
    let named: Vec<usize> = (0..rows.len())
        .filter(|&i| rows[i].cells.first().is_some_and(|c| !c.is_empty()))
        .collect();
    let keyed = named.len() > 1 && g(p, "key") != Some("0");
    if keyed {
        let mut kx = x + w;
        for &ri in named.iter().rev() {
            let r = rows[ri];
            let tw = text_width(&r.cells[0], ttl.size, &ttl.font, 400.0, 0.0);
            kx -= tw;
            out.push(format!(
                "<text x=\"{}\" y=\"{}\" {}>{}</text>",
                n(r2(kx)),
                n(y - 12.0),
                ttl.a,
                esc(&r.cells[0])
            ));
            kx -= 14.0;
            out.push(format!(
                "<rect x=\"{}\" y=\"{}\" width=\"10\" height=\"10\" rx=\"2\" fill=\"{}\"/>",
                n(r2(kx)),
                n(y - 20.0),
                col(
                    look,
                    Some(&colour(ri, if id(r) == "bars" { "fill" } else { "stroke" })),
                    None
                )
            ));
            kx -= 16.0;
        }
    }
    if let Some(text) = s.text.as_deref().filter(|t| !t.is_empty()) {
        let t = text_attrs(look, p, "title.", &td("sans", 12.0, 600.0, "ink"));
        out.push(format!(
            "<text x=\"{}\" y=\"{}\" {}>{}</text>",
            n(x),
            n(y - if truthy(g(p, "ytitle")) || keyed {
                32.0
            } else {
                12.0
            }),
            t.a,
            esc(text)
        ));
    }
    out.join("\n")
}
