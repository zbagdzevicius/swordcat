# art_1: Character and creature appeal ("cuddle pass") for the iso camera

Status: **draft for review**. Design only; nothing under `src/` was changed.
User request: *"warm cartoonish thematics so that everyone will feel great inside, not 90s nostalgic. Performance must be
extraordinary. Maximum MOBA-like automatic camera."*
Scope: Swordcat, kittens and villagers, every enemy and boss: proportions, fur, eyes, squash and stretch, the
cute-but-menacing enemy rules, recolouring the CC0 GLBs, and readability from the CONTROLS_SPEC iso camera.
Companion drafts: **art_2** (world, grade, UI, FX; its Neutral tone mapping, warm rim `#FFE6B8` and the "biscuit-bone"
Boneheads are used here unchanged) and **cam_*** (camera rig).
Amends: art.md §1, §2.1, §2.5, §3, §11 and GAME_DESIGN §17 (fur and mood bullets) and §18.3 (beast heads). Where this
file and those sections disagree, this file wins **once approved**.

---

## 0. What the camera change does to the characters (measured and derived)

### 0.1 Pixel budget (CONTROLS_SPEC §2.1; H = Swordcat's ear-tip height, about 0.8 m on screen)

| Feature | Now (art.md) | px desktop 1080p, d 13 m | px phone 844×390, d 12 m | Verdict |
|---|---|---|---|---|
| Whole cat | 1.0 H | **96** | **38** | OK (spec clamp ≥ 30) |
| Head height | 0.38 H | 36 | 14 | too small to carry a face |
| Eye diameter | 0.09 H | 8.6 (5.4 tall after the 51° pitch foreshortens the face) | 3.4 (2.1 tall) | **unreadable on phones** |
| Bow | 0.12 H | 11.5 | 4.6 | marginal |
| Fur shell depth | 0.045 H | 4.3 | 1.7 | sub-pixel: shells only add shimmer |
| One strand cell (`uTiling` 3, 96 cells) | ~0.0035 H | 0.3 | 0.1 | **pure aliasing** |

At a 51° pitch you see the **top of the head, the shoulders, the cape and the tail** first. You see the face only
when she faces south (the camera side), and even then it is foreshortened to cos 51° ≈ 0.63 of its height. The current
model was designed for a 3.6 m eye-level follow camera. It reads as a ginger ball on a grey tin can (see the current
follow-camera shot `research/next/shots/art1_iso_13m.png`; the iso pin did not take on a loaded machine).

### 0.2 Cost today (`research/next/tools/art1_measure.mjs`, meadow, med, 1920×1080, Iris Xe, 4 enemies spawned)

