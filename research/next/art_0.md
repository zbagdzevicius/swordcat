# art_0: Warm cartoon toon pipeline for SWORDCAT (three.js r186, iso camera)

Status: DRAFT design (topic: art; angle: warm-cartoon references, translated into a concrete pipeline).
Scope: palette, light, haze, toon shading, rim, outlines, cel shadows, foliage, props, and the perf cost of each
choice, for the CONTROLS_SPEC §2.1 iso camera (FOV 38°, d 13 m, pitch ≈ 51°).
Nothing under `src/` was edited. Every in-game number below was measured with
`research/next/tools/toon_probe.mjs`, which applies this recipe **inside the running page**, and with
`research/next/tools/tri_budget.mjs`. Screenshots are in `research/next/shots/`.

> **User request:** "warm cartoonish … everyone will feel great inside, not 90s nostalgic. Performance must be
> extraordinary. Maximum MOBA-like automatic camera."
>
> **What this means for art:** the current look (art.md §0 "desaturated, misty, grey-green world", grey FogExp2,
> ACES, PBR/Physical, 16 fur shells, full-res bloom) is exactly the "moody 90s / photographic" feel the user is
> rejecting. Seen from the new iso camera it also reads as a grey soup (`shots/meadow_base.png`). This draft
> **supersedes art.md §0 (mood rule), §6.2 (world tokens), §9.1–9.2, §12 (biome table) and §15 (Don't: ink
> outlines)**, and GAME_DESIGN §17's first bullet. Those docs are owned by others: the edits are listed in §13 as requests.

---

## 0. The pipeline in one paragraph

**The world is sunny and warm, and the hero is warmer still.** Use a warm key sun (`#FFE7C2`), a cool lavender-blue sky fill
(`#C4D9FF`), so shadows are **blue-violet and never black**, and a warm ground bounce (`#C9A46A`). Fog becomes a **warm
cream haze** (`#F7E6C4`) measured from her (focus fog, CONTROLS_SPEC §4.1), so the screen edges glow instead of greying out.
**Two-band toon lighting** with a soft 0.07-wide terminator and **crisp cel shadows** at 60 % strength go into every
lit material through **one global `ShaderChunk` patch** (0 extra draws, and every existing `onBeforeCompile` patch keeps working).
Use **NeutralToneMapping** so authored hexes come out as authored. **Inverted-hull outlines go on actors only** (one merged
hull per character, ≤ 12 draws); props get an in-shader "ink rim" at 0 draws. Grass, ground and foliage are **saturated
mid-light greens**, props are **chunky, bevelled and warm**, enemies stay in a **cool indigo/violet family** so they read
against the warm ground. For "extraordinary" performance the pipeline **drops the EffectComposer in play**: native
MSAA, tone mapping in-material, a CSS vignette, and bloom only in holy/cutscene moments. It also cuts the hero fur shells and grass
blades, which are 2/3 of all triangles in the iso frame.

---

## 1. Reference distillation (what each one gives us, as a three.js decision)

