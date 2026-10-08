// src/audio/sfxDefs.js  (owner: audio) — zzfx parameter arrays (GAME_DESIGN §16.3; tech.md §14). They are baked into
// AudioBuffers of OUR AudioContext on unlock (`bakeZzfx`); zzfx itself creates an AudioContext at import, so it is
// imported lazily (after the user gesture) and its own context is closed straight away.
//
// zzfx 1.4 parameter order:
//   [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump,
//    pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
// shape: 0 sin, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square. filter < 0 = low-pass, > 0 = high-pass (Hz).
// randomness is 0 everywhere: variation comes from the playback rate (seeded), so bakes are deterministic.

/** @type {Record<string, number[]>} */
export const ZZFX_DEFS = {
  /** §16.3 heartbeat: one low thump ("lub"; the "dub" is the same thump, quieter, 0.2 s later). */
  heartThump: [1, 0, 62, 0.004, 0.02, 0.16, 0, 2, -0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.05, 0, -360],
  /** §16.2 crows: a raspy falling "kraa" (fallback for creature/c80_scream_*). */
  crowCaw: [0.8, 0, 640, 0.02, 0.14, 0.12, 2, 2, -2.5, 0, 0, 0, 0, 0.9, 18, 0, 0, 0.7, 0.04, 0, -2600],
  /** §16.3 laugh-build syllable fallback ("hee"), used when the c80_troll/weird slices are not decoded yet. */
  hyenaLaugh: [0.7, 0, 880, 0.01, 0.05, 0.06, 1, 1.5, 4, 0, 0, 0, 0, 0.25, 0, 0, 0, 0.8, 0.02, 0, -3000],
  /** babble fallback blip */
  blip: [0.5, 0, 520, 0.005, 0.03, 0.04, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
};

/** Samples length (s) a def produces (attack + decay + sustain + release + delay). */
export function zzfxDuration(p) {
  const v = (i, d) => (p[i] ?? d);
  return (v(3, 0) || 9 / 44100) + v(18, 0) + v(4, 0) + v(5, 0.1) + v(16, 0);
}

/**
 * Bake every def into an AudioBuffer of `ac`. Resolves to Map<name, AudioBuffer>; never rejects.
 * @param {BaseAudioContext} ac @param {Record<string, number[]>} [defs]
 */
export async function bakeZzfx(ac, defs = ZZFX_DEFS) {
  const out = new Map();
  let ZZFX;
  try { ({ ZZFX } = await import('zzfx')); } catch (e) { console.warn('[audio] zzfx unavailable', e?.message ?? e); return out; }
  try {
    if (ZZFX.audioContext && ZZFX.audioContext !== ac) { const own = ZZFX.audioContext; ZZFX.audioContext = ac; own.close?.().catch?.(() => {}); }
  } catch { /* ignore */ }
  const prevRate = ZZFX.sampleRate;
  ZZFX.sampleRate = ac.sampleRate;               // bake at the context rate: no resampling
  try {
    for (const [name, params] of Object.entries(defs)) {
      try {
        const s = ZZFX.buildSamples(...params);
        if (!s.length) continue;
        const b = ac.createBuffer(1, s.length, ac.sampleRate);
        b.getChannelData(0).set(s);
        out.set(name, b);
      } catch (e) { console.warn(`[audio] zzfx bake failed: ${name}`, e?.message ?? e); }
    }
  } finally { ZZFX.sampleRate = prevRate; }
  return out;
}
