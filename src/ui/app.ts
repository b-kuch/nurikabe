import { analyse, type Analysis } from '../core/analysis';
import { randomSeed } from '../core/rng';
import { DIFFICULTY_LEVEL, ISL, Solver, UNK, WALL } from '../core/solver';
import { DIFFICULTIES, Mark, type Difficulty, type Puzzle } from '../core/types';
import { BoardView } from './boardView';
import { detectLang, difficultyName, LANGS, setLang, t, tn, type Lang } from './i18n';
import { formatTime, Timer } from './timer';

const SAVE_KEY = 'nurikabe.save.v1';
const BEST_KEY = 'nurikabe.best.v1';
const PREFS_KEY = 'nurikabe.prefs.v1';

export const SIZES: [number, number][] = [
  [5, 5],
  [7, 7],
  [10, 10],
  [12, 12],
  [15, 15],
  [20, 20],
];

interface Prefs {
  w: number;
  h: number;
  difficulty: Difficulty;
  colorWalls: boolean;
  lang: Lang;
}

interface Save {
  puzzle: Puzzle;
  marks: number[];
  elapsed: number;
  solved: boolean;
  revealed: boolean;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: play on without persistence */
  }
}

export class App {
  private puzzle: Puzzle | null = null;
  private marks: number[] = [];
  private analysis: Analysis | null = null;
  private undoStack: number[][] = [];
  private redoStack: number[][] = [];
  private strokeStart: number[] | null = null;
  private solved = false;
  private revealed = false;
  private paused = false;
  private autoPaused = false;
  private wrong = new Set<number>();
  private hint = new Set<number>();
  private flashTimer: number | undefined;
  private cursor = 0;
  private showCursor = false;
  private worker: Worker | null = null;
  private requestId = 0;
  private prefs: Prefs;
  private winIsBest = false;

  private board: BoardView;
  private timer: Timer;

  constructor() {
    this.prefs = { w: 7, h: 7, difficulty: 'easy', colorWalls: true, lang: detectLang(), ...load<Prefs>(PREFS_KEY) };
    setLang(this.prefs.lang);
    this.timer = new Timer((ms) => {
      $('#time').textContent = formatTime(ms);
    });
    this.board = new BoardView($('#board'), {
      begin: (i, button) => this.beginStroke(i, button),
      paint: (i, m) => this.paint(i, m),
      end: () => this.endStroke(),
    });
    this.setupControls();

    const fromHash = this.parseHash();
    const save = load<Save>(SAVE_KEY);
    const saveMatches = save?.puzzle && (!fromHash || this.sameGame(save.puzzle, fromHash));
    if (saveMatches) {
      this.start(save!.puzzle, save!.marks, save!.elapsed, save!.solved, save!.revealed);
    } else if (fromHash) {
      this.newGame(fromHash);
    } else if (save?.puzzle) {
      this.start(save.puzzle, save.marks, save.elapsed, save.solved, save.revealed);
    } else {
      this.newGame();
    }
  }

  // ------------------------------------------------------------- controls

