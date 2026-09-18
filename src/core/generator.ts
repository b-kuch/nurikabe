import { blocks2x2, components, neighbours } from './grid';
import { makeRng, randInt, shuffle, type Rng } from './rng';
import { LEVEL_NAMES, Solver, UNK, type Level } from './solver';
import type { Difficulty, Puzzle } from './types';

export interface Params {
  maxIsland: number;
  /** probability of growing an existing island rather than starting a new one */
  growBias: number;
  target: Level;
  /** required average island size (0 = no requirement) */
  minAvg: number;
}

export const PARAMS: Record<Difficulty, Params> = {
  easy: { maxIsland: 6, growBias: 0.7, target: 0, minAvg: 0 },
  medium: { maxIsland: 8, growBias: 0.7, target: 1, minAvg: 0 },
  hard: { maxIsland: 12, growBias: 0.8, target: 2, minAvg: 0 },
  // sized per board in paramsFor()
  expert: { maxIsland: 0, growBias: 0.95, target: 2, minAvg: 0 },
};

/**
 * Expert asks for fewer, larger islands than hard. The required average island size
 * shrinks with the board, since unique puzzles with big islands get rare as boards grow:
 * ≈3.8 on 6×6, 3.3 on 10×10, 2.7 on 15×15, 2.5 on 20×20 (hard averages ≈1.7–2.8).
 */
function paramsFor(difficulty: Difficulty, w: number, h: number): Params {
  const base = PARAMS[difficulty];
  if (difficulty !== 'expert') return base;
  const minAvg = Math.min(3.8, Math.max(2.5, 4.5 - 0.12 * Math.sqrt(w * h)));
  return { ...base, minAvg, maxIsland: 12 };
}

/** Average island size, i.e. island cells per clue. */
function avgIsland(clues: number[]): number {
  let sum = 0;
  let count = 0;
  for (const c of clues) {
    if (c > 0) {
      sum += c;
      count++;
    }
  }
  return count ? sum / count : 0;
}

export interface GenerateOptions {
  w: number;
  h: number;
  difficulty: Difficulty;
  seed: number;
  /** stop looking for an exact grade after this long and return the closest match */
  timeBudgetMs?: number;
  /** override the expert average-island-size requirement (for tuning) */
  minAvg?: number;
}

/**
 * Build a random valid Nurikabe solution: start fully walled and keep turning
 * cells inside 2×2 wall blocks into island cells while keeping every rule intact.
 * `sol` holds 1 = wall, 0 = island.
 */
export function randomSolution(w: number, h: number, p: Params, rng: Rng): { sol: Uint8Array; islands: number[][] } | null {
  const n = w * h;
  const adj = neighbours(w, h);
  const sol = new Uint8Array(n).fill(1);
  const owner = new Int32Array(n).fill(-1);
  const islands: number[][] = [];

  const tryCell = (c: number, pass: 'grow' | 'new'): boolean => {
    const adjIslands = [...new Set(adj[c].map((nb) => owner[nb]).filter((o) => o !== -1))];
    if (pass === 'new' && adjIslands.length !== 0) return false;
    if (pass === 'grow' && (adjIslands.length !== 1 || islands[adjIslands[0]].length >= p.maxIsland)) return false;
    sol[c] = 0;
    if (!wallsConnected(n, adj, sol)) {
      sol[c] = 1;
      return false;
    }
    if (pass === 'new') {
      owner[c] = islands.length;
      islands.push([c]);
    } else {
      owner[c] = adjIslands[0];
      islands[adjIslands[0]].push(c);
    }
    return true;
  };

  for (;;) {
    const pools = shuffle(rng, blocks2x2(w, h, (i) => sol[i] === 1));
    if (!pools.length) return { sol, islands };
    const passes: ('grow' | 'new')[] = rng() < p.growBias ? ['grow', 'new'] : ['new', 'grow'];
    let done = false;
    // the first pool usually works; fall back to others if it's stuck
    for (const corner of pools) {
      const cells = shuffle(rng, [corner, corner + 1, corner + w, corner + w + 1]);
      for (const pass of passes) {
        for (const c of cells) if ((done = tryCell(c, pass))) break;
        if (done) break;
      }
      if (done) break;
    }
    if (!done) return null;
  }
}

function wallsConnected(n: number, adj: number[][], sol: Uint8Array): boolean {
  const { comps } = components(n, adj, (i) => sol[i] === 1);
  return comps.length === 1;
}

/** A candidate puzzle: the solution plus where each island's clue sits. */
interface Candidate {
  sol: Uint8Array;
  clues: number[];
}

