# SWORDCAT: warm cartoon art and render spec, the FINAL binding version

Author: lead art, 2026-10-11. Status: **binding**. It merges `research/next/art_0.md` (light, toon and pipeline), `art_1.md`
(characters and creatures) and `art_2.md` (world mood, UI, FX and audio) as amended by two judge verdicts. The drafts
are now background only. Where this file disagrees with `research/art.md` §0, §1, §2.1, §2.5, §3, §4.1–4.2, §6.2,
§9.1–9.2, §10.1, §11, §12 and §15, with GAME_DESIGN §17 or §18.3, or with `research/tech.md` §18, **this file wins**.
§13 lists the text edits that the doc owner makes. Where it disagrees with `research/CONTROLS_SPEC.md`, this file wins
on **look and render cost** only (§2.8 fur line, §4.2 bog/keep densities, §16.6 budget). Camera behaviour, fog
*mechanics* and framing stay with CONTROLS_SPEC.

User request: *"make sure that we follow warm cartoonish kind of thematics so that everyone will feel great inside,
not 90s kind of nostalgic game. while performance must be extraordinary. and create maximum moba-like automatic
camera control as well."*

Precedence with the perf work (`research/next/perf_*.md`): this file owns **what the frame looks like** and the art
budgets (§10). If a later binding PERF spec sets a stricter number or a different *mechanism* for the same goal (for
example the AA method or the shadow update rate), the PERF spec wins on the mechanism, and the look gates in §11 must
still pass.

Evidence rule: draw calls and triangle counts in the drafts are exact (`renderer.info`). Every **ms** figure in the
drafts came from a GPU shared with other agents' servers, so no ms number in this file is a gate until it is re-measured
on a quiet machine (§11.4).

**Cross-spec reconciliation (2026-10-11, binding):** this file was cross-checked against `PERF_SPEC.md`,
`AUTOCAM_SPEC.md` and `research/CONTROLS_SPEC.md`. The decisions are numbered **X1–X37** in
`research/next/IMPLEMENTATION_PLAN.md` §2; §1R below lists the ones that change this file, and the sections they touch
are edited in place (marked `[X#]`). The merged task order, contracts and gates are in IMPLEMENTATION_PLAN.

---

## 0. The design in one paragraph

**A sunny picture-book island seen from a MOBA camera.** A warm key sun, a cool lavender sky fill, so shadows are
coloured and **never black**, a warm ground bounce, and a cream haze that is also the clear colour. Two-band **toon
lighting** with a soft terminator and **crisp cel shadows** reaches every world material through **one global
`ShaderChunk` patch** (0 draws). Characters and enemies share **three programs** (toon-skinned, matcap metal, unlit
eyes). `NeutralToneMapping` keeps the authored hexes as authored. In play the frame is rendered **straight to the
canvas**: native AA, tone mapping in the materials, a CSS vignette, **no EffectComposer**. Bloom exists only in
cutscenes and the ending on the High tier, at half resolution. The hero loses her fur shells in play (they are sub-pixel at
13 m) and gains silhouette tufts, a warm rim, bigger eyes and a bow that reads from above: she goes from **31 draws /
~200k tris to ≤ 9 / ≤ 16k** (≤ 6 draws after the bake). Enemies become **cute-menacing** (plum and slate, a top colour for iso ID, "faint and
poof" defeats). Fonts, music and SFX lose their 90s cues. Every claim is gated by an automated `art:toon` smoke block.

---

## 1. Resolved conflicts (binding decisions)

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | Tone mapping | `THREE.NeutralToneMapping`, exposure per preset (1.0 default) | All 3 drafts agree; ACES hue-shifts and greys the palette; 0 cost |
| D2 | Post in play | **Direct to canvas** on every tier. No composer, no OutputPass, no Vignette pass, no WarmGrade pass in play | The HalfFloat MSAA composer is the single largest GPU cost measured (perf_0 H1, art_0 §10.1) |
| D3 | Bloom | **[X2]** Lazy composer, half-res bloom, **High tier only**, **only** in cutscenes and the ending (not the title, not Meme Cam, never gameplay). Med and Low cutscenes use the play path + glow cards + exposure. Holy charge and Golden Hour glow through sprites, the aura hull and exposure, with no bloom | `toneMapping` is part of three's program cache key, so a render target doubles every program. Limiting it to High keeps Low/Med at one variant; on High the variants are prewarmed under the level veil (§3.3) |
| D4 | Grade | No screen-space grade. Saturation 1.12 is baked into lit materials (`toonGrade`), per-level mood lives in the preset colours and `exposure` | art_2's WarmGrade keeps a full-screen pass every frame (rejected) |
| D5 | World shading | Global chunk patch (art_0 §4.2) on Lambert, Phong, Standard, Physical and `lights:true` ShaderMaterials. World Standard → Lambert | 0 draws, +3 programs, keeps every `onBeforeCompile` patch |
| D6 | Character shading | `MeshToonMaterial` program (art_1 §3.2) for fur, cloth, skin and enemies; `MeshMatcapMaterial` for metal; `MeshBasicMaterial` for eyes | One shared program family, no PMREM; MeshToon's `RE_Direct_Toon` is not touched by the D5 string replace (verify once, §11.3 G12) |
| D7 | Shadow colour and rim | **One token set owned by `world/Env.js`**: shadow colour = the preset's `hemiSky` (cool lavender), delivered by the HemisphereLight to world **and** actors alike; rim = `env.rim` (warm `#FFE6B8` day, `#FFD08A` night). art_1's plum `uShadeTint` is dropped | Actors then match the ground they stand on; a warm rim separates the hero from cool enemies |
| D8 | Fur in play | **[X8]** **0 shells in play on Low and Med.** High may show 4 iso shells only if PERF §13 S2 judges 4 fluffier than 0 (else 0). Soft Fur shading + skinned tuft cards (Med/High). Close-up shells (camera `cam.closeUp`: lens < 6.0 m on, > 6.3 m off) Low 8, Med 16, High 16 | Shells are 1.7–4.3 px deep at iso distance: ~105k tris of shimmer. Overrides CONTROLS_SPEC §2.8 "hero shells full within 25 m" and `FUR_LOD_ISO.heroLens` |
| D9 | Outlines | **[X9]** Inverted hull on **one merged proxy per actor** (`getSilhouetteProxy()`), coloured ink, never black. `QUALITY.outline`: Low `'hero'` (hero + boss); Med `'heroCompanionsEngaged'` (hero, boss, companions, ≤ 4 engaged enemies); High `'all'`. Thermal rung 3 (PERF §5.4) drops to hero + boss. Props get the 0-draw in-shader ink rim | Per-sub-mesh hulls measured +20 calls / +73k tris in town; one merged hull is 1 draw |
| D10 | Wind-up read | Enemy wind-up = the toon program's rim lerps to the telegraph colour (`uHighlight`, 0 draws, every tier); where an enemy has a hull (High), the hull lerps too | Works without hulls on Med/Low |
| D11 | Enemy palette | art_1 "mischief" tokens (plum, slate, mustard, teal, olive) + art_0's never-black rule | Includes the iso top colour |
| D12 | Steel | `#C9D0D8` tint through the warm matcap (art_1 §3.4) | One fetch, reads as bright toy armour |
| D13 | Fog density | **[X16]** CONTROLS_SPEC §4.2 densities **stay**; only colours change. Exceptions (M3 levels): `bog` 0.07 → **0.058** (f at 8 / 12 m = 0.058 / 0.24: inside the §4.2 targets), `keep_storm` 0.05 → **0.042** (0.036 gave f(12 m) = 0.117, below the 0.15 top-edge minimum; 0.042 gives 0.031 / 0.156). `world:fog-audit` confirms | Fog fraction is colour-independent, so the §4.2 framing targets still hold. art_0's ρ 0.018 rows are rejected (its own f-values do not follow from its formula) |
| D14 | Sad hub | `hub_hush` (lavender), `hub_grey` stays as an alias key | Story's `env:set hub_grey` cues keep working |
| D15 | Hero proportions | art_1 §2 targets, **gated** by a close-up + iso screenshot review (§11.2 S3). Blade length stays **0.85 H** (combat reads reach from it); blade width ×1.25, rounded tip, bigger guard are adopted | Knightly read and combat-visual reach need sign-off; width changes do not |
| D16 | Tufts animation | Tuft cards are **skinned** to the rig (rigid weight 1 to one bone) inside one `SkinnedMesh`: 0 CPU per frame | Rejects art_1's per-frame matrix writes |
| D17 | Hit flash | No per-hit material clones. Each enemy instance takes one material from a per-type pool at spawn (same `customProgramCacheKey`, 0 compiles), with its own `{uFlash, uHighlight}` | Replaces `Enemy.js:1303` emissive cloning |
| D18 | One art doc | This file. art.md and GAME_DESIGN §17 are amended to point here (§13) | Both art_0 and art_1 claimed the same sections |

### 1R. Cross-spec decisions that change this file (full text: IMPLEMENTATION_PLAN §2)
| X | Topic | Binding result for art |
|---|---|---|
| X1 | Play path | Direct to canvas on **every** tier, `antialias: true` at context creation (this file's D2 wins over PERF §6.1's Med/High uber pass). One measured fallback: if the core A/B shows canvas MSAA costs > 1.5 ms GPU more than an FXAA pass on Iris Xe D3D11 Med 1080p at an equal S1 judgement, Med alone renders to an RGBA8 RT + one FXAA pass (no bloom, no grade). |
| X2 | Bloom | D3 as amended: High only, cutscenes + ending, PERF's half-res dual-Kawase `PostChain` is the mechanism. |
| X3 | Grade, dither, vignette | `toonGrade` sat 1.12 in-material (no screen grade on any tier); `material.dithering = true` on lit world and `sc-*` materials on every tier; CSS `#ui-vignette` on every tier. PERF's `uShadowTint` and uber `uLift/uGain` are dropped (D7). |
| X4 | Pixels | `maxDpr` Low **1.25**, Med 1.25, High **1.5**; dynamic resolution = PERF §5.2 controller driving `setPixelRatio` on every tier (no RT, ≤ 1 change per 2 s). |
| X5 | Materials | World = Lambert + the §4.1 global toon patch (not PERF's world MeshToon). Actors = §5.1 `sc-toon-v2` (this **is** PERF's "WarmToon"), composed with world's `withHeightFog` (key `sc-toon-v2` + `hfog3` suffix). `ENV_U` gains PERF's `uGlow, uGlowCol, uLamps[4], uLampCol, uLampStr`, injected into every lit patched material by `withHeightFog`. |
| X6 | Lights | Hemi + sun only, in play **and** cutscenes. HERO_LIGHT, the Dressing LightPool, `HolyFX.light`, `Lanterns` lights and cutscene PointLights become `uGlow` / `uLamps`. The §2.5 `hero` column now scales the `uGlow` fill on her. |
| X7 | Shadows | §3.4 rewritten: Low none; Med **1024**, High 2048; stage 1 dynamic with trimmed casters, stage 2 statics-only cached map + actor blobs. Sun azimuth keyed to `level.cam.yaw`, never to zone hints. |
| X8–X10 | Fur, outlines, hero cost | D8, D9 as amended; hero ≤ 9 draws interim, **≤ 6** end state (body+bow, eyes, steel+sword, cape, tufts, hull); no shadow-proxy draw in the end state. |
| X11 | Grass | PERF §8.4 geometry and counts (6-tri tufts, grass + flowers in 1 draw, 1300 / 4000 / 8000) with this file's colours, blade width ×1.6 and up-bent normals (§8.2 amended). |
| X13 | Activity | Mixer and secondary-motion rates follow PERF §4.3 tiers (§7.4 amended). |
| X14 | Budgets | §10 replaced by the merged table (IMPLEMENTATION_PLAN §5). |
| X15 | Timing | No ms gate before PERF §14.4; the §10 "≤ 8 ms" target becomes PERF's ≤ 9 ms Med GPU. |
| X16 | Fog | D13 as amended (keep 0.042). |
| X17 | Title | No composer on the title on any tier; close-up programs compile after T_title in idle `compileAsync`. |
| X22 | UI geometry | The candy restyle (§9.1) changes skin only: touch cluster sizes/offsets (CONTROLS §9.2), ability-bar slot sizes (CONTROLS §10.1) and HUD strip heights stay exact, because AUTOCAM's SafeFrame fixtures and the touch tests depend on them. `#ui-vignette` / `#ui-flash` are `pointer-events:none` and are **not** screen occluders. |
| X23 | Events | `kitten:rescued` gains `position` (additive) for the §8.6 burst and AUTOCAM's Cosy two-shot. |
| X24 | Beat twins | The §8.6 rescue burst **is** AUTOCAM's Cosy-beat twin; Exhale uses `SHAPE.CONFETTI` petals; Peekaboo uses a `STAR4` burst. 0 new draws. |

---

## 2. Look rules and palette

### 2.1 Mood rule (replaces art.md §0 "Mood rule" and GAME_DESIGN §17 bullet 1)
> **The world is a sunny pastel picture book: warm haze, soft round shapes, candy accents. The heroine is still the
> most saturated, most contrasted thing on screen.** Shadows are tinted (lavender, teal, cocoa) and never black. Fog
> is a warm haze that frames the stage, never a grey wall. Every level is a time of day you would want to be outside
> in. Sad story beats use lavender and blue, never grey. No CRT, pixel, chiptune, parchment-grain or blackletter cues.

### 2.2 Value and chroma ladder (readability from 50° above)
1. **Ground** (70–90 % of iso pixels): L* 55–72, medium chroma, low hue noise.
2. **Props and foliage**: one value step lighter **or** darker than the ground under them, and a warmer hue.
3. **Enemies**: the cool mischief family (§2.6) with telegraph accents. Medium-high chroma.
4. **Hero and companions**: highest chroma (ginger, red cape, pink bow, gold), brightest highlight (matcap steel),
   warm rim, ink hull.
- No pink on enemies. No pink or orange ground props or flowers within 3 m of the path spine.

### 2.3 Hard numeric rules (all gated in §11)
- World pixels below **luma 0.06** (sRGB Rec.709) outside a 40 px box around actors (pupils, hulls): **< 0.5 %** of
  the 64×36 grid (G5; "none" was not measurable through AA edges).
- Sun-shadowed ground luma ≥ **0.45 ×** the adjacent lit ground.
- Haze (fogColor) HSV saturation ≥ **0.12** in every preset; never neutral grey.
- Frame targets per level (64×36 readback): mean luma **0.48–0.60** (night/keep ≥ 0.32), mean HSL chroma
  **0.16–0.26** (night/keep ≥ 0.12), warmth R−B **+0.06…+0.16** (bog ≥ −0.02; night/keep ≥ 0.0), dark pixels
  (luma < 0.2) **≤ 8 %** (night/keep ≤ 20 %).
- Hero chroma ≥ **1.3 ×** the ground's inside a 3 m disc (target 1.5).

### 2.4 Global tokens (`src/world/Env.js` exports `TONE`; world owns, everyone imports)
```js
export const TONE = Object.freeze({
  rimDay: '#FFE6B8', rimNight: '#FFD08A', rimHush: '#F6E6FF',  // character rim, written to env.rim by preset
  ink: '#4A2A1E',                    // hull base: warm dark brown, never black
  blob: '#5A4E7A', blobA: 0.35,      // contact shadow decal: violet
  telegraph: '#FF8A3D',              // wind-up rim/hull lerp target (combat colours stay as they are)
  sparkle: ['#FFF1C4', '#FFD57A'], holy: '#FFE3A3',
  lantern: '#FFC46B', fire: '#FF8A3D',
});
// Live shared uniform objects (Env writes .value on every preset change; materials hold the same object):
export const ENV_U = { uRim: { value: new THREE.Color() }, uRimK: { value: 0.38 }, uSunDirV: { value: new THREE.Vector3() },
  // [X5][X6] PERF §8.2 light replacements (no PointLights anywhere). player writes uGlow.xyz each frame; HolyFX writes
  // radius / colour through the holy ladder; world writes the 4 lamps nearest cam.focus at 4 Hz; uLampStr 0 by day.
  uGlow: { value: new THREE.Vector4(0, -999, 0, 3.5) }, uGlowCol: { value: new THREE.Color('#FFC46B') },
  uLamps: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uLampCol: { value: new THREE.Color(TONE.lantern) }, uLampStr: { value: 0 } };
```
- **Delivery [X5]:** world's existing `withHeightFog(mat)` hook (which already shares `HFOG` with every patched
  material) also assigns `ENV_U` and, in lit programs only (`#if defined( USE_LIGHTS ) || NUM_HEMI_LIGHTS > 0`
  guard, i.e. where `lights_pars_begin` is included), adds the glow and lamp terms before `opaque_fragment`, using the
  world position `vFogW` it already provides (no `inverse(viewMatrix)`):
  `outgoingLight += diffuseColor.rgb * (uGlowCol * g² * 0.6 + uLampCol * Σ l² * uLampStr)`, `g`, `l` =
  `1 − smoothstep(0, r, distance(vFogW, p))`. Its cache key suffix becomes `|hfog3` (constant). One hook, so world
  Lambert, `sc-toon`, grass and water all get warm lamp pools without a light-count change or a recompile.

