# art_2 — World, UI & FX mood: "warm cartoon, feels good inside"

Draft by the art/world-UI-FX design pass, 2026-10-11. DESIGN ONLY: nothing under `src/`, `tests/`, `index.html`,
`GAME_DESIGN.md` or `package.json` was touched. Every change below names its owner (GAME_DESIGN §19.2) and file.

User request: *"warm cartoonish kind of thematics so that everyone will feel great inside, not 90s kind of nostalgic
game. while performance must be extraordinary. and create maximum moba-like automatic camera control as well."*

This file covers the **world, UI, FX and audio mood**. It assumes the iso camera from `research/CONTROLS_SPEC.md`
(38° FOV, ~50° pitch, 13 m, focus fog, sky dome hidden in play). The key fact behind it: **seen from above, ground
covers 80–90 % of the frame**. So the terrain, grass and fog colours decide the mood, and the sky barely counts.

---

## 0. Diagnosis (measured)

`research/next/tools/art2_frame_stats.py` reads the current smoke screenshots. Each was shrunk to 240 px, and the
script measures mean Rec.709 luma, mean HSL chroma, mean (R−B) warmth and the share of pixels with luma < 0.2.

| Shot | Luma | Chroma | Warmth (R−B) | Dark % |
|---|---|---|---|---|
| lvl-meadow | 0.29 | 0.06 | −0.018 (cold) | 44 |
| lvl-forest | 0.28 | 0.08 | +0.040 | 40 |
| lvl-town | 0.36 | 0.11 | +0.097 | 11 |
| lvl-gate | 0.29 | 0.09 | +0.089 | 33 |
| lvl-bog | 0.28 | 0.08 | +0.047 | 49 |
| **lvl-keep** | **0.08** | **0.04** | +0.034 | **95** |
| title (ui/16) | 0.46 | 0.05 | +0.016 | 10 |

The screenshots show the cause: a grey fog wall, near-black olive grass, silhouetted dark trees and a heavy black
vignette. This is the "misty overcast photo" look that art.md §0 asked for, and it reads as gloomy and as an old-school
90s fantasy game. The serif and Uncial fonts and the parchment grain add to that.

**Targets for the new look** (same script; smoke can assert them, see §10):

| Metric | Play frames (all levels) | Keep / night variants |
|---|---|---|
| Mean luma | **0.48–0.60** | ≥ 0.32 |
| Mean chroma | **0.16–0.26** | ≥ 0.12 |
| Warmth (R−B) | **+0.06 to +0.16** (bog may be −0.02; teal is fine) | ≥ 0.0 |
| Dark pixels (luma < 0.2) | **≤ 8 %** | ≤ 20 % |
| Hero vs ground | her chroma ≥ 1.3 × the ground's chroma inside a 3 m disc around her | same |

---

## 1. The new mood rule (replaces art.md §0 "Mood rule", GAME_DESIGN §17 first bullet)

> **The world is a sunny pastel picture book: warm haze, soft round shapes, candy accents. The heroine is still
> the most saturated, most contrasted thing on screen.** Shadows are tinted (plum, teal, cocoa) and never black.
> Fog is a warm *haze* that frames the stage. It is never a grey wall. Every level has a *time of day you would want
> to be outside in*. Sad story beats use lavender and blue, never grey.

The reference shift: from "foggy photo + desaturated" to the bright, soft, rounded, high-key look of modern cosy
games, with clean saturated colours and gentle gradients. No CRT, pixel or chiptune nostalgia, no parchment grain, no
blackletter.

