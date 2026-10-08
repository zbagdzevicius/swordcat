// src/audio/procedural.js  (owner: audio) — GAME_DESIGN §16.3 procedural audio: wind, the Sunbell, the hyena laugh
// build, the Golden Hour shimmer pad and heartbeat timing. Pure planners (node-testable) + small WebAudio builders
// that take an AudioContext and a destination node (no globals, nothing at import).

// ------------------------------------------------------------------------------------------------ wind
export const WIND = {
  bufferSec: 2,                 // 2 s pink-noise AudioBuffer, looped
  freqBase: 400, freqPerWind: 300, q: 0.8,
  gainBase: 0.08, gainPerWind: 0.12,
  lfoHz: 0.13, lfoDepth: 0.2,   // ±20%
  maxWind: 3,
  smooth: 0.6,                  // setTargetAtTime constant for wind changes (s)
  noiseRms: 0.5,                // pre-filter loudness of the noise bed (the band-pass keeps ~1/6 of it)
  seamSec: 0.05,                // crossfade of the loop seam
};

/** §16.3: band-pass centre and gain for a wind value (0–3; Env and the grass `uWindStrength` share it). */
export function windParams(wind, mul = 1) {
  const w = Math.max(0, Math.min(WIND.maxWind, (Number.isFinite(wind) ? wind : 0) * mul));
  return { freq: WIND.freqBase + WIND.freqPerWind * w, gain: WIND.gainBase + WIND.gainPerWind * w, wind: w };
}

/**
 * Pink noise (Paul Kellet's refined filter), normalised to `rms`, with the loop seam cross-faded so the 2 s buffer
 * loops without a click. @param {number} n samples @param {() => number} rand [0,1) @param {number} [rms]
 */
export function pinkNoise(n, rand, rms = WIND.noiseRms, seam = 0) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  // remove DC, then normalise
  let mean = 0; for (let i = 0; i < n; i++) mean += out[i]; mean /= n || 1;
  let sq = 0; for (let i = 0; i < n; i++) { out[i] -= mean; sq += out[i] * out[i]; }
  const k = sq > 0 ? rms / Math.sqrt(sq / n) : 0;
  for (let i = 0; i < n; i++) out[i] *= k;
  // equal-power crossfade of the last `seam` samples into the first ones → seamless loop
  const m = Math.min(seam | 0, n >> 2);
  for (let i = 0; i < m; i++) {
    const t = (i + 1) / (m + 1), a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2);
    out[i] = out[i] * b + out[n - m + i] * a;
  }
  return m ? out.subarray(0, n - m) : out;
}

/**
 * The wind bed: looped pink noise → band-pass → gain (with a 0.13 Hz LFO at ±20%) → dest.
 * Call `set(wind, mul)` whenever Env's wind changes (cheap; ramps smoothly).
 */
export class Wind {
  /** @param {BaseAudioContext} ac @param {AudioNode} dest @param {() => number} rand */
  constructor(ac, dest, rand) {
    this.ac = ac;
    const sr = ac.sampleRate, seam = Math.round(sr * WIND.seamSec);
    const data = pinkNoise(Math.round(sr * WIND.bufferSec) + seam, rand, WIND.noiseRms, seam);
    this.buffer = ac.createBuffer(1, data.length, sr);
    this.buffer.getChannelData(0).set(data);
    this.src = ac.createBufferSource(); this.src.buffer = this.buffer; this.src.loop = true;
    this.filter = ac.createBiquadFilter(); this.filter.type = 'bandpass'; this.filter.Q.value = WIND.q;
    this.gain = ac.createGain(); this.gain.gain.value = 0;
    this.lfo = ac.createOscillator(); this.lfo.frequency.value = WIND.lfoHz;
    this.lfoGain = ac.createGain(); this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain); this.lfoGain.connect(this.gain.gain);
    this.src.connect(this.filter); this.filter.connect(this.gain); this.gain.connect(dest);
    this.value = { wind: -1, freq: 0, gain: 0 };
    this.started = false;
  }

  start(wind = 0.6, mul = 1) {
    if (this.started) return;
    this.started = true;
    const p = windParams(wind, mul), t = this.ac.currentTime;
    this.filter.frequency.setValueAtTime(p.freq, t);
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.setTargetAtTime(p.gain, t, 0.8);           // fade in
    this.lfoGain.gain.setValueAtTime(p.gain * WIND.lfoDepth, t);
    this.value = p;
    this.src.start(t); this.lfo.start(t);
  }

  /** @param {number} wind Env wind (0–3) @param {number} [mul] Meme Cam ×1.6 */
  set(wind, mul = 1) {
    const p = windParams(wind, mul);
    if (!this.started || (Math.abs(p.wind - this.value.wind) < 1e-3)) return;
    const t = this.ac.currentTime;
    this.filter.frequency.setTargetAtTime(p.freq, t, WIND.smooth);
    this.gain.gain.setTargetAtTime(p.gain, t, WIND.smooth);
    this.lfoGain.gain.setTargetAtTime(p.gain * WIND.lfoDepth, t, WIND.smooth);
    this.value = p;
  }

  stop() {
    if (!this.started) return;
    try { this.src.stop(); this.lfo.stop(); } catch { /* already stopped */ }
    this.src.disconnect(); this.lfo.disconnect(); this.lfoGain.disconnect(); this.filter.disconnect(); this.gain.disconnect();
    this.started = false;
  }
}

