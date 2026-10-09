// src/enemies/types/jelly.js  (owner: enemies) — Gloomjelly (GAME_DESIGN §10.2–§10.3, art.md §11) in four sizes:
//   jelly_l (h 0.8, 40 HP), jelly_m (0.5, 20), jelly_s (0.3, 10), jelly_giant (1.6, 120; Earl Grey visible inside).
// Procedural: a wobbling translucent sphere (vertex wobble + fresnel rim; art.md's opacity fallback instead of a
// transmission pass), two black dot eyes with catchlights, a swallowed helmet inside. Hops 1.5 m every 1.2 s.
//   jelly_slam  `aoe` circle at the landing spot: squash 0.5 s, leap 3 m (0.6 s airtime), landing circle r 0.9 / 0.7 /
//               0.5 (giant: its radius), 2 / 1 / 1 damage, recover 0.8 s.
//   Split on death (U7): L → 2 M, M → 2 S, GIANT → 2 M; children pop 2 m outward with 0.3 s invulnerability, alerted,
//   in the same arena. `popsSlime` hits (bright, holy, holyWave, gleam, sunburst) pop it without a split. At most
//   12 jellies alive (`ENEMIES.jelly.maxAlive`): splits past the cap don't spawn. Visuals are pooled per size.
//   The giant releases Earl Grey: its `enemy:died` carries `releases: 'earlgrey'` (world / story run D-04).
import * as THREE from 'three';
import { ENEMIES, ATTACKS, GRAVITY } from '../../core/config.js';
import { E } from '../../core/events.js';
import { clamp, damp, dampAngle } from '../../core/math.js';
import { TUNING, M2, rangeOf } from '../tuning.js';
import { BASE_STATES, windupFor } from '../Enemy.js';
import { makeProp } from '../props.js';
import { loadedCharacters } from './kaykitGear.js';

const J = ENEMIES.jelly;
const SLAM = ATTACKS.jelly_slam;
const COLORS = { body: '#7FD38A', deep: '#3E8F55', rim: '#C8F5CF' };
const _d = new THREE.Vector3();

/** Size key for a type id ('jelly_m' → 'M', 'jelly_giant' → 'GIANT', 'jelly' → 'L'). Pure. */
export function jellySize(type) {
  const k = String(type ?? '').split('_')[1];
  if (!k) return 'L';
  const K = k.toUpperCase();
  return J.sizes[K] ? K : 'L';
}

/** What a jelly of size `size` splits into: [childSize, n] or null (S, or a popsSlime kill). Pure; U7. */
export function splitOf(size, popsSlime = false) {
  if (popsSlime) return null;
  if (size === 'GIANT') return J.sizes.GIANT.splitTo ?? null;
  return J.split?.[size] ?? null;
}

/** Live jellies (not dying) in `list`. Pure. */
export function aliveJellies(list) {
  let n = 0;
  for (const e of list ?? []) if (e.alive && !e.disposed && String(e.type).startsWith('jelly')) n++;
  return n;
}

/** How many of `want` children may spawn with `alive` jellies already up (cap `max`, the dying parent excluded). */
export function childBudget(want, alive, max = J.maxAlive ?? 12) { return Math.max(0, Math.min(want, max - alive)); }

// ------------------------------------------------------------------ visuals (shared + pooled)
const TIME = { value: 0, frame: -1 };
let _sphere = null, _eyeGeo = null, _eyeMat = null, _glintMat = null;
const POOL = new Map();

