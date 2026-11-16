//! `v.sort((a, b) => a - b)` on numbers, as V8 does it: TimSort (array-sort.tq), a comparator result of NaN
//! counting as 0. With NaN present the comparator is not a consistent order, so the result depends on the
//! exact algorithm, which is reproduced here rather than approximated.

const MIN_GALLOP_WINS: usize = 7;

/// `v.sort((a, b) => a - b)`.
pub fn sort_numbers(v: &mut [f64]) {
    TimSort {
        a: v,
        min_gallop: MIN_GALLOP_WINS,
        runs: Vec::new(),
    }
    .sort();
}

struct TimSort<'a> {
    a: &'a mut [f64],
    min_gallop: usize,
    /// (base, length) of each pending run
    runs: Vec<(usize, usize)>,
}

/// The comparator `(a, b) => a - b`, with a NaN result read as 0.
fn cmp(x: f64, y: f64) -> f64 {
    let d = x - y;
    if d.is_nan() { 0.0 } else { d }
}

impl TimSort<'_> {
    fn sort(&mut self) {
        let mut remaining = self.a.len();
        if remaining < 2 {
            return;
        }
        let min_run = {
            let (mut n, mut r) = (remaining, 0);
            while n >= 64 {
                r |= n & 1;
                n >>= 1;
            }
            n + r
        };
        let mut low = 0;
        while remaining != 0 {
            let mut run = self.count_and_make_run(low, low + remaining);
            if run < min_run {
                let forced = min_run.min(remaining);
                self.binary_insertion_sort(low, low + run, low + forced);
                run = forced;
            }
            self.runs.push((low, run));
            self.merge_collapse();
            low += run;
            remaining -= run;
        }
        self.merge_force_collapse();
    }

    fn count_and_make_run(&mut self, low_arg: usize, high: usize) -> usize {
        let low = low_arg + 1;
        if low == high {
            return 1;
        }
        let mut run = 2;
        let mut order = cmp(self.a[low], self.a[low - 1]);
        let descending = order < 0.0;
        let mut previous = self.a[low];
        for idx in low + 1..high {
            let current = self.a[idx];
            order = cmp(current, previous);
            if descending {
                if order >= 0.0 {
                    break;
                }
            } else if order < 0.0 {
                break;
            }
            previous = current;
            run += 1;
        }
        if descending {
            self.a[low_arg..low_arg + run].reverse();
        }
        run
    }

    fn binary_insertion_sort(&mut self, low: usize, start_arg: usize, high: usize) {
        let mut start = if low == start_arg {
            start_arg + 1
        } else {
            start_arg
        };
        while start < high {
            let (mut left, mut right) = (low, start);
            let pivot = self.a[right];
            while left < right {
                let mid = left + ((right - left) >> 1);
                if cmp(pivot, self.a[mid]) < 0.0 {
                    right = mid;
                } else {
                    left = mid + 1;
                }
            }
            self.a.copy_within(left..start, left + 1);
            self.a[left] = pivot;
            start += 1;
        }
    }

    fn run_invariant(&self, n: usize) -> bool {
        n < 2 || self.runs[n - 2].1 > self.runs[n - 1].1 + self.runs[n].1
    }

    fn merge_collapse(&mut self) {
        while self.runs.len() > 1 {
            let mut n = self.runs.len() - 2;
            if !self.run_invariant(n + 1) || !self.run_invariant(n) {
                if self.runs[n - 1].1 < self.runs[n + 1].1 {
                    n -= 1;
                }
                self.merge_at(n);
            } else if self.runs[n].1 <= self.runs[n + 1].1 {
                self.merge_at(n);
            } else {
                break;
            }
        }
    }

    fn merge_force_collapse(&mut self) {
        while self.runs.len() > 1 {
            let mut n = self.runs.len() - 2;
            if n > 0 && self.runs[n - 1].1 < self.runs[n + 1].1 {
                n -= 1;
            }
            self.merge_at(n);
        }
    }

    fn merge_at(&mut self, i: usize) {
        let (mut base_a, mut len_a) = self.runs[i];
        let (base_b, mut len_b) = self.runs[i + 1];
        self.runs[i].1 = len_a + len_b;
        if i + 3 == self.runs.len() {
            self.runs[i + 1] = self.runs[i + 2];
        }
        self.runs.pop();
        // elements of A already in place
        let k = gallop_right(self.a, self.a[base_b], base_a, len_a, 0);
        base_a += k;
        len_a -= k;
        if len_a == 0 {
            return;
        }
        // elements of B already in place
        len_b = gallop_left(self.a, self.a[base_a + len_a - 1], base_b, len_b, len_b - 1);
        if len_b == 0 {
            return;
        }
        if len_a <= len_b {
            self.merge_low(base_a, len_a, base_b, len_b);
        } else {
            self.merge_high(base_a, len_a, base_b, len_b);
        }
    }

    fn merge_low(&mut self, base_a: usize, mut len_a: usize, base_b: usize, mut len_b: usize) {
        let temp: Vec<f64> = self.a[base_a..base_a + len_a].to_vec();
        let (mut dest, mut ct, mut cb) = (base_a, 0usize, base_b);
        self.a[dest] = self.a[cb];
        dest += 1;
        cb += 1;
        len_b -= 1;
        // Succeed: the rest of A goes last; CopyB: the rest of B, then A's last element
        let copy_b = 'merge: {
            if len_b == 0 {
                break 'merge false;
            }
            if len_a == 1 {
                break 'merge true;
            }
            let mut min_gallop = self.min_gallop;
            loop {
                let (mut wins_a, mut wins_b) = (0usize, 0usize);
                loop {
                    if cmp(self.a[cb], temp[ct]) < 0.0 {
                        self.a[dest] = self.a[cb];
                        dest += 1;
                        cb += 1;
                        wins_b += 1;
                        len_b -= 1;
                        wins_a = 0;
                        if len_b == 0 {
                            break 'merge false;
                        }
                        if wins_b >= min_gallop {
                            break;
                        }
                    } else {
                        self.a[dest] = temp[ct];
                        dest += 1;
                        ct += 1;
                        wins_a += 1;
                        len_a -= 1;
                        wins_b = 0;
                        if len_a == 1 {
                            break 'merge true;
                        }
                        if wins_a >= min_gallop {
                            break;
                        }
                    }
                }
                min_gallop += 1;
                let mut first = true;
                while wins_a >= MIN_GALLOP_WINS || wins_b >= MIN_GALLOP_WINS || first {
                    first = false;
                    min_gallop = (min_gallop - 1).max(1);
                    self.min_gallop = min_gallop;
                    wins_a = gallop_right(&temp, self.a[cb], ct, len_a, 0);
                    if wins_a > 0 {
                        self.a[dest..dest + wins_a].copy_from_slice(&temp[ct..ct + wins_a]);
                        dest += wins_a;
                        ct += wins_a;
                        len_a -= wins_a;
                        if len_a == 1 {
                            break 'merge true;
                        }
                        // impossible with a consistent comparator, which this one is not
                        if len_a == 0 {
                            break 'merge false;
                        }
                    }
                    self.a[dest] = self.a[cb];
                    dest += 1;
                    cb += 1;
                    len_b -= 1;
                    if len_b == 0 {
                        break 'merge false;
                    }
                    wins_b = gallop_left(self.a, temp[ct], cb, len_b, 0);
                    if wins_b > 0 {
                        self.a.copy_within(cb..cb + wins_b, dest);
                        dest += wins_b;
                        cb += wins_b;
                        len_b -= wins_b;
                        if len_b == 0 {
                            break 'merge false;
                        }
                    }
                    self.a[dest] = temp[ct];
                    dest += 1;
                    ct += 1;
                    len_a -= 1;
                    if len_a == 1 {
                        break 'merge true;
                    }
                }
                min_gallop += 1;
                self.min_gallop = min_gallop;
            }
        };
        if copy_b {
            self.a.copy_within(cb..cb + len_b, dest);
            self.a[dest + len_b] = temp[ct];
        } else if len_a > 0 {
            self.a[dest..dest + len_a].copy_from_slice(&temp[ct..ct + len_a]);
        }
    }

    fn merge_high(&mut self, base_a: usize, mut len_a: usize, base_b: usize, mut len_b: usize) {
        let temp: Vec<f64> = self.a[base_b..base_b + len_b].to_vec();
        // the cursors run down, and can pass zero by one, so they are signed
        let mut dest = (base_b + len_b) as isize - 1;
        let mut ct = len_b as isize - 1;
        let mut ca = (base_a + len_a) as isize - 1;
        self.a[dest as usize] = self.a[ca as usize];
        dest -= 1;
        ca -= 1;
        len_a -= 1;
        // Succeed: the rest of B goes first; CopyA: the rest of A, then B's first element
        let copy_a = 'merge: {
            if len_a == 0 {
                break 'merge false;
            }
            if len_b == 1 {
                break 'merge true;
            }
            let mut min_gallop = self.min_gallop;
            loop {
                let (mut wins_a, mut wins_b) = (0usize, 0usize);
                loop {
                    if cmp(temp[ct as usize], self.a[ca as usize]) < 0.0 {
                        self.a[dest as usize] = self.a[ca as usize];
                        dest -= 1;
                        ca -= 1;
                        wins_a += 1;
                        len_a -= 1;
                        wins_b = 0;
                        if len_a == 0 {
                            break 'merge false;
                        }
                        if wins_a >= min_gallop {
                            break;
                        }
                    } else {
                        self.a[dest as usize] = temp[ct as usize];
                        dest -= 1;
                        ct -= 1;
                        wins_b += 1;
                        len_b -= 1;
                        wins_a = 0;
                        if len_b == 1 {
                            break 'merge true;
                        }
                        if wins_b >= min_gallop {
                            break;
                        }
                    }
                }
                min_gallop += 1;
                let mut first = true;
                while wins_a >= MIN_GALLOP_WINS || wins_b >= MIN_GALLOP_WINS || first {
                    first = false;
                    min_gallop = (min_gallop - 1).max(1);
                    self.min_gallop = min_gallop;
                    let k = gallop_right(self.a, temp[ct as usize], base_a, len_a, len_a - 1);
                    wins_a = len_a - k;
                    if wins_a > 0 {
                        dest -= wins_a as isize;
                        ca -= wins_a as isize;
                        let from = (ca + 1) as usize;
                        self.a.copy_within(from..from + wins_a, (dest + 1) as usize);
                        len_a -= wins_a;
                        if len_a == 0 {
                            break 'merge false;
                        }
                    }
                    self.a[dest as usize] = temp[ct as usize];
                    dest -= 1;
                    ct -= 1;
                    len_b -= 1;
                    if len_b == 1 {
                        break 'merge true;
                    }
                    let k = gallop_left(&temp, self.a[ca as usize], 0, len_b, len_b - 1);
                    wins_b = len_b - k;
                    if wins_b > 0 {
                        dest -= wins_b as isize;
                        ct -= wins_b as isize;
                        let (s, d) = ((ct + 1) as usize, (dest + 1) as usize);
                        self.a[d..d + wins_b].copy_from_slice(&temp[s..s + wins_b]);
                        len_b -= wins_b;
                        if len_b == 1 {
                            break 'merge true;
                        }
                        // impossible with a consistent comparator, which this one is not
                        if len_b == 0 {
                            break 'merge false;
                        }
                    }
                    self.a[dest as usize] = self.a[ca as usize];
                    dest -= 1;
                    ca -= 1;
                    len_a -= 1;
                    if len_a == 0 {
                        break 'merge false;
                    }
                }
                min_gallop += 1;
                self.min_gallop = min_gallop;
            }
        };
        if copy_a {
            dest -= len_a as isize;
            ca -= len_a as isize;
            let from = (ca + 1) as usize;
            self.a.copy_within(from..from + len_a, (dest + 1) as usize);
            self.a[dest as usize] = temp[ct as usize];
        } else if len_b > 0 {
            let d = (dest - (len_b as isize - 1)) as usize;
            self.a[d..d + len_b].copy_from_slice(&temp[..len_b]);
        }
    }
}

