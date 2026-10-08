// src/story/StoryManager.js  (owner: story) — M0 STUB satisfying the ctx.story contract (§19.3):
//   play(id) → Promise;  flag(k, v?);  isPlaying;  skip();  skipAll()
// No cutscene data yet: play() switches to mode 'cutscene', emits cutscene:start, ends on the next fixed
// step with cutscene:end (so flows that wait on cutscenes keep moving). Boss defeats start their scenes
// (CS-05 / CS-09 / D-05) the way the real story will.
import { E } from '../core/events.js';

const ON_BOSS_DEFEATED = { boss_grizzlechop: 'cs05', boss_cacklejaw: 'cs09', boss_brutus: 'd05' };

export class StoryManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.playing = null;          // { id, resolve, skipped }
    this._offs = [];
  }

  get isPlaying() { return !!this.playing; }

  async init() {
    this._offs.push(this.ctx.bus.on(E.BOSS_DEFEATED, ({ id }) => { const cs = ON_BOSS_DEFEATED[id]; if (cs) this.play(cs); }));
  }

  /** Play cutscene `id`. Resolves when it ends (or is skipped). */
  play(id) {
    if (this.playing) this._end(true);
    return new Promise((resolve) => {
      this.playing = { id, resolve, steps: 0 };
      this._prevMode = this.ctx.game.mode === 'cutscene' ? 'play' : this.ctx.game.mode;
      this.ctx.game.setMode('cutscene');
      this.ctx.bus.emit(E.CUTSCENE_START, { id });
    });
  }

  /** Get (one arg) or set (two args) a story flag; setting emits story:flag. */
  flag(key, value) {
    if (arguments.length < 2) return this.ctx.state.getFlag(key);
    this.ctx.state.setFlag(key, value);
    this.ctx.bus.emit(E.FLAG_SET, { key, value });
    return value;
  }

  /** Skip the current cutscene (runs its end block in the real implementation). */
  skip() { if (this.playing) this._end(true); }

  /** Skip dialogue + cutscene (test hook). */
  skipAll() { this.skip(); }

  _end(skipped) {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    if (this.ctx.game.mode === 'cutscene') this.ctx.game.setMode(this._prevMode === 'menu' ? 'play' : (this._prevMode ?? 'play'));
    this.ctx.bus.emit(E.CUTSCENE_END, { id: p.id, skipped });
    p.resolve();
  }

  update(dt) {
    if (this.playing && ++this.playing.steps > 1) this._end(false);
  }

  dispose() { this._end(true); for (const off of this._offs) off(); this._offs.length = 0; }
}
