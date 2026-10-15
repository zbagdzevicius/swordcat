// src/enemies/types/pug.js  (owner: enemies) — Pug Shieldbearer (GAME_DESIGN §10.2–§10.3).
// Knight.glb at 1.25 m with characters' pug head. WA §3.1 toy soldier, never the hero's silver read: the Knight atlas is
// repainted plum / mustard tin (palette.js), the steel visor helm and 1H_Sword are hidden for a mustard saucepan helm
// (props.js potHelm; the face stays clear) and a wooden practice sword (props.js practiceSword); the Rectangle_Shield
// stays (painted, it is the shield-down tell). Turns at only 120°/s (def.turnRate), so flanking works.
//   Shield    frontal ±70° hits spark for 0 damage (`resolveIncoming` → 'block'). Broken by `bright`, `holy`, a
//             `pounce` from above, or parrying `pug_bash` → the shield drops for 4.0 s and it staggers 1.5 s (2.0 s
//             after the parry).
//   pug_bash  white glint 0.6 s on the shield rim → 1.5 m, 2 damage, knockback 8.
//   pug_slam  red 1.0 s (raises the shield high; a red circle on the ground) → a shockwave ring expanding to r 2.5
//             over 0.4 s, 0.3 m tall: 2 damage, unblockable. Jump it or roll through.
//   pug_chop  white glint 0.5 s, arc ±0.8, 1.7 m — only while the shield is down.
import * as THREE from 'three';
import { ENEMIES } from '../../core/config.js';
import { E } from '../../core/events.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { TUNING, M2 } from '../tuning.js';
import { BASE_STATES } from '../Enemy.js';
import { dressKayKit, seatOnHead } from './kaykitGear.js';
import { ringAt } from '../moves.js';

const def = ENEMIES.pug;
const SH = def.shield;

/** Knight.glb props: only the (repainted) shield shows; the visor helm and the steel sword never do (WA §3.1). */
export const PUG_SHOW = Object.freeze(['Rectangle_Shield']);
export const PUG_HIDE = Object.freeze([...new Set([...(def.hide ?? []), 'Knight_Helmet', '1H_Sword', 'Knight_Cape'])]);
/** WA §3.1 toy gear: the practice sword in the right fist (built along the hand slot's +Y, like KayKit blades). */
export const PUG_SWORD = Object.freeze({ prop: 'practiceSword', own: true, hand: 'r', opts: Object.freeze({ p: [0, 0, 0], r: [0, 0, 0], s: 1.1 }) });

/** Dress a pug: beast head, the practice sword, the saucepan helm (spins off on defeat, §10.1). */
export async function dressPug(e, m) {
  await dressKayKit(e, m, { look: 'pug', headNode: 'Knight_Head', head: { scale: (def.helmetScale ?? 1) * 1.15 }, plate: false, expression: 'angry', hold: PUG_SWORD });
  if (e.disposed) return;
  const pot = seatOnHead(e, m, 'potHelm', { brim: 0.7, width: 0.78, tilt: -0.12 });
  if (pot) e.helmet = pot;
}

/**
 * Does `atk` (attack def, attacker) break the pug's shield? `bright` / `holy` (and any guardBreak attack), a pounce
 * from above. Pure; exported for tests.
 */
export function breaksShield(atk, attacker, pug) {
  if (!atk) return false;
  const by = SH.brokenBy ?? [];
  if (atk.guardBreak || by.includes(atk.id)) return true;
  if (atk.id === 'pounce' && by.includes('pounceFromAbove')) {
    const ay = attacker?.pos?.y ?? 0;
    return ay > (pug?.pos?.y ?? 0) + (pug?.height ?? 1.25) * 0.45 || (attacker?.vel?.y ?? 0) < -2;
  }
  return false;
}

/** Is a hit travelling along `hitDir` (into the pug) frontal for a pug facing `facing`? Pure. */
export function frontalHit(hitDir, facing, arc = SH.arc) {
  return -(hitDir.x * Math.sin(facing) + hitDir.z * Math.cos(facing)) >= Math.cos(arc);
}

/**
 * TT3 (§11.4): true while the pug's shield is up and `dir` (the direction a hit travels INTO it, like `frontalHit`)
 * meets its front arc. Pure apart from reading `e`; exported for tests.
 * @param {{alive?: boolean, shieldDownT?: number, facing: number, stateName?: string}} e @param {{x: number, z: number}} dir
 */
export function blocksFrom(e, dir) {
  if (!e || e.alive === false || e.shieldDownT > 0 || e.stateName === 'die' || !dir) return false;
  if (!Number.isFinite(dir.x) || !Number.isFinite(dir.z) || (dir.x === 0 && dir.z === 0)) return false;
  const l = Math.hypot(dir.x, dir.z);
  return frontalHit({ x: dir.x / l, z: dir.z / l }, e.facing);
}

function shieldNode(e) {
  if (e._shieldNode !== undefined) return e._shieldNode;
  e._shieldNode = e.model?.scene?.getObjectByName('Rectangle_Shield') ?? null;
  return e._shieldNode;
}

/** Drop the shield for `SH.downFor` s and stagger `sec`. */
function breakShield(e, sec) {
  if (!e.alive) return;
  e.shieldDownT = SH.downFor ?? 4;
  const n = shieldNode(e);
  if (n) n.visible = false;
  e.ctx.bus.emit(E.BURST, { kind: 'metal', position: e.pos.clone().setY(e.pos.y + e.height * 0.5), count: 8 });
  e.ctx.bus.emit(E.BURST, { kind: 'spark', position: e.pos.clone().setY(e.pos.y + e.height * 0.5), count: 10 });
  e.ctx.audio?.play3D?.('pugSnort', e);
  e.attackChoice = null;
  e.stagger(sec);
}