Three rules keep her readable in a brighter world:
1. **Value split.** Ground mid-tones sit at L* 55–72. She keeps her steel highlights (L* 90+) and dark pupils.
2. **Hue split.** The ground is yellow-green, cream or teal. Her ginger (#D4935A) and pink bow are kept off the ground
   palette. No orange or pink ground props within 3 m of her path (flowers are yellow, white, blue or lilac).
3. **Rim, not darkness.** She stands out through a cheap warm rim light, not through a dark world. See §3.4.

---

## 2. Renderer and grade: the cheapest big win (owner **core**: `Game.js`, `PostFX.js`, `config.js`)

### 2.1 Tone mapping: ACES → Neutral
`src/core/Game.js:98` uses `THREE.ACESFilmicToneMapping`. ACES desaturates and hue-shifts bright saturated colours:
orange drifts to yellow and pastels turn grey-white. That fights a candy palette. three r186 ships
`THREE.NeutralToneMapping` (Khronos PBR Neutral, since r162), which keeps hue and saturation up to the highlights.

```js
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = config.RENDER.exposure;   // RENDER.exposure 1.0 → 1.05
```
- **Cost: 0.** It is the same chunk in the same pass.
- Side effects: Holy and bloom highlights clip a little sooner. Move `RENDER.bloom.threshold` from 0.85 to **0.9**.
  Re-check the fur in `characters/preview.js:24` (it uses ACES too) so the preview matches the game.

### 2.2 One "WarmGrade" pass replaces the vignette pass (net pass count unchanged)
`config.js:276` sets a black vignette at darkness 1.15, which gives heavy black corners. Replace the
`VignetteShader` pass in `PostFX.js:106` with a pass that grades **and** vignettes in one full-screen tap. This adds
no cost, because it replaces a pass that already runs. It also closes the pending `postfx.setGrade` request
(STATUS "optional polish requests").

```js
// src/core/WarmGrade.js (core) — after OutputPass, display space. One texture fetch, ~12 ALU.
import * as THREE from 'three';
export const WarmGradeShader = {
  name: 'WarmGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uSat:   { value: 1.10 },                       // saturation (1 = none)
    uGain:  { value: new THREE.Color(1.03, 1.0, 0.95) }, // warm highlights
    uLift:  { value: new THREE.Color('#3A2440') }, // shadow tint (plum): shadows never reach black
    uLiftA: { value: 0.06 },
    uVigC:  { value: new THREE.Color('#B4664A') }, // warm vignette colour (cocoa-peach, not black)
    uVigA:  { value: 0.18 },                       // vignette strength
    uVigR:  { value: new THREE.Vector2(0.62, 1.15) },           // inner / outer radius
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) } // rgb + amount (rescue/holy white-gold flash, hurt pink)
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat, uLiftA, uVigA; uniform vec3 uGain, uLift, uVigC;
    uniform vec2 uVigR; uniform vec4 uFlash; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = c * uGain + uLift * uLiftA * (1.0 - l);                 // lift only the darks
      float r = length((vUv - 0.5) * vec2(1.0, 0.78)) * 1.42;
      float v = smoothstep(uVigR.x, uVigR.y, r) * uVigA;
      c = mix(c, c * uVigC * 1.25, v);                             // tinted, not black
      c = mix(c, uFlash.rgb, uFlash.a);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
```

**Grade table** (`PostFX.setGrade(name, dur)`; `Env` already carries `grade` in each preset):

| grade | uSat | uGain | uLift / uLiftA | uVigC / uVigA | Used by |
|---|---|---|---|---|---|
| `warm` (new default) | 1.10 | (1.03, 1.00, 0.95) | `#3A2440` / 0.06 | `#B4664A` / 0.18 | meadow, forest_day, town, hub_gold, gate |
| `teal` | 1.08 | (0.98, 1.02, 1.02) | `#1E3A44` / 0.07 | `#3E7F86` / 0.16 | bog |
| `cosy` | 1.12 | (1.06, 0.98, 0.90) | `#3A1E36` / 0.09 | `#7A3A2E` / 0.24 | keep, keep_cellar |
| `night` | 1.00 | (0.95, 0.98, 1.08) | `#2A2E5A` / 0.10 | `#2E3466` / 0.22 | forest_night, meadow_night, sky_night |
| `hush` (replaces `grey`) | 0.80 | (0.98, 0.98, 1.04) | `#4A3E6E` / 0.08 | `#6E5E9A` / 0.20 | hub after L4 (the Gloom) |
| `gold` | 1.15 | (1.08, 1.00, 0.88) | `#3A2A1E` / 0.05 | `#C98A3A` / 0.16 | ending, sky_sunrise, Golden Hour override |

Tween all uniforms over `dur` (Env already eases presets). The hurt flash, low-HP pulse and rescue flash move into
`uFlash`, so ScreenFX no longer needs a DOM vignette layer on med/high. **Low tier** has no composer, so the grade is
skipped there. Each preset's colours (§3) are already warm, so low still looks right, and a **static** CSS overlay
keeps the vignette:
`#ui-vignette{position:fixed;inset:0;pointer-events:none;background:radial-gradient(120% 95% at 50% 46%,#0000 62%,#B4664A2E 100%)}`.
A static overlay is composited on the GPU once and costs about nothing.

### 2.3 Shadows
`PCFShadowMap` stays. Shadow **colour**: three has no shadow tint, but the hemisphere ground colour (§3) is what fills
shadows, so warm `hemiGround` values give plum or olive shadows. **Do not** add the film grain or the cool shadow tint
`#2A3440` from art.md §10.1. Both are dropped.

---

## 3. Per-level palettes (owner **world**: `Env.js` `ENV_PRESETS`, `Terrain.js` palettes, level files)

Densities and `clear`/`topMul` stay as **CONTROLS_SPEC §4.2** sets them (the camera agents own readability). Two
exceptions are requested of world and camera: `bog` 0.07 → **0.058** and `keep_storm` 0.05 → **0.036**, because
the new fog colours are lighter and need less density for the same framing. This draft changes **colours, light and
grade** only. `skyTop` matters only in cutscenes and Meme Cam, because the dome is hidden in iso.

### 3.1 `ENV_PRESETS` rows (drop-in for `src/world/Env.js:21–37`)
```js
export const ENV_PRESETS = {
  // L1 golden meadow morning: butter haze, sky-blue zenith, low warm sun from the side
  meadow_day:     { fogColor:'#F4E2BE', fogDensity:0.045, fogLow:'#E6DCA0', skyTop:'#8FCDF2', hemiSky:'#D6ECFF', hemiGround:'#8FA653', hemi:1.25, sunColor:'#FFE3B0', sun:2.3, sunElev:0.70, sunAz:-0.7, grade:'warm', wind:0.6, env:0.55, hero:0.25 },
  meadow_evening: { fogColor:'#FFD2A6', fogDensity:0.020, fogLow:'#F2C08E', skyTop:'#B9A4E6', hemiSky:'#FFE2CC', hemiGround:'#8A6E54', hemi:1.15, sunColor:'#FFB878', sun:2.4, sunElev:0.22, sunAz:-1.9, grade:'warm', wind:0.5, env:0.55, hero:0.35 },
  meadow_night:   { fogColor:'#5A64A8', fogDensity:0.045, fogLow:'#4E5896', skyTop:'#2E3A7A', hemiSky:'#A8B4F0', hemiGround:'#3A4A3A', hemi:1.05, sunColor:'#D6E2FF', sun:0.9, sunElev:0.9, sunAz:0.6, grade:'night', wind:0.4, env:0.4, hero:1 },
  // L2 dappled forest: mint-gold haze, pollen in light pools
  forest_day:     { fogColor:'#DCE8BE', fogDensity:0.060, fogLow:'#C6DA98', skyTop:'#A3DCEB', hemiSky:'#DDF2D2', hemiGround:'#6E8C3E', hemi:1.2, sunColor:'#FFE8A6', sun:2.5, sunElev:0.85, sunAz:-0.5, grade:'warm', wind:0.4, env:0.5, hero:0.25 },
  // Lantern Night: friendly indigo, never black; lanterns and fireflies carry it
  forest_night:   { fogColor:'#3F4378', fogDensity:0.055, fogLow:'#3A4A6A', skyTop:'#252C66', hemiSky:'#8E96DE', hemiGround:'#2F4A40', hemi:1.1, sunColor:'#CFE0FF', sun:0.8, sunElev:0.9, sunAz:0.6, grade:'night', wind:0.3, env:0.35, hero:1 },
  // L3 sunny town: high noon-ish, crisp eave shadows; occupation is told by rat bunting, not by weather
  town_occupied:  { fogColor:'#F2E0C2', fogDensity:0.040, fogLow:'#E8D2AE', skyTop:'#86C6EE', hemiSky:'#FFF1DC', hemiGround:'#A08062', hemi:1.2, sunColor:'#FFE6BE', sun:2.4, sunElev:0.85, sunAz:-0.9, grade:'warm', wind:0.4, env:0.55, hero:0.2 },
  hub_gold:       { fogColor:'#FFE0B4', fogDensity:0.025, fogLow:'#F6CF9C', skyTop:'#9CC8F0', hemiSky:'#FFEED8', hemiGround:'#A07A58', hemi:1.2, sunColor:'#FFD49A', sun:2.6, sunElev:0.42, sunAz:-1.6, grade:'warm', wind:0.4, env:0.6, hero:0.2 },
  // the Gloom (after L4): sleepy lavender twilight, sad but soft. Renamed from hub_grey; keep 'hub_grey' as an alias
  hub_hush:       { fogColor:'#C6C0E4', fogDensity:0.045, fogLow:'#B4ACD8', skyTop:'#8C96D6', hemiSky:'#DCD6F5', hemiGround:'#6A6688', hemi:1.15, sunColor:'#F0DCF0', sun:1.2, sunElev:0.6, sunAz:-0.7, grade:'hush', wind:0.5, env:0.45, hero:0.6 },
  ending_gold:    { fogColor:'#FFE6BE', fogDensity:0.010, fogLow:'#F8D7A2', skyTop:'#8FCDF2', hemiSky:'#FFF2DC', hemiGround:'#9C805A', hemi:1.25, sunColor:'#FFD89E', sun:2.6, sunElev:0.38, sunAz:-1.6, grade:'gold', wind:0.4, env:0.6 },
  // L4 sunset gate: peach haze, violet zenith, long warm shadows across the causeway
  gate_dusk:      { fogColor:'#FFC09A', fogDensity:0.050, fogLow:'#F2A88A', skyTop:'#8C7ACB', hemiSky:'#FFD8BC', hemiGround:'#7A5A6C', hemi:1.2, sunColor:'#FF9F62', sun:2.4, sunElev:0.22, sunAz:-2.2, grade:'warm', wind:0.8, env:0.5, hero:0.35 },
  // L5 teal bog with fireflies: minty lagoon haze, sunlit; magic, not murk
  bog:            { fogColor:'#9ADCCF', fogDensity:0.058, fogLow:'#74C8B8', skyTop:'#86CCE6', hemiSky:'#D2F5EC', hemiGround:'#3E7260', hemi:1.25, sunColor:'#FFF0C6', sun:1.8, sunElev:0.75, sunAz:-0.6, grade:'teal', wind:0.3, env:0.5, fogFalloff:1.2, hero:0.35 },
  // L6 cosy torchlit keep: plum evening + amber braziers; storm = soft rain glints, no black
  keep_storm:     { fogColor:'#6E5480', fogDensity:0.036, fogLow:'#7A5A6A', skyTop:'#3E3270', hemiSky:'#C2AEE2', hemiGround:'#5A4048', hemi:1.5, sunColor:'#FFC488', sun:0.9, sunElev:0.35, sunAz:0.4, grade:'cosy', wind:0.8, env:0.5, hero:1 },
  keep_cellar:    { fogColor:'#6A4A50', fogDensity:0.028, fogLow:'#5E4048', skyTop:'#3E3270', hemiSky:'#E2B8A0', hemiGround:'#4A3436', hemi:1.5, sunColor:'#FFB070', sun:0.0, sunElev:0.8, sunAz:0.4, grade:'cosy', wind:0.0, env:0.4, hero:1 },
  sky_night:      { fogColor:'#4A5498', fogDensity:0.020, fogLow:'#4A5498', skyTop:'#24306E', hemiSky:'#A8B4F0', hemiGround:'#2A2E52', hemi:1.0, sunColor:'#D6E2FF', sun:0.9, sunElev:0.8, sunAz:0.5, grade:'night', wind:1.2, env:0.4, hero:1 },
  sky_sunrise:    { fogColor:'#FFE2C0', fogDensity:0.006, fogLow:'#FFE2C0', skyTop:'#9CCBF0', hemiSky:'#FFF2DC', hemiGround:'#9C805A', hemi:1.2, sunColor:'#FFD49A', sun:2.4, sunElev:0.25, sunAz:-1.6, grade:'gold', wind:1.0, env:0.6 },
};
```
- `hero` > 0 by day turns on the existing `HERO_LIGHT` at low intensity (0.2–0.35 × 4.4). It adds a warm key that
  keeps her ginger glowing against the bright ground. It is free: the light already exists at intensity 0, so the
  light count and shader programs do not change.
- `scene.background` (`Game.js:108`, now `#B7C0C3`) must become the fog colour of the current preset. Env should set it
  on every preset change (CONTROLS_SPEC §4.1 already says "clear colour = fogColor in iso").
- **Keep "storm":** lightning becomes a 0.12 s lilac flash through `uFlash` (`#E8DCFF`, a = 0.25). Rain is 300
  streaks (one draw) with warm brazier glints. No darkening.

### 3.2 Ground palettes (`src/world/Terrain.js:13–18`): the #1 lever in iso
```js
meadow: { root:'#5C8A36', mid:'#86B44A', dry:'#CFC27A', path:'#E2C996', pathDark:'#C4A574', soil:'#9C7650', mud:'#7E6248', field:'#C8B862' },
forest: { root:'#4E7A38', mid:'#6E9E48', dry:'#B8B46E', path:'#D6B88A', pathDark:'#B0946C', soil:'#8A6A4A', mud:'#6E5640', field:'#A6B060' },
town:   { root:'#7AA052', mid:'#98BA62', dry:'#D8CC90', path:'#E8D7B6', pathDark:'#CDB894', soil:'#A88A68', mud:'#8A7058', field:'#C6BC80' },
gate:   { root:'#7C9A4E', mid:'#A0B05A', dry:'#E0BE84', path:'#EBC69E', pathDark:'#CFA27E', soil:'#A87A5C', mud:'#8A6450', field:'#D6B276' },
bog:    { root:'#3E8A6A', mid:'#5AA87A', dry:'#A8C67C', path:'#D2C29A', pathDark:'#B09E7A', soil:'#7A6A50', mud:'#5E5A48', field:'#86B47A' },
keep:   { root:'#8A7268', mid:'#A68A7A', dry:'#C8A890', path:'#D8BCA0', pathDark:'#B8987E', soil:'#8A6A5A', mud:'#6E5450', field:'#B09080' },
```
- Grass: per-level `grass.colors` uses root ≈ ground `root`, tip ≈ ground `mid` lifted by 30 % L, and dry = `dry`.
  Meadow is root `#4F7A2E`, tip `#B8DA6A`, dry `#E8D27C`. Bog (`bog.js:26`, now `#1E2614`/`#6A6E3E`) becomes root
  `#2E7A5E`, tip `#9ED88E`, dry `#D6D88A`.
- `Grass.js:21` `FLOWER_COLORS` (muted) becomes `['#FFD84A', '#FFFFFF', '#8EC8FF', '#FFF2B0', '#C9A8FF']`
  (buttercup, daisy, cornflower, primrose, lilac). There are no pink or orange flowers, so they never compete with her
  bow or fur. The flower share of the instances goes from the current share to **8 %** along path edges (within 4 m of
  the spine) and **3 %** elsewhere. That is the same draw.
- Rocks and walls through `kit.tpl(..., { tint, mul })`: warm sandstone `#E3CFAE` (meadow and town), mossy cream
  `#D8D2B0` (forest), coral sandstone `#E8B898` (gate), sea-glass grey-green `#B8D2C4` (bog) and honey stone
  `#C8A486` (keep). The `env/graveyard/stone-wall` used in `meadow.js:27` gets `tint:'#E8D6B4'`.
- **Bog trees** (`bog.js:21`: `tree_*_dark.glb`): switch to `tree_default.glb`, `tree_oak.glb` and `tree_thin.glb`
  with a `tint:'#7FC8A0'` canopy, plus 12 `plant_flatTall` "giant lily" stems capped with 0.8 m lily-pad discs
  `#6CC07A` and one cream flower `#FFF6D8`.

### 3.3 Per-level mood sheet

| Level | Time / weather | Key colours | Ambient life (§5) | Signature dressing |
|---|---|---|---|---|
| **meadow** ("golden meadow morning") | 08:30, light haze | haze `#F4E2BE`, grass `#86B44A`, sky `#8FCDF2`, flowers yellow/white/blue | 18 butterflies, dandelion fluff 60, gold motes 30, 3 drifting cloud shadows | windmill sails turning, haystacks, bunting on the practice field, cows with bells |
| **forest** ("dappled forest") | 11:00 | mint-gold `#DCE8BE`, moss `#6E9E48`, mushrooms `#FF7A5C` caps with cream spots | 12 butterflies, pollen motes 40 in light pools, 24 ground light pools | glow mushrooms `#9CF2DC` (emissive), acorn lanterns |
| forest (Lantern Night) | 21:00 | indigo `#3F4378`, lantern amber `#FFC46B` | fireflies 70 (`#F4FF9A`) | the camp's string lights (emissive spheres + bloom, no point lights) |
| **town** ("sunny town") | 13:00 | plaster `#FFF4E2`, roof terracotta `#E07A52`, slate `#8AA4C8`, awnings in candy stripes | 10 butterflies, petals 30, chimney puffs | flower boxes on every 2nd window, rat bunting (mustard/grey) while occupied, pink-gold paw banners when free |
| **hub** gold / hush | 16:30 / after L4: lavender dusk | gold `#FFE0B4` / lavender `#C6C0E4` | gold: petals + motes; hush: slow lilac "gloom puffs" | lit windows `#FFD38A` (emissive) in hush, so it still feels like home |
| **gate** ("sunset gate") | 19:00 | peach `#FFC09A`, violet sky `#8C7ACB`, sandstone `#E8B898` | swallows (6), warm motes | long shadows along the causeway; pennants |
| **bog** ("teal bog with fireflies") | 10:00 bright-misty | mint `#9ADCCF`, lagoon water `#2FAE9E`, lily `#6CC07A` | fireflies **by day too** (50, intensity 1.2), dragonflies (8, butterfly mesh variant), bubbles | giant lilies, reed tufts, cream boardwalks `#E8D6B0` |
| **keep** ("cosy torchlit keep") | 20:00, drizzle | plum `#6E5480`, honey stone `#C8A486`, amber `#FFA54A`, banner cherry `#D8404E` | lantern sparks (ex-embers, `#FFC46B`, rise 0.5), rain 300 | braziers in pairs every 12 m (emissive + bloom), bunting on the ramparts, a cosy hearth room in the cellars |

### 3.4 Hero rim (owner **characters**, optional and cheap)
On fur (`Fur.js`) and plate, add a fresnel rim `rim = pow(1.0 - dot(N, V), 3.0) * uRim`, coloured `#FFE6B8` by
day and `#FFD08A` at night, uRim 0.35. It adds 3 ALU per fragment on the hero only. The iso view looks down on her
head, so the rim mostly outlines the ears, cheeks and pauldrons, and that is where readability is needed.

---

## 4. Gloomy, creepy and 90s elements to replace (complete list from code and assets)

| # | Where | Now | Replace with | Owner |
|---|---|---|---|---|
| 1 | `art.md §0`, `GAME_DESIGN §17` mood rule | "world desaturated, misty, grey-green" | §1 rule | design (orchestrator) |
| 2 | `Env.js:22–37` all presets | grey fogs `#B7C0C3`, `#9AA196`; keep `#4B3F42` / sky `#2E2A33` | §3.1 | world |
| 3 | `Env.js:29` `hub_grey`, grade `'grey'` | grey hub after L4 | `hub_hush` lavender + grade `hush` (keep `hub_grey` as an alias so story's `env:set` still works) | world, story (rename in CS-11 cue) |
| 4 | `Game.js:98`, `characters/preview.js:24` | ACES tone mapping | Neutral (§2.1) | core, characters |
| 5 | `config.js:276` | vignette darkness 1.15, black | WarmGrade (§2.2) | core |
| 6 | `Game.js:108` | `scene.background '#B7C0C3'` | fog colour of the preset | core / world |
| 7 | `Terrain.js:13–18` | near-black olive grounds (`#28311A`, keep `#2A2628`) | §3.2 | world |
| 8 | `Grass.js:21` | muted flowers `#B5809E`, `#A88BB5` | §3.2 | world |
| 9 | `bog.js:21` | `tree_*_dark.glb` silhouettes | light trees + tint (§3.2) | world |
| 10 | `bog.js:26`, bog water `#2F3B33` (GAME_DESIGN §18.3) | swamp-dark grass and water | teal grass; water `#2FAE9E`, roughness 0.08, sparkle spec | world |
| 11 | `keep.js` `grass:false`, rocks, `keep_storm` | 95 % dark pixels | honey stone, brazier pairs, plum sky, bunting | world |
| 12 | `fx/Horde.js:23` | 40 black `#2A2A2E` silhouettes in fog (creepy) | cartoon "dust-cloud army": warm brown `#8A6450` silhouettes with a cream dust puff band at the feet (same instanced draw); their laughs stay comic | fx |
| 13 | `fx/Poof.js:32` | feathers `#2B2A36` | `#6A6A8E` (slate-lilac) | fx |
| 14 | `fx/Telegraphs.js:434`, `config.js:191` `shadow:'#000000'` | crow dive shadow pure black `#05070A` | plum `#3A2346` at alpha 0.55; it is still the darkest thing on the ground, so it still reads | fx, core |
| 15 | `fx/Ambient.js:13,22` | keep "embers" `#FF7A3D` + ash (war-zone feel) | "lantern sparks" `#FFC46B`, rise 0.5, count 40; drop `ash` | fx |
| 16 | `fx/ScreenFX.js` | red hurt vignette, red low-HP pulse (DOM layer) | `uFlash` pink `#FF8FB1` at a = 0.18 for 0.25 s; low HP = a soft pink edge pulse at 1 Hz (a ≤ 0.12) plus the hearts' own wobble | fx (core uniform) |
| 17 | `ui/ui.css:5–9`, `:23–27` | parchment + SVG noise grain + gold studs (old-RPG) | candy panels (§6) | ui |
| 18 | `ui/fonts.css`; `characters/Plate.js` | Cinzel, Cinzel Decorative, **Uncial Antiqua**, **MedievalSharp** | Fredoka 500–700 for everything; logo optional Cinzel Decorative Bold only (§6.3) | ui, characters, story (`Overlay.js`) |
| 19 | `ui/ui.css:403` | menu backdrop dark brown `#1A100Acc` + blur | warm scrim `radial-gradient(#FFF1E200, #5A3B2E80)`, no blur (§8) | ui |
| 20 | `ui/ui.css:80` `pulseRed` | red danger pulse with hue-rotate | pink-coral `#FF7A8A` scale pulse, transform only | ui |
| 21 | `story/strings.js:122` `tut.title` | "Midnight Practice" (and the meadow title screen in fog) | "Morning Practice" (the tutorial runs in `meadow_day`) | story |
| 22 | `audio/musicMap.js:27,57` | `dark_forest_creepy` for Lantern Night | `field_of_dreams` at rate 0.94 + crickets/owl bed, or `tavern_old_tower_inn` around the camp (8 m) | audio |
| 23 | `musicMap.js:35,91` | `victory_8bit_loop` results (chiptune = 90s) | `festival_minstrel_dance` (first 20 s, looped) or `victory_fanfare` → `village_bards_tale` | audio |
| 24 | `sfxMap.js:108,148,150,216,259` | `jingles_NES*` (chiptune) | `jingles_PIZZI*` / `jingles_STEEL*` + procedural glockenspiel (§9) | audio |
| 25 | `sfxMap.js:46` | charge fizzle `ui/glitch_001` (digital glitch) | soft "pfft": zzfx noise burst 0.12 s, lowpass 1.2 kHz, plus `pickup/bubble` at rate 0.7 | audio |
| 26 | `sfxMap.js:114` | crow caw = `c80_scream` | zzfx `crowCaw` first (lighter), or the scream at rate 1.7 with lowpass 3 kHz, vol 0.4 | audio |
| 27 | `sfxMap.js:488` | heartbeat on Still Standing | "purr swell": `cat_purrsleepy_loop` 1.2 s + a rising glock third (G5→B5) | audio |
| 28 | `musicMap.js:64–65` | `cave_theme` for bog and keep | bog: `field_of_dreams` + water and frog bed; keep: `castle_kings_feast` at 0.7 explore (cosy hall), `battle_theme_a` for courtyard combat | audio |
| 29 | `musicMap.js:60,90` | `story_lament` loops in the grey hub | lament only for the 1 scene; hub hush loops `village_bards_tale` at rate 0.92, lowpass 2.2 kHz (sad but home) | audio |
| 30 | `audio/nature.js` | "Gloom rumble" (sub-bass dread) | a low airy wind "whoo" + chime tail (no sub-bass under 80 Hz) | audio |
| 31 | `sfxMap.js:135,193` | `c80_howl` death and far horn | keep it for Barkus (a comic villain howl) but pitch it up (rate 1.0–1.1) and shorten to 0.8 s | audio |
| 32 | Boneheads (`Skeleton_*.glb`) | white skeleton soldiers (graveyard tone) | "biscuit-bone" toy soldiers: warm bone `#F3E2C4` (`tint`), the `*_Eyes` node shown as big round black eyes with a white catchlight (CanvasTexture), pot helm, a mustard bandana on bone `chest`. Collapse = a cartoon clatter + a star ring; no skull close-ups in cutscenes | enemies, characters |
| 33 | Gloomjelly name and look | bog green `#7FD38A` (ok) | keep; add 2 eye catchlights and a blush-free smile; giant jelly gets a gold crown glint | enemies |
| 34 | art.md §10.1 | proposed film grain 0.025, cool shadow tint `#2A3440` | dropped | design |
| 35 | GAME_DESIGN §17 "Her glow is the only warm light in the cold biomes" | cold biomes | no cold biomes: her glow is the *brightest* warm light, not the only one | design |

Kept on purpose, because they are cosy rather than creepy: Pudding the dragon, the hyena laugh (comic), the spiders'
webs (in Spider Hollow make the webs dewy and sparkly: additive `#FFFFFF` dots, 0.4), and lantern night as a festive
indigo.

---

## 5. Ambient life: flowers, butterflies, sparkles (owner **fx** unless noted)

Budget: **+2 draw calls in total** (butterflies and light pools). Everything else reuses existing instanced pools.

### 5.1 Butterflies (`fx/Butterflies.js`, new; also dragonflies and swallows via `kind`)
One `InstancedMesh`, 2 quads hinged at x = 0 (4 tris), so 24 instances is 96 tris and **1 draw**. Wings are drawn as
an SDF in the fragment shader, so no texture is needed. The flap and the path both run in the vertex shader. CPU work
is one `uFocus` uniform per frame and nothing per instance.

```js
const geo = new THREE.BufferGeometry();       // two wings: x∈[-1,0] and [0,1], z∈[-0.6,0.6]
geo.setAttribute('position', new THREE.Float32BufferAttribute([ -1,0,-.6, 0,0,-.6, 0,0,.6, -1,0,.6,  0,0,-.6, 1,0,-.6, 1,0,.6, 0,0,.6 ], 3));
geo.setIndex([0,1,2, 0,2,3, 4,5,6, 4,6,7]);
geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds /* Float32Array(n*4): phase, radius, height, hue index */, 4));
const mat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide, transparent: false, alphaTest: 0.5, fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime:{value:0}, uFocus:{value:new THREE.Vector3()}, uScale:{value:0.16},
    uPal:{ value:[new THREE.Color('#FFE066'), new THREE.Color('#8FD3FF'), new THREE.Color('#FFB38A'), new THREE.Color('#FFFFFF')] } }]),
  vertexShader: /* glsl */`
    uniform float uTime, uScale; uniform vec3 uFocus; attribute vec4 aSeed; varying vec2 vW; varying float vHue;
    #include <fog_pars_vertex>
    void main(){
      float t = uTime * (0.35 + fract(aSeed.x * 7.1) * 0.2) + aSeed.x * 6.283;
      vec3 c = uFocus + vec3(cos(t) * aSeed.y + sin(t * 2.3) * 1.2, aSeed.z + sin(t * 3.1) * 0.25, sin(t * 0.8) * aSeed.y);
      float flap = sin(uTime * 16.0 + aSeed.x * 40.0) * 1.15;          // ~2.5 Hz wingbeat
      vec3 p = position;
      p = vec3(p.x * cos(flap), abs(p.x) * sin(flap) , p.z);            // fold around the hinge
      float yaw = t + 1.57; mat2 R = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)); p.xz = R * p.xz;
      vec4 mvPosition = viewMatrix * vec4(c + p * uScale, 1.0);
      vW = position.xz; vHue = aSeed.w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uPal[4]; varying vec2 vW; varying float vHue;
    #include <common>
    #include <fog_pars_fragment>
    void main(){
      vec2 w = vec2(abs(vW.x), vW.y);
      float d = min(length((w - vec2(0.5, -0.22)) * vec2(1.0, 1.4)), length((w - vec2(0.42, 0.25)) * vec2(1.2, 1.7)));
      if (d > 0.42) discard;                                            // two-lobe wing
      vec3 col = uPal[int(vHue)] * (d > 0.33 ? 0.75 : 1.0);            // darker edge band = cartoon outline
      gl_FragColor = vec4(col * 1.15, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
```
- Counts: meadow 18, forest 12, town 10, hub 14, bog 8 dragonflies (`kind:'dragonfly'`: slim 4-wing variant via
  `uScale` (0.22, 0.06) and hue `#7FE0D0`), gate 6 swallows (dark-blue `#3A4A8A` V-shapes, high, fast). Low tier uses
  **half** the counts.
- Orbit radii 4–14 m around `cam.focus`, height 0.6–1.8 m. They never come within 1.2 m of her head; push them out in
  the shader with `c.xz += normalize(c.xz - uFocus.xz) * max(0., 1.2 - dist)`. When an arena locks, the swarm moves
  to radius 10–16 m so it never crosses the fight.
- Fog uses the CONTROLS_SPEC `hfogFactor` helper (the same patch as Horde and Telegraphs).

### 5.2 Light pools and cloud shadows (world `Terrain` + fx; 1 draw)
- **Forest light pools:** 24 additive ground ellipses (`InstancedMesh`, `PlaneGeometry` 1×1, radial SDF, colour
  `#FFF0B8`, alpha 0.16, `depthWrite:false`, y + 0.02). Each slowly breathes ±10 % with wind. Pollen motes (Ambient
  `dust` recoloured `#FFF2B0`) cluster at their centres. This replaces the SunRays cones in iso, which are invisible
  from above.
- **Cloud shadows (meadow, town, gate):** in the terrain and grass fragment shaders only (2 materials), multiply
  albedo by `mix(1.0, 0.86, cloud)`. `cloud = smoothstep(0.55, 0.75, texture(uCloudTex, wp.xz * 0.012 + uWind *
  uTime * 0.01).r)`, using a 128² R8 noise `DataTexture` built once. Cost: 1 tap per ground fragment. Drifting soft
  shadows are the cheapest way to make a sunny world feel alive. Off on low.

### 5.3 Sparkles and motes (`fx/Ambient.js` profile table)
Add or replace profiles (same 1-draw pool):
```js
motes:    { color:'#FFE9A8', count:30, size:0.8, intensity:1.4, rise:0.05, drift:0.25, blink:0.8, wobble:0.7 },  // gold motes, additive
fireflies:{ color:'#F4FF9A', count:70, size:1.1, intensity:2.2, rise:0.05, drift:0.12, blink:1.0, wobble:1.2 },  // bog day uses intensity 1.2
sparks:   { color:'#FFC46B', count:40, size:0.8, intensity:1.8, rise:0.5,  drift:0.25, blink:0.5, wobble:0.6 },  // keep (replaces embers)
petals:   { color:'#FFF3F6', count:30, size:1.3, intensity:0.6, rise:-0.08, drift:0.6, blink:0.1, wobble:1.0 },  // town/hub
```
The level → profile pick (`Ambient.js:22`) becomes: meadow `fluff + motes`, forest_day `motes`, forest_night and bog
`fireflies`, town and hub `petals`, gate `motes`, keep `sparks`. Two profiles at once need two pools at 1 draw each.
That is fine, because it stays inside the ≤ 2000-particle budget (fluff 60 + motes 30).

---

## 6. Candy UI (owner **ui**: `ui.css`, `fonts.css`, `hud.js`, `menus.js`)

### 6.1 Tokens (replace `ui.css:5–9`)
```css
:root{
  --cream:#FFF8EE; --cream2:#FCEBD6; --cocoa:#5A3B2E; --cocoa2:#8A6656;        /* ink is cocoa, never near-black */
  --pink:#F2A2B8; --pinkHi:#FFC8D8; --pinkDeep:#E07396; --pinkDark:#B8557A;    /* brand pink kept (her bow) */
  --sky:#8FD3FF; --skyHi:#C8ECFF; --skyDeep:#4AA6E0;                             /* secondary / info */
  --butter:#FFD86B; --butterDeep:#E8A93A; --mint:#9BE3C4; --mintDeep:#4DBE92; --lilac:#C9A8FF; --coral:#FF7A8A;
  --heart:#FF6F9C; --danger:#FF5E6E;
  --r-s:12px; --r-m:20px; --r-l:28px;
  --sh-pop: 0 5px 0 #E0739655, 0 12px 24px #5A3B2E26;                          /* soft shadow + candy ledge */
  --ease-pop:cubic-bezier(.34,1.56,.64,1); --ease-squash:cubic-bezier(.2,.9,.3,1.4);
}
```

### 6.2 Components
```css
.panel{ color:var(--cocoa); border-radius:var(--r-l); padding:1.1em 1.3em;
  background:linear-gradient(180deg,var(--cream) 0%,var(--cream2) 100%);
  border:3px solid #fff; box-shadow:0 0 0 3px var(--pinkHi), var(--sh-pop), inset 0 -5px 0 #F2C9A833; }
.panel::before,.panel::after{ display:none; }                                     /* drop the gold studs + grain */
.btn--candy{ border-radius:999px; color:#fff; font-weight:700; border:0;
  background:linear-gradient(180deg,var(--pinkHi),var(--pink) 48%,var(--pinkDeep));
  box-shadow:0 5px 0 var(--pinkDark), 0 10px 18px #B8557A40, inset 0 2px 0 #ffffffb0;
  text-shadow:0 2px 0 var(--pinkDark); transition:transform .22s var(--ease-pop); }
.btn--candy:active{ transform:translateY(3px) scale(.96,.92); transition-duration:.07s; }
.btn--sky{ background:linear-gradient(180deg,var(--skyHi),var(--sky) 48%,var(--skyDeep)); box-shadow:0 5px 0 #2F7FB8, inset 0 2px 0 #fff9; text-shadow:0 2px 0 #2F7FB8; }
.btn--butter{ background:linear-gradient(180deg,#FFF0B0,var(--butter) 48%,var(--butterDeep)); color:var(--cocoa); box-shadow:0 5px 0 #B87E1E; text-shadow:none; }
@keyframes popIn{ 0%{transform:translateY(14px) scale(.8);opacity:0} 60%{transform:translateY(-3px) scale(1.06);opacity:1} 100%{transform:none} }
.pop-in{ animation:popIn .28s var(--ease-pop) both; }
@keyframes wiggle{ 0%,100%{transform:rotate(0)} 25%{transform:rotate(-8deg) scale(1.15)} 75%{transform:rotate(6deg) scale(1.1)} }
```
- **Roles:** pink = primary and confirm. Sky = secondary, info and map. Butter = rewards (fish, shop buy). Mint =
  heal and done ticks. Lilac = letters. The danger/low state uses coral, not blood red.
- **Motion rules:** every panel enters with `popIn` (280 ms). Toasts slide in from the top with a 6 % overshoot and
  stack with a 60 ms stagger. A gained heart pops `scale 1.35 → 1` (220 ms); a lost heart does `wiggle` and then
  empties. Counters (fish, kittens) bump `scale 1.25` and flash butter. Buttons squash on press (70 ms) and spring back
  (220 ms). `prefers-reduced-motion` and the accessibility "reduce motion" setting turn all of these into 120 ms
  fades.
- **Boss bar:** the track is cream `#FFF8EE` with a white 3 px border and the fill is a gradient
  `#FF8A7A → #E64D6A`. The damage trail is butter `#FFD86B`, not white. The name ribbon is plum `#7A4E9A` (the enemy
  side; pink stays for the heroes).
- **Dialogue:** a cream bubble with radius 28 px and a 16 px tail toward the speaker portrait. The name is a pill in
  the speaker's signature colour (Mochi sky, Sage mint, Clover butter, Pearl pink). The next-prompt is the bouncing paw
  (it exists).
- **World tags and prompts:** the same cream pill, the key glyph on a pink circle, and a 2 px white outline so they read
  over bright grass.

### 6.3 Fonts (and a load-time win)
- **Fredoka** (variable, already shipped) for everything: HUD 600, headings 700, body 500. Its round shapes give the
  "feel-good" look on their own.
- Logo: either Fredoka 700 with a butter → gold gradient fill and a 5 px cocoa stroke (`paint-order: stroke fill`),
  with the pink bow on the "O", or keep `CinzelDecorative-Bold` for the **logo only**.
- Drop `UncialAntiqua` (62 KB), `MedievalSharp` (145 KB), `Cinzel-Variable` (122 KB) and `CinzelDecorative-Regular`
  (59 KB). That is **−388 KB** of fonts out of the boot path, or **−449 KB** if Fredoka also takes the logo.
  - Letters use Fredoka 500 italic-ish (`font-variation-settings` slant is not available, so use `transform: skewX(-4deg)`
    on the letter body) on a lilac-edged notecard.
  - Breastplate words (`characters/Plate.js`) use Fredoka 700 drawn with a ±3° jitter per glyph.

---

## 7. Juicy VFX (owner **fx**; uses the existing `Particles.js` pools: 0 new draws)

Add `SHAPE.CONFETTI = 12` to `Particles.js` and `fx/shaders.js` `fxShape`: a rounded rectangle whose x-size is
multiplied by `abs(cos(age * flipHz + seed))`, so it tumbles and flips. It uses the alpha pool.
```glsl
// in fxShape(): id 12
else if (s > 11.5) { vec2 q = abs(uv) - vec2(0.55, 0.32); float flip = abs(cos(vAge * 9.0 + vSeed * 6.283));
  q.x = abs(uv.x) / max(flip, 0.15) - 0.55; a = 1.0 - smoothstep(0.0, 0.06, max(q.x, q.y)); }
```

| Moment (bus event) | Recipe (counts, colours, timings) | Particles |
|---|---|---|
| **Kitten rescued** (`kitten:rescued`) | 1) 0.00 s: white-gold `uFlash` (a 0.22, decays over 0.18 s). 2) 0.00 s: a confetti cone up from the cage, 60 pieces, speed 3–5.5, gravity 3.2, drag 1.4, life 1.6–2.2 s, colours `#FF8FB1 #FFD84A #8FD3FF #9BE3C4 #FFFFFF #C9A8FF`. 3) 0.05 s: 10 `STAR5` additive `#FFE066`, intensity 2.0, a radial burst at 2.5 m/s. 4) 0.15 s: 8 `HEART` `#FF6F9C` rising at 0.8 m/s with a sway of 0.3, life 1.4 s. 5) A pink ring shockwave (Shockwaves.js) r 0 → 2.2 m in 0.35 s. 6) The kitten does a hop with 1.2× squash. 7) Camera: a dolly −0.8 m over 0.4 s, hold 0.6 s, release (a camera request). | 78 |
| Enemy poof (exists) | keep the stars; add 4 `CONFETTI` in faction colours (rats mustard `#E8C04A`, crows slate-blue `#6A7AB8`, hyenas tan `#D8A86A`) | +4 |
| Hit on enemy | replace the spark streaks with 3 `STAR4` (`#FFFFFF` → `#FFE066`) and a 0.12 s "bonk" white disc (SOFT, size 0.5) | 4 |
| Crit | the above + a damage number in butter with a 2-star crown; the number pops `0 → 1.3 → 1` in 180 ms (ease-out-back) | 6 |
| Parry | white ring + 6 `STAR4` + 1 `STAR8` flare `#FFF6DA` 0.1 s | 8 |
| Pickup fish | DOM: the icon flies from its screen position to the HUD counter on a quadratic arc in 420 ms (pool of 8 `<img>`, transform only); the counter bumps | 0 |
| Heal / milk | 6 mint `#9BE3C4` plus signs (`STAR4` rotated 45° reads as "+") rising, plus a heart pop on the HUD | 6 |
| Footsteps (run) | every 2nd step, 2 tiny cream puffs `#F6EBD6`, size 0.12, life 0.35 s; on grass in meadow/forest, 1 petal of the level's flower colour in 1 of 5 | 2 |
| Vigil Stone / save | a gold ring + 12 motes spiralling up + a stamped paw toast "Saved!" | 13 |
| Objective done | 24 confetti from the top of the screen in screen space (UI layer, CSS; see §8 perf) **or** world confetti at her | 24 |
| Level results | a confetti curtain: 120 pieces over 2 s from above the camera focus | 120 |

