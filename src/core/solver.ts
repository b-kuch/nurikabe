import { components, neighbours } from './grid';
import type { Difficulty } from './types';

export const UNK = 0;
export const WALL = 1;
export const ISL = 2;

/** Rule tiers, used to grade puzzles: 0 = easy, 1 = medium, 2 = hard (trial & error). */
export type Level = 0 | 1 | 2;
export const LEVEL_NAMES: Difficulty[] = ['easy', 'medium', 'hard'];
/** rule tier each difficulty is built for (expert = hard rules plus fewer, bigger islands) */
export const DIFFICULTY_LEVEL: Record<Difficulty, Level> = { easy: 0, medium: 1, hard: 2, expert: 2 };

class Contradiction extends Error {}

/** rule tier used to follow up a trial assumption (easy rules keep trials cheap) */
const TRIAL_LEVEL: Level = 0;

interface Region {
  cells: number[];
  /** clue value, 0 = no clue (orphan), -1 = more than one clue */
  clue: number;
  /** distinct unknown neighbours */
  frontier: number[];
}

/**
 * Nurikabe solver working on UNK / WALL / ISL cell states.
 * All deductions are sound, so a puzzle solved purely by propagation has a unique solution.
 */
export class Solver {
  readonly n: number;
  readonly adj: number[][];
  readonly islandTotal: number;
  state: Uint8Array;
  /** scratch for de-duplicating neighbour lists */
  private stamp: Int32Array;
  private stampId = 0;
  /** state as of the last islands() call; region-based reasoning reads this */
  private snap: Uint8Array = new Uint8Array(0);

  constructor(
    readonly w: number,
    readonly h: number,
    readonly clues: number[],
    state?: Uint8Array,
  ) {
    this.n = w * h;
    this.adj = neighbours(w, h);
    this.islandTotal = clues.reduce((a, b) => a + b, 0);
    this.stamp = new Int32Array(this.n);
    if (state) {
      this.state = state.slice();
    } else {
      this.state = new Uint8Array(this.n);
      clues.forEach((c, i) => {
        if (c > 0) this.state[i] = ISL;
      });
    }
  }

  clone(): Solver {
    return new Solver(this.w, this.h, this.clues, this.state);
  }

