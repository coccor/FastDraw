//! The geometry helpers against the TypeScript's answers (`tools/rust-cases.ts` writes `geometry.json`;
//! `npm run rust:cases` regenerates it).

use fastdraw_render::js::{num_str, sort_numbers};
use fastdraw_render::look::{Props, empty_look};
use fastdraw_render::router::{Pt, Rect, crosses, route_around, seg_hits, simplify};
use fastdraw_render::scene::{
    Conn, End, EndKind, Label, Row, RowKind, Shape, Side, auto_sides, build_scene, caption_box,
    curve_pts, extent, layout_table, make_label, measure_text, parse_end, point_along, route,
    side_point, text_width,
};
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

/// Points as strings, so that NaN equals NaN.
fn show(p: &[Pt]) -> Vec<(String, String)> {
    p.iter().map(|p| (num_str(p.x), num_str(p.y))).collect()
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
        assert_eq!(
            got.as_deref().map(show),
            want.as_deref().map(show),
            "{name}"
        );
    }
    assert!(found >= 8, "only {found} layouts found a route");
}

#[test]
fn sort_numbers_matches_v8() {
    let all = cases();
    let lists = all.get("sort").as_arr();
    assert!(lists.len() >= 100);
    for c in lists {
        let nums = |k: &str| -> Vec<String> {
            c.get(k)
                .as_arr()
                .iter()
                .map(|n| num_str(n.as_num()))
                .collect()
        };
        let mut v: Vec<f64> = c.get("v").as_arr().iter().map(Json::as_num).collect();
        sort_numbers(&mut v);
        let got: Vec<String> = v.iter().map(|&n| num_str(n)).collect();
        assert_eq!(got, nums("out"), "sort of {:?}", nums("v"));
    }
}

fn scene_cases(key: &str) -> Vec<Json> {
    let all = cases();
    let list = all.get("scene").get(key).as_arr().to_vec();
    assert!(!list.is_empty(), "no {key} cases");
    list
}

fn n(v: &Json) -> String {
    num_str(v.as_num())
}

fn props(v: &Json) -> Props {
    match v {
        Json::Obj(o) => o
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string()))
            .collect(),
        _ => Props::new(),
    }
}

fn opt_pt(v: &Json) -> Option<Pt> {
    (!matches!(v, Json::Null)).then(|| pt(v))
}

fn side(v: &Json) -> Side {
    Side::from_name(v.as_str().unwrap()).unwrap()
}

fn end(p: Pt, dir: Option<Pt>) -> End {
    End {
        raw: String::new(),
        kind: EndKind::Point,
        id: None,
        row: None,
        side: None,
        v: None,
        rel: None,
        pt: p,
        dir,
        fanned: None,
    }
}

fn conn(v: &Json) -> Conn {
    Conn {
        id: "c".into(),
        line: 1,
        style: "line".into(),
        p: props(v.get("p")),
        a: end(pt(v.get("a")), opt_pt(v.get("da"))),
        b: end(pt(v.get("b")), opt_pt(v.get("db"))),
        pts: pts(v.get("pts")),
        head: true,
        tail: false,
        head_m: "arrow".into(),
        tail_m: "none".into(),
        ortho: v.get("ortho").as_bool(),
        ushape: v.get("ushape").as_bool(),
        curve: v.get("curve").as_bool(),
        text: v.get("text").as_str().map(str::to_string),
        label: None,
    }
}

fn shape(x: f64, y: f64, w: f64, h: f64, kind: &str, p: Props, text: Option<&str>) -> Shape {
    Shape {
        x,
        y,
        w,
        h,
        id: "tbl".into(),
        line: 1,
        style: kind.into(),
        p,
        shape: kind.into(),
        text: text.map(str::to_string),
        back: false,
        legend: None,
        rows: None,
        cols: None,
        head_h: None,
        poly: None,
    }
}

#[test]
fn text_width_matches() {
    for c in scene_cases("tw") {
        let got = text_width(
            c.get("text").as_str().unwrap(),
            c.get("size").as_num(),
            c.get("font").as_str().unwrap(),
            c.get("weight").as_num(),
            c.get("spacing").as_num(),
        );
        assert_eq!(num_str(got), n(c.get("out")), "{c:?}");
    }
}

#[test]
fn measure_text_matches() {
    let list = scene_cases("mt");
    assert!(list.len() > 300);
    for c in list {
        let mut look = empty_look();
        if let Json::Obj(fonts) = c.get("fonts") {
            for (k, v) in fonts {
                look.fonts
                    .insert(k.clone(), v.as_str().unwrap().to_string());
            }
        }
        if let Some(role) = c.get("drop").as_str() {
            look.fonts.shift_remove(role);
        }
        let got = measure_text(
            &look,
            c.get("text").as_str().unwrap(),
            c.get("size").as_num(),
            c.get("role").as_str().unwrap(),
            c.get("weight").as_num(),
            c.get("spacing").as_num(),
        );
        assert_eq!(num_str(got), n(c.get("out")), "{c:?}");
    }
}

