//! Hand-drawn strokes for looks that set `canvas sketch=1`. A path is redrawn as two loose passes:
//! straight segments bow a little, every point wanders a pixel or two, so a box reads as if drawn
//! with a marker. The wobble comes from a generator seeded by the path itself, so the same diagram
//! always draws the same way.

use std::sync::OnceLock;

use regex::Regex;

use crate::js::{self, num_str, r2};

#[derive(Clone, Copy)]
struct P {
    x: f64,
    y: f64,
}

/// The generator `seeded(text, pass)` returns: mulberry32, started from an FNV-1a hash of the path
/// (over its UTF-16 units, as `charCodeAt` reads them) and the pass.
struct Seeded(i32);

impl Seeded {
    fn new(text: &str, pass: i32) -> Seeded {
        let mut h = 2166136261u32 as i32 ^ pass;
        for u in text.encode_utf16() {
            h = js::imul(h ^ i32::from(u), 16777619);
        }
        Seeded(h)
    }

    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let h = self.0;
        let mut t = js::imul(h ^ ((h as u32) >> 15) as i32, 1 | h);
        t = t.wrapping_add(js::imul(t ^ ((t as u32) >> 7) as i32, 61 | t)) ^ t;
        f64::from((t ^ ((t as u32) >> 14) as i32) as u32) / 4294967296.0
    }
}

#[cfg(test)]
fn seeded(text: &str, pass: i32) -> Seeded {
    Seeded::new(text, pass)
}

/// Path data with absolute M, L, C, Q and Z only, which is all FastDraw itself writes.
pub fn can_sketch(d: &str) -> bool {
    // /^[MLCQZ0-9eE\s,.+-]*$/
    d.chars().all(|c| {
        matches!(
            c,
            'M' | 'L' | 'C' | 'Q' | 'Z' | '0'..='9' | 'e' | 'E' | ',' | '.' | '+' | '-'
        ) || js::is_js_space(c)
    })
}

/// The tokens of a path: `/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi`.
fn tokens(d: &str) -> Vec<&str> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re =
        RE.get_or_init(|| Regex::new(r"(?i)[MLCQZ]|-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?").unwrap());
    re.find_iter(d).map(|m| m.as_str()).collect()
}