/** Recompute clue values after the solution changed: one clue per island, value = size. */
function reclue(w: number, h: number, sol: Uint8Array, oldClues: number[], rng: Rng, maxIsland: number): number[] | null {
  const n = w * h;
  const adj = neighbours(w, h);
  const clues = new Array<number>(n).fill(0);
  for (const cells of components(n, adj, (i) => sol[i] === 0).comps) {
    if (cells.length > maxIsland) return null;
    const had = cells.filter((c) => oldClues[c] > 0);
    const at = had.length ? had[randInt(rng, had.length)] : cells[randInt(rng, cells.length)];
    clues[at] = cells.length;
  }
  return clues;
}

function validSolution(w: number, h: number, sol: Uint8Array): boolean {
  const n = w * h;
  if (blocks2x2(w, h, (i) => sol[i] === 1).length) return false;
  return wallsConnected(n, neighbours(w, h), sol);
}

/** Solve with rules up to `level`; score = number of cells determined. */
function score(w: number, h: number, clues: number[], level: Level): { score: number; state: Uint8Array } {
  const s = new Solver(w, h, clues);
  s.solve(level);
  return { score: w * h - s.unknownCount(), state: s.state };
}

/**
 * Hill-climb: tweak the solution near cells the solver can't determine,
 * keeping changes that let it determine at least as many cells.
 * Climbing always uses the cheap rule tiers (≤ medium); for a hard target,
 * trial-and-error is only tried once the cheap rules leave few unknowns.
 */
function improve(w: number, h: number, start: Candidate, p: Params, rng: Rng, deadline: number): Candidate | null {
  const n = w * h;
  const adj = neighbours(w, h);
  const climbLevel: Level = p.target === 2 ? 1 : p.target;
  let cur = start;
  let cs = score(w, h, cur.clues, climbLevel);
  let bestTried = -1;
  const maxIter = n * 3;

  for (let iter = 0; iter < maxIter; iter++) {
    if (cs.score === n) return cur;
    if (p.target === 2 && cs.score > bestTried && n - cs.score <= Math.max(12, n * 0.2)) {
      bestTried = cs.score;
      const s = new Solver(w, h, cur.clues, cs.state);
      if (s.solve(2).solved) return cur;
    }
    if (Date.now() > deadline) return null;

    const unknown: number[] = [];
    for (let i = 0; i < n; i++) if (cs.state[i] === UNK) unknown.push(i);
    const c = unknown[randInt(rng, unknown.length)];

    const sol = cur.sol.slice();
    let clues: number[] | null;
    const roll = rng();
    if (roll < 0.3) {
      // move the clue of an island next to (or containing) c onto another of its cells
      const isl = components(n, adj, (i) => sol[i] === 0);
      const near = [c, ...adj[c]].filter((x) => sol[x] === 0);
      if (!near.length) continue;
      const cells = isl.comps[isl.label[near[randInt(rng, near.length)]]];
      clues = cur.clues.slice();
      for (const x of cells) clues[x] = 0;
      clues[cells[randInt(rng, cells.length)]] = cells.length;
    } else {
      // flip the cell itself (or a neighbour, to break symmetric ambiguity)
      const t = roll < 0.75 ? c : adj[c][randInt(rng, adj[c].length)];
      if (cur.clues[t] > 0) continue;
      sol[t] ^= 1;
      if (!validSolution(w, h, sol)) continue;
      clues = reclue(w, h, sol, cur.clues, rng, p.maxIsland);
      if (!clues) continue;
    }

    const ns = score(w, h, clues, climbLevel);
    if (ns.score >= cs.score) {
      cur = { sol, clues };
      cs = ns;
    }
  }
  return cs.score === n ? cur : null;
}

/**
 * Expert: starting from a uniquely solvable puzzle, grow its islands (join two
 * islands through the wall between them, or extend one) and keep each change only
 * if the puzzle is still uniquely solvable. Like removing clues from a sudoku one
 * at a time, every accepted step leaves fewer, bigger islands.
 */
