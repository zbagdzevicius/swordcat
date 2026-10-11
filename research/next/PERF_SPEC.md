# PERF_SPEC: binding performance spec for the iso, warm-toon SWORDCAT

**Status:** FINAL and binding once the lead accepts it. It **replaces `research/tech.md` §18** ("Performance budget")
and amends GAME_DESIGN §17 (post, fur) and CONTROLS_SPEC §2.1 / §2.8 where marked **[amends]**.
**Sources:** `research/next/perf_0.md` (measured hotspots), `perf_1.md` (GPU / render architecture), `perf_2.md`
(CPU / load architecture), and the two judge verdicts on them. Where the drafts disagree, §17 lists what was chosen
and what was rejected. three.js **0.186.1** APIs are used throughout.
**User brief this serves:** *warm and cartoonish, so everyone feels great inside, not a 90s nostalgic game;
performance must be extraordinary; MOBA-like automatic camera.*

Two principles run through the whole spec:
1. **A stutter breaks the warm feeling more than a lower average fps does.** Hitches are fixed first (§3).
2. **The warm toon look and the perf work point the same way.** Toon shading measured as never more expensive than
   PBR (perf_0 §2.3: −0.05 to −1.63 ms GPU). Soft blob shadows, Neutral tone mapping, dither and a warm splash serve
   the art brief and the frame budget together.

Art owns every colour, ramp value and silhouette (`research/next/ART_WARM_SPEC.md`; "ART_SPEC" below means that
file). This spec owns cost limits, mechanisms and gates. Where a number below is a colour, it is a default that
ART_WARM_SPEC overrides at the same cost. "CAMERA_SPEC" below means `research/next/AUTOCAM_SPEC.md`.

**Cross-spec reconciliation (2026-10-11, binding):** cross-checked against ART_WARM_SPEC, AUTOCAM_SPEC and
CONTROLS_SPEC. Decisions **X1–X37** are in `research/next/IMPLEMENTATION_PLAN.md` §2; the merged budget table is its
§5 and the merged `QUALITY` keys its §4. The ones that change this file (edited in place, marked `[X#]`):
- **X1 play path:** direct to the canvas on **every** tier, canvas `antialias: true`, **0 post passes in play**. The
  §6.1 uber pass survives only as (a) the High-tier cinematic chain (X2) and (b) a Med FXAA fallback that ships only if
  the §6.1 A/B shows canvas MSAA costs > 1.5 ms GPU more than FXAA at an equal S1 judgement.
- **X2 bloom:** High only, cutscenes + ending; never in gameplay (Holy / Golden glow = glow cards + exposure on every
  tier), never on the title or Meme Cam.
- **X3** Neutral; ART's in-material `toonGrade` (no screen grade); `material.dithering` on every tier; CSS
  `#ui-vignette` on every tier. **X4** `setPixelRatio` dynamic resolution on every tier; maxDpr 1.25 / 1.25 / 1.5.
- **X5 materials:** world = Lambert + ART §4.1 global toon patch; actors = ART `sc-toon-v2` (this is "WarmToon");
  `TOON_U` is merged into ART's `ENV_U` and delivered by world's `withHeightFog` hook; `uShadowTint` and the
  NearestFilter `RAMP` are dropped. **X6** no PointLights (as §8.2).
- **X7 shadows:** Med **1024**, High 2048; stage 2 cached box = footprint fit + 8 m margin (not 64 × 64 m).
- **X8 fur:** iso shells Low 0, Med **0**, High 4 only if S2 passes. **X9 outlines:** ART widths/colour; Med
  hero + boss + companions + ≤ 4 engaged. **X10** hero end ≤ 6 draws (her eyes stay a separate draw).
- **X11 grass:** §8.4 geometry/counts, ART look, tile centred on the footprint. **X12 far:** one merged formula
  (§8.3). **X13** `activityOf` (frustum) vs `onScreen` (SafeFrame-visible, AUTOCAM §7.3) are different functions.
- **X14** budgets merged (§1.2 edited). **X15** AUTOCAM's camera ms gates follow §14.4 too. **X17** no composer and
  no shell compile before T_title. **X18** Fredoka is the only font (no Cinzel preload). **X20** camera publishes the
  footprint, world computes the shadow box (K3 removed). **X21** cooldown sweeps as CSS animations.

---

## 0. Where we are (counts and ratios only)

The drafts were all measured under 70–100 % CPU contention on a shared machine. **Only counts, ratios and interleaved
deltas are quoted as facts.** No absolute ms or fps from the drafts is a threshold (§14.4 says how thresholds are
set).

| Fact (measured) | Value | Source |
|---|---|---|
| ANGLE-GL (smoke default) vs ANGLE-D3D11 (real Windows Chrome) on the same Iris Xe | GL is 1.5–2× faster: smoke runs **hide a GPU problem** | perf_0 §2.1 |
| Med composer: 4× MSAA on a HalfFloat RT | **−8.0 of 16.0 ms GPU** on D3D11 (−3.4 to −5.1 on GL): the #1 GPU cost | perf_0 §2.3 |
| Bloom (UnrealBloom, full res, 5 mips, 13 draws) | −4.7 ms GPU on D3D11; OutputPass 3.7 ms + vignette 0.55 ms more | perf_0 §2.1 |
| Shadow pass | +37 to +66 draws per frame; one shared depth material flips programs **8–18× per frame**; −2.2 to −7.6 ms CPU submit | perf_0 §2.4–2.5, perf_1 §1 |
| Hero visuals (cape verlet + Catmull-Rom + `computeVertexNormals`) | **13–29 % of frame CPU** in every scenario; top allocator | perf_0 §2.4, perf_2 §2.3 |
| NPC kittens in the hub | 20–35 % of frame CPU | perf_0 §2.4 |
| Hero geometry | 19–31 draws, ~200k triangles (40 % of the meadow); fur shells ~105k of them | perf_1 §1, art_1 §0.2 |
| Programs live per level | 88–151 (fresh), 241 cumulative across a session | perf_0, perf_1 |
| Fixed-step spiral on a 4× throttled "phone" | 4–5 steps per frame (`LOOP.maxSteps 5`) | perf_0 H8 |
| Spawn hitch (4 enemies) | worst frame 58–388 ms against a 9–47 ms median | perf_2 §2.3 |
| First key press / tap | bakes every zzfx SFX + 2 s of pink noise on the main thread: **22 MB in one burst** | perf_0 §2.6 |
| Boot CPU in program link-status checks (`checkShaderErrors` is on in prod) | 6–9 s | perf_2 §2.2 |
| Boot to title | 16.9–22.7 s desktop, 42 s on 4G + 4× CPU; 17.97 MB / 347 requests; grey `#B7C0C3` until then | perf_2 §2.2 |
| Allocation churn | 263–789 KB per frame | perf_0 §2.6 |
| tech.md §18 budgets (≤ 150 calls, ≤ 600k tris) | **all met**, and the game is still 2–4× too slow: those budgets measure the wrong things | perf_0 §0 |
| The iso camera alone | −25 to −35 % triangles, forest draws 183 → 105; does **not** fix post, shadows or character CPU | perf_0 §4, perf_1 §1 |

---

## 1. Targets and budgets (replace tech.md §18)

### 1.1 Device classes

| Class | Reference device | Preset | Frame target |
|---|---|---|---|
| **Phone** | mid Android (Snapdragon 7-series / Dimensity 7000 / Adreno 6xx–7xx / Mali-G77+), iPhone A14+ | `low` | **60 Hz** (auto falls back to a 30 lock only per §5.4) |
| **Laptop iGPU** | Intel Iris Xe, Chrome on ANGLE-D3D11, 1920×1080 | `med` | **60 Hz** at render scale s ≥ 0.85 |
| **Discrete** | any GTX 1060-class or better | `high` | 60–144 Hz |

Proxy until a real phone is measured: Iris Xe + CDP `Emulation.setCPUThrottlingRate(4)` + Pixel 7 viewport. GPU ms
from the proxy are **not** phone numbers.

### 1.2 Per-frame budgets (iso play, idle machine, real Chrome)

| Budget | Low (phone) | Med (Iris Xe D3D11 1080p) | High | How measured |
|---|---|---|---|---|
| Frame p50 / p99 | 16.7 / 25 ms | 16.7 / 25 ms | ≤ 16.7 / 25 ms | `__GAME__.perf()` rAF intervals |
| GPU | ≤ 10 ms (real phone, TBD) | **≤ 9 ms at s = 1** | ≤ 7 ms | `EXT_disjoint_timer_query_webgl2` |
| Main-thread CPU total | ≤ 3.5 ms at 1× (≤ 14 ms at the 4× proxy) | **≤ 6 ms** | ≤ 6 ms | sum of the buckets below |
| … fixed sim per step (all systems) | ≤ 0.8 ms | ≤ 1.0 ms | ≤ 1.0 ms | probe wrappers |
| … render-side systems (cape, fur, camera, fx, ui, audio) | ≤ 1.0 ms | ≤ 1.5 ms | ≤ 1.5 ms | probe wrappers |
| … three submit (`postfx.render` CPU) | ≤ 1.5 ms | ≤ 2.5 ms | ≤ 3 ms | probe wrappers |
| … GC (amortised) | ≤ 0.2 ms | ≤ 0.2 ms | ≤ 0.2 ms | heap sampler |
| Fixed steps per rendered frame (avg) | ≤ 1.3 | ≤ 1.2 | ≤ 1.2 | loop counter |
| **Scene draw calls** (end state) | **≤ 40** | **≤ 60** | ≤ 90 | `renderer.info.render.calls` |
| … interim ceiling **I1** (before §7–§9 land), frame incl. shadow + post | ≤ 70 | ≤ 120 | ≤ 150 | same |
| … interim ceiling **I2** (after ART A1 + shadow stage 1), frame incl. shadow | ≤ 60 | ≤ 90 | ≤ 110 | same |
| … boss fights | +15 | +15 | +15 | |
| Post draws in play [X1] | 0 | 0 (1 only with the FXAA fallback) | 0 (cinematic chain ≤ 7, cutscenes only) | counted in the chain |
| Shadow draws per frame | 0 | 0 on ≥ 95 % of frames (cached map, stage 2) | same | `shadowCalls` |
| Triangles | **≤ 80k** | **≤ 150k** | ≤ 260k [X14] | `renderer.info.render.triangles` |
| **Programs per level** (fresh page) | **≤ 30** | **≤ 40 now, ≤ 30 once WarmToon lands** | ≤ 36 play + ≤ 36 cinematic variants (X2) | `renderer.info.programs.length` |
| Programs compiled during play | **0** | **0** | **0** | `perf:no-compile` (§14) |
| Program re-resolves per frame | **0** | **0** | **0** | patched `setProgram` counter (§14) |
| Allocation | ≤ 32 KB/frame total; game code ≤ 512 KB/s | same | same | CDP heap sampling |
| Long tasks during play | none > 100 ms | none > 50 ms | none > 50 ms | long-task observer |
| Spawn of a full wave | worst frame ≤ 1.5× median | same | same | `perf:spawn` |
| Particles alive | ≤ 300 | ≤ 1500 | ≤ 2000 | fx pools |
| GPU texture memory | ≤ 48 MB | ≤ 96 MB | ≤ 160 MB | `perf().texMB`: core wraps `Texture` upload once (`?perf` only) and sums w × h × bytes/texel × (mips ? 4/3 : 1) for live textures + render targets |
| JS heap in play | ≤ 90 MB | ≤ 120 MB | ≤ 120 MB | `performance.memory` |

### 1.3 Startup and load budgets (production build, cold cache)

| Metric | Desktop (50 Mbps / 20 ms RTT) | Phone (4G 9 Mbps / 150 ms RTT, 4× CPU) |
|---|---|---|
| **T_paint** (first warm pixel: the inline splash) | **≤ 0.3 s** | ≤ 0.8 s |
| **T_title** (logo visible, backdrop renders, input accepted) | **≤ 2.0 s** (hard cap 3.0) | **≤ 5.0 s** (hard cap 6.0) |
| Press at the title → first gameplay frame (wait the player sees) | ≤ 1.5 s (CS-00 masks the rest) | ≤ 3 s |
| Level transition, veil up → first frame | ≤ 2.5 s (≤ 1.0 s prefetched) | ≤ 6 s (≤ 2.5 s prefetched) |
| Bytes / requests before T_title | ≤ 1.5 MB / ≤ 40 | same |
| Critical-path JS (`boot` + `three`) | ≤ 355 KB gz | same |
| p0 download per level | ≤ 4 MB | same |
| Prewarm (programs + 1 frame) | ≤ 600 ms, never one task > 50 ms | ≤ 1.5 s, never one task > 100 ms |
| Main-thread long tasks before T_title | none > 200 ms after T_paint | none > 400 ms |
| JS heap at T_title | ≤ 60 MB | ≤ 60 MB |

### 1.4 What "extraordinary" means here (the user-facing promise)
- 60 fps on a mid phone and on an Iris Xe laptop, with **no hitch a player can feel**: zero shader compiles in play,
  zero GC pauses > 4 ms, no audio bake mid-fight, no spawn stall.
- A warm picture **within 0.3 s** of opening the URL, and an interactive title in 2 s.
- Dynamic resolution and the thermal ladder protect the frame rate; they **never** change the camera framing.

---

## 2. Quality presets (config; core owns)

These keys are added to `src/core/config.js` `QUALITY` / `LOOP` / `RENDER` in **one** core commit, merged with the
controls rework's §13 config (not around it). Values are binding.

