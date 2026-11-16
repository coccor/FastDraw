//! Finds a right-angle route around boxes when the simple route would cut through one.

use crate::js;

/// A point (`Pt` in scene.ts).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pt {
    pub x: f64,
    pub y: f64,
}

/// A box (`Box` in scene.ts; named `Rect` here to keep clear of `std::boxed::Box`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Liang–Barsky: does segment AB cross the inside of the box?
pub fn seg_hits(a: Pt, b: Pt, r: &Rect) -> bool {
    let (mut t0, mut t1) = (0.0f64, 1.0f64);
    let (dx, dy) = (b.x - a.x, b.y - a.y);
    let edges = [
        (-dx, a.x - r.x),
        (dx, r.x + r.w - a.x),
        (-dy, a.y - r.y),
        (dy, r.y + r.h - a.y),
    ];
    for (p, q) in edges {
        if p == 0.0 {
            if q <= 0.0 {
                return false;
            }
            continue;
        }
        let t = q / p;
        if p < 0.0 {
            if t > t1 {
                return false;
            }
            if t > t0 {
                t0 = t;
            }
        } else {
            if t < t0 {
                return false;
            }
            if t < t1 {
                t1 = t;
            }
        }
    }
    t1 - t0 > 1e-6
}

fn grow(b: &Rect, n: f64) -> Rect {
    Rect {
        x: b.x - n,
        y: b.y - n,
        w: b.w + 2.0 * n,
        h: b.h + 2.0 * n,
    }
}

fn inside(b: &Rect, p: Pt) -> bool {
    p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h
}

pub fn crosses(pts: &[Pt], obstacles: &[Rect]) -> bool {
    for w in pts.windows(2) {
        for o in obstacles {
            if seg_hits(w[0], w[1], &grow(o, -1.0)) {
                return true;
            }
        }
    }
    false
}

/// Drop points that sit on a straight run, and repeats.
pub fn simplify(pts: &[Pt]) -> Vec<Pt> {
    let mut out: Vec<Pt> = Vec::new();
    for &p in pts {
        let n = out.len();
        if let Some(&b) = out.last() {
            if b.x == p.x && b.y == p.y {
                continue;
            }
            if n >= 2 {
                let a = out[n - 2];
                if (a.x == b.x && b.x == p.x) || (a.y == b.y && b.y == p.y) {
                    out[n - 1] = p;
                    continue;
                }
            }
        }
        out.push(p);
    }
    out
}

const CLEAR: f64 = 12.0; // distance kept from boxes
const STUB: f64 = 20.0; // straight run out of a box before the first turn, long enough for an arrowhead
const BEND: f64 = 30.0; // cost of a turn, in px of extra length
const SHARE: f64 = 160.0; // cost of running along a stretch another connector already uses
const LANES: [f64; 3] = [CLEAR, CLEAR + 12.0, CLEAR + 24.0]; // tracks offered around each box

/// `[...new Set(v.map(Math.round))].sort((a, b) => a - b)`: the Set keeps one NaN (at its first place) and
/// folds -0 into +0; the sort is V8's, which is not a plain total order once a NaN is in the list.
fn uniq(v: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    for n in v {
        let n = js::round(n) + 0.0;
        if !out.iter().any(|&m| m == n || (m.is_nan() && n.is_nan())) {
            out.push(n);
        }
    }
    js::sort_numbers(&mut out);
    out
}

/// Do two straight connector segments run along each other for some length?
fn shared(taken: &[(Pt, Pt)], a: Pt, b: Pt) -> bool {
    taken.iter().any(|&(c, d)| {
        (a.y == b.y
            && c.y == d.y
            && a.y == c.y
            && js::min(js::max(a.x, b.x), js::max(c.x, d.x))
                - js::max(js::min(a.x, b.x), js::min(c.x, d.x))
                > 0.0)
            || (a.x == b.x
                && c.x == d.x
                && a.x == c.x
                && js::min(js::max(a.y, b.y), js::max(c.y, d.y))
                    - js::max(js::min(a.y, b.y), js::min(c.y, d.y))
                    > 0.0)
    })
}

// `routeAround` indexes with numbers that can fall outside its arrays when an end is NaN (`indexOf(NaN)` is -1).
// The TypeScript's rules, which are kept here: `dist` and `prev` are typed arrays, so an out-of-range read gives
// undefined (every comparison with it is false and every sum NaN, the same as NaN here) and a write is dropped;
// `xs[i]` and `ys[i]` on a plain array give undefined for a negative index, again read as NaN.

