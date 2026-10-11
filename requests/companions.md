# Open requests from companions

The M1 and M2 API notes of this area are archived in `docs/api/companions.md`; what core applied is in `requests/RESOLVED.md`.

## Iso controls (research/CONTROLS_SPEC.md §7.5, §7.6, §10.1, §12 companions), 2026-10-11

Everything below is **additive** and already live in `src/companions/**`, coded defensively against the P0–P2 names that
have not landed yet. Nothing needs to change for the game to keep working; each item says what would wire it up fully.

### What ctx.companions offers now
- `useAbility()` / `useAbility(i)`: the smart cast (§7.5). `useAbility({ dir?, point?, mag?, id?, index? })`: an aimed
  cast (world space; `mag` 0..1 of the reach for dir-only aims). Returns true when it fired. No dir / point → smart.
- `aim`: `{ active, kittenId, ability, shape: 'rect' | 'targets' | 'self', valid, source, plan }` while an ability is
  aimed. `plan` = `{ center {x,y,z}, yaw, width, length, range, radius, origin {x,y,z}, dir {x,z}, point {x,y,z},
  targets: Actor[], aimed, valid }`. Shield Wall: a 3.0 × 0.4 m rect at `center`/`yaw`. Volley: a `range` (14 m) ring
  at `origin` plus pips under `targets`. Purr: a `radius` ring around her.
- `aimAbility({ dir?, point?, mag? })`: ui's drag-aim (shows the indicator, updates it on each call).
  `cancelAbilityAim()`: the ✕ chip. `castMode` getter reads `state.settings.castMode` (`smart` | `indicator` | `dragOnly`).
- `cooldownLeft(id?)` (s), `readiness(id?)` (0..1), `canCast(id?)`, `abilityShape(id?)` (`{ ability, shape, range,
  width, length }` for the ranges overlay). `id` = `'mochi'`, an index, or nothing (the first).
- `pickables(out)`: this area's clickable actors. Each has `pickKind` (`'companion'` | `'npc'` | `'kitten'`; null =
  not clickable now: hidden kittens, scripted actors, far-culled NPCs), `useR` (how close a `use` order walks),
  `interactId` (a level interactable it stands for, or null) and `use()`.
  `use(actorOrId)`: what a click / tap does on arrival: `levels.current.interact(interactId)` when set, else
  `actor.use()`. Mochi / Sage / Clover say hello and regroup; NPCs turn and nod; hub residents say their line; a
  revealed lost kitten within reach is rescued; a station keeper opens their station.
- Hub residents clear of world's interactables register a `talk_<id>` interactable in `levels.current.interactables`
  (`kind: 'npc'`, `prompt: 'prompt.talk'`, `actor`, a live `pos`, `r` 1.5), so [Interact] / pad Y talks to them too
  (§14 `tut.talk`). They are removed when the residents leave.
- `COMPANION_ABILITY` payload gains `dir {x,z}`, `point {x,y,z}`, `aimed`, `source` (`smart` | `cursor` | `pad` |
  `touch` | `api`) and `targets` (count).
- LOD (§2.8): lost kittens, NPCs and hub residents measure from `cam.focus` in play (the lens in cutscene presets,
  her position until camera lands).

### To core (P0)
1. `events.js` JSDoc only: `COMPANION_ABILITY: 'companion:ability' // { kittenId, ability, position, dir?, point?,
   aimed?, source?, targets? }`.
2. Input, as read here (please keep these names, or tell me the real ones): `input.aimStick {x, y}` (pad RS, y up),
   `input.virtualAim {x, y, active}` (touch drag-aim, **screen space with y up**, CSS px or normalised 0..1; the setter
   is `setVirtualAim(x, y, active)`), `input.device`, `input.preset`, `input.down/pressed/released('ability')`,
   `pressed('back')` and `pressed('move')` (RMB cancels an aim), `input.haptic('kitten' | 'orderRejected')`.
3. `state.settings.castMode` default `'smart'` (§10.7). Already read defensively.

### To camera (P1)
1. `cam.pick`: include this area's actors. Use `ctx.companions.pickables(out)` (or `actor.pickKind` on any actor):
   `'npc'` and `'companion'` → kind `'npc'`, `'kitten'` → kind `'npc'` too (or a `'kitten'` kind if you add one), in
   the interact / NPC priority tier. Hover ring white (§7.4).
2. Read here: `cam.cursorGround` / `cam.cursorValid` (KBM Q quick cast and the held indicator follow the cursor),
   `cam.focus` (LOD), `cam.stickYaw` (else `cam.yaw`) for drag / stick vectors, `cam.lockTarget` (the selection: Volley
   gives it 2 of 5 arrows).

### To player (P2)
1. `use` order on an actor from `cam.pick`: path to `actor.useR` (or to the interactable when `actor.interactId` is
   set), face it, then call `ctx.companions.use(actor)`. Ability casts keep the order (§5.2): companions never touches
   orders.
2. Companions read `player.aim.dir` (any time it is set) for the ability fallback and to keep the idle kitten out of
   her aim notch, or `player.resolveAim('ability')` if you expose it. Please do not consume the `ability` action:
   companions reads it (tap / hold / release, §6.2–6.4).

### To fx (P3)
1. GroundDecals can draw the kitten ability indicator from `ctx.companions.aim` (shapes above). When it does, set
   `ctx.fx.drawsAbilityAim = true`: companions' fallback `AbilityIndicator` then stays hidden.
2. The ranges overlay (hold Ctrl): `ctx.companions.abilityShape()` gives the active kitten's shape and range.

### To ui (P2/P3)
1. Touch portrait button: tap = the `ability` virtual action (smart cast, works today). Drag ≥ 16 px: call
   `ctx.companions.aimAbility({ dir, mag })` on each move (world dir through the camera yaw, `mag` = drag ÷ 90 px), or
   feed `input.setVirtualAim(x, y, true)` while the `ability` action is held. Release: `useAbility({ dir, mag })` (or
   release the action). ✕: `cancelAbilityAim()`. A drag back inside 16 px is a cancel for abilities (§9.4): call
   `cancelAbilityAim()`.
2. Ability bar Q slot (§10.1): `cooldownLeft()`, `readiness()`, `canCast()`, "zzz" while `active[0].napT > 0`.
   In `mouseOnly`, a click on the slot = `useAbility()`.
3. Cursor (§10.2): "paw + wax seal" over `pickKind` `'npc'` / `'companion'` / `'kitten'` (from `player.hover`).
4. The blocking rotate card (C8) still covers the portrait game; `companions:touch` hides `.ui-rotate` itself until it
   becomes the one-time toast.

### To characters (P3/P4)
1. §2.8 fur LOD: `Fur._lod` measures from `camera.position`; the companions' `KittenView`s (Mochi, Sage, Clover, NPCs,
   kittens) follow whatever you switch it to (`cam.focus`, one `furShells` tier down beyond 12 m). Nothing to do here.
