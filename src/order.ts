// A total order on numbers for Array.prototype.sort: NaN after every number, equal to another NaN. With `a - b`,
// a NaN in the list makes the comparator inconsistent, and the result then depends on the sort algorithm, which
// is not the same in every Node version (Node 26's V8 orders such a list differently from Node 22's). A
// consistent order gives every version, and the Rust port, the same answer.
export const byNumber = (a: number, b: number): number =>
  Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : Number.isNaN(b) ? -1 : a < b ? -1 : a > b ? 1 : 0;
