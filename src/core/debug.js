// src/core/debug.js  (owner: core) — window.__GAME__ test hooks (tech.md §19.3 + GAME_DESIGN §19.8).
// Installed only with ?test or ?debug. ?debug also shows Stats + renderer.info + a lil-gui panel.
import * as THREE from 'three';
import { E } from './events.js';
import { KITTEN_IDS, MODEL_FIT, QUALITY } from './config.js';
import { measure, resolveFit } from './Assets.js';
import { uViewport } from './uniforms.js';
import { UBER_GROUPS } from './uber.js';
import * as IsoRig from '../camera/IsoRig.js';
import * as CutsceneCamera from '../camera/CutsceneCamera.js';

const RING = 200;            // §19.8
/** High-frequency names kept out of the name ring (still in lastEvent). */
const RING_SKIP = new Set([E.PROGRESS]);

/** @param {import('./Game.js').Game} game */
export function installDebug(game) {
  const ctx = game.ctx, params = game.params;
  if (!(params.test || params.debug)) return null;

  /** ring buffer (200) of emitted event names, for smoke assertions (same array object forever) */
  const events = [];
  /** last payload summary per event name (handy in smoke: lastEvent('cutscene:start').id) */
  const last = new Map();
  ctx.bus.tap((type, payload) => {
    last.set(type, summarize(payload));
    if (RING_SKIP.has(type)) return;
    events.push(type);
    if (events.length > RING) events.splice(0, events.length - RING);
  });

  const api = {
    ready: false,
    get frame() { return game.frameCount; },
    get levelId() { return ctx.levels?.current?.id; },
    get mode() { return game.mode; },
    game, ctx, E, THREE,

    state: () => {
      const p = ctx.player, info = ctx.renderer.info.render;
      return {
        player: p ? { pos: p.pos.toArray(), hp: p.hp, maxHp: p.maxHp, state: p.stateName, valor: p.valor, facing: p.facing, onGround: p.onGround } : null,
        enemies: ctx.enemies?.list?.length ?? 0,
        boss: ctx.enemies?.boss ? { id: ctx.enemies.boss.def?.id, hp: ctx.enemies.boss.hp, phase: ctx.enemies.boss.phase } : null,
        calls: ctx.postfx?.sceneStats.calls ?? info.calls, tris: ctx.postfx?.sceneStats.tris ?? info.triangles,
        frameCalls: info.calls, frameTris: info.triangles,
        mode: game.mode, levelId: ctx.levels?.current?.id ?? null, quality: ctx.postfx?.qualityName,
        dpr: ctx.renderer.getPixelRatio(), actors: ctx.actors.count, time: game.time,
      };
    },
    loadLevel: (id, spawn) => ctx.levels.load(id, spawn),
    teleport: (x, y, z) => ctx.player.teleport({ pos: new THREE.Vector3(x, y, z), facing: 0 }),
    god: (on = true) => { ctx.player.god = on; },
    skipDialog: () => (ctx.story.skipAll ? ctx.story.skipAll() : ctx.story.skip?.()),

    /**
     * Blank-screen check: render, then read the frame back in the same task (tech.md §19.3; one readPixels
     * of the whole buffer instead of 64 — each read is a GPU sync) and count distinct colours on an 8×8 grid.
     * Fail if < 4.
     */
    sampleCanvas() {
      game.frame(1, 0);
      const gl = ctx.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4), seen = new Set();
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < 64; i++) {
        const x = ((i % 8) + 0.5) * w / 8 | 0, y = ((i >> 3) + 0.5) * h / 8 | 0, o = (y * w + x) * 4;
        seen.add(`${px[o]},${px[o + 1]},${px[o + 2]},${px[o + 3]}`);
      }
      return seen.size;
    },

    // ---- §19.8 ----
    story: { play: (id) => ctx.story.play(id), flag: (k, v) => ctx.story.flag(k, v), skip: () => ctx.story.skip(), halt: () => (ctx.story.halt ? ctx.story.halt() : ctx.story.skip()) },
    player: { setValor: (n) => ctx.player.setValor(n), setShards: (n) => { ctx.state.shards = n; }, setHp: (n) => { ctx.player.hp = n; } },
    // ---- PERF §12 / IMPLEMENTATION_PLAN §5 (C1): perf(), .snapshot(), .reset(), .setScale(s) ----
    perf: makePerfHook(game),
    // ---- ART §11.1 (A:core.6): numeric look gates ----
    art: makeArtHooks(game),
    cam: {
      mode: (m) => ctx.cam.mode(m),
      // AUTOCAM §11 (M:core.5): the camera's probe trace and framing solution (camera owns them)
      probe: (...a) => ctx.cam.probe?.(...a) ?? null,
      framing: (...a) => ctx.cam.framing?.(...a) ?? null,
      // CONTROLS_SPEC §12 core 5: the live iso framing and the zoom
      iso: () => ctx.cam.iso?.() ?? null,
      zoom: (mul) => ctx.cam.zoom?.(mul),
      lock: (on = true) => ctx.cam.setCamLock?.(on, false),
    },
    // ---- CONTROLS_SPEC §12 core 5: iso-control hooks (world points go through the real pick path) ----
    /** World (x, z) → CSS px on the canvas ({x, y, on}), at the ground height there (or y when given). */
    screen: (x, z, y) => {
      const gy = Number.isFinite(y) ? y : ctx.physics.topAt?.(x, z) ?? ctx.physics.heightAt(x, z);
      return ctx.cam.worldToScreen?.({ x, y: gy, z }) ?? null;
    },
    /** A mouse click at world (x, z): 'right' = the move button (order), 'left' = attack / use. Through cam.pick. */
    click: (x, z, button = 'right', mods = {}) => {
      const s = api.screen(x, z, mods.y);
      if (!s) return null;
      const b = button === 'left' ? 0 : button === 'middle' ? 1 : 2;
      ctx.input._pointerAt?.(s.x, s.y, true);
      ctx.input._queueClick({ button: b, x: s.x, y: s.y, down: true, t: performance.now(), mods: { ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt } });
      ctx.input._queueClick({ button: b, x: s.x, y: s.y, down: false, t: performance.now(), mods: { ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt } });
      return { x: s.x, y: s.y };
    },
    /** A touch tap at world (x, z) (input.addTap → the player's tap orders). kind: tap | long | longEnd. */
    tapAt: (x, z, kind = 'tap') => {
      const s = api.screen(x, z);
      if (!s) return null;
      ctx.input.addTap(s.x, s.y, kind);
      return { x: s.x, y: s.y };
    },
    /** Point the mouse at world (x, z) (cursor aim; KBM). */
    aimAt: (x, z) => {
      const s = api.screen(x, z);
      if (!s) return null;
      ctx.input.setDevice?.('kbm');
      ctx.input._pointerAt?.(s.x, s.y, true);
      ctx.input.pointer.lastMoveT = performance.now();
      return { x: s.x, y: s.y };
    },
    /** Issue an order directly: kind + [x, z] / an actor id / an interactable id. */
    order: (kind, arg) => {
      let a = arg;
      if (Array.isArray(arg)) a = new THREE.Vector3(arg[0], ctx.physics.topAt?.(arg[0], arg[1]) ?? 0, arg[1]);
      else if (typeof arg === 'string') a = ctx.actors.get?.(arg) ?? ctx.levels.current?.interactables?.find?.((i) => i.id === arg) ?? null;
      return ctx.player.order(kind, a);
    },
    orders: () => { const o = ctx.player.orders; return { kind: o.kind, wp: o.wp, path: o.path.map((p) => [p.x, p.z, p.link ?? null]), partial: o.partial, engaged: o.engaged, hops: o.hops ?? 0, last: o.lastClear ?? null }; },
    /** The final fog factor at world (x, z) (§4.1). */
    fogAt: (x, z) => ctx.env.fogAt?.(x, z) ?? null,
    nav: {
      path: (ax, az, bx, bz) => { const r = ctx.physics.findPath?.({ x: ax, z: az }, { x: bx, z: bz }); return r ? { ok: r.ok, partial: r.partial, points: r.points.map((p) => [p.x, p.y, p.z, p.link ?? null]), expansions: r.expansions } : null; },
      walkable: (x, z) => ctx.physics.navWalkable?.(x, z),
      info: () => { const n = ctx.physics.nav; return n ? { nx: n.nx, nz: n.nz, filled: n.filled, sampled: n.sampled } : null; },
    },
    idle: (sec) => ctx.player.memeCamTrigger.fastForward(sec),
    boss: { setHpFrac: (f) => ctx.enemies.boss?.setHpFrac(f), phase: () => ctx.enemies.boss?.phase,
            freeShard: () => ctx.enemies.boss?.freeShard?.() },
    startBoss: () => ctx.levels.arenaNear(ctx.player.pos)?.lock(),
    /** camera/IsoRig.js pure helpers for smoke formulas (a build has no /src/ URLs to import). */
    isoRig: IsoRig,
    /** camera/CutsceneCamera.js pure helpers (headSphere, HEAD_CLEAR...) for smoke, same reason. */
    cutsceneCamera: CutsceneCamera,
    spawn: (type, x, z) => ctx.enemies.spawn(type, new THREE.Vector3(x, 0, z)),
    kittens: (n) => { ctx.state.kittens = KITTEN_IDS.slice(0, n); },
    objective: (id) => ctx.objectives.progress(id),
    /**
     * TOKENTAILS-PLAN §10.7 (G1): what a player can see of the guide, in CSS px: `{ phase, target: { id, kind, textKey }
     * | null, objective, prompt, prints: [{ sx, sy, lit, w }], edge: { sx, sy } | null, badge: { sx, sy } | null,
     * ring: { sx, sy } | null (fix round 2: the centre of the lit ring round an in-place lesson's object),
     * skipChip: { x, y, w, h } | null }` (ui/beacon.js snapshot; the onboarding bot reads nothing else). Dev and
     * build:test bundles only (this whole module is behind HOOKS_BUILD).
     */
    guide: () => ctx.ui?.beacon?.snapshot?.() ?? { phase: 'none', target: null, objective: '', prompt: '', prints: [], edge: null, badge: null, ring: null, skipChip: null },
    events,

    // ---- core extras (smoke helpers) ----
    /**
     * JSON-safe, cheap copy of a hook result. The smoke harness's `t.G` passes every result through it, so
     * hooks that return live objects (loadLevel → LevelData, spawn → Enemy, startBoss → Arena, cam.mode → camera)
     * don't drag the whole ctx graph (scene, asset cache, typed arrays) through page.evaluate (~1 s, page stalls).
     */
    plain: (v) => toPlain(v),
    lastEvent: (name) => last.get(name) ?? null,
    emitted: (name) => events.includes(name),
    clearEvents: () => { events.length = 0; last.clear(); },
    setMode: (m) => game.setMode(m),
    quality: (name) => ctx.postfx.setQuality(name).id,
    /** Resolves after `n` rendered frames. */
    waitFrames: (n = 1) => new Promise((resolve) => { const end = game.frameCount + n; const off = game.addFrameHook(() => { if (game.frameCount >= end) { off(); resolve(game.frameCount); } }); }),
    /** Load + fit a model and report its fitted extent vs. the MODEL_FIT target (R3: ±10%). */
    measureFit: async (path, fit) => {
      const m = await ctx.assets.model(path, fit != null ? { fit } : {});
      const f = resolveFit(path, fit);
      const exclude = f.hide;
      const box = measure(m.root, { exclude });
      const size = box.getSize(new THREE.Vector3());
      const ext = f.axis === 'max' ? Math.max(size.x, size.y, size.z) : size[f.axis];
      return { path, axis: f.axis, target: f.target, extent: ext, ratio: ext / f.target, size: size.toArray(), minY: box.min.y };
    },
    modelFitPaths: () => Object.keys(MODEL_FIT),
  };
  window.__GAME__ = api;
  if (params.debug) loadDebugUi(game).catch((e) => console.warn('[debug] ui failed', e));
  return api;
}

