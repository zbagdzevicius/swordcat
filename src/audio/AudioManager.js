// src/audio/AudioManager.js  (owner: audio) — ctx.audio (GAME_DESIGN §16, §19.3; tech.md §14).
//
// Contract (§19.3):  play2D(id, opts) · play3D(id, pos, opts) · music(track, fade) · laugh(pos, opts) · bell(opts)
//                    · unlock() · load(path)
// Additions:         heartbeat(opts) · shimmer(on) · babble(speaker, text, opts) · stopBabble() · laughChorus(center, opts)
//                    · stopLaughs() · march(on, opts) · loop(id, opts) · stopAll(fade) · setVolumes({master,music,sfx})
//                    · level(bus) · debugState() · showMeter(on) · resolve(id)
//
// Graph (one THREE.AudioListener on ctx.camera; its gain is the MASTER bus):
//   decks ─► musicDuck ─► hitDuck ─► music ─┐
//   3D voices (panner) / loops / wind ─► world ─┐                       ├─► master (listener) ─► limiter ─► out
//   2D voices / shimmer ─► player ──────────────┼─► sfx ─────────────────┘
//   ui sounds / babble ─► ui ───────────────────┘
//
// Nothing is created before the first user gesture (autoplay policy): requests made earlier are logged, music
// requests are remembered and start on unlock, and audio files are only fetched (decoded on unlock).
// Random choices use ctx.rng.fork('audio'), so sound never consumes the gameplay random stream.
import * as THREE from 'three';
import { E } from '../core/events.js';
import manifest from './assets.manifest.js';
import { MIX, DUCK } from './mix.js';
import { SFX, bindSfx, FOOTSTEP, LEVEL_SURFACE, STEP_CADENCE, TELEGRAPH_SFX, enemyVoiceFor, actorTypeId } from './sfxMap.js';
import { MusicDirector, TRACKS, MUSIC_RULES, AMBIENCE, levelMusic } from './musicMap.js';
import { MusicPlayer } from './MusicPlayer.js';
import { Wind, strikeBell, laughPlan, laughLength, LAUGH, Shimmer, HEART, heartbeatPlan, MARCH } from './procedural.js';
import { BABBLE, babblePlan, voiceFor, speakerKey } from './babble.js';
import { bakeZzfx } from './sfxDefs.js';
import { buildIndex, resolveId, isMusicPath } from './ids.js';

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const RECENT = 40;
const IDLE_STATES = new Set(['idle', 'patrol', 'return', 'sleep', 'hidden', 'dead', 'spawn']);

const hasWebAudio = () => typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
const sliderGain = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1)) ** MIX.curve;

/**
 * @typedef {object} Voice
 * @property {GainNode|null} out      per-play gain (null = idle)
 * @property {AudioScheduledSourceNode[]} srcs
 * @property {number} startAt
 * @property {number} endAt
 * @property {PannerNode|null} panner  3D slots only
 * @property {THREE.Vector3} pos
 * @property {any} follow             actor / Object3D the sound follows
 * @property {string} name
 * @property {boolean} laugh
 */

export class AudioManager {
  constructor(ctx) {
    this.ctx = ctx;
    /** the context runs (first gesture seen) */
    this.unlocked = false;
    /** graph built and running at least once */
    this.ready = false;
    /** music track the director wants (stub-compatible field) */
    this.currentTrack = null;
    /** last requested sounds (debug): strings `${kind}:${id}` */
    this.log = [];
    /** recent requests with time (debug / smoke) */
    this.recent = [];
    /** plays per name (requests, including the ones made before unlock) */
    this.counts = Object.create(null);
    /** sounds actually started per name */
    this.started = Object.create(null);

    this.index = buildIndex(manifest);
    this.rand = typeof ctx?.rng?.fork === 'function' ? ctx.rng.fork('audio') : Math.random;
    this.director = new MusicDirector();
    /** @type {AudioContext|null} */
    this.ac = null;
    this.listener = null;
    this.bus = null;            // { master, music, musicDuck, hitDuck, sfx, world, player, ui, babble }
    this.analysers = null;
    /** @type {Voice[]} */ this.voices2D = [];
    /** @type {Voice[]} */ this.voices3D = [];
    this.loops = new Set();
    this.bells = new Set();
    this.musicPlayer = null;
    this.wind = null;
    this.shim = null;
    this.zz = new Map();
    /** @type {Map<string, AudioBuffer>} */ this.buffers = new Map();
    this._regions = new WeakMap();
    this._bytes = new Map();
    this._decoding = new Map();
    this._fetched = new Set();
    this._missing = new Set();

    this.vol = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.ducks = { dialog: 1, menu: 1, meme: 1, sting: 1 };
    this.memeOn = false;
    this.pausedWorld = false;
    this.time = 0;              // real seconds (render)
    this._gates = new Map();
    this._offs = [];
    this._dom = [];
    this._fizzleT = 0;
    this._chargeLevel = 0;
    this._shimmerWant = false;
    this._hs = false;
    this._stingUntil = 0;
    this._dialogHold = 0;
    this._threatT = 0;
    this._threat = false;
    this.alerted = new Set();
    this.telegraphs = new Map();
    this._tgSeq = 0;
    this.surface = 'grass';
    this.levelId = null;
    this._playerSteps = false;
    this._stepT = 0; this._stepN = 0;
    this._heartT = 0;
    this.babbleState = null;
    this.chorus = null;
    this.marching = null;
    this.ambience = null;
    this.meter = null;
    this._unlocking = null;
    this._hiddenSuspend = false;
  }

