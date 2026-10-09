// src/enemies/types/hyena.js  (owner: enemies) — Hyena Raider (GAME_DESIGN §10.2–§10.3; Appendix B.3 shape).
// The look: Barbarian.glb + characters' hyena head + scratched plate + Skeleton_Blade. Full M2 AI:
//   hyena_slash (white glint) and hyena_lunge (red, unblockable dash from 3–5 m);
//   Gloat: after it lands any hit on her it laughs 1.0 s and doesn't attack; a hit during the Gloat chokes it
//          ("hrk!", stagger 1.0 s, enemy:choke → +10 Valor);
//   Jeer:  while it waits for a token and she is within 10 m (one jeerer per pack, 12 s cooldown): head-throw 0.5 s,
//          aura r 8 for 2.0 s (enemy:jeer; env fog +0.01); a hit chokes it and ends the aura;
//   Pack flank: the 2nd and later attackers take the "behind" slot, circle to her back and giggle 0.6 s first.
// Objective runners (The Line) run for the winch and fight only if she's within 3 m (Enemy.runnerStep).
// CS-02 spawns them scripted and AI-less: ctx.enemies.spawn('hyena', pos, { id, scripted: true, ai: false, cage, word }).
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { M2 } from '../tuning.js';
import { dressKayKit } from './kaykitGear.js';
import { GLOAT, JEER, GIGGLE, canJeer, flankPoint, isBehind, jeerOff } from './hyenaStates.js';

const def = ENEMIES.hyena;

export const HYENA_ANIMS = {
  ...CLIP_MAPS.kaykit.roles,
  hyena_slash: { windup: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0.35, to: 1, speed: 1.3 } },
  hyena_lunge: { windup: { clip: '1H_Melee_Attack_Stab', from: 0, to: 0.3, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Stab', from: 0.3, to: 1, speed: 1.4 } },
};

export default {
  ...def,
  id: 'hyena',
  anims: HYENA_ANIMS,
  expression: 'sneer',
  build: (e, m) => dressKayKit(e, m, {
    look: 'hyena', headNode: 'Barbarian_Head', head: { chippedEar: e.seed % 3 === 0 ? 'left' : null }, weapon: def.weapon, expression: 'sneer',
  }),
  states: { gloat: GLOAT, jeer: JEER, giggle: GIGGLE },
  onHitWhile: { gloat: 'choke', jeer: 'choke' },
  /** Despawned mid-jeer (level unload, arena reset): the aura and its fog go with it. */
  onDispose(e) { jeerOff(e); },

  /** Gloat: any landed hit on her (not blocked / parried) → laugh instead of the recover. */
  onDealtHit(e, h) {
    if (!e.alive || e.stateName === 'gloat' || e.stateName === 'jeer' || e.staggerT > 0) return;
    if (h.target !== e.ctx.player) return;
    e.setState('gloat');
  },

  /** While it waits for a token: Jeer when allowed. */
  whileWaiting(e, p, d) {
    if (e.objectiveRunner || e.cooldownT > 0) return false;
    if (!canJeer(e)) return false;
    e.setState('jeer');
    return true;
  },

  /** Pack flank: flankers head for her back. */
  approachPoint(e, p, keep, out) { return flankPoint(e, p, keep, out); },

  /** Flankers attack from behind (or after M2.flank.maxApproach s of trying), after a giggle. */
  readyToAttack(e, p, atk) {
    if (!e.flanker) return true;
    return isBehind(e, p) || (e.ctx.game?.time ?? 0) - (e.flankAt ?? 0) >= M2.flank.maxApproach;
  },
  startAttack(e, atk) {
    if (!e.flanker) return e.beginAttack(atk);
    e.pendingAttack = atk; e.attackChoice = null;
    e.setState('giggle');
  },
};