/// One rough pass over a path. amount 1 is a steady hand; 2 is a quick scribble.
pub fn rough_path(d: &str, amount: f64, pass: i32) -> String {
    struct Pen<'a> {
        rnd: Seeded,
        amount: f64,
        out: Vec<String>,
        cur: P,
        pen: P,
        toks: Vec<&'a str>,
        i: usize,
    }
    impl Pen<'_> {
        fn off(&mut self, k: f64) -> f64 {
            (self.rnd.next() - 0.5) * 2.0 * k
        }
        fn jit(&mut self, p: P, k: f64) -> P {
            let x = p.x + self.off(k);
            let y = p.y + self.off(k);
            P { x, y }
        }
        /// `+toks[i++]`: a missing token is NaN.
        fn num(&mut self) -> f64 {
            let v = self.toks.get(self.i).map_or(f64::NAN, |t| js::to_number(t));
            self.i += 1;
            v
        }
        fn pt(&mut self) -> P {
            let x = self.num();
            let y = self.num();
            P { x, y }
        }
        /// `i < toks.length && !/[A-Z]/i.test(toks[i])`: the run of coordinates goes on until a token with a letter.
        fn more(&self) -> bool {
            self.toks
                .get(self.i)
                .is_some_and(|t| !t.chars().any(|c| c.is_ascii_alphabetic()))
        }
        fn line(&mut self, to: P) {
            let (dx, dy) = (to.x - self.cur.x, to.y - self.cur.y);
            let len = js::hypot(&[dx, dy]);
            if len < 0.5 {
                return;
            }
            // a long stroke bows more than a short one, but never by more than a few pixels
            let bow_k = js::min(len * 0.02, 3.2) * self.amount;
            let bow = self.off(bow_k);
            let (nx, ny) = (-dy / len, dx / len);
            let k = js::min(1.8, 0.35 + len * 0.012) * self.amount;
            let end = self.jit(to, k);
            let pen = self.pen;
            let c1 = P {
                x: pen.x + dx / 3.0 + nx * bow,
                y: pen.y + dy / 3.0 + ny * bow,
            };
            let c2 = P {
                x: pen.x + (dx * 2.0) / 3.0 + nx * bow,
                y: pen.y + (dy * 2.0) / 3.0 + ny * bow,
            };
            self.out.push(format!(
                "C {},{} {},{} {},{}",
                num_str(r2(c1.x)),
                num_str(r2(c1.y)),
                num_str(r2(c2.x)),
                num_str(r2(c2.y)),
                num_str(r2(end.x)),
                num_str(r2(end.y))
            ));
            self.cur = to;
            self.pen = end;
        }
    }

    let mut s = Pen {
        rnd: Seeded::new(d, pass),
        amount,
        out: Vec::new(),
        cur: P { x: 0.0, y: 0.0 },
        pen: P { x: 0.0, y: 0.0 },
        toks: tokens(d),
        i: 0,
    };
    let mut start = s.cur;
    while s.i < s.toks.len() {
        let c = s.toks[s.i];
        s.i += 1;
        match c {
            "M" => {
                s.cur = s.pt();
                start = s.cur;
                s.pen = s.jit(s.cur, 0.6 * amount);
                s.out.push(format!(
                    "M {},{}",
                    num_str(r2(s.pen.x)),
                    num_str(r2(s.pen.y))
                ));
            }
            "L" => {
                while s.more() {
                    let to = s.pt();
                    s.line(to);
                }
            }
            "C" => {
                while s.more() {
                    let a = s.pt();
                    let a = s.jit(a, 0.9 * amount);
                    let b = s.pt();
                    let b = s.jit(b, 0.9 * amount);
                    s.cur = s.pt();
                    s.pen = s.jit(s.cur, 0.6 * amount);
                    s.out.push(format!(
                        "C {},{} {},{} {},{}",
                        num_str(r2(a.x)),
                        num_str(r2(a.y)),
                        num_str(r2(b.x)),
                        num_str(r2(b.y)),
                        num_str(r2(s.pen.x)),
                        num_str(r2(s.pen.y))
                    ));
                }
            }
            "Q" => {
                while s.more() {
                    let a = s.pt();
                    let a = s.jit(a, 0.6 * amount);
                    s.cur = s.pt();
                    s.pen = s.jit(s.cur, 0.5 * amount);
                    s.out.push(format!(
                        "Q {},{} {},{}",
                        num_str(r2(a.x)),
                        num_str(r2(a.y)),
                        num_str(r2(s.pen.x)),
                        num_str(r2(s.pen.y))
                    ));
                }
            }
            "Z" => s.line(start),
            // anything else (a number where a command should be, a lower-case letter) is skipped
            _ => s.i += 1,
        }
    }
    s.out.join(" ")
}

/// `/fill="([^"]*)"/`
fn re_fill() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"fill="([^"]*)""#).unwrap())
}

/// `/stroke-width="([\d.]+)"/`
fn re_width() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"stroke-width="([0-9.]+)""#).unwrap())
}

/// A shape or line drawn by hand: the fill follows the first pass, then two strokes on top.
/// attrs is the usual fill/stroke attribute string; under, if given, is painted between fill and strokes.
pub fn sketch_svg(d: &str, attrs: &str, amount: f64, under: &str) -> String {
    let first_fill = re_fill().captures(attrs);
    let fill = first_fill
        .as_ref()
        .map_or("none", |c| c.get(1).unwrap().as_str());
    let stroke_attrs = match &first_fill {
        Some(c) => {
            let m = c.get(0).unwrap();
            format!("{}fill=\"none\"{}", &attrs[..m.start()], &attrs[m.end()..])
        }
        None => attrs.to_string(),
    };
    let has_stroke = !attrs.contains("stroke=\"none\"") && attrs.contains("stroke=\"");
    let dashed = attrs.contains("stroke-dasharray");
    let mut out: Vec<String> = Vec::new();
    if fill != "none" {
        out.push(format!(
            "<path d=\"{}\" fill=\"{}\" stroke=\"none\"/>",
            rough_path(d, amount * 0.5, 0),
            fill
        ));
    }
    if !under.is_empty() {
        out.push(under.replacen("{d}", &rough_path(d, amount * 0.5, 0), 1));
    }
    if has_stroke {
        let cap = " stroke-linecap=\"round\" stroke-linejoin=\"round\"";
        out.push(format!(
            "<path d=\"{}\" {}{}/>",
            rough_path(d, amount, 1),
            stroke_attrs,
            cap
        ));
        // a dashed line drawn twice turns to mush, so it gets one pass
        if !dashed {
            let thin = match re_width().captures(&stroke_attrs) {
                Some(c) => {
                    let m = c.get(0).unwrap();
                    let w = js::to_number(c.get(1).unwrap().as_str());
                    format!(
                        "{}stroke-width=\"{}\"{}",
                        &stroke_attrs[..m.start()],
                        num_str(r2(w * 0.85)),
                        &stroke_attrs[m.end()..]
                    )
                }
                None => stroke_attrs.clone(),
            };
            out.push(format!(
                "<path d=\"{}\" {}{}/>",
                rough_path(d, amount, 2),
                thin,
                cap
            ));
        }
    }
    out.join("\n")
}

