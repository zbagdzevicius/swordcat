# perf_2: CPU and load architecture (draft)

Author: perf research (CPU/load angle), 2026-10-11. Status: **draft for the lead**. It is design only: nothing under
`src/`, `tests/`, `index.html`, `GAME_DESIGN.md` or `package.json` was touched.
Scope: fixed-step cost, physics/pathfinding/AI budgets, pooling, the zero-allocation audit, animation-mixer LOD,
event-bus overhead, asset loading (meshopt, lazy per level, code splitting, prefetch), bundle size and startup
targets (**< 3 s to an interactive title on desktop, < 6 s on mobile 4G**). GPU fill, post and fur-shader cost are
another doc's subject. They appear here only where they show up in CPU timings.

User request this serves: *"warm cartoonish … everyone will feel great inside … performance must be extraordinary …
maximum moba-like automatic camera control."* Being fast is part of feeling warm. The first thing anyone sees is a
warm title card in under 0.3 s, never a grey wait. Every number below is a budget that a test can check.

Tools written for this draft (all in `research/next/tools/`, port 5803):

| Tool | What it measures |
|---|---|
| `perf2.vite.config.mjs` | Production build into `tools/dist_perf2/` with sourcemaps (no public copy) |
| `perf2_serve.mjs` | Static server (gzip for js/html/css/json) of that build plus `public/`, on :5803 |
| `perf2_measure.mjs startup [--net=4g --cpu=4]` | Cold boot to title: phase marks, system `init` ms, per-GLB load ms, bytes by type |
| `perf2_measure.mjs runtime` (`VW`/`VH` env) | Per-system `update` ms per step and `render` ms per frame, step count, frame p95/p99, emits/s, sampled allocation by function |
| `perf2_bootprof.mjs`, `perf2_runprof.mjs` | CPU profiles mapped back to `src/` lines via sourcemaps |
| `perf2_progwhy.mjs`, `perf2_programs.mjs`, `perf2_matshare.mjs` | Why three re-resolves programs per frame; program counts; materials shared across mesh kinds |
| `perf2_ablate.mjs` | Render-cost ablation (hero hidden, shadows, composer, presets) |
| `perf2_spawnhitch.mjs` | Worst frame after spawning N enemies |
| `perf2_capebench.mjs` | Node micro-benchmark of `ClothSim.step` and the per-frame normal recompute |
| `perf2_allocscan.mjs [--list]` | Static scan of hot methods for allocation patterns |
| `perf2_manifest_sizes.mjs`, `perf2_glbinfo.mjs`, `perf2_glbopt.mjs` | Per-level preload sizes; GLB anatomy; the GLB pipeline recipe |

**Measurement caveat (read first).** Every in-browser number below comes from headless Chromium with
ANGLE-GL on this Iris Xe laptop (i7-1255U, clock capped at 1.7 GHz). During the runs, 8–10 other agents were running
vite servers and Playwright suites, and total CPU load was **70–95 %**. A calibration loop (2000 `sqrt` evaluations)
took 109–295 µs, against about 3–5 µs on an idle machine. Repeated runs of one scene varied **2–4×**, so treat the
absolute ms as upper bounds and the **ratios, counts, bytes and orders** as the findings. §16 defines the protocol
for the real numbers (idle machine, best of 3, real Chrome).

---

## 0. TL;DR: the 12 changes, in order of payoff

| # | Change | Area(s) | Measured now | Target / expected |
|---|---|---|---|---|
| 1 | **Title-first boot**: an inline warm splash (HTML/CSS/SVG) at first paint; the title becomes interactive on a tiny backdrop while the meadow streams in behind "Press any key" | core, ui, world, story | Title ready at **16.9–22.7 s** desktop (localhost) and **42 s** at 4G with 4× CPU | First paint ≤ 0.3 s; interactive title ≤ 2.0 s desktop and ≤ 5.0 s at 4G |
| 2 | **GLB pipeline**: prune unused clips, put one shared clip library on each rig family, then resample, quantize and meshopt | core (`scripts/`), enemies, world | Meadow preload **12.1 MB GLB** of 16.7 MB; Knight / Barbarian / Rogue are 2.8 MB each | Knight mesh **0.17 MB**, shared KayKit library (27 clips) **0.78 MB** → 3 characters 8.4 → **1.3 MB**; meadow GLB ≤ 3 MB |
| 3 | **Tiered per-level manifests** (title / p0 / p1 / p2) plus an idle prefetch of the next level | every area's `assets.manifest.js`, core `Assets` | The `'*'` set preloads 200 files (3.4 MB of audio) before every level; 347 requests to the title | Title set ≤ 1.5 MB / ≤ 40 requests; p0 ≤ 4 MB per level |
| 4 | **Shader programs**: `checkShaderErrors` off in prod, chunked `compileAsync`, a program budget, a shared material library, no depth-material ping-pong | core, characters, fx, world | 88 (meadow) / 129 (town) programs; **6–9 s** of boot CPU blocked in the program link-status check; 8 program re-resolves per frame | ≤ 60 programs per level; no synchronous link waits; 0 re-resolves per frame |
| 5 | **Code splitting**: a boot chunk, then a play chunk loaded in parallel; cutscenes, enemy types, debug and the audio manifests become lazy | core, story, enemies, audio | `index` **1,540 KB min / 496 KB gz**, all on the critical path | Critical JS ≤ 350 KB gz (three 209 + boot ≤ 140) |
| 6 | **Hero cape**: grid normals instead of `computeVertexNormals`, LOD at the iso distance | characters | Cape 3–9 ms/frame (inclusive, contended); 1.4–2.8 MB/s of the allocation churn | ≤ 0.25 ms/frame desktop; 0 B/frame |
| 7 | **Enemy visual pool** plus pre-instancing for the arena's wave sizes | enemies, world | Spawning 4 enemies: worst frame **58–388 ms** against a 9–47 ms median | No frame > 1.5× median on spawn |
| 8 | **Activity LOD keyed to the iso focus and frustum** (AI think rate, mixer rate, cape, fur, grass) | camera (provides), enemies, companions, characters, world | 22–30 actors, all at full rate; 44 `frustumCulled = false` sites | AI ≤ 0.08 ms per enemy-step; off-screen actors ≤ 15 % of on-screen cost |
| 9 | **Fixed-step budget and scheduler**: tiered `maxSteps`, per-system sub-rates, perf marks | core | 2.0–3.9 steps per rendered frame when slow; step 1.1–3.5 ms | Step ≤ 1.0 ms desktop (idle), ≤ 2.5 ms on a 4×-slower phone; `maxSteps` 3 on low |
| 10 | **Zero-allocation pass** on the measured hot spots (cape, `KittenBuilder.E()`, `Input.poll`, separation fields, `Enemy._updateAnim`, `EventBus.emit`) | characters, core, physics, enemies | **4.1–7.0 MB/s** sampled churn | ≤ 0.5 MB/s steady state from game code; no GC pause > 4 ms |
| 11 | **Static scene matrices, far plane 600 → 60 m, distance-hidden tiles** | world, camera, core | 420–1,186 scene objects traversed per frame; `updateMatrixWorld` about 1.3 ms/frame | ≤ 300 objects with auto-updating matrices |
| 12 | **Boot CPU off the main thread**: the fur strand texture (0.5–0.7 s) and the nav-grid build go to workers or build time; the procedural hero builds after the title | characters, physics, player | `player.init` **1.0–1.6 s** on the boot path | ≤ 150 ms of hero work before the title |

---

## 1. Targets and budgets (binding once accepted)

### 1.1 Startup

Definitions:
- **T_paint**: first non-blank pixel.
- **T_title**: the logo is visible, the backdrop renders, and input is accepted.
- **T_play**: the first gameplay frame of the meadow, at Continue or after CS-00.
- All are cold cache, measured from `navigationStart`.

| Metric | Desktop (Iris Xe, 50 Mbps / 20 ms RTT) | Mobile (Lighthouse-like 4G: 9 Mbps / 150 ms RTT, 4× CPU slowdown) | Now (measured, see caveat) |
|---|---|---|---|
| T_paint | ≤ **0.3 s** (warm splash inlined in `index.html`) | ≤ **0.8 s** | about 5.9 s (DCL; nothing paints before the canvas) |
| T_title | ≤ **2.0 s** (hard cap 3.0) | ≤ **5.0 s** (hard cap 6.0) | 16.9–22.7 s / 42.1 s |
| T_play (meadow, from a press at T_title) | ≤ 4.0 s total; the press never waits more than 1.5 s (CS-00 masks the rest) | ≤ 9 s total; ≤ 3 s wait | the same as T_title (the title waits for the full level) |
| Level transition (veil up → first frame) | ≤ 2.5 s (≤ 1.0 s when prefetched) | ≤ 6 s (≤ 2.5 s prefetched) | meadow → forest not measured; build + prewarm alone are 2.3–7.9 s |
| Bytes before T_title | ≤ **1.5 MB** transferred, ≤ 40 requests | the same | 17.97 MB, 347 requests |
| JS before T_title | ≤ **350 KB gz** (≤ 1.2 MB min) | the same | 730 KB gz (2.36 MB min) |
| Main-thread long tasks before T_title | none > 200 ms after T_paint | none > 400 ms | 9 tasks > 200 ms, the longest 5.5–5.9 s |
| JS heap at T_title | ≤ 60 MB | ≤ 60 MB | 159–190 MB |

### 1.2 Per-frame CPU (main thread) at Med, desktop, idle machine. Phone budgets are for a mid phone ≈ 4× slower