### 2.5 `ENV_PRESETS` (drop-in colour/light rows for `Env.js:21–37`)
`fogDensity`, `fogFalloff`, `wind`, `sunAz` and `grade` keys keep their current values unless noted. New keys:
`shadowI` (→ `sun.shadow.intensity`), `exposure` (→ `renderer.toneMappingExposure`, eased with the preset), `rim`
(→ `ENV_U.uRim`), and `hero` (**[X6]** → strength of the `ENV_U.uGlow` fill that follows her; HERO_LIGHT is removed).
`env` (envMap intensity) drops to **0.25** everywhere: only High-tier cutscene close-up materials still sample an env
map (X2).

| preset | fogColor / fogLow | skyTop | hemiSky / hemiGround × hemi | sun colour × I, elev | shadowI | exposure | rim | hero |
|---|---|---|---|---|---|---|---|---|
| meadow_day | `#F6E4C0` / `#EED6A6` | `#8FCBF2` | `#C4D9FF` / `#C9A46A` ×1.30 | `#FFE7C2` ×2.4, 0.85 | 0.60 | 1.00 | day | 0.25 |
| meadow_evening | `#FFD4AA` / `#F4BE92` | `#A9A8E6` | `#B9B8F0` / `#D89A6A` ×1.20 | `#FFB878` ×2.5, 0.25 | 0.55 | 1.00 | `#FFD8A0` | 0.35 |
| meadow_night | `#4A5696` / `#465290` | `#26326E` | `#8FA4F0` / `#3A3466` ×1.10 | `#B8CCFF` ×0.9, 0.90 | 0.50 | 1.05 | night | 1 |
| forest_day | `#DCE8BE` / `#C6DA98` | `#9AD4E8` | `#B9D8F5` / `#8C7A4A` ×1.30 | `#FFE2A8` ×2.3, 0.90 | 0.60 | 1.00 | day | 0.25 |
| forest_night | `#3F4378` / `#3A4A6A` | `#252C66` | `#8E96DE` / `#2F4A40` ×1.15 | `#CFE0FF` ×0.8, 0.90 | 0.50 | 1.05 | night | 1 |
| town_occupied | `#F0DEC0` / `#E4CCA6` | `#86C6EE` | `#C8C8F0` / `#B08A62` ×1.20 | `#FFE0B4` ×2.3, 0.75 | 0.60 | 1.00 | day | 0.20 |
| hub_gold | `#FFE0B4` / `#F6CF9C` | `#9CC8F0` | `#CBD3FF` / `#D2A070` ×1.25 | `#FFD9A6` ×2.6, 0.45 | 0.60 | 1.00 | day | 0.20 |
| **hub_hush** (alias `hub_grey`) | `#C6C0E4` / `#B4ACD8` | `#8C96D6` | `#D0D4EE` / `#8E8A9A` ×1.30 | `#F2E2F0` ×1.3, 0.70 | 0.45 | 0.98 | hush | 0.60 |
| ending_gold | `#FFE8C8` / `#FFD8A8` | `#9CC8F0` | `#D0DCFF` / `#E0B080` ×1.30 | `#FFD9A6` ×2.8, 0.35 | 0.60 | 1.00 | day | 0.20 |
| gate_dusk | `#FFC09A` / `#F2A88A` | `#8C7ACB` | `#9C9AE0` / `#C07A5A` ×1.15 | `#FF9E5E` ×2.4, 0.25 | 0.55 | 1.00 | `#FFD8A0` | 0.35 |
| bog | `#A8E0D0` / `#86CDBB` | `#86CCE6` | `#A8E0E0` / `#6E7A4A` ×1.30 | `#F4F0C0` ×1.9, 0.75 | 0.55 | 1.00 | `#FFF0C6` | 0.35 |
| keep_storm | `#6E5480` / `#7A5A6A` | `#3E3270` | `#C2AEE2` / `#5A4048` ×1.45 | `#FFC488` ×0.9, 0.35 | 0.45 | 1.05 | night | 1 |
| keep_cellar | `#6A4A50` / `#5E4048` | `#3E3270` | `#E2B8A0` / `#4A3436` ×1.50 | off (0) | — | 1.05 | night | 1 |
| sky_night | `#4A5498` / `#4A5498` | `#24306E` | `#A8B4F0` / `#2A2E52` ×1.05 | `#D6E2FF` ×0.9, 0.80 | 0.50 | 1.05 | night | 1 |
| sky_sunrise | `#FFE2C0` / `#FFE2C0` | `#9CCBF0` | `#D0DCFF` / `#E0B080` ×1.25 | `#FFD49A` ×2.5, 0.25 | 0.60 | 1.00 | day | 0.20 |

- **Sun azimuth in iso:** `sunAz = level.cam.yaw + 1.75` rad (≈ 100°, key from screen-left, shadows fall down-right
  across the screen; CONTROLS_SPEC §4.2 asks for 60–120°). Night rows use `+1.20`. Cutscenes and `?cam=classic` keep
  the preset's absolute `sunAz`. **[X7]** It uses the level's default `cam.yaw`, **never** a zone-hint yaw: a hint
  blend must not move the sun (that would re-render the cached shadow map every frame of the blend). Within a level
  the iso sun only changes with a preset tween.
- **`scene.background` = current `fogColor`** on every preset change (`Game.js:108` `#B7C0C3` goes).
- `hero` > 0 by day raises the existing HERO_LIGHT (already in the light list at intensity 0, so no program change).
- Keep storm lightning: a 0.12 s lilac CSS flash (`#E8DCFF`, opacity 0.25; §9.3) plus CONTROLS_SPEC's `clear` +2 m.
  Never a darkening.
- Story/fx grade names (`grade: 'grey'|'night'|'gold'`) keep working as **cutscene composer** grades only (§3.3).

### 2.6 Character, enemy and shared tokens
**Hero lifts** (`characters/palette.js`; from → to): `furGinger #D4935A → #E89A55`, `furGingerLight #F0C08F →
#FFD3A0`, `furGingerDeep #A65E2E → #C66E32`, `furCream #EFE3D2 → #FFF3E2`, `steel #A2A8B1 → #C9D0D8`,
`steelDark #737983 → #8E96A2`, `mail #4E535A → #7C8494`, `brass #D9B26A → #E8C27A`, `capeRed #A3202C → #D9323F`,
`capeLining #6B0F1A → #9A1F3A`, `bow #F2A2B8 → #FF9EC0`, `bowShade #C76E8A → #D9668A`, `leather #6B4429 →
#8A5A36`, `leatherDark #4A2E1F → #6A4430`. Holy and sparkle tokens are unchanged.

**Mischief family** (`enemies/props.js` `ENEMY_PAL`, mirrored in `characters/palette.js` for beast heads):

| Token | Hex | Use |
|---|---|---|
| `mischiefPlum` / `mischiefPlumLight` | `#6E5A86` / `#9C88B4` | rat fur, hyena spots, cloth / bellies, muzzles |
| `slate` / `slateLight` | `#5D6C88` / `#8E9CB8` | crow body, pug armour / bellies, highlights |
| `mustard` | `#E0B043` | **top colour**: Rat Militia helms, crow crest, beaks |
| `teal` | `#3FA59A` | **top colour**: Snickerpack bandanas |
| `olive` / `oliveTop` | `#8C9A48` / `#B7C46A` | Fuzzball spider, bog creatures |
| `cork` | `#C99A6A` | wooden weapons, crossbow stocks |
| `bossCrown` | `#F2D06B`, emissive 0.15 | boss crown, crest or plume (reads at 22 m) |
| `cream` | `#F6EFE4` | sclera, teeth, muzzles |
| `peach` | `#D9A494` | rat ears and paws (not pink) |

Nothing in an enemy is darker than luma 0.12 except pupils. Crow `#17181C` → `slate`; Barkus cape `#22242A` →
`#4A3A5E`.

