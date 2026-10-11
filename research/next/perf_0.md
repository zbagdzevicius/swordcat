# perf_0: where the frame goes today. Measured hotspots and recipes (three.js r186)

**Topic:** perf. **Angle:** measure. **Status:** design draft only. No code under `src/` was changed.
**Machine:** i7-1255U (2P+8E), Intel Iris Xe (0x46A8), Windows 10, Chromium (Playwright 1.63) headless, dev server `:5801`
(`SMOKE_NOHMR=1 npx vite --port 5801 --strictPort`).
**Inputs read:** STATUS.md, GAME_DESIGN §17 to §19, research/art.md, research/tech.md §18, research/CONTROLS_SPEC.md (§2.1 iso
rig, §3 occlusion, §4 focus fog).
**Tools** (all in `research/next/tools/`, reproducible; §8 has the commands): `perf_probe.mjs`, `perf_toggle.mjs`,
`perf_deep.mjs`, `perf_churn.mjs`, `perf_alloc.mjs`, `perf_ab.mjs`, `perf_trace.mjs`. Raw JSON: `perf_results*.json`,
`toggle_*.json`, `deep_*.json`, `alloc_*.json`. Screenshots: `tools/shots/<profile>_<preset>_<scenario>[_iso].png`.

---

## 0. TL;DR

1. **We are far from "extraordinary".** On Chrome's real Windows backend (ANGLE **D3D11**), Iris Xe at 1280×720 runs
   **Med at 13–33 fps** and **Low at 22–52 fps** (uncapped). ANGLE-GL, the smoke default, is 1.5–2× faster on the same
   GPU, so the smoke runs have been **hiding a GPU problem**. The tech.md §18 budgets (≤ 150 calls, ≤ 600k tris) are
   all **met** (33–145 calls, 96k–590k tris), and the game is still 2–4× too slow. So the budgets measure the wrong things.
2. **GPU, #1:** the Med composer's **4× MSAA HalfFloat render target** is the single biggest GPU cost: **−3.4 to −5.1 ms**
   of 8.7–11.7 ms on GL, and **−8.0 ms of 16 ms on D3D11**. With **bloom (−1 to −4.7 ms)** and the separate
   Output and Vignette full-screen passes (**3.7 + 0.55 ms on D3D11**), post is ≥ 50 % of GPU time on Iris Xe.
   Dropping the shading from PBR to Lambert or Toon saves only 0–1.6 ms. **The warm cartoon look costs nothing in
   shading; bandwidth is the problem.**
3. **CPU, #2:** the main thread is saturated (CDP `TaskDuration` ≈ 900–990 ms/s). The biggest single costs:
   - the **shadow pass** costs −2.2 to −7.6 ms of CPU submit (22–49 extra draws, 25–34 % of all calls). One shared
     `MeshDepthMaterial` flips program 8–18×/frame (skinned, instanced, batched).
   - the **hero visuals** (`frame.player`: verlet cape plus Catmull-Rom plus `computeVertexNormals`) take **13–29 % of
     frame CPU in every scenario**.
   - **NPC kittens** take **20–35 %** in the hub.
   - **level props** take −2.6 to −6.7 ms of CPU submit.
   - **88–151 shader programs** are live per level.
4. **Mobile (Pixel 7 emulation, 4× CPU throttle) is purely CPU-bound.** Frame CPU is 27–380 ms while the GPU takes
   1.6–27 ms. The fixed-step catch-up runs 4–5 steps/frame (`LOOP.maxSteps 5`), so every slow frame makes the next
   one slower. Hitches: p99 up to 1.3–1.9 s, long tasks up to 1.76 s, shader compiles mid-play (`getProgramInfoLog`
   in profiles), and on the first input an **AudioContext unlock bakes every zzfx SFX plus 2 s of pink noise on the
   main thread** (22 MB allocated in one burst).
5. **The iso camera (CONTROLS_SPEC §2.1, emulated) helps.** It cuts −33 % tris in the meadow, −44 % calls in the forest
   and −29 % calls at the gate. It does **not** fix post bandwidth, the shadow pass or character CPU. Those need the
   recipes in §5. Hitting **60 fps on Iris Xe at 1080p** and **≥ 30 fps Low at 4× throttle** needs a GPU cut of about
   2× (post) and a CPU cut of about 3× (shadow, characters, step catch-up, programs).

---

## 1. Method and caveats (read before quoting numbers)

