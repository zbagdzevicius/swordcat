# TT3 requests to package C (characters, enemies)

## From A (Paw Tricks), 2026-10-14

A calls every hook below defensively (`?.`), so nothing breaks while they are missing. The coin already works on the
pug through the pug's own `resolveIncoming` (a frontal projectile answers `'block'`).

1. **`dropStolen(frac)` on `stealer` and on Pilfer** (§11.4). Drop `frac` of the carried loot at its feet, the same way
   `dropLoot` does (spawned catnip, `item:returned`), keep the rest. Return true when something dropped.
   The coin calls `e.dropStolen?.(0.5)` right before its hit. Today the stealer's `onHit` then drops all the rest, so
   "drops half" becomes "drops all". Please skip the drop-all for the coin's hits. The coin's hit def id is
   `trickCoin` (`hit.def.id`). Suggested diff in `src/enemies/types/stealer.js`:

   ```js
   /** TT3 §11.4: drop `frac` of the loot (the ":3" coin drops half); the rest stays in the bag. */
   export function dropStolen(e, frac = 1) {
     const loot = e.loot;
     if (!loot) return false;
     if (frac >= 1 || loot.item !== 'fish') return dropLoot(e);
     const n = Math.max(1, Math.floor(loot.amount * frac));
     loot.amount -= n;
     const at = e.pos.clone();
     const pk = e.ctx.levels?.current?.pickups;
     if (pk?.spawnFish) pk.spawnFish(at, n); else if (e.ctx.state) e.ctx.state.fish = (e.ctx.state.fish ?? 0) + n;
     e.ctx.bus.emit(E.ITEM_RETURNED, { item: 'fish', amount: n, bonus: 0, thief: e, by: 'coin' });
     if (loot.amount <= 0) e.loot = null;
     return true;
   }
   // in the type: init(e) { ...; e.dropStolen = (f) => dropStolen(e, f); }
   // onHit(e, hit) { if (e.loot && hit?.def?.id !== 'trickCoin') dropLoot(e); }
   ```
   Pilfer needs the same method (it carries the pin or a bag).

2. **`blocksFrom(dir)` on the pug** (§11.4). True when a hit travelling along `dir` (unit `{x, z}`, into the pug) meets
   the raised shield: `frontalHit(dir, e.facing)` while the shield is up. Suggested: in the pug's `init(e)`,
   `e.blocksFrom = (dir) => !(e.shieldDownT > 0) && frontalHit(dir, e.facing);`.

3. **`setTrickPose`** exists, thank you. How A calls it, every rendered frame while it applies:
   - `setTrickPose('toss', w)`: `w` is a bell 0 → 1 → 0 over the toss (0.25 s coin, 0.3 s pouch). The coin leaves at
     0.08 s, the pouch at 0.12 s.
   - `setTrickPose('twirl', w)`: `w` ramps 0 → 1 over 0.12 s, then stays 1 while she glides (up to 1.5 s).
   - `setTrickPose(null)` once when neither applies.
   `player.state` is `'toss'` or `'twirl'` meanwhile (`_basePose` falls to `'ready'` for both, which reads fine).
   TrickFX already draws two pink ribbon loops over her head while she twirls; the bow spin itself is yours.

4. **Giddy look (optional).** `Enemy._renderFx` rolls a giddy foe onto its back (visual `rotation.x = -π/2`, a little
   lift and a paw wiggle on `rotation.z`). If a type's dress has a better "belly up" pose, a hook
   `def.giddyPose?.(e, w)` would be welcome; A would call it instead of the generic roll. Not needed for TT3.

## C answers (2026-10-14)
1. Done. `e.dropStolen(frac)` on `stealer` (also the Pilfer-look stealer) returns the amount dropped (0 = nothing, so a
   truthy check works). Fish fall behind it as pickups, no +5 bonus, `item:returned { ..., partial: true }`. A milk
   bottle or the pin falls only when `frac >= 0.5`. `onHit(e, hit)` skips the drop-all when `hit.def.id === 'trickCoin'`.
   `pilfer_chase.dropStolen(frac)` shakes `round(6 * frac)` letters out of the bag (the bag still drops on the 3rd hit);
   the cutscene `pilfer` returns 0.
2. Done: `e.blocksFrom(dir)` (also false while defeated or with a zero `dir`).
3. Done: `setTrickPose(name, w)` now follows `w` exactly every frame; only `setTrickPose(null)` eases out. The twirl spins
   the bow on its own axis and flutters the cape; the toss frees the left paw from the sword IK.
4. Not done in TT3 (optional): no `def.giddyPose` hook yet.

## Resolved (integrator, 2026-10-15)
Applied in the TT3 integration; see `requests/RESOLVED.md` (Phase TT3 integration). Open optional items are listed there.
