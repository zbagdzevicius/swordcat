// src/audio/nature.js  (owner: audio) — M2 procedural ambience (GAME_DESIGN §16.3 spirit: "no file was downloaded for
// these"). ASSETS.md has no birdsong, cricket, fire or rumble recordings, so the forest, the hub and the CS-04 / CS-10
// cues synthesise them: tiny sine chirps (birds, the owl) and short buffers built once per AudioContext (crickets,
// the campfire crackle, the Gloom rumble). Pure planners / sample generators (node-testable) + small WebAudio players.

export const BIRDS = {
  phrase: [2, 6],             // chirps per phrase
  kinds: ['tweet', 'trill', 'warble', 'peep'],
  vol: 0.05,
  attack: 0.006,
};

/**
 * One bird phrase: [{ t, f0, f1, dur, gain }] (sine sweeps f0 → f1). Kinds: tweet (rising), trill (fast repeats),
 * warble (falling), peep (two plain notes). @param {() => number} rand @param {{kind?: string}} [opts]
 */
export function birdPlan(rand, { kind } = {}) {
  const k = kind ?? BIRDS.kinds[Math.floor(rand() * BIRDS.kinds.length) % BIRDS.kinds.length];
  const base = 2400 + rand() * 1800, out = [];
  let t = 0;
  if (k === 'trill') {
    const n = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) { out.push({ t, f0: base * 1.1, f1: base * 0.95, dur: 0.035, gain: 0.7 + 0.3 * Math.sin(Math.PI * i / n) }); t += 0.055; }
  } else {
    const [a, b] = BIRDS.phrase, n = a + Math.floor(rand() * (b - a + 1));
    for (let i = 0; i < n; i++) {
      const dur = k === 'peep' ? 0.11 : 0.05 + rand() * 0.07;
      const f0 = k === 'warble' ? base * 1.3 : k === 'peep' ? base * 0.8 : base * (0.75 + rand() * 0.2);
      const f1 = k === 'warble' ? base * (0.8 + rand() * 0.2) : k === 'peep' ? base * 0.78 : base * (1.25 + rand() * 0.3);
      out.push({ t, f0, f1, dur, gain: 0.6 + rand() * 0.4 });
      t += dur + 0.04 + rand() * (k === 'peep' ? 0.25 : 0.09);
    }
  }
  return out;
}

/** The owl (forest night): "hoo … hoo-hoo". */
export function hootPlan(rand) {
  const f = 360 + rand() * 50;
  return [
    { t: 0, f0: f * 1.02, f1: f, dur: 0.42, gain: 1, attack: 0.08 },
    { t: 0.75, f0: f * 0.98, f1: f * 0.95, dur: 0.22, gain: 0.8, attack: 0.05 },
    { t: 1.05, f0: f, f1: f * 0.9, dur: 0.5, gain: 0.9, attack: 0.06 },
  ];
}

/** Length (s) of a chirp plan. */
export const chirpLength = (plan) => plan.reduce((m, n) => Math.max(m, n.t + n.dur), 0);

/**
 * Play a chirp plan (birds, owl) into `dest`. Returns the end time (ac seconds).
 * @param {BaseAudioContext} ac @param {AudioNode} dest @param {Array} plan @param {{when?: number, volume?: number}} [o]
 */
export function playChirps(ac, dest, plan, { when = 0, volume = 1 } = {}) {
  const t0 = Math.max(ac.currentTime, when || ac.currentTime);
  for (const n of plan) {
    const t = t0 + n.t, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(n.f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, n.f1), t + n.dur);
    const a = n.attack ?? BIRDS.attack, peak = n.gain * volume;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, n.dur * 0.6));
    g.gain.linearRampToValueAtTime(0, t + n.dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + n.dur + 0.02);
    o.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
  }
  return t0 + chirpLength(plan);
}

export const CRICKETS = { sec: 3, voices: 3, freq: [3900, 4700], chirpEvery: [0.38, 0.6], pulses: 3, pulseSec: 0.018, gapSec: 0.012, peak: 0.5 };

/**
 * A seamless cricket bed: `voices` crickets, each chirping `pulses` short sine pulses every ~0.5 s. The chirp grid
 * wraps around the loop length, so the loop has no seam. @returns {Float32Array}
 */