All counts are well inside the 2000 cap (500 on low; on low, scale every count ×0.5 and drop HEART and CONFETTI
spin, so they render flat).

**Telegraphs stay legible.** Red `#FF3B30` and aoe `#FF6A3D` are gameplay language and **stay**. Give them a 2 px
cream rim so they pop on bright grass (the uRim uniform already exists in `Telegraphs.js:199`, set it to `#FFF6E8`).
The background change makes them read better than before.

---

## 8. Performance rules for all of the above (the "extraordinary" part)

| Item | Cost [est., Iris Xe 1080p med] | Notes |
|---|---|---|
| Neutral tone mapping | 0 | same chunk |
| WarmGrade pass | 0 net (replaces VignetteShader pass) | one fetch; low tier skips it |
| Butterflies 24 | 1 draw, 96 tris, < 0.05 ms | vertex-animated, no CPU per instance |
| Light pools 24 | 1 draw, 48 tris, overdraw ~3 % of screen | forest only |
| Cloud shadows | 1 tex tap on 2 materials | off on low |
| Ambient second pool | 1 draw | only levels with two profiles |
| Rescue burst | 78 particles in existing pools | 0 draws |
| Fonts | **−388 to −449 KB** download | faster first paint |
| UI changes | fewer paints (below) | — |

