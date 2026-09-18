import { blocks2x2, components, neighbours } from './grid';
import { Mark } from './types';

export interface IslandInfo {
  cells: number[];
  /** cell indices of clues inside this island */
  clueCells: number[];
  /** clue value when the island has exactly one clue, else 0 */
  target: number;
  /** exactly one clue and exactly that many cells */
  complete: boolean;
  /** walled in too tightly (fewer cells than the clue) or has no clue at all */
  error: boolean;
}

export interface WallGroup {
  cells: number[];
  /** no unknown cells border the group, so it can never join the others */
  isolated: boolean;
}

export interface Analysis {
  islandOf: Int32Array;
  islands: IslandInfo[];
  wallOf: Int32Array;
  walls: WallGroup[];
  /** index of the largest wall group (-1 if there are no walls) */
  mainWall: number;
  /** cells taking part in a 2×2 wall pool */
  poolCells: Set<number>;
  errorCells: Set<number>;
  solved: boolean;
}

/**
 * Analyse a board as the player sees it: walls are wall-marked cells and every
 * connected region of non-wall cells is a (possibly unfinished) island.
 */
export function analyse(w: number, h: number, clues: number[], marks: ArrayLike<number>): Analysis {
  const n = w * h;
  const adj = neighbours(w, h);
  const isWall = (i: number) => clues[i] === 0 && marks[i] === Mark.Wall;
  const isUnknown = (i: number) => clues[i] === 0 && marks[i] === Mark.Unknown;

  const errorCells = new Set<number>();

  // regions still holding several clues or too many cells just need more walls, so they aren't errors
  const isl = components(n, adj, (i) => !isWall(i));
  const islands: IslandInfo[] = isl.comps.map((cells) => {
    const clueCells = cells.filter((c) => clues[c] > 0);
    const target = clueCells.length === 1 ? clues[clueCells[0]] : 0;
    const complete = target > 0 && cells.length === target;
    const error = clueCells.length === 0 || (target > 0 && cells.length < target);
    if (error) cells.forEach((c) => errorCells.add(c));
    return { cells, clueCells, target, complete, error };
  });

  const wl = components(n, adj, isWall);
  const walls: WallGroup[] = wl.comps.map((cells) => ({
    cells,
    isolated: wl.comps.length > 1 && !cells.some((c) => adj[c].some(isUnknown)),
  }));
  let mainWall = -1;
  walls.forEach((g, i) => {
    if (mainWall === -1 || g.cells.length > walls[mainWall].cells.length) mainWall = i;
  });
  for (const g of walls) if (g.isolated) g.cells.forEach((c) => errorCells.add(c));

  const poolCells = new Set<number>();
  for (const i of blocks2x2(w, h, isWall)) {
    for (const c of [i, i + 1, i + w, i + w + 1]) {
      poolCells.add(c);
      errorCells.add(c);
    }
  }

  return {
    islandOf: isl.label,
    islands,
    wallOf: wl.label,
    walls,
    mainWall,
    poolCells,
    errorCells,
    solved: isSolved(w, h, clues, marks),
  };
}

/** Rule-based win check with unknown cells treated as island. */
export function isSolved(w: number, h: number, clues: number[], marks: ArrayLike<number>): boolean {
  const n = w * h;
  const adj = neighbours(w, h);
  const isWall = (i: number) => clues[i] === 0 && marks[i] === Mark.Wall;
  if (blocks2x2(w, h, isWall).length) return false;
  if (components(n, adj, isWall).comps.length > 1) return false;
  for (const cells of components(n, adj, (i) => !isWall(i)).comps) {
    const clueCells = cells.filter((c) => clues[c] > 0);
    if (clueCells.length !== 1 || clues[clueCells[0]] !== cells.length) return false;
  }
  return true;
}
