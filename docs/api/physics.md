<!-- Archived from requests/physics.md by core at the M2 integration pass (2026-10-09): the M1 API notes and requests of this area.
     Open items were moved to requests/physics.md; applied ones are summarised in requests/RESOLVED.md. -->

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
  - `slideSpeed`: m/s down a too-steep terrain slope while `sliding`, else 0. Physics owns the slide: steering into a bank can't hold her on it, so there is no hanging on a cliff.
- Gravity is now integrated exactly for constant acceleration. The jump apex is v²/2g = **1.245 m** (it was 1.183 m with semi-implicit Euler), and a mushroom bounce reaches 1.84 m. `player.test.js` still passes; its "Euler loses ~v·dt/2" comment is now stale.
- Terrain cliffs: when the rendered triangle is steeper than normal.y 0.65, she can't stand on it. Before, the smoothed normal let her stand on the first cell of a cliff's foot, and bunny-hopping climbed it. Triangles between 0.65 and 0.7 use the smoothed slope, so a lone steepish triangle on walkable ground is no trap.
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
- Fence runs (`LevelKit.fence`) set `y1 = min(h(a), h(b)) + height`. Where the ground under a run climbs, the collider's top at the uphill end is lower than the fence she sees. She can hop it there more easily than the visual suggests, and if the climb exceeds `height`, she walks straight over the buried top. Suggest `max(h(a), h(b)) + height`: the collider is non-walkable, so a taller top only blocks. Or split long sloped runs.
- Old Bridge (smoke `physics:bridge`): a walker crosses the deck at y ≈ 0.30 with no sinking. The player dropped on it stays on the deck with groundKind `'mesh'`. The deck top is about 3 cm under `BRIDGE.deckY` (0.293 vs 0.32).

## To camera
- Done. `raycast`, `sphereCast` and `lineOfSight` honour `opts.ignore(src)` for static props, and `physics.castIgnore === true` is set.
- `hit.object` is the collider description itself, so its `cam`, `camFade` and `r` fields come back.

## To combat
- `overlapsStatic(pos, r)` now exists. It is a sphere test against props and architecture. Fog-wall rings and colliders with `ray: false` are excluded.

## To core (optional, additive)
- `config.PHYSICS` overrides the engine tunables in `PHYSICS_DEFAULTS` (Physics.js). The tunables are `walkableNormalY 0.7`, `groundSnap 0.3`, `skin 0.02`, `substep 0.5`, `maxSubsteps 24`, `deepWater 0.5`, `edgeSlip 2.0` and `steepFaceTol 0.05`. It isn't needed; the defaults match §7.1 and tech.md §5.

## Controls rework (CONTROLS_SPEC §5.3, §12 physics): nav grid, links, pick tops
- `physics.findPath(from, to, opts?)` → `{ points: [{ x, y, z, link?, to?, authored? }], links, partial, goal, cost,
  expansions, ok }`. `link` is `'hop' | 'drop' | 'gap' | 'fence' | 'bounce'`; a link point is the take-off, `to` the
  landing. Unreachable goals end at the A* best node (`partial`); `ok` is false only when nothing is reachable (a start
  > NAV.snap off the nav): when she already stands on the closest cell the path is that one cell. Once the island
  graph is built (a few frames after `nav:ready` / an invalidation), a goal on an island she cannot reach snaps at once to
  the nearest reachable cell ≤ 24 m (`partial: true, snapped: true`; no A* flood to `NAV.maxExpand`); `navStats.islands`
  / `islandMs` report it. A goal inside a collider (a click on a wall / house face) whose nearest-walkable snap would cost
  > 2.5× the straight line + 4 m (the far side, round through a gate: `Pathfind.DETOUR`) is re-tried from the first
  walkable cell back along the line toward her, and toward `opts.toward` (`{x, z}`, e.g. the camera side of the pick
  ray) when given; the cheaper (path cost + 2 × distance to the click) wins and the result has `redirected: true`. Runtime `addNavLink` links are dropped by `setLevel`. `nearestWalkable(x, z, maxR)`, `navWalkable(x, z)`, `losWalkable(a, b)`, `physics.nav` (the NavGrid),
  `refreshLinks()`, `addNavLink(link)`, `navDebug(on)` (overlay: cells around her, authored links, closed gates, the
  last path), `navStats` / `corridors` (after `nav:ready`).