| Measure | Value |
|---|---|
| Scene draw calls / tris (play mode, follow cam) | 102 / 497k |
| **Swordcat alone** (hide her root) | **31 calls, ~200k tris (40 % of the scene's triangles)**, 20 meshes, 5 material types (7 × `MeshPhysicalMaterial`, 3 × fur `ShaderMaterial`, 7 × `MeshStandardMaterial`) |
| Her fur shells (quality `off` vs `med`) | −105k tris |
| Her geometry without shells | ~90k tris (64×48 spheres everywhere) |
| 4 enemies (2 rat_pike, rat_xbow, crow) | 33 calls (~8 each, shadow pass included), 21k tris, 5–6 meshes each |
| Frame times | not usable: the machine was shared with several other agents' servers (55–90 ms medians in every variant) |

Two facts follow. First, **`Fur.js` `FUR_LOD.far` is 8 m from the lens**, so at the iso distance of 13 m the shells are
already at 0 and she renders the skin layer only. CONTROLS_SPEC §2.8 ("hero shells stay full within 25 m of the lens")
would put the 105k tris back for no visible gain. **This draft overrides §2.8 for the hero: no shells in iso.**
Second, **a 96 px character does not need 90k triangles or `MeshPhysicalMaterial` sheen and clearcoat.** The budget
in §6 cuts her to about 8 calls and 16k tris, and every character and enemy to 3 shared shader programs.

---

## 1. The appeal rules (replace art.md §2.1 "cuteness rules")

1. **Baby schema, pushed for the iso view.** The head is **0.46 H** tall and **0.60 H** wide, so it is wider than the
   pauldrons (0.54 H). The eyes sit low in the face (centre at 42 % of the head height from the chin). Forehead and
   cheeks are big; muzzle and nose are tiny.
2. **Round over sharp.** No edge on any character except the blade's edge. Pauldrons are 2 big domes, not 4 lames.
   Rivets go (they are 1 px). Every armour piece gets a 15 % thicker rim that catches the warm rim light.
3. **Big simple masses, few details.** One read per body part. Details smaller than **4 px at d 13 m (0.04 H)** are
   removed in the play LOD (whiskers, rivets, mail texture, sabaton lames, breastplate words beyond 6 m).
4. **Readable from above.** The top-facing surfaces carry the identity: the bow on top of the left ear, the ginger
   head disc with a cream "M" blaze, a gold cape-hem trim, the cream tail tip. Enemies carry a **top colour** (§5.2).
5. **Soft gradients, not texture.** Fur is a smooth coat gradient + a warm rim + a few silhouette tufts (§3). No
   strand noise at gameplay distance.
6. **Everything breathes.** Idle breathing, blinks, ear twitches, a tail sway and squash and stretch on every contact
   (§4). A character that stands still for 1 s looks like a statue from 13 m.
7. **Eyes are unlit.** Eyes, catchlights and mouths are `MeshBasicMaterial` (or `uUnlit` in the toon program). They
   never go dark in shade, which is what makes cartoon faces feel alive.
8. **Enemies are cute-menacing, never creepy** (§5): the menace comes from brows, posture, size, props and a grin,
   never from teeth rows, red glowing eyes, bones, insect detail or black silhouettes.

---

## 2. Swordcat "cuddle" proportions (replaces art.md §2.1 game targets; `characters/KittenBuilder.js`, `configs.js`)

Heights from the soles (0) to the ear tips (1.0 H). The total height stays 1.0 H, so physics, hit boxes, `MODEL_FIT`,
cages, doors and the camera's `catH` are unchanged.

| Feature | art.md target | **New target** | Code lever |
|---|---|---|---|
| Head height (ear tip to chin fur) | 0.38–0.40 H | **0.46 H** | `cfg.headScale` 1.0 → **1.17** for Swordcat; kittens **1.22** |
| Head width incl. cheek ruff | 0.52 H | **0.60 H** | skull `scale(1.12,1,1)` → `(1.18, 1, 1.02)`; cheek ruff r 0.085 → 0.095 |
| Body (chin to sole) | 0.62 H | **0.54 H** | `hips.y` 0.30 → 0.27, `chest.y` 0.10 → 0.085, legs ×0.85 |
| Shoulder width | 0.54 H | 0.54 H (now < head width) | unchanged |
| Eye diameter | 0.09 H | **0.13 H** (r 0.065 in head space ÷ 1.17) | `EyePair.r` 0.045 → **0.056** |
| Eye spacing (centres) | 0.145 H | **0.18 H** | `FACE.eyeL/R.x` ×1.15 |
| Eye centre height | 0.79 H | **0.74 H** (low in the face) | `FACE.eye*.y` −0.03 |
| Face tilt (iso) | — | the face plane (eyes, nose, mouth, muzzle) is rotated **12° up** about the head's x axis; in play the head pitches **+8°** toward the camera when idle or walking (not in the Stand or swings) | `FACE` offsets; `head` joint additive in `SwordcatModel` |
| Ears | 0.12 H cone | **0.13 H**, base radius ×1.15, rounder tip (lerp the top 2 rings 60 % toward a sphere) | `earGeometry` |
| Bow | 0.12 H at the ear base | **0.17 H**, moved to the **top-front of the left ear** (+X, y 0.97 H, tilted 25° toward the camera) so it reads from above; emissive 0.08 (CONTROLS_SPEC §12 characters 3) | `Bow.js` |
| Pauldrons | 4 stacked lames + rivets | **2 domes**, outer radius ×1.1, a **brass rim** 0.012 H | `Armour.js` |
| Breastplate | lathe, words decal | same lathe, smoother (24 segments), words only in the close-up LOD | `Armour.js`, `Plate.js` |
| Tassets, greaves, sabatons | lames | one rounded skirt + 2 boot "beans" (half-ellipsoids) | `Armour.js` |
| Tail | 0.45 H long, r 0.065 + fur | **0.50 H, r 0.085**, bushier middle; cream tip 25 % of the length | `TAIL_CURVE`, tail radius fn |
| Cape | 0.46 H, flares 0.40 → 0.55 H | **0.40 H**, rounded hem (sag 0.03 H), **gold hem trim 0.02 H** (`CAPES.*.hem`), lining visible from above | `Cape.js` |
| Sword | 0.85 H blade, 1.0 H total | **0.80 H blade, 0.95 H total**, blade width ×1.25, rounded tip radius 0.01 H, a bigger brass guard (0.24 H) | `Sword.js` (hitbox unchanged: combat owns reach) |
| Whiskers | 3 + 2 lines | close-up LOD only | `KittenBuilder` LOD |

**Kittens** (companions, lost kittens, hub kittens): `headScale` **1.22**, body 0.50 H, eyes 0.14 H, a pupil radius of
**70 %** of the iris (Swordcat 62 %). They stay 0.55–0.75× her height (art.md §7).

**Villagers and adult cats** (Whiskerbottom, Marmalade, the old knights): `headScale` 1.05, eyes 0.11 H, so
the hero and the kittens stay the cutest things on screen.

---

## 3. Fur: "Soft Fur" shading instead of shells in play (`characters/Fur.js`, `materials.js`)

### 3.1 Decision

| Context | Fur look | Cost |
|---|---|---|
| **Play (iso, every quality)** | **Soft Fur**: the coat's vertex colour + a soft 2-tone ramp + a sky/ground gradient + a warm top-weighted rim + silhouette **tuft cards** (one instanced draw per character) | base mesh only; +1 draw for tufts |
| Close-up (cutscene preset, Meme Cam, dialogue, title, photo; lens < 6 m) | Soft Fur **+ shells** (16 hero, 10 kittens; ultra 24) | today's cost, only while framed |
| Low quality | Soft Fur, no tufts | base mesh only |

The shell `InstancedMesh` is **created lazily** the first time a close-up needs it (`kitten.setCloseUp(true)`), and
it is kept afterwards. That removes 3 transparent `InstancedMesh` entries per kitten from every play frame (they are
culled to count 1 today but still sort and bind).

### 3.2 The toon program (one program for fur, cloth, leather and skin; skinned and static variants)

Use the built-in **`MeshToonMaterial`** (it supports skinning, fog, shadows and instancing, and has no specular or
IBL) with a soft gradient map and an `onBeforeCompile` patch for the rim, the coat gradient, the holy glow and the
per-vertex `rmse` channel that `makeKitMaterial` already uses. It replaces `makeKitMaterial`'s
`MeshPhysicalMaterial` (sheen + env map + 4 lights) on all fur and cloth.

```js
// characters/materials.js — shared by every character AND every recoloured GLB enemy (§5.4)
let _ramp = null;
/** 4-texel ramp, linear filtered: a soft 2-tone cartoon terminator (not hard cel bands). */
export function softRamp() {
  if (_ramp) return _ramp;
  // dotNL*0.5+0.5 → shade. Texels: deep shade, shade, lit, lit. The linear filter makes the terminator ~25 % wide.
  const d = new Uint8Array([150, 150, 150, 255, 178, 178, 178, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  _ramp = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _ramp.magFilter = _ramp.minFilter = THREE.LinearFilter; _ramp.generateMipmaps = false; _ramp.needsUpdate = true;
  return _ramp;
}

export const TOON = {
  uRim: { value: new THREE.Color('#FFE6B8') },     // art_2 §3.4 day; '#FFD08A' at night (Env writes it)
  uRimK: { value: 0.38 },
  uShadeTint: { value: new THREE.Color('#B48CA0') }, // shadows are tinted plum, never grey (art_2 §1)
  uSky: { value: new THREE.Color('#FFF4E2') },        // top-of-form lift
};

/**
 * @param {{ skinned?: boolean, holy?: boolean, map?: THREE.Texture }} o
 * Vertex colour = albedo; attribute rmse = [unused, metal-ish mask, rim/sheen mask, emissive] as today.
 */
export function makeToonMaterial(o = {}) {
  const m = new THREE.MeshToonMaterial({ vertexColors: !o.map, map: o.map ?? null, gradientMap: softRamp() });
  const u = { uHoly: { value: 0 }, uHolyColor: HOLY_COLOR, uFlash: { value: 0 }, uSquashTint: { value: 0 } };
  m.userData.uniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TOON, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rmse;\nvarying vec4 vRMSE;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRMSE = rmse;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vRMSE; varying vec3 vWN;
        uniform vec3 uRim, uShadeTint, uSky, uHolyColor; uniform float uRimK, uHoly, uFlash;`)
      // coat gradient: lighter on top-facing fur (reads as fluffy volume from the iso camera)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float up = clamp(vWN.y * 0.5 + 0.5, 0.0, 1.0);
        diffuseColor.rgb *= mix(0.92, 1.08, up);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSky, 0.06 * up * vRMSE.z);`)
      // tint the ramp's shade side plum instead of grey
      // (the ramp already darkens the direct term; the ambient that fills the shade side is pushed toward plum)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix(vec3(1.0), uShadeTint * 1.25, 0.5);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float ndv = saturate(dot(normal, normalize(vViewPosition)));
          float rim = pow(1.0 - ndv, 2.5) * (0.35 + 0.65 * saturate(vWN.y + 0.4));   // top-weighted: ears, cheeks, pauldrons
          totalEmissiveRadiance += uRim * rim * uRimK * (0.4 + 0.6 * vRMSE.z);
          totalEmissiveRadiance += diffuseColor.rgb * vRMSE.w;                       // unlit parts (eyes, mouth, glow)
          totalEmissiveRadiance += uHolyColor * uHoly * (rim * 1.2 + 0.03);
          totalEmissiveRadiance += vec3(uFlash);
        }`);
  };
  m.customProgramCacheKey = () => 'sc-toon-v1';  // one program per (skinned, map) combination
  return own(m);
}
```

Notes:
- `rmse.w` = 1 marks unlit parts in the **same draw** (eyes in the `lite` tier, mouth, inner ear glow), so a lite
  kitten stays **1 draw**.
- The ramp values 150/178/255 give a shade side at about 59–70 % of lit, which keeps fur soft. Steel does **not** use
  this program (§3.4).
- art_2 §2.1 switches tone mapping to Neutral; the ramp was chosen for Neutral. With ACES, raise the shade texels
  to 165/190.
- Cost: `MeshToonMaterial` has no specular BRDF, no clearcoat, no sheen and no IBL: about a third of the fragment
  ALU of today's `MeshPhysicalMaterial` with sheen. At 96 px the pixel count is small; the larger win is **one
  program for all characters and enemies** (§6.3), which removes compile hitches when a new enemy type spawns.

### 3.3 Silhouette tufts (the "fluffy" read from above)

The silhouette sells fur better than shading at 96 px. Per character, **one `InstancedMesh` of tuft cards** with
the existing `tuftMaterial()` (procedural alpha, `alphaTest` 0.35, double-sided):

| Cluster | Cards | Card size (H) | Placement |
|---|---|---|---|
| Cheek ruff edge | 2 × 6 | 0.05 × 0.09 | around the cheek spheres' outer rim, normal + 30 % gravity |
| Crown / forehead tuft | 3 | 0.04 × 0.07 | top of the skull, pointing up-back (it reads from above: a "cowlick") |
| Ear tufts | 2 × 3 | 0.03 × 0.08 | inner ear, cream |
| Bib | 5 | 0.05 × 0.08 | between the pauldrons |
| Tail tip | 6 | 0.05 × 0.10 | last 20 % of the tail, cream |
| **Total** | **32 cards = 64 tris, 1 draw** | | instance matrices are in head / chest / tail-bone space and are updated from the 3 bones each frame (32 matrix writes) |

The cards face the camera on the y axis only (cylindrical billboard in the vertex shader) so they never show as thin
lines from above. Kittens use 20 cards, villagers 0.

### 3.4 Steel, brass and the blade: one matcap program

At 96 px, a PMREM-lit `MeshStandardMaterial` steel with `envMapIntensity` and roughness detail is invisible. A
**matcap** gives the polished-toy look of modern cosy games, costs 1 texture fetch, and still takes fog.

```js
// characters/materials.js — generated once (256²) with a CanvasTexture; warm sky top, cream horizon, plum bottom.
export function makeSteelMatcap() {
  const c = canvas2d(256, 256), g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0.00, '#FFFFFF'); base.addColorStop(0.30, '#E6ECF2');   // sky
  base.addColorStop(0.55, '#B9C2CC'); base.addColorStop(0.62, '#F6E7D2');   // warm horizon line (toy chrome)
  base.addColorStop(1.00, '#7D7488');                                       // plum ground bounce, not black
  g.fillStyle = base; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  const hot = g.createRadialGradient(86, 70, 0, 86, 70, 46);               // soft key highlight upper-left
  hot.addColorStop(0, 'rgba(255,255,255,0.95)'); hot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hot; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeMetalMaterial() {
  const m = new THREE.MeshMatcapMaterial({ matcap: makeSteelMatcap(), vertexColors: true }); // vertex colour = tint (steel #C9D0D8, brass #E8C27A, dark steel #8E96A2)
  // + the same rim / holy / flash patch as the toon program (emissivemap_fragment), cacheKey 'sc-metal-v1'
  return own(m);
}
```

- Steel `#C9D0D8` (lighter than `PAL.steel` #A2A8B1, so it reads as bright toy armour, not grey tin), brass
  `#E8C27A`, dark steel `#8E96A2` (no near-black parts on the hero).
