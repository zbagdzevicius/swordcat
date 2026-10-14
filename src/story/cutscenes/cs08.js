// src/story/cutscenes/cs08.js  (owner: story) — CS-08 Nobody's Coming (GAME_DESIGN §5.4) [MVP, NEVER CUT] [TREND V2, V5].
// `gate`, The Line at 70% repair (StoryManager waits up to 10 s for ≤ 2 enemies alive and no telegraph, then plays it;
// world's Line controller may also call play('cs08') — a second request for a queued / running id is merged).
//   1 0:00–0:04 MEME_LOOP: she stands at the Line marker. Music cut; wind only.
//   2 0:04–0:10 REVERSE_HORDE: the fog bank 40 m ahead fills: 40 instanced silhouettes + 6 real raiders, laughing.
//   3 0:10–0:14 ECU_EYES: her ears flatten. (barely audible) "Nobody's coming." (beat) "So I'm staying."
//   4 0:14–0:20 PULLBACK: behind her stand the rescued kittens in pot helmets and colanders, holding spoons:
//     max(3, rescued) capped at 18, rows of 6 at 1.0 m, from 2.5 m behind her; villager kittens fill in (never kittens
//     that are still lost). The active companion (and Mochi, spawned even if another companion is active) in front.
//   5 0:20–0:30 TWO_SHOT_LOW (Mochi, Clem), battle_theme_a hits: "We're not leaving you out here by yourself."
//     Kitten A: "I brought a spoon!"  Kitten B: "I brought two!"  Clem (very quietly): "...Thank you."
// end: the Spoon Brigade is on (flag gate.spoons; companions' SpoonBrigade); world's Line starts wave W4.
import { say, cam, wait, sfx } from './lib.js';
import { memeLook } from './rig.js';
import { spoonRows, spoonSpeakers, castFriend, clearEnemies, hideParty, showParty } from './cast.js';

/** §12.6: the Line marker (a chalk line at z +10), facing the causeway's south end. */
export const LINE_AT = [0, 10];
export const FACE_SOUTH = Math.PI;
/** 6 real raiders in the fog bank, ~34–38 m ahead. */
const RAIDERS = [[-4.2, -24], [-1.6, -26.5], [1.2, -24.8], [3.8, -27], [-2.8, -28.5], [2.6, -29.5]];

/** The rows chosen for this playthrough (stored on the scene so steps agree). */
const rowsOf = (ctx, cs) => (cs._rows ??= spoonRows(ctx.state?.kittens ?? [], LINE_AT, FACE_SOUTH));
const speaker = (i) => (ctx, cs) => spoonSpeakers(rowsOf(ctx, cs))[i];

function setup(ctx, cs) {
  clearEnemies(ctx);                                       // the leftovers of W3 (§12.6: despawned at the cut)
  hideParty(ctx, cs, ['mochi']);
  for (const r of rowsOf(ctx, cs)) {
    cs.spawnOne({ id: r.id, type: r.npc, kind: 'npc', at: r.at, facing: r.facing, visible: false });
    const a = cs.actor(r.id);
    if (a) { a.prop?.(r.prop, true); a.prop?.('spoon', true); }
  }
  castFriend(ctx, cs, 'mochi', [LINE_AT[0] + 0.9, LINE_AT[1] + 1.3], FACE_SOUTH);
  const m = cs.actor('mochi');
  if (m?.object3d) m.object3d.visible = false;
  const other = (ctx.companions?.active ?? []).find((c) => c.kittenId !== 'mochi');
  if (other) { cs.script(other); cs.place(other, [LINE_AT[0] - 0.9, LINE_AT[1] + 1.3], FACE_SOUTH); cs._other = other; }
  RAIDERS.forEach((p, i) => cs.spawnOne({ id: `raider_${i + 1}`, type: 'hyena', kind: 'enemy', at: p, facing: 0, opts: { word: ['GRUMP', 'GRUMBLER', 'SCOFFER', 'NAYSAYER', 'SNEERER', 'SPOILER'][i] } }));
}

/** Shot 4: the kittens appear (spawned hidden at the start so their fur builds never pop on screen). */
function reveal(ctx, cs) {
  for (const r of rowsOf(ctx, cs)) { const a = cs.actor(r.id); if (a?.object3d) a.object3d.visible = true; }
  const m = cs.actor('mochi');
  if (m?.object3d) m.object3d.visible = true;
  if (cs._other?.object3d) cs._other.object3d.visible = true;
}

/** Raiders laugh in the fog; the purple Jeer read comes from their pose + the laugh chorus. */
function raidersLaugh(ctx, cs) {
  for (let i = 1; i <= RAIDERS.length; i++) { const a = cs.actor(`raider_${i}`); a?.pose?.('laugh'); a?.emote?.('laugh'); }
}