export function cricketData(sr, rand, sec = CRICKETS.sec) {
  const n = Math.round(sr * sec), out = new Float32Array(n);
  const pl = Math.max(4, Math.round(sr * CRICKETS.pulseSec)), gap = Math.round(sr * CRICKETS.gapSec);
  for (let v = 0; v < CRICKETS.voices; v++) {
    const f = CRICKETS.freq[0] + rand() * (CRICKETS.freq[1] - CRICKETS.freq[0]);
    const every = CRICKETS.chirpEvery[0] + rand() * (CRICKETS.chirpEvery[1] - CRICKETS.chirpEvery[0]);
    const count = Math.max(1, Math.round(sec / every)), step = n / count, phase = rand() * step, amp = 0.6 + rand() * 0.4;
    for (let c = 0; c < count; c++) {
      const s0 = Math.round(phase + c * step);
      for (let p = 0; p < CRICKETS.pulses; p++) {
        const ps = s0 + p * (pl + gap);
        for (let i = 0; i < pl; i++) out[(ps + i) % n] += Math.sin(2 * Math.PI * f * (ps + i) / sr) * Math.sin(Math.PI * i / pl) * amp;
      }
    }
  }
  return normalise(out, CRICKETS.peak);
}

export const CRACKLE = { sec: 4, popsPerSec: 14, snapEvery: 1.6, bed: 0.12, peak: 0.8 };

/**
 * A campfire: a soft brown-noise roar plus random pops (decaying noise bursts of 2–15 ms) and the odd louder snap.
 * The bed is cross-faded at the loop seam. @returns {Float32Array}
 */
export function crackleData(sr, rand, sec = CRACKLE.sec) {
  const n = Math.round(sr * sec), out = brown(n, rand, 0.995);
  normalise(out, CRACKLE.bed);
  const seam = Math.min(n >> 3, Math.round(sr * 0.1));
  for (let i = 0; i < seam; i++) { const w = i / seam; out[i] = out[i] * w + out[n - seam + i] * (1 - w); }
  const pops = Math.round(CRACKLE.popsPerSec * sec);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(rand() * n), snap = rand() < 1 / (CRACKLE.popsPerSec * CRACKLE.snapEvery);
    const len = Math.max(2, Math.round(sr * (snap ? 0.012 + rand() * 0.02 : 0.002 + rand() * 0.012)));
    const amp = snap ? 0.9 : 0.15 + rand() * 0.45;
    for (let i = 0; i < len; i++) out[(at + i) % n] += (rand() * 2 - 1) * amp * Math.exp(-5 * i / len);
  }
  return normalise(out, CRACKLE.peak);
}

/**
 * Brown noise shaped by a swell (in over `rise` of the duration, out over the rest): the Gloom rolling in (CS-10), a
 * crowd's roar under the CS-09 charge. @returns {Float32Array}
 */
export function rumbleData(sr, rand, sec = 4, rise = 0.4) {
  const n = Math.max(2, Math.round(sr * sec)), out = normalise(brown(n, rand, 0.998), 0.9), r = Math.max(1, Math.round(n * rise));
  for (let i = 0; i < n; i++) out[i] *= i < r ? i / r : Math.max(0, (n - i) / Math.max(1, n - r));
  return out;
}

function brown(n, rand, leak) {
  const out = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) { b = (b + (rand() * 2 - 1) * 0.02) * leak; out[i] = b; }
  let mean = 0; for (let i = 0; i < n; i++) mean += out[i];
  mean /= n || 1; for (let i = 0; i < n; i++) out[i] -= mean;
  return out;
}

function normalise(out, peakTo) {
  let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? peakTo / peak : 0;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}

/**
 * A generated buffer (looped or one-shot) through an optional filter into `dest`.
 * Returns { src, out, endAt, stop(fade), setVolume(v, fade) }.
 * @param {BaseAudioContext} ac @param {AudioNode} dest @param {Float32Array|AudioBuffer} data
 * @param {{loop?: boolean, volume?: number, filter?: {type: BiquadFilterType, freq: number, q?: number}, fadeIn?: number, when?: number, rate?: number}} [o]
 */
export function playData(ac, dest, data, { loop = false, volume = 1, filter = null, fadeIn = 0, when = 0, rate = 1 } = {}) {
  let buf = data;
  if (data instanceof Float32Array) { buf = ac.createBuffer(1, data.length, ac.sampleRate); buf.getChannelData(0).set(data); }
  const t = Math.max(ac.currentTime, when || ac.currentTime);
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = loop; src.playbackRate.value = rate;
  const out = ac.createGain();
  if (fadeIn > 0) { out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(volume, t + fadeIn); } else out.gain.value = volume;
  let head = src, f = null;
  if (filter) {
    f = ac.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; if (filter.q) f.Q.value = filter.q;
    src.connect(f); head = f;
  }
  head.connect(out); out.connect(dest);
  src.start(t, loop ? 0 : 0);
  src.onended = () => { try { out.disconnect(); f?.disconnect(); } catch { /* gone */ } };
  return {
    src, out, endAt: loop ? Infinity : t + buf.duration / rate,
    stop(fade = 0.3) {
      const n = ac.currentTime;
      out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0, n + fade);
      try { src.stop(n + fade + 0.02); } catch { /* stopped */ }
    },
    setVolume(v, fade = 0.5) { out.gain.setTargetAtTime(v, ac.currentTime, Math.max(0.01, fade / 3)); },
  };
}
