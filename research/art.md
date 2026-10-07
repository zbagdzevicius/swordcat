# SWORDCAT — Art Direction / Visual Bible (three.js real-time)

Scope: how to recreate the look of the three reference images (`research/ref/ref1.png`, `ref2.jpg`, `ref3.png`) as a stylised, real-time three.js game, using procedural geometry built in code with no external models required. Everything below is either **[REF]**, meaning observed or measured in the reference images, or **[PROPOSED]**, meaning an art-direction decision for the game. Hex values marked "sampled" were measured with Pillow from image regions (median / 10th / 90th luminance percentiles). Proportions were measured on a 5% grid overlay of `ref2.jpg` (approx. ±2%).

Recipes target **three r160+** (WebGL2; `three/addons/*` import paths; `renderer.outputColorSpace`; the `colorspace_fragment` chunk, which was called `encodings_fragment` before r154). Check `CapsuleGeometry`'s argument list against the pinned version, because it changed across releases.

---

## 0. What the references show [REF]

| Ref | Content | Key takeaways |
|---|---|---|
| ref1.png (250²) | Close-up of a ginger kitten holding a long sword vertically beside her face. The whole silhouette and the blade have an intense **golden glow / halo**, with small bokeh sparkles around her. The background is cool blue-grey mist. | This is the "Holy / charged" state: rim halo on the silhouette, vertical light streak along the blade, floating gold motes, and a warmer grade. |
| ref2.jpg (335×597) | Full body, front view. A fluffy ginger long-haired kitten with **blue-grey eyes**, a **pink satin bow** at the base of her left ear (viewer's right) and long white whiskers and ear tufts. She wears polished **silver plate**: rounded multi-lame pauldrons with rivets, articulated gauntlets, faulds/tassets, dark mail at the waist, greaves and segmented sabatons. There is a **red cape** behind, a **brown leather belt** with a strap or pouch on the right hip, and a **sword planted point-down** with both paws on the pommel. The crossguard and fittings are brass. A bushy **cream-ginger tail** lies on the grass. The background is dense grey fog over a dark green meadow. | This is the canonical model sheet. It sets the proportions, the armour layout and the default idle pose ("Vigil"). |
| ref3.png (436²) | A paler **dilute cream / silver-tan** kitten with a pale pink bow, a **cream/beige cape**, a sword raised vertically and an armoured gauntlet forward, in a foggy green field. | This is either a lighting or colour variant of the same character or a second kitten. It can be used as an alternate "Pilgrim" outfit or a sister character (see §7). |

**Signature silhouette** [REF ref2]: a fluffy ginger ball (head) sitting on a *wide* steel shoulder line (pauldrons are as wide as the head), with a red cape forming a V frame and the sword as the vertical centre line. Recognition ranking: **pink bow, then fluffy ginger head with big blue-grey eyes, then rounded silver pauldrons, then long sword, then red cape.** Never remove the bow.

**Mood rule** [REF, all three]: the *world* is desaturated, misty and low-contrast (grey-green, value mid-light), while the *hero* carries all the warm saturation (ginger, pink, red, gold) and the highest contrast (polished steel, dark pupils). Keep this split everywhere: in every biome, characters must be more saturated and more contrasted than the background.

---

## 1. World scale & camera [PROPOSED]

- **1 unit = H = Swordcat's height to the ear tips.** It is a kitten-scale kingdom: doors are about 1.6H, cottages 3–5H and grass 0.08–0.25H. (A real kitten is about 25 cm; physics can treat 1 unit as 1 "kitten metre".)
- The camera is third-person: `PerspectiveCamera(45, aspect, 0.05, 150)`, offset `(0, 1.1, -3.2)` behind the player, looking at `(0, 0.65, 0)` plus a velocity lead. The **low camera** looks slightly *up* at her for heroic framing. The refs are shot at the kitten's eye level with a shallow depth of field.
- Cutscene and photo mode use FOV 30–35, focus on the eyes and DOF on (see §11).

---

## 2. Swordcat — proportions & procedural build

### 2.1 Measured proportions [REF ref2], with game targets [PROPOSED]

All heights are measured from the soles (0) to the ear tips (1.0 H).

| Feature | Measured in ref2 | Game target |
|---|---|---|
| Head height (ear tip to chin fur) | 0.36 H (≈2.8 heads tall, 1 : 1.8 head:body) | **0.38–0.40 H** (push chibi slightly) |
| Head width incl. cheek fluff | 0.51 H | 0.52 H |
| Shoulder width (pauldron to pauldron) | 0.53 H (≈ head width) | 0.54 H, and keep it ≥ head width |
| Eye centre height | 0.80 H | 0.79 H |
| Eye spacing (centre to centre) | 0.14 H | 0.145 H |
| Visible eye diameter | 0.05 H (≈0.09 of head width) | **0.09 H (×1.8, "huge eyes")** |
| Nose height | 0.75 H | 0.745 H |
| Chin / bib top | 0.64 H | 0.63 H |
| Belt / waist | 0.34 H | 0.34 H |
| Tasset bottom | 0.21 H | 0.21 H |
| Sabaton height | 0.06 H | 0.06 H |
| Ears (height, set wide, tilted out ~25°) | ≈0.08 H visible | 0.12 H cone, rounded tip, with long cream ear tufts |
| Bow width (on the cat's left ear base) | 0.22 × head width | 0.12 H, tilted 15–20° |
| Tail (bushy, resting on the ground) | ≈0.45 H long, ≈0.13 H thick | 0.45 H, radius 0.065 plus 0.08 fur |
| Cape (shoulder to hem) | ≈0.46 H | 0.46 H, flares from 0.40 H to 0.55 H wide |
| Sword blade length (ref1/ref3) | ≈0.85 H (blade ≈ 2.3× head height) | 0.85 H blade, **≈1.0 H total** |
| Crossguard width | 0.19 H | 0.21 H |

Cuteness rules: the eyes sit **slightly below the vertical centre of the head**. Keep a large forehead and cheek ruff, a tiny muzzle and nose, short stubby legs (the legs are almost hidden by the tassets), and a round belly line. No sharp edges on the character except the blade.

### 2.2 Primitive rig (cat faces +Z; the cat's left is +X; origin at the feet)

Bake every non-uniform scale into the geometry (`geo.scale(...)`) so that Object3D scales stay uniform, which keeps the shader normals correct.

| Part | Geometry | Position (centre) | Notes |
|---|---|---|---|
| Skull | `SphereGeometry(0.145, 64, 48)`, scaled (1.12, 1.0, 1.0) | (0, 0.785, 0) | fur 0.045, vertex-painted coat |
| Cheek ruff ×2 | `SphereGeometry(0.085, 32, 24)` | (±0.11, 0.70, 0.05) | fur 0.07, which widens the bottom of the head (as in ref2) |
| Whisker pads ×2 | `SphereGeometry(0.042, 24, 16)` | (±0.028, 0.725, 0.125) | cream, fur 0.015 |
| Chin | `SphereGeometry(0.034, 20, 14)` | (0, 0.69, 0.11) | cream |
| Nose | `SphereGeometry(0.017, 16, 12)`, scaled (1.35, 0.8, 0.7) | (0, 0.752, 0.152) | `#C97F7A`, roughness 0.45 |
| Mouth "ω" | `TubeGeometry` on a 5-point CatmullRom curve, r 0.0035 | under the nose | `#5A3A34` |
| Eyes ×2 | `SphereGeometry(0.045, 32, 24)`, scaled (1, 1, 0.55) | (±0.072, 0.79, 0.11) | planar UVs, see §2.5 |
| Eye-line ×2 | `TorusGeometry(0.046, 0.0045, 8, 40)` | around each eye | `#2A1E18`, a dark rim that reads like lashes |
| Ears ×2 | `ConeGeometry(0.065, 0.12, 24)`, scaled (1, 1, 0.5); tip rounded by lerping the top ring | base (±0.12, 0.88, -0.01), rotZ ∓25°, rotX -8° | inner ear is a smaller cone, `#EBB0A6`, +0.01 forward |
| Ear tufts | 3–5 alpha "tuft cards" per ear (§3.4) | inner ear | cream, long (0.08), the ref2 signature |
| Whiskers | `LineSegments`, 3 per side plus 2 brow whiskers | from the pads | `#F5EEE6`, opacity 0.8, length 0.24 |
| **Bow** | see §2.6 | (+0.10, 0.955, 0.06), rotZ -0.3 | on the cat's left ear base |
| Neck / bib | `SphereGeometry(0.11)`, scaled (1.1, 0.8, 0.8) | (0, 0.62, 0.05) | cream fur 0.06, visible between the pauldrons |
| Torso | `CapsuleGeometry(0.14, 0.12)` | (0, 0.42, 0) | under the armour |
| Breastplate | `LatheGeometry` (profile below) | y 0.30–0.62 | steel |
| Pauldrons ×2 | 4 stacked dome caps (§4.2) | (±0.18, 0.56, 0.0) | steel plus rivets |
| Upper arm / forearm | `CapsuleGeometry(0.045, 0.06)` / `(0.045, 0.07)` | pivot (±0.17, 0.55, 0.02) | rerebrace and vambrace steel |
| Gauntlets | `SphereGeometry(0.05)`, scaled (1, 0.9, 1.1), plus 4 finger capsules (0.012, 0.02) and a flared cuff `CylinderGeometry(0.05, 0.065, 0.04, 24, 1, true)` | in the Vigil pose: (±0.035, 0.47, 0.17) | cuff ring in brass |
| Belt | `TorusGeometry(0.155, 0.014, 8, 48)`, rotX 90° | y 0.34 | leather plus a brass buckle `BoxGeometry(0.04, 0.035, 0.01)` |
| Mail skirt | `CylinderGeometry(0.15, 0.17, 0.08, 32, 1, true)` | y 0.28 | dark steel plus chainmail map |
| Tassets ×2 | `CylinderGeometry(0.19, 0.21, 0.09, 24, 1, true, θs, 1.1)` ×2 stacked, tilted out 12° | hips, y 0.22–0.33 | steel plus 3 rivets each |
| Legs | `CapsuleGeometry(0.05, 0.06)` | (±0.075, 0.12, 0) | |
| Greaves | `CylinderGeometry(0.052, 0.046, 0.08, 20)` | (±0.075, 0.11, 0) | dark steel |
| Sabatons | 3 half-ellipsoid lames `SphereGeometry(1, 20, 10, 0, 2π, 0, π/2)`, scaled (0.06, 0.045, 0.085) | (±0.075, 0.0, 0.03) | dark steel, step-overlapped |
| Tail | tapered tube (§2.4), 8-segment spring chain | root (0, 0.2, -0.13) | fur 0.08, tip cream |
| Cape | verlet cloth (§5) | top pinned behind the shoulders at y 0.60, z -0.12 | red `#A3202C` |

Breastplate lathe profile (radius, y): `[(0.10,0.30),(0.15,0.34),(0.168,0.42),(0.163,0.50),(0.135,0.58),(0.09,0.625)]`, 48 segments, then `geo.scale(1.08, 1, 1.05)`.

```js
// minimal builder skeleton (pattern; extend per table)
const part = (geo, mat, [x, y, z], parent, opts = {}) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.shadow ?? true;
  parent.add(m);
  return m;
};
export function buildKitten(cfg /* coat, eyes, accessories – shared by ALL kittens */) {
  const root = new THREE.Group();                         // origin at feet
  const head = new THREE.Group(); head.position.set(0, 0.62, 0); root.add(head); // neck pivot
  const skullGeo = new THREE.SphereGeometry(0.145, 64, 48).scale(1.12, 1, 1);
  paintCoat(skullGeo, cfg.coat, { center: [0, 0.165, 0], face: true }); // §3.2
  addFur(head, skullGeo, [0, 0.165, 0], { len: 0.045 });  // base mesh + shells, §3
  // ... cheeks, muzzle, eyes, ears, bow, body, armour, tail, cape
  return { root, head /* , tail, cape, armL, armR, sword */ };
}
```

Animation notes [PROPOSED]: blink every 2.5–6 s (eye `scale.y` → 0.1 over 70 ms); ears twitch independently; tail spring-chain sway; idle breathing scales the torso y by ±1.5%; the head bobs slightly *late* relative to the body (secondary motion sells the cuteness); squash and stretch on jump and land (0.9/1.1).

**Signature poses** [REF]:
- **"Vigil"** (ref2): sword planted point-down in front, both gauntlets stacked on the pommel, head straight and eyes on the camera. Used for idle, save points and the menu.
- **"Oath / Salute"** (ref1, ref3): sword vertical in front of the face, slightly to her right, one gauntlet at the grip, head peeking beside the blade. Used for charging Holy, the title screen and victory.

### 2.3 Coat colour plan (Swordcat) [REF colours, game-lifted]

- **Base ginger** `#D4935A` covers the skull top, back of the head and tail.
- **Mackerel stripes** `#A65E2E` are faint on the forehead (the "M"), cheeks and tail rings. Generate them in `paintCoat` as `sin(x*55 + noise)` thresholded at 0.6, at 30% strength.
- **Tips / highlight** `#F0C08F` come from the shell gradient (§3).
- **Cream** `#EFE3D2` covers the muzzle, chin, bib, inner cheeks, ear tufts and the tail underside and tip.
- **Inner ear** `#EBB0A6`, **nose** `#C97F7A`.

### 2.4 Tapered tail

```js
const curve = new THREE.CatmullRomCurve3([[0,0.2,-0.13],[0.05,0.1,-0.28],[0.18,0.05,-0.36],[0.32,0.06,-0.30]].map(p => new THREE.Vector3(...p)));
const tub = 40, rad = 16;
const tg = new THREE.TubeGeometry(curve, tub, 1, rad, false);
const pos = tg.attributes.position;
const c = new THREE.Vector3();
for (let i = 0; i < pos.count; i++) {
  const ring = Math.floor(i / (rad + 1)), t = ring / tub;
  const r = 0.045 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.15)); // bushy middle
  curve.getPointAt(t, c);
  const v = new THREE.Vector3().fromBufferAttribute(pos, i).sub(c).multiplyScalar(r).add(c);
  pos.setXYZ(i, v.x, v.y, v.z);
}
tg.computeVertexNormals();
// Animate by rebuilding the curve from an 8-node spring chain each frame (cheap), or by rotating 3 nested groups.
```

### 2.5 Eyes (big, glossy, blue-grey)

Iris colours [REF ref2, estimated visually because the sample was dominated by the pupil]: outer `#3F6170`, inner `#8DB3C2`, limbal ring `#1B262C`, pupil `#0D1114`.

```js
function makeEyeTexture({ inner = '#8DB3C2', outer = '#3F6170', ring = '#1B262C', pupil = '#0D1114' } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = ring; g.fillRect(0, 0, 256, 256);
  const grd = g.createRadialGradient(128, 140, 16, 128, 128, 120);
  grd.addColorStop(0, inner); grd.addColorStop(0.7, outer); grd.addColorStop(1, ring);
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.15; g.strokeStyle = '#fff';                        // iris fibres
  for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2; g.beginPath();
    g.moveTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = pupil; g.beginPath(); g.arc(128, 134, 66, 0, Math.PI * 2); g.fill(); // big round pupil = cute
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(90, 86, 28, 21, -0.5, 0, Math.PI * 2); g.fill();      // main catchlight
  g.beginPath(); g.arc(162, 172, 11, 0, Math.PI * 2); g.fill();                                       // small catchlight
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Planar front projection so the iris sits on the +Z cap:
const eyeGeo = new THREE.SphereGeometry(0.045, 32, 24);
const p = eyeGeo.attributes.position, uv = eyeGeo.attributes.uv;
for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.09 + 0.5, p.getY(i) / 0.09 + 0.5);
eyeGeo.scale(1, 1, 0.55);
const eyeTex = makeEyeTexture();
const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03,
  emissive: '#ffffff', emissiveMap: eyeTex, emissiveIntensity: 0.12 }); // stays lively in shade
```

Enemies use the same texture function with narrowed or slit pupils (`ellipse` with rx 18) and a red or amber iris.

### 2.6 Pink bow [REF colours]

The bow is a satin ribbon with base `#F2A2B8`, highlight `#FFD2DE`, shade `#C76E8A` and knot `#E88AA6`.

- **Loops** ×2: `SphereGeometry(0.035, 24, 16)`, scaled (1.5, 0.85, 0.5), placed at x ±0.035 and rotated ±0.35 rad about z. Pinch the inner end by multiplying vertex y by `smoothstep(0, 1, |x|/0.05)*0.6 + 0.4`.
- **Knot**: `SphereGeometry(0.016)`.
- **Tails** ×2: `PlaneGeometry(0.018, 0.04)`, V-notched, hanging down, with a small sway.
- **Material**: `MeshPhysicalMaterial({ color:'#F2A2B8', roughness:0.35, sheen:1, sheenColor:'#FFD2DE', sheenRoughness:0.3 })`, which gives the satin read.

---

## 3. Fur rendering — chosen approach

**Decision:** use **shell texturing** (instanced shells, alpha-tested) on the *exposed fur only*: head, cheek ruff, bib and tail. Add **silhouette tuft cards** for ear tufts, the cheek-ruff edge and the tail tip, and a **wrap-diffuse + strong rim** shading model. Fin fur is skipped because it needs silhouette-edge extraction and is not worth it on procedural spheres. LOD and fallback use **`MeshPhysicalMaterial` sheen** with a fresnel rim. The armour hides about 60% of the body, so the shell budget only goes where it shows.

| Tier | Shells | Used for |
|---|---|---|
| Hero close-up / cutscene | 24 | Swordcat head |
| Gameplay | 16 (Swordcat), 10 (companion kittens) | |
| Mobile / far LOD | 0, using the sheen fallback plus tuft cards | everyone beyond ~12 units |

### 3.1 Strand texture (generated once, at startup)

```js
export function makeStrandTexture(size = 256, cells = 32, seed = 7) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = cells * cells, cx = [], cy = [], ch = [], cr = [];
  for (let i = 0; i < n; i++) { cx[i] = 0.3 + rnd() * 0.4; cy[i] = 0.3 + rnd() * 0.4; ch[i] = 0.55 + rnd() * 0.45; cr[i] = 0.32 + rnd() * 0.16; }
  const cs = size / cells, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor(x / cs), gy = Math.floor(y / cs), i = gy * cells + gx;
    const d = Math.hypot((x + 0.5) / cs - gx - cx[i], (y + 0.5) / cs - gy - cy[i]) / cr[i];
    const o = (y * size + x) * 4;
    data[o] = d < 1 ? 255 * ch[i] * (1 - d) : 0; // cone: strand height, tapered tip
    data[o + 1] = 255 * ch[i]; data[o + 2] = 255 * rnd(); data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true; return t;
}
// strands per unit ≈ uTiling * cells. Head: uTiling = 7 → ~224 strands/unit (≈2 px per strand at 1080p close-up).
```

### 3.2 Per-vertex coat paint and fur mask

`paintCoat(geo, coat, opts)` writes a `color` attribute (the coat albedo) and a `furMask` attribute in [0, 1], with **0 around the eyes, nose, mouth and inner ear**. Compute the mask as `smoothstep(r0, r1, distance to each feature)` in object space. Without the mask, the shells would grow over the eyes. Use high-segment spheres (64×48) because the vertex colours are only as sharp as the mesh.

### 3.3 Shell material (one `InstancedMesh` per fur part; the instance index is the shell)

```js
export function makeFurMaterial(strandTex, P) {
  return new THREE.ShaderMaterial({
    vertexColors: true,                     // uses the built-in `color` attribute (coat)
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uStrands: { value: null }, uTiling: { value: 7 }, uShells: { value: 16 }, uFurLen: { value: 0.045 },
      uGravity: { value: new THREE.Vector3(0, -1, 0) }, uWind: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.4, 0.8, 0.45).normalize() },
      uSunColor: { value: new THREE.Color('#FFF2E0').multiplyScalar(1.1) },
      uSkyColor: { value: new THREE.Color('#D5DDE3') }, uGroundColor: { value: new THREE.Color('#4A5230') },
      uTipTint: { value: new THREE.Color('#F0C08F').multiplyScalar(0.35) },
      uRimColor: { value: new THREE.Color('#FFF1DD') }, uRimStrength: { value: 0.7 },
      uHoly: { value: 0 }, uHolyColor: { value: new THREE.Color('#FFD98A') },
    }]),
    vertexShader: /* glsl */`
      uniform float uFurLen, uShells, uTime; uniform vec3 uGravity, uWind;
      attribute float furMask;
      varying vec3 vObjPos, vObjN, vWN, vWPos, vCoat; varying float vH, vMask;
      #include <fog_pars_vertex>
      void main(){
        float h = (float(gl_InstanceID) + 1.0) / uShells;           // 0 = skin (base mesh), 1 = tip
        vec3 n = normalize(normal);
        float len = uFurLen * furMask;
        vec3 p = position + n * len * h;
        float k = h * h;                                             // stiff root, soft tip
        float flutter = 0.6 + 0.4 * sin(uTime * 3.1 + dot(position, vec3(23.0, 17.0, 11.0)));
        p += (uGravity * 0.35 + uWind * flutter) * len * k;          // uGravity/uWind in OBJECT space (CPU)
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWPos = wp.xyz; vObjPos = position; vObjN = n; vH = h; vMask = furMask; vCoat = color;
        vWN = normalize(mat3(modelMatrix) * n);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uStrands; uniform float uTiling, uRimStrength, uHoly;
      uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor, uTipTint, uRimColor, uHolyColor;
      varying vec3 vObjPos, vObjN, vWN, vWPos, vCoat; varying float vH, vMask;
      #include <common>
      #include <fog_pars_fragment>
      float strands(vec3 p, vec3 n){                                  // triplanar → no UV seams/poles
        vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z);
        return texture2D(uStrands, p.yz).r * w.x + texture2D(uStrands, p.zx).r * w.y + texture2D(uStrands, p.xy).r * w.z;
      }
      void main(){
        float s = strands(vObjPos * uTiling, vObjN);
        if (s * vMask < vH) discard;                                  // strand ended below this shell
        vec3 N = normalize(vWN), V = normalize(cameraPosition - vWPos);
        vec3 albedo = vCoat * mix(0.5, 1.0, vH) + uTipTint * vH * vH; // self-shadowed roots, light tips
        float wrap = saturate((dot(N, uSunDir) + 0.5) / 1.5);          // soft, overcast
        vec3 amb = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
        float rim = pow(1.0 - saturate(dot(N, V)), 3.0) * vH;          // fluffy back-lit halo (refs)
        vec3 rimCol = mix(uRimColor * uRimStrength, uHolyColor * 4.0, uHoly);
        gl_FragColor = vec4(albedo * (amb * 0.75 + uSunColor * wrap) + rim * rimCol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
// Usage per fur part:
//   base = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1 })) → darkened coat, castShadow
//   shells = new THREE.InstancedMesh(geo, furMat, SHELLS); shells.frustumCulled = false; shells.castShadow = false;
//   (identity instance matrices; the shader does not read instanceMatrix)
// Each frame: furMat.uniforms.uGravity.value.set(0,-1,0).applyQuaternion(part.getWorldQuaternion(q).invert());
//             same for wind plus a velocity drag: wind -= playerVelocity * 0.15 (fur trails when running)
```

Notes:
- The base mesh's colour is the coat multiplied by 0.5 (the root value), so gaps between strands read as dense fur.
- Optional: `furMat.alphaToCoverage = true` (with `antialias: true`), writing `alpha = smoothstep(vH-0.05, vH+0.05, s*vMask)` instead of discarding. This removes the jaggy strand edges in close-ups.
- Shells do not receive shadow maps. That is acceptable under overcast light; use contact blob shadows (§9).

### 3.4 Tuft cards (silhouette fluff, ear tufts, cheek wisps)

Use `PlaneGeometry(0.03, 0.08)` cards, 6–12 per cluster, pointing along the surface normal plus gravity and randomly rotated about the normal. The fragment shader builds the alpha procedurally:

```glsl
float strand = smoothstep(0.5, 0.0, abs(fract(vUv.x * 5.0 + vUv.y * 0.6) - 0.5) * 2.0 + vUv.y * 0.7);
float a = strand * (1.0 - vUv.y);   // tapered tips
if (a < 0.35) discard;
```

Colour the cards cream `#EFE3D2` at the root and `#FFF6EA` at the tip. Use `side: DoubleSide`.

### 3.5 Sheen fallback (far LOD, villagers, furry enemies)

```js
const furLite = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.95, sheen: 1,
  sheenColor: new THREE.Color('#FFE0BD'), sheenRoughness: 0.45 });
furLite.onBeforeCompile = (sh) => {               // add the same fresnel rim
  sh.uniforms.uRim = { value: new THREE.Color('#FFF1DD').multiplyScalar(0.5) };
  sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition) * -1.0)), 3.0);');
};
```

---

## 4. Armour & sword materials

### 4.1 Environment map (this is what makes the plate read as polished steel)

ref2's armour reflects **grey sky above and dark green ground below**, with crisp highlights on the dome tops. Build a matching PMREM from a gradient scene and do not rely on `RoomEnvironment`, which looks like an indoor studio.

```js
export function makeOvercastEnv(renderer, { top = '#E3E9EE', horizon = '#B9C2C4', ground = '#3E4A26' } = {}) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, gnd: { value: new THREE.Color(ground) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, hor, gnd; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.6)) : mix(hor, gnd, pow(-y, 0.35)); gl_FragColor = vec4(c, 1.0); }`,
  })));
  const box = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) }));
  box.position.set(-3, 7, 4); box.lookAt(0, 0, 0); s.add(box);            // softbox → crisp dome highlight
  const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(s, 0.02).texture; pm.dispose();
  return env;                                                              // scene.environment = env (per biome)
}
```

### 4.2 Materials

| Material | Settings | Use |
|---|---|---|
| `steel` | `MeshStandardMaterial({ color:'#C8CDD5', metalness:1, roughness:0.26, envMapIntensity:1.25 })` | pauldrons, breastplate, tassets, gauntlets |
| `steelDark` | `color:'#8E949E', metalness:1, roughness:0.48` | greaves, sabatons, gaps, arm undersides |
| `mail` | `color:'#6F747C', metalness:0.9, roughness:0.55`, plus a canvas ring-pattern `bumpMap` (repeat 18×4) | waist mail skirt |
| `brass` | `color:'#D9B26A', metalness:1, roughness:0.33` | crossguard, pommel, cuff rings, buckle, rivets (some) |
| `leather` | `color:'#6B4429', roughness:0.78`; grip `#4A2E1F` with spiral bump | belt, straps, grip |
| `blade` | `MeshPhysicalMaterial({ color:'#D0D5DC', metalness:1, roughness:0.14, anisotropy:0.6, emissive:'#FFD98A', emissiveIntensity:0 })` (anisotropy is optional, r153+) | blade |
| `cape` | §5 | |

