// src/story/cutscenes/cs10.js  (owner: story) — CS-10 Eighth Life (GAME_DESIGN §5.4) [MVP], ~30 s. Follows CS-09.
//   1 wide on the wall (`gate`): kittens cheer, then go quiet. Mochi: "Where's Sir Marmalade?"
//     → the Chapter 4 results card (§12.1: gate ends in this scene) → load `town` spawn `bakery_cot`
//   2 bakery doorway, exterior (no interior is built): Marmalade on a cot under the awning, bandaged, a bowl of soup.
//     "Eighth life. Used it up. Best catch of my career." (bedside: tavern_old_tower_inn, cozy, WA §9)
//   3 TWO_SHOT_LOW: she takes the yellowed letter from her belt and gives it to him. He reads. Long pause.
//     "...Seven months old. Look at that handwriting." "Doctor says bed and soup. You'll have to finish this one, Dame—"
//     Clem: "I'm not a dame."  Marmalade: "...Yet."
//   4 from the window toward the north: Barkus pulls the curtains, the Big Yawn rolls in (`hub_hush` lavender, fog
//     0.025 → 0.05 over 4 s); the lament only for this 4 s window shot (WA §8.6a).
//   5 medium (Earl Grey, Pip): "That's Barkus, pulling the curtains…" "And the ferry dock is where they send the
//     kittens…"  Clem: "Pearl."  Then home's tune, sleepy (village_bards_tale).
// end: flag gate.done; env hub_hush (until ending.seen); the Lookout (Pip) opens on gate.done; she stands at `town`
// spawn `hub`; save.
import { FADE_COLOR } from '../../core/config.js';
import { say, cam, wait, sfx } from './lib.js';
import { castFriend, hideParty, showParty, spoonRows, levelResults } from './cast.js';

/** §12.5 `bakery_cot` (−22,−20) faces the bakery (yaw −π/2); the cot lies under the awning at the door. */
export const COT = [-24.3, -20.2];
const ME_TOWN = [-22.6, -20.2];
const EARL = [-21.4, -22.0];
const PIP = [-21.2, -18.4];

/** Shot 1 on the gate: Mochi beside her and the cheering kittens behind. */
function wallCast(ctx, cs) {
  const me = ctx.player;
  if (!me) return;
  hideParty(ctx, cs, ['mochi']);
  const at = [me.pos.x, me.pos.z];
  castFriend(ctx, cs, 'mochi', [at[0] + Math.cos(me.facing) * 1.1, at[1] - Math.sin(me.facing) * 1.1], me.facing);
  const rows = spoonRows(ctx.state?.kittens ?? [], at, me.facing, { max: 6, back: 2.2 }).slice(0, 6);
  for (const r of rows) cs.spawnOne({ id: `cheer_${r.id}`, type: r.npc, kind: 'npc', at: r.at, facing: r.facing + Math.PI });
  cs._cheer = rows.map((r) => `cheer_${r.id}`);
}

function cheer(ctx, cs) { for (const id of cs._cheer ?? []) cs.actor(id)?.play?.('cheer', {}); }
function hush(ctx, cs) { for (const id of cs._cheer ?? []) { const a = cs.actor(id); a?.pose?.('idle'); a?.emote?.('earsFlat'); } }

/** Before the load: the gate cast goes, then the results card (once). */
async function toTown(ctx, cs) {
  for (const r of [...cs.spawned]) cs.despawnId(r.id);
  showParty(cs);
  if (!cs._results) { cs._results = true; await levelResults(ctx, 'gate'); }
}

/** The town scene's cast at the bakery. */
function bakeryCast(ctx, cs) {
  hideParty(ctx, cs, []);
  cs.spawnOne({ id: 'cot', prop: 'cot', kind: 'prop', at: COT, facing: 0 });
  cs.spawnOne({ id: 'marmalade', type: 'marmalade', kind: 'npc', at: COT, facing: Math.PI / 2 });
  const m = cs.actor('marmalade');
  if (m) { m.pose?.('sit'); m.prop?.('soup_bowl', true); m.setExpression?.('sleepy'); }
  cs.spawnOne({ id: 'earlgrey', type: 'earlgrey', kind: 'npc', at: EARL, facing: 'marmalade', visible: false });
  cs.spawnOne({ id: 'pip', type: 'pip', kind: 'npc', at: PIP, facing: 'marmalade', visible: false });
}

