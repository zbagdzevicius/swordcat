// src/core/debug.js  (owner: core) — window.__GAME__ test hooks (tech.md §19.3 + GAME_DESIGN §19.8).
// Installed only with ?test or ?debug. ?debug also shows Stats + renderer.info + a lil-gui panel.
import * as THREE from 'three';
import { E } from './events.js';
import { KITTEN_IDS, MODEL_FIT, QUALITY } from './config.js';
import { measure, resolveFit } from './Assets.js';

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
    story: { play: (id) => ctx.story.play(id), flag: (k, v) => ctx.story.flag(k, v), skip: () => ctx.story.skip() },
    player: { setValor: (n) => ctx.player.setValor(n), setShards: (n) => { ctx.state.shards = n; }, setHp: (n) => { ctx.player.hp = n; } },
    cam: {
      mode: (m) => ctx.cam.mode(m),
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
    spawn: (type, x, z) => ctx.enemies.spawn(type, new THREE.Vector3(x, 0, z)),
    kittens: (n) => { ctx.state.kittens = KITTEN_IDS.slice(0, n); },
    objective: (id) => ctx.objectives.progress(id),
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