Pauldron (4 lames, each larger and lower, so they flare like ref2):

```js
function pauldron(side, steel, rivetMat) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.SphereGeometry(0.085 + i * 0.008, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 0.72, 1.1);
    const m = new THREE.Mesh(geo, steel); m.material.side = THREE.DoubleSide;
    m.position.set(side * i * 0.012, -i * 0.026, 0); m.rotation.z = -side * (0.3 + i * 0.14);
    m.castShadow = true; g.add(m);
  }
  // rivets: InstancedMesh(SphereGeometry(0.006, 8, 6), rivetMat, 6) along the lowest lame's rim
  g.position.set(side * 0.18, 0.56, 0); return g;
}
```

The dark gaps between lames are what read as "articulated plate". Keep the overlap step visible (≈0.01).

### 4.3 Sword (≈1.0 H total)

| Piece | Geometry | Size |
|---|---|---|
| Blade | `ExtrudeGeometry` of the 2D outline below, `{ depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 1 }`. The bevel *is* the sharpened edge highlight. | length 0.85, width 0.055 at the guard tapering to 0.04, point over the last 0.09 |
| Fuller | thin dark inset `BoxGeometry(0.012, 0.5, 0.002)` ×2 (front and back), `steelDark` | 60% of blade length from the guard |
| Crossguard | `TubeGeometry` on a 3-point curve (slight downturn at the tips), radius 0.011, plus sphere finials r 0.016 | width 0.21 |
| Grip | `CylinderGeometry(0.014, 0.016, 0.11, 12)` in leather | |
| Pommel | `SphereGeometry(0.026)`, scaled (1, 0.85, 0.7), brass | |