UI paint rules (each is a real cost on iGPU when the WebGL canvas sits under the DOM):
1. **No `filter: drop-shadow()` on animated elements.** `ui.css:96–145` puts drop-shadow on hearts, portrait, valor,
   milk and the companion ring, and `:80 pulseRed` animates a `filter`. Each animated frame re-rasterises the filter.
   Bake the shadow into the SVG (a duplicate path offset by 2 px at `#5A3B2E33`) or put `box-shadow` on a **static**
   parent, and animate `transform` and `opacity` only.
2. **No `backdrop-filter` over the canvas** (`ui.css:403`). It forces a readback blur of the canvas every frame. When
   a menu opens, pause rendering after one frame (`game.setMode('menu')` already stops sim; also skip `composer.render`
   while the frame is static) and use the warm scrim without blur.
3. **No SVG `feTurbulence` backgrounds** (the `--noise` token). Large panels re-rasterise it on every resize and
   scale animation. The flat cream gradient is cheaper and is the look we want.
4. `will-change: transform` only on the ≤ 6 hot elements (hearts row, valor, toasts container, damage-number layer,
   fish counter, kitten counter). Never apply it globally.
5. Screen-space confetti in DOM is limited to 24 nodes and is removed after 1.6 s. More than that goes through
   the world particle pools.