// ------------------------------------------------------------------------------------------------ the Sunbell
export const BELL = {
  base: 196,
  ratios: [0.5, 1, 1.19, 1.56, 2, 2.66, 3.01],
  amps: [0.6, 1, 0.5, 0.35, 0.3, 0.2, 0.15],
  tau: 6,               // τ = 6 s / √ratio
  tauDamped: 0.4,       // CS-02 "clunk"
  attack: 0.004,
  maxDur: 30,           // oscillators stop after min(7 τ_max, maxDur)
  gain: 0.22,           // the partial sum peaks near 3.1
  layer: { name: 'bellLayer' },       // impact/metal_ringing at rate 0.5, volume 0.3 (sfxMap)
  clunkLayer: { name: 'bellClunk' },
};

/** Partials of the Sunbell: [{ freq, amp, tau }]. */
export function bellPartials({ base = BELL.base, damped = false } = {}) {
  const t0 = damped ? BELL.tauDamped : BELL.tau;
  return BELL.ratios.map((r, i) => ({ freq: base * r, amp: BELL.amps[i], tau: t0 / Math.sqrt(r) }));
}

/** Seconds until every partial has decayed by `nTau` time constants (capped). */
export function bellDuration(opts = {}) {
  return Math.min(BELL.maxDur, Math.max(...bellPartials(opts).map((p) => p.tau)) * 7);
}

/**
 * Strike the Sunbell: additive sines with exponential decay into `dest`. Returns { stop(fade), endAt }.
 * @param {BaseAudioContext} ac @param {AudioNode} dest
 * @param {{base?: number, damped?: boolean, volume?: number, when?: number, detune?: () => number}} [opts]
 */
export function strikeBell(ac, dest, { base = BELL.base, damped = false, volume = 1, when = 0, detune = null } = {}) {
  const t = Math.max(ac.currentTime, when || ac.currentTime);
  const out = ac.createGain(); out.gain.value = BELL.gain * volume; out.connect(dest);
  const dur = bellDuration({ base, damped }), oscs = [];
  for (const p of bellPartials({ base, damped })) {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.value = p.freq; if (detune) o.detune.value = detune();
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.amp, t + BELL.attack);
    g.gain.setTargetAtTime(0, t + BELL.attack, p.tau);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + Math.min(dur, p.tau * 7) + 0.05);
    oscs.push(o);
  }
  oscs[0].onended = () => { try { out.disconnect(); } catch { /* gone */ } };
  return {
    endAt: t + dur,
    stop(fade = 0.1) {
      const n = ac.currentTime;
      out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0, n + fade);
      for (const o of oscs) { try { o.stop(n + fade + 0.02); } catch { /* stopped */ } }
    },
  };
}

// ------------------------------------------------------------------------------------------------ hyena laugh build
export const LAUGH = {
  sources: ['creature/c80_troll_01', 'creature/c80_troll_02', 'creature/c80_troll_03',
            'creature/c80_weird_01', 'creature/c80_weird_02', 'creature/c80_weird_03', 'creature/c80_weird_04', 'creature/c80_weird_05'],
  syllables: [4, 7],
  slice: [0.08, 0.14],
  rate: [1.25, 1.45],
  gap: 0.09,             // "90 ms apart"
  contour: [0.92, 1.12, 0.86],   // rate multiplier at start / peak / end ("rising then falling")
  peakAt: 0.6,
  attack: 0.006, release: 0.03,
  refDistance: 3, rolloff: 1.4,
  maxConcurrent: 4,
  vol: 0.8,
};

/**
 * Plan one laugh: [{ t, src, offsetFrac, slice, rate, gain }] — `t` = start (s) after the laugh begins, `slice` =
 * buffer seconds to play, `offsetFrac` = where (0..1) in the source's active region the slice starts.
 * @param {() => number} rand @param {{rate?: number, syllables?: number, sources?: number}} [opts]
 */