Blade outline: `shape.moveTo(-0.0275,0); lineTo(-0.02,0.76); lineTo(0,0.85); lineTo(0.02,0.76); lineTo(0.0275,0); closePath()`.

**Holy charge (ref1)** is driven by `charge ∈ [0, 1]`:
1. `blade.emissiveIntensity = lerp(0, 4, easeIn(charge))` with emissive `#FFE3A3`, which bloom picks up.
2. A **blade light streak**: a cylindrical billboard quad along the blade, width 0.22, additive (see the shader below).
3. A `PointLight('#FFD38A', 2.2*charge, 3)` at mid-blade, which warms the face and armour (as in ref1, where the armour turns gold).
4. The **holy aura hull** on the cat (§10.2) and `furMat.uHoly = charge`.
5. Sparkles stream up from the blade (§8).
6. On release, a white-gold flash (bloom spike) and a ring shockwave decal.

```js
// cylindrical billboard (always faces the camera, stays aligned with the blade axis)
const streakMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color('#FFE3A3') }, uI: { value: 0 }, uWidth: { value: 0.22 } },
  vertexShader: `uniform float uWidth; varying vec2 vUv;
    void main(){ vUv = uv;
      vec3 base = (modelMatrix * vec4(0.0, position.y, 0.0, 1.0)).xyz;
      vec3 axis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
      vec3 side = normalize(cross(axis, normalize(cameraPosition - base)));
      gl_Position = projectionMatrix * viewMatrix * vec4(base + side * position.x * uWidth, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec2 vUv;
    void main(){ float x = abs(vUv.x - 0.5) * 2.0;
      float a = exp(-x * 7.0) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
      gl_FragColor = vec4(uColor * a * uI * 3.0, 1.0); }`,
});
const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.0, 1, 8).translate(0, 0.5, 0), streakMat); // child of sword, y from 0 (guard) to 1.0
```

---

## 5. Cape cloth

- **Hero: CPU verlet.** Use a 9×13 particle grid, width 0.40 at the top flaring to 0.55, length 0.46. Pin the top row to 3 anchor points (left shoulder, neck, right shoulder) taken from the torso's `matrixWorld` each frame. Add structural and shear constraints, run 4 iterations, damping 0.985, gravity −20 units/s² (floaty and cute), wind `uWind + noise`, and inertia from the player's velocity. Collide with spheres: torso (0, 0.42, 0) r 0.2, two legs r 0.07 and the tail root. Write the result into a `PlaneGeometry(…, 8, 12)` position attribute, then call `computeVertexNormals()` and set `frustumCulled = false`. The cost is about 117 particles, which is negligible.
- **NPCs: vertex-shader sway** (no CPU):
  ```glsl
  float k = pow(1.0 - uv.y, 2.0);                  // uv.y = 1 at the shoulders
  p.z -= k * (0.06 + uSpeed * 0.18);              // trails behind when moving
  p.x += k * sin(uTime * 2.0 + uv.y * 4.0) * 0.02;
  p.z += k * sin(uTime * 2.6 + uv.x * 3.0) * 0.015;
  ```
- **Material.** Wool/velvet: `MeshPhysicalMaterial({ color:'#A3202C', roughness:0.85, sheen:1, sheenColor:'#E0525A', sheenRoughness:0.6, side:DoubleSide })`. The lining is darker `#6B0F1A`: in `onBeforeCompile`, `diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.62;`. Add a thin gold hem stripe (`#D9B26A`, 0.012) along the bottom edge via UV in the same patch.
- **Alternate "Pilgrim" cape (ref3):** `#E2D6C0` with a `#CDBB9C` hem.

---

## 6. Colour palette

### 6.1 Sampled from the references (actual pixel values; the photos are hazy and dark)

| Region | Sampled (median / light p90) | Image |
|---|---|---|
| Fog sky | `#C1CACF` / `#C8D1D8`; ref3 `#C1C1CF`; ref1 (cooler) `#969FB0` | ref2/3/1 |
| Fog band at mid distance (grass dissolving) | `#616750`, `#5E664F`; ref3 horizon `#80817A` | |
| Foreground grass | `#323918` / `#414626`; ref3 `#49542B` / `#585F41` | |
| Fur, ginger | ref1 face `#AA7D54` / `#DCA57F` (p10 `#905933`); ref2 forehead `#9C6E4A` / `#C29D83` | |
| Fur, cream/shade (chin, bib, tail) | `#6C635A`, `#5E574D`, tail p90 `#9C938C` | |
| Inner ear | `#8C7A6C` / `#A69385` | |
| Nose | `#724E3E` / `#946B55` | |
| Bow | ref2 `#C28493` / `#D5ABAD` (p98 `#E4B9C2`); ref1 `#E3A892` / `#FFD8D4` | |
| Steel (pauldron) | p10 `#1D1C22`, p50 `#80827D`, p90 `#D7D8DD`, p98 `#E5E6E8` | |
| Brass guard | `#74634F` / `#B2A088` | |
| Cape red | `#3B0805` (p10 `#230308`) | |
| Leather | `#332E28` (p10 `#1A0605`) | |
| Blade | `#6F7873` / `#8F939E`; ref3 `#808089` / `#BABAC8` | |
| Holy halo (ref1) | p10 `#DA9F5D`, p50 `#E5D2B5`, p90 `#FFFAE4` | |
| ref3 cream cape | p90 `#B4A89A`, p98 `#D3C8B9` | |

### 6.2 Game palette tokens [PROPOSED; lifted 15–30% in lightness and saturation for readability]

```js
export const PAL = {
  // Swordcat
  furGinger:'#D4935A', furGingerLight:'#F0C08F', furGingerDeep:'#A65E2E', furCream:'#EFE3D2', furCreamShade:'#C9B8A3',
  earInner:'#EBB0A6', nose:'#C97F7A', irisInner:'#8DB3C2', irisOuter:'#3F6170', pupil:'#0D1114', eyeLine:'#2A1E18',
  bow:'#F2A2B8', bowLight:'#FFD2DE', bowShade:'#C76E8A', whisker:'#F5EEE6',
  steel:'#C8CDD5', steelDark:'#8E949E', mail:'#6F747C', brass:'#D9B26A', brassDeep:'#A87C32',
  leather:'#6B4429', leatherDark:'#4A2E1F', capeRed:'#A3202C', capeLining:'#6B0F1A', capeSheen:'#E0525A',
  capeCream:'#E2D6C0', blade:'#D0D5DC',
  holyCore:'#FFF6DA', holy:'#FFE3A3', holyEdge:'#E8A95A', sparkle:'#FFF1C4', sparkleWarm:'#FFD57A',
  // Misty meadow
  skyTop:'#C3CCD3', fog:'#B7C0C3', fogLow:'#9AA196', hemiSky:'#D5DDE3', hemiGround:'#4A5230', sun:'#FFF2E0',
  grassRoot:'#2E3714', grassMid:'#4E5A2C', grassTip:'#7D8A4A', grassDry:'#9C9A5E', soil:'#3A3220',
  stone:'#8C8F88', lichen:'#A7A77A', thistle:'#C77DA8', clover:'#EDEFE6',
  // UI
  parch:'#F4E7C9', parch2:'#E8D5AA', parchEdge:'#B08A55', ink:'#3A2A1F', inkSoft:'#6B5443',
  uiPink:'#F2A2B8', uiPinkDeep:'#D9668A', uiGold:'#D9B26A', uiGoldDeep:'#A87C32', heart:'#F0668E', danger:'#E04646',
};
```

Reserve **pink** for Swordcat and the UI accents. No enemy uses pink as a main colour, and companions use it only in tiny details.

---

## 7. Fellow kittens [PROPOSED; working names, the story doc may rename them]

All kittens use the same `buildKitten(cfg)` (same proportions, ±10% size) with different coats, eyes and one **unique silhouette prop**, so each one reads in silhouette alone. Shells: 10 at gameplay distance, otherwise the sheen fallback.

| Kitten | Role | Coat (base / secondary / pattern) | Eyes | Silhouette prop and outfit |
|---|---|---|---|---|
| **Mochi** | squire / tank | tuxedo `#1E1F24` / white `#F5F2EC` (muzzle, bib, paws) | amber `#E5A93B` | huge round tower shield (Cylinder r 0.35 plus a brass boss), blue tabard `#3F6FB5` with a silver paw crest, oversized pot helm |
| **Sage** | ranger / archer | silver mackerel tabby `#8D8F93` / stripes `#4C4E52` | green `#8CC63F` | pointed leaf-green hood `#5E7F3E` (cone with a bent tip), quiver, short bow |
| **Clover** | cleric / healer | calico: white `#F6F1E8` with patches of `#E09A4E` and `#2A2624` (noise-thresholded in `paintCoat`) | hazel `#A58A4A` | white coif/wimple, brass bell on a collar, herb satchel, flower staff (`#F7C6D9` blossom) |
| **Earl Grey** | scholar-mage | Siamese: cream `#EFE2CC` with seal points `#4A3830` on ears, mask, tail and paws | sapphire `#4F86C6` | giant floppy wizard hat `#5C4A9C` with stars, round glasses (Torus), floating book |
| **Pip** | scout / rogue | solid black `#1A1A1F` (needs strong rim light) | yellow-green `#C9D84A` | very long red scarf `#C2353B` (two trailing ribbons, shader sway), tiny dagger |
| **Sir Marmalade** | old mentor knight | chonky orange tabby `#C9783A`, grey muzzle `#B7AFA6` (age) | gold `#D6A53A`, one eyepatch | dented rusty plate (`#8C8F93` plus rust `#8E5A3A` noise), drooping helm plume, walking-stick greatsword, 1.25× width |
| **Pearl** *(optional, from ref3)* | sister / pilgrim | dilute cream-silver `#CDB9A8` / `#E9DED3` | blue-grey | cream pilgrim cape `#E2D6C0`, pale pink bow `#E9B9B9`. *ref3 may simply be Swordcat in different light; using it as a sister is an interpretation.* |
| **Princess Snowpaw** *(optional)* | royal NPC | white Turkish angora `#F7F5F2`, long fur 0.07 | odd-eyed: blue `#6FA8DC` and gold `#E8B84A` | lavender gown `#B9A3D6` (Lathe cone), small tiara with a pink gem |

Villager kittens are randomised: coat ∈ {ginger, cream, grey, black, white, brown tabby, tortie, bicolour}, accessory ∈ {apron, straw hat, flower crown, scarf, bucket helm, baker's hat}. Use sheen-fallback fur only.

---

## 8. Golden sparkles (holy motes; also ambient dandelion fluff)

```js
export function makeSparkles(count = 160, color = '#FFF1C4') {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), ph = new Float32Array(count), sz = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set([(Math.random() - .5) * 1.6, Math.random() * 1.2, (Math.random() - .5) * 1.6], i * 3); ph[i] = Math.random(); sz[i] = 0.6 + Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uI: { value: 1 }, uColor: { value: new THREE.Color(color) }, uPR: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `uniform float uTime, uPR; attribute float aPhase, aSize; varying float vA;
      void main(){ vec3 p = position;
        float life = fract(uTime * 0.18 + aPhase);                      // rise and loop
        p.y += life * 1.2; p.x += sin(uTime * 0.7 + aPhase * 6.28) * 0.06; p.z += cos(uTime * 0.6 + aPhase * 9.0) * 0.06;
        float tw = 0.55 + 0.45 * sin(uTime * (3.0 + aPhase * 5.0) + aPhase * 40.0);
        vA = sin(life * 3.14159) * tw;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPR * 36.0 / -mv.z * (0.6 + 0.4 * tw);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float core = pow(smoothstep(0.5, 0.0, d), 3.0);
        float star = max(0.0, 1.0 - abs(c.x) * 16.0) * smoothstep(0.5, 0.0, abs(c.y))
                   + max(0.0, 1.0 - abs(c.y) * 16.0) * smoothstep(0.5, 0.0, abs(c.x));  // 4-point twinkle
        float a = (core + star * 0.5) * vA * uI;
        gl_FragColor = vec4(uColor * a * 3.0, 1.0); }` });   // HDR (×3) so bloom blooms it
  return new THREE.Points(g, m);
}
```

| Preset | Count | Colour | uI | Notes |
|---|---|---|---|---|
| Holy aura | 160 | `#FFF1C4` / `#FFD57A` | follows `charge` | attached to the player |
| Ambient meadow | 60 over 30×30 units | `#F4F1E6` | 0.35 | larger and slower (dandelion fluff) |
| Forest fireflies | — | `#E8FF9A` | — | |
| Keep embers | — | `#FF7A3D` | — | rise faster |
| Snow | — | — | — | normal blending, falls instead of rising |

Enemy defeats are cute rather than violent. Every defeat ends in a **"poof"**: 12 white puffs (sprites, scale 0 → 1.4, opacity 1 → 0, 0.35 s), 6 gold stars, and a faction-specific debris (feathers, dirt, slime droplets).

---

## 9. Environment: lighting, fog, grass, sky

### 9.1 Renderer and lighting (overcast; the refs show no hard shadows)

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // or AgXToneMapping (r160+) for gentler highlights
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.fog = new THREE.FogExp2('#B7C0C3', 0.045);
scene.environment = makeOvercastEnv(renderer);
scene.add(new THREE.HemisphereLight('#D5DDE3', '#4A5230', 1.1));
const sun = new THREE.DirectionalLight('#FFF2E0', 1.4);  // high, front-left, diffused
sun.position.set(-5, 10, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 40 }); // follows the player
```

- **Contact (blob) shadows** under every character are mandatory, because they ground things in overcast light. Use a `PlaneGeometry` at y + 0.002 with a radial-gradient `CanvasTexture`, `color '#1D2410'`, `opacity 0.5`, `depthWrite:false`, scaled with the character footprint and shrinking while airborne.
- **FogExp2 density** in H units: 0.045 means about 47% fog at 20 units and about 86% at 35 units. That matches the "world dissolves a few metres away" look of ref2.
- **Sky:** use a large dome (`SphereGeometry(300)`, BackSide, `fog:false`) with the same gradient shader as §4.1. **The horizon colour must equal the fog colour** so the meadow melts into the sky.

### 9.2 Height fog / ground mist (optional, strongly recommended)

ref2's mid-distance fog is **greener near the ground** (`#616750`) and greyer above. Add a height term through `onBeforeCompile` on every material, with shared uniforms (the same objects, so they update globally).

```js
export const HFOG = { uFogLow: { value: new THREE.Color('#9AA196') }, uFogBase: { value: 0 }, uFogFalloff: { value: 0.6 } };
const HF_V_PARS = '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying float vFogH;\n#endif';
const HF_V = '#include <fog_vertex>\n#ifdef USE_FOG\nvFogH = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).y;\n#endif'; // world y (rigid view matrix)
const HF_F_PARS = '#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying float vFogH; uniform vec3 uFogLow; uniform float uFogBase, uFogFalloff;\n#endif';
const HF_F = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float distF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float distF = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  float hF = exp(-max(vFogH - uFogBase, 0.0) * uFogFalloff);           // 1 at ground → 0 high
  float fogFactor = clamp(distF * mix(0.7, 1.15, hF), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uFogLow, hF * 0.6), fogFactor);
#endif`;
export function withHeightFog(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev?.(sh, r); Object.assign(sh.uniforms, HFOG);
    sh.vertexShader = sh.vertexShader.replace('#include <fog_pars_vertex>', HF_V_PARS).replace('#include <fog_vertex>', HF_V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', HF_F_PARS).replace('#include <fog_fragment>', HF_F); };
  mat.customProgramCacheKey = () => 'hfog';
  return mat;
}
// Custom ShaderMaterials: merge HFOG into their uniforms and apply the same 4 string replacements to their sources.
```

**Mist cards:** 30–60 vertical cylindrical-billboard planes (8×2.5 units) at ground level. They use scrolling 2-octave noise alpha (max 0.22, colour `fogLow`), fade to 0 within 3 units of the camera and are `depthWrite:false`. They give the drifting-mist motion seen in the refs.

### 9.3 Grass (instanced blades plus a wind shader)

```js
export function makeGrass({ count = 60000, size = 30, bladeH = 0.18, bladeW = 0.022, heightAt = () => 0 } = {}) {
  const geo = new THREE.PlaneGeometry(bladeW, bladeH, 1, 4).translate(0, bladeH / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / bladeH; p.setX(i, p.getX(i) * (1 - t * 0.85)); p.setZ(i, t * t * 0.03); }
  const tint = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, grassMat /* below */, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set((Math.random() - .5) * size, 0, (Math.random() - .5) * size); v.y = heightAt(v.x, v.z);
    q.setFromEuler(e.set((Math.random() - .5) * .3, Math.random() * 6.283, (Math.random() - .5) * .3));
    mesh.setMatrixAt(i, m.compose(v, q, s.set(1, 0.6 + Math.random() * 0.8, 1))); tint[i] = Math.random();
  }
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  mesh.frustumCulled = false; return mesh;
}
const grassMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) }, uWind: { value: 0.6 }, uBladeH: { value: 0.18 },
    uPlayer: { value: new THREE.Vector3() }, uRoot: { value: new THREE.Color('#2E3714') }, uTip: { value: new THREE.Color('#7D8A4A') },
    uDry: { value: new THREE.Color('#9C9A5E') }, uSky: { value: new THREE.Color('#D5DDE3') }, uSun: { value: new THREE.Color('#FFF2E0') } }]),
  vertexShader: /* glsl */`
    uniform float uTime, uWind, uBladeH; uniform vec2 uWindDir; uniform vec3 uPlayer;
    attribute float aTint; varying float vH, vTint;
    #include <fog_pars_vertex>
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      float h = clamp(position.y / uBladeH, 0.0, 1.0);
      vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec4 wp   = modelMatrix * instanceMatrix * vec4(position, 1.0);
      float gust = vnoise(root.xz * 0.15 - uWindDir * uTime * 0.6);          // rolling gust waves across the field
      float flutter = sin(uTime * 4.0 + root.x * 3.1 + root.z * 2.3) * 0.15;
      float bend = (gust * 1.2 + flutter) * uWind * h * h;
      wp.xz += uWindDir * bend * uBladeH; wp.y -= bend * bend * 0.25 * uBladeH;
      vec2 d = root.xz - uPlayer.xz; float dist = length(d);                   // trample / part around player
      float push = (1.0 - smoothstep(0.0, 0.45, dist)) * h;
      wp.xz += d / max(dist, 1e-3) * push * 0.12; wp.y -= push * 0.06;
      vH = h; vTint = aTint;
      vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uRoot, uTip, uDry, uSky, uSun; varying float vH, vTint;
    #include <common>
    #include <fog_pars_fragment>
    void main(){
      vec3 tip = mix(uTip, uDry, smoothstep(0.8, 1.0, vTint));
      vec3 c = mix(uRoot, tip, pow(vH, 1.3)) * mix(0.85, 1.1, fract(vTint * 7.31));
      c *= uSky * 0.55 + uSun * (0.35 + 0.35 * vH);                          // sky-lit, brighter tips
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }` });
```

- Budget: 60k blades (≈480k triangles) on desktop, 20k on mobile. Paint the ground under the grass `#2E3714`–`#3A4520` so that sparse grass still reads as full.
- For an infinite field, keep one 30×30 tile following the player. In the vertex shader, wrap each root: `root.xz = mod(root.xz - uCenter.xz + 15.0, 30.0) - 15.0 + uCenter.xz`, and sample a heightmap texture for y.
- Add tall-grass patches (bladeH 0.45) as hiding spots for rats and crows.
- Add flowers as small instanced crosses: thistle `#C77DA8`, clover `#EDEFE6`, buttercup `#E8C547`.