- The holy blade glow (art.md §4.3) keeps its emissive streak; the matcap only replaces the base metal.
- **Close-ups** (cutscenes, Meme Cam) may swap back to the PMREM `MeshStandardMaterial` for the plate with
  `kitten.setCloseUp(true)` (2 material swaps; both programs are prewarmed).

---

## 4. Expressive eyes and squash and stretch (`characters/Eyes.js`, `KittenBuilder.js`, `player/SwordcatModel.js`)

### 4.1 Eyes

| Item | Now | New |
|---|---|---|
| Material | `MeshPhysicalMaterial` clearcoat + emissive 0.12, per eye | **`MeshBasicMaterial`** (unlit) with the iris `CanvasTexture`; the catchlights are in the texture, so they need no light. **1 draw for both eyes** (merge L and R into one geometry; lids stay separate meshes in the coat material) |
| Pupil | round r 66/256 | **r 80/256 (62 % iris)** hero, **92/256** kittens; enemies §5.3 |
| Catchlights | 2 (upper-left 28×21, lower-right 11) | **3**: upper-left 34×26, lower-right 14, plus a tiny top sparkle 7 at (150, 70). Upper-left is "toward the sun" for the fixed iso yaw π, so it stays correct |
| Eye white | none (iris fills the eye) | a cream sclera ring **only on enemies and grown-ups** (§5.3); kittens keep the all-iris "button" eye |
| Lash line | torus r 0.0045 | r **0.008** (it has to survive at 96 px); a 0.012 wing at the outer corner |
| Brows (new) | — | a coat-darker capsule (0.05 × 0.012 H) above each eye, joint-driven: rotation −25° (angry) … +30° (worried), lift ±0.01 H. **Brows read from above better than lids**, so every expression in `EXPRESSIONS` gets a `brow` field |
| Play-mode exaggeration | — | `setExpression` multiplies lid and brow deltas by **1.4** when the lens is > 8 m away (`kitten.expressionGain`) |
| Far LOD (> 20 m from `cam.focus`, or the `lite` tier) | separate eye meshes | eyes baked into the body as `rmse.w = 1` vertex colours (2 dark discs + 1 white dot each); 0 extra draws |

