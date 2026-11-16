//! The geometry helpers against the TypeScript's answers (`tools/rust-cases.ts` writes `geometry.json`;
//! `npm run rust:cases` regenerates it).

use fastdraw_render::router::{Pt, Rect, crosses, route_around, seg_hits, simplify};
use fastdraw_render::sketch::{can_sketch, ellipse_d, rect_d, rough_path, sketch_svg};

mod common;
use common::json::{self, Json};

fn cases() -> Json {
    let path = common::root().join("crates/fastdraw-render/tests/geometry.json");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{}: {e}; run npm run rust:cases", path.display()));
    json::parse(&text)
}

fn pt(v: &Json) -> Pt {
    Pt {
        x: v.get("x").as_num(),
        y: v.get("y").as_num(),
    }
}

fn pts(v: &Json) -> Vec<Pt> {
    v.as_arr().iter().map(pt).collect()
}

fn rect(v: &Json) -> Rect {
    Rect {
        x: v.get("x").as_num(),
        y: v.get("y").as_num(),
        w: v.get("w").as_num(),
        h: v.get("h").as_num(),
    }
}

fn rects(v: &Json) -> Vec<Rect> {
    v.as_arr().iter().map(rect).collect()
}

fn args(v: &Json) -> Vec<f64> {
    v.get("args").as_arr().iter().map(Json::as_num).collect()
}

#[test]
fn rough_path_matches() {
    let all = cases();
    let list = all.get("sketch").get("rough").as_arr();
    assert!(list.len() >= 20);
    for c in list {
        let (d, amount, pass) = (
            c.get("d").as_str().unwrap(),
            c.get("amount").as_num(),
            c.get("pass").as_num() as i32,
        );
        assert_eq!(
            rough_path(d, amount, pass),
            c.get("out").as_str().unwrap(),
            "rough_path({d:?}, {amount}, {pass})"
        );
    }
}

#[test]
fn sketch_svg_matches() {
    let all = cases();
    let list = all.get("sketch").get("svg").as_arr();
    assert!(list.len() >= 100);
    for c in list {
        let (d, attrs, amount, under) = (
            c.get("d").as_str().unwrap(),
            c.get("attrs").as_str().unwrap(),
            c.get("amount").as_num(),
            c.get("under").as_str().unwrap(),
        );
        assert_eq!(
            sketch_svg(d, attrs, amount, under),
            c.get("out").as_str().unwrap(),
            "sketch_svg({d:?}, {attrs:?}, {amount}, {under:?})"
        );
    }
}

#[test]
fn can_sketch_matches() {
    let all = cases();
    for c in all.get("sketch").get("can").as_arr() {
        let d = c.get("d").as_str().unwrap();
        assert_eq!(can_sketch(d), c.get("out").as_bool(), "can_sketch({d:?})");
    }
}

#[test]
fn outlines_match() {
    let all = cases();
    for c in all.get("sketch").get("rects").as_arr() {
        let a = args(c);
        assert_eq!(
            rect_d(a[0], a[1], a[2], a[3], a[4]),
            c.get("out").as_str().unwrap(),
            "rect_d{a:?}"
        );
    }
    for c in all.get("sketch").get("ellipses").as_arr() {
        let a = args(c);
        assert_eq!(
            ellipse_d(a[0], a[1], a[2], a[3]),
            c.get("out").as_str().unwrap(),
            "ellipse_d{a:?}"
        );
    }
}

#[test]
fn seg_hits_and_crosses_match() {
    let all = cases();
    let router = all.get("router");
    let segs = router.get("segs").as_arr();
    assert!(segs.len() >= 300);
    for c in segs {
        let (a, b, r) = (pt(c.get("a")), pt(c.get("b")), rect(c.get("r")));
        assert_eq!(
            seg_hits(a, b, &r),
            c.get("out").as_bool(),
            "seg_hits({a:?}, {b:?}, {r:?})"
        );
    }
    for c in router.get("crossing").as_arr() {
        let (p, o) = (pts(c.get("pts")), rects(c.get("obstacles")));
        assert_eq!(
            crosses(&p, &o),
            c.get("out").as_bool(),
            "crosses({p:?}, {o:?})"
        );
    }
}

#[test]
fn simplify_matches() {
    let all = cases();
    for c in all.get("router").get("simple").as_arr() {
        let p = pts(c.get("pts"));
        assert_eq!(simplify(&p), pts(c.get("out")), "simplify({p:?})");
    }
}

#[test]
fn route_around_matches() {
    let all = cases();
    let routes = all.get("router").get("routes").as_arr();
    assert!(routes.len() >= 6);
    let mut found = 0;
    for c in routes {
        let name = c.get("name").as_str().unwrap();
        let end = |v: &Json| (!matches!(v, Json::Null)).then(|| pt(v));
        let taken: Vec<(Pt, Pt)> = c
            .get("taken")
            .as_arr()
            .iter()
            .map(|s| (pt(&s.as_arr()[0]), pt(&s.as_arr()[1])))
            .collect();
        let got = route_around(
            pt(c.get("p0")),
            end(c.get("d0")),
            pt(c.get("p1")),
            end(c.get("d1")),
            &rects(c.get("obstacles")),
            &taken,
        );
        let want = match c.get("out") {
            Json::Null => None,
            out => Some(pts(out)),
        };
        found += usize::from(want.is_some());
        assert_eq!(got, want, "{name}");
    }
    assert!(found >= 6, "only {found} layouts found a route");
}
