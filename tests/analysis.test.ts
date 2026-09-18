import { describe, expect, it } from 'vitest';
import { analyse } from '../src/core/analysis';

// board strings: digits = clues, '#' = wall, '.' = empty
function parse(rows: string[]) {
  const s = rows.join('');
  const clues = [...s].map((c) => (/\d/.test(c) ? Number(c) : 0));
  const marks = [...s].map((c) => (c === '#' ? 1 : 0));
  return { w: rows[0].length, h: rows.length, clues, marks };
}

describe('analyse', () => {
  it('marks walled-off islands of the right size as complete', () => {
    const { w, h, clues, marks } = parse(['2.#', '###', '1#.']);
    const a = analyse(w, h, clues, marks);
    expect(a.islands[a.islandOf[0]].complete).toBe(true);
    expect(a.islands[a.islandOf[1]].complete).toBe(true);
    expect(a.islands[a.islandOf[6]].complete).toBe(true);
  });

  it('does not flag regions that just need more walls', () => {
    const { w, h, clues, marks } = parse(['2..', '...', '1.1']);
    const a = analyse(w, h, clues, marks);
    expect(a.islands[0].complete).toBe(false);
    expect(a.islands[0].error).toBe(false);
  });

  it('flags regions walled in too small or without a clue', () => {
    const { w, h, clues, marks } = parse(['3#.', '##.', '..1']);
    const a = analyse(w, h, clues, marks);
    expect(a.islands[a.islandOf[0]].error).toBe(true);
    const b = parse(['1#.', '###', '...']);
    const ab = analyse(b.w, b.h, b.clues, b.marks);
    expect(ab.islands[ab.islandOf[2]].error).toBe(true);
  });

  it('finds separate wall groups and isolated ones', () => {
    const { w, h, clues, marks } = parse(['#1#', '...', '#.#']);
    const a = analyse(w, h, clues, marks);
    expect(a.walls.length).toBe(4);
    expect(a.walls.every((g) => !g.isolated)).toBe(true);
    const b = parse(['#1.', '1..', '..#']);
    const iso = analyse(b.w, b.h, b.clues, b.marks);
    expect(iso.walls.map((g) => g.isolated)).toEqual([true, false]);
  });

  it('flags 2x2 pools', () => {
    const { w, h, clues, marks } = parse(['##1', '##.', '...']);
    const a = analyse(w, h, clues, marks);
    expect([...a.poolCells].sort()).toEqual([0, 1, 3, 4]);
  });

  it('detects a solved board', () => {
    const { w, h, clues, marks } = parse(['2.#', '###', '1#1']);
    expect(analyse(w, h, clues, marks).solved).toBe(true);
    const bad = parse(['2.#', '#.#', '1#1']);
    expect(analyse(bad.w, bad.h, bad.clues, bad.marks).solved).toBe(false);
  });
});