function enlarge(w: number, h: number, start: Candidate, p: Params, rng: Rng, deadline: number): Candidate {
  const n = w * h;
  const adj = neighbours(w, h);
  // unknowns the medium rules leave on the current puzzle (trial-and-error does the rest)
  const leftover = (clues: number[]) => {
    const s = new Solver(w, h, clues);
    s.solve(1);
    return s;
  };
  let cur = start;
  let avg = avgIsland(cur.clues);
  let curLeft = leftover(cur.clues).unknownCount();
  // uniquely solvable? A change that leaves far more unknowns than now is almost never
  // rescued by trials, and rejecting it early skips the expensive trial passes.
  const unique = (clues: number[]): number | null => {
    const s = leftover(clues);
    const left = s.unknownCount();
    if (left > curLeft + Math.max(6, n * 0.05)) return null;
    return left === 0 || s.solve(2).solved ? left : null;
  };
  for (let fails = 0; avg < p.minAvg && fails < n && Date.now() < deadline; ) {
    const isl = components(n, adj, (i) => cur.sol[i] === 0);
    const joins: number[] = [];
    const grows: number[] = [];
    for (let i = 0; i < n; i++) {
      if (cur.sol[i] !== 1) continue;
      const touching = new Set(adj[i].filter((x) => cur.sol[x] === 0).map((x) => isl.label[x]));
      let size = 1;
      for (const l of touching) size += isl.comps[l].length;
      if (!touching.size || size > p.maxIsland) continue;
      (touching.size > 1 ? joins : grows).push(i);
    }
    const pool = joins.length && (rng() < 0.7 || !grows.length) ? joins : grows;
    if (!pool.length) break;
    const sol = cur.sol.slice();
    sol[pool[randInt(rng, pool.length)]] = 0;
    if (!wallsConnected(n, adj, sol)) {
      fails++;
      continue;
    }
    // a joined island keeps one of its clues; try a few choices of which
    let next: Candidate | null = null;
    let nextLeft = 0;
    for (let k = 0; k < 3 && !next; k++) {
      const clues = reclue(w, h, sol, cur.clues, rng, p.maxIsland);
      const left = clues ? unique(clues) : null;
      if (clues && left !== null) {
        next = { sol, clues };
        nextLeft = left;
      }
    }
    if (next) {
      cur = next;
      avg = avgIsland(next.clues);
      curLeft = nextLeft;
    } else {
      fails++;
    }
  }
  return cur;
}

/** Lowest rule tier that solves the puzzle (callers ensure `max` solves it). */
function exactLevel(w: number, h: number, clues: number[], max: Level): Level {
  for (let l = 0; l < max; l++) {
    if (new Solver(w, h, clues).solve(l as Level).solved) return l as Level;
  }
  return max;
}

export function generate(opts: GenerateOptions): Puzzle {
  const { w, h, difficulty, seed } = opts;
  const rng = makeRng(seed);
  const started = Date.now();
  // bigger boards get proportionally more time before we settle for a nearby grade
  const base = opts.minAvg ? { ...paramsFor(difficulty, w, h), minAvg: opts.minAvg } : paramsFor(difficulty, w, h);
  // expert's island enlarging needs extra time on big boards
  const budget = opts.timeBudgetMs ?? 6000 * Math.max(1, (w * h) / 225) * (base.minAvg ? 2 : 1);
  // expert first builds a hard puzzle, then enlarges its islands
  const buildParams: Params = base.minAvg ? { ...PARAMS.hard, maxIsland: base.maxIsland } : base;
  let best: { cand: Candidate; level: Level; avg: number; exact: boolean } | null = null;
  let p = buildParams;

  for (;;) {
    const elapsed = Date.now() - started;
    if (best && elapsed > budget) break;
    // nothing at the requested tier in time: relax towards an easier tier
    if (!best) {
      const relax = Math.max(0, Math.floor(elapsed / budget) - 1);
      p = { ...buildParams, target: Math.max(0, buildParams.target - relax) as Level };
    }
    const built = randomSolution(w, h, p, rng);
    if (!built) continue;
    const clues = new Array<number>(w * h).fill(0);
    for (const cells of built.islands) clues[cells[randInt(rng, cells.length)]] = cells.length;

    let cand = improve(w, h, { sol: built.sol, clues }, p, rng, Date.now() + budget / 2);
    if (!cand) continue;
    // cap each attempt so a stalled one leaves time for a fresh start
    if (base.minAvg) cand = enlarge(w, h, cand, base, rng, Math.min(started + budget, Date.now() + budget * 0.6));
    const level = exactLevel(w, h, cand.clues, p.target);
    const avg = avgIsland(cand.clues);
    // "exact" = met every requirement of the requested difficulty
    const exact = level === base.target && avg >= base.minAvg;
    const better =
      !best ||
      (exact && !best.exact) ||
      (!best.exact && (level > best.level || (level === best.level && avg > best.avg)));
    if (better) best = { cand, level, avg, exact };
    if (exact) break;
  }

  // the loop only exits once something has been found
  const found = best!;
  return {
    w,
    h,
    clues: found.cand.clues,
    solution: Array.from(found.cand.sol),
    seed,
    difficulty,
    grade: found.exact ? difficulty : LEVEL_NAMES[found.level],
  };
}