/// `dist[s]`, undefined (NaN) out of range.
fn at(dist: &[f64], s: i64) -> f64 {
    usize::try_from(s)
        .ok()
        .and_then(|s| dist.get(s))
        .copied()
        .unwrap_or(f64::NAN)
}

// The heap of `routeAround` is an array heap ordered by the *current* `dist` of its states, as in the
// TypeScript (a state's `dist` can drop after it was pushed, so the order is re-read, never cached).

fn heap_push(heap: &mut Vec<i64>, dist: &[f64], s: i64) {
    heap.push(s);
    let mut i = heap.len() - 1;
    while i > 0 {
        let p = (i - 1) >> 1;
        if at(dist, heap[p]) <= at(dist, heap[i]) {
            break;
        }
        heap.swap(p, i);
        i = p;
    }
}

fn heap_pop(heap: &mut Vec<i64>, dist: &[f64]) -> i64 {
    let top = heap[0];
    let last = heap.pop().unwrap();
    if !heap.is_empty() {
        heap[0] = last;
        let mut i = 0;
        loop {
            let l = 2 * i + 1;
            let r = l + 1;
            let mut m = i;
            if l < heap.len() && at(dist, heap[l]) < at(dist, heap[m]) {
                m = l;
            }
            if r < heap.len() && at(dist, heap[r]) < at(dist, heap[m]) {
                m = r;
            }
            if m == i {
                break;
            }
            heap.swap(m, i);
            i = m;
        }
    }
    top
}