#[test]
fn parse_end_matches() {
    let mut found = 0;
    for c in scene_cases("parseEnds") {
        let raw = c.get("raw").as_str().unwrap();
        let got = parse_end(raw);
        let want = c.get("out");
        if matches!(want, Json::Null) {
            assert_eq!(got, None, "{raw:?}");
            continue;
        }
        found += 1;
        let e = got.unwrap_or_else(|| panic!("{raw:?} should parse"));
        assert_eq!(e.raw, raw);
        let kind = match e.kind {
            EndKind::Point => "point",
            EndKind::Rel => "rel",
            EndKind::Shape => "shape",
            EndKind::Conn => "conn",
        };
        assert_eq!(Some(kind), want.get("kind").as_str(), "{raw:?}");
        assert_eq!(e.id.as_deref(), want.get("id").as_str(), "{raw:?}");
        assert_eq!(e.row.as_deref(), want.get("row").as_str(), "{raw:?}");
        assert_eq!(
            e.side.map(Side::as_str),
            want.get("side").as_str(),
            "{raw:?}"
        );
        let v = (!matches!(want.get("v"), Json::Null)).then(|| n(want.get("v")));
        assert_eq!(e.v.map(num_str), v, "{raw:?}");
        assert_eq!(show(&[e.pt]), show(&[pt(want.get("pt"))]), "{raw:?}");
        assert_eq!(
            e.rel.map(|p| show(&[p])),
            opt_pt(want.get("rel")).map(|p| show(&[p])),
            "{raw:?}"
        );
        assert_eq!(e.dir, None);
    }
    assert!(found >= 20);
}

#[test]
fn auto_sides_matches() {
    for c in scene_cases("autos") {
        let (a, b) = (rect(c.get("a")), rect(c.get("b")));
        let (sa, sb) = auto_sides(&a, &b);
        let want = c.get("out").as_arr();
        assert_eq!(Some(sa.as_str()), want[0].as_str(), "{c:?}");
        assert_eq!(Some(sb.as_str()), want[1].as_str(), "{c:?}");
    }
}

#[test]
fn side_point_matches() {
    let list = scene_cases("sidePts");
    assert!(list.len() > 500);
    for c in list {
        let v = (!matches!(c.get("v"), Json::Null)).then(|| c.get("v").as_num());
        // `v: NaN` is written as the string "NaN", which is not Null, so it stays Some(NaN)
        let got = side_point(
            &rect(c.get("s")),
            c.get("shape").as_str(),
            side(c.get("side")),
            v,
            c.get("f").as_num(),
        );
        assert_eq!(show(&[got]), show(&[pt(c.get("out"))]), "{c:?}");
    }
}

#[test]
fn route_matches() {
    let mut ushapes = 0;
    for c in scene_cases("routes") {
        let mut cn = conn(&c);
        let got = route(&mut cn, &pts(c.get("via")));
        assert_eq!(show(&got), show(&pts(c.get("out"))), "{c:?}");
        assert_eq!(cn.ushape, c.get("ushape").as_bool(), "{c:?}");
        ushapes += usize::from(cn.ushape);
    }
    assert!(ushapes >= 10);
}

#[test]
fn curve_pts_matches() {
    for c in scene_cases("curves") {
        let got = curve_pts(
            pt(c.get("a")),
            opt_pt(c.get("d0")),
            pt(c.get("b")),
            opt_pt(c.get("d1")),
            &pts(c.get("via")),
            c.get("bend").as_num(),
        );
        assert_eq!(show(&got), show(&pts(c.get("out"))), "{c:?}");
    }
}

#[test]
fn point_along_matches() {
    for c in scene_cases("alongs") {
        let mut cn = conn(&c);
        cn.pts = pts(c.get("pts"));
        let got = point_along(&cn, c.get("v").as_num());
        assert_eq!(show(&[got]), show(&[pt(c.get("out"))]), "{c:?}");
    }
}

#[test]
fn make_label_matches() {
    let mut labelled = 0;
    for c in scene_cases("labels") {
        let cn = conn(&c);
        let got = make_label(&cn, &rects(c.get("avoid")));
        let want = c.get("out");
        let Some(l) = got else {
            assert!(matches!(want, Json::Null), "{c:?}");
            continue;
        };
        labelled += 1;
        assert_eq!(Some(l.text.as_str()), want.get("text").as_str(), "{c:?}");
        assert_eq!(Some(l.font.as_str()), want.get("font").as_str(), "{c:?}");
        for (k, v) in [
            ("x", l.x),
            ("y", l.y),
            ("w", l.w),
            ("h", l.h),
            ("cx", l.cx),
            ("baseline", l.baseline),
            ("size", l.size),
            ("spacing", l.spacing),
        ] {
            assert_eq!(num_str(v), n(want.get(k)), "{k} of {c:?}");
        }
    }
    assert!(labelled >= 250);
}