| Bucket | Desktop budget (ms) | Phone budget (ms, at 30 fps lock) | Notes |
|---|---|---|---|
| Fixed sim, per step (all systems) | **1.0** | 3.0 | 60 Hz; average 1.0–1.2 steps per frame at 60 fps |
| of which enemies (AI + movement), 8 active | 0.35 | 1.0 | ≤ 0.045 ms per enemy-step on average (staggered thinking, §8.3) |
| of which physics (move + separation, 30 actors) | 0.25 | 0.8 | spatial hash above 24 actors (§8.5) |
| of which pathfinding (amortised) | 0.10 | 0.3 | ≤ 2 `findPath` per step, ≤ 1.5 ms each worst case, queued (§8.4) |
| of which player + companions + world + story + fx sim | 0.30 | 0.9 | |
| Render-side systems (actors interpolate, cape, fur, camera, fx, ui, audio) | **1.5** | 4.0 | hero cape ≤ 0.25, all kittens ≤ 0.4, camera with occluders and pick ≤ 0.3 |
| three submit (`renderer.render` CPU: cull, sort, set programs, uniforms) | **2.5** | 6.0 | about 0.02 ms per draw: ≤ 120 calls; 0 program re-resolves per frame |
| GC (amortised) | ≤ 0.2 | ≤ 0.5 | ≤ 0.5 MB/s churn → minor GC every ≥ 8 s |
| **Total CPU per frame** | **≤ 6 ms** (leaves the GPU 10 ms) | ≤ 16 ms (30 fps) | now 6.9 ms (640×360, a calm moment) up to 24.6 ms (1080p) in the meadow idle |

### 1.3 Load and memory budgets per level

| Item | Budget | Now (meadow) |
|---|---|---|
| p0 download (needed for the first frame) | ≤ 4 MB | 16.7 MB (everything is p0) |
| GLB parse + clone on the main thread | ≤ 300 ms | about 400 ms of GLTFLoader self time, plus clones |
| Level `build()` | ≤ 400 ms desktop | 1.6–4.2 s (Terrain 0.48 s, Props 0.32 s, Octree 0.14 s, …) |
| `physics.setLevel` | ≤ 100 ms (+ nav build in a worker) | 60–325 ms |
| Prewarm (programs + 2 frames) | ≤ 600 ms with parallel compile | 2.3–7.9 s |
| Programs per level | ≤ 60 | 88 / 115 / 129 (meadow / forest / town) |
| Scene objects with auto-updating matrices | ≤ 300 | 420–1,186 |
| JS heap in play | ≤ 120 MB desktop, ≤ 90 MB phone | 45–61 MB in play, 159–190 MB at boot (the boot spike is GLB JSON plus decoded audio) |

---

## 2. Baseline measurements

### 2.1 Bundle (production build; `perf2.vite.config.mjs`)

| Chunk | min | gz | Notes |
|---|---|---|---|
| `index` (game code) | **1,540 KB** | **496 KB** | By area: story 233K, characters 166K, ui 160K, enemies 141K, audio 134K (`audio/assets.manifest.js` alone is **36.7K**), fx 127K, companions 110K, core 69K, player 68K, world 65K, camera 55K, physics 42K, combat 30K, meshopt decoder 26K |
| `three` | 820 KB | 209 KB | three.core 375K, three.module 195K, GLTFLoader 42K, Octree 6K, UnrealBloom 6K, the rest < 5K each. The core is not tree-shakable: about 200 KB gz is the floor |
| `LevelKit` | 93 KB | 34 KB | lazy (shared by the levels) |
| Levels | 1–31 KB each | 0.6–12 KB | lazy |
| lil-gui, stats, zzfx, AudioMeter | small | — | lazy |

Top single files in `index`:

| File | min |
|---|---|
| StoryManager | 82K |
| AudioManager | 41K |
| audio manifest | 37K |
| Enemy | 34K |
| strings | 30K |
| KittenBuilder | 30K |
| Player | 28K |
| FX | 28K |
| meshopt decoder | 26K |
| Cutscene | 25K |
| LostKitten | 24K |
| config | 23K |
| sfxMap | 23K |
| SwordcatModel | 22K |
| FollowCamera | 22K |

All cutscenes (`cs00…cs10`, `d0x`, `g0x`, about 150 KB) are statically imported through `story/cutscenes/index.js`.

### 2.2 Cold boot to title (`?test&level=meadow&spawn=title`, localhost, no throttle)

| Phase (ms from navigation) | Run A | Run B | 4G + 4× CPU |
|---|---|---|---|
| JS fetched and evaluated, `Game` constructed (`installDebug`) | 4,173 | 3,103 | 1,870 * |
| DCL | 5,911 | 5,690 | 3,720 |
| `init()` total | ≈ 1,560 (**player 1,264**, ui 124, fx 33, env 30) | ≈ 1,930 (player 1,605, fx 151, ui 111) | ≈ 1,470 (player 1,014, fx 217, ui 187) |
| `preloadLevel('meadow')` | **6,441** | 9,537 | **23,705** |
| import + `def.build()` | ≈ 1,590 | ≈ 2,400 | ≈ 4,200 |
| `physics.setLevel` | 60 | 108 | 325 |
| `_prewarm` (compileAsync + 2 frames) | **2,345** | 3,832 | **7,887** |
| **ready (title)** | **16,889** | 22,110 | **42,364** |

\* CDP throttling attaches after the first script starts; treat the 4G JS phase as optimistic.

Bytes in run A: **17.97 MB**, 347 requests.

| Type | Size |
|---|---|
| GLB | 11.83 MB |
| OGG | 4.52 MB |
| TTF | 0.75 MB |
| JS (gz) | 0.73 MB |
| PNG | 0.08 MB |
| MP3 | 0.06 MB |

The slowest GLBs: KayKit Knight, Barbarian and Rogue at about 6 s each (all concurrent), then village props.

**Boot CPU profile (28.9 s wall, sourcemapped):**

