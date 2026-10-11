# perf_1: GPU and render architecture for the warm toon look (draft)

Scope: how the iso camera (CONTROLS_SPEC §2.1) and a warm cartoon look (no fur shells, no PBR) are rendered at
**60 fps on mid phones** and with headroom on the Iris Xe. This is a design draft only. Each item names its owner
area from GAME_DESIGN §19.2. All APIs were checked against `node_modules/three` **0.186.1**.

Tools (all in `research/next/tools/`, port 5802):
- `perf1_measure.mjs`: per-level stats, classic and iso pose, the post ablation and the Low preset.
- `perf1_ablate.mjs`: hides one category at a time.
- `perf1_census.mjs`: draws per actor.

---

## 0. The answer in 12 lines

1. **Stop drawing actors into a shadow map.** Static shadows render into a **snapped, cached** sun map that only
   re-renders when the focus moves 16 m or the sun changes. Every actor gets an **instanced blob** (1 draw for all of them).
   Low has no shadow map at all.
2. **No fur shells in play.** At 13 m she is about 96 px tall and the shells are invisible. They cost 78k–154k
   triangles (27–50 % of the frame). The fluff comes from the toon shader (rim, wrap) and baked tuft geometry.
   Shells only for close-ups on High.
3. **One warm toon material family (`WarmToon`)** replaces Standard and Physical everywhere. Steel uses a
   **matcap**. Lamps and the hero glow become **analytic uniforms**, not `PointLight`s, so the light count never
   changes and nothing ever recompiles. Target: **30 or fewer programs** (today 88–241).
4. **Merge every character to 1–3 draws.** KayKit parts plus beast head plus weapon become one skinned mesh. The
   hero's rigid parts are baked into her skinned body. Hero 19 → 3 draws; hyena 16 → 1 (+1 outline).
5. **Grass becomes instanced toon tufts** sized to the iso footprint (about 240 m² visible): 16k triangles on Med,
   7k on Low (today 76k–148k), 2 draws.
6. **Post is one uber pass:** scene RT → 3-mip dual-filter bloom (6 tiny passes) → **one** composite pass (bloom,
   Neutral tone map, warm grade, vignette, dither, dynamic-resolution upscale). Low has **zero** post passes; the
   holy glow uses additive cards.
7. **Fog-radius cull:** anything more than about 34 m from the focus is at least 98 % fog, so it is hidden.
   `camera.far` is 60.
8. **Dynamic resolution without reallocation:** render into a sub-rect of a fixed RT (Med), or step the canvas DPR
   by 0.05 (Low). **Cap at 60 Hz** on 90/120 Hz phones (thermal).
9. **`compileAsync` behind the load veil** with one of every enemy type and FX pool present. Smoke asserts that
   **no new program is compiled during play**.
10. **KTX2 (ETC1S/UASTC) + meshopt** for the GLBs that survive (core `scripts/`).
11. **Budgets:**
    - Med (Iris Xe 1080p): ≤ 60 draws, ≤ 150k triangles, GPU ≤ 8 ms.
    - Low (mid phone): ≤ 40 draws, ≤ 80k triangles, GPU ≤ 10 ms at 60 Hz.
12. **Acceptance** comes from `__GAME__.perf()`, a new hook (§12).

---

## 1. Where the frame goes today (measured 2026-10-11)

Setup:
- Machine: Iris Xe, ANGLE D3D11, headless Chromium, 1920×1080, DPR 1, Med preset, `?test=1`.
- Method: synchronous timed renders (render, then a 1-px `readPixels` as a GPU sync).
- The **iso pose** was posed by hand to CONTROLS_SPEC §2.1: fov 38°, d 13 m, pitch 51.3°, near 0.3, far 90.
- **Timing is noisy (±30 %):** other agents' Playwright runs shared the GPU. Draw and triangle counts are exact.

| Level | Pose | Draws (with shadow) | Draws (no shadow pass) | Triangles | Full ms | No post | No post, no shadow | Low preset ms / draws |
|---|---|---|---|---|---|---|---|---|
| meadow | classic | 87 | 50 | 529k | 65 | 33 | 26 | n/a |
| meadow | iso | 84 | 47 | 363k | 62 | 27 | 23 | 18.6 / 46 |
| forest | classic | 183 | 132 | 557k | 87 | 46 | 42 | n/a |
| forest | iso | 105 | 54 | 383k | 74 | 34 | 27 | 24 / 53 |
| town | iso | 137 | 71 | 405k | 128 | 55 | 42 | 51 / 70 |
| gate | iso | 137 | 78 | 304k | 186 | 100 | 68 | 72 / 77 |

What the counts show:
- **The shadow pass doubles the draws:** +37 to +66 draws per frame, because actors are many-part casters.
  - A hyena has 15 casting meshes.
  - Town has 133 casters in the scene and gate has 119.