/// d0/d1 point away from the shape at each end; None for a free end.
/// taken: segments of connectors routed before this one, which this route prefers not to share.
///
/// A NaN end is not found on the grid (`indexOf` gives -1), and the search then starts from the wrong point or
/// finds nothing, exactly as the TypeScript does.
pub fn route_around(
    p0: Pt,
    d0: Option<Pt>,
    p1: Pt,
    d1: Option<Pt>,
    obstacles: &[Rect],
    taken: &[(Pt, Pt)],
) -> Option<Vec<Pt>> {
    let s = d0.map_or(p0, |d| Pt {
        x: p0.x + d.x * STUB,
        y: p0.y + d.y * STUB,
    });
    let e = d1.map_or(p1, |d| Pt {
        x: p1.x + d.x * STUB,
        y: p1.y + d.y * STUB,
    });
    let xs = uniq(
        [s.x, e.x].into_iter().chain(
            obstacles
                .iter()
                .flat_map(|o| LANES.iter().flat_map(move |l| [o.x - l, o.x + o.w + l])),
        ),
    );
    let ys = uniq(
        [s.y, e.y].into_iter().chain(
            obstacles
                .iter()
                .flat_map(|o| LANES.iter().flat_map(move |l| [o.y - l, o.y + o.h + l])),
        ),
    );
    let (w, h) = (xs.len() as i64, ys.len() as i64);
    if w * h > 60000 {
        return None;
    }
    // `indexOf` (strict equality, so -1 for NaN)
    let index = |v: &[f64], n: f64| {
        v.iter()
            .position(|&m| m == js::round(n))
            .map_or(-1, |i| i as i64)
    };
    let si = index(&xs, s.x) + index(&ys, s.y) * w;
    let ei = index(&xs, e.x) + index(&ys, e.y) * w;
    let pt = |i: i64| Pt {
        x: if i % w >= 0 {
            xs[(i % w) as usize]
        } else {
            f64::NAN
        },
        y: if i.div_euclid(w) >= 0 {
            ys[i.div_euclid(w) as usize]
        } else {
            f64::NAN
        },
    };
    let wide: Vec<Rect> = obstacles.iter().map(|o| grow(o, CLEAR - 1.0)).collect();
    let tight: Vec<Rect> = obstacles.iter().map(|o| grow(o, 2.0)).collect();
    let free = |i: i64| i == si || i == ei || !wide.iter().any(|o| inside(o, pt(i)));
    let open = |a: i64, b: i64| {
        let (pa, pb) = (pt(a), pt(b));
        !tight.iter().any(|o| seg_hits(pa, pb, o))
    };

    // Dijkstra over (grid point, direction of the last move): 0 = horizontal, 1 = vertical
    let n = (w * h * 2) as usize;
    let mut dist = vec![f64::INFINITY; n];
    let mut prev = vec![-1i64; n];
    let mut heap: Vec<i64> = Vec::new();
    let start_dirs: &[i64] = match d0 {
        Some(d) if d.x != 0.0 => &[0],
        Some(_) => &[1],
        None => &[0, 1],
    };
    for &d in start_dirs {
        let st = si * 2 + d;
        if let Some(slot) = usize::try_from(st).ok().and_then(|st| dist.get_mut(st)) {
            *slot = 0.0;
        }
        heap_push(&mut heap, &dist, st);
    }
    let end_dir = d1.map(|d| i64::from(d.x == 0.0));
    let mut goal = -1;
    while !heap.is_empty() {
        let s = heap_pop(&mut heap, &dist);
        let (i, dir) = (s >> 1, s & 1);
        if i == ei {
            goal = s;
            break;
        }
        let (x, y) = (i % w, i.div_euclid(w));
        let mut steps: Vec<(i64, i64)> = Vec::with_capacity(4);
        if x > 0 {
            steps.push((i - 1, 0));
        }
        if x < w - 1 {
            steps.push((i + 1, 0));
        }
        if y > 0 {
            steps.push((i - w, 1));
        }
        if y < h - 1 {
            steps.push((i + w, 1));
        }
        for (j, nd) in steps {
            if !free(j) || !open(i, j) {
                continue;
            }
            let (a, b) = (pt(i), pt(j));
            let mut cost = at(&dist, s)
                + (a.x - b.x).abs()
                + (a.y - b.y).abs()
                + if nd != dir { BEND } else { 0.0 }
                + if !taken.is_empty() && shared(taken, a, b) {
                    SHARE
                } else {
                    0.0
                };
            if j == ei && end_dir.is_some_and(|ed| nd != ed) {
                cost += BEND;
            }
            let t = j * 2 + nd;
            if cost < at(&dist, t) {
                dist[t as usize] = cost;
                prev[t as usize] = s;
                heap_push(&mut heap, &dist, t);
            }
        }
    }
    // `if (goal < 0) return null`: a goal state of -1 or -2 (both ends NaN on the same row) is no route
    if goal < 0 {
        return None;
    }
    let mut path = Vec::new();
    let mut s = goal;
    while s >= 0 {
        path.push(pt(s >> 1));
        s = prev[s as usize];
    }
    path.reverse();
    let mut all = Vec::with_capacity(path.len() + 2);
    all.push(p0);
    all.extend(path);
    all.push(p1);
    Some(simplify(&all))
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn p(x: f64, y: f64) -> Pt {
        Pt { x, y }
    }

    #[test]
    fn a_segment_through_a_box_hits_and_one_along_its_edge_does_not() {
        let r = Rect {
            x: 10.0,
            y: 10.0,
            w: 10.0,
            h: 10.0,
        };
        assert!(seg_hits(p(0.0, 15.0), p(30.0, 15.0), &r));
        assert!(!seg_hits(p(0.0, 10.0), p(30.0, 10.0), &r));
        assert!(!seg_hits(p(0.0, 0.0), p(5.0, 30.0), &r));
    }

    #[test]
    fn simplify_drops_repeats_and_straight_runs() {
        let got = simplify(&[
            p(0.0, 0.0),
            p(0.0, 0.0),
            p(5.0, 0.0),
            p(9.0, 0.0),
            p(9.0, 4.0),
        ]);
        assert_eq!(got, vec![p(0.0, 0.0), p(9.0, 0.0), p(9.0, 4.0)]);
    }

    #[test]
    fn a_nan_end_is_looked_up_as_minus_one_like_indexof() {
        // from Node: the search starts from the wrong grid point and the route's first point stays NaN
        let wall = Rect {
            x: 100.0,
            y: 60.0,
            w: 40.0,
            h: 100.0,
        };
        let got = route_around(
            p(f64::NAN, 125.0),
            None,
            p(300.0, 125.0),
            None,
            &[wall],
            &[],
        )
        .unwrap();
        assert!(got[0].x.is_nan() && got[0].y == 125.0);
        assert_eq!(&got[1..], &[p(300.0, 48.0), p(300.0, 125.0)]);
        // NaN in y puts the start before the grid: no route
        assert_eq!(
            route_around(p(0.0, f64::NAN), None, p(300.0, 125.0), None, &[wall], &[]),
            None
        );
    }

    #[test]
    fn both_ends_nan_on_the_same_row_is_no_route() {
        // from Node: the goal state is negative, which is null
        let n = f64::NAN;
        assert_eq!(route_around(p(n, n), None, p(n, n), None, &[], &[]), None);
        assert_eq!(
            route_around(p(n, 0.0), None, p(n, 0.0), None, &[], &[]),
            None
        );
    }
}