### 9.4 Terrain and props (all procedural)

- **Ground:** `PlaneGeometry(200, 200, 160, 160)` displaced by 3-octave fbm (rolling hills, amplitude 1.5), vertex-coloured greens with dry patches, `roughness:1`.
- **Standing stones:** `DodecahedronGeometry(1, 1)` noise-displaced, scaled (0.6, 1.8, 0.4), `#8C8F88` with lichen `#A7A77A` by normal.y.
- **Drystone walls:** instanced jittered boxes.
- **Fences:** cylinders.
- **Haystacks:** `LatheGeometry`.
- **Background trees:** lollipop trees (Icosahedron detail 1, displaced), visible as **fog silhouettes**.
- **Windmill:** cylinder, cone and 4 box sails that rotate.

---

## 10. Post-processing & holy aura

### 10.1 Stack (three addons)

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }); // keep MSAA
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 3.2, aperture: 0.0006, maxblur: 0.006 }); // tune; set focus = dist to player each frame
composer.addPass(bokeh);                                   // gameplay: subtle; cutscenes: aperture ×3; mobile: disable
const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.55, 0.6, 0.85); // strength, radius, threshold
composer.addPass(bloom);                                   // Holy charge: strength → 1.2, threshold → 0.75
composer.addPass(new OutputPass());                        // tone mapping + sRGB happen here
const vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = 0.95; vig.uniforms.darkness.value = 1.15;
composer.addPass(vig);
```

An optional grade pass after OutputPass applies saturation 0.95 to the whole frame, a cool shadow tint `#2A3440` and a warm highlight tint `#FFE9C9` at about 4%. Add tiny film grain (0.025) to match the photographic softness of the refs. The pmndrs `postprocessing` npm package is an alternative that merges these effects into fewer passes and is faster on mobile.

