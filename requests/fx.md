# Open requests from fx

## To characters — first-use shader stalls (open)
fx, combat (projectiles, M2) and world warm their programs under the loading veil. The remaining first-use compiles
are characters materials: the aura hull, the fur gold rim and the blade emissive variants (first Holy charge / Golden
Hour). The fx trick (show the object for one frame with an empty draw range, see `FX._warmBegin`) or
`renderer.compileAsync` with the composer's render target bound, on the hero rig at `level:loaded`, would cover them.

The M1 API notes of this area are archived in `docs/api/fx.md`.

## How to use the M2 fx (2026-10-09) — enemies, world, story, ui
Everything is additive; the §19.3 contract is unchanged. fx stays visuals-only (no gameplay, no hitstop / shake).
Automatic (no call needed):
- **Jeer fog**: `enemy:jeer {enemy, on}` → purple sound-wave rings out to 8 m + violet fog around the jeerer until
  `on:false`, `enemy:choke`, death, or 6 s. Pass `r` in the payload for the Jeer Duet (10 m).
- **Theft**: `item:stolen {thief, item, amount}` → loot arcs from her to the thief, a gold loot twinkle marks the thief.
  A thief that is despawned while alive (escaped with the loot) gets the smoke-bomb poof where it was.
  `item:returned` → fish fountain + sparkles at the thief that had it.
- **Gloomjelly**: `enemy:died` with a `jelly*` type → goo split (two blobs fling apart), or a gold pop when the killing
  `combat:hit` had `popsSlime` (or attackId bright / holy / holyWave / gleam / sunburst); `jelly_s` → a small splat.
  Size from the type suffix (`jelly_giant|l|m|s`) or `enemy.size`.
- **The Line**: `objective:progress {id:'line', value, max, frozen, done}` (world's Objectives already emits it) →
  welding sparks + hammer tinks at the `winch` anchor while it progresses, a gold ring every 10 %, grey stall puffs
  while `frozen`, confetti + a gold flare at `done`. Override the site with `ctx.fx.repairSite(pos)`.
- **Golden Hour**: `player:golden` → sun rays open behind her (subtle, capped to the frame), a gold ground pulse each
  second while it lasts; the Sunburst (`player:swing {attackId:'sunburst'}` or `burst('sunburst')`) flares them out.

### To enemies (calls for the new attacks)
- `pug_slam`: `ctx.fx.shockwave(e.pos, { r: 2.5, dur: 0.4 })` at the active frame (red wall 0.3 m tall, radius grows
  linearly — the same timing as your hit ring; the call returns `{ r0, r1, dur, height }`). Or `burst('slam', pos, { r })`
  for thud + dust + rocks + the wall in one call.
- Cacklejaw Laugh Quake: `ctx.fx.shockwave(pos, { r: 7, speed: 8, color: 'jeer' })`. Belly Flop: `{ r: 3, color: 'goo' }`.
- Grizzlechop Overhead Slam: `ctx.fx.burst('slam', pos, { r: 1.6, shockwave: false, crack: { length: 4, life: 0.5 }, dir })`
  (or `ctx.fx.crack(pos, dir, { length: 4, life: 0.5 })` alone). Colours: any colour or 'red' | 'boss' | 'jeer' | 'goo' | 'gold' | 'white'.
- `jelly_slam` landing: `ctx.fx.burst('jellySlam', landing, { scale, color })`; a split you script yourself: `burst('jellySplit', pos)`.
- `spider_web`: where the glob lands / hits her `burst('web', pos)`. enemies already draws its own patches
  (`enemies/WebPatches.js`), so `ctx.fx.webPatch(pos, { r, life }) → { alive, cut(), remove() }` (one instanced draw for
  all patches, procedural spokes + sagging spiral + dew, torn on cut) is optional; `burst('webCut', pos)` is the shred
  burst for your own cut.
- Stealer: nothing needed (automatic, above); `burst('stealerPoof', pos)` if you vanish one some other way.

### To world
- Lantern Alley / camp lanterns: `const h = ctx.fx.lantern(pos | Object3D | actor, { lit: false })`, then `h.light()`
  plays the ignition (flash, sparks, warm ring) and keeps a flickering warm glow + embers. Your Dressing LightPool keeps
  the real lights; `{ light: true }` would make fx pool 2 PointLights of its own — please don't, both pools would add up.
- `burst('lanternLight', pos)` is the ignition alone.

### To story
- CS-04: `ctx.fx.lantern('swordcat', { lit: true })` adds the glow halo + embers on the held lantern (fx finds a child
  named like "lantern" on the rig, else a raised-paw offset); your `lantern_light` keeps the PointLight. Fireflies come
  from the night grade automatically.

### To ui
- Shop purchase: `ctx.fx.purchase({ el: cardElement })` → a gold star burst + ring over the card (DOM layer
  `.fx-shop-layer`, z-index 60, pointer-events none; respects prefers-reduced-motion). Add `at: ctx.player` (or the
  counter's position) for gold coins + sparkles in the world too.
