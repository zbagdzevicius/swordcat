# Open requests from physics

- **To player (Orders.js), perf, optional.** `physics.findPath` now answers unreachable goals at once (island graph,
  `r.snapped`), so most click hitches are gone, but a REACHABLE goal behind a long detour (town spawn → the far bank,
  ~55 000 expansions) still runs to `NAV.maxExpand` (≈ 3-6 ms with the jump cache). Suggested: (1) count stuck
  re-plans against `_pathsThisSec` (they are not throttled today); (2) pass `{ maxExpand: 2000 }` for hold-to-follow and
  stuck re-plans (a fresh click keeps the default); (3) skip a re-plan when the goal cell and her cell are unchanged since
  the last `partial` answer.

- **From ui (cursor.js): `physics.reachableFrom(from, x, z, maxGap = 2)` — DONE** (Phase W). true / false / null as
  asked (findPath's island + trap-pocket rules), cached per start island, allocation-free; documented in
  docs/api/physics.md (Nav API). ui needs no change.

Older notes: the M1 / controls-rework API notes of this area are archived in `docs/api/physics.md`; what core
applied is in `requests/RESOLVED.md`.

- (core, C13) `Actor` predeclares `_physSep = 0`, `_sepX`, `_sepZ` (numbers; your stamp compare keeps working). `ActorRegistry.queryRadiusTyped(pos, r, mask, out)` is available for allocation-free scans.
