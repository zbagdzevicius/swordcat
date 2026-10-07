# Swordcat: Technical Architecture (three.js browser action-adventure)

Status: research and recommendation, 2026-10-07. Labels used below:
**[measured]** means verified on this machine (Win10, i7-1255U, Intel Iris Xe iGPU, 64 GB, Node 22.12.0, npm 10.9.0).
**[docs]** means taken from the three.js source, docs, or the migration guide.
**[rec]** means a design recommendation. **[unverified]** means it has not been checked here.

---

## 1. TL;DR stack

| Concern | Choice | Version (npm, checked 2026-10-07) |
|---|---|---|
| Renderer | `three` with **WebGLRenderer** (WebGL2) | **0.186.1** (r186, published 2026-09-24) |
| Bundler / dev server | `vite` | **8.3.3** (Rolldown-based; needs Node `^20.19 \|\| >=22.12`, so the local 22.12.0 qualifies) |
| Language | Plain **JavaScript ES2022 modules**, with JSDoc on public interfaces. No TypeScript (see §3). | n/a |
| Physics / collision | **Custom kinematic**: heightfield, XZ circle/box colliders, and three's `Octree` + `Capsule` addons for architecture. No physics engine. | built into three |
| Animation | `AnimationMixer` for GLB creatures; **procedural** rig for Swordcat and kittens | built into three |
| Post FX | three addons: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` (plus optional `FXAAPass`) | built into three |
| Audio | `THREE.AudioListener` / `Audio` / `PositionalAudio` (Web Audio). Optional `zzfx` for procedural SFX. | `zzfx` **1.4.0** (MIT) |
| UI | HTML/CSS overlay; no framework | n/a |
| Save | `localStorage`, versioned JSON | n/a |
| Touch | Custom pointer-events virtual joystick, about 120 lines (nipplejs is not needed) | n/a |
| Model compression | **meshopt** (`MeshoptDecoder` ships in three). DRACO is supported as a fallback. | `@gltf-transform/cli` **4.2.3** (via npx, optional) |
| Debug | `three/addons/libs/lil-gui.module.min.js`, `three/addons/libs/stats.module.js` | ship with three |
| Tests | `node --test` for pure logic; **Playwright** (library) smoke test run against `vite preview` | `playwright` **1.63.0** (pin exact) |

Packages that were considered and not chosen:
- `@dimforge/rapier3d-compat` 0.21.0. Excellent, but more than this game needs (§5).
- `cannon-es` 0.20.0. Last published 2022-08, so effectively unmaintained.
- `postprocessing` 6.39.5. Its peer range is `three >=0.168 <0.187`, so a three bump would break it. Merged passes aren't needed at this effect count.
- `yuka` 0.7.8. Last published 2022.
- `nipplejs` 1.0.4. Fine, but unnecessary.
- `three-mesh-bvh` 0.9.15. Optional, only if Octree raycasts profile slow.

### package.json [rec]
```json
{
  "name": "swordcat",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "test:unit": "node --test \"tests/unit/**/*.test.js\"",
    "smoke": "node tests/smoke.mjs",
    "check": "npm run build && npm run test:unit && npm run smoke"
  },
  "dependencies": { "three": "0.186.1", "zzfx": "1.4.0" },
  "devDependencies": { "vite": "8.3.3", "playwright": "1.63.0" }
}
```
`node --test "glob"` works on Node 22 and can import `three` math in Node **[measured]**.

### vite.config.js [rec]
```js
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',                       // relative paths, so the dist/ build works from any static host or subfolder
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  server: { port: 5173 },
});
```
Vite 8 renamed `build.rollupOptions` to `build.rolldownOptions` and `esbuild` to `oxc`; a compatibility layer converts the old names automatically **[docs: vite.dev/blog/announcing-vite8]**. A trivial three.js app built in 0.22 s **[measured]**.

### three r180 to r186 gotchas for agents [docs: migration guide]
- `THREE.Clock` is **deprecated**. Use `THREE.Timer` (now in core): `timer.connect(document)`, then `timer.update(ts)`, `getDelta()`, `getElapsed()`, and `setTimescale()`.
- `PCFSoftShadowMap` is deprecated for WebGLRenderer (r182). Use `PCFShadowMap`, which is now soft.
- `RGBELoader` was renamed `HDRLoader` (r180).
- `CapsuleGeometry(radius, height, capSegments, radialSegments, heightSegments)`. The second parameter is `height` (renamed from `length` in r176).
- `DRACOLoader.setDecoderConfig()` is deprecated (r185).
- `Object3D.dispose()` exists since r186. It only fires an event; geometries, materials and textures must still be disposed manually.
- In WebGPU land, `PostProcessing` was renamed `RenderPipeline` (r183). That is irrelevant here because the project uses WebGLRenderer.
- Import addons as `three/addons/...` (package export maps `./addons/*` to `./examples/jsm/*`).

**Why WebGLRenderer and not WebGPURenderer [rec]:**
- Custom shaders (grass wind, toon tweaks) rely on `onBeforeCompile`/GLSL. WebGPURenderer requires TSL node materials, whose API has been renamed in nearly every release from r168 to r186.
- `EffectComposer` and all the examples and agent knowledge are WebGL-based.
- WebGL2 works in headless Chromium here **[measured]**.

---

## 2. Conventions every agent must follow [rec]
- **Units**: 1 unit = 1 m. **+Y up**. Model forward is **+Z**.
- **Yaw**: `facing = Math.atan2(dir.x, dir.z)`. To apply it: `object.rotation.y = facing`.
- **Angles relative to facing**: positive values point to the character's **left** (toward +X when facing +Z).
- **Scale**: Swordcat is about **1.0 m** tall, a chibi with the head at roughly 45% of her height. Her collision capsule is r=0.32, h=1.0. The sword is about 1.1 m, longer than she is, as in ref1.
  Small enemies are 0.5 to 0.8 m, medium 1.2 to 1.6 m, bosses 3 to 4 m.
- **Fixed simulation step**: 1/60 s. All gameplay mutates only in `update(dt)`. Visual-only work happens in `render(alpha, frameDt)`.
- **No allocations in per-frame or per-step code.** Use module-level temporaries (`const _v = new Vector3()`).
- **No DOM or WebGL access at module top level.** This lets `node --test` import any module.
- **No `Math.random()` in gameplay.** Use `ctx.rng` (seeded mulberry32; `?seed=N`) so tests are reproducible. Pure visual jitter may use `Math.random()`.
- Modules communicate through **`ctx` services** (direct calls for queries) and the **event bus** (for "something happened" notifications). Never import another agent's module internals.
- **Asset URLs** must be built from `import.meta.env.BASE_URL + 'assets/...'`. Files live in `public/assets/**`.
- Each module's `dispose()` must remove its scene objects, listeners and DOM nodes.

---

## 3. JS vs TypeScript [rec: JavaScript + JSDoc]

Parallel-agent safety comes from **file ownership**, **frozen contracts** (`events.js`, the `ctx` shape, the `Actor` base) and a **runtime smoke test**. It does not come from the type checker:
- Vite does not type-check. A TS gate would need `tsc --noEmit` plus `@types/three` (0.186.0, a separate package that lags three). One agent's type error would then block every other agent's check.
- The game is about 8 to 15k LOC of fairly flat game code. JSDoc `@typedef`/`@param` on public APIs gives editor hints without a gate. Agents may add `// @ts-check` to their own files voluntarily.
- A **contract unit test** (`tests/unit/contracts.test.js`) imports each module and asserts its exports and method names. It catches interface drift faster than types would.

---

## 4. Folder / module architecture

```
index.html                 # canvas host + #ui root + #touch root, viewport meta (no zoom)
vite.config.js
public/
  assets/models/*.glb      # meshopt-compressed GLBs (gltf-transform)
  assets/audio/*.ogg|mp3   # music + sfx (mp3 for Safari safety)
  assets/textures/*        # small PNG/WebP, power of two
  draco/                   # ONLY if DRACO GLBs are used: copy of three/examples/jsm/libs/draco/gltf/*
src/
  main.js                  # boot: new Game(document.body).start()            [owner: core]
  core/                                                                        [owner: core/integrator]
    Game.js                # creates renderer/scene/camera/ctx, system order, hitstop, pause
    Loop.js                # fixed-timestep loop (Timer + accumulator)
    EventBus.js            # on/off/once/emit
    events.js              # FROZEN catalog of event names + payload JSDoc
    config.js              # tunables (speeds, gravity, quality presets)
    Input.js               # keyboard/mouse/gamepad + touch feed -> actions
    Assets.js              # GLTF/texture/audio cache + loading progress
    Actor.js               # base class for player/enemies/companions (shared fields)
    ActorRegistry.js       # add/remove/query by radius & faction (spatial hash)
    GameState.js           # flags, inventory, rescued kittens, hp etc. (serializable)
    PostFX.js              # composer, bloom, quality switching, resize
    rng.js, math.js        # mulberry32, damp, clamp, wrapAngle, lerpAngle, easings
    debug.js               # ?debug=1 -> lil-gui + stats; window.__GAME__ test hooks
  physics/                                                                     [owner: physics]
    Physics.js             # setLevel(), moveActor(), separateActors(), raycast(), groundAt()
    Heightfield.js
    StaticColliders.js     # circles/boxes in XZ spatial hash
  camera/                                                                      [owner: camera]
    FollowCamera.js        # orbit + spring arm + lock-on + shake
    CameraShake.js
  player/                                                                      [owner: player]
    Player.js              # Actor subclass, state machine, uses combat service
    PlayerStates.js        # idle/run/jump/fall/dodge/attack/charge/holy/hurt/dead
    SwordcatModel.js       # procedural mesh (or GLB) + procedural animation rig
  combat/                                                                      [owner: combat]
    Combat.js              # sweeps, applyHit, i-frames, knockback, hitstop/shake requests, projectiles
    attacks.js             # data tables (player + enemy attacks)
    AttackTokens.js        # limits simultaneous enemy attackers
  enemies/                                                                     [owner: enemies]
    EnemyManager.js        # spawns from level spawn lists, update, pooling
    Enemy.js               # FSM base (idle/patrol/chase/windup/strike/recover/stagger/die)
    types/*.js             # one file per enemy type (data + overrides)
  companions/                                                                  [owner: companions]
    Companion.js           # follower/helper kitten AI
    KittenModel.js         # procedural kitten variants (colors, accessories)
  world/                                                                       [owner: world]
    LevelManager.js        # load/unload, dynamic import per level, triggers
    levels/<id>.js         # build(ctx) -> LevelData
    Terrain.js  Grass.js  Props.js  Sky.js  Water.js
  fx/                                                                          [owner: fx]
    Particles.js           # pooled instanced sprites (sparkles, dust, hit stars)
    SwordTrail.js          # ribbon
    DamageNumbers.js       # DOM or sprite pool
  audio/                                                                       [owner: audio]
    AudioManager.js        # unlock, buffers, 2D/3D pools, music crossfade, bus listeners
    sfxDefs.js             # zzfx parameter arrays
  story/                                                                       [owner: story]
    StoryManager.js        # quests, flags, cutscene steps, dialog driver
    dialogue/*.js          # data-only scripts
    quests.js
  ui/                                                                          [owner: ui]
    UI.js  hud.js  dialog.js  menus.js  touch.js  ui.css
  save/                                                                        [owner: save]
    SaveManager.js
tests/
  unit/*.test.js           # node --test (pure logic: combat math, FSM, save migration, heightfield)
  smoke.mjs                # Playwright headless run + screenshots -> tests/shots/
```

### 4.1 The `ctx` service object (FROZEN shape; core creates it)
```js
/** @typedef {object} Ctx
 * @property {import('./Game.js').Game} game
 * @property {import('./EventBus.js').EventBus} bus
 * @property {object} config               // core/config.js
 * @property {THREE.WebGLRenderer} renderer
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {Input} input
 * @property {Assets} assets
 * @property {ActorRegistry} actors
 * @property {GameState} state
 * @property {() => number} rng            // seeded [0,1)
 * @property {Physics} physics
 * @property {Combat} combat
 * @property {FollowCamera} cam
 * @property {Player|null} player
 * @property {EnemyManager} enemies
 * @property {CompanionManager} companions
 * @property {LevelManager} levels
 * @property {FX} fx
 * @property {AudioManager} audio
 * @property {StoryManager} story
 * @property {UI} ui
 * @property {SaveManager} save
 */
