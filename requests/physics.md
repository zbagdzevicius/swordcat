# Requests and notes from physics (M1)

Physics API (src/physics/Physics.js). The frozen §19.2 calls are unchanged: `setLevel`, `moveActor`, `separateActors`, `raycast`, `heightAt`, `isDeepWater(x, z)` and `clampToBounds`.

New calls, all additive:
- `groundAt(x, z, fromY?)` and `topAt(x, z)`
- `normalAt`
- `sphereCast(ray, r, max, opts)` and `lineOfSight(a, b, opts)`
- `waterLevelAt` and `isShallowWater(x, z, y?)`
- `inBounds` and `blockedAt(x, z, r, y0, y1)`
- `overlapsStatic(pos, r)` and `bounceAt(x, z, y?)`
- `addCollider` / `removeCollider` / `updateCollider` / `refreshColliders()`
- `addMesh` / `removeMesh` / `rebuildMeshes`
- `setDebug(on)`, which draws a collider overlay

## To player
- Please call `physics.isDeepWater(this.pos.x, this.pos.z, this.pos.y)`, passing the feet height, and do the same for `isShallowWater`.
  - Without `y`, physics measures depth from the highest walkable surface at (x, z) (`topAt`). That is also the `y` it passes to the level's own `isDeepWater`.
  - So the current call is already safe on the meadow Old Bridge and the gate causeway, which count as dry. Smoke `physics:bridge` checks this.
  - Without `y`, physics can't tell "on the bridge" from "in the stream under it". With `y` the answer is exact.
- `moveActor` already applies bounce pads (mushroom caps, `bounce` on a prop or mesh) on the landing step.
  - It sets `actor.bounced = vy` for that one step and leaves `onGround` false, so `_landed()` does not run.
  - Read `this.bounced > 0` after `moveActor` to play the bounce squash and sound. `bounceAt(x, z, y)` still exists as the query form.
- Other per-step outputs on the actor:
  - `stepY`: height gained or lost by a step up or down this step (props, stairs). It is useful for easing the visual root.
  - `groundKind`: `'terrain' | 'static' | 'mesh' | null`.
  - `groundObject`, `groundNormal`, `wallHit`, `ceilingHit`, `sliding` (on terrain too steep to stand on, normal.y < 0.7).
  - `landImpact` (m/s, on the landing step only).
- Optional inputs on the actor: `flying`, `gravityMul`, `terminalFall`, `stepUp` (default `PLAYER.stepUp`), `noClip`, `fixed`, `ghost`, `collideActors: false`.

## To world
- Physics reads these LevelData fields:
  - `heightfield`
  - `colliders { circles, boxes, segments?, rings? }`
  - `octreeMeshes`, plus any mesh under `root` with `userData.collide === true`
  - `bounds { min: Vector2(x, z), max }`
  - `water` (Appendix B entries; `deep: true/false` overrides the 0.5 m depth test), or `level.isDeepWater(x, z, y)` / `level.waterLevelAt(x, z)` functions if you'd rather own it
- Arena fog walls: a single ring collider is cheaper and tighter than a circle chain. Use `physics.addCollider({ x, z, r, kind: 'ring', factions: ['player'] })` and `removeCollider(sameObject)`.
  - It keeps actors on the side they are on.
  - Rays, the camera and projectiles ignore it.
  - Rectangular arenas: use four boxes `{ x, z, hx, hz, yaw?, y0, y1 }`.
  - Editing `level.colliders` arrays in place and then calling `physics.refreshColliders()` also works (Arena.js already does this). Colliders added with `addCollider` survive a refresh.
- Prop collider tops are walkable by default: you can step onto 0.3 m and jump onto a 1 m hay bale. `walkable: false` opts out, and `bounce: vy` makes a mushroom cap.
- Architecture: Mesh or InstancedMesh (not skinned) goes into a three Octree.
  - `userData.collide = false` skips a node. A DoubleSide material collides from both sides. `userData.bounce` makes a bounce pad.
  - Invisible low-poly proxies are best for stairs and ramps: each 0.25 m step climbs by step-up, and 45° is the walkable limit.
  - `addMesh` / `removeMesh` / `rebuildMeshes` rebuild the octree. Call them once per change, never per frame.
- `Arena.validPoint` could use `physics.blockedAt(x, z, 0.5)` instead of scanning `colliders.circles/boxes`, so yawed boxes, segments and dynamic colliders count too.
- `Level.isDeepWater(x, z, y)` gets `y = physics.topAt(x, z)` when a caller passes no feet height, so keep honouring `y` there. Water `pts` polylines and yawed `rect`s are supported on physics' side too.
- Old Bridge (smoke `physics:bridge`): a walker crosses the deck at y ≈ 0.30 with no sinking. The player dropped on it stays on the deck with groundKind `'mesh'`. The deck top is about 3 cm under `BRIDGE.deckY` (0.293 vs 0.32).

## To camera
- Done. `raycast`, `sphereCast` and `lineOfSight` honour `opts.ignore(src)` for static props, and `physics.castIgnore === true` is set.
- `hit.object` is the collider description itself, so its `cam`, `camFade` and `r` fields come back.

## To combat
- `overlapsStatic(pos, r)` now exists. It is a sphere test against props and architecture. Fog-wall rings and colliders with `ray: false` are excluded.

## To core (optional, additive)
- `config.PHYSICS` overrides the engine tunables in `PHYSICS_DEFAULTS` (Physics.js). The tunables are `walkableNormalY 0.7`, `groundSnap 0.3`, `skin 0.02`, `substep 0.5`, `maxSubsteps 24`, `deepWater 0.5` and `edgeSlip 2.0`. It isn't needed; the defaults match §7.1 and tech.md §5.
