# Paw Tricks (TT3 package A)

The three Pink Paw themed Paw Tricks from `docs/TOKENTAILS-PLAN.md` §11.3. Code lives in `src/player/tricks/`, the
visuals in `src/fx/TrickFX.js`, the controls in `src/ui/touch.js`, `src/ui/touchLayout.js`, `src/ui/abilityBar.js`
and `src/ui/tricks.css`.

## The tricks

| Id | Name | Input | What it does |
|---|---|---|---|
| `coin` | ":3" Coin Toss | `trick` (F, RT, the ":3" button) | A boomerang. Out 8 m and back in 0.9 s. It stops at the first foe, hangs 0.14 s, then flies home and hits that foe again. 8 damage each way, +2 Valor per hit. Cooldown 4 s, one coin at a time. It scoops up catnip and small hearts on the way back. |
| `cloud` | Catnip Cloud | `trick` with the cloud equipped | A pouch lobbed up to 7 m. A lilac cloud, 2.5 m radius, stays 3 s. Normal foes inside go `giddy` for 2.5 s. Cooldown 16 s. |
| `twirl` | Ribbon Twirl | a second `jump` press in the air, held | The bow spins like a propeller. The fall is capped at 1.8 m/s, she steers at 4.5 m/s, up to 1.5 s, once per jump. The start spins a 1.0 m hit for 6 damage and knocks crows back. After a Pounce pogo it carries 1.35 times further. Holding Jump from the take-off never twirls. |

## Per-enemy rules

The coin (`coinRule(e, dir, groundY)` in `CoinToss.js`, pure):

- Rats, the smallest Wobblejelly and the bonehead mage are stunned 0.6 s.
- A crossbow rat hit while aiming loses its bolt. Its telegraph ends and the reload starts over.
- A crow within 3 m of the ground is grounded 1.5 s (`enemy.groundFlyer`). A higher crow is out of reach and the coin passes under it.
- A SNACK SNATCHER is stunned 1.2 s and drops half of its loot (`enemy.dropStolen?.(0.5)`, a characters hook).
- A pug blocks it from the front (`enemy.blocksFrom?.(dir)`, or the pug's own shield answer `'block'`). The coin clangs and turns back. From the side it hits.
- Wobblejellies are knocked back and never split (the hit def has `popsSlime`).
- Bosses take 6 damage and +4 Dizzy (`boss.addDizzy`). No stun.

The cloud (`cloudRule(e)` in `CatnipCloud.js`, pure):

- Bosses and elites (poise 5 or more, for example the pug) get +20 Dizzy only. An elite with no Dizzy meter wobbles.
- Crows are grounded for 2.5 s.
- Everyone else goes giddy (`enemy.makeGiddy(2.5)`). Each foe is affected once per cloud.

## Giddy (Enemy.js)

- `enemy.makeGiddy(sec)` returns true when it went giddy. Bosses, elites and flying crows refuse.
- The `giddy` state: on its back, paws wiggling, no attacks. A jeer is cut off (the jeer state's exit ends the aura).
- The plate flips to its friend word (GRUMP to GIGGLER, SNACK SNATCHER to SNACK SHARER) and flips back when it gets up.
- The first hit wakes it. Combat counts that hit as a ×1.5 crit (`Combat._critTaken`). Hearts pop.
- `giddy` is in `PASSIVE_ENEMY_STATES`, so a giddy foe is no Standing Ground threat.
- `enemy.isGiddy` is true while it lies there.

## Controller: `player.tricks` (PawTricks)

- `owns(id)`, `anyOwned()`, `ownedList()`, `equipped` (`'coin'`, `'cloud'` or null).
- `grant(id, { bark, force })` hands a trick over. It refuses before the first fight unless `force`.
- `equip(id)` and `pick(n)` (1 coin, 2 cloud, 3 shows the twirl hint).
- `tryCast(id, at?)` starts the `toss` state. `at` is a world point `{ x, z }` or `{ dir: { x, z } }`.
- `release(arg)` is the toss state's release frame. The coin leaves or the pouch flies, and the cooldown starts.
- `cooldownLeft(id)`, `cooldownMax(id)`, `ready(id)`, `cancelAim()`.
- `aim`: `{ on, id, dir, point, target, source, len }`. TrickFX draws it while the button is held past 0.18 s.
- `uiState(out)`: `{ any, equipped, cd, cdMax, ready, coinOut, aiming, twirl, owned }`. `player.abilityState().trick` carries the same.
- `stats`: casts per trick, unlocks, denied casts, swaps. `coin.stats` and `cloudSim.stats` hold the hit rules seen.

Aim order: a touch drag or the pad's right stick, then the KBM cursor, then the locked foe, then the best foe within range in front of her, then her facing.

## Input contract (read only, K owns the bindings)

- `trick`: press and release casts. Holding shows the aim. `back` (Esc, Backspace) or a fresh `guard` press while aiming calls it off.
- `trick1`, `trick2`, `trick3`: pick. A pick while `trick` is held (RT + D-pad) never casts on the release. `input.usedAsModifier('trick')` is honoured too.
- `sprint`: while held, `move` runs at Zoomies speed at once, also in a fight.
- `jump`: the second press in the air starts the twirl.

## Saves

Save flags in the generic `state.flags` record: `trick.coin`, `trick.twirl`, `trick.cloud` (true) and `trick.equipped`
(`'coin'` or `'cloud'`). `SaveManager.js` does not change.

## Unlocks (`unlocks.js`)

- Never before the first fight (`onboard.firstFight`, or `prologue.done`).
- Coin: in the meadow, on the way into the Crow Fields past the Picnic Glade (`inCrowFields`), or at the first crow alert there. The Token Tails Cat's bark appears in a bubble beside her.
- Twirl: 1.6 s after she enters the forest. Pearl's bark.
- Cloud: 1.6 s after she enters the town, before the first jeering pack in Bakery Street. Pearl's bark.
- A save already past a hand-over gets the trick quietly on load (`ownedOnLoad`).

## Events

`trick:unlocked { id, bark }` and `trick:used { id, hits? }` (`TRICK_EVENTS`). The catalog keys `TRICK_UNLOCKED` and
`TRICK_USED` are requested from core in `requests/tt3-t.md`. Until then the bus logs a warning for the names.

## Strings

The §11.4 `trick.*` keys. `PawTricks.text(key, vars)` uses story's strings when the row exists, else `TRICK_TEXT`
(the plan's exact text).

## Audio

zzfx sounds `TRICK_ZZFX` in `sfxMap.js`, added to `ZZFX_DEFS` at import: `trickCoinThrow`, `trickCoinHit`,
`trickCoinCatch`, `trickTwirl`, `trickFwip`, `trickPouch`, `trickPoof`, `trickGiggle`, `trickUnlock`.

## Touch and bar

- The ":3" button joins the cluster only once a trick is equipped (`computeLayout(w, h, { extra: { trick: TRICK_BUTTON } })`).
  The default cluster is unchanged before that. Golden Hour is now the first button dropped on a cramped screen.
- A long press (0.45 s) opens a 3-way picker fanned toward the screen centre. Slide onto a bubble or tap it.
- The ability bar adds its trick slot after Golden Hour the first time a trick is owned. Before that the bar keeps its 8 slots.

## Tests

- Unit: `tests/unit/tricks.test.js`.
- Smoke: `tests/smoke/tricks.mjs` (`tricks:coin`, `tricks:twirl`, `tricks:cloud`, `tricks:inputs`).