export default {
  id: 'cs10', kind: 'cutscene', skippable: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'call', fn: wallCast },

    // ---- 1 · the wall cheers, then goes quiet
    cam(null, 'swordcat', { pos: [-3.4, 2.2, 5.0], look: [0, 0.6, -1.2], fov: 48 }),
    { t: 'call', fn: cheer },
    sfx('cs10.cheer', 'swordcat'),
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'happy' },
    wait(2.2),
    { t: 'call', fn: hush },
    { t: 'actor', id: 'mochi', face: [0, 60], faceDur: 0.5, expression: 'worried' },
    wait(0.8),
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'mochi', pos: [1.5, 0.8, 1.4], fov: 40 }),
    say('mochi', 'cs10.1', 2.4),
    { t: 'actor', id: 'swordcat', expression: 'worried', emote: 'earsFlat' },
    wait(0.6),
    { t: 'ui', fade: { to: FADE_COLOR, alpha: 1, dur: 0.9 } },
    wait(1.0),
    { t: 'call', fn: toTown, max: 20 },

    // ---- 2 · the bakery awning: Marmalade on a cot
    { t: 'load', level: 'town', spawn: 'bakery_cot' },
    { t: 'music', track: 'tavern_old_tower_inn', fade: 1.5 },
    { t: 'call', fn: bakeryCast },
    { t: 'actor', id: 'swordcat', at: ME_TOWN, facing: -Math.PI / 2, pose: 'idle', expression: 'worried', prop: { 'letter@belt': true } },
    cam(null, 'swordcat', { pos: [1.4, 1.4, 1.2], look: [0, 0.55, 2.0], fov: 44 }),
    { t: 'ui', fade: { alpha: 0, dur: 1.2 } },
    wait(1.2),
    say('marmalade', 'cs10.2', 3.2),

    // ---- 3 · the letter
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'marmalade', pos: [2.0, 0.72, 0.85], fov: 40, lookMid: 0.55 }),
    { t: 'actor', id: 'swordcat', prop: { 'letter@belt': false, letter: true }, expression: 'earnest' },
    sfx('cs10.letter', 'swordcat'),
    wait(0.9),
    { t: 'actor', id: 'swordcat', prop: { letter: false } },
    sfx('cs10.soup', 'marmalade'),
    { t: 'actor', id: 'marmalade', prop: { soup_bowl: false, letter: true }, expression: 'glisten' },
    wait(2.4),
    say('marmalade', 'cs10.3', 3.4),
    say('marmalade', 'cs10.4', 3.8),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    say('swordcat', 'cs10.5', 1.6),
    wait(0.5),
    { t: 'actor', id: 'marmalade', expression: 'happy' },
    say('marmalade', 'cs10.6', 1.4),

    // ---- 4 · the Big Yawn rolls in from the north (the only lament: this window shot)
    { t: 'cam', anchor: [0, 0, 0], mode: 'cut', pos: [-21.6, 1.3, -21.4], look: [-12, 5, 30], fov: 50 },
    { t: 'music', track: 'story_lament_warriors_soul', fade: 1.0 },
    { t: 'env', preset: 'hub_hush', dur: 4 },
    { t: 'env', fogDensity: 0.05, dur: 4 },
    sfx('cs10.gloom'),
    wait(4.2),

    // ---- 5 · Earl Grey and Pip (home's tune again, sleepy)
    { t: 'music', track: 'village_bards_tale', fade: 2.0 },
    { t: 'actor', id: 'earlgrey', visible: true },
    { t: 'actor', id: 'pip', visible: true },
    cam(null, 'swordcat', { pos: [-1.6, 1.0, 2.4], look: [0.6, 0.6, 0.2], fov: 44 }),
    { t: 'actor', id: 'swordcat', face: 'earlgrey', faceDur: 0.4, expression: 'earnest' },
    say('earlgrey', 'cs10.7', 5.0),
    { t: 'actor', id: 'swordcat', face: 'pip', faceDur: 0.4 },
    say('pip', 'cs10.8', 3.8),
    { t: 'actor', id: 'swordcat', expression: 'determined', pose: 'vigil' },
    cam('ECU_EYES', 'swordcat', {}),
    say('swordcat', 'cs10.9', 1.6),
    wait(0.6),
    { t: 'ui', fade: { to: FADE_COLOR, alpha: 1, dur: 1.0 } },
    wait(1.1),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => { if (phase === 'before') showParty(cs); },
    flags: { 'gate.done': true },
    load: async (ctx, cs) => {
      if (ctx.levels?.current?.id === 'town') return null;
      if (!cs._results) { cs._results = true; await levelResults(ctx, 'gate'); }
      return { level: 'town', spawn: 'hub' };
    },
    player: { spawn: 'hub' },
    actors: { swordcat: { prop: { 'letter@belt': false, letter: false } } },
    env: 'hub_hush',
    music: { track: 'village_bards_tale', fade: 2 },
    ui: { letterbox: false, hud: true, fade: { alpha: 0, dur: 1.2 } },
    cam: 'follow',
    save: true,
  },
};
