// ============================================
// HELICASE — ASCII Pattern Library
// 5 preset geometric patterns with multiple frames.
// Each frame is ~14 chars wide × 12 lines tall
// for the 200×200px <pre> area.
// ============================================

export type PatternKey = 'hex' | 'nuclear' | 'mobius' | 'star' | 'matrix';

export const ASCII_PATTERNS: Record<PatternKey, string[]> = {
  // ── Pattern A: Hexagon Lattice "Breathing" (5 frames) ──
  hex: [
    // Frame 0 – compact
    [
      '  ┌─┐ ┌─┐ ┌─┐  ',
      '  │⬡│ │⬡│ │⬡│  ',
      '  └─┘ └─┘ └─┘  ',
      '  ┌─┐ ┌─┐ ┌─┐  ',
      '  │⬡│ │⬡│ │⬡│  ',
      '  └─┘ └─┘ └─┘  ',
    ].join('\n'),

    // Frame 1 – expanding
    [
      ' ┌──┐ ┌──┐ ┌──┐ ',
      ' │⬡ │ │⬡ │ │⬡ │ ',
      ' └──┘ └──┘ └──┘ ',
      ' ┌──┐ ┌──┐ ┌──┐ ',
      ' │⬡ │ │⬡ │ │⬡ │ ',
      ' └──┘ └──┘ └──┘ ',
    ].join('\n'),

    // Frame 2 – fully expanded
    [
      ' ╭──╮ ╭──╮ ╭──╮ ',
      ' │⬡│ │⬡│ │⬡│ ',
      ' ╰──╯ ╰──╯ ╰──╯ ',
      ' ╭──╮ ╭──╮ ╭──╮ ',
      ' │⬡│ │⬡│ │⬡│ ',
      ' ╰──╯ ╰──╯ ╰──╯ ',
    ].join('\n'),

    // Frame 3 – contracting
    [
      ' ┌──┐ ┌──┐ ┌──┐ ',
      ' │⬡ │ │⬡ │ │⬡ │ ',
      ' └──┘ └──┘ └──┘ ',
      ' ┌──┐ ┌──┐ ┌──┐ ',
      ' │⬡ │ │⬡ │ │⬡ │ ',
      ' └──┘ └──┘ └──┘ ',
    ].join('\n'),

    // Frame 4 – compact again
    [
      '  ┌─┐ ┌─┐ ┌─┐  ',
      '  │⬡│ │⬡│ │⬡│  ',
      '  └─┘ └─┘ └─┘  ',
      '  ┌─┐ ┌─┐ ┌─┐  ',
      '  │⬡│ │⬡│ │⬡│  ',
      '  └─┘ └─┘ └─┘  ',
    ].join('\n'),
  ],

  // ── Pattern B: Radiation Trefoil "Pulse" (4 frames) ──
  nuclear: [
    // Frame 0 – core
    [
      '   ╲ │ ╱   ',
      '  ╲  │  ╱  ',
      ' ────☢──── ',
      '  ╱  │  ╲  ',
      '   ╱ │ ╲   ',
    ].join('\n'),

    // Frame 1 – pulse out
    [
      '    ╲   │   ╱    ',
      '   ╲    │    ╱   ',
      '  ──────☢──────  ',
      '   ╱     │     ╲  ',
      '    ╱   │   ╲    ',
    ].join('\n'),

    // Frame 2 – max pulse
    [
      '     ═══╤═══     ',
      '    ╱    ☢    ╲  ',
      '   │    ═╧═    │ ',
      '    ╲         ╱  ',
      '     ═══════     ',
    ].join('\n'),

    // Frame 3 – contracting (same as Frame 0)
    [
      '   ╲ │ ╱   ',
      '  ╲  │  ╱  ',
      ' ────☢──── ',
      '  ╱  │  ╲  ',
      '   ╱ │ ╲   ',
    ].join('\n'),
  ],

  // ── Pattern C: Mobius/Infinity "Rotate" (6 frames) ──
  mobius: [
    [
      '  ╱∞╲  ',
      ' ╱   ╲ ',
      '╱     ╲',
      '╲     ╱',
      ' ╲   ╱ ',
      '  ╲∞╱  ',
    ].join('\n'),

    [
      '  ╱∞╲  ',
      ' ╱   ╲ ',
      '╱     ╲',
      ' ╲   ╱ ',
      '  ╲∞╱  ',
    ].join('\n'),

    [
      '   ╱╲   ',
      '  ╱  ╲  ',
      '  ╲  ╱  ',
      '  ╱ ╲  ',
      ' ╱   ╲ ',
      ' ╲   ╱ ',
      '  ╲ ╱  ',
    ].join('\n'),

    [
      '  ╱∞╲  ',
      ' ╱   ╲ ',
      '╱     ╲',
      '╲     ╱',
      ' ╲   ╱ ',
      '  ╲∞╱  ',
    ].join('\n'),

    [
      '  ╱∞╲  ',
      ' ╱   ╲ ',
      '╱     ╲',
      ' ╲   ╱ ',
      '  ╲∞╱  ',
    ].join('\n'),

    [
      '   ╱╲   ',
      '  ╱  ╲  ',
      '  ╲  ╱  ',
      '  ╱ ╲  ',
      ' ╱   ╲ ',
      ' ╲   ╱ ',
      '  ╲ ╱  ',
    ].join('\n'),
  ],

  // ── Pattern D: Star/Constellation "Connect" (5 frames) ──
  star: [
    [
      '     ⋆     ',
      '    ╱ ╲    ',
      '   ╱   ╲   ',
      '  ⋆ ─── ⋆  ',
      '   ╲   ╱   ',
      '    ╲ ╱    ',
      '     ⋆     ',
    ].join('\n'),

    [
      '    ⋆      ',
      '   ╱ ╲     ',
      '  ⋆   ⋆    ',
      '   ╲ ╱     ',
      '    ⋆      ',
      '   ╱ ╲     ',
      '  ⋆   ⋆    ',
    ].join('\n'),

    [
      '     ⋆     ',
      '    ╱ ╲    ',
      '   ╱   ╲   ',
      '  ⋆ ─── ⋆  ',
      '   ╲   ╱   ',
      '    ╲ ╱    ',
      '     ⋆     ',
    ].join('\n'),

    [
      '    ⋆      ',
      '   ╱ ╲     ',
      '  ⋆   ⋆    ',
      '   ╲ ╱     ',
      '    ⋆      ',
    ].join('\n'),

    [
      '     ⋆     ',
      '    ╱ ╲    ',
      '   ╱   ╲   ',
      '  ⋆ ─── ⋆  ',
      '   ╲   ╱   ',
      '    ╲ ╱    ',
      '     ⋆     ',
    ].join('\n'),
  ],

  // ── Pattern E: Terminal Matrix "Data Flow" (8 frames) ──
  matrix: [
    [
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
    ].join('\n'),

    [
      '│ ·  ∘ ·  │',
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
      '│  ∘ · ∘  │',
    ].join('\n'),

    [
      '│  ∘  · ∘ │',
      '│ · ∘  ·  │',
      '│  ∘  · ∘ │',
      '│ · ∘  ·  │',
      '│  ∘  · ∘ │',
      '│ · ∘  ·  │',
    ].join('\n'),

    [
      '│ ·  ∘ ·  │',
      '│  · ∘  · │',
      '│ ·  ∘ ·  │',
      '│  · ∘  · │',
      '│ ·  ∘ ·  │',
      '│  · ∘  · │',
    ].join('\n'),

    [
      '│ ∘  · ∘  │',
      '│  ∘  · ∘ │',
      '│ ∘  · ∘  │',
      '│  ∘  · ∘ │',
      '│ ∘  · ∘  │',
      '│  ∘  · ∘ │',
    ].join('\n'),

    [
      '│  · ∘ ·  │',
      '│ ·  ∘  · │',
      '│  · ∘ ·  │',
      '│ ·  ∘  · │',
      '│  · ∘ ·  │',
      '│ ·  ∘  · │',
    ].join('\n'),

    [
      '│ · ∘  ·  │',
      '│  ∘  · ∘ │',
      '│ · ∘  ·  │',
      '│  ∘  · ∘ │',
      '│ · ∘  ·  │',
      '│  ∘  · ∘ │',
    ].join('\n'),

    [
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
      '│  ∘ · ∘  │',
      '│ ·  ∘  · │',
    ].join('\n'),
  ],
};

