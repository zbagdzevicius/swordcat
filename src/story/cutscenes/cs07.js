// src/story/cutscenes/cs07.js  (owner: story) — CS-07 The Red Cape (GAME_DESIGN §5.4) [MVP], ~35 s.
// `town` trigger `steps` (disc r 5 at (0,34), active after the square is clear and Clover is free); env hub_gold.
//   1 CRANE_DOWN from the sleepy Sunbell (warm brass, eyes closed; world's bell, WA §8.6a) to the Castle Steps: the cellar door opens, Princess Snowpaw with Marmalade.
//     "You chased off the Legion. All of them. By yourself?"  Clem: "With friends."  Mochi: "Mostly her."
//   2 TWO_SHOT_LOW: Snowpaw unfolds a red cloth; the cape swaps cream → red (ref2). "The Royal Wardrobe has nothing your
//     size. Except this." "It was a tablecloth. Velvet, mostly."  Clem: "...Thank you, Your Highness."
//   3 low, up at the sleepy bell; Marmalade points with his walking-stick sword: "The Dawnstone's in three pieces now…"
//     "The rats say the hyenas have the second…"  Clem: "Then I'll be at the gate."
//   4 wide: villagers peek out, kittens run to the fountain. Toasts: "Pawsbury is free!" · "Shops are open." ·
//     "Kittens you rescue will live here."
// end: flag town.free (the hub stations open on it); cape `red` unlocked and equipped; env hub_gold; save; then the
// chapter results (§12.1: town ends in this scene; it becomes the hub, so nothing loads).
import { say, cam, wait, sfx, yawOf } from './lib.js';
import { castFriend, hideParty, showParty, toast, equipCape } from './cast.js';

/** §12.5 Castle Steps: Snowpaw (0,40), the trigger disc (0,34); the Bell Tower with the sleepy Sunbell at (0,54). */
export const STEPS = [0, 36.4];
const SNOWPAW = [-0.5, 39.6];
const MARMALADE = [1.1, 40.4];
const MOCHI = [1.3, 35.2];
const BELL = [0, 14, 54];
const VILLAGERS = [[-6, 29], [5.5, 28], [-4, 24], [7, 31]];

function cast(ctx, cs) {
  hideParty(ctx, cs, ['mochi']);
  castFriend(ctx, cs, 'mochi', MOCHI, 0.1);
}

/** Stand spawned cast on the step treads: a spawn point resolves to the terrain under the stone steps, which would
 *  leave Snowpaw and Marmalade sunk to their necks in the masonry. */
function onTheSteps(ctx, cs) {
  const ph = ctx.physics;
  if (typeof ph?.groundAt !== 'function') return;
  for (const id of ['snowpaw', 'marmalade']) {
    const a = cs.actor(id);
    if (!a?.pos) continue;
    const y = ph.groundAt(a.pos.x, a.pos.z, a.pos.y + 3);
    if (Number.isFinite(y) && y > a.pos.y) { a.pos.y = y; a.vel?.set?.(0, 0, 0); a.snap?.(); }
  }
}

/** Low two-shots onto Snowpaw from in front of her (on Clem's right, a step below her): her face, not her back. */
const ON_SNOWPAW = { target: 'snowpaw', pos: [1.9, 0.85, -0.2], fov: 40, lookMid: 1.1 };