Eye texture change (pure; drop-in for `makeEyeTexture` options):

```js
// Eyes.js — new options: pupilR (default 80), sparkle (true), sclera (null | '#F6EFE4'), lidLine (0.008)
if (o.sclera) { g.fillStyle = o.sclera; g.fillRect(0, 0, 256, 256); g.fillStyle = ring;
  g.beginPath(); g.arc(128, 132, 92, 0, Math.PI * 2); g.fill(); }        // smaller iris inside a cream white
// ... iris gradient and pupil as today, radius o.pupilR ...
if (o.sparkle !== false) { g.beginPath(); g.arc(150, 70, 7, 0, Math.PI * 2); g.fill(); }
```

**Glance at the player** (cheap appeal): when idle and not in combat, every 6–10 s (seeded per kitten) the head turns
up to **25°** toward the camera and the eyes another 10°, holds 0.8–1.4 s with a blink, then returns. From the iso
view this shows her face for a moment.

### 4.2 Squash and stretch (one spring on the `body` joint; pivot at the feet)

Volume-preserving: `scale.y = s`, `scale.x = scale.z = 1 / sqrt(s)`. A critically damped-ish spring is driven by
impulses from gameplay events, plus continuous terms for breathing and gait.

```js
// characters/KittenBuilder.js (shared; enemies use the same helper on their root or Body bone)
export class Squash {
  constructor(k = 320, c = 16) { this.k = k; this.c = c; this.x = 0; this.v = 0; }   // x = s - 1
  kick(dv) { this.v += dv; }                         // negative = squash, positive = stretch
  update(dt, target = 0) {
    const a = -this.k * (this.x - target) - this.c * this.v;
    this.v += a * dt; this.x += this.v * dt;
    this.x = Math.max(-0.35, Math.min(0.35, this.x));
    return 1 + this.x;
  }
}
// per frame: const s = squash.update(dt, breath + gait); body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
```

