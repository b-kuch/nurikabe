/** Elapsed-time clock that can be paused and restored from a saved value. */
export class Timer {
  private base = 0;
  private startedAt: number | null = null;
  private handle: number | undefined;

  constructor(private onTick: (ms: number) => void) {}

  get running(): boolean {
    return this.startedAt !== null;
  }

  get elapsed(): number {
    return this.base + (this.startedAt === null ? 0 : performance.now() - this.startedAt);
  }

  start(): void {
    if (this.running) return;
    this.startedAt = performance.now();
    this.handle = window.setInterval(() => this.onTick(this.elapsed), 250);
    this.onTick(this.elapsed);
  }

  pause(): void {
    if (!this.running) return;
    this.base = this.elapsed;
    this.startedAt = null;
    window.clearInterval(this.handle);
    this.onTick(this.elapsed);
  }

  reset(ms = 0): void {
    this.pause();
    this.base = ms;
    this.onTick(this.elapsed);
  }
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}