| Reference | What makes it feel warm and "good inside" | Steal → three.js decision |
|---|---|---|
| **Animal Crossing: New Horizons** | Soft wrap-around sun, pastel-saturated greens, **coloured shadows (blue-lilac)**, no outlines on the world, gentle rim on characters, a toy-like chunky world, a bright cream sky haze | Cool hemi sky + warm sun = coloured shadows (§3). Toon ramp with a *soft* terminator, not a hard 1-bit one (§4). Rim on characters (§4.3). |
| **A Short Hike** | Warm low-sat sky gradients, colour fog per altitude, **chunky low-poly props**, flat shading, cosy palette | Fog/haze colour = background colour (already Env's rule). Chunky prop rules (§8). Height-fog low colour warmer than the top colour (§5). |
| **Ooblets** | Candy pastel palette, flat albedo with very little texture noise, round silhouettes, no harsh blacks | Flat vertex colours stay (no texture noise). The "no black" rule: darkest world value L ≥ 18 % (§2.5). |
| **Sky: Children of the Light** | Glowing warm haze, light as emotion, gold sparkles, soft bloom | Holy moments keep bloom (half-res, gated, §10.2). Warm haze as the default "air". Sparkle colours (§2.4). |
| **Tunic** | **Isometric camera**, bright low-poly, crisp sun shadows, dappled forest light, flat colours, strong colour fog in caves | The closest match to our camera. Crisp cel shadows (§6). Canopy shadows = a readable dappled stage (`shots/forest_toon.png`). Per-biome fog hue, never grey (§3). |
| **Wild Rift (in-game + splash)** | Saturated hand-painted ground, **warm key + cool fill**, champions with a rim highlight and high chroma against a mid-value ground, readable from 50° pitch | Ground is mid-value and low-noise (it fills about 70 % of the iso screen). Characters get the highest chroma plus an outline plus a rim (§2.1 value ladder). |
| **Supercell (Brawl Stars / Clash)** | **Top-down 3/4 camera**, hard toon ramp, **thick dark-coloured inverted-hull outlines on units**, oversized chunky props, saturated primaries, team colours | Inverted hull on actors (§7). Hull colour = darkened local hue, not black. Enemy/hero hue-family separation (§2.3). Chunky prop scale (§8). |

Sources for technique claims are listed at the end. No Supercell/Nintendo rendering internals are documented publicly. The
recipes below are standard techniques chosen to *produce* those looks, and they were verified on this codebase in-page.

---

## 2. Palette (hex tokens)

### 2.1 Value and chroma ladder (the readability rule from 50° above)
1. **Ground** (≈ 70 % of pixels): L 45–70 %, chroma medium, hue noise low. It is calm.
2. **Props / foliage**: one value step lighter **or** darker than the ground under them, plus a warmer hue.
3. **Enemies**: cool hue family (indigo, violet, slate-teal) with **orange/red telegraph accents**. Chroma medium-high.
4. **Hero and companions**: the highest chroma (ginger, red cape, pink bow, gold), the brightest highlight (steel band) and the
   darkest edge (outline). "No pink on enemies" stays. Pink also stays off flowers (coral/butter/lilac instead).

### 2.2 Global light tokens (`ENV` tokens; see §3 for per-preset rows)
```js
export const TOON = {
  sun: '#FFE7C2', sunGold: '#FFD9A6', sunDusk: '#FF9E5E', moon: '#B8CCFF',
  hemiSky: '#C4D9FF',      // cool lavender-blue fill = shadow colour
  hemiGround: '#C9A46A',   // warm bounce from sunlit grass/soil
  haze: '#F7E6C4', hazeLow: '#F0D6A8',            // warm cream air (fog colour = clear colour)
  skyTop: '#8FCBF2', skyHorizon: '#F7E6C4',        // cutscene dome only (hidden in iso)
  blob: '#5A4E7A', blobA: 0.35,                    // contact shadow: violet, never black
  ink: '#4A2A1E',                                  // outline base (warm dark brown), tinted per mesh (§7)
};
```

### 2.3 World tokens (replace `Terrain.GROUND`, `Grass.GRASS_COLORS`; LevelKit recolour maps)
| Biome | ground root / mid / dry | path / pathDark | soil / mud / field | grass root / tip / dry |
|---|---|---|---|---|
| meadow | `#3F7F35` / `#5FA243` / `#B9C35E` | `#E6C590` / `#C9A270` | `#B07A4E` / `#8A5C3C` / `#D9B95A` | `#3A7E36` / `#98CC58` / `#E2C866` |
| forest | `#2E6438` / `#4C8A40` / `#9AAE52` | `#CDA373` / `#A87C52` | `#8A5E3C` / `#6E4A30` / `#7FA048` | `#2C6A3A` / `#86C65C` / `#C8C060` |
| town / hub | `#5A9A46` / `#7DB453` / `#D2C77A` | `#EBD5A8` / `#C9AE84` (warm cobble) | `#B98A5E` / `#9A6E4A` / `#E0C070` | `#4E9440` / `#B0DA6A` / `#E8CF7A` |
| gate (dusk) | `#5E8A4A` / `#7FA055` / `#C9B070` | `#E2B98E` / `#B98E6A` | `#A8704E` / `#7E523A` / `#D2A060` | `#4E8040` / `#A8C860` / `#E0B868` |
| bog | `#3E7A5A` / `#5C9A6A` / `#A8B860` | `#C8A878` / `#9E8058` | `#7A5E44` / `#5E4A3A` / `#86A458` | `#357A5A` / `#8CCB8A` / `#C8C870` |
| keep | `#6A5E78` / `#857894` / `#A898A8` | `#B8A4A0` / `#92807E` | `#6E5458` / `#54404A` / `#8E7C88` | `#5A6A5A` / `#8E9A78` / `#B0A688` |

Shared props:
- **Stone**: `#C9BCA6`, light `#E6DAC4`, shade `#9C8E7C`, moss `#8DB65A`. The current `#8C8F88` grey reads as concrete from above (the statue in `shots/meadow_toon.png`).
- **Wood**: `#B7773F` / dark `#7E4E2A` / fresh cut `#E8B87A`.
- **Plaster**: `#FFF0D6`. **Timber**: `#7A4A2E`.
- **Roofs**: terracotta `#E0794F`, slate-blue `#6F8FC4`, moss-teal `#4FA39A`, butter `#F2C14E`.
- **Water**: deep `#3FA8C8`, shallow `#8FE0E0`, foam `#FFFFFF`.
- **Canopy**: light `#9AD663` / mid `#58A84A` / dark `#2F7A45` (forest shifts 10° toward teal).
- **Mushroom**: cap `#E8553F`, spots `#FFF4E0`, glow `#8FF0D8`.
- **Flowers**: coral `#FF9A76`, butter `#FFD86B`, lilac `#B9A3F0`, white `#FFFDF2`, sky `#8EC9FF`.
- **Lantern / fire**: `#FFC46B` / `#FF8A3D`.

### 2.4 Character lifts (characters `palette.js`; small shifts on the existing PAL)
- **Fur**: `furGinger #F0A05A`, `furGingerLight #FFD3A0`, `furGingerDeep #C66E32`, `furCream #FFF3E2`.
- **Toon steel**: `steel #D3DCEA`, `steelBand #FFFFFF`, `steelShade #7D8BA8`. Blue shade, not grey.
- **Cape**: `capeRed #D9323F`, `capeShade #9A1F3A`.
- **Bow**: `bow #FF9EC0`, `bowShade #D9668A`.
- **Brass**: `#F2C35A`.
- **Holy**: `#FFE3A3`. **Sparkles**: `#FFF1C4`, `#FFD57A`.
- **Enemy families**:
  - Rats: fur `#9A93B0` / `#5B5470`, rusty gear `#C86A3C`.
  - Crows: `#3E4470` / `#6C74B0` (indigo, not black), beak `#F2B04E`.
  - Hyenas: `#C9A36A` with `#6B4E8A` purple manes and gear.
  - Jellies: `#7FD0C0`.
  - Spiders: `#5E4A7A`.
  - Pugs: `#B89A7A` with `#4A4A6A` armour.
- **Telegraph colours** stay as they are.

### 2.5 Hard rules
- No pixel of world geometry below **L 18 %** (linear-sRGB luma ≈ 0.03) except pupils and outlines.
- Shadowed ground luma must be **≥ 0.45 × lit ground luma**.
- Haze is never neutral grey. Its saturation is ≥ 12 % in every preset; story "grey" beats use lavender, not grey (§3).

---

## 3. Light and haze presets (drop-in rows for `world/Env.js` `ENV_PRESETS`)

Shape = the existing preset shape, plus **`shadowI`**, the new directional `shadow.intensity` (r186 has `LightShadow.intensity`;
the stock chunk already multiplies it in). `fogDensity` is the focus-fog ρ (CONTROLS_SPEC §4.1, measured from her, `clear`
5 m). The warm haze is lighter than the grey fog it replaces, so ρ drops about 40 % to keep the "f at 12 m" targets.
`env` drops to 0.25 because world materials go Lambert (§4.4) and only the hero steel uses bands.

| preset | fogColor / fogLow | ρ | skyTop | hemiSky / hemiGround × hemi | sun colour × I, elev | shadowI | note |
|---|---|---|---|---|---|---|---|
| meadow_day | `#F7E6C4` / `#F0D6A8` | 0.018 | `#8FCBF2` | `#C4D9FF` / `#C9A46A` ×1.30 | `#FFE7C2` ×2.4, 0.85 | 0.60 | **probed** (`shots/meadow_toon.png`) |
| meadow_evening | `#FFD7B0` / `#F6BF94` | 0.016 | `#9DB8EA` | `#B9B8F0` / `#D89A6A` ×1.20 | `#FFB878` ×2.6, 0.30 | 0.55 | long warm shadows |
| meadow_night | `#3E4C86` / `#4A5A96` | 0.030 | `#24306A` | `#8FA4F0` / `#3A3466` ×1.10 | moon `#B8CCFF` ×0.9, 0.9 | 0.50 | "storybook night": blue, not black; hero light on |
| forest_day | `#D8EBC8` / `#BFDDB0` | 0.022 | `#9AD4E8` | `#B9D8F5` / `#8C7A4A` ×1.30 | `#FFE2A8` ×2.3, 0.90 | 0.60 | **probed**; dappled canopy stage |
| forest_night | `#2E4A5E` / `#335A5A` | 0.030 | `#1E3048` | `#7FB0D8` / `#2E3A3A` ×1.15 | `#A8C8FF` ×0.7, 0.9 | 0.50 | lantern pools `#FFC46B` |
| town_occupied | `#E8D2B8` / `#D9BD9A` | 0.020 | `#A8BEDF` | `#C8C8F0` / `#B08A62` ×1.20 | `#FFD2A0` ×2.2, 0.60 | 0.60 | **probed** with hub values |
| hub_gold | `#FBE0C0` / `#F4CFA4` | 0.016 | `#9CC8F0` | `#CBD3FF` / `#D2A070` ×1.25 | `#FFD9A6` ×2.6, 0.45 | 0.60 | the cosiest place in the game |
| hub_grey | `#C9C6DA` / `#B7B3CC` | 0.030 | `#9EA6C8` | `#D0D4EE` / `#8E8A7A` ×1.35 | `#F2EAD8` ×1.2, 0.80 | 0.45 | sad beat = soft lavender rain light |
| gate_dusk | `#F2B79A` / `#E39E86` | 0.020 | `#7F86C8` | `#9C9AE0` / `#C07A5A` ×1.15 | `#FF9E5E` ×2.4, 0.25 | 0.55 | peach dusk; fixes "gate bricks read dark" |
| bog | `#BFE3C8` / `#9FD3B4` | 0.030 | `#86C6C9` | `#A8E0E0` / `#6E7A4A` ×1.30 | `#F4F0C0` ×1.8, 0.80 | 0.55 | minty, not swampy-grey; wisps `#9FFFCB` |
| keep_storm | `#4A3C6A` / `#5E3E5E` | 0.030 | `#2C2850` | `#8C84C8` / `#4A2E3A` ×1.30 | `#C8B8FF` ×0.6, 0.80 | 0.45 | plum storm; braziers `#FF8A3D` |
| keep_cellar | `#4A3C6A` / `#3E3250` | 0.024 | `#2C2850` | `#8C84C8` / `#3A2A3A` ×1.40 | off | — | |
| ending_gold / sky_sunrise | `#FFE8C8` / `#FFD8A8` | 0.008 | `#9CC8F0` | `#D0DCFF` / `#E0B080` ×1.30 | `#FFD9A6` ×2.8, 0.30 | 0.60 | |

- **Sun azimuth**: CONTROLS_SPEC §4.2 asks for 60–120° off the camera yaw. Use **≈ 100°** (screen-left key) by default, so
  shadows fall down-right across the screen and props cast readable shapes.
- **Tone mapping**: `THREE.NeutralToneMapping`, exposure **1.0**. ACES shifts the warm palette and desaturates it. AgX desaturates
  highlights, so gold and sparkles turn milky. Neutral (Khronos PBR Neutral) keeps the authored hue up to about 0.8 of white, which is what
  a hex-authored cartoon palette needs. Probed: the change happens in one line in `Game.js`, and OutputPass follows `renderer.toneMapping`.
- **Hero light** (Env `HERO_LIGHT`) stays as it is. Its `#FFC890` matches the warm palette.

---

## 4. Toon shading: one global ShaderChunk patch (recommended over MeshToonMaterial)

### 4.1 Why not `MeshToonMaterial` or a custom ShaderMaterial
- About 50 `new Mesh*Material` sites (`grep`: Pickups 8, enemies/props 6, cutscenes 10, characters 9, world 15…) and many
  `onBeforeCompile` stacks (height fog, grass wind, kit `rmse`, fade/dither, wheat trample) would all need porting.
  MeshToonMaterial also has no `metalness`/`sheen`, so the kit material's per-vertex `rmse` path breaks.
- **The global chunk patch** changes `RE_Direct` and the directional shadow fetch for **every Lambert / Phong / Standard /
  Physical program and every `lights: true` ShaderMaterial (Fur.js)** at compile time. Probed: 0 extra draws, +3 programs,
  no compile errors on meadow, forest and town, and every existing patch keeps working.

### 4.2 `src/core/toon.js` (core owns it; install before the first `renderer.compile`/render)
```js
// src/core/toon.js — global toon lighting (art_0 §4). Pure string patches on THREE.ShaderChunk; idempotent.
import * as THREE from 'three';
export const TOON_GLSL = /* glsl */`
#ifndef TOON_GLSL
#define TOON_GLSL 1
// 2-band ramp with a soft terminator (AC-like, not 1-bit) + a faint 3rd band for volume on rounded shapes
float toonRamp(float d){ return smoothstep(0.0, 0.07, d) * mix(0.86, 1.0, smoothstep(0.42, 0.50, d)); }
// cel shadow: PCF result → crisp edge; LightShadow.intensity (shadowI) then sets how dark it gets
float toonShadow(float s){ return smoothstep(0.38, 0.62, s); }
// gentle saturation lift in linear space before tone mapping (1.0 = off). World colours are authored saturated,
// so keep this ≤ 1.15; it mainly rescues hemisphere-lit shadow sides from looking flat.
vec3 toonGrade(vec3 c){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, 1.12); }
#endif
`;
export function installToon() {
  const C = THREE.ShaderChunk;
  if (C.lights_pars_begin.includes('TOON_GLSL')) return;
  C.lights_pars_begin = TOON_GLSL + C.lights_pars_begin;                   // fragment-only, before every RE_Direct
  const DOT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
  const TOON = 'float dotNL = toonRamp( dot( geometryNormal, directLight.direction ) );';
  C.lights_lambert_pars_fragment = C.lights_lambert_pars_fragment.replace(DOT, TOON);
  C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(DOT, TOON);
  const SH = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  C.lights_fragment_begin = C.lights_fragment_begin.replace(`? ${SH} :`, `? toonShadow( ${SH} ) :`);
  C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
    '#ifdef TOON_GLSL\n\toutgoingLight = toonGrade( outgoingLight );\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );');
  for (const k of ['lights_lambert_pars_fragment', 'lights_physical_pars_fragment', 'lights_fragment_begin', 'opaque_fragment'])
    if (!C[k].includes('toon')) console.warn(`[toon] chunk ${k} did not patch (three version drift?)`);
}
```
- **Unit test** (`tests/unit/contracts.test.js` or a new `toon.test.js`, owned by core): `installToon()` then assert that all four chunks
  contain `toon`. That catches a three upgrade that renames the chunk text (r186 text verified).
