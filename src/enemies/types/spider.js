// src/enemies/types/spider.js  (owner: enemies) — Bramble Spider, drawn as the Fuzzball (GAME_DESIGN §10.2–§10.3;
// ART_WARM_SPEC §7.2): Spider.glb fitted to 0.5 m, olive with an oliveTop leaf hat, a round body on short legs (static
// bone scales, palette.js), 2 big friendly eyes. Moves in skitter bursts: 5.0 m/s for 1.2 s, then a
// 1.0 s pause (Spider_Walk / Spider_Idle). Attacks:
//   spider_web  white `parry` glint while the abdomen pulses (0.6 s) → a glob at 10 m/s, range 7: 0 damage, slows her
//               50% for 2.0 s (a roll clears it), reflectable (10 damage back), and leaves a web patch r 1.0 for 8 s
//               with the same slow (WebPatches; one slash cuts it).
//   spider_bite white glint 0.45 s → sector ±0.6, 1.2 m, 2 damage.
// It keeps ~4–6 m off her between webs (a ranged token), closing in for a bite when she's near.
// Defeat: poof (dirt), it scampers away.
import { ENEMIES, ATTACKS } from '../../core/config.js';
import { E } from '../../core/events.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { M2 } from '../tuning.js';
import { applySlow } from '../status.js';
import { makeProp } from '../props.js';
import { attachAligned, bone, posIn, recolor } from '../rig.js';
import { MATERIAL_COLORS } from '../palette.js';
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/** Fuzz coat fit on the abdomen bone: ball radius = bone length × r, centred at `at` along the bone (ART §7.2). */
const FUZZ = Object.freeze({ r: 0.62, at: 0.5 });

const def = ENEMIES.spider;
const WEB = ATTACKS.spider_web;

/** Skitter-burst speed for this step: `speed` while bursting, 0 in the pause. Pure over e.burstT; exported for tests. */
export function skitter(e, speed, dt) {
  const B = e.def.burst;
  if (!B) return speed;
  const cycle = B.move + B.pause;
  e.burstT = ((e.burstT ?? 0) + dt) % cycle;
  return e.burstT < B.move ? Math.max(speed, B.speed) : 0;
}

export default {
  ...def,
  id: 'spider',
  tint: undefined,                                         // coloured in build (a multiply over the black atlas reads black)
  scamper: true,
  bake: true,                                              // PERF §9.4: body + eyes + fuzz coat = 1 draw
  anims: { ...CLIP_MAPS.spider.roles, spider_web: { windup: { clip: 'Spider_Idle', speed: 2.2 }, strike: { clip: 'Spider_Attack', from: 0.4, to: 1, speed: 1.6 } } },
  init(e) { e.burstT = (e.id * 0.37) % ((def.burst?.move ?? 1.2) + (def.burst?.pause ?? 1.0)); },

  gait: skitter,

  /** Webs while she's at range, bites when she's close. */
  canUse(e, a, d) {
    if (a.id === 'spider_web') return d > 2.2;
    return true;
  },

  async build(e, m) {
    // ART §2.6 / §7.2 Fuzzball: olive coat, a lighter olive underside (set, not multiplied: the GLB is near-black), matte
    recolor(m.scene, MATERIAL_COLORS.spider);
    m.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!mat?.userData?.enemyOwned || !mat.color) continue;
        mat.roughness = 0.9; mat.metalness = 0;
      }
    });
    // 2 big friendly eyes ride the head bone (×1.4 after dressing); the fuzz coat (12-card fringe + the leaf hat on
    // top, ONE draw) rides the abdomen (×1.5) — ART §7.4: body 1 + eyes 1 + coat 1 (+ hull) per Fuzzball
    const head = bone(m.scene, 'Head') ?? bone(m.scene, 'Spider_Head') ?? bone(m.scene, 'Body');
    if (!head) return;
    const hp = posIn(m.root, head), k = (m.size?.y ?? 0.5) / 0.5;
    const eyes = makeProp('eyes');
    attachAligned(m.root, head, eyes, { pos: [hp.x, hp.y + 0.06 * k, hp.z + 0.15 * k], scale: k * 1.05 });
    const abd = bone(m.scene, 'Abdomen'), abdEnd = bone(m.scene, 'Abdomen_end');
    if (abd && abdEnd) {
      const a = posIn(m.root, abd, _a), b = posIn(m.root, abdEnd, _b);
      const r = a.distanceTo(b) * FUZZ.r;
      _c.copy(a).lerp(b, FUZZ.at);
      attachAligned(m.root, abd, makeProp('fuzzCoat'), { pos: [_c.x, _c.y, _c.z], scale: r });
    }
    e.helmet = null;                                          // the coat stays on: faint-and-poof is the defeat
  },

  /** The web glob: slow on a hit, a patch where it ends (not when reflected). */
  projectileOpts(e) {
    const webs = e.ctx.enemies?.webs;
    return {
      onHit(p, tgt, result) {
        if (p.reflected || !tgt || tgt.faction !== 'player') return;
        if (result === 'hit' || result === 'break') {
          applySlow(tgt, WEB.slow ?? 0.5, WEB.slowDur ?? 2, 'web');
          e.ctx.bus.emit(E.BURST, { kind: 'web', position: tgt.pos.clone().setY(tgt.pos.y + 0.4) });
        }
      },
      onEnd(p, reason) {
        if (p.reflected || reason === 'eaten' || reason === 'recycled' || reason === 'killed') return;
        webs?.add?.(p.pos, { r: WEB.patch?.r, life: WEB.patch?.life });
      },
    };
  },

  /** Abdomen pulse during the web windup (scale wobble on the whole body). */
  pulse(e) {
    if (e.stateName !== 'windup' || e.attack?.id !== 'spider_web') return null;
    const k = 1 + M2.web.pulse * Math.max(0, Math.sin(e.stateT * 22));
    return [k, 1 + (k - 1) * 0.6, k];
  },
};