| Event (bus) | Impulse / target | Look |
|---|---|---|
| Idle breathing | target `0.025 sin(2π·0.45 t)` | visible from 13 m (today ±1.5 % is not) |
| Walk / run gait | target `0.04 |sin(π·phase)|` hero, 0.06 kittens; 2 bounces per stride | the "bean bounce" |
| Jump take-off (`player:jump`) | anticipation: target −0.15 for 0.06 s, then kick **+3.5** | squash then a tall stretch |
| Land (`player:land`) | kick **−2.5 × min(1, fallSpeed / 6)** | a soft pancake, recovers in ~0.25 s |
| Swing wind-up / release | target −0.08 during wind-up, kick +1.5 on release | sells the hit without new clips |
| Charge held (Holy) | target −0.10 + a 9 Hz shiver of ±0.01 | "power coiling" |
| Hit taken (`combat:hit`, victim) | kick −2.0 + `uFlash` pink (art_2 §4 item 16) | squishy, not painful |
| Tumble | target −0.2 for the roll | a ball |
| Meow / happy emote | kick +2.0 and ears +15° | |

Ears, tail and cape already lag through springs and verlet; the head lag is raised from art.md's "slightly late" to a
**0.06 s** follow on the head joint (damp λ 18), so the head jiggles after every stop.

---

## 5. Enemies: cute-menacing (`enemies/**`, `characters/BeastHead.js`, `BeastDress.js`)

### 5.1 The menace budget

An enemy gets its threat from **at most two** of these, and never from the forbidden list:

| Allowed menace cues | Forbidden (creepy or gloomy) |
|---|---|
| Angry brows (−25°) and narrowed lids | Red or green glowing eyes, eye glints with bloom |
| A smug or toothy **grin with 2–4 rounded fangs** | Rows of sharp teeth, open maws with tongues or drool |
| Size and a forward-leaning posture | Exposed bones (except the "biscuit-bone" toy Boneheads of art_2), gore, scars with blood colour |
| Oversized props (kettle helms, pot lids, wooden swords, crossbows that shoot corks) | Insect detail: 8 eyes, hairy legs, mandibles |
| Faction colours: plum, slate, mustard, olive | Near-black bodies (`#17181C` crows), black silhouettes in fog |
| A comic "tell" before attacks (a hop, a puff of steam from the helm, wiggle) | Twitchy, jerky motion; sudden lunges without a tell |

Defeat is **"faint and poof"**, never a corpse: the enemy squashes flat (s 0.6 over 0.12 s), shows 3 dizzy stars
for 0.5 s, then pops into a cream puff + 6 sparkles (existing `Poof.js` pool) and is gone. Death clips are used only
for the first 0.25 s.

### 5.2 Faction palette and the top colour (iso readability)

The enemy family is **"mischief"**: plum and slate bodies with mustard and teal accents. It never uses the hero's
ginger, pink, red or gold, and stays away from the telegraph colours. From above, an enemy is identified by its
**top colour**: the helm, hat, hood or head top that faces the camera.

| Token | Hex | Use |
|---|---|---|
| `mischiefPlum` | `#6E5A86` | rat fur, hyena spots, cloth |
| `mischiefPlumLight` | `#9C88B4` | bellies, muzzles |
| `slate` | `#5D6C88` | crow body, pug armour |
| `slateLight` | `#8E9CB8` | crow belly, highlights |
| `mustard` | `#E0B043` | **top colour: Rat Militia helms** |
| `teal` | `#3FA59A` | **top colour: Snickerpack hyena bandanas** |
| `olive` | `#8C9A48` | spider fuzz, bog creatures |
| `cork` | `#C99A6A` | wooden weapons, crossbow stocks |
| `bossCrown` | `#F2D06B` + a 0.15 emissive | bosses' crown, helm crest or plume (the boss reads at 22 m) |
| `cream` | `#F6EFE4` | sclera, teeth, muzzles |