export default {
  ...def,
  id: 'pug',
  expression: 'angry',
  anims: {
    ...CLIP_MAPS.kaykit.roles,
    pug_bash: { windup: { clip: 'Block_Attack', from: 0, to: 0.4, speed: 'fit' }, strike: { clip: 'Block_Attack', from: 0.4, to: 1, speed: 1.3 } },
    pug_slam: { windup: { clip: '2H_Melee_Attack_Chop', from: 0, to: 0.4, speed: 'fit' }, strike: { clip: '2H_Melee_Attack_Chop', from: 0.4, to: 1, speed: 1.2 } },
    pug_chop: { windup: { clip: '1H_Melee_Attack_Chop', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Chop', from: 0.35, to: 1, speed: 1.3 } },
  },
  show: PUG_SHOW, hide: PUG_HIDE,
  build: dressPug,
  init(e) {
    e.shieldDownT = 0;
    // TT3 contract (§11.4): does the raised shield stop something travelling along `dir` (into the pug)? The ":3" coin
    // clangs off the front and hits from the side.
    e.blocksFrom = (dir) => blocksFrom(e, dir);
  },
  tick(e, dt) { if (e.shieldDownT > 0) e.shieldDownT = Math.max(0, e.shieldDownT - dt); },

  /** pug_chop only while the shield is down; bash / slam only while it's up. */
  canUse(e, a) { return a.onlyShieldDown ? e.shieldDownT > 0 : e.shieldDownT <= 0; },

  resolveIncoming(e, att, atk, hitDir) {
    if (!e.alive || e.shieldDownT > 0 || e.stateName === 'die') return 'hit';
    if (breaksShield(atk, att?.isProjectile ? att.owner : att, e)) { breakShield(e, SH.stagger ?? 1.5); return 'hit'; }
    return hitDir && frontalHit(hitDir, e.facing) ? 'block' : 'hit';
  },

  /** Parrying pug_bash breaks the shield (2.0 s stagger: the row's parriedStun). */
  onParried(e, by, { gold }) {
    if (e.attack?.id !== 'pug_bash') return false;
    breakShield(e, e.attack.def?.parriedStun ?? 2.0);
    return true;
  },

  render(e, dt) {
    if (e.shieldDownT > 0) return;
    const n = shieldNode(e);
    if (n && !n.visible) n.visible = true;
  },

  states: {
    chase: {
      // shield up and close: it stands its ground behind the shield (Blocking) while it waits / closes in
      anim: (e) => {
        const sp = Math.hypot(e.vel.x, e.vel.z);
        if (e.shieldDownT <= 0 && sp < 1.2 && e.distToPlayer() < M2.pug.guardWithin) return ['guard', { loop: true }];
        return 'move';
      },
      enter(e) { BASE_STATES.chase.enter(e); },
      update(e, dt) { e.chaseMelee(dt); },
      exit(e) { BASE_STATES.chase.exit(e); },
    },
    windup: {
      anim: BASE_STATES.windup.anim,
      enter(e) {
        BASE_STATES.windup.enter(e);
        if (e.attack?.id === 'pug_slam') {
          const a = e.attack.def, r = a.ring?.rMax ?? 2.5;
          e.telegraphExtra('red', { shape: 'circle', pos: e.pos, r, size: r, duration: e.windupDur + (a.ring?.grow ?? 0.4), follow: true });
        }
      },
      update: BASE_STATES.windup.update,
    },
    strike: {
      anim: BASE_STATES.strike.anim,
      enter(e) {
        if (e.attack?.id !== 'pug_slam') return BASE_STATES.strike.enter(e);
        e.endTelegraph();
        e.swing = null; e.followUp = null;
        e.slamHit = new Set();
        e.ctx.bus.emit(E.BURST, { kind: 'dustRing', position: e.pos.clone(), scale: 1.5 });
        const RR = e.attack.def.ring ?? { rMax: 2.5, grow: 0.4, height: 0.3 };
        // fx draws the jumpable shockwave wall with the same linear growth as the hit ring (requests/fx.md)
        if (typeof e.ctx.fx?.shockwave === 'function') e.ctx.fx.shockwave(e.pos, { r: RR.rMax ?? 2.5, dur: RR.grow ?? 0.4, height: RR.height ?? 0.3, color: 'red' });
        else e.ctx.bus.emit(E.BURST, { kind: 'ring', position: e.pos.clone(), r: RR.rMax ?? 2.5, color: '#FF6A3D' });
        e.ctx.bus.emit(E.SHAKE, { trauma: 0.2 });
      },
      update(e, dt) {
        if (e.attack?.id !== 'pug_slam') return BASE_STATES.strike.update(e, dt);
        e.brake(dt, 12);
        const a = e.attack.def, R = a.ring ?? { rMax: 2.5, grow: 0.4, height: 0.3 };
        const ring = ringAt(e.stateT, R.rMax / R.grow, R.rMax, M2.pug.slamBand);
        if (ring.r > 0.05) e.ctx.combat?.areaHit?.(e, a, { center: e.pos, r: ring.r, rInner: ring.inner, y0: -0.2, y1: R.height ?? 0.3, hitSet: e.slamHit });
        if (e.stateT >= R.grow + 0.12) e.setState('recover');
      },
      exit(e) { e.swing = null; },
    },
  },
};

export { breakShield as _breakShield };