/// The k with `a[base + k - 1] < key <= a[base + k]`, in the run `a[base..base + length]`, searching out from `hint`.
fn gallop_left(a: &[f64], key: f64, base: usize, length: usize, hint: usize) -> usize {
    let (mut last, mut offset) = (0usize, 1usize);
    let (last, offset) = if cmp(a[base + hint], key) < 0.0 {
        // a[hint] < key: gallop right until a[hint + last] < key <= a[hint + offset]
        let max = length - hint;
        while offset < max {
            if cmp(a[base + hint + offset], key) >= 0.0 {
                break;
            }
            last = offset;
            offset = (offset << 1) + 1;
        }
        offset = offset.min(max);
        ((last + hint) as isize, (offset + hint) as isize)
    } else {
        // key <= a[hint]: gallop left until a[hint - offset] < key <= a[hint - last]
        let max = hint + 1;
        while offset < max {
            if cmp(a[base + hint - offset], key) < 0.0 {
                break;
            }
            last = offset;
            offset = (offset << 1) + 1;
        }
        offset = offset.min(max);
        (
            hint as isize - offset as isize,
            hint as isize - last as isize,
        )
    };
    let (mut last, mut offset) = (last + 1, offset);
    while last < offset {
        let m = last + ((offset - last) >> 1);
        if cmp(a[base + m as usize], key) < 0.0 {
            last = m + 1;
        } else {
            offset = m;
        }
    }
    offset as usize
}

