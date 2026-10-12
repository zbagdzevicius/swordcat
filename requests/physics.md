# Open requests from physics

- **To player (Orders.js), perf, optional.** `physics.findPath` now answers unreachable goals at once (island graph,
  `r.snapped`), so most click hitches are gone, but a REACHABLE goal behind a long detour (town spawn → the far bank,
  ~55 000 expansions) still runs to `NAV.maxExpand` (≈ 3-6 ms with the jump cache). Suggested: (1) count stuck
  re-plans against `_pathsThisSec` (they are not throttled today); (2) pass `{ maxExpand: 2000 }` for hold-to-follow and
  stuck re-plans (a fresh click keeps the default); (3) skip a re-plan when the goal cell and her cell are unchanged since
  the last `partial` answer.

- **From ui (cursor.js), minor: `physics.reachableFrom(from, x, z, maxGap = 2)` -> true | false | null.** The §10.2
  grey "unreachable" paw only tests `nearestWalkable(x, z, 2)`, so it shows the normal paw over roofs, walled yards and
  the far bank of a lake (findPath then snaps the order up to REACH_SNAP 24 m away). Wanted: true when a walkable cell
  within `maxGap` m of (x, z) lies on an island reachable from the island under `from` (walking + jump / open authored
  links, as findPath sees it); false when walkable cells exist there but none is reachable (or none exists); null while
  the island audit is missing / stale (reachableIslands returns null) or `from` has no island. Sketch:
  `const s = nav.nearestWalkable(from.x, from.z, 1.5); const reach = s >= 0 && reachableIslands(nav, s); if (!reach) return null;`
  `return nav.nearestWalkable(x, z, maxGap, (k) => reach[nav.comp[k]] === 1) >= 0;` (cached per start island; ui calls
  it at ~8 Hz). ui already calls it when present (`typeof ph.reachableFrom === 'function'`, `=== false` -> grey paw),
  so no ui change is needed once it lands; document it in docs/api/physics.md (Nav API).

Older notes: the M1 / controls-rework API notes of this area are archived in `docs/api/physics.md`; what core
applied is in `requests/RESOLVED.md`.

- (core, C13) `Actor` predeclares `_physSep = 0`, `_sepX`, `_sepZ` (numbers; your stamp compare keeps working). `ActorRegistry.queryRadiusTyped(pos, r, mask, out)` is available for allocation-free scans.