- **Wrap**: grass already uses Lambert, and the soft 0.07 terminator plus hemi fill gives the AC wrap feel without a wrap term.
  Characters get their wrap from Fur.js (it includes `lights_pars_begin`, so `toonRamp` is available there; §9).
- **Specular**: Standard/Physical speculars stay physically based in the patch. With world materials moved to Lambert (§4.4)
  only the hero's steel has specular, and that becomes bands (§4.3).

### 4.3 Character kit material (`characters/materials.js`): toon steel, rim, no PMREM
The current kit is `MeshPhysicalMaterial` + sheen + a per-preset PMREM env, which is the most expensive per-pixel material in the
frame, for a 96 px character. Proposal: **`MeshLambertMaterial` + the same `rmse` attribute**, with this fragment block
added after `lights_fragment_end`. Specular becomes a fake matcap-like band from the view-space normal:
```glsl
// vRMSE: x rough, y metal, z sheen, w emissive (existing attribute)
vec3 nV = normalize(vNormal); vec3 vV = normalize(vViewPosition);
float ndv = saturate(dot(nV, vV));
// 1) stylised steel: 3 bands keyed on the view-space reflection's up component (reads as "polished" from above)
vec3 r = reflect(-vV, nV);
float band = smoothstep(0.35, 0.42, r.y) + 0.6 * smoothstep(0.80, 0.84, r.y);           // sky band + sharp glint
vec3 steel = mix(uSteelShade, uSteelBase, smoothstep(-0.2, 0.2, r.y)) + band * uSteelBand * 0.55;
outgoingLight = mix(outgoingLight, steel * (0.55 + 0.45 * saturate(dot(nV, uSunDirV))), vRMSE.y);
// 2) sky rim (AC / Wild Rift character pop): only on up-and-outward-facing edges, so it reads from 50° above
float rim = pow(1.0 - ndv, 3.0) * smoothstep(-0.1, 0.5, nV.y);
outgoingLight += uRimColor * rim * 0.35;                                                   // uRimColor = hemiSky
// 3) fur sheen remains via the existing sheen weight (z) as a cheap fresnel add (no MeshPhysical sheen lobe)
outgoingLight += uSheenColor * pow(1.0 - ndv, 2.0) * vRMSE.z * 0.25;
```
Uniforms: `uSteelBase #D3DCEA`, `uSteelShade #7D8BA8`, `uSteelBand #FFFFFF`, `uRimColor` = `env.hemiSky` (shared object),
and `uSunDirV` (view-space sun dir, set once per frame by Env, shared). This drops `setCharacterEnvMap` and the PMREM
rebuild on every preset change for characters. Cutscene close-ups (FOV 30, d 2–3 m) still look polished because the
bands are view-dependent.

