// src/audio/AudioManager.js  (owner: audio) — ctx.audio (GAME_DESIGN §16, §19.3; tech.md §14).
//
// Contract (§19.3):  play2D(id, opts) · play3D(id, pos, opts) · music(track, fade) · laugh(pos, opts) · bell(opts)
//                    · unlock() · load(path)
// Additions:         heartbeat(opts) · shimmer(on) · babble(speaker, text, opts) · stopBabble() · laughChorus(center, opts)
//                    · stopLaughs() · march(on, opts) · loop(id, opts) · stopAll(fade) · setVolumes({master,music,sfx})
//                    · chargeTone(name) · endCharge(fade) · level(bus) · debugState() · showMeter(on) · resolve(id)
// Phase W:           glock(notes, opts) · reward(kind, opts) · roomRead(arenaLock) · cue(name, at, opts) (+ BEAT_CUES)
//
// play2D / play3D ids: an SFX name (sfxMap.js), a file id ('pickup/bubble2'), a GAME_DESIGN pattern
// ('world/wood_hit_0x', 'sword/swish_01–13'), a full path, or a procedural id routed to the builders below so cutscene
// `sfx` steps can name them: 'laugh' (laugh build), 'laughChorus', 'bell' / 'sunbell', 'bellClunk' (damped Sunbell),
// 'heartbeat', 'march' (opts.on === false stops it), 'shimmer'. Each returns a `{ name, stop(fade) }` handle.
// `{ loop: true }` without `dur` becomes loop(): outside the voice pools, following its `at` actor.
//
// Graph (one THREE.AudioListener, NOT in the scene graph: three's per-frame listener ramps are replaced by our own 20 Hz
// writes, PERF §10.5 / P:U2; its gain is the MASTER bus):
//   decks ─► musicDuck ─► hitDuck ─► music ─┐
//   3D voices (panner) / loops / wind ─► world ─┐                       ├─► master ─► low/high shelf ─► limiter ─► out
//   2D voices / shimmer ─► player ──────────────┼─► sfx ─────────────────┘
//   ui sounds / babble ─► ui ───────────────────┘
//
// Nothing is created before the first user gesture (autoplay policy): requests made earlier are logged, music
// requests are remembered and start on unlock, and audio files are only fetched. PERF §3.1 / §10.4 (P:U1, U3): every
// synthesized sample is baked to PCM on the title in ≤ 2 ms idle slices (bake.js), so the unlock is a memcpy per def;
// files decode lazily (first use jumps the queue, ≤ 4 concurrent; level preloads warm one at a time while calm).
// Random choices use ctx.rng.fork('audio'), so sound never consumes the gameplay random stream.
import * as THREE from 'three';
import { E } from '../core/events.js';
import manifest, { levels as manifestLevels } from './assets.manifest.js';
import { MIX, DUCK, MEME } from './mix.js';
import { SFX, bindSfx, FOOTSTEP, LEVEL_SURFACE, STEP_CADENCE, TELEGRAPH_SFX, enemyVoiceFor, actorTypeId, SHOP_SFX, STATION_SFX,
  objectiveSfxFor, SFX_ALIASES } from './sfxMap.js';
import { MusicDirector, TRACKS, MUSIC_RULES, AMBIENCE, levelMusic, bossMusicFor } from './musicMap.js';
import { AMBIENT_LAYERS, activeLayers, nextWait, layerPos } from './ambience.js';
import { birdPlan, hootPlan, playChirps, cricketData, crackleData, playData, BIRDS } from './nature.js';
import { CUES, BEAT_CUES, partOpts, stickerNote } from './cues.js';
import { MusicPlayer } from './MusicPlayer.js';
import { Wind, strikeBell, tollPlan, laughPlan, laughLength, LAUGH, Shimmer, HEART, heartbeatPlan, MARCH, GLOCK, glockPlan,
  breezeData, BREEZE } from './procedural.js';
import { BABBLE, babblePlan, voiceFor, speakerKey } from './babble.js';
import { ZZFX_DEFS, PCM_RATE, pcmBuffer } from './sfxDefs.js';
import { Prebaker } from './bake.js';
import { buildIndex, resolveId, isMusicPath } from './ids.js';

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _c = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _ls = new THREE.Vector3();
const _lf = new THREE.Vector3();
const _lu = new THREE.Vector3();
const RECENT = 40;
const IDLE_STATES = new Set(['idle', 'patrol', 'return', 'sleep', 'hidden', 'dead', 'spawn']);
/** cutscene actor ids that mean her (until the player registers under 'swordcat') */
const PLAYER_IDS = new Set(['swordcat', 'player', 'clem', 'clementine']);

const hasWebAudio = () => typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
const sliderGain = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1)) ** MIX.curve;

/** `{ name, stop(fade) }` handle for procedural layers (cutscene `sfx` steps keep and stop them like file sounds). */
const procHandle = (name, stop, extra) => ({ name, ...extra, stop: (fade) => { try { stop(fade); } catch { /* gone */ } } });
const volOf = (o) => o.volume ?? o.vol;
const AMBIENT_LIST = (levelId) => AMBIENT_LAYERS[levelId] ?? [];
/** ambience layers that run as one continuous bed (vs. timed one-shots) */
const isBed = (l) => l.kind === 'loop' || l.kind === 'crickets' || l.kind === 'crackle';

/**
 * Procedural ids accepted by play2D / play3D (cutscene `sfx` steps name them like files). Every entry returns a
 * `{ name, stop(fade) }` handle (null when nothing could start). `vol` is accepted as an alias of `volume`.
 */
const PROCEDURAL = {
  laugh: (am, at, o) => am.laugh(at, { ...o, volume: volOf(o) }),
  hyenaLaugh: (am, at, o) => am.laugh(at, { ...o, volume: volOf(o) }),
  laughBuild: (am, at, o) => am.laugh(at, { ...o, volume: volOf(o) }),
  laughChorus: (am, at, o) => {
    const n = am.laughChorus(at, { ...o, volume: volOf(o) });
    return procHandle('laughChorus', (f) => am.stopLaughs(f), { count: n });
  },
  bell: (am, at, o) => am.bell({ ...o, volume: volOf(o), pos: at ?? o.pos }),
  sunbell: (am, at, o) => am.bell({ ...o, volume: volOf(o), pos: at ?? o.pos }),
  bellClunk: (am, at, o) => am.bell({ ...o, volume: volOf(o), damped: true, pos: at ?? o.pos }),
  sunbellDamped: (am, at, o) => am.bell({ ...o, volume: volOf(o), damped: true, pos: at ?? o.pos }),
  heartbeat: (am, at, o) => {
    const n = am.heartbeat({ ...o, volume: volOf(o) ?? 1 });
    return n ? procHandle('heartbeat', () => {}, { beats: n }) : null;
  },
  march: (am, at, o) => {
    const on = o.on !== false;
    am.march(on, { center: at ?? o.center ?? null, volume: volOf(o) ?? 1 });
    return on ? procHandle('march', () => am.march(false)) : null;
  },
  shimmer: (am, at, o) => {
    const on = o.on !== false;
    am.shimmer(on);
    return on ? procHandle('shimmer', () => am.shimmer(false)) : null;
  },
  // ---- M2 (nature.js / the bells): looped beds return a handle to stop them
  campfire: (am, at, o) => am.campfire(at, { volume: volOf(o) ?? 1 }),
  crackle: (am, at, o) => am.campfire(at, { volume: volOf(o) ?? 1 }),
  crickets: (am, at, o) => am.crickets({ volume: volOf(o) ?? 0.05 }),
  birds: (am, at, o) => am.birds(at, { volume: volOf(o) ?? 1, kind: o.kind }),
  owl: (am, at, o) => am.owl(at, { volume: volOf(o) ?? 0.15 }),
  rumble: (am, at, o) => am.rumble({ dur: o.dur ?? 4, volume: volOf(o) ?? 1 }),
  handbell: (am, at, o) => am.bell({ ...o, volume: volOf(o) ?? 1, profile: 'handbell', pos: at ?? o.pos }),
  shopBell: (am, at, o) => am.bell({ ...o, volume: volOf(o) ?? 1, profile: 'handbell', pos: at ?? o.pos }),
  toll: (am, at, o) => am.bell({ ...o, volume: volOf(o), strikes: o.strikes ?? 3, pos: at ?? o.pos }),
  kittenCheer: (am, at, o) => am.kittenCheer(at, { volume: volOf(o) ?? 1, count: o.count }),
  // ---- Phase W: the baked glock (sticker thirds, rescue arpeggio, Still Standing third, chime tails)
  glock: (am, at, o) => am.glock(o.notes ?? o.note ?? 'C5', { volume: volOf(o) ?? 1, gap: o.gap, delay: o.delay }),
};

/**
 * PERF §10.4 / §10.5 runtime numbers: listener + panner updates at `listenerHz` when moved more than `moveEps` m;
 * `maxDecodes` concurrent decodeAudioData calls (first use first; level warm-up one at a time while calm).
 */