export default {
  id: 'cs07', kind: 'cutscene', skippable: true,
  results: 'town',
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 1.5 },
    { t: 'env', preset: 'hub_gold', dur: 6, nowait: true },
    { t: 'actor', id: 'swordcat', at: STEPS, facing: 0, pose: 'idle', expression: 'earnest' },
    { t: 'call', fn: cast },
    { t: 'spawn', id: 'snowpaw', type: 'snowpaw', at: SNOWPAW, facing: Math.PI, visible: false },
    { t: 'spawn', id: 'marmalade', type: 'marmalade', at: MARMALADE, facing: Math.PI, visible: false },
    ...VILLAGERS.map((p, i) => ({ t: 'spawn', id: `villager_${i + 1}`, type: `villager_${31 + i}`, at: p, facing: yawOf([-p[0], 36 - p[1]]), visible: false })),
    { t: 'call', fn: onTheSteps },

    // ---- 1 · crane from the dark Sunbell down to the steps; it settles high enough (2.6 m, 5.6 m back from Clem)
    // to see over the step lips onto Clem, Mochi and the two on the treads above them
    { t: 'cam', anchor: [0, 0, 0], mode: 'rail', pos: [2.5, 16, 44], to: [2.6, 2.6, 30.8], look: BELL, lookTo: [0, 1.15, 38.0], fov: [34, 40], dur: 7, ease: 'inOutSine', nowait: true },
    wait(4.6),
    sfx('cs07.door', 'snowpaw'),
    { t: 'actor', id: 'snowpaw', visible: true, moveTo: [-0.4, 38.0], speed: 1.3, nowait: true },
    { t: 'actor', id: 'marmalade', visible: true, moveTo: [1.2, 38.9], speed: 1.0, nowait: true },
    wait(2.6),
    cam('TWO_SHOT_LOW', 'swordcat', ON_SNOWPAW),
    say('snowpaw', 'cs07.1', 3.4, { expression: 'surprised' }),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    say('swordcat', 'cs07.2', 1.4),
    { t: 'actor', id: 'mochi', clip: 'cheer' },
    cam(null, 'swordcat', { pos: [-1.6, 0.85, 1.8], look: [0.9, 0.6, -0.3], fov: 40 }),
    say('mochi', 'cs07.3', 1.4),

    // ---- 2 · the red cloth
    cam('TWO_SHOT_LOW', 'swordcat', { ...ON_SNOWPAW, pos: [1.6, 0.75, -0.1], fov: 38 }),
    { t: 'actor', id: 'snowpaw', expression: 'happy' },
    say('snowpaw', 'cs07.4', 3.0),
    sfx('cs07.cape', 'swordcat'),
    { t: 'call', fn: (ctx, cs) => { cs.host?.unlock?.('cape', 'red'); equipCape(ctx, 'red'); } },
    { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 24, color: '#FF8A8A' },
    { t: 'actor', id: 'swordcat', expression: 'surprised' },
    say('snowpaw', 'cs07.5', 2.6),
    cam(null, 'swordcat', { pos: [-0.9, 0.7, -1.9], look: [0, 0.55, 0.2], fov: 42 }),
    wait(1.4),
    { t: 'actor', id: 'swordcat', pose: 'kneel', expression: 'earnest' },
    cam(null, 'swordcat', { pos: [1.4, 0.6, 0.5], look: [0, 0.45, 0.1], fov: 40 }),   // from the first tread, clear of the lip
    say('swordcat', 'cs07.6', 2.0),
    { t: 'actor', id: 'swordcat', pose: 'idle' },

    // ---- 3 · up at the dark bell; Marmalade points
    { t: 'cam', anchor: [0, 0, 0], mode: 'cut', pos: [1.6, 0.6, 33.2], look: BELL, fov: 46 },
    { t: 'actor', id: 'marmalade', face: [0, 54], faceDur: 0.5, pose: 'oath' },
    sfx('cs07.point', 'marmalade'),
    say('marmalade', 'cs07.7', 3.4),
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'marmalade', pos: [3.4, 1.0, -0.6], fov: 44, lookMid: 1.3 }),
    { t: 'actor', id: 'marmalade', face: 'swordcat', faceDur: 0.4, pose: 'idle' },
    say('marmalade', 'cs07.8', 4.4),
    { t: 'actor', id: 'swordcat', expression: 'determined', pose: 'vigil' },
    say('swordcat', 'cs07.9', 2.2),

    // ---- 4 · wide: the town comes out
    { t: 'cam', anchor: [0, 0, 0], mode: 'rail', pos: [7, 4.5, 24], to: [8.5, 6.5, 20], look: [0, 1.2, 33], lookTo: [0, 1.0, 22], fov: [48, 50], dur: 6, nowait: true },
    { t: 'music', track: 'village_bards_tale', fade: 2 },
    ...VILLAGERS.map((p, i) => ({ t: 'actor', id: `villager_${i + 1}`, visible: true, moveTo: [p[0] * 0.4, 12 + i * 1.2], speed: 2.2 + i * 0.3, nowait: true })),
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'happy' },
    sfx('cs07.free', 'swordcat'),
    { t: 'ui', toast: 'toast.free' },
    wait(1.8),
    { t: 'ui', toast: 'toast.shops' },
    wait(1.8),
    { t: 'ui', toast: 'toast.hub' },
    wait(1.6),
    { t: 'call', fn: (ctx, cs) => { cs._toasted = true; } },
  ],
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') showParty(cs);
      else {
        equipCape(ctx, 'red');
        if (!cs._toasted) toast(ctx, ['toast.free', 'toast.shops', 'toast.hub']);
      }
    },
    flags: { 'town.free': true },
    unlock: [{ kind: 'cape', id: 'red' }],
    env: 'hub_gold',
    music: { track: 'village_bards_tale', fade: 2 },
    actors: { swordcat: { pos: STEPS, facing: Math.PI } },
    cam: 'follow',
    save: true,
  },
};
