# Requests / notes from the characters area

## To world (Grass.js) and anyone writing custom ShaderMaterials — NaN with MSAA + bloom [found 2026-10-07]
- The art.md §9.3 grass fragment shader does `pow(vH, 1.3)`. With MSAA render targets (PostFX Med/High: HalfFloat, samples 4)
  the varyings are extrapolated at sample positions outside the triangle, `vH` goes slightly negative, `pow(negative, x)`
  is NaN on D3D11/ANGLE (Iris Xe), and UnrealBloom spreads the NaN over the WHOLE frame: the screen shows only the
  clear/background colour. Reproduced in src/characters/preview.html (fixed by `pow(max(vH, 0.0), 1.3)`).
- Rule of thumb: clamp every `pow()` base (`max(x, 0.0)` / `saturate`) and guard every `normalize()` of an interpolated vector.
  (core has since sanitised the bloom input — thanks — the NaN pixel itself still renders wrong.)

## How to use src/characters (player, companions, enemies, story, fx, world) — 2026-10-07
Import only from `src/characters/index.js`.

### Kittens (player: SwordcatModel, companions: Companion / NpcActor / LostKitten / HubKittens / SpoonBrigade)
- `const k = buildKitten(cfg)`; add `k.root` under your `actor.object3d` (origin at the feet, faces +Z, 1 unit = H).
  Configs: `swordcatConfig({ cape: 'cream' | 'red' | ..., armour, bow, sword })`, `CATS[id]` (every named cat, old knights),
  `lostKittenConfig(id)`, `villagerConfig(seed)`, `squireConfig(i)`, `spoonBrigadeConfig(id, i)`, or `catConfig(anyId)`.
  Prologue CS-01 shots 1–4: `CATS.swordcat_tunic` (no bow, no armour); shot 5+: `swordcat_tunic_bow`; after CS-01 `swordcat`.
- Per frame: `k.update(dt, { velocity, wind, frameId })`. If you layer your own joint animation (run cycles, swings), call
  `k.animate(dt)` → write your offsets onto `k.rig.*` (multiply quaternions) → `k.simulate(dt, { velocity, wind, frameId })`
  (cape, fur drag, eyes, bow, props). `velocity` is world m/s (fur trails, cape speed); `wind` defaults to `FUR_WIND.value`.
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
- Cape: `k.setCape('cream'|'red'|'memeWhite'|'blue'|'green'|'midnight'|'gold'|null)`. Meme Cam: `k.setCapeMode('sway',
  { blend: 0.3, period: 3.8, gustPeak: 1.2 })` on enter, `k.setCapeMode('verlet', { blend: 0.6 })` on exit, and
  `k.cape.setSwayTime(t)` to lock it to the camera/grass loop. After teleports / cuts call `k.snap()`.
- Fur quality: `setFurQuality('ultra'|'high'|'med'|'low'|'off')` (core Low → 'low'); per kitten `k.setFurShells(n)`.
  Fur LOD by camera distance is automatic (full shells < 5 m, base layer only > 12 m).
- Hurt blink / poof flash: `k.setFlash(0..1)`. Dispose: `k.dispose()`.
- Draw calls: hero ≈ 16, companion ≈ 12, lite (villagers, lost kittens, old knights, riders) ≈ 3–4.

### Beast heads + plates (enemies)
- `const head = attachBeastHead(fittedKayKitClone, 'hyena'|'pug'|'bulldog', { headNode, mane, chippedEar: 'left', scar,
  jowls, underbite, eyepatch, hornedHelm, scale, lift })` — hides the KayKit head mesh and parents to bone `head`.
  Call it on the fitted clone in bind pose (before the mixer runs). `head.update(dt)` per frame;
  `head.setExpression('neutral'|'sneer'|'angry'|'laugh'|'sad'|'surprised'|'kneel')`; Barkus P2: `head.setHelm(false)`.
- `attachPlate(model, word, { seed, style: 'rusty'|'iron'|'black' })` → rusty breastplate with the scratched word on bone
  `chest` (words: `PLATE_WORDS`, or `pickPlateWord(ENEMIES.hyena.plateWords, seed)`); MedievalSharp loads on demand.
- Jester / postmaster hats for beast heads: `buildProp('jester_hat', { size: headWidth })`.

### Props and cages (story / world / companions)
- `buildProp(name, opts)` for 'milk_cup','milk_bottle','lantern' ({ light: true } adds PointLight #FFC46B 1.5 d6),
  'spoon','letter','pot_helm','colander','signpost','post_bag','cot','soup_bowl','jester_hat','postmaster_hat','cage'.
- `buildCage({ style: 'carry'|'hanging'|'cart'|'kennel', size, ribbon })` → `userData.setOpen(0..1)`; Pearl's cage:
  `ribbon: true` (pale pink bow).

### To fx (HolyFX)
- `k.setHoly(v)` already drives the character side of the holy ladder: fur gold rim, armour glow, the back-faced aura
  hull around head + torso (art.md §10.2) and the blade emissive + streak. HolyFX only needs sparkles, the point light
  and bloom. Note: with physically-correct lights a `PointLight('#FFD38A', 2.2 * charge, 3)` 0.3 m from her face
  blows the fur out to white — ~0.5–0.6 intensity (decay 2) placed ~0.5 m away reads like ref1.

### To world (Env)
- Fur and the kit materials read the scene's hemisphere / directional / point lights directly (no sync needed).
  Optional: write the env wind into `FUR_WIND.value` (world-space vector) so fur and capes follow gusts.
- Characters' materials accept a patch hook: `registerMaterialPatcher((mat) => withHeightFog(mat))` applies height fog
  to every material we create (fur shells are ShaderMaterials with the standard fog chunks).
