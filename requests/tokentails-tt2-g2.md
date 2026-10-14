# TT2 G2 (onboarding flow) → requests to other owners

G2 changed only its own files (docs/TOKENTAILS-PLAN.md §10.3, §10.7). What other packages need to know or apply:

## 1. `tests/unit/controls.test.js` (no TT2 owner; orchestrator): the hide-and-seek test is obsolete

The cow hide-and-seek lesson, its 1.2-s wipe and `tutpearl` as a scene are gone (§10.3: Meow is taught at Noodle's
barrel). Replace the whole test `touch tutorial: a Meow inside the hide wipe keeps the Pearl tutpearl spawns, and
practice ends` (around line 257–296) with this one (verified green against the current tree):

```js
test('touch tutorial (TT2 §10.3): the 4 lessons show the touch copy; holding the Skip chip ends practice and rings the bell', async () => {
  const { Tutorial, TUTORIAL_STEPS } = await import('../../src/story/tutorial.js');
  const handlers = new Map(), emitted = [], f = { 'prologue.start': true };
  const bus = { on: (ev, fn) => { (handlers.get(ev) ?? handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, emit: (ev, p) => { emitted.push([ev, p]); for (const fn of handlers.get(ev) ?? []) fn(p); } };
  const pos = { x: 0, z: -70, y: 0, clone() { return { ...this, copy(o) { this.x = o.x; this.z = o.z; return this; } }; }, copy(o) { this.x = o.x; this.z = o.z; return this; } };
  const ctx = {
    bus, emitted,
    state: { getFlag: (k) => f[k], setFlag: (k, v) => { f[k] = v; }, settings: {}, difficulty: 'knight' },
    input: { device: 'touch', preset: 'hybrid', down: () => false },
    cam: { isIso: true },
    game: { mode: 'play' },
    levels: { current: { id: 'meadow', interactables: [], actor: () => null, critter: () => null } },
    companions: { active: [], actors: [] },
    player: { pos, onGround: true, facing: 0 },
    strings: { t: (k) => k, has: () => true },
  };
  let chip = false;
  const story = { isPlaying: false, cinema: { skip() {}, apply() {} }, flag: (k, v) => { f[k] = v; }, toChart() { this.charted = true; }, skipPressed: () => chip };
  const tu = new Tutorial(ctx, story);
  tu.init();
  assert.deepEqual(TUTORIAL_STEPS.map((s) => s.id), ['move', 'bonk', 'stand', 'parry']);
  tu.update(0.05);
  for (let k = 0; k < 8; k++) tu.update(0.05);
  const p = emitted.filter(([e]) => e === 'story:prompt').map(([, x]) => x).at(-1);
  assert.equal(p.textKey, 'tut.move'); assert.equal(p.action, null, 'the move lesson demonstrates on the ground');
  chip = true;                                            // tap-and-hold the Skip chip
  for (let k = 0; k < 25; k++) tu.update(0.05);
  assert.equal(f['prologue.practice'], true, 'practice skipped');
  assert.equal(story.charted, true, 'the bell (CS-01 next, in place)');
  assert.ok(emitted.some(([e, x]) => e === 'ui:toast' && x.key === 'tut.skipped'));
});
```

## 2. G1 (guidance): the contract is live