/**
 * `?perf` without ?test / ?debug: only `window.__GAME__.perf` (no event ring, no mutation hooks).
 * @param {import('./Game.js').Game} game
 */
export function installPerfOnly(game) {
  const api = { ready: false, perf: makePerfHook(game), get frame() { return game.frameCount; } };
  window.__GAME__ = api;
  return api;
}

/** `__GAME__.perf()` = the PERF §12 report; `.snapshot()`, `.reset()`, `.setScale(s)` (gate `perf:dynres-step`). */
function makePerfHook(game) {
  const ctx = game.ctx;
  const perf = () => game.perf.report();
  perf.snapshot = () => game.perf.snapshot();
  perf.reset = () => { game.perf.reset(); return true; };
  /** Force a render scale; returns the scale, the shared uViewport and the drawing buffer (same frame). */
  perf.setScale = (s) => {
    const scale = ctx.postfx.setScale(s);
    const gl = ctx.renderer.getContext();
    return { scale, dpr: ctx.renderer.getPixelRatio(), viewport: uViewport.value.toArray(), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
  };
  /** The uViewport / drawing-buffer pair right now. */
  perf.viewport = () => { const gl = ctx.renderer.getContext(); return { viewport: uViewport.value.toArray(), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] }; };
  return perf;
}

