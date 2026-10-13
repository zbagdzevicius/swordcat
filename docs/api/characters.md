<!-- Archived from requests/characters.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/characters.md; applied ones are summarised in requests/RESOLVED.md. -->

# Requests / notes from the characters area

## M1 pass 2 (2026-10-08 evening) — what changed for everyone
- **Cape renders on a finer grid.** The 9 x 13 verlet particles now drive a 33 x 25 render mesh (Catmull-Rom), which
  adds soft vertical folds, gathered pleats under the neckline, a wavy hem and a baked fold shade (`capeAO` attribute,
  applied to all the light; overcast light from above gave vertical folds no shading). It no longer reads as a flat
  board from the follow camera. `HeroCape.rc / rr` = render grid size, `cape.vertexIndex(col, row)` maps a sim
  particle to its render vertex; `cape.geo` is the render geometry, `cape.sim.p` the particles (unchanged). NPC sway
  capes use the same fine grid. The folds only billow outward, the top corners sit on the shoulder blades just behind
  the pauldrons (top 0.30 → hem 0.60 H, more V-frame), and the colliders now include shins + sabatons: no armour pokes
  through the cloth in vigil / idle / ready / kneel (unit-tested; `node --import ./tests/unit/_setup.mjs
  src/characters/tools/capeclip.mjs <pose>` reports it per pose). Cloth takes half the character env map (it glowed like
  paper at night); faded cream is a touch warmer (`#CDBB98`).
- **Ears read as ears.** Bigger (×1.28), more upright (25° instead of 30°), set a little higher and wider; the ear tufts
  are 4 shorter cream wisps per ear. Tips are still ~1.0 H. Cheek ruffs are flatter front-to-back and sit further back
  (`FACE.cheek`, new `FACE.cheekScale`), so the eyes show in profile; Swordcat's cheek fluff is 0.97 (was 1.04).
- **Triangles:** hero 196k → 164k, companion-tier kittens 128k → 94k (head-fur segments per tier, tail tube, pauldron
  lames). Lite tier unchanged (~13k). Fur shells still follow `QUALITY.furShells` / `kittenShells`.
- **To player** (requests/player.md, cape pins after a teleport): fixed on our side. `Kitten.simulate` now calls
  `root.updateWorldMatrix(true, true)` (parents first), so the cape pins and colliders see this frame's actor transform.
  Your `actor.object3d.updateWorldMatrix(true, false)` workaround is harmless and can stay or go.
