// src/story/cutscenes/tutbow.js  (owner: story) — Morning Practice P2b "Pink Bow!" (WA §7.2, ON §4.2), ~7 s in-engine.
// Right after the bonk lesson: Pearl hops up behind her and straightens the pink bow on her LEFT ear (a soft white flash,
// 14 pink sparkles). Flavour only: Clem wears the bow from the first frame (founder call 2026-10-14), so the
// `tunic_bow` outfit looks the same as `tunic_sword`. No letterbox, the HUD stays, any input after 0.6 s skips.
//   Pearl: "There! Now you look like a REAL hero."   Clem: "I already was one."   Pearl: "Obviously."
// end: outfit tunic_bow (also when skipped); the friend-size **Pink Bow!** reward (E.REWARD); Pearl stays (the guide).
import { reward } from '../rewards.js';
import { say, cam, wait, sfx } from './lib.js';
import { outfit, beside } from './rig.js';

/** Pearl ties the bow from just behind Clem's left shoulder (m left, m back). */
export const TIE = Object.freeze({ side: 0.42, back: 0.3 });

/** Pearl: the practice guide when she is there, else spawned just behind Clem. */
function castPearl(ctx, cs) {
  const me = ctx.player;
  const [x, z] = beside(me, TIE.side + 1.0, TIE.back + 0.6);
  if (!cs.actor('pearl')) cs.spawnOne({ id: 'pearl', type: 'npc', at: [x, z], facing: me?.facing ?? 0, keep: true });
  else cs.script(cs.actor('pearl'));
}

export default {
  id: 'tutbow', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, hud: true, inputSkip: 0.6,
  steps: [
    { t: 'call', fn: castPearl },
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'happy' },
    { t: 'call', fn: (ctx, cs) => cs.actor('pearl')?.moveTo?.(beside(ctx.player, TIE.side, TIE.back), 3.2), max: 2.5 },
    { t: 'actor', id: 'pearl', face: 'swordcat', faceDur: 0.25 },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pearl', pos: [1.3, 0.7, 1.5], fov: 36 }),
    { t: 'actor', id: 'pearl', clip: 'jump', nowait: true },
    wait(0.5),
    { t: 'ui', fade: { to: '#FFF6E2', alpha: 0.4, dur: 0.15 } },
    wait(0.18),
    { t: 'call', fn: (ctx) => outfit(ctx, 'tunic_bow') },
    { t: 'ui', fade: { alpha: 0, dur: 0.4 } },
    { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 14, color: '#FFD2DE' },
    sfx('cat/cat_softmew', 'pearl', { vol: 0.7 }),
    { t: 'actor', id: 'swordcat', emote: 'bowBounce', expression: 'surprised' },
    say('pearl', 'tutbow.1', 2.2),
    { t: 'actor', id: 'swordcat', face: 'pearl', faceDur: 0.3, expression: 'determined' },
    say('swordcat', 'tutbow.2', 1.4),
    { t: 'actor', id: 'pearl', clip: 'nod', nowait: true },
    say('pearl', 'tutbow.3', 1.2),
  ],
  end: {
    keep: ['pearl'],
    player: { outfit: 'tunic_bow' },
    call: (ctx, cs, skipped, phase) => {
      if (phase !== 'after') return;
      reward(ctx, 'friend', 'bow');
    },
    ui: { letterbox: false, hud: true },
    cam: 'follow',
  },
};