export function laughPlan(rand, { rate = 1, syllables = 0, sources = LAUGH.sources.length } = {}) {
  const [nMin, nMax] = LAUGH.syllables;
  const n = syllables > 0 ? Math.round(syllables) : nMin + Math.floor(rand() * (nMax - nMin + 1));
  const base = (LAUGH.rate[0] + rand() * (LAUGH.rate[1] - LAUGH.rate[0])) * rate;
  const src = Math.floor(rand() * sources);
  const [c0, cPeak, c1] = LAUGH.contour, peak = Math.max(1, Math.round((n - 1) * LAUGH.peakAt));
  const out = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const c = i <= peak ? c0 + (cPeak - c0) * (i / peak) : cPeak + (c1 - cPeak) * ((i - peak) / Math.max(1, n - 1 - peak));
    const r = base * c;
    const slice = LAUGH.slice[0] + rand() * (LAUGH.slice[1] - LAUGH.slice[0]);
    // mostly one source per laugh (a voice); now and then a syllable from another for texture
    const s = rand() < 0.8 ? src : Math.floor(rand() * sources);
    const gain = (0.75 + 0.25 * Math.sin(Math.PI * (i + 0.5) / n)) * (0.9 + rand() * 0.1);
    out.push({ t, src: s, offsetFrac: rand(), slice, rate: r, gain });
    t += slice / r + LAUGH.gap;
  }
  return out;
}

/** Total length (s) of a laugh plan. */
export function laughLength(plan) {
  const l = plan[plan.length - 1];
  return l ? l.t + l.slice / l.rate : 0;
}

// ------------------------------------------------------------------------------------------------ shimmer pad
export const SHIMMER = {
  freqs: [880, 1320, 1760],
  detuneCents: [4, -5, 7],
  gain: 0.03,           // per sine (§16.3)
  fadeIn: 0.6, fadeOut: 0.8,
  tremHz: 0.23, tremDepth: 0.3,
};

/** Golden Hour shimmer pad: 3 detuned sines with a slow tremolo. `set(on)` fades it; `dispose()` tears it down. */
export class Shimmer {
  /** @param {BaseAudioContext} ac @param {AudioNode} dest */
  constructor(ac, dest) {
    this.ac = ac; this.dest = dest; this.nodes = null; this.on = false; this._offAt = 0;
  }

  _build() {
    const ac = this.ac, out = ac.createGain(); out.gain.value = 0; out.connect(this.dest);
    const trem = ac.createOscillator(); trem.frequency.value = SHIMMER.tremHz;
    const tremG = ac.createGain(); tremG.gain.value = SHIMMER.gain * SHIMMER.tremDepth;
    trem.connect(tremG);
    const oscs = [trem];
    SHIMMER.freqs.forEach((f, i) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = SHIMMER.detuneCents[i];
      const g = ac.createGain(); g.gain.value = SHIMMER.gain; tremG.connect(g.gain);
      o.connect(g); g.connect(out); oscs.push(o);
    });
    const t = ac.currentTime; for (const o of oscs) o.start(t);
    this.nodes = { out, oscs, tremG };
  }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    const t = this.ac.currentTime;
    if (on) {
      if (!this.nodes) this._build();
      const g = this.nodes.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1, t + SHIMMER.fadeIn);
      this._offAt = 0;
    } else if (this.nodes) {
      const g = this.nodes.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + SHIMMER.fadeOut);
      this._offAt = t + SHIMMER.fadeOut + 0.05;
    }
  }

  /** Free the oscillators once faded out (call per frame). */
  update() {
    if (!this.on && this.nodes && this._offAt && this.ac.currentTime >= this._offAt) this.dispose();
  }

  dispose() {
    if (!this.nodes) return;
    for (const o of this.nodes.oscs) { try { o.stop(); } catch { /* stopped */ } o.disconnect(); }
    this.nodes.out.disconnect(); this.nodes = null; this._offAt = 0;
  }
}

// ------------------------------------------------------------------------------------------------ heartbeat
export const HEART = {
  pair: 0.2,            // "lub" → "dub"
  dubGain: 0.7,
  bpm: 60,              // low-HP pulse at 1 Hz (vignette pulse, §8.2)
  lowHp: 2,             // ≤ 2 HP
  lowHpVol: 0.45,
};

/** Beat schedule: [{ t, gain }] for `beats` lub-dubs at `bpm`. */
export function heartbeatPlan(beats = 1, bpm = HEART.bpm, volume = 1) {
  const out = [], period = 60 / Math.max(1, bpm);
  for (let i = 0; i < beats; i++) {
    out.push({ t: i * period, gain: volume });
    out.push({ t: i * period + HEART.pair, gain: volume * HEART.dubGain });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ horde march (CS-02)
export const MARCH = {
  stepEvery: 0.36,      // two files of hyenas at 1.6 m/s
  chainEvery: 1.1,
  stepIds: ['footsteps/sand_l1', 'footsteps/sand_r1', 'footsteps/sand_l2', 'footsteps/sand_r2', 'footsteps/sand_l3', 'footsteps/sand_r3'],
  chainIds: ['impact/chain_01', 'impact/chain_02', 'impact/chain_03'],
  stepVol: 0.45, chainVol: 0.35,
  spread: 6,            // m around the centre
};

/** Every procedural-layer file id (manifest + U15). */
export function proceduralFileIds() {
  return [...LAUGH.sources, ...MARCH.stepIds, ...MARCH.chainIds];
}