```

### 4.2 System contract (every manager or system implements this)
```js
export class SomeSystem {
  constructor(ctx) { this.ctx = ctx; }       // no heavy work, no awaits
  async init() {}                            // load assets, subscribe to bus, build DOM
  update(dt) {}                              // fixed step (1/60), gameplay only
  render(alpha, frameDt) {}                  // per rendered frame, visuals only
  dispose() {}
}
```
**System order** (owned by `Game.js`):
input → story → player → companions → enemies → combat → physics.separate → levels(triggers) → fx.
After that, per frame: camera → fx.render → ui → audio.

### 4.3 Actor base (FROZEN; core owns it)
```js
import * as THREE from 'three';
let nextId = 1;
export class Actor {
  constructor(ctx, { faction = 'neutral', radius = 0.35, height = 1, maxHp = 3, mass = 1, maxPoise = 1 } = {}) {
    this.ctx = ctx; this.id = nextId++; this.faction = faction;   // 'player' | 'enemy' | 'ally' | 'neutral'
    this.object3d = new THREE.Group();                // visual root; position is interpolated in render()
    this.pos = new THREE.Vector3(); this.prevPos = new THREE.Vector3();   // feet position (sim)
    this.vel = new THREE.Vector3(); this.facing = 0; this.prevFacing = 0;
    this.radius = radius; this.height = height; this.mass = mass;
    this.hp = maxHp; this.maxHp = maxHp; this.poise = maxPoise; this.maxPoise = maxPoise;
    this.invulnT = 0; this.staggerT = 0; this.onGround = false; this.alive = true;
    this.hurtable = true;                             // false while dead/cutscene
  }
  beginStep() { this.prevPos.copy(this.pos); this.prevFacing = this.facing; }   // subclasses tick invulnT/staggerT in update(dt)
  /** Called by Combat.applyHit after damage/knockback were applied. */
  onHit(hit) {}
  onDeath(hit) {}
  render(alpha) {
    this.object3d.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.object3d.rotation.y = lerpAngle(this.prevFacing, this.facing, alpha);
  }
  dispose() { this.object3d.removeFromParent(); }
}
```

### 4.4 Event bus + frozen catalog
```js
// core/EventBus.js
import { KNOWN } from './events.js';
export class EventBus {
  #m = new Map();
  on(type, fn) { let s = this.#m.get(type); if (!s) this.#m.set(type, (s = new Set())); s.add(fn); return () => s.delete(fn); }
  once(type, fn) { const off = this.on(type, (p) => { off(); fn(p); }); return off; }
  off(type, fn) { this.#m.get(type)?.delete(fn); }
  emit(type, payload) {
    if (!KNOWN.has(type)) console.warn(`[bus] unknown event "${type}"`);
    const s = this.#m.get(type); if (!s) return;
    for (const fn of [...s]) { try { fn(payload); } catch (e) { console.error(`[bus] handler for ${type} threw`, e); } }
  }
}
```
```js
// core/events.js (core agent owns it; other agents REQUEST additions, never rename)
export const E = Object.freeze({
  GAME_READY: 'game:ready',            // {}
  GAME_PAUSE: 'game:pause',            // { paused }
  LEVEL_LOADING: 'level:loading',      // { id }
  LEVEL_LOADED: 'level:loaded',        // { id, level }
  LEVEL_UNLOAD: 'level:unload',        // { id }
  LEVEL_EXIT: 'level:exit',            // { to, spawnId }  (trigger reached)
  CHECKPOINT: 'checkpoint',            // { levelId, spawnId }
  PLAYER_SPAWNED: 'player:spawned',    // { player }
  PLAYER_DAMAGED: 'player:damaged',    // { amount, hp, maxHp, source }
  PLAYER_HEALED: 'player:healed',      // { amount, hp, maxHp }
  PLAYER_DIED: 'player:died',          // {}
  PLAYER_SWING: 'player:swing',        // { attackId, combo }
  PLAYER_CHARGE: 'player:charge',      // { level }  0..1, emitted on change of tier
  PLAYER_HOLY: 'player:holy',          // { position, dir }
  PLAYER_DODGE: 'player:dodge',        // {}
  PLAYER_JUMP: 'player:jump',          // {}
  PLAYER_LAND: 'player:land',          // { impact }
  FOOTSTEP: 'actor:footstep',          // { actor, position, surface }
  HIT: 'combat:hit',                   // { attacker, target, attackId, damage, position, dir, killed, blocked }
  ENEMY_SPAWNED: 'enemy:spawned',      // { enemy }
  ENEMY_ALERTED: 'enemy:alerted',      // { enemy }
  ENEMY_DIED: 'enemy:died',            // { enemy, type, position }
  BOSS_PHASE: 'boss:phase',            // { boss, phase }
  INTERACT_AVAILABLE: 'interact:available', // { target, prompt }
  INTERACT_CLEAR: 'interact:clear',    // {}
  INTERACT: 'interact',                // { target }
  ITEM_PICKUP: 'item:pickup',          // { item, amount, position }
  KITTEN_RESCUED: 'kitten:rescued',    // { kittenId }
  DIALOG_START: 'dialog:start',        // { id }
  DIALOG_LINE: 'dialog:line',          // { speaker, text, portrait, choices? }
  DIALOG_END: 'dialog:end',            // { id }
  QUEST_UPDATE: 'quest:update',        // { questId, state, text }
  FLAG_SET: 'story:flag',              // { key, value }
  TOAST: 'ui:toast',                   // { text, icon? }
  MUSIC: 'audio:music',                // { track, fade }
  SHAKE: 'fx:shake',                   // { trauma }
  HITSTOP: 'fx:hitstop',               // { seconds }
  BURST: 'fx:burst',                   // { kind, position, color?, count? }
  SAVE_REQUEST: 'save:request',        // {}
  SAVE_LOADED: 'save:loaded',          // { data }
  PROGRESS: 'ui:progress',             // { n, total }  asset loading
});
export const KNOWN = new Set(Object.values(E));
```
Rule: **events notify, services decide.**
- Combat applies damage itself, then emits `HIT`. Audio, FX, UI and story only *react*.
- Queries go through services, for example `ctx.physics.raycast()` or `ctx.actors.query()`.

---

## 5. Physics choice [rec: custom kinematic collision; no engine]

**What the game needs:**
- One player and up to about 20 enemies or companions, all **kinematic characters**.
- Terrain and static props.
- A few doors and moving platforms.
- No stacking, ragdolls or vehicles.

| Option | Pros | Cons for this scope |
|---|---|---|
| **Custom**: heightfield + XZ colliders + three `Octree`/`Capsule` | Zero deps. Exact ground height in O(1). Proven in the three `games_fps` example **[docs]**. Fully deterministic and debuggable. Every agent can read it. | You write roughly 300 lines (slopes, step-up, separation). |
| `@dimforge/rapier3d-compat` 0.21.0 | Fast WASM. Has a KinematicCharacterController. Deterministic. | Async WASM init. The package is 15 MB unpacked, with WASM inlined as base64 (bundle cost is likely >1 MB **[unverified]**). It adds a second scene graph to sync. Overkill for kinematic characters. |
| `cannon-es` 0.20.0 | Pure JS | Unmaintained since 2022-08. Its dynamic-body character controllers feel floaty. |

**Design:**
1. **Ground**: a `Heightfield` (Float32Array grid with bilinear `heightAt`). The *same* data builds the terrain mesh, so the visuals and the collision always match.
2. **Static props** (trees, rocks, pillars, crates, fences): XZ **circles and boxes** with y-ranges, stored in a spatial hash (cell 4 m).
3. **Architecture** (castle walls, bridges, stairs, ramps, interiors): meshes tagged `userData.collide = true` go into a three **`Octree`**.
   Characters resolve against it with `octree.capsuleIntersect(capsule)`, which returns `{normal, depth}` or `false`. The camera uses `octree.rayIntersect(ray)`, which returns `{distance, triangle, position}` or `false` **[docs: Octree.js r186]**.
   Call `fromGraphNode()` once per level load, never per frame.
4. **Actor vs actor**: mass-weighted XZ circle separation (O(n²) is fine for n < 40).
5. **Triggers**: plain spheres or boxes checked against the player position (`LevelManager`).

```js
// physics/Heightfield.js
import * as THREE from 'three';
export class Heightfield {
  /** size: world meters (centered on origin), res: cells per side, h: Float32Array((res+1)^2), row-major, row 0 at z=-size/2 */
  constructor(size, res, h) { Object.assign(this, { size, res, h, cell: size / res, half: size / 2 }); }
  heightAt(x, z) {
    const r = this.res, w = r + 1, h = this.h;
    const gx = Math.min(Math.max((x + this.half) / this.cell, 0), r - 1e-4);
    const gz = Math.min(Math.max((z + this.half) / this.cell, 0), r - 1e-4);
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * w + ix;
    return (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fz) + (h[i + w] * (1 - fx) + h[i + w + 1] * fx) * fz;
  }
  normalAt(x, z, out) {
    const e = this.cell;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }
  /** Matching render mesh: PlaneGeometry vertex order == heightfield order after rotateX(-PI/2). */
  toGeometry() {
    const g = new THREE.PlaneGeometry(this.size, this.size, this.res, this.res); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, this.h[i]);
    g.computeVertexNormals(); return g;
  }
}
```
```js
// physics/Physics.js (core of moveActor)
import { Capsule } from 'three/addons/math/Capsule.js';
const _cap = new Capsule(); const _n = new THREE.Vector3();
moveActor(a, dt) {
  const wasGround = a.onGround;
  if (!wasGround) a.vel.y -= this.ctx.config.gravity * dt;          // gravity ~22 m/s^2 (snappy)
  a.pos.addScaledVector(a.vel, dt);
  this.statics.resolve(a);                                          // XZ circles/boxes push-out + remove inward velocity
  let octGround = false;
  if (this.octree) {
    _cap.start.set(a.pos.x, a.pos.y + a.radius, a.pos.z);
    _cap.end.set(a.pos.x, a.pos.y + a.height - a.radius, a.pos.z); _cap.radius = a.radius;
    const r = this.octree.capsuleIntersect(_cap);
    if (r) {
      a.pos.addScaledVector(r.normal, r.depth);
      if (r.normal.y > 0.6) { octGround = true; if (a.vel.y < 0) a.vel.y = 0; }
      else a.vel.addScaledVector(r.normal, -r.normal.dot(a.vel));     // slide along walls
    }
  }
  const g = this.heightfield.heightAt(a.pos.x, a.pos.z);
  const snap = wasGround && a.vel.y <= 0 ? 0.3 : 0;                 // stick to downhill slopes
  if (a.pos.y <= g + snap) {
    if (!wasGround && a.vel.y < -4) a.landImpact = -a.vel.y;        // player reads this -> squash + PLAYER_LAND
    a.pos.y = g; if (a.vel.y < 0) a.vel.y = 0; a.onGround = true;
    if (this.heightfield.normalAt(a.pos.x, a.pos.z, _n).y < 0.7) { a.vel.x += _n.x * 12 * dt; a.vel.z += _n.z * 12 * dt; } // too steep: slide
  } else a.onGround = octGround;
  this.clampToBounds(a);
}
```
Characters set horizontal `vel` from intent each step. Use `damp` toward the target velocity: fast on the ground and slow in the air, which gives cute "air control". Knockback is added to `vel` and decays through the same damping.

---

## 6. Game loop (fixed timestep + interpolation + hitstop)

```js
// core/Loop.js
import * as THREE from 'three';
export class Loop {
  constructor(renderer, { step = 1 / 60, maxSteps = 5, update, render }) {
    Object.assign(this, { renderer, step, maxSteps, update, render, acc: 0, timeScale: 1 });
    this.timer = new THREE.Timer(); this.timer.connect(document);  // resets delta after tab becomes visible
  }
  start() { this.renderer.setAnimationLoop((t) => this.tick(t)); }
  stop() { this.renderer.setAnimationLoop(null); }
  tick(t) {
    this.timer.update(t);
    const frameDt = Math.min(this.timer.getDelta(), 0.1);          // clamp long frames
    this.acc += frameDt * this.timeScale;
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) { this.update(this.step); this.acc -= this.step; n++; }
    if (n === this.maxSteps) this.acc = 0;                          // avoid spiral of death
    this.render(this.acc / this.step, frameDt);
  }
}
```
```js
// core/Game.js (excerpt)
step(dt) {
  this.ctx.actors.forEach((a) => a.beginStep());
  if (this.hitstopT > 0) { this.hitstopT -= dt; this.ctx.input.endStep(); return; } // world frozen; camera/fx keep rendering
  if (!this.paused) for (const s of this.systems) s.update(dt);
  this.ctx.input.endStep();                                        // clears pressed/released edges
}
requestHitstop(sec) { this.hitstopT = Math.max(this.hitstopT, sec); }
frame(alpha, frameDt) {
  for (const s of this.systems) s.render?.(alpha, frameDt);
  this.postfx.render(frameDt);
  this.frameCount++;
}
```
**Input edges and fixed steps**:
- `Input` latches `pressed`/`released` from DOM events until the *first* fixed step consumes them; `endStep()` clears them. Edges are never lost (0 steps in a frame) and never doubled (2 or more steps).
- The player additionally keeps a **0.2 s input buffer** for attack and dodge.

Slow-motion (boss kill, holy slash) uses `loop.timeScale = 0.3` for about 0.4 s of real time.

---

## 7. Input [rec]

The API used by the player, camera and UI:
```js
input.move          // {x, y} in [-1,1], y+ = forward (camera-relative mapping done by player)
input.look          // {x, y} accumulated deltas since last render frame (consumed by camera)
input.down(a) / input.pressed(a) / input.released(a) / input.heldTime(a)
// actions: 'attack','dodge','jump','interact','lockon','pause','confirm','back'
```

| Action | Keyboard / mouse | Gamepad (standard mapping) | Touch |
|---|---|---|---|
| move | WASD / arrows | left stick (dead zone 0.15) | left-half floating joystick |
| look | mouse (pointer lock after the first click) | right stick | drag on the right half |
| attack (hold to charge holy) | LMB / J | X (button 2) | ⚔ button |
| dodge | Shift / RMB / K | B (1) | roll button |
| jump | Space | A (0) | jump button |
| interact / confirm | E / Enter | Y (3) | contextual "!" button |
| lock-on | Tab / MMB | R3 / RB | double-tap enemy [optional] |
| pause | Esc / P | Start (9) | ❚❚ button |

Gamepads are polled each render with `navigator.getGamepads()`.

### Touch joystick (ui/touch.js) [rec]
```js
export class TouchControls {
  constructor(input, root) {           // root: #touch, CSS: position:fixed; inset:0; touch-action:none; user-select:none
    this.input = input; this.root = root; this.R = 60;
    this.stick = { id: null, ox: 0, oy: 0 }; this.look = { id: null, x: 0, y: 0 };
    this.base = root.querySelector('.stick-base'); this.knob = root.querySelector('.stick-knob');
    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel']) root.addEventListener(t, (e) => this.up(e));
    for (const b of root.querySelectorAll('[data-action]')) {
      const a = b.dataset.action;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.setPointerCapture(e.pointerId); input.setVirtual(a, true); });
      for (const t of ['pointerup', 'pointercancel']) b.addEventListener(t, () => input.setVirtual(a, false));
    }
  }
  down(e) {
    if (e.clientX < innerWidth * 0.45 && this.stick.id === null) {
      Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY });
      this.base.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; this.base.hidden = false;
    } else if (this.look.id === null) Object.assign(this.look, { id: e.pointerId, x: e.clientX, y: e.clientY });
    this.root.setPointerCapture(e.pointerId);
  }
  move(e) {
    if (e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy; const L = Math.hypot(dx, dy);
      if (L > this.R) { dx *= this.R / L; dy *= this.R / L; }
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.input.setVirtualMove(dx / this.R, -dy / this.R);
    } else if (e.pointerId === this.look.id) {
      this.input.addLook((e.clientX - this.look.x) * 0.006, (e.clientY - this.look.y) * 0.006);
      this.look.x = e.clientX; this.look.y = e.clientY;
    }
  }
  up(e) {
    if (e.pointerId === this.stick.id) { this.stick.id = null; this.base.hidden = true; this.input.setVirtualMove(0, 0); }
    if (e.pointerId === this.look.id) this.look.id = null;
  }
}
```
**Touch setup notes:**
- Show the controls when `matchMedia('(pointer: coarse)').matches` or on the first `touchstart`.
- Viewport meta: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- Request fullscreen on "Start" for mobile, and show a "rotate to landscape" hint in portrait.

---

## 8. Third-person follow camera with collision (spring arm) [rec]

Concepts: an orbit around a pivot (player head plus 0.3 m) and a spring-arm ray from the pivot to the camera. When the ray hits something, the camera is placed at `hit - margin`. It pulls in fast and eases out slowly (the Godot SpringArm pattern **[docs: godot SpringArm]**).

The camera updates in `render()` with the **interpolated** player position, which avoids jitter on 120 Hz screens.
```js
const _dir = new THREE.Vector3(), _piv = new THREE.Vector3(), _ray = new THREE.Ray();
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

