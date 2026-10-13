// src/audio/MusicPlayer.js  (owner: audio) — A/B music decks with crossfades (tech.md §14, GAME_DESIGN §16.1) and a
// one-shot sting deck. Long tracks stream through an <audio> element (MediaElementAudioSourceNode) so a 3-minute
// track never sits decoded in memory; short seamless loops and stings (`buffer: true`) are decoded AudioBuffers.
// Each deck runs source → low-pass → gain, so a track def's `rate` / `lowpass` / `loopEnd` (WA §9 warm variants:
// lantern_night, hub_hush, results_dance) need no extra file.
import { TRACKS, trackGain } from './musicMap.js';

/**
 * @typedef {object} Deck
 * @property {GainNode} gain
 * @property {BiquadFilterNode} filter  per-track low-pass (open at FILTER_OPEN)
 * @property {HTMLAudioElement|null} el
 * @property {MediaElementAudioSourceNode|null} elSrc
 * @property {AudioBufferSourceNode|null} src
 * @property {string|null} track
 * @property {number} stopAt   ac time at which the faded-out deck is stopped (0 = live)
 * @property {number} token    bumps per start (late buffer decodes for an old request are dropped)
 * @property {number} startedAt
 */

/** Cutoff (Hz) of an "open" deck filter (the track has no `lowpass`). */
const FILTER_OPEN = 20000;

export class MusicPlayer {
  /**
   * @param {AudioContext} ac @param {AudioNode} dest  music bus input (the decks are ducked there)
   * @param {{ url: (file: string) => string, buffer: (file: string) => Promise<AudioBuffer|null>, canOgg?: boolean,
   *           has?: (file: string) => boolean, stingDest?: AudioNode }} io  stingDest: where stings go (past the duck)
   */
  constructor(ac, dest, io) {
    this.ac = ac; this.dest = dest; this.io = io;
    /** @type {Deck[]} */
    this.decks = [this._deck(), this._deck()];
    this.active = 0;
    this.sting = { gain: ac.createGain(), src: null, endAt: 0 };
    this.sting.gain.connect(io.stingDest ?? dest);
    this.current = null;     // track id on the active deck (or null)
  }

  /** @returns {Deck} */
  _deck() {
    const gain = this.ac.createGain(); gain.gain.value = 0; gain.connect(this.dest);
    const filter = this.ac.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = this._open(); filter.connect(gain);
    return { gain, filter, el: null, elSrc: null, src: null, track: null, stopAt: 0, token: 0, startedAt: 0, loopEnd: 0, loopFrom: 0 };
  }

  /** The open cutoff, kept under Nyquist. */
  _open() { return Math.min(FILTER_OPEN, (this.ac.sampleRate || 44100) * 0.45); }

  /** Point the deck's filter at the track's `lowpass` (or open it). */
  _tone(deck, def) {
    const f = def?.lowpass > 0 ? Math.min(def.lowpass, this._open()) : this._open();
    deck.filter.frequency.setValueAtTime(f, this.ac.currentTime);
  }

  _ramp(param, to, dur) {
    const t = this.ac.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    if (dur > 0.005) param.linearRampToValueAtTime(to, t + dur); else param.setValueAtTime(to, t);
  }