```js
export const LOOP = { step: 1 / 60, maxSteps: 4, maxStepsLow: 3, maxFrameDt: 0.1 };   // §4.1 (was maxSteps 5)

export const QUALITY = {   // [X1–X11] the ONE merged key set (IMPLEMENTATION_PLAN §4); comments name the owning section
  low: { id: 'low',
    maxDpr: 1.25, dynRes: { min: 0.6, max: 1.0, step: 0.05 },                     // §5 (setPixelRatio on every tier)
    aa: 'canvas', cinematic: false,                                                // §6 (X1, X2): no composer in play
    toneMapping: 'neutral', dither: true, cssVignette: true, glowCards: true,
    shadows: 'none', shadowMap: 0, vertexAO: 'height',                            // §7
    furShellsIso: 0, furShellsClose: 8, kittenShellsIso: 0, charTufts: false,     // §9.3 (X8)
    outline: 'hero', grassTufts: 1300, groundMist: 4, particles: 300,
    maxEnemies: 6, maxSkinned: 6, fpsCap: 60, programs: 30 },
  med: { id: 'med',
    maxDpr: 1.25, dynRes: { min: 0.7, max: 1.0, step: 0.05 },
    aa: 'canvas' /* 'fxaa' only if the §6.1 A/B says so (build-time constant RENDER.medAA) */, cinematic: false,
    toneMapping: 'neutral', dither: true, cssVignette: true, glowCards: true,
    shadows: 'sun', shadowMap: 1024, vertexAO: 'none',
    furShellsIso: 0, furShellsClose: 16, kittenShellsIso: 0, charTufts: true,
    outline: 'heroCompanionsEngaged', grassTufts: 4000, groundMist: 8, particles: 1500,
    maxEnemies: 8, maxSkinned: 12, fpsCap: 60, programs: 40 /* → 30 after WarmToon */ },
  high: { id: 'high',
    maxDpr: 1.5, dynRes: { min: 0.8, max: 1.0, step: 0.05 },
    aa: 'canvas', cinematic: true, cinematicSamples: 4, bloomRes: 0.5, bloomMips: 3,
    toneMapping: 'neutral', dither: true, cssVignette: true, glowCards: true,
    shadows: 'sun', shadowMap: 2048, vertexAO: 'none',
    furShellsIso: 0 /* 4 only if S2 passes */, furShellsClose: 16, kittenShellsIso: 0, charTufts: true,
    outline: 'all', grassTufts: 8000, groundMist: 8, particles: 2000,
    maxEnemies: 8, maxSkinned: 12, fpsCap: 0 /* uncapped */, programs: 36, programsCinematic: 36 },
};
// RENDER: exposure 1.0; far for iso comes from §8.3 (classic and presets keep 600); toneMapping Neutral (§6.2);
// medAA 'canvas' | 'fxaa' (build-time, §6.1 A/B); toon (ART §4.1).
// Retired keys (read with fallbacks until every reader moved): composer, msaa, canvasAA, hdrTarget, bloom, furShells,
// kittenShells, grass, staticShadowMap, minDpr. QUALITY.*.shadows true/false → 'sun' / 'none'.
```

Quality `auto` (default): `low` when `(pointer: coarse)` and `min(innerWidth, innerHeight) ≤ 500` or
`navigator.deviceMemory ≤ 4`; `high` when the unmasked renderer string matches a discrete GPU (NVIDIA / AMD Radeon RX /
Apple M-Pro/Max); else `med`. A preset change happens only behind the veil (it recompiles programs).

---

## 3. Zero hitches (P0; none of these files are shared with the controls rework except where noted)

### 3.1 Audio bake before play (audio: `AudioManager.js`, `sfxDefs.js`, `procedural.js`)
Today the first key press unlocks the AudioContext and bakes every zzfx def plus 2 s of pink noise on the main
thread (22 MB in one burst, mid-fight).
- **Bake the samples, not the buffers, before the unlock.** zzfx `buildSamples(...params)` and `pinkNoise()` return
  plain number arrays and need no running context. Run them on the title / loading screen in
  `requestIdleCallback({ timeout: 200 })` slices of **≤ 2 ms** each (`performance.now()` budget check between defs), into
  `Float32Array`s kept in `this.zzPcm: Map<name, Float32Array>`.
- **At unlock** (first gesture) only do `ctx.createBuffer(1, n, sr)` + `buf.copyToChannel(pcm, 0)` per def. That
  is a memcpy: ≤ 3 ms total for every def. Defs not baked yet bake lazily on first play (they are rare).
- Sample rate: bake at `44100`; if the context runs at another rate, create the buffer at 44100 anyway (Web Audio
  resamples on playback).
- The wind buffer (2 s pink noise, `WIND.bufferSec`) bakes the same way, in its own idle slice.
- `OfflineAudioContext` is an allowed alternative for defs that need filters; it must start before the title is
  interactive.
- Bake results persist across levels (session lifetime).
- **Acceptance:** `perf:alloc` around the first key press in the meadow: < 1 MB allocated in the press frame; no long
  task > 50 ms in the 1 s after the press.

### 3.2 No synchronous shader checks in prod (core `Game.js`; one line, coordinate with the rework owner)
```js
renderer.debug.checkShaderErrors = import.meta.env.DEV || params.debug || params.test;
```
three then skips `getProgramParameter(LINK_STATUS)` and the info-log round-trips on first use (6–9 s of boot CPU).
Smoke still runs with `?test`, so shader errors still fail smoke.

### 3.3 Batched prewarm under the veil (world `LevelManager._prewarm`, core helper, enemies, fx)
```js
// core/prewarm.js (new, core) — called by LevelManager after build, before the veil drops; also by the title.
export async function prewarm(renderer, scene, camera, roots, { batch = 12 } = {}) {
  const hidden = [];
  for (const r of roots) { if (r.visible) { r.visible = false; hidden.push(r); } }   // compile in batches, not all at once
  for (let i = 0; i < hidden.length; i += batch) {
    for (let j = i; j < Math.min(i + batch, hidden.length); j++) hidden[j].visible = true;
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);                     // no extension: ≤ 4 new programs per yield (see below)
    await nextFrame();                                         // the veil / title keeps animating at 60 fps
  }
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);                             // one real frame so textures and bone textures upload
}
```
- `compile` / `compileAsync` walk `scene.traverseVisible`, so **warm stand-ins must be `visible: true`** and placed
  out of the view (y −50 or behind the camera), not hidden.
- Without `KHR_parallel_shader_compile` (some Android, headless GL), `roots` are split so that each yield adds ≤ 4
  new programs.
- **The warm set must contain one of every variant that can appear in this level:**
  - every enemy type the level can spawn (`levelEnemyWarm(def)`), including its props and its depth variant;
  - every fx pool (telegraphs, ground decals, trails, halos, glow cards, damage numbers, poofs, shockwaves, Horde);
  - every shadow-depth variant still in use (§7.1);
  - the focus-fog patched variant of every material (CONTROLS_SPEC §4.1);
  - the x-ray silhouette proxy (`GreaterDepth`) and the outline hull;
  - **High only (X2):** the cinematic RT variant of every program above (one extra batched pass with the
    `PostChain` scene RT bound) and the close-up PMREM steel plate;
  - the forest night state (lamps are uniforms after §8.2, so this is the same program set; assert it).
- **Drop** the "2 real frames with culling off over the whole level": that is what made prewarm frames take 1–2 s.
- Keep the existing "stand-in keep" trick (detached visuals hold their programs).
- Close-up fur shells compile once on the title screen **after T_title** in idle `compileAsync` slices (X17), never
  before T_title and never in play.
- **Acceptance:** `perf:no-compile` (§14.2).

### 3.4 Enemy visual pool (enemies `EnemyManager.js`, `Enemy.js`)
```js
// enemies/VisualPool.js (new, enemies)
class VisualPool {                       // one per `type + dressingKey`
  constructor(build) { this.build = build; this.free = []; }
  async prefill(n) { while (this.free.length < n) this.free.push(await this.build()); }
  acquire() { return this.free.pop() ?? null; }  // null → build async (and count a pool miss in perf())
  release(v) { v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.root); v.root.removeFromParent(); v.reset(); this.free.push(v); }
}
// visual = { root, mixer, actions, mats, reset() }: reset() poses idle, clears tint uniforms, sets visible.
```
- The level prefills **`max(waveSize)` per type** under the veil (arena wave tables + `levelEnemyWarm`). Bosses are
  not pooled (one per level, prewarmed).
- `Enemy` actor objects stay `new` per spawn (small); ids stay monotonic.
- **Acceptance:** `perf:spawn` (§14.2): spawn the largest wave of the level; worst frame in the next 30 frames ≤ 1.5×
  the median of the 60 frames before; `perf().poolMisses === 0`.

### 3.5 Zero program re-resolves (world, characters, enemies, fx)
- **Never share one material between a `Mesh` and an `InstancedMesh`, or a `SkinnedMesh` and a plain `Mesh`, or a
  `BatchedMesh` and anything else.** Clone once per kind and cache: `matFor(base, kind)` keyed by
  `base.uuid + '|' + kind`. Known offender: the wood `MeshStandardMaterial` shared by `practiceGate` / `swingingSack` /
  `wobble_body` (Mesh) and `fence_simple` / `gate_posts` / `lantern_post` (InstancedMesh with `instanceColor`).
- **Every caster that still casts** (§7.1) gets a per-kind `customDepthMaterial` from one shared table:
```js
// core/depth.js (new, core; used by world, characters, enemies)
const D = { plain: null, skinned: null, instanced: null, batched: null };
export function depthFor(o) {
  const k = o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh ? 'instanced' : o.isBatchedMesh ? 'batched' : 'plain';
  return (D[k] ??= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
}
// at build: if (o.castShadow) o.customDepthMaterial = depthFor(o);
// alpha-tested casters: one clone per alphaMap, cached by alphaMap.uuid + kind.
```
- Every `onBeforeCompile` patch sets `customProgramCacheKey = () => '<patch-kind>-v<N>'`, **constant per patch
  kind**, never per instance (HeightFog, fur, cape, WarmToon, sway, telegraphs).
- **Acceptance:** 0 re-resolves over 60 idle frames and over 300 combat frames (§14.2 `perf:reresolve`).

---

## 4. Loop, scheduling and activity LOD (core, camera, enemies, companions, characters)

### 4.1 Fixed step and the spiral of death (core `Loop.js`; after the rework merges)
- The **60 Hz fixed step stays everywhere**. The parry window (0.15 s) and hitstop need it. No 30 Hz sim step on any
  preset.
- `maxSteps` = **4** (Med, High) and **3** (Low). When the cap is hit, **drop the remainder** (`acc = 0`): game time
  dilates for that frame instead of catching up. `maxFrameDt` 0.1 stays.
- Count `stepsThisFrame` and expose it in `perf()`.
- Pause the loop on `document.hidden` (`renderer.setAnimationLoop(null)`), resume on visible; the existing
  `Timer.connect(document)` resets the delta.

### 4.2 Deterministic sub-rate scheduler (core `schedule.js`, new)
```js
// depends only on game.stepCount, so replays and ?test stay reproducible
export const every = (game, hz, phase = 0) => hz > 0 && ((game.stepCount + phase) % Math.max(1, Math.round(60 / hz))) === 0;
```

| Work | Rate | Notes |
|---|---|---|
| Combat resolve, player, physics move, projectiles, enemy steering, FSM / telegraph timers | **60 Hz** | timing-critical; windups and strikes never sub-sample |
| Enemy think (target, attack choice, flank slot) | tier 0: **20 Hz**, tier 1: 5, tier 2: 2 (arena-bound: ≥ 5), tier 3: asleep | phase = actor id |
| Perception (LOS raycasts, `queryRadius`) | tier 0: 10 Hz, 1: 5, 2: 2 | cached result |
| Companion think | 10 Hz | steering 60 Hz |
| Objectives, arenas, triggers | 10 Hz | |
| Audio director (threat), listener update | 4 Hz / 20 Hz | §10.5 |
| HUD poll | 10 Hz | exists |
| Grass trample / wheat | 30 Hz | render side |
| Fog-radius cull, lamp sort, tile visibility | 4 Hz | §8 |

