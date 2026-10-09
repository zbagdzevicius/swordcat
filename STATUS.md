# SWORDCAT: Nine Lives of Meow Island — Status

Milestones **M0 (core engine)** and **M1 (meadow vertical slice)** are done (GAME_DESIGN §19.10).
`npm run check` (build, then 445 unit tests, then 111 Playwright smoke blocks) passes.

## Implemented
- **Core:** Game loop, fixed-step systems, EventBus with the frozen event catalog, GameState, Assets (GLTF cache, `fitToHeight`, MODEL_FIT), Input (KBM, gamepad, touch), PostFX (MSAA, bloom, NaN-safe, quality tiers), ScriptedActor, the Appendix A config, and the `?test` / `?debug` hooks (`window.__GAME__`, lil-gui, stats). The asset prune step keeps `dist/` at about 76 MB.
- **Characters:** a procedural Swordcat with fur shells, a verlet cape, plate armour, a pink bow on her left ear, a longsword and poses. Also Mochi, Pearl, Whiskerbottom, squire kittens, the BeastHead hyena with breastplate words, cages and cutscene props.
- **Player:** the full §7 moveset: combo, charge and Holy, Stand/parry and Standing Ground, tumble with Purrfect Dodge, jump and Pounce, Meow, Milk Break, Golden Hour (through hooks), the Meme Cam idle trigger, safe-ground respawn and nine lives.
- **Combat:** the full resolve path: swings with aim assist, hits, guard and parry, projectiles with bolt reflect, attack tokens, hitstop and knockback.
- **Enemies:** full AI for rat_pike, rat_xbow and crow (shadow-decal dive, then a peck window). Scripted hyena, Cacklejaw and Pilfer for CS-02. Bases for later types and bosses (phase runner, Dizzy). There is a spawn budget.
- **Companions:** Mochi (squire, shield ability, nap), LostKitten rescues, Pudding, NpcActor and bubble barks.
- **World:** LevelKit (spine and zones), Env (fog, sky, wind), grass and wheat, Arena (waves, walls), and the `meadow` level: practice field, Tallbert statue, crossroads, Standing Stones, glade, Crow Fields, Old Bridge, far skyline and cows. The other 5 levels (forest, town, gate, bog, keep) boot as dressed stubs.
- **FX:** telegraphs, hit juice and damage numbers, HolyFX glow, sword trails, mist cards, the Horde, and marks.
- **Camera:** follow with occluder fade and collision, lock-on, shake, cutscene presets (static, orbit, crane, whip-fall, pull-back) and the Meme Cam.
- **Story:** CS-00 to CS-03, G-01 (Tallbert gag), D-01 (Mochi), the tutorial, Pearl's tutorial, vigil stones and the letter.
- **UI:** HUD (hearts, armour, Valor sword bar, lives, fish, kittens, letter, milk, companion portrait), dialogue with portraits and babble, toasts, title, pause, results card and touch controls.
- **Audio:** SFX and music maps for the meadow, a music director (explore/combat), procedural wind, Sunbell, laugh build, heartbeat, voice pools, ducking and 3D voices.
- **Save:** localStorage `swordcat.save.v1`, autosave at vigil stones and level changes, and Continue.

## How to run
```
npm install
npm run dev            # http://localhost:5173/  (add ?debug for lil-gui + stats, ?test for hooks)
npm run build          # dist/ (pruned assets)
npm run test:unit      # node --test, 445 tests
npm run smoke          # Playwright smoke against vite preview :4173 (needs a build); screenshots → tests/shots/
npm run check          # all three
```
Smoke options: `SMOKE_URL=http://localhost:<port>/` (use your own dev server), `SMOKE_ONLY=<area|block>`, `--headed`, `--verbose`, and `SMOKE_GPU=gl|d3d11|swiftshader`.
`tests/shots/` is generated output and is gitignored. A curated set is in `docs/screens/`.

## Controls (KBM / gamepad)
| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / camera | WASD or arrows / mouse (pointer lock after the first click) | left / right stick |
| Attack, hold to charge (Holy) | LMB or J | X |
| Stand (hold) / parry (timing) | RMB or L | LB |
| Tumble | Shift or K | B |
| Jump (LMB in the air = Pounce) | Space | A |
| Interact / confirm | E or Enter | Y |
| Kitten ability | Q | LT |
| Milk Break | R | D-pad up |
| Meow | C | L3 |
| Golden Hour (Valor 100) | V, or Stand + Attack | RT |
| Lock-on / switch target | Tab or MMB / flick or wheel | RB / right-stick flick |
| Pause; hold to skip cutscenes | Esc or P | Start |

On touch devices: a floating joystick on the left 45% of the screen, drag on the right side to look, and on-screen buttons.

## Known issues
- **Old Bridge clipping:** the bridge deck is only ~0.3 m above the meadow and the stream bed is −1.5 m. Teleport hooks have to use `physics.topAt` over deep water, and the slice smoke does this.
- **Smoke run time:** the full smoke takes about 20 minutes on Iris Xe, and a few blocks are timing-sensitive under load. The crow peck block now freezes the simulation on peck entry.
- **Bundle:** `index` (game code) is ~1.19 MB minified and `three` ~0.82 MB (its own long-cached chunk); levels, lil-gui, stats and zzfx load lazily.
- **Pending requests:** `requests/*.md` now lists only the open requests between areas; `requests/RESOLVED.md` lists what the M2 integration pass applied.
- **Stub levels:** forest, town, gate, bog and keep are dressed stubs. They have no objectives, enemies or story.

## Fixed in the M2 integration pass (2026-10-09)
- Camera inside the Standing Stones: ring stones (and the meadow's scattered tall stones) are camera-fadeable instanced props now (`fade: true`), so the follow camera fades a stone it is behind or inside instead of showing a flat grey face. Every `fade: true` prop collider carries `camFade: true`.
- Mochi too dark: dark coats get a sky-sheen fill in the fur shader (`uSheen`), more ambient, lighter roots, and Mochi's coat is a soft charcoal.
- Lingering bark: her "You're safe now…" reply is dropped if she is > 10 m from the kitten when it fires, any party bubble hides when its speaker teleports, and a caged companion only barks at arena waves within 25 m of her.
- Kitten count: the toast now counts the level like the HUD, Results and Quest Board ("Lost kitten found! (1/3)"; `{total}` is still available).
- `characters/index.js` static + dynamic import warning: gone (enemies import it statically).

## Next: M2 (Acts I–II, GAME_DESIGN §19.10)
1. Build out `forest`, `town` (with the hub) and `gate`: objectives (ropes, lanterns, The Line), the hub and the Quest Board.
2. Enemies: spider, jelly, the hyena with full AI, stealer and pug. Bosses B1 (Grizzlechop) and B2 (Cacklejaw), and Pilfer.
3. Companions: Sage, Clover, the hub kittens and the Spoon Brigade.
4. Story: CS-04 to CS-10, D-02 to D-04, D-06 and G-02.
5. UI: shops, the Quest Board, the objective bar and threat arrows. Player: finish Golden Hour.
6. Keep the M1 slice green (`slice:meadow`).
7. Exit criteria: every level boots in smoke, B1 and B2 can be beaten with `god`, The Line completes in smoke, the hub shops work, and U5–U12 pass.