export const RUNTIME = { listenerHz: 20, moveEps: 0.05, turnEps: 0.01, maxDecodes: 4, warmConcurrent: 1 };

/** AUTOCAM X24 room read: once per arena per visit, never right after a (boss intro) cutscene. */
export const ROOM_READ = { afterCutscene: 2.0 };

/** A manifest `levels` entry: an array (p0) or PERF §10.3 tiers { p0, p1, p2 } → every path. */
const tierPaths = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v).flat() : []);

/** Files to keep decoded for a level: the manifest's '*' subset + that level's subset (+ buffered music). */
function keepSet(levelId) {
  const out = new Set(tierPaths(manifestLevels?.['*']));
  for (const p of tierPaths(manifestLevels?.[levelId])) out.add(p);
  for (const t of Object.values(TRACKS)) if (t.buffer) out.add(t.file);
  return out;
}

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
    /** last requested sounds (debug): strings `${kind}:${id}` */
    this.log = [];
    /** recent requests with time (debug / smoke) */
    this.recent = [];
    /** plays per name (requests, including the ones made before unlock) */
    this.counts = Object.create(null);
    /** sounds actually started per name */
    this.started = Object.create(null);

    /** the SFX defs (sfxMap.js, read-only): names accepted by play2D / play3D */
    this.defs = SFX;
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
    this._chargeLevel = 0;
    this._chargeH = null;
    this._mode = 'play';
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
    this._wantMeter = false;
    /** M2: objective:progress mirror { id → {value, max, frozen, done, textKey} } (holds, objective sounds, ambience) */
    this.objectives = new Map();
    /** M2: active ambience layers { id → { layer, handle, t } } (ambience.js) */
    this.amb = new Map();
    this._ambT = 0;
    this._flagSig = '';
    /** generated buffers (crickets, crackle) per AudioContext */
    this._gen = new Map();
    /** short-lived panners / procedural one-shots pruned in render() */
    this.oneshots = new Set();
    /** delayed cue parts: [{ at (this.time), fn }] */
    this._pending = [];
    /** PERF §3.1: synthesized PCM baked on the title (bake.js) */
    this.baker = new Prebaker(this.rand);
    /** the baked C5 glock note (AudioBuffer, after the unlock) */
    this.glockBuf = null;
    /** baked PCM not yet wrapped into AudioBuffers (the unlock beat the idle bake) */
    this._pcmPending = false;
    /** PERF §10.4 decode queue: jobs not started yet ({ path, urgent, resolve }) and the count in flight */
    this._dq = [];
    this._inflight = 0;
    /** PERF §10.5 listener state: last written position / forward, seconds since the last write */
    this._lp = new THREE.Vector3(NaN, NaN, NaN);
    this._lfw = new THREE.Vector3(NaN, NaN, NaN);
    this._lt = Infinity;
    this._lIso = null;
    this._followT = Infinity;
    /** AUTOCAM X24 room reads already played this visit (`${level}:${arena}`) and the last cutscene end (this.time) */
    this._roomReads = new Set();
    this._csEndAt = -Infinity;
  }

  /** Music track the director wants right now (id or null). */
  get currentTrack() { return this.director.target; }

  // =============================================================================================== lifecycle
  async init() {
    this._readSettings();
    const bus = this.ctx.bus;
    const on = (ev, fn) => this._offs.push(bus.on(ev, (p) => { try { fn(p ?? {}); } catch (e) { console.warn(`[audio] ${ev}`, e); } }));
    this._offs.push(...bindSfx(this));

    on(E.MUSIC, ({ track, fade }) => this.music(track ?? null, fade ?? MUSIC_RULES.crossfade));
    on(E.LEVEL_LOADING, ({ id }) => this._levelCleanup(id));
    on(E.LEVEL_LOADED, ({ id, level }) => this._levelLoaded(id, level));
    on(E.ARENA_LOCK, ({ id }) => this.director.arenaLock(id));
    on(E.ARENA_CLEAR, ({ id }) => this.director.arenaClear(id));
    on(E.BOSS_START, (p) => this._bossStart(p));
    on(E.OBJECTIVE, (p) => this._objective(p));
    on(E.FLAG_SET, () => { this._flagSig = ''; });
    on(E.UNLOCK, () => { if (this._mode !== 'cutscene' && this.gate('unlock', 1)) this.play2D('unlock'); });
    on(E.BOSS_DEFEATED, () => this.director.bossDefeated());
    on(E.ENEMY_ALERTED, ({ enemy }) => { if (enemy) this.alerted.add(enemy); });
    on(E.ENEMY_DIED, ({ enemy }) => this.alerted.delete(enemy));
    on(E.LEVEL_RESULTS, () => this.music('results_dance', 1));          // WA21: festival dance loop (+ ui's rankStamp)
    on(E.MEME_CAM, ({ on: isOn }) => this._setMeme(!!isOn));
    on(E.GAME_MODE, ({ mode }) => this._onMode(mode));
    on(E.HITSTOP, () => this._hitstopDuck());
    on(E.SETTINGS_CHANGED, ({ key, value }) => { if (key === 'master' || key === 'music' || key === 'sfx') { this.vol[key] = value; this._applyVolumes(); } });
    on(E.SAVE_LOADED, () => { this._readSettings(); this._applyVolumes(); });
    on(E.DIALOG_LINE, ({ speaker, text }) => this.babble(speaker, text));
    on(E.DIALOG_END, () => { this.stopBabble(); this._dialogHold = 0; this._applyDucks(); });
    on(E.CUTSCENE_END, () => { this._csEndAt = this.time; this.stopBabble(); this.stopLaughs(); this.march(false); this._dialogHold = 0; this._applyDucks(); });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const gesture = () => { if (!this.ready || this.ac?.state !== 'running') this.unlock(); };
      for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchend', 'click']) this._listen(window, ev, gesture, { capture: true, passive: true });
      if (typeof document !== 'undefined') this._listen(document, 'visibilitychange', () => this._onVisibility());
      if (this.ctx.params?.debug) this.showMeter(true);
      this.baker.schedule();                                    // PERF §3.1: bake on the title, before the first gesture
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
      // a busy main thread can take seconds to resume; a late 'running' finishes the unlock via onstatechange
      try { await Promise.race([ac.resume(), new Promise((r) => setTimeout(r, 3000))]); } catch { /* blocked: next gesture */ }
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
    // PERF §10.5: never parented, never auto-updated (three would ramp 9 listener params every frame); _listenerTick()
    // writes the ears at 20 Hz instead
    listener.matrixAutoUpdate = false; listener.matrixWorldAutoUpdate = false;
    this._lp.set(NaN, NaN, NaN); this._lt = Infinity; this._lIso = null; this._followT = Infinity;
    const L = MIX.limiter, lim = ac.createDynamicsCompressor();
    lim.threshold.value = L.threshold; lim.knee.value = L.knee; lim.ratio.value = L.ratio; lim.attack.value = L.attack; lim.release.value = L.release;
    // ART §9.3 mix: a touch of air (+1.5 dB high shelf at 6 kHz) and less boom (−2 dB low shelf at 120 Hz)
    const shelf = (type, { freq, gain }) => {
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      if (f.gain) f.gain.value = gain;
      return f;
    };
    // master (listener gain) → low shelf → high shelf → limiter → destination (three's setFilter takes only one node)
    this._shelves = [shelf('lowshelf', MIX.shelf.low), shelf('highshelf', MIX.shelf.high)];
    this._chain = [...this._shelves, lim];
    listener.gain.disconnect();
    for (let i = 0; i < this._chain.length - 1; i++) this._chain[i].connect(this._chain[i + 1]);
    lim.connect(ac.destination);
    listener.gain.connect(this._chain[0]);
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
      stingDest: hitDuck,                                   // the sting plays over the ducked decks
      canOgg: typeof Audio !== 'undefined' ? new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '' : true,
    });
    this.wind = new Wind(ac, world, this.rand, { data: this.baker.get('gen:wind'), rate: PCM_RATE });
    this.shim = new Shimmer(ac, player);
    ac.onstatechange = () => {
      if (this.ac !== ac) return;
      const st = ac.state;
      if (st === 'running') { if (!this.ready) this.unlock(); else this.musicPlayer?.resume(); return; }
      // a device / renderer error can drop a running context to 'suspended' / 'interrupted' (try to resume now; if
      // the browser refuses, the gesture listener retries on the next key / click) or close it for good ('closed':
      // tear the graph down and build a fresh context on the next gesture). Our own hidden-tab suspend is left alone.
      if (st === 'closed') this._recoverClosed();
      else if (this.unlocked && !this._hiddenSuspend) ac.resume().catch(() => {});
    };
    this._applyVolumes(0);
    this._applyDucks(0);
  }

  async _firstRun() {
    this.wind.start(this.ctx.env?.wind ?? 0.6, this.memeOn ? MEME.windMul : 1);
    if (this._shimmerWant) this.shim.set(true);
    // music requested before the unlock fades in now (CS-00: "fades in over 2 s")
    this.director.take();
    if (this.director.target) this.musicPlayer.play(this.director.target, MUSIC_RULES.titleFade);
    if (this.levelId) { this._setAmbience(this.levelId); this._ambRefresh(); }
    // PERF §3.1: the synth samples were baked on the title; the unlock only copies them into AudioBuffers
    this._pcmBuffers();
    // files fetched before the unlock (level preloads) warm up in the background, one at a time (PERF §10.4)
    for (const p of this._fetched) this._decode(p, false);
  }

  /**
   * Baked PCM → AudioBuffers of this context (zzfx defs + the glock note). A memcpy each. By default only the PCM the
   * idle slices already finished is wrapped (PERF §3.1: the gesture never synthesizes); the rest is wrapped when the
   * bake completes (update) or on first use (_zzBuf / glock). `all` bakes anything still missing right now.
   * @param {boolean} [all]
   */
  _pcmBuffers(all = false) {
    const pcm = all ? (k) => this.baker.get(k) : (k) => this.baker.pcm.get(k);
    let missing = false;
    for (const name of Object.keys(ZZFX_DEFS)) {
      if (this.zz.has(name)) continue;
      const b = pcmBuffer(this.ac, pcm('zz:' + name));
      if (b) this.zz.set(name, b); else missing = true;
    }
    if (!this.glockBuf) this.glockBuf = pcmBuffer(this.ac, pcm('gen:glock'));
    /** true while some baked PCM still waits to be wrapped (checked once per update, cheap) */
    this._pcmPending = !all && (missing || !this.glockBuf);
  }

  /**
   * The zzfx AudioBuffer `name`; when the unlock came before the idle bake reached it, bakes and wraps that one def now
   * (a short def: well under a frame), leaving the rest to the idle slices.
   * @param {string} name
   * @returns {AudioBuffer|null}
   */
  _zzBuf(name) {
    let b = this.zz.get(name);
    if (b || !this.ready || !(name in ZZFX_DEFS)) return b ?? null;
    b = pcmBuffer(this.ac, this.baker.get('zz:' + name));
    if (b) this.zz.set(name, b);
    return b;
  }

  update(dt) {
    if (this._pcmPending && this.ready && this.baker.done) this._pcmBuffers(true);   // the idle bake finished after the unlock
    const game = this.ctx.game, mode = game?.mode ?? 'play';
    // telegraph tings (sim time: they line up with the strike under slow motion)
    if (this.telegraphs.size) {
      for (const [id, t] of this.telegraphs) if ((t.t -= dt) <= 0) { this.telegraphs.delete(id); this.play3D(t.name, t.at); }
    }
    // music director (§16.1)
    if ((this._threatT -= dt) <= 0) { this._threatT = 0.25; this._threat = this._computeThreat(); this._syncArenas(); }
    if ((this._ambT -= dt) <= 0) { this._ambT = 0.5; this._checkFlags(); }
    this.director.tick(dt, { mode, threat: this._threat, zone: this._zoneTrack() });
    if (mode !== 'menu') this._ambTick(dt);
    if (mode === 'play' || mode === 'memecam') {
      this._lowHp(dt);
      this._autoSteps(dt);
    }
  }

  render(alpha, frameDt) {
    const dt = Math.max(0, Math.min(0.25, frameDt || 0));
    this.time += dt;
    if (!this.ready) return;
    this._applyMusicChanges();
    this._listenerTick(dt);
    const ac = this.ac, now = ac.currentTime;
    // hitstop duck (rising edge)
    const hs = (this.ctx.game?.hitstopT ?? 0) > 0;
    if (hs && !this._hs) this._hitstopDuck();
    this._hs = hs;
    if (this._stingUntil && now >= this._stingUntil) { this._stingUntil = 0; this.ducks.sting = 1; this._applyDucks(); }
    if (this._dialogHold && this.time > this._dialogHold && !this.babbleState) { this._dialogHold = 0; this._applyDucks(); }
    // wind follows Env (0–3), ×1.6 in Meme Cam
    this.wind.set(this.ctx.env?.wind ?? 0.6, this.memeOn ? MEME.windMul : 1);
    // 3D voices / loops that follow actors: 20 Hz, only when moved > 5 cm (PERF §10.5)
    if ((this._followT += dt) >= 1 / RUNTIME.listenerHz) {
      this._followT = 0;
      const eps2 = RUNTIME.moveEps * RUNTIME.moveEps;
      for (const v of this.voices3D) {
        if (!v.follow || v.endAt <= now) { if (v.endAt <= now) v.follow = null; continue; }
        if (this._posOf(v.follow, _v) && _v.distanceToSquared(v.pos) > eps2) { v.pos.copy(_v); this._setPannerPos(v.panner, v.pos); }
      }
      if (this.loops.size) {
        for (const h of this.loops) {
          if (!h.follow || !h.panner || !this._posOf(h.follow, _v)) continue;
          h.at ??= new THREE.Vector3(NaN, NaN, NaN);
          if (!(_v.distanceToSquared(h.at) <= eps2)) { h.at.copy(_v); this._setPannerPos(h.panner, _v); }
        }
      }
    }
    if (this._dq.length) this._pump();
    if (this.bells.size) {
      for (const b of this.bells) if (now > b.endAt + 0.5) { this.bells.delete(b); try { b.panner?.disconnect(); } catch { /* gone */ } }
    }
    if (this._pending.length) {
      const due = this._pending.filter((p) => p.at <= this.time);
      if (due.length) { this._pending = this._pending.filter((p) => p.at > this.time); for (const p of due) { try { p.fn(); } catch (e) { console.warn('[audio] cue part', e); } } }
    }
    if (this.oneshots.size) {
      for (const o of this.oneshots) if (now > o.endAt + 0.5) { this.oneshots.delete(o); try { o.panner?.disconnect(); } catch { /* gone */ } }
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
    this.baker.cancel?.();
    this._teardownGraph();
    this.telegraphs.clear(); this.alerted.clear(); this.loops.clear(); this.bells.clear(); this.amb.clear(); this.objectives.clear();
    this._pending.length = 0;
    this.log.length = 0; this.recent.length = 0;
  }

  /** Stop every voice and disconnect the whole WebAudio graph (dispose, or a closed context). */
  _teardownGraph() {
    if (this.ready || this.ac) {
      try { this.stopAll(0); } catch { /* closed context */ }
      this.musicPlayer?.dispose();
      try { this.wind?.stop(); } catch { /* closed context */ }
      this.shim?.dispose();
      for (const v of [...this.voices2D, ...this.voices3D]) { try { v.panner?.disconnect(); } catch { /* gone */ } }
      for (const n of this._chain ?? []) { try { n.disconnect(); } catch { /* gone */ } }
      this._chain = null;
      for (const [k, node] of Object.entries(this.bus ?? {})) { if (k !== 'master') { try { node.disconnect(); } catch { /* gone */ } } }
      for (const a of Object.values(this.analysers ?? {})) { try { a.disconnect(); } catch { /* gone */ } }
      this.listener?.parent?.remove(this.listener);
      if (this.ac) this.ac.onstatechange = null;
    }
    this.loops.clear(); this.amb.clear(); this.oneshots.clear(); this._gen.clear(); this._pending.length = 0;
    this.buffers.clear(); this._decoding.clear();
    for (const j of this._dq) j.resolve(null);
    this._dq.length = 0; this._inflight = 0;
    this.zz.clear(); this.glockBuf = null; this._shelves = null;
    this.bus = null; this.analysers = null; this.listener = null; this.musicPlayer = null; this.wind = null; this.shim = null;
    this.voices2D = []; this.voices3D = [];
    this.ac = null; this.ready = false; this.unlocked = false;
  }

  /**
   * The AudioContext was closed under us (device lost). Drop the dead graph and give three a fresh context; the next
   * user gesture runs unlock() → _build() → _firstRun() (music director target, ambience and wind come back).
   */
  _recoverClosed() {
    console.warn('[audio] AudioContext closed; rebuilding on the next user gesture');
    this._teardownGraph();
    try {
      const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (Ctor) THREE.AudioContext.setContext(new Ctor());
    } catch (e) { console.warn('[audio] could not create a new AudioContext', e?.message ?? e); }
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
    const dialog = (this._mode === 'dialog' || this.babbleState || this._dialogHold) ? DUCK.dialog : 1;
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
    this._mode = mode ?? this.ctx.game?.mode ?? 'play';
    this.ducks.menu = mode === 'menu' ? DUCK.menu : 1;
    this.pausedWorld = mode === 'menu';
    if (mode === 'menu') this.stopBabble();
    this._applyDucks();
  }

  _setMeme(on) {
    this.memeOn = on;
    this.ducks.meme = on ? DUCK.meme : 1;
    this._applyDucks(on ? DUCK.memeFade / 3 : 0.25);     // ~95% of the way in 1 s
    if (on) this.stopBabble();
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

  /**
   * Decoded buffer for a path (fetch + decode once; `_decoding` holds only pending decodes, so a buffer dropped by
   * evict() decodes again from the cached bytes). Before the unlock it only fetches. Never rejects.
   * PERF §10.4: decodes are queued, ≤ RUNTIME.maxDecodes at once; `urgent` (a sound asked to play) jumps ahead of the
   * background warm-up (level preloads), which runs one at a time and pauses while a fight is on.
   * @param {string} path @param {boolean} [urgent]
   */
  _decode(path, urgent = true) {
    const b = this.buffers.get(path);
    if (b) return Promise.resolve(b);
    if (!this.ac) return this._fetch(path).then(() => null, (e) => { this._warnOnce(path, e); return null; });
    let p = this._decoding.get(path);
    if (p) {
      if (urgent) { const j = this._dq.find((x) => x.path === path); if (j && !j.urgent) { j.urgent = true; this._pump(); } }
      return p;
    }
    let resolve;
    p = new Promise((r) => { resolve = r; });
    this._decoding.set(path, p);
    this._dq.push({ path, urgent, resolve });
    this._pump();
    return p;
  }

  /** Start queued decodes: urgent ones up to RUNTIME.maxDecodes, warm-ups one at a time while calm. */
  _pump() {
    while (this._dq.length && this._inflight < RUNTIME.maxDecodes) {
      let i = this._dq.findIndex((j) => j.urgent);
      if (i < 0) {
        if (this._inflight >= RUNTIME.warmConcurrent || this._threat) return;
        i = 0;
      }
      const [job] = this._dq.splice(i, 1);
      this._runDecode(job);
    }
  }

  _runDecode(job) {
    const ac = this.ac, path = job.path;
    this._inflight++;
    this._fetch(path)
      .then((ab) => ac.decodeAudioData(ab.slice(0)))
      .then((buf) => { if (this.ac === ac) this.buffers.set(path, buf); return buf; })
      .catch((e) => { this._warnOnce(path, e); return null; })
      .then((buf) => {
        if (this.ac === ac) { this._inflight = Math.max(0, this._inflight - 1); this._decoding.delete(path); }
        job.resolve(buf);
        if (this.ac === ac && this._dq.length) this._pump();
      });
  }

  _warnOnce(key, e) { if (!this._missing.has(key)) { this._missing.add(key); console.warn(`[audio] ${key}: ${e?.message ?? e}`); } }

  /** Normalised path for a sound id / pattern / path. */
  _pathOf(id) { return this.resolve(id) ?? String(id).replace(/^\.?\//, '').replace(/^(public\/)?assets\//, ''); }

  /**
   * Preload hook (ctx.assets.preload routes .ogg/.mp3/.wav here): resolves once the bytes are fetched, so a level load
   * never waits on audio decoding; the decode runs in the background (now, or on the unlock). Streamed music is
   * skipped. Resolves the path; never rejects.
   */
  async load(path) {
    const p = this._pathOf(path);
    if (isMusicPath(p)) {
      const def = Object.values(TRACKS).find((t) => t.file === p);
      if (!def?.buffer) return p;
    }
    if (this.buffers.has(p)) return p;
    await this._fetch(p).catch((e) => { this._warnOnce(p, e); });
    if (this.ac) this._decode(p, false);                       // warm-up (PERF §10.4), not a decode burst
    return p;
  }

  /** Fetch + decode a sound now: resolves its AudioBuffer (null before the unlock or on failure). */
  decode(id) { return this._decode(this._pathOf(id)); }

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
   * 2D sound (player, UI): a SFX name, a file id ('pickup/bubble2'), a pattern ('world/wood_hit_0x') or a path.
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
    const name = SFX_ALIASES[id] ?? String(id ?? '');
    if (!name) return null;
    this._note(at != null ? '3d' : '2d', name);
    const proc = PROCEDURAL[name];
    if (proc) return proc(this, at, opts);
    if (CUES[name] || BEAT_CUES[name]) return this.cue(name, at, opts);
    // an endless loop (cutscene purr, ambience) runs outside the voice pools so a burst of one-shots never steals it
    if (opts.loop && !(opts.dur > 0)) {
      return this.loop(name, { volume: volOf(opts) ?? 1, rate: opts.rate ?? 1, at, bus: opts.bus ?? (at != null ? 'world' : 'player'),
        fadeIn: opts.fadeIn ?? 0.3, noted: true });
    }
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

  /**
   * Play `path` (or the def's zzfx fallback). A sound whose buffer is still decoding plays late if the decode lands
   * within MIX.lateWindow; `ready` is that decoded buffer on the (single) retry.
   */
  _playPath(path, name, at, opts, def, ready = null) {
    if (!this.ready) return null;
    let buf = ready ?? (path ? this.buffers.get(path) : null);
    if (!buf && def?.zzfx) {                                   // the synth stand-in now, the file from next time on
      buf = this._zzBuf(def.zzfx);
      if (path) this._decode(path);
    }
    if (!buf) {
      if (!path) return null;
      const t0 = this.ac.currentTime;
      this._decode(path).then((b) => {
        if (b && this.ready && this.ac.currentTime - t0 <= MIX.lateWindow) this._playPath(path, name, at, opts, def, b);
      });
      return null;
    }
    const rv = opts.rateVar ?? def?.rateVar ?? 0.03;
    const rate = Math.max(0.05, (opts.rate ?? 1) * (def?.rate ?? 1) * (1 + (this.rand() * 2 - 1) * rv));
    const vol = (opts.volume ?? opts.vol ?? 1) * (def?.vol ?? 1);
    return this._start(buf, {
      name, at, rate, vol, delay: opts.delay ?? 0, offset: opts.offset ?? 0, dur: opts.dur ?? def?.dur ?? 0,
      loop: !!opts.loop, bus: opts.bus ?? def?.bus ?? null, lowpass: opts.lowpass ?? def?.lowpass ?? 0,
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

  /** PERF §10.5: one setValueAtTime per axis (no cancel, no per-frame automation; callers throttle to 20 Hz). */
  _setPannerPos(panner, p) {
    if (panner.positionX) {
      const t = this.ac.currentTime;
      panner.positionX.setValueAtTime(p.x, t); panner.positionY.setValueAtTime(p.y, t); panner.positionZ.setValueAtTime(p.z, t);
    } else panner.setPosition(p.x, p.y, p.z);
  }

  /** World position of `at` into `out`; returns false if `at` has none. */
  _posOf(at, out) {
    if (at == null) return false;
    if (typeof at === 'string') {
      const a = this.ctx.actors?.get?.(at) ?? (PLAYER_IDS.has(at) ? this.ctx.player : null);
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
    if (at == null || typeof at !== 'object') return typeof at === 'string' ? (this.ctx.actors?.get?.(at) ?? (PLAYER_IDS.has(at) ? this.ctx.player : null)) : null;
    return at.pos?.isVector3 || at.isObject3D ? at : null;
  }

  /** Where the ears are (the last listener write; the lens before the first one). */
  _cameraPos(out) {
    if (Number.isFinite(this._lp.x)) return out.copy(this._lp);
    return this._earPose(out, null);
  }

  /**
   * CONTROLS_SPEC §2.8 / AUTOCAM §13 audio: in the iso play camera the ears sit at the focus + 1.2 m (the focus includes
   * the camera's lean and aim pan: ears go where eyes go), facing along the camera yaw (screen-right = right ear); in
   * cutscenes, presets, Meme Cam and `?cam=classic` they ride the lens. Writes `pos` (and `fwd` when given).
   * @returns {THREE.Vector3} pos
   */
  _earPose(pos, fwd) {
    const cam = this.ctx.cam, c = this.ctx.camera;
    if (this._isoEars()) {
      pos.set(cam.focus.x, cam.focus.y + 1.2, cam.focus.z);
      const yaw = cam.yaw ?? Math.PI;
      fwd?.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      return pos;
    }
    if (!c) { fwd?.set(0, 0, -1); return pos.set(0, 0, 0); }
    c.matrixWorld.decompose(pos, _lq, _ls);
    fwd?.set(0, 0, -1).applyQuaternion(_lq);
    return pos;
  }

  _isoEars() {
    const cam = this.ctx.cam;
    return !!(cam?.isIso && cam.focus?.isVector3 && (cam.modeName === 'follow' || cam.modeName === 'lock' || cam.modeName === 'boss'));
  }

  /**
   * PERF §10.5 (P:U2): write the AudioListener at RUNTIME.listenerHz, only when the ears moved > 5 cm or turned, with
   * setValueAtTime (three's AudioListener would ramp all nine params every frame). A switch between the iso ears and
   * the lens writes at once.
   * @param {number} dt
   */
  _listenerTick(dt) {
    const ac = this.ac, L = ac?.listener;
    if (!L) return;
    const iso = this._isoEars();
    this._lt += dt;
    if (iso === this._lIso && this._lt < 1 / RUNTIME.listenerHz) return;
    const snap = iso !== this._lIso;
    this._lIso = iso; this._lt = 0;
    this._earPose(_v, _lf);
    const moved = snap || !(_v.distanceToSquared(this._lp) <= RUNTIME.moveEps * RUNTIME.moveEps);
    const turned = snap || !(_lf.distanceToSquared(this._lfw) <= RUNTIME.turnEps * RUNTIME.turnEps);
    if (!moved && !turned) return;
    const t = ac.currentTime;
    if (L.positionX) {
      if (moved) { L.positionX.setValueAtTime(_v.x, t); L.positionY.setValueAtTime(_v.y, t); L.positionZ.setValueAtTime(_v.z, t); }
      if (turned) {
        _lu.set(0, 1, 0);
        if (!iso) _lu.applyQuaternion(_lq);
        L.forwardX.setValueAtTime(_lf.x, t); L.forwardY.setValueAtTime(_lf.y, t); L.forwardZ.setValueAtTime(_lf.z, t);
        L.upX.setValueAtTime(_lu.x, t); L.upY.setValueAtTime(_lu.y, t); L.upZ.setValueAtTime(_lu.z, t);
      }
    } else {
      L.setPosition?.(_v.x, _v.y, _v.z);
      _lu.set(0, 1, 0); if (!iso) _lu.applyQuaternion(_lq);
      L.setOrientation?.(_lf.x, _lf.y, _lf.z, _lu.x, _lu.y, _lu.z);
    }
    this._lp.copy(_v); this._lfw.copy(_lf);
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
      this._setPannerPos(v.panner, v.pos);
      out.connect(v.panner);
    } else out.connect(this.bus[o.bus ?? 'player'] ?? this.bus.player);
    const src = ac.createBufferSource();
    src.buffer = buf; src.playbackRate.value = o.rate; src.loop = !!o.loop;
    let lp = null;
    if (o.lowpass > 0) {                                      // ART §9.3 softened sounds (the crow)
      lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lowpass;
      src.connect(lp); lp.connect(out);
    } else src.connect(out);
    const offset = Math.max(0, Math.min(o.offset ?? 0, buf.duration - 0.01));
    let len = (buf.duration - offset) / o.rate;
    if (o.dur > 0) {
      len = o.loop ? o.dur : Math.min(len, o.dur);
      const fade = Math.min(0.25, len * 0.3);
      out.gain.setValueAtTime(o.vol, t + len - fade);
      out.gain.linearRampToValueAtTime(0, t + len);
      src.start(t, offset); src.stop(t + len + 0.02);
    } else src.start(t, offset);
    src.onended = () => { try { out.disconnect(); lp?.disconnect(); } catch { /* gone */ } };
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

  /**
   * Looping sound (ambience, purr) outside the pools; with `at` it is positional (an actor / Object3D is followed).
   * Returns { name, stop(fade), setVolume(v, fade) } at once (the buffer may still be decoding), or null.
   */
  loop(id, { volume = 1, vol, rate = 1, at = null, bus = 'world', fadeIn = 0.8, noted = false } = {}) {
    if (!noted) this._note('loop', id);
    if (!this.ready) return null;
    const def = SFX[id];
    const path = this.resolve(def ? def.files[0] : id);
    if (!path) { this._warnOnce('id:' + id, 'unknown sound id (not in src/audio/assets.manifest.js)'); return null; }
    const handle = { name: String(id), src: null, out: null, panner: null, follow: this._followOf(at), dead: false,
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
      if (!buf || handle.dead || !this.ready) return;
      const ac = this.ac, t = ac.currentTime;
      const out = ac.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(target, t + fadeIn);
      let dest = this.bus[bus] ?? this.bus.world;
      if (at != null && this._posOf(at, _v)) {
        const p = ac.createPanner(); p.distanceModel = MIX.distanceModel; p.refDistance = MIX.refDistance; p.rolloffFactor = MIX.rolloff;
        p.maxDistance = MIX.maxDistance;
        this._setPannerPos(p, _v); p.connect(this.bus.world); dest = p; handle.panner = p;
      }
      out.connect(dest);
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate * (def?.rate ?? 1);
      src.connect(out); src.start(t, this.rand() * buf.duration * 0.9);
      src.onended = () => { try { out.disconnect(); handle.panner?.disconnect(); } catch { /* */ } };
      handle.src = src; handle.out = out;
      this.started[handle.name] = (this.started[handle.name] ?? 0) + 1;
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
    for (const st of this.amb.values()) st.handle?.stop?.(fade || 0.005);
    for (const st of this.amb.values()) st.handle = null;
    for (const o of this.oneshots) o.stop?.(fade || 0.005);
    this._pending.length = 0;
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
    if (this.ready) this._applyMusicChanges();
    return id;
  }

  _applyMusicChanges() {
    const ch = this.director.take();
    if (!ch) return;
    if (ch.track !== undefined) this.musicPlayer.play(ch.track, ch.fade, this.director.gainFor(ch.track));
    if (ch.sting) this._sting(ch.sting);
  }

  _sting(id) {
    this.ducks.sting = DUCK.sting; this._applyDucks(0.08);
    this._stingUntil = this.ac.currentTime + MUSIC_RULES.stingDur;
    this.musicPlayer.playSting(id).then((d) => { if (this.ready) this._stingUntil = this.ac.currentTime + Math.max(0, d); });
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

  /** An arena that unlocked without arena:clear (death inside → Arena.reset) no longer holds the combat music. */
  _syncArenas() {
    const list = this.ctx.levels?.current?.arenas, held = this.director.arenas;
    if (!held.size || !Array.isArray(list)) return;
    for (const id of [...held]) {
      const a = list.find((x) => x?.id === id);
      if (a && !a.locked && !a.cleared) held.delete(id);
    }
  }

  _zoneTrack() {
    const zones = this.director.level?.zones, p = this.ctx.player?.pos;
    if (!zones?.length || !p) return null;
    for (const z of zones) {
      const at = z.at ?? z.center; if (!at) continue;
      if (z.when && !this._cond(z.when)) continue;
      const x = Array.isArray(at) ? at[0] : at.x, zz = Array.isArray(at) ? at[1] : at.z;
      if ((p.x - x) ** 2 + (p.z - zz) ** 2 <= (z.r ?? 8) ** 2) return z.track ?? null;
    }
    return null;
  }

  _levelCleanup(nextId) {
    if (this.ready) {
      for (const v of this.voices3D) if (v.out) this._release(v, 0.2);
      for (const h of [...this.loops]) h.stop(0.4);
      this.stopLaughs(); this.march(false); this.stopBabble();
      this.shimmer(false);
      this.endCharge(0.05);
    }
    this.ambience = null;
    this._ambStopAll(1);
    this.objectives.clear(); this._pending.length = 0;
    this.telegraphs.clear(); this.alerted.clear();
    this._threat = false;
    this._roomReads.clear();
    // queued warm-ups of the old level are dropped (urgent decodes still finish)
    if (this._dq.length) {
      const keep = [];
      for (const j of this._dq) { if (j.urgent) keep.push(j); else { this._decoding.delete(j.path); j.resolve(null); } }
      this._dq = keep;
    }
    if (nextId) this.evict(nextId);
  }

  /**
   * Drop decoded buffers the next level doesn't list (manifest `levels['*']` + `levels[id]`); a dropped sound
   * decodes again from the cached bytes the first time it is asked for (well inside MIX.lateWindow).
   * Keeps PCM memory near one level's working set (all SFX decoded ≈ 200 MB). Returns the number dropped.
   * @param {string} levelId
   */
  evict(levelId) {
    const keep = keepSet(levelId);
    let n = 0;
    for (const p of [...this.buffers.keys()]) if (!keep.has(p)) { this.buffers.delete(p); n++; }
    return n;
  }

  _levelLoaded(id, level) {
    this.levelId = id ?? null;
    const m = level?.music ?? level?.def?.music ?? null;
    // meadow's night tutorial keeps the CS-01 bards' tale (`music.prologue`) until CS-02 sets prologue.done
    const prologue = !!m?.prologue && !this.ctx.state?.getFlag?.('prologue.done');
    this._levelMusicDef = m;
    this.director.setLevel(id, m, { prologue, cond: (c) => this._cond(c) });
    this._flagSig = this._flagSignature();
    this.surface = level?.surface ?? LEVEL_SURFACE[id] ?? 'grass';
    if (this.ready) { this._setAmbience(id); this._ambRefresh(); }
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
    const any = bufs.find(Boolean) ?? null, fb = this._zzBuf('hyenaLaugh');
    if (!any && !fb) return null;
    let busy = 0;
    for (const v of this.voices3D) if (v.laugh && v.endAt > this.ac.currentTime) busy++;
    if (busy >= LAUGH.maxConcurrent) return null;
    const ac = this.ac, spatial = pos != null && this._posOf(pos, _v);
    if (spatial) { this._cameraPos(_cam); if (_cam.distanceToSquared(_v) > (MIX.maxDistance + 5) ** 2) return null; }
    const v = this._voice(spatial ? this.voices3D : this.voices2D);
    const t0 = ac.currentTime + Math.max(0, opts.delay ?? 0);
    const out = ac.createGain(); out.gain.value = (opts.volume ?? 1) * LAUGH.vol;
    if (spatial) { v.pos.copy(_v); v.follow = this._followOf(pos); this._setPannerPos(v.panner, v.pos); out.connect(v.panner); }
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
   * 0.6–1.8 s for `dur` seconds (real time). `stopLaughs()` ends it. The default volume makes up most of the
   * distance roll-off at r 18 (inverse model: ref 3, rolloff 1.4 → −18 dB), so the fog cackles clearly.
   */
  laughChorus(center, { count = 6, r = 18, dur = 8, rate = 1, volume = 2.2 } = {}) {
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
    const c = _c;
    if (!this._posOf(m.center, c)) return;
    if ((m.stepT -= dt) <= 0) {
      m.stepT = MARCH.stepEvery * (0.9 + this.rand() * 0.2);
      const p = this._marchPos(c, 0);
      this.play3D(MARCH.stepIds[m.n++ % MARCH.stepIds.length], p, { volume: MARCH.stepVol * m.volume, rate: 0.9 + this.rand() * 0.2 });
    }
    if ((m.chainT -= dt) <= 0) {
      m.chainT = MARCH.chainEvery * (0.8 + this.rand() * 0.4);
      const p = this._marchPos(c, 1);
      this.play3D(MARCH.chainIds[Math.floor(this.rand() * MARCH.chainIds.length)], p, { volume: MARCH.chainVol * m.volume });
    }
  }

  /** ±MARCH.spread m around the march centre. */
  _marchJitter() { return (this.rand() - 0.5) * 2 * MARCH.spread; }

  /**
   * A jittered march position from a small ring of reused vectors (no per-step allocation). The ring outlives the
   * late-decode replay window (MIX.lateWindow), which is the only place a play keeps its `at` past the call.
   * @param {THREE.Vector3} c @param {number} dy
   */
  _marchPos(c, dy) {
    const ring = this._marchRing ??= Array.from({ length: 8 }, () => new THREE.Vector3());
    const p = ring[this._marchRingI = ((this._marchRingI ?? 0) + 1) % ring.length];
    return p.set(c.x + this._marchJitter(), c.y + dy, c.z + this._marchJitter());
  }

  /**
   * The Sunbell (§16.3): additive partials with exponential decay + impact/metal_ringing at rate 0.5, vol 0.3, and the
   * hammer's clank. `strikes` > 1 tolls it (tollPlan); `profile: 'handbell'` is the small shop-counter bell (no layer).
   * @param {{damped?: boolean, volume?: number, pos?: any, base?: number, profile?: string, strikes?: number,
   *          interval?: number, strike?: boolean}} [opts]  damped = CS-02 "clunk"
   */
  bell(opts = {}) {
    const damped = !!opts.damped, profile = opts.profile ?? 'sunbell';
    this._note('bell', profile === 'handbell' ? 'handbell' : damped ? 'clunk' : (opts.strikes > 1 ? 'toll' : 'sunbell'));
    if (!this.ready) return null;
    const ac = this.ac, big = profile === 'sunbell';
    let dest = profile === 'handbell' && opts.pos == null ? this.bus.ui : this.bus.world, panner = null;
    if (opts.pos != null && this._posOf(opts.pos, _v)) {
      panner = ac.createPanner(); panner.distanceModel = 'inverse'; panner.refDistance = big ? 30 : 4; panner.rolloffFactor = 1;
      this._setPannerPos(panner, _v); panner.connect(this.bus.world); dest = panner;
    }
    const vol = opts.volume ?? 1, plan = tollPlan(Math.max(1, opts.strikes ?? 1), opts.interval ?? 2.4);
    const hs = plan.map((s) => strikeBell(ac, dest, { damped, volume: vol * s.gain, base: opts.base, profile, strike: opts.strike ?? true,
      when: ac.currentTime + s.t, rand: this.rand, detune: () => (this.rand() * 2 - 1) * 3 }));
    if (big) {
      const layer = damped ? 'bellClunkLayer' : 'bellLayer';
      if (panner) this.play3D(layer, opts.pos, { volume: vol }); else this.play2D(layer, { volume: vol, bus: 'world' });
    }
    const handle = { name: plan.length > 1 ? 'toll' : (big ? 'bell' : 'handbell'), strikes: plan.length, panner,
      endAt: Math.max(...hs.map((h) => h.endAt)),
      stop: (fade) => { for (const h of hs) h.stop(fade); this.bells.delete(handle); } };
    this.bells.add(handle);                                   // pruned in render() once rung out
    this.started.bell = (this.started.bell ?? 0) + plan.length;
    return handle;
  }

  // =============================================================================================== M2: cues, shops, flags
  /**
   * A cutscene cue sheet (cues.js): every part starts `delay` s after the cue (real time) at the cue's `at` (or its
   * own). Returns one `{ name, stop(fade) }` handle for the whole cue (null if the id is unknown).
   * @param {string} name @param {any} [at] @param {{volume?: number, vol?: number}} [opts]  volume scales every part
   */
  cue(name, at = null, opts = {}) {
    const parts = CUES[name] ?? BEAT_CUES[name];
    if (!parts) return null;
    const mul = volOf(opts ?? {}) ?? 1, handles = [];
    const h = { name, dead: false, parts: parts.length, stop: (fade = 0.2) => { h.dead = true; for (const x of handles) x?.stop?.(fade); } };
    const fire = (p) => {
      if (h.dead) return;
      const o = partOpts(p), v = volOf(o);
      const po = { ...o, ...(v != null || mul !== 1 ? { volume: (v ?? 1) * mul } : {}) };
      delete po.vol;
      const where = p.at ?? at;
      handles.push(where != null ? this._play(p.id, where, po) : this._play(p.id, null, po));
    };
    for (const p of parts) {
      if ((p.delay ?? 0) > 0) this._pending.push({ at: this.time + p.delay, fn: () => fire(p) });
      else fire(p);
    }
    return h;
  }

  /**
   * Hub shop / Quest Board feedback (§13.3): `action` ∈ SHOP_SFX keys (open, close, hover, select, buy, coin, denied,
   * equip, equipSword, equipCape). `open` also dings the counter bell; `buy` adds the station's flavour
   * (bakery bottle, forge anvil, library pages, wardrobe twirl, barracks banner, Quest Board pin).
   * @param {string} action @param {{station?: string, at?: any}} [opts]
   */
  shop(action, { station = null, at = null } = {}) {
    const name = SHOP_SFX[action] ?? (SFX[action] ? action : null);
    this._note('shop', `${action}${station ? ':' + station : ''}`);
    if (!name) return null;
    const h = this.play2D(name);
    if (action === 'open' && station !== 'questboard' && station !== 'quest') this.bell({ profile: 'handbell', volume: 0.8, pos: at ?? null });
    if (action === 'buy' && station && STATION_SFX[station]) this.play2D(STATION_SFX[station], { delay: 0.12 });
    return h;
  }

  /** boss:start → the boss's track (BOSS_MUSIC; snaps in within 0.3 s) + its fog-wall stinger. */
  _bossStart({ boss, id } = {}) {
    const row = bossMusicFor(id ?? actorTypeId(boss));
    this.director.bossStart(row.track ?? null);
    if (row.intro && this.gate('bossIntro:' + (id ?? actorTypeId(boss)), 2)) this.play2D(row.intro);
    if (this.ready) this._applyMusicChanges();
  }

  /** GameState.cond (flags), false without state. */
  _cond(expr) {
    const st = this.ctx.state;
    if (typeof st?.cond === 'function') { try { return !!st.cond(expr); } catch { return false; } }
    return expr == null || expr === '' || expr === true;
  }

  /** Values of every flag the level's music / ambience conditions read (cheap change detection). */
  _flagSignature() {
    const keys = new Set();
    const scan = (c) => { for (const k of String(c ?? '').split(/\|\||&&/)) { const t = k.trim().replace(/^!+/, '').trim(); if (t && !t.startsWith('obj')) keys.add(t); } };
    for (const row of this.director.level?.byFlag ?? []) scan(Array.isArray(row) ? row[0] : row?.when);
    for (const l of AMBIENT_LIST(this.levelId)) scan(l.when);
    for (const z of this.director.level?.zones ?? []) if (z.when) scan(z.when);
    return [...keys].map((k) => `${k}=${this._cond(k) ? 1 : 0}`).join(',');
  }

  /** A flag changed: re-resolve the level's explore track (forest night, hub gold / grey) and the ambience layers. */
  _checkFlags() {
    if (!this.levelId) return;
    const sig = this._flagSignature();
    if (sig === this._flagSig) return;
    this._flagSig = sig;
    const lm = levelMusic(this.levelId, this._levelMusicDef ?? null, { cond: (c) => this._cond(c) });
    // meadow keeps its legacy prologue rule until the CS-02 reload
    if (!this._levelMusicDef?.prologue || this._cond('prologue.done')) this.director.setExplore(lm.explore);
    this._ambRefresh();
  }

  /** objective:progress → music holds (The Line), the objective's sounds, and objective-driven ambience. */
  _objective(p) {
    if (!p?.id) return;
    const prev = this.objectives.get(p.id) ?? null;
    // `frozen` = frozen || paused (world): `held` is the real freeze (Pilfer has the pin), not an enemy at the winch
    const cur = { id: p.id, value: +p.value || 0, max: +p.max || 1, frozen: !!p.frozen, held: !!p.frozen && !p.paused, done: !!p.done,
      textKey: p.textKey ?? prev?.textKey ?? null };
    this.objectives.set(p.id, cur);
    const holds = this.director.level?.holds ?? {};
    const track = holds[p.id] ?? (cur.textKey ? holds[cur.textKey] : undefined);
    if (track) { if (cur.done) this.director.release(p.id); else this.director.hold(p.id, track); }
    const row = objectiveSfxFor(cur);
    if (row && prev) {
      if (row.tick && cur.max <= 20 && Math.floor(cur.value) > Math.floor(prev.value) && !cur.done) this.play2D(row.tick);
      if (row.freeze && cur.held && !prev.held) this.play3D(row.freeze, [0, 1, 41]);
      if (row.resume && !cur.held && prev.held && !cur.done) this.play3D(row.resume, [0, 1, 41]);
    }
    if (row && cur.done && !prev?.done) {
      if (row.done) this.play2D(row.done);
      for (const [name, delay, at] of row.doneSeq ?? []) {
        if (delay > 0) this._pending.push({ at: this.time + delay, fn: () => this.play3D(name, at) }); else this.play3D(name, at);
      }
    }
    if (this.ready) this._applyMusicChanges();
    this._ambRefresh();
  }

  /** Is objective `id` (id, or textKey `obj.<id>`) running (and not frozen unless `any`)? */
  _objRunning(id, any = false) {
    for (const o of this.objectives.values()) {
      if (o.id !== id && o.textKey !== 'obj.' + id) continue;
      if (!o.done && (any || !o.frozen)) return true;
    }
    return false;
  }

  // =============================================================================================== M2: ambience
  /** Start / stop the ambience layers (ambience.js) to match the flags and objectives now. */
  _ambRefresh() {
    if (!this.levelId) return;
    const want = activeLayers(this.levelId, (c) => this._cond(c), (id, any) => this._objRunning(id, any));
    const ids = new Set(want.map((l) => l.id));
    for (const [id, st] of [...this.amb]) if (!ids.has(id)) { st.handle?.stop?.(1.5); this.amb.delete(id); }
    for (const l of want) {
      if (this.amb.has(l.id)) {
        const st = this.amb.get(l.id);
        if (!st.handle && this.ready && isBed(l)) st.handle = this._ambStart(l);      // rebuilt after stopAll / unlock
        continue;
      }
      const st = { layer: l, handle: null, t: nextWait(l.every ?? [1, 2], this.rand) * 0.5 };
      if (this.ready && isBed(l)) st.handle = this._ambStart(l);
      this.amb.set(l.id, st);
    }
  }

  _ambStart(l) {
    if (l.kind === 'loop') return this.loop(l.sound, { volume: l.vol ?? 1, rate: l.rate ?? 1, at: l.at ?? null, fadeIn: 2, bus: 'world' });
    if (l.kind === 'crickets') return this.crickets({ volume: l.vol ?? 0.05 });
    if (l.kind === 'crackle') return this.campfire(l.at ?? null, { volume: l.vol ?? 1 });
    return null;
  }

  _ambStopAll(fade = 1) {
    for (const st of this.amb.values()) st.handle?.stop?.(fade);
    this.amb.clear();
  }

  /** Timed layers (scatter, birds, owl, laughs). */
  _ambTick(dt) {
    if (!this.ready || !this.amb.size) return;
    for (const st of this.amb.values()) {
      const l = st.layer;
      if (isBed(l) || (st.t -= dt) > 0) continue;
      st.t = nextWait(l.every ?? [2, 5], this.rand);
      this._cameraPos(_cam);
      const pos = layerPos(l, this.rand, _cam);
      if (l.kind === 'birds') this.birds(pos, { volume: l.vol ?? 1 });
      else if (l.kind === 'owl') this.owl(pos, { volume: l.vol ?? 0.12 });
      else if (l.kind === 'laughs') this.laugh(pos, { volume: l.vol ?? 1, rate: 0.95 + this.rand() * 0.25 });
      else if (l.kind === 'scatter') {
        const [n, gap] = l.burst ?? [1, 0];
        const count = Math.max(1, Math.round(n * (0.6 + this.rand() * 0.6)));
        const snd = l.sounds[Math.floor(this.rand() * l.sounds.length) % l.sounds.length];
        for (let i = 0; i < count; i++) {
          const r = l.rate ? l.rate[0] + this.rand() * (l.rate[1] - l.rate[0]) : 1;
          this.play3D(snd, pos, { volume: l.vol ?? 1, rate: r, rateVar: 0.02, delay: i * gap });
        }
      }
    }
  }

  /** Positional output node at `at` (null → the world bus) for procedural one-shots; pruned by render() after `life`. */
  _spot(at, life, refDistance = MIX.refDistance) {
    if (at == null || !this._posOf(at, _v)) return { dest: this.bus.world, panner: null };
    this._cameraPos(_cam);
    if (_cam.distanceToSquared(_v) > (MIX.maxDistance + 5) ** 2) return null;
    const p = this.ac.createPanner();
    p.distanceModel = MIX.distanceModel; p.refDistance = refDistance; p.rolloffFactor = MIX.rolloff; p.maxDistance = MIX.maxDistance;
    this._setPannerPos(p, _v); p.connect(this.bus.world);
    if (Number.isFinite(life)) this.oneshots.add({ panner: p, endAt: this.ac.currentTime + life, stop: () => {} });
    return { dest: p, panner: p };
  }

  /** A generated buffer: the title bake's PCM (`gen:<key>`) when there is one, else made now at the context rate. */
  _genBuf(key, make) {
    let b = this._gen.get(key);
    if (!b) {
      const pcm = this.baker.get('gen:' + key);
      if (pcm) b = pcmBuffer(this.ac, pcm, PCM_RATE);
      else {
        const data = make(this.ac.sampleRate, this.rand);
        b = this.ac.createBuffer(1, data.length, this.ac.sampleRate); b.getChannelData(0).set(data);
      }
      this._gen.set(key, b);
    }
    return b;
  }

  /** A looping procedural bed as a loops-set handle (stopped by stopAll / level changes like file loops). */
  _bed(name, buf, at, { volume = 1, filter = null, fadeIn = 1.5 } = {}) {
    const spot = this._spot(at, Infinity, 2.5);
    if (!spot) return null;
    const p = playData(this.ac, spot.dest, buf, { loop: true, volume, filter, fadeIn });
    const handle = { name, src: p.src, out: p.out, panner: spot.panner, follow: this._followOf(at), dead: false,
      stop: (fade = 0.6) => { handle.dead = true; this.loops.delete(handle); p.stop(fade); if (spot.panner) this.oneshots.add({ panner: spot.panner, endAt: this.ac.currentTime + fade, stop: () => {} }); },
      setVolume: (v, fade = 0.5) => p.setVolume(v, fade) };
    this.loops.add(handle);
    this.started[name] = (this.started[name] ?? 0) + 1;
    return handle;
  }

  /** The campfire / bakery oven crackle (procedural loop; positional with `at`). */
  campfire(at = null, { volume = 1 } = {}) {
    this._note('proc', 'campfire');
    if (!this.ready) return null;
    return this._bed('campfire', this._genBuf('crackle', (sr, r) => crackleData(sr, r)), at, { volume: volume * 0.5, filter: { type: 'lowpass', freq: 5200 } });
  }

  /** Forest-night crickets (procedural 2D loop on the world bus). */
  crickets({ volume = 0.05 } = {}) {
    this._note('proc', 'crickets');
    if (!this.ready) return null;
    return this._bed('crickets', this._genBuf('crickets', (sr, r) => cricketData(sr, r)), null, { volume, fadeIn: 2.5 });
  }

  /** One birdsong phrase at `at` (procedural; around the listener when no position). */
  birds(at = null, { volume = 1, kind } = {}) {
    this._note('proc', 'birds');
    if (!this.ready) return null;
    const plan = birdPlan(this.rand, { kind });
    const spot = this._spot(at, 3, 5);
    if (!spot) return null;
    const end = playChirps(this.ac, spot.dest, plan, { volume: volume * BIRDS.vol });
    this.started.birds = (this.started.birds ?? 0) + 1;
    return { name: 'birds', notes: plan.length, endAt: end, stop: () => {} };
  }

  /** The owl's "hoo … hoo-hoo" (forest night). */
  owl(at = null, { volume = 0.15 } = {}) {
    this._note('proc', 'owl');
    if (!this.ready) return null;
    const spot = this._spot(at, 3, 8);
    if (!spot) return null;
    const end = playChirps(this.ac, spot.dest, hootPlan(this.rand), { volume });
    this.started.owl = (this.started.owl ?? 0) + 1;
    return { name: 'owl', endAt: end, stop: () => {} };
  }

  /**
   * ART §9.3: the old sub-bass "Gloom rumble" is an airy swell now — band-passed pink noise (nothing under 80 Hz) with a
   * glock chime tail (CS-10 the Big Yawn rolls in; under the CS-09 charge). 2D on the world bus. The id stays 'rumble'.
   */
  rumble({ dur = 4, volume = 1 } = {}) {
    this._note('proc', 'rumble');
    if (!this.ready) return null;
    const sec = Math.max(0.5, Math.round(dur * 2) / 2);
    const buf = this._genBuf('breeze:' + sec, (sr, r) => breezeData(sr, r, sec));
    const p = playData(this.ac, this.bus.world, buf, { volume: volume * BREEZE.gain, filter: { type: 'bandpass', freq: BREEZE.freq, q: BREEZE.q } });
    const chime = this.glock('chime', { volume: volume * BREEZE.chimeVol, delay: sec * BREEZE.chimeAt, bus: 'world' });
    const h = { name: 'rumble', endAt: p.endAt, stop: (f) => { p.stop(f); chime?.stop(f); } };
    this.oneshots.add({ panner: null, endAt: p.endAt, stop: (f) => p.stop(f) });
    this.started.rumble = (this.started.rumble ?? 0) + 1;
    return h;
  }

  // =============================================================================================== Phase W: glock, rewards, beats
  /**
   * The baked glockenspiel (ART §9.3): `notes` = a phrase name (GLOCK_PHRASES: 'sticker', 'rescue', 'stillStanding',
   * 'card', 'friend', 'chime', 'roomRead'), a note ('E5') or a list of notes. One buffer source per note, outside the
   * voice pools (never steals a hit). 2D on the ui bus unless `bus` says otherwise.
   * @param {string|string[]} notes @param {{volume?: number, gap?: number, delay?: number, bus?: string}} [opts]
   * @returns {{name: string, notes: number, stop: (fade?: number) => void}|null}
   */
  glock(notes, { volume = 1, gap, delay = 0, bus = 'ui' } = {}) {
    this._note('proc', 'glock');
    if (!this.ready) return null;
    if (!this.glockBuf && this.ready) this.glockBuf = pcmBuffer(this.ac, this.baker.get('gen:glock'));
    const buf = this.glockBuf;
    if (!buf) return null;
    const plan = glockPlan(notes, { gap: gap ?? GLOCK.gap, volume });
    const t0 = this.ac.currentTime + Math.max(0, delay || 0), dest = this.bus[bus] ?? this.bus.ui, srcs = [];
    for (const n of plan) srcs.push(this._oneShot(buf, { when: t0 + n.t, rate: n.rate, gain: GLOCK.vol * n.gain, dest }));
    this.started.glock = (this.started.glock ?? 0) + plan.length;
    return { name: 'glock', notes: plan.length, stop: (fade = 0.1) => { const t = this.ac.currentTime + fade; for (const s of srcs) { try { s.stop(t); } catch { /* ended */ } } } };
  }

  /**
   * WA §5.4 reward sounds for ui/celebrate.js (one system, three sizes; the ui calls this when the item SHOWS, not when
   * it is queued). sticker: one glock note a third higher per sticker in a row (`row` 0, 1, 2 → C5, E5, G5);
   * card: a rising glock triad; friend: the long arpeggio + a pizzicato flourish.
   * @param {'sticker'|'card'|'friend'} kind @param {{row?: number, volume?: number}} [opts]
   */
  reward(kind, { row = 0, volume = 1 } = {}) {
    this._note('reward', kind);
    if (kind === 'sticker') return this.glock(stickerNote(row), { volume: 0.9 * volume });
    if (kind === 'friend') {
      const h = this.glock('friend', { volume });
      this.play2D('jingles/jingles_PIZZI06', { volume: 0.5 * volume, bus: 'ui', delay: 0.05 });
      return h;
    }
    return this.glock('card', { volume });
  }

  /**
   * AUTOCAM X24 room read: `arena:lock` plays a short sting while the camera reads the room — once per arena per visit,
   * not during a boss fight and not within ROOM_READ.afterCutscene s of a cutscene (the boss intro already said it).
   * @param {{id?: string}} [p]
   */
  roomRead({ id } = {}) {
    const key = `${this.levelId ?? ''}:${id ?? 'arena'}`;
    if (this._roomReads.has(key)) return null;
    this._roomReads.add(key);
    if (this.director.boss || this._mode === 'cutscene' || this.time - this._csEndAt < ROOM_READ.afterCutscene) return null;
    return this.cue('roomRead');
  }

  /** Kittens cheering (CS-07, CS-10): a scatter of mews and chirps around `at` over ~1.4 s. */
  kittenCheer(at = null, { volume = 1, count = 7 } = {}) {
    this._note('proc', 'kittenCheer');
    if (!this.ready) return null;
    const c = new THREE.Vector3();
    const has = at != null && this._posOf(at, c);
    const ids = ['cat/kitten_mew_01', 'cat/meow_baby_01', 'cat/cute_creature_0x'];
    const hs = [];
    for (let i = 0; i < Math.max(1, count | 0); i++) {
      const id = ids[Math.floor(this.rand() * ids.length) % ids.length];
      const o = { volume: 0.55 * volume, rate: 1.15 + this.rand() * 0.45, rateVar: 0, delay: this.rand() * 1.4 };
      if (has) hs.push(this.play3D(id, [c.x + (this.rand() - 0.5) * 6, c.y + 0.5, c.z + (this.rand() - 0.5) * 6], o));
      else hs.push(this.play2D(id, { ...o, bus: 'world' }));
    }
    return { name: 'kittenCheer', count: hs.length, stop: (f) => { for (const h of hs) h?.stop?.(f); } };
  }

  /** zzfx lub-dub heartbeat(s) (§16.3; Still Standing, low HP). */
  heartbeat({ beats = 1, bpm = HEART.bpm, volume = 1 } = {}) {
    this._note('heartbeat', 'heartbeat');
    if (!this.ready) return 0;
    const buf = this._zzBuf('heartThump');
    if (!buf) return 0;
    const t = this.ac.currentTime + 0.01;
    for (const b of heartbeatPlan(beats, bpm, volume)) this._oneShot(buf, { when: t + b.t, gain: b.gain * (SFX.heartThump.vol ?? 1), dest: this.bus.player });
    this.started.heartbeat = (this.started.heartbeat ?? 0) + beats;
    return beats;
  }

  /** Charge tier tone (§16.2 'chargeT1' / 'chargeT2'): replaces the previous tier's rising tone. */
  chargeTone(name) {
    this.endCharge(0.06);
    this._chargeH = this.play2D(name);
    return this._chargeH;
  }

  /** Fade out the rising charge tone (release swing, cancel, level change). */
  endCharge(fade = 0.12) {
    const h = this._chargeH;
    this._chargeH = null;
    if (h?.stop) h.stop(fade);
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
    let surf = surface;
    if (!FOOTSTEP[surf]) {                                    // emitter without a surface: ask the level where it stands
      const p = actor?.pos ?? position, lvl = this.ctx.levels?.current;
      if (p && typeof lvl?.surfaceAt === 'function') { try { surf = lvl.surfaceAt(p.x, p.z); } catch { surf = null; } }
    }
    const name = FOOTSTEP[surf] ?? FOOTSTEP[this.surface] ?? 'footGrass';
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
    this._note('babble', speakerKey(speaker));
    if (!this.ready || !plan.length || (v.mode !== 'laugh' && !v.pool.length)) return 0;
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
      if (!buf) { if (p) this._decode(p); buf = this._zzBuf('hyenaLaugh'); }
    } else {
      const p = this.resolve(v.pool[Math.floor(this.rand() * v.pool.length) % v.pool.length]);
      buf = p ? this.buffers.get(p) : null;
      if (!buf) { if (p) this._decode(p); buf = this._zzBuf('blip'); }
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
      time: +now.toFixed(3), buffers: this.buffers.size, zzfx: [...this.zz.keys()], glock: !!this.glockBuf,
      bake: { done: this.baker.done, baked: this.baker.pcm.size, total: this.baker.tasks.length },
      decodes: { inflight: this._inflight, queued: this._dq.length, urgent: this._dq.filter((j) => j.urgent).length },
      listener: Number.isFinite(this._lp.x) ? [+this._lp.x.toFixed(2), +this._lp.y.toFixed(2), +this._lp.z.toFixed(2)] : null,
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
      ambience: [...this.amb.keys()], objectives: [...this.objectives.values()].map((o) => ({ id: o.id, value: +o.value.toFixed(1), frozen: o.frozen, done: o.done })),
      holds: [...this.director.holds.keys()], explore: this.director.level?.explore ?? null, pending: this._pending.length,
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