### 4.3 Activity tiers keyed to the iso camera (camera provides; every actor area consumes)
```js
// camera/FollowCamera.js (iso rig), once per rendered frame after the pose is set, before actors render
// cam.frustum: THREE.Frustum built once per frame (CAMERA_SPEC perf contract); cam.frameId increments.
activityOf(actor) {            // 0 in view (bounding sphere + 2 m margin in cam.frustum) | 1 ≤ 30 m from focus | 2 ≤ 60 m | 3 beyond
  if (actor._tierFrame !== this.frameId) { actor._tier = this._computeTier(actor); actor._tierFrame = this.frameId; }
  return actor._tier;
}
inView(p, r) { /* sphere test against cam.frustum (perf only) */ }
```
**[X13] Two different questions, two functions.** `cam.inView` / `activityOf` answer "is it drawn" (frustum, perf).
`cam.onScreen(p, margin)` answers "can the player see it" (AUTOCAM §7.3: SafeFrame-visible, so HUD and thumb holes
count as hidden) and is used **only** by gameplay fairness rules (no off-screen snipes, crow dives, threat arrows).
AUTOCAM §9.5's `inFootprint` actor skip and ART §7.4's 25 m / 40 m mixer rule are replaced by these tiers; characters
expose `setActivity(tier)` (cape → sway shader, no secondary motion at tier ≥ 1).
`_tier` and `_tierFrame` are predeclared in `core/Actor.js` (hidden-class stability). Classic camera mode returns
tier 0 within 40 m and 3 beyond (today's behaviour).

| Tier | AI think | Mixer | Cape / fur / tail procedural | Blob | Notes |
|---|---|---|---|---|---|
| 0 on screen | 20 Hz | every frame | full (per §9) | yes | |
| 1 near, off screen | 5 Hz | every 3rd frame with accumulated dt | cape → sway shader; shells off | no | still drives threat arrows |
| 2 far | 2 Hz (arena ≥ 5) | frozen | none | no | |
| 3 beyond 60 m | asleep (existing sleeping-far-enemies) | frozen | none | no | |

```js
// enemies/Enemy.js, companions, NpcActor — render(alpha, frameDt)
const MIX_EVERY = [1, 3, 0, 0];
const k = MIX_EVERY[tier]; this._mixAcc += frameDt;
if (k && (game.frameCount + this.id) % k === 0) { this.mixer.update(this._mixAcc); this._mixAcc = 0; }
// hitstop: mixer.update(0) stays (tech.md §11.1)
```

**NPC kittens inside tier 0** (companions `HubKittens.js`, `NpcActor.js`, `LostKitten.js`):

| Band (distance from `cam.focus`) | animate | simulate (fur drag, eyes, scarf) | Look |
|---|---|---|---|
| ≤ 8 m, or in dialogue | every frame | every frame | full play look |
| > 8 m | 30 Hz, staggered `(id + frame) & 1` | 15 Hz | sheen only, no shells |
| tier ≥ 1 | 10 Hz staggered (tier 1), off (tier ≥ 2) | off | culled |

### 4.4 Skinned frustum culling (core `Assets.model`; audit the other 43 `frustumCulled = false` sites)
```js
// after MODEL_FIT: a conservative bind-pose sphere ×1.6 in each SkinnedMesh's local space; culled normally
const s = new THREE.Box3().setFromObject(root, true).getBoundingSphere(new THREE.Sphere()); s.radius *= 1.6;   // world, at fit
root.updateMatrixWorld(true);
root.traverse((o) => { if (!o.isSkinnedMesh) return;
  o.boundingSphere = s.clone().applyMatrix4(_m.copy(o.matrixWorld).invert());   // into mesh-local space
  o.frustumCulled = true; });
```
In r186 the frustum test uses `SkinnedMesh.boundingSphere` when it is set and never recomputes it per frame. A culled
skinned mesh skips its draw, its bone-texture upload and its `setProgram`. Fur shells and grass keep their
camera-following `boundingSphere` instead of `frustumCulled = false`. **Acceptance:** an enemy standing 25 m
off screen adds 0 draws (`perf().byCat.enemies`).

### 4.5 Picking and pathfinding (camera `Picker.js`, physics; budgets for CONTROLS_SPEC §5.3 / §7.6)
- **Never** `Raycaster.intersectObjects(scene, true)`. Ground: an analytic DDA over heightfield cells (≤ 64 cells per
  ray). Actors: ray vs capsule over `ActorRegistry` (≤ 40) + the interactables list. Once per rendered frame, cached
  as `cam.cursorGround`. Budget ≤ 0.05 ms per frame.
- A*: stamped (generation counters, no clearing), typed binary heap (`Int32Array` / `Float32Array`, `MAX_OPEN`
  8192), output into a preallocated `Float32Array(96)` (≤ 48 points): **0 allocations per query**, ≤ 1.5 ms worst
  case on a phone.
- Request queue: ≤ 2 finds per step and ≤ 2 ms summed per step; the player's click is always first.
- Packs of ≥ 4 chasers share a **flow field** (BFS over a 48 × 48-cell window around the player, 5 Hz).
- `NavGrid.build` runs in `physics/navWorker.js` (transferable `Uint8Array` flags + `Float32Array` heights); the 8 ms
  slicing stays only as the fallback (no Worker, `?test`).

---

## 5. Dynamic resolution and frame pacing (core `PostFX.js`, `Game.js`, `Loop.js`)

### 5.1 Mechanism (no reallocation)
| Preset | Mechanism |
|---|---|
| Every tier (X1, X4) | `renderer.setPixelRatio(min(devicePixelRatio, maxDpr) × s)`; no RT exists in play. A canvas resize is cheap but not free: change at most once per 2 s. Each change rewrites the shared `uViewport` (outline widths) in the same frame; the camera anchor (`setViewOffset`) is in CSS px and is unaffected. Gate `perf:dynres-step` (§14.2). |
| Med FXAA fallback / High cinematic (RT paths) | The RT is allocated **once** at `css × maxDpr` (re-allocated only on resize) and rendered into the sub-rect `rt.viewport.set(0, 0, W·s, H·s)` + scissor; the uber pass samples with `uScale = s` (§6.1). |

Render scale floors: Low 0.6, Med 0.7, High 0.8 (never below 0.6: blurry upscales read "90s"). The HUD DOM stays at
native resolution.

### 5.2 Controller (asymmetric; never ping-pongs)
- **Signal:** GPU ms from `EXT_disjoint_timer_query_webgl2` when exposed (one query per frame, read 2–3 frames later),
  else the rAF interval EMA. EMA α = 0.1.
- **Down** one step (−0.05) when GPU EMA > **12.5 ms** (or rAF EMA > **17.5 ms**) for **1.0 s**.
- **Up** one step when GPU EMA < **9.0 ms** for **3.0 s**. Without a timer query, rAF time cannot show headroom under
  vsync, so **probe**: every 5 s at s < max, step up; if the rAF EMA exceeds 17.5 ms within 2 s, step back and double
  the probe interval (max 40 s); reset it to 5 s after a level load.
- `?test` freezes s = 1 (existing `dynamicRes = false`).

### 5.3 Frame cap and refresh rate
- Measure the display refresh from the median rAF interval of the first 60 frames.
- `fpsCap` 60 (Low, Med, auto): on **≥ 100 Hz** displays render every `round(refresh / 60)`-th rAF (120 → 60,
  144 → 72). On 90 Hz render every rAF (90 fps if it fits; dyn-res handles it).
- High: uncapped. The ui setting `settings.fpsCap` = `auto | 30 | 60 | off`.
- The sim step is unchanged (60 Hz, interpolated), so any render rate is fine.

### 5.4 Thermal ladder and the 30 fallback (Low and phones)
When s has sat at the floor for **10 s**, shed in this order, one rung per further 10 s at the floor:
1. grass tufts −50 % (instance count, not density map);
2. particles ×0.5 (fx pools respect `perf.particleScale`);
3. outlines off except the hero and a boss (X9).

If all three rungs are taken and the rAF EMA is still > 18.5 ms for **20 s**, `auto` locks to **30 fps** (2 steps per
frame). It retries 60 after 120 s if the work time (CPU + GPU) is < 12 ms for 30 s. **Battery saver** in the menu =
Low + 30 fps lock. **Never** touch the camera distance, FOV, framing or fog to buy frames.

---

## 6. Post: none in play; one uber pass for High cutscenes and the Med fallback (core `PostFX.js` + `postfx/`)

**[X1] Play, every tier:** `renderer.render(scene, camera)` straight to the canvas, canvas `antialias: true`, Neutral
tone mapping and sRGB in the materials, `material.dithering` on lit materials, the CSS `#ui-vignette`, ART's
in-material `toonGrade`. **0 post draws.** This beats the uber chain below on cost (no HalfFloat RT fill, no 5 bloom
passes, no full-screen triangle) and keeps every program at one variant on Low and Med.

### 6.1 The chain (7 draws) — used only by the High cinematic path (X2) and the Med FXAA fallback
```
scene → RT0 (HalfFloat; samples 4 on High cinematic; RGBA8 samples 0 for the Med fallback; depth on; stencil off;
             allocated once; sub-rect = s)
      → bloom (High cinematic only; half res, dual-Kawase, 3 mips): prefilter ½ → down ¼ → down ⅛ → up ¼ → up ½
      → UBER pass to the canvas (1 full-screen triangle)
```
- **Med never runs the composer MSAA** (the measured −8 ms of 16 on D3D11). The Med fallback is RT0 + the uber pass
  with `USE_FXAA` and no bloom (2 draws). High cinematic: MSAA 4, bloom, no FXAA. Hull outlines are geometry, so they
  need no MSAA.
- Replace `EffectComposer` + `UnrealBloomPass` + `OutputPass` + the vignette `ShaderPass` with a ~80-line
  `core/postfx/PostChain.js` (a full-screen triangle and `renderer.setRenderTarget`). No `ShaderPass` copies.
- Bloom prefilter: threshold **0.9**, soft knee **0.5**; **the NaN guard moves into the prefilter**
  (`c = any(isnan(c)) || any(isinf(c)) ? vec3(0.) : min(c, vec3(64.))`). Bloom strength keeps the current API values
  (base 0.6, tweened for Holy **cutscene** beats up to 1.2; gameplay Holy / Golden Hour never bloom, X2).
- `setBloom`, `setGrade` (the open STATUS request) become uniform writes on the uber material when it exists and are
  no-ops in play (ART §3.3 `setCinematic` is the public API). The vignette is CSS on every tier; `uVig` stays 0.
- The uber pass's `uSat` is **1.0** and `uLift/uGain` identity (ART's `toonGrade` already graded the materials; X3).
- Dual-Kawase down pass: 4 diagonal taps at ±1 texel plus the centre ×4, /8. Up pass: 8 taps (4 edges ×1, 4 diagonals
  ×2), /12. Both at the target mip's resolution, `LinearFilter`, `HalfFloatType`, no mipmaps.

```glsl
// core/postfx/uber.frag.js (core). Order: FXAA (Med) → bloom add → Neutral → warm grade → vignette → sRGB → dither.
uniform sampler2D tScene, tBloom; uniform vec2 uScale, uTexel;          // uTexel = 1 / RT size
uniform float uBloom, uSat, uVig, uVigOff; uniform vec3 uLift, uGain; uniform vec2 uMaxUv;   // uMaxUv = uScale - uTexel
varying vec2 vUv;
#include <tonemapping_pars_fragment>     // NeutralToneMapping(); it already multiplies by toneMappingExposure (set by three)
#include <colorspace_pars_fragment>                                      // sRGBTransferOETF()
vec3 tap(vec2 uv) { return texture2D(tScene, min(uv, uMaxUv)).rgb; }      // never read outside the sub-rect
float lumaTM(vec3 c) { return dot(NeutralToneMapping(c), vec3(.299, .587, .114)); }
vec3 fxaa(vec2 uv) {                                                     // FXAA 3.11 "console" variant: 7 taps
  vec3 cM = tap(uv);
  float lM = lumaTM(cM),
        lNW = lumaTM(tap(uv + vec2(-.5, -.5) * uTexel)), lNE = lumaTM(tap(uv + vec2(.5, -.5) * uTexel)),
        lSW = lumaTM(tap(uv + vec2(-.5,  .5) * uTexel)), lSE = lumaTM(tap(uv + vec2(.5,  .5) * uTexel));
  float lMax = max(max(lNW, lNE), max(lSW, lSE)), lMin = min(min(lNW, lNE), min(lSW, lSE));
  if (max(lM, lMax) - min(lM, lMin) < max(0.0625, max(lM, lMax) * 0.125)) return cM;   // no edge: 1 tap path
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1. / 128.);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8., 8.) * uTexel;
  return 0.5 * (tap(uv - dir * (1. / 6.)) + tap(uv + dir * (1. / 6.)));
}
void main() {
  vec2 uv = vUv * uScale;                                                // dynamic-res sub-rect, bilinear upscale
#ifdef USE_FXAA
  vec3 c = fxaa(uv);
#else
  vec3 c = tap(uv);
#endif
  c += texture2D(tBloom, uv).rgb * uBloom;
  c = NeutralToneMapping(c);                                             // exposure = renderer.toneMappingExposure (1.0)
  float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, uSat);   // warm grade: uSat 1.08
  c = c * uGain + uLift * (1. - c);                                         // identity in every shipped path (uLift 0, uGain 1; X3)
  vec2 d = vUv - .5; c *= mix(1., smoothstep(.8, .2, length(d) * uVigOff), uVig);
  c = sRGBTransferOETF(vec4(c, 1.)).rgb;
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255.;   // dither: no fog banding
  gl_FragColor = vec4(c, 1.);
}
```
- In the RT paths the scene renders into RT0 in **linear** (three tone-maps only when the target is the canvas), so
  the uber pass owns tone mapping and colour space there. Those are separate program variants: High prewarms them
  under the veil (§3.3); the Med fallback, if chosen, has **only** the RT variant (play never renders to the canvas
  directly then), so it stays at one variant per program.
- **AA A/B experiment (§14.1 protocol, before Med ships):** Med direct-to-canvas with `antialias: true` vs Med with
  `antialias: false` + the RGBA8 RT0 + FXAA uber pass, on D3D11 Iris Xe 1080p, meadow and town. Canvas MSAA ships
  unless it costs **> 1.5 ms GPU more** than the FXAA path at an equal S1 / S5 judgement; the result is written as
  the build-time constant `RENDER.medAA`. Default until then: canvas MSAA.
- **Budget:** play post = 0 ms; the High cinematic chain ≤ 2.5 ms GPU at 1080p, s = 1; the Med FXAA fallback ≤ 1.0 ms.

### 6.2 Tone mapping: Neutral, not ACES (core `Game.js`; all presets)
`renderer.toneMapping = THREE.NeutralToneMapping`, exposure **1.0** (was `ACESFilmicToneMapping`). ACES pushes the
ginger toward yellow and crushes pastels; Neutral keeps the ginger, pink and gold that carry the warmth. Free in cost.
`characters/preview.js` switches too, so previews match play.

### 6.3 Every tier in play: zero post (was "Low: zero post"; X1, X3)
- No RT, no passes, **canvas `antialias: true`** (MSAA on tilers is nearly free; on Iris Xe see the §6.1 A/B).
- Tone mapping in the material shaders (`NeutralToneMapping`; three applies it when rendering to the canvas).
- Dither: `material.dithering = true` on every lit world and `sc-*` material on **every** tier (a define, constant,
  so no program churn).
- Vignette: the CSS layer `#ui-vignette` (ART §9.1 gradient; `pointer-events:none`; ui owns it); 0 GPU passes.
- Warm grade: ART's in-material `toonGrade` (sat 1.12) and the preset hemi / sun colours. No `uShadowTint`.
- Holy glow: fx **additive glow cards** on every tier (a billboard halo on the blade, 1 draw; the Golden Hour aura
  hull; sparkles; ART §8.5), `depthWrite: false`, `blending: AdditiveBlending`, no bloom.

### 6.4 What "not 90s" means for the renderer (binding)
Always anti-aliased; never below render scale 0.6; dithered gradients; no nearest-filtered low-res textures on world
surfaces; no vertex snapping or affine wobble; soft blob contact shadows, never hard aliased PCF on characters; a warm
first frame (§10.1), never grey.

---

## 7. Shadows (world `Env.js`, new `StaticShadow.js`; fx `BlobShadows.js`; characters, enemies)

### 7.1 Stopgap (ships first, P0, about one day): fewer casters, no flips
- `castShadow = false` on: eyes, lids, whiskers, blade, bow, cape, fur shells, tufts, pickups, flames, fence posts,
  small dressing, all fx. Casters left: character bodies (through the existing low-poly `shadowProxy` where one
  exists), trees, houses, big stones.
- Per-kind `customDepthMaterial` on every remaining caster (§3.5).
- Sun shadow box fitted to the camera footprint by **world `Env.js`** from `cam.footprint` (X20): AUTOCAM §9.2's
  light-space fit (4 footprint corners + the same raised by 6 m, pad 1.5 m, grow at once, shrink after 1 s at ≥ 2 m,
  texel-snapped), ≈ 10.5–12 m half at d 13, ≈ 16 m at the boss fit. Map 1024 on Med, 2048 on High. **[amends]**
  CONTROLS_SPEC §2.8's fixed half 16 m.
- **Target:** ≤ 15 shadow draws per frame, 0 re-resolves.

