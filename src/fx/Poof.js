// src/fx/Poof.js  (owner: fx) — the cute, non-lethal defeat (art.md §8, GAME_DESIGN §8.2 "Kill"): 12 white puffs
// (scale 0 → 1.4, opacity 1 → 0, ~0.35 s), 6 gold stars, faction debris (feathers, dirt, slime droplets, bone chips),
// and (on request) a helmet popping off, spinning. Also the arena `spawn` poof (§12.1) and small utility puffs.
import * as THREE from 'three';
import { SHAPE, FADE, GROW } from './Particles.js';

/** Faction debris per enemy type id (prefix match: 'bonehead:warrior' → 'bonehead'). */
export const DEBRIS = Object.freeze({
  crow: 'feathers', jelly: 'droplets', bonehead: 'bones', spider: 'dirt', rat_pike: 'dirt', rat_xbow: 'dirt',
  hyena: 'fur', stealer: 'fur', pug: 'fur', boss_grizzlechop: 'dirt', boss_cacklejaw: 'fur', boss_brutus: 'fur', boss_barkus: 'fur',
});

/** Enemy types that wear a helmet that pops off on defeat (art.md §11: "helm pops off spinning"). */
export const HELMETS = Object.freeze({ rat_pike: 'kettle', pug: 'sallet', 'bonehead:warrior': 'sallet', boss_brutus: 'sallet' });

/** Debris kind for an enemy type id (null = none). */
export function debrisFor(type) {
  if (!type) return null;
  const t = String(type);
  if (DEBRIS[t]) return DEBRIS[t];
  const base = t.split(':')[0].replace(/_(l|m|s|giant)$/i, '');
  return DEBRIS[base] ?? null;
}

/** Helmet style for an enemy type id (null = none). */
export function helmetFor(type) {
  if (!type) return null;
  return HELMETS[String(type)] ?? null;
}

const DEBRIS_STYLE = {
  feathers: { n: 12, shape: SHAPE.FEATHER, color: '#2B2A36', size: [0.13, 0.2], life: [1.0, 1.5], speed: [1.4, 2.8], gravity: 1.6, drag: 2.6, spin: 5, up: 1.2 },
  droplets: { n: 10, shape: SHAPE.DROPLET, color: '#7FD38A', size: [0.08, 0.14], life: [0.6, 0.9], speed: [2.0, 3.8], gravity: 10, drag: 0.6, spin: 0, up: 2.0, floor: true },
  bones:    { n: 7, shape: SHAPE.SHARD, color: '#EFE6D4', size: [0.08, 0.13], life: [0.7, 1.0], speed: [2.0, 3.5], gravity: 12, drag: 0.5, spin: 10, up: 2.5, floor: true },
  dirt:     { n: 6, shape: SHAPE.SHARD, color: '#6B5A44', size: [0.05, 0.09], life: [0.5, 0.8], speed: [1.8, 3.0], gravity: 12, drag: 0.5, spin: 9, up: 2.2, floor: true },
  fur:      { n: 8, shape: SHAPE.FEATHER, color: '#A88A5E', size: [0.08, 0.12], life: [0.8, 1.2], speed: [1.2, 2.4], gravity: 1.8, drag: 3.0, spin: 6, up: 1.0 },
  wood:     { n: 8, shape: SHAPE.SHARD, color: '#8A6A44', size: [0.07, 0.13], life: [0.6, 0.9], speed: [2.0, 3.6], gravity: 12, drag: 0.4, spin: 10, up: 2.4, floor: true },
  leaves:   { n: 10, shape: SHAPE.FEATHER, color: '#5E7A3A', size: [0.1, 0.16], life: [1.0, 1.6], speed: [1.0, 2.2], gravity: 1.2, drag: 2.8, spin: 5, up: 1.0 },
};
export const DEBRIS_KINDS = Object.keys(DEBRIS_STYLE);

const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Lathe profile of a cartoon kettle helm (brim + dome), 1 m tall before scaling. */
function helmGeometry(style) {
  const pts = style === 'kettle'
    ? [[0.0, 1.0], [0.18, 0.98], [0.34, 0.9], [0.44, 0.74], [0.48, 0.52], [0.5, 0.36], [0.9, 0.3], [0.94, 0.24], [0.9, 0.2], [0.5, 0.22], [0.46, 0.2]]
    : [[0.0, 1.0], [0.25, 0.97], [0.44, 0.86], [0.55, 0.66], [0.58, 0.42], [0.6, 0.2], [0.66, 0.08], [0.6, 0.04], [0.52, 0.12]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x * 0.5, y - 0.5)), 18);
  g.computeVertexNormals();
  return g;
}