  // =============================================================================================== lifecycle
  async init() {
    this._readSettings();
    const bus = this.ctx.bus;
    const on = (ev, fn) => this._offs.push(bus.on(ev, (p) => { try { fn(p ?? {}); } catch (e) { console.warn(`[audio] ${ev}`, e); } }));
    this._offs.push(...bindSfx(this));

    on(E.MUSIC, ({ track, fade }) => this.music(track ?? null, fade ?? MUSIC_RULES.crossfade));
    on(E.LEVEL_LOADING, () => this._levelCleanup());
    on(E.LEVEL_LOADED, ({ id, level }) => this._levelLoaded(id, level));
    on(E.ARENA_LOCK, ({ id }) => this.director.arenaLock(id));
    on(E.ARENA_CLEAR, ({ id }) => this.director.arenaClear(id));
    on(E.BOSS_START, () => this.director.bossStart());
    on(E.BOSS_DEFEATED, () => this.director.bossDefeated());
    on(E.ENEMY_ALERTED, ({ enemy }) => { if (enemy) this.alerted.add(enemy); });
    on(E.ENEMY_DIED, ({ enemy }) => this.alerted.delete(enemy));
    on(E.LEVEL_RESULTS, () => this.music('victory_8bit_loop', 1));
    on(E.MEME_CAM, ({ on: isOn }) => this._setMeme(!!isOn));
    on(E.GAME_MODE, ({ mode }) => this._onMode(mode));
    on(E.HITSTOP, () => this._hitstopDuck());
    on(E.SETTINGS_CHANGED, ({ key, value }) => { if (key === 'master' || key === 'music' || key === 'sfx') { this.vol[key] = value; this._applyVolumes(); } });
    on(E.SAVE_LOADED, () => { this._readSettings(); this._applyVolumes(); });
    on(E.DIALOG_LINE, ({ speaker, text }) => this.babble(speaker, text));
    on(E.DIALOG_END, () => { this.stopBabble(); this._dialogHold = 0; this._applyDucks(); });
    on(E.CUTSCENE_END, () => { this.stopBabble(); this.stopLaughs(); this.march(false); this._dialogHold = 0; this._applyDucks(); });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const gesture = () => { if (!this.ready || this.ac?.state !== 'running') this.unlock(); };
      for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchend', 'click']) this._listen(window, ev, gesture, { capture: true, passive: true });
      if (typeof document !== 'undefined') this._listen(document, 'visibilitychange', () => this._onVisibility());
      if (this.ctx.params?.debug) this.showMeter(true);
    }
  }

  _listen(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); this._dom.push(() => target.removeEventListener(ev, fn, opts)); }

  /**
   * Start (or resume) the AudioContext. Call from a user gesture (the title screen's "press any key"); the manager
   * also listens for the first pointer/key/touch itself. Resolves true once audio runs.
   * @returns {Promise<boolean>}
   */
  unlock() {
    if (this.ready && this.ac?.state === 'running') return Promise.resolve(true);
    if (!this._unlocking) this._unlocking = this._doUnlock().finally(() => { this._unlocking = null; });
    return this._unlocking;
  }

  async _doUnlock() {
    if (!hasWebAudio()) return false;
    try { if (!this.ac) this._build(); } catch (e) { console.warn('[audio] WebAudio unavailable', e); return false; }
    const ac = this.ac;
    if (ac.state !== 'running') {
      try { await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 500))]); } catch { /* blocked: next gesture */ }
    }
    if (ac.state !== 'running') return false;
    this.unlocked = true;
    if (!this.ready) { this.ready = true; await this._firstRun(); }
    this.musicPlayer.resume();
    return true;
  }

  _build() {
    const ac = THREE.AudioContext.getContext();
    this.ac = ac;
    const listener = this.listener = new THREE.AudioListener();
    listener.name = 'audio-listener';
    this.ctx.camera?.add(listener);
    const L = MIX.limiter, lim = ac.createDynamicsCompressor();
    lim.threshold.value = L.threshold; lim.knee.value = L.knee; lim.ratio.value = L.ratio; lim.attack.value = L.attack; lim.release.value = L.release;
    listener.setFilter(lim);
    const gain = (to, v = 1) => { const g = ac.createGain(); g.gain.value = v; g.connect(to); return g; };
    const master = listener.getInput();
    const music = gain(master), hitDuck = gain(music), musicDuck = gain(hitDuck);
    const sfx = gain(master), world = gain(sfx, MIX.world), player = gain(sfx, MIX.player), ui = gain(sfx, MIX.ui);
    const babble = gain(ui, 1);
    this.bus = { master, music, hitDuck, musicDuck, sfx, world, player, ui, babble };
    const an = (node) => { const a = ac.createAnalyser(); a.fftSize = 1024; node.connect(a); return a; };
    this.analysers = { master: an(master), music: an(music), sfx: an(sfx) };
    this._rmsBuf = new Float32Array(1024);
    const panModel = this.ctx.quality?.id === 'low' ? 'equalpower' : 'HRTF';
    const mkVoice = (spatial) => {
      let panner = null;
      if (spatial) {
        panner = ac.createPanner();
        panner.panningModel = panModel; panner.distanceModel = MIX.distanceModel;
        panner.refDistance = MIX.refDistance; panner.rolloffFactor = MIX.rolloff; panner.maxDistance = MIX.maxDistance;
        panner.connect(world);
      }
      return { out: null, srcs: [], startAt: 0, endAt: 0, panner, pos: new THREE.Vector3(), follow: null, name: '', laugh: false };
    };
    this.voices2D = Array.from({ length: MIX.voices2D }, () => mkVoice(false));
    this.voices3D = Array.from({ length: MIX.voices3D }, () => mkVoice(true));
    this.musicPlayer = new MusicPlayer(ac, musicDuck, {
      url: (f) => (this.ctx.assets?.url ? this.ctx.assets.url(f) : 'assets/' + f),
      buffer: (f) => this._decode(f),
      has: (f) => this.index.has(f),
      canOgg: typeof Audio !== 'undefined' ? new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '' : true,
    });
    this.wind = new Wind(ac, world, this.rand);
    this.shim = new Shimmer(ac, player);
    ac.onstatechange = () => { if (ac.state === 'running') this.musicPlayer?.resume(); };
    this._applyVolumes(0);
    this._applyDucks(0);
  }

  async _firstRun() {
    this.wind.start(this.ctx.env?.wind ?? 0.6, this.memeOn ? MUSIC_RULES_MEME : 1);
    if (this._shimmerWant) this.shim.set(true);
    // music requested before the unlock fades in now (CS-00: "fades in over 2 s")
    this.director.take();
    this.currentTrack = this.director.target;
    if (this.director.target) this.musicPlayer.play(this.director.target, MUSIC_RULES.titleFade);
    if (this.levelId) this._setAmbience(this.levelId);
    const jobs = [bakeZzfx(this.ac).then((m) => { for (const [k, b] of m) this.zz.set(k, b); })];
    for (const p of this._fetched) jobs.push(this._decode(p));
    await Promise.all(jobs);
  }

  update(dt) {
    const game = this.ctx.game, mode = game?.mode ?? 'play';
    // telegraph tings (sim time: they line up with the strike under slow motion)
    if (this.telegraphs.size) {
      for (const [id, t] of this.telegraphs) if ((t.t -= dt) <= 0) { this.telegraphs.delete(id); this.play3D(t.name, t.at); }
    }
    if (this._fizzleT > 0 && (this._fizzleT -= dt) <= 0) this.play2D('chargeFizzle');
    // music director (§16.1)
    if ((this._threatT -= dt) <= 0) { this._threatT = 0.25; this._threat = this._computeThreat(); }
    this.director.tick(dt, { mode, threat: this._threat, zone: this._zoneTrack() });
    if (mode === 'play' || mode === 'memecam') {
      this._lowHp(dt);
      this._autoSteps(dt);
    }
  }

  render(alpha, frameDt) {
    const dt = Math.max(0, Math.min(0.25, frameDt || 0));
    this.time += dt;
    if (this.ready) this._applyMusicChanges();
    else this.currentTrack = this.director.target;
    if (!this.ready) return;
    const ac = this.ac, now = ac.currentTime;
    // hitstop duck (rising edge)
    const hs = (this.ctx.game?.hitstopT ?? 0) > 0;
    if (hs && !this._hs) this._hitstopDuck();
    this._hs = hs;
    if (this._stingUntil && now >= this._stingUntil) { this._stingUntil = 0; this.ducks.sting = 1; this._applyDucks(); }
    if (this._dialogHold && this.time > this._dialogHold && !this.babbleState) { this._dialogHold = 0; this._applyDucks(); }
    // wind follows Env (0–3), ×1.6 in Meme Cam
    this.wind.set(this.ctx.env?.wind ?? 0.6, this.memeOn ? MUSIC_RULES_MEME : 1);
    // 3D voices that follow actors
    for (const v of this.voices3D) {
      if (!v.follow || v.endAt <= now) { if (v.endAt <= now) v.follow = null; continue; }
      if (this._posOf(v.follow, v.pos)) this._setPannerPos(v.panner, v.pos, 0.03);
    }
    this._babbleTick(dt);
    this._chorusTick(dt);
    this._marchTick(dt);
    this.musicPlayer.update();
    this.shim.update();
    this.meter?.update(dt);
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    for (const off of this._dom) off();
    this._dom.length = 0;
    this.meter?.dispose(); this.meter = null;
    if (this.ready || this.ac) {
      this.stopAll(0);
      this.musicPlayer?.dispose();
      this.wind?.stop();
      this.shim?.dispose();
      for (const v of [...this.voices2D, ...this.voices3D]) v.panner?.disconnect();
      for (const k of Object.keys(this.bus ?? {})) { try { this.bus[k].disconnect(); } catch { /* listener input */ } }
      this.listener?.removeFilter?.();
      this.listener?.parent?.remove(this.listener);
      if (this.ac) this.ac.onstatechange = null;
    }
    this.telegraphs.clear(); this.alerted.clear(); this.loops.clear(); this.bells.clear();
    this.log.length = 0; this.recent.length = 0;
    this.ready = false; this.unlocked = false;
  }

  // =============================================================================================== settings, ducks
  _readSettings() {
    const s = this.ctx.state?.settings ?? {};
    for (const k of ['master', 'music', 'sfx']) if (Number.isFinite(s[k])) this.vol[k] = s[k];
  }

  /** Set slider volumes (0..1); also written by settings:changed. */
  setVolumes({ master, music, sfx } = {}) {
    if (Number.isFinite(master)) this.vol.master = master;
    if (Number.isFinite(music)) this.vol.music = music;
    if (Number.isFinite(sfx)) this.vol.sfx = sfx;
    this._applyVolumes();
  }

  _applyVolumes(tau = 0.05) {
    if (!this.bus) return;
    const t = this.ac.currentTime, muted = !!this.ctx.params?.mute;
    this.bus.master.gain.setTargetAtTime(muted ? 0 : sliderGain(this.vol.master), t, tau || 0.001);
    this.bus.music.gain.setTargetAtTime(sliderGain(this.vol.music), t, tau || 0.001);
    this.bus.sfx.gain.setTargetAtTime(sliderGain(this.vol.sfx), t, tau || 0.001);
  }

  /** Effective music duck factor (product of the active ducks). */
  get duck() {
    const dialog = (this.ctx.game?.mode === 'dialog' || this.babbleState || this._dialogHold) ? DUCK.dialog : 1;
    return this.ducks.menu * this.ducks.meme * this.ducks.sting * Math.min(this.ducks.dialog, dialog);
  }

  _applyDucks(tau = DUCK.tau) {
    if (!this.bus) return;
    const t = this.ac.currentTime;
    this.bus.musicDuck.gain.setTargetAtTime(this.duck, t, tau || 0.001);
    const w = this.pausedWorld ? DUCK.pausedSfx : 1;
    this.bus.world.gain.setTargetAtTime(MIX.world * w, t, 0.1);
    this.bus.player.gain.setTargetAtTime(MIX.player * w, t, 0.1);
  }

  _onMode(mode) {
    this.ducks.menu = mode === 'menu' ? DUCK.menu : 1;
    this.pausedWorld = mode === 'menu';
    if (mode === 'menu') this.stopBabble();
    this._applyDucks();
  }

  _setMeme(on) {
    this.memeOn = on;
    this.ducks.meme = on ? DUCK.meme : 1;
    this._applyDucks(on ? DUCK.memeFade / 3 : 0.25);     // ~95% of the way in 1 s
  }

  _hitstopDuck() {
    if (!this.bus) return;
    const g = this.bus.hitDuck.gain, t = this.ac.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(DUCK.hitstop, t, 0.004);
    g.setTargetAtTime(1, t + DUCK.hitstopDur, 0.02);
  }

  _onVisibility() {
    if (!this.ac || typeof document === 'undefined') return;
    if (document.hidden && this.ac.state === 'running') { this._hiddenSuspend = true; this.ac.suspend().catch(() => {}); }
    else if (!document.hidden && this._hiddenSuspend) { this._hiddenSuspend = false; this.ac.resume().catch(() => {}); }
  }

  // =============================================================================================== loading
  /** Path for a sound id / pattern / path (random pick among pattern matches), or null. */
  resolve(id) { return resolveId(id, this.index, this.rand); }

  _fetch(path) {
    let p = this._bytes.get(path);
    if (!p) {
      p = this.ctx.assets?.arrayBuffer ? this.ctx.assets.arrayBuffer(path)
        : fetch('assets/' + path).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); });
      this._bytes.set(path, p);
      this._fetched.add(path);
    }
    return p;
  }

  /** Decoded buffer for a path (fetch + decode once). Before the unlock only fetches. Never rejects. */
  _decode(path) {
    const b = this.buffers.get(path);
    if (b) return Promise.resolve(b);
    if (!this.ac) return this._fetch(path).then(() => null, (e) => { this._warnOnce(path, e); return null; });
    let p = this._decoding.get(path);
    if (!p) {
      p = this._fetch(path)
        .then((ab) => this.ac.decodeAudioData(ab.slice(0)))
        .then((buf) => { this.buffers.set(path, buf); return buf; })
        .catch((e) => { this._warnOnce(path, e); this._decoding.delete(path); return null; });
      this._decoding.set(path, p);
    }
    return p;
  }

  _warnOnce(key, e) { if (!this._missing.has(key)) { this._missing.add(key); console.warn(`[audio] ${key}: ${e?.message ?? e}`); } }

  /**
   * Preload hook (ctx.assets.preload routes .ogg/.mp3/.wav here). Streamed music is skipped; everything else is
   * fetched now and decoded once the context runs. Resolves the path; never rejects.
   */
  async load(path) {
    const p = this.resolve(path) ?? String(path).replace(/^\.?\//, '').replace(/^(public\/)?assets\//, '');
    if (isMusicPath(p)) {
      const def = Object.values(TRACKS).find((t) => t.file === p);
      if (!def?.buffer) return p;
    }
    await this._decode(p);
    return p;
  }

  // =============================================================================================== playback core
  _note(kind, id) {
    const s = `${kind}:${id}`;
    this.log.push(s); if (this.log.length > 50) this.log.shift();
    this.recent.push({ t: +this.time.toFixed(3), kind, id: String(id) }); if (this.recent.length > RECENT) this.recent.shift();
    this.counts[id] = (this.counts[id] ?? 0) + 1;
  }

  /** Rate limiter: true if `key` hasn't fired within `sec` (real time). */
  gate(key, sec) {
    const now = this.ac ? this.ac.currentTime : this.time;
    const last = this._gates.get(key);
    if (last !== undefined && now - last < sec && now >= last) return false;
    this._gates.set(key, now);
    if (this._gates.size > 512) this._gates.clear();
    return true;
  }

  /**
   * 2D sound (player, UI): a SFX name, a file id ('pickup/bubble2'), a pattern ('impact/chain_0x') or a path.
   * @param {string} id
   * @param {{volume?: number, vol?: number, rate?: number, rateVar?: number, delay?: number, dur?: number,
   *          offset?: number, loop?: boolean, bus?: 'player'|'world'|'ui'}} [opts]
   * @returns {{name: string, stop: (fade?: number) => void}|null}
   */
  play2D(id, opts = {}) { return this._play(id, null, opts ?? {}); }

  /**
   * 3D sound at `pos` (Vector3, [x,y,z], {x,y,z}, an Actor or Object3D to follow, or an actor id / level anchor name).
   * Falls back to 2D without a position. Same options as play2D plus nothing else.
   */
  play3D(id, pos, opts = {}) { return this._play(id, pos ?? null, opts ?? {}); }

  _play(id, at, opts) {
    const name = String(id ?? '');
    if (!name) return null;
    this._note(at != null ? '3d' : '2d', name);
    const def = SFX[name];
    if (def) {
      const h = this._playDef(def, name, at, opts);
      for (const n of def.also ?? []) if (SFX[n]) this._playDef(SFX[n], n, at, opts);
      return h;
    }
    const path = this.resolve(name);
    if (!path) { this._warnOnce('id:' + name, 'unknown sound id (not in src/audio/assets.manifest.js)'); return null; }
    return this._playPath(path, name, at, opts, null);
  }

  _playDef(def, name, at, opts) {
    if (!this.gate('sfx:' + name, def.minGap ?? MIX.minGap)) return null;
    if (!this.ready) return null;
    const file = def.files.length ? def.files[Math.floor(this.rand() * def.files.length) % def.files.length] : null;
    const path = file ? this.resolve(file) : null;
    return this._playPath(path, name, at, opts, def);
  }

  _playPath(path, name, at, opts, def) {
    if (!this.ready) return null;
    let buf = path ? this.buffers.get(path) : null;
    if (!buf && def?.zzfx) buf = this.zz.get(def.zzfx) ?? null;
    if (!buf) {
      if (!path) return null;
      const t0 = this.ac.currentTime;
      this._decode(path).then((b) => { if (b && this.ac.currentTime - t0 <= MIX.lateWindow) this._playPath(path, name, at, opts, def); });
      return null;
    }
    const rv = opts.rateVar ?? def?.rateVar ?? 0.03;
    const rate = Math.max(0.05, (opts.rate ?? 1) * (def?.rate ?? 1) * (1 + (this.rand() * 2 - 1) * rv));
    const vol = (opts.volume ?? opts.vol ?? 1) * (def?.vol ?? 1);
    return this._start(buf, {
      name, at, rate, vol, delay: opts.delay ?? 0, offset: opts.offset ?? 0, dur: opts.dur ?? def?.dur ?? 0,
      loop: !!opts.loop, bus: opts.bus ?? def?.bus ?? null,
    });
  }

  /** Pick a voice (free, else the oldest is stolen — §16.5). */
  _voice(pool) {
    const now = this.ac.currentTime;
    let best = null;
    for (const v of pool) {
      if (v.endAt <= now) { best = v; break; }
      if (!best || v.startAt < best.startAt) best = v;
    }
    if (best.endAt > now) this._release(best, MIX.stealFade);
    return best;
  }

  _release(v, fade = 0.05) {
    const out = v.out, srcs = v.srcs, t = this.ac.currentTime;
    if (out) {
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + fade);
      for (const s of srcs) { try { s.stop(t + fade + 0.01); } catch { /* not started / stopped */ } }
    }
    v.out = null; v.srcs = []; v.endAt = 0; v.follow = null; v.laugh = false;
  }

  _setPannerPos(panner, p, tau = 0) {
    const t = this.ac.currentTime;
    if (panner.positionX) {
      if (tau > 0) { panner.positionX.setTargetAtTime(p.x, t, tau); panner.positionY.setTargetAtTime(p.y, t, tau); panner.positionZ.setTargetAtTime(p.z, t, tau); }
      else {
        for (const [prm, val] of [[panner.positionX, p.x], [panner.positionY, p.y], [panner.positionZ, p.z]]) { prm.cancelScheduledValues(t); prm.setValueAtTime(val, t); }
      }
    } else panner.setPosition(p.x, p.y, p.z);
  }

  /** World position of `at` into `out`; returns false if `at` has none. */
  _posOf(at, out) {
    if (at == null) return false;
    if (typeof at === 'string') {
      const a = this.ctx.actors?.get?.(at);
      if (a) return this._posOf(a, out);
      const an = this.ctx.levels?.anchor?.(at);
      return an?.pos ? this._posOf(an.pos, out) : false;
    }
    if (at.isVector3) { out.copy(at); return true; }
    if (Array.isArray(at)) { out.set(+at[0] || 0, +(at.length > 2 ? at[1] : 0) || 0, +(at.length > 2 ? at[2] : at[1]) || 0); return true; }
    if (at.pos?.isVector3) { out.copy(at.pos); out.y += Math.min(1, (at.height ?? 1) * 0.6); return true; }
    if (at.isObject3D) { at.getWorldPosition(out); return true; }
    if (typeof at.x === 'number') { out.set(at.x, at.y ?? 0, at.z ?? 0); return true; }
    return false;
  }

  /** follow target for moving emitters (actors / Object3Ds), else null. */
  _followOf(at) {
    if (at == null || typeof at !== 'object') return typeof at === 'string' ? (this.ctx.actors?.get?.(at) ?? null) : null;
    return at.pos?.isVector3 || at.isObject3D ? at : null;
  }

  _cameraPos(out) {
    const c = this.ctx.camera;
    if (!c) return out.set(0, 0, 0);
    return out.setFromMatrixPosition(c.matrixWorld);
  }

  /**
   * Start a buffer on a pooled voice.
   * @param {AudioBuffer} buf
   * @param {{name: string, at?: any, rate: number, vol: number, delay?: number, offset?: number, dur?: number, loop?: boolean, bus?: string|null}} o
   */
  _start(buf, o) {
    const ac = this.ac, spatial = o.at != null && this._posOf(o.at, _v);
    if (spatial) {
      this._cameraPos(_cam);
      if (_cam.distanceToSquared(_v) > (MIX.maxDistance + 5) ** 2) return null;     // inaudible: keep the voice
    }
    const v = this._voice(spatial ? this.voices3D : this.voices2D);
    const t = ac.currentTime + Math.max(0, o.delay ?? 0);
    const out = ac.createGain();
    out.gain.value = o.vol;
    if (spatial) {
      v.pos.copy(_v); v.follow = this._followOf(o.at);
      this._setPannerPos(v.panner, v.pos, 0);
      out.connect(v.panner);
    } else out.connect(this.bus[o.bus ?? 'player'] ?? this.bus.player);
    const src = ac.createBufferSource();
    src.buffer = buf; src.playbackRate.value = o.rate; src.loop = !!o.loop;
    src.connect(out);
    const offset = Math.max(0, Math.min(o.offset ?? 0, buf.duration - 0.01));
    let len = (buf.duration - offset) / o.rate;
    if (o.dur > 0) {
      len = o.loop ? o.dur : Math.min(len, o.dur);
      const fade = Math.min(0.25, len * 0.3);
      out.gain.setValueAtTime(o.vol, t + len - fade);
      out.gain.linearRampToValueAtTime(0, t + len);
      src.start(t, offset); src.stop(t + len + 0.02);
    } else src.start(t, offset);
    src.onended = () => { try { out.disconnect(); } catch { /* gone */ } };
    v.out = out; v.srcs = [src]; v.startAt = t; v.endAt = o.loop && !(o.dur > 0) ? Infinity : t + len; v.name = o.name; v.laugh = false;
    this.started[o.name] = (this.started[o.name] ?? 0) + 1;
    return { name: o.name, voice: v, stop: (fade = 0.08) => { if (v.out === out) this._release(v, fade); } };
  }

  /** A one-shot outside the voice pools (heartbeat, babble blips, sting layers). */
  _oneShot(buf, { when = 0, gain = 1, rate = 1, dest = null, offset = 0, dur = 0, attack = 0, release = 0 } = {}) {
    const ac = this.ac, t = Math.max(ac.currentTime, when || ac.currentTime);
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ac.createGain();
    const len = dur > 0 ? dur / rate : (buf.duration - offset) / rate;
    if (attack > 0 || release > 0) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.max(0.001, attack));
      g.gain.setValueAtTime(gain, t + Math.max(attack, len - release)); g.gain.linearRampToValueAtTime(0, t + len);
    } else g.gain.value = gain;
    src.connect(g); g.connect(dest ?? this.bus.player);
    src.start(t, offset, dur > 0 ? dur : undefined);
    src.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
    return src;
  }

  /** Sound-active region of a buffer (first/last sample above 8% of the peak), cached. */
  _region(buf) {
    let r = this._regions.get(buf);
    if (r) return r;
    const d = buf.getChannelData(0), n = d.length;
    let peak = 0;
    for (let i = 0; i < n; i += 8) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    const th = Math.max(0.005, peak * 0.08);
    let a = 0, b = n - 1;
    while (a < n && Math.abs(d[a]) < th) a += 4;
    while (b > a && Math.abs(d[b]) < th) b -= 4;
    r = { onset: a / buf.sampleRate, end: Math.max(a, b) / buf.sampleRate };
    this._regions.set(buf, r);
    return r;
  }

  /** Looping sound (ambience, purr) outside the pools. Returns { stop(fade), setVolume(v, fade) } or null. */
  loop(id, { volume = 1, vol, rate = 1, at = null, bus = 'world', fadeIn = 0.8 } = {}) {
    this._note('loop', id);
    if (!this.ready) return null;
    const def = SFX[id];
    const path = this.resolve(def ? def.files[0] : id);
    if (!path) return null;
    const handle = { name: String(id), src: null, out: null, dead: false,
      stop: (fade = 0.6) => {
        handle.dead = true; this.loops.delete(handle);
        if (!handle.out) return;
        const t = this.ac.currentTime, g = handle.out.gain;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
        try { handle.src.stop(t + fade + 0.02); } catch { /* */ }
      },
      setVolume: (v, fade = 0.5) => { if (handle.out) handle.out.gain.setTargetAtTime(v, this.ac.currentTime, fade / 3); },
    };
    this.loops.add(handle);
    const target = (vol ?? volume) * (def?.vol ?? 1);
    this._decode(path).then((buf) => {
      if (!buf || handle.dead) return;
      const ac = this.ac, t = ac.currentTime;
      const out = ac.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(target, t + fadeIn);
      let dest = this.bus[bus] ?? this.bus.world;
      if (at != null && this._posOf(at, _v)) {
        const p = ac.createPanner(); p.distanceModel = MIX.distanceModel; p.refDistance = MIX.refDistance; p.rolloffFactor = MIX.rolloff;
        this._setPannerPos(p, _v, 0); p.connect(this.bus.world); dest = p;
      }
      out.connect(dest);
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate * (def?.rate ?? 1);
      src.connect(out); src.start(t, this.rand() * buf.duration * 0.9);
      src.onended = () => { try { out.disconnect(); if (dest !== out && dest.disconnect && dest !== this.bus[bus]) dest.disconnect(); } catch { /* */ } };
      handle.src = src; handle.out = out;
    });
    return handle;
  }

  /** Stop every voice, loop, laugh, bell and the babble (level change, dispose). Music keeps playing. */
  stopAll(fade = 0.15) {
    if (!this.ready) return;
    for (const v of this.voices2D) if (v.out) this._release(v, fade || 0.005);
    for (const v of this.voices3D) if (v.out) this._release(v, fade || 0.005);
    for (const h of [...this.loops]) h.stop(fade || 0.005);
    for (const b of this.bells) b.stop(fade || 0.005);
    this.bells.clear();
    this.stopBabble(); this.stopLaughs(); this.march(false);
    this.telegraphs.clear();
  }

  // =============================================================================================== music
  /**
   * Request music (§16.1). `track`: id ('field_of_dreams'), 'music/x.mp3', a CONTEXT_MUSIC name ('title') or null
   * (silence). Combat/boss tracks force that state; stings play over the ducked music. Returns the track id.
   */
  music(track, fade = MUSIC_RULES.crossfade) {
    this._note('music', track ?? 'null');
    const id = this.director.request(track, Number.isFinite(fade) ? fade : MUSIC_RULES.crossfade, { mode: this.ctx.game?.mode ?? 'play' });
    if (track != null && !id) console.warn(`[audio] unknown music track "${track}"`);
    this.currentTrack = this.director.target;
    if (this.ready) this._applyMusicChanges();
    return id;
  }

  _applyMusicChanges() {
    const ch = this.director.take();
    this.currentTrack = this.director.target;
    if (!ch) return;
    if (ch.track !== undefined) this.musicPlayer.play(ch.track, ch.fade);
    if (ch.sting) this._sting(ch.sting);
  }

  _sting(id) {
    this.ducks.sting = DUCK.sting; this._applyDucks(0.08);
    this._stingUntil = this.ac.currentTime + MUSIC_RULES.stingDur;
    this.musicPlayer.playSting(id).then((d) => { if (d > 0) this._stingUntil = this.ac.currentTime + d; else this._stingUntil = this.ac.currentTime; });
  }

  _computeThreat() {
    const p = this.ctx.player?.pos, list = this.ctx.enemies?.list;
    if (!p || !list?.length) { if (this.alerted.size) this.alerted.clear(); return false; }
    const r2 = MUSIC_RULES.combatRadius ** 2;
    for (const e of list) {
      if (!e?.alive || e.scripted || !e.pos) continue;
      if (!(e.alerted === true || this.alerted.has(e))) continue;
      if (IDLE_STATES.has(e.stateName)) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    for (const e of this.alerted) if (!e?.alive) this.alerted.delete(e);
    return false;
  }

  _zoneTrack() {
    const zones = this.director.level?.zones, p = this.ctx.player?.pos;
    if (!zones?.length || !p) return null;
    for (const z of zones) {
      const at = z.at ?? z.center; if (!at) continue;
      const x = Array.isArray(at) ? at[0] : at.x, zz = Array.isArray(at) ? at[1] : at.z;
      if ((p.x - x) ** 2 + (p.z - zz) ** 2 <= (z.r ?? 8) ** 2) return z.track ?? null;
    }
    return null;
  }

  _levelCleanup() {
    if (this.ready) {
      for (const v of this.voices3D) if (v.out) this._release(v, 0.2);
      for (const h of [...this.loops]) h.stop(0.4);
      this.stopLaughs(); this.march(false); this.stopBabble();
      this.shimmer(false);
    }
    this.ambience = null;
    this.telegraphs.clear(); this.alerted.clear();
    this._threat = false;
  }

  _levelLoaded(id, level) {
    this.levelId = id ?? null;
    this.director.setLevel(id, level?.music ?? level?.def?.music ?? null);
    this.surface = level?.surface ?? LEVEL_SURFACE[id] ?? 'grass';
    this._playerSteps = this._playerSteps && true;
    if (this.ready) this._setAmbience(id);
  }

  _setAmbience(id) {
    this.ambience?.stop(1);
    const a = AMBIENCE[id];
    this.ambience = a ? this.loop(a.id, { volume: a.vol, fadeIn: 2 }) : null;
  }

  // =============================================================================================== procedural (§16.3)
  /**
   * Hyena laugh build at `pos` (Vector3 / actor / anchor; 2D without one).
   * @param {any} pos @param {{rate?: number, syllables?: number, volume?: number, delay?: number}} [opts]
   */
  laugh(pos, opts = {}) {
    this._note('laugh', 'hyena');
    if (!this.ready) return null;
    const plan = laughPlan(this.rand, { rate: opts.rate ?? 1, syllables: opts.syllables ?? 0, sources: LAUGH.sources.length });
    const paths = LAUGH.sources.map((s) => this.resolve(s));
    const bufs = paths.map((p) => (p ? this.buffers.get(p) : null));
    if (bufs.some((b) => !b)) for (const p of paths) if (p) this._decode(p);     // warm for next time
    const any = bufs.find(Boolean) ?? null, fb = this.zz.get('hyenaLaugh') ?? null;
    if (!any && !fb) return null;
    let busy = 0;
    for (const v of this.voices3D) if (v.laugh && v.endAt > this.ac.currentTime) busy++;
    if (busy >= LAUGH.maxConcurrent) return null;
    const ac = this.ac, spatial = pos != null && this._posOf(pos, _v);
    if (spatial) { this._cameraPos(_cam); if (_cam.distanceToSquared(_v) > (MIX.maxDistance + 5) ** 2) return null; }
    const v = this._voice(spatial ? this.voices3D : this.voices2D);
    const t0 = ac.currentTime + Math.max(0, opts.delay ?? 0);
    const out = ac.createGain(); out.gain.value = (opts.volume ?? 1) * LAUGH.vol;
    if (spatial) { v.pos.copy(_v); v.follow = this._followOf(pos); this._setPannerPos(v.panner, v.pos, 0); out.connect(v.panner); }
    else out.connect(this.bus.world);
    const srcs = [];
    for (const s of plan) {
      const buf = bufs[s.src] ?? any ?? fb;
      const region = buf === fb ? { onset: 0, end: buf.duration } : this._region(buf);
      const span = Math.max(0, region.end - region.onset - s.slice);
      const offset = Math.min(buf.duration - 0.02, region.onset + s.offsetFrac * span);
      const slice = Math.min(s.slice, buf.duration - offset);
      const len = slice / s.rate, t = t0 + s.t;
      const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = s.rate;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(s.gain, t + LAUGH.attack);
      g.gain.setValueAtTime(s.gain, t + Math.max(LAUGH.attack, len - LAUGH.release)); g.gain.linearRampToValueAtTime(0, t + len);
      src.connect(g); g.connect(out);
      src.start(t, offset, slice);
      src.onended = () => { try { g.disconnect(); } catch { /* */ } };
      srcs.push(src);
    }
    const end = t0 + laughLength(plan) + 0.05;
    srcs[srcs.length - 1].onended = () => { try { out.disconnect(); } catch { /* */ } };
    v.out = out; v.srcs = srcs; v.startAt = t0; v.endAt = end; v.name = 'laugh'; v.laugh = true;
    this.started.laugh = (this.started.laugh ?? 0) + 1;
    return { name: 'laugh', syllables: plan.length, length: end - t0, voice: v, stop: (fade = 0.08) => { if (v.out === out) this._release(v, fade); } };
  }

  /**
   * CS-02 "cackling from every direction": `count` emitters at radius `r` around `center`, each laughing every
   * 0.6–1.8 s for `dur` seconds (real time). `stopLaughs()` ends it.
   */
  laughChorus(center, { count = 6, r = 18, dur = 8, rate = 1, volume = 1 } = {}) {
    this._note('laugh', 'chorus');
    const c = new THREE.Vector3();
    if (!this._posOf(center ?? this.ctx.player, c)) c.set(0, 0, 0);
    const base = this.rand() * Math.PI * 2;
    const emitters = Array.from({ length: Math.max(1, count | 0) }, (_, i) => {
      const a = base + (i / count) * Math.PI * 2 + (this.rand() - 0.5) * 0.4;
      return { pos: new THREE.Vector3(c.x + Math.sin(a) * r, c.y + 1.2, c.z + Math.cos(a) * r), next: this.rand() * 0.9 };
    });
    this.chorus = { emitters, t: 0, dur, rate, volume };
    return emitters.length;
  }

  _chorusTick(dt) {
    const ch = this.chorus;
    if (!ch) return;
    ch.t += dt;
    if (ch.t >= ch.dur) { this.chorus = null; return; }
    for (const e of ch.emitters) {
      if ((e.next -= dt) > 0) continue;
      e.next = 0.6 + this.rand() * 1.2;
      this.laugh(e.pos, { rate: ch.rate * (0.92 + this.rand() * 0.16), volume: ch.volume });
    }
  }

  /** Stop the chorus and every playing laugh. */
  stopLaughs(fade = 0.25) {
    this.chorus = null;
    if (!this.ready) return;
    for (const v of [...this.voices3D, ...this.voices2D]) if (v.laugh && v.out) this._release(v, fade);
  }

  /** CS-02 horde marching: footsteps + chains around `center` (Vector3 / actor / anchor name) until march(false). */
  march(on, { center = null, volume = 1 } = {}) {
    if (!on) { this.marching = null; return; }
    this._note('march', 'horde');
    this.marching = { center: center ?? this.ctx.player, stepT: 0, chainT: 0.5, volume, n: 0 };
  }

  _marchTick(dt) {
    const m = this.marching;
    if (!m) return;
    const c = new THREE.Vector3();
    if (!this._posOf(m.center, c)) return;
    const jitter = () => (this.rand() - 0.5) * 2 * MARCH.spread;
    if ((m.stepT -= dt) <= 0) {
      m.stepT = MARCH.stepEvery * (0.9 + this.rand() * 0.2);
      _v.set(c.x + jitter(), c.y, c.z + jitter());
      this.play3D(MARCH.stepIds[m.n++ % MARCH.stepIds.length], _v.clone(), { volume: MARCH.stepVol * m.volume, rate: 0.9 + this.rand() * 0.2 });
    }
    if ((m.chainT -= dt) <= 0) {
      m.chainT = MARCH.chainEvery * (0.8 + this.rand() * 0.4);
      _v.set(c.x + jitter(), c.y + 1, c.z + jitter());
      this.play3D(MARCH.chainIds[Math.floor(this.rand() * MARCH.chainIds.length)], _v.clone(), { volume: MARCH.chainVol * m.volume });
    }
  }

  /**
   * The Sunbell (§16.3): additive partials with exponential decay + impact/metal_ringing at rate 0.5, vol 0.3.
   * @param {{damped?: boolean, volume?: number, pos?: any, base?: number}} [opts]  damped = CS-02 "clunk"
   */
  bell(opts = {}) {
    const damped = !!opts.damped;
    this._note('bell', damped ? 'clunk' : 'sunbell');
    if (!this.ready) return null;
    const ac = this.ac;
    let dest = this.bus.world, panner = null;
    if (opts.pos != null && this._posOf(opts.pos, _v)) {
      panner = ac.createPanner(); panner.distanceModel = 'inverse'; panner.refDistance = 30; panner.rolloffFactor = 1;
      this._setPannerPos(panner, _v, 0); panner.connect(this.bus.world); dest = panner;
    }
    const h = strikeBell(ac, dest, { damped, volume: opts.volume ?? 1, base: opts.base, detune: () => (this.rand() * 2 - 1) * 3 });
    const layer = damped ? 'bellClunk' : 'bellLayer';
    if (panner) this.play3D(layer, opts.pos, { volume: opts.volume ?? 1 }); else this.play2D(layer, { volume: opts.volume ?? 1, bus: 'world' });
    const handle = { ...h, stop: (fade) => { h.stop(fade); this.bells.delete(handle); } };
    this.bells.add(handle);
    setTimeout(() => { this.bells.delete(handle); try { panner?.disconnect(); } catch { /* */ } }, Math.ceil((h.endAt - ac.currentTime + 0.5) * 1000));
    this.started.bell = (this.started.bell ?? 0) + 1;
    return handle;
  }

  /** zzfx lub-dub heartbeat(s) (§16.3; Still Standing, low HP). */
  heartbeat({ beats = 1, bpm = HEART.bpm, volume = 1 } = {}) {
    this._note('heartbeat', beats);
    if (!this.ready) return 0;
    const buf = this.zz.get('heartThump');
    if (!buf) return 0;
    const t = this.ac.currentTime + 0.01;
    for (const b of heartbeatPlan(beats, bpm, volume)) this._oneShot(buf, { when: t + b.t, gain: b.gain * (SFX.heartThump.vol ?? 1), dest: this.bus.player });
    this.started.heartbeat = (this.started.heartbeat ?? 0) + beats;
    return beats;
  }

  /** Golden Hour shimmer pad on/off (§16.3). */
  shimmer(on) {
    this._shimmerWant = !!on;
    if (this.ready) this.shim.set(!!on);
  }

  _lowHp(dt) {
    const p = this.ctx.player;
    if (!p || !p.alive || !(p.hp > 0) || p.hp > HEART.lowHp) { this._heartT = 0; return; }
    if ((this._heartT -= dt) <= 0) { this._heartT = 60 / HEART.bpm; this.heartbeat({ beats: 1, volume: HEART.lowHpVol }); }
  }

  // =============================================================================================== footsteps, telegraphs
  /** actor:footstep → surface sound (2D for her, 3D for everyone else) + her armour rattle every 2nd step. */
  footstep(actor, position, surface) {
    const player = this.ctx.player, isP = !!actor && (actor === player || actor.tags?.has?.('player'));
    if (isP) this._playerSteps = true;
    const name = FOOTSTEP[surface] ?? FOOTSTEP[this.surface] ?? 'footGrass';
    if (isP || (!actor && !position)) this._herStep(name);
    else this.play3D(name, actor ?? position, { volume: 0.8 });
  }

  _herStep(name) {
    this.play2D(name);
    if (++this._stepN % STEP_CADENCE.armorEvery === 0) this.play2D('armorStep');
  }

  /** Fallback footsteps for her while nobody emits actor:footstep (the cadence follows her speed). */
  _autoSteps(dt) {
    if (this._playerSteps) return;
    const p = this.ctx.player;
    if (!p?.alive || !p.vel || p.onGround === false || p.scripted) { this._stepT = 0; return; }
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (speed < STEP_CADENCE.minSpeed || /dodge|tumble|hurt|dead|faint/.test(p.stateName ?? '')) { this._stepT = Math.min(this._stepT, 0.05); return; }
    if ((this._stepT -= dt) <= 0) {
      const C = STEP_CADENCE;
      this._stepT = Math.max(C.min, Math.min(C.max, C.k / (speed + C.c)));
      this._herStep(FOOTSTEP[this.surface] ?? 'footGrass');
    }
  }

  /** combat:telegraph → §8.1 sound (+ the enemy's windup voice). Parry/gold tings land 0.25 s before the strike. */
  telegraph(t) {
    const actor = t.actor ?? null, at = actor ?? t.pos ?? null;
    const v = enemyVoiceFor(actorTypeId(actor));
    if (v?.telegraph && v.telegraph !== 'laugh' && this.gate('tgv:' + (actor?.id ?? '?'), 0.4)) this.play3D(v.telegraph, at);
    const row = TELEGRAPH_SFX[t.kind];
    if (!row) return;
    if (row.name === 'laugh') { if (this.gate('laugh:' + (actor?.id ?? '?'), 0.6)) this.laugh(at, { rate: v?.laughRate ?? 1 }); return; }
    const delay = row.lead != null ? Math.max(0, (t.duration ?? 0) - row.lead) : 0;
    if (delay <= 0.02) { this.play3D(row.name, at); return; }
    const pos = at?.isVector3 ? at.clone() : at;
    this.telegraphs.set(t.id ?? `tg${++this._tgSeq}`, { t: delay, name: row.name, at: pos });
  }

  cancelTelegraph(id) { this.telegraphs.delete(id); }

  // =============================================================================================== babble (§16.4)
  /**
   * Voice babble for one dialogue line (also driven by dialog:line). `speaker`: cutscene actor id or display name.
   * Returns the number of blips scheduled.
   */
  babble(speaker, text, { speed } = {}) {
    this.stopBabble();
    const v = voiceFor(speaker);
    const sp = speed ?? this.ctx.state?.settings?.dialogSpeed ?? 1;
    const plan = babblePlan(text, { speed: sp, mode: v.mode ?? 'blip' });
    if (!plan.length || (v.mode !== 'laugh' && !v.pool.length)) return 0;
    this.babbleState = { v, plan, i: 0, t: 0, speaker: speakerKey(speaker), blips: 0 };
    this._dialogHold = this.time + plan[plan.length - 1] + 1.5;
    this._applyDucks();
    return plan.length;
  }

  stopBabble() {
    if (!this.babbleState) return;
    this.babbleState = null;
    this._applyDucks();
  }

  _babbleTick(dt) {
    const b = this.babbleState;
    if (!b) return;
    b.t += dt;
    while (b.i < b.plan.length && b.plan[b.i] <= b.t) { b.i++; this._blip(b); }
    if (b.i >= b.plan.length) { this.babbleState = null; this._applyDucks(); }
  }

  _blip(b) {
    const v = b.v, ac = this.ac;
    const rate = v.rate * (1 + (this.rand() * 2 - 1) * BABBLE.pitchVar);
    const gain = (v.vol ?? BABBLE.vol);
    let buf = null, region = null;
    if (v.mode === 'laugh') {
      const p = this.resolve(LAUGH.sources[Math.floor(this.rand() * LAUGH.sources.length)]);
      buf = p ? this.buffers.get(p) : null;
      if (!buf) { if (p) this._decode(p); buf = this.zz.get('hyenaLaugh'); }
    } else {
      const p = this.resolve(v.pool[Math.floor(this.rand() * v.pool.length) % v.pool.length]);
      buf = p ? this.buffers.get(p) : null;
      if (!buf) { if (p) this._decode(p); buf = this.zz.get('blip'); }
    }
    if (!buf) return;
    b.blips++;
    this.started.babble = (this.started.babble ?? 0) + 1;
    if (v.mode === 'once') { this._oneShot(buf, { gain, rate, dest: this.bus.babble }); return; }
    region = this._region(buf);
    const slice = BABBLE.slice[0] + this.rand() * (BABBLE.slice[1] - BABBLE.slice[0]);
    const room = Math.max(0, region.end - region.onset - slice);
    const offset = Math.min(buf.duration - 0.02, region.onset + this.rand() * Math.min(room, v.mode === 'laugh' ? room : 0.06));
    this._oneShot(buf, { gain, rate, dest: this.bus.babble, offset, dur: Math.min(slice, buf.duration - offset), attack: BABBLE.attack, release: BABBLE.release });
    void ac;
  }

  // =============================================================================================== debug
  /** RMS (linear) of a bus right now: 'master' | 'music' | 'sfx'. 0 before the unlock. */
  level(bus = 'master') {
    const a = this.analysers?.[bus];
    if (!a) return 0;
    const d = this._rmsBuf;
    a.getFloatTimeDomainData(d);
    let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    return Math.sqrt(s / d.length);
  }

  /** Plain snapshot for smoke tests and the meter. */
  debugState() {
    const now = this.ac?.currentTime ?? 0;
    const busy = (pool) => pool.reduce((n, v) => n + (v.endAt > now ? 1 : 0), 0);
    return {
      unlocked: this.unlocked, ready: this.ready, state: this.ac?.state ?? null, sampleRate: this.ac?.sampleRate ?? 0,
      time: +now.toFixed(3), buffers: this.buffers.size, zzfx: [...this.zz.keys()],
      voices2D: busy(this.voices2D), voices3D: busy(this.voices3D), laughs: this.voices3D.concat(this.voices2D).filter((v) => v.laugh && v.endAt > now).length,
      loops: [...this.loops].map((h) => h.name), bells: this.bells.size,
      music: this.musicPlayer ? this.musicPlayer.state() : { track: this.director.target },
      director: { base: this.director.base, target: this.director.target, combat: this.director.combat, boss: this.director.boss,
        arenas: [...this.director.arenas], calmT: +this.director.calmT.toFixed(2), threat: this._threat },
      wind: this.wind?.started ? { ...this.wind.value, gainNow: +this.wind.gain.gain.value.toFixed(4), freqNow: Math.round(this.wind.filter.frequency.value) } : null,
      shimmer: !!this.shim?.on, meme: this.memeOn, duck: this.duck, duckNow: this.bus ? +this.bus.musicDuck.gain.value.toFixed(3) : 1,
      volumes: { ...this.vol }, gains: this.bus ? { master: +this.bus.master.gain.value.toFixed(3), music: +this.bus.music.gain.value.toFixed(3), sfx: +this.bus.sfx.gain.value.toFixed(3) } : null,
      levels: { master: this.level('master'), music: this.level('music'), sfx: this.level('sfx') },
      babble: this.babbleState ? { speaker: this.babbleState.speaker, blips: this.babbleState.blips, total: this.babbleState.plan.length } : null,
      chorus: this.chorus ? this.chorus.emitters.length : 0, marching: !!this.marching, surface: this.surface,
      telegraphs: this.telegraphs.size, recent: this.recent.slice(-12), counts: { ...this.counts }, started: { ...this.started },
    };
  }

  /** Toggle the debug meter overlay (bottom-left). */
  showMeter(on = true) {
    if (typeof document === 'undefined') return false;
    if (on && !this.meter) {
      import('./AudioMeter.js').then(({ AudioMeter }) => { if (!this.meter && this._wantMeter) this.meter = new AudioMeter(this); });
    }
    this._wantMeter = !!on;
    if (!on && this.meter) { this.meter.dispose(); this.meter = null; }
    return !!on;
  }
}

/** Meme Cam wind multiplier (§16.1 "wind ×1.6"). */
const MUSIC_RULES_MEME = 1.6;