**World ground** (`world/Terrain.js:13–18`; values from art_2 §3.2, designed against the §2.3 luma targets):
```js
meadow: { root:'#5C8A36', mid:'#86B44A', dry:'#CFC27A', path:'#E2C996', pathDark:'#C4A574', soil:'#9C7650', mud:'#7E6248', field:'#C8B862' },
forest: { root:'#4E7A38', mid:'#6E9E48', dry:'#B8B46E', path:'#D6B88A', pathDark:'#B0946C', soil:'#8A6A4A', mud:'#6E5640', field:'#A6B060' },
town:   { root:'#7AA052', mid:'#98BA62', dry:'#D8CC90', path:'#E8D7B6', pathDark:'#CDB894', soil:'#A88A68', mud:'#8A7058', field:'#C6BC80' },
gate:   { root:'#7C9A4E', mid:'#A0B05A', dry:'#E0BE84', path:'#EBC69E', pathDark:'#CFA27E', soil:'#A87A5C', mud:'#8A6450', field:'#D6B276' },
bog:    { root:'#3E8A6A', mid:'#5AA87A', dry:'#A8C67C', path:'#D2C29A', pathDark:'#B09E7A', soil:'#7A6A50', mud:'#5E5A48', field:'#86B47A' },
keep:   { root:'#8A7268', mid:'#A68A7A', dry:'#C8A890', path:'#D8BCA0', pathDark:'#B8987E', soil:'#8A6A5A', mud:'#6E5450', field:'#B09080' },
```
- **Grass** (`GRASS_COLORS` / per-level `grass.colors`): root ≈ ground `root`, tip = ground `mid` lifted +30 % L,
  dry = ground `dry`. Meadow `#4F7A2E / #B8DA6A / #E8D27C`; forest `#2C6A3A / #86C65C / #C8C060`; town `#4E9440 /
  #B0DA6A / #E8CF7A`; gate `#4E8040 / #A8C860 / #E0B868`; bog `#2E7A5E / #9ED88E / #D6D88A`.
- **Flowers** (`Grass.js:21`): `['#FFD84A', '#FFFFFF', '#8EC8FF', '#FFF2B0', '#C9A8FF']`. 8 % of instances within
  4 m of the spine, 3 % elsewhere.
- **Level stone tints** (`kit.tpl(..., { tint })`): meadow/town sandstone `#E3CFAE`, forest mossy cream `#D8D2B0`,
  gate coral sandstone `#E8B898`, bog sea-glass `#B8D2C4`, keep honey stone `#C8A486`; meadow graveyard wall
  `#E8D6B4`. Generic stone props: `#C9BCA6`, light `#E6DAC4`, shade `#9C8E7C`, moss `#8DB65A`.
- **Shared props:** wood `#B7773F` / dark `#7E4E2A` / cut `#E8B87A`; plaster `#FFF0D6`; timber `#7A4A2E`; roofs
  terracotta `#E0794F`, slate-blue `#6F8FC4`, moss-teal `#4FA39A`, butter `#F2C14E`; canopy light `#9AD663` / mid
  `#58A84A` / dark `#2F7A45` (forest shifted 10° toward teal); mushroom cap `#E8553F`, spots `#FFF4E0`, glow
  `#8FF0D8`; lit windows `#FFD38A` (emissive).
- **Water:** deep `#3FA8C8`, shallow `#8FE0E0`, foam `#FFFFFF`; bog lagoon `#2FAE9E`.
- **Shade rule for props:** shade colours are hue-shifted 10–20° toward red/orange (wood) or violet (stone), never
  toward grey.

---

## 3. Render pipeline (owner **core**: `Game.js`, `PostFX.js`, `config.js`; "extraordinary" performance)

### 3.1 Renderer
```js
// Game.js (renderer creation): antialias is a context-creation flag, so it is set once for every tier.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.NeutralToneMapping;           // was ACESFilmicToneMapping (Game.js:98)
renderer.toneMappingExposure = 1.0;                        // Env eases it per preset (§2.5 `exposure`)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFShadowMap;
installToon();                                             // §4.1, before the first compile or render
```
- `characters/preview.js:24` switches to Neutral too, so the preview matches the game.
- `renderer.debug.checkShaderErrors = DEV || ?debug || ?test` (PERF §3.2).
- **[X1]** AA: canvas MSAA on every tier. The only alternative is the measured Med FXAA fallback of §1R X1, chosen
  once at build time (`RENDER.medAA = 'canvas' | 'fxaa'`), never switched at runtime (`antialias` is a
  context-creation flag). The §11 gates apply to whichever ships.

### 3.2 Play path: direct to the canvas (every tier)
`PostFX.render()` in play is `renderer.render(scene, camera)` with `setRenderTarget(null)`. Tone mapping and sRGB
happen in each material (three applies `renderer.toneMapping` when the target is the canvas).

| Removed in play | Replacement | Owner |
|---|---|---|
| HalfFloat MSAA-4 composer RT + resolve | canvas MSAA (8-bit, implicit resolve) | core |
| `OutputPass` | in-material tone mapping + sRGB | core |
| `VignetteShader` pass (`config.js:276`, black, darkness 1.15) | CSS layer `#ui-vignette` (§9.1), warm cocoa-peach | ui |
| Full-res `UnrealBloomPass` (`PostFX.js:93`) | none in play; glow = additive sprites + aura hull + emissive (§8.5) | fx |
| ScreenFX red DOM vignette / flashes | `#ui-flash` CSS layer, opacity animation only (§9.3) | ui, fx |

### 3.3 Cinematic path: the lazy bloom composer (**High tier only**; [X2])
- Built on the **first** request, kept afterwards. Mechanism = PERF §6.1's `core/postfx/PostChain.js`: scene →
  HalfFloat RT (`samples` 4) → half-res dual-Kawase bloom (3 mips) → one uber pass to the canvas (bloom add, Neutral,
  sRGB, dither; **no** FXAA, vignette, lift or gain). Low and Med never build it.
- API: `postfx.setCinematic(on, { bloom: [strength, radius, threshold], grade })`. Defaults: strength **0.6**, radius
  0.4, threshold **0.9**. Holy cutscene beats tween to 1.2. On Low / Med the call is accepted and only drives the
  glow-card and exposure fallbacks (§8.5), so callers never branch on tier.
- Callers: camera on `preset` / cutscene enter and exit; story for the ending. **Never** gameplay (Holy charge, Golden
  Hour, parry), **never** Meme Cam (any input exits it, and it has no veil) and **never** the title (PERF §10.2).
- Switching without a seam: on enter, the composer turns on at the start of the blend (or under the veil) with
  bloom strength 0 and tweens up over the blend; on exit it tweens to 0 during the hand-back and turns off at its end.
  Canvas MSAA and RT `samples: 4` look the same at strength 0.
- **Program prewarm for the RT variant.** `toneMapping` and the output colour space are part of the program cache
  key, so every program has a second variant for the composer path. On High these variants are compiled **under
  the level veil** by PERF §3.3's `prewarm()` (one extra pass with the composer's RT bound). Nothing compiles after
  the veil drops: PERF `perf:no-compile` holds on every tier. High's program budget counts them separately
  (IMPLEMENTATION_PLAN §5: ≤ 36 play + ≤ 36 cinematic).
- The `grade` option (`'gold' | 'night' | 'hush' | 'warm'`) may set uber-pass uniforms inside the composer only. It is
  optional polish (P3), High only, and never runs in play.

### 3.4 Shadows (core `QUALITY`, world `Env` + `StaticShadow.js`; [X7], mechanism from PERF §7 and AUTOCAM §9.2)
| Setting | Low | Med | High |
|---|---|---|---|
| `shadows` | **none** (actor blobs + PERF §7.3 height-term vertex AO) | `'sun'` | `'sun'` |
| `shadowMap` | — | **1024** (was 2048) | 2048 |
| type / radius | — | `PCFShadowMap`, `shadow.radius = 1` | same |
| box, stage 1 (dynamic stopgap) | — | AUTOCAM §9.2 footprint fit (light-space bbox of the footprint + casters raised 6 m, pad 1.5 m, texel-snapped, grow at once / shrink with hysteresis) | same |
| box, stage 2 (end state) | — | **cached**: `shadowMap.autoUpdate = false`; box = the stage-1 fit + an **8 m cache margin** per side, snapped to an 8 m light-space grid; re-render only when the live fit leaves the cached box, the size class changes (boss fit), the sun tweens (every 4th frame while tweening) or a caster set's visibility changes | same |
| `sun.shadow.intensity` | — | preset `shadowI` (0.45–0.60) | same |

- **Casters, stage 1:** actor shadow proxies, trees (trunk + canopy), buildings, walls, big props (≥ 1 m tall:
  statues, carts, wagons, mill, towers). **Casters, stage 2: statics only**; every character, enemy, companion, prop
  actor, projectile and pickup has `castShadow = false` and is grounded by its blob. **Never (both stages):** grass,
  wheat, flowers, decals, pickups, fur, tufts, eyes, lids, whiskers, blade, bow, capes, particles, small instanced
  props (< 1 m). Every caster takes a per-kind `customDepthMaterial` from core `depthFor()` (PERF §3.5); alpha-tested
  casters one per alpha map and kind.
- **Receivers:** ground, paving, props, trees. Not grass, not characters (the toon band + blob ground them).
- **Contact blobs** under every actor on every tier: `TONE.blob #5A4E7A`, alpha 0.35, radius = footprint × 1.1,
  shrinking and fading with height (PERF §7.2), drawn by fx `BlobShadows.js` (1 instanced draw, 64 slots). This one
  pool serves CONTROLS §5.4's blob shadow and §7.3's contact blobs; `GroundDecals` does not draw blobs.
- Do not toggle `castShadow`, `receiveShadow` or `shadowMap.enabled` outside a quality change behind a veil (it
  recompiles).
- Acceptance: G6 (`shadowRatio` ≥ 0.45 on Med), PERF `perf:shadow` (stage 2: shadow draws 0 on ≥ 95 % of frames),
  PERF S4 / S11, AUTOCAM §11.3 (Med 1024 judged no softer than today's 2048).

### 3.5 Pixels and far content
- **[X4]** `QUALITY.low.maxDpr` **1.25** (render-scale floor 0.6); `QUALITY.med.maxDpr` 1.5 → **1.25** (floor 0.7);
  `QUALITY.high.maxDpr` 2.0 → **1.5** (floor 0.8). Dynamic resolution = PERF §5.2 controller driving
  `renderer.setPixelRatio(min(devicePixelRatio, maxDpr) × s)` on every tier, at most one change per 2 s (the old
  18 ms / 12 ms tech.md §18 windows are retired). Flat cartoon colours hide upscaling well. Each pixel-ratio change
  rewrites the shared `uViewport` (hull widths) the same frame.
- In iso play: sky dome, horizon ring, far skyline and Dawnstone are hidden (`levels.setVisible('far', false)`,
  CONTROLS_SPEC §4.1). Measured: −27k tris, −3 draws. Shown in cutscenes and Meme Cam. The iso far plane is the
  merged X12 formula (AUTOCAM §9.3).

### 3.6 Shader warm-up ([X17], [X37])
One mechanism: PERF §3.3 `prewarm()` (batched `compileAsync` under the veil). `installToon()` runs before it. The
warm set includes the 3 character programs (§5), the hull, the x-ray proxy, one sample of each enemy type of the level
and every fx pool; on High also the cinematic RT variants (§3.3) and the close-up PMREM plate (§5.2). Fur shells
(`ShaderMaterial`) compile in idle `compileAsync` slices **after** T_title on the title screen, never before T_title
and never in play.

---

## 4. World toon shading (owner **core** for the patch, **world** for materials)

### 4.1 `src/core/toon.js` (new; idempotent; r186 chunk text verified on 2026-10-11)
```js
// src/core/toon.js — global toon lighting (ART_WARM_SPEC §4). Pure string patches on THREE.ShaderChunk.
import * as THREE from 'three';
import { RENDER } from './config.js';
const T = RENDER.toon;  // { band: [0, 0.07], step: [0.42, 0.50, 0.86], shadow: [0.38, 0.62], sat: 1.12 }
const f = (x) => x.toFixed(3);
export const TOON_GLSL = /* glsl */`
#ifndef TOON_GLSL
#define TOON_GLSL 1
float toonRamp(float d){ return smoothstep(${f(T.band[0])}, ${f(T.band[1])}, d)
  * mix(${f(T.step[2])}, 1.0, smoothstep(${f(T.step[0])}, ${f(T.step[1])}, d)); }
float toonShadow(float s){ return smoothstep(${f(T.shadow[0])}, ${f(T.shadow[1])}, s); }
vec3 toonGrade(vec3 c){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, ${f(T.sat)}); }
#endif
`;
export const TOON_KEYS = ['lights_pars_begin', 'lights_lambert_pars_fragment', 'lights_physical_pars_fragment',
  'lights_fragment_begin', 'opaque_fragment'];
export function installToon() {
  const C = THREE.ShaderChunk;
  if (C.lights_pars_begin.includes('TOON_GLSL')) return true;
  C.lights_pars_begin = TOON_GLSL + C.lights_pars_begin;          // fragment-only host, before every RE_Direct
  const DOT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
  const TOON = 'float dotNL = toonRamp( dot( geometryNormal, directLight.direction ) );';
  C.lights_lambert_pars_fragment = C.lights_lambert_pars_fragment.replace(DOT, TOON);
  C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(DOT, TOON);   // RE_Direct_Physical only
  const SH = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  C.lights_fragment_begin = C.lights_fragment_begin.replace(`? ${SH} :`, `? toonShadow( ${SH} ) :`);
  C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
    '#ifdef TOON_GLSL\n\toutgoingLight = toonGrade( outgoingLight );\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );');
  let ok = true;
  for (const k of TOON_KEYS) if (!/toon/i.test(C[k])) { ok = false; console.warn(`[toon] chunk ${k} did not patch (three version drift?)`); }
  return ok;
}
```
- Verified against r186 text: the `DOT` string's first match in `lights_physical_pars_fragment` is in
  `RE_Direct_Physical` (the earlier `dotNL` lines use `normal, lightDir` and are not touched); the `SH` string matches
  `lights_fragment_begin` line 197; the `gl_FragColor` line is `opaque_fragment` line 10.