export const PATTERN_ORDER: PatternKey[] = ['hex', 'nuclear', 'mobius', 'star', 'matrix'];

/**
 * AsciiCore — rAF-based frame animation controller.
 * 8-12 fps, time-accumulator pattern.
 */
export class AsciiCore {
  private frames: string[] = [];
  private interval: number;
  private frame: number = 0;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private rafId: number = 0;
  private _active: boolean = false;
  private patternIdx: number = 0;
  private transitionLock: boolean = false;

  constructor(
    private el: HTMLElement,
    private patterns: Record<PatternKey, string[]>,
    private order: PatternKey[],
    fps: number = 10,
  ) {
    this.interval = 1000 / fps;
    this.patternIdx = 0;
    this.frames = patterns[order[0]];
  }

  get active() { return this._active; }

  start() {
    if (this._active) return;
    this._active = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this._active = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
  }

  private tick = (now: number) => {
    if (!this._active) return;
    const delta = Math.min(now - this.lastTime, 100); // cap at 100ms
    this.lastTime = now;
    this.accumulator += delta;

    while (this.accumulator >= this.interval) {
      this.accumulator -= this.interval;
      this.advanceFrame();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private advanceFrame() {
    this.frame = (this.frame + 1) % this.frames.length;
    this.el.textContent = this.frames[this.frame];
  }

  /** Cycle to next pattern with a brief opacity crossfade */
  async cyclePattern() {
    if (this.transitionLock) return;
    this.transitionLock = true;

    this.el.style.transition = `opacity ${80}ms var(--ease-mechanical)`;
    this.el.style.opacity = '0';
    await sleep(80);

    this.patternIdx = (this.patternIdx + 1) % this.order.length;
    this.frames = this.patterns[this.order[this.patternIdx]];
    this.frame = 0;
    this.accumulator = 0;
    this.el.textContent = this.frames[0];

    this.el.style.transition = `opacity ${150}ms var(--ease-mechanical)`;
    this.el.style.opacity = '1';
    await sleep(150);
    this.el.style.transition = '';
    this.transitionLock = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