- **The post chain (MSAA 4 HalfFloat RT, UnrealBloom, Output, Vignette) costs about as much as the scene** at 1080p.
- **Fur shells, iso:** 77.6k triangles for the hero alone in 3 draws, and 154k in gate (a second furred cat).
  Census: the hero is **19 draws and 221k triangles** at full shells, with 7 `MeshPhysicalMaterial`s.
- **Grass, iso:** 123k triangles (meadow), 99k (forest), 76k (town), 87k (gate).
- **Skinned:** 18–29 skinned draws in forest, town and gate.
  - A KayKit hyena is **16 draws** (5 skinned parts plus head, plate and weapon pieces; 11 Standard and 5 Physical).
- **Programs:**
  - The counts are cumulative across levels in one session: 88 → 173 → 231 → 241.
  - On a fresh load, gate alone is 135–239.
  - Each one is a 20–100 ms compile on a phone (a hitch when it first appears).
  - Material census, gate: 145 Standard, 48 Physical, 94 Shader, 27 Basic.
- **The iso pose alone** cuts triangles by 25–35 % and forest draws from 183 to 105. The new camera is already a
  perf win; the rest of this doc builds on it.

---

## 2. Targets and budgets (replace tech.md §18 / `QUALITY`)

| Budget (iso play) | **Low** (mid phone: Adreno 6xx/7xx, Mali-G77+, A14+) | **Med** (Iris Xe, 1080p) | **High** (discrete) |
|---|---|---|---|
| Frame | 60 Hz cap, GPU ≤ 10 ms, CPU render submit ≤ 3 ms | 60 Hz, GPU ≤ 8 ms | 60–144 Hz |
| Draws (scene) | **≤ 40** | **≤ 60** | ≤ 90 |
| Triangles | **≤ 80k** | **≤ 150k** | ≤ 300k |
| Programs in a level | ≤ 30 | ≤ 30 | ≤ 36 |
| Internal resolution | `css × min(dpr, 1.5) × s`, s ∈ [0.6, 1.0] | `css × min(dpr, 1.25) × s`, s ∈ [0.7, 1.0] | `min(dpr, 2)`, s ∈ [0.8, 1] |
| AA | canvas `antialias: true` (MSAA is nearly free on tilers) | RT `samples: 4` | 4 |
| Shadows | blobs + baked vertex AO, **no shadow map** | blobs + **cached static sun map 2048** | same, 4096 |
| Post | **none** (glow cards) | 1 scene RT + bloom 3 mips + 1 uber pass | same + optional depth outline |
| Grass tufts | 1.7k (7k tris) | 4k (16k tris) | 8k (32k tris) |
| Characters | hull outline on the hero only | hull outline on the hero and engaged enemies | all |
| Particles | ≤ 300 | ≤ 1500 | 2000 |
| GPU texture memory | ≤ 48 MB | ≤ 96 MB | ≤ 160 MB |

Boss fights may spend +15 draws (adds, telegraphs). The fit zoom of up to 22 m triples the ground area, so the grass
radius scales with `d` (§6).

---

## 3. The warm toon material family (`characters/materials.js` exports; every area uses it)

**Why toon:**
- It is cheaper than PBR: no GGX specular, no environment-map sample, no PMREM, no clearcoat/sheen
  (`MeshPhysicalMaterial` was the most expensive program in the scene).
- It is the look the user asked for: soft bands, warm shadows, cream rim.
- With 2 lights (hemi + sun), `MeshToonMaterial` is about Lambert cost.

