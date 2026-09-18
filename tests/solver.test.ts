import { describe, expect, it } from 'vitest';
import { isSolved } from '../src/core/analysis';
import { randomSolution } from '../src/core/generator';
import { makeRng, randInt } from '../src/core/rng';
import { grade, Solver } from '../src/core/solver';

const clue = (rows: string[]) => rows.join('').split('').map((c) => (c === '.' ? 0 : Number(c)));

/** Exhaustive solution count for tiny boards. */
function bruteCount(w: number, h: number, clues: number[], limit = 99): number {
  const free = clues.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  let count = 0;
  for (let mask = 0; mask < 1 << free.length && count < limit; mask++) {
    const marks = new Array(w * h).fill(0);
    free.forEach((c, b) => {
      if (mask & (1 << b)) marks[c] = 1;
    });
    if (isSolved(w, h, clues, marks)) count++;
  }
  return count;
}

describe('solver', () => {
  it('detects multiple solutions', () => {
    // a centred 2 can grow in any of four directions
    const clues = clue(['...', '.2.', '...']);
    expect(new Solver(3, 3, clues).countSolutions(2)).toBe(2);
    expect(grade(3, 3, clues)).toBeNull();
  });

  it('solves a trivial puzzle logically and grades it easy', () => {
    const g = grade(3, 3, clue(['1.1', '...', '1.1']));
    expect(g?.level).toBe(0);
    expect(Array.from(g!.state)).toEqual([2, 1, 2, 1, 1, 1, 2, 1, 2]);
  });

  it('rejects impossible puzzles', () => {
    const clues = clue(['....', '....', '....', '....']);
    expect(new Solver(4, 4, clues).countSolutions(2)).toBe(0);
    expect(grade(4, 4, clues)).toBeNull();
  });

  it('agrees with brute force on random small puzzles', () => {
    const rng = makeRng(11);
    for (let t = 0; t < 600; t++) {
      const w = 3 + randInt(rng, 2);
      const h = 3 + randInt(rng, 2);
      const built = randomSolution(w, h, { maxIsland: 6, growBias: 0.6, target: 0, minAvg: 0 }, rng);
      if (!built) continue;
      const clues = new Array(w * h).fill(0);
      for (const cells of built.islands) clues[cells[randInt(rng, cells.length)]] = cells.length;
      const brute = Math.min(bruteCount(w, h, clues, 2), 2);
      expect(new Solver(w, h, clues).countSolutions(2), JSON.stringify({ w, h, clues })).toBe(brute);
      const g = grade(w, h, clues);
      if (g) {
        expect(brute, JSON.stringify({ w, h, clues, level: g.level })).toBe(1);
        expect(isSolved(w, h, clues, Array.from(g.state, (s) => (s === 1 ? 1 : 0)))).toBe(true);
      }
    }
  });
});