// ------------------------------------------------------------------ ART §11.1 numeric look hooks
const _p = new THREE.Vector3(), _bb = new THREE.Box3(), _c = new THREE.Color();

/** sRGB 0..1 → { luma (Rec. 709), chroma (max − min), warmth (R − B) } — the art2_frame_stats.py definitions. */
export function pixelStats(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return { luma: 0.2126 * r + 0.7152 * g + 0.0722 * b, chroma: max - min, warmth: r - b };
}

/** HSV saturation of a THREE.Color in sRGB (fog colour checks, WA §2.3a). */
export function hsvSat(color) {
  color.getRGB(_rgb, THREE.SRGBColorSpace);
  const max = Math.max(_rgb.r, _rgb.g, _rgb.b), min = Math.min(_rgb.r, _rgb.g, _rgb.b);
  return max > 0 ? (max - min) / max : 0;
}
const _rgb = { r: 0, g: 0, b: 0 };

function makeArtHooks(game) {
  const ctx = game.ctx;
  /** Render one frame and read the whole buffer back in the same task (sampleCanvas pattern). */
  const grab = () => {
    game.frame(1, 0);
    const gl = ctx.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px, w, h, dpr: w / Math.max(1, ctx.renderer.domElement.clientWidth || w) };
  };
  /** World point → drawing-buffer px (origin top-left), or null behind the camera. */
  const toPx = (v, w, h) => {
    _p.copy(v).project(ctx.camera);
    if (_p.z > 1 || _p.z < -1) return null;
    return { x: (_p.x * 0.5 + 0.5) * w, y: (0.5 - _p.y * 0.5) * h };
  };
  /** Screen-space px box of a world Box3. */
  const boxPx = (box, w, h) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
    for (let i = 0; i < 8; i++) {
      _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const s = toPx(_p, w, h);
      if (!s) continue;
      any = true; x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
    }
    return any ? { x0, y0, x1, y1 } : null;
  };
  const actorBox = (a, out) => out.set(_p.set(a.pos.x - a.radius, a.pos.y, a.pos.z - a.radius), new THREE.Vector3(a.pos.x + a.radius, a.pos.y + (a.height ?? 1), a.pos.z + a.radius));
  const sample = (px, w, x, y) => {
    const o = ((Math.min(Math.max(0, y | 0), (px.length / 4 / w) - 1)) * w + Math.min(Math.max(0, x | 0), w - 1)) * 4;
    return [px[o] / 255, px[o + 1] / 255, px[o + 2] / 255];
  };
  const art = {
    /**
     * Mean luma / chroma / warmth and dark (< 0.2) / black (< 0.06) fractions over a 64 × 36 grid (ART G1–G5,
     * WA §2.3a). `exclude: 'actors'` skips cells within 40 CSS px of any actor's projected bounds.
     * @param {{exclude?: 'actors'|null, cols?: number, rows?: number}} [opts]
     */
    frameStats: ({ exclude = null, cols = 64, rows = 36 } = {}) => {
      const { px, w, h, dpr } = grab();
      const boxes = [];
      if (exclude === 'actors') {
        const pad = 40 * dpr;
        for (const a of ctx.actors.list) {
          if (!a.object3d?.visible || !a.pos) continue;
          const b = boxPx(actorBox(a, _bb), w, h);
          if (b) boxes.push({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad });
        }
      }
      let n = 0, L = 0, C = 0, W = 0, dark = 0, black = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * w / cols, yTop = (j + 0.5) * h / rows;
        let skip = false;
        for (const b of boxes) if (x >= b.x0 && x <= b.x1 && yTop >= b.y0 && yTop <= b.y1) { skip = true; break; }
        if (skip) continue;
        const [r, g, bl] = sample(px, w, x, h - 1 - yTop);
        const s = pixelStats(r, g, bl);
        n++; L += s.luma; C += s.chroma; W += s.warmth;
        if (s.luma < 0.2) dark++;
        if (s.luma < 0.06) black++;
      }
      const fog = ctx.scene.fog?.color ?? (ctx.scene.background?.isColor ? ctx.scene.background : null);
      return { n, luma: n ? L / n : 0, chroma: n ? C / n : 0, warmth: n ? W / n : 0, dark: n ? dark / n : 0, black: n ? black / n : 0,
        fogSat: fog ? hsvSat(_c.copy(fog)) : null, preset: ctx.env?.presetName ?? ctx.env?.preset ?? null, excluded: boxes.length };
    },
    /** ART G8: mean chroma inside her projected box vs a 1.5–3 m ground ring around her feet. */
    heroChroma: () => {
      const p = ctx.player;
      if (!p) return null;
      const { px, w, h } = grab();
      const b = boxPx(actorBox(p, _bb), w, h);
      let hc = 0, hn = 0, gc = 0, gn = 0;
      if (b) {
        const sx = Math.max(1, (b.x1 - b.x0) / 12), sy = Math.max(1, (b.y1 - b.y0) / 12);
        for (let y = b.y0; y <= b.y1; y += sy) for (let x = b.x0; x <= b.x1; x += sx) {
          const [r, g, bl] = sample(px, w, x, h - 1 - y); hc += pixelStats(r, g, bl).chroma; hn++;
        }
      }
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2, rr = 1.5 + (k % 4) * 0.5;
        _p.set(p.pos.x + Math.cos(a) * rr, p.pos.y, p.pos.z + Math.sin(a) * rr);
        const s = toPx(_p, w, h);
        if (!s || s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) continue;
        if (b && s.x >= b.x0 && s.x <= b.x1 && s.y >= b.y0 && s.y <= b.y1) continue;
        const [r, g, bl] = sample(px, w, s.x, h - 1 - s.y); gc += pixelStats(r, g, bl).chroma; gn++;
      }
      return { hero: hn ? hc / hn : 0, ground: gn ? gc / gn : 0, heroN: hn, groundN: gn };
    },
    /**
     * Projected size (CSS px) of a hero feature ('eyeL' | 'eyeR' | 'bow') from `debugFeatures()`, or an enemy's 'top'
     * (pass the enemy actor or its index in ctx.enemies.list).
     */
    featurePx: (name, who = null) => {
      const actor = who == null ? ctx.player : typeof who === 'number' ? ctx.enemies?.list?.[who] : who;
      const f = actor?.debugFeatures?.() ?? actor?.view?.debugFeatures?.() ?? actor?.visual?.debugFeatures?.() ?? null;
      const o = f?.[name];
      if (!o?.isObject3D) return null;
      ctx.camera.updateMatrixWorld(); o.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(o, true);
      const cw = ctx.renderer.domElement.clientWidth || 1, ch = ctx.renderer.domElement.clientHeight || 1;
      const b = boxPx(box, cw, ch);
      return b ? { w: b.x1 - b.x0, h: b.y1 - b.y0 } : null;
    },
    /** ART G6: luma(shade) / luma(lit) at the level's `art.shadowProbe` ({ lit: [x, z], shade: [x, z] }). */
    shadowRatio: () => {
      const L = ctx.levels?.current;
      const probe = L?.art?.shadowProbe ?? L?.def?.art?.shadowProbe ?? null;
      if (!probe) return null;
      const { px, w, h } = grab();
      const lumaAt = ([x, z]) => {
        _p.set(x, ctx.physics?.heightAt?.(x, z) ?? 0, z);
        const s = toPx(_p, w, h);
        if (!s) return null;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const [r, g, b] = sample(px, w, s.x + dx * 2, h - 1 - s.y + dy * 2); sum += pixelStats(r, g, b).luma; }
        return sum / 9;
      };
      const lit = lumaAt(probe.lit), shade = lumaAt(probe.shade);
      return lit && shade != null ? shade / lit : null;
    },
    /** ART G13: is a post chain rendering this frame? */
    get composerActive() { return !!ctx.postfx?.composerActive; },
    /** ART G11: the linked programs (name + cache key + users). */
    programs: () => (ctx.renderer.info.programs ?? []).map((p) => ({ name: p.name, key: p.cacheKey?.slice?.(0, 120) ?? null, used: p.usedTimes })),
    /** PERF §1.2: the linked uber programs (modules, register use, late registrations). */
    uber: () => [...UBER_GROUPS].map((g) => g.info()),
  };
  return art;
}