### 4.4 World materials → Lambert
`LevelKit.makeTreeMaterial`, `LevelKit._vcMat`, `Props`, `Pickups`, `enemies/props.js`, `Dressing` currently use
`MeshStandardMaterial` (roughness 0.9, env 0.5–0.55), which looks almost Lambert anyway. Switch them to `MeshLambertMaterial`
(same `vertexColors`, `map`, `onBeforeCompile`). That is cheaper per pixel, has no env sampling, and is one less program family.
Keep Standard only where metal must read (sword pickups, bells), or use the kit steel bands there.

### 4.5 Ink rim for props (outline look at 0 draws)
For chunky props that should read "drawn" (crates, barrels, stones, fences), add to their material's `opaque_fragment`
(a per-material `onBeforeCompile`, flag `userData.inkRim`):
```glsl
float ink = smoothstep(0.62, 0.92, 1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))));
outgoingLight *= mix(1.0, 0.68, ink);     // darkens silhouette edges of rounded/bevelled props; flat faces unaffected
```
It works because §8 asks for bevelled props (a hard 90° box has no normal ramp to darken).

---

## 5. Warm haze instead of grey fog

- **Focus fog** (CONTROLS_SPEC §4.1) stays the mechanism. Only the colours and ρ change (§3). With `clear` 5 m and `topMul` 1.5:
  meadow ρ 0.018 gives f ≈ 0.00 on her, 0.03 at 8 m, 0.10 at 12 m and 0.21 at 16 m. The top screen edge gets a soft cream glow,
  not a grey wall. The combat `clear` of 7 m keeps the stage fully clear.
