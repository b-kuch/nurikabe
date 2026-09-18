/** Orthogonal neighbour lists for every cell of a w×h grid (cached per size). */
const adjCache = new Map<string, number[][]>();

export function neighbours(w: number, h: number): number[][] {
  const key = `${w}x${h}`;
  let adj = adjCache.get(key);
  if (adj) return adj;
  adj = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const list: number[] = [];
      if (y > 0) list.push((y - 1) * w + x);
      if (x > 0) list.push(y * w + x - 1);
      if (x < w - 1) list.push(y * w + x + 1);
      if (y < h - 1) list.push((y + 1) * w + x);
      adj.push(list);
    }
  }
  adjCache.set(key, adj);
  return adj;
}

/**
 * Label connected components of cells satisfying `inSet`.
 * Returns labels (-1 for cells outside the set) and the member lists.
 */
export function components(
  n: number,
  adj: number[][],
  inSet: (i: number) => boolean,
): { label: Int32Array; comps: number[][] } {
  const label = new Int32Array(n).fill(-1);
  const comps: number[][] = [];
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (label[s] !== -1 || !inSet(s)) continue;
    const id = comps.length;
    const cells: number[] = [];
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      for (const nb of adj[c]) {
        if (label[nb] === -1 && inSet(nb)) {
          label[nb] = id;
          stack.push(nb);
        }
      }
    }
    comps.push(cells);
  }
  return { label, comps };
}

/** Top-left indices of every 2×2 block whose four cells satisfy `pred`. */
export function blocks2x2(w: number, h: number, pred: (i: number) => boolean): number[] {
  const out: number[] = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (pred(i) && pred(i + 1) && pred(i + w) && pred(i + w + 1)) out.push(i);
    }
  }
  return out;
}
