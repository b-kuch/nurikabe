import { describe, expect, it } from 'vitest';
import { isSolved } from '../src/core/analysis';
import { generate } from '../src/core/generator';
import { Solver } from '../src/core/solver';
import { DIFFICULTIES } from '../src/core/types';

const SIZES: [number, number][] = [[5, 5], [7, 7], [10, 10], [12, 8], [15, 15]];

describe('generator', () => {
  for (const [w, h] of SIZES) {
    for (const difficulty of DIFFICULTIES) {
      it(`${w}x${h} ${difficulty}: unique, valid, graded as requested`, () => {
        for (const seed of w * h > 150 ? [1] : [1, 2, 3]) {
          const p = generate({ w, h, difficulty, seed });
          expect(p.grade).toBe(difficulty);
          const marks = p.solution.map((s) => (s === 1 ? 1 : 0));
          expect(isSolved(w, h, p.clues, marks)).toBe(true);
          const s = new Solver(w, h, p.clues);
          expect(s.solve(2).solved).toBe(true);
          expect(Array.from(s.state, (v) => (v === 1 ? 1 : 0))).toEqual(p.solution);
        }
      });
    }
  }

  it('expert puzzles have fewer, larger islands than hard', () => {
    for (const seed of [1, 2]) {
      const avg = (clues: number[]) => {
        const c = clues.filter(Boolean);
        return c.reduce((a, b) => a + b, 0) / c.length;
      };
      const p = generate({ w: 10, h: 10, difficulty: 'expert', seed });
      expect(p.grade).toBe('expert');
      expect(avg(p.clues)).toBeGreaterThanOrEqual(3.4);
      expect(avg(p.clues)).toBeGreaterThan(avg(generate({ w: 10, h: 10, difficulty: 'hard', seed }).clues));
    }
  });

  it('is deterministic for a seed', () => {
    const a = generate({ w: 7, h: 7, difficulty: 'medium', seed: 42 });
    const b = generate({ w: 7, h: 7, difficulty: 'medium', seed: 42 });
    expect(a.clues).toEqual(b.clues);
  });
});
