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