/** Helmets that pop off on defeat: a tiny pool of lit meshes with simple ballistic motion and one bounce. */
export class HelmetPops {
  constructor({ rng, groundY, max = 6 }) {
    this.rng = rng; this.groundY = groundY;
    this.geos = { kettle: helmGeometry('kettle'), sallet: helmGeometry('sallet') };
    this.mat = new THREE.MeshStandardMaterial({ name: 'fx.helmet', color: '#8A8D90', metalness: 0.65, roughness: 0.42 });
    this.list = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(this.geos.kettle, this.mat);
      m.name = 'fx.helmet'; m.visible = false; m.castShadow = true;
      m.userData = { t: 0, vel: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), spin: 0, size: 0.3, floor: 0, bounced: false };
      this.list.push(m);
    }
    this._next = 0;
  }

  attach(scene) { for (const m of this.list) scene.add(m); }

  /** Launch a helmet from `pos` (head height), flying away from `dir` (XZ) if given. */
  pop(pos, style = 'kettle', size = 0.3, dir = null) {
    const m = this.list[this._next++ % this.list.length], u = m.userData, r = this.rng;
    m.geometry = this.geos[style] ?? this.geos.kettle;
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.quaternion.identity();
    const a = r() * Math.PI * 2;
    const hx = dir ? dir.x : Math.sin(a), hz = dir ? dir.z : Math.cos(a);
    u.vel.set(hx * (1.2 + r()) + (r() - 0.5), 4.2 + r() * 1.5, hz * (1.2 + r()) + (r() - 0.5));
    u.axis.set(r() - 0.5, r() * 0.3, r() - 0.5).normalize();
    if (u.axis.lengthSq() < 0.5) u.axis.set(1, 0, 0);
    u.spin = 10 + r() * 8; u.t = 0; u.size = size; u.bounced = false;
    u.floor = (this.groundY?.(pos.x, pos.z, pos.y - 1) ?? pos.y - 1) + size * 0.3;
    m.visible = true;
  }

  update(dt) {
    if (!(dt > 0)) return;
    for (const m of this.list) {
      if (!m.visible) continue;
      const u = m.userData;
      u.t += dt;
      u.vel.y -= 14 * dt;
      m.position.addScaledVector(u.vel, dt);
      if (m.position.y < u.floor) {
        m.position.y = u.floor;
        if (!u.bounced) { u.vel.y = Math.abs(u.vel.y) * 0.35; u.vel.x *= 0.5; u.vel.z *= 0.5; u.spin *= 0.4; u.bounced = true; }
        else { u.vel.set(0, 0, 0); u.spin *= 0.9; }
      }
      m.rotateOnAxis(u.axis, u.spin * dt);
      const fade = u.t > 1.2 ? Math.max(0, 1 - (u.t - 1.2) / 0.3) : 1;
      m.scale.setScalar(u.size * fade);
      if (fade <= 0) m.visible = false;
    }
  }

  clear() { for (const m of this.list) m.visible = false; }

  dispose() {
    for (const m of this.list) m.removeFromParent();
    for (const g of Object.values(this.geos)) g.dispose();
    this.mat.dispose();
  }
}

/**
 * Poof recipes on top of the particle manager.
 */
export class Poof {
  /** @param {{ particles: import('./Particles.js').Particles, helmets: HelmetPops }} o */
  constructor({ particles, helmets }) {
    this.p = particles; this.helmets = helmets;
  }