#[test]
fn layout_table_matches() {
    for c in scene_cases("tables") {
        let mut sh = shape(
            20.0,
            30.0,
            0.0,
            0.0,
            "table",
            props(c.get("p")),
            c.get("text").as_str(),
        );
        let rows: Vec<Row> = c
            .get("rows")
            .as_arr()
            .iter()
            .map(|r| Row {
                id: r.get("id").as_str().map(str::to_string),
                kind: match r.get("kind").as_str().unwrap() {
                    "head" => RowKind::Head,
                    "rule" => RowKind::Rule,
                    _ => RowKind::Row,
                },
                cells: r
                    .get("cells")
                    .as_arr()
                    .iter()
                    .map(|c| c.as_str().unwrap().to_string())
                    .collect(),
                vals: Vec::new(),
                p: props(r.get("p")),
                y: 0.0,
                h: 0.0,
            })
            .collect();
        let mut issues = Vec::new();
        layout_table(&mut sh, rows, c.get("minW").as_num(), &mut issues, 7);
        let want = c.get("out");
        assert_eq!(num_str(sh.w), n(want.get("w")), "{c:?}");
        assert_eq!(num_str(sh.h), n(want.get("h")), "{c:?}");
        assert_eq!(sh.head_h.map(num_str), Some(n(want.get("headH"))), "{c:?}");
        let cols: Vec<_> = sh
            .cols
            .unwrap()
            .iter()
            .map(|k| (num_str(k.x), num_str(k.w)))
            .collect();
        let want_cols: Vec<_> = want
            .get("cols")
            .as_arr()
            .iter()
            .map(|k| (n(k.get("x")), n(k.get("w"))))
            .collect();
        assert_eq!(cols, want_cols, "{c:?}");
        let rows: Vec<_> = sh
            .rows
            .unwrap()
            .iter()
            .map(|r| (num_str(r.y), num_str(r.h)))
            .collect();
        let want_rows: Vec<_> = want
            .get("rows")
            .as_arr()
            .iter()
            .map(|r| (n(r.get("y")), n(r.get("h"))))
            .collect();
        assert_eq!(rows, want_rows, "{c:?}");
        let got: Vec<_> = issues
            .iter()
            .map(|i| (i.level.as_str().to_string(), i.msg.clone()))
            .collect();
        let want_issues: Vec<_> = want
            .get("issues")
            .as_arr()
            .iter()
            .map(|i| {
                let i = i.as_arr();
                (
                    i[0].as_str().unwrap().to_string(),
                    i[1].as_str().unwrap().to_string(),
                )
            })
            .collect();
        assert_eq!(got, want_issues, "{c:?}");
        assert!(issues.iter().all(|i| i.line == 7));
    }
}

#[test]
fn caption_box_matches() {
    let mut boxes = 0;
    for c in scene_cases("captions") {
        let sh = shape(
            50.0,
            60.0,
            40.0,
            40.0,
            c.get("shape").as_str().unwrap(),
            props(c.get("p")),
            c.get("text").as_str(),
        );
        let want = c.get("out");
        match caption_box(&sh) {
            None => assert!(matches!(want, Json::Null), "{c:?}"),
            Some(r) => {
                boxes += 1;
                for (k, v) in [("x", r.x), ("y", r.y), ("w", r.w), ("h", r.h)] {
                    assert_eq!(num_str(v), n(want.get(k)), "{k} of {c:?}");
                }
            }
        }
    }
    assert!(boxes >= 20);
}

#[test]
fn extent_matches() {
    for c in scene_cases("extents") {
        let conns: Vec<Conn> = c
            .get("conns")
            .as_arr()
            .iter()
            .map(|k| {
                let mut cn = conn(k);
                cn.pts = pts(k.get("pts"));
                cn.label = (!matches!(k.get("label"), Json::Null)).then(|| {
                    let r = rect(k.get("label"));
                    Label {
                        x: r.x,
                        y: r.y,
                        w: r.w,
                        h: r.h,
                        text: String::new(),
                        cx: 0.0,
                        baseline: 0.0,
                        size: 8.0,
                        spacing: 0.0,
                        font: "mono".into(),
                    }
                });
                cn
            })
            .collect();
        let got = extent(&rects(c.get("shapes")), &rects(c.get("texts")), &conns);
        let want = c.get("out");
        for (k, v) in [("x", got.x), ("y", got.y), ("w", got.w), ("h", got.h)] {
            assert_eq!(num_str(v), n(want.get(k)), "{k} of {c:?}");
        }
    }
}

/// Two ends on Object.prototype names ("constructor", "valueOf") both have `undefined` directions in the
/// TypeScript, and `undefined === undefined`: route takes them as the same direction and draws a U.
/// Expected values from Node: buildScene('a: node at 0,0\nc: node at 300,0\na.constructor -> c.valueOf\n').
#[test]
fn prototype_sides_route_as_one_direction() {
    let sc = build_scene(
        "a: node at 0,0\nc: node at 300,0\na.constructor -> c.valueOf\n",
        None,
        "",
    );
    let c = &sc.conns[0];
    let got: Vec<(f64, f64)> = c.pts.iter().map(|p| (p.x, p.y)).collect();
    assert_eq!(
        got,
        [(144.0, 32.0), (108.0, 32.0), (108.0, 32.0), (444.0, 32.0)]
    );
    assert!(c.ushape);
    assert!(sc.issues.is_empty());
}
