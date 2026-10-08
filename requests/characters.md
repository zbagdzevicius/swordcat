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
- Easiest: `const view = new KittenView(ctx, cfgOrCatId, { actor, parent?, pose?, expression?, memeCam? })` — parents
  the kitten under `actor.object3d`, follows core's quality preset (`QUALITY.furShells` hero / `kittenShells` others),
  honours hitstop / pause / slow motion (`visualDt`), drives wind; `view.bindScripted()` wires onPose / onEmote / onProp.
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