| Cost | Where | Self time |
|---|---|---|
| three `WebGLProgram` first-use check (`getProgramParameter(LINK_STATUS)` + info logs, i.e. synchronous waits for the driver's compile) | `three.module.js:7022` | **9.3 s** (6.1 s in a second run) |
| `getContext` | `three.module.js:16409` | 2.6 s (3.4 s); headless GPU-process start-up, expect 0.1–0.3 s in a real browser |
| Fur strand texture | `characters/Fur.js:81` | 0.72 s |
| Cape collide during prewarm frames | `characters/Cape.js:262` | 0.53 s |
| Terrain build | `world/Terrain.js:133` | 0.48 s |
| GLTFLoader | | 0.39 s + 0.11 s + 0.11 s |
| Props | `world/Props.js:28` | 0.32 s |
| `characters/util.js:122` | | 0.28 s |
| Plate words canvas | `characters/Plate.js:46` | 0.20 s |
| StoryManager init | `story/StoryManager.js:93` | 0.14 s |
| Octree split | | 0.14 s |
| GC | | 0.52 s |

Long tasks: 26, totalling 25.1 s. The worst were 5.5 s (JS eval + `Game` construction + context) and 5.6 s
(the level preload/parse) …

**Per-level preload sets** (`perf2_manifest_sizes.mjs`; the union of `levels[id]` and `levels['*']`):

| Set | Files | Size | Composition |
|---|---|---|---|
| `'*'` (before every level) | 200 | 3.67 MB | 3.41 MB of audio (every UI/combat/creature SFX), Cat_Blocky placeholder 0.22 MB |
| meadow | 327 | **16.70 MB** | enemies 6.40 (Knight / Barbarian / Rogue 8.4 MB for the CS-02 hyenas, Cacklejaw and Pilfer), world 4.86, audio 4.61 |
| forest | 349 | 7.46 MB | audio 5.35 |
| town | 362 | 14.85 MB | |
| gate | 302 | 15.10 MB | |
| bog | 266 | 11.68 MB | |
| keep | 263 | **26.14 MB** | Skeleton Warrior / Rogue / Minion / Mage are 3.7 MB each = 14.8 MB |
| All manifests | 556 | 85.4 MB | |

### 2.3 Runtime (production build, `?test`, Med, dpr 1, 600 frames after a 120-frame settle)

1920×1080:

| Scene | CPU frame avg / p95 / p99 / max (ms) | Steps per frame | Step (ms) | Top `update` per step (ms) | Top `render` per frame (ms) | `postfx.render` (ms) | Calls / tris | Objects | Alloc (sampled) |
|---|---|---|---|---|---|---|---|---|---|
| meadow idle | 30.4 / 38.7 / 54.7 / 95.8 | 2.3 | 1.22 | player 0.31, levels 0.26, physics 0.23 | **player 6.67**, cam 0.73, companions 0.69, levels 0.68 | 17.1 | 87 / 499k | 420 | 6.6 MB/s |
| meadow + 8 rats | 62.2 / 98.3 / 175.6 / **1,241** | 3.9 | **3.55** | **enemies 1.56**, physics 0.85 | player 7.38, enemies 1.74, env 1.08, cam 1.03 | 34.2 | 155 / 574k | 893 | 7.0 MB/s |
| town (hub start) | 51.4 / 104.8 / 273.6 / 466 | 3.1 | 2.56 | enemies 0.95, physics 0.52, companions 0.20 | player 6.10, companions 1.88, cam 1.27, env 1.17 | 30.3 | 125 / 523k | 1,186 | 4.7 MB/s |
| forest | 54.2 / 103.1 / 172.6 / 256 | 3.6 | 2.29 | enemies 0.59, physics 0.51, player 0.42 | player 7.79, companions 1.39, env 1.02 | 31.6 | 144 / 473k | 964 | 4.1 MB/s |

At 640×360 (GPU fill no longer limiting) the shape is the same: meadow idle 23.2 ms (postfx 12.9, player render
5.3), 8 rats 54.0, town 47.8, forest 26.0. In a calm window the ablation run got **6.9 ms CPU per frame at 60 fps** in
the meadow. That gap (6.9 against 23.2) is the contention noise.

Ablation (`perf2_ablate.mjs`, meadow):

| Variant | 640×360: fps / render ms / CPU frame ms | 1080p: fps / render ms / CPU frame ms |
|---|---|---|
| Med baseline | 60.1 / 3.25 / 6.89 | 31.4 / 14.87 / 24.63 |
| **Hero hidden** | 58.4 / 3.48 / 6.95 | **38.3** / 10.38 / 18.91: calls 87 → 63, **tris 499k → 294k (the hero is 205k triangles and 24 draws)** |
| Shadows frozen | 56.4 / 5.41 / 9.56 | 35.3 / 11.86 / 20.30 |
| No composer | 47.7 / 8.64 / 14.32 (noise) | **55.3** / 6.17 / 11.23 |
| Low preset | 56.1 / 5.22 / 9.46 | 45.5 / 6.82 / 12.68 |

The 1080p numbers are GPU-bound (composer, MSAA and fill). That belongs to the GPU doc. The CPU findings are the
cape, the program churn and the per-actor costs.

Other measured facts:
- **Program churn** (`perf2_progwhy.mjs`): **8 `getProgram` per frame** in the idle meadow. The causes:
  - three's shared `MeshDepthMaterial` (#2) flips `skinning`, `instancing`, `instancingColor` and `batching` 4×/frame, because skinned, instanced and plain casters are interleaved in the shadow pass;
  - one wood `MeshStandardMaterial` (#320) is shared by plain meshes (`practiceGate`, `swingingSack`, `wobble_body`) and `InstancedMesh` with `instanceColor` (`fence_simple`, `gate_posts`, `lantern_post`). It flips 2×/frame.

  Each flip runs `getParameters` + `getProgramCacheKey` (array build, `join`). Those were the top sampled allocators
  in three (0.6–1.0 MB/s).
- **Spawn hitch** (`perf2_spawnhitch.mjs`, 640×360, after prewarm):
  - meadow, 4× `rat_pike`: worst frame **167 / 100 / 58 ms** in three rounds against a median of 9 ms;
  - town, 4× `hyena`: **388 / 150 / 170 ms** against a median of 47 ms.

  The synchronous `spawn()` itself is only 0.6–9 ms. The cost lands in the following frames (async `loadVisual`:
  SkeletonUtils clone, beast head, materials, first upload).
- **Cloth** (node, contended; calibration loop 109–295 µs per 2000 sqrt):
  - `ClothSim.step` (117 particles, 503 constraints, 4 iterations, 6 spheres): 230–573 µs ≈ 2× the calibration;
  - `computeVertexNormals` on the 33×25 render grid (825 vertices): 650–1,456 µs ≈ 5–6× the calibration;
  - on an idle machine that is about 10 µs and 25 µs, so the cape is not slow by design. At up to 4 sub-steps per frame, plus normals, plus the Catmull-Rom up-res, it is the biggest game-code item per frame and the biggest allocator.
- **Event bus**: at most **25 emits/s** in combat: `combat:telegraph` / `telegraphEnd` 5–6/s, `combat:hit`, `player:damaged`, `fx:shake` and `player:land` about 2/s each. The idle game emits 0/s. The bus is **not** a CPU problem (§11).
- **Shader programs**: `KHR_parallel_shader_compile` is not exposed under headless ANGLE-GL. Real Chrome on Windows (ANGLE-D3D11) exposes it, so §6 must work both ways. `renderer.debug.checkShaderErrors` is **true** in production.

### 2.4 GLB anatomy (`perf2_glbinfo.mjs`) and the pipeline result (`perf2_glbopt.mjs`)

| File | Now | Content | meshopt only (gltf-transform `optimize`) | Recipe in §5.1 |
|---|---|---|---|---|
| `kaykit/Knight.glb` | 2.85 MB | **JSON 1.45 MB**, 76 clips / 8,712 channels, 7k verts | 2.03 MB (0.42 MB gz) | mesh only **0.17 MB** (0.11 gz); with its 27 used clips 0.95 MB; shared library of 27 clips **0.78 MB** (0.25 gz) |
| `skeletons/Skeleton_Warrior.glb` | 3.74 MB | JSON 1.85 MB, 95 clips / 10,807 channels | 2.64 MB (0.56 gz) | mesh only **0.17 MB** |
| `animals/Cow.glb` | 0.76 MB | 13 clips | 0.44 MB (0.12 gz) | — |
| `polypizza/Rat.glb` | 0.53 MB | 6 clips, 8k verts, ×100 node scales | **0.16 MB** (0.08 gz) | — |
| `village-kaykit/building_castle_red.glb` | 0.33 MB | 8.9k verts | **0.09 MB** (0.06 gz) | — |

No shipped GLB uses any compression extension today (`ext=[]`). Code references 27–35 distinct KayKit clip names out
of 76.

---

## 3. Startup architecture: title-first, everything else streams

### 3.1 Timeline target (desktop, cold)

```
0.00  HTML 1.5 KB + inline warm splash (cream→peach gradient, SVG paw + sword logo, CSS "kneading paws" loader)  ← T_paint ≤ 0.3 s
0.05  <link rel=modulepreload> boot.js, three.js; <link rel=preload as=font> 2 woff2 (Fredoka, Cinzel Decorative)
0.35  boot.js evaluated: Game shell, EventBus, Input, Assets, PostFX, UI(title/menus), Save, config. NO gameplay systems.
0.45  WebGL2 context, renderer, title scene (sky dome + 1 terrain patch + Tallbert statue + 6 props + grass 4k) from
      the `title` manifest (≤ 1.2 MB); its ≤ 16 programs go through compileAsync while the logo animates in DOM
1.0   import('./play.js') (player, characters, camera, physics, combat, enemies base, companions, fx, world, story)
      started in parallel at 0.35 s; meadow p0 manifest fetch starts at 0.6 s (priority: high for p0)
1.6   title backdrop renders; "Press any key" shown when the title programs are linked        ← T_title ≤ 2.0 s
2–4   play chunk evaluated; systems constructed + init; meadow build runs in ≤ 8 ms slices between title frames;
      nav grid builds in a worker; level programs compile in parallel batches
press CS-00 starts on the title backdrop (it is already the meadow's title spawn); the full meadow swaps in under the
      CS-00 fade if it is not ready yet; Continue shows the warm splash card with a paw progress ring (never grey)
```

Mobile 4G, the same path:
- HTML, boot (≈ 140 KB gz) and three (209 KB gz) arrive in ≈ 0.35 s plus 3 RTT;
- parse ≈ 1.0 s at 4×;
- context ≈ 0.4 s;
- title assets 1.2 MB ≈ 1.1 s, overlapped with the parse;
- 16 programs ≈ 1.0 s;
- T_title ≈ 4–5 s.

### 3.2 Recipes

**R1. Warm splash in `index.html` (core).** It costs about 3 KB inline and goes in place of the bare `#B7C0C3`
background. That grey is the "90s nostalgic" first impression the user asked to avoid.

```html
<style>
  html,body{background:#F6E7D2}                      /* warm cream (art.md §6.2 token family) */
  #splash{position:fixed;inset:0;display:grid;place-items:center;
          background:radial-gradient(120% 90% at 50% 35%,#FFF4E2 0%,#F7D9B8 55%,#EDB98C 100%);transition:opacity .4s}
  #splash svg{width:min(42vw,280px);animation:bob 1.6s ease-in-out infinite}
  @keyframes bob{50%{transform:translateY(-6px) rotate(-2deg)}}
  #splash.out{opacity:0;pointer-events:none}
</style>
<div id="splash"><svg viewBox="0 0 120 120"><!-- ≤ 2 KB paw + tiny sword + pink bow, palette tokens --></svg></div>
<link rel="modulepreload" href="/src/main.js">
```

UI removes `#splash` (add `.out`) on `E.GAME_READY`. Story's CS-00 logo reuses the same SVG, so the hand-off looks
like one continuous warm motion.

**R2. Lazy systems behind a frozen ctx (core).** The ctx *shape* stays frozen. Only the construction time moves.

```js
// core/systems.js — each entry gains `load`; the static imports go away (they drag 1.2 MB into the boot chunk).
export const SYSTEMS = [
  { key: 'physics', area: 'physics', file: 'physics/Physics.js', load: () => import('../physics/Physics.js').then((m) => m.Physics) },
  // … same for cam, player, combat, enemies, companions, levels, env, objectives, fx, story …
  { key: 'ui',   area: 'ui',   boot: true, load: () => import('../ui/UI.js').then((m) => m.UI) },     // title + menus
  { key: 'save', area: 'save', boot: true, load: () => import('../save/SaveManager.js').then((m) => m.SaveManager) },
  { key: 'audio', area: 'audio', boot: true, load: () => import('../audio/AudioManager.js').then((m) => m.AudioManager) },
];
// core/Game.js start(): construct boot systems, show title, then
const playClasses = Promise.all(SYSTEMS.filter((s) => !s.boot).map((s) => s.load()));   // fired at once, parallel
```

`contracts.test.js` keeps checking the table (key, area, file) and still has `Class` after `await load()`.
`debug.js` becomes `if (params.test || params.debug) import('./debug.js').then(...)` (−11 KB, and no `__GAME__` code
in prod).

**R3. Chunk groups (core `vite.config.js`).** Rolldown `codeSplitting.groups`, the same API as today:

```js
codeSplitting: { groups: [
  { name: 'three', test: /node_modules[\\/]three[\\/]build[\\/]/, priority: 30 },                 // core only, boot
  { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples[\\/]jsm[\\/](?!libs)/, priority: 25 }, // loaders, post, Octree (play)
  { name: 'boot', test: /src[\\/](core|ui|save)[\\/]|src[\\/]main\.js/, priority: 20 },
  { name: 'play', test: /src[\\/](player|characters|camera|physics|combat|companions|fx|world[\\/](?!levels))[\\/]/, priority: 10 },
] },
```

- Story stays one chunk except the cutscenes (R4).
- Enemy *types* go lazy (R5).
- `PostFX` needs EffectComposer, so the title renders without the composer: plain `renderer.render`, with bloom off on the title. `three-addons` loads in the play group.

**R4. Lazy cutscenes (story).** Today `story/cutscenes/index.js` imports all 26 scenes (about 150 KB min):

```js
export const CUTSCENES = Object.freeze({
  cs00: () => import('./cs00.js'), cs01: () => import('./cs01.js'), /* … */ gate_open: () => import('./gate.js').then((m) => ({ default: m.gate_open })),
});
// StoryManager.play(id): const mod = await (CUTSCENES[id] ?? placeholderScene)(); — and prefetch the next likely
// scene when its trigger zone activates (level enter → import the level's scene ids from quests.js).
```

**R5. Lazy enemy types (enemies).** `EnemyManager` keeps a registry of `type → () => import('./types/x.js')`.
`levelEnemyWarm(def)` already lists the types a level can spawn, so `LevelManager._load` awaits
`enemies.preloadTypes(types)` next to the asset preload. Bosses (`boss_*`, about 40 KB) are never in the boot path.

**R6. Audio manifest out of JS (audio).** The 36.7 KB `audio/assets.manifest.js` (paths plus per-level subsets) is
eagerly imported by `core/manifests.js`'s `import.meta.glob(..., { eager: true })`. Two options:
- keep `default` (paths, for prune and the U15 test) in the module, but move the `levels` map into a JSON emitted at build time (`scripts/emit-manifests.mjs`) and fetched per level;
- or make the glob non-eager and import per need.

Either way it must not sit on the boot path.

**R7. Fonts (ui).** 0.62–0.75 MB of TTF becomes woff2 Latin subsets (expected about 25–45 KB each, ≈ 180 KB total).
Preload only Fredoka (HUD/body) and Cinzel Decorative (logo). The rest load after T_title.

```
pyftsubset Fredoka-Variable.ttf --unicodes="U+0000-00FF,U+2014,U+2018-201F,U+2026,U+2190-2193" --flavor=woff2 --layout-features='*' --output-file=Fredoka.woff2
```

**R8. Procedural hero after the title (player, characters).** `player.init` takes 1.0–1.6 s today, and 0.5–0.7 s of
that is `makeStrandTexture` (512² texels × 9 `hypot`). Options:
- **bake at build time** (`scripts/bake-fur.mjs` writes `textures/fur_strands.png`, an RGBA 512², expected ≈ 250–400 KB; load as `NoColorSpace`, no mipmap regen cost);
- or move it into a **Worker** that returns a transferable `Uint8Array` (`new Worker(new URL('./furWorker.js', import.meta.url), { type: 'module' })`): main-thread cost about 0;
- for the iso camera, 256² with 48 cells is enough on phones (the hero is 30–60 CSS px tall at 12–13 m): 4× cheaper.

The rest of the build (`util.add`, Plate canvas words, cape geometry) runs while the title is up, in `requestIdleCallback` slices.

**R9. Prewarm without blocking (world `LevelManager._prewarm`, core `Game`).**
- `renderer.debug.checkShaderErrors = import.meta.env.DEV || params.debug`. In prod, three then skips the synchronous `getProgramParameter`, `getShaderInfoLog` and `getProgramInfoLog` round-trips on first use. Those round-trips are where 6–9 s of boot CPU sat.
- `compileAsync` in **batches**: hide everything, then show and compile at most 12 new programs per batch, yielding a frame between batches. The veil (or the title) keeps animating at 60 fps; there is no 3.8 s freeze.
- Replace the "2 real frames with culling off" pass with a **shadow-only warm render** (`renderer.shadowMap.needsUpdate = true; renderer.render(warmScene, camera)` with the warm stand-ins only). Disabling culling on the whole level is what made the prewarm frames 1–2 s each.
- Keep the stand-in "keep" trick (detached visuals hold the programs). That is good and stays.

**R10. Load the level in parallel, not in series (world).** `_load` today runs, in series: unload → preload (all
assets) → `import(level)` → build → setLevel → compile. New order:

```js
const [mod] = await Promise.all([LEVELS[id](), ctx.assets.preloadLevel(id, 'p0'), ctx.enemies.preloadTypes?.(typesFor(id))]);
const level = await def.build(ctx, { yieldEvery: 8 /* ms */ });   // LevelKit yields between zones (await frame())
ctx.physics.setLevel(level);                                       // nav grid → worker (§8.4), resolves later
await this._prewarm(level);                                        // batched (R9)
ctx.assets.preloadLevel(id, 'p1');                                 // not awaited: ambience, far props, rare SFX
```

### 3.3 Prefetch (world, core)

- After `level:loaded` plus 5 s of play, the next level's **p0 bytes go into the HTTP cache**: `fetch(url, { priority: 'low' })`, no parse, at most 2 in flight, paused during combat (`audio.threat > 0`) and on `navigator.connection.saveData`. The next level is `story.quests.nextLevel()`.
- At the exit trigger's approach (the exit zone within 40 m), parse the cached GLBs (`assets.gltf(p)`, no clone) and import the level module.
- The town hub prefetches the level of the next unlocked map pin.
- Expected: the transition drops to build + prewarm only, ≤ 1.0 s desktop.

---

## 4. Bundle size: budgets and the guard

| Chunk | Budget (gz) | Today |
|---|---|---|
| `boot` (core, ui title/menus, save, audio shell) | ≤ 140 KB | (inside the 496 KB `index`) |
| `three` (build only) | ≤ 215 KB | 209 KB (with addons) |
| `three-addons` | ≤ 30 KB | — |
| `play` | ≤ 300 KB | — |
| `story` (manager, strings, quests, dialogue) | ≤ 60 KB | — |
| each cutscene | ≤ 8 KB | — |
| each enemy type | ≤ 6 KB (boss ≤ 12) | — |
| each level | ≤ 15 KB; LevelKit ≤ 40 KB | 0.6–12; 34 |
| **Critical path** (`boot` + `three`) | **≤ 355 KB** | 705 KB |

Guard: `scripts/bundle-budget.mjs` (core) reads `dist/.vite/manifest.json` (`build.manifest: true`), gzips each
chunk, and fails `npm run build` when a budget is exceeded. It prints the top 10 modules per chunk using the same
sourcemap attribution as `tools/srcmap_sizes.mjs`. Every area sees its own regression in CI.

---

## 5. Asset pipeline (core `scripts/`, every area's manifest)

### 5.1 GLB: prune → shared clip library → resample → quantize → meshopt

Recipe (`research/next/tools/perf2_glbopt.mjs`; dev dependencies `@gltf-transform/core`, `functions`, `extensions`
4.2.x and `meshoptimizer`):
1. **Drop unused clips.** Use a per-model keep list generated from `enemies/clipMaps.js` and the story's `rig.js`. Dispose the channels and samplers too, or `prune()` keeps their accessors (a pitfall found while measuring).
2. **One clip library per rig family.** KayKit Knight / Barbarian / Rogue share the bone names (GAME_DESIGN §18.2), and so do the 4 Skeletons (S15). Ship `anims/kaykit_humanoid.glb` (27 clips, **0.78 MB**, 0.25 gz) and `anims/kaykit_skeleton.glb` once. Character GLBs go mesh-only: **0.17 MB** each.
3. `resample` (lossless within 1e-4), `dedup`, `weld`, `prune`, then `quantize` (position 14, normal 10, uv 12 bits; `KHR_mesh_quantization`), then `meshopt` (`EXT_meshopt_compression`, level medium).
4. **No Draco.** Meshopt decodes faster, and the decoder is already bundled (26 KB). Move it to `three-addons` or the play chunk.

Binding a library clip to a mesh-only model (three r186):

```js
// core/Assets.js — clips come from the library GLB; PropertyBinding resolves tracks by bone NAME on the target root
async animLib(path) { return (await this.gltf(path)).animations; }          // cached once per session
// enemies/rig.js
const clips = await ctx.assets.animLib('models/anims/kaykit_humanoid.glb');
const mixer = new THREE.AnimationMixer(model.scene);
const action = mixer.clipAction(THREE.AnimationClip.findByName(clips, 'Running_A'), model.scene);
```

- Root-motion and position tracks: KayKit clips carry bone positions; a shared library is fine because the rigs share the rest pose (verify with `measureFit` in the smoke).
- The `MODEL_FIT` node scales (×100, ×39.5) stay on the mesh file. The library's tracks are local, so they are unaffected.

Expected per-level GLB bytes after the pipeline:

| Level | Now | After |
|---|---|---|
| meadow | 12.1 MB | ≈ 2.5–3 MB |
| keep | 21.9 MB | ≈ 3 MB |
| total GLB in `dist` | 32.6 MB | ≈ 8–10 MB |

### 5.2 Manifest tiers (every area; core `manifests.js` + `Assets.preloadLevel`)

Today's format (`levels: { meadow: [...] }`) stays valid and means p0. The additive form:

```js
export const levels = {
  title:  ['ui/…', 'audio/music/title_theme.ogg'],                // ≤ 1.2 MB total across all areas
  meadow: { p0: [/* first frame at the spawn: terrain tex, hero, props ≤ 40 m, CS-00 cast */],
            p1: [/* first zone's enemies, ambience, zone music */],
            p2: [/* far zones, rare SFX, boss assets: loaded at idle or on zone approach */] },
  '*':    { p0: [/* UI clicks, hero SFX ≤ 25 files */], p2: [/* the other 175 SFX */] },
};
```

Rules:
- p0 ≤ 4 MB per level;
- the title set ≤ 1.2 MB;
- `'*'.p0` ≤ 0.4 MB;
- an asset first needed by an arena wave is p1 if the arena is in the first zone, else p2 with a **zone-approach trigger** (world calls `assets.preload(zoneAssets)` when she is within 60 m of the zone's bounds);
- a unit test sums each tier's bytes from `public/assets` and fails over budget (extend U15 in `tests/unit/assets.test.js`, owner core).

### 5.3 Audio (audio)

- **Decode on first use, not at preload.** Fetch the bytes in p1/p2; `decodeAudioData` lazily, with a 4-wide concurrency cap. Music streams through `<audio>` + `MediaElementSource` (no decode of a 3-minute track into a 30 MB PCM buffer). That accounts for most of the 159–190 MB boot heap spike.
- **SFX sprites per category** (ui, cat, combat, creature, world): 200 files become 5–8 Ogg/Opus sprites at 64 kbps mono. Requests drop by about 190, and each sprite decodes once. A JSON offset table sits in `audio/sfxMap.js`.
- The title needs only `ui/*` (≈ 60 KB) and the title theme; the music director starts streaming before the first beat.
- M4's planned 128 kbps MP3 re-encode is superseded: Opus 96 kbps stereo for music is about half the size at equal quality, and every target browser decodes Opus-in-Ogg (Safari since 17.x).

### 5.4 Caching

- Hashed names for `bundle/` (immutable, 1 year).
- `assets/` gets content hashes from `prune-assets.mjs` (rename to `name.<hash8>.ext` and rewrite the manifest table), or at least `Cache-Control: max-age=86400, stale-while-revalidate`.
- A **service worker** (`sw.js`, core) with cache-first for `assets/` and `bundle/`. A second visit then reaches T_title in ≈ 1 s and level loads in ≈ 0.5 s plus build. Mobile users replay, so this matters most there.

---

## 6. Shader programs (core, characters, fx, world)

| Rule | Recipe |
|---|---|
| No synchronous compile checks in prod | `renderer.debug.checkShaderErrors = DEV \|\| ?debug` (core `Game.start`) |
| Parallel compile | Already `compileAsync` when `KHR_parallel_shader_compile` exists. Add the batch scheduler (R9). Without the extension (some Android, headless GL), compile ≤ 4 programs per frame under the veil instead of all at once |
| **Program budget ≤ 60 per level** (now 88–129) | ① `MeshPhysicalMaterial` (6–13 programs) only where clearcoat or transmission is visible (Gloomjelly, the sword in the Meme Cam); plate and steel become `MeshStandardMaterial` + the PMREM env. ② The fx shaders appear **twice** in town (`fx.horde`, `fx.telegraph.*`, `fx.particles.*` … ×2): two variants per material. Find the differing parameter (`fog`, `outputColorSpace` or `toneMapping`, from a canvas-target compile against the composer target) with `perf2_programs.mjs` and make it one. ③ Depth variants: 13–22 `MeshDepthMaterial` programs. Only characters and big props cast (tech.md §18 already says this); instanced small props get `castShadow = false`; alpha-tested casters share one `customDepthMaterial` per alpha map |
| **No program re-resolve per frame** (now 8) | ① Never share a material between `InstancedMesh` and `Mesh`, or between `SkinnedMesh` and `Mesh`. `Props.js` / `LevelKit` clone the instanced variant (`mat.clone()` once per kind, cached by `material.uuid + kind`). ② three's shadow pass flips its single shared `MeshDepthMaterial` between skinned, instanced and plain objects in render-list order. Give skinned casters an explicit `customDepthMaterial` (one shared `MeshDepthMaterial({ depthPacking: RGBADepthPacking })` per skinning on/off), and set `renderOrder`/groups so instanced casters draw together. A `perf2_progwhy.mjs`-style smoke assertion: 0 `currentProgram` writes over 60 idle frames |
| Session material library | `core/materials.js` (new, core) owns the shared looks (wood, stone, cloth tints, the fur shell base, the cape). Areas ask `materials.get('wood', { instanced })`. Programs persist across levels, so level 2 compiles only what is new |
| `onBeforeCompile` hygiene | Every patched material (HeightFog, fur, cape) sets `customProgramCacheKey()` to a **constant per patch kind**, never per instance. An unstable key compiles a new program per material |

---

## 7. Frame loop and fixed step (core)

### 7.1 Loop policy

- 60 Hz fixed step stays. The parry window (0.15 s freeze) and hitstop need it.
- `maxSteps` by tier: high/med **4**, low **3**, then time dilation (drop the accumulator). Today it is 5: on a 30 fps phone a slow frame triggers 4–5 steps, which makes the next frame slower. That spiral is measured here: 2.0–3.9 steps per frame when frames are slow.
- **Frame-rate lock** setting (`auto | 60 | 30`): `auto` locks to 30 on `low` or when the 2 s average is > 22 ms. A locked 30 holds 2 steps per frame, which beats a jittery 40–50 on phones and halves thermal load.
- Pause the loop entirely on `document.hidden` (`setAnimationLoop(null)`); `Timer.connect(document)` already resets the delta.

### 7.2 Sub-rate scheduler (core `systems.js` + a tiny `core/schedule.js`)

```js
// core/schedule.js — deterministic: depends on game.stepCount only (replays and ?test stay reproducible)
export const every = (game, hz, phase = 0) => ((game.stepCount + phase) % Math.max(1, Math.round(60 / hz))) === 0;
// usage (enemies/Enemy.js): if (every(game, this.thinkHz, this.id)) this.think();   // id spreads the phase
```

| System | Rate | Notes |
|---|---|---|
| Combat resolve, player, physics move, projectiles | 60 Hz | timing-critical |
| Enemy *movement / steering* | 60 Hz | cheap: integrate toward the cached goal |
| Enemy *think* (target choice, attack choice, flank slots) | 20 Hz on screen, 5 Hz off screen, 0 asleep | staggered by `id` |
| Perception (LOS raycasts, `queryRadius`) | 10 Hz on screen, cached result | `lineOfSight` is the expensive call |
| Companion think | 10 Hz | steering at 60 Hz |
| Objectives, arenas, triggers | 10 Hz | `Level.update` triggers |
| Audio director (threat) | 4 Hz | already 0.25 s |
| HUD poll | 10 Hz | already |
| Env tween | 60 Hz | cheap |
| Grass trample / wheat | 30 Hz | render side |

### 7.3 Instrumentation that ships (core `debug.js`, `?perf`)

- `game.perf` holds a per-system ring buffer of ms (`performance.now()` around each `update`/`render`, enabled only with `?perf`/`?debug`), steps per frame, `renderer.info`, and `performance.memory.usedJSHeapSize`.
- `?perf` shows a 5-line overlay. `__GAME__.perf.snapshot()` returns averages and p95. The smoke `perf:*` block (§16) asserts the budgets on a quiet machine.
- `performance.mark('title')`, `mark('play')` and `measure` give Web-Vitals-like hooks for T_title and T_play (the smoke reads them).

---

## 8. Physics, pathfinding and AI budgets

### 8.1 Per-step budget table (desktop, idle; ×3 on phones)

| Work | Budget per step | Count assumption |
|---|---|---|
| `physics.moveActor`, all actors | 0.15 ms | 30 actors (5 µs each); static hash queries are allocation-free |
| `physics.separateActors` | 0.05 ms | O(n²) to 24 actors; spatial hash above (§8.5) |
| Camera occluder rays (render side, iso) | 0.10 ms per frame | ≤ 5 rays focus → lens every 2nd frame |
| Picker (render side) | 0.05 ms per frame | §8.6 |
| Pathfinding | ≤ 0.10 ms amortised; ≤ 1.5 ms single worst; ≤ 2 queries per step | queue §8.4 |
| Enemy think (20 Hz staggered) | 0.20 ms for 8 enemies | 25 µs per think |
| Enemy steering, anim state | 0.10 ms for 8 | |
| Combat swing sweeps, tokens | 0.05 ms | |

### 8.2 Activity LOD keyed to the iso camera (camera provides it, every actor area consumes it)

The CONTROLS_SPEC camera has a fixed yaw, 38° FOV, about 50° pitch and 12–13 m distance. It shows a ground footprint of
about **22 × 15 m** (landscape) around `cam.focus`. That footprint is predictable, which makes it the cheapest LOD
signal in the game:

```js
// camera/FollowCamera.js (iso rig) — once per rendered frame, before actors render
// tier 0: on screen (frustum test of the actor's bounding sphere, 2 m margin) | 1: ≤ 30 m from focus | 2: ≤ 60 m | 3: beyond
activityOf(actor) { /* reads a cached Float32Array of per-actor tiers filled in render() */ }
```

| Tier | AI think | Mixer | Cape / fur / tail procedural | Shadows | Visible |
|---|---|---|---|---|---|
| 0 on screen | 20 Hz | every frame | full | cast | yes |
| 1 near off-screen | 5 Hz | every 3rd frame, ×3 dt | cape → sway shader; fur shells → sheen | no | culled |
| 2 far | 2 Hz (arenas locked: 5 Hz) | frozen | none | no | no |
| 3 beyond 60 m | asleep (the existing sleeping-far-enemies) | frozen | none | no | no |

The existing distance LODs (fur LOD, mixer 40 m) are re-keyed to `cam.focus`, which the CONTROLS_SPEC §2.8 already
asks for. Off-screen threats still drive the threat arrows (ui) from tier 1–2 data.

### 8.3 AI think pattern (enemies)

```js
// enemies/Enemy.js
update(dt) {
  const tier = this.ctx.cam.activityOf(this);
  if (tier >= 3 && !this.arenaBound) return this.sleepStep(dt);           // integrate gravity only
  if (every(this.ctx.game, THINK_HZ[tier], this.id)) this.think();         // decisions; may request a path
  this.steer(dt);                                                          // 60 Hz, cheap: toward this.goal
  this.fsm.tick(dt);                                                       // timers (windups stay frame-exact)
}
```

- **Telegraph timing never sub-samples.** Windup and strike timers tick at 60 Hz in `fsm.tick`. Only *choices* are sub-rated.
- `Enemy.js:753` builds a filtered attack list per decision (`.filter`). Keep a preallocated `_cands` array.

### 8.4 Nav grid and pathfinding (physics `NavGrid.js` / `Pathfind.js`, per CONTROLS_SPEC §5.3)

Concrete implementation constraints that keep the spec's ≤ 1.5 ms per query true on a phone:

```js
// physics/Pathfind.js — zero allocation per query
const MAX_OPEN = 8192;
export class Pathfinder {
  constructor(grid) {
    const n = grid.w * grid.h;
    this.g = new Float32Array(n); this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.q = 0;     // generation stamps: no clearing
    this.heap = new Int32Array(MAX_OPEN); this.heapF = new Float32Array(MAX_OPEN); this.hn = 0;
    this.out = new Float32Array(2 * 48);                                               // ≤ 48 points (spec)
  }
  find(sx, sz, tx, tz, maxExp = 6000) {
    const q = ++this.q;      // g[i] valid only if stamp[i] === q
    /* octile A*, binary heap on (heap, heapF), early exit; on overflow return the best-h node (partial) */
  }
}
```

- **Request queue**: `ctx.physics.nav.request(actor, goal, cb)`. At most **2 finds per step** and **≤ 2 ms per step** summed (`performance.now()` budget check). Excess requests wait one step. The player's click is always first in line (Orders), so a click path is never late.
- **Path reuse**: enemies re-path only when the target moved > 1.5 m (the spec's attack rule) **and** `losWalkable` fails; otherwise they steer directly. Packs of hyenas share one **flow field** toward the player when ≥ 4 chase at once (a BFS from the player over a 48 × 48-cell window, 2,304 cells, ≈ 0.1 ms at 5 Hz) instead of 4 A* queries.
- **Build in a Worker**: `NavGrid.build` is pure (the spec says node-testable). Run it in `physics/navWorker.js` with transferable `Uint8Array` flags and a `Float32Array` height (≈ 0.8 MB for meadow). The 8 ms/frame slicing then stays only as the fallback (no Worker or `?test`). The main thread pays about 0, and `nav:ready` arrives in parallel with the shader prewarm.
- **Dynamic updates** (`addCollider`, `removeCollider`): stay on the main thread, < 2 ms (spec), with a dirty-rect re-rasterise.

### 8.5 Separation and spatial queries (physics, core)

- **Predeclare the per-actor scratch fields** in `core/Actor.js`'s constructor: `_physSep = 0; _sepX = 0; _sepZ = 0;`. `separateActors` adds them lazily today. That changes hidden classes per actor type: polymorphic loads, plus mutable heap-number boxes for doubles. `separateActors` was a top allocator (0.16–0.73 MB/s).
- Above **24 solid actors** (the hub's 18 activity kittens plus residents, and boss adds), switch to a uniform hash with 2 m cells over typed arrays (`cellStart`/`cellNext` `Int32Array`, rebuilt per step: O(n)), so separation and `queryRadius` stay O(n).
- `ActorRegistry.queryRadius` already uses a scratch array (good). Add `queryRadiusTyped(pos, r, maskBits)` so no filter closure is created per call.

### 8.6 Picking (camera `Picker.js`, CONTROLS_SPEC §7.6)

- **Never** `Raycaster.intersectObjects(scene.children, true)`: there are 900–1,200 objects and SkinnedMesh raycasts are per-triangle.
- Ground pick: intersect the ray with the heightfield (an analytic DDA over cells, ≤ 64 cells along the ray at iso distances).
- Actor and interactable pick: ray versus capsule (or sphere) over the `ActorRegistry` list (≤ 40), plus the interactables list.
- At most once per rendered frame, cached as `cam.cursorGround`. That matches the spec.

---

## 9. Animation (enemies, companions, characters, player)

### 9.1 AnimationMixer LOD (enemies `Enemy._updateAnim`, companions, NpcActor)

```js
// per rendered frame; tier from cam.activityOf (§8.2)
const MIX_EVERY = [1, 3, 0, 0];                     // 0 = frozen
render(alpha, frameDt) {
  const k = MIX_EVERY[tier];
  this._mixAcc += frameDt;
  if (k && (this.ctx.game.frameCount + this.id) % k === 0) { this.mixer.update(this._mixAcc); this._mixAcc = 0; }
}
```

- `Enemy.js:1234–1235` builds an array (`const [role, opts] = this.animFor()`) and a template-string key every frame. Return a cached `{ role, opts }` object instead, and compare `role`/serial numbers rather than building `hit#n` strings.
- Hitstop: `mixer.update(0)` (tech.md §11.1) stays.

### 9.2 Skinned meshes are drawn even off screen today

`Assets.model()` sets `frustumCulled = false` on every SkinnedMesh, and there are 44 `frustumCulled = false` sites
in `src/`. On an iso camera with a 22 × 15 m footprint, most actors are off screen most of the time, yet each one
still costs:
- a draw;
- a shadow draw;
- a bone-texture upload;
- a `setProgram`.

Recipe (core `Assets.model`):

```js
// after fitting: a conservative bind-pose sphere ×1.6 (animated limbs never leave it), culled normally
const sphere = raw.getBoundingSphere(new THREE.Sphere()); sphere.radius *= 1.6;   // in fitted root space
scene.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = true; o.boundingSphere = sphere.clone().applyMatrix4(/* root→mesh */ inv); } });
```

In r186, `SkinnedMesh.boundingSphere` is used by the frustum test when it is set; `computeBoundingSphere()` is never
called per frame. Audit the other 43 sites: grass and fur shells (`InstancedMesh` with a camera-following
`boundingSphere`) can do the same.

### 9.3 Procedural rigs (characters `KittenBuilder`, `Cape`, `Fur`)

- **`E()` allocates 2 objects per call** (`characters/KittenBuilder.js:43`, used about 15× per kitten per frame in `animate`/`simulate`, lines 945–979). Hub scenes have 18+ kittens, so that is ≈ 550 allocations per frame.
  ```js
  const _e = new THREE.Euler(), _qa = new THREE.Quaternion();
  const E = (x = 0, y = 0, z = 0) => _qa.setFromEuler(_e.set(x, y, z, 'XYZ'));   // valid until the next E() call
  // every call site is `J.x.quaternion.multiply(E(...))`, which consumes it immediately — safe
  ```
  The same goes for `J['tail' + i]` and `J['ear' + s]` string keys per frame: precompute `this._tail = [J.tail0 … J.tail5]`.
- **Cape** (`characters/Cape.js` `HeroCape.update` / `_write`):
  1. Replace `this.geo.computeVertexNormals()` (line 554) with **grid normals** (central differences on the regular `rc × rr` render grid). It writes into the existing `normal` array, allocates nothing, and does about 6× less work:
     ```js
     _gridNormals(arr, nrm, rc, rr) {            // arr/nrm: Float32Array, row-major rc × rr
       for (let r = 0; r < rr; r++) for (let c = 0; c < rc; c++) {
         const i = r * rc + c, l = r * rc + Math.max(c - 1, 0), rt = r * rc + Math.min(c + 1, rc - 1),
               u = Math.max(r - 1, 0) * rc + c, d = Math.min(r + 1, rr - 1) * rc + c;
         const ax = arr[rt*3]-arr[l*3], ay = arr[rt*3+1]-arr[l*3+1], az = arr[rt*3+2]-arr[l*3+2];
         const bx = arr[d*3]-arr[u*3],  by = arr[d*3+1]-arr[u*3+1],  bz = arr[d*3+2]-arr[u*3+2];
         let nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx; const k = 1 / (Math.hypot(nx, ny, nz) || 1);
         nrm[i*3] = nx*k; nrm[i*3+1] = ny*k; nrm[i*3+2] = nz*k;     // flip sign once if the winding needs it
       }
     }
     ```
  2. **LOD for the iso camera.** At 12–13 m the cape is about 25–45 CSS px tall:
     - render grid `resX 4 / resY 2` (825 vertices) → `2 / 1` (221 vertices) by default;
     - the full grid only in the Meme Cam, cutscene close-ups and photo mode (`cam.closeUp` flag);
     - `iterations` 4 → 3 at tier 0, with sub-steps capped at 2 per frame (`advance`'s `4/60` becomes `2/60`).
  3. During the prewarm frames the cape collided for 0.53 s of boot CPU. Skip the cloth sim when `levels.loading` is true (snap to the rest drape).
- **Fur shells**: shell count by on-screen size, not by tier label. The ablation shows the hero is **205k of 499k triangles and 24 of 87 draws** in the meadow idle. At the iso distance, 6 shells on desktop and 3 plus sheen on phones read the same (art and GPU decision; the CPU side is fewer instanced draws and smaller uniform uploads).

### 9.4 GLTF clip hygiene

- The clip library (§5.1) loads once per session. Actions per enemy come from `mixer.clipAction(clip, root)`, and the clips are shared, so there are no per-enemy clip copies.
- `AnimationMixer` has a cost per *active* action. Cross-fades keep 2 active at most: `stopAllAction` on despawn, and an `uncacheRoot(root)` per enemy despawn, so dead enemies' bindings do not accumulate in the session (this matters for pooled visuals too).

---

## 10. Zero-allocation audit

### 10.1 Rules (all areas; tech.md §18 already says "no allocations in update/render")

1. Module-level scratch (`const _v = new THREE.Vector3()`) for every temporary in `update`, `render`, `step`, `tick`, `simulate`, `animate`, `poll` and the physics `move`/`resolve`/`collide`. Scratch is never returned to callers who keep it (they pass an `out`).
2. No `[...set]`, `.filter/.map/.slice` or `Object.entries` in hot methods. Iterate in place, or keep a parallel array.
3. No string building for keys per frame. Use numeric ids or precomputed strings.
4. Event payloads: events are rare (≤ 25/s, §11), so object-literal payloads are fine. **Per-frame** events are banned (none exist today, so keep it that way).
5. Closures: never create `() => …` per frame. Hoist them (`this._onSub ||= …` in `Cape.js` is the right pattern).

### 10.2 Measured hot spots and their fixes

| # | Where | Evidence | Fix | Owner |
|---|---|---|---|---|
| A1 | `characters/Cape.js:554` `computeVertexNormals` per frame | top sampled allocator: **1.4–2.8 MB/s** | grid normals (§9.3) | characters |
| A2 | three `setProgram` → `getProgram` → `getParameters` (+ cache-key `join`) | 0.6–1.0 MB/s; 8 calls per frame | no material shared across mesh kinds; per-kind `customDepthMaterial` (§6) | world (Props, LevelKit), characters, enemies |
| A3 | `physics/Physics.js:700` `separateActors` (lazy `_physSep/_sepX/_sepZ` on actors) | 0.16–0.73 MB/s | predeclare in `Actor` (§8.5) | core (Actor), physics |
| A4 | `characters/KittenBuilder.js:43` `E()` | ≈ 15 allocations per kitten per frame (2 objects each) | scratch Euler/Quaternion (§9.3) | characters |
| A5 | `core/Input.js:161` `poll`: `navigator.getGamepads()` every frame, `Object.entries(INPUT.pad)`, `'p' + i` and `src + action` Map keys | 0.05–0.1 MB/s; `poll` self time is up to 5.5 ms per frame under headless (`getGamepads` is a sync IPC in Chromium) | poll pads only after a `gamepadconnected` event, until `gamepaddisconnected` empties the set; precompute `this._padBindings = [[action, idx, key]]` once; key `_padPrev` by a numeric `action * 32 + idx` in a `Uint8Array` | core |
| A6 | `enemies/Enemy.js:1234` `_updateAnim` array destructure + template key | per enemy per frame | cached result object; numeric serial compare | enemies |
| A7 | `core/EventBus.js` `emit`: `[...s]` per emit, `KNOWN.has` + warn | per emit | copy-on-write listener arrays (§11) | core |
| A8 | `world/Pickups.js:215` `update` iterates every item every step; `items.some()` + `filter()` compaction | 0.04–0.19 MB/s | swap-remove on collect; instanced fish pool (§12) | world |
| A9 | `world/Env.js` `cloneState` from `set()` (a story/cutscene call) | rare, but the boot profile pins it at 0.98 s self (attribution under inlining is uncertain; verify) | reuse two preallocated states (`_a`, `_b`) and copy into them | world |
| A10 | bosses `boss_grizzlechop.js:130/214/227/322/323/354`, `boss_cacklejaw.js:110/136`, `jelly.js:252–253`, `stealer.js:114`, `Pilfer.js:163`: `.clone()` in `update` | static scan (`perf2_allocscan.mjs --list`); mostly per-event branches | check each; use scratch where it runs every step | enemies |
| A11 | `companions/LostKitten.js:623–626`, `HubKittens.js:271`: `new THREE.Vector3()` in `update` | static scan | scratch | companions |
| A12 | `ui/hud.js:255–296`, `toasts.js:108`, `threatArrows.js:110/124`: template strings at 10 Hz | static scan | compare numbers first, build the string only on change (already partly done) | ui |
| A13 | `story/dialogue/barks.js:356` `new THREE.*` in `render`; `story/tutorial.js:174` `.clone()` | static scan | scratch | story |

The static scan finds **119 suspicious sites** in hot methods across areas:
- enemies 32
- world 22
- audio 14
- ui 14
- companions 8
- fx 8
- characters 5
- player 5
- story 5
- core 3
- physics 2
- combat 1

Many are inside rare branches. The runtime sampler (§16) decides what matters.

### 10.3 Guard (tests)

A smoke block `perf:alloc` (core `tests/smoke.mjs`):
- uses CDP `HeapProfiler.startSampling({ samplingInterval: 4096 })` over 300 idle frames in the meadow and 300 frames of the 8-rat fight;
- attributes sampled bytes to `src/` via sourcemaps;
- **fails if game code allocates > 512 KB/s, or any single function > 128 KB/s**.

Three internals are reported but not failed, except the program re-resolve check (0 `currentProgram` writes in 60
idle frames).

---

## 11. Event bus (core)

Measured: **0 emits/s idle**, at most **25/s** in an 8-rat fight. At about 1 µs each, the bus costs < 0.03 ms/s.
**Keep the synchronous bus.** It is not a performance problem. Two small fixes:

```js
// core/EventBus.js — copy-on-write: emit iterates a frozen array snapshot; on/off rebuild it (rare)
on(type, fn) { const a = this.#m.get(type) ?? []; this.#m.set(type, [...a, fn]); return () => this.off(type, fn); }
off(type, fn) { const a = this.#m.get(type); if (a) this.#m.set(type, a.filter((f) => f !== fn)); }
emit(type, payload) {
  if (DEV && !KNOWN.has(type)) console.warn(`[bus] unknown event "${type}"`);    // DEV = import.meta.env.DEV
  if (this.#taps.size) for (const t of this.#taps) { try { t(type, payload); } catch (e) { console.error(e); } }
  const a = this.#m.get(type); if (!a) return;
  for (let i = 0; i < a.length; i++) { try { a[i](payload); } catch (e) { console.error(`[bus] ${type}`, e); } }
}
```

Policy (CONTRIBUTING):
- events notify; services are called directly (GAME_DESIGN §19.3 already says this);
- no event per frame or per step in steady state;
- high-rate *data* (positions, threat level) is read through services, not pushed through the bus.

---

## 12. Object pooling

| Pool | Owner | Now | Recipe |
|---|---|---|---|
| **Enemy visuals** | enemies | each `spawn()` news an `Enemy` and runs async `loadVisual` (SkeletonUtils clone, beast head, tinted material clones); `despawn` disposes it. Spawn hitch **58–388 ms** | `VisualPool` per `type + dressing key`: `acquire()` returns `{ root, mixer, actions, mats }` (reset: `mixer.stopAllAction()`, pose to idle, tint uniforms, visible). `release()` detaches it and keeps it. The level prefills `max(waveSize)` per type **under the veil** (the arena's wave tables say how many: `levelEnemyWarm` + counts). Bosses are not pooled |
| Enemy actors | enemies | `new Enemy` per spawn | keep: the actor object is small. Reset fields in `reset(def, opts)` when the pool lands, and keep the actor id monotonic |
| Projectiles | combat | pooled ✔ | — |
| Particles, poofs, shockwaves, damage numbers | fx | pooled ✔ (`Particles`, `DamageNumbers`, `Poof`, `Shockwaves`) | budget: 1 `InstancedMesh` per material, as now |
| Telegraph and ground decals | fx | per-kind meshes | CONTROLS_SPEC §7.3 / §12: one instanced decal pool (≤ 2 draws) for rings, wedges, the aim ring, order markers, the landing ring and the dive circle |
| Pickups (fish, hearts, letters) | world | a mesh per pickup, `disposeMesh` on collect | one `InstancedMesh` per kind (fish 64, hearts 16). Index swap-remove; `count` = alive |
| Bubble barks, toasts, damage-number DOM | ui, story | DOM nodes created per bark/toast | a pool of 8 bark nodes and 4 toast nodes; text set via `textContent`; never `innerHTML` per frame |
| Audio voices | audio | `oneshots` Set with GC of panners | pool panners per category (8 3D voices); reuse `PannerNode`s (creation is cheap but the GC churn in Chromium's audio thread is not) |

---

## 13. Scene graph and culling (world, camera, core)

- **Static matrices**: after `def.build`, LevelKit marks static content:
  ```js
  level.root.traverse((o) => { if (!o.userData.dynamic && !o.isSkinnedMesh) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  level.root.updateMatrixWorld(true);
  level.root.matrixWorldAutoUpdate = false;   // r150+: skips the subtree in scene.updateMatrixWorld()
  ```
  Dynamic children (PropActors, swinging sacks, doors, the portcullis) live under a separate `level.dynamicRoot` that keeps auto-update. Only 11 `matrixAutoUpdate = false` sites exist today, against 420–1,186 objects.
- **Far plane**: `RENDER.far` 600 m → **60 m** under the iso rig. At 13 m and 50° pitch, the top screen edge meets the ground about 21 m out (portrait about 26 m), and the CONTROLS_SPEC focus fog hides the rest. The `?cam=classic` mode keeps 600. That gives tighter frustum culling, shadow-camera fit and depth precision.
- **Distance-hidden tiles**: LevelKit's 32 m tiles (tech.md §12.1) get `visible = false` beyond 45 m from `cam.focus`, updated at 4 Hz. Invisible subtrees are not traversed by `projectObject`.
- **Object count target**: ≤ 300 auto-updating objects in play. Merge static decorative groups (`BufferGeometryUtils.mergeGeometries`) and instance everything with 4+ copies.

---

## 14. Render-submit CPU (the CPU part of rendering; GPU work is the other doc's)

- three's CPU cost per draw call is about 15–30 µs on desktop (cull, sort, `setProgram`, uniform upload, bind) and 3–4× that on phones. The submit budget of 2.5 ms (§1.2) therefore means **≤ 120 frame calls desktop / ≤ 70 phone**, including shadows. Now: 87 (meadow idle), 125–160 (town, boss fights, 8 rats).
- The levers that are CPU-side:
  - the program churn (§6);
  - skinned frustum culling (§9.2);
  - static matrices (§13);
  - the hero's 24 draws (shell parts as one `InstancedMesh` per part already; merge the plate pieces into one geometry per material);
  - KayKit hidden prop nodes (weapons, shields) are `visible = false` but still traversed: delete them from the clone instead (`node.removeFromParent()` in `Assets.model` when listed in `hide` and not `show`).
- `renderer.info.autoReset = false` with a manual reset is correct. Keep it.

---

## 15. Mobile specifics

- **CPU class**: plan for a mid Android (Snapdragon 7-series or Dimensity 7000) as 3–4× slower than Iris Xe single-thread. Every desktop budget is checked at `--cpu=4` in the perf smoke.
- **Thermal**: lock to 30 fps by default on phones (§7.1). Pause on `visibilitychange`. Lower the AI think rate to 10 Hz on screen when `quality.low`.
- **Memory**: iOS Safari kills tabs around 1.0–1.5 GB of total process memory. Keep the JS heap ≤ 90 MB in play and GPU textures ≤ 64 MB (tech.md §18). Decoded music via MediaElement (§5.3) avoids about 30 MB per track.
- **Network**: `navigator.connection.effectiveType` (Chrome) or `saveData` picks Opus 64 kbps music and defers p2. No prefetch on `saveData`.
- **Touch input latency**: ui's `addTap` applies on the same step (spec §5.5). Keep the pointer handlers allocation-free (they fire at 120 Hz on many phones).

---

## 16. Measurement protocol and CI gates

1. **Machine state**: no other vite or Playwright processes (check `Get-CimInstance Win32_Process node.exe`). AC power, best-performance power plan. The calibration loop (`tools`: 2000 sqrt evaluations) must be ≤ 10 µs, or the run is invalid.
2. **Build**: `vite build --config research/next/tools/perf2.vite.config.mjs`, served by `perf2_serve.mjs` (gzip like a real host). Never measure startup on the dev server (unbundled ESM inflates request counts by about 300).
3. **Browser**: real Chrome stable with `--use-angle=d3d11` (the default on Windows; parallel shader compile available). Headless ANGLE-GL is for regressions only. Its absolute numbers are pessimistic (no `KHR_parallel_shader_compile`; context start-up 2.6–3.4 s).
4. **Runs**: startup best of 3 cold (cache disabled), plus 1 warm (SW cache). Runtime: 600 frames after a 120-frame settle. Report avg, p95 and p99 of the loop's `advance` time, per-system ms, steps per frame, allocations per second.
5. **Gates** (smoke `perf:*` blocks; they run only when `SMOKE_PERF=1`, so contended agent runs don't flake):
   - `perf:boot`: T_title ≤ 3.0 s desktop, ≤ 6.0 s with `--net=4g --cpu=4`;
   - `perf:frame`: meadow idle CPU frame p95 ≤ 8 ms at 640×360; 8-rat fight step ≤ 1.5 ms;
   - `perf:alloc`: §10.3;
   - `perf:programs`: ≤ 60 programs per level and 0 re-resolves per idle frame;
   - `perf:spawn`: worst frame after spawning a wave ≤ 1.5× median;
   - `build`: the bundle budget (§4); `test:unit`: the manifest tier budget (§5.2).

---

## 17. Area mapping (GAME_DESIGN §19.2 owners) and priority

P0 = before the controls rework lands (it touches the same files anyway); P1 = with it; P2 = M3; P3 = M4 polish.

| Area (owner) | Files | Tasks | Prio |
|---|---|---|---|
| **core** | `index.html`, `vite.config.js`, `src/main.js`, `core/Game.js`, `core/systems.js`, `core/Loop.js`, `core/Assets.js`, `core/manifests.js`, `core/EventBus.js`, `core/Actor.js`, `core/Input.js`, `core/debug.js`, `core/config.js` (`LOOP`, `RENDER.far`, `QUALITY.*.maxSteps/fpsLock`), new `core/schedule.js`, `core/materials.js`, `scripts/bundle-budget.mjs`, `scripts/optimize-glb.mjs` (from `tools/perf2_glbopt.mjs`), `scripts/emit-manifests.mjs`, `sw.js`, `tests/smoke.mjs` perf blocks | R1 splash; R2 lazy systems; R3 chunks; `checkShaderErrors`; batched prewarm hook; manifest tiers in `Assets.preloadLevel(id, tier)` + `prefetch`; `animLib()`; skinned culling sphere; prune hidden KayKit nodes; Actor scratch fields; Input gamepad gating; EventBus COW; scheduler; `maxSteps`/fps lock; `?perf` overlay + marks; budgets and gates | P0 (R1–R3, checkShaderErrors, Actor, Input), P1 (rest) |
| **world** | `LevelManager.js`, `LevelKit.js`, `Props.js`, `Terrain.js`, `Pickups.js`, `Env.js`, `Grass.js`, `Wheat.js`, `levels/*.js`, `assets.manifest.js` | parallel load (R10); yielding build; batched prewarm without the culling-off frames; static matrices + `dynamicRoot`; distance-hidden tiles keyed to the focus; no material shared instanced/plain; pickups instanced pool; `Env` state reuse; title manifest + p0/p1/p2; next-level prefetch; zone-approach preload | P0 (manifest tiers, prewarm), P1 |
| **physics** | `NavGrid.js`, `Pathfind.js`, new `navWorker.js`, `Physics.js`, `StaticColliders.js` | stamped A* with a typed heap; request queue (2 per step, 2 ms); flow field for packs; worker build; separation hash above 24; allocation-free statics queries | P1 (with the nav grid) |
| **camera** | `FollowCamera.js`, `Occluders.js`, new `Picker.js` | iso rig without the spring-arm sphereCast (1.4–1.8 ms/frame measured in `_armLength` → `sphereCast`); `activityOf()` tiers; occluder rays every 2nd frame; analytic ground pick; far 60 m in iso | P1 |
| **enemies** | `EnemyManager.js`, `Enemy.js`, `types/*.js`, `clipMaps.js`, `rig.js`, `assets.manifest.js` | VisualPool + prefill; lazy types; staggered think and perception; mixer LOD; `_updateAnim` without allocation; clip keep-lists for the pipeline; the shared KayKit / Skeleton libraries | P1 (pool, think), P2 (libraries for M3 Boneheads) |
| **characters** | `Cape.js`, `KittenBuilder.js`, `Fur.js`, `Plate.js`, `KittenView.js` | grid normals; cape LOD (221 vertices, 3 iterations, 2 sub-steps); no sim while loading; `E()` scratch; precomputed joint arrays; strand texture baked or in a worker; fur shells by on-screen px | P0 (cape, `E()`), P1 |
| **player** | `Player.js`, `SwordcatModel.js` | hero build after the title (idle slices); cape and fur LOD via `cam.closeUp` | P1 |
| **companions** | `CompanionManager.js`, `LostKitten.js`, `HubKittens.js`, `NpcActor.js`, `steering.js` | think 10 Hz; activity tiers; scratch vectors (A11); hub kittens beyond the footprint → tier 2 | P1 |
| **combat** | `Combat.js`, `Projectiles.js`, `targeting.js` | allocation-free `assistTarget` scoring (pass `out`); keep the projectile pool | P1 |
| **fx** | `FX.js`, `Telegraphs.js`, `Particles.js`, new `GroundDecals.js` | one decal pool; find the doubled fx program variant; fx programs in the material library | P1 |
| **story** | `cutscenes/index.js`, `StoryManager.js`, `dialogue/barks.js`, `tutorial.js` | lazy cutscenes + prefetch per level; scratch in barks/tutorial | P0 (lazy), P2 |
| **ui** | `UI.js`, `fonts.css`/`fonts.js`, `hud.js`, `toasts.js`, `touch.js`, `assets.manifest.js` | the title shell in the boot chunk; splash hand-off; woff2 subsets + preload of 2; bark/toast DOM pools; allocation-free pointer handlers | P0 (title, fonts) |
| **audio** | `AudioManager.js`, `MusicPlayer.js`, `sfxMap.js`, `assets.manifest.js` | the manifest out of the boot JS; lazy decode; SFX sprites; music via MediaElement; title set ≤ 0.3 MB | P0 (manifest, title set), P2 (sprites) |
| **save** | — | none (13 KB) | — |

---

## 18. Risks and open questions

1. **Shared clip libraries** need identical rest poses. KayKit humanoids share bones by name (verified in the GLB JSON, §18.2), but rest-pose equality is unverified. Mitigation: a smoke screenshot of each character playing three library clips, plus a `measureFit` check.
2. **Lazy systems** change when `ctx.player` and friends become non-null. The title must not touch gameplay services. Story's CS-00 needs the player rig, so CS-00 waits on `playReady` (≤ 1.5 s after the press, masked by the logo fade).
3. **Headless metrics are pessimistic** (no parallel compile; a 2.6–3.4 s context). Re-baseline in real Chrome before setting the CI thresholds (§16).
4. **The 30 fps lock** on phones must keep input latency acceptable. The aim and Stand inputs are latched per step (spec §5.5), so the 33 ms frame adds ≤ 33 ms worst case. Validate the parry feel on a device.
5. **Service-worker cache invalidation** when `assets/` files change without a hash: hash them in `prune-assets.mjs` first (§5.4), or the SW must be network-first for `assets/`.
6. **The program budget of ≤ 60** may fight art's material richness. The material library and dropping Physical where it isn't visible keep the look. The warm cartoon direction favours simpler lit materials anyway (a warmer hemisphere plus Standard with a soft env).
7. The **A9 attribution** (`Env.cloneState` 0.98 s self in one boot profile) is suspicious under inlining. Re-profile on an idle machine before acting.