  private setupControls(): void {
    const size = $<HTMLSelectElement>('#size');
    for (const [w, h] of SIZES) size.add(new Option(`${w} × ${h}`, `${w}x${h}`));
    size.add(new Option(t('custom'), 'custom'));
    const diff = $<HTMLSelectElement>('#difficulty');
    for (const d of DIFFICULTIES) diff.add(new Option(difficultyName(d), d));
    const lang = $<HTMLSelectElement>('#lang');
    for (const l of LANGS) lang.add(new Option(l.name, l.id));
    this.syncPrefControls();

    size.addEventListener('change', () => {
      $('#custom').hidden = size.value !== 'custom';
      if (size.value !== 'custom') {
        const [w, h] = size.value.split('x').map(Number);
        this.setPrefs({ w, h });
      }
    });
    for (const id of ['#cw', '#ch']) {
      $<HTMLInputElement>(id).addEventListener('change', () => {
        const clamp = (v: number) => Math.min(25, Math.max(4, Math.round(v) || 5));
        const w = clamp(Number($<HTMLInputElement>('#cw').value));
        const h = clamp(Number($<HTMLInputElement>('#ch').value));
        $<HTMLInputElement>('#cw').value = String(w);
        $<HTMLInputElement>('#ch').value = String(h);
        this.setPrefs({ w, h });
      });
    }
    diff.addEventListener('change', () => this.setPrefs({ difficulty: diff.value as Difficulty }));
    lang.addEventListener('change', () => {
      this.setPrefs({ lang: lang.value as Lang });
      this.relabel();
    });
    $<HTMLInputElement>('#color-walls').addEventListener('change', (e) => {
      this.setPrefs({ colorWalls: (e.target as HTMLInputElement).checked });
      this.render();
    });

    $('#new').addEventListener('click', () => this.newGame());
    $('#win-new').addEventListener('click', () => this.newGame());
    $('#restart').addEventListener('click', () => this.restart());
    $('#undo').addEventListener('click', () => this.undo());
    $('#redo').addEventListener('click', () => this.redo());
    $('#pause').addEventListener('click', () => this.togglePause());
    $('#paused').addEventListener('click', () => this.togglePause());
    $('#check').addEventListener('click', () => this.check());
    $('#hint').addEventListener('click', () => this.giveHint());
    $('#reveal').addEventListener('click', () => this.reveal());
    $('#win-close').addEventListener('click', () => ($('#win').hidden = true));
    $('#share').addEventListener('click', () => this.share());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.timer.running) {
        this.autoPaused = true;
        this.setPaused(true);
      } else if (!document.hidden && this.autoPaused) {
        this.autoPaused = false;
        this.setPaused(false);
      }
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', () => this.save());
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('hashchange', () => {
      const req = this.parseHash();
      if (req) this.newGame(req);
    });
  }

  private syncPrefControls(): void {
    const { w, h, difficulty, colorWalls, lang } = this.prefs;
    const size = $<HTMLSelectElement>('#size');
    const preset = SIZES.some(([pw, ph]) => pw === w && ph === h);
    size.value = preset ? `${w}x${h}` : 'custom';
    $('#custom').hidden = preset;
    $<HTMLInputElement>('#cw').value = String(w);
    $<HTMLInputElement>('#ch').value = String(h);
    $<HTMLSelectElement>('#difficulty').value = difficulty;
    $<HTMLInputElement>('#color-walls').checked = colorWalls;
    $<HTMLSelectElement>('#lang').value = lang;
  }

  /** Re-translate everything on screen after a language change. */
  private relabel(): void {
    setLang(this.prefs.lang);
    const size = $<HTMLSelectElement>('#size');
    size.options[size.options.length - 1].text = t('custom');
    for (const o of $<HTMLSelectElement>('#difficulty').options) o.text = difficultyName(o.value as Difficulty);
    $('#pause').textContent = this.paused ? t('resume') : t('pause');
    if (this.solved) this.showWinText();
    this.renderMeta();
    this.render();
  }

  private setPrefs(p: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...p };
    store(PREFS_KEY, this.prefs);
  }

  private parseHash(): { w: number; h: number; difficulty: Difficulty; seed: number } | null {
    const q = new URLSearchParams(location.hash.slice(1));
    const w = Number(q.get('w'));
    const h = Number(q.get('h'));
    const d = q.get('d') as Difficulty;
    const seed = Number(q.get('s'));
    if (!w || !h || !DIFFICULTIES.includes(d) || !Number.isFinite(seed) || !q.has('s')) return null;
    const req = { w: Math.min(25, Math.max(4, w)), h: Math.min(25, Math.max(4, h)), difficulty: d, seed: seed >>> 0 };
    return this.puzzle && this.sameGame(this.puzzle, req) ? null : req;
  }

  private sameGame(p: Puzzle, q: { w: number; h: number; difficulty: Difficulty; seed: number }): boolean {
    return p.w === q.w && p.h === q.h && p.difficulty === q.difficulty && p.seed === q.seed;
  }

  private share(): void {
    if (!this.puzzle) return;
    const url = `${location.origin}${location.pathname}#${this.hashFor(this.puzzle)}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast(t('linkCopied')),
      () => this.toast(url),
    );
  }

  private hashFor(p: Puzzle): string {
    return `w=${p.w}&h=${p.h}&d=${p.difficulty}&s=${p.seed}`;
  }

  // ------------------------------------------------------------ game flow

  newGame(opts?: { w: number; h: number; difficulty: Difficulty; seed: number }): void {
    const req = opts ?? { w: this.prefs.w, h: this.prefs.h, difficulty: this.prefs.difficulty, seed: randomSeed() };
    if (opts) {
      this.setPrefs({ w: opts.w, h: opts.h, difficulty: opts.difficulty });
      this.syncPrefControls();
    }
    const id = ++this.requestId;
    this.worker?.terminate();
    this.worker = new Worker(new URL('../worker/gen.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<{ id: number; puzzle: Puzzle }>) => {
      if (e.data.id !== id) return;
      this.worker?.terminate();
      this.worker = null;
      $('#generating').hidden = true;
      this.start(e.data.puzzle);
    };
    this.worker.onerror = () => {
      $('#generating').hidden = true;
      this.toast(t('generationFailed'));
    };
    $('#generating').hidden = false;
    $('#gen-label').textContent = t('generatingSize', { w: req.w, h: req.h, difficulty: difficultyName(req.difficulty).toLowerCase() });
    this.timer.pause();
    this.worker.postMessage({ id, ...req });
  }

  private start(puzzle: Puzzle, marks?: number[], elapsed = 0, solved = false, revealed = false): void {
    this.puzzle = puzzle;
    this.marks =
      marks && marks.length === puzzle.w * puzzle.h
        ? marks.map((m) => (m === Mark.Wall ? Mark.Wall : Mark.Unknown))
        : new Array(puzzle.w * puzzle.h).fill(Mark.Unknown);
    this.undoStack = [];
    this.redoStack = [];
    this.solved = solved;
    this.revealed = revealed;
    this.paused = false;
    this.cursor = 0;
    this.wrong.clear();
    this.hint.clear();
    $('#win').hidden = true;
    $('#paused').hidden = true;
    $('#board').classList.toggle('done', solved || revealed);
    this.timer.reset(elapsed);
    history.replaceState(null, '', `#${this.hashFor(puzzle)}`);

    this.renderMeta();
    this.board.build(puzzle.w, puzzle.h, puzzle.clues);
    this.fit();
    this.update();
    // resume the clock for a restored game that was already in progress
    if (!solved && !revealed && this.marks.some((m) => m !== Mark.Unknown)) this.timer.start();
  }

  private restart(): void {
    if (!this.puzzle) return;
    if (this.marks.some((m) => m !== Mark.Unknown)) this.pushUndo();
    this.marks.fill(Mark.Unknown);
    this.solved = false;
    this.revealed = false;
    $('#board').classList.remove('done');
    this.timer.reset(0);
    this.update();
  }

  private get locked(): boolean {
    return !this.puzzle || this.solved || this.revealed || this.paused;
  }

  // ---------------------------------------------------------------- input

  private beginStroke(i: number, button: 'primary' | 'secondary'): Mark | null {
    if (this.locked || this.puzzle!.clues[i] > 0) return null;
    this.showCursor = false;
    this.cursor = i;
    // click toggles a wall; right-click always clears
    const next = button === 'secondary' || this.marks[i] === Mark.Wall ? Mark.Unknown : Mark.Wall;
    this.strokeStart = this.marks.slice();
    return next;
  }

  private paint(i: number, m: Mark): void {
    if (this.locked || this.puzzle!.clues[i] > 0 || this.marks[i] === m) return;
    this.marks[i] = m;
    this.timer.start();
    this.update();
  }

  private endStroke(): void {
    if (this.strokeStart && this.strokeStart.some((v, i) => v !== this.marks[i])) {
      this.undoStack.push(this.strokeStart);
      this.redoStack = [];
    }
    this.strokeStart = null;
    this.save();
  }

  private setCell(i: number, m: Mark): void {
    if (this.locked || this.puzzle!.clues[i] > 0 || this.marks[i] === m) return;
    this.pushUndo();
    this.paint(i, m);
    this.save();
  }

  private pushUndo(): void {
    this.undoStack.push(this.marks.slice());
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    if (this.locked || !this.undoStack.length) return;
    this.redoStack.push(this.marks);
    this.marks = this.undoStack.pop()!;
    this.update();
    this.save();
  }

  private redo(): void {
    if (this.locked || !this.redoStack.length) return;
    this.undoStack.push(this.marks);
    this.marks = this.redoStack.pop()!;
    this.update();
    this.save();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.puzzle || (e.target as HTMLElement).closest('input, select, textarea')) return;
    const { w, h } = this.puzzle;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'p') return this.togglePause();
    if (k === 'n') return this.newGame();

    const moves: Record<string, [number, number]> = {
      arrowup: [0, -1],
      arrowdown: [0, 1],
      arrowleft: [-1, 0],
      arrowright: [1, 0],
    };
    if (moves[k]) {
      e.preventDefault();
      const [dx, dy] = moves[k];
      const x = Math.min(w - 1, Math.max(0, (this.cursor % w) + dx));
      const y = Math.min(h - 1, Math.max(0, Math.floor(this.cursor / w) + dy));
      this.cursor = y * w + x;
      this.showCursor = true;
      this.render();
      return;
    }
    const c = this.cursor;
    const cur = this.marks[c] as Mark;
    let target: Mark | null = null;
    if (k === ' ' || k === 'enter' || k === 'w' || k === 'x') target = cur === Mark.Wall ? Mark.Unknown : Mark.Wall;
    else if (k === 'backspace' || k === 'delete' || k === '0') target = Mark.Unknown;
    if (target === null) return;
    e.preventDefault();
    this.showCursor = true;
    this.setCell(c, target);
    this.render();
  }

  // -------------------------------------------------------------- actions

  private togglePause(): void {
    if (!this.puzzle || this.solved || this.revealed) return;
    this.autoPaused = false;
    this.setPaused(!this.paused);
  }

  private setPaused(p: boolean): void {
    if (this.solved || this.revealed) return;
    this.paused = p;
    $('#paused').hidden = !p;
    $('#board').classList.toggle('blurred', p);
    $('#pause').textContent = p ? t('resume') : t('pause');
    if (p) this.timer.pause();
    else if (this.marks.some((m) => m !== Mark.Unknown)) this.timer.start();
    this.save();
  }

  /** Flash cells that disagree with the solution. */
  private check(): void {
    if (this.locked) return;
    const { solution, clues } = this.puzzle!;
    this.wrong = new Set();
    this.marks.forEach((m, i) => {
      if (clues[i]) return;
      if (m === Mark.Wall && solution[i] === 0) this.wrong.add(i);
    });
    this.toast(this.wrong.size ? tn('mistakes', this.wrong.size) : t('noMistakes'));
    this.flash();
  }

  /** Place one wall the solver can deduce from the player's correct walls (or point at a mistake). */
  private giveHint(): void {
    if (this.locked) return;
    const p = this.puzzle!;
    const wrong = this.marks.findIndex((m, i) => !p.clues[i] && m === Mark.Wall && p.solution[i] === 0);
    if (wrong >= 0) {
      this.wrong = new Set([wrong]);
      this.toast(t('cellWrong'));
      this.flash();
      return;
    }
    const state = new Uint8Array(p.w * p.h);
    this.marks.forEach((m, i) => {
      state[i] = p.clues[i] ? ISL : m === Mark.Wall ? WALL : UNK;
    });
    const solver = new Solver(p.w, p.h, p.clues, state);
    const level = DIFFICULTY_LEVEL[p.grade];
    const isNewWall = (i: number) => p.solution[i] === 1 && this.marks[i] === Mark.Unknown;
    // island deductions aren't visible on the board, so keep deducing until a wall turns up
    let cells: number[] = [];
    for (let guard = 0; guard < p.w * p.h && !cells.length; guard++) {
      const step = solver.step(level);
      if (!step.length) break;
      cells = step.filter(isNewWall);
    }
    if (!cells.length) cells = this.marks.map((_, i) => i).filter(isNewWall);
    if (!cells.length) return this.toast(t('nothingToHint'));
    const i = cells[Math.floor(Math.random() * cells.length)];
    this.setCell(i, Mark.Wall);
    this.hint = new Set([i]);
    this.flash();
  }

  private reveal(): void {
    if (!this.puzzle || this.solved || this.revealed) return;
    if (!confirm(t('confirmReveal'))) return;
    this.pushUndo();
    this.marks = this.puzzle.solution.map((s, i) => (this.puzzle!.clues[i] ? Mark.Unknown : s === 1 ? Mark.Wall : Mark.Unknown));
    this.revealed = true;
    this.timer.pause();
    $('#board').classList.add('done');
    this.update();
    this.save();
  }

  private flash(): void {
    window.clearTimeout(this.flashTimer);
    this.render();
    this.flashTimer = window.setTimeout(() => {
      this.wrong.clear();
      this.hint.clear();
      this.render();
    }, 1800);
  }

  // ------------------------------------------------------------- updates

  private update(): void {
    const p = this.puzzle!;
    this.analysis = analyse(p.w, p.h, p.clues, this.marks);
    if (!this.solved && !this.revealed && this.analysis.solved && this.marks.some((m) => m === Mark.Wall)) this.win();
    this.render();
  }

  private render(): void {
    const p = this.puzzle;
    const a = this.analysis;
    if (!p || !a) return;
    this.board.render(p.clues, this.marks, a, {
      colorWalls: this.prefs.colorWalls,
      wrong: this.wrong,
      hint: this.hint,
      cursor: this.cursor,
      showCursor: this.showCursor && !this.locked,
    });

    const done = a.islands.filter((i) => i.complete && !i.error).length;
    const total = p.clues.filter((c) => c > 0).length;
    $('#islands').textContent = `${done}/${total}`;
    $('#islands-bar').style.width = `${(100 * done) / Math.max(1, total)}%`;
    const groups = a.walls.length;
    const isolated = a.walls.filter((g) => g.isolated).length;
    const wallEl = $('#walls');
    wallEl.textContent =
      groups <= 1 ? (groups ? t('wallsConnected') : '—') : tn('wallGroups', groups) + (isolated ? t('cutOff', { n: isolated }) : '');
    wallEl.classList.toggle('bad', isolated > 0);
    const problems = [
      a.poolCells.size ? t('pool') : '',
      a.islands.some((i) => i.error) ? t('brokenIsland') : '',
    ].filter(Boolean);
    const probEl = $('#problems');
    probEl.textContent = problems.join(' · ');
    probEl.title = probEl.textContent;
    $('#undo').toggleAttribute('disabled', !this.undoStack.length || this.locked);
    $('#redo').toggleAttribute('disabled', !this.redoStack.length || this.locked);
  }

  private win(): void {
    const p = this.puzzle!;
    this.solved = true;
    this.timer.pause();
    const ms = this.timer.elapsed;
    const key = `${p.w}x${p.h}:${p.difficulty}`;
    const best = load<Record<string, number>>(BEST_KEY) ?? {};
    this.winIsBest = !best[key] || ms < best[key];
    if (this.winIsBest) {
      best[key] = ms;
      store(BEST_KEY, best);
    }
    $('#board').classList.add('done');
    this.showWinText();
    window.setTimeout(() => ($('#win').hidden = false), 350);
    this.save();
  }

  private showWinText(): void {
    const p = this.puzzle!;
    const ms = this.timer.elapsed;
    const best = load<Record<string, number>>(BEST_KEY)?.[`${p.w}x${p.h}:${p.difficulty}`] ?? ms;
    $('#win-time').textContent = formatTime(ms);
    $('#win-best').textContent = this.winIsBest ? t('newBest') : t('best', { time: formatTime(best) });
    $('#win-meta').textContent = `${p.w} × ${p.h} · ${difficultyName(p.difficulty)}`;
  }

  private renderMeta(): void {
    const p = this.puzzle;
    if (!p) return;
    const grade = p.grade !== p.difficulty ? t('graded', { grade: difficultyName(p.grade).toLowerCase() }) : '';
    $('#meta').textContent = `${p.w} × ${p.h} · ${difficultyName(p.difficulty).toLowerCase()}${grade} · #${p.seed}`;
  }

  private save(): void {
    if (!this.puzzle) return;
    store(SAVE_KEY, {
      puzzle: this.puzzle,
      marks: this.marks,
      elapsed: this.timer.elapsed,
      solved: this.solved,
      revealed: this.revealed,
    } satisfies Save);
  }

  private fit(): void {
    if (!this.puzzle) return;
    const { w, h } = this.puzzle;
    const wrap = $('#board-wrap');
    const avail = Math.min(wrap.clientWidth, 900);
    const availH = Math.max(240, window.innerHeight - wrap.getBoundingClientRect().top - 24);
    const cell = Math.floor(Math.min(56, (avail - 4) / w, (availH - 4) / h));
    $('#board').style.setProperty('--cell', `${Math.max(16, cell)}px`);
  }

  private toast(msg: string): void {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    window.clearTimeout((t as unknown as { _h: number })._h);
    (t as unknown as { _h: number })._h = window.setTimeout(() => t.classList.remove('show'), 2000);
  }
}