render(alpha, dt) {
  const look = this.ctx.input.consumeLook();
  this.yaw -= look.x; this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * (this.invertY ? -1 : 1), -0.35, 1.1);
  if (this.lockTarget) this.yaw = lerpAngle(this.yaw, yawTowards(this.ctx.player, this.lockTarget) + Math.PI, 1 - Math.exp(-8 * dt));
  else if (this.autoFollow && this.idleLookT > 1.5) this.yaw = lerpAngle(this.yaw, this.ctx.player.facing + Math.PI, 1 - Math.exp(-1.5 * dt));

  _piv.copy(this.ctx.player.object3d.position); _piv.y += 1.05;             // pivot = cat head height
  this.pivot.x = damp(this.pivot.x, _piv.x, 20, dt); this.pivot.y = damp(this.pivot.y, _piv.y, 8, dt); this.pivot.z = damp(this.pivot.z, _piv.z, 20, dt);

  const cp = Math.cos(this.pitch);
  _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);   // pivot -> camera
  const want = this.distance;                                                 // ~4.5 m (cute chibi framing)
  _ray.set(this.pivot, _dir);
  const hit = this.ctx.physics.raycast(_ray, want + 0.3);                     // octree + heightfield march
  const allowed = hit ? Math.max(0.8, hit.distance - 0.3) : want;
  this.curDist = damp(this.curDist, allowed, allowed < this.curDist ? 25 : 3, dt);

  const cam = this.ctx.camera;
  cam.position.copy(this.pivot).addScaledVector(_dir, this.curDist);
  const gy = this.ctx.physics.heightAt(cam.position.x, cam.position.z) + 0.3; // never below terrain
  if (cam.position.y < gy) cam.position.y = gy;
  cam.lookAt(this.pivot);
  this.shake.apply(cam, dt);                                                   // local rotations AFTER lookAt
}
// Camera-relative movement for the player (yaw = camera yaw):
// forward = (-sin(yaw), 0, -cos(yaw)), right = (cos(yaw), 0, -sin(yaw)), wish = forward*move.y + right*move.x
```
`physics.raycast` checks the Octree (`rayIntersect`) and marches the heightfield in 0.5 m steps with a binary refine.

Large props such as trees can either:
- also be added as Octree meshes (their trunks), or
- simply be ignored by the camera and faded instead: set `material.opacity` when they come between the camera and the player. This is cheaper and cuter.

---

## 9. Combat [rec]

### 9.1 Data-driven attacks (combat/attacks.js)
```js
// angles in radians relative to facing (positive = attacker's left); times in seconds
export const ATTACKS = {
  slash1: { dur: 0.40, active: [0.10, 0.22], arc: { range: 1.9, from:  1.2, to: -1.2, y0: 0, y1: 1.4 }, dmg: 1, knock: 4,  poise: 1,  hitstop: 0.05, shake: 0.15, lunge: 2.5, combo: [0.18, 0.40], next: 'slash2' },
  slash2: { dur: 0.40, active: [0.10, 0.22], arc: { range: 1.9, from: -1.2, to:  1.2, y0: 0, y1: 1.4 }, dmg: 1, knock: 4,  poise: 1,  hitstop: 0.05, shake: 0.15, lunge: 2.5, combo: [0.18, 0.40], next: 'slash3' },
  slash3: { dur: 0.60, active: [0.20, 0.32], arc: { range: 2.3, from:  1.7, to: -1.7, y0: 0, y1: 1.6 }, dmg: 2, knock: 9,  poise: 3,  hitstop: 0.09, shake: 0.35, lunge: 4.0, next: null },
  holy:   { dur: 0.85, active: [0.22, 0.36], arc: { range: 3.6, from: Math.PI, to: -Math.PI, y0: 0, y1: 2.5 }, dmg: 5, knock: 14, poise: 99, hitstop: 0.14, shake: 0.6, projectile: 'holyWave' },
  // enemy attacks live in the same table: 'slime_bounce', 'rat_poke', 'crow_dive', 'boss_slam', ...
};
for (const [k, v] of Object.entries(ATTACKS)) v.id = k;     // HIT events carry def.id
export const easeSwing = (u) => 1 - Math.pow(1 - u, 3);   // fast start, soft end (sell the arc)
```

### 9.2 Swept-arc hit detection (robust at any speed; decoupled from visuals)
Every step during the `active` window, compute the angle range swept *this step* and test enemy hurt-cylinders. The visual sword and trail follow the same curve, so what you see is what hits.
```js
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function sectorHit(att, tgt, arc, a0, a1) {
  const dx = tgt.pos.x - att.pos.x, dz = tgt.pos.z - att.pos.z, d = Math.hypot(dx, dz);
  if (d > arc.range + tgt.radius) return false;
  if (tgt.pos.y > att.pos.y + arc.y1 || tgt.pos.y + tgt.height < att.pos.y + arc.y0) return false;
  if (d < tgt.radius + 0.25) return true;                                  // point blank
  if (Math.abs(arc.from - arc.to) >= 2 * Math.PI - 1e-3) return true;     // full circle
  const ang = wrap(Math.atan2(dx, dz) - att.facing), pad = Math.asin(Math.min(1, tgt.radius / d));
  return ang >= Math.min(a0, a1) - pad && ang <= Math.max(a0, a1) + pad;
}
// Combat.updateSwing(swing, dt): swing = { attacker, def, t, hitSet: new Set() }
updateSwing(s, dt) {
  const { def } = s, [t0, t1] = def.active, tPrev = s.t; s.t += dt;
  if (s.t < t0 || tPrev > t1) return;
  const u = (t) => easeSwing(THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1));
  const a0 = THREE.MathUtils.lerp(def.arc.from, def.arc.to, u(tPrev)), a1 = THREE.MathUtils.lerp(def.arc.from, def.arc.to, u(s.t));
  for (const tgt of this.ctx.actors.queryRadius(s.attacker.pos, def.arc.range + 1.5, hostileTo(s.attacker.faction))) {
    if (!tgt.alive || !tgt.hurtable || s.hitSet.has(tgt.id)) continue;
    if (sectorHit(s.attacker, tgt, def.arc, a0, a1)) { s.hitSet.add(tgt.id); this.applyHit(s.attacker, tgt, def); }
  }
}
```

### 9.3 applyHit: damage, i-frames, knockback, stagger, hitstop, shake
```js
applyHit(att, tgt, def, { dmgMul = 1 } = {}) {
  if (tgt.invulnT > 0) return false;
  const dmg = def.dmg * dmgMul; tgt.hp = Math.max(0, tgt.hp - dmg);
  _dir.set(tgt.pos.x - att.pos.x, 0, tgt.pos.z - att.pos.z).normalize();
  const k = def.knock / tgt.mass; tgt.vel.x += _dir.x * k; tgt.vel.z += _dir.z * k; tgt.vel.y += Math.min(3, k * 0.25);
  tgt.invulnT = tgt.faction === 'player' ? 0.9 : 0.12;          // player gets generous i-frames (blink), enemies just anti-multihit
  tgt.poise -= def.poise; if (tgt.poise <= 0) { tgt.staggerT = 0.6; tgt.poise = tgt.maxPoise; }
  const killed = tgt.hp <= 0;
  this.ctx.game.requestHitstop(def.hitstop + (killed ? 0.04 : 0));
  this.ctx.bus.emit(E.SHAKE, { trauma: def.shake * (att.faction === 'player' ? 1 : 1.4) });
  tgt.onHit({ attacker: att, def, dmg, dir: _dir, killed });
  if (killed) { tgt.alive = false; tgt.onDeath({ attacker: att, def }); }
  this.ctx.bus.emit(E.HIT, { attacker: att, target: tgt, attackId: def.id, damage: dmg, position: tgt.pos.clone(), dir: _dir.clone(), killed, blocked: false });
  return true;
}
```

### 9.4 Player combat flow [rec]
- **Combo chain**: in `attack` state, an attack press inside `combo[0..1]` (or buffered up to 0.2 s before it) jumps to `def.next`.
  - Each swing *lunges* forward (`lunge` m/s for the active window).
  - It auto-turns toward the nearest enemy within 60° and 3 m, which is soft aim assist.
- **Dodge roll**: 0.4 s at 9 m/s with **i-frames from 0.04 to 0.30 s**. It can cancel attack recovery after `active[1]`.
- **Charged holy slash**:
  - Holding attack for more than 0.35 s enters `charge`: walk at 40% speed, golden sparkles build, and `PLAYER_CHARGE` tier sounds play at 0.5 and 1.0.
  - Releasing at level ≥ 1 (after about 1.1 s) triggers the `holy` attack: a 360° slash plus a forward `holyWave` projectile (expanding golden crescent, bloom), with `loop.timeScale = 0.35` for 0.25 s.
  - Releasing early gives `slash3`.
  - Optionally gate the holy slash behind a "holy meter" filled by hits (game design decides).
- **Hurt**: knockback, 0.35 s of hurt state, then about 0.9 s of i-frames with the mesh blinking (toggle `visible` at 15 Hz).

### 9.5 Hitstop and screen shake values
- **Hitstop**: light 0.05 s, heavy 0.09 s, holy 0.14 s, kill +0.04 s. The player taking damage gets 0.07 s.
- **Shake** uses the trauma model: events *add* trauma (0 to 1), offset = trauma² × smooth noise, and trauma decays linearly. Use smooth noise, not white noise **[docs: Squirrel Eiserloh GDC "juicing" talk, as summarized in search results]**.
```js
export class CameraShake {
  trauma = 0; t = 0;
  add(x) { this.trauma = Math.min(1, this.trauma + x); }
  apply(cam, dt) {
    this.t += dt; this.trauma = Math.max(0, this.trauma - 1.6 * dt);
    const s = this.trauma * this.trauma; if (s === 0) return;
    const n = (k) => Math.sin(this.t * 31 + k * 17.3) * 0.6 + Math.sin(this.t * 57 + k * 5.1) * 0.4;
    cam.rotateX(0.035 * s * n(1)); cam.rotateY(0.035 * s * n(2)); cam.rotateZ(0.06 * s * n(3));
  }
}
```
**Juice checklist on each hit:**
- hitstop
- shake
- white flash on the target (set `material.emissive` to white for 60 ms)
- hit-star particles plus a damage number
- a squash pulse on the target
- an SFX pitch randomized by ±5%

---

## 10. Enemy AI (state machines) [rec]

```js
// enemies/Enemy.js
export class Enemy extends Actor {
  constructor(ctx, def, spawn) {
    super(ctx, { faction: 'enemy', radius: def.radius, height: def.height, maxHp: def.hp, mass: def.mass, maxPoise: def.poise });
    this.def = def; this.home = spawn.pos.clone(); this.pos.copy(spawn.pos);
    this.states = { ...BASE_STATES, ...(def.states ?? {}) }; this.setState('idle');
  }
  setState(name) { this.state?.exit?.(this); this.stateName = name; this.state = this.states[name]; this.stateT = 0; this.state.enter?.(this); }
  update(dt) {
    this.stateT += dt; this.invulnT = Math.max(0, this.invulnT - dt);
    if (this.staggerT > 0 && this.stateName !== 'stagger' && this.alive) this.setState('stagger');
    this.state.update(this, dt);
    this.ctx.physics.moveActor(this, dt);
  }
  distToPlayer() { const p = this.ctx.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  canSee() { // range + FOV cone + optional LOS ray (throttled to 5 Hz)
    const d = this.distToPlayer(); if (d > this.def.sight) return false;
    if (d < this.def.sight * 0.35) return true;                           // "heard" close player
    return Math.abs(wrapAngle(yawTo(this, this.ctx.player) - this.facing)) < this.def.fov * 0.5;
  }
}
const BASE_STATES = {
  idle:    { update(e) { if (e.canSee()) return alert(e); if (e.stateT > 1.5 + e.ctx.rng() * 2) e.setState('patrol'); } },
  patrol:  { enter(e) { e.goal = randomPointNear(e.home, e.def.patrolRadius, e.ctx.rng); },
             update(e, dt) { if (e.canSee()) return alert(e); if (steerTo(e, e.goal, e.def.walk, dt) < 0.4 || e.stateT > 6) e.setState('idle'); } },
  alert:   { enter(e) { e.ctx.bus.emit(E.ENEMY_ALERTED, { enemy: e }); },              // "!" bubble, 0.4 s, cute hop
             update(e) { faceTo(e, e.ctx.player); if (e.stateT > 0.4) e.setState('chase'); } },
  chase:   { update(e, dt) {
               const d = e.distToPlayer();
               if (d > e.def.leash || e.pos.distanceTo(e.home) > e.def.leash * 1.5) return e.setState('return');
               if (d < e.def.attackRange && e.ctx.combat.tokens.acquire(e)) return e.setState('windup');
               steerTo(e, d < e.def.attackRange * 1.4 ? circlePoint(e) : e.ctx.player.pos, e.def.run, dt);   // wait their turn: orbit
             } },
  windup:  { enter(e) { e.vel.x = e.vel.z = 0; e.telegraph(true); },                  // flash/raise weapon; >= 0.45 s (fair, cute)
             update(e) { faceTo(e, e.ctx.player, 0.15); if (e.stateT > e.def.windup) e.setState('strike'); }, exit(e) { e.telegraph(false); } },
  strike:  { enter(e) { e.swing = e.ctx.combat.beginSwing(e, ATTACKS[e.def.attack]); },
             update(e, dt) { e.ctx.combat.updateSwing(e.swing, dt); if (e.stateT > ATTACKS[e.def.attack].dur) e.setState('recover'); } },
  recover: { update(e) { if (e.stateT > e.def.recover) { e.ctx.combat.tokens.release(e); e.setState('chase'); } } },   // punish window
  stagger: { enter(e) { e.ctx.combat.tokens.release(e); },
             update(e, dt) { e.staggerT -= dt; if (e.staggerT <= 0) e.setState(e.alive ? 'chase' : 'die'); } },
  return:  { update(e, dt) { if (steerTo(e, e.home, e.def.walk, dt) < 0.5) { e.hp = e.maxHp; e.setState('idle'); } } },
  die:     { enter(e) { e.hurtable = false; e.ctx.combat.tokens.release(e); e.ctx.bus.emit(E.ENEMY_DIED, { enemy: e, type: e.def.id, position: e.pos.clone() }); },
             update(e) { if (e.stateT > 1.0) e.ctx.enemies.despawn(e); } },        // poof into sparkles + drop
};
const alert = (e) => e.setState('alert');
```
- **Attack tokens** (`combat/AttackTokens.js`): at most 2 enemies (1 on "easy") hold a token at once. The others orbit at range. This keeps fights readable and fair (a "kung-fu circle" pattern) **[rec]**.
- **Steering**: seek plus separation from other enemies, then `physics.moveActor`. No navmesh: levels are open fields and arenas, with obstacles handled by push-out. For castle corridors, add hand-placed waypoint graphs in level data **[rec]**.
- **Enemy type file** = data plus optional state overrides, for example:
  - Slime: hops, contact damage.
  - Rat bandit: 3-hit pokes.
  - Crow knight: dive from the air.
  - Boss: phases by HP threshold, each with its own attack table, emitting `BOSS_PHASE`.
- AI only *thinks* expensive thoughts (LOS rays, repathing) at 5 to 10 Hz, staggered by `id % N`.

---

## 11. Animation

### 11.1 GLB creatures (AnimationMixer) [docs + rec]
```js
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
const gltf = await ctx.assets.gltf('models/rat_bandit.glb');      // cached once
const model = cloneSkinned(gltf.scene);                            // REQUIRED for skinned meshes (plain .clone() breaks skeleton binding)
const mixer = new THREE.AnimationMixer(model);
const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
let current = null;
function play(name, fade = 0.15, once = false) {
  const next = actions[name]; if (!next || next === current) return;
  next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
  next.fadeIn(fade).play(); current?.fadeOut(fade); current = next;
}
// in render(): if (distanceToCamera < 40) mixer.update(frameDt); far ones every 2nd frame with 2*dt
```
- Map FSM states to clips by name in the enemy def, for example `anims: { idle: 'Idle', chase: 'Run', windup: 'Attack_Windup', strike: 'Attack', die: 'Death' }`.
- During hitstop, call `mixer.update(0)` (check `ctx.game.hitstopT > 0`) so creatures freeze on impact together with the simulation.

### 11.2 Procedural Swordcat / kittens (SwordcatModel.js) [rec]
Build a hierarchy of primitive meshes. Suggested parts:
- a rounded fluffy **body**
- a **big head** with big blue-grey eyes and a **pink bow**
- triangular **ears**
- a **tail** chain of 4 to 6 segments
- 4 **paws**
- silver **armor** shell pieces (pauldrons, chest, greaves) and a red **cape** plane with segments
- a **sword arm** pivot and the **sword**

All motion is code, driven by speed, state and springs:
```js
// tiny critically-damped spring for secondary motion (ears, tail, cape, bow)
class Spring { x = 0; v = 0; constructor(k = 120, c = 2 * Math.sqrt(120)) { this.k = k; this.c = c; }
  step(target, dt) { this.v += (this.k * (target - this.x) - this.c * this.v) * dt; this.x += this.v * dt; return this.x; } }

render(alpha, dt) {
  const p = this.player, speed = Math.hypot(p.vel.x, p.vel.z), s01 = Math.min(speed / 5.5, 1);
  this.phase += dt * (5 + 9 * s01);                                     // gait frequency rises with speed
  // body bob (two bounces per stride) + lean into motion
  this.body.position.y = this.baseY + Math.abs(Math.sin(this.phase)) * 0.07 * s01 + Math.sin(this.t * 2) * 0.01 * (1 - s01); // idle breathing
  this.root.rotation.x = damp(this.root.rotation.x, 0.15 * s01, 10, dt);
  // squash & stretch, volume preserving (set this.squash = -0.25 on land, +0.18 on jump)
  this.squash = damp(this.squash, 0, 10, dt); const sy = 1 + this.squash, sxz = 1 / Math.sqrt(sy);
  this.body.scale.set(sxz, sy, sxz);
  // paws: diagonal pairs alternate
  const a = Math.sin(this.phase) * 0.35 * s01;
  this.pawFL.rotation.x = a; this.pawBR.rotation.x = a; this.pawFR.rotation.x = -a; this.pawBL.rotation.x = -a;
  // ears & bow lag behind acceleration; tail sways and trails
  const accel = (speed - this.lastSpeed) / Math.max(dt, 1e-3); this.lastSpeed = speed;
  this.earL.rotation.x = this.earR.rotation.x = this.earSpring.step(-accel * 0.01, dt);
  for (let i = 0; i < this.tail.length; i++)
    this.tail[i].rotation.y = this.tailSprings[i].step(Math.sin(this.t * 3 - i * 0.6) * (0.25 + 0.2 * (1 - s01)) - this.turnRate * 0.1, dt);
  // sword arm: follow the SAME curve the combat sweep uses (anticipation -> fast arc -> follow-through)
  if (p.swing) { const d = p.swing.def, t = p.swing.t, [t0, t1] = d.active;
    const back = d.arc.from + 0.35 * Math.sign(d.arc.from - d.arc.to);          // anticipation: pull further back first
    const ang = t < t0 ? THREE.MathUtils.lerp(d.arc.from, back, THREE.MathUtils.smoothstep(t, 0, t0))
              : THREE.MathUtils.lerp(back, d.arc.to, easeSwing(Math.min((t - t0) / (t1 - t0), 1)));
    this.swordPivot.rotation.y = damp(this.swordPivot.rotation.y, ang, 40, dt); }
  else this.swordPivot.rotation.y = damp(this.swordPivot.rotation.y, 0, 12, dt); // sword held upright, as in the meme pose
  this.t += dt;
}
```
- **Blink**: scale eyelids on a random 2 to 5 s timer.
- **Idle fidget**: after 6 s, play an ear flick or sword twirl.
- **Victory pose**: hold the sword upright, with a golden glow plus sparkles, matching ref1.
- **Kittens** reuse the same rig with different fur colors, accessories and scale (0.7×).

### 11.3 Sword trail (fx/SwordTrail.js)
Keep a ring buffer of 16 to 24 samples of (hilt, tip) world positions, appending one per render frame while swinging. Build a triangle strip into a preallocated `BufferGeometry`, using `setDrawRange` and `attributes.position.needsUpdate = true`. The material is additive, `depthWrite: false`, with vertex alpha fading along age. Use gold for holy and white-blue for normal swings.

---

## 12. World: levels, terrain, grass, fog, sky

### 12.1 Scene switching per level (recommended over true streaming)
```js
// world/LevelManager.js
const LEVELS = {                                      // dynamic import = Vite code-splits each level
  meadow:  () => import('./levels/meadow.js'),
  forest:  () => import('./levels/forest.js'),
  village: () => import('./levels/village.js'),
  castle:  () => import('./levels/castle.js'),
};
async load(id, spawnId = 'start') {
  const { bus, scene, renderer, camera, physics } = this.ctx;
  bus.emit(E.LEVEL_LOADING, { id }); this.ctx.ui.loading(true);
  if (this.current) { bus.emit(E.LEVEL_UNLOAD, { id: this.current.id }); this.current.dispose(); disposeOwned(this.current.root); scene.remove(this.current.root); }
  const { default: def } = await LEVELS[id]();
  const level = await def.build(this.ctx);            // -> LevelData
  scene.add(level.root); physics.setLevel(level);
  await renderer.compileAsync(scene, camera);         // pre-compile shaders: no hitch on first view [docs: WebGLRenderer.compileAsync]
  this.current = { id, ...level };
  bus.emit(E.LEVEL_LOADED, { id, level }); this.ctx.ui.loading(false);
  this.ctx.player.teleport(level.spawns[spawnId]);
}
```
```js
/** @typedef {object} LevelData  (returned by levels/<id>.js build(ctx); owned by world agent, consumed by physics/enemies/story/audio)
 * @property {THREE.Group} root
 * @property {Heightfield} heightfield
 * @property {{circles: {x,z,r,y0,y1}[], boxes: {minX,maxX,minZ,maxZ,y0,y1}[]}} colliders
 * @property {THREE.Object3D[]} octreeMeshes      // architecture for capsule/ray collision
 * @property {Record<string,{pos:THREE.Vector3, facing:number}>} spawns
 * @property {{type:string, pos:THREE.Vector3, patrolRadius?:number}[]} enemySpawns
 * @property {{id:string, kind:'kitten'|'npc', pos:THREE.Vector3, dialog?:string}[]} npcs
 * @property {{id:string, shape:'sphere'|'box', pos, r?, size?, onEnter:{exit?:{to,spawnId}, dialog?:string, flag?:string, checkpoint?:string}}[]} triggers
 * @property {{fog:{color:number, density:number}, sky:{top:number,bottom:number}, sun:{dir:THREE.Vector3,color:number,intensity:number}, music:string}} env
 * @property {{min:THREE.Vector2,max:THREE.Vector2}} bounds
 * @property {(dt:number)=>void} [update]  @property {()=>void} dispose
 */
```
- Inside a large level, cheap **"streaming"** is simply **chunking**: grass, props and decals in 32 m tiles, each its own `InstancedMesh`. Frustum culling then skips them, and tiles beyond about 60 m get `visible = false`.
- GLB templates stay in the `Assets` cache for the session. Never dispose shared geometry; dispose only level-built geometry and materials (`userData.owned = true`).

### 12.2 Instanced grass with wind [measured: compiles and renders on r186]
The bend is applied in **world space** (after `instanceMatrix`), so randomly rotated blades still bend with one wind direction. Blades also part around the player.

Test: 20,000 blades plus a shadowed directional light plus bloom ran at about 55 fps at 960×540 in headless Chromium on this Iris Xe **[measured]**. That is indicative only.
```js
// world/Grass.js
export const grassUniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(0, -999, 0) },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() }, uWindStrength: { value: 0.25 }, uBladeH: { value: 0.5 } };
export function makeBladeGeometry(h = 0.5, w = 0.06) {           // 5 verts, 3 tris, base at y=0
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w,0,0, w,0,0, -w*0.6,h*0.5,0, w*0.6,h*0.5,0, 0,h,0], 3));
  g.setIndex([0,1,2, 2,1,3, 2,3,4]); g.computeVertexNormals(); return g;
}
export function makeGrassMaterial(color = 0x6fae4a) {
  const m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });   // fog works automatically
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, grassUniforms);
    shader.vertexShader = 'uniform float uTime; uniform vec3 uPlayer; uniform vec2 uWindDir; uniform float uWindStrength; uniform float uBladeH;\n' +
      shader.vertexShader.replace('mvPosition = modelViewMatrix * mvPosition;', /* glsl */`
        vec4 wp = modelMatrix * mvPosition;                    // mvPosition already includes instanceMatrix here
        float tip = clamp(position.y / uBladeH, 0.0, 1.0); tip *= tip;
        float gust = sin(uTime * 1.3 + dot(wp.xz, vec2(0.21, 0.17))) * 0.6 + sin(uTime * 3.7 + wp.x * 0.9) * 0.2;
        wp.xz += uWindDir * (gust + 0.4) * uWindStrength * tip;
        vec2 away = wp.xz - uPlayer.xz; float d = length(away);
        float push = smoothstep(1.0, 0.0, d) * tip;
        wp.xz += (d > 1e-3 ? away / d : vec2(0.0)) * push * 0.35; wp.y -= push * 0.15;
        mvPosition = viewMatrix * wp;`);
  };
  m.customProgramCacheKey = () => 'grass-v1';
  return m;
}
// per chunk: new THREE.InstancedMesh(geo, mat, count); for each blade: position on heightfield, random yaw, scale 0.7..1.3,
// per-instance tint via setColorAt (cream/yellow tips near paths), mesh.receiveShadow = true; castShadow = false.
// Each frame: grassUniforms.uTime.value = elapsed; grassUniforms.uPlayer.value.copy(player.object3d.position)
```
Density by quality: low = 4k blades in a 25 m radius around the player (recycled), medium 15k, high 30k or more. Chunk instances so each `InstancedMesh` is frustum-culled; call `computeBoundingSphere()` after filling the matrices.

### 12.3 Mood, fog and sky (to match the refs: misty grey-green fields, warm holy light)
- **Fog**: `scene.fog = new THREE.FogExp2(0xa7b3a2, 0.022)`, with `scene.background` set to the same color, or a gradient sky sphere (`ShaderMaterial`, `fog: false`, `depthWrite: false`, rendered first).
- **Lights**:
  - `HemisphereLight(0xdfe8ff, 0x55623f, 1.2)`
  - a `DirectionalLight` (warm 0xfff1d6, 2.0) that casts shadows, with its shadow camera **following the player**: an ortho frustum of ±20 m, a 2048 map (1024 on low), `shadow.bias = -0.0005`, `normalBias = 0.02`
  - `renderer.shadowMap.type = THREE.PCFShadowMap`
- **Toon/cute look [rec]**: `MeshToonMaterial` with a 3 to 4 step gradient map for characters, or `MeshStandardMaterial` with roughness 0.8. Add a rim light via `onBeforeCompile` (fresnel term added to `outgoingLight`) for the fluffy halo.
- **Holy glow**: emissive gold (`emissiveIntensity` 2 to 4) on the sword and halo, plus bloom. Sparkle `Points` use additive blending with `sizeAttenuation`.

---

## 13. Post-processing [rec]
```js
// core/PostFX.js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