  /**
   * Crossfade to `trackId` (null = fade out). Same track already live → only the volume is re-targeted.
   * @param {string|null} trackId @param {number} [fade] @param {number} [mul]  per-level gain (gate approach: low)
   */
  play(trackId, fade = 1.5, mul = 1) {
    const def = trackId ? TRACKS[trackId] : null;
    const level = def ? trackGain(def) * (Number.isFinite(mul) ? Math.max(0, mul) : 1) : 0;
    if (trackId && !def) { console.warn(`[audio] unknown music track "${trackId}"`); return; }
    const cur = this.decks[this.active];
    if (def && cur.track === trackId) { cur.stopAt = 0; this._ramp(cur.gain.gain, level, fade); this.current = trackId; return; }
    // fade the live deck out
    if (cur.track) { this._ramp(cur.gain.gain, 0, fade); cur.stopAt = this.ac.currentTime + fade + 0.05; }
    this.current = trackId;
    if (!def) return;
    const next = this.decks[this.active ^ 1];
    this.active ^= 1;
    if (next.track === trackId && next.stopAt) {          // it was still fading out: bring it back, no restart
      next.stopAt = 0; this._ramp(next.gain.gain, level, fade); return;
    }
    this._stopDeck(next);
    next.track = trackId; next.stopAt = 0; next.startedAt = this.ac.currentTime;
    next.loopEnd = def.loopEnd > 0 ? def.loopEnd : 0; next.loopFrom = def.offset ?? 0;
    this._tone(next, def);
    next.gain.gain.cancelScheduledValues(this.ac.currentTime); next.gain.gain.setValueAtTime(0, this.ac.currentTime);
    const token = ++next.token;
    if (def.buffer) {
      this.io.buffer(def.file).then((buf) => {
        if (!buf || next.token !== token || next.track !== trackId) return;
        const s = this.ac.createBufferSource(); s.buffer = buf; s.loop = def.loop !== false;
        if (def.rate) s.playbackRate.value = def.rate;
        if (next.loopEnd) { s.loopStart = next.loopFrom; s.loopEnd = Math.min(next.loopEnd, buf.duration); }
        s.connect(next.filter); s.start(this.ac.currentTime, Math.min(def.offset ?? 0, buf.duration - 0.01));
        next.src = s;
        if (!next.stopAt) this._ramp(next.gain.gain, level, fade);
      });
    } else {
      const el = this._element(next);
      el.loop = def.loop !== false;
      el.src = this.io.url(this._file(def));
      // warm variants: slower AND lower (pitch follows the rate)
      el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false;
      el.defaultPlaybackRate = def.rate ?? 1; el.playbackRate = def.rate ?? 1;
      if (def.offset) {
        const seek = () => { if (next.token === token) { try { el.currentTime = def.offset; } catch { /* not seekable */ } } };
        if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true });
      }
      el.play().catch(() => { /* aborted by a newer request, or autoplay pending: retried on unlock */ });
      this._ramp(next.gain.gain, level, fade);
    }
  }

  /** Ogg → mp3 sibling where Ogg can't play (Safari; M4 ships mp3 copies). */
  _file(def) {
    if (this.io.canOgg === false && /\.ogg$/i.test(def.file) && this.io.has?.(def.file.replace(/\.ogg$/i, '.mp3'))) return def.file.replace(/\.ogg$/i, '.mp3');
    return def.file;
  }

  _element(deck) {
    if (!deck.el) {
      const el = new Audio();
      el.preload = 'auto'; el.crossOrigin = 'anonymous';
      deck.el = el;
      deck.elSrc = this.ac.createMediaElementSource(el);
      deck.elSrc.connect(deck.filter);
    }
    return deck.el;
  }

  _stopDeck(deck) {
    if (deck.src) { try { deck.src.stop(); } catch { /* stopped */ } deck.src.disconnect(); deck.src = null; }
    if (deck.el && !deck.el.paused) deck.el.pause();
    deck.track = null; deck.stopAt = 0; deck.token++; deck.loopEnd = 0;
  }

  /** One-shot sting (victory fanfare) over the ducked music. Resolves the duration (s) or 0. */
  async playSting(trackId, volume = 1) {
    const def = TRACKS[trackId];
    if (!def) return 0;
    const buf = await this.io.buffer(def.file);
    if (!buf) return 0;
    if (this.sting.src) { try { this.sting.src.stop(); } catch { /* */ } this.sting.src.disconnect(); }
    const s = this.ac.createBufferSource(); s.buffer = buf; s.connect(this.sting.gain);
    this.sting.gain.gain.value = trackGain(def) * volume;
    s.start(); this.sting.src = s; this.sting.endAt = this.ac.currentTime + buf.duration;
    return buf.duration;
  }

  /** Resume elements that autoplay blocked (call after the context starts). */
  resume() {
    for (const d of this.decks) if (d.el && d.track && !d.stopAt && d.el.paused) d.el.play().catch(() => {});
  }

  /** Stop decks whose fade-out finished; wrap streamed `loopEnd` tracks (call per frame). */
  update() {
    const t = this.ac.currentTime;
    for (const d of this.decks) {
      if (d.stopAt && t >= d.stopAt) { this._stopDeck(d); continue; }
      if (d.loopEnd && d.el && !d.src && d.track && d.el.currentTime >= d.loopEnd) {
        try { d.el.currentTime = d.loopFrom; } catch { /* not seekable yet */ }
      }
    }
  }

  /** Debug snapshot. */
  state() {
    const d = this.decks[this.active];
    return {
      track: this.current,
      decks: this.decks.map((k) => ({ track: k.track, gain: +k.gain.gain.value.toFixed(3), fading: !!k.stopAt,
        time: k.el && k.track && !k.src ? +(k.el.currentTime || 0).toFixed(2) : (k.src ? +(this.ac.currentTime - k.startedAt).toFixed(2) : 0),
        playing: !!(k.src || (k.el && !k.el.paused)), streamed: !!(k.el && !k.src && k.track),
        rate: k.track ? (TRACKS[k.track]?.rate ?? 1) : 1, lowpass: Math.round(k.filter.frequency.value), loopEnd: k.loopEnd })),
      active: this.active, liveTrack: d.track, sting: this.sting.endAt > this.ac.currentTime,
    };
  }

  stopAll(fade = 0.3) {
    for (const d of this.decks) if (d.track) { this._ramp(d.gain.gain, 0, fade); d.stopAt = this.ac.currentTime + fade + 0.05; }
    this.current = null;
  }

  dispose() {
    for (const d of this.decks) {
      this._stopDeck(d);
      if (d.el) { d.el.removeAttribute('src'); d.el.load?.(); }
      d.elSrc?.disconnect(); d.filter.disconnect(); d.gain.disconnect();
    }
    if (this.sting.src) { try { this.sting.src.stop(); } catch { /* */ } }
    this.sting.gain.disconnect();
  }
}

