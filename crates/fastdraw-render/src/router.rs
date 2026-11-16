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

/// Math.round, sorted ascending, without repeats (`new Set` keeps -0 as +0).
fn uniq(v: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut v: Vec<f64> = v.map(|n| js::round(n) + 0.0).collect();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    v.dedup();
    v
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

// The heap of `routeAround` is an array heap ordered by the *current* `dist` of its states, as in the
// TypeScript (a state's `dist` can drop after it was pushed, so the order is re-read, never cached).

fn heap_push(heap: &mut Vec<usize>, dist: &[f64], s: usize) {
    heap.push(s);
    let mut i = heap.len() - 1;
    while i > 0 {
        let p = (i - 1) >> 1;
        if dist[heap[p]] <= dist[heap[i]] {
            break;
        }
        heap.swap(p, i);
        i = p;
    }
}

fn heap_pop(heap: &mut Vec<usize>, dist: &[f64]) -> usize {
    let top = heap[0];
    let last = heap.pop().unwrap();
    if !heap.is_empty() {
        heap[0] = last;
        let mut i = 0;
        loop {
            let l = 2 * i + 1;
            let r = l + 1;
            let mut m = i;
            if l < heap.len() && dist[heap[l]] < dist[heap[m]] {
                m = l;
            }
            if r < heap.len() && dist[heap[r]] < dist[heap[m]] {
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
/// Like the TypeScript, this assumes finite coordinates (a NaN end has no place on the grid; None is returned).
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
    let (w, h) = (xs.len(), ys.len());
    if w * h > 60000 {
        return None;
    }
    let index = |v: &[f64], n: f64| v.iter().position(|&m| m == js::round(n));
    let si = index(&xs, s.x)? + index(&ys, s.y)? * w;
    let ei = index(&xs, e.x)? + index(&ys, e.y)? * w;
    let pt = |i: usize| Pt {
        x: xs[i % w],
        y: ys[i / w],
    };
    let wide: Vec<Rect> = obstacles.iter().map(|o| grow(o, CLEAR - 1.0)).collect();
    let tight: Vec<Rect> = obstacles.iter().map(|o| grow(o, 2.0)).collect();
    let free = |i: usize| i == si || i == ei || !wide.iter().any(|o| inside(o, pt(i)));
    let open = |a: usize, b: usize| {
        let (pa, pb) = (pt(a), pt(b));
        !tight.iter().any(|o| seg_hits(pa, pb, o))
    };

    // Dijkstra over (grid point, direction of the last move): 0 = horizontal, 1 = vertical
    let mut dist = vec![f64::INFINITY; w * h * 2];
    let mut prev = vec![usize::MAX; w * h * 2];
    let mut heap: Vec<usize> = Vec::new();
    let start_dirs: &[usize] = match d0 {
        Some(d) if d.x != 0.0 => &[0],
        Some(_) => &[1],
        None => &[0, 1],
    };
    for &d in start_dirs {
        dist[si * 2 + d] = 0.0;
        heap_push(&mut heap, &dist, si * 2 + d);
    }
    let end_dir = d1.map(|d| usize::from(d.x == 0.0));
    let mut goal = None;
    while !heap.is_empty() {
        let s = heap_pop(&mut heap, &dist);
        let (i, dir) = (s >> 1, s & 1);
        if i == ei {
            goal = Some(s);
            break;
        }
        let (x, y) = (i % w, i / w);
        let mut steps: Vec<(usize, usize)> = Vec::with_capacity(4);
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
            let mut cost = dist[s]
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
            if cost < dist[t] {
                dist[t] = cost;
                prev[t] = s;
                heap_push(&mut heap, &dist, t);
            }
        }
    }
    let mut s = goal?;
    let mut path = Vec::new();
    loop {
        path.push(pt(s >> 1));
        if prev[s] == usize::MAX {
            break;
        }
        s = prev[s];
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
}
