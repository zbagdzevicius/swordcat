// src/audio/mix.js  (owner: audio) — mix numbers for GAME_DESIGN §16.5 (buses, voice limits, ducking) and
// tech.md §14. Pure data; node-safe. These are audio-mix values, not gameplay numbers (config.js has none).

/** Bus layout (tech.md §14 "master, music and SFX"; sfx is split into three sub-buses so pause can duck the world). */
export const BUSES = ['master', 'music', 'sfx', 'world', 'player', 'ui'];

export const MIX = {
  /**
   * §16.5 / PERF §10.5: at most 8 2D and 8 pooled 3D voices (their PannerNodes are reused); the oldest is stolen.
   * Loops, wind, bells, the glock, shimmer and babble are extra.
   */
  voices2D: 8,
  voices3D: 8,
  /** §16.3 / tech.md §14 PositionalAudio settings. */
  refDistance: 3,
  rolloff: 1.4,
  maxDistance: 45,
  distanceModel: 'inverse',
  /** sub-bus trims under the sfx bus */
  world: 1.0,
  player: 0.9,
  ui: 0.8,
  /** settings sliders (0..1) → gain: gain = v ^ curve (perceptual; 0.6 → 0.36) */
  curve: 2,
  /** the same sound id never starts twice within this many seconds (multi-target hits, double emits) */
  minGap: 0.035,
  /** a sound requested before its buffer finished decoding still plays if the decode lands within this window */
  lateWindow: 0.25,
  /** steal fade (s) — avoids clicks when the oldest voice is reused */
  stealFade: 0.012,
  /** ART §9.3 master EQ: a little air, a little less boom (in front of the limiter) */
  shelf: { high: { freq: 6000, gain: 1.5 }, low: { freq: 120, gain: -2 } },
  /** master safety limiter */
  limiter: { threshold: -4, knee: 4, ratio: 10, attack: 0.003, release: 0.18 },
};

/** §16.1 rules + §7.8 Meme Cam: music ducking factors (linear gain) and their time constants. */
export const DUCK = {
  dialog: 0.5,          // −6 dB under dialogue
  menu: 0.5,            // pause menu
  meme: 0.0,            // Meme Cam: no music, duck to 0 over 1 s
  memeFade: 1.0,
  sting: 0.25,          // under the victory sting
  hitstop: 0.5,         // "a 30 ms duck during hitstop"
  hitstopDur: 0.03,
  /** world/player sfx while paused */
  pausedSfx: 0.35,
  tau: 0.12,            // default setTargetAtTime constant
};

/** §16.1 Meme Cam: no music (DUCK.meme), the wind ×1.6. */
export const MEME = {
  windMul: 1.6,
};