function bodyMaterial() {
  const m = new THREE.MeshStandardMaterial({
    name: 'gloomjelly', color: COLORS.body, emissive: new THREE.Color(COLORS.deep).multiplyScalar(0.35), roughness: 0.15, metalness: 0,
    transparent: true, opacity: M2.jelly.opacity, depthWrite: true,
  });
  const wob = M2.jelly.wobble.toFixed(3), rim = new THREE.Color(COLORS.rim);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uJellyTime = TIME;
    sh.vertexShader = 'uniform float uJellyTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n  transformed += normal * sin(uJellyTime * 4.0 + position.y * 6.0 + position.x * 2.0) * ${wob};`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  float jFres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.2);
  totalEmissiveRadiance += vec3(${rim.r.toFixed(3)}, ${rim.g.toFixed(3)}, ${rim.b.toFixed(3)}) * jFres * 0.55;
  diffuseColor.a = mix(diffuseColor.a, 1.0, jFres * 0.55);`);
  };
  m.customProgramCacheKey = () => 'gloomjelly-v1';
  m.userData.enemyOwned = true;
  return m;
}

/** A jelly visual of height `h` (body + eyes + something swallowed). */
function buildVisual(size, h, r) {
  _sphere ??= new THREE.SphereGeometry(1, 28, 20);
  _eyeGeo ??= new THREE.SphereGeometry(1, 10, 8);
  _eyeMat ??= new THREE.MeshBasicMaterial({ name: 'jelly-eye', color: '#101014' });
  _glintMat ??= new THREE.MeshBasicMaterial({ name: 'jelly-glint', color: '#FFFFFF' });
  const g = new THREE.Group();
  g.name = 'gloomjelly:' + size;
  const ry = h / 2, rx = Math.max(r, ry) * 1.05;
  const body = new THREE.Mesh(_sphere, bodyMaterial());
  body.name = 'jelly-body';
  body.scale.set(rx, ry, rx);
  body.position.y = ry;
  body.castShadow = true;
  body.renderOrder = 3;
  g.add(body);
  // eyes on the front surface (+Z), slightly above the middle
  for (const s of [-1, 1]) {
    const ex = s * rx * 0.32, ey = ry * 1.25, ez = Math.sqrt(Math.max(0, 1 - (ex / rx) ** 2 - ((ey - ry) / ry) ** 2)) * rx + M2.jelly.wobble * rx;
    const eye = new THREE.Mesh(_eyeGeo, _eyeMat);
    eye.scale.set(rx * 0.11, ry * 0.16, rx * 0.06);
    eye.position.set(ex, ey, ez);
    eye.userData.sharedProp = true;
    g.add(eye);
    const gl = new THREE.Mesh(_eyeGeo, _glintMat);
    gl.scale.setScalar(rx * 0.035);
    gl.position.set(ex + rx * 0.03, ey + ry * 0.06, ez + rx * 0.04);
    gl.userData.sharedProp = true;
    g.add(gl);
  }
  // something it swallowed (art.md §11): a rat's kettle helm, tipped over
  if (size !== 'S') {
    const helm = makeProp('kettleHelm', { castShadow: false });
    helm.scale.setScalar((h / 0.8) * 0.9);
    helm.position.set(rx * 0.12, ry * 0.75, -rx * 0.1);
    helm.rotation.set(0.9, 0.4, 2.2);
    g.add(helm);
  }
  g.userData.body = body;
  return g;
}

function takeVisual(size, h, r) {
  const list = POOL.get(size);
  const v = list?.pop();
  if (v) { v.visible = true; v.scale.set(1, 1, 1); v.rotation.set(0, 0, 0); v.position.set(0, 0, 0); return v; }
  return buildVisual(size, h, r);
}

function releaseVisual(size, v) {
  v.removeFromParent();
  const body = v.userData.body;
  if (body?.material?.emissive) body.material.emissive.set(COLORS.deep).multiplyScalar(0.35);
  const list = POOL.get(size) ?? [];
  if (list.length < (J.maxAlive ?? 12)) { list.push(v); POOL.set(size, list); return true; }
  return false;
}

// ------------------------------------------------------------------ type
/** A hop toward (x, z) of at most `dist` m over the hop airtime. */
function hopTo(e, x, z, dist, air = M2.jelly.hopAir) {
  _d.set(x - e.pos.x, 0, z - e.pos.z);
  const d = Math.min(dist, _d.length());
  if (_d.lengthSq() > 1e-6) _d.normalize(); else _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  // never hop into deep water
  if (e.dryStep) { const v = _d.clone().multiplyScalar(d / air); e.dryStep(v); _d.copy(v).multiplyScalar(air); } else _d.multiplyScalar(d);
  e.vel.x = _d.x / air; e.vel.z = _d.z / air;
  e.vel.y = (GRAVITY * air) / 2;
  e.onGround = false;
  e.hopT = 0; e.airT = 0; e.landSquash = 0;
  if (_d.lengthSq() > 1e-4) e.facing = Math.atan2(_d.x, _d.z);
}

function onGroundStep(e, dt) {
  e.hopT = (e.hopT ?? 0) + dt;
  if (!e.onGround) { e.airT = (e.airT ?? 0) + dt; return false; }
  e.brake(dt, 14);
  if (e.airT > 0.05) { e.landSquash = M2.jelly.squash; e.airT = 0; }
  return true;
}

const STATES = {
  idle: {
    anim: 'idle',
    enter(e) { e.idleFor = rangeOf(e.ctx.rng, M2.jelly.wanderEvery); },
    update(e, dt) {
      const grounded = onGroundStep(e, dt);
      if (e.checkWake(dt) || e.sees) return e.alert();
      if (!grounded || e.patrolRadius <= 0 || e.stateT < e.idleFor) return;
      const a = e.ctx.rng.angle(), r = e.ctx.rng() * e.patrolRadius;
      hopTo(e, e.home.x + Math.sin(a) * r, e.home.z + Math.cos(a) * r, J.hopDist);
      e.setState('idle');
    },
  },
  patrol: { anim: 'idle', update(e) { e.setState('idle'); } },
  alert: {
    anim: 'idle',
    enter(e) {
      e.alerted = true;
      if (e.onGround) { e.vel.y = TUNING.alertHopV; e.onGround = false; }
      e.ctx.bus.emit(E.ENEMY_ALERTED, { enemy: e });
      e.ctx.enemies?.alertNear?.(e.pos, TUNING.groupAlertRadius, e);
    },
    update(e, dt) {
      onGroundStep(e, dt);
      const p = e.targetActor();
      if (p) e.faceTo(p.pos, dt, TUNING.turnRate);
      if (e.stateT >= TUNING.alertDur) e.setState(p ? 'chase' : 'idle');
    },
  },
  chase: {
    anim: 'idle',
    enter(e) { e.tokenT = 0; },
    update(e, dt) {
      const grounded = onGroundStep(e, dt);
      const p = e.targetActor();
      if (!p) { e.releaseToken(); return e.setState('return'); }
      if (e.leashBroken()) return e.setState('return');
      if (!grounded) return;
      const d = e.distToTarget(), atk = e.pickAttack(d);
      e.faceTo(p.pos, dt, TUNING.chaseTurnRate);
      let has = e.hasToken();
      if (!has && atk && e.cooldownT <= 0 && d <= atk.range * TUNING.orbitMul + 1.5) has = e.acquireToken(atk.kind);
      if (has && atk && d <= atk.range && e.cooldownT <= 0) return e.beginAttack(atk);
      if (e.hopT < (J.hopEvery ?? 1.2)) return;
      // hop: straight at her with a token, else to a point on the 1.4× ring around her
      let tx = p.pos.x, tz = p.pos.z;
      if (!has) {
        const ring = (atk?.range ?? 3) * TUNING.orbitMul, cur = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z) + e.ctx.rng.range(-0.5, 0.5);
        tx = p.pos.x + Math.sin(cur) * ring; tz = p.pos.z + Math.cos(cur) * ring;
      }
      hopTo(e, tx, tz, J.hopDist);
    },
    exit(e) { e.attackChoice = null; },
  },
  windup: {
    anim: 'idle',
    enter(e) {
      e.brakeHard();
      const a = e.attack?.def ?? SLAM;
      e.windupDur = windupFor(a, e.windupMul());
      const p = e.targetActor(), leap = a.leap ?? 3;
      e.slamAt = (e.slamAt ?? new THREE.Vector3());
      if (p) {
        _d.set(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z);
        const dl = _d.length();
        if (dl > leap) _d.multiplyScalar(leap / dl);
        e.slamAt.set(e.pos.x + _d.x, p.pos.y, e.pos.z + _d.z);
      } else e.slamAt.set(e.pos.x + Math.sin(e.facing) * leap * 0.5, e.pos.y, e.pos.z + Math.cos(e.facing) * leap * 0.5);
      e.slamR = e.slamRadius();
      // §8.1 aoe: the landing circle fills from the centre; full = it hits (windup + airtime)
      e.telegraph('aoe', { shape: 'circle', pos: e.slamAt, r: e.slamR, size: e.slamR, duration: e.windupDur + (a.air ?? 0.6), follow: false });
    },
    update(e, dt) {
      e.brake(dt, 14);
      e.faceTo(e.slamAt, dt, TUNING.windupTurnRate);
      if (e.stateT >= e.windupDur) e.setState('strike');
    },
  },
  strike: {
    anim: 'idle',
    enter(e) {
      const a = e.attack?.def ?? SLAM, air = a.air ?? 0.6;
      hopTo(e, e.slamAt.x, e.slamAt.z, (a.leap ?? 3) + 0.01, air);
      e.slamHit = new Set();
      e.landed = false;
    },
    update(e, dt) {
      const a = e.attack?.def ?? SLAM;
      e.airT = (e.airT ?? 0) + dt;
      if (!e.landed && ((e.onGround && e.stateT > 0.1) || e.stateT > (a.air ?? 0.6) + 0.35)) {
        e.landed = true;
        e.endTelegraph();
        e.landSquash = M2.jelly.squash * 1.6;
        const dmg = typeof a.dmg === 'object' ? (a.dmg[e.size === 'GIANT' ? 'L' : e.size] ?? 1) : a.dmg;
        e.ctx.combat?.areaHit?.(e, a, { center: e.pos, r: e.slamR, y0: -0.3, y1: 1.0, dmg, hitSet: e.slamHit });
        e.ctx.bus.emit(E.BURST, { kind: 'droplets', position: e.pos.clone(), count: 10, scale: e.height });
        e.ctx.bus.emit(E.BURST, { kind: 'jellySlam', position: e.pos.clone(), scale: e.height / 0.8 });
        e.ctx.bus.emit(E.SHAKE, { trauma: 0.08 * (e.height / 0.8) });
        e.brakeHard();
      }
      if (e.landed && e.stateT > (a.air ?? 0.6) + 0.12) e.setState('recover');
    },
  },
  recover: {
    anim: 'idle',
    update(e, dt) {
      onGroundStep(e, dt);
      const def = e.attack?.def ?? SLAM;
      if (e.stateT >= (def.recover ?? 0.8)) e.finishAttack();
    },
  },
  return: {
    anim: 'idle',
    enter(e) { e.releaseToken(); e.alerted = false; e.endTelegraph(); },
    update(e, dt) {
      const grounded = onGroundStep(e, dt);
      if (e.stateT > 1.0 && e.sees && e.distToPlayer() < (e.def.leash ?? 14) * 0.6) return e.alert();
      const left = Math.hypot(e.home.x - e.pos.x, e.home.z - e.pos.z);
      if (left < 0.8 || e.stateT > 20) { e.hp = e.maxHp; return e.setState('idle'); }
      if (grounded && e.hopT >= (J.hopEvery ?? 1.2)) hopTo(e, e.home.x, e.home.z, J.hopDist);
    },
  },
  die: {
    anim: 'idle',
    enter(e) { BASE_STATES.die.enter(e); },
    update(e, dt) {
      e.brake(dt, 10);
      if (e.stateT >= e.dieDur()) e.ctx.enemies?.despawn?.(e);
    },
  },
};

/** Build one size's def (`jelly_l|m|s|giant`; 'jelly' = L). */
export function jellyType(type) {
  const size = jellySize(type), S = J.sizes[size];
  const id = type === 'jelly' ? 'jelly' : `jelly_${size === 'GIANT' ? 'giant' : size.toLowerCase()}`;
  return {
    ...J, id, size, hp: S.hp, radius: S.r, height: S.h, mass: size === 'GIANT' ? 2.0 : size === 'L' ? 1.0 : size === 'M' ? 0.6 : 0.3,
    fish: [S.fish, S.fish], fov: 6.28, walk: J.hopDist / J.hopEvery, run: J.hopDist / J.hopEvery,
    procedural: 'gloomjelly', releases: S.releases ?? null, scamper: false, smallHeart: true,
    attacks: J.attacks, anims: {},
    init(e) {
      e.size = size; e.hopT = (e.id * 0.31) % (J.hopEvery ?? 1.2); e.airT = 0; e.landSquash = 0; e.popped = false;
      e.slamRadius = () => (size === 'GIANT' ? S.r * 1.6 : (SLAM.r?.[size] ?? 0.7));
      if (e.spawnOpts?.pop) {                                  // a split child pops out on a little arc
        const dir = e.spawnOpts.pop;
        const air = M2.jelly.hopAir * 1.4;
        e.vel.set(dir.x * (J.childPop ?? 2) / air, M2.jelly.popUp, dir.z * (J.childPop ?? 2) / air);
        e.onGround = false;
        e.invulnT = J.childInvuln ?? 0.3;
      }
    },
    async buildProcedural(e) {
      const v = takeVisual(size, S.h, S.r);
      e.jellySize = size;
      if (size === 'GIANT' && S.releases) addPrisoner(e, v, S);
      return v;
    },
    states: STATES,
    /** Squash and stretch: hop anticipation, airtime stretch, landing squash, the slam windup squash. */
    pulse(e) {
      if (e.stateName === 'windup') { const u = clamp(e.stateT / Math.max(0.1, e.windupDur), 0, 1); const sy = 1 - 0.3 * u; return [1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy)]; }
      if (!e.onGround && e.vel.y > -1) { const k = 1.12; return [1 / Math.sqrt(k), k, 1 / Math.sqrt(k)]; }
      if (e.landSquash > 0) { const sy = 1 - e.landSquash; return [1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy)]; }
      return null;
    },
    render(e, dt) {
      const f = e.ctx.game?.frameCount ?? 0;                               // one shared clock, ticked once per frame
      if (f !== TIME.frame) { TIME.frame = f; TIME.value += dt; }
      if (e.landSquash > 0) e.landSquash = Math.max(0, e.landSquash - dt * 1.4);
      e.prisoner?.render?.(dt);
    },
    /** U7 split / pop: decided on the killing blow. */
    onDeath(e, hit) {
      const pops = !!hit?.def?.popsSlime;
      e.popped = pops;
      if (pops) e.ctx.bus.emit(E.BURST, { kind: 'sparkle', position: e.pos.clone().setY(e.pos.y + e.height * 0.5), count: 10 });
      const sp = splitOf(size, pops);
      if (sp) splitJelly(e, sp[0], sp[1]);
    },
    died(e) { return { releases: e.def.releases ?? null, popped: !!e.popped, size }; },
    onDispose(e) {
      if (e.prisoner) { try { e.prisoner.dispose(); } catch (err) { console.warn('[jelly] prisoner dispose', err); } e.prisoner = null; }
      const v = e.visual;
      if (v && releaseVisual(size, v)) e.visual = null;               // pooled: not disposed
    },
  };
}

/** Spawn the split children around the dying jelly (cap-limited). */
export function splitJelly(e, childSize, n) {
  const mgr = e.ctx.enemies;
  if (!mgr?.spawn) return [];
  const k = childBudget(n, aliveJellies(mgr.list));
  const out = [];
  const type = `jelly_${childSize.toLowerCase()}`;
  const base = e.ctx.rng.angle();
  for (let i = 0; i < k; i++) {
    const a = base + (i / Math.max(1, n)) * Math.PI * 2;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const pos = new THREE.Vector3(e.pos.x + dir.x * e.radius * 0.6, e.pos.y, e.pos.z + dir.z * e.radius * 0.6);
    const arena = e.spawnOpts?.arena;
    const c = mgr.spawn(type, pos, { noCap: true, alerted: true, pop: dir, facing: a, ...(arena ? { arena } : {}), patrolRadius: e.patrolRadius });
    if (!c) continue;
    c.splitFrom = e.type;
    mgr.joinArena?.(c, arena);
    if (e.bossAdd) { c.bossAdd = e.bossAdd; e.bossAdd.adds?.push(c); }
    out.push(c);
  }
  if (out.length) e.ctx.bus.emit(E.BURST, { kind: 'droplets', position: e.pos.clone(), count: 14, scale: e.height });
  return out;
}

/** Earl Grey sits inside the giant (characters' KittenView), released on its defeat. */
function addPrisoner(e, v, S) {
  const C = loadedCharacters();
  if (!C?.KittenView) return;
  try {
    const cfg = C.catConfig?.('earlgrey');
    if (!cfg) return;
    const view = new C.KittenView(e.ctx, { ...cfg, scale: (cfg.scale ?? 0.9) * Math.min(1, (S.h * 0.55) / 0.9), cape: null, sword: null },
      { parent: v, pose: 'sit', expression: 'sad', memeCam: false, castShadow: false });
    view.root.position.set(0, S.h * 0.18, 0);
    view.root.rotation.y = 0.3;
    e.prisoner = view;
  } catch (err) { console.warn('[jelly] Earl Grey view failed', err); }
}

export const JELLY_TYPES = Object.freeze({
  jelly: jellyType('jelly'), jelly_l: jellyType('jelly_l'), jelly_m: jellyType('jelly_m'), jelly_s: jellyType('jelly_s'), jelly_giant: jellyType('jelly_giant'),
});
