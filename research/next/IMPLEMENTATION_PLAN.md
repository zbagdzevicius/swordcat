# SWORDCAT: warm look + extraordinary performance + MOBA auto-camera, the merged IMPLEMENTATION PLAN

Author: lead integration, 2026-10-11. Status: **binding** for ordering, contracts and gates. It merges
`research/next/ART_WARM_SPEC.md` (ART), `research/next/PERF_SPEC.md` (PERF) and `research/next/AUTOCAM_SPEC.md`
(AUTOCAM) on top of `research/CONTROLS_SPEC.md` (CONTROLS, being built now). The three specs were cross-checked and
edited so that they no longer contradict each other; the decisions are §2 (X1–X37). Where a spec and this file still
disagree on **order, contracts or gates**, this file wins; on **values**, the owning spec of §1 wins.

User request: *"make sure that we follow warm cartoonish kind of thematics so that everyone will feel great inside,
not 90s kind of nostalgic game. while performance must be extraordinary. and create maximum moba-like automatic
camera control as well."*

Ground rules for every implementer:
- The controls rework is live. Never edit a file the rework is editing until its area merges (§3 lists the waits).
  Code defensively against names that have not landed (`ctx.cam.footprint?.…`, `QUALITY[q].outline ?? 'hero'`).
- No literals in area code: every number lives in `config.js` (§4). One core commit merges all new config.
- `slice:meadow`, `flow:*` and every existing `camera:*` / controls block stay green after every merge.
- Ports per CONTROLS §12 (core 5301, physics 5311, camera 5312, characters 5313, player 5314, combat 5315,
  enemies 5316, companions 5317, world 5318, fx 5319, audio 5320, story 5321, ui 5322, save 5323).
- Perf **timing** numbers are measured only under PERF §14.1 (idle machine, calibration, ANGLE-D3D11, private build).

---

## 1. Who owns what (precedence)

| Topic | Owning spec | Others defer on |
|---|---|---|
| Colours, palette, ramps, shapes, proportions, materials' look, UI skin, fonts, audio cues, art gates (G/S) | ART | look values |
| Cost limits, render/load/loop mechanisms, quality presets, budgets, measurement protocol, perf gates | PERF | mechanisms and numbers (ART yields on mechanism, per its own header) |
| Camera behaviour, framing, SafeFrame, footprint, comfort, camera gates | AUTOCAM (over CONTROLS §2) | anything that moves the lens |
| Input, orders, nav, aim, touch cluster geometry, fog mechanics, occlusion | CONTROLS | geometry the camera and UI depend on |
| Order, dependencies, contracts, merged config keys, merged budgets, stage gates | **this file** | — |

---

## 2. Reconciliation decisions (all applied in the spec files, marked `[X#]` there)

