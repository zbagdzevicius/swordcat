// src/player/Lives.js  (owner: player) — Nine Lives, Still Standing and checkpoint segments (GAME_DESIGN §7.6,
// §7.9 difficulty rows). Pure: no THREE, no ctx; node-safe (U3).
//   Knight:     9 lives per level attempt (reset on every level load / retry).
//   Kitten:     unlimited — no counter, never game over (`lives` stays at the start value).
//   Nine Lives: 9 for the whole game (`livesScope: 'game'`); only a restart after 0 refills them.
import { PLAYER } from '../core/config.js';

export class Lives {
  /**
   * @param {{lives:number, livesScope?:string}} [diff] a DIFFICULTY row (state.difficultyCfg)
   * @param {typeof PLAYER} [cfg]
   */
  constructor(diff, cfg = PLAYER) {
    this.cfg = cfg;
    this.diff = diff ?? { lives: cfg.lives };
    this.lives = this.start;
    /** Still Standing is available once per checkpoint segment */
    this.stillStandingArmed = true;
    this.gameOver = false;
    /** lives lost since the level started (results rank) */
    this.lostThisLevel = 0;
  }

  /** Unlimited lives (Kitten). */
  get infinite() { return !Number.isFinite(this.diff?.lives ?? this.cfg.lives); }
  /** 'level' (Knight, Kitten) or 'game' (Nine Lives). */
  get scope() { return this.diff?.livesScope ?? 'level'; }
  /** Lives at the start of an attempt (the counter value; Kitten keeps showing it but never spends it). */
  get start() { const n = this.diff?.lives ?? this.cfg.lives; return Number.isFinite(n) ? n : this.cfg.lives; }

  /** Switch difficulty (Vigil Stone). Clamps the counter into the new row. */
  setDifficulty(diff) {
    this.diff = diff ?? this.diff;
    if (this.infinite) { this.lives = this.start; this.gameOver = false; }
  }

  /**
   * A level (re)loads. Level scope: full lives. Game scope: kept, unless the run hit 0 (the restart refills).
   * `saved` = the lives count from the save (game scope only).
   */
  levelStart(saved) {
    if (this.scope === 'game') {
      const n = Number.isFinite(saved) ? saved : this.lives;
      this.lives = n > 0 ? Math.min(n, this.start) : this.start;
    } else this.lives = this.start;
    this.stillStandingArmed = true;
    this.gameOver = false;
    this.lostThisLevel = 0;
  }

  /** A Vigil Stone was used: a new segment, Still Standing re-arms. */
  checkpoint() { this.stillStandingArmed = true; }

  /** A lethal blow landed: true (and disarmed) if Still Standing saves her this segment. */
  tryStillStanding() {
    if (!this.stillStandingArmed) return false;
    this.stillStandingArmed = false;
    return true;
  }

  /** She fainted. Returns `{ lives, gameOver }`. */
  loseLife() {
    this.lostThisLevel++;
    if (this.infinite) return { lives: this.lives, gameOver: false };
    this.lives = Math.max(0, this.lives - 1);
    this.gameOver = this.lives === 0;
    return { lives: this.lives, gameOver: this.gameOver };
  }

  /** Last life left (bark "Ninth life. Making it count."). */
  get last() { return !this.infinite && this.lives === 1; }
}