/// The k with `a[base + k - 1] <= key < a[base + k]`.
fn gallop_right(a: &[f64], key: f64, base: usize, length: usize, hint: usize) -> usize {
    let (mut last, mut offset) = (0usize, 1usize);
    let (last, offset) = if cmp(key, a[base + hint]) < 0.0 {
        // key < a[hint]: gallop left until a[hint - offset] <= key < a[hint - last]
        let max = hint + 1;
        while offset < max {
            if cmp(key, a[base + hint - offset]) >= 0.0 {
                break;
            }
            last = offset;
            offset = (offset << 1) + 1;
        }
        offset = offset.min(max);
        (
            hint as isize - offset as isize,
            hint as isize - last as isize,
        )
    } else {
        // a[hint] <= key: gallop right until a[hint + last] <= key < a[hint + offset]
        let max = length - hint;
        while offset < max {
            if cmp(key, a[base + hint + offset]) < 0.0 {
                break;
            }
            last = offset;
            offset = (offset << 1) + 1;
        }
        offset = offset.min(max);
        ((last + hint) as isize, (offset + hint) as isize)
    };
    let (mut last, mut offset) = (last + 1, offset);
    while last < offset {
        let m = last + ((offset - last) >> 1);
        if cmp(key, a[base + m as usize]) < 0.0 {
            offset = m;
        } else {
            last = m + 1;
        }
    }
    offset as usize
}