### 7.2 End state, actors: one instanced blob pool (fx `BlobShadows.js`, new; 1 draw)
```js
// fx/BlobShadows.js (owner: fx). Actors call fx.blobs.add(object3d, radius) / remove(); 64 slots.
const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(64), 1));
const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
  uniforms: { uCol: { value: new THREE.Color(TONE.blob /* ART #5A4E7A */) }, uA: { value: 0.35 } },
  vertexShader: `attribute float aAlpha; varying vec2 vUv; varying float vA;
    void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.); }`,
  fragmentShader: `uniform vec3 uCol; uniform float uA; varying vec2 vUv; varying float vA;
    void main(){ float r = length(vUv - .5) * 2.; gl_FragColor = vec4(uCol, (1. - smoothstep(.55, 1., r)) * vA * uA); }` });
mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
const blobs = new THREE.InstancedMesh(geo, mat, 64); blobs.renderOrder = 1; blobs.frustumCulled = false;
// per rendered frame, tier-0 actors only: g = physics.heightAt(x, z); h = clamp(actor.y - g, 0, 3);
// scale = radius * 2 * (1 - h / 6); aAlpha = 1 - h / 4; matrix at (x, g + 0.02, z); count = alive; needsUpdate once
```
- The blob shrinks and fades with jump height: the clearest height cue from above. Crows' dive decal joins this pool.
- **Every character, enemy, companion, prop actor and pickup: `castShadow = false`.** Characters don't receive the
  sun map either; the toon band and the blob ground them.
- The x-ray silhouette (CONTROLS_SPEC §3) is unaffected.

### 7.3 End state, statics: a cached, snapped sun map (Med 1024, High 2048; Low none; X7)
- Casters are static only: the Props `BatchedMesh`, instanced trees (per set), merged walls and buildings.
- `renderer.shadowMap.autoUpdate = false`; `type = THREE.PCFShadowMap`, `shadow.radius = 1`.
- `shadow.camera`: the §7.1 footprint fit **+ an 8 m cache margin** per side, its centre snapped to an **8 m**
  light-space grid (≈ 19–20 m half at d 13: texel ≈ 3.8 cm at 1024, ≈ 1.9 cm at 2048 on High; size classes: explore,
  arena, boss).
- Re-render (`renderer.shadowMap.needsUpdate = true`) **only** when: the live footprint fit leaves the cached box; the
  size class changes; the sun preset tweens (every 4th frame while tweening); `levels.setVisible` changes a caster
  set. Running at 5.5 m/s that is about one re-render per 1.5 s. The iso sun azimuth follows the level's default yaw,
  never a zone hint (ART §2.5), so hint blends never re-render. One re-render ≈ 10–20 draws. If it shows in the frame
  graph, split it over 2 frames (half the casters each, map not cleared in between).
- Receivers: ground, paving, the Props batch and trees. Not grass (no shadow fetch on the biggest overdraw surface),
  not characters.
- **Low:** no shadow map at all. world bakes a cheap vertex AO into terrain and prop vertex colours at level build: the
  **height-difference term** `ao = clamp(1 − 0.35 · max(0, hAvg(r = 1.5 m) − h) / 1.5, 0.65, 1)` over 8 neighbours.
  No ray sampling at load (ray-traced AO, if wanted, is baked offline in `scripts/`).
- **Never** toggle `castShadow`, `receiveShadow` or `shadowMap.enabled` at runtime outside a preset change behind the
  veil: it recompiles every receiver.
- **Acceptance:** `shadowCalls === 0` on ≥ 95 % of frames while walking the meadow; −37 to −66 draws vs today.

---

## 8. Materials, lights and the world

### 8.1 The WarmToon material family = ART_WARM_SPEC §4–§5 (X5; colours, ramp and code live there)
"WarmToon" in this file means ART's family. Binding perf rules for it:
- **World:** `MeshLambertMaterial` + ART §4.1's global `ShaderChunk` toon patch (0 draws, no new material class).
  **Actors:** ART §5.1 `makeToonMaterial` (`MeshToonMaterial`, `softRamp`, cache key `sc-toon-v2`), §5.2 matcap metal
  (`sc-metal-v2`, one 256² canvas matcap; this replaces the 128² `makeToonSteel`), §5.3 unlit eyes.