6. Light **colour**, not light **count**: all braziers, lanterns, mushrooms and windows are emissive and bloom. Keep at
   most 2 point lights (tech.md §18), and keep `HERO_LIGHT` always present so programs never recompile.

---

## 9. Audio tone notes (owner **audio**)

**Target sound:** acoustic and toy-like. Pizzicato strings, glockenspiel, marimba, ukulele and woodwinds, in major
keys with a warm low-mid range. No chiptune, no sub-bass dread, no horror stingers. The library has no new files, so
the levers are track choice, rate, filters and procedural layers.

- **Music map:** see §4 rows 22, 23, 28 and 29. Explore tracks: meadow and forest `field_of_dreams`, town
  `village_town_theme`, hub `village_bards_tale`, gate `village_town_theme` → `battle_theme_a` at The Line, bog
  `field_of_dreams` (rate 0.96, + water), keep `castle_kings_feast` (explore, 0.7). Combat stays as it is: the battle
  loops are orchestral and fine.
- **Procedural glockenspiel** (`procedural.js`, like the Sunbell): additive sines with partials [1, 2.76, 5.40] and
  amplitudes [1, 0.35, 0.12], τ = 0.9 s / ratio, notes in C major pentatonic.
  - Rescue arpeggio: C6 E6 G6 C7, 70 ms apart, plus `jingles_PIZZI0x` and `kitten_mew_01` at rate 1.3.
  - Fish pickup: one random pentatonic note per fish, rising with the combo. If several are picked up within 1.5 s, step
    up the scale; reset after that.
  - Objective done: G5 C6 E6 (a major triad up).