- **Height fog**: `fogLow` is **warmer and slightly darker** than `fogColor` (the table pairs). `uFogLowMix` 0.45 in iso. Seen
  from above, the ground "sits in" warm air.
- **Background / clear colour** = `fogColor` (already Env's rule). The sky dome is hidden in iso (spec §4.1). It is shown in cutscenes,
  where its gradient is `skyTop` → `fogColor` → `hemiGround`.
- **Mist cards / sun rays / ground mist (fx)**: tint = `fogColor` lifted 6 % toward `sun`. Alpha max **0.14** (from 0.22).
  The white streaks in `shots/forest_toon.png` and `meadow_base.png` (SunRays at 0.12 opacity, cool white) read as dirt from
  above. In iso, sun rays become **ground light pools** (spec §4.2) tinted `#FFE7C2` with additive α 0.10.
- Golden Hour ×0.5 density, the Cacklejaw P3 `clear` 3.5 m and every `contribute()` keep their meaning.

---

## 6. Soft cel shadows

| Setting | Value | Why |
|---|---|---|
| `toonShadow` | `smoothstep(0.38, 0.62, pcf)` | Crisp Tunic-like edge. The PCF blur is just anti-aliasing for the step. |
| `sun.shadow.intensity` (`shadowI`) | 0.60 (0.45–0.60 per preset) | Shadowed ground keeps 40 % of the sun plus the full hemi, which is blue-violet. Probed: at 1.0 the forest canopy shadows were near-black (first forest run); at 0.6 they are friendly (`shots/forest_toon.png`). |
| Map size | **Med 1024**, High 2048, Low none | Half-size 16 m → 3.1 cm texels at 1024, which is plenty after the smoothstep. Saves 3/4 of the shadow fill. |
| Type / radius | `PCFShadowMap`, radius **1** | The soft look comes from the smoothstep width, not from blur taps. |
| Casters | characters, trees, buildings, big props (`castShadow`), **never** grass, wheat, flowers, decals, pickups | Keeps the shadow pass to about 20–30 draws. |
| Contact shadows | blob decal under every actor: `TOON.blob #5A4E7A`, α 0.35, r = footprint × 1.1 | Grounds actors on Low (no shadow map) and under grass. |
| Night | `shadowI` 0.5, moon key | Shadows stay visible but soft blue. |

---

## 7. Outlines

| Option | Cost (measured or estimated, Iris Xe 1080p) | Look | Verdict |
|---|---|---|---|
| Post Sobel on depth+normal | Normal pre-pass = scene re-render (×2 draws) **or** depth-only edges + 1 full-screen pass (~1–2 ms); outlines grass blades → noise | Uniform ink everywhere: comic, not cosy | **Reject** |
| Inverted hull on **every** actor sub-mesh (probe) | meadow +10 calls (8 hulls); **town +20 calls, +73 k tris** (99 hulls on NPC sub-meshes) | Brawl Stars look | Too many draws as-is |
| **Inverted hull on one merged silhouette mesh per actor** | **+1 draw per outlined actor (≤ 12)**, ~2–5 k tris each | Brawl Stars / Wild Rift unit read | **Adopt** for hero, companions, enemies, bosses, lost kittens |
| In-shader ink rim (§4.5) | 0 draws, ~4 ALU | Soft drawn edge on props | **Adopt** for chunky props |
| No outline on world/ground/foliage | 0 | AC / Tunic | **Adopt** |

**Hull spec (characters `Outline.js`, new):**
- Geometry = `getSilhouetteProxy()` (CONTROLS_SPEC §3 already requires it: capsule + ears + bow + sword, merged, no fur),
  or the merged kit body where the proxy is too coarse. Hull shares the proxy geometry. It is never on fur shells or the cape (cape gets the ink
  rim instead).
- **Constant screen-space width** (needed because the zoom varies 9–18 m):
```glsl
// vertex: MeshBasicMaterial(side: BackSide, fog: true) + onBeforeCompile replacing <project_vertex>
vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
vec3 nV = normalize(normalMatrix * objectNormal);
vec2 dir = normalize((projectionMatrix * vec4(nV, 0.0)).xy + 1e-5);
clip.xy += dir * (uOutlinePx * 2.0 / uViewport) * clip.w;    // uViewport = drawing-buffer size (shared uniform)
gl_Position = clip;
```
- Width: hero **2.0 px** (at dpr 1), companions 1.6, enemies 1.6, bosses 2.4. Cutscenes (d < 4 m) cap at 3 px.
- Colour: `TOON.ink #4A2A1E` mixed 40 % with the actor's key hue darkened ×0.3 (hero: `#5A2A1A` warm brown; crows:
  `#20234A`). **Never pure black.** Fog on (hulls fade with the haze).