### 10.2 Holy aura hull (the ref1 silhouette glow)

For the head, torso and pauldrons, add a clone mesh pushed out along its normals, rendered back-faced and additive. Glow is brightest next to the body and fades outward. Bloom does the rest.

```js
const auraMat = new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color('#FFD98A') }, uI: { value: 0 }, uExpand: { value: 0.05 } },
  vertexShader: `uniform float uExpand; varying vec3 vN, vV;
    void main(){ vec4 wp = modelMatrix * vec4(position + normal * uExpand, 1.0);
      vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec3 vN, vV;
    void main(){ float f = pow(abs(dot(normalize(vN), vV)), 3.0); gl_FragColor = vec4(uColor * f * uI * 3.0, 1.0); }` });
```

Holy state checklist: `auraMat.uI`, `furMat.uHoly`, the blade emissive, streak, point light, sparkles and bloom strength all follow `charge`. The vignette tint also shifts warm, using ref1's warmer background `#817463` toward the ground.

---

## 11. Enemies — cute but menacing [PROPOSED]

**Rules.** Enemies follow the same chibi proportions (head 35–45%), with round bodies, tiny feet and oversized helmets: cute. They have narrowed or beady eyes with angry brow cards, cool or dark desaturated palettes, sharp weapons and a glowing eye glint: menacing. They never use pink, which belongs to the heroes. Every attack has a **telegraph** in the faction colour, and defeats are non-lethal (poof, helmet spin, run away, sparkles).

| Enemy | Size (H) | Build (primitives) | Palette | Materials / FX | Telegraph / defeat |
|---|---|---|---|---|---|
| **Rat Pikeman** (Rat Militia grunt) | 0.9 | pear body (Lathe), sphere head with a long cone snout, round pink ears, long tapered tube tail; **oversized kettle helm** (Lathe brim) that wobbles; spear (Cylinder + Cone); wooden buckler with a cheese-wedge sigil | fur `#7B6F68`, belly `#B9ADA4`, ears/tail/nose `#E7A3A0`, helm `#8A8D90` + rust `#8C5A3A`, tunic `#6E5B3A`, sigil mustard `#B28B2E`; eyes black with a red glint `#FF4A3A` | sheen fur; helm rough 0.6 metal 1 | spear tip flashes red, then a lunge. Defeat: helm pops off spinning, rat poofs and flees |
| **Rat Crossbowman** | 0.9 | same rig, hood `#4D5A3A`, crossbow | as above | — | dotted red aim line for 0.8 s |
| **Rat Captain** (mini-boss) | 1.6 | rides an **armoured beetle** (half-sphere carapace, 6 capsule legs); feathered hat, sabre | rat as above; beetle `#2F3B4A` with iridescence | `MeshPhysicalMaterial({ iridescence:0.7, iridescenceIOR:1.3 })` on the shell | beetle charge with dust trail |
| **Crow Raider** | 0.8 body, 1.6 wingspan | plump sphere body, cone beak, 2 wing fans (flattened ellipsoid feather cards), tiny iron hood with a red plume | feathers `#17181C`, sheen violet/green, beak `#2B2A2E`, eyes `#F2C94C`, plume `#A3202C` | iridescence 0.5 or sheen `#6B5CA5` | dive: **ground shadow decal grows** for 1 s. Defeat: 15 feather cards burst |
| **Molegrim Sapper** (goblin mole) | 0.85 | chubby sphere, huge pink paws with claw cones, tiny squint eyes behind **round brass goggles**, miner helmet with a candle | velvet `#3B3236`, paws/nose `#E8A0A0`, goggles `#D9B26A`, candle flame `#FFB347` | sheen 1 (velvet), flickering PointLight | dirt-mound bump travels toward the player and pops out under them. Dirt particles `#5A4632` |
| **Gloomjelly** (slime) | 0.4 / 0.8 / 1.4 | sphere with wobble vertex shader (`p += n * sin(t*4 + p.y*6) * 0.04`, squash on hop), two black dot eyes with catchlight on the surface, a **swallowed object inside** (helmet, fish bone) | bog green `#7FD38A` (attenuation `#3E8F55`); poison `#A57FD3`; frost `#9FD6F2` | `MeshPhysicalMaterial({ transmission:0.7, thickness:0.5, roughness:0.15, ior:1.25 })`. Transmission adds a render pass, so cap at 6 on screen; the fallback is opacity 0.75 plus fresnel | squash before a leap. Defeat: split into two smaller slimes, then pop into droplets |
| **Bramblehog Knight** | 0.8 | hemisphere back covered by an instanced-cone spine field (~200), sphere face, tiny bucket helm, mace | spines `#6A513C` with tips `#E3D3B4`, face `#E9D2B8` | — | spines flare and shake, then a **curl-and-roll** attack (whole group spins) |
| **Toad Hexer** | 1.0 | fat squashed sphere, wide mouth, purple hood (cone), staff with a glowing orb | skin `#6F8A4A`, warts `#8FA35E`, belly `#E6DDB0`, hood `#5B3E7A`, orb `#9BFF7A` emissive | — | throat sac inflates (scale), then lobs bubble projectiles |
| **Ermine Shadowblade** (snow biome) | 0.95 | slim capsule body, long neck, black tail tip, mask cloth, twin daggers | white `#F4F2EE`, tail tip `#1C1C20`, mask `#22242A`, blade glint `#BFD9FF` | — | vanishes in a smoke puff and reappears behind; a blue glint flashes 0.4 s before the strike |
| **Hornet Lancer** (elite, forest) | 0.9 | bumble-chubby striped body, lance, tiny wings (alpha planes with fast flap) | `#E8B931` / `#2A2420`, wings `#E8F4FF` at 0.4 opacity | — | buzz pitch rises, then a lance dash |
| **Pug Brute** (Hound Legion heavy) | 1.4 | round barrel body, squashed face, curly tail, tower shield with a bone sigil | fawn `#C9A27A`, mask `#2A2522`, armour `#2E3036` with red trim `#8E1B22`, sigil `#EFE6D4` | — | shield slam with a red shockwave ring |
| **Spectral Mouse** (abbey, optional) | 0.5 | sphere and cone with a fresnel ghost shader | `#CFF6FF` emissive, opacity 0.6 | — | — |

**Bosses** [PROPOSED working names]:

| Boss | Biome | Look | Signature telegraph |
|---|---|---|---|
| **Rat Captain Grizzlechop** on his beetle | Meadows | as above, with a cape and a cheese-wheel shield | beetle charge lanes drawn as dust streaks |
| **Mole King Burrowmaw** (3H) | Whiskerwood | giant velvet mole with **brass drill gauntlets** (cones with spiral normal and spinning), crown on his helmet, goggles | ground fissure lines glow orange |
| **Slime Sovereign** (4H) | Bogmire | huge transmission slime with a golden crown and a knight's helm floating inside | sinks and swells before a full-arena splash |
| **Crow Queen Corvessa** | Frostwhisker Peaks | a large crow with an ice-crystal crown and a cloak of smaller crows (instanced birds orbiting) | murder spiral |
| **Dog Warlord — "Lord Barkus Grimjaw"** (final, 3.2H) | Houndhold Keep | bulldog/mastiff, brindle fur `#6B4E3A`, **jowls and an underbite with two little fangs** (cute but menacing), studded spiked collar, black iron plate `#2E3036` with blood-red trim `#8E1B22` and a bone sigil, eyepatch, horned helm, tattered black cape, **huge serrated cleaver-greatsword** with a red-hot edge `#FF3B30` | weapon edge glows red during the wind-up; ground cracks ring. Phase 2: helm shatters and the brows go furious. The final strike happens as the clouds break and gold light pours in (the ref1 callback) |

---

## 12. Biomes / levels [PROPOSED]

All biomes use the same pipeline: FogExp2 and height fog, gradient sky dome plus env PMREM regenerated per biome, hemisphere and sun lights, the grass shader, and particles.

| # | Biome | Fog colour / density | Sky top → horizon | Hemi sky / ground; sun | Ground / foliage | Accents & props | Particles | Enemies |
|---|---|---|---|---|---|---|---|---|
| 1 | **Purrdale Misty Meadows** (tutorial; the exact ref look) | `#B7C0C3` / 0.045, low `#9AA196` | `#C3CCD3` → `#B7C0C3` | `#D5DDE3` / `#4A5230`; `#FFF2E0` ×1.4 | grass `#2E3714`→`#7D8A4A` | standing stones, drystone walls, windmill, haystacks, thistles `#C77DA8`, clover | dandelion fluff, ambient sparkles, mist cards | Rat Militia, Crows; boss Rat Captain |
| 2 | **Whiskerwood Forest** | `#8E9E8A` / 0.06 | `#A9B7A9` → `#8E9E8A` | `#B9C7B0` / `#2C3A24`; `#FFE7B8` ×1.8 plus **god rays** (additive cone meshes, `#FFF0C2`, 0.12 opacity, noise-scrolled) | moss `#2F4A2A`→`#7E9B4A` | giant oaks (cylinder trunks, root tubes, icosahedron canopies with wind), red mushroom caps `#D8573F` with white spots, glowing mushrooms `#8FF0D8`, mushroom houses | fireflies `#E8FF9A`, pollen | Molegrim, Bramblehogs, Toad Hexers, Hornets; boss Mole King |
| 3 | **Bogmire Marsh** | `#8F9A84` / 0.07, strong height fog (falloff 1.2) | `#9DA595` → `#8F9A84` | `#AEB8A2` / `#2A3324`; `#E8E6C8` ×1.0 | water `MeshStandard #2F3B33` with metal 0, rough 0.12, gentle normal wave; lily pads `#5E7A3A`; reeds `#8C8A4E` (grass shader, tall) | dead trees `#4A4038`, plank boardwalks, sunken helmets | will-o'-wisps `#9FFFCB`, bubbles | Gloomjellies, Toads; boss Slime Sovereign |
| 4 | **Pawsbury Town & Castle** (hub, golden hour) | `#D8CDB8` / 0.025 | `#E9D9C0` → `#C9D3DA` | `#F0E6D6` / `#5A4A36`; `#FFD9A8` ×2.0, low angle, real shadows | cobbles `#B9AE9A`, grass patches | timber-frame houses (boxes plus extruded triangle roofs; plaster `#EFE6D4`, timber `#5A3E2B`, tiles `#A4553F` / slate `#5D6670`), pink-and-gold paw banners, fish weathervanes, striped market awnings, fountain with a cat statue, warm lanterns `#FFC46B` | chimney smoke, petals | none (safe hub); villagers |
| 5 | **Frostwhisker Peaks** | `#CDD8E3` / 0.05 | `#DCE6EF` → `#CDD8E3` | `#E6EEF5` / `#7D8C99`; `#FFFFFF` ×1.2 cool | snow `#F2F5F8` (rough 0.9, glitter via noise-masked spec), ice `#A8D8EA` (clearcoat 1), pines `#2E4A44` | rope bridges, frozen waterfalls, abandoned watchtowers | falling snow, breath puffs, wind streaks | Ermines, frost Gloomjellies, crows; boss Crow Queen |
| 6 | **Houndhold Keep** (finale) | `#4B3F42` / 0.05, low `#5A3A30` | storm `#2E2A33` → ember `#6B3A30` | `#6B5E66` / `#1E1A1A` ×0.6; braziers `#FF8A3D` point lights | dark stone `#4A4648`, iron `#3B3D42` | red banners `#7A1622` with a bone sigil, chains, spiked parapets, siege engines | embers `#FF7A3D`, ash `#8A8580` | Pug Brutes, Rat elites, crows; **Dog Warlord**. End state: clouds part, gold shaft `#FFE3A3`, fog lifts to `#C9C2B0`, the Holy finale |
| 7* | **Moonlit Abbey Ruins** (optional) | `#3E4A63` / 0.04 | `#26304A` → `#3E4A63` | `#7F8FB8` / `#1A1E2A`; moon `#BFD3FF` ×0.9 | — | broken arches, stained-glass shafts (coloured additive cones) | — | Spectral Mice, owls |

The light changes over the course of the story, from misty and grey (beginning) through golden hour (hub) and stormy (finale) to sunlight breaking through (ending). Swordcat's holy glow is the only *warm light source* in the cold biomes, which makes her read as a little lantern of hope.

---

## 13. UI style — cute medieval parchment with pink accents [PROPOSED]

**Fonts** (Google Fonts):
- Titles: **Cinzel Decorative** 700.
- UI and dialogue: **Fredoka** 500/600 (rounded, cute).
- Lore scrolls and quest text: **IM Fell English** (italic for quotes).

**Panel recipe** (pure CSS, no image assets):

```css
:root{ --parch:#F4E7C9; --parch2:#E8D5AA; --edge:#B08A55; --ink:#3A2A1F; --ink2:#6B5443;
       --pink:#F2A2B8; --pinkDeep:#D9668A; --gold:#D9B26A; --goldDeep:#A87C32; --steel:#AEB6C1; --red:#A3202C; }
.panel{ color:var(--ink); font-family:'Fredoka',system-ui,sans-serif; border-radius:16px;
  background:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/><feColorMatrix values='0 0 0 0 .45  0 0 0 0 .33  0 0 0 0 .2  0 0 0 .18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
    radial-gradient(120% 90% at 50% 40%, var(--parch) 55%, var(--parch2) 85%, #D1B47F 100%);
  border:3px solid var(--goldDeep); outline:2px solid var(--gold); outline-offset:-9px;
  box-shadow:0 6px 0 #6B4A2B33, inset 0 0 40px #B08A5560; }
.btn{ background:linear-gradient(#F7B6C8,#E88AA6); color:#fff; border:2px solid var(--pinkDeep);
  border-radius:999px; text-shadow:0 1px 0 #B0506F; box-shadow:0 3px 0 #B0506F; }   /* ribbon/candy button */
.btn:hover{ filter:brightness(1.06); transform:translateY(-1px); }
.title{ font-family:'Cinzel Decorative',serif; color:var(--gold); text-shadow:0 2px 0 var(--goldDeep), 0 0 18px #FFE3A388; }
```

**HUD layout:**

| Position | Element | Details |
|---|---|---|
| Top-left | portrait | round gold frame with Swordcat in the Oath pose and a pink bow peeking over the frame |
| Top-left | hearts | a row of hearts `#F0668E` with white highlight; half-hearts allowed; they wobble when hit and pulse `#E04646` when low |
| Top-left | **Valor meter** | sword-shaped bar: a silver blade fills from the hilt and turns gold `#FFE3A3` with sparkles when full, which enables Holy Strike |
| Bottom-right | companions | round portraits with radial cooldown rings in their signature colours (Mochi blue, Sage green, Clover cream, Earl Grey purple, Pip red) |
| Top-right | minimap | round parchment with an ink-wash map, a compass rose and the player shown as a paw icon |
| Bottom-centre | dialogue | parchment scroll with curled ends (CSS pseudo-elements). The speaker's name sits in a **pink ribbon banner** and the portrait on the left. Text types on; a bouncing paw prompts "next" |
| World space | damage numbers | Fredoka 700, white with an ink outline; crits in gold with a sparkle; heals in green `#7FD38A` |
| World space | interaction prompts | small parchment tag with the key glyph on a wax seal |

**Wax seals** (pink `#D9668A`, embossed paw print) are used for confirm buttons, save icons and quest-complete stamps.

**Title screen:** Swordcat in the Oath pose with full holy glow in the misty meadow, slow camera push-in, logo "SWORDCAT" in Cinzel Decorative gold with a tiny pink bow tied on the "O".

Iconography uses an ink-line style (2px `--ink`, round caps) with flat parchment fills and a single pink or gold accent. Use the mid-day misty palette in menus. No sci-fi glows except the holy gold.

---

## 14. Performance budget (target 60 fps desktop, 30+ on mid mobile)

| Item | Desktop | Mobile |
|---|---|---|
| Fur shells (hero / kittens / far) | 16 / 10 / sheen | 8 / sheen / sheen |
| Grass blades | 60k | 15–20k |
| Draw calls | < 300 (instance rivets, grass, spines, sparkles; merge static props with `BufferGeometryUtils.mergeGeometries`) | < 150 |
| Shadows | 2048 directional + blob decals | blob decals only |
| Post | MSAA4 + Bokeh + Bloom (half-res) + Output + Vignette | Bloom (quarter-res) + Output + Vignette |
| Transmission (slimes) | ≤ 6 on screen | opacity fallback |
| Pixel ratio | min(dpr, 2) | min(dpr, 1.5) |

## 15. Do / Don't

- **Do:** keep fog everywhere because it *is* the ref look. Use soft overcast light, rim light on every furry thing, polished steel with dark gaps, warm saturated hero against a cool muted world, round shapes, big eyes with two catchlights, and a pink bow in every shot of Swordcat.
- **Don't:** use hard black shadows, pure saturated green grass, ink outlines (the refs are soft and painterly-photographic), blood or gore, pink on enemies, or a sky that does not match the fog colour at the horizon.

Optional downloads: CC0 overcast or foggy HDRIs (Poly Haven) and ground or stone textures (ambientCG) can replace the procedural env and textures later. No specific files have been chosen or verified yet, and everything above works without them.