| X | Conflict found | Decision | Edited |
|---|---|---|---|
| X1 | ART: direct-to-canvas, no post in play on every tier. PERF: Med/High composer + 7-draw uber pass (FXAA, bloom, grade) in play | **Direct to canvas on every tier, canvas `antialias: true`, 0 post passes in play.** Cheaper than the uber chain and keeps one program variant on Low/Med. Only fallback: Med RGBA8 RT + 1 FXAA pass if the AA A/B (PERF §6.1) shows canvas MSAA costs > 1.5 ms GPU more at equal S1 judgement; decided once as build constant `RENDER.medAA` | ART D2/§1R/§3.1, PERF §6, C6, C11 |
| X2 | ART: bloom composer in cutscenes, title, Meme Cam (Med+High), prewarmed after 60 play frames (compiles during play). PERF: bloom in play for Holy/Golden; `perf:no-compile` | **Cinematic bloom on High only, cutscenes + ending only** (not title, not Meme Cam, never gameplay), via PERF's PostChain (half-res dual-Kawase). RT variants prewarmed **under the veil**. Composer turns on at blend start with strength 0, off after the hand-back. Med/Low cutscenes = play path + glow cards | ART D3/§3.3, PERF §1.2/§6.1/§3.3 |
| X3 | PERF uber `uSat 1.08` + plum lift + `uShadowTint`; ART in-material `toonGrade` 1.12, D7 rejects plum tint; dither only on Low; vignette uber vs CSS | ART grade in materials only; `uShadowTint`/lift dropped; `material.dithering = true` everywhere; CSS `#ui-vignette` everywhere | ART §1R, PERF §6.3 |
| X4 | maxDpr ART 1.0/1.25/1.5 vs PERF 1.25/1.25/2.0; dyn-res via RT sub-rect needs an RT that X1 removes | maxDpr **1.25 / 1.25 / 1.5**; dyn-res = PERF controller driving `setPixelRatio` on every tier (≤ 1 change / 2 s); `uViewport` updated per change; new gate `perf:dynres-step` | ART §3.5, PERF §2/§5.1 |
| X5 | ART: world Lambert + global ShaderChunk patch, actors `sc-toon-v2`, `ENV_U`. PERF: everything MeshToon "WarmToon" with `TOON_U` (glow, lamps, shadow tint) | World = Lambert + ART patch; actors = ART `sc-toon-v2` (= "WarmToon"); `TOON_U` merged into `ENV_U`; delivered by world's existing `withHeightFog` hook (key `hfog3`), which already shares `HFOG` with every patched material | ART §2.4/§4.2/§5.1, PERF §8.1 |
| X6 | ART keeps HERO_LIGHT (intensity per preset `hero`); PERF removes every PointLight | No PointLights in play **or cutscenes**; `hero` preset value scales `uGlow`; cutscene lanterns use `uLamps` slot 0 (new story task S5t) | ART §2.5, PERF §8.2 |
| X7 | Shadows three ways: CONTROLS half 16 m Low 1024 / Med-High 2048; ART Med 1024 dynamic, actors cast; AUTOCAM footprint fit dynamic; PERF static cached 64 × 64 m Med 2048 / High 4096, actors blobs | Low none (blobs + vertex AO); **Med 1024, High 2048**. Stage 1 = dynamic, trimmed casters, AUTOCAM footprint fit. Stage 2 = statics-only cached map, box = fit + 8 m margin snapped to 8 m, re-render on exit / size class / sun tween; actors blob only. **Sun azimuth from the level's default yaw**, never zone hints (a hint blend would re-render the cache every frame) | ART §2.5/§3.4, PERF §7, AUTOCAM §9.2 |
| X8 | Fur: ART 0 shells in play all tiers; PERF Med 4 / High 6 by on-screen px; two close-up rules (lens < 6 m vs px ≥ 320) | Iso shells Low 0, Med 0, High 0 or 4 (PERF S2 decides); close-up = one flag `cam.closeUp` (lens < 6.0 on / > 6.3 off), close-up shells 8 / 16 / 16; shells built in idle slices after load, never on the close-up frame (Meme Cam has no veil) | ART D8/§6.1, PERF §9.3 |
| X9 | Outlines: ART enemies High only, widths 2.0/1.6/2.4, `#4A2A1E`; PERF Med hero + engaged, ≈ 1.5 px, `#4A2E2A` | ART look; tiers Low hero+boss, Med hero+boss+companions+≤ 4 engaged, High all; thermal rung 3 → hero+boss | ART D9/§5.4, PERF §9.5 |
| X10 | Hero draws ART ≤ 9 (separate eyes, shadow proxy) vs PERF end ≤ 5 (eyes via atlas) | Interim ≤ 9; end ≤ **6** (body+bow, eyes, steel+sword, cape, tufts, hull). Her eyes stay their own unlit draw; atlas eyes for kittens/villagers/enemies | ART §6.4, PERF §9.4 |
| X11 | Grass: ART 9-tri clumps 2.5k/8k/12k (72k tris Med) vs PERF 6-tri tufts 1.3k/4k/8k 1 draw; AUTOCAM multi-tile footprint cull; CONTROLS ×1.25 / 22 m | PERF geometry, counts and single tile; tile centred on the footprint centre (T = 1.6 d, unit-proved ⊇ footprint + 3 m); ART colours, ×1.6 width, up-bent normals | ART §8.2, PERF §8.4, AUTOCAM §9.4 |
| X12 | Far: CONTROLS 90; AUTOCAM footprint [45, 90] (≈ 55 m); PERF `max(60, fog formula)`. Culling: AUTOCAM per-class `maxDist` + footprint vs PERF one fog-radius cull | `far = clamp(ceil5(max(footFar, fogFar)), 45, 90)` + `farKeep`, fallback 60, camera owns; one 4 Hz fog-radius cull (PERF) + BatchedMesh per-object frustum culling | PERF §8.3, AUTOCAM §9.3/§9.4 |
| X13 | PERF `onScreen` = frustum sphere and activity tiers; AUTOCAM `onScreen` = SafeFrame-visible, actor skip by `inFootprint` 4 Hz mixer; ART mixers by 25 / 40 m | Two functions: `cam.onScreen` (SafeFrame-visible; gameplay fairness only) and `cam.inView`/`activityOf` (frustum; perf). PERF tiers replace AUTOCAM §9.5 and ART §7.4 rates; `setActivity(tier)` replaces `setOffscreen` | PERF §4.3, AUTOCAM §7.3/§9.5, ART §7.4 |
| X14 | Budgets: ART frame ≤ 60/90/110 calls, 100k/180k/260k tris, programs ≤ 50/60/60; PERF scene ≤ 40/60/90, 80k/150k/300k, programs ≤ 30/40→30/36; CONTROLS "≤ current" | One staged table (§5): I1 (PERF interim) → I2 (ART frame numbers) → End (PERF scene numbers); tris 80k/150k/**260k**; programs PERF + High cinematic +36 | ART §10, PERF §1.2/§14.3 |
| X15 | AUTOCAM `camera:perf` hard ms + `performance.memory`; ART "GPU ≤ 8 ms" target | All ms gates report-only until PERF §14.4 baseline; Med GPU target = PERF ≤ 9 ms; heap via CDP sampling (`perf:alloc`) | AUTOCAM §9.6/§11.2, ART §10/§11.4 |
| X16 | ART keep_storm ρ 0.036 "pending camera sign-off" | Computed against CONTROLS §4.2 targets: 0.036 gives f(12 m) = 0.117 < 0.15 (fails). **keep_storm 0.042** (f(8) 0.031, f(12) 0.156); **bog 0.058** passes (0.058 / 0.24). Verified by `world:fog-audit` when M3 builds them | ART D13 |
| X17 | PERF: title ≤ 16 programs, no composer, T_title ≤ 2 s; ART: title uses the composer and compiles shells + PMREM on the title | No composer on the title (any tier); shells compile on the title **after** T_title in idle `compileAsync`; PMREM plate High only, under the level veil | ART §3.3/§3.6, PERF §3.3 |
| X18 | PERF preloads Cinzel Decorative; ART deletes Cinzel (Fredoka only) | Fredoka only; preload Fredoka 500/700 | PERF §10.1/§10.2, ART G17 |
| X19 | CONTROLS boolean `settings.camLock` (already in GameState) vs AUTOCAM `camLockMode` | `camLockMode` replaces it; save migrates; Y toggles locked ↔ last unlocked mode | AUTOCAM §10.4/§12/§13 |
| X20 | PERF K3: camera computes the shadow centre; AUTOCAM: world computes from `cam.footprint` | Camera publishes footprint only; world owns the light and the box | PERF K3 (removed), AUTOCAM §9.2 |
| X21 | CONTROLS ability-bar sweep "30 Hz" vs PERF ≤ 15 style writes/s | Sweeps are CSS animations started once per cooldown (`@property --cd`); label on whole seconds | PERF §10.5, ART §9.1 |
| X22 | Mobile safe frames vs UI: ART restyle could move cluster/bar rects; full-screen `#ui-vignette`/`#ui-flash` could be measured as occluders; HUD updates could bump SafeFrame | Restyle = skin only (CONTROLS §9.2/§10.1 geometry fixed); pointer-events-none overlays, toasts, damage numbers, HP bars, `?perf` excluded; `version` bumps on rect changes only | ART §9.1, AUTOCAM §7.1 |
| X23 | `kitten:rescued` is `{ kittenId }` today; ART burst and AUTOCAM Cosy beat need a position; `arena:lock` needs `{center, r}` | Additive JSDoc: `kitten:rescued {kittenId, position}`, `arena:lock {id, center, r}` | AUTOCAM §12/§13, ART §8.6 |
| X24 | AUTOCAM beat twins (heart puff, petal confetti, sparkle) duplicate ART juice | Twins = ART §8.6 rescue burst, `SHAPE.CONFETTI` petals, `STAR4` burst; audio = ART glock + purr; 0 new draws | AUTOCAM §8.1/§13 |
| X25 | Meme Cam on the composer (ART) without a veil → visible AA/bloom switch and compile risk | Meme Cam uses the play path on every tier | ART §3.3 |
| X26 | Cape: ART sim 7 × 9, Low sway; PERF render grid 2/1, 3 iterations | Both: sim 7 × 9 + render subdivision 2/1 + grid normals; Low and tier ≥ 1 sway shader; full grid on `cam.closeUp` | ART §6.4, PERF §9.1 |
| X27 | Steel: ART 256² matcap + close-up PMREM; PERF 128² matcap + High Standard fallback | ART 256² matcap everywhere; Standard+PMREM only for High close-ups | ART §5.2, PERF §8.1 |
| X28 | ART per-type material pools vs PERF VisualPool | One pool: VisualPool visuals own their pooled toon materials | ART §5.1 |
| X29 | AUTOCAM R10 "FOV only from punches" vs its own Cosy beat Δfov −1.5° | R10 allows the Cosy beat (≤ 12°/s) | AUTOCAM R10 |
| X30 | PERF K5 "≤ 5 rays every 2nd frame" vs CONTROLS capsule tests at 20 Hz / AUTOCAM "no raycasts" | CONTROLS capsules at 20 Hz, ≤ 7, no scene raycasts; Occluders ≤ 0.05 ms amortised | PERF K5, AUTOCAM §9.6 |
| X31 | `reduceFlashes` default false while `reduceCameraMotion` follows the OS | Both default from `prefers-reduced-motion` on first run | ART save task |
| X32 | Unmeasurable criteria: "no world pixel below 0.06" (gate allows 0.5 %); "sunny picture book", "feels great inside", "generous, calm and warm"; R3 "smoke traces" without a block; G14 units; T_paint method; texture-memory method; enemy proportion / no-pink rules ungated | Rule aligned to G5; S1, S9 and AUTOCAM §11.4 turned into yes/no checklists; new blocks `camera:rates`, `perf:dynres-step`, `perf:composer`; G14/G15 in CSS px at DSF 1; T_paint = FCP; `perf().texMB`; new ART G18 (proportions), G19 (no pink) | all three |
| X33 | PERF cites "ART_SPEC.md" and "CAMERA_SPEC" (do not exist) | Mapped to ART_WARM_SPEC and AUTOCAM_SPEC in PERF's header | PERF header |
| X34 | `#vignette` (PERF) vs `#ui-vignette` (ART) | `#ui-vignette` | PERF §6.3, I4 |
| X35 | Ground mist and light pools: alpha overdraw on tile GPUs (PERF risk 1) vs ART counts | `QUALITY.groundMist` 4 / 8 / 8 quads; light pools Low 12 | ART §8.1 |
| X36 | Hero draw list included a shadow-pass proxy that stage 2 removes | Removed at stage 2 (X7) | ART §6.4 |
| X37 | Two warm-up mechanisms (ART `compileAsync` whole scene + `prewarmCinematic`; PERF batched `prewarm()`) | PERF `prewarm()` only; warm set lists every variant incl. High cinematic | ART §3.6, PERF §3.3 |

**CONTROLS items superseded — do not build them twice.** If the controls team has not built these yet, build the
AUTOCAM/PERF version instead: §2.1 lead (`vel 0.25 s`, KBM cursor 15 %), follow damping λ12 / λ6, §2.4 combat focus
bias + λ 2.5 zoom-out and the boss "inner 60 %", §2.1 far 90, §2.8 fixed shadow half 16 m / Low 1024 map and the 25 m
hero-shell rule, §4.2 grass ×1.25 / 22 m radius, the boolean `camLock`, `frameOffset` / `frameOffsetPortrait`
(derived from SafeFrame), §16.6 draw-call acceptance. CONTROLS §2.1's portrait width fit (≈ 21 m) is legal only with
AUTOCAM D19's portrait range [16, 26].

---

## 3. Ordering and dependencies

### 3.1 Stages (each ends at a gate in §8; stages overlap where the dependency column allows)

| Stage | Starts when | Content (task IDs, §6) | Exit gate |
|---|---|---|---|
| **S0 — measure + isolated wins** | now (parallel to the rework) | P:C1, C2, C4, C5, C13 · M:core.1 (`smoothDamp`) · A:core.2 (`toon.js` with a local fallback for `RENDER.toon`) · pure camera modules M:camera.SafeFrame / FramingSolver / Subjects / beats (new files, node tests, not wired) · hitch fixes P:U1, U2, H1, H2, E1–E3, W1, W2, F1, F2, P1 · glow without bloom P:F5 = A:fx.1 · A:ui.1 (vignette + flash layers) | G-S0 |
| **S1 — direct play path** | F5 merged; the rework's core owner accepts one `Game.js` commit | P:C3 + C11 + A:core.1 in **one** `Game.js` commit (shader checks off in prod, Neutral, `antialias: true` all tiers, `installToon()`, background from Env) · P:C6 = A:core.3 (no composer in play, High cinematic PostChain, `setCinematic`) | G-S1 |
| **S2 — one config + settings commit** | CONTROLS core P0 merged | P:C8 = A:core.4 = M:core.2/3/4: the §4 key set, settings (§7.4), events JSDoc (§7.1) · save migration (§6 save) | G-S2 |
| **S3 — camera core + footprint economy** | CONTROLS camera P1 and world fog P1 merged; S2 | M:camera.1–2 (rigid follow, SafeFrame wired, anchor, footprint, frustum/frameId, far X12) = P:K1, K2 · P:K4, K5 · M:ui.1 (`screenOccluders`) · world shadow **stage 1** (M:world.1 / P:W10s1) · P:W5, W6 (grass tile + ART look) · P:C7, C9, C10, C12, C14 · A:world.1 (Env tokens, presets, `ENV_U`, sunAz, exposure) · M:player.4/5 (`groundY`, interpolated pose check) | G-S3 + first idle-machine baseline (PERF §14.4) + AA A/B (X1) |
| **S4 — combat camera + character diet** | S3; CONTROLS player P2 (orders) for the lead; CONTROLS characters P3 merged for A:characters | M:camera.3–4 (lead, solver) · M:player.1–3, M:combat.1–2, M:enemies.1–2 · P:E4, M1, M2, P2–P4, B1 · A:characters.1–5 (toon materials, eyes, shells by `closeUp`, tufts, hulls, proportions) = P:H3 (rest), H4, H5, H6, H8 · A:camera.1–2 (`closeUp`, `setCinematic` calls) · A:player.1–2 | G-S4 (I2 budgets) |
| **S5 — warm world + end-state shadows + beats** | S4 | A:world.2–7 = P:W8, W9 (Lambert + lamps), W10 stage 2 + P:F3 blobs + P:E6, M3, B2 · A:enemies.1–4 + P:E5 · A:fx.2–4 · A:companions.1–2 · P:F4, F6, F7, S4t, S5t, L2 · M:camera.5 (aim pan, boss, beats, hand-back pre-solve) + M:fx.1, M:audio.1, M:enemies.3–4, M:companions.1–2, M:characters.1–2, M:world.4–5 | G-S5 |
| **S6 — comfort, UI, boot** | S5 for beats; `index.html` free (rework merged) | M:camera.6–7, M:ui.2–4, M:story.1–2, M:save.1 · A:ui.2, A:audio, A:story · P:C15, C16, I1–I4, L1, U3 (manifest), S1t, S2t, V1 | G-S6 |
| **S7 — bakes + downloads (PERF wave D)** | S6 | P:H7 → E7 (enemies first) → L3 (hero, kittens), C17, C18, W11, W12, U3 (decode), E8, S3t | G-S7 = End budgets |

### 3.2 Hard dependencies (do not reorder)
1. **F5 before C6**: glow must read at bloom 0 before bloom leaves play.
2. **C11 with C6**: the context needs `antialias: true` before direct-to-canvas, or Med plays un-antialiased.
3. **C8 is the only config commit**; areas read new keys with fallbacks until it lands.
4. **Footprint (M:camera.2) before** shadow stage 1, grass tile, far plane, mist ring.
5. **`activityOf` (P:K1) before** P:E4, M1, A:characters `setActivity`.
6. **SafeFrame wired + `screenOccluders` before** `onScreen` changes enemy behaviour (rat_xbow under the ⚔ button).
7. **ART restyle (S6) after SafeFrame fixtures exist (S3)**, and it may not change geometry (X22).
8. **`ENV_U` + `withHeightFog` (`hfog3`) before** removing any PointLight (W8, F6, S5t, L2 land together).
9. **Shadow stage 2 only after** blobs (F3) and actor `castShadow = false` (E6, M3, B2, characters) land in one train.
10. **H7 bakes after** the controls rework and S4 characters work (hero last, after enemies).
11. Timing thresholds only after the S3 baseline; until then every ms gate is report-only.

### 3.3 Files to wait for (the rework touches them now)
`src/core/{Game,GameState,Input,config,events}.js`, `src/camera/FollowCamera.js`, `src/characters/{Bow,Readability,
Sword,materials}.js`, `src/companions/**` (several files), `src/save/SaveManager.js`, `index.html`, `tests/smoke/*`,
`tests/unit/{characters,companions}.test.js`. S0 never edits them; S1's `Game.js` lines go through the core owner.

---

## 4. Merged config keys (core writes them once, in S2)

```js
// QUALITY (PERF §2 is the full literal; summary)
//              maxDpr dynRes.min aa       cinematic shadows shadowMap vertexAO furShellsIso furShellsClose charTufts outline                   grassTufts groundMist particles programs
// low          1.25   0.6        canvas   false     'none'  0         'height' 0            8              false     'hero'                    1300       4          300       30
// med          1.25   0.7        canvas*  false     'sun'   1024      'none'   0            16             true      'heroCompanionsEngaged'   4000       8          1500      40→30
// high         1.5    0.8        canvas   true      'sun'   2048      'none'   0 | 4 (S2)   16             true      'all'                     8000       8          2000      36 (+36 cinematic)
// * RENDER.medAA = 'canvas' | 'fxaa' (build-time, X1 A/B)
LOOP   = { step: 1/60, maxSteps: 4, maxStepsLow: 3, maxFrameDt: 0.1 };
RENDER = { exposure: 1.0, toneMapping: 'neutral', medAA: 'canvas', toon: { band: [0, 0.07], step: [0.42, 0.50, 0.86], shadow: [0.38, 0.62], sat: 1.12 } };
CAMERA.iso = { ...CONTROLS §13, ...AUTOCAM §12 };   // AUTOCAM wins on overlap; retired keys keep read fallbacks
```
Retired (read with fallbacks until no reader remains): `QUALITY.*.composer, msaa, bloom, furShells, kittenShells,
grass, minDpr, shadows (bool)`, `RENDER.vignette`, `CAMERA.iso.followDamp, followDampY, lead.vel/velMax/damp/up,
combat.inner/outDamp/biasMax, boss.herInner, frameOffset, frameOffsetPortrait, far (→ foot.far)`, `shadowHalf*`
(fallback only), `FUR_LOD_ISO.heroLens` (→ 0).

---

## 5. Merged budgets (iso play, `renderer.info`; counts binding; ms targets until PERF §14.4)

`__GAME__.perf().stage` reports which column a build is in.

| Budget | Low (phone) | Med (Iris Xe D3D11 1080p) | High |
|---|---|---|---|
| Frame draw calls incl. shadow, **I1** (now → S3) | ≤ 70 | ≤ 120 | ≤ 150 |
| Frame draw calls incl. shadow, **I2** (S4–S5) | ≤ 60 | ≤ 90 | ≤ 110 |
| Scene draw calls, **End** (S7); shadow 0 on ≥ 95 % of frames | ≤ 40 | ≤ 60 | ≤ 90 |
| … boss fights | +15 | +15 | +15 |
| Triangles (End) | ≤ 80k | ≤ 150k | ≤ 260k |
| Post passes in play | 0 | 0 (1 with the FXAA fallback) | 0 |
| Programs per level (play) | ≤ 30 | ≤ 40 (I1–I2), ≤ 30 (End) | ≤ 36 + ≤ 36 cinematic |
| Programs compiled during play / re-resolves per frame | 0 / 0 | 0 / 0 | 0 / 0 |
| Hero draws / tris | ≤ 8 → End ≤ 5 / ≤ 16k | ≤ 9 → End ≤ 6 / ≤ 16k | as Med |
| Common enemy / boss draws | ≤ 2 / ≤ 7 | ≤ 3 (hull if engaged) / ≤ 7 | ≤ 3 / ≤ 7 |
| Frame p50 / p99 | 16.7 / 25 ms | 16.7 / 25 ms | ≤ 16.7 / 25 ms |
| GPU (target) | real phone TBD | ≤ 9 ms at s = 1 | ≤ 7 ms |
| Main-thread CPU total (target) | ≤ 3.5 ms (≤ 14 ms at 4× proxy) | ≤ 6 ms | ≤ 6 ms |
| Camera rig + solver p99 (target) | ≤ 0.15 ms | ≤ 0.08 ms | ≤ 0.08 ms |
| Allocation | ≤ 32 KB/frame; game code ≤ 512 KB/s; camera ≤ 4 KB/s | same | same |
| Spawn of a full wave | worst frame ≤ 1.5 × median | same | same |
| T_paint / T_title (private build, cold) | ≤ 0.8 s / ≤ 5 s | ≤ 0.3 s / ≤ 2 s (desktop) | same as Med |
| Shadow map | none (blobs + vertex AO) | 1024 | 2048 |

---

## 6. Merged per-area task list

IDs: `P:` = PERF §15 task ID, `A:<area>.<n>` = ART §12 item, `M:<area>.<n>` = AUTOCAM §13 item. "Gate" names the
check that closes it (§8). Every task keeps `slice:meadow` and `flow:*` green.

### core (port 5301)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | `__GAME__.perf()` (+ `stage`, `texMB`), `?perf` overlay, marks, `perfCat` | P:C1 | used by all |
| S0 | `tests/smoke/perf.mjs` (all PERF §14.2 blocks incl. `perf:dynres-step`, `perf:composer`) + `tests/smoke/art.mjs` (`art:toon` G1–G19) | P:C2, A:core.7 | — |
| S0 | `prewarm()` (X37), `depthFor()`, Actor scratch fields | P:C4, C5, C13 | `perf:no-compile`, `perf:reresolve`, `perf:alloc` |
| S0 | `math.js` `smoothDamp` / `smoothDamp2` + unit | M:core.1 | AUTOCAM 11.1-1 |
| S0 | `core/toon.js` + unit (fallback constants until S2) | A:core.2 | ART §11.3 |
| S1 | One `Game.js` commit: `checkShaderErrors` prod-off, Neutral, `antialias: true` all tiers, `installToon()`, background from Env | P:C3, C11, A:core.1 | ART G12, S1 |
| S1 | Direct-to-canvas play; High-only PostChain cinematic; `setCinematic`; vignette pass removed | P:C6, A:core.3 | ART G13, `perf:composer`, PERF S1/S3 |
| S2 | Config merge (§4), settings defaults (§7.4, OS-derived `reduceCameraMotion` / `reduceFlashes`), events JSDoc (§7.1) | P:C8, A:core.4, M:core.2–4 | contracts tests |
| S2 | debug hooks: `cam.probe()`, `cam.framing()`, `art.*` hooks, `perf.setScale`, `uViewport` export | M:core.5, A:core.6 | used by gates |
| S3 | Dynamic res (`setPixelRatio`), pacing, thermal ladder; loop caps; scheduler; skinned culling; input polling | P:C7, C9, C10, C12, C14 | `perf:dynres-step`, `perf:steps`, PERF S8 |
| S6 | Warm splash (Fredoka-only preload), title-first boot | P:C15, C16 | PERF S7, `perf:boot` |
| S7 | Bundle guard, GLB pipeline + manifest tiers | P:C17, C18 | `build`, `test:unit` |

### camera (port 5312)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | Pure `SafeFrame.js`, `framing/FramingSolver.js`, `Subjects.js`, `beats.js` + node tests (not wired) | M:camera.2/4/5 (pure parts) | AUTOCAM 11.1-3/4/7 |
| S3 | IsoRig rigid follow, ground-Y spring, composition + `herFrame` clamp, ranges (portrait [16, 26]), `footprint()`, `groundAxes()` | M:camera.1 | `camera:steady`, `camera:safe-frame-*` |
| S3 | `applyAnchor`, `onScreen` = SafeFrame-visible, `cam.safeFrame`, `frustum` + `frameId`, `inView` + `activityOf`, projection dirty flag, far X12, `closeUp` flag | M:camera.2, P:K1, K2 | `camera:footprint`, unit |
| S3 | Picker DDA; Occluders 20 Hz capsules (X30) | P:K4, K5 | budgets (report) |
| S4 | Lead from `moveIntent`, snuggle, bias; solver + subjects + hysteresis + reduce-motion discrete mode | M:camera.3–4 | `camera:lead-down`, `camera:teamfight`, `camera:frame-threat`, `camera:threat-visibility`, `camera:rates` |
| S4 | `view.setCloseUp`, `postfx.setCinematic` calls (not Meme Cam) | A:camera.1–2 | ART G13 |
| S5 | Aim pan, boss table, beats, `blendPoseIso`, hand-back pre-solve, Meme freeze | M:camera.5 | `camera:beats`, `camera:boss-two-shot`, `camera:handback` |
| S6 | Pinch rubber band, reduce-motion paths, touch shake rotation 0; `camLockMode` semi / free | M:camera.6–7 | `camera:pinch`, `camera:reduce-motion`, `camera:rotate` |

### world (port 5318)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | Material de-share by kind, cast-flag trim, prewarm set | P:W1, W2 | `perf:reresolve`, `perf:no-compile` |
| S3 | Env: `TONE`, `ENV_U` (+ glow / lamps), §2.5 presets (`shadowI`, `exposure`, `rim`, `hero`→glow), `hub_hush`, sunAz from level yaw, background = fogColor | A:world.1 | ART G1–G4, G7 |
| S3 | Shadow stage 1 from `cam.footprint` (world owns the box, X20) | M:world.1, P:W10 (s1) | `camera:footprint`, ≤ 15 shadow draws |
| S3 | Fog-radius cull (replaces all `maxDist`); grass single tile + ART look; skyline audit + `farKeep`; mist ring from footprint | P:W5, W6, M:world.2–4, A:world.5 | PERF S9, S10, `perf:draws` |
| S3 | Parallel level load, static matrices, flames / pickups instancing | P:W3, W4, W7 | budgets |
| S5 | Lambert + global patch everywhere; `withHeightFog` → `hfog3` with lamps / glow; remove heroLight + LightPool | P:W9, W8, A:world.4 | ART G1–G6, PERF S13, `perf:programs` |
| S5 | Shadow stage 2: `StaticShadow.js` cached box, Low vertex AO | P:W10 (s2), A:world.2 | `perf:shadow`, PERF S4/S11, AUTOCAM §11.3 |
| S5 | Grounds, grass/flower colours, stone tints, water, bevels, ×1.25 interactables, 0.06 m rule, merged props, light pools, mist cap / Low 4 quads | A:world.3, 6, 7 | ART S1/S2, G19, `physics:nav` |
| S5 | `arena:lock {center, r}`, first wave ≥ 1.2 s after lock; perf before/after | M:world.5 | AUTOCAM §11.3 |
| S7 | `Env.set` reuse, manifest tiers / prefetch | P:W11, W12 | boot profile, `test:unit` |

### characters (port 5313)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | Cape grid normals + LOD (`Cape.js`), `E()` scratch (`KittenBuilder.js`) | P:H1, H2 | `perf:alloc`, cape ≤ 0.25 ms |
| S4 | Per-kind materials + depth; toon / metal / eyes materials (`sc-toon-v2` + `hfog3`); shells by `closeUp`, idle-built; tuft cards; hulls (X9); proportions, play LOD, `Squash`, glance, `debugFeatures`; beast heads; Plate fonts; `setActivity(tier)` | P:H3, H4, H5, H6, H8, A:characters.1–7, M:characters.1 | ART G10, G11, G14, G16, G18, S3; PERF S2, S5, S6 |
| S5 | Hug pose (Cosy twin) | M:characters.2 | `camera:beats` |
| S7 | `bakeSkinned`: enemies first, then hero (eyes separate) / kittens | P:H7 | PERF S12, End budgets |

### player (port 5314)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S3 | `groundY`; interpolated render pose check | M:player.4–5 | `camera:steady` |
| S4 | `moveIntent`, `orders.lookAhead`, `aim.range`; `Squash` events, head lag, face pitch, glance; glow hooks only | M:player.1–3, A:player.1–2 | AUTOCAM 11.1-2, ART G16 |
| S5 | `ENV_U.uGlow` position; blob registration | P:L2 | PERF S13 |
| S6 / S7 | Hero build after the title; consume the baked hero | P:L1, L3 | `perf:boot`, S12 |

### enemies (port 5316)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | VisualPool, prewarm set, per-kind materials | P:E1, E2, E3 | `perf:spawn`, `perf:no-compile` |
| S4 | Orbit penalty; `onscreen.js` reuse `cam.frustum`, keep `onScreen`; sub-rates + mixer tiers | M:enemies.1–2, P:E4 | `camera:threat-visibility`, `perf:alloc` |
| S5 | Palette remap, toon pools via VisualPool (X28), `uFlash`, `uHighlight`, hulls per tier, §7.2 looks, faint-and-poof; lazy types; `castShadow=false` + blobs; boss radius / height / lane ends | A:enemies.1–4, P:E5, E6, M:enemies.3–4 | ART G15, G18, S4, S5; `perf:shadow`; `enemies:*` |
| S7 | Bake per template, clip libraries; boss scratch | P:E7, E8 | S12, `perf:alloc` |

### companions (port 5317)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S4 | NPC kitten bands; think 10 Hz; scratch | P:M1, M2 | hub CPU ≤ 0.4 ms (report) |
| S5 | Kitten / villager configs, tufts, hulls, glance; `kitten:rescued {position}`; kitten hop; activity tiers; aimed abilities set `aim.range`; blobs | A:companions.1–2, M:companions.1–2, P:M3 | ART S9, `camera:beats` |

### fx (port 5319)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | Glow at bloom 0 (before S1); prewarm pools; doubled fx variants | A:fx.1 = P:F5, P:F1, F2 | ART S6 |
| S5 | `BlobShadows.js`; `GroundDecals.js`; Holy → `uGlow`; MistCards scratch; Poof + confetti + rescue burst; §8.4 replacements; ScreenFX → `#ui-flash`; beat twins (X24); `?debug` footprint overlay | P:F3, F4, F6, F7, A:fx.2–4, M:fx.1–2 | PERF S4, ART S9, `perf:draws` |
| S6 | Butterflies, ambient profiles, cloud shadows (+2 draws) | A:fx.5 | budgets |

### ui (port 5322)
| Stage | Task | IDs | Gate |
|---|---|---|---|
| S0 | `#ui-vignette`, `#ui-flash` (+ `ui.flash`, `reduceFlashes`) | A:ui.1 | ART S1 |
| S3 | `screenOccluders()` with X22 exclusions; safe-area probe; live thumb state | M:ui.1 | AUTOCAM 11.1-7 |
| S6 | Threat arrows on the SafeFrame border; pinch recognition; settings rows; splash hand-off; fonts; HUD diffing + CSS cooldown sweeps (X21); quality panel; candy restyle (skin only) | M:ui.2–4, P:I1–I4, A:ui.2 | ART S7, G17; PERF §10.5 budget; `ui:*` |

### audio (port 5320), story (port 5321), physics (port 5311), combat (port 5315), save (port 5323)
| Stage | Area | Task | IDs | Gate |
|---|---|---|---|---|
| S0 | audio | zzfx / pink-noise bake before unlock; listener 20 Hz | P:U1, U2 | `perf:audio-unlock` |
| S5 | audio | Beat twins (glock + purr, room-read sting) | M:audio.1 | `camera:beats` |
| S6 | audio | §9.3 replace list, glock, mix; lazy decode, streamed music | A:audio, P:U3 | ART S2 (listen), heap at T_title |
| S5 | story | Cutscene PointLights → `uLamps` slot 0; close-ups use `closeUp` | P:S5t, S4t | `perf:no-compile`, PERF S13 |
| S6 | story | Camera strings (`toast.cam.fitHold`, settings labels); hand-back verification (CS-04, CS-08, CS-10); "Morning Practice", `hub_hush`, ending `setCinematic`, fonts; lazy cutscenes, CS-00 waits on `playReady` | M:story.1–2, A:story, P:S1t, S2t | `camera:handback`, S7 |
| S0 / S3 | physics | `separateActors` hash; zero-alloc A*, nav worker, static queries; review `groundY` | P:P1–P4, M:physics.1 | `perf:alloc`, `physics:nav` |
| S5 | physics | Re-run nav after ×1.25 interactables / bevels; flag corridors < 1.6 m | A:physics.1 | `physics:nav` |
| S4 | combat | `tokens.holdersInto`; telegraph `targetsPlayer / activeAt / windup` + lane ends; alloc-free `assistTarget`; projectiles no shadow | M:combat.1–2, A:combat.1, P:B1, B2 | AUTOCAM unit, `perf:alloc` |
| S2 | save | Migrate all new settings (§7.4); `camLock` → `camLockMode`; ranges | M:save.1, A:save.1, P:V1 | save unit test |

---

## 7. Contract changes

### 7.1 Events (additive JSDoc; core `events.js`, S2)
`kitten:rescued { kittenId, position }` (companions fill `position`; ART burst + Cosy beat) · `arena:lock { id, center,
r }` (world) · `combat:telegraph` guaranteed `targetsPlayer, activeAt, windup` + lane end points for `lane` / `line`.

### 7.2 New context surface (additive)
| Owner | Surface |
|---|---|
| camera | `cam.footprint {q, cx, cz, ahead, behind, halfW, halfWTop, slantMax, d, version}`, `inFootprint(x, z, pad)`, `frustum`, `frameId`, `inView(p, r)`, `activityOf(actor)`, `onScreen(p, margin)` (SafeFrame-visible), `safeFrame`, `groundAxes(outU, outR)`, `closeUp`, `probe()`, `framing()` |
| player | `moveIntent {x, z, speed, kind}`, `groundY`, `orders.lookAhead(d, out)`, `aim.range` |
| combat | `tokens.holdersInto(kind, out)` |
| ui | `screenOccluders() → {version, rects}`, live thumb state, `ui.flash(color, alpha, dur)` |
| world | `TONE`, `ENV_U` (rim, glow, lamps), `withHeightFog` (`hfog3`), `farKeep` tags, `art.shadowProbe`, `StaticShadow` |
| characters | `makeToonMaterial`, `getToonMaterial`, `makeMetalMaterial`, `softRamp`, `toonLib`, `setCloseUp`, `setActivity(tier)`, `debugFeatures()`, `buildOutline`, `Squash` |
| fx | `fx.blobs.add(object3d, r)` / `remove`, `GroundDecals`, `SHAPE.CONFETTI` |
| core | `perf()`, `prewarm()`, `depthFor()`, `every()`, `smoothDamp(2)`, `installToon()`, `postfx.setCinematic(on, opts)`, shared `uViewport` |

### 7.3 Contracts that change (approved here)
| # | Change | Affected |
|---|---|---|
| K1 | Play renders straight to the canvas on every tier; `postfx.setBloom` / `setVignette` are no-ops in play; `RENDER.vignette` removed; ACES → Neutral; `scene.background` set by Env | core, fx, story, ui, player |
| K2 | No PointLights anywhere in the game scene; HERO_LIGHT, LightPool, HolyFX / Lanterns lights and cutscene lights become `ENV_U` uniforms | world, fx, story, characters |
| K3 | `QUALITY` keys per §4 (shells semantics, `shadows` string, new keys); Low has no shadow map | every reader of QUALITY |
| K4 | `cam.onScreen` = SafeFrame-visible (gameplay); perf code must use `inView` / `activityOf` | enemies, fx, ui, companions |
| K5 | Actors stop casting sun shadows at shadow stage 2; blobs via `fx.blobs` | characters, enemies, companions, combat |
| K6 | World `MeshStandardMaterial` → Lambert; actors → `sc-toon` / `sc-metal` / Basic eyes; no Physical in play | world, characters, enemies |
| K7 | `settings.camLock` → `camLockMode` | camera, ui, save |
| K8 | CONTROLS §13 camera keys retired per §4; far plane per X12 | camera, world |
| K9 | Fonts: Fredoka only; Uncial / MedievalSharp / Cinzel files deleted | ui, story, characters (Plate) |
| K10 | `characters.setOffscreen` (draft) never ships; `setActivity(tier)` instead | characters, enemies, companions |

### 7.4 Settings (one list; save migrates, schema stays v1)
From CONTROLS §10.7 (unchanged except `camLock`) + AUTOCAM: `reduceCameraMotion` (OS), `camCursorLead` 0,
`camLockMode 'locked'`, `camZoomPortrait` 1.0, `biggerHero` false + ART: `reduceFlashes` (OS) + PERF: `quality`
('auto'), `fpsCap` ('auto'), `batterySaver` false.

---

## 8. Acceptance gates

### 8.1 Stage exit gates (all items must pass; "report" = recorded, not failing)
| Gate | Must pass |
|---|---|
| **G-S0** | `perf:spawn`, `perf:audio-unlock`, `perf:reresolve` (0), `perf:programs` ≤ I1; AUTOCAM unit 11.1-1/3/4/7 on the pure modules; ART `contracts` toon unit; ART S6 (glow reads without bloom) |
| **G-S1** | ART G12, G13 (per tier), `perf:composer`, `perf:no-compile`; PERF S1 (Med vs Low same warm look, no jaggies), S3 (no banding); Med frame calls ≤ I1; `slice:meadow`, `flow:*` |
| **G-S2** | contracts tests for every §4 key, settings migration unit, events JSDoc present |
| **G-S3** | `camera:iso-frame`, `camera:steady`, `camera:safe-frame-land/-port`, `camera:footprint`, `camera:rotate`; `perf:dynres-step`, `perf:steps`; stage-1 shadow ≤ 15 draws; ART G1–G4, G7; PERF S9, S10; **idle-machine baseline + AA A/B recorded** (sets `RENDER.medAA` and timing thresholds per PERF §14.4) |
| **G-S4** | `camera:lead-down`, `camera:teamfight`, `camera:frame-threat`, `camera:threat-visibility`, `camera:rates`, `camera:no-hands`; ART G10, G11, G14, G16, G18, S3; PERF S2, S5, S6; frame calls ≤ **I2** |
| **G-S5** | `perf:shadow` (≥ 95 % zero), `perf:programs` Med ≤ 30, `perf:no-compile` (incl. forest day → night and a lantern), ART G1–G9, G15, G19, S1, S2, S4, S5, S8, S9; PERF S4, S11, S13; `camera:beats`, `camera:boss-two-shot`, `camera:handback`; AUTOCAM §11.3 before/after |
| **G-S6** | `camera:pinch`, `camera:reduce-motion`; ART G17, S7; PERF S7, `perf:boot` (report → gate after baseline); `ui:*` and settings smoke |
| **G-S7** | PERF §14.3 End table (`perf:draws`), §5 End column, S12, `build` (bundle budgets), `test:unit` (manifest tiers), real-phone soak (PERF §14.1.5) before Low thresholds freeze |

### 8.2 Measurement rules (fix for every unmeasurable criterion found)
- **Counts** (draws, tris, programs, re-resolves, pool misses, steps) gate on any machine, any GPU flag.
- **Timings** gate only under PERF §14.1 and after §14.4 sets them (`min(budget, baseline × 1.15)`); before that
  they print `REPORT`. A failed calibration prints `INVALID` (never pass, never fail).
- **Allocation** via CDP heap sampling (`perf:alloc`), never `performance.memory`.
- **Look gates** are numeric where possible (ART G1–G19 via `__GAME__.art.*`); every screenshot gate (ART S1–S9,
  PERF S1–S13, AUTOCAM §11.4) is a list of yes/no questions answered by a reviewer who Reads the images; one "no"
  fails it.
- **Camera jitter / rates** from the AUTOCAM probe trace (frames with dt > 2 × median excluded and reported).
- Pixel sizes in CSS px at `deviceScaleFactor` 1 unless the gate says device px.
- T_paint = first-contentful-paint; T_title / T_play = `performance.mark`s; texture memory = `perf().texMB`.

### 8.3 What the user should see when it is done (the brief, as checks)
- **Warm, not 90s:** ART G1–G5 (bright, colourful, warm, few dark pixels, no black), G8 (she pops), S1/S2/S9 yes;
  no Cinzel / chiptune / glitch cues (G17, ART §9.3); first frame is the warm splash (PERF S7); always anti-aliased,
  never below render scale 0.6 (PERF §6.4).
- **Extraordinary performance:** End budgets (§5), 0 compiles and 0 re-resolves in play, no spawn / audio hitch,
  T_title ≤ 2 s desktop, 60 fps on Iris Xe Med at s ≥ 0.85 and on a mid phone (soak).
- **Maximum MOBA auto-camera:** the touch tutorial completes with zero camera input (`camera:no-hands`); engaged foes
  visible ≥ 97 % desktop / 98 % phone / 92 % portrait or arrowed (`camera:threat-visibility`); no overshoot, no
  self-rotation, rates capped (`camera:rates`); she never leaves `herFrame` (`camera:safe-frame-*`).

---

## 9. Risks and open items (owners decide; defaults apply)
1. **Canvas MSAA on Iris Xe D3D11** may cost more than expected at 1080p × 1.25; the X1 A/B decides Med's AA once.
2. **`setPixelRatio` steps** may hitch on some drivers (MSAA buffer realloc); `perf:dynres-step` catches it; fallback
   is a 4 s minimum step interval.
3. **High cinematic variants** double High's programs; if prewarm exceeds PERF §1.3's 600 ms, warm them in a second
   veil-time batch while the level title card shows.
4. **Real phone GPU** is unmeasured (tile overdraw: mist, decals, tufts, blobs). The soak runs before Low freezes.
5. **Removing PointLights** changes night scenes; PERF S13 compares lamp pools with today's look.
6. **Rigid follow (AUTOCAM D1)** depends on an interpolated render pose in every state; λ12 fallback per state.
7. **keep_storm / bog densities** are computed, not yet seen; `world:fog-audit` and ART S2 confirm when M3 builds them.
8. **Controls rework drift:** if it lands names that differ from CONTROLS §15, this plan's §7 adapts in the S2 commit.