/// The same outlines the plain renderer draws, as path data, so they can be roughened.
pub fn rect_d(x: f64, y: f64, w: f64, h: f64, r: f64) -> String {
    let n = num_str;
    // `!r`: zero and NaN
    if r == 0.0 || r.is_nan() {
        return format!(
            "M {},{} L {},{} L {},{} L {},{} Z",
            n(x),
            n(y),
            n(x + w),
            n(y),
            n(x + w),
            n(y + h),
            n(x),
            n(y + h)
        );
    }
    format!(
        "M {},{} L {},{} Q {},{} {},{} L {},{} Q {},{} {},{} \
         L {},{} Q {},{} {},{} L {},{} Q {},{} {},{} Z",
        n(x + r),
        n(y),
        n(x + w - r),
        n(y),
        n(x + w),
        n(y),
        n(x + w),
        n(y + r),
        n(x + w),
        n(y + h - r),
        n(x + w),
        n(y + h),
        n(x + w - r),
        n(y + h),
        n(x + r),
        n(y + h),
        n(x),
        n(y + h),
        n(x),
        n(y + h - r),
        n(x),
        n(y + r),
        n(x),
        n(y),
        n(x + r),
        n(y)
    )
}

pub fn ellipse_d(x: f64, y: f64, w: f64, h: f64) -> String {
    let (cx, cy, rx, ry, k) = (x + w / 2.0, y + h / 2.0, w / 2.0, h / 2.0, 0.5523);
    let n = |v: f64| num_str(r2(v));
    format!(
        "M {},{} C {},{} {},{} {},{} \
         C {},{} {},{} {},{} \
         C {},{} {},{} {},{} \
         C {},{} {},{} {},{}",
        n(cx + rx),
        n(cy),
        n(cx + rx),
        n(cy + ry * k),
        n(cx + rx * k),
        n(cy + ry),
        n(cx),
        n(cy + ry),
        n(cx - rx * k),
        n(cy + ry),
        n(cx - rx),
        n(cy + ry * k),
        n(cx - rx),
        n(cy),
        n(cx - rx),
        n(cy - ry * k),
        n(cx - rx * k),
        n(cy - ry),
        n(cx),
        n(cy - ry),
        // a hand-drawn ellipse rarely closes exactly: the last quarter runs a little past the start
        n(cx + rx * k),
        n(cy - ry),
        n(cx + rx),
        n(cy - ry * k),
        n(cx + rx),
        n(cy + ry * 0.08)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_generator_is_seeded_by_the_path() {
        let mut g = seeded("M0 0 L10 0", 0);
        let got = [g.next(), g.next(), g.next()];
        assert_eq!(
            got,
            [0.5323078422807157, 0.3873084601946175, 0.8366957046091557]
        );
    }

    #[test]
    fn only_absolute_mlcqz_paths_can_be_sketched() {
        assert!(can_sketch("M 0,0 L 1e3,-2.5 Z"));
        assert!(!can_sketch("M 0 0 A 5 5 0 0 1 10 10"));
        assert!(!can_sketch("m 0 0"));
    }
}