- **Reach:** Lambert, Phong, Standard, Physical, Toon (shadow + grade only) and every `lights: true` ShaderMaterial.
  `toonGrade` runs only where `lights_pars_begin` is included, so Basic, Matcap, Sprite, Points and fx ShaderMaterials
  are untouched (unlit eyes, particles and UI keep their exact colours).
- `MeshToonMaterial` uses `RE_Direct_Toon` (gradient map); the DOT replace does not touch it: no double ramp.
- **Config** (`config.js` `RENDER.toon`, binding): `{ band: [0, 0.07], step: [0.42, 0.50, 0.86], shadow: [0.38,
  0.62], sat: 1.12 }`. `sat` may never exceed **1.15** (oversaturation guard, unit-tested).
- **Unit test** (core, `tests/unit/contracts.test.js`): import three in node, call `installToon()`, assert it returns
  `true`, that each of `TOON_KEYS` contains `toon`, that a second call is a no-op (chunk lengths unchanged), and that
  `RENDER.toon.sat <= 1.15`.

### 4.2 World materials → Lambert
`LevelKit.makeTreeMaterial`, `LevelKit._vcMat`, `Props`, `Pickups`, `Dressing`, `Water` (except its specular sparkle
term), `enemies/props.js` world props: `MeshStandardMaterial` → `MeshLambertMaterial` (same `vertexColors`, `map`,
`onBeforeCompile` chains). Sword pickups and bells take the matcap metal (§5.2); no Standard in play.
Fewer program families, no env sampling. **[X5]** This is the binding world material choice: PERF §8.1's "every world
material → WarmToon (MeshToon)" is replaced by Lambert + the global patch + `withHeightFog` (which carries the lamp
and glow terms). `material.dithering = true` on every tier (X3). Per-kind clones (PERF §3.5: never share one material
between Mesh / InstancedMesh / SkinnedMesh / BatchedMesh) apply here too.

### 4.3 Ink rim for chunky props (0 draws)
Material flag `userData.inkRim = true` (world helper `applyInkRim(mat)` appends to the existing `onBeforeCompile`),
inserted before `#include <opaque_fragment>`:
```glsl
float ink = smoothstep(0.62, 0.92, 1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))));
outgoingLight *= mix(1.0, 0.68, ink);       // darkens bevelled silhouette edges; flat faces unaffected
```
Use on crates, barrels, chests, signposts, fences, stones, carts, vigil stones. It needs the bevels of §8.3.

---

## 5. Character and enemy materials (owner **characters**; enemies consume)

### 5.1 The toon program (`characters/materials.js`; cache key `sc-toon-v2`)
```js
let _ramp = null;
export function softRamp() {                       // 4 texels, linear: deep shade, shade, lit, lit
  if (_ramp) return _ramp;
  const d = new Uint8Array([150,150,150,255, 178,178,178,255, 255,255,255,255, 255,255,255,255]);
  _ramp = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _ramp.magFilter = _ramp.minFilter = THREE.LinearFilter; _ramp.generateMipmaps = false; _ramp.needsUpdate = true;
  return _ramp;
}
/** @param {{ map?: THREE.Texture }} o  rmse attribute = [unused, metal mask, rim/sheen mask, unlit] as today */
export function makeToonMaterial(o = {}) {
  const m = new THREE.MeshToonMaterial({ vertexColors: !o.map, map: o.map ?? null, gradientMap: softRamp() });
  const u = { uHoly: { value: 0 }, uHolyColor: HOLY_COLOR, uFlash: { value: 0 },
              uHighlight: { value: new THREE.Vector4(1, 1, 1, 0) } };   // rgb + amount: selection / wind-up
  m.userData.uniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ENV_U, u);        // ENV_U.uRim / uRimK are Env-owned shared objects (§2.4)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rmse;\nvarying vec4 vRMSE;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRMSE = rmse;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vRMSE; varying vec3 vWN;
        uniform vec3 uRim, uHolyColor; uniform float uRimK, uHoly, uFlash; uniform vec4 uHighlight;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float up = clamp(vWN.y * 0.5 + 0.5, 0.0, 1.0);
        diffuseColor.rgb *= mix(0.92, 1.08, up);                       // coat gradient: lighter on top`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float ndv = saturate(dot(normal, normalize(vViewPosition)));
          float rim = pow(1.0 - ndv, 2.5) * (0.35 + 0.65 * saturate(vWN.y + 0.4));  // top-weighted: ears, cheeks, pauldrons
          vec3 rimC = mix(uRim, uHighlight.rgb, uHighlight.a);
          float rimK = uRimK * (1.0 + 1.5 * uHighlight.a);
          totalEmissiveRadiance += rimC * rim * rimK * (0.4 + 0.6 * vRMSE.z);
          totalEmissiveRadiance += diffuseColor.rgb * vRMSE.w;                     // unlit parts in the same draw
          totalEmissiveRadiance += uHolyColor * uHoly * (rim * 1.2 + 0.03);
          totalEmissiveRadiance += vec3(uFlash);
        }`);
  };
  m.customProgramCacheKey = () => 'sc-toon-v2';
  m.dithering = true;                              // [X3] every tier
  return withHeightFog(own(m));                    // [X5] focus fog + ENV_U glow/lamps; composed key 'sc-toon-v2|hfog3'
}
```
- No shade-tint uniform: the HemisphereLight already fills the shade side with the preset's `hemiSky` (D7). PERF's
  `uShadowTint`, `uRimPow/uRimStr` and its NearestFilter `RAMP` are not used (X3, X5); `softRamp()` is the ramp.
- This family is what PERF_SPEC calls **WarmToon**; PERF's program-variant limits and `toonLib` per-kind dedupe
  (`kind ∈ plain | instanced | skinned | batched`) apply to it.
- GLB enemies without an `rmse` attribute get a constant one at load (`[0, 0, 1, 0]`, one shared
  `BufferAttribute` per geometry) so the same program applies.
- `rmse.w = 1` marks unlit parts (lite-tier eyes, mouth, inner-ear glow) so lite characters stay 1 draw.
- **Pools (D17):** `getToonMaterial(typeKey, map)` returns a material from a per-(type, atlas) pool; each live actor
  holds one; it goes back to the pool on despawn. Same cache key, so no compile. For enemies the pooled unit is PERF
  §3.4's `VisualPool` visual: its materials are created once with the visual and travel with it (one pool, not two). A hit sets `uFlash` 0.35 and decays
  it to 0 over 0.12 s; no `emissive` clones.
- `setHighlight(color, strength)` (CONTROLS_SPEC characters 2) writes `uHighlight`. Enemy wind-up: on
  `combat:telegraph`, `uHighlight = (TONE.telegraph, 0.8)` from wind-up start to `activeAt`, then to 0 over 0.15 s.

### 5.2 Metal: one matcap program (`sc-metal-v2`)
```js
export function makeSteelMatcap() {                // generated once, 256², warm horizon, plum bottom, no black
  const c = canvas2d(256, 256), g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0.00, '#FFFFFF'); base.addColorStop(0.30, '#E6ECF2');
  base.addColorStop(0.55, '#B9C2CC'); base.addColorStop(0.62, '#F6E7D2');
  base.addColorStop(1.00, '#7D7488');
  g.fillStyle = base; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  const hot = g.createRadialGradient(86, 70, 0, 86, 70, 46);
  hot.addColorStop(0, 'rgba(255,255,255,0.95)'); hot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hot; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeMetalMaterial() {             // vertex colour = tint: steel #C9D0D8, brass #E8C27A, dark steel #8E96A2
  const m = new THREE.MeshMatcapMaterial({ matcap: makeSteelMatcap(), vertexColors: true, fog: true });
  // + the same emissivemap_fragment block as §5.1 (rim, holy, flash, highlight); cacheKey 'sc-metal-v2'
  return own(m);
}
```
- Drops `MeshPhysicalMaterial` (sheen, clearcoat), `setCharacterEnvMap` and the per-preset character PMREM rebuild.
- The holy blade streak stays an emissive on the blade (art.md §4.3).
- Optional, P3: tint the matcap's horizon band by Env's `fogColor` through a uniform (no recompile) if the steel looks
  pasted-on in a level.
- **Close-ups** (`kitten.setCloseUp(true)`, §6.1) may swap the plate back to a PMREM `MeshStandardMaterial` on the
  **High tier only** (X2/X27; prewarmed under the veil with the cinematic variants). Low / Med close-ups keep the
  matcap. PMREM is never created in iso play on any tier (PERF §8.2). The matcap is this 256² texture (PERF's 128²
  `makeToonSteel` is replaced by it).

### 5.3 Eyes (`characters/Eyes.js`)
| Item | Now | Binding |
|---|---|---|
| Material | `MeshPhysicalMaterial` clearcoat, per eye | **`MeshBasicMaterial`** (unlit) with the iris CanvasTexture; L+R merged into **1 draw**; lids stay in the coat material |
| Pupil radius (of 256) | 66 | hero **80**, kittens **92**, enemies 54 (inside a sclera) |
| Catchlights | 2 | **3**: upper-left 34×26, lower-right 14, top sparkle r 7 at (150, 70) |
| Sclera | none | cream `#F6EFE4` ring on enemies and grown-ups only; kittens keep the all-iris button eye |
| Lash line | torus r 0.0045 | r **0.008** + a 0.012 outer wing |
| Brows (new) | — | coat-darker capsule 0.05 × 0.012 H above each eye, rotation −25° (angry) … +30° (worried), lift ±0.01 H; every `EXPRESSIONS` entry gets `brow` |
| Expression gain | — | lid and brow deltas ×**1.4** when the lens is > 8 m away (`kitten.expressionGain`) |
| Far LOD | — | non-hero actors > 20 m from `cam.focus` or `lite` tier: eyes baked as `rmse.w` vertex colours. **The hero always keeps her eye mesh** |

### 5.4 Outline hull (`characters/Outline.js`, new)
- `buildOutline(view, { px, color })` creates a second `SkinnedMesh` that **shares** the `getSilhouetteProxy()`
  geometry and skeleton, `MeshBasicMaterial({ side: THREE.BackSide, fog: true })`, `castShadow = false`. Never on fur,
  tufts or the cape.
- Constant screen-space width (zoom varies 9–18 m):
```glsl
// onBeforeCompile: replace #include <project_vertex> (skinning has already moved `transformed`)
vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
vec4 clip = projectionMatrix * mvPosition;
vec3 nV = normalize(normalMatrix * objectNormal);
vec2 dir = normalize((projectionMatrix * vec4(nV, 0.0)).xy + 1e-5);
clip.xy += dir * (uOutlinePx * 2.0 / uViewport) * clip.w;   // uViewport: drawing-buffer px (shared, core writes on resize)
gl_Position = clip;
```
- Widths at dpr 1 (× the **current** pixel ratio, including the dynamic-resolution scale): hero **2.0 px**,
  companions 1.6, enemies 1.6, bosses **2.4**; capped at 3 px when the lens is < 4 m. (PERF §9.5's ≈ 1.5 px and
  `#4A2E2A` are replaced by these values and `TONE.ink`.)