- **Shared uniforms:** ART's `ENV_U` (world `Env.js`) holds rim, glow and lamps (`uGlow, uGlowCol, uLamps[4], uLampCol,
  uLampStr`; the old `TOON_U` name is retired). World's `withHeightFog(mat)` assigns `ENV_U` with `HFOG` and adds the
  glow / lamp terms in lit programs, using HeightFog's `vFogW` world position (**no `inverse(viewMatrix)` per
  fragment**). It is idempotent and its key suffix is the constant `|hfog3`; `sc-toon` composes it
  (`sc-toon-v2|hfog3`).
- Dropped from the perf sketch: `uShadowTint` (ART D7: shade colour comes from the hemisphere sky), `uRimPow /
  uRimStr` (ART's rim), the NearestFilter `RAMP` (ART `softRamp`).
- Program variants come only from the defines three adds (skinning, instancing, batching, vertexColors, map): **≤ 8
  lit world + `sc-*` programs for the whole game**, dithering is on everywhere (one constant define).
- **Dedupe:** `toonLib.get(key, { kind })` (characters `materials.js`) caches by `key + '|' + kind`; `kind` is
  `plain | instanced | skinned | batched` (§3.5). World uses the same per-kind rule for its Lambert materials.
- **Steel close-ups:** High tier only may swap the hero's plate to `MeshStandardMaterial` + PMREM in close-ups
  (prewarmed, §3.3). Never in iso play, never on Low / Med.
- Custom shaders that stay: grass (§8.4), water (Lambert + scrolling ramp, no env), foliage sway (the existing sway
  chunk on Lambert), fx `ShaderMaterial`s, decals, telegraphs, blobs. All use `HFOG_GLSL` and constant cache keys.
- Fur shells stay a `ShaderMaterial` used only per §9.3.

### 8.2 Lights: no runtime light-count changes; PMREM out of play (world `Env.js`, `Dressing.js`; fx `HolyFX.js`, `Lanterns.js`)
- Lights in play: **hemisphere + one directional sun. Zero `PointLight`s** in play and in cutscenes.
- Remove `Env.heroLight`, the `Dressing.js` `LightPool`, `HolyFX.light`, the `Lanterns.js` pooled lights and the
  cutscene PointLights (`story/cutscenes/cast.js`, `rig.js`, `characters/Props/ProcProps.js` `opts.light`). Replace
  them with `ENV_U.uGlow` (the hero glow: player writes its position each frame, HolyFX writes radius / colour through
  the holy ladder; ART's preset `hero` value sets its day strength) and `ENV_U.uLamps` (world writes the **4 lamps
  nearest `cam.focus`**, sorted at 4 Hz; a cutscene lantern claims slot 0 while it plays; `uLampStr` tweens 0 → 0.5
  at dusk / night). `characters/preview.js` may keep its PointLight (it is not the game scene).
- Lighting a lantern, the forest day → night switch and Lantern Alley change **only uniforms**: no recompile.
- `PMREMGenerator` and `Env._envScene` are not created in play; `scene.environment = null`. (Kept only for the High
  close-up plate in §8.1, created behind the veil.)

### 8.3 Far plane and the fog-radius cull (camera writes `far`; world culls)
- **Fog radius** (98 % fog, FOG_EXP2 with focus fog): `R = clear + sqrt(−ln 0.02) / (ρ · topMul) = clear + 1.978 / (ρ · topMul)`.
  Meadow day: 5 + 1.978 / (0.045 · 1.5) = **34.3 m**; bog: 4.5 + 1.978 / (0.07 · 1.2) = 28 m. Recompute on fog preset
  change, Golden Hour (`clear × 1.5`) and Cacklejaw P3.
- **Far plane in iso [X12; amends CONTROLS_SPEC §2.1 "far 90"; one formula shared with AUTOCAM §9.3]:**
  `fogFar = ceil(sqrt((d·cos p + R)² + (d·sin p)²) + 4)`;
  `far = clamp(ceil5(max(slantMax · 1.25 + 25, fogFar)), 45, 90)`, then raised for any world `farKeep` landmark inside
  the frustum side planes; fallback **60** when the footprint is not available. At d 13 ≈ 55 m (fogFar 48), at the
  boss fit d 22 ≈ 70 m. Camera owns it; classic and cutscene presets keep 600. `updateProjectionMatrix()` only when
  `far` changed (dirty flag). **Check:** tower tops (Bell Tower, gatehouse) at the 22 m boss zoom in the §13 S9
  screenshot, and AUTOCAM §9.3's skyline audit before it ships.
- **One cull, keyed to `cam.focus`, at 4 Hz** (world `LevelKit` / `Props`): hide anything whose bounding sphere's
  nearest point is farther than `R + 2 m` (hysteresis: show again at `R`):
  - BatchedMesh instances: `setVisibleAt(id, on)`;
  - instanced sets and LevelKit 32 m tiles: `visible = false` (projectObject skips invisible subtrees);
  - the 'far' group (skyline, sky dome, Dawnstone) is hidden in play (CONTROLS_SPEC §4.1).
  This replaces perf_0's per-class `maxDist`, perf_2's separate 45 m tile rule **and** AUTOCAM §9.4's dressing
  `maxDist` + `inFootprint` test (BatchedMesh `perObjectFrustumCulled` already removes the off-screen sides).

### 8.4 Grass and flowers as iso toon tufts (world `Grass.js`, `Wheat.js`)
| Item | Spec |
|---|---|
| Geometry | one **tuft** = 3 tapered blades in a fan (0° / 60° / 120°), each blade 2 triangles with a mid vertex: **6 triangles, 9 vertices**. Reads as a fluffy clump from 51°. |
| Flowers | the **same `InstancedMesh`**, per-instance colour (`setColorAt`) + a 2-triangle petal cap on flower instances. **Grass + flowers = 1 draw.** The far layer is deleted. |
| Tile | the existing wrapping tile, centred on the **camera footprint centre** (`cam.footprint.cx, cz`; X11), side **T = 1.6 · d** (21 m at d 13; 35 m at d 22); fade over the last 15 %. Unit check: the tile ⊇ footprint + 3 m for every AUTOCAM §11.1-3 profile and zoom |
| Count | fixed per preset: **Low 1300 (≈ 8k tris), Med 4000 (24k), High 8000 (48k)**; density = count / T² × the existing density map (paths, water, props). Boss zoom makes it sparser, never more expensive. |
| Shading | toon-lit with normals bent 70 % to world-up (ART §8.2), ART colours (root → tip, per-tuft hue ±6°, dry patches, flower palette and shares), blade width ×1.6, per-vertex focus fog. **No shadow receive. No `alphaTest`** (opaque triangles keep early-Z on tilers). |
| Order | `renderOrder` after terrain and props, so depth rejects hidden tufts |
| Wind / trample | the existing world-space chunk; the trample array of 5 (CONTROLS_SPEC §4.2) at 30 Hz |
| Wheat | the same pipeline with a taller 2-blade + ear tuft; Crow Fields only |
| Culling | camera-following `boundingSphere` (centre = tile centre, r = T · 0.75); never `frustumCulled = false` |

Result: grass 76k–148k triangles in 3–4 draws → **8k–24k in 1 draw**. Thermal rung 1 halves `count`.

### 8.5 Static scene graph (world `LevelKit.js`, `levels/*.js`)
```js
// after def.build: statics stop updating matrices; dynamics live under level.dynamicRoot
level.root.traverse((o) => { if (!o.userData.dynamic && !o.isSkinnedMesh) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
level.root.updateMatrixWorld(true);
level.root.matrixWorldAutoUpdate = false;     // r150+: scene.updateMatrixWorld() skips this subtree
```
- `level.dynamicRoot` (sibling of `root`) holds PropActors, swinging sacks, doors, the portcullis, wobble props.
- Target: **≤ 300 objects with auto-updating matrices** in play (today 420–1,186).
- Merge static decorative groups (`mergeGeometries`, vertex colours) and instance anything with 4+ copies.
- KayKit hidden prop nodes (unused weapons, shields) are **removed** from the clone (`removeFromParent()` in
  `Assets.model` when listed in `hide` and not `show`), not just `visible = false`.

### 8.6 Batches, flames, pickups
- **Props:** keep the one `BatchedMesh` per material per level with `perObjectFrustumCulled = true`,
  `sortObjects = true`, `optimize()` after build, trimmed `setInstanceCount` / `setGeometrySize`. **Without
  `WEBGL_multi_draw`** (iOS; r186 then loops one draw per instance), merge static props **per 32 m cell** with
  `mergeGeometries` into plain meshes instead (6–12 cells visible in iso). Measure on a real iPhone.
- **Trees:** `InstancedMesh` per template, crown and trunk split (CONTROLS_SPEC §3 crown fades). **Drop `THREE.LOD`
  and billboards**: nothing in iso is 50 m away.
- **Flames** (forest 28 draws, gate 16 today): one `InstancedMesh` of flame cards per level with a per-instance phase
  attribute; the 4 nearest feed `uLamps`.
- **Pickups:** one `InstancedMesh` per kind (fish 64, hearts 16, letters 8), swap-remove on collect, `count` = alive.
  Static ones bob in the vertex shader (`uTime + aPhase`); `setMatrixAt` + `instanceMatrix.needsUpdate` only for a
  dirty list of moving items.
- **Ground decals** (fx): one instanced decal pool, ≤ 2 draws, for rings, wedges, the aim ring, order markers, the
  landing ring and the dive circle (CONTROLS_SPEC §7.3). Contact / blob shadows are **not** in it: they are the
  separate `BlobShadows.js` draw (§7.2), so decal + blob = ≤ 3 draws.

---

## 9. Characters (characters, player, companions, enemies)

### 9.1 Cape (characters `Cape.js`) — P0, isolated file
1. Replace `this.geo.computeVertexNormals()` (`Cape.js:554`) with **grid normals** (central differences on the
   regular `rc × rr` render grid, written into the existing `normal` array; 0 allocations, ~6× less work):
```js
_gridNormals(p, n, rc, rr) {       // p, n: Float32Array, row-major rc × rr
  for (let r = 0; r < rr; r++) for (let c = 0; c < rc; c++) {
    const i = r * rc + c, l = r * rc + Math.max(c - 1, 0), rt = r * rc + Math.min(c + 1, rc - 1),
          u = Math.max(r - 1, 0) * rc + c, d = Math.min(r + 1, rr - 1) * rc + c;
    const ax = p[rt*3] - p[l*3], ay = p[rt*3+1] - p[l*3+1], az = p[rt*3+2] - p[l*3+2];
    const bx = p[d*3] - p[u*3],  by = p[d*3+1] - p[u*3+1],  bz = p[d*3+2] - p[u*3+2];
    let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx; const k = 1 / (Math.hypot(nx, ny, nz) || 1);
    n[i*3] = nx*k; n[i*3+1] = ny*k; n[i*3+2] = nz*k;            // flip once if the winding needs it (screenshot check)
  } }
```
2. **Iso LOD:** sim grid 7 × 9 (ART §6.4), render subdivision `resX 4 / resY 2` → **`2 / 1`** in play; the full grid
   only when `cam.closeUp` (lens < 6.0 m, off > 6.3 m; Meme Cam, cutscene close presets, title, photo). Low: sway
   shader always (no verlet). `iterations` 4 → **3**; sub-steps capped at
   **2** per frame (`advance`: `Math.min(acc + dt, 2 / 60)`).
3. **No cloth sim while `levels.loading`** (snap to the rest drape): saves 0.53 s of boot CPU.
4. Tier ≥ 1 (§4.3): sway shader instead of verlet.
- **Budget:** cape ≤ 0.25 ms per frame desktop, 0 B per frame.

### 9.2 KittenBuilder / KittenView (characters) — P0, isolated files
- `E()` (`KittenBuilder.js:44`) allocates a Quaternion and an Euler per call (~15 calls per kitten per frame):
```js
const _e = new THREE.Euler(), _qa = new THREE.Quaternion();
const E = (x = 0, y = 0, z = 0) => _qa.setFromEuler(_e.set(x, y, z, 'XYZ'));   // valid until the next E(); every call
                                                                                // site consumes it immediately (multiply)
```
  Constant poses (literal args) are cached at module load instead.
- **One matrix pass per kitten per frame:** drop `root.updateWorldMatrix(true, true)` in `simulate()`; read the cape
  pins after `updateWorldMatrix(true, false)` on the chest joint only.
- Precompute joint arrays (`this._tail = [J.tail0 … J.tail5]`, `this._ears = [J.earL, J.earR]`): no `'tail' + i`
  string keys per frame.
- Fur strand texture (`Fur.js:81`, 0.5–0.7 s at boot): built at **256²** in a Worker
  (`new Worker(new URL('./furWorker.js', import.meta.url), { type: 'module' })`, transferable `Uint8Array`), or on the
  first close-up behind the cut. Not on the boot path; no 512 KB PNG shipped.
- The procedural hero build runs after the title is up, in `requestIdleCallback` slices: ≤ 150 ms of hero work before
  T_title.

### 9.3 Fur shells: close-up only, plus an optional High iso set [X8; amends GAME_DESIGN §17 "Fur" and CONTROLS_SPEC §2.8]
Today `FUR_LOD_ISO.heroLens = 25` keeps the hero's full 16 shells in iso (~105k triangles, invisible at 96 px).
Binding rule (ART §6.1 D8, characters `Fur.js`, `runtime.js`):
- **Iso play:** `QUALITY.furShellsIso` Low **0**, Med **0**, High **0 or 4** (4 only if the S2 gate below passes).
  NPC kittens `kittenShellsIso` 0 on every tier.
- **Close-up:** camera's `cam.closeUp` (lens < 6.0 m on, > 6.3 m off) → `furShellsClose` Low 8, Med 16, High 16.
  The on-screen-px bands of the perf draft are retired (one rule, one flag).
- Always with ART's rim, coat gradient and **skinned tuft cards** (Med / High, 1 draw; Low none).
- The shell `InstancedMesh` and the close-up geometry are built in idle slices (≤ 2 ms) after the level's first 60
  frames, detached; never on the frame of the first close-up. Shell programs compile on the title after T_title.
- **Art gate S2 (High only):** screenshot triple at 13 m 1080p (0 / 4 / 16 shells). If 4 is not judged fluffier than
  0, High ships 0. Med does not ship iso shells (its hero budget is ≤ 16k triangles; 4 shells ≈ +26k).
- The noisy-hull fur outline (perf_1 §7) is a **flag-only prototype** (`?furHull=1`), not shipped until judged.

### 9.4 Merge characters to few draws: `bakeSkinned` (characters `merge.js`, new) — P2, after the rework, enemies first
One skinned mesh per material per template, baked **once per template**, then `SkeletonUtils.clone` per spawn (via
the VisualPool). Hyena 16 → 1 draw (+ 1 matcap if it has steel, + 1 outline when engaged); rat_xbow 5 → 1.
The correct transforms (attached bind mode, where three recomputes `bindMatrixInverse = matrixWorld⁻¹` each frame,
so a vertex lands in world at `Σ wₖ · Mₖ · B · v` with `Mₖ = boneₖ.matrixWorld · boneInverseₖ`):
```js
// characters/merge.js — target bound with B_T = identity: target.bind(skeleton, new THREE.Matrix4())
export function bakeSkinned(root, skeleton, material) {
  root.updateMatrixWorld(true);
  const bi = new Map(skeleton.bones.map((b, i) => [b, i])), geos = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || o.userData.noBake) return;
    const g = o.geometry.clone();
    if (o.isSkinnedMesh) {
      // same bones AND equal boneInverses (≤ 1e-4 per element) are REQUIRED; otherwise do not merge this part
      if (!sameInverses(o.skeleton, skeleton)) return void keepSeparate(o);
      remapSkinIndex(g, o.skeleton, bi);                 // part bone index → target bone index
      g.applyMatrix4(o.bindMatrix);                      // v' = B_P · v   (because B_T = I)
    } else {                                             // rigid part: skin 100 % to its nearest ancestor bone b
      let b = o.parent; while (b && !b.isBone) b = b.parent; const k = bi.get(b) ?? 0;
      // v' = boneInverse_b⁻¹ · bone_b.matrixWorld⁻¹ · W_R · v   (pose-independent: holds at any current pose)
      const m = new THREE.Matrix4().copy(skeleton.boneInverses[k]).invert()
        .multiply(new THREE.Matrix4().copy(skeleton.bones[k].matrixWorld).invert()).multiply(o.matrixWorld);
      g.applyMatrix4(m); setRigidSkin(g, k);             // skinIndex (k,0,0,0), skinWeight (1,0,0,0)
    }
    normaliseAttributes(g);                              // position, normal, uv, color (white if textured), aTexMix
    geos.push(g);
  });
  const mesh = new THREE.SkinnedMesh(mergeGeometries(geos, false), material);
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}
```
- The perf_1 sketch's rigid-part transform (`inverse(mesh.matrixWorld) · W_R`) is wrong whenever the mesh's world
  matrix is not identity (every `MODEL_FIT` scale); do not use it.
- Material: WarmToon with the pack's KayKit atlas as `map`; procedural parts use vertex colour with `aTexMix = 0`
  (`diffuse = mix(vColor, texel, aTexMix)`, a 3-line chunk). Steel parts go into a second bake with the matcap.
- **Test per template (enemies smoke):** render the unbaked and baked versions side by side at 3 clip times (idle,
  attack windup, hit) through `measureFit`; ≤ 1 % of pixels differ by > 8/255, and the bounding boxes agree within 2 cm.
- **Hero and kittens come after enemies,** once the controls rework has merged: (1) one toon skinned body (fur base,
  head, ears, bow; kittens and villagers also take their eyes through a UV-offset expression atlas, `setExpression`
  writes `uEyeFrame`; **the hero keeps her own unlit merged eye mesh**, ART §5.3), (2) one matcap skinned armour +
  sword, (3) the cape. Swappable or dynamic parts (pot helm, shield, sword skins, capes) live in a
  second small baked mesh and are re-baked on change (shops, wardrobe; never in combat). Per-part toggles and
  expressions must keep working: the characters smoke covers `setPose`, `setHoly`, `setExpression` on the baked hero.
- **Hero end state in iso play [X10]:** ≤ **6** draws (body+bow, eyes, steel+sword, cape, tufts, outline), ≤ 16k
  triangles (High iso shells, if S2 passes, are counted on top: +1 draw). Kittens ≤ 3 (body with atlas eyes, tufts,
  hull on Med/High); villagers 1; KayKit enemies ≤ 3 (body, steel, outline when engaged); bosses ≤ 7.

### 9.5 Warm outline (characters `Outline.js`, new; look = ART §5.4, cost rules here; X9)
- Inverted hull sharing the merged silhouette proxy (later the baked geometry) and skeleton (a second `SkinnedMesh`,
  same `skeleton`), `side: THREE.BackSide`, colour from ART `TONE.ink` (never black), clip-space push for a constant
  width: hero **2.0 px**, companions / enemies 1.6, bosses 2.4 (× the current pixel ratio incl. the dynamic-resolution
  scale; `uViewport` updates on every resize and pixel-ratio step).
- Who (`QUALITY.outline`): Low `'hero'` = hero + boss; Med `'heroCompanionsEngaged'` = hero, boss, companions, ≤ 4
  engaged enemies (nearest first); High `'all'`. Thermal rung 3 drops to hero + boss.
- `castShadow = false`, no fog patch beyond `HFOG_GLSL`, one program (skinned) + one (static).
- Costs ≤ 8 draws on Med (1 + 1 + 2 + 4), against the 60+ the merge saves.

## 10. Boot, downloads, audio and DOM

### 10.1 Warm splash at first paint (core `index.html`; coordinate the edit with the rework owner)
The grey `#B7C0C3` wait is literally the "90s" first impression. Replace it with ≈ 3 KB of inline HTML/CSS/SVG:
```html
<style>
  html,body{margin:0;background:#F6E7D2}
  #splash{position:fixed;inset:0;display:grid;place-items:center;transition:opacity .4s;
          background:radial-gradient(120% 90% at 50% 35%,#FFF4E2 0%,#F7D9B8 55%,#EDB98C 100%)}
  #splash svg{width:min(42vw,280px);animation:bob 1.6s ease-in-out infinite}
  @keyframes bob{50%{transform:translateY(-6px) rotate(-2deg)}}
  @media (prefers-reduced-motion:reduce){#splash svg{animation:none}}
  #splash.out{opacity:0;pointer-events:none}
</style>
<div id="splash"><svg viewBox="0 0 120 120"><!-- ≤ 2 KB: paw + tiny sword + pink bow, ART palette tokens --></svg></div>
<link rel="modulepreload" href="/src/main.js">
<link rel="preload" as="font" type="font/woff2" href="/fonts/Fredoka.woff2" crossorigin>
<!-- X18: Fredoka is the only game font (ART §9.2); no Cinzel / Uncial / MedievalSharp file exists any more -->
```
ui adds `.out` on `E.GAME_READY` (title interactive) and removes the node after the transition. CS-00's logo reuses
the same SVG so the hand-off reads as one warm motion. Continue / level loads show the same card with a paw progress
ring, never grey.

### 10.2 Title-first boot (core `Game.js`, `systems.js`, `vite.config.js`; story, enemies, audio, ui)
- **Boot chunk** = core shell (Game, Loop, EventBus, Input, Assets, config), ui title/menus, save, audio shell.
  **Play chunk** (player, characters, camera, physics, combat, enemies base, companions, fx, world) is imported in
  parallel as soon as boot evaluates. The ctx shape stays frozen; only construction time moves:
  `SYSTEMS` entries gain `load: () => import(...)` and `boot: true|false`; `contracts.test.js` checks key, area, file
  and `Class` after `await load()`.
- Rolldown chunk groups (`vite.config.js`): `three` (core build, boot), `three-addons` (loaders, Octree, post; play),
  `boot` (`src/core|ui|save`, `main.js`), `play` (the rest except levels and story cutscenes).
- **Lazy:** every cutscene (`story/cutscenes/index.js` becomes `id → () => import('./csNN.js')`, prefetched when the
  level's trigger zone activates); every enemy type (`EnemyManager` registry `type → () => import(...)`,
  `preloadTypes(levelEnemyWarm(def))` awaited next to the asset preload; bosses never in boot); `debug.js` only under
  `?test` / `?debug`; the audio per-level manifest map out of the boot JS (emitted JSON fetched per level).
- The title renders a small backdrop (sky dome + 1 terrain patch + Tallbert statue + 6 props + 1k grass tufts) from
  the `title` manifest (≤ 1.2 MB) with **≤ 16 programs**, compiled through `prewarm()` while the DOM logo animates.
  No composer on the title.
- **CS-00 waits on `playReady`** (≤ 1.5 s after the press desktop), masked by the logo fade. Story verifies.
- Fonts: Fredoka only (ART §9.2, −449 KB), as woff2 Latin subsets (`pyftsubset … --flavor=woff2`, ≈ 25–45 KB per
  weight); preload the 500 and 700 weights; nothing else.
- **Parallel level load** (world `LevelManager._load`): `Promise.all([import(level), assets.preloadLevel(id, 'p0'),
  enemies.preloadTypes(types)])`, then `build(ctx, { yieldEvery: 8 })` (LevelKit yields between zones), physics
  `setLevel` (nav in the worker), batched `prewarm()`, then `preloadLevel(id, 'p1')` not awaited.
- Bundle guard (core `scripts/bundle-budget.mjs`, runs in `npm run build`): boot ≤ 140 KB gz, three ≤ 215, addons
  ≤ 30, play ≤ 300, story ≤ 60, each cutscene ≤ 8, each enemy type ≤ 6 (boss ≤ 12), each level ≤ 15, LevelKit ≤ 40.

### 10.3 GLB pipeline and manifest tiers (core `scripts/`; every area's manifest) — P2
1. **Prune unused clips** per model from a keep list generated from `enemies/clipMaps.js` and story `rig.js`
   (dispose the channels and samplers too, or `prune()` keeps their accessors).
2. **One shared clip library per rig family:** `anims/kaykit_humanoid.glb` (27 clips, 0.78 MB, 0.25 MB gz) and
   `anims/kaykit_skeleton.glb`. Character GLBs become mesh-only (Knight 2.85 MB → **0.17 MB**). Bind by bone name:
   `mixer.clipAction(THREE.AnimationClip.findByName(await assets.animLib(path), 'Running_A'), model.scene)`.
3. `resample` → `dedup` → `weld` → `prune` → `quantize` (position 14, normal 10, uv 12 bits) → `meshopt` (medium).
   **No Draco** (meshopt decodes faster; the decoder moves to `three-addons`).
4. Expected: meadow GLB 12.1 → ≈ 3 MB; keep 21.9 → ≈ 3 MB; all GLB in `dist` 32.6 → ≈ 8–10 MB.
5. Optional after meshopt: KTX2 (ETC1S for KayKit / brick atlases, UASTC for the eye atlas) via `KTX2Loader`.
- **Manifest tiers** (additive; the old array form still means p0): `title`, and per level `{ p0, p1, p2 }`; `'*'`
  splits into `p0` (UI + hero SFX, ≤ 0.4 MB) and `p2`. Rules: title ≤ 1.2 MB, p0 ≤ 4 MB per level; arena-wave assets
  are p1 in the first zone, else p2 with a zone-approach preload (her within 60 m of the zone). A unit test (extend
  U15 in `tests/unit/assets.test.js`) sums each tier and fails over budget.
- **Prefetch:** 5 s after `level:loaded`, fetch the next level's p0 into the HTTP cache (`fetch(url, { priority:
  'low' })`, ≤ 2 in flight, paused while `audio.threat > 0` and on `saveData`); parse at the exit-zone approach (40 m).
- Shared clip libraries need equal rest poses: the enemies smoke shows each character playing 3 library clips and
  checks `measureFit`.

### 10.4 Audio loading (audio)
- `decodeAudioData` lazily on first use, ≤ 4 concurrent; music streams through `<audio>` + `MediaElementSource` (no
  30 MB PCM per track): the main cause of the 159–190 MB boot heap.
- The title needs only `ui/*` (≈ 60 KB) and the title theme (streamed).
- §3.1 covers the zzfx and pink-noise bake.

### 10.5 Audio and DOM on the main thread (audio, ui, fx)
- Listener and panner positions: update at **20 Hz** and only when moved > 5 cm; `setValueAtTime`, never
  cancel + set every frame (`AudioManager.js:690–695`). Pool 8 3D voices (`PannerNode`s reused).
- HUD: write the DOM only on change (compare numbers first, build strings only on change), batched at 10 Hz;
  animate only `transform` and `opacity`; `contain: layout paint` on HUD roots.
- **[X21] Cooldown sweeps** (CONTROLS §10.1's "30 Hz" conic sweep, the touch cluster's cooldowns): one CSS animation
  per cooldown start (`@property --cd` registered as `<number>`, `animation: cd <dur>s linear forwards`), no per-frame
  JS style writes. The seconds label updates on whole-second changes only.
- Damage numbers: a pool of transform-only elements (or 3D sprites in fx). Bark (8) and toast (4) DOM pools; text
  via `textContent`, never `innerHTML` per frame.
- Pointer and touch handlers allocation-free (they fire at 120 Hz on many phones).
- **Budget:** `frame.ui` ≤ 0.3 ms desktop, ≤ 1.5 ms at the 4× proxy; ≤ 5 style recalcs/s idle, ≤ 15/s in combat.

---

## 11. Zero-allocation rules and the hit list (all areas)

Rules for `update`, `render`, `step`, `tick`, `simulate`, `animate`, `poll`, `move`, `resolve`, `collide`:
1. Module-level scratch (`const _v = new THREE.Vector3()`); scratch is never returned to a caller who keeps it (pass
   an `out`).
2. No `[...x]`, `.filter / .map / .slice / .some`, `Object.entries` or destructured array returns in hot paths.
3. No string building for keys per frame; numeric ids or precomputed strings.
4. No closures created per frame (hoist: `this._onSub ||= …`).
5. No events per frame or per step (the bus measured ≤ 25 emits/s; keep it that way).

| # | Where | Fix | Owner | Prio |
|---|---|---|---|---|
| A1 | `characters/Cape.js:554` `computeVertexNormals` (1.4–2.8 MB/s, the top allocator) | grid normals §9.1 | characters | P0 |
| A2 | three `getParameters` + cache-key `join` from re-resolves | §3.5 | world, characters, enemies | P0 |
| A3 | `physics/Physics.js:700` `separateActors` lazily adds `_physSep / _sepX / _sepZ` | predeclare in `core/Actor.js`; uniform 2 m hash over typed arrays above 24 solid actors | core, physics | P0 |
| A4 | `characters/KittenBuilder.js:44` `E()` | scratch §9.2 | characters | P0 |
| A5 | `core/Input.js:161` `poll`: `navigator.getGamepads()` every frame (a sync IPC), `Object.entries`, string keys | poll pads only between `gamepadconnected` / `gamepaddisconnected`; precomputed `_padBindings`; `Uint8Array` prev state keyed `action * 32 + idx` | core (with the rework's Input changes) | P1 |
| A6 | `enemies/Enemy.js:1234` `_updateAnim` array destructure + template key per frame | cached `{ role, opts }`; numeric serial compare | enemies | P1 |
| A7 | `enemies/Enemy.js:753` attack list `.filter` per decision | preallocated `_cands` | enemies | P1 |
| A8 | `world/Pickups.js:215` iterates every item every step; `some()` + `filter()` | instanced pool, swap-remove §8.6 | world | P1 |
| A9 | `fx/MistCards.js:154` render temporaries | scratch | fx | P1 |
| A10 | bosses `.clone()` in update (`boss_grizzlechop.js`, `boss_cacklejaw.js`, `jelly.js`, `stealer.js`, `Pilfer.js`) | scratch where it runs every step | enemies | P2 |
| A11 | `companions/LostKitten.js:623–626`, `HubKittens.js:271` `new Vector3` in update | scratch | companions | P1 |
| A12 | `ui/hud.js:255–296`, `toasts.js:108`, `threatArrows.js:110/124` template strings at 10 Hz | compare numbers first | ui | P1 |
| A13 | `story/dialogue/barks.js:356`, `story/tutorial.js:174` | scratch | story | P2 |
| A14 | `combat` `assistTarget` scoring | pass `out` | combat | P1 |
| A15 | `ActorRegistry.queryRadius` filter closures | add `queryRadiusTyped(pos, r, maskBits)` | core | P1 |

The static scan (`research/next/tools/perf2_allocscan.mjs --list`) lists 119 suspicious sites; the runtime sampler
(`perf:alloc`) decides which matter. EventBus stays synchronous; only a DEV-only `KNOWN.has` warning is kept (no
copy-on-write rewrite: not perf work).

---

## 12. Instrumentation (core `debug.js`, `Game.js`) — continuous, lands first

`__GAME__.perf()` (only with `?test`, `?debug` or `?perf`; per-system timers run only then):
```js
{ frame: { p50, p95, p99, max },              // rAF interval ms over a 600-frame ring
  cpu: { sim, simPerStep, render, submit, total, bySystem: { player: ms, enemies: ms, … } },
  gpuMs,                                       // EXT_disjoint_timer_query_webgl2, null if absent
  steps: { avg, max },                         // fixed steps per rendered frame
  calls, tris, programs, geometries, textures, // renderer.info (autoReset false, read after post)
  texMB,                                       // GPU texture + RT bytes (§1.2 note), ?perf only
  stage,                                       // 'I1' | 'I2' | 'End': which budget column applies (IMPLEMENTATION_PLAN §5)
  shadowCalls,                                 // draws in the last shadow update (0 most frames)
  reresolves,                                  // only when the smoke's patched three is served (§14.2)
  scale, dpr, fpsCap, thermalRung,             // dynamic res and pacing state
  byCat: { hero, enemies, companions, grass, props, fx, ui3d },   // draws, from object.userData.perfCat
  poolMisses, longTasks, heapMB }
```
- `__GAME__.perf.snapshot()` returns averages and p95; `__GAME__.perf.reset()` clears the rings.
- `?perf` shows a 5-line DOM overlay: fps p50/p99, CPU (sim / render / submit), GPU, calls / tris / programs, s.
- `performance.mark('paint' | 'title' | 'play')` and `measure`s for T_paint, T_title and T_play (the smoke reads them).
- Every area tags its root objects `userData.perfCat` (hero, enemies, companions, grass, props, fx, ui3d).

---

## 13. Screenshot acceptance (images are Read and judged; shots in `tests/shots/perf/`)

Each pair or set is taken at 1280×720 (and 844×390 for phone rows), iso pose, `?test&seed=1`, after the change it
gates. The judge answers the question in the right column; a "no" fails the gate.

| # | Shot(s) | Gate question |
|---|---|---|
| S1 | meadow start, Med vs Low, same frame | Do both read as the **same warm, soft cartoon** (no grey cast, no harsh black shadows, no jaggies)? |
| S2 | hero at 13 m, 1080p, **High**: shells 0 / 4 / 16 (crop 4× around her) | Is 4 visibly **fluffier** than 0? (No → High ships 0; Med and Low ship 0 regardless, X8.) Is 0 still clearly a fluffy kitten (rim + tufts)? |
| S3 | forest at dusk, fog gradient crop ×4 | **No banding** visible in the fog / sky gradient (dither works on Med and Low)? |
| S4 | her mid-jump and landing, blob visible | Does the blob read as **grounded and soft**, and does it shrink with height? No double shadow? |
| S5 | hero armour + sword close-up and at 13 m | Does the matcap steel still read as **polished silver** (warm highlight, not grey plastic)? |
| S6 | hero + 2 engaged hyenas with outlines, Med | Is the outline **warm cocoa, even (hero ≈ 2 px, hyenas ≈ 1.6 px), not black, not jagged**, and does a hull fade in (not pop) when a hyena engages? |
| S7 | `T_paint` frame (first screenshot after navigation) | Is the first thing on screen the **warm cream / peach splash** with the paw, sword and bow? |
| S8 | meadow combat at s = 0.7 vs s = 1.0 (Med) and Low DPR 0.75 | Is s = 0.7 still crisp enough (no blur that reads "old game")? |
| S9 | gate at the B2 22 m boss fit; town Bell Tower | No far-plane clipping of tower tops; no visible fog-cull pop at the screen edge? |
| S10 | meadow grass tufts at d 13 and d 22 | Do tufts read as **fluffy clumps** from 51°, with flowers, no stripes or bare tiling? |
| S11 | walking 20 m across a 16 m shadow snap (5 frames around it) | No visible shadow pop or shimmer at the snap? |
| S12 | baked vs unbaked hyena at idle / windup / hit (§9.4) | Identical silhouettes, textures and weapon placement? |
| S13 | forest Lantern Camp, day then night | Lamp pools look warm and soft; same look as the PointLight version or better? |

---

## 14. Measurement protocol and smoke gates

### 14.1 Protocol (every number that becomes a threshold)
1. **Machine:** no other vite / Playwright / node processes (check `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`),
   AC power, best-performance plan. **Calibration:** 2000 `Math.sqrt` evaluations must take ≤ 10 µs (median of 50),
   else the run is **INVALID** and the gate is skipped with that word in the log (never a pass, never a fail).
2. **Browser:** real Chrome stable, `--use-angle=d3d11` (the Windows default; `KHR_parallel_shader_compile` present).
   Headless ANGLE-GL is for regressions only. SwiftShader is never a perf signal.
3. **Build:** startup is measured on a private production build (`research/next/tools/perf2.vite.config.mjs` →
   `tools/dist_perf2/`, served by `perf2_serve.mjs` with gzip on a private port). **Never** rebuild the shared `dist/`
   and never measure startup on the dev server.
4. **Runs:** startup best of 3 cold (cache disabled); runtime 600 frames after a 120-frame settle. Report p50, p95,
   p99, per-system ms, steps per frame, allocation per second.
5. **Phone:** one real mid Android (Pixel 7a / Galaxy A54 class) through `chrome://inspect` + Playwright
   `connectOverCDP`, same scripts, 10-minute soak with `?perf`: median ≥ 58 fps, median s ≥ 0.8, no thermal
   fallback to 30 within 10 minutes in the meadow.

### 14.2 Smoke gates (core: new `tests/smoke/perf.mjs`; run only when `SMOKE_PERF=1`)
Count gates are machine-independent and **fail now**. Timing gates **report only** until §14.4's re-baseline.

| Gate | What it does | Pass |
|---|---|---|
| `perf:programs` | fresh page per level (meadow, forest, town hub, gate), read `info.programs.length` after `ready` | ≤ `QUALITY[q].programs` (Med 40 → 30, Low 30); High ≤ `programs + programsCinematic` |
| `perf:no-compile` | after `ready`: 60 s scripted play (spawn 6 enemies of the level's types, Holy charge, Golden Hour, a lantern toggle, forest day → night, a close-up cutscene) | program count **did not grow** |
| `perf:reresolve` | serve three with a counter patched into `setProgram`'s `needsProgramChange` branch (Playwright `page.route`; nothing on disk changes; method in `research/next/tools/perf_churn.mjs`) | 0 over 60 idle and 300 combat frames |
| `perf:draws` | iso pose, scenes in §14.3 | scene draws and triangles ≤ §14.3 |
| `perf:shadow` | walk 20 m in the meadow (Med) | `shadowCalls === 0` on ≥ 95 % of frames |
| `perf:spawn` | spawn the level's largest wave | worst frame of the next 30 ≤ 1.5× median of the prior 60; `poolMisses === 0` |
| `perf:alloc` | CDP `HeapProfiler.startSampling({ samplingInterval: 4096 })` over 300 idle frames + 300 frames of the 8-rat fight, attributed through sourcemaps | game code ≤ 512 KB/s; any single function ≤ 128 KB/s; total ≤ 32 KB/frame |
| `perf:audio-unlock` | first key press in the meadow | < 1 MB allocated in that frame; no long task > 50 ms in the next 1 s |
| `perf:steps` | meadow combat at the 4× proxy | `steps.max ≤ 3` (Low) / `≤ 4` (Med) — the cap holds |
| `perf:dynres-step` | force 4 render-scale steps (`__GAME__.perf.setScale`) during a meadow walk | worst frame within 3 frames of each step ≤ 1.5× the median of the prior 60 (a `setPixelRatio` resize must not hitch); `uViewport` equals the drawing-buffer size the same frame |
| `perf:composer` | Low and Med: a close-up cutscene, then the hand-back; High: same | Low / Med: no `WebGLRenderTarget` allocated, program count unchanged; High: the composer is on only between cutscene start and hand-back end, program count unchanged (prewarmed) |
| `perf:frame` (timing) | meadow idle and 8-rat fight, Med 1080p, D3D11 | report; after re-baseline: GPU ≤ 9 ms, CPU ≤ 6 ms, p99 ≤ 25 ms |
| `perf:boot` (timing) | private build, cold | report; after re-baseline: T_title ≤ 3.0 s desktop, ≤ 6.0 s at 4G + 4×. T_paint = `performance.getEntriesByName('first-contentful-paint')` (the inline splash is the first content), T_title / T_play = the `performance.mark`s of §12 |
| `build` | `scripts/bundle-budget.mjs` | §10.2 chunk budgets |
| `test:unit` | manifest tier sums | §10.3 tier budgets |

### 14.3 Scene draw / triangle acceptance (iso, 1280×720; Low in parentheses)
| Scene | Draws (end state) | Triangles | Programs |
|---|---|---|---|
| meadow start | ≤ 35 (≤ 25) | ≤ 110k (≤ 60k) | ≤ 30 |
| forest night, Lantern Camp | ≤ 45 (≤ 32) | ≤ 130k (≤ 70k) | same set as day |
| town hub, all residents | ≤ 60 (≤ 40) | ≤ 150k (≤ 80k) | ≤ 30 |
| gate, B2 with 5 hyenas + adds | ≤ 75 (≤ 55) | ≤ 150k (≤ 80k) | ≤ 30 |
Interim (before WarmToon, blobs and bakes land): frame calls including shadow and post ≤ 120 Med / ≤ 70 Low;
programs ≤ 40.

### 14.4 Setting timing thresholds
No absolute ms or fps from the drafts is a threshold: every draft ran under 70–100 % contention on headless
ANGLE-GL. The first valid §14.1 run on an idle machine (D3D11) plus the real-phone soak sets the baseline; core then
writes the timing thresholds into `tests/smoke/perf.mjs` as `min(§1.2 budget, baseline × 1.15)`. The `perf_0 §6`
budgets, as refined in §1.2, replace tech.md §18.

---

## 15. Per-area task list (ownership per GAME_DESIGN §19.2; ready for parallel agents)

Waves (§16): **A** = start now, no file shared with the live controls rework; **B** = with or right after the
controls merge, coordinated with its owners; **C** = art-coupled, after ART_SPEC values exist; **D** = P2.
Every task's acceptance is the named gate in §13 / §14. IDs are stable for the integrator.

### core (`index.html`, `vite.config.js`, `src/main.js`, `src/core/**`, `scripts/**`, `tests/smoke.mjs`, `tests/smoke/perf.mjs`, contracts / assets / events unit tests)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| C1 | `__GAME__.perf()`, `?perf` overlay, performance marks, `userData.perfCat` convention | new `core/perf.js`; one import in `debug.js` | P0 / A | used by all gates |
| C2 | `tests/smoke/perf.mjs` with every §14.2 gate behind `SMOKE_PERF=1`, the calibration check, the `setProgram` patch route | `tests/smoke/perf.mjs`, `tests/smoke.mjs` (register) | P0 / A | — |
| C3 | `checkShaderErrors` off in prod | `Game.js` (1 line; tell the rework owner) | P0 / A | boot profile |
| C4 | `prewarm()` helper (batched `compileAsync`, ≤ 4 per yield without the extension) | new `core/prewarm.js` | P0 / A | `perf:no-compile` |
| C5 | `depthFor()` per-kind depth materials | new `core/depth.js` | P0 / A | `perf:reresolve` |
| C6 | **[X1, X2]** Direct-to-canvas play path on every tier (no composer, no vignette pass); `PostChain` + dual-Kawase bloom + uber pass (Neutral, sRGB, dither, NaN guard; FXAA define) used only by the High cinematic path and the Med FXAA fallback; `setCinematic()` (ART §3.3) tier-agnostic; read new QUALITY keys with defaults until C8. Lands **together with C11** (the context needs `antialias: true` first) and after F5 (glow without bloom) | `PostFX.js`, new `core/postfx/{PostChain,bloom,uber.frag}.js` | P0 / A (with C11) | S1, S3, `perf:frame`, `perf:composer`, A/B §6.1 |
| C7 | Dynamic res (`setPixelRatio` on every tier, X4; sub-rect only for the RT paths), controller, probe, fps cap, refresh detection, thermal ladder, 30 fallback, `perf.particleScale`, `uViewport` update | `PostFX.js`, `Game.js`, new `core/pacing.js` | P1 / B | S8, `perf:dynres-step`, phone soak |
| C8 | Config merge: the IMPLEMENTATION_PLAN §4 key set (§2 QUALITY, LOOP, RENDER incl. `toon` / `medAA`, AUTOCAM §12 `CAMERA.iso.*`, CONTROLS §13), `auto` preset pick; retired keys keep read fallbacks. **One** core commit | `config.js` | P1 / B | contracts test |
| C9 | Loop: `maxSteps` 4 / 3 + drop remainder; `stepsThisFrame`; pause on hidden | `Loop.js` | P1 / B | `perf:steps` |
| C10 | `every()` scheduler | new `core/schedule.js` | P1 / B | unit test (deterministic) |
| C11 | `NeutralToneMapping`, exposure 1.0; `antialias: true` on **every** tier; ART `installToon()` before the first compile; `scene.background` from Env. Same coordinated `Game.js` commit as C3 | `Game.js` | P0 / A (through the rework's core owner) | S1, ART G12 |
| C12 | Skinned culling sphere ×1.6; remove hidden KayKit nodes from clones; `animLib()` | `Assets.js` | P1 / B | §4.4 acceptance |
| C13 | Actor scratch fields (`_physSep, _sepX, _sepZ, _tier, _tierFrame, _mixAcc`); `queryRadiusTyped` | `Actor.js`, `ActorRegistry.js` | P0 / A | `perf:alloc` |
| C14 | Input: gamepad polling gated by connect events; precomputed bindings; numeric prev state | `Input.js` (with the rework's Input owner) | P1 / B | `perf:alloc` |
| C15 | Warm splash (§10.1), modulepreload, font preloads | `index.html` (after the rework's edit lands) | P1 / B | S7, `perf:boot` |
| C16 | Title-first boot: lazy `SYSTEMS` entries, chunk groups, `debug.js` lazy, title backdrop ≤ 16 programs | `systems.js`, `Game.js`, `main.js`, `vite.config.js` | P1 / B | `perf:boot`, `contracts.test.js` |
| C17 | Bundle budget guard | new `scripts/bundle-budget.mjs`, `package.json` script (core) | P2 / D | `build` |
| C18 | GLB pipeline script (from `tools/perf2_glbopt.mjs`), manifest tiers in `Assets.preloadLevel(id, tier)`, `prefetch()`, tier-budget unit test | `scripts/optimize-glb.mjs`, `manifests.js`, `Assets.js`, `tests/unit/assets.test.js` | P2 / D | `test:unit` |

### camera (`src/camera/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| K1 | `cam.frustum` once per frame + `frameId`; `inView` + `activityOf(actor)` tiers (§4.3); `onScreen` = AUTOCAM §7.3 SafeFrame-visible (X13); `closeUp` flag (lens < 6.0 / > 6.3 m); publish `focus`, `d`, `pitch`, `footprint` (AUTOCAM §9.1) | `FollowCamera.js`, `IsoRig.js` | P1 / B | unit + `perf:draws` |
| K2 | Iso far plane: the merged X12 formula (§8.3) with dirty-flag projection updates; classic keeps 600 | `FollowCamera.js` | P1 / B | S9 |
| K3 | ~~Shadow centre~~ **removed (X20):** camera only publishes `cam.footprint`; world computes the box (W10, AUTOCAM world 1) | — | — | — |
| K4 | `Picker.js`: heightfield DDA + ray-vs-capsule; once per frame; never `intersectObjects(scene, true)` | new `Picker.js` | P1 / B | ≤ 0.05 ms |
| K5 | Occluders: CONTROLS §3 capsule tests at 20 Hz (`CHECK_HZ`), ≤ 7 capsules, **no scene raycasts**; read `cam.frustum` | `Occluders.js` | P1 / B | Occluders ≤ 0.05 ms amortised (report-only until §14.4) |

### physics (`src/physics/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| P1 | `separateActors`: predeclared fields (C13), uniform 2 m typed-array hash above 24 solid actors | `Physics.js` | P0 / A | `perf:alloc` |
| P2 | Stamped zero-alloc A*, typed heap, 96-float output; request queue (2 finds, 2 ms per step; player first); flow field for ≥ 4 chasers | `Pathfind.js`, `NavGrid.js` | P1 / B | unit: 0 alloc; ≤ 1.5 ms worst at 4× |
| P3 | Nav build in a worker (transferables), slicing fallback | new `navWorker.js` | P1 / B | `physics.setLevel` ≤ 100 ms main thread |
| P4 | Allocation-free static queries; `heightAt` for blobs | `StaticColliders.js`, `Heightfield.js` | P1 / B | `perf:alloc` |

### characters (`src/characters/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| H1 | Cape grid normals, iso grid 221 vertices, 3 iterations, ≤ 2 sub-steps, no sim while loading, sway at tier ≥ 1 | `Cape.js` | P0 / A | cape ≤ 0.25 ms; `perf:alloc` |
| H2 | `E()` scratch + cached constant poses; single matrix pass; joint arrays | `KittenBuilder.js`, `KittenView.js` | P0 / A | `perf:alloc` |
| H3 | Per-kind materials (no Mesh / Instanced / Skinned sharing); `customDepthMaterial` on remaining casters; `castShadow = false` on eyes, lids, whiskers, blade, bow, cape, shells | `materials.js`, `KittenBuilder.js`, `Sword.js`, `Bow.js`, `Eyes.js`, `Fur.js` | P0 / A | `perf:reresolve` |
| H4 | Fur shells per §9.3 (X8: iso 0 / 0 / 0-or-4, close-up by `cam.closeUp`); idle-built shell mesh; 256² strand texture in a worker / at first close-up | `Fur.js`, `runtime.js`, new `furWorker.js` | P1 / B (C for the S2 gate) | S2 |
| H5 | WarmToon = ART §5 family (`makeToonMaterial`, `softRamp`, `makeSteelMatcap` 256², unlit eyes) composed with `withHeightFog`; `toonLib` per-kind dedupe; preview uses Neutral | `materials.js`, `preview.js`, `Armour.js`, `Plate.js`, `Sword.js`, `Eyes.js` | P1 / C | S1, S5, `perf:programs` ≤ 30 |
| H6 | ART §6.2 skinned tuft cards (Med / High, 1 draw; Low none) | `KittenBuilder.js`, `Fur.js` | P1 / C | S2, ART G10 |
| H7 | `bakeSkinned` (§9.4) + per-template diff test; then hero / kittens bake with expression atlas and swappable second mesh | new `merge.js`, `Eyes.js`, `runtime.js` | P2 / D | S12, `perf:draws` |
| H8 | Warm hull outline (skinned + static), ART widths / `TONE.ink`, `QUALITY.outline` tiers (§9.5) | new `Outline.js` | P2 / C | S6 |
| H9 | `?furHull=1` noisy hull prototype (flag only) | `Outline.js` | P3 | art judgement |

### player (`src/player/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| L1 | Hero build after the title in idle slices (≤ 150 ms before T_title) | `Player.js`, `SwordcatModel.js` | P1 / B | `perf:boot` |
| L2 | Write `ENV_U.uGlow` position each frame (replaces `Env.heroLight`); register her blob | `SwordcatModel.js` | P1 / C | S13 |
| L3 | Consume the baked hero (H7); cape / skin swap re-bakes outside combat | `SwordcatModel.js` | P2 / D | S12 |

### combat (`src/combat/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| B1 | Allocation-free `assistTarget` scoring (pass `out`); keep the projectile pool | `Combat.js`, `targeting.js` | P1 / B | `perf:alloc` |
| B2 | Projectiles: `castShadow = false`, blob registration for large ones only | `Projectiles.js` | P1 / C | `perf:draws` |

### enemies (`src/enemies/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| E1 | `VisualPool` + prefill `max(waveSize)` per type under the veil; `uncacheRoot` on release | new `VisualPool.js`, `EnemyManager.js` | P0 / A | `perf:spawn` |
| E2 | Prewarm set includes props, depth variants, focus-fog variants (via C4) | `EnemyManager.js` | P0 / A | `perf:no-compile` |
| E3 | Per-kind materials + depth materials on KayKit / beast parts; cast only through the body / proxy | `rig.js`, `props.js`, `kaykitGear.js` | P0 / A | `perf:reresolve` |
| E4 | Think / perception sub-rates by tier (§4.2), telegraph timers at 60 Hz; mixer LOD; `_updateAnim` and `_cands` without allocation | `Enemy.js`, `onscreen.js` (reads `cam.frustum`) | P1 / B | `perf:alloc`, unit |
| E5 | Lazy enemy types + `preloadTypes(types)` | `EnemyManager.js`, `types/*.js` | P1 / B | bundle budget |
| E6 | `castShadow = false` + blob registration (end state) | `Enemy.js` | P1 / C | `perf:shadow` |
| E7 | Bake per template (H7) used by the pool; clip keep-lists and the shared KayKit / Skeleton libraries | `rig.js`, `clipMaps.js`, `assets.manifest.js` | P2 / D | S12, enemies smoke |
| E8 | Boss `.clone()` in update → scratch | `types/boss_*.js`, `jelly.js`, `stealer.js`, `scripted/Pilfer.js` | P2 / D | `perf:alloc` |

### companions (`src/companions/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| M1 | NPC kitten bands (§4.3: ≤ 8 m full; > 8 m 30 / 15 Hz, sheen; tier ≥ 1 10 Hz / off) | `HubKittens.js`, `NpcActor.js`, `LostKitten.js`, `CompanionManager.js` | P1 / B | hub CPU (companions ≤ 0.4 ms) |
| M2 | Companion think at 10 Hz, steering at 60 Hz; scratch vectors (A11) | `Companion.js`, `steering.js`, `LostKitten.js`, `HubKittens.js` | P1 / B | `perf:alloc` |
| M3 | Blob registration, `castShadow = false`; consume baked kittens | `Companion.js`, `Pudding.js` | P1 / C, P2 / D | `perf:shadow` |

### world (`src/world/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| W1 | Material de-share by kind (the wood material first), per-kind depth materials, cast-flag trim (§7.1 list) | `Props.js`, `LevelKit.js`, `Dressing.js`, `levels/*.js` | P0 / A | `perf:reresolve`, ≤ 15 shadow draws |
| W2 | `_prewarm` → `core/prewarm.js` with the full warm set; drop the culling-off frames | `LevelManager.js` | P0 / A | `perf:no-compile` |
| W3 | Parallel level load; yielding `build` (8 ms slices) | `LevelManager.js`, `LevelKit.js` | P1 / B | level transition budget |
| W4 | Static matrices + `dynamicRoot`; ≤ 300 auto-updating objects | `LevelKit.js`, `levels/*.js` | P1 / B | `perf()` object count |
| W5 | Fog-radius cull at 4 Hz keyed to `cam.focus` (BatchedMesh `setVisibleAt`, instanced sets, tiles); replaces every per-class `maxDist` (incl. AUTOCAM §9.4's) | `LevelKit.js`, `Props.js`, `HeightFog.js` (exports R) | P1 / B | S9, `perf:draws` |
| W6 | Grass + flower tufts in 1 draw, d-scaled tile centred on the footprint, fixed counts; wheat tufts; ART colours / width / up-bent normals | `Grass.js`, `Wheat.js` | P1 / B (look in C) | S10, `perf:draws` |
| W7 | Flames as one InstancedMesh; pickups instanced pools with dirty lists; trees without LOD / billboards; multi-draw fallback per 32 m cell | `Dressing.js`, `Pickups.js`, `Props.js` | P1 / B | `perf:draws`, `perf:alloc` |
| W8 | Lamps and glow as `ENV_U` uniforms delivered by `withHeightFog` (key suffix `hfog3`); remove `heroLight` and the LightPool; PMREM out of play | `Env.js`, `HeightFog.js`, `Dressing.js` | P1 / C | S13, `perf:no-compile` (day → night) |
| W9 | Every world material → **Lambert + ART global toon patch** / vertex colour (terrain, props, foliage sway, water, bricks atlas); per-kind clones | `Terrain.js`, `Props.js`, `LevelKit.js`, `Water.js`, `levels/*.js` | P1 / C | S1, `perf:programs`, ART G1–G6 |
| W10 | Shadows (X7): stage 1 footprint-fitted dynamic box from `cam.footprint`; stage 2 actors stop casting + `StaticShadow.js` cached box (fit + 8 m margin, 8 m snap; Med 1024 / High 2048); Low height-term vertex AO | `Env.js`, new `StaticShadow.js`, `Terrain.js`, `Props.js` | stage 1 P1 / B, stage 2 P1 / C | `perf:shadow`, S4, S11, AUTOCAM §11.3 |
| W11 | `Env.set` state reuse (verify the `cloneState` attribution first on an idle machine) | `Env.js` | P2 / D | boot profile |
| W12 | Manifest tiers + zone-approach preload + next-level prefetch | `assets.manifest.js`, `LevelManager.js` | P2 / D | `test:unit` |

### fx (`src/fx/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| F1 | `prewarm(root)`: one of every pool / program into the warm set | `FX.js`, `Telegraphs.js`, `HolyFX.js`, `Horde.js`, `Particles.js` | P0 / A | `perf:no-compile` |
| F2 | Find and remove the doubled fx program variants (canvas vs composer target parameter) | `shaders.js` | P0 / A | `perf:programs` |
| F3 | `BlobShadows.js` (64 slots, 1 draw, `TONE.blob`); serves CONTROLS §5.4 / §7.3 blobs | new `BlobShadows.js` | P1 / C | S4 |
| F4 | One instanced ground-decal pool (≤ 2 draws) | new `GroundDecals.js`, `Telegraphs.js` | P1 / B | `perf:draws` |
| F5 | Glow cards on **every** tier (blade halo, aura hull, sparkles; ART §8.5); `perf.particleScale` respected by every pool | `HolyFX.js`, `Particles.js` | P0 / A (before C6 removes bloom) | S1, ART S6 |
| F6 | Holy light → `ENV_U.uGlow` radius / colour; remove `HolyFX.light` and `Lanterns.js` PointLights | `HolyFX.js`, `Lanterns.js` | P1 / C | S13 |
| F7 | `MistCards.render` scratch; damage numbers transform-only or sprites | `MistCards.js`, `DamageNumbers.js` | P1 / B | `perf:alloc`, ui budget |

### audio (`src/audio/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| U1 | Bake zzfx PCM + pink noise on the title in ≤ 2 ms idle slices; unlock = `createBuffer` + `copyToChannel` | `AudioManager.js`, `sfxDefs.js`, `procedural.js` | P0 / A | `perf:audio-unlock` |
| U2 | Listener / panners at 20 Hz when moved > 5 cm, `setValueAtTime`; 8 pooled 3D voices | `AudioManager.js` | P1 / A | CPU profile |
| U3 | Lazy decode (≤ 4 concurrent); music through MediaElement; manifest levels map out of boot JS; title set ≤ 0.3 MB | `AudioManager.js`, `MusicPlayer.js`, `assets.manifest.js` | P1 / B (manifest), P2 / D | heap at T_title ≤ 60 MB |

### story (`src/story/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| S1t | Lazy cutscenes + per-level prefetch on trigger activation | `cutscenes/index.js`, `StoryManager.js` | P1 / B | bundle budget |
| S2t | CS-00 waits on `playReady` behind the logo fade; reuse the splash SVG | `StoryManager.js`, `cutscenes/cs00.js` | P1 / B | `perf:boot`, S7 |
| S3t | Scratch in `barks.js:356`, `tutorial.js:174` | `dialogue/barks.js`, `tutorial.js` | P2 / D | `perf:alloc` |
| S4t | Cutscene close-ups use `cam.closeUp` (full cape grid, shells), compiled at boot | cutscene presets | P1 / C | `perf:no-compile` |
| S5t | Cutscene PointLights (`cast.js` CS-04 lantern, `rig.js`, ProcProps `opts.light`) → `ENV_U.uLamps` slot 0 while the scene plays (X6) | `cutscenes/cast.js`, `cutscenes/rig.js` (+ characters `ProcProps.js`) | P1 / C | `perf:no-compile`, S13 |

### ui (`src/ui/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| I1 | Splash hand-off (`.out` on `GAME_READY`); title shell in the boot chunk | `UI.js` | P1 / B | S7 |
| I2 | woff2 subsets, preload 2 fonts | `fonts.css` / `fonts.js`, `assets.manifest.js` | P1 / B | bytes before T_title |
| I3 | HUD DOM diffing, 10 Hz batching, transform / opacity only, `contain: layout paint`; bark and toast pools; allocation-free pointer handlers | `hud.js`, `toasts.js`, `threatArrows.js`, `touch.js` | P1 / B | ui budget §10.5 |
| I4 | Quality panel: Low / Med / High / Auto, FPS cap (`auto / 30 / 60 / off`), **Battery saver**; `#ui-vignette` on every tier (ART ui A0) | `menus.js`, `ui.css` | P1 / B | settings smoke |

### save (`src/save/**`)
| ID | Task | Files | Prio / wave | Gate |
|---|---|---|---|---|
| V1 | Persist `settings.quality`, `fpsCap`, `batterySaver` (additive keys, no schema bump) | `SaveManager.js` | P1 / B | save unit test |

---

## 16. Sequencing against the live controls rework

The rework is editing `FollowCamera.js`, `Input.js`, `config.js`, `index.html`, `Game.js` and the player/touch files
right now. Perf work does not edit around it.

1. **Wave A (now):** C1–C6, C11, C13, P1, H1–H3, E1–E3, W1–W2, F1–F2, F5, U1–U2. These touch isolated files or new
   files. The shared `Game.js` lines (C3 + C11: shader checks, Neutral, `antialias: true`, `installToon()`) go through
   the core rework owner as one commit; F5 lands before C6. C6 reads the new QUALITY keys with local defaults until C8
   lands. Files the controls rework is editing right now (`characters/materials.js`, `Bow.js`, `Sword.js`, companions)
   wait for its merge: H3 starts with `Cape.js` / `KittenBuilder.js` only. **Expected:** −8 to −16 ms GPU on Iris Xe
   D3D11 (C6: no composer at all), 0 re-resolves, the spawn, audio and compile hitches gone, hero CPU −1.5 to −3 ms.
2. **Wave B (with or right after the controls merge, scheduled with its owners):** C7–C10, C12, C14–C16, K1, K2, K4,
   K5, W10 stage 1, P2–P4,
   E4–E5, M1–M2, W3–W7, F4, F7, U3 (manifest), S1t–S2t, I1–I4, V1, H4, L1, B1.
3. **Wave C (ART_WARM_SPEC values exist now; art judges S1–S6, S10, S13):** H5, H6, H8, W8, W9, W10 stage 2, F3, F6,
   E6, M3, L2, B2, S4t, S5t. Programs drop to ≤ 30 here; tighten `QUALITY.med.programs` to 30 in the same commit.
4. **Wave D (P2):** H7 / E7 (enemies first, then hero and kittens), L3, C17, C18, W11, W12, U3 (decode, music), E8,
   S3t.
5. **Continuous:** C1 / C2 land first; every merge runs `SMOKE_PERF=1 SMOKE_ONLY=perf` on a quiet machine (§14.1);
   after Wave B, run the idle-machine D3D11 baseline and the real-phone soak, then set the timing thresholds (§14.4).

Expected end state (estimates from measured deltas, to be re-measured): D3D11 Med meadow iso GPU 16–28 → **6–9 ms**;
Med combat CPU → **≤ 6 ms**; hub CPU → **≤ 6 ms**; 4× proxy Low combat → **≤ 16 ms** (no spiral, no hitches);
programs 88–151 → **≤ 30**; draws per §14.3; T_title 17–22 s → **≤ 2 s**.

---

## 17. Decisions on conflicts, and what was rejected

| Topic | Decision | Rejected |
|---|---|---|
| Anti-aliasing (X1) | Canvas MSAA on every tier, direct to canvas; Med FXAA fallback only if the §6.1 A/B shows canvas MSAA > 1.5 ms dearer | perf_1 keeping `samples: 4` on the Med HalfFloat RT; this spec's earlier Med/High uber pass in play |
| Bloom (X2) | High cutscenes + ending only: dual-Kawase 3 mips half res + uber pass; NaN guard kept. Gameplay glow = glow cards | perf_0's UnrealBloom at half res (subsumed); bloom in play on any tier |
| Shadows (X7) | Stage 1: trimmed casters + per-kind depth + AUTOCAM footprint box. Stage 2: blobs + cached static map (footprint fit + 8 m margin), Med 1024 / High 2048; Low none | perf_0 R2.4 30 Hz / moved-only dynamic actor shadows (visible stutter) as an end state; the fixed 64 × 64 m box |
| Steel | ART 256² matcap; High-only Standard + PMREM in close-ups | perf_2 "plate and steel = Standard + PMREM"; perf_0 "keep Physical" |
| Fur (X8) | Iso shells Low 0, Med 0, High 4 only if S2 passes; close-up by `cam.closeUp`; NPC kittens 0 | perf_0 "keep 16"; the on-screen-px bands; Med 4 |
| Programs | ≤ 40 now, ≤ 30 after WarmToon, High + ≤ 36 prewarmed cinematic variants; plus `perf:no-compile` and 0 re-resolves | perf_2's ≤ 60; ART's draft ≤ 50 / 60 / 60 |
| Draws | Med ≤ 60 / Low ≤ 40 scene (end), interim I1 ≤ 120 / 70 and I2 ≤ 90 / 60 frame | perf_2's ≤ 120 as an end state |
| Phone frame rate | Auto targets 60 with dyn-res + thermal ladder; 30 lock only as fallback or Battery saver | perf_2's default 30 lock on phones |
| Sim step | 60 Hz everywhere; `maxSteps` 4 / 3 + dilation; sub-rate AI, perception, mixers | perf_0 R6 30 Hz `lowStep` (breaks parry and hitstop) |
| Far plane (X12) | `clamp(ceil5(max(footprint far, fog far)), 45, 90)` + `farKeep`, fallback 60; classic 600 | CONTROLS_SPEC's 90 m in iso; a 60 m floor |
| Grass (X11) | perf_1 tufts, d-scaled tile centred on the footprint, fixed counts, ART look | perf_0's "radius 22 m" tweak; ART's 9-tri clumps at 8k / 12k |
| Culling | One fog-radius cull keyed to `cam.focus` | separate per-class `maxDist` (incl. AUTOCAM §9.4) and 32 / 45 m tile systems |
| World material (X5) | Lambert + ART global toon patch; lamps / glow through `withHeightFog` | a world-wide MeshToon "WarmToon" |
| Character merge | Enemies first (after the rework), then hero / kittens with atlas + swappable second mesh | big-bang bake of hero and kittens during the rework; perf_1's `bakeSkinned` math as written |
| WarmToon world position | HeightFog `vFogW` | the `inverse(viewMatrix)` per-fragment sketch |
| Low AO | Height-difference term at build, or offline bake | 8-ray vertex AO at level build on phones |
| Fur substitute outline | `?furHull=1` prototype only | shipping the noisy hull outline unjudged |
| Fur strand texture | 256² in a worker or at first close-up | a 512 KB baked PNG |
| EventBus | Keep; DEV-only unknown-event warning | the copy-on-write rewrite as perf work |
| Caching | Hashed asset names first | service worker, SFX sprites, Opus re-encode now (deferred to M4) |
| Measurement | Counts gate now; timings after an idle D3D11 + real phone baseline; private build for startup | any draft's absolute ms / fps as a threshold; rebuilding the shared `dist/`; dev-server load timings |

---

## 18. Risks and open questions

1. **Real phone GPUs are unmeasured.** Tile GPUs punish alpha overdraw (shells, mist cards, decals) far more than the
   Iris Xe does. The real-phone soak (§14.1.5) runs before any Low threshold is frozen.
2. **iOS without `WEBGL_multi_draw`:** BatchedMesh becomes N draws; the per-cell merge fallback must be measured on
   an iPhone.
3. **FXAA on Med** may soften the 1-px eye highlights; S1 / S5 judge it. If it does, the A/B RGBA8 + MSAA 4 variant
   ships instead.
4. **Matcap steel** must keep the "polished silver" signature (S5); the High-only Standard fallback exists.
5. **Shared clip libraries** need equal rest poses (unverified); per-character smoke with `measureFit`.
6. **Lazy systems vs CS-00:** the title must not touch gameplay services; CS-00 waits on `playReady`.
7. **`bakeSkinned`** needs equal `boneInverses` across parts; parts that differ stay separate (counted in
   `perf().byCat`). Expressions and swaps need the atlas and the second mesh.
8. **Static shadow re-render** is a 1–2 ms single frame; split over 2 frames if it shows (S11).
9. **Removing PointLights** changes the night look; S13 compares against today's look.
10. **`Env.cloneState` 0.98 s** boot attribution is suspect under inlining; re-profile before acting (W11).