- `ctx.story.guideTarget()` → `{ id, x, z, arriveR, textKey, kind, speaker? } | null` for every step:
  practice `tut.move` / `tut.bonk` (the middle dummy (0, −76)), `tut.stand` / `tut.parry` (the stand spot 1.3 m north of
  Sir Wobble's live position; `textKey` is `onb.wobble.close` "Get close to Sir Wobble!" while she is > 1.6 m from
  him); `prologue.chart` (the bell / CS-01 in place); `onboard.fight` (the nearest live rat in the `yard` arena;
  `onb.fight`, or `onb.fight.quest` before the lock); `prologue.suit` (the barn chest, `onb.chest` → `onb.chest.near`
  within 1.9 m, speaker `swordcat`); `meadow.mochi` (Mochi's cart / his carrier); `onboard.noodle` (Noodle's barrel,
  `onb.meow` "Meow [Meow] to call hidden kittens" within 6 m); `onboard.stones`; after `onboard.done`, every quest row
  with a spot (`QUEST_SPOTS` in story/quests.js, same refs as beacon's `QUEST_TARGETS`). null on the title, during a
  load and while a boss is up. Kind is `lesson` in practice, `quest` elsewhere.
- `ctx.story.sceneActive` is true during cutscenes and dialogue scenes, false during ambient barks (G-01 is a bark).
- The Skip chip is `.cin-skip-chip` (cinema.js); `ctx.ui.skipChipRect()` → `{ x, y, w, h }` while it shows, else null
  (for `__GAME__.guide().skipChip`). `ctx.story.skipChip` → `{ on, progress, scene }`.
- `ctx.story.questTarget(id)` → `[x, z] | null` (beacon asks it first).
- Seen in the smoke runs: a ground tap that lands on the edge arrow (top left at 844×390, `svg`) or on the objective
  pill is swallowed (it never reaches the touch layer). If the edge arrow is meant to be tappable, make the tap an
  order toward the target; otherwise give it `pointer-events: none`.

## 3. G3 (brand UI)

- `newGame({ skipPractice })` is implemented (StoryManager): it starts like Play with `prologue.practice` set and the
  bow outfit, so the bell → CS-01 → CS-02 → the first fight follow. The title link can keep calling
  `ctx.story.newGame({ difficulty: 'knight', skipPractice: true })`.
- Your requests to G2 (story.test.js 2a / 2b, cinema.js `tipCount: loadingTipCount()`) are applied.
- `strings.onboarding.js` registers through your `addStrings()`; it changes these existing rows (G2 copy): `tut.move*`,
  `tut.bonk*`, `tut.stand*`, `tut.parry*`, `tut.jump*`, `tut.roll*`, `tut.skip*`, `tut.skipped`, `pearl.bell`,
  `pearl.parry`, `pearl.parry.letgo`, `pearl.parry.ok`, `cs01.3`, `cs01.4`, `d01.1`. The brand banned-word test should
  scan the file (it has no money / shelter-impact words; onboarding.test.js checks that too).
- The Skip chip uses `--f-head` / `--cocoa` from ui.css; its CSS is in `src/ui/onboarding.css` (injected by UI.js).

## 4. G4 (world): thanks for the world.test.js updates

`world.test.js` already matches (33 rat_pike, the `yard` arena, the open fence link). Two more world-side changes in
G2-owned files for your awareness: `WobbleKnight` takes `approach: () => boolean` (meadow passes "the drill is on",
so he steps toward her only in the Stand / Parry lessons and stays home otherwise), and meadow's `navLinks` has a
second fence entry `when: 'onboard.fenceAuto'` (never set) whose gate line keeps the automatic hops off the rest of the
practice fence (there the landing hit the barn / chest colliders and she bounced back forever, a dead end).

## 5. G6 (QA / STATUS): measured numbers

- Manual-style run from a new save (`?debug`, 1280×720, mouse + keyboard, right-clicks toward `guideTarget()` only,
  a 1.5 s reaction delay at every new step, no skipping): **Play → `onboard.firstFight` 42.8 game s**; first reward
  (Pink Bow card) at ~6 s; no death in the first fight; chest tag "Open"; the fence hop taught Jump (`tut.jump.done`).
- `flow:first-minute` smoke (same rules, FLOW_DELAY 1500): Play → first fight **43.0 game s**, D-01 at 76 game s.
- Scene lengths in the browser: CS-01 7.7 s, CS-02 17.6 s, CS-01b 3.8 s, D-01 11.3 s; G-01, tutbow, tutpearl are
  ambient barks (2.6 / 2.0 / 2.4 s, no input lock); the Skip chip is on within one frame of each scene start.
- For the bot: do not drive the Stand with `input.setVirtual('guard', …)` on a mouse run: it flips the input device to
  touch (the chip, the prompts and the glyphs switch to touch copy). Press Space instead.

## 6. Open (not G2's files)

- `src/fx/GroundDecals.js` (G1): Sir Wobble's parry ring is drawn under him now because his `object3d` follows him
  (PropActor.js) and Telegraphs.js reads `actor.pos` for detached prop roots (`detached()`); no GroundDecals change
  was needed.
- The Photo Cam firing during the prologue and the input-device label flip are G1 / core items (not touched).