const PLAIN_MAX_DEPTH = 6, PLAIN_MAX_ITEMS = 200;

/** Small summary of an Actor (player, enemy, companion, NPC, Pudding). */
function actorSummary(a) {
  return { $actor: a.constructor?.name ?? 'Actor', id: a.id, actorId: a.actorId ?? null, type: a.def?.id ?? a.kittenId ?? a.npcId ?? null,
    faction: a.faction, tags: a.tags ? [...a.tags] : [], hp: a.hp, maxHp: a.maxHp, alive: a.alive, stateName: a.stateName ?? null,
    pos: a.pos?.toArray?.() ?? null, facing: a.facing };
}

/**
 * Convert any value to plain JSON-safe data: primitives pass, vectors become arrays, actors / Object3Ds / typed
 * arrays / systems (anything holding `ctx`) become small summaries, plain objects and arrays recurse (depth 6,
 * 200 items), functions are dropped and repeated references become '[seen]'.
 */
function toPlain(v, depth = 0, seen = new Set()) {
  if (v === undefined || v === null) return v;
  const t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (t === 'bigint') return Number(v);
  if (t !== 'object') return undefined;                                   // functions, symbols
  if (v.isVector2 || v.isVector3 || v.isVector4 || v.isQuaternion || v.isEuler) return v.toArray();
  if (v.isColor) return '#' + v.getHexString();
  if (ArrayBuffer.isView(v)) return { $typedArray: v.constructor?.name, length: v.length };
  if (v instanceof ArrayBuffer) return { $arrayBuffer: v.byteLength };
  if (typeof Node !== 'undefined' && v instanceof Node) return { $dom: v.nodeName, id: v.id || undefined };
  if (v.object3d?.isObject3D && v.pos?.isVector3) return actorSummary(v);
  if (v.isObject3D) return { $object3d: v.type, name: v.name, children: v.children.length, visible: v.visible };
  if (v.isMaterial || v.isBufferGeometry || v.isTexture) return { $three: v.type, name: v.name };
  if (seen.has(v)) return '[seen]';
  if (depth >= PLAIN_MAX_DEPTH) return '[…]';
  seen.add(v);
  if (Array.isArray(v)) return v.slice(0, PLAIN_MAX_ITEMS).map((x) => toPlain(x, depth + 1, seen));
  if (v instanceof Set) return [...v].slice(0, PLAIN_MAX_ITEMS).map((x) => toPlain(x, depth + 1, seen));
  if (v instanceof Map) {
    const o = {};
    for (const [k, x] of [...v].slice(0, PLAIN_MAX_ITEMS)) o[String(k)] = toPlain(x, depth + 1, seen);
    return o;
  }
  const proto = Object.getPrototypeOf(v), out = {};
  if (proto && proto !== Object.prototype) out.$class = v.constructor?.name ?? 'Object';
  let n = 0;
  for (const k of Object.keys(v)) {
    if (k === 'ctx' || k.startsWith('_')) continue;
    if (++n > PLAIN_MAX_ITEMS) break;
    const x = toPlain(v[k], depth + 1, seen);
    if (x !== undefined) out[k] = x;
  }
  return out;
}

