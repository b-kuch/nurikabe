/** Player-facing cell marks. Clue cells are always island and never hold a mark. */
export const enum Mark {
  Unknown = 0,
  Wall = 1,
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export interface Puzzle {
  w: number;
  h: number;
  /** clue value per cell, 0 = no clue */
  clues: number[];
  /** 1 = wall, 0 = island */
  solution: number[];
  seed: number;
  /** requested difficulty */
  difficulty: Difficulty;
  /** difficulty the grader actually measured */
  grade: Difficulty;
}