- **UI clicks:** keep `ui/click_*`, `select_*` and add a soft "boop" (sine 660 Hz → 880 Hz in 40 ms, gain 0.05) for
  button squash.
- **Ambience beds:** meadow gets birds (exists) + cow bells (zzfx tonk, 1 every 8–14 s) + the windmill creak. Forest
  day gets birds + a woodpecker (zzfx click roll). Bog gets frogs (a procedural "ribbit": 2 short FM chirps at 280 Hz)
  + water + bubbles. Keep gets the fire crackle (exists) + light rain + a distant feast murmur (`tavern_old_tower_inn`
  at −24 dB, lowpass 800 Hz).
- **Mix:** master high-shelf +1.5 dB at 6 kHz (sparkle), low-shelf −2 dB at 120 Hz (less murk). The Meme Cam's silence
  rule stays.

---

## 10. Area mapping (GAME_DESIGN §19.2) and order of work

| Pri | Owner | Files | Change | Done when |
|---|---|---|---|---|
| P0 | core | `Game.js:98,108`, `config.js:275–276`, `PostFX.js:106` (+ new `WarmGrade.js`) | Neutral TM, exposure 1.05, bloom threshold 0.9, WarmGrade pass + `setGrade` | the grade table works and `?debug` sliders exist |
| P0 | world | `Env.js:21–37`, `Terrain.js:13–18`, `Grass.js:21`, `levels/*.js` grass and tints, `bog.js:21,26`, `keep.js` | §3 palettes; `hub_hush` (+ alias); background = fog colour | §0 targets met in `lvl-*.png` |
| P0 | ui | `ui.css` tokens, panel, buttons, `:80`, `:96–145`, `:403`; `fonts.css`; `fonts.js` | §6 + §8 rules | ui shots 01–29 restyled; no `filter` or `backdrop-filter` animations |
| P1 | fx | `Butterflies.js` (new), `Ambient.js`, `Particles.js` + `shaders.js` (CONFETTI), `Poof.js:32`, `Horde.js:23`, `ScreenFX.js`, `Telegraphs.js` | §5, §7, §4 rows 12–16 | the rescue burst shows in `fx` shots; draws +≤ 2 |
| P1 | audio | `musicMap.js`, `sfxMap.js`, `procedural.js`, `nature.js` | §9 + §4 rows 22–31 | the smoke audio block passes; no NES or glitch files in maps |
| P1 | story | `strings.js:122`, CS-11 env cue `hub_grey` → `hub_hush` | names and env | flow smoke green |
| P2 | characters | `Fur.js` / plate rim; `Plate.js` font; `preview.js` TM | §3.4, §6.3 | hero chroma ratio ≥ 1.3 |
| P2 | enemies | Bonehead tint and eyes, jelly catchlights | §4 rows 32–33 | M3 |
| P2 | world + fx | cloud shadows, light pools | §5.2 | off on low |
| doc | orchestrator | `art.md §0, §9.1, §10.1, §12, §13, §15`; `GAME_DESIGN §14.1, §16.1, §17` | replace the mood rule and the tables with this file's values | — |

**Verification hook (proposed smoke block `art:mood`, owner core/tests):** load each level at its start spawn, wait 30
frames, and read 64 × 36 pixels with `gl.readPixels` (the same pattern as `sampleCanvas`). Compute luma, chroma and the
dark % in JS and assert the §0 targets. It takes about 1 s per level, so the long smoke run stays affordable.
`research/next/tools/art2_frame_stats.py` is the offline twin for screenshots.

---

## 11. Open questions for the orchestrator
1. **Logo font:** Fredoka (−449 KB, fully modern) or Cinzel Decorative Bold for the logo only (−388 KB, a hint of
   "knight")? Recommendation: Fredoka.
2. **Story "Gloom":** the plot keeps a sad hub after L4. This draft makes it lavender (`hub_hush`, sat 0.8) instead of
   grey. Is that soft enough, or should the Gloom be only lilac clouds over a still-sunny hub?
3. **Boneheads:** keep the KayKit skeletons re-skinned as biscuit-bone toys (cheap), or swap for a non-skeleton M3 enemy?
   Recommendation: the re-skin. It is cute and needs no new assets.