function summarize(p) {
  if (!p || typeof p !== 'object') return p ?? null;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (v == null || typeof v !== 'object') out[k] = v;
    else if (v.isVector3) out[k] = v.toArray();
    else if (Array.isArray(v)) out[k] = v.length;
    else if (typeof v.id !== 'undefined') out[k] = v.id;
  }
  return out;
}

/** ?debug: Stats + renderer.info + lil-gui (tech.md §18 debug overlay). */
async function loadDebugUi(game) {
  const ctx = game.ctx;
  const [{ default: Stats }, { GUI }] = await Promise.all([
    import('three/addons/libs/stats.module.js'),
    import('three/addons/libs/lil-gui.module.min.js'),
  ]);
  const stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;left:0;top:0;z-index:100;';
  document.body.appendChild(stats.dom);
  const info = document.createElement('div');
  info.style.cssText = 'position:fixed;left:0;top:48px;z-index:100;font:11px/1.3 monospace;color:#fff;background:#0008;padding:3px 6px;pointer-events:none;white-space:pre;';
  document.body.appendChild(info);
  let t = 0;
  game.addFrameHook((frameDt) => {
    stats.update();
    t += frameDt;
    if (t < 0.25) return;
    t = 0;
    const r = ctx.renderer.info;
    info.textContent = `calls ${r.render.calls}  tris ${r.render.triangles}\ngeo ${r.memory.geometries}  tex ${r.memory.textures}\n` +
      `mode ${game.mode}  q ${ctx.postfx.qualityName}  dpr ${ctx.renderer.getPixelRatio().toFixed(2)}\nlevel ${ctx.levels?.current?.id ?? '-'}  actors ${ctx.actors.count}`;
  });
  const gui = new GUI({ title: 'Swordcat debug' });
  const o = { quality: ctx.postfx.qualityName, timeScale: 1, god: false, mode: game.mode, bloom: ctx.postfx.bloomBase.strength };
  gui.add(o, 'quality', Object.keys(QUALITY)).onChange((v) => ctx.postfx.setQuality(v));
  gui.add(o, 'timeScale', 0.05, 2, 0.05).onChange((v) => { game.loop.timeScale = v; });
  gui.add(o, 'god').onChange((v) => { if (ctx.player) ctx.player.god = v; });
  gui.add(o, 'mode', ['play', 'dialog', 'cutscene', 'menu', 'memecam']).onChange((v) => game.setMode(v));
  gui.add(o, 'bloom', 0, 3, 0.05).onChange((v) => { ctx.postfx.bloomBase.strength = v; ctx.postfx.resetBloom(); });
  gui.close();
}