  unknownCount(): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) if (this.state[i] === UNK) k++;
    return k;
  }

  /** Set a cell; returns true if it changed. Conflicting assignments throw. */
  set(i: number, v: number): boolean {
    const s = this.state[i];
    if (s === v) return false;
    if (s !== UNK) throw new Contradiction();
    this.state[i] = v;
    return true;
  }

  // ---------------------------------------------------------------- regions

  private islands(): { label: Int32Array; regs: Region[] } {
    this.snap = this.state.slice();
    const { label, comps } = components(this.n, this.adj, (i) => this.state[i] === ISL);
    const regs = comps.map((cells) => {
      let clue = 0;
      for (const c of cells) {
        if (this.clues[c] > 0) clue = clue === 0 ? this.clues[c] : -1;
      }
      return { cells, clue, frontier: this.frontierOf(cells) };
    });
    return { label, regs };
  }

  private frontierOf(cells: number[]): number[] {
    const id = ++this.stampId;
    const out: number[] = [];
    for (const c of cells) {
      for (const nb of this.adj[c]) {
        if (this.state[nb] === UNK && this.stamp[nb] !== id) {
          this.stamp[nb] = id;
          out.push(nb);
        }
      }
    }
    return out;
  }

  /**
   * Cells region `r` could still grow into: BFS through unknown cells and clue-less
   * island cells, never touching another clued island, within the remaining size.
   */
  private reach(r: number, label: Int32Array, regs: Region[], excluded = -1): number[] {
    const reg = regs[r];
    const need = reg.clue - reg.cells.length;
    const id = ++this.stampId;
    const seen = this.stamp;
    const out: number[] = [];
    let layer = reg.cells;
    for (const c of reg.cells) seen[c] = id;
    if (excluded >= 0) seen[excluded] = id;
    for (let d = 1; d <= need && layer.length; d++) {
      const next: number[] = [];
      for (const c of layer) {
        for (const nb of this.adj[c]) {
          if (seen[nb] === id) continue;
          seen[nb] = id;
          if (!this.passable(nb, r, label, regs)) continue;
          next.push(nb);
          out.push(nb);
        }
      }
      layer = next;
    }
    return out;
  }

  private passable(c: number, r: number, label: Int32Array, regs: Region[]): boolean {
    const s = this.snap[c];
    if (s === WALL) return false;
    if (s === ISL) return regs[label[c]].clue === 0;
    for (const nb of this.adj[c]) {
      const l = label[nb];
      if (l !== -1 && l !== r && regs[l].clue !== 0) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ easy rules

  private easy(): boolean {
    const { label, regs } = this.islands();
    let changed = false;
    let islCount = 0;
    let wallCount = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] === ISL) islCount++;
      else if (this.state[i] === WALL) wallCount++;
    }
    const wallTotal = this.n - this.islandTotal;
    if (islCount > this.islandTotal || wallCount > wallTotal) throw new Contradiction();

    // counting: all island cells or all walls placed
    if (islCount === this.islandTotal || wallCount === wallTotal) {
      const v = islCount === this.islandTotal ? WALL : ISL;
      for (let i = 0; i < this.n; i++) if (this.state[i] === UNK) changed = this.set(i, v) || changed;
      if (changed) return true;
    }

    for (const reg of regs) {
      if (reg.clue === -1 || (reg.clue > 0 && reg.cells.length > reg.clue)) throw new Contradiction();
      if (reg.clue > 0 && reg.cells.length === reg.clue) {
        // complete island: seal it
        for (const f of reg.frontier) changed = this.set(f, WALL) || changed;
      } else if (reg.frontier.length === 0) {
        throw new Contradiction();
      } else if (reg.frontier.length === 1) {
        // single exit
        changed = this.set(reg.frontier[0], ISL) || changed;
      }
    }

    // unknown cell bordering two clued islands, or joining would overflow the clue
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== UNK) continue;
      const id = ++this.stampId;
      let clued = 0;
      let clue = 0;
      let size = 1;
      for (const nb of this.adj[i]) {
        const l = label[nb];
        if (l === -1 || this.stamp[l] === id) continue;
        this.stamp[l] = id;
        size += regs[l].cells.length;
        if (regs[l].clue > 0) {
          clued++;
          clue = regs[l].clue;
        }
      }
      if (clued > 1 || (clued === 1 && size > clue)) changed = this.set(i, WALL) || changed;
    }

    // walls: no 2x2 pools
    const { w, h } = this;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const q = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1];
        let walls = 0;
        let unk = -1;
        for (const c of q) {
          if (this.state[c] === WALL) walls++;
          else if (this.state[c] === UNK) unk = c;
        }
        if (walls === 4) throw new Contradiction();
        if (walls === 3 && unk !== -1) changed = this.set(unk, ISL) || changed;
      }
    }

    // walls: must stay connected
    const open = components(this.n, this.adj, (i) => this.state[i] !== ISL);
    let wallComp = -1;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== WALL) continue;
      if (wallComp === -1) wallComp = open.label[i];
      else if (open.label[i] !== wallComp) throw new Contradiction();
    }
    const wc = components(this.n, this.adj, (i) => this.state[i] === WALL).comps;
    const mustGrow = wc.length > 1 || wc.reduce((a, c) => a + c.length, 0) < wallTotal;
    if (mustGrow) {
      // compute every frontier before assigning, so groups see the same state
      for (const fr of wc.map((cells) => this.frontierOf(cells))) {
        if (fr.length === 0) throw new Contradiction();
        if (fr.length === 1) changed = this.set(fr[0], WALL) || changed;
      }
    }

    // the region snapshot is stale once anything changed
    if (changed) return true;

    // reachability: unknown cells no clue can reach are walls
    const reached = new Uint8Array(this.n);
    regs.forEach((reg, r) => {
      if (reg.clue <= 0 || reg.cells.length === reg.clue) return;
      const cells = this.reach(r, label, regs);
      if (cells.length < reg.clue - reg.cells.length) throw new Contradiction();
      for (const c of cells) reached[c] = 1;
    });
    for (let i = 0; i < this.n; i++) {
      if (reached[i]) continue;
      if (this.state[i] === UNK) changed = this.set(i, WALL) || changed;
      else if (this.state[i] === ISL && regs[label[i]].clue === 0) throw new Contradiction();
    }
    return changed;
  }

  // ---------------------------------------------------------- medium rules

  private medium(): boolean {
    const { label, regs } = this.islands();
    let changed = false;

    for (let r = 0; r < regs.length && !changed; r++) {
      const reg = regs[r];
      if (reg.clue <= 0) continue;
      const need = reg.clue - reg.cells.length;
      if (need <= 0) continue;
      // cells the island cannot complete without
      const cand = this.reach(r, label, regs);
      for (const c of cand) {
        if (this.state[c] !== UNK) continue;
        if (this.reach(r, label, regs, c).length < need) changed = this.set(c, ISL) || changed;
      }
      // one cell left: anything touching every option becomes wall
      if (need === 1 && reg.frontier.length > 1) {
        const id = ++this.stampId;
        for (const f of reg.frontier) this.stamp[f] = id;
        const common = new Map<number, number>();
        for (const f of reg.frontier) {
          for (const nb of this.adj[f]) {
            if (this.state[nb] === UNK && this.stamp[nb] !== id) common.set(nb, (common.get(nb) ?? 0) + 1);
          }
        }
        for (const [c, k] of common) if (k === reg.frontier.length) changed = this.set(c, WALL) || changed;
      }
    }
    if (changed) return true;

    // an unknown cell whose removal would split the walls must be a wall
    let wallCells = 0;
    let firstWall = -1;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] === WALL) {
        wallCells++;
        if (firstWall === -1) firstWall = i;
      }
    }
    if (wallCells < 2) return false;
    const seen = new Int32Array(this.n);
    let gen = 0;
    const stack: number[] = [];
    for (let c = 0; c < this.n; c++) {
      if (this.state[c] !== UNK) continue;
      let open = 0;
      for (const nb of this.adj[c]) if (this.state[nb] !== ISL) open++;
      if (open < 2) continue;
      gen++;
      const start = firstWall;
      seen[start] = gen;
      stack.push(start);
      let found = 0;
      while (stack.length) {
        const x = stack.pop()!;
        if (this.state[x] === WALL) found++;
        for (const nb of this.adj[x]) {
          if (nb !== c && seen[nb] !== gen && this.state[nb] !== ISL) {
            seen[nb] = gen;
            stack.push(nb);
          }
        }
      }
      if (found < wallCells) changed = this.set(c, WALL) || changed;
    }
    return changed;
  }

  // ------------------------------------------------------------ hard rules

  /**
   * Depth-1 trial: assume a value, propagate, keep the opposite on contradiction.
   * One pass tries every unknown cell and keeps all conclusions.
   */
  private trial(): boolean {
    let changed = false;
    // only cells touching decided ones: trials deep inside unknown territory almost never conclude anything
    const frontier: number[] = [];
    const rest: number[] = [];
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== UNK) continue;
      (this.adj[i].some((nb) => this.state[nb] !== UNK) ? frontier : rest).push(i);
    }
    for (const c of frontier.length ? frontier : rest) {
      for (const v of [ISL, WALL]) {
        if (this.state[c] !== UNK) break;
        const s = this.clone();
        s.state[c] = v;
        try {
          s.propagate(TRIAL_LEVEL);
        } catch (e) {
          if (!(e instanceof Contradiction)) throw e;
          changed = this.set(c, v === ISL ? WALL : ISL) || changed;
        }
      }
    }
    return changed;
  }

  /** Apply rules up to `level` until nothing changes. Throws Contradiction. */
  private propagate(level: Level, onLevel?: (l: Level) => void): void {
    for (;;) {
      if (this.easy()) {
        onLevel?.(0);
        continue;
      }
      if (level >= 1 && this.medium()) {
        onLevel?.(1);
        continue;
      }
      if (level >= 2 && this.trial()) {
        onLevel?.(2);
        continue;
      }
      return;
    }
  }

  /** Logical solve with rules up to `level`. */
  solve(level: Level): { solved: boolean; contradiction: boolean; maxUsed: Level } {
    let maxUsed: Level = 0;
    try {
      this.propagate(level, (l) => {
        if (l > maxUsed) maxUsed = l;
      });
    } catch (e) {
      if (!(e instanceof Contradiction)) throw e;
      return { solved: false, contradiction: true, maxUsed };
    }
    return { solved: this.unknownCount() === 0, contradiction: false, maxUsed };
  }

  /** Apply one round of the lowest rule tier that makes progress; returns the newly decided cells (for hints). */
  step(maxLevel: Level): number[] {
    const before = this.state.slice();
    try {
      if (!this.easy() && !(maxLevel >= 1 && this.medium())) {
        if (maxLevel >= 2) this.trial();
      }
    } catch (e) {
      if (!(e instanceof Contradiction)) throw e;
      return [];
    }
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) if (before[i] === UNK && this.state[i] !== UNK) out.push(i);
    return out;
  }

  /** Count solutions by propagation + branching, stopping at `limit`. */
  countSolutions(limit = 2): number {
    try {
      this.propagate(1);
    } catch (e) {
      if (!(e instanceof Contradiction)) throw e;
      return 0;
    }
    const c = this.branchCell();
    if (c === -1) return 1;
    let count = 0;
    for (const v of [ISL, WALL]) {
      const s = this.clone();
      s.state[c] = v;
      count += s.countSolutions(limit - count);
      if (count >= limit) break;
    }
    return count;
  }

  private branchCell(): number {
    const { regs } = this.islands();
    let best = -1;
    let bestLen = Infinity;
    for (const reg of regs) {
      if (reg.clue > 0 && reg.cells.length < reg.clue && reg.frontier.length < bestLen) {
        bestLen = reg.frontier.length;
        best = reg.frontier[0];
      }
    }
    if (best !== -1) return best;
    for (let i = 0; i < this.n; i++) if (this.state[i] === UNK) return i;
    return -1;
  }
}

/**
 * Grade a puzzle: the lowest rule tier that fully solves it, or null if
 * even trial-and-error can't (ambiguous or needs deeper guessing).
 */
export function grade(w: number, h: number, clues: number[]): { level: Level; state: Uint8Array } | null {
  for (const level of [0, 1, 2] as Level[]) {
    const s = new Solver(w, h, clues);
    const r = s.solve(level);
    if (r.contradiction) return null;
    if (r.solved) return { level, state: s.state };
  }
  return null;
}
