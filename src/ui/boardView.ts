import type { Analysis } from '../core/analysis';
import { Mark } from '../core/types';
import { t } from './i18n';

export interface BoardInput {
  /** a stroke begins: returns the mark to paint, or null to ignore */
  begin(cell: number, button: 'primary' | 'secondary'): Mark | null;
  paint(cell: number, mark: Mark): void;
  end(): void;
}

export interface RenderOptions {
  colorWalls: boolean;
  /** cells to flash as wrong after "Check" */
  wrong: Set<number>;
  /** cells to flash as a hint */
  hint: Set<number>;
  cursor: number;
  showCursor: boolean;
}

const GOLDEN_ANGLE = 137.508;

/** CSS-grid board. Rebuilt when the size changes; cells are updated in place on each render. */
export class BoardView {
  private cells: HTMLDivElement[] = [];
  private w = 0;
  private stroke: Mark | null = null;
  private lastPainted = -1;

  constructor(
    private root: HTMLElement,
    private input: BoardInput,
  ) {
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
    window.addEventListener('pointercancel', () => this.onUp());
  }

  build(w: number, h: number, clues: number[]): void {
    this.w = w;
    this.root.innerHTML = '';
    this.root.style.setProperty('--cols', String(w));
    this.root.style.setProperty('--rows', String(h));
    this.cells = clues.map((c, i) => {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = String(i);
      el.setAttribute('role', 'gridcell');
      if (c > 0) {
        el.classList.add('clue');
        el.textContent = String(c);
      }
      this.root.appendChild(el);
      return el;
    });
  }

  render(clues: number[], marks: ArrayLike<number>, a: Analysis, opt: RenderOptions): void {
    const tintWalls = opt.colorWalls && a.walls.length > 1;
    for (let i = 0; i < this.cells.length; i++) {
      const el = this.cells[i];
      const m = clues[i] > 0 ? -1 : marks[i];
      const island = a.islandOf[i] !== -1 ? a.islands[a.islandOf[i]] : null;
      const wg = a.wallOf[i];

      el.classList.toggle('wall', m === Mark.Wall);
      el.classList.toggle('complete', !!island?.complete && !island.error);
      el.classList.toggle('error', a.errorCells.has(i));
      el.classList.toggle('pool', a.poolCells.has(i));
      el.classList.toggle('isolated', wg !== -1 && a.walls[wg].isolated);
      el.classList.toggle('wrong', opt.wrong.has(i));
      el.classList.toggle('hint', opt.hint.has(i));
      el.classList.toggle('cursor', opt.showCursor && opt.cursor === i);

      const grouped = tintWalls && wg !== -1 && wg !== a.mainWall;
      el.classList.toggle('grouped', grouped);
      if (grouped) {
        // stable-ish hue per group: derived from the group's first cell
        const hue = (a.walls[wg].cells.reduce((x, y) => Math.min(x, y)) * GOLDEN_ANGLE) % 360;
        el.style.setProperty('--group-hue', String(Math.round(hue)));
      } else {
        el.style.removeProperty('--group-hue');
      }

      const label =
        clues[i] > 0
          ? t('cell.clue', { n: clues[i] }) + (island?.complete ? t('cell.complete') : '')
          : m === Mark.Wall
            ? t('cell.wall')
            : t('cell.empty');
      el.setAttribute('aria-label', t('cell.pos', { row: Math.floor(i / this.w) + 1, col: (i % this.w) + 1, label }));
    }
  }

  private cellAt(e: PointerEvent): number {
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.cell');
    if (!el || !this.root.contains(el)) return -1;
    return Number(el.dataset.i);
  }

  private onDown(e: PointerEvent): void {
    const i = this.cellAt(e);
    if (i < 0) return;
    e.preventDefault();
    const button = e.button === 2 || (e.button === 0 && (e.ctrlKey || e.shiftKey)) ? 'secondary' : 'primary';
    this.stroke = this.input.begin(i, button);
    if (this.stroke === null) return;
    this.lastPainted = i;
    this.input.paint(i, this.stroke);
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.stroke === null) return;
    const i = this.cellAt(e);
    if (i < 0 || i === this.lastPainted) return;
    this.lastPainted = i;
    this.input.paint(i, this.stroke);
  }

  private onUp(): void {
    if (this.stroke === null) return;
    this.stroke = null;
    this.lastPainted = -1;
    this.input.end();
  }
}