- Colour: `TONE.ink` mixed 40 % with the actor's key hue ×0.3. Hero `#5A2A1A`, crow `#20234A`. Never `#000`.
- Tiers ([X9]): `QUALITY.outline` Low `'hero'` (hero + boss), Med `'heroCompanionsEngaged'` (hero, boss, companions,
  ≤ 4 engaged enemies, chosen nearest-first from combat's engaged list), High `'all'`. An enemy's hull appears with a
  0.2 s alpha fade when it becomes engaged (no pop). The hull colour lerps to `TONE.telegraph` with `uHighlight.a`
  (D10). Two programs total (skinned + static).

---

## 6. Hero, kittens and villagers (owner **characters**; **player** drives animation)

### 6.1 Fur: Soft Fur in play, shells for close-ups only (D8)
| Context | Look | Cost |
|---|---|---|
| Play (iso, every tier) | toon program (§5.1) coat gradient + warm rim + skinned **tuft cards** (§6.2) | base mesh + 1 tuft draw (Low: no tufts); High + 4 iso shells only if PERF S2 passes (X8) |
| Close-up: `cam.closeUp` (lens < **6.0 m** from her focus, off > 6.3 m: presets, cutscene close shots, Meme Cam, title, photo) | Soft Fur **+ shells**: `QUALITY.furShellsClose` Low 8, Med 16, High 16 (kittens ×0.6) | today's cost while framed |

- Shell `InstancedMesh`es and the close-up geometry set are built **in idle slices (≤ 2 ms) after the level's first
  60 frames**, detached and hidden, so the first close-up never builds geometry on its own frame (a Meme Cam entry
  has no veil). In play they are **not in the scene graph** (no sort, no bind, no cull test).
- `FUR_LOD_ISO.heroLens` 25 → **0**. `QUALITY` keys (one merged set, IMPLEMENTATION_PLAN §4): `furShellsIso` (0 / 0
  / 0-or-4), `furShellsClose` (8 / 16 / 16), `kittenShellsIso` 0 on every tier. CONTROLS_SPEC §2.8 "her hero shells
  stay full within 25 m of the lens" and PERF §9.3's on-screen-px bands are replaced by this rule.
- Camera owns the flag `cam.closeUp` (hysteresis above) and calls `view.setCloseUp(on)` on change; the cape's full
  grid (PERF §9.1) and the close-up geometry key off the same flag. Dialogue in iso (d × 0.8 ≈ 10 m) is **not** a
  close-up.

### 6.2 Tuft cards (the fluffy silhouette from above; D16)
One `SkinnedMesh` per character sharing the rig skeleton, `tuftMaterial()` (procedural alpha, `alphaTest` 0.35,
double-sided, toon-lit via `lights: true`), `castShadow = false`. Each tuft is a **crossed pair of quads** (4 tris),
rigidly weighted (weight 1) to one bone, tilted **35° toward world-up** from the surface normal so it reads from
50° above. Zero CPU per frame.

| Cluster | Tufts | Size (H) | Bone |
|---|---|---|---|
| Cheek ruff edge | 2 × 6 | 0.05 × 0.09 | head |
| Crown "cowlick" | 3 | 0.04 × 0.07 | head |
| Inner ear (cream) | 2 × 3 | 0.03 × 0.08 | earL / earR |
| Bib | 5 | 0.05 × 0.08 | chest |
| Tail tip (cream) | 6 | 0.05 × 0.10 | last tail bone |
| **Total** | **32 tufts = 128 tris, 1 draw** | | |
Kittens 20 tufts, villagers 0. Low tier: none.

### 6.3 Proportions (D15; heights from soles 0 to ear tips 1.0 H; total height unchanged)
Physics, hitboxes, `MODEL_FIT`, cages, doors and the camera's `catH` 0.8 are unaffected.

| Feature | art.md now | **Binding target** | Lever |
|---|---|---|---|
| Head height | 0.38–0.40 H | **0.46 H** (fallback 0.43 H if S3 fails) | `cfg.headScale` 1.0 → 1.17 (kittens 1.22, villagers 1.05) |
| Head width incl. ruff | 0.52 H | **0.60 H** | skull `scale(1.18, 1, 1.02)`, cheek ruff r 0.085 → 0.095 |
| Body (chin → sole) | 0.62 H | **0.54 H** | `hips.y` 0.30 → 0.27, `chest.y` 0.10 → 0.085, legs ×0.85 |
| Shoulder width | 0.54 H | 0.54 H (fallback pauldrons 0.58 H, still ≤ head width) | unchanged |
| Eye diameter / spacing / centre | 0.09 / 0.145 / 0.79 H | **0.13 / 0.18 / 0.74 H** | `EyePair.r` 0.045 → 0.056; `FACE.eye*.x` ×1.15, `.y` −0.03 |
| Face tilt | — | face plane rotated **12° up**; head pitches **+8°** toward the camera when idle or walking (not in the Stand or swings) | `FACE` offsets; `head` joint additive in `SwordcatModel` |
| Ears | 0.12 H cone | **0.13 H**, base ×1.15, rounder tip | `earGeometry` |
| **Bow** | 0.12 H at the ear base | **0.17 H**, on the **top-front of the LEFT ear** (+X, y 0.97 H), tilted 25° toward the camera, emissive 0.08 | `Bow.js` |
| Pauldrons | 4 lames + rivets | **2 domes**, outer r ×1.1, brass rim 0.012 H, no rivets | `Armour.js` |
| Tassets, greaves, sabatons | lames | 1 rounded skirt + 2 boot "beans" | `Armour.js` |
| Tail | 0.45 H, r 0.065 | **0.50 H, r 0.085**, cream tip 25 % | `TAIL_CURVE` |
| Cape | 0.46 H | **0.40 H**, rounded hem, **gold hem trim 0.02 H** | `Cape.js`, `CAPES.*.hem` |
| Sword | 0.85 H blade | blade **stays 0.85 H**; width ×1.25, rounded tip r 0.01 H, guard 0.24 H | `Sword.js` (combat reach unchanged) |
| Cream "M" blaze | — | on the head top, readable from above | coat paint |
| Whiskers, rivets, mail texture, breastplate words | always | close-up LOD only (words > 6 m off) | `KittenBuilder` LOD |

`READABILITY` (bow ×1.25, ears ×1.1 beyond 9 m) stays and stacks with the new bow size; re-check bow ≤ 0.24 H at
×1.25 so it never covers the eyes from above.

### 6.4 Play-LOD geometry (built at spawn; close-up set built lazily on the first `setCloseUp`)
| Part | Close-up | **Play** |
|---|---|---|
| Skull | 64 × 48 | **28 × 20** (coat stripes dropped: < 2 px) |
| Cheek ruff / muzzle | 32×24 / 24×16 | 16×12 / 12×8 |
| Eyes | 32 × 24 each | 16 × 10, merged pair |
| Pauldrons, breastplate | lames + lathe 48 | 2 domes 20 × 10, lathe 24 |
| Tail tube | 40 × 16 | 16 × 8 |
| Cape | verlet 9 × 13 | verlet **7 × 9** sim grid, PERF §9.1 render subdivision 2 / 1, grid normals, 3 iterations, ≤ 2 sub-steps (Low and activity tier ≥ 1: sway shader) |
| Hands, feet | 4 finger capsules | 1 mitten ellipsoid |
The play set is **merged per material into one `SkinnedMesh`** on the existing 27-bone rig (as the `lite` tier
already does). The bow merges into the body draw. `KittenView` API (`setPose`, `setHoly`, `setExpression`, `rig`) is
unchanged.

**Hero draw list in play [X10]:** interim (before PERF H7 bake and shadow stage 2) **≤ 9**: body+fur+bow 1, metal 1,
eyes 1, cape 1, sword 1, tufts 1, hull 1, shadow-pass proxy 1. End state **≤ 6**: body+bow 1, eyes 1 (her eye mesh
stays its own unlit draw; PERF §9.4's expression atlas applies to kittens, villagers and enemies only), steel + sword 1
(baked), cape 1, tufts 1, hull 1; no shadow draw (blob). x-ray +1 only while occluded. **≤ 16k tris** throughout.

### 6.5 Squash and stretch (`characters/KittenBuilder.js` `Squash`; player drives it)
Volume-preserving on the `body` joint (pivot at the feet): `scale.y = s`, `scale.x = scale.z = 1/√s`.
```js
export class Squash {
  constructor(k = 320, c = 16) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(dv) { this.v += dv; }                       // negative = squash, positive = stretch
  update(dt, target = 0) {
    this.v += (-this.k * (this.x - target) - this.c * this.v) * dt; this.x += this.v * dt;
    this.x = Math.max(-0.35, Math.min(0.35, this.x)); return 1 + this.x;
  }
}
```
| Event | Target / kick |
|---|---|
| Idle breathing | target `0.025 sin(2π·0.45 t)` |
| Walk / run gait | target `0.04 |sin(π·phase)|` hero, 0.06 kittens (2 bounces per stride) |
| `player:jump` | target −0.15 for 0.06 s, then kick **+3.5** |
| `player:land` | kick **−2.5 × min(1, fallSpeed / 6)** |
| Swing wind-up / release | target −0.08 / kick +1.5 |
| Holy charge held | target −0.10 + 9 Hz shiver ±0.01 |
| `combat:hit` (victim) | kick −2.0 + `uFlash` |
| Tumble | target −0.2 |
| Meow / happy | kick +2.0, ears +15° |
Head follow lag **0.06 s** (damp λ 18). Enemies use the same helper on their root or Body bone.

### 6.6 Glance at the player
Idle and out of combat, every 6–10 s (seeded per kitten): head turns up to **25°** toward the camera, eyes +10°,
hold 0.8–1.4 s with a blink, return. Hub residents and companions too.

---

## 7. Enemies: cute-menacing (owner **enemies**; characters for beast heads)

### 7.1 Menace budget
At most **two** allowed cues per enemy; nothing from the forbidden column.

| Allowed | Forbidden |
|---|---|
| Angry brows (−25°), narrowed lids | Red or green glowing eyes, bloom eye glints |
| A grin with 2–4 **rounded** fangs | Rows of sharp teeth, open maws, drool |
| Size, forward lean | Gore, blood-coloured scars, exposed bones (except biscuit-bone Boneheads) |
| Oversized props (kettle helms, pot lids, cork crossbows) | Insect detail: 8 eyes, hairy legs, mandibles |
| Mischief colours (§2.6) | Near-black bodies, black silhouettes in fog |
| A comic tell before attacks (hop, helm steam, wiggle) | Twitchy motion, lunges without a tell |

**Defeat = "faint and poof":** squash flat (s 0.6 over 0.12 s), 3 dizzy stars 0.5 s, then a cream puff + 6 sparkles +
4 faction-colour confetti (fx `Poof.js`) and gone. Death clips play for 0.25 s at most. No corpses.

### 7.2 Per-enemy changes (hitboxes, clips, AI and `MODEL_FIT` heights unchanged)
| Enemy | Change | Mechanism |
|---|---|---|
| rat_pike / rat_xbow | Head bone ×1.45, Neck ×1.1, Body ×1.1, Tail1 ×0.75, legs ×0.9. Fur `mischiefPlum`, belly `mischiefPlumLight`, ears/paws `peach`. 2 cream-sclera eyes r 0.07 m, pupil 54, angry brows; **no red glints**. Kettle helm `mustard` (top colour). Pike = wooden spear, cork tip | Rat.glb has no scale tracks: static bone scales persist; `recolor()` by material name |
| Grizzlechop | rat changes + `bossCrown` tricorn plume, big belly, **monocle** (Barkus keeps the eyepatch), moustache card | `ratGear.js` |
| crow | Head ×1.35, body `slate`, belly `slateLight`, beak/feet `mustard`, cream-sclera eyes + brows, 3-tuft `mustard` crest (top colour). Dive shadow plum `#3A2346` α 0.55 | atlas remap (§7.3) |
| spider → **Fuzzball** | Abdomen ×1.5, Thorax ×1.2, Head ×1.4, legs ×0.75; `olive` with `oliveTop` top + 12-card fuzz fringe; **2 big eyes** (+2 tiny); leaf hat (top colour). Webs dewy: additive white dots α 0.4 | recolor by material name; static bone scales |
| Gloomjelly | keep; 2 catchlights + small smile; squash on hop; giant gets a gold crown glint | `jelly.js` |
| hyena, Cacklejaw, Pilfer, stealer | snout 1.75 → **1.3**, skull ×1.1, ears ×1.25 rounder, **4 rounded teeth**, spots `mischiefPlum` on tawny `#C9A46C`, amber eyes, cream sclera, round pupils (slit only on Cacklejaw's gloat). Snickerpack: `teal` bandana. Cacklejaw's hat = `bossCrown` top | `BeastHead.js` hyena branch: snout `scale(0.8,0.7,1.3)`, teeth loop 7 → 4 sphere tips |
| pug / Sir Brutus | shield and armour `slate` + `mustard` stripe; brows | tint + atlas remap |
| Lord Barkus | horns round-tipped; helm `slate`; cape `#4A3A5E` | `EnemyManager.js` look table |
| Boneheads (M3) | biscuit-bone toy soldiers: bone `#F3E2C4`, big round eyes with a white catchlight, pot helm, `mustard` bandana; collapse = clatter + star ring | tint + `*_Eyes` node CanvasTexture |
| warhound (MVP+) | Head ×1.3, slate coat, mustard collar, floppy-ear tufts | static bone scales |
Rule: head ≥ **35 %** of body height (rats, crows 40 %); eyes ≥ 0.06 m diameter.

### 7.3 Recolouring CC0 GLBs (once per (asset, palette) at load, cached)
1. Solid-colour materials (Rat, Spider): existing `rig.recolor(root, { MaterialName: hex })`.
2. Palette atlases (KayKit `*_texture.png`, Quaternius `Atlas_Monsters`): `remapPaletteTexture(tex, pairs, key,
   tol = 28)` in `enemies/rig.js`, exactly as art_1 §5.4 (nearest-swatch remap keeping the luminance offset,
   `OffscreenCanvas`, `NearestFilter` mag, cached in a `Map` keyed `tex.uuid|key`). Swatch lists from a one-off
   dump tool; `PALETTE_MAPS` lives next to `MODEL_FIT`.
3. Then every loaded enemy mesh takes `getToonMaterial(type, remapped)` (§5.1) instead of its GLB
   `MeshStandardMaterial`.
4. **KayKit scale tracks** (2,482 channels, ~40 % of KayKit channels): strip constant unit scale tracks at load
   (`t.name.endsWith('.scale') && every value ≈ 1`). Saves mixer time and lets static bone scales persist. Smoke
   `enemies:*` must stay green (no clip relied on a non-unit scale).

### 7.4 Enemy budgets
Rat / crow / Fuzzball ≤ **3** draws (body 1, gear merged 1, shadow proxy 1 in stage 1 / hull 1 when outlined), ≤ 6k
tris. KayKit + beast head ≤ 4 interim, ≤ 3 after the PERF H7 / E7 bake (body, steel, hull), ≤ 10k. Boss ≤ 7, ≤ 25k.
**[X13]** Mixer, cape and secondary-motion rates follow PERF §4.3 activity tiers (`cam.activityOf`): tier 0 every
frame, tier 1 every 3rd frame with accumulated dt, tier ≥ 2 frozen. The old 25 m / 40 m mixer rule is retired.

---

## 8. World, foliage, haze and FX (owners **world** and **fx**)

### 8.1 Haze (CONTROLS_SPEC §4.1 mechanism unchanged)
- Colours per §2.5; `fogLow` warmer and slightly darker than `fogColor`; `uFogLowMix` 0.45 in iso (spec value).
- Clear colour = `fogColor`. Sky dome only in cutscenes, gradient `skyTop` → `fogColor` → `hemiGround`.
- Mist cards, ground mist (`GroundMist.js`) and sun rays: tint = `fogColor` lifted 6 % toward `sunColor`; alpha cap
  **0.14** (spec range 0.10–0.22 is clamped to ≤ 0.14). `GroundMist` quads per tier (`QUALITY.groundMist`): Low **4**,
  Med 8, High 8 (tile GPUs pay for alpha overdraw; PERF §18.1). In iso, SunRays cones are replaced by **ground light
  pools** (24 additive ellipses, `#FFF0B8`, α 0.16, 1 instanced draw, forest and meadow; Low 12).

### 8.2 Grass and flowers (`world/Grass.js`)
- **[X11]** Geometry and counts are PERF §8.4's: a **tuft** = 3 tapered blades in a fan, **6 tris**, grass and
  flowers in **one** `InstancedMesh` (1 draw), 0.18–0.32 m tall, blade width ×1.6 (supersedes the spec's ×1.25).
  Counts `QUALITY.grassTufts`: Low **1,300**, Med **4,000** (24k tris), High **8,000**; thermal rung 1 halves them.
  One wrapping tile of side `T = 1.6 · d`, centred on the camera footprint centre (`cam.footprint.cx, cz`), so it
  always covers the visible ground + 3 m (AUTOCAM §9.4; unit-checked for every profile). Opaque (no `alphaTest`), no
  shadow receive. Ground under grass −10 % L (spec).
- **Normals bent to world-up** (lerp 0.7): grass shades like the ground, no dark backfaces, no noisy toon bands.
- Colour: root → tip gradient (§2.6), per-tuft hue ±6°, lightness ±5 %, dry-patch noise at 1/40 m using `dry`.
  Flowers are per-instance colour + a 2-tri petal cap on flower instances (§2.6 palette and shares).
- `grass: false` levels (keep) get flower boxes and moss tufts instead (instanced, 1 draw).

### 8.3 Trees and chunky props (`LevelKit`, `Props`, `Pickups`, `Dressing`, `enemies/props.js`, levels)
1. Canopies: 2–3 merged icosahedra (detail 1), vertex colour canopy dark (bottom/inside) → light (top) by `normal.y`.
   Crowns keep `camFade` (CONTROLS_SPEC §3).
2. **Bevel everything** seen from above: `RoundedBoxGeometry` radius 8–12 % of the smallest side, 2 segments;
   chamfered cylinder rims.
3. Interactables ×**1.25** visual scale (crates, barrels, chests, signposts, vigil stones). Colliders scale with them
   (world data → physics), and nav must stay green (§12 physics).
4. No member thinner than **0.06 m** (fence rails, posts, sword pickups).
5. Two colours + one accent per prop, flat vertex colour. Kept textures (town cobbles) are multiplied toward `path`
   with contrast ≤ ±12 % luminance.
6. **Merge static props per biome** (`mergeGeometries` or `BatchedMesh`, one Lambert material): **1–4 draws**.
7. Bog: `tree_*_dark.glb` → `tree_default/oak/thin.glb` with canopy tint `#7FC8A0`; 12 giant lilies (pads `#6CC07A`,
   flower `#FFF6D8`); boardwalks `#E8D6B0`. Keep: brazier pairs every 12 m (emissive, no extra point lights), bunting.

### 8.4 Gloomy items replaced (fx and world; from art_2 §4)
| Where | Now | Binding |
|---|---|---|
| `fx/Horde.js:23` | 40 black `#2A2A2E` silhouettes | warm brown `#8A6450` "dust-cloud army" with a cream dust band at the feet (same draw) |
| `fx/Poof.js:32` | feathers `#2B2A36` | `#6A6A8E`; dust `#FFF4E0` / `#E6C590`, never grey |
| `fx/Telegraphs.js:434`, `config.js:191` | crow dive shadow `#05070A` / `#000000` | plum `#3A2346`, α 0.55 |
| `fx/Ambient.js:13,22` | keep embers + ash | "lantern sparks" `#FFC46B`, rise 0.5, count 40; no ash |
| Telegraphs | red/aoe colours | **stay** (gameplay language); add a 2 px cream rim `#FFF6E8` (`uRim`, `Telegraphs.js:199`) |

### 8.5 Glow without bloom in play (fx)
HolyFX charge, Golden Hour aura and parry flares must read at bloom 0: additive sprite core `#FFF6DA` ×2.0
intensity, aura hull at α 0.35 with a fresnel edge, 6–12 `STAR4`/`STAR8` sparkles, and `renderer.toneMappingExposure`
+0.06 for Golden Hour (eased 0.25 s; Env adds it to the preset value). fx screenshot gate S6.

### 8.6 Juicy feel-good moments (existing particle pools, 0 new draws)
Add `SHAPE.CONFETTI = 12` (`Particles.js`, `fx/shaders.js` `fxShape`, a rounded rect whose width × `|cos(age·9 +
seed·2π)|`).
- **Kitten rescued** (`kitten:rescued`, payload gains `position` [X23]; this burst is also AUTOCAM's Cosy-beat twin
  [X24]): CSS flash white-gold α 0.22 / 0.18 s; 60 confetti (`#FF8FB1 #FFD84A #8FD3FF
  #9BE3C4 #FFFFFF #C9A8FF`, speed 3–5.5, gravity 3.2, drag 1.4, life 1.6–2.2 s); +0.05 s 10 `STAR5` `#FFE066`;
  +0.15 s 8 `HEART` `#FF6F9C` rising 0.8 m/s; pink shockwave ring r 0 → 2.2 m in 0.35 s; kitten hop with 1.2× squash.
- Hit on enemy: 3 `STAR4` (`#FFFFFF` → `#FFE066`) + 0.12 s white bonk disc. Parry: white ring + 6 `STAR4` + 1 `STAR8`.
- Heal: 6 mint `#9BE3C4` plus-signs. Vigil Stone: gold ring + 12 rising motes. Results: 120-piece confetti curtain.
- Low tier: counts ×0.5, confetti flat (no spin).

### 8.7 Ambient life (P3)
`fx/Butterflies.js` (one `InstancedMesh`, SDF wings, vertex-animated, art_2 §5.1 shader; meadow 18, forest 12, town
10, hub 14; bog dragonflies 8; gate swallows 6; Low ×0.5; never within 1.2 m of her head; out of arenas). Ambient
profiles `motes`, `fireflies`, `sparks`, `petals` (art_2 §5.3). Cloud shadows on terrain + grass only (1 tex tap,
off on Low). Budget: **+2 draws** total.

---

## 9. UI, fonts and audio: no 90s cues (owners **ui**, **audio**, **story**)

### 9.1 Candy UI (`ui/ui.css`, `fonts.css`, `fonts.js`, `hud.js`, `menus.js`)
- Tokens and components exactly as art_2 §6.1–6.2 (`--cream #FFF8EE`, `--cocoa #5A3B2E` ink, pink/sky/butter/mint/
  lilac/coral roles, `.panel`, `.btn--candy/--sky/--butter`, `popIn` 280 ms, `wiggle`). Panel studs and grain removed.
- Boss bar: cream track, fill `#FF8A7A → #E64D6A`, damage trail butter `#FFD86B`, name ribbon plum `#7A4E9A`.
- `#ui-vignette` (static, `pointer-events:none`, z under HUD):
  `background: radial-gradient(120% 95% at 50% 46%, #0000 62%, #B4664A2E 100%)`.
- `#ui-flash` (static layer, animate **opacity only**): hurt `#FF8FB1` 0.18 / 0.25 s; low HP soft pink edge pulse
  1 Hz ≤ 0.12; rescue white-gold 0.22; storm lilac `#E8DCFF` 0.25 / 0.12 s.
- **Paint rules:** no `filter: drop-shadow()` on animated elements (`ui.css:96–145`; bake into SVG or static parent
  `box-shadow`); `pulseRed` (`:80`) → coral `#FF7A8A` transform pulse; no `backdrop-filter` over the canvas (`:403` →
  warm scrim `radial-gradient(#FFF1E200, #5A3B2E80)`); no SVG `feTurbulence` (`--noise`); `will-change: transform`
  on ≤ 6 hot elements; DOM confetti ≤ 24 nodes, removed after 1.6 s. When a menu is open and static, skip rendering
  after one frame.
- **[X22] Skin only, geometry fixed:** the restyle keeps CONTROLS §9.2 touch-cluster sizes, offsets, dead rings and
  the ≥ 56 px clamp, CONTROLS §10.1 ability-bar slot sizes (56 / 48 px) and the 18 % HUD strip exactly. AUTOCAM's
  SafeFrame reads the measured rects through `ui.screenOccluders()`; `#ui-vignette`, `#ui-flash`, toasts and the
  `?perf` overlay are `pointer-events: none` and are **excluded** from it. A geometry change needs a SafeFrame fixture
  update in the same commit.
- **[X21]** Cooldown sweeps (CONTROLS §10.1 "30 Hz") run as a CSS animation started once per cooldown
  (`@property --cd` + `animation-duration`), not per-frame JS writes, so they fit PERF §10.5's ≤ 15 style writes/s.

### 9.2 Fonts (**Fredoka everywhere**, logo included)
`--f-logo`, `--f-head`, `--f-lore`, `--f-sign` all → Fredoka (logo 700 with a butter → gold gradient fill and a 5 px
cocoa stroke, `paint-order: stroke fill`; letters 500 with `skewX(-4deg)` on a lilac-edged notecard). Delete
`UncialAntiqua`, `MedievalSharp`, `Cinzel-Variable`, `CinzelDecorative-*` from `fonts.js` and the asset manifest:
**−449 KB** boot download. `characters/Plate.js` breastplate words: Fredoka 700, ±3° per-glyph jitter.
`story/Overlay.js` follows the CSS variables.

### 9.3 Audio replace list (P2; procedural glockenspiel and beds are P3)
| Where | Now | Binding |
|---|---|---|
| `musicMap.js:27,57` | `dark_forest_creepy` (Lantern Night) | `field_of_dreams` rate 0.94 + crickets bed; `tavern_old_tower_inn` within 8 m of the camp |
| `musicMap.js:35,91` | `victory_8bit_loop` | `festival_minstrel_dance` (first 20 s looped) |
| `sfxMap.js:108,148,150,216,259` | `jingles_NES*` | `jingles_PIZZI*` / `jingles_STEEL*` |
| `sfxMap.js:46` | `ui/glitch_001` | zzfx noise "pfft" 0.12 s, lowpass 1.2 kHz + `pickup/bubble` rate 0.7 |
| `sfxMap.js:114` | crow `c80_scream` | scream at rate 1.7, lowpass 3 kHz, vol 0.4 |
| `sfxMap.js:488` | heartbeat (Still Standing) | `cat_purrsleepy_loop` 1.2 s + rising glock third G5→B5 |
| `musicMap.js:64–65` | `cave_theme` bog/keep | bog `field_of_dreams` rate 0.96 + water; keep `castle_kings_feast` 0.7 |
| `musicMap.js:60,90` | `story_lament` loops in the hub | lament for its one scene; hub hush loops `village_bards_tale` rate 0.92, lowpass 2.2 kHz |
| `audio/nature.js` | sub-bass "Gloom rumble" | airy wind + chime tail, nothing under 80 Hz |
| `sfxMap.js:135,193` | `c80_howl` | Barkus only, rate 1.0–1.1, 0.8 s |
Mix (P3): master high-shelf +1.5 dB at 6 kHz, low-shelf −2 dB at 120 Hz.

### 9.4 Story text
`strings.js:122` "Midnight Practice" → **"Morning Practice"**. CS-11 env cue may keep `hub_grey` (alias) or use
`hub_hush`. GAME_DESIGN §17 "her glow is the only warm light in the cold biomes" → "her glow is the brightest warm
light" (doc edit, §13).

---

## 10. Budgets ([X14]; the merged table in IMPLEMENTATION_PLAN §5 is authoritative; counts binding, ms per X15)

Stages: **I1** = today's code until PERF wave A and art A0 land; **I2** = after art A1 and shadow stage 1; **End** =
after shadow stage 2, the blob pool and the PERF H7 / E7 bakes.

| Budget (iso play, `renderer.info`) | Low (phone) | Med | High |
|---|---|---|---|
| Frame draw calls incl. shadow pass, I1 | ≤ 70 | ≤ 120 | ≤ 150 |
| Frame draw calls incl. shadow pass, I2 | **≤ 60** | **≤ 90** | ≤ 110 |
| Scene draw calls, End (shadow 0 on ≥ 95 % of frames) | **≤ 40** | **≤ 60** | ≤ 90 |
| … boss fights | +15 | +15 | +15 |
| Frame triangles (End) | **≤ 80k** | **≤ 150k** | ≤ 260k |
| Full-screen passes in play | 0 | 0 (1 only with the X1 FXAA fallback) | 0 |
| Programs per level, play | ≤ 30 | ≤ 40 I1–I2, **≤ 30** End | ≤ 36 (+ ≤ 36 cinematic variants, §3.3) |
| Character + enemy programs (`sc-*` + eye Basic + 2 hull) | ≤ 6 | ≤ 6 | ≤ 6 |
| Hero | ≤ 8 calls (no tufts), ≤ 16k; End ≤ 5 | ≤ 9, ≤ 16k; End **≤ 6** | same as Med |
| Companion kitten | ≤ 3 | ≤ 4, ≤ 8k; End ≤ 3 (body, eyes/atlas, hull) | same |
| Common enemy | ≤ 2 (no hull) | ≤ 3 incl. hull when engaged | ≤ 3 |
| Boss | ≤ 7, ≤ 25k | same | same |
| Grass (tufts, 1 draw incl. flowers) | 1.3k | 4k | 8k |
| Shadow map | none (blobs + vertex AO) | 1024 | 2048 |
| maxDpr | 1.25 | 1.25 | 1.5 |
| GPU frame [target until PERF §14.4] | real phone TBD | **≤ 9 ms** at 1080p, Iris Xe D3D11, s = 1 | ≤ 7 ms |

Worst case (hero, 2 companions, 8 enemies with 4 engaged, 1 boss) on Med End: 6 + 6 + (8 × 2 + 4) + 7 = **39**
character calls (from ~160), leaving ≈ 36 for world, decals, blobs, particles and UI-in-world inside the 75-call boss
ceiling.

---

## 11. Acceptance

### 11.1 Automated gates: smoke block `art:toon` (new `tests/smoke/art.mjs`, owner core)
Hooks (core `debug.js`, `?test` only):
- `__GAME__.art.frameStats({ exclude: 'actors' })` → `{ luma, chroma, warmth, dark, black }` from a 64 × 36
  `readPixels` grid in the same task as a render (the `sampleCanvas` pattern), excluding a 40 px box around every
  actor's projected bounds when asked.
- `__GAME__.art.heroChroma()` → `{ hero, ground }` (mean HSL chroma of pixels inside her projected silhouette vs a
  3 m ground disc).
- `__GAME__.art.featurePx(name)` → projected pixel width/height of a hero feature (`'eyeL' | 'eyeR' | 'bow'`) or of an
  enemy's `'top'` node. Characters expose `view.debugFeatures()` → `{ eyeL, eyeR, bow, top? }` Object3Ds.
- `__GAME__.art.shadowRatio()` → luma(shade sample) / luma(lit sample) at the level's `art.shadowProbe` (world
  authors one `{ lit: [x, z], shade: [x, z] }` pair per level next to a known caster).
- `__GAME__.art.composerActive` (bool), `__GAME__.art.programs()` → `renderer.info.programs` names + cache keys.

Runs each of meadow_day, forest_day, forest_night, town_occupied, hub_gold, hub_hush, gate_dusk, bog, keep_storm at
the start spawn and at one combat spot, iso camera, Med, 1280 × 720, after 30 frames. Phone checks run Low at
844 × 390 `hasTouch`.

| # | Gate | Pass |
|---|---|---|
| G1 | Brightness | mean luma 0.48–0.60 (night/keep ≥ 0.32) |
| G2 | Colourfulness | mean chroma 0.16–0.26 (night/keep ≥ 0.12) |
| G3 | Warmth | R−B +0.06…+0.16 (bog ≥ −0.02; night/keep ≥ 0.0) |
| G4 | Dark pixels | luma < 0.2 ≤ 8 % (night/keep ≤ 20 %) |
| G5 | No black world | luma < 0.06 < 0.5 % with actors excluded |
| G6 | Coloured shadows | `shadowRatio()` ≥ 0.45 (Med) |
| G7 | Haze | `fogAt(her)` < 0.03; top-edge mean hue within 20° of `fogColor`; edge fog 0.15–0.30 (spec) |
| G8 | Hero pop | `heroChroma.hero ≥ 1.3 × ground` (target 1.5) on every level |
| G9 | Frame budget | §10 calls / tris for the tier **at the stage the build is in** (`__GAME__.perf().stage` reports I1 / I2 / End) |
| G10 | Hero / enemy cost | hide-root deltas: hero ≤ 9 calls (End ≤ 6), ≤ 16k tris; rat ≤ 3 calls |
| G11 | Programs | `sc-*` + eye + hull programs ≤ 6 after the meadow with all M2 enemy types spawned; total ≤ the §10 tier row |
| G12 | Toon patch | no `[toon]` warning, no shader compile error in console on any level |
| G13 | Direct play | Low / Med: `composerActive === false` on every frame, cutscenes included. High: false in play, true inside a cutscene, false again after the hand-back |
| G14 | Phone face | Low 844×390 **CSS px at `deviceScaleFactor` 1**, d 12 m, hero facing south: each eye ≥ **4 px** tall, bow ≥ **6 px** wide (landscape only; portrait is judged in S8) |
| G15 | Enemy top colour | each enemy type's `top` ≥ **6 px** at 844×390 (same units) |
| G16 | Squash visible | landing from a jump at 13 m changes her silhouette height by ≥ 8 px (1080p) |
| G17 | Fonts | no request for Uncial, MedievalSharp or Cinzel files during boot (PERF §10.1 preloads Fredoka only, X18) |
| G18 | Enemy proportions | `debugFeatures().head` bbox height ÷ whole-model height ≥ 0.35 (rats, crows ≥ 0.40); eye diameter ≥ 0.06 m (§7.2 rule, measured in node from the bone-scaled bind pose) |
| G19 | No pink on enemies, none near the spine | unit: no `ENEMY_PAL` hex with hue 320–360° / 0–15° and S > 0.35; no flower or prop instance with a pink / orange hue within 3 m of a level's spine (world data scan) |

`research/next/tools/art2_frame_stats.py` stays the offline twin for screenshot folders.

### 11.2 Screenshot review (smoke saves; a reviewer Reads and judges)
| # | Shot | Pass when |
|---|---|---|
| S1 | meadow start, old vs new (`docs/screens` vs `tests/shots/art-meadow.png`) | all yes: the haze at the top edge is cream/peach, not grey; no near-black olive or black shadow; the hero is the most saturated thing; no jagged edges on her silhouette; G1–G5 numbers printed on the shot are in range |
| S2 | forest day + Lantern Night, town, hub gold + hush, gate, bog, keep | each matches its §2.5 identity; hush is sad but soft lavender |
| S3 | hero close-up (lens 2.5 m) and iso 13 m, side by side | cuter **and** still a knight; bow on the left ear reads from above; if the knight read fails, apply the 0.43 H / 0.58 H fallbacks |
| S4 | iso line-up: rat_pike, rat_xbow, crow, Fuzzball, hyena, pug, jelly around her | cute-menacing; nothing from the §7.1 forbidden column; each top colour visible |
| S5 | CS-02 hyena close-up, Spider Hollow, Crow Fields | no red eyes, no teeth rows, no black silhouettes |
| S6 | Holy charge, Golden Hour, parry in play (no bloom) | glow reads as special without bloom |
| S7 | UI 01–29, title, boss bar, dialogue | candy panels, Fredoka, cocoa ink, no parchment grain |
| S8 | phone 844×390 meadow combat | hero face and enemy tops readable; telegraph wedges pop on bright grass |
| S9 | kitten rescue burst (5-frame strip over 0.6 s) | all yes: confetti, stars, hearts and the pink ring are each visible; the camera eased in (Cosy beat) without overshoot; nothing red, grey or dark in the burst; the kitten hop is visible |

### 11.3 Unit tests
- core `contracts.test.js`: `installToon()` (§4.1); `RENDER.toon.sat ≤ 1.15`; `QUALITY` keys (`grassTufts`, `furShellsIso`, `furShellsClose`, `groundMist`, `cinematic`,
  `maxDpr`, `shadowMap`, `charTufts`, `outline`).
- world `world.test.js`: every `ENV_PRESETS` row has `shadowI`, `exposure`, `rim`; fogColor HSV saturation ≥ 0.12;
  `hub_grey` resolves to `hub_hush`; no preset colour with luma < 0.06 except night `fogColor` floors (≥ 0.08).
- characters `characters.test.js`: `Squash` conserves volume (`sx·sy·sz` within 1e-6 of 1); hero play LOD ≤ 16k
  tris (geometry count, node); `makeToonMaterial().customProgramCacheKey() === 'sc-toon-v2'`; eye texture options.
- enemies `enemies.test.js`: `remapPaletteTexture` on a synthetic 4-swatch canvas (exact swatch → target, luminance
  offset kept, cache hit returns the same texture); constant-scale-track stripper keeps non-unit tracks.

### 11.4 Timing re-measure (before any ms budget is frozen)
Follows PERF §14.1 exactly (idle-machine calibration, real Chrome on ANGLE-D3D11, private production build, 600
frames after a 120-frame settle): Med 1080p dpr 1.25 meadow, forest, town, gate, B1 mill; Low at 844×390 with 4× CPU
throttle. Results go to `research/next/tools/perf_results.json`; thresholds are then set per PERF §14.4. The X1 AA
A/B (canvas MSAA vs FXAA fallback) is part of this run.

---

## 12. Per-area task list (ownership per GAME_DESIGN §19.2; ports per CONTROLS_SPEC §12)

Phases: **A0** cost + warmth at near-zero risk → **A1** character diet → **A2** world, enemies and feel → **A3** UI,
audio, story, ambient. The controls rework is landing in parallel: every area rebases on its current files, codes
defensively against names that have not landed (`ctx.postfx?.setCinematic?.(…)`, `ENV_U ?? fallback`), and keeps
`slice:meadow`, `flow:*` and the controls smoke blocks green. Art never changes camera behaviour, input or nav logic.

### core (`src/core/**`, `tests/smoke.mjs`, `tests/smoke/art.mjs`, contracts tests) — port 5301 — A0
1. `Game.js`: renderer `antialias: true` on every tier, `NeutralToneMapping`, exposure from Env, `installToon()`
   before the first compile; remove `scene.background '#B7C0C3'` (Env sets it).
2. New `core/toon.js` (§4.1) + `RENDER.toon` config + unit test.
3. `PostFX.js`: direct-to-canvas play path on every tier; High-only cinematic `PostChain` (PERF C6 code, §3.3) with
   `setCinematic()` (tier-agnostic API); drop the vignette pass and `RENDER.vignette`; bloom threshold 0.9;
   `sceneStats` unchanged. Dynamic resolution = PERF C7 (`setPixelRatio` on every tier).
4. `config.js` `QUALITY`: the one merged key set of IMPLEMENTATION_PLAN §4 (written once, in PERF C8's commit, with
   CONTROLS §13 and AUTOCAM §12): `maxDpr` 1.25 / 1.25 / 1.5; `shadowMap` 0 / 1024 / 2048; `cinematic` false / false /
   true; `grassTufts` 1300 / 4000 / 8000; `furShellsIso` / `furShellsClose`; `charTufts` false / true / true;
   `outline` `'hero'` / `'heroCompanionsEngaged'` / `'all'`; `groundMist` 4 / 8 / 8; `bloomRes: 0.5`.
5. Shader warm-up through PERF `prewarm()` (§3.6); fur shells compile after T_title on the title screen.
6. `debug.js` art hooks (§11.1); `uViewport` shared uniform written on resize (exported for characters' hulls).
7. Smoke block `art:toon` (§11.1); contracts tests (§11.3).
Done when G9, G12, G13 pass on meadow and `slice:meadow` stays green.

### world (`src/world/**`) — port 5318 — A0 (Env, tokens) / A2 (grass, props)
1. `Env.js`: `TONE`, `ENV_U` (incl. glow / lamps, X5); the §2.5 rows (+ `shadowI`, `exposure`, `rim`, `hero` → glow);
   `hub_hush` + `hub_grey` alias; sun azimuth `level.cam.yaw + 1.75` in iso; `sun.shadow.intensity = shadowI`;
   `scene.background = fogColor`; exposure eased with the preset; `uSunDirV` per frame; character PMREM rebuild
   removed (High close-up PMREM only, prewarmed). `HeightFog.withHeightFog` carries `ENV_U` + the lamp/glow terms
   (`|hfog3`).
2. Casters (§3.4): stage 1 trim + per-kind depth materials; stage 2 statics-only cached map (PERF W10, `StaticShadow.js`)
   fitted from `cam.footprint`; Low vertex AO; hide the `far` group and sky dome in iso.
3. `Terrain.js` grounds, `GRASS_COLORS`, per-level grass colours, `FLOWER_COLORS` + flower shares, level stone tints,
   water colours, bog trees and lilies, keep braziers and bunting (§2.6, §8.3).
4. Standard → Lambert across world materials (§4.2); `applyInkRim()` helper (§4.3).
5. `Grass.js`: PERF W6 tufts (1 draw incl. flowers, `grassTufts` counts, footprint-centred tile) with §8.2 colours,
   width and up-bent normals.
6. Chunky props: bevels, ×1.25 interactables (visual + collider data), 0.06 m minimum, merge per biome (1–4 draws).
7. Ground light pools replace SunRays in iso (with fx); mist alpha cap 0.14.
8. `world.test.js` (§11.3); per-level `art.shadowProbe`; G1–G7, G19 pass. Bog 0.058 / keep_storm 0.042 when M3
   builds those levels (`world:fog-audit`).

### characters (`src/characters/**`) — port 5313 — A1 / A2
1. `materials.js`: `softRamp`, `makeToonMaterial`, `getToonMaterial` pools, `makeSteelMatcap`, `makeMetalMaterial`;
   `kitMaterial()` returns toon; remove Physical kit + `setCharacterEnvMap` use in play.
2. `Eyes.js`: unlit merged eyes, pupils, 3 catchlights, sclera option, lash, brows, `expressionGain` (§5.3).
3. `Fur.js`: shells and close-up geometry built in idle slices after load, shown on `setCloseUp(true)`;
   `FUR_LOD_ISO.heroLens` 0; Soft Fur default (§6.1); `setActivity(tier)` (X13) replaces AUTOCAM's `setOffscreen`.
4. Tuft `SkinnedMesh` (§6.2); `Outline.js` hulls (§5.4) on the existing proxy.
5. `KittenBuilder.js`, `configs.js`, `Armour.js`, `Bow.js`, `Cape.js`, `Sword.js`: §6.3 proportions, §6.4 play LOD +
   merge, `Squash` helper, glance-at-player, `debugFeatures()`; `palette.js` lifts and mischief mirror (§2.6).
6. `BeastHead.js` / `BeastDress.js`: hyena snout, 4 rounded teeth, round pupils, ears, round horns (§7.2).
7. `Plate.js` Fredoka words; `preview.js` Neutral. Unit tests (§11.3). Done when G10, G11, G14, S3 pass.

### player (`src/player/**`) — port 5314 — A2
1. `SwordcatModel.js`: drive `Squash` from the §6.5 event table; head lag 0.06 s; face pitch +8° toward the camera
   when idle/walking; glance-at-player when idle and out of combat.
2. Holy charge / Golden Hour: call fx glow hooks only (no `postfx.setBloom` in play). Done when G16 passes.

### camera (`src/camera/**`) — port 5312 — A1
1. `cam.closeUp` flag + `view.setCloseUp(on)` for her (and framed companions) when the lens is < 6.0 m (off > 6.3 m):
   presets, cutscene close shots, Meme Cam.
2. `postfx.setCinematic(true/false)` on preset / cutscene enter and exit (§3.3 seam rule; not Meme Cam).
3. D8 and D13 are decided (X8, X16); camera only runs `world:fog-audit` on bog / keep when they exist. No rig changes.

### enemies (`src/enemies/**`) — port 5316 — A2
1. `rig.js` `remapPaletteTexture`, constant-scale-track strip; `PALETTE_MAPS` beside `MODEL_FIT`.
2. Toon material pools for every type (`getToonMaterial`); replace the emissive-clone hit flash (`Enemy.js:1303`) with
   `uFlash`; wind-up `uHighlight` from `combat:telegraph`; hulls per `QUALITY.outline` (X9).
3. `props.js` `ENEMY_PAL`; §7.2 per-enemy changes (bone scales, eyes, brows, top colours, props); faint-and-poof
   defeat (with fx). Boneheads biscuit-bone (M3).
4. Budgets §7.4; mixer rates. Done when G10 (rat), G11, G15, S4, S5 pass and every `enemies:*` block is green.

### companions (`src/companions/**`) — port 5317 — A2
1. `LostKitten.js`, `HubKittens.js`, `NpcActor.js`, `Companion.js`: new kitten/villager configs (headScale 1.22 /
   1.05), tufts, hull on Med/High companions, glance-at-player for residents; `setCloseUp` passes through.
2. Rescue moment: emit `kitten:rescued` payload with the cage position (fx burst); kitten hop with 1.2× squash.

### fx (`src/fx/**`) — port 5319 — A0 (glow) / A2
1. **A0, before core removes bloom:** HolyFX charge, Golden Hour aura and parry read at bloom 0 (§8.5; S6).
2. `Poof.js` faint-and-poof + confetti; `Particles.js` / `shaders.js` `SHAPE.CONFETTI`; rescue burst (§8.6).
3. §8.4 replacements (Horde, feathers, dive shadow, sparks, telegraph cream rim); mist alpha cap; ground light pools.
4. `ScreenFX.js` → writes the ui `#ui-flash` layer (no red vignette).
5. A3: `Butterflies.js`, ambient profiles, cloud shadows (+2 draws total, off/halved on Low).

### ui (`src/ui/**`) — port 5322 — A0 (layers) / A3
1. A0: `#ui-vignette` and `#ui-flash` layers (every tier; excluded from `screenOccluders()`) + API
   `ui.flash(color, alpha, dur)` used by fx and story; `reduceFlashes` scales flash alpha ×0.3.
2. A3: candy tokens and components, boss bar, dialogue bubble, paint rules (§9.1); Fredoka-only `fonts.css` /
   `fonts.js` (§9.2). Done when S7 and G17 pass.

### audio (`src/audio/**`) — port 5320 — A3
1. §9.3 replace list. 2. P3: procedural glockenspiel (partials [1, 2.76, 5.40], amps [1, 0.35, 0.12]; rescue C6 E6 G6
C7 70 ms apart; fish pickup rising pentatonic), ambience beds, mix shelves.

### story (`src/story/**`) — port 5321 — A3
1. `strings.js:122` "Morning Practice"; CS-11 cue `hub_hush` (alias ok). 2. Ending calls `postfx.setCinematic`
through the cutscene runner. 3. `Overlay.js` fonts follow the CSS variables.

### physics (`src/physics/**`) — port 5311 — A2
1. No art code. After world's ×1.25 interactables and bevelled props land, re-run `physics:nav` and the nav unit tests;
   flag any collider that grew into a `minCorridor` 1.6 m path.

### combat (`src/combat/**`) — port 5315 — A2
1. No code change to `ATTACKS` reach. Sign off D15 (blade length kept, width ×1.25). Confirm `combat:telegraph` carries
   `windup` / `activeAt` (CONTROLS_SPEC §12 core 3 JSDoc) for the `uHighlight` lerp.

### save (`src/save/**`) — port 5323 — A3
1. Additive setting `reduceFlashes` (bool; first-run default = `prefers-reduced-motion: reduce`, like AUTOCAM's `reduceCameraMotion` [X31]; ui scales `#ui-flash` alpha ×0.3 when on). Schema stays v1.

---

## 13. Doc amendments (the doc owner applies; this file is the source)
- **GAME_DESIGN §17:** mood bullet → §2.1; "story told in light" list → §2.5 identities (golden meadow, dappled
  forest, sunny town, gold hub / lavender hush, sunset gate, teal bog, cosy torchlit keep, gold ending); "only warm
  light" → "brightest warm light"; post bullet → §3 (direct play, cinematic half-res bloom); fur bullet → §6.1.
- **GAME_DESIGN §18.3:** bog water `#2F3B33` → `#2FAE9E`; beast-head colours → §2.6 / §7.2.
- **art.md:** §0 mood → §2.1; §1/§2.1/§2.5 proportions and eyes → §5.3, §6.3; §3 fur → §6.1–6.2; §4.1–4.2 PMREM
  steel → §5.2; §6.2 tokens → §2.4–2.6; §9.1–9.2 light → §2.5; §10.1 grain and cool shadow tint `#2A3440` dropped;
  §11 enemies → §7; §12 biome table → §2.5; §15 "Don't: ink outlines" → "actors only, coloured ink, ≤ 2.4 px (§5.4)".
- **tech.md §18:** → PERF_SPEC §1 (budgets) and §10 here (art budgets). **CONTROLS_SPEC:** §2.8 fur line → §6.1;
  §2.8 shadow frustum → §3.4; §4.2 bog/keep ρ → D13; §4.2 grass width / radius → §8.2; §16.6 → §10.

## 14. Sign-offs still required (implementation may start; these gate the listed items only)
| Item | Who | Gate |
|---|---|---|
| ~~D8 no shells in play~~ | decided by X8 (Low/Med 0; High 4 only if PERF S2) | PERF S2, G10 |
| ~~D13 bog / keep~~ | decided by X16 (0.058 / 0.042) | `world:fog-audit` when M3 builds them |
| D15 head 0.46 H, shorter body, blade width | characters, combat | S3 |
| `hub_hush`, "Morning Practice", Grizzlechop monocle | story | S2 |
| Canvas `antialias: true` on every tier | decided by X1; the measured A/B (§11.4) may switch Med alone to the FXAA fallback | G9, S1 |

## 15. Rejected (do not implement)
Post Sobel / depth-normal outlines; hulls on every sub-mesh; art_2's WarmGrade pass in play; any full-screen pass in
play (including PERF §6.1's Med/High uber pass, X1); bloom on Low / Med or on the title or Meme Cam (X2); full-res UnrealBloom; the HalfFloat MSAA composer in play; PointLights (X6); bloom on Holy charge, Golden Hour or parry; art_0's
5-shell iso fur and the 25 m hero-shell rule; `toonGrade` sat > 1.15 or stacked with a screen grade; per-frame CPU
tuft matrices; baking the hero's eyes into vertex colours; `MeshPhysicalMaterial` sheen/clearcoat and per-preset
character PMREM in play; 16× per-eye Physical eyes; per-hit material clones; art_1's plum `uShadeTint` (D7); art_0's
ρ 0.018-style density cuts (D13); near-black anything (`#17181C` crows, black horde, `#8C8F88` concrete stone, grey
fog, red eyes, teeth rows, 8-eyed spiders, corpse clips); Uncial / MedievalSharp / Cinzel fonts, parchment grain,
chiptune results, NES jingles, glitch SFX, heartbeat, "Midnight Practice"; animated CSS `drop-shadow` filters,
`backdrop-filter` over the canvas, SVG noise; grass blades at 120k tris; any budget derived from the drafts' shared-GPU
ms figures; art_2's §8 cost estimates and unrun shaders until probed in-page.