  /**
   * The defeat poof. `pos` = feet (or centre when `centre` is true), `height` = the actor's height (m).
   * @param {THREE.Vector3} pos @param {{ type?: string, height?: number, centre?: boolean, dir?: THREE.Vector3, scale?: number, color?: any }} [o]
   */
  poof(pos, o = {}) {
    const h = Math.max(0.4, o.height ?? 1), S = (o.scale ?? 1) * Math.max(0.7, Math.min(1.6, h));
    _p.copy(pos); if (!o.centre) _p.y += h * 0.45;
    const P = this.p;
    // 12 white puffs (art.md §8): scale 0 → 1.4, opacity 1 → 0, ~0.35 s
    P.burst(_p, { n: 12, shape: SHAPE.PUFF, color: o.color ?? '#FBF8F1', tint: 0.05, size: [0.3 * S, 0.42 * S], sizeEnd: 1.4,
      grow: GROW.OUT, fade: FADE.HOLD, life: [0.34, 0.48], speed: [1.0 * S, 2.2 * S], drag: 5, up: 0.5, jitter: 0.22 * S, jitterY: 0.8 });
    // a short inner flash so the poof pops even in bright fog (kept dim: bloom turns anything brighter into an orb)
    P.single(_p, { shape: SHAPE.SOFT, color: '#FFF6DA', intensity: 1.1, size0: 0.35 * S, size1: 1.0 * S, life: 0.1, fade: FADE.LINEAR });
    // 6 gold stars
    P.burst(_p, { additive: true, n: 6, shape: SHAPE.STAR5, color: '#FFD34D', intensity: 1.9, size: [0.14 * S, 0.2 * S], sizeEnd: 0.6,
      life: [0.55, 0.8], speed: [2.4, 3.8], dir: _up, spread: 1.2, gravity: 7, drag: 1.2, spin: 7, fade: FADE.HOLD });
    const debris = o.debris ?? debrisFor(o.type);
    if (debris) this.debris(_p, debris, S);
    // helmets: enemies pop their own real helmet (EnemyManager.spawnDebris); fx adds one only when asked (`o.helmet`)
    const helm = o.helmet === true ? helmetFor(o.type) ?? 'kettle' : o.helmet || null;
    if (helm && this.helmets) {
      _p.copy(pos); _p.y += o.centre ? h * 0.5 : h * 0.95;
      this.helmets.pop(_p, helm, 0.34 * Math.min(1.6, h), o.dir ?? null);
    }
  }

  /** Faction debris burst (`feathers`, `droplets`, `bones`, `dirt`, `fur`, `wood`, `leaves`). */
  debris(pos, kind, S = 1, color = null, n = null) {
    const st = DEBRIS_STYLE[kind];
    if (!st) return;
    this.p.burst(pos, { n: n ?? st.n, shape: st.shape, color: color ?? st.color, tint: 0.12, size: [st.size[0] * S, st.size[1] * S],
      life: st.life, speed: st.speed, dir: _up, spread: 1.35, gravity: st.gravity, drag: st.drag, spin: st.spin, up: st.up,
      fade: FADE.HOLD, floor: !!st.floor, jitter: 0.15 * S });
  }

  /** Arena spawn poof (§12.1): a ground ring of dust plus a short rising column. */
  spawn(pos, S = 1) {
    this.p.ring(pos, { n: 10, r0: 0.25 * S, speed: [2.2, 3.2], size: [0.3 * S, 0.42 * S], sizeEnd: 2.0, life: [0.5, 0.7],
      color: '#D7CFBF', tint: 0.06, alpha: 0.85, y: 0.12, up: 0.35 });
    _p.copy(pos); _p.y += 0.4 * S;
    this.p.burst(_p, { n: 7, shape: SHAPE.PUFF, color: '#E9E3D6', tint: 0.05, size: [0.28 * S, 0.4 * S], sizeEnd: 1.6, grow: GROW.OUT,
      fade: FADE.HOLD, life: [0.45, 0.65], speed: [0.4, 1.0], dir: _up, spread: 0.6, up: 1.4, drag: 2.5, jitter: 0.3 * S });
  }

  /** Soft dust puff at the feet (dodge, landing, zoomies steps). */
  dust(pos, S = 1, n = 5) {
    this.p.ring(pos, { n, r0: 0.08, speed: [0.8 * S, 1.6 * S], size: [0.14 * S, 0.22 * S], sizeEnd: 2.2, life: [0.35, 0.55],
      color: '#BDB39E', tint: 0.08, alpha: 0.6, y: 0.06, up: 0.25, drag: 4 });
  }

  /** Heavy-hit dust ring (juice table: "8 stars, dust ring"). */
  dustRing(pos, S = 1) {
    this.p.ring(pos, { n: 12, r0: 0.3, speed: [2.6 * S, 3.6 * S], size: [0.22 * S, 0.32 * S], sizeEnd: 2.1, life: [0.4, 0.6],
      color: '#C6BCA6', tint: 0.07, alpha: 0.75, y: 0.08, up: 0.4 });
  }
}