| Item | What was done |
|---|---|
| Builds | Dev server (unbundled ESM, `?test=1&seed=1&mute=1&quality=<p>&level=<l>&spawn=<s>`). `?test` turns dynamic resolution **off**, so the numbers show the preset itself, not the auto-downscale. `npm run build` was **not** used: it writes `dist/`, which other agents' smoke runs use. |
| Frame pacing | `--disable-gpu-vsync --disable-frame-rate-limit`: uncapped fps, so the numbers show headroom above 60. |
| Backends | ANGLE-GL (`--use-angle=gl`, the smoke default) and ANGLE-D3D11 (**Chrome's real default on Windows**). |
| Profiles | **desktop**: 1280×720, dpr 1. **mobile**: Playwright `devices['Pixel 7']` (412×839 CSS, dpr 2.625, touch), Med buffer 618×1258 (maxDpr 1.5), Low 412×839, plus **4× CPU throttle** (`Emulation.setCPUThrottlingRate`) as a mid-phone proxy. The GPU is still Iris Xe, so mobile GPU ms are **not** phone numbers. Mobile pixel counts and CPU ratios are the useful part. |
| Scenarios | `meadow_idle` (start), `meadow_walk` (WASD square), `meadow_combat` (3 rat_pike, 2 rat_xbow and 2 crows in a 6 m ring, J spam, god mode), `forest` (start), `town_hub` (`town.free` flag, hub spawn), `gate` (start). Each runs with the current follow camera (**classic**) and with an **iso emulation**: `ctx.cam.render` is overridden with CONTROLS_SPEC §2.1 values (yaw π, fov 38/50, d 13/12 m, pitch lerp(46°,58°), focus feet+0.6 m+0.8 m screen-up bias, near 0.3, far 90, sky/skyline/horizon hidden). It has no lead, no `setViewOffset` framing and no focus fog yet. Screenshot: `shots/desktop_med_meadow_combat_iso.png`. |
| CPU per system | Each `sys.update` / `sys.render` in `game.stepList` / `game.renderList` is wrapped with `performance.now()`, plus `postfx.render`, each composer pass and `renderer.shadowMap.render`. The probe values are ms **per rendered frame** (steps are summed). Wall-clock: see contention below. |
| GPU | `EXT_disjoint_timer_query_webgl2` (exposed on both backends). The probe rotates one query per frame over {frame, shadow, pass 0–3}. `perf_toggle.mjs` stops the loop, drains the GPU before each frame and times one `postfx.render()` per sample, interleaving **[5 baseline, 5 toggled] × 5–6 rounds**. Δ is the median of per-round differences, which is robust to slow drift. |
| Other | `renderer.info` (`autoReset false`, read after post), a draw-call breakdown made by wrapping `renderer.renderBufferDirect` (shadow draws have `scene === null`), a CDP sampling profiler (200 µs), CDP `HeapProfiler.startSampling` (4 KiB), CDP `Performance.getMetrics` (style / layout counts), a long-task observer and Chrome tracing (renderer + GPU process). A **served-copy patch** of three's `setProgram` (Playwright `page.route`, nothing on disk changes) logs every program re-resolve and its reason. |
| **Contention (big)** | Other agents ran their own headless games and smoke runs at the same time, plus Zoom. Total CPU was **93–100 %** for most of the session and about 29 % at the end. Wall-clock ms are inflated by up to about 2× and noisy: the "clean" meadow Med GL fps went from 27 to 57 across the session. **Trust these:** counts (calls, tris, programs, re-resolves, allocations, steps/frame), **shares of the frame**, interleaved Δs, and best-of runs. The absolute fps tables are a **lower bound**. |
| Observer effect | `perf_ab.mjs`: `performance.memory` reads, CDP Performance and per-frame timer queries each changed fps less than the run-to-run noise (±25 %). |

---

## 2. Results

### 2.1 Headline fps (uncapped, 1280×720 dpr 1 unless noted). Lower bound; see contention

**ANGLE-D3D11 (what a Windows Chrome player gets).** `perf_results_d3d11*.json`, sampled at about 30 % lower machine load:

| Preset / camera | meadow idle | meadow combat (7 enemies) | town hub | GPU frame (timer query) |
|---|---|---|---|---|
| Med, classic | 23.1 fps (p50 42.8 ms, p95 60) | 13.5 (p95 191) | 18.1 (p50 59.7) | 28.5 / 35.3 / 40.1 ms |
| Med, iso | 33.4 (p50 32.3) | 18.6 (p95 100) | 18.6 (p50 55.9) | 28.5 / 16.5 / 21.4 ms |
| Low, classic | 46.1 (p50 21.8) | 22.4 (p95 115) | 31.3 | 10.6 / 16.8 / 21.6 ms |
| Low, iso | 52.2 | 28.1 | 31.9 | 12.8 / 14.7 / 15.3 ms |

D3D11 Med GPU passes in the meadow: **RenderPass 12.0 ms**, **bloom 5.1 ms**, **OutputPass 3.7 ms**, vignette 0.55 ms. The
other ~7 ms is the MSAA resolve plus the final blit, which happen outside the passes.

**ANGLE-GL (smoke default), the full matrix.** `perf_results.json` (classic) and `perf_results_iso.json` (iso):

| Profile / preset | meadow idle | meadow walk | meadow combat | forest | town hub | gate |
|---|---|---|---|---|---|---|
| desktop Med classic | 24.1 fps · CPU 32.1 · GPU 8.9 | 23.0 · p99 **847 ms** | 28.8 · GPU 16.8 | 15.6 · CPU 50 | 23.8 · CPU 35 | 25.8 |
| desktop Med iso | 46.8 · CPU 15.9 · GPU 10.8 | — | 33.1 | 45.3 | 29.4 | 36.9 |
| desktop Low classic | 23.9 · GPU 5.5 | 20.7 · p99 361 | 29.8 | 55.2 | 20.4 | 28.8 |
| desktop Low iso | 41.7 · GPU 2.7 | — | 26.7 | 99.8 | 69.2 | 58.8 |
| mobile Med classic (4× thr.) | 5.4 · CPU 132 · GPU 11 | 16.7 | 6.5 · CPU 155 | 9.9 | 4.4 · CPU 134 | 14.2 |
| mobile Med iso | 8.1 · CPU 109 | — | **1.7 · CPU 378** | 11.1 | 4.3 · CPU 221 | 9.6 |
| mobile Low classic | 10.0 · CPU 66 · GPU 2.3 | 17.7 | 12.4 | 7.3 · CPU 121 | 27.7 | 28.6 |
| mobile Low iso | 7.6 · CPU 102 | — | 4.0 · CPU 197 | 8.9 | 6.8 · CPU 134 | 7.0 |

The best clean A/B runs (`perf_ab.mjs`, meadow, CPU load about 30 %) were **GL Med 51–57 fps, GL Low 52–63,
D3D11 Med 30–33, D3D11 Low 48–66**. So under good conditions **D3D11 Med is still about 30 fps**. That is GPU-bound, see §2.3.

**Why mobile iso is sometimes *slower* than classic.** The combat run measured right after spawning. At 4× throttle,
enemy first-use work (rig clone, program compile: `getProgramInfoLog` shows up in the profile) lands inside the
window. The fixed step then hits `maxSteps 5` (5.0 steps/frame), so each frame runs 5 full sims. This is the
spiral-of-death signature. Hotspot H8 and H9 cover it.

### 2.2 Render statistics (`renderer.info` after post, Med GL)

| Scenario | calls (frame / scene) | tris | programs | geometries | textures | visible drawables | shadow casters | skinned | point lights on/total |
|---|---|---|---|---|---|---|---|---|---|
| meadow idle | 87 / 72 | 499k | **88** | 164 | 63 | 55 | 26 | 5 | 1/2 |
| meadow idle iso | 79 | 334k | 88 | 164 | 63 | 52 | 26 | 5 | 1/2 |
| meadow combat | 123 / 108 | 542k | 88 | 167 | 73 | 91 | **48** | 15 | 1/2 |
| forest | **144** / 129 | 473k | **138** | 130 | 66 | 85 | 39 | 12 | 2/4 |
| forest iso | 81 | 316k | 136 | | | 83 | 39 | 12 | 2/4 |
| town hub | 85 / 70 | **575k** | **151** | 176 | 65 | 56 | 21 | 8 | 1/4 |
| gate | 107 / 92 | 384k | 149 | **233** | **99** | 66 | 22 | 8 | 2/4 |
| Low meadow / hub / gate | 46 / 47 / 73 | 147k / 216k / 112k | 66 / 117 / 115 | | | | | | |

Fixed overheads every frame:
- **15 full-screen draws** for post: UnrealBloom 5 mips (13), Output and Vignette.
- **1 shadow draw per caster** in a ±20 m frustum: 22–49 draws, **25–34 % of all calls**.
- **2 grass draws** (30 000 near + 9 900 far + 480 flower instances, 3-tri blades, about 120k tris, `frustumCulled = false`).

Top draw owners (desktop Med, per frame), from the `breakdown` field in the JSON:
- the hero: `kitBody` 33.3k tris MeshPhysical, plus a shadow draw, eyes and lids ×2, bow, blade, hilt, cape, `shadowProxy`
  and fur head, bib and tail (furTail **71.5k tris**). That is about 12 draws plus about 7 shadow draws.
- **Each NPC kitten**: about 8–12 draws (body 12–14k tris, eyes, lids, whiskers as `LineBasicMaterial`, scarf, fur
  shells) plus a shadow draw.
- `props:meadow` BatchedMesh, 19.9k tris, with a shadow draw.
- forest: **28 `flame` draws/frame** (`level:forest/props/flame`); gate: 16 `flame` draws.
- rats: `Rat_1` and `Rat_2` (2 skinned meshes each) plus helmet, buckler and spear props, each with a shadow draw.

### 2.3 Where the GPU time goes (interleaved Δ, `perf_toggle.mjs`, Med 1280×720)

Δ is the GPU ms saved when the item is removed (negative = it costs that much). ANGLE-GL unless marked D3D11.

| Item removed | meadow classic | meadow iso | meadow combat iso | town hub iso | forest iso | **meadow iso D3D11** |
|---|---|---|---|---|---|---|
| Baseline GPU | 11.7 | 8.7 | 10.9 | 10.6 | 6.7 | **16.0** |
| **Composer MSAA 4 → 0** | **−5.05** | **−3.64** | **−3.69** | **−3.39** | **−3.64** | **−7.95** |
| Pixels ×0.5625 (dpr ×0.75) | −2.91 | −2.75 | −2.68 | −3.09 | −2.28 | −4.93 |
| Pixels ×0.25 (dpr ×0.5) | −6.12 | −4.66 | −4.61 | −5.06 | −3.63 | −9.53 |
| **Bloom pass** | −1.56 | −0.93 | −1.71 | −0.97 | −1.02 | **−4.67** |
| `level:*` group (props, terrain, dressing) | −3.94 | −2.36 | −2.85 | −3.95 | −3.36 | −2.66 |
| All kittens | −1.76 | −0.31 | −0.20 | −0.58 | −0.28 | −0.35 |
| Point lights (visible → hidden) | −1.28 | −0.22 | −0.54 | −0.87 | −0.26 | −0.38 |
| Grass, flowers, wheat | −1.07 | −0.54 | −0.50 | −0.15 | −0.38 | −0.45 |
| Fur shells | −0.81 | −0.05 | −0.02 | +0.22 | −0.02 | +0.03 |
| Transparent meshes | −0.84 | −0.04 | −0.46 | +0.02 | +0.15 | +0.03 |
| Shadow pass (map kept, not re-rendered) | +0.40 | −0.23 | −0.29 | −0.88 | −0.18 | −1.31 |
| Standard/Physical → **Toon** | −0.47 | −0.33 | −0.85 | −1.63 | −0.05 | −0.65 |
| Standard/Physical → Lambert | −0.37 | −0.17 | −0.51 | −0.55 | −0.05 | −0.39 |

**Reading it:**
- The Iris Xe frame is **bandwidth- and fill-bound in post**, not geometry-bound. The 4× MSAA plus HalfFloat
  render target writes and resolves 8 B × 4 samples per pixel. Bloom then reads and writes HalfFloat 5 mips deep,
  and Output and Vignette each read the full HalfFloat buffer again.
- Fur shells, grass, transparent cards and the shadow pass are **cheap on the GPU**.
- **Toon is never more expensive than PBR** (−0.05 to −1.63 ms). A warm cartoon material pass is perf-positive.

### 2.4 Where the CPU time goes

**Share of measured frame CPU** (probe wrappers, GL). "sim" = all `step.*`, "vis" = all `frame.*` render hooks,
"submit" = `postfx.render` minus the shadow pass, "shadow" = `renderer.shadowMap.render`.

| Run | frame CPU ms | sim | vis | submit | shadow | top items |
|---|---|---|---|---|---|---|
| desktop Med meadow idle | 32.1 | 10 % | 32 % | 41 % | 15 % | **player vis 19 %**, companions 4 % |
| desktop Med meadow combat | 27.2 | 18 % | 27 % | 34 % | **19 %** | player 13 %, enemies (step) 7 % |
| desktop Med forest | 50.3 | 12 % | 27 % | 44 % | 13 % | player 16 % |
| desktop Med **town hub** | 35.4 | 13 % | **42 %** | 34 % | 9 % | **companions vis 22 %**, player 13 %, physics 5 % |
| desktop Med meadow iso | 15.9 | 7 % | 33 % | 41 % | 16 % | player 22 % |
| desktop Low meadow walk | 23.2 | 9 % | 42 % | 46 % | 0 | **player 29 %** |
| mobile Med town hub (4×) | 134 | 20 % | 53 % | 19 % | 6 % | **companions 35 %**, player 15 % |
| mobile Low combat iso (4×) | 197 | **57 %** | 16 % | 26 % | 0 | enemies (step) 44 % (first-use spawn work and 4.7 steps/frame) |
| mobile Med idle iso (4×) | 109 | 25 % | 30 % | 25 % | 18 % | player step 16 %, **ui 11 %** |

**Isolated costs** (`perf_deep.mjs`: loop stopped, GPU drained, median and min of 20–30 calls, desktop Med):

| Item | meadow | combat | hub | forest |
|---|---|---|---|---|
| All `render()` hooks | 4.8 (min 3.0) | 7.5 (min 3.2) | 6.4 (min 2.0) | 2.9 (min 1.3) |
| … of which `player.render` | **3.0 (min 1.7)** | 3.2 (min 0.8) | **3.6 (min 1.8)** | |
| … `companions.render` | 0.4 | 0.3 | **1.6 (min 1.2)** | |
| 1 fixed step (all systems) | 0.4 | 1.2 | 0.9 | 0.9 |
| `scene.updateMatrixWorld` | 0.9 | 0.6 | **1.4** | 0.8 |
| Full frame GL submit (`postfx.render`) | 16.4 (**min 6.9**) | 15.9 (min 4.6) | 18.8 (min 2.9) | 4.1 (min 2.7) |

CPU Δ from the interleaved toggles. Submit CPU saved, median ms, noisier than the GPU column:

| Removed | meadow iso | combat iso | hub iso | forest iso | D3D11 meadow iso |
|---|---|---|---|---|---|
| **Shadow pass** | **−5.6** | **−7.6** | **−4.5** | −2.2 | −4.4 |
| `level:*` group | −3.3 | −3.4 | −2.6 | −2.9 | −4.5 |
| All kittens | −2.8 | −2.5 | **−4.0** | −2.3 | −3.8 |
| Bloom | −2.3 | −0.1 | −1.1 | −0.7 | −1.5 |

**Main thread by category** (CPU sampling profile, desktop Med): `(program)`, the native part (GL command encoding,
IPC, GC, DOM), is 25–52 %. three.js JS is 25–51 %. Game code is about 15 %.
- **Top game files:** `characters/Cape.js` 3.7–4.8 % (`step`, `collide`, `_write`, plus three's
  `computeVertexNormals` 1.2–1.6 % and `fromBufferAttribute` 1.0–1.8 %), `physics/Physics.js` 0.8–2.2 %
  (`separateActors`, O(n²) over all actors), `world/Pickups.js` 2.5 % in combat, `audio/*` 1.6–3.1 % in combat,
  `camera/Occluders.js` 0.9 % (`_nearLens`), `characters/KittenBuilder.js` / `KittenView.js` about 1.5 %.
- **three internals worth naming:** `getParameters`, `getProgram`, `getProgramCacheKey` and `setProgram` take
  **4–8 %** (program re-resolves, §2.5). `updateMatrixWorld` takes 2–3.2 %; it runs twice for every kitten
  (`KittenBuilder.simulate` calls `root.updateWorldMatrix(true,true)`, then the renderer runs it again).
  `AudioContext.getContext` (an inlined frame of `AudioListener.updateMatrixWorld`) takes 2.6–4.6 % in combat.

**Trace** (renderer + GPU process, Low meadow): renderer main is busy about 997 ms/s. JS `FunctionCall` takes 665 ms/s,
`PaintArtifactCompositor::Update` 141 ms/s and style recalc 26 ms/s. The GPU-process main thread spends 244 ms/s in
`CommandBufferService:PutChanged`, which is the cost of decoding our GL stream. So **draw and state-change count costs
twice: once in JS and once in the GPU process.**

### 2.5 State churn per frame (`perf_churn.mjs`)

| What | meadow idle | meadow combat | Cause |
|---|---|---|---|
| **Program re-resolves** (`setProgram` → `getProgram`) | **8 / frame** | **18 / frame** | Shadow pass: three's single shared `_depthMaterial` alternates `skinning` / `instancing` / `batching` between consecutive casters (kitBody ↔ bow ↔ cape ↔ `props:meadow` BatchedMesh ↔ `fade:fence_simple` instanced ↔ Cow, plus Rat_1, kettleHelm, hood, crowHood and Pigeon in combat). Also one `MeshStandardMaterial` is shared by `practiceGate` (Mesh) and `fade:fence_simple` (InstancedMesh). |
| Texture uploads | 3 bone `DataTexture`s (12²/16²/19²) + `Props.js:375` 40² DataTexture each frame | **22× 12² + 4× 8²** bone textures | One skeleton per skinned mesh: each rat has 2 skinned meshes with separate bone textures |
| Attribute uploads | Cape position + normal (2475 floats ×2), `Pickups.js:308` instance matrices (3840 + 720), `MistCards.js:154` | same | Fine in size. Pickups re-uploads every fish matrix every frame, even when they don't move. |

### 2.6 Allocation and GC (`perf_alloc.mjs`, CDP sampling heap profiler, desktop Med)

| Scenario | MB/s | KB per frame | Top allocators |
|---|---|---|---|
| meadow combat | **13.9** | **789** | `zzfx.buildSamples` 20 % + `procedural.pinkNoise` 12 % (one-shot: the **first key press unlocks audio and bakes every SFX plus the 2 s wind buffer on the main thread mid-fight**), `computeVertexNormals` 12 %, three `getParameters` 6.5 % (re-resolves), `Physics.separateActors` 5 %, `rng.next` 2.8 %, `Pickups.update` 2.2 %, `ActorRegistry.queryRadius` 1.1 % |
| town hub | 7.4 | 263 | `computeVertexNormals` 16 %, `getParameters` 11 %, three uniform setters `setValueV3f` / `setValueM4` 16 %, `sortOpaque` 4.8 %, `MistCards.render` 3.3 %, `KittenBuilder` `E()` (new Quaternion + Euler per call) 2.7 %, `KittenBuilder.animate` 2 %, `Input.poll` 1.5 % |

The probe's precise-heap sampling showed 5–18 MB/s churn with a minor GC every 2–4 s. In combat, `(garbage collector)`
took 2.6 % of main-thread samples. tech.md §18 requires "no allocations in update/render", and the game breaks that rule.

### 2.7 Hitches and loads

- `meadow_walk` desktop Med: **p99 847 ms**, long tasks up to 840 ms (GL). Desktop Low: p99 361 ms. Mobile Low: long tasks up to
  **873 ms (idle), 1 759 ms (combat)**. Sources seen in profiles: shader compiles (`getProgramInfoLog`), the audio
  unlock bake, and enemy and prop first use.
- Level loads (dev server, ESM transform included, **not representative of the build**): forest 41–50 s (desktop),
  town 14 s, gate 5–9 s. Boot 15–90 s. This needs a re-measure on a build served from a private port. It is out of
  scope here because a build would overwrite the shared `dist/`.

### 2.8 DOM / UI

There are 15–45 `RecalcStyle`/s, and 9.5–13 `Layout`/s in combat (damage numbers and toasts). `frame.ui` is
0.1–0.4 ms on desktop but **1.4–12 ms at 4× throttle** (3–11 % of the frame). In the trace,
`PaintArtifactCompositor::Update` was the biggest non-JS item on the renderer main thread.

---

## 3. Ranked hotspot table

The ranking uses the expected frame-time gain on the two targets: **Iris Xe on D3D11** and **mid phone ≈ 4× throttle**.
Owner areas follow GAME_DESIGN §19.2.

| # | Hotspot | Evidence (this doc) | Expected gain | Owner area, files | Effort / look risk |
|---|---|---|---|---|---|
| **H1** | **Med/High composer: 4× MSAA on a HalfFloat RT**, plus separate OutputPass and VignettePass full-screen reads | GPU Δ −3.4…−5.1 ms (GL), **−8.0 ms of 16 (D3D11)**. D3D11 OutputPass 3.7 ms, vignette 0.55 ms | **−5 to −10 ms GPU** desktop | **core**: `PostFX.js`, `config.js` QUALITY | S / low (cartoon edges + FXAA or SMAA read fine; see R1) |
| **H2** | **Bloom: full-res HalfFloat, 5 mips, 13 draws** | Δ −0.9…−1.7 ms (GL), **−4.7 ms (D3D11)**. 13 of 79–145 calls | −1 to −4 ms GPU, −13 calls | **core** `PostFX.js` (fx tweens stay) | S / low |
| **H3** | **Shadow pass**: 22–49 caster draws in ±20 m, re-rendered every frame. A shared depth material flips programs 8–18×/frame | CPU Δ **−2.2…−7.6 ms**. 15–24 % of frame CPU. 25–34 % of calls. Re-resolves allocate 4–4.5 MB/5 s | −3 to −6 ms CPU, −20 to −45 calls | **world** (cast flags), **core** (shadow light / frustum in `Env.js`, owned by world), **characters** / **enemies** (`customDepthMaterial`) | M / low in iso (seen from above, props' shadows matter less; spec §4.2 wants side light) |
| **H4** | **Hero visual update** (`frame.player`): verlet cape at 4 iterations × up to 4 substeps, Catmull-Rom upsample, `computeVertexNormals` (allocates) every frame, `root.updateWorldMatrix(true,true)` per kitten, fur uniforms, eyes | 13–29 % of frame CPU in **every** scenario. Isolated 3.0–3.6 ms (min 0.8–1.8). Cape.js 3.7–4.8 % of samples. `computeVertexNormals` 12–16 % of allocations | −1.5 to −3 ms CPU desktop, −6 to −12 ms at 4× | **characters** `Cape.js`, `KittenBuilder.js`, `KittenView.js`; **player** `SwordcatModel.js` | M / none (same look) |
| **H5** | **NPC kittens** (hub residents, villagers, companions): full animate + simulate each, about 8–12 draws plus a shadow draw each, whiskers as separate `LineBasicMaterial` draws | companions vis **20–35 %** of frame in the hub. Kittens CPU Δ −2.3…−4.0 ms. 24–36 calls | −3 to −5 ms CPU in the hub, −20 calls | **companions** `HubKittens.js`, `NpcActor.js`, `LostKitten.js`; **characters** `KittenBuilder.js` (merge), `Fur.js` | M / low |
| **H6** | **Program and material sprawl**: 88–151 programs live per level, 37–59 materials in view, one material shared between Mesh and InstancedMesh | `info.programs` 88–151. Re-resolves 8–18/frame. `setProgram`/`getProgram`/`getParameters` 4–8 % of samples. GPU process `PutChanged` 244 ms/s | −1 to −3 ms CPU, fewer compile hitches | **world** `Props.js`, `LevelKit.js`; **characters** `materials.js`; **fx** `shaders.js`; **core** prewarm | M / none |
| **H7** | **Level props submit**: forest 28 flame draws, gate 16. Static props not batched by material. Pickups re-upload instance matrices | `level:*` hidden: **−38…−45 calls**, CPU −2.6…−6.7 ms, GPU −2.4…−4.0 ms | −2 to −4 ms CPU, −1 to −2 ms GPU | **world** `Dressing.js` (flames), `Props.js`, `Pickups.js`, `levels/*.js` | M / none |
| **H8** | **Fixed-step catch-up** (`LOOP.maxSteps 5`): slow frames run more sims | Steps/frame 2–3.5 desktop under load, **4–5 on mobile**. Mobile combat runs 5.0 steps/frame | CPU stays bounded on slow devices (up to −50 % of sim at < 30 fps) | **core** `Loop.js`, `config.js` LOOP; **enemies** AI tick | S / feel: needs tuning |
| **H9** | **Hitches**: shader compiles mid-play, the audio unlock bake, first-spawn rig work, level stream | p99 0.85 s (walk), 1.3–1.9 s mobile. `getProgramInfoLog` in profiles. zzfx + pink noise allocate 22 MB on the first key | Removes 0.3–1.8 s stalls | **core** (prewarm), **audio** `AudioManager.js` / `sfxDefs.js` / `procedural.js`, **enemies** prewarm, **world** `LevelManager.js` | S–M / none |
| **H10** | **Allocation churn** 263–789 KB/frame | §2.6 | GC pauses gone, −1 to −3 % CPU | characters, physics (`separateActors`), fx (`MistCards.render`), core (`Input.poll`), world (`Pickups`) | S / none |
| **H11** | **Pixels on phones**: Med maxDpr 1.5 gives 618×1258 (0.78 MP). Dynamic res starts at maxDpr | dpr ×0.75 saves 2.3–3.1 ms GL, 4.9 ms D3D11 | Large on real phone GPUs (fill-bound) | **core** `PostFX.js`, QUALITY | S / low |
| **H12** | **Audio on the main thread**: listener and panner AudioParam automation every frame, procedural wind | `getContext` (inlined listener) 2.6–4.6 % in combat. audio 1.4–3.1 % | −0.5 to −1 ms CPU | **audio** `AudioManager.js` | S / none |
| **H13** | **UI DOM**: style recalcs 15–45/s, layouts in combat | `frame.ui` up to 12 ms at 4×. PaintArtifactCompositor | −1 to −3 ms on phones | **ui** `hud.js`, `toasts.js`, damage numbers (fx `DamageNumbers.js`) | S / none |
| H14 | Grass (40k instances, never culled) | GPU −0.15…−1.07 ms. 120k tris | Small. In iso: radius 22 m (spec §4.2) | **world** `Grass.js` | S |
| H15 | Point lights (lanterns, hero glow, flames) | GPU −0.2…−1.3 ms | Small | **world** `Dressing.js`, **fx** `Lanterns.js`, `HolyFX.js` | S |

**Not hotspots (keep them; they carry the cute look):** fur shells (GPU ≈ 0–0.8 ms), toon vs PBR shading (≤ 0), the cape's
*look*, and the sky dome (hidden in iso anyway).

---

## 4. What the iso camera changes (measured with the emulation)

- **Geometry and calls drop by themselves:** tris −33 % (meadow), −33 % (forest); calls −8 (meadow), −63 (forest),
  −31 (gate), −14 (hub). Most of the forest drop comes from the far canopy and flames leaving the 90 m far plane
  and the frustum.
- **These don't drop:** post (full screen, so it stays the same), the shadow pass (casters are within ±20 m of her, as
  before), character CPU and NPC CPU. **H1 to H5 hold for the new camera.**
- **New risks the spec adds**, per frame, to budget now:
  - x-ray silhouette proxies (≤ 5 draws, `GreaterDepth`)
  - a ground-mist sheet (1 draw)
  - ground wedges, parry and aim rings (decals)
  - dithered alpha-hash fades (no sorting; cheap)
  - focus-fog `vFogW` varyings on every patched material: one extra varying, negligible, but **every patched
    material recompiles**, so prewarm it (H9).
  - the wheat trample uniform array (5).

  Total ≤ +8 calls. The real risk is new programs, not draws.
- **Shadow frustum:** a top-down 13 m camera at 51° sees about 16 × 14 m of ground. The current ±20 m shadow box can
  shrink to about ±11 m around the focus. That gives 4× the texel density at the same map size, so the map can drop
  to 1024 and keep the same texel density at a lower cost.

---

## 5. Recipes (three.js r186, code-level)

> These are recipes for the owning area. They are sketches against the current files, not patches.
> Every number is a starting value to verify with `perf_toggle.mjs`.

### R1. Post: one 8-bit or non-MSAA HDR target, half-res bloom, a merged output (H1, H2; core `PostFX.js`)

```js
// config.js QUALITY: separate the AA method from the composer; Med on iGPU = no MSAA.
med:  { ..., msaa: 0, aa: 'fxaa', hdrTarget: 'half', bloomRes: 0.5, bloomMips: 3, maxDpr: 1.25 },
high: { ..., msaa: 4, aa: 'msaa', hdrTarget: 'half', bloomRes: 0.5, bloomMips: 5 },
low:  { composer: false, ... },   // canvas antialias stays (one MSAA'd 8-bit target = the cheapest AA on mobile)

// PostFX._buildComposer()
const rt = new THREE.WebGLRenderTarget(w, h, {
  type: q.hdrTarget === 'half' ? THREE.HalfFloatType : THREE.UnsignedByteType,
  samples: q.msaa,                       // 0 on Med
  depthBuffer: true, stencilBuffer: false,
});
// Bloom at half res: UnrealBloomPass sizes its mips from the size passed in setSize(); wrap it.
const bloom = new UnrealBloomPass(new THREE.Vector2(w * q.bloomRes, h * q.bloomRes), s, r, t);
const _setSize = bloom.setSize.bind(bloom);
bloom.setSize = (W, H) => _setSize(Math.max(1, W * q.bloomRes | 0), Math.max(1, H * q.bloomRes | 0));
bloom.nMips = q.bloomMips;               // r186 UnrealBloomPass reads nMips at construction: subclass, or set before
                                         // the first setSize. Fewer mips = fewer draws (2 per mip + composite).
// One final pass: tone map + sRGB + vignette + FXAA in a single ShaderPass, instead of OutputPass + Vignette (+ FXAA).
// Build it from OutputShader's fragment with `#include <tonemapping_pars_fragment>` / `<colorspace_pars_fragment>`
// (as OutputPass does), then add the vignette term and an FXAA 3.11 tap set before tone mapping.
```

- Expected: −5 to −8 ms GPU on D3D11 Iris Xe Med (MSAA), −2 to −4 (bloom res + mips), −3 (merging Output and
  Vignette saves one full HalfFloat read and write). Draw calls −8.
- Cartoon synergy: FXAA softens 1-px specular sparkle, which helps the "warm, soft" goal. If the art pass adds an
  inverted-hull outline, it is geometry, so MSAA is not needed for it.
- Keep the NaN guard (`materialHighPassFilter` patch) in the new bloom.

### R2. Shadows: iso-tight box, fewer casters, no program flips, 30 Hz option (H3; world `Env.js`, characters, enemies)

```js
// 1) Tight box around the iso focus (CONTROLS_SPEC §2.1 framing ≈ 16 × 14 m) and a texel-snapped follow.
const S = 11;                                             // half-extent, m (was ±20)
sun.shadow.camera.left = -S; sun.shadow.camera.right = S; sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
sun.shadow.mapSize.set(q.id === 'low' ? 512 : 1024, ...); // same texel density as 2048 @ ±20
// snap: move sun + target by whole shadow texels in light space to stop shimmering when the focus moves.

// 2) Only things whose shadow reads from above cast: characters, enemies, big props (trees, houses, stones).
//    Fence posts, fish pickups, flames, small dressing, whiskers, eyes, lids, blade, bow -> castShadow = false.
//    Measured meadow casters 26 (combat 48): target ≤ 12 (≤ 20 in combat).

// 3) No program flips: give each caster kind its own depth material once (three's getDepthMaterial honours it).
const DEPTH = {
  skinned: new THREE.MeshDepthMaterial(), instanced: new THREE.MeshDepthMaterial(),
  batched: new THREE.MeshDepthMaterial(), plain: new THREE.MeshDepthMaterial(),
};
export function tagDepth(o) {      // call at build time (characters/enemies/props)
  o.customDepthMaterial = o.isSkinnedMesh ? DEPTH.skinned : o.isInstancedMesh ? DEPTH.instanced
                        : o.isBatchedMesh ? DEPTH.batched : DEPTH.plain;
}
// (alphaTest / alphaMap casters still need their own clone; three only caches those when no custom material exists.)

// 4) Low-rate option (Med on mobile, Low with shadows): re-render at 30 Hz, or only when she moved > 0.25 m or an
//    actor in the box moved.
renderer.shadowMap.autoUpdate = false;
// per frame: if ((frame & 1) === 0 || focusMoved) renderer.shadowMap.needsUpdate = true;
```

- Expected: −3 to −6 ms CPU (combat), −20 to −40 calls, 0 re-resolves.
- **Low:** keep shadows off, but give every character the `blob` decal it already has (`KittenBuilder.blob`). Mobile
  reads contact shadows as "grounded and cute" without a shadow pass.

### R3. Hero and kitten secondary motion (H4, H5; characters `Cape.js`, `KittenBuilder.js`, `KittenView.js`)

```js
// Cape: 30 Hz sim with render-rate interpolation; fewer iterations off-Ultra; in-place normals (no allocations).
CAPE_DEFAULTS.iterations = q.id === 'low' ? 2 : 3;               // was 4 (×4 substeps max)
advance(dt) { this.acc = Math.min(this.acc + dt, 2 / 30); while (this.acc >= 1 / 30) { this.step(1 / 30, wind); this.acc -= 1 / 30; } }
// _write(): the render grid is a regular rc × rr lattice, so the normal at (r,c) is cross(P[r][c+1]-P[r][c-1],
// P[r+1][c]-P[r-1][c]): ~6 flops per vertex into the existing normal array. Replaces geo.computeVertexNormals()
// (which allocates temporaries and walks the index); then normal.needsUpdate = true.

// One matrix pass per frame, not two: drop root.updateWorldMatrix(true, true) in simulate(); read the cape pins
// from joints after a *local* update of the chest chain only (updateWorldMatrix(true, false) on the chest joint).

// Freeze what nobody sees: skip simulate() when the kitten is outside the camera frustum (sphere test on the root)
// or farther than 18 m from the focus in iso; keep animate() at 15 Hz for those (time-sliced, below).
```

NPC kittens (H5): add an **update LOD** in `CompanionManager` / `HubKittens`.

| Band (iso, from the focus) | animate | simulate (fur drag, eyes, scarf) | Draws |
|---|---|---|---|
| ≤ 8 m, or in dialogue | every frame | every frame | full |
| 8–16 m | 30 Hz, staggered (`(id + frame) & 1`) | 15 Hz | eyes, lids, whiskers merged into the body (one skinned mesh, vertex-colour face), 6 fur shells |
| > 16 m or off-screen | 10 Hz, staggered | off | body + 1 sheen shell, **no shadow** (blob decal) |

Whiskers as `LineBasicMaterial` cost one draw and one program each. Bake them into the face texture or into the
fur-tuft card atlas.

### R4. Program and material diet (H6; world, characters, fx, core prewarm)

- **Dedupe materials by key** at build time: `matKey = type|color|map.uuid|flags`, plus a module-level
  `Map<key, Material>`. **Never share one material between a Mesh and an InstancedMesh** (or Skinned and not). Clone
  per kind instead; the clone shares the program, so there is no flip.
- **Target ≤ 40 programs per level** (now 88–151). Count with `renderer.info.programs.length` in a smoke assertion. The
  `fx.*` group alone brings about 20 named programs (`fx.horde`, `fx.sunrays`, `fx.web`, `fx.shock.*`, …). Many
  never draw in a given level, so create them lazily but **prewarm** them.
- **Prewarm every variant** after load and before the reveal. Create the variant objects (a skinned dummy,
  instanced and batched dummies), add them to a hidden scene with the level lights and fog, and run
  `await renderer.compileAsync(scene, camera)` (KHR_parallel_shader_compile). Do it again after any quality or fog
  change. Include the **shadow depth variants** (R2's four materials) and the **iso focus-fog** recompile.
- Uniform upload cost: Physical has about 3× the uniforms of Toon or Lambert, and §2.3 shows Toon costs nothing more on
  the GPU. Moving **world props to `MeshToonMaterial` or `MeshLambertMaterial` with a 3–4 step warm gradient map**
  serves both the art direction ("warm, cartoonish") and perf. Keep Physical only on the hero's armour and blade
  (polished steel is her signature) and the eyes.

### R5. Static world submit (H7; world `Props.js`, `Dressing.js`, `Pickups.js`, levels)

- **One `BatchedMesh` per material per level** for every static, non-fading prop (meadow already has
  `props:meadow`). Fading props (`fade:*`) stay instanced or batched per fade group.
- **Flames:** 28 draws in the forest and 16 at the gate. Use one `InstancedMesh` of flame cards per level (per-instance
  phase attribute), and drive the light pool from the 2 nearest flames only.
- **Pickups:** `setMatrixAt` plus `instanceMatrix.needsUpdate` only for moving items (a dirty list), not every fish
  every frame. Bob the static ones in the vertex shader (`uTime + instancePhase`).
- **Iso cull distance:** 90 m far plane per spec, plus a per-class `maxDist` (dressing 35 m, small props 25 m) checked at
  10 Hz.

### R6. Loop, sim tick and AI (H8; core `Loop.js`, enemies)

```js
// config.js
LOOP = { step: 1 / 60, maxSteps: 3, maxFrameDt: 0.1, lowStep: 1 / 30, lowMaxSteps: 2 };
// Loop: on Low (or when stepsLastFrame >= maxSteps for 0.5 s) switch to the 30 Hz step; actors already interpolate.
// When the cap is hit, drop the remainder (acc = 0, as today) and *slow game time* instead of catching up.
// Enemies: think() at 10–20 Hz, staggered by id; steering and physics stay at the step rate.
```

### R7. Hitches (H9; audio, core, enemies, world)

- **Audio unlock:** bake zzfx defs and the wind pink noise **before** gameplay. Bake on the title or loading screen in
  `requestIdleCallback` chunks (≤ 2 ms each), or render through an `OfflineAudioContext` (rendering runs off the main
  thread). Keep the bake results across levels. Today the first J or tap mid-fight allocates 22 MB and stalls.
- **First spawn:** `EnemyManager` prewarm should build one instance of each level enemy type, including its props and
  its shadow and depth variant, during the level load. Then park it hidden for reuse (a pool).
- **Smoke perf gate** (core `tests/smoke.mjs`; I can propose but not edit). After each level loads, run 3 s of `?test`
  play and **fail if a new program appears or a long task exceeds 100 ms**.

### R8. Allocation fixes (H10)

| Allocator | Fix |
|---|---|
| `computeVertexNormals` (cape) | R3 in-place lattice normals |
| three `getParameters` | Goes away with R2 and R4 (no re-resolves) |
| `KittenBuilder.js:43 E()` | Cache `E(x,y,z)` results at module load (they are constant pose quaternions) |
| `Physics.separateActors` | Reuse pair scratch. Use the existing `ActorRegistry.queryRadius` grid instead of O(n²) over 28–36 actors. |
| `MistCards.render`, `Input.poll`, `Pickups.update`, `rng.next` | Hoist temporaries (`_v`), avoid array spreads and closures per frame. `rng.next` should not box. |
| `sortOpaque` | Inherent to three. Fewer drawables helps (R4, R5). |

### R9. Audio and UI main-thread trims (H12, H13)

- Listener and panner positions: update at 20 Hz, and only when the position moved > 5 cm. Use `setValueAtTime`, not
  cancel + set each frame (`AudioManager.js:690–695`). Free one-shot panners when they end (already pruned in
  `render()`).
- HUD: write the DOM only on change (diff the last value), batch at 10 Hz, and animate only `transform` and `opacity`.
  Add `contain: layout paint` on HUD roots. Pool damage numbers as `transform`-only elements, or draw them in a
  canvas or as 3D sprites.

### R10. Pixels and dynamic resolution (H11; core)

- Mobile Med: `maxDpr 1.5 → 1.25`, start at `1.0`, step down to `minDpr 0.7` on **GPU** time. Use the R1 timer query
  when it is exposed (it is on both ANGLE backends here), else frame time. Cartoon art at 0.75 res with FXAA reads
  well. Keep the HUD DOM at native res, which is free.
- Mobile Low stays at dpr 1.0 (0.35 MP), with `antialias: true` on the canvas.

---

## 6. Budgets to replace tech.md §18 (measurable, per frame)

| Budget | Desktop iGPU (Med, D3D11, 1080p × dyn-res) | Mobile (Low, ≈ 4× throttle proxy) | Today (measured) |
|---|---|---|---|
| Frame | ≤ 16.6 ms (60 fps), p99 ≤ 33 ms | ≤ 33 ms (30 fps), target 16.6 on good phones | 30–75 ms D3D11 Med; Low 4× 27–200 ms |
| **GPU** (timer query) | ≤ 10 ms | ≤ 12 ms on a real phone (to be measured) | 16–40 ms D3D11 Med |
| Main-thread JS (`step` + `render` hooks) | ≤ 4 ms | ≤ 10 ms at 4× | 4–8 ms isolated; 13–29 % hero alone |
| GL submit CPU (`postfx.render` min) | ≤ 3 ms | ≤ 8 ms at 4× | 2.7–6.9 ms (min), 16 ms (median under load) |
| Draw calls (frame, incl. shadow + post) | ≤ 90 | ≤ 50 | 73–145 / 33–94 |
| Shadow draws | ≤ 15 | 0 (blobs) | 22–49 |
| **Programs per level** | ≤ 40 | ≤ 30 | 88–151 / 66–117 |
| Program re-resolves per frame | 0 | 0 | 8–18 |
| Allocation | ≤ 32 KB/frame | ≤ 32 KB/frame | 263–789 KB/frame |
| Fixed steps per frame | ≤ 1.2 avg | ≤ 1.5 avg (30 Hz step) | 2–3.5 / 4–5 |
| Long tasks during play | none > 50 ms | none > 100 ms | up to 0.84 s / 1.76 s |

---

## 7. Expected result if R1 to R10 land (estimate from the measured Δs, not re-measured)

| Case | Today | After (estimate) | Main contributors |
|---|---|---|---|
| D3D11 Med meadow iso, GPU | 16–28 ms | **8–11 ms** | R1 (−8 MSAA, −2 to −3 bloom, −2 to −3 merged output), R10 |
| D3D11 Med combat iso, CPU frame | 34 ms (under load) | **12–16 ms** | R2 (−5), R3 (−2), R4 (−1 to −2), R6, R8, R12/R13 |
| Hub (CPU) | 29–46 ms | **12–18 ms** | R3 NPC LOD (−4 to −5), R2, R4, R5 |
| Mobile Low 4× combat | 63–197 ms | **≈ 30–45 ms** | R6 (stops the 5-step spiral), R7 (no bake or compile in play), R3, R2 (no shadows), R13 |

60 fps on Iris Xe at 1080p probably needs R1 + R2 + R3 + R4 together, plus dyn-res around 0.8. A **mid phone at a
stable 30 fps** needs R6 + R7 + R3 + R13 first: those are CPU fixes. GPU is not the phone problem in these
measurements, but a real phone GPU has to be verified.

---

## 8. Reproduce (dev server on 5801; never 4173/5173)

```sh
SMOKE_NOHMR=1 npx vite --port 5801 --strictPort            # in its own shell
node research/next/tools/perf_probe.mjs                     # matrix: desktop+mobile × med+low × 6 scenarios (+ ablations)
node research/next/tools/perf_probe.mjs --iso=1 --ablate=0  # same with the CONTROLS_SPEC §2.1 iso emulation
node research/next/tools/perf_probe.mjs --gpu=d3d11 --ablate=0 --profiles=desktop --scen=meadow_idle,meadow_combat,town_hub
node research/next/tools/perf_toggle.mjs --level=meadow --spawn=start --iso [--combat] [--gpu=d3d11]   # GPU/CPU Δ table
node research/next/tools/perf_deep.mjs --level=town --spawn=hub [--mobile --nobench]    # CPU profile + isolated costs
node research/next/tools/perf_churn.mjs --level=meadow --spawn=start --combat           # program re-resolves, uploads
node research/next/tools/perf_alloc.mjs --level=meadow --spawn=start --combat           # allocation sampling
node research/next/tools/perf_ab.mjs --gpu=d3d11 --preset=med                           # clean fps + observer check
node research/next/tools/perf_trace.mjs --level=meadow --preset=low                     # renderer vs GPU-process threads
```

**Measure next:**
1. Re-run the matrix on an **idle machine** (no parallel agents) for clean absolute numbers.
2. Run on a **real mid-range Android** through `chrome://inspect` with the same scripts, using `connectOverCDP`.
3. Measure **level load** on a build served from a private port (copy `dist` to a temp folder first; never rebuild
   the shared one).
4. Re-run `perf_toggle` after the real iso camera and focus fog land, and gate the §6 budgets in smoke.

---

## 9. File and area map (GAME_DESIGN §19.2)

| Area | Files | Hotspots |
|---|---|---|
| core | `src/core/PostFX.js`, `config.js` (QUALITY, LOOP, RENDER.dynamicRes), `Loop.js`, `Game.js`, `debug.js` (add `__GAME__.perf` hooks: per-system ms, programs, re-resolves), `tests/smoke.mjs` (perf gate) | H1, H2, H8, H9, H11 |
| world | `src/world/Env.js` (sun shadow box), `Props.js`, `Dressing.js` (flames), `Pickups.js`, `Grass.js`, `LevelManager.js` (prewarm), `levels/*.js` (cast flags, batching) | H3, H6, H7, H14, H15 |
| characters | `Cape.js`, `KittenBuilder.js`, `KittenView.js`, `Fur.js`, `materials.js` (dedupe, depth materials, whiskers) | H3, H4, H5, H6, H10 |
| player | `SwordcatModel.js` (render order, the one-matrix-pass rule) | H4 |
| companions | `CompanionManager.js`, `HubKittens.js`, `NpcActor.js`, `LostKitten.js` (update LOD, time slicing) | H5 |
| enemies | `EnemyManager.js` (prewarm, pool, AI tick rate), `rig.js` / `props.js` (cast flags, depth material) | H3, H8, H9 |
| camera | `FollowCamera.js` iso (near 0.3 / far 90, far group hidden), `Occluders.js` (`_nearLens` at `CHECK_HZ`) | §4 |
| fx | `fx/shaders.js`, `MistCards.js` (allocation), `DamageNumbers.js`, lazy fx programs + prewarm | H6, H10, H13 |
| audio | `AudioManager.js` (panner rate), `sfxDefs.js` / `procedural.js` (bake before play) | H9, H12 |
| ui | `hud.js`, `toasts.js` (DOM diffing, transform-only) | H13 |
| physics | `Physics.js` `separateActors` (grid, no allocation) | H10 |

Sources: [pmndrs/postprocessing README (8-bit default buffers; HalfFloat for HDR on desktop; turn off renderer AA under
post)](https://cdn.jsdelivr.net/npm/postprocessing@6.39.4/README.md),
[three.js forum: changing MSAA sample counts means re-creating render targets](https://discourse.threejs.org/t/updating-sample-count-on-webglmultisamplerendertarget/14224),
[three.js forum: MSAA HalfFloat composer target in practice](https://discourse.threejs.org/t/the-sky-shader-becomes-a-lump-after-post-processing/73613).
Every number in this doc was measured locally with the tools in §8.