- Telegraph: an enemy's hull colour lerps to its telegraph colour (`#FF8A3D`) during wind-up. That is the same signal as the
  CONTROLS_SPEC x-ray tint and costs 0 extra.
- Low quality: hull on the hero and bosses only.

---

## 8. Saturated foliage and chunky props

**Grass (world `Grass.js`)**: the probe frame spent **119,700 tris on grass (2 draws)** in meadow iso. The toon look prefers
**fewer, fatter clumps**:
- Replace single blades with **3-blade clumps** (9 tris, 0.18–0.32 m tall, width ×1.6). Med **8 k clumps ≈ 72 k tris**, Low
  2.5 k. Recycle within the spec's 22 m focus radius.
- Colour: vertical gradient root → tip (§2.3), plus a per-clump hue jitter of ±6° and lightness ±5 %. A **dry-patch noise** at 1/40 m
  frequency uses `dry`.
- Normals: **bend all clump normals toward world-up (lerp 0.7)**. Grass then shades like the ground under it: no dark
  backfaces and no noisy toon bands (the AC/Tunic trick).
- Ground under grass: −10 % lightness (spec §4.2), so clumps pop by value.
- Flowers: 5-petal cards, the §2.3 flower colours, 1 instanced draw, 400 on Med.

**Trees and canopies (LevelKit)**: blob canopies = 2–3 merged icosahedra (detail 1). Vertex colours run from canopy dark (bottom/inside)
to light (top) by `normal.y`. The toon ramp then gives the AC two-tone. Wind sway is on the vertex as today. Trunk `wood`. The canopy
is `camFade` (spec §3).

**Chunky prop rules (world/LevelKit, enemies/props, Pickups, Dressing)**:
1. **Bevel everything** a player sees from above: boxes become `RoundedBoxGeometry` (addon) with radius = 8–12 % of the smallest side,
   segments 2. Cylinders get chamfered rims. Bevels catch the toon ramp and the ink rim, and read "toy".
2. **Exaggerate scale ×1.25** for interactables (crates, barrels, chests, signposts, vigil stones), relative to art.md §1 kitten scale.
   From 13 m they must still read as objects.
3. **Fat silhouettes**: no member thinner than 0.06 m (fence rails, sword pickups, sign posts). Thin parts alias and vanish at 1080p iso.
4. **Two colours + one accent per prop**, flat vertex colour, no texture noise. If a texture is kept (town cobbles), multiply it toward
   `path` and limit its contrast to ±12 % luminance.
5. **Warm the darks**: prop shade colours are hue-shifted 10–20° toward red/orange (wood) or violet (stone), never toward grey.
6. **Merge per biome** (`BufferGeometryUtils.mergeGeometries`) or `BatchedMesh` with one Lambert material: static props
   cost 1–4 draws total.

---

## 9. Characters in the iso frame (cute, warm, cheap)

The probe's triangle census (meadow, iso frame):

| Item | Tris | Draws | Material |
|---|---|---|---|
| grass | 119,700 | 2 | Lambert |
| **hero furHead** | **85,884** | 1 | ShaderMaterial (16 shells) |
| **hero furTail** | **71,500** | 1 | ShaderMaterial |
| ground | 50,000 | 4 | Lambert |
| hero kitBody | 33,320 | 1 | **Physical** |
| wheat | 25,110 | 1 | Lambert |
| horizon + skyline | 27,195 | 2 | Basic (hidden in iso per spec) |
| hero furBib | 18,088 | 1 | ShaderMaterial |

So **the hero's fur alone is 175 k tris** (about 48 % of the frame) for a 96 px tall character.
- **Iso fur LOD**: hero shells **16 → 5** in iso (Med), 3 on Low. Shells keep the fluffy silhouette. The toon look wants **3 clean
  fur value bands** (cream / ginger / deep), not strand noise. The Fur.js wrap-diffuse calls `toonRamp()`. The strand alpha
  threshold rises so the shells form **soft clumps** (cartoon fur), and 4–6 **tuft cards** (art.md §3.4) carry the fluff silhouette.
  Estimated 175 k → ~55 k tris. Close-ups (cutscene/Meme Cam, d < 4 m) restore 16.
- Kitten companions: 0 shells in iso (sheen fallback + tufts + hull). NPC cats: sheen only.
- `READABILITY` (characters/materials.js) already scales the bow ×1.25 and the ears ×1.1 at distance. Keep it, and add the **hull** and the
  **sky rim**, which together do more for readability than shells at 96 px.
- Eyes: keep two catchlights. In iso, the eye whites may brighten 10 % so the face reads.

---

## 10. Post-processing and performance ("extraordinary")

