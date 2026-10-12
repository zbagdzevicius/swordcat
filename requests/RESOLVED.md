# Requests resolved in the M2 integration pass (core, 2026-10-09)

The M1 request files are archived word for word in `docs/api/<area>.md`, including each area's "How to use ctx.<area>" API notes. The `requests/<area>.md` files now hold only open items.

## Contract changes (all additive)
| Change | Where | Asked by |
|---|---|---|
| `config.COMBAT`, `config.ENEMY_TUNING`, `config.PHYSICS`. The tables moved into `core/config.js`; `combat/attacks.js` `COMBAT`, `enemies/tuning.js` `TUNING` and `physics/Physics.js` `PHYSICS_DEFAULTS` re-export the same frozen objects, so no import changed. The owning areas still author the values. | core/config.js | combat, enemies, physics |
| `config.PLAYER` gained `splashReturnDist`, `splashClearRadius`, `splashCooldown`, `splashLockMin`, `splashLockMax`, `comboGrace` and `autoComboGrace`. `player/tuning.js` already reads config first. | core/config.js | player |
| `disposeInstance(root, { detach, materials })` is exported from `core/Assets.js` and also exposed as `ctx.assets.disposeInstance`. It frees cloned skeleton bone textures and the material clones made by `model()` (`tint` / `cloneMaterials`), which are now tagged `userData.assetOwned`. Used by world `PropActor` (critters), companions `NpcActor` and `Pudding`. `core:leaks` texture growth is now flat (63 → 63 → 63). | core/Assets.js | enemies (+ world leak note) |
| `events.js` JSDoc: `enemy:died` documents `fish, smallHeart, height`; `fx:burst` documents `type, height, dir, helmet`. No new names. | core/events.js | enemies |
| `ctx.companions.markCleared(arenaId)` (idempotent, runs `onArenaClear` on the level's kittens). `Arena.restore()` calls it in place of writing to the Set. | companions, world | world |
| `Projectiles.warm()` runs on `level:loaded` and compiles the bolt, orb, glob and wave programs under the veil for one frame. Counter: `combat.projectiles.warmups`. | combat | world |
| §9.1 token share: when an enemy is granted an attack token and an awake companion is within `COMPANIONS.engage` of her, `targetActor()` returns that companion for this token `COMPANIONS.tokenShare` (20%) of the time (`enemy.shareTarget`, cleared on `releaseToken`). Bosses never share. | enemies/Enemy.js | companions |
| `MemeCamTrigger.canIdleTrigger()` is false while any arena of the level is locked. | player | world |
| LevelKit: every `fade: true` prop collider carries `camFade: true`. Scatter rows accept `fade`, and `stoneRing8` stones are fadeable (`zone.stoneFade`, default true). | world | camera |
| Strings: `toast.exit.mochi` was added and the meadow exit uses `blocked.toast`. `toast.kitten` now reads `({n}/{max})` with the level's count and has `{total}` for n/18. GAME_DESIGN §14 row updated. | story, world, ui | world, STATUS |
| Sir Tallbert collider: the knight's footprint, which followed the sword's box over `g01_mark`, is replaced by a 0.75 m body circle on the plinth. | world/levels/meadow.js | story |
| Mist cards: soft foot (bottom ~30% alpha ramp), so they no longer cut a hard line on sloped ground. | fx | world |
| AudioManager: `'suspended'` / `'interrupted'` after an unlock tries `resume()` at once, then on the next gesture. `'closed'` tears the graph down and gives three a fresh AudioContext, and the next gesture rebuilds it. | audio | core |
| Smoke harness: `t.shot(name, { freeze: true })` holds the sim during the screenshot. | tests/smoke.mjs | player |
| `slice:meadow` opens Mochi's cage one blow at a time with ≥ 0.2 s of sim between blows, and no longer resets `invulnT`. | tests/smoke/slice.mjs | companions |
| Build: three.js is its own `three` chunk (lil-gui / stats stay lazy). The enemies → characters dynamic import is now static, which removes Vite's INEFFECTIVE_DYNAMIC_IMPORT warning. | vite.config.js, enemies/types/kaykitGear.js | STATUS |

## M1 known issues fixed
- **Camera inside the Standing Stones:** the stones are fadeable instanced props now, so the camera fades them instead of showing a flat grey face (`tests/shots/slice/07-stones-fight.png`).
- **Mochi too dark:** dark coats get a sky-sheen fill (`uSheen` 0.09), `ambMul` 2.4 and `rootDark` 0.92. Mochi's coat is now a soft charcoal (`#2A2C34`). Per-cat overrides are `cfg.fur.ambMul` and `cfg.fur.sheen`.
- **Lingering bark:** her kitten reply is dropped when she is more than 10 m from the kitten after the 1.8 s delay. A party bubble hides when its speaker jumps more than 4 m in a frame. The caged Mochi barks at arena waves only within 25 m of her.
- **Toast vs HUD kitten count:** both show the level's n/3.

## Already done before this pass (closed without changes)
- `save:written` and `save:loaded {reason}` (core, M1). ui may drop its `lastSave` poll whenever it likes.
- camera → physics `opts.ignore` / `castIgnore`; tree trunk `camFade`.
- enemies → world crossroads perch on the wall line; `Arena.validPoint` uses `physics.blockedAt`; fence collider tops.
- characters → enemies carried cage; player → characters cape pins; combat → player riposte latch; companions → player valor on props; companions → story bark / rescue strings; world → story `prompt.picnic` / `prompt.interact`; world → ui `showResults`; story → player `setExpression` / `setCapeOverride`.
- The `tufts` NaN bounding sphere and the Cape `vCapeAO` compile error no longer occur. Any `console.error` fails smoke, and the meadow blocks pass.
- `PLAYER_BLOCK` was not added: blocks stay `combat:hit {blocked: true}`, as combat suggested.

## Still open
See `requests/world.md` (enemies `prewarm`, dormant pre-placed enemies, hero fur cost, optional `postfx.setGrade`), `requests/fx.md` and `requests/player.md` (characters first-use shader stalls).

# M2 integration pass (core, 2026-10-09, second part: Acts I–II wired end to end)

The area M2 notes ("How to use …") moved from `requests/<area>.md` to the end of `docs/api/<area>.md`.

## Requests applied
| Change | Where | Asked by |
|---|---|---|
| `Player.applySlow(mul, sec, source)`, `isSlowed()`, `cleanse()` (Clover's mend), folded into `speedMul`; a tumble clears it and no slow lands mid-tumble. enemies' `status.js` fallback switches itself off. | player/Player.js | enemies |
| The Jeer aura radius prefers `enemy.jeerR` (the B2 Jeer Duet's r 10) over `def.jeer.r`. | player/Player.js | enemies |
| Public `player.recomputeMax()` (milkMax / maxHp). | player/Player.js | ui |
| `config.ENEMY_TUNING.m2` adopted (the M2 prose numbers; `enemies/tuning.js` `M2` merges it). | core/config.js | enemies |
| `events.js` JSDoc: `enemy:died` `releases` / `popped` / `size`; `item:stolen` / `item:returned` items (`fish`, `milk`, `pin`, `post_bag`), `thief`, `by`. No new names. | core/events.js | enemies |
| Scripted, AI-less `grizzlechop` type (CS-05 stand-in when the defeated boss is gone). | enemies/scripted/Grizzlechop.js | story |
| Strings `prompt.light`, `grizzlechop.cheese` ("MY CHEESE!" on the parried toss wheel), `toast.chase.restart` (Pilfer's chase restart now toasts). The forge hint uses `tut.pug`, the Lantern Alley lanterns `prompt.light`. | story/strings.js, world/levels/town.js, enemies | world, enemies |
| fx calls from enemies: pug slam → `fx.shockwave` (red wall, same growth as the hit ring), Laugh Quake → `fx.shockwave` (jeer, 8 m/s to 7 m), Gloomjelly landing → `jellySlam`, web glob hit → `web`, cut web → `webCut`. | enemies/types/*.js, enemies/WebPatches.js | fx |
| Standing Ground speeds the mist drift ×2 (Meme Cam keeps its own ×2). | fx/FX.js | player |
| Shops: `audio.shop('open' | 'buy' | 'equip', {station})` and `fx.purchase({el})` on a purchase. | ui/shops.js | audio, fx |
| Double toasts: story's `unlock()` no longer toasts (ui toasts `state:unlock` with the display name); the "Objective complete!" toast is dropped while the HUD objective bar shows it. | story/StoryManager.js, ui/UI.js | ui, world, companions |
| A lit Vigil Stone prompts `prompt.swap` when a swap is possible (E opens the Vigil menu with the kitten swap). | world/VigilStone.js | companions |
| CS-04 shows fx's lantern glow on her held lantern (`fx.lantern('swordcat')`). | story/cutscenes/cs04.js | fx |

## Integration bugs fixed
- **Soft-lock after a level-ending scene:** skipping CS-07 (or waiting out story's results timeout) left the game in mode `cutscene` with nothing playing. `levelResults` now restores the scene's mode only while the scene still runs, and the results card hands back `play` when it closes after its scene ended. (story/cutscenes/cast.js, ui/UI.js)
- **Lost scene triggers:** a level trigger with `play` that fired while another scene was running dropped its scene for good (triggers fire once). It now always calls `story.play`, which queues it. (world/LevelKit.js)
- **CS-04 hand-back camera inside Pudding:** she now ends the scene south of the fire facing up the path, so the follow camera no longer sits inside the sleeping dragon. (story/cutscenes/cs04.js)
- **Cacklejaw read as a bear:** the Barbarian pelt hat sat over the hyena's eyes; `seatHat()` lifts it onto the beast head (B2, its clones' base and the CS-02 actor). (enemies/types/kaykitGear.js)
- **§18 draw calls:** lost kittens and their cages / hiding props beyond what the fog lets through (max(40, 2 / fog density) m) are not drawn. Forest start 168 → 129 scene calls, town 110, gate 92 (Med). (companions/LostKitten.js)
- Smoke races: `camera:boss-frame` waited on B1's `boss:start` for B2; `fx:m2-line` and `save:autosave` assumed session counters / save reasons that M2 changed.

## New smoke: the M2 playthrough (`tests/smoke/flow.mjs`)
`flow:forest` → `flow:town` → `flow:gate` play the §19.10 exit path through the real triggers (no `story.play` fallbacks): the meadow exit, Sage's rope posts cut by swings → D-02, the camp trigger → CS-04 (night), the mill arena → B1 fought down with real hits (god) → CS-05, the forest exit; Bakery Street → D-03 → Pilfer's chase (3 hits) → CS-06, Tofu's Meow → D-04, the three lanterns, the Square's 5 waves → the giant Gloomjelly → Earl Grey → D-04, Clover's stocks (E) → D-04, the steps → CS-07, a Satchel bought at the bakery station (E), the Quest Board (E) → travel to the gate; the war-wagon (3 blows) → D-06, the battlefield → "Back to the Line!", the marker → The Line (real repair, waves fought) → CS-08 → G-02 → 100 % → B2 fought down → CS-09 → CS-10 → the grey hub.

# Controls rework integration (core, 2026-10-11: research/CONTROLS_SPEC.md wired end to end)

The camera, input, player, physics, fx and ui parts of the spec had not landed (only characters, companions and part of
enemies / combat had); the integrator built them. Everything below is live in the default game; `?cam=classic` keeps the
M1/M2 orbit camera, lens fog, pointer lock and the old binding table.

## Contract changes
| Change | Where |
|---|---|
| `CAMERA.iso`, `NAV`, `AIM`, `TOUCH`, `HAPTICS`, `INPUT.presets` / `classicKeys` / `classicPad` / `pointer`, new actions (`move attackMove stop zoomIn zoomOut zoomCycle peek camLock centre ranges`), `PLAYER.guard.touchArc`, the iso `PLAYER.assist` keys, fish magnet 3, small heart 3.5, Meme Cam blend-out 0.9, tree fade 0.22 (§13, C1, C7). Integration values: desktop distance 12.4 m (her measured size ≥ 80 px at 1080p), `catHView` (the cat clamp works on her apparent, foreshortened height), `frameOffsetTouchX` (touch landscape: she sits left of the cluster), `TOUCH.buttonsPortrait` / `stickZonePortrait` 0.48 (the landscape offsets spill over the joystick on a 390 px phone). | core/config.js |
| Input: no pointer lock in iso; `pointer`, `takeClick` / `peekClick` / `clearClicks` (mouse + taps, queue of 8, mods), `addTap(x, y, 'tap' / 'long' / 'move' / 'longEnd')`, `addZoom` / `consumeZoom` (wheel, pinch, R3), `aimStick` (pad RS aims), `setVirtualAim` / `virtualAim`, `haptic(kind)`, presets + `settings.bindings` (`rebind`, `codesFor`, `preset`, `wasd`, `lmbMoves`), mouse activity only above 24 px/s. | core/Input.js |
| Events `player:order`, `target:changed`, `camera:zoom`, `input:scheme`, `nav:ready`; JSDoc for the telegraph §8.5 fields and the `companion:ability` aim fields. | core/events.js |
| `params.cam` ('iso' / 'classic'); `ctx.strings.t` is device-aware (`key.touch` / `key.pad` first). | core/Game.js |
| Settings §10.7 defaults; save `migrate` validates them (enums, ranges, bindings, touchLayout). | core/GameState.js, save/SaveManager.js |
| Debug hooks: `click(x, z, button, mods)`, `tapAt`, `aimAt`, `screen`, `order`, `orders`, `fogAt`, `nav.path / walkable / info`, `cam.iso / zoom / lock`. Smoke harness: `t.click`, `t.tapAt`, `t.aimAt`, `t.viewport`; every block starts with no order / selection / zoom / drag-aim. | core/debug.js, tests/smoke.mjs |
| Camera: `IsoRig.js` (pure maths) + `Picker.js` (`screenToGround`, `pickAt`); FollowCamera runs the iso rig for follow / lock / boss: `focus`, `stickYaw`, `isoYaw` (level `cam.yaw`; the gate looks north), `zoom`, `setHint`, `screenToGround`, `cursorGround` / `cursorValid`, `hover`, `worldToScreen`, `onScreen`, `pick`, `iso()`, `select(actor, source)`, `setCamLock`, engaged-set framing with combat zoom-out, boss fit [14, 22], lead, peek, edge pan when unlocked, charge / parry / Holy / Purrfect Dodge / Golden Hour punches, view-offset framing, near / far 0.3 / 90, the 1.0 s hand-back, the iso shake mix, focus-fog writes, x-ray via `characters.setXray` (her, and enemies winding up behind cover), multi-target occluder fades. | camera/* |
| Physics: `NavGrid` (0.5 m, lazily sampled + background fill, dynamic invalidation) and `Pathfind` (A*, automatic hop / drop / gap links over fences and streams, run-up take-offs, string pulling); `findPath`, `nearestWalkable`, `navWalkable`, `losWalkable`, `nav`. | physics/* |
| Player: `Aim.js` (the §7.1 resolver, §7.2 auto-target, magnet cones, threat snap, assisted hop) and `Orders.js` (move / follow / attack with auto-chain / attackMove / use / stop, queue, path follower with link jumps, run-up retries and stuck re-plans, §8.4 cancel rules); `resolveAim`, `faceAim`, `aimTurn`, `abilityState`, `order`, `hover`, `steerDodge`; the Stand threat snap, cursor-facing Stand / charge, Pounce toward the cursor. | player/* |
| Combat: `threats` (a ThreatBook fed by telegraphs) and `nextParryable(actor)`. | combat/Combat.js |
| fx: `GroundDecals` (one instanced draw): hero / aim ring, Stand fan, charge reach, strike wedges, parry ring, selection / hover / aggro rings, order markers, path dots, landing ring, the companion ability indicator (`fx.drawsAbilityAim`). | fx/GroundDecals.js |
| World: `Env.setFocusFog`, `Env.fogAt`, shadows centred on the focus, the iso low-mix; `level.cam` (yaw, fog overrides). | world/Env.js, world/Level.js, world/levels/gate.js |
| ui: touch rewrite (floating stick, cluster from `touchLayout.js`, dead rings, drag-aim + ✕, Tumble steer, tap / long-press / swipe / pinch, quick taps in the stick zone count as taps, haptics, portrait, mirror, opacity; the rotate card is a one-time toast), `abilityBar.js` (desktop / pad bar, context cursors), no lock reticle in iso (HP pips for the selected / hovered / hit), device-aware strings and preset-aware glyphs, new settings rows, the portrait HUD strip. | ui/* |
| Story: §14 copy (base / `.pad` / `.touch`), `tut.target / zoom / click / talk / rotate`, camera toasts, tips; the tutorial move step needs no look (C6); flag `tut.jump.done`. | story/strings.js, story/tutorial.js |
| Audio: the listener rides the iso focus (+1.2 m, camera yaw). | audio/AudioManager.js |
| Meme Cam exits on a click / tap / 40 px mouse move in iso. | player/MemeCamTrigger.js |

## Requests applied
- companions: the input names (`aimStick`, `virtualAim` in CSS px, `pressed('move')`, `haptic`), `cam.cursorGround / cursorValid / focus / stickYaw / lockTarget`, `cam.pick` includes `companions.pickables()`, the use order calls `companions.use(actor)`, `player.aim.dir`, `fx.drawsAbilityAim`, ui drag-aim through `setVirtualAim` + the `ability` action, the ability bar reads `cooldownLeft / readiness`.
- characters: `cam.focus` + `modeName` kept as the iso detection; x-ray via `setXray`; the hero ring is fx's.
- enemies: `cam.onScreen(p, margin)` (the frustum shrunk by the margin; before the first rendered frame it answers "on screen"). The enemies unit test's "pans to show it" focus moved 2 m (the rat sat 0.4 m inside the bottom edge, which the 0.5 m margin rightly counts as off screen).

## Smoke
New `tests/smoke/controls.mjs` (desktop KBM end to end, the nav fence hop, every M2 level from the iso camera, phone
landscape + portrait with hasTouch, `?cam=classic`); `camera.mjs` rewritten for the iso rig (follow, select, boss fit,
hand-back, occlusion + x-ray, town house fade; meme / presets / shake / CS-08 kept). Jump taps use `KeyF`; the flow's
square check remembers the giant jelly's spawn (the iso fight clears the waves between two polls).

---

# Controls rework, part 2 (2026-10-11): area passes + integration

Every area finished its CONTROLS_SPEC §12 items (dithered crown / roof fades, capsule occlusion, zone hints with
dist / pitch, Golden / dialogue framing, memeSpot; authored + gated nav links, bounce links, `tops` raycasts; Auto-Riposte,
touch guard arc, live `player.aim`, jump assist, Pounce aim; §7.2 score + lunge speed + bolt reflect toward the aim;
cursor.js, hpBars.js, touch Edit layout, preset glyphs; GroundMist, strike wedges, parry ring, order markers, ranges;
level `cam` rows, zone hints, roof / crown / solid tags, wheat trample; the 9-step tutorial; topTint). The integrator
then applied the open requests and fixed what the full smoke run found.

## Requests applied
- camera ← physics: `Picker.screenToGround` raycasts walkable prop tops (`tops: true`); tops more than 2.8 m above the
  terrain are skipped (a 5.6 m hay stack camera-side of the practice field was catching clicks past the fence).
- player ← physics: bounce links are followed (`Orders._bounceLink`: right after a spring near the take-off, the airtime is
  aimed at the landing; a hop that lands on a cap counts as landed). A move order now rides the Mushroom Ring to cap 5.
- player ← combat: lunge magnetism in swing units (`lungeSpeed`), and touch / pad / auto swings pass `lungeTo` at the
  swing start so the whole lunge window gets it; the Stand threat snap measures and faces the bolt (`nextParryable().pos`;
  `threatSnap(her, threats, now, out)` → `out.at`), touch auto-face too.
- player ← story: touch Jump is never cut short (a tap clears the 1.0 m practice fence).
- player ← camera: at the level's `memeSpot` she turns to its yaw when the Meme Cam starts.
- fx ← player: the Pounce dive circle sits at `player.diveAt`; the hero notch follows the live aim (auto / selected
  while a verb is active).
- ui ← core: pad Back (8) pauses and opens the controls card. ui ← story: `CINEMA.tipCount` 12; the portrait
  tutorial card sits under the HUD strip. story / ui ← player: with Auto-Riposte on, the hint reads "Parried! She
  ripostes all by herself." (`tut.riposte.auto`). The touch `button` haptic was already sent by touch.js.
- world ← fx: `patchFogVarying` tests for `varying vec3 vFogW` (a shader that calls `hfogFactor` is patched).
  world ← physics: the meadow fence link moved to x −14.5 (off the hay platform's rim).
- enemies ← characters: `topTint(m.root)` in `Enemy.loadVisual` (iso; owned materials patched in place).
- core ← combat: the combat-only AIM keys are in `config.AIM`. core ← characters: the harness passes the boot
  timeout to `page.goto` / `reload`.
- Declined / kept: the fx tunables stay as frozen tables next to their code (DECAL_CFG, GROUND_MIST, …); still open
  (optional): camera owning `settings.camLock`, audio `ui.ready`, enemies' boss yield, ui's CS-06 letter card,
  `postfx.setGrade`, `level.cam.fog.mist`.

## Integration fixes
- The long pale diagonal streaks over every iso level were the ambient MistCards (wide cards leaned toward a lens 50°
  above them). In iso they fade to 12 % (`MIST_ISO.ambientA`); GroundMist carries the mist. (Hiding them with
  `visible = false` never worked as a test: fx re-shows its meshes every frame.)
- Enemy HP pills live in their own layer under `#touch` (`#ui-world`), so a pill never covers a touch button.
- New: the §6.3 pad right-stick ground reticle (fx `_padReticle`).

## Smoke
New `controls:pad` (stubbed gamepad: RS reticle + linger, Back → controls card); `physics:nav-forest` now rides the
Mushroom Ring by a move order. Robustness: `controls:nav` learns the jump lesson first (the fence link is gated);
`controls:classic` holds W until she walked; `camera:boss-fit` reopens an arena an earlier block saved as cleared;
`enemies:onscreen-rule` counts only the crossbowman's own bolts; `physics:nav-forest` accepts arrival at the picked
surface (a stump top in front of the target); `enemies:m2looks` height tolerance 35 % (Cacklejaw's hat); `controls:touch` accepts arrival at the order's own point
(a crate top in front of the tapped ground) and taps ⚔ once more if the first tap lands in a recovery;
`story:tutorial` puts the cursor on the dummy before the J combo (J swings toward the cursor); `audio:forest` despawns
the camp rats before the night-music check.