### 3.1 `makeWarmToon(opts)`: built on `MeshToonMaterial`, so skinning, instancing, batching, fog and vertex colours stay stock
```js
// characters/materials.js (owner: characters). One shared 4×1 ramp; NearestFilter gives crisp bands.
const RAMP = (() => { const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.needsUpdate = true; return t; })();
export const TOON_U = {                       // shared uniforms: one object, every material references it
  uShadowTint: { value: new THREE.Color('#6B4E71') },  // warm plum, not grey/black (art owns the value)
  uRim:        { value: new THREE.Color('#FFE8C8') }, uRimPow: { value: 3.0 }, uRimStr: { value: 0.35 },
  uGlow:       { value: new THREE.Vector4(0, -999, 0, 3.5) }, uGlowCol: { value: new THREE.Color('#FFC46B') },  // hero glow
  uLamps:      { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -999, 0, 0)) },                     // xyz, radius
  uLampCol:    { value: new THREE.Color('#FFB35C') },
};
export function makeWarmToon({ color = '#fff', map = null, vertexColors = false, rim = 1, emissive = '#000' } = {}) {
  const m = new THREE.MeshToonMaterial({ color, map, vertexColors, gradientMap: RAMP, emissive });
  m.userData.rim = rim;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, TOON_U, { uRimMul: { value: rim } });
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uShadowTint, uRim, uGlowCol, uLampCol; uniform float uRimPow, uRimStr, uRimMul;
        uniform vec4 uGlow; uniform vec4 uLamps[4];`)
      // tint the dark band warm instead of grey, then add rim, hero glow and lamp pools (analytic: no light count change)
      .replace('#include <opaque_fragment>', `
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        outgoingLight = mix(outgoingLight, outgoingLight * uShadowTint * 1.6, (1.0 - smoothstep(0.12, 0.45, lum)) * 0.5);
        float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), uRimPow);   // view-space
        outgoingLight += uRim * fres * uRimStr * uRimMul;
        vec3 wp = (inverse(viewMatrix) * vec4(-vViewPosition, 1.0)).xyz;   // HeightFog's vFogW replaces this (§3.4)
        float g = 1.0 - smoothstep(0.0, uGlow.w, distance(wp, uGlow.xyz)); outgoingLight += uGlowCol * g * g * 0.6 * diffuseColor.rgb;
        for (int i = 0; i < 4; i++) { float l = 1.0 - smoothstep(0.0, uLamps[i].w, distance(wp, uLamps[i].xyz));
          outgoingLight += uLampCol * l * l * 0.5 * diffuseColor.rgb; }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'warmtoon-v1';   // all instances share programs per define set
  return m;
}
```
- In the production version, `wp` comes from `vFogW` (HeightFog already computes the world position). This drops
  the `inverse()` from the sketch.
- **Program variants** come from defines three already adds: skinning, instancing, batching, vertexColors, map.
  That is at most 6–8 programs for the whole world and every character.
- **Lamps and hero glow as uniforms** replace `Env.heroLight` (a `PointLight` added to every program even at
  intensity 0) and the `Dressing.js` 2-light pool.
  - Lighting a lantern no longer changes `numPointLights`, so there is **no recompile hitch**. This matters for the
    forest day → night switch and the Lantern Alley.
  - world sets `TOON_U.uLamps` to the 4 lamps nearest the focus (CPU sort at 4 Hz).

### 3.2 Steel: `makeToonSteel()` = `MeshMatcapMaterial`
- A procedural 128² matcap (`CanvasTexture`) with a warm sky top, a cream highlight streak and a plum bottom.
- It needs no lights, it is the cheapest lit-looking material in three, and it gives the "polished silver" contrast
  that art.md wants.
- Holy emissive: add `uHoly` (0–1) to the matcap result in `onBeforeCompile`.
- It replaces every `MeshPhysicalMaterial` on the armour, the sword, pot helms and the bell.

### 3.3 What stays custom
- Grass (§6), foliage sway (`LevelKit.makeTreeMaterial` becomes WarmToon plus the existing sway chunk), water
  (WarmToon with a scrolling ramp, no env map, roughness gone), FX `ShaderMaterial`s, telegraphs and decals.
- `PMREMGenerator` and the env map (`Env._envScene`) are **removed** in iso play: no `envMap` sample per fragment and
  no PMREM regeneration on preset change.

### 3.4 Fog
- HeightFog's patcher already reaches `MeshToonMaterial` (stock fog chunks).
- Grass and FX use `HFOG_GLSL` (CONTROLS_SPEC §4.1). No change in principle.

### 3.5 Tone mapping and "warm, not 90s"
- **`renderer.toneMapping = THREE.NeutralToneMapping`** (in r186).
  - ACES pushes saturated orange toward yellow and crushes pastels.
  - Neutral keeps the ginger, pink and gold that carry the mood. Exposure 1.0.
- "Not 90s" is a render-quality choice as much as an art one:
  - always anti-aliased (no shimmering stair-steps);
  - never below 0.6 render scale (§9);
  - smooth fog gradients with dither in the uber pass (no 8-bit banding);
  - no nearest-filtered low-res textures on world surfaces;
  - no affine wobble or vertex snapping;
  - soft blob shadows rather than hard aliased PCF.

---

## 4. Shadows: blobs plus a cached static sun map

### 4.1 Blob shadows (fx `BlobShadows.js`, new; 1 draw for every actor)
```js
// fx/BlobShadows.js (owner: fx). Every actor registers { object3d, radius }; one InstancedMesh of flat quads.
const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
  uniforms: { uCol: { value: new THREE.Color('#3B2A3A') } },
  vertexShader: `varying vec2 vUv; attribute float aAlpha; varying float vA;
    void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform vec3 uCol; varying vec2 vUv; varying float vA;
    void main(){ float r = length(vUv - .5) * 2.; float a = (1. - smoothstep(.55, 1., r)) * vA; gl_FragColor = vec4(uCol, a * .38); }` });
mat.polygonOffset = true; mat.polygonOffsetFactor = -2;          // no z-fight on ground
const blobs = new THREE.InstancedMesh(geo, mat, 48); blobs.frustumCulled = false; blobs.renderOrder = 1;
// per frame: groundY = physics.heightAt(x,z); h = actor.y - groundY; scale = radius * 2 * (1 - min(h,3)/6); aAlpha = 1 - min(h,3)/4
```
- Crows already use a shadow-decal dive; they move into this pool.
- The jump arc gives her a shrinking, fading blob, which is the clearest height cue from above.
- Every character, prop actor and pickup sets `castShadow = false`.

### 4.2 Cached static sun map (world `Env.js` + `StaticShadow.js`, new; Med/High only)
- Casters are **static only**:
  - the Props `BatchedMesh` (1 draw);
  - instanced trees (one per set);
  - merged walls and buildings.
- Settings:
  - `renderer.shadowMap.autoUpdate = false`
  - `shadow.camera` is an ortho 64 × 64 m box, **snapped** to a 16 m grid around the focus
  - 2048² map (3.1 cm per texel); `THREE.PCFShadowMap`, `shadow.radius = 1`
- The map re-renders (`renderer.shadowMap.needsUpdate = true`) only when one of these happens:
  - the snapped centre changes, which is at most once every few seconds of running;
  - the sun preset tweens (re-render every 4th frame while it tweens);
  - `setVisible` changes a caster set.
- One re-render is about 10–20 draws and 1–2 ms, once.
- Receivers are only the ground, paving, the Props batch and trees. Characters do not receive; the toon band and
  blob carry them.
- Result: the per-frame shadow pass (37–66 draws) is gone. Sun shadows stay crisp and stylised under props, which
  matters for the "warm afternoon" read.
- **Low:** no shadow map. world bakes **vertex AO** into terrain and prop vertex colours at level build (8 ray samples
  per vertex against StaticColliders, or a cheap height-difference term). This costs zero at runtime.
- Never toggle `castShadow` or `shadowMap.enabled` at runtime outside a quality change behind a veil: it recompiles
  every receiving program.

---

## 5. Batching and instancing

### 5.1 World statics (world)
- `Props.js` already puts every static prop into **one `BatchedMesh`** (good: 20k–48k triangles, 1 draw). Keep:
  - `perObjectFrustumCulled = true` and `sortObjects = true` (front to back gives early-Z on opaque);
  - **`optimize()`** after build;
  - `setInstanceCount` / `setGeometrySize` to trim spare room.
- **iOS / no `WEBGL_multi_draw` (verified in the r186 source):** `WebGLRenderer` then loops `renderer.render()` per
  instance, setting `_gl_DrawID` each time.
  - That is not one draw on those devices; it is N cheap draws with no state change.
  - Mitigation: at build, if `!renderer.extensions.has('WEBGL_multi_draw')`, world **merges static props per 32 m
    cell** with `mergeGeometries` (vertex colours) into ordinary meshes instead (about 6–12 cells visible in iso).
  - Measure on a real iPhone [unverified].
- **Material unification is what makes the merge possible.** Today `LevelKit` has `_vcMat` and `makeStoneMaterial`,
  `Dressing.texturedMaterial` makes per-texture Standard materials, and gate has brick materials. All of these become
  **WarmToon + vertexColors** (Kenney colormaps are already vertex-baked in Props). Bricks become baked vertex colour
  plus a shared 512² toon brick atlas.
- **Trees:** keep `InstancedMesh` per template (crown and trunk split, CONTROLS_SPEC §3 fades crowns). Drop
  `THREE.LOD` and billboards: in iso nothing is 50 m away.
- **Fog-radius cull:** at 4 Hz, hide BatchedMesh instances (`setVisibleAt`) and whole instanced sets or cells whose
  bounding sphere's nearest point is beyond `R` from the focus:
  ```
  R = clear + sqrt(-ln(0.02)) / (ρ · topMul)      // 98 % fog
  meadow_day: 5 + 1.978 / (0.045 · 1.5) = 34.3 m
  bog: 4.5 + 1.978 / (0.07 · 1.2) = 28 m
  ```
  - Recompute on preset change and on Golden Hour (`clear × 1.5`).
  - `camera.far = 60` (CONTROLS_SPEC proposes 90; 60 is enough at 51°). The tallest tower top is visible at about
    40 m ahead of the camera.

### 5.2 Characters: merge to 1–3 draws (characters, used by enemies, companions, player)
**KayKit and GLB enemies:** `bakeSkinned(root)` merges every `SkinnedMesh` sharing the skeleton, plus rigid
attachments (beast head, plate, weapon), into **one** skinned geometry:
```js
// characters/merge.js (owner: characters)
export function bakeSkinned(root, skeletonMesh, material) {
  const geos = []; const boneIndex = new Map(skeletonMesh.skeleton.bones.map((b, i) => [b, i]));
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(skeletonMesh.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let g = o.geometry.clone();
    if (o.isSkinnedMesh) { g.applyMatrix4(o.bindMatrix); }                 // KayKit parts share the bind space
    else {                                                                  // rigid part: skin it 100 % to its parent bone
      let b = o.parent; while (b && !b.isBone) b = b.parent;
      const bi = boneIndex.get(b) ?? 0;
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));  // into mesh space at bind pose
      const n = g.attributes.position.count;
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).fill(0).map((_, i) => (i % 4 ? 0 : bi)), 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
    }
    normaliseAttributes(g);                     // ensure position, normal, uv, color (white for textured), aTexMix
    geos.push(g);
  });
  const merged = mergeGeometries(geos, false);
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.bind(skeletonMesh.skeleton, new THREE.Matrix4());
  return mesh;
}
```
- The material is WarmToon with the **KayKit atlas** as `map` (one atlas per pack). Procedural parts use vertex
  colour with `aTexMix = 0`: `diffuse = mix(vColor, texel, aTexMix)` is a 3-line chunk.
- Bake this **once per template** and `SkeletonUtils.clone` the result per spawn.
- Hyena goes from 16 draws to 1. Rat_xbow goes from 5 to 1.
- The breastplate word texture becomes a 4-slot word atlas (1024 × 256), so the plate also merges.

**Procedural hero and kittens:**
- `KittenBuilder` parents dozens of rigid primitives to the rig. `bakeSkinned` turns the build into **(1) one toon
  skinned body** (fur base, head, ears, bow, eyes through a UV-offset expression atlas) and **(2) one matcap skinned
  armour + sword**. **(3) The cape** stays its own verlet mesh.
- Result: hero **19 → 3 draws**, kittens about 12 → 1–2.
- Swappable parts (sword skins, capes, pot helms) are re-baked on change. This happens in shops and menus, not in combat.
- `setExpression` changes `uEyeFrame` (a uniform on the body material) rather than swapping textures.

**Outline (warm, not black):**
- An inverted hull, +1 draw per outlined actor.
- It reuses the merged skinned geometry: a second `SkinnedMesh` sharing geometry and skeleton, with a material
  `side: BackSide`, vertex push `position += normal * uOutline * (viewDepth / 13)` (constant screen width
  ≈ 1.5 px), colour `#4A2E2A` (warm cocoa).
- Hero: always. Engaged enemies (≤ 4): Med and High.
- This costs about 5 draws, against the 60+ that merging saves.

### 5.3 Skinning CPU (enemies, companions)
- Mixers on screen (`ctx.cam.onScreen`, §12 camera API) update at full rate.
- Off screen: **15 Hz** with `mixer.update(accumDt)`, and `skeleton.update` is skipped when not visible
  (`mesh.visible = false` when outside the frustum + 1 m).
- Sleeping far enemies already exist; keep them.

---

## 6. Grass and wheat as iso toon tufts (world `Grass.js`, `Wheat.js`)

The iso footprint was computed from §2.1: fov 38°, 16:9, d 13, pitch 51.3°, eye height 10.7 m.
- Bottom edge: a 13.2 m wide strip 4.3 m behind the focus.
- Top edge: 23 m wide, 8.8 m ahead.
- **Area ≈ 237 m²** at 13 m. It scales with d²: about 360 m² at the combat +3 m and about 680 m² at the boss 22 m.

| Item | Spec |
|---|---|
| Geometry | One **tuft**: 3 tapered blades in a fan, rotated 0°/60°/120°, 1 triangle per blade with a mid vertex (2 triangles), so **6 triangles and 9 vertices**. It reads as a fluffy clump from 51° down, not as single lines. |
| Tile | The existing wrapping tile, centred on **focus + 2 m along the view-forward**, size `T = 1.6 · d` (≈ 21 m at 13 m; 35 m at 22 m), fade over the last 15 % |
| Density | Low **4/m²**, Med **9/m²**, High 18/m² × the existing density map (paths, water, props). Med: 21² × 9 ≈ **4k tufts = 24k triangles**. Low: 18² × 4 ≈ 1.3k tufts = 8k triangles. |
| Flowers | The same `InstancedMesh` with per-instance colour (`setColorAt`) and a 2-triangle petal cap: **no third layer**. Grass + flowers = **1 draw**; the far layer is deleted (fog hides beyond 34 m and iso never sees 45 m). |
| Shading | No shadow receiving (no shadow-map fetch over the biggest overdraw surface). Tip-to-root gradient + `TOON_U` ramp from the *terrain normal* per instance + per-vertex fog. Optional static-shadow fetch on High only. |
| Overdraw | **No alpha test** (it kills early-Z on mobile); triangles are opaque. Draw grass **after** terrain and props (`renderOrder`) so the depth test rejects hidden tufts. |
| Wind and trample | The existing world-space chunk; the trample array of 5 (CONTROLS_SPEC §4.2) |
| Wheat | The same tuft pipeline with a taller 2-blade + ear geometry; Crow Fields only |

Grass goes from 76k–148k triangles in 3–4 draws to **8k–24k triangles in 1 draw**.

---

## 7. Fur (characters `Fur.js`)

- In **iso play**: `FUR_QUALITY` shells = 0 on every preset. The fluff comes from:
  - WarmToon rim (cream) and the warm wrap band;
  - **baked tuft geometry**: cheek ruff, chest bib, tail tip and ear tufts as 20–40 small cone/fan triangles merged
    into the body bake (art: "fluffy kitten" silhouette);
  - the hull outline drawn **with noise** on the head and tail (`uOutline` × a 0.7–1.3 noise on a vertex attribute),
    which gives a fuzzy silhouette for 0 extra draws.
- **Close-ups** (Meme Cam crane, cutscene close presets < 4 m, title screen) on High and Med: the current shell
  system with `FUR_LOD` turns on for the hero only, behind the cutscene cut (shells pre-compiled at boot, §10).
- Saves 77.6k (meadow) to 154k (gate) triangles, 3–6 draws and 1–2 programs. `QUALITY.*.furShells` stays as the
  cutscene count.

---

## 8. Post-FX: one combined pass (core `PostFX.js`)

### Med and High
```
scene → RT0 (HalfFloat, samples 4 (Med) / 4 (High), sub-rect = dynamic scale s)
     → bloom: prefilter (threshold 0.9, soft knee) into ½ → down ¼ → down ⅛ → up ¼ → up ½   (dual-Kawase, 5 tiny passes)
     → UBER pass to the canvas (1 full-screen pass)
```
```glsl
// core/postfx/uber.frag (owner: core). One pass: upscale + bloom add + Neutral tone map + warm grade + vignette + dither.
uniform sampler2D tScene, tBloom; uniform vec2 uScale;           // uScale = s (dynamic-res sub-rect)
uniform float uBloom, uExposure, uSat, uVig, uVigOff; uniform vec3 uLift, uGain;
varying vec2 vUv;
vec3 neutral(vec3 c){ /* three's NeutralToneMapping body, copied from tonemapping_pars_fragment */ return c; }
void main(){
  vec3 c = texture2D(tScene, vUv * uScale).rgb;                  // bilinear upscale of the sub-rect
  c += texture2D(tBloom, vUv * uScale).rgb * uBloom;
  c = neutral(c * uExposure);
  float l = dot(c, vec3(.2126,.7152,.0722)); c = mix(vec3(l), c, uSat);   // warm grade: sat 1.08
  c = c * uGain + uLift * (1. - c);                                      // lift shadows toward warm plum
  vec2 d = vUv - .5; c *= mix(1., smoothstep(.8, .2, length(d) * uVigOff), uVig);
  c = linearToSRGB(c);                                                   // replaces OutputPass
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) - .5) / 255.;  // dither: no fog banding
  gl_FragColor = vec4(c, 1.);
}
```
- This replaces `UnrealBloomPass` (11+ passes at 5 mip levels), `OutputPass` and the `Vignette` ShaderPass: about
  14 full or partial passes become 6 small ones and 1 full one.
- `setBloom`, `setGrade` (an open STATUS request) and `setVignette` become uniform writes on the uber material.
- The NaN guard moves into the prefilter.
- Keep `EffectComposer` only as a pass container, or write a 60-line `PostChain` (a fullscreen triangle,
  `renderer.setRenderTarget`). Both are fine; the custom chain avoids `ShaderPass` copies.

### Low
- **No RT and no passes.** The renderer tone-maps in the material shaders (`NeutralToneMapping` works there).
- The warm grade is baked into hemi and sun colours and `uShadowTint`.
- The holy glow ladder uses fx **additive billboard halos**: a sprite on the blade (1 draw), the Golden Hour aura
  hull (exists), and sparkles.
- If dynamic resolution needs upscaling, the canvas DPR is lowered instead (§9).

### Depth outline for the world (High only, optional)
- A depth-only edge term in the uber pass (4 taps of `RT0.depthTexture`), skipped on grass by the depth threshold.
- Off by default. Characters already have hull outlines.

---

## 9. Dynamic resolution and frame pacing (core `PostFX.js`, `Game.js`)

| | Low | Med / High |
|---|---|---|
| Mechanism | `renderer.setPixelRatio(base × s)` (no RT exists, and a canvas resize is cheap) | RT allocated **once** at the max size; render with `rt.viewport.set(0, 0, W·s, H·s)` and `rt.scissor`; the uber pass reads with `uScale = s`. **No reallocation.** |
| Steps | s ∈ [0.6, 1.0], step 0.05 | s ∈ [0.7, 1.0], step 0.05 |
| Controller | Smoothed rAF frame time (EMA α 0.1). Down when > 17.5 ms for 1.0 s; up when < 13 ms for 3 s. Asymmetric, so it never ping-pongs. | Same; on desktop Chrome use `EXT_disjoint_timer_query_webgl2` GPU time when the extension exists, since it isolates GPU from JS |
| Frame cap | **60 Hz cap on 90/120 Hz displays** (skip the rAF unless 16.2 ms have passed): halves GPU heat and battery, and avoids throttling 5 minutes in | uncapped on High; `settings.fpsCap` (30/60/off) |
| Thermal ladder | If s sits at the floor for 10 s: step grass density −1 tier, then particles ×0.5, then outlines off. Never touch the gameplay framing. | n/a |
| Test | `?test` freezes s = 1 (existing `dynamicRes = false`) | same |

---

## 10. Shader precompile: zero hitches in play (core `Game.js` / world `LevelManager.js`)

```js
// at the end of LevelManager.load(), under the loading veil
const warm = ctx.enemies.prewarmSet(level.enemyTypes);     // one hidden-but-visible instance of each type, at y −50
ctx.fx.prewarm(warm.root);                                  // one of each FX pool: telegraphs, decals, trails, halos, numbers
scene.add(warm.root);
await renderer.compileAsync(scene, camera);                 // KHR_parallel_shader_compile when available (r186)
renderer.render(scene, camera);                             // one real frame so textures upload too
scene.remove(warm.root); warm.dispose();
```
- `compile` / `compileAsync` walk `scene.traverseVisible` (verified in the r186 source), so warm objects must be
  `visible: true`. Place them out of the frustum or below the ground.
- **Program keys** depend on light counts, shadow on/off, fog and tone mapping. Because of §3.1 (no runtime point
  lights) and §4 (no runtime shadow toggles), the key set is fixed for a level.
- The forest day → night switch changes only uniforms.
- Fur shells for close-ups are compiled at boot (title screen), once.
- **Smoke assertion** (core `tests/smoke.mjs`, block `perf:no-compile`):
  1. Read `renderer.info.programs.length` after load.
  2. Play 60 s of scripted combat (spawn 6 enemies, Holy, Golden Hour, a lantern toggle).
  3. Assert the count did not grow.

---

## 11. Textures and download (core `scripts/`, every area's manifest)

- **Most of the toon world needs no textures** (vertex colours + the 4×1 ramp + 1 matcap). What remains:
  - the KayKit atlases (1 per pack);
  - the eye/expression atlas;
  - the word atlas;
  - the brick toon atlas;
  - UI.
- **KTX2:** `scripts/encode-textures.mjs` runs `@gltf-transform/cli`:
  - ETC1S for albedo atlases (Kenney/KayKit colour, about 8× smaller on the GPU than RGBA8 with mips);
  - UASTC for the eye atlas (sharp edges).
  - Load with `KTX2Loader().setTranscoderPath('bundle/basis/').detectSupport(renderer)`, attached to `GLTFLoader`.
  - GPU memory: a 1024² RGBA8 texture with mips is 5.6 MB; as ETC2/ASTC (mobile) or BC7/BC1 (desktop) it is
    0.7–1.4 MB.
- **meshopt:** `gltf-transform meshopt` on every GLB, plus `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`
  (in `three/addons/libs/meshopt_decoder.module.js`). It cuts GLB bytes by about 50–70 % and keeps the initial
  download under 25 MB (§18.4).
- **Procedural textures** (`CanvasTexture`: eyes, words, matcap) are built once at boot and shared.
  `generateMipmaps` stays off for UI-like textures.

---

## 12. Hooks and acceptance (core `debug.js`, tests)

`__GAME__.perf()` (new, `?test` / `?debug`) returns:
```js
{ calls, tris, programs, geometries, textures, shadowCalls,       // shadowCalls: draws in the last shadow update (0 most frames)
  scale,                                                           // dynamic-resolution s
  byCat: { hero, enemies, companions, grass, props, fx, ui3d },   // from object userData.perfCat
  gpuMs }                                                          // when the timer query exists
```
**Acceptance** (smoke `perf:*` blocks, iso pose, 1280 × 720, Med; Low numbers in parentheses):

| Scene | Draws | Triangles | Programs |
|---|---|---|---|
| meadow start | ≤ 35 (≤ 25) | ≤ 110k (≤ 60k) | ≤ 30 |
| forest night, Lantern Camp | ≤ 45 (≤ 32) | ≤ 130k (≤ 70k) | same as day (no recompile) |
| town hub, all residents | ≤ 60 (≤ 40) | ≤ 150k (≤ 80k) | ≤ 30 |
| gate, B2 with 5 hyenas + adds | ≤ 60 (≤ 40) | ≤ 150k (≤ 80k) | ≤ 30 |

Plus:
- `perf:no-compile` (§10).
- `shadowCalls === 0` on ≥ 95 % of frames while standing.
- A screenshot pair (Med vs Low) judged for "the same warm look".
- A 10-minute soak on a real mid phone (Pixel 7a / Galaxy A54 class) with `?debug`: ≥ 58 fps median, s ≥ 0.8 median
  [to be measured; no phone in this environment].

---

## 13. Ownership map (GAME_DESIGN §19.2) and order

| Area | Work | Files |
|---|---|---|
| **core** | Renderer creation (`NeutralToneMapping`, `antialias` on Low, `stencil: false`, `powerPreference`); `PostChain` + uber pass + dual-Kawase bloom; dynamic resolution (sub-rect on Med, DPR on Low) + 60 Hz cap; new `QUALITY` keys (`grassDensity`, `outline`, `staticShadow`, `bloomMips`, `fpsCap`); `RENDER.far` 60; `perf()` hook; `compileAsync` helper; `KTX2Loader` / `MeshoptDecoder` in `Assets.js`; `scripts/encode-textures.mjs`; smoke `perf:*` | `Game.js`, `PostFX.js` (+ `postfx/uber.frag.js`, `postfx/bloom.js`), `config.js`, `Assets.js`, `debug.js`, `scripts/**`, `tests/smoke.mjs` |
| **characters** | `makeWarmToon`, `makeToonSteel`, `TOON_U`, ramp; `bakeSkinned` (merge.js); hero/kitten bake to 3 draws; expression atlas; word atlas; hull outline; shells only for close-ups; baked tufts | `materials.js`, `merge.js` (new), `KittenBuilder.js`, `Fur.js`, `Eyes.js`, `Plate.js`, `Armour.js`, `Sword.js`, `BeastHead.js`, `runtime.js` |
| **world** | Every material → WarmToon / vertex colour; `StaticShadow.js` (snapped cached sun map); remove `heroLight` and the Dressing point lights → `TOON_U.uGlow` / `uLamps`; drop PMREM in play; fog-radius cull at 4 Hz; per-cell merge fallback without multi-draw; grass and flower **tufts** in 1 draw; wheat tufts; vertex AO bake (Low) | `Env.js`, `Props.js`, `LevelKit.js`, `Grass.js`, `Wheat.js`, `Dressing.js`, `Terrain.js`, `Water.js`, `HeightFog.js`, `levels/*.js`, `StaticShadow.js` (new) |
| **fx** | `BlobShadows.js` (1 draw); glow halo cards for Low; `prewarm()`; particles to ≤ 1 `InstancedMesh` per material; GroundMist stays 1 draw | `BlobShadows.js` (new), `HolyFX.js`, `FX.js`, `Telegraphs.js` |
| **enemies** | Use `bakeSkinned` per template; `castShadow = false`; off-screen mixer at 15 Hz; `prewarmSet(types)` | `Enemy.js`, `EnemyManager.js`, `types/*`, `kaykitGear.js` |
| **companions** | Baked kittens; mixer LOD; blob registration | `Companion.js`, `LostKitten.js`, `HubKittens.js`, `Pudding.js` |
| **player** | `SwordcatModel` consumes the baked hero; the skin/cape swap re-bakes | `SwordcatModel.js` |
| **camera** | `onScreen(p, margin)` (CONTROLS_SPEC §12); publish `focus` and `d` for the grass tile and the shadow snap; far 60 | `FollowCamera.js` |
| **ui** | Quality panel: Low/Med/High/Auto, FPS cap, "Battery saver" (Low + 30 fps) | `menus.js` |

**Order (largest win first; each step is measurable on its own with `perf()`):**
1. Blob shadows + actors stop casting (−37 to −66 draws). Fur shells off in iso (−78k to −154k triangles).
2. Uber post pass + Neutral tone mapping (about half the Med GPU time at 1080p in the measurement).
3. Grass tufts (−60k to −120k triangles, −2 to −3 draws).
4. `bakeSkinned` for enemies, then hero and kittens (gate −60 draws).
5. WarmToon / matcap everywhere, lamps as uniforms, PMREM out (programs 135–241 → ≤ 30); `compileAsync`;
   `perf:no-compile`.
6. Static cached sun map (Med); vertex AO (Low).
7. Dynamic-resolution sub-rect, 60 Hz cap, thermal ladder.
8. KTX2 + meshopt (download and memory; mostly for mobile loads).

**Risks:**
- `bakeSkinned` breaks per-part visibility toggles. Hidden props are excluded at bake time; the dynamic ones (pot
  helm, shield) go into a second small baked mesh.
- Cutscenes that need close fur stay High-only and fall back to rim-only with no logic change.
- Without multi-draw (iOS), the BatchedMesh fallback has a CPU cost; the per-cell merge fallback covers it, but it
  must be measured on an iPhone.
- Snapped shadow updates are a single 1–2 ms frame; spread over 2 frames if they are visible in the frame-time graph.