### 10.1 What the probe measured (Iris Xe, 1280×720 viewport, med, iso camera, GPU shared with other agents, so FPS is noisy;
`renderMs` = render + `readPixels` sync, median of 90 frames)

| Level | base (current look) | toon (this recipe, + actor hulls) | toon on **Low** (no composer, no MSAA, no shadows) |
|---|---|---|---|
| meadow | 42.1 ms · 67 / 82 calls · 363 k tris | 38.7 ms · 77 / 92 · 377 k | 32.0 ms · 60 / 60 · 302 k |
| forest | 79.5 ms · 68 / 83 · 336 k | 48.6 ms · 78 / 93 · 346 k | **16.0 ms** · 52 / 52 · 263 k |
| town (run 1) | 52.0 ms · 77 / 92 · 367 k | 70.2 ms · 97 / 112 · 440 k (99 hulls) | 27.2 ms · 62 / 62 · 283 k |

Readings:
1. **The toon patch itself is free.** Base and toon differ within the noise; the program count is +3.
2. **Hulls on every sub-mesh are not free** (town +20 calls, +73 k tris). Hence the one-proxy-per-actor rule in §7.
3. **The composer path (HalfFloat MSAA-4 RT + full-res UnrealBloom + OutputPass + Vignette) plus 2048 shadows is the dominant cost.**
   Low runs at roughly ⅓–½ the render time. `PostFX.js` builds UnrealBloom at **full** drawing-buffer size.

### 10.2 The direct pipeline (Med and High in play)
| Change | Owner | Effect |
|---|---|---|
| `WebGLRenderer({ antialias: true })` on Med/High, render **straight to the canvas** in play (no EffectComposer) | core `Game.js`, `PostFX.js` | Removes 1 HalfFloat MSAA RT resolve + OutputPass + Vignette full-screen passes |
| Tone mapping + sRGB **in-material** (`renderer.toneMapping = Neutral` works directly when rendering to the canvas) | core | Same look as OutputPass |
| **Vignette as CSS** (`#game-canvas` wrapper `::after` radial-gradient, warm `rgba(90,60,40,.18)`) | ui `ui.css` | 0 GPU passes |
| **Bloom only when it matters**: build the composer lazily. Enable it for Holy charge, Golden Hour, cutscenes and the ending, at **half-res** (`size/2`), strength 0.6 → 1.2. In plain play, glow comes from additive sprites and the aura hull (HolyFX already has them) | core PostFX + fx HolyFX | Bloom cost only in moments that should feel special |
| Shadow map Med **1024**, PCF radius 1, casters list §6 | world Env, core config `QUALITY` | ~¼ shadow fill |
| World Standard → Lambert; kit Physical → Lambert + bands (§4.3–4.4); no per-preset PMREM for characters | world, characters | Cheaper per pixel, fewer programs |
| Hero fur 16 → 5 shells in iso; companion shells 0 | characters Fur.js, `QUALITY` | ~−120 k tris |
| Grass blades → clumps (72 k tris Med) | world Grass.js | ~−50 k tris |
| Hide horizon / skyline / sky dome in iso (spec) | world | −27 k tris, −3 draws |
| DPR: Med `min(dpr, 1.25)` + dynamic res (existing 18/12 ms rules); flat cartoon colours hide upscaling well | core config | Fill rate |
| Shader warm-up: `renderer.compileAsync(scene, camera)` behind the level fade, after `installToon()` | core | No hitches on first sight |

**Iso budget target (Med, Iris Xe, 1080p, dpr 1.25):** ≤ **90** frame calls, ≤ **180 k** tris, GPU ≤ **8 ms** (60 fps with
headroom for 30 actors). On mobile Low: ≤ 60 calls, ≤ 100 k tris, dpr 1.0 + dynamic res.

---

## 11. File and area mapping (GAME_DESIGN §19.2 owners)

| Area (owner) | Files | Changes |
|---|---|---|
| **core** | `src/core/toon.js` (new), `Game.js`, `PostFX.js`, `config.js` | `installToon()` at boot before the first compile. NeutralToneMapping. Antialias on Med/High; direct render in play; lazy half-res bloom composer for holy/cutscene. `RENDER.toon = { ramp:[0,0.07,0.42,0.50,0.86], shadow:[0.38,0.62], sat:1.12 }`. `QUALITY.med.shadowMap 1024`, `furShellsIso 5`, `kittenShellsIso 0`, `grassClumps 8000`, `maxDpr 1.25`. `compileAsync` warm-up. Unit test for the chunk patch. |
| **world** | `Env.js`, `Terrain.js`, `Grass.js`, `LevelKit.js`, `Props.js`, `Pickups.js`, `Dressing.js`, `Water.js`, `Sky.js`, `HeightFog.js`, `levels/*.js` | §3 preset rows + `shadowI` (apply as `sunLight.shadow.intensity`). Sun az ≈ 100° off the level yaw. §2.3 GROUND / GRASS_COLORS. Grass clumps with up-normals. Standard → Lambert. Bevelled, chunky props (§8) and the ink-rim flag. Warm stone / wood / roof tokens in level recolour maps. Water colours. Hide far groups in iso. Casters list. |
| **characters** | `palette.js`, `materials.js`, `Fur.js`, `Outline.js` (new), `KittenBuilder.js`, `configs.js` | §2.4 lifts. Kit → Lambert + steel bands + sky rim (§4.3), and drop the character PMREM. Fur `toonRamp` + iso shell LOD + tuft cards. `buildOutline(proxy, {px, color})` and `getSilhouetteProxy()` shared with camera's x-ray. Enemy/villager hue families in `configs.js`. |
| **enemies** | `types/*.js`, `props.js` | Use the characters' cool palette families. Weapon/props via Lambert. Hull colour → telegraph colour during wind-up (reads `combat:telegraph`). |
| **companions** | `KittenVisual.js`, `dressing.js` | 0 shells in iso, hull 1.6 px. |
| **fx** | `MistCards.js`, `SunRays.js`, `GroundMist.js` (spec), `Particles.js`, `HolyFX.js`, `shaders.js`, `Poof.js` | Warm tints, α caps (§5), sun rays → ground pools. Holy glow works without bloom (sprite + hull) and bloom is requested via a `postfx.bloom(on)` hook. Poof/dust colours `#FFF4E0` / `#E6C590`, not grey. |
| **ui** | `ui.css` | CSS vignette layer. The parchment UI already fits the warm palette; the HUD needs no change. |
| **camera** | — | No art changes. It already supplies `cam.focus` for focus fog and the shadow centre. |
| **design docs** (core/design owner) | GAME_DESIGN §17, art.md §0/§6.2/§9/§12/§15 | Replace the "desaturated world" mood rule with §2.1 here. Allow actor outlines. Point to this file's palette and presets. |