These go in `src/enemies/props.js` `ENEMY_PAL` (enemies' own file) and mirror into `characters/palette.js` for the
beast heads.

### 5.3 Per-enemy redesign (all keep their hitboxes, clips, AI and `MODEL_FIT` heights)

| Enemy | Now | Change (shape → colour → face → menace) | Mechanism |
|---|---|---|---|
| **rat_pike / rat_xbow** (Rat.glb) | realistic grey quadruped, 1.45 m long, 2.7 m with tail, red eye glints | **Head bone ×1.45, Neck ×1.1, Body ×1.1 (chubby), Tail1 ×0.75 (the 6-bone tail shrinks to ~55 %), leg bones ×0.9.** Fur `mischiefPlum`, belly and muzzle `mischiefPlumLight`, ears and paws `#D9A494` (peach, not pink). Eyes: 2 big cream-sclera eyes r 0.07 m with small pupils (pupilR 54) and angry brows on the helm rim; **no red glints**. The oversized kettle helm turns `mustard` with a dent. Pike = a wooden spear with a cork tip | Rat.glb has **no scale tracks** (verified), so static bone scales persist under the mixer. `recolor()` already maps `Grey`/`Pink` by material name |
| **Grizzlechop** (Rat.glb ×2 scale) | big grey rat | Same rat changes + a pirate-captain look: a `bossCrown` tricorn plume, a big belly, an eyepatch over one eye (the other eye huge), a moustache card | same + `ratGear.js` |
| **crow** (Pigeon.glb, Atlas) | tinted near-black `#17181C`, violet emissive | **Head ×1.35**, body `slate`, belly `slateLight`, beak and feet `mustard`, cream-sclera eyes with angry brows. The dive shadow becomes plum (art_2 §4 item 14). Top colour: slate head with a `mustard` crest tuft (3 tuft cards) | atlas palette remap (§5.4); Pigeon has no scale tracks |
| **spider** (Spider.glb) | black body, dark-red parts: the most creepy enemy | **"Fuzzball"**: Abdomen ×1.5, Thorax ×1.2, Head ×1.4, the leg bones ×0.75 (stubby). `olive` fuzz with a lighter `#B7C46A` top and a 12-card fuzz fringe, **2 big eyes** (+2 tiny ones) instead of 8, a little leaf hat as the top colour. Skitter bursts stay | recolor by material name (`Material` → olive, `Material.001` → cream eyes); static bone scales (no scale tracks) |
| **Gloomjelly** | green jelly | keep (cosy). Add 2 eye catchlights and a small smile (art_2 #33); squash on hop (§4.2) is the whole personality | `jelly.js` |
| **hyena, Cacklejaw, Pilfer, stealer** (KayKit + `BeastHead` hyena) | tawny, 7 sharp teeth, dark spots; the CS-02 close-up reads as scary | Snout length 1.75 → **1.3**, skull ×1.1, ears ×1.25 and rounder, **4 rounded teeth** (2 up, 2 down) in a grin, spots `mischiefPlum` on a lighter tawny `#C9A46C`, amber eyes with cream sclera and **round** pupils (slit only for Cacklejaw when he gloats). Snickerpack wear a `teal` bandana (top colour). Cacklejaw keeps his hat as the `bossCrown` top and his size; his menace is the laugh and the posture | `BeastHead.js` hyena branch: snout `scale(0.78,0.66,1.75)` → `(0.8,0.7,1.3)`; teeth loop 7 → 4 with `SphereGeometry` tips instead of cones |
| **pug / Sir Brutus** (KayKit Knight + pug head) | fine | keep the head; shield and armour `slate` with a `mustard` stripe; brows | tint + atlas remap |
| **Lord Barkus** (bulldog) | brindle, underbite with 2 fangs, eyepatch, horned helm | keep (it fits the rules: 2 fangs). Horns become round-tipped; helm `slate`; cape `#22242A` → **plum `#4A3A5E`** | `EnemyManager.js` look table tint |
| **Boneheads** (Skeleton_*.glb) | white skeletons | art_2 #32 "biscuit-bone" toy soldiers, plus brows on the helm | art_2 |
| **warhound** (Husky, MVP+) | husky | Head bone ×1.3 (the Husky has a Head bone), slate coat, a mustard collar, floppy-ear tuft cards | static bone scales |
| **Horde** (fx) | black silhouettes | art_2 #12 | art_2 |

Proportion rule for every enemy: **head ≥ 35 % of the body height** (rats and crows 40 %), eyes ≥ 0.06 m diameter at
0.8 m height (≥ 7 px desktop, ≥ 3 px phone, and the cream sclera makes them read at 3 px).

### 5.4 Recolouring the CC0 GLBs: palette remap

Three cases, all done **once per (asset, palette) at load** and cached, so instances share materials:

1. **Solid-colour materials** (Rat, Spider): `rig.recolor(root, { MaterialName: hex })` exists. Keep it.
2. **Palette atlases** (KayKit `*_texture.png`, Quaternius `Atlas_Monsters`, 927 B to 15 KB): remap the **atlas
   pixels** by nearest source swatch. Each atlas has 8–40 flat swatches, so the remap is exact and cheap:

```js
// enemies/rig.js (enemies own it; characters can import it for beast-dressed KayKit rigs)
const _remapCache = new Map();
/**
 * Return a recoloured copy of a palette texture. `pairs` maps source hex → target hex; any pixel within `tol`
 * (sRGB distance, 0–441) of a source swatch takes the target colour, keeping its luminance offset from the swatch
 * so baked gradients survive. Unmatched pixels keep their colour.
 */
export function remapPaletteTexture(tex, pairs, key, tol = 28) {
  const k = tex.uuid + '|' + key;
  if (_remapCache.has(k)) return _remapCache.get(k);
  const img = tex.image, w = img.width, h = img.height;
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  const src = pairs.map(([a, b]) => [new THREE.Color(a), new THREE.Color(b)]).map(([a, b]) =>
    [a.r * 255, a.g * 255, a.b * 255, b.r * 255, b.g * 255, b.b * 255]);
  for (let i = 0; i < p.length; i += 4) {
    let best = -1, bd = tol * tol;
    for (let j = 0; j < src.length; j++) {
      const s = src[j], dr = p[i] - s[0], dg = p[i + 1] - s[1], db = p[i + 2] - s[2], dd = dr * dr + dg * dg + db * db;
      if (dd < bd) { bd = dd; best = j; }
    }
    if (best < 0) continue;
    const s = src[best], lum = ((p[i] - s[0]) + (p[i + 1] - s[1]) + (p[i + 2] - s[2])) / 3;
    p[i] = Math.min(255, Math.max(0, s[3] + lum)); p[i + 1] = Math.min(255, Math.max(0, s[4] + lum)); p[i + 2] = Math.min(255, Math.max(0, s[5] + lum));
  }
  g.putImageData(d, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace; out.flipY = tex.flipY; out.magFilter = THREE.NearestFilter;   // atlases are swatches
  out.minFilter = THREE.NearestMipmapLinearFilter; out.generateMipmaps = true;
  _remapCache.set(k, out);
  return out;
}
```

   The swatch lists come from a one-off tool (`research/next/tools/` is enough at design time; the enemies agent
   ports it to `scripts/` via core) that prints every distinct colour in each atlas with its pixel count. The
   enemies agent authors `PALETTE_MAPS = { 'Barbarian.glb': { hyena: [[src, dst], ...] }, ... }` next to
   `MODEL_FIT`.
3. **Then the material swap:** every loaded enemy mesh gets `makeToonMaterial({ skinned: true, map: remapped })`
   (§3.2) instead of its GLB `MeshStandardMaterial` (`metalness 0.4` on the rat, which `ratGear.matteFur` already
   fights). Rim, flash and holy reuse the same uniforms, so the hit flash keeps working through `uFlash` instead of
   cloning `emissive` per material (`Enemy.js:1303`).

**KayKit scale tracks.** Barbarian/Knight clips carry **2,482 scale channels** (verified). Bone-scale tweaks on those
rigs (bigger heads for hyenas without the beast head, slimmer arms) must either strip constant scale tracks at load
(`clip.tracks = clip.tracks.filter(t => !(t.name.endsWith('.scale') && isConstantOne(t)))`, which also saves mixer
time: about 40 % of all KayKit channels) or re-apply after `mixer.update`. Stripping is preferred; the enemies agent
verifies with the smoke `enemies:*` blocks that no clip used a non-unit scale.

---

## 6. Performance budget for characters (tech.md §18 amendment)

### 6.1 Per-character budgets (play, iso; `renderer.info` scene calls including the shadow pass)

| Character | Draws now | **Draws target** | Tris now | **Tris target** | Programs |
|---|---|---|---|---|---|
| Swordcat | 31 | **≤ 9** (body+fur 1, steel 1, eyes 1, cape 1, sword 1, tufts 1, bow merged into body, shadow proxy 1, x-ray proxy only when occluded) | ~200k (90k + shells) | **≤ 16k** | toon-skinned, metal, basic |
| Companion kitten | ~12 [est.] | **≤ 5** | ~40k [est.] | **≤ 8k** | same |
| Villager / hub resident (`lite`) | 1–2 | **1** (+ blob shadow decal batch) | ~6k | **≤ 3k** | toon-skinned |
| Rat / crow / spider | 8 | **≤ 3** (body 1, gear merged into 1, shadow 1) | 4–6k | ≤ 6k (keep) | toon-skinned |
| KayKit + beast head | ~10 [est.] | **≤ 4** | ~12k [est.] | ≤ 10k | toon-skinned, metal |
| Boss | ~14 [est.] | **≤ 7** | — | ≤ 25k | same |

At the CONTROLS_SPEC worst case (hero, 2 companions, 8 enemies, 1 boss), characters cost about
**9 + 10 + 30 + 7 = 56 calls**, against ~160 today, and leave most of the 150-call desktop and 80-call mobile budget
to the world.

### 6.2 Play LOD geometry (the `KittenBuilder` builds two geometry sets; close-up is built lazily)

| Part | Close-up segments | **Play segments** |
|---|---|---|
| Skull | 64 × 48 | **28 × 20** (coat colours are baked per vertex, so the coat stripes are dropped in play: they are < 2 px) |
| Cheek ruff, muzzle | 32 × 24 / 24 × 16 | 16 × 12 / 12 × 8 |
| Eyes | 32 × 24 each | 16 × 10, merged pair |
| Pauldrons, breastplate | 4 lames + lathe 48 | 2 domes 20 × 10, lathe 24 |
| Tail tube | 40 × 16 | 16 × 8 |
| Cape | verlet 9 × 13 | verlet 7 × 9 (simulation cost too) |
| Hands, feet | 4 finger capsules each | 1 mitten ellipsoid each |

The play set is **merged per material** into one `SkinnedMesh` against the existing 27-bone rig (the `lite` tier
already does this; the hero and kittens use it in play too). The `KittenView` API (`setPose`, `setHoly`,
`setExpression`, `rig`) does not change.

### 6.3 Shader programs

All characters and enemies use **3 programs**: `sc-toon-v1` (skinned), `sc-toon-v1` (static props held or worn) and
`sc-metal-v1`, plus `MeshBasicMaterial` for eyes. Core's prewarm compiles them once at boot. Fur shells
(`ShaderMaterial`) and the PMREM plate compile on the first close-up, behind the cutscene's 0.25 s veil.

### 6.4 Other rules
- **Shadows:** characters cast through their low-poly **shadow proxy** only (it exists). Tufts, eyes, cape and fur
  never cast. Enemies cast through a capsule proxy or a blob decal on low.
- **No per-instance material clones** for flashing: `uFlash` is per character in a small uniform object; the
  enemies' `cloneMaterials: true` stays only where the atlas remap differs.
- **Animation:** mixers beyond 25 m from `cam.focus` update at 15 Hz; beyond 40 m, off (tech.md §18 already says 40
  m). Kitten procedural animation beyond 25 m skips the cape and the tail springs.
- **Low quality:** no tufts, no cape verlet (sway shader), eyes baked into the body (`lite` eyes) for everyone but
  the hero.

---

## 7. Readability checks (acceptance; smoke screenshots are Read and judged)

| Check | How | Pass |
|---|---|---|
| Hero face legible on phone | iso pose 844×390 at 12 m, hero facing south | both eyes ≥ **4 px** tall, the bow ≥ **6 px** wide |
| Hero vs ground | art_2 §0 metric inside a 3 m disc | hero chroma ≥ 1.3 × ground |
| Enemy top colour | iso pose, 4 enemy types around her | each type's top colour is visible (≥ 6 px blob) from above |
| No creepy list items | screenshot review of CS-02, Spider Hollow, Crow Fields | no red eyes, no teeth rows, no black silhouettes |
| Squash visible | land from a jump at 13 m | stretch/squash ≥ 8 px change in her silhouette height |
| Character cost | `art1_measure.mjs` (hide-root deltas) | hero ≤ 9 calls, ≤ 16k tris; rat ≤ 3 calls |
| Program count | `renderer.info.programs.length` after the meadow with all M2 enemy types spawned | character + enemy programs ≤ 4 |

---

## 8. Area mapping (GAME_DESIGN §19.2) and order of work

| Order | Area | Files | Work | Depends on |
|---|---|---|---|---|
| 1 | **characters** | `materials.js` | `softRamp`, `makeToonMaterial`, `makeMetalMaterial`, `TOON` uniforms (§3.2, §3.4); `kitMaterial()` returns the toon material | art_2 tone mapping (works either way) |
| 2 | characters | `Fur.js` | Soft Fur as the play default; shells created lazily on `setCloseUp(true)`; `FUR_LOD` keyed to `cam.focus` for the close-up only | 1 |
| 3 | characters | `KittenBuilder.js`, `configs.js`, `Armour.js`, `Bow.js`, `Cape.js`, `Sword.js` | §2 proportions, play LOD set + merge (§6.2), tufts (§3.3), `Squash` helper (§4.2), glance-at-player | 1 |
| 4 | characters | `Eyes.js` | unlit merged eyes, pupils, 3 catchlights, sclera option, brows, expression gain (§4.1) | — |
| 5 | characters | `BeastHead.js`, `BeastDress.js`, `palette.js` | hyena snout/teeth/eyes, round horns, mischief palette mirror (§5.2, §5.3) | 4 |
| 6 | **player** | `SwordcatModel.js` | drive `Squash` from player events (§4.2 table), head lag 0.06 s, face tilt +8° in play | 3 |
| 7 | **enemies** | `rig.js`, `props.js`, `ratGear.js`, `types/*.js`, `EnemyManager.js` | `remapPaletteTexture`, toon material swap, bone scales, eyes and brows, "faint and poof" defeat, top colours, KayKit constant-scale-track strip (§5) | 1, 4 |
| 8 | **companions** | `LostKitten.js`, `HubKittens.js`, `NpcActor.js` | use the new kitten configs; glance-at-player on residents | 3 |
| 9 | **fx** | `Poof.js` | the "faint and poof" burst (cream puff + 6 sparkles + 3 dizzy stars) for enemies | 7 |
| 10 | **core** | `config.js` (QUALITY), prewarm list, `tech.md §18` | `furShells` now means close-up shells only; add `QUALITY.*.charTufts` (low false); prewarm the 3 programs | 1 |
| 11 | **camera** | `FollowCamera.js` | call `characters.setCloseUp(on)` when the lens is < 6 m from her (presets, Meme Cam, dialogue) | 2 |
| 12 | design | art.md §1, §2.1, §2.5, §3, §11; GAME_DESIGN §17 fur bullet, §18.3 beast-head colours; CONTROLS_SPEC §2.8 hero-shell line | amend text to this file | approval |

**Open questions for review**
1. The 0.46 H head makes the plate armour read smaller. If the knightly read suffers, keep the pauldrons at 0.58 H
   (still ≤ head width) before shrinking the head.
2. The matcap steel loses real reflections of the level light. If art_2's per-level grade makes it look pasted-on,
   tint the matcap's horizon band by `Env`'s fog colour (1 uniform, no recompile).
3. Grizzlechop's eyepatch and Barkus's eyepatch together: give Grizzlechop a monocle instead?