- Level data: `navLinks: [{ a: [x, z], b: [x, z], kind: 'hop'|'drop'|'bounce'|'fence', when?, oneWay?, gate? }]`.
  `when` is a flag expression (`state.cond`) or a function of the GameState; it is re-checked on every path query and
  on `story:flag`. A CLOSED `fence` link with a `gate: [[x, z], [x, z]]` line also shuts the automatic jump links
  across that line (the lesson fence). Endpoints snap ≤ 0.75 m to a walkable cell (past a lip for the landing).
  Authored links cost half an automatic link's penalty, so they win over automatic ones nearby.
  `navBlock`: `[x0, z0, x1, z1]`, `{ minX, maxX, minZ, maxZ }` or `{ at: [x, z], r }`. Colliders with `nav: false`
  never block the grid.
- `physics.raycast(ray, max, { terrain, mesh, tops: true })`: also hits WALKABLE PROP TOPS (ledges, crates, stumps,
  mushroom caps), never trunks or walls.
- Bounce links are followed by player `Orders`: a hop that comes down on a bounce cap counts as landed, and the spring off the cap is steered onto the link's landing (`_bounceLink`).

## Phase W / perf / auto-camera (IMPLEMENTATION_PLAN §6 physics, PERF P1–P4, AUTOCAM physics 1, physics.W1)
- **Nav API: `physics.reachableFrom(from, x, z, maxGap = 2)` → `true | false | null`** (ui's grey "unreachable" paw).
  true: a walkable cell within `maxGap` m of (x, z) lies on an island reachable from the island under `from` (walking,
  automatic jumps, open authored links; trap pockets of other islands excluded, exactly as `findPath` sees it). false:
  none is (roofs, walled yards, the far bank, or no walkable cell there). null: the island audit is missing / stale or
  `from` is > 1.5 m off the nav. Cached per start island, allocation-free.
- **P1 `separateActors`:** ≤ 24 solid actors (`SEP_HASH_MIN`) all pairs; above it a uniform hash (`SEP_CELL` 2 m,
  grown to 2 × the largest radius) over typed arrays with 3 × 3 neighbour cells. No allocation once warm (Actor's
  predeclared `_physSep / _sepX / _sepZ`, C13).
- **P2 A*:** already stamped (no clears), typed binary heap, per-grid scratch; the walked-back node chain now reuses
  an Int32Array too. Only the player issues path queries (clicks / holds / stuck re-plans), so no request queue or flow
  field was added (enemies steer, they do not path); the throttling ideas for `Orders.js` are in `requests/player.md`.
- **P3 nav build:** the grid fills time-sliced (`NAV.sliceMs` per frame, ×4 while loading) and paths work before it is
  complete (lazy cell probes), so `setLevel` stays far under 100 ms on the main thread (meadow ≈ 90 ms headless incl.
  the collider hash + octree, gate ≈ 2 ms). A worker build is not used: a nav sample reads the heightfield, the static
  collider hash, the architecture octree and level callbacks (`isDeepWater`), which would all have to be copied over.
- **P4 static queries:** `StaticColliders.query / resolve / supportAt / navTop / navCell` write into scratch arrays
  (no per-call allocation); `heightAt` is the plain bilinear sample (blob shadows may call it per actor per frame).
- **AUTOCAM §4 review:** `moveActor` sets `groundY` from the same contact collision resolved (terrain, prop top or
  architecture deck) and now KEEPS it while airborne (`groundKind === null` is the airborne signal; NaN only before the
  first contact). `player.groundY` therefore never flickers to NaN mid-jump.
- **physics.W1 / A:physics.1:** `tests/unit/nav.test.js` builds meadow and gate headless (stub GLBs, as world's tests)
  with the current Phase W level data (Mochi cart at `STORY.mochiCage`) and checks start → exit is one
  non-partial walkable path with no corridor < `NAV.minCorridor` on it, plus the prologue routes (practice field → barn
  chest, → north gate; start → Mochi's cart).