---

## 12. Acceptance gates (automatable with the probe pattern; add to smoke as `art:toon`)

On each level in iso at the spawn and at one combat spot, read the frame back (as `sampleCanvas` does), then check:
1. **Warmth**: the mean hue of non-UI pixels lies in 30°–140°, mean saturation (HSV) **≥ 0.30** (the current meadow measures
   visibly < 0.15; `meadow_base.png`).
2. **No black world**: < 0.5 % of pixels with luma < 0.06, excluding a 40 px box around each actor (pupils, hulls).
3. **Soft shadows**: luma in the sun-shadow region ≥ 0.45 × the adjacent lit ground (sample across a known caster).
4. **Haze**: fog on her < 3 % (the existing `world:fog-audit`), with the top-edge pixel hue within 20° of `fogColor`.
5. **Hero pop**: the hero's mean chroma ≥ 1.5 × the ground's mean chroma within 3 m.
6. **Budget**: `frameCalls` ≤ 90, `frameTris` ≤ 180 k on Med (`__GAME__.state()`).
7. **Chunk patch**: no `Fragment shader is not compiled` errors (the probe hit exactly this when the ramp was placed in a
   chunk that Physical includes *after* `RE_Direct`; `lights_pars_begin` is the correct host).

---

## 13. Risks and open questions
- **The tone change is a story change.** The "grey world, warm hero" metaphor (light tells the story) survives as **saturation
  and warmth steps** (forest a bit cooler and teal, gate peach dusk, hub_grey lavender, keep plum, ending gold), and never as grey.
  Story should confirm that hub_grey becomes "lavender rain".
- **Mood rule conflict**: art.md §15 "Don't: ink outlines" conflicts with §7. Resolution: actors only, coloured ink, ≤ 2.4 px.
- **Chunk patching is version-coupled** (r186 text). The `console.warn` and the unit test guard it. A three upgrade must re-verify.
- **Lambert kit**: verify that the cape's verlet normals and the bow still read in close-ups. Fallback: keep Physical for the cutscene LOD
  only (one extra program).
- **Bloom-off play** may make HolyFX feel weaker. HolyFX must be tuned to glow through sprites at bloom 0 before the composer
  is removed (fx owner screenshot gate).
- **Probe FPS numbers are noisy** (other agents shared the GPU). Draw-call and triangle numbers are exact. Re-measure on a quiet
  machine before freezing the budgets.

## Tools and evidence
- `research/next/tools/toon_probe.mjs`: boots on its own port, sets the iso camera, measures, applies §2/§3/§4/§6/§7 in-page,
  re-measures, and saves `shots/<level>_{base,toon,toon_low}.png` and `*_close.png`. Run:
  `SMOKE_NOHMR=1 npx vite --port 5617 --strictPort`, then `PROBE_URL=http://localhost:5617/ node research/next/tools/toon_probe.mjs meadow forest town`.
- `research/next/tools/tri_budget.mjs`: top triangle and draw contributors in the iso frustum.
- Key shots: `shots/meadow_base.png` vs `shots/meadow_toon.png`, `shots/forest_toon.png`, `shots/town_toon.png`,
  `shots/meadow_toon_close.png`.

## Sources
- [Unity blog: Smoke, mirrors and scrolling textures, behind the scenes of TUNIC](https://blog.unity.com/games/smoke-mirrors-and-scrolling-textures-behind-the-scenes-of-tunic) (iso orthographic camera, bright low-poly and flat colours)
- [Wireframe: Tunic and the art of keeping a secret](https://wireframe.raspberrypi.com/articles/wireframe-cover-star-tunic-and-the-art-of-keeping-a-secret)
- [itch.io: Tunic-style dappled lighting tutorial](https://itch.io/t/2060644/tunic-style-dappled-lighting-unity-tutorial-project)
- [Cocos Creator docs: Toon shading (inverted-hull outline pass, 3-tone ramp)](https://docs.cocos.com/creator/3.8/manual/en/shader/effect-builtin-toon.html)
- [Polycount: inverted-hull outline practice (delete hull faces near eyes, coloured outlines)](https://polycount.com/discussion/comment/867110)
- [Spiria: outline shader techniques](https://spiria.com/en/blog/author/fhawi)
- three.js r186 source: `ShaderChunk/lights_lambert_pars_fragment`, `lights_physical_pars_fragment`, `lights_fragment_begin`
  (`directionalLightShadow.shadowIntensity`), `gradientmap_pars_fragment`, `constants.js` (`NeutralToneMapping = 7`).