renderer.toneMapping = THREE.ACESFilmicToneMapping;   // or AgXToneMapping / NeutralToneMapping (all in r186)
const size = renderer.getDrawingBufferSize(new THREE.Vector2());
const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa ? 4 : 0 }); // MSAA in composer (renderer antialias does not apply to RTs)
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.6 /*strength*/, 0.4 /*radius*/, 0.85 /*threshold*/);
composer.addPass(bloom);
composer.addPass(new OutputPass());                    // tone mapping + sRGB conversion happen HERE
if (q.fxaa) composer.addPass(new FXAAPass());          // FXAA after OutputPass (expects display-referred input) [unverified ordering: check three example webgl_postprocessing_fxaa]
// resize: renderer.setSize(w,h); composer.setSize(w,h) (propagates setSize to every pass, incl. bloom); on DPR change also composer.setPixelRatio(dpr)
// low quality: skip composer entirely -> renderer.render(scene, camera) (renderer created with antialias:true then)
```
- `EffectComposer` defaults to `HalfFloatType` render targets **[docs: EffectComposer.js r186]**.
- Don't mix three's `EffectComposer` with the pmndrs `postprocessing` library.
- `RenderTransitionPass` exists in r186 and can do a level-transition wipe **[docs]**. A CSS fade is simpler.

---

## 14. Audio [rec]
```js
// audio/AudioManager.js
export class AudioManager {
  constructor(ctx) { this.ctx = ctx; this.buffers = new Map(); }
  async init() {
    this.listener = new THREE.AudioListener(); this.ctx.camera.add(this.listener);      // exactly ONE listener, on the camera
    this.music = [new THREE.Audio(this.listener), new THREE.Audio(this.listener)];      // A/B for crossfades
    this.pool2D = Array.from({ length: 8 }, () => new THREE.Audio(this.listener));
    this.pool3D = Array.from({ length: 12 }, () => { const a = new THREE.PositionalAudio(this.listener);
      a.setRefDistance(3); a.setRolloffFactor(1.4); a.setMaxDistance(45); a.setDistanceModel('inverse'); this.ctx.scene.add(a); return a; });
    this.i2 = 0; this.i3 = 0;
    const bus = this.ctx.bus;
    bus.on(E.HIT, (h) => this.play3D(h.killed ? 'poof' : 'hit', h.position, { rate: 0.95 + Math.random() * 0.1 }));
    bus.on(E.PLAYER_SWING, () => this.play2D('swish', { rate: 0.9 + Math.random() * 0.2 }));
    bus.on(E.MUSIC, ({ track, fade = 1.5 }) => this.playMusic(track, fade));
    // ... footsteps, meows, pickups, UI blips
  }
  /** Call from the title screen's first pointerdown/keydown (autoplay policy). */
  async unlock() {
    const ac = this.listener.context; if (ac.state !== 'running') await ac.resume();
    const { ZZFX } = await import('zzfx');                 // lazy: zzfx creates its own AudioContext at import
    for (const [name, params] of Object.entries(SFX)) {    // bake procedural SFX into AudioBuffers of OUR context
      const s = ZZFX.buildSamples(...params), b = ac.createBuffer(1, s.length, ZZFX.sampleRate);
      b.getChannelData(0).set(s); this.buffers.set(name, b);
    }
  }
  async load(name, url) { this.buffers.set(name, await new THREE.AudioLoader().loadAsync(url)); }
  play2D(name, { volume = 1, rate = 1 } = {}) { const b = this.buffers.get(name); if (!b) return;
    const a = this.pool2D[this.i2++ % this.pool2D.length]; if (a.isPlaying) a.stop();
    a.setBuffer(b); a.setVolume(volume * this.sfxVol); a.setPlaybackRate(rate); a.play(); }
  play3D(name, pos, { volume = 1, rate = 1 } = {}) { const b = this.buffers.get(name); if (!b) return;
    const a = this.pool3D[this.i3++ % this.pool3D.length]; if (a.isPlaying) a.stop();
    a.position.copy(pos); a.updateMatrixWorld(); a.setBuffer(b); a.setVolume(volume * this.sfxVol); a.setPlaybackRate(rate); a.play(); }
}
```
- **Autoplay**: the AudioContext stays suspended until a user gesture. The title screen's "Press any key / Tap to start" resumes it. Also listen for `statechange` and resume after `'interrupted'` (iOS).
- **Formats**: ship music as `.mp3` (universal) at about 128 kbps, and SFX as short `.mp3`/`.ogg` or zzfx.
- **Music**: crossfade per level and state (explore, combat when 1 or more enemies are alerted, boss, victory) by ramping the gain nodes with `gain.linearRampToValueAtTime`.

---

## 15. UI (HTML/CSS overlay) [rec]
- `index.html` has `<canvas>` (from the renderer), `<div id="ui">` (pointer-events: none by default; interactive children opt in) and `<div id="touch">`.
- **HUD**:
  - hearts (paw-print hearts)
  - a holy meter
  - a fish/coin counter
  - a kittens-rescued counter
  - a boss bar
  - interaction prompt "E: Talk"
  - toasts
  - damage numbers (a DOM pool positioned via `vector.project(camera)`; capped at 20)
- **Dialog box**:
  - portrait, name and typewriter text (30 chars/s; press to complete, press again for the next line)
  - choices
  - the game pauses or slows (`game.setMode('dialog')`) while it is open
- **Menus**: title, pause (resume / settings / quit to title), settings (volume ×3, invert Y, sensitivity, quality low/med/high/auto, touch button size), game over, credits.
- **Rendering**: UI renders from bus events plus a 10 Hz poll of `ctx.state` for counters. It never reads three objects directly, except `project()` for world-anchored labels.
- **Style**: a cute medieval look, using Google Fonts loaded via CSS (for example "MedievalSharp" for titles plus a rounded body font; **[unverified]** availability/licence, so check before use). Use CSS `clamp()` sizes and respect `env(safe-area-inset-*)`.

---

## 16. Save (localStorage) [rec]
```js
// save/SaveManager.js
const KEY = 'swordcat.save.v1';
export const defaultSave = () => ({ v: 1, levelId: 'meadow', spawnId: 'start', hp: 6, maxHp: 6, holy: 0,
  flags: {}, inventory: {}, kittens: [], quests: {}, playtime: 0, savedAt: 0,
  settings: { master: 0.8, music: 0.6, sfx: 0.8, invertY: false, sensitivity: 1, quality: 'auto' } });
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  // if (d.v === 1) { ...; d.v = 2 }    // future migrations, one step at a time
  const base = defaultSave(); return { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) } };
}
export class SaveManager {
  load()  { try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; } }
  write(d) { try { localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() })); return true; } catch (e) { console.warn('[save] failed', e); return false; } }
  clear() { try { localStorage.removeItem(KEY); } catch {} }
}
```
- **Autosave** on `CHECKPOINT`, `LEVEL_LOADED`, `KITTEN_RESCUED` and quest completion.
- `GameState` is the single runtime source of truth and is serialized as a whole.
- **Settings** are saved immediately when changed.
- **Access** is wrapped in try/catch: private mode or quota failures must not crash the game.

---

## 17. Assets and loading [rec]
```js
// core/Assets.js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';   // self-contained, no extra files to copy
import { E } from './events.js';
const BASE = import.meta.env.BASE_URL;
export class Assets {
  constructor(ctx) {
    this.manager = new THREE.LoadingManager(); this.cache = new Map();
    this.manager.onProgress = (url, n, total) => ctx.bus.emit(E.PROGRESS, { n, total });
    const draco = new DRACOLoader(this.manager).setDecoderPath(`${BASE}draco/`);               // only needed for DRACO files
    this.gltfLoader = new GLTFLoader(this.manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    this.tex = new THREE.TextureLoader(this.manager);
  }
  gltf(path) { if (!this.cache.has(path)) this.cache.set(path, this.gltfLoader.loadAsync(BASE + 'assets/' + path)); return this.cache.get(path); }
  texture(path, { srgb = true, repeat = false } = {}) { /* cached; tex.colorSpace = SRGBColorSpace for color maps; anisotropy 4 */ }
}
```
- **Pipeline for downloaded models**: run `npx @gltf-transform/cli optimize in.glb public/assets/models/out.glb --compress meshopt --texture-compress webp --texture-size 1024`. CLI 4.2.3 **[unverified flags: check `--help`]**. GLTFLoader supports `EXT_meshopt_compression` and `EXT_texture_webp`.
- **DRACO**: if needed, copy `node_modules/three/examples/jsm/libs/draco/gltf/*` (draco_decoder.js/.wasm and draco_wasm_wrapper.js are present in r186 **[measured]**) to `public/draco/`.
- **Static vs skinned**: static props should be cloned with `.clone()` (sharing geometry) or, better, rendered as `InstancedMesh` when there are 10 or more copies. Skinned meshes need `SkeletonUtils.clone`.
- **Licences**: record every downloaded asset's source URL, licence and author in `public/assets/CREDITS.md`. That file is the asset agent's job.

---

## 18. Performance budget [rec; target = this machine's Iris Xe at 1080p, 60 fps; mobile [unverified]]

| Budget | Desktop iGPU (high/med) | Mobile (low) |
|---|---|---|
| Draw calls (`renderer.info.render.calls`) | ≤ 150 | ≤ 80 |
| Visible triangles | ≤ 600k | ≤ 200k |
| Pixel ratio | `min(dpr, 1.5)` | `min(dpr, 1.0)`, plus dynamic resolution |
| Shadow map | 1 directional, 2048, ±20 m following the player; only characters and large props cast | 1024 or blob shadows (decal discs) |
| Post | bloom + OutputPass (+ MSAA 4) | none, or bloom at half resolution |
| Grass blades | 15k to 30k | ≤ 4k, recycled around the player |
| Skinned characters on screen | ≤ 12; mixers off beyond 40 m | ≤ 6 |
| Lights | hemisphere + 1 directional (+ ≤ 2 point lights, preferably emissive + bloom) | hemisphere + directional |
| Textures | ≤ 1024² per character, atlases ≤ 2048²; total ≤ 64 MB GPU | half size |
| Particles | pooled, 1 `InstancedMesh` or `Points` per material, ≤ 2000 | ≤ 500 |
| JS per step | ≤ 4 ms for all systems; no allocations in update/render | same |

- **Instancing**: use it for every repeated prop (trees, rocks, flowers, fence posts). Use `BatchedMesh` for many *different* static meshes that share one material.
- **LOD**: `THREE.LOD` for trees (mesh → billboard beyond 50 m), and fog to hide far culling (`camera.far` of about 150 m with fog density tuned).
- **Dynamic resolution**: if the smoothed frame time is over 18 ms for 2 s, step the pixel ratio down by 0.1 (minimum 0.6). Step it up again when under 12 ms. Quality `auto` picks the starting preset from `renderer.capabilities` plus `(pointer: coarse)`.
- **Debug overlay**: `?debug=1` shows Stats plus `renderer.info` (calls, tris, geometries, textures) plus lil-gui tunables.

---

## 19. Testing strategy

### 19.1 Results on this machine [measured]
- `playwright@1.63.0` installed, and `npx playwright install chromium` succeeded. Browsers are cached at `%LOCALAPPDATA%\ms-playwright\` (`chromium-1243`, `chromium_headless_shell-1243`, plus Playwright's own `ffmpeg-1011` for video). **Pin playwright 1.63.0** so the project reuses this browser build without a new download.
- **Default headless** uses SwiftShader (software). WebGL2 works but runs at about **2.7 fps**, too slow for timed input tests.
- **Headless with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`** uses the real **Intel Iris Xe (D3D11)**, at **49 to 55 fps** for a test scene (bloom, shadows, 5k to 20k instances), with no console errors. **Use these flags.** Keep `--use-angle=swiftshader --enable-unsafe-swiftshader` as a fallback (`--swiftshader`), which ran at about 4.5 fps.
- Vite 8.3.3 `preview()` JS API plus Playwright worked end to end: boot, keyboard input, screenshots, exit code 0.

### 19.2 Layers
1. **`npm run build`** (Vite). Catches syntax and import errors. Required before any agent hands off.
2. **`npm run test:unit`** (`node --test`) on pure modules: Heightfield, `sectorHit`, combo and FSM transitions with a fake ctx, save `migrate`, AttackTokens, event-catalog contract (`KNOWN` has no duplicates), and a module-contract test that every system exports `init/update/dispose`. Never touch the DOM in these modules at import time.
3. **`npm run smoke`** (Playwright): loads `/?test=1&seed=1`, fails on any `pageerror`, `console.error` or failed request (404 asset), drives inputs, and saves screenshots to `tests/shots/`. Agents should **Read the PNGs** to visually verify their work.

### 19.3 Test hooks (core/debug.js; only when `?test` or `?debug` is present)
```js
window.__GAME__ = {
  ready: false,                         // set true after title skipped (test mode auto-starts) + first level loaded + 10 frames
  get frame() { return game.frameCount; },
  get levelId() { return ctx.levels.current?.id; },
  state: () => ({ player: { pos: ctx.player.pos.toArray(), hp: ctx.player.hp, state: ctx.player.stateName },
                  enemies: ctx.enemies.list.length, calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles }),
  loadLevel: (id, spawn) => ctx.levels.load(id, spawn),
  teleport: (x, y, z) => ctx.player.teleport({ pos: new THREE.Vector3(x, y, z), facing: 0 }),
  god: (on = true) => { ctx.player.god = on; },
  skipDialog: () => ctx.story.skipAll(),
  sampleCanvas() {                      // blank-screen check: render, then read 64 pixels in the same task [measured: works w/o preserveDrawingBuffer, 34 colors on test scene]
    game.frame(1, 0); const gl = ctx.renderer.getContext(); const px = new Uint8Array(4); const seen = new Set();
    for (let i = 0; i < 64; i++) { gl.readPixels(((i % 8) + 0.5) * gl.drawingBufferWidth / 8 | 0, ((i >> 3) + 0.5) * gl.drawingBufferHeight / 8 | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); seen.add(px.join()); }
    return seen.size;                   // fail if < 4
  },
};
```

### 19.4 tests/smoke.mjs (verified skeleton) [measured: ran OK]
```js
// Usage: npm run build && node tests/smoke.mjs [--headed] [--swiftshader]
import { preview } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';

const PORT = 4173;
const GPU_ARGS = process.argv.includes('--swiftshader')
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];      // real iGPU on Windows
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
fs.mkdirSync('tests/shots', { recursive: true });
const shot = (n) => page.screenshot({ path: `tests/shots/${n}.png` });
const G = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.goto(`http://localhost:${PORT}/?test=1&seed=1`);
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 45000 });
  await shot('00-boot');
  if ((await G(() => window.__GAME__.sampleCanvas())) < 4) errors.push('canvas looks blank');
  const p0 = (await G(() => window.__GAME__.state())).player.pos;
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  const p1 = (await G(() => window.__GAME__.state())).player.pos;
  if (Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 1) errors.push('player did not move with W');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(250); }   // combo
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(1300); await page.keyboard.up('KeyJ'); // holy slash
  await page.waitForTimeout(300); await shot('01-combat');
  for (const id of ['meadow', 'forest', 'village', 'castle']) {                                       // every level boots
    await G((l) => window.__GAME__.loadLevel(l), id);
    await page.waitForTimeout(800); await shot(`lvl-${id}`);
    const s = await G(() => window.__GAME__.state());
    console.log(id, 'calls', s.calls, 'tris', s.tris);
    if (s.calls > 250) console.warn(`WARN ${id}: draw calls ${s.calls} over budget`);
  }
  const f0 = await G(() => window.__GAME__.frame); await page.waitForTimeout(1000);
  console.log('fps ~', (await G(() => window.__GAME__.frame)) - f0);
} catch (e) { errors.push(`smoke: ${e.message}`); }
await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (errors.length) { console.error('SMOKE FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('SMOKE OK');
```
The core agent writes this file once; other agents append steps for their features. A quick manual alternative is `npm run dev` plus `node tests/smoke.mjs --headed` against `vite preview`.

---

## 20. Parallel-agent work plan [rec]

**Phase 0 (one "core" agent, first; everything else waits on this):**
- `package.json`, `vite.config.js`, `index.html`
- all of `src/core/*`
- `events.js` (frozen), `config.js`, `Actor.js`
- **stub implementations of every system** (empty classes that satisfy §4.2). A stub level is a flat heightfield plus a few boxes, and a stub player is a capsule that moves with WASD.
- `tests/smoke.mjs`, `tests/unit/contracts.test.js`

Exit criterion: `npm run check` is green with stubs.

**Phase 1 (parallel; each agent edits ONLY its folders):**

| Agent | Owns | Consumes | Produces |
|---|---|---|---|
| physics | `src/physics/` | LevelData | `moveActor`, `raycast`, `heightAt`, `separateActors` |
| camera | `src/camera/` | player, physics.raycast, input.look | camera transform, shake (listens to `fx:shake`) |
| player | `src/player/` | input, physics, combat, attacks | Player actor, model and anim, PLAYER_* events |
| combat | `src/combat/` | actors registry | sweeps, applyHit, projectiles, tokens, HIT events |
| enemies | `src/enemies/` | combat, physics, LevelData.enemySpawns, assets | ENEMY_* events |
| companions | `src/companions/` | physics, story flags | follower kittens, KITTEN_RESCUED |
| world | `src/world/`, `public/assets/` (levels) | assets | LevelData per level, grass, sky, props |
| fx | `src/fx/` | bus events | particles, trail, damage numbers |
| audio | `src/audio/`, `public/assets/audio/` | bus events | sound and music |
| story | `src/story/` | bus, state | dialog data, quests, flags, cutscene steps |
| ui | `src/ui/` (+ `ui.css`) | bus, state, input | HUD, dialog, menus, touch |
| save | `src/save/` | state | persistence |

**Rules:**
- Never edit another agent's folder.
- Need a new event or ctx field? Ask the core owner. Additive changes only to `events.js` and `config.js`, which the integrator merges.
- Each agent adds unit tests under `tests/unit/<area>.test.js` and may add smoke steps in a clearly marked block.
- Before handoff: `npm run build && npm run test:unit && npm run smoke` must pass, and the agent reviews its screenshots.

**Phase 2 (integrator):** tune `config.js`, balance, perf pass against §18, final smoke, and a production `dist/` that works from any static host (`base: './'`).

---

## 21. Sources
- three.js migration guide (r159 to r186): https://github.com/mrdoob/three.js/wiki/Migration-Guide
- three.js `games_fps` example (Octree + Capsule + Timer, substeps): https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/games_fps.html
- three.js `Octree.js` r186 API: https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/jsm/math/Octree.js
- r186 release coverage (GaussianSplat is WebGPU-only): https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186
- Vite 8 announcement / Rolldown migration: https://vite.dev/blog/announcing-vite8
- pmndrs postprocessing (merged effect passes; don't mix with three's composer): https://github.com/pmndrs/postprocessing
- Rapier vs cannon comparison (secondary source): https://learnwithhasan.com/js-libraries/compare/rapier-vs-cannon-js/
- Godot SpringArm (spring-arm camera pattern): https://docs.godotengine.org/en/3.6/classes/class_springarm.html
- Instanced grass at scale (three forum): https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286
- Codrops fluffy grass: https://tympanus.net/codrops/?p=83092
- Headless WebGL (SwiftShader vs GPU flags): https://www.createit.com/?p=3319 and https://microlink.io/blog/webgl-without-a-gpu
- Web Audio autoplay / iOS interrupted state (secondary): https://app.cinevva.com/tutorials/web-audio-api-games.html
- Trauma-based shake and hitstop (secondary summaries): https://uhiyama-lab.com/en/notes/ue/game-feel-hit-feedback/ and https://dev.to/saltmire/godot-4-screen-shake-and-hit-stop-in-one-script-11eh
- npm registry (`npm view`) for every version listed in §1 (checked 2026-10-07).