/** The Spoon Brigade (§9.3) takes over from the scene's kittens. */
function spoonsOn(ctx) {
  const c = ctx.companions;
  try {
    if (typeof c?.spoonBrigade === 'function') c.spoonBrigade(true);
    else if (typeof c?.setSpoonBrigade === 'function') c.setSpoonBrigade(true);
    else c?.spoons?.start?.();
  } catch (e) { console.warn('[story] spoon brigade failed', e); }
}

export default {
  id: 'cs08', kind: 'cutscene', skippable: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 0.25 },
    { t: 'actor', id: 'swordcat', at: LINE_AT, facing: FACE_SOUTH, pose: 'vigil', expression: 'earnest' },
    { t: 'call', fn: setup },
    { t: 'env', wind: 1.4, dur: 1.0, nowait: true },

    // ---- 1 · MEME_LOOP: stillness, wind only
    { t: 'actor', id: 'swordcat', pose: 'oath' },
    { t: 'call', fn: (ctx) => memeLook(ctx, true) },
    { t: 'cam', preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' },
    wait(4.0),

    // ---- 2 · REVERSE_HORDE: the fog bank fills
    { t: 'call', fn: (ctx) => memeLook(ctx, false) },
    cam('REVERSE_HORDE', 'swordcat', { fov: 38 }),
    { t: 'fx', horde: 'mill', at: [0, -32], dir: [0, 0, 1], width: 16, length: 14, face: 'swordcat', laugh: 1.0 },
    { t: 'call', fn: raidersLaugh },
    { t: 'sfx', id: 'cs08.horde', at: [0, -26], handle: 'chorus' },
    wait(6.0),

    // ---- 3 · ECU: "Nobody's coming." … "So I'm staying."
    { t: 'actor', id: 'swordcat', emote: 'earsFlat', expression: 'glisten', pose: 'vigil' },
    sfx('cs08.ears', 'swordcat'),
    cam('ECU_EYES', 'swordcat', { mode: 'handheld', noise: 0.0025 }),
    wait(1.0),
    say('swordcat', 'cs08.1', 1.6, { talk: null }),
    wait(0.6),
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'blink' },
    say('swordcat', 'cs08.2', 1.2),

    // ---- 4 · PULLBACK: she was never alone
    { t: 'sfx', stop: 'chorus', fade: 1.5 },
    { t: 'call', fn: reveal },
    { t: 'actor', id: 'swordcat', pose: 'oath' },
    { t: 'cam', preset: 'PULLBACK', anchor: 'swordcat', mode: 'rail', dur: 6.0, nowait: true },
    sfx('cs08.spoons', [0, 13]),
    wait(6.0),

    // ---- 5 · Mochi and the spoons
    { t: 'music', track: 'battle_theme_a', fade: 0.2 },
    { t: 'actor', id: 'swordcat', face: 'mochi', faceDur: 0.4, pose: 'idle', expression: 'surprised' },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'mochi', pos: [1.6, 0.8, 1.4], fov: 40 }),
    { t: 'actor', id: 'mochi', face: 'swordcat', faceDur: 0.3, expression: 'determined' },
    say('mochi', 'cs08.3', 3.4),
    cam(null, 'swordcat', { pos: [0.4, 1.3, -2.6], look: [0, 0.4, 3.4], fov: 44 }),
    { t: 'actor', id: 'spoon_1', clip: 'cheer', emote: 'tailPuff' },
    say(null, 'cs08.4', 1.8, { who: (ctx, cs) => speaker(0)(ctx, cs)?.id ?? 'spoon_1', name: (ctx, cs) => speaker(0)(ctx, cs)?.name ?? 'name.villager', portrait: 'kitten' }),
    { t: 'actor', id: 'spoon_2', clip: 'jump' },
    say(null, 'cs08.5', 1.6, { who: (ctx, cs) => speaker(1)(ctx, cs)?.id ?? 'spoon_2', name: (ctx, cs) => speaker(1)(ctx, cs)?.name ?? 'name.villager', portrait: 'kitten' }),
    cam('ECU_EYES', 'swordcat', { pos: [0.12, 0.74, 0.55], look: [0, 0.76, 0], fov: 30 }),
    { t: 'actor', id: 'swordcat', expression: 'glisten', emote: 'blink' },
    wait(0.6),
    say('swordcat', 'cs08.6', 2.0, { talk: null }),
    { t: 'actor', id: 'swordcat', expression: 'determined', face: FACE_SOUTH, faceDur: 0.5 },
    wait(0.4),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') { memeLook(ctx, false); showParty(cs); }
      else spoonsOn(ctx);
    },
    flags: { 'gate.spoons': true },
    actors: { swordcat: { pos: LINE_AT, facing: FACE_SOUTH } },
    despawns: ['raider_*', 'spoon_*'],
    music: { track: 'battle_theme_a', fade: 0.5 },
    ui: { letterbox: false, hud: true },
    cam: 'follow',
    save: true,
  },
};