- **New prop `helmet`** (CS-01 shot 7, Marmalade's far-too-big old helm): `prop('helmet', true)` puts it on her head,
  over her eyes; `prop('helmet@paw', true)` moves the same helm into her left paw ("she takes it off, looks at it");
  `prop('helmet', false)` removes it. **Any prop name accepts a `@mount` suffix** through the plain ScriptedActor
  `prop(name, on)` (core's prop() has no opts): `'letter@belt'` (CS-06), `'helmet@paw'`. One object per base name.
- To enemies: the carried-cage issue below is **resolved** (tests/shots/characters/cast-cs02.png: Pearl's cage hangs
  from the hyena's fist). Thanks.

## M1 changes everyone should know (2026-10-08)
- **Shell fur is alpha-blended now** (was alpha-to-coverage: the dithered strand tips read as salt-and-pepper speckles
  against the bright fog). Fur meshes are `transparent`, depth-writing, drawn in instance order (skin → tip) with
  `renderOrder` bib 0.6 → tail 0.7 → head 1; ear/cheek tuft cards 2 and whiskers 2 (no depth write). If you draw
  transparent effects that must sit OVER a kitten (sparkles, aura, speech bubbles), give them `renderOrder >= 3`.
- **The character environment map needs no glue any more**: every kitten body mesh reports the renderer + scene that
  draw it (`onBeforeRender`), and the next `Kitten.simulate()` rebuilds the overcast PMREM from that scene's live
  hemisphere / strongest directional light / fog (art.md §4.1), with readability floors so the plate stays silver at
  night (`CHAR_ENV`). Works the same in the player's SwordcatModel, companions' KittenVisual, KittenView and the preview.
- **Capes never wrap in front of her**: a body half-space keeps the verlet cloth behind her (spins, 180° turns, spawn
  facing set after the first frame — that one left the cream cape wrapped around her right side in game), and a root
  yaw jump > 1.2 rad in one frame re-drapes it. Soft folds + a rounded hem are added at write time (`capeFold`).
- Meme Cam: `KittenView.setMemeCam(true)` now also locks the cape sway to `ctx.cam.memeT` (requests/camera.md).
- Visual randomness (idle phase, ear twitches, blinks) is seeded per cat id: identical cats animate identically, which
  keeps screenshots deterministic. No `Math.random` left in src/characters (except the dev-only preview page).
- Smoke/test handle: `anyKittenRoot.userData.kitten.constructor.lib` = `{ buildKitten, buildProp, buildCage,
  buildBeastHead, buildPlate, CATS, catConfig, SQUIRE_IDS, cagedKitten, characterEnvColors, getCharacterEnvMap, ... }`
  (tests/smoke/characters.mjs uses it; it works against the bundled game where /src imports don't exist).

## [RESOLVED] To enemies — the carried cage (CS-02 `cage: 'pearl'`) hangs INSIDE the hyena's body [found 2026-10-08]
- `ctx.enemies.spawn('hyena', at, { scripted: true, ai: false, cage: 'pearl', word: 'HATER' })`: `e.extraProps.cage`
  ends up at the body centre (local x ≈ 0.02 m, y ≈ 0.49 m on a 1.35 m hyena facing the camera), so neither the cage nor
  Pearl is visible (tests/shots/characters/cast-cs02.png). The left fist is ~0.3 m to the side. Probably `posIn(m.root,
  hand)` runs before the clone's skeleton matrices are current; `m.root.updateMatrixWorld(true)` first, or our
  `dress.hold(cagedKitten(...).root, 'l', { p: [0, -0.86, 0.06] })` / `holdOnBone(model, obj, 'handslot.l', CARRY.cage)`
  (scale-compensated) should put it under the fist.

## To camera — MEME_LOOP framing, FYI (no change requested; §5.2 numbers are binding)
- In the Gecko reference frames (research/videos/frames/x_GeckoTerminal_*_f1–f3) her head (ear tip → chin) fills
  ~35–40 % of the frame height; with (0.06, 0.70, 1.15) → (0.03, 0.82, 0) at FOV 32 it fills ~55 %. If the shot reads
  too tight when you tune it side by side, ~1.5 m distance matches the clip.

## To world (Grass.js) and anyone writing custom ShaderMaterials — NaN with MSAA + bloom [found 2026-10-07]
- The art.md §9.3 grass fragment shader does `pow(vH, 1.3)`. With MSAA render targets (PostFX Med/High: HalfFloat, samples 4)
  the varyings are extrapolated at sample positions outside the triangle, `vH` goes slightly negative, `pow(negative, x)`
  is NaN on D3D11/ANGLE (Iris Xe), and UnrealBloom spreads the NaN over the WHOLE frame: the screen shows only the
  clear/background colour. Reproduced in src/characters/preview.html (fixed by `pow(max(vH, 0.0), 1.3)`).
- Rule of thumb: clamp every `pow()` base (`max(x, 0.0)` / `saturate`) and guard every `normalize()` of an interpolated vector.
  (core has since sanitised the bloom input — thanks — the NaN pixel itself still renders wrong.)

## How to use src/characters (player, companions, enemies, story, fx, world)
Import only from `src/characters/index.js`.

### Kittens (player: SwordcatModel, companions: Companion / NpcActor / LostKitten / HubKittens / SpoonBrigade)
- Easiest: `const view = new KittenView(ctx, cfgOrCatId, { actor, parent?, pose?, expression?, memeCam?, glance? })` — parents
  the kitten under `actor.object3d`, follows core's quality preset (`QUALITY.furShells` hero / `kittenShells` others),
  honours hitstop / pause / slow motion (`visualDt`), drives wind; `view.bindScripted()` wires onPose / onEmote / onProp.
  Idle camera glance (`GLANCE`, default on for the player): after 2.5 s still in pose `'idle'` (unscripted, grounded,
  no Meme Cam) she looks over her shoulder toward `ctx.camera` (up to 75°, head + chest, chin up, pupils) for 2-3.4 s,
  every 3-6 s; applied additively in `view.simulate()` after all animator layers; state in `view._g`.
  Mesh detail follows `QUALITY.charDetail` (Low 0.55: armour / body / head-fur / eye / bow tessellation) and is read
  when a cat is BUILT: a quality change applies to cats built afterwards. Skinned fur bakes only the shells the
  preset draws (Low: the base layer) and re-bakes on the first request for more. With shadows off the shadow proxy
  is hidden. `setCharDetail(k)` / `charDetail()` for tools; smoke `characters:low-budget` holds the phone budgets.
  Per frame `view.render(frameDt)`, or `view.animate(frameDt)` → your joint offsets → `view.simulate()`.
- Raw: `const k = buildKitten(cfg)`; add `k.root` under your `actor.object3d` (origin at the feet, faces +Z, 1 unit = H).
  Configs: `swordcatConfig({ cape: 'cream' | 'red' | ..., armour, bow, sword })`, `CATS[id]` (every named cat, old knights),
  `lostKittenConfig(id)`, `villagerConfig(seed)`, `squireConfig(i)`, `spoonBrigadeConfig(id, i)`, or `catConfig(anyId)`.
  Prologue CS-01 shots 1–4: `CATS.swordcat_tunic` (no bow, no armour); shot 5+: `swordcat_tunic_bow`; after CS-01 `swordcat`.
- Per frame: `k.update(dt, { velocity, wind, frameId })`. If you layer your own joint animation (run cycles, swings), call
  `k.animate(dt)` → write your offsets onto `k.rig.*` (multiply quaternions) → `k.simulate(dt, { velocity, wind, frameId })`
  (cape, fur drag, eyes, bow, props, env map). `velocity` is world m/s (fur trails, cape speed); `wind` defaults to `FUR_WIND.value`.
- Contract: `setPose(name, { blend })` for 'vigil','oath','sip','selfie','faint','kneel','sit','sleep','idle'
  (+ 'ready' combat base, 'guard' = vigil, 'cheer', 'hug', 'selfie_sit'); `setHoly(0..1)`; `setExpression(name)`
  (neutral, worried, earnest, determined, happy, surprised, sad, glisten, sleepy, sleep, faint, grumpy, angry, smug).
  Wire core/ScriptedActor hooks: `onPose → k.setPose`, `onEmote → k.emote` ('earsFlat','tailPuff','blink','nod','shake',
  plus 'meow','sneeze','bowBounce'), `onProp → k.setProp(name, on)` ('milk_cup','lantern','spoon','letter','pot_helm';
  `setProp('letter', true, { at: 'belt' })` for CS-06).
- Rig (`k.rig`): THREE.Bone joints `body` (squash pivot at the feet), `hips`, `chest`, `head`, `mouth`, `earL/earR`,
  `shoulderL/elbowL/pawL`, `shoulderR/elbowR/pawR` (= `swordHand`), `thighL/kneeL/footL`, `thighR/kneeR/footR`,
  `tail[0..5]`; plus `swordSocket`, `capeAnchor`, `bowAnchor`, aliases `armL/armR/legL/legR`; `k.rest[name]` = rest TRS.
  Bones hang along local −Y; +X pitch swings a limb BACK, −X forward; positive Y yaws toward her left (+X).
- Sword: `k.sword` → `{ group, tip, mid, grip, pommel, setCharge(0..1), setValorGlow(0..1) }` (`tip` for SwordTrail).
  Skins: `k.setSword('borrowed'|'twig'|'fishbone'|'baguette'|'dawnblade')`; GLB skins `k.setSword({ skin: 'diamond', model })`
  / `'toobig'` with your fitted model (`mountModel` aligns it).
- Cape: `k.setCape('cream'|'red'|'memeWhite'|'blue'|'green'|'midnight'|'gold'|null)`. Meme Cam: `view.setMemeCam(on)`
  (or `k.setCapeMode('sway', { blend: 0.3, period: 3.8, gustPeak: 1.2 })` / `k.setCapeMode('verlet', { blend: 0.6 })` and
  `k.cape.setSwayTime(t)` yourself). After teleports / cuts call `k.snap()` (big jumps and facing snaps are also detected).
- Fur quality: KittenView follows core's preset; raw kittens: `setFurQuality({ hero, kitten, npc })` or a name
  ('ultra'|'high'|'med'|'low'|'off'); per kitten `k.setFurShells(n)`. Fur LOD by camera distance is automatic (full shells
  < 5 m, base layer only > 12 m); the shader fades strands into a soft volume when they get smaller than a pixel.
- Hurt blink / poof flash: `k.setFlash(0..1)`. Dispose: `k.dispose()`.
- Draw calls: hero ≈ 18, companion ≈ 12, lite (villagers, lost kittens, squires, old knights, riders) ≈ 3–4.

### Beast heads + plates (enemies)
- `dressBeast(fittedKayKitClone, 'hyena'|'stealer'|'pilfer'|'cacklejaw'|'pug'|'brutus'|'barkus', { seed, word })` =
  head + plate word + `hold(prop|'cage', 'l'|'r')`; or the parts:
- `const head = attachBeastHead(fittedKayKitClone, 'hyena'|'pug'|'bulldog', { headNode, mane, chippedEar: 'left', scar,
  jowls, underbite, eyepatch, hornedHelm, scale, lift })` — hides the KayKit head mesh and parents to bone `head`.
  Call it on the fitted clone in bind pose (before the mixer runs). `head.update(dt)` per frame;
  `head.setExpression('neutral'|'sneer'|'angry'|'laugh'|'sad'|'surprised'|'kneel')`; Barkus P2: `head.setHelm(false)`.
- `attachPlate(model, word, { seed, style: 'rusty'|'iron'|'black' })` → rusty breastplate with the scratched word on bone
  `chest` (words: `PLATE_WORDS`, or `pickPlateWord(ENEMIES.hyena.plateWords, seed)`); MedievalSharp loads on demand.
- Jester / postmaster hats for beast heads: `buildProp('jester_hat', { size: headWidth })`.

### Props and cages (story / world / companions)
- `buildProp(name, opts)` for 'milk_cup','milk_bottle','lantern' ({ light: true } adds PointLight #FFC46B 1.5 d6),
  'spoon','letter','pot_helm','colander','signpost','post_bag','cot','soup_bowl','jester_hat','postmaster_hat','cage','helmet'.
- `buildCage({ style: 'carry'|'hanging'|'cart'|'kennel', size, ribbon })` → `userData.setOpen(0..1)`; Pearl's cage:
  `ribbon: true` (pale pink bow). `cagedKitten(ctx, catId, { style, ribbon })` = cage + a sad kitten inside, `release()`.

### To fx (HolyFX)
- `k.setHoly(v)` already drives the character side of the holy ladder: fur gold rim, armour glow, the back-faced aura
  hull around head + torso (art.md §10.2) and the blade emissive + a narrow white-gold streak (`STREAK`). HolyFX only
  needs sparkles, the point light and bloom. Note: with physically-correct lights a `PointLight('#FFD38A', 2.2 * charge, 3)`
  0.3 m from her face blows the fur out to white — ~0.5–0.6 intensity (decay 2) placed ~0.5 m away reads like ref1.

### To world (Env)
- Nothing needed for lighting: fur, kit materials and the character env map follow the scene's hemisphere /
  directional / point lights and fog by themselves. Env already writes the wind into `FUR_WIND.value` — thanks.
- Characters' materials accept a patch hook: `registerMaterialPatcher((mat) => withHeightFog(mat))` applies height fog
  to every material we create (fur shells are ShaderMaterials with the standard fog chunks).


---

# M2 notes (archived from requests/characters.md by the M2 integration pass, 2026-10-09)


The M1 API notes of this area are archived in `docs/api/characters.md`; what core applied is in `requests/RESOLVED.md`.

## M2 (2026-10-09): what characters added, and what other areas can now use
All additive; nothing renamed. Import from `src/characters/index.js` only.

### Resolved on our side (please close)
- **requests/fx.md + requests/player.md — first-use shader stalls (aura hull, blade streak, Dawnblade sparkles):**
  every `KittenView` now runs a one-frame warm-up after it is built, on every `level:loaded` and on every
  `game:quality`: the hidden aura hull and streak are shown for that frame with an empty draw range (the FX trick), so
  the real renderer (level fog + lights, composer target) compiles them under the loading veil, and a
  `ctx.game.addFrameHook` restores them after the frame. Smoke `characters:warm`: renderer programs 90 → 90 on the first
  Holy charge. The fur gold rim and blade emissive are plain uniforms (no program change). Raw kittens:
  `k.warmBegin()` before a render, `k.warmEnd()` after; `k.warmObjects()` lists them.
- **requests/world.md — hero fur cost (part we own):** the fur distance LOD is now `FUR_LOD = { near: 2.6, far: 8,
  min: 4 }`. Close-ups and Meme Cam keep all shells. The follow camera (3.6 m) draws 13 of 16 hero shells (about −19 %
  head-fur tris), lock-on about 10, boss framing about 6, and nothing past 8 m except the base layer. The Med preset
  numbers (`QUALITY.med.furShells 16`) are core's; lowering them is the remaining lever if the §18 budget still needs it.

### To companions (SpoonBrigade.js / HubKittens.js)
- `catConfig('spoon_<kittenId>')` (or `'spoon:<kittenId>:<i>'`) = `spoonBrigadeConfig(kittenId, i)`: the kitten's own
  coat, lite tier (sheen fur, about 4 draw calls), a pot helm or colander, a spoon in the right fist, and the
  `spoonReady` stance. `kitten.emote('throw')` is a 0.5 s overarm lob. Launch the spoon projectile at
  `EMOTE_RELEASE.throw` (0.42) × `EMOTE_DUR.throw`. `NpcActor` / `spawnNpc('spoon_tater', …)` already work.
- `catConfig('hub_<kittenId>')` = `hubKittenConfig(kittenId)`: lite tier, happy, with its §12.5 activity from
  `HUB_ACTIVITY[kittenId]` = `{ pose, prop?, world?: [propNames], run?, mirror?, within?, every?, look?, note }`.
  - Poses: `fish`, `read`, `wave` (waves on its own), `nap`, `sit`, `vigil`, `idle`.
  - Props in paw: `fishing_rod` (with its own float bob), `book@upsidedown` (Juniper), `hammer`, `letter`, `spoon`.
  - World props for you to place: `bread_basket` (Pickles), `teacup` (Sprout), `butterfly` (Bramble; it flaps by
    itself through `userData.update(dt)`).
- New poses for anyone (`setPose` / ScriptedActor `pose()`): `wave`, `read`, `fish`, `aim` (Sage's bow draw), `heal`
  (Clover's staff raised), `spoonReady` and `nap` (= sleep). `EXTRA_POSE_NAMES` lists them all. New emotes: `wave`
  (1.2 s) and `throw` (0.5 s).
- A config's own `expression` now wins over the pose's default expression when a kitten is built (before this, every
  cat started with its pose's face, for example idle → neutral).

### To enemies (B1 Grizzlechop, §11.2)
`buildProp(name, opts)` adds these, each one mesh on the shared kit material. Sizes are in metres.
- `feathered_hat` — `{ size }` = brim diameter, default 0.42. Origin at the brim centre, front +Z. CS-05 knocks it off.
- `cheese_shield` — `{ r = 0.45, width = 0.12 }`, `#E8C35A`, face +Z. Hang it on `FrontLeg.L` with `holdOnBone`.
- `cheese_wheel` — the toss: r 0.45, axis X. `cheese_wheel_giant` — the phase-2 ride: r 0.8, width 0.6, with axle pegs.
  Both have `userData.roll(distance)`.
- `cheese_wedge` — the Snack; `userData.bite(0..1)` shrinks it.

The other beast looks (`hyena`, `stealer`, `pilfer`, `cacklejaw`, `pug`, `brutus`, `barkus`) are unchanged in
`dressBeast` / `BEAST_LOOKS`.

### To player / ui / save (§13.4–13.5)
- All 7 sword skins render: `borrowed`, `twig`, `fishbone`, `baguette`, `diamond` (GLB), `toobig` (GLB) and `dawnblade`.
  - GLB skins mount at the model's own crossguard and orient themselves tip-up (`mountModel` uses `flip: 'auto'`).
  - `sword.tip` sits at the model tip, so trails and hit points follow it.
  - `toobig` restyles the Quaternius claymore's red parts to steel. Its tip drags on the ground in every standing pose
    (visual only, in `Kitten.simulate`).
  - `dawnblade` adds 20 additive twinkling sparkles (`DAWN_SPARKLES`, 1 draw call) on top of its permanent gold emissive.
- All 7 capes render: `cream`, `red`, `memeWhite`, `blue`, `green`, `midnight` and `gold`. `midnight` is now the §13.3
  `#22242A` (it was a bluish `#262A44`). The bow stays pink on her left ear with every cape (unit test + smoke).

### Look changes (M2 cast)
- **Sage:** a real pointed hood. It frames the face with an oval opening and a rolled hem, the ears poke through, the
  bent tip droops back, and a leaf-cut capelet sits over the shoulders. Her short recurve bow has a grip wrap and string.
- **Clover:** a white coif that frames the face (it covered her whole face before), a pink trim, a short veil down the
  back, and a bigger brass bell that now shows at the collar.
- **Tofu:** a far-too-big smith's apron with a bib, neck strap, waist tie and a pocket with a hammer. The soot smudge
  now sits on her right cheek where it can be seen.
- **Mochi:** he reads correctly from the front under day light (`uSheen` 0.09, ambient ×2.4; screenshot
  `tests/shots/characters/m2-companions.png`). His back view in D-01 was not re-checked in M2.


<!-- Archived from requests/characters.md at the controls-rework integration (2026-10-11); applied items are in requests/RESOLVED.md. -->

## Controls rework (research/CONTROLS_SPEC.md §3, §7.4, §12 characters) — landed in `src/characters/**`

New API (all exported from `src/characters/index.js`, also on `Kitten.lib` for smoke):

| Call | What it does |
|---|---|
| `getSilhouetteProxy(target)` / `view.getSilhouetteProxy()` / `dress.getSilhouetteProxy()` | The x-ray proxy: ONE hidden `SkinnedMesh` under the actor (per-bone PCA ellipsoids + ears + bow + sword / weapons / helmets; no fur, no cape), material `depthFunc: GreaterDepth`, no depth write, no fog, `raycast` disabled. Its depth is pulled toward the lens (0.45 m for her, up to 1.0 m for long beasts), so it only shows through real occluders, never through the actor's own limbs. Detached / hidden parts (dropped helmet, swapped sword) collapse on the next draw; a sword / prop swap rebuilds it **in place** (keep the handle). `target` = actor, KittenView, Kitten, beast dress or Object3D. |
| `setXray(target, on, { color, alpha })` / `view.setXray(on, o)` | Show / hide + tint. Defaults: her `#FFE4EC` @ 0.55 (`XRAY`), enemies @ 0.45 (pass the telegraph colour). |
| `setHighlight(target, color \| null, strength = 1)` | Hover / selection rim (§7.4). Kittens: rim uniform in the kit + fur shaders (a cat on the shared kit material gets its own clone, same program). Other models: emissive on per-instance clones (`userData.assetOwned`, original emissive restored on `null`). |
| `ringAnchor(target, out?)` → `{ pos, radius }` | Ground point under the body + ring radius for the hero / selection rings. |
| `topTint(root, color?, { match, perInstance })` | Contrasting colour on the upward-facing faces of helmet meshes (names matching helm / hat / hood / kettle by default). Shared materials: one cached clone per (material, colour). Per-instance materials (`userData.enemyOwned` / `assetOwned`, or `perInstance: true`) are patched **in place**, so `flashMaterials` / `disposeInstanceMaterials` still own them; same program key either way. Idempotent. |
| `updateReadability(ctx)` | Called by `characterFrame` each frame: `TOP_VIEW` (0..1 from the lens → focus distance, 9 → 10.5 m) and `FUR_VIEW` (fur LOD from `cam.focus`). |

Readability from above (automatic, faded in by `TOP_VIEW`, so close-ups / cutscenes / Meme Cam / `?cam=classic` keep the
M1/M2 look): bow ×1.25 + 0.08 self-light (still pink, still on the LEFT ear), ears ×1.1, a 2 cm lighter cape-tip trim,
a little silver self-light on the blade. Barkus' horned helm has a pale crown. Fur LOD in iso: her shells stay full
within 25 m of the lens; other cats ramp by distance from `cam.focus` (5 → 14 m) and drop one furShells tier while the
lens is > 12 m from the focus (`FUR_LOD_ISO`). Bow / tuft / blade materials now call `own()` after their shader hook,
so world's fog patcher (C4 focus fog) wraps them instead of being replaced.

### → camera (P1 / Occluders)
1. The iso detection reads `ctx.cam.focus` (a `THREE.Vector3`) and `ctx.cam.modeName ∈ {follow, lock, boss}`, plus
   `ctx.params.cam !== 'classic'`. Please keep `modeName` as the gameplay mode name in the iso rig (it is `'follow'` for
   all three today) and `focus` a live Vector3; otherwise fur falls back to the lens rule (shells off at 13 m).
2. X-ray pass: call `characters.setXray(actor, on, { color, alpha })` (or toggle `getSilhouetteProxy(actor).visible`)
   instead of drawing your own pass; the proxy is already in the scene under the actor. Her proxy is prebuilt at level
   load and warmed; enemy proxies build lazily (~5–15 ms each): call `getSilhouetteProxy(e)` on engage if you want it
   off the frame where the wind-up starts.

### → enemies
3. Call `characters.topTint(e.visual)` once the gear is on (kettle helms, `Knight_Helmet`, feather hats), or pass the
   helmet mesh root. Call it after `markOwned(m.scene)`: owned materials are then patched in place (hit flash and
   dispose keep working per instance) and the whole pack still shares one program.

### → ui / player (hover, selection)
4. On hover change call `characters.setHighlight(prev, null)` then `setHighlight(actor, '#FF6A3D' | '#FFD34D' | '#FFFFFF')`
   (enemies / interactables / NPCs and kittens, §7.4). Cheap to call every frame (idempotent).

### → fx (GroundDecals)
5. Hero ring / selection ring centre and radius: `characters.ringAnchor(actor)`.

### → core
6. Optional: mirror `READABILITY`, `XRAY`, `FUR_LOD_ISO` into `config.CAMERA.iso` (§13 "no literals"); characters
   reads `config.CAMERA.iso.lodFromFocus === false` to disable the focus LOD today and will read the rest when it lands.

## PERF §1.2: character program consolidation
- `makeToonMaterial` uniforms (no key variants any more): `topGlow` → `userData.mc.uTopGlow`, new `selfLight` →
  `uSelfLight`, Readability's helmet top tint → `uTopColor` / `uTopMix` in `userData.uniforms` (`topTintMaterial` on a
  toon material only writes them; pooled materials reset them in `getToonMaterial`).
- The blade is WarmToon for every skin (its geometry's `rmse.y = 1` shades steel with the matcap in-draw); the bow is the
  shared toon program, FrontSide with mirrored back faces (`Bow.withBackFaces`). Cape sway is the `uCapeSway` uniform
  (`sc-cape-v7`, one cape program).
- `flatPatch.js`: outline hulls and x-ray proxies share ONE program (`sc-flat-v1`, `uFlatMode` 0 = outline, 1 = x-ray,
  `uFogK`); `setOutlineAlpha` switches blending with transparency. Eyes, glints, contact blobs and whiskers are
  `fxBasicMaterial`s; aura, holy streak and Dawnblade sparkles are fx modules. The shadow proxy lives on core's
  `SHADOW_ONLY_LAYER` with the shared skinned kit material. Beast brows are vertex-coloured kit geometry.
