// src/core/schedule.js  (owner: core) — deterministic sub-rate scheduler (PERF_SPEC §4.2; IMPLEMENTATION_PLAN §7.2).
// Depends only on game.stepCount (the 60 Hz fixed step), so replays and ?test stay reproducible.

/**
 * True on the fixed steps where work running at `hz` is due: every round(60 / hz)-th step, offset by `phase`
 * (use the actor id so many actors spread over the steps). `hz` ≥ 60 → every step; `hz` ≤ 0 → never.
 * Timing-critical work (combat resolve, player, physics, windups) always runs at 60 Hz and never uses this.
 * @param {{stepCount: number}} game @param {number} hz @param {number} [phase]
 */
export const every = (game, hz, phase = 0) => hz > 0 && ((game.stepCount + phase) % Math.max(1, Math.round(60 / hz))) === 0;
