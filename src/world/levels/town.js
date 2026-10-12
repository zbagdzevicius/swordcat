// src/world/levels/town.js  (owner: world) — L3 Pawsbury, Chapter 3, then the hub (GAME_DESIGN §12.5). A walled
// market town of warm cobbles: the town wall ring (r 60) with the South Gate, the main street with Lantern Alley
// (3 lanterns to light, the balcony over crate steps), Bakery Street (Marmalade's bakery, the chase loop round the
// Post Office), the Forge Yard (arena-lite: pugs), the market Square (arena: 4 waves, then the giant Gloomjelly out of
// the fountain; the cat statue, the stocks), the Castle Steps and terrace, the Bell Tower (outside stair flights up
// to the loft ledge, the Sunbell on its bell platform), the castle, the library, the tavern patio and the lookout.
// Once `town.free` (CS-07) it is the hub: no enemies, the stations open (Hub.js), env hub_gold → hub_grey → ending_gold.
import * as THREE from 'three';
import { defineLevel } from '../LevelKit.js';
import { buildHub, signParts } from '../Hub.js';
import { addFlame, ropeGeometry } from '../Dressing.js';
import { makeGlowSprite } from '../Sky.js';
import { E } from '../../core/events.js';

const B = (n) => `models/env/village-kaykit/buildings/${n}.glb`;
const T = (n) => `models/env/town/${n}.glb`;
const M = {
  wall: B('wall_straight'), gate: B('wall_straight_gate'), towerB: B('building_tower_B_red'), towerA: B('building_tower_A_red'), towerABlue: B('building_tower_A_blue'),
  castle: B('building_castle_red'), homeAR: B('building_home_A_red'), homeAB: B('building_home_A_blue'), homeBR: B('building_home_B_red'), homeBB: B('building_home_B_blue'),
  tavern: B('building_tavern_red'), smith: B('building_blacksmith_red'), marketR: B('building_market_red'), marketB: B('building_market_blue'), church: B('building_church_blue'),
  well: B('building_well_red'), fountain: T('fountain-round'), lantern: T('lantern'), stallR: T('stall-red'), stallG: T('stall-green'), stallBench: T('stall-bench'),
  banner: T('banner-red'), bannerG: T('banner-green'), hedge: T('hedge'), fence: T('fence'), cart: T('cart'), crate: 'models/env/village-kaykit/decoration/crate_A_big.glb',
  barrel: 'models/env/village-kaykit/decoration/barrel.glb', treeD: 'models/env/nature/tree_default.glb', treeO: 'models/env/nature/tree_oak.glb',
  flowers: 'models/env/nature/plant_bush.glb', sack: 'models/env/village-kaykit/decoration/sack.glb',
};
const PAVE = 'textures/pavingstones070/color.jpg';
/** Street strings: the prank strings while occupied, the same lines in festival candy (+ Main Street) once free. */
const PRANK_STRINGS = [[[-5.2, 5.6, -45], [5.2, 5.6, -45]], [[-5.2, 5.4, -22], [5.2, 5.4, -22]], [[-5.0, 5.2, -12], [5.0, 5.6, -12]], [[-11, 5.6, 22.5], [11, 5.6, 22.5]]];
const C = { wood: '#B7773F', woodDark: '#7E4E2A', plank: '#E8B87A', stone: '#E3CFAE', stoneDark: '#C4AC8E', cream: '#FFF3E2', red: '#E0605A', gold: '#E8C35A',
  bronze: '#E8C27A', iron: '#6E7A8E', pink: '#FF8FB1', blue: '#6F8FC4', green: '#8DB65A' };

/** §12.5 spine (South road → South Gate → main street → square → Castle Steps). */
const SPINE = [[0, -69], [0, -60], [0, -46], [0, -34], [0, -10], [0, 8], [0, 20], [0, 36]];
/** Bakery Street loops through the west quarter round the Post Office (the chase anchors run along it). */
const BAKERY_ST = [[0, -16], [-12, -16.5], [-20, -13], [-34, -12], [-44, -5], [-46, 5], [-42, 12.5], [-30, 16], [-18, 12], [-10, 8]];
const FORGE_ST = [[0, -6], [12, -6], [22, -5], [29, -6]];
const EAST_ST = [[0, 20], [10, 20], [17, 26], [20, 30]];
const LIB_ST = [[0, 24], [-10, 24.5], [-16, 22]];
/** Lantern Alley (§12.5): 3 lanterns (2.2 m), the balcony (5, −30) at 3.0 m over crate steps at 1 / 2 / 3 m. */
export const LANTERNS = Object.freeze([[-3, -40], [3, -34], [-3, -28]]);
export const BALCONY = Object.freeze({ at: [5, -30], y: 3.0, size: [2.5, 2.0] });
export const CRATE_STEPS = Object.freeze([[5.1, -35.6, 1], [5.1, -34.4, 2], [5.1, -33.2, 3]]);
/** The square (§12.5): arena r 15, the fountain (r 3, rim 0.6 m) and the cat statue (base 1.6, top 2.5). */
export const SQUARE = Object.freeze({ at: [0, 8], r: 15, rim: 0.6, fountainR: 3, base: 1.6, top: 2.5 });
/** The castle terrace (+1.2 m), its steps, the Bell Tower and the loft ledge (y 6 above the terrace). */
export const TERRACE = Object.freeze({ x0: -14, x1: 14, z0: 41, z1: 62, h: 1.2, stepsZ0: 36.8, steps: 5, stepsW: 9 });
export const TOWER = Object.freeze({ at: [0, 55.6], h: 16, ledge: { at: [0, 50.5], y: 6, size: [2.5, 1.5] }, bell: { y: 14, r: 1.0 } });
/**
 * The tower stairs: three flights of 8 steps (0.25 m) zig-zagging up the tower's south face to the ledge. Each flight is
 * 1.5 m wide and their edges sit on the 0.5 m nav grid (z 45 / 46.5 / 48 / 49.5, steps every 0.5 m in x): flights that
 * abut 2 m apart in height must not share a nav cell, or click paths cut the corner from one flight onto the next.
 */
export const FLIGHTS = Object.freeze([{ z: 45.75, x0: -7, x1: -3, y0: 0, dir: 1, w: 1.5 }, { z: 47.25, x0: -3, x1: -7, y0: 2, dir: -1, w: 1.5 }, { z: 48.75, x0: -7, x1: -3, y0: 4, dir: 1, w: 1.5 }]);
/** The Pilfer chase anchors (§12.5 bakery: ~70 m at 6 m/s). */
export const CHASE = Object.freeze([[-20, -12], [-34, -14], [-46, -4], [-44, 12], [-30, 16], [-36, 4]]);
const POST = { at: [-40.5, 4], steps: [-35.6, 4] };
const WALL_R = 60;

/** §5.4 nav links up Waffles' crate steps: the street → crate 1 (1 m) → 2 → 3 → the balcony (3.0 m). */
function crateLinks() {
  const s = CRATE_STEPS, pts = [[s[0][0], s[0][1] - 1.5], ...s.map(([x, z]) => [x, z]), [BALCONY.at[0], BALCONY.at[1] - 0.6]];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], kind: 'hop' });
  return out;
}

// ---------------------------------------------------------------------------------------------- procedural parts
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

/** The cat statue on its pedestal (top 2.5 above the ground; the rim is 0.6): a sitting stone cat with a sword. */
function statueParts() {
  const s = SQUARE, st = '#E8D8BC', dk = '#C9B498';
  const p = [[box(1.5, s.base - s.rim, 1.5, 0, (s.base + s.rim) / 2, 0), dk], [box(1.7, 0.12, 1.7, 0, s.base - 0.06, 0), st], [box(1.7, 0.12, 1.7, 0, s.rim + 0.06, 0), st]];
  const b = s.base;
  const body = new THREE.SphereGeometry(0.34, 14, 10); body.scale(1, 1.15, 0.9); body.translate(0, b + 0.36, 0);
  const head = new THREE.SphereGeometry(0.24, 14, 10); head.translate(0, b + 0.78, 0.05);
  p.push([body, st], [head, st]);
  for (const sx of [-1, 1]) p.push([new THREE.ConeGeometry(0.09, 0.18, 4).translate(sx * 0.13, b + 1.0, 0.04), st]);
  p.push([new THREE.TorusGeometry(0.22, 0.06, 6, 12, Math.PI).rotateY(Math.PI / 2).translate(-0.3, b + 0.12, -0.15), st]);   // tail
  p.push([box(0.06, 0.62, 0.05, 0.22, b + 0.55, 0.32), '#E2D6C0'], [box(0.26, 0.05, 0.06, 0.22, b + 0.3, 0.32), dk]);   // the stone sword
  p.push([box(0.2, 0.08, 0.02, -0.1, b + 1.0, 0.0).rotateZ(0.3), '#FF8FB1']);   // a pink ribbon somebody tied on
  return p;
}

/** Water disc + inner basin lip for the fountain (the Kenney fountain gives the stone ring). */
function fountainWaterParts() {
  return [[new THREE.CylinderGeometry(SQUARE.fountainR - 0.35, SQUARE.fountainR - 0.35, 0.04, 28).translate(0, SQUARE.rim - 0.08, 0), '#8FE0E0']];
}

/** The Sunbell: a lathe bell (r 1.0), its yoke and beam. */
function sunbellParts() {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.18 + 0.82 * Math.pow(t, 1.8) + (t > 0.9 ? (t - 0.9) * 1.2 : 0), 1.2 - t * 1.2)); }
  const bell = new THREE.LatheGeometry(pts, 20);
  return [[bell, C.bronze], [new THREE.SphereGeometry(0.16, 10, 8).translate(0, 0.25, 0), '#C99A5E'], [box(3.4, 0.22, 0.3, 0, 1.45, 0), C.woodDark], [box(0.2, 0.4, 0.2, 0, 1.25, 0), C.iron]];
}

/** The bell platform (r 2.5) at the loft: planks on beams, a rail, two struts into the tower. */
function bellPlatformParts() {
  const p = [[new THREE.CylinderGeometry(2.5, 2.5, 0.18, 20).translate(0, -0.09, 0), C.plank], [new THREE.TorusGeometry(2.45, 0.05, 4, 24).rotateX(Math.PI / 2).translate(0, 0.95, 0), C.woodDark]];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.push([cyl(0.04, 0.04, 0.95, Math.sin(a) * 2.45, 0, Math.cos(a) * 2.45, 5), C.woodDark]); }
  for (const x of [-1.6, 1.6]) { const g = new THREE.CylinderGeometry(0.1, 0.1, 3.0, 6).translate(0, -1.5, 0); g.rotateX(-0.75); p.push([g.translate(x, -0.1, 1.2), C.woodDark]); }
  return p;
}

/** One stair flight (8 steps × 0.25 m rise, 0.5 m run) along ±x with posts and a rail; built from x0 to x1 at y0. */
function flightParts(f, ground) {
  const p = [], n = 8, run = Math.abs(f.x1 - f.x0) / n, w = f.w ?? 1.4;
  for (let i = 0; i < n; i++) {
    const x = f.x0 + f.dir * run * (i + 0.5), top = ground + f.y0 + (i + 1) * 0.25;
    p.push([box(run + 0.02, 0.08, w, x, top - 0.04, f.z), C.plank]);
  }
  for (const t of [0, 0.5, 1]) { const x = f.x0 + (f.x1 - f.x0) * t, h = ground + f.y0 + 2 * t + 0.1; p.push([cyl(0.07, 0.08, h, x, 0, f.z - w / 2 + 0.06), C.woodDark], [cyl(0.07, 0.08, h, x, 0, f.z + w / 2 - 0.06), C.woodDark]); }
  // stringers
  const len = Math.hypot(f.x1 - f.x0, 2), ang = Math.atan2(2, (f.x1 - f.x0));
  for (const dz of [-w / 2, w / 2]) { const g = new THREE.BoxGeometry(len, 0.14, 0.08); g.rotateZ(ang); p.push([g.translate((f.x0 + f.x1) / 2, ground + f.y0 + 1.0, f.z + dz), C.wood]); }
  return p;
}

/** A landing (top at y) on 4 posts. */
function landingParts(x0, x1, z0, z1, y) {
  const p = [[box(x1 - x0, 0.12, z1 - z0, (x0 + x1) / 2, y - 0.06, (z0 + z1) / 2), C.plank]];
  for (const x of [x0 + 0.1, x1 - 0.1]) for (const z of [z0 + 0.1, z1 - 0.1]) p.push([cyl(0.07, 0.08, y, x, 0, z), C.woodDark]);
  return p;
}

/** The Lantern Alley balcony (top y 3): planks on brackets, a front rail, flower pots. */
function balconyParts() {
  const [w, d] = BALCONY.size, y = BALCONY.y;
  const p = [[box(w, 0.14, d, 0, y - 0.07, 0), C.plank], [box(0.08, 0.9, d, -w / 2 + 0.04, y + 0.45, 0), C.wood], [box(w, 0.08, 0.08, 0, y + 0.88, -d / 2 + 0.04), C.wood], [box(w, 0.08, 0.08, 0, y + 0.88, d / 2 - 0.04), C.wood]];
  for (let i = 0; i < 6; i++) p.push([box(0.04, 0.82, 0.04, -w / 2 + 0.05, y + 0.41, -d / 2 + 0.2 + i * 0.32), C.woodDark]);
  for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) { const g = new THREE.BoxGeometry(0.12, 1.6, 0.12); g.rotateZ(-0.55); p.push([g.translate(w / 2 - 0.55, y - 0.75, z), C.woodDark]); }
  for (const z of [-0.5, 0.4]) p.push([cyl(0.14, 0.11, 0.24, -w / 2 + 0.25, y, z), '#C9784A'], [new THREE.SphereGeometry(0.17, 8, 6).translate(-w / 2 + 0.25, y + 0.32, z), z > 0 ? C.pink : '#E8C35A']);
  return p;
}

/** Retaining wall block (terrace edge) of length `len` along x, height h. */
function terraceWallParts(len, h) {
  const p = [[box(len, h, 0.6, 0, h / 2, 0), C.stoneDark], [box(len + 0.1, 0.14, 0.75, 0, h + 0.07, 0), C.stone]];
  return p;
}

/** The castle steps: `n` wide stone steps rising +z (0.24 m each). */
function stepsParts(n, w, run, rise) {
  const p = [];
  for (let i = 0; i < n; i++) p.push([box(w, rise * (i + 1), run, 0, rise * (i + 1) / 2, run * (i + 0.5)), i % 2 ? C.stone : '#E8DAC0']);
  for (const sx of [-1, 1]) p.push([box(0.6, rise * n + 0.5, run * n, sx * (w / 2 + 0.3), (rise * n + 0.5) / 2, run * n / 2), C.stoneDark], [new THREE.SphereGeometry(0.3, 10, 8).translate(sx * (w / 2 + 0.3), rise * n + 0.75, run * n - 0.3), C.stone]);
  return p;
}

/** Bunting: triangle flags strung between two points (vertex coloured). */
/** LI W11: the occupiers' prank colours (plum + mustard) and the festival candy set once the town is free. */
const PRANK = Object.freeze(['#7A4E9A', '#E0B043']);
function buntingParts(a, b, n = 12) {
  const p = [[ropeGeometry(new THREE.Vector3(...a), new THREE.Vector3(...b), { sag: 0.6, r: 0.02, seg: 12 }), C.woodDark]];
  const cols = PRANK;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.6;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0), new THREE.Vector3(0, -0.36, 0)]);
    g.setIndex([0, 1, 2, 2, 1, 0]);
    g.computeVertexNormals();
    g.rotateY(Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2);
    p.push([g.translate(x, y, z), cols[i % cols.length]]);
  }
  return p;
}

/** A bread sign (bakery) / mail sign (post office): signParts from Hub.js. A flower box for windows. */
function flowerBoxParts() {
  return [[box(1.2, 0.22, 0.3, 0, 0.11, 0), '#B7773F'], ...[-0.4, -0.13, 0.14, 0.41].map((x, i) => [new THREE.SphereGeometry(0.15, 8, 6).translate(x, 0.3, 0), [C.pink, C.gold, C.red, C.cream][i]])];
}

/** The forge yard: an anvil on a stump, the forge hearth (flame + light), a quench barrel. */
function forgeParts() {
  return [[cyl(0.35, 0.4, 0.6), '#9A6A40'], [box(0.7, 0.16, 0.3, 0, 0.68, 0), C.iron], [box(0.36, 0.14, 0.22, 0, 0.53, 0), C.iron], [new THREE.ConeGeometry(0.12, 0.3, 4).rotateZ(Math.PI / 2).translate(0.48, 0.7, 0), C.iron],
    [box(1.6, 0.9, 1.2, 1.9, 0.45, -0.4), '#B8A890'], [box(1.7, 0.1, 1.3, 1.9, 0.95, -0.4), '#9C8E7C'], [box(0.9, 1.6, 0.9, 1.9, 1.7, -0.6), '#A89884'], [box(0.5, 1.2, 0.5, 1.9, 2.9, -0.7), '#9C8E7C']];
}

/** fx's lantern handle as a flame ({ set(on), on }) with our light-pool source. */
function fxLantern(h, src) {
  let lit = false;
  return { get on() { return lit; }, set(v) { if (v && !lit) { try { h.light?.(); } catch { /* fx */ } } lit = !!v; if (src) src.on = lit; } };
}

/**
 * LI W11 prank banners on the occupied town (cleared when free): plum cloth with a mustard grinning-hyena doodle (two
 * eye dots, a big grin, ears), hung crooked by the placement.
 */
function hyenaBannerParts() {
  const grin = new THREE.TorusGeometry(0.17, 0.035, 4, 12, Math.PI).rotateZ(Math.PI).translate(0, 2.0, 0.025);
  return [[cyl(0.05, 0.06, 3.0), C.woodDark], [box(0.8, 0.05, 0.05, 0, 2.8, 0), C.woodDark], [box(0.7, 1.4, 0.03, 0, 2.05, 0), PRANK[0]],
    [box(0.08, 0.08, 0.035, -0.12, 2.22, 0.02), PRANK[1]], [box(0.08, 0.08, 0.035, 0.12, 2.22, 0.02), PRANK[1]], [grin, PRANK[1]],
    [new THREE.ConeGeometry(0.07, 0.14, 3).translate(-0.2, 2.42, 0.02), PRANK[1]], [new THREE.ConeGeometry(0.07, 0.14, 3).translate(0.2, 2.42, 0.02), PRANK[1]]];
}

// ---------------------------------------------------------------------------------------------- setpieces
const SETPIECES = {
  /** The town wall ring (r 60) with towers, the South Gate (doors open), the castle closing the north side. */
  async townWall(kit) {
    const [wall, gate, tower] = await Promise.all([kit.tpl(M.wall), kit.tpl(M.gate, { hide: ['wall_straight_gate_door_left', 'wall_straight_gate_door_right'] }), kit.tpl(M.towerB)]);
    const n = 40, chords = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [Math.sin(a0) * WALL_R, Math.cos(a0) * WALL_R], p1 = [Math.sin(a1) * WALL_R, Math.cos(a1) * WALL_R];
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      if (Math.abs(mx) < 8 && mz < 0) continue;             // the South Gate
      if (Math.abs(mx) < 9 && mz > 0) continue;             // the castle closes the north side
      chords.push([p0, p1]);
    }
    if (wall) for (const [a, b] of chords) kit.fence(wall, a, b, { fit: { h: 5.0 }, height: 5.0, walkable: false, depthScale: 4.5, maxPieceScale: 5.0, jitter: 0.04, wobble: 0, clear: 2.2, fade: false });
    if (tower) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = Math.sin(a) * WALL_R, z = Math.cos(a) * WALL_R;
      kit.place(tower, x, z, { fit: { h: 11 }, yaw: a + Math.PI, collider: 'circle', shrink: 0.7, jitter: 0.03, clear: 3, camFade: 'solid' });
    }
    if (gate) {
      kit.place(gate, 0, -WALL_R, { fit: { x: 13 }, yaw: 0, collider: false, jitter: 0, clear: 3, camFade: 'solid' });
      // the gate's two flanks (the arch in the middle stays open, 4.6 m)
      const y = kit.h(0, -WALL_R);
      for (const sx of [-1, 1]) kit.collider({ x: sx * 4.6, z: -WALL_R, hx: 2.3, hz: 2.4, y0: y - 1, y1: y + 7, walkable: false });
      // the short wall stubs between the gate and the first chords
      kit.anchor('south_gate', 0, -WALL_R, undefined, 0);
    }
    // the road outside: hedges keep her on it between the gate and the level edge
    const hedge = await kit.tpl(M.hedge);
    if (hedge) for (const sx of [-1, 1]) kit.fence(hedge, [sx * 4.2, -63], [sx * 4.2, -68.5], { fit: { h: 1.3 }, height: 1.4, walkable: false, depthScale: 3, jitter: 0.06, clear: 0.8 });
  },

  /** Main-street and quarter houses (KayKit, 6–9 m), garden fences, flower boxes, bunting, street lanterns, trees. */
  async houses(kit) {
    const H = [
      // [model, x, z, yaw, h]  yaw turns the door (+Z) toward the street
      [M.homeBB, -8.6, -55, Math.PI / 2, 7.5], [M.homeAR, -8.2, -41, Math.PI / 2, 7], [M.homeBR, -8.4, -32.6, Math.PI / 2, 8.2], [M.homeAB, -8.2, -24.5, Math.PI / 2, 7],
      [M.homeAB, 8.6, -55, -Math.PI / 2, 7], [M.homeAR, 8.4, -41.2, -Math.PI / 2, 7], [M.homeBB, 9.4, -30, -Math.PI / 2, 8], [M.homeAR, 8.6, -19.6, -Math.PI / 2, 7],
      [M.homeAB, -16.5, -26.5, 0, 7], [M.homeBB, -31.5, -24, 0.6, 8], [M.homeAR, -45, -16, 1.0, 7], [M.homeBR, -24.5, -2.5, Math.PI, 7.5], [M.homeAB, -54, 4, Math.PI / 2, 7],
      [M.homeBR, -50.5, 20, 2.4, 8], [M.homeAR, -32, 26, Math.PI, 7], [M.homeAB, 12, -30.5, -Math.PI / 2, 7],
      [M.homeBB, 25.5, 12, -Math.PI / 2, 8], [M.homeAR, 26.5, 2.5, -Math.PI / 2, 7], [M.homeAB, 11, 34, -Math.PI / 2, 7], [M.homeBR, -11, 36, Math.PI / 2, 7.5],
      [M.homeAR, 34, 20, -2.4, 7], [M.homeBB, 38, -22, -1.2, 8], [M.homeAB, 21, -28, -0.5, 7], [M.homeAR, -20, -40, 0.5, 7], [M.homeBR, 24, 44, -2.6, 7.5], [M.homeAB, -26, 42, 2.4, 7],
      [M.marketR, -18.5, 2.0, Math.PI * 0.75, 6.0],
    ];
    const tpls = new Map();
    for (const [m] of H) if (!tpls.has(m)) tpls.set(m, await kit.tpl(m));
    for (const [m, x, z, yaw, h] of H) { const t = tpls.get(m); if (t) kit.place(t, x, z, { fit: { h }, yaw, collider: 'box', shrink: 0.86, jitter: 0.07, clear: 3.5, camFade: 'roof' }); }   // §3 roof-only fade
    // flower boxes under some windows, bunting across the streets
    const fb = kit.proc('flower_box', flowerBoxParts);
    for (const [x, z, yaw, y] of [[-5.6, -41, Math.PI / 2, 2.2], [5.6, -41.2, -Math.PI / 2, 2.2], [-5.7, -24.5, Math.PI / 2, 2.4], [5.8, -19.6, -Math.PI / 2, 2.3], [-14.2, -26.5, 0, 2.2]]) {
      kit.place(fb, x, z, { yaw, lift: y, collider: false, clear: false, occupy: false, jitter: 0.05 });
    }
    // the occupiers' prank strings (plum + mustard); the festival candy bunting (def.bunting) replaces them once free
    const prank = [];
    for (const [a, b] of PRANK_STRINGS) {
      const ya = kit.h(a[0], a[2]), yb = kit.h(b[0], b[2]);
      const g = kit.proc('bunting_' + a.join('_'), () => buntingParts([a[0], a[1] + ya, a[2]], [b[0], b[1] + yb, b[2]]));
      const pl = kit.place(g, 0, 0, { y: 0, ground: false, collider: false, clear: false, occupy: false, jitter: 0, cull: false, camFade: true });   // fades when it crosses her (iso lens)
      if (pl) prank.push(pl);
    }
    kit.onFlag('town.free', (v) => { for (const pl of prank) kit.batch.setVisible(pl.handle, !v); });
    // street lanterns (unlit by day), carts, barrels, crates, hedges
    const [lan, cart, barrel, crate, sack, treeD, treeO, fence, well] = await Promise.all([kit.tpl(M.lantern), kit.tpl(M.cart), kit.tpl(M.barrel), kit.tpl(M.crate), kit.tpl(M.sack),
      kit.tpl(M.treeD), kit.tpl(M.treeO), kit.tpl(M.fence), kit.tpl(M.well)]);
    if (lan) for (const [x, z] of [[-3.6, -52], [3.6, -46], [-3.6, -16], [3.6, -10], [-3.6, 28], [3.6, 30], [-16, -15], [-38, -10], [-46, 0], [16, -4.5], [12, 21]]) kit.place(lan, x, z, { fit: { h: 2.4 }, yaw: 0, collider: 'circle', shrink: 0.5, jitter: 0, fade: true });
    if (cart) for (const [x, z, yaw] of [[-5.4, -48, 0.3], [6.2, 25.5, 2.1], [-36, -16, 1.4]]) kit.place(cart, x, z, { fit: { max: 2.2 }, yaw, collider: 'box', shrink: 0.9, jitter: 0.05 });
    const cluster = (t, list, h) => { if (t) for (const [x, z, yaw] of list) kit.place(t, x, z, { fit: { h }, yaw, collider: 'box', shrink: 0.95, jitter: 0.08 }); };
    cluster(barrel, [[-5.2, -57.5, 0.2], [-5.6, -56.6, 1.2], [5.4, -51, 0], [-12.6, -18.6, 0.4], [-28.6, -16.6, 1.0], [-29.4, -15.8, 2.2], [14.6, 16.4, 0.7], [-39, 9.6, 0]], 0.9);
    cluster(crate, [[5.6, -52, 0.4], [-13.4, -19.4, 0.7], [22.5, -11.2, 0.2], [-33.5, -17, 0.9], [15.5, 15.2, 1.3]], 0.8);
    cluster(sack, [[-27.6, -16.2, 0.4], [-27, -15.6, 1.4], [-42.6, 7.4, 0.2]], 0.6);
    if (well) kit.place(well, -12.5, -10.5, { fit: { h: 3.2 }, yaw: 0.6, collider: 'circle', shrink: 0.7, jitter: 0.03 });
    const trees = [[-14, -46], [14, -46], [-22, 34], [28, 30], [-40, 30], [40, 4], [34, -36], [-36, -40], [-56, -6], [50, 20], [20, -46], [-48, 28]];
    trees.forEach(([x, z], i) => { const t = i % 2 ? treeD : treeO; if (t) kit.place(t, x, z, { fit: { h: 6.5 + (i % 3) }, tree: true, yaw: i * 1.3, jitter: 0.05 }); });
    // garden fences
    if (fence) for (const [a, b] of [[[-12.5, -50], [-12.5, -60]], [[12.5, -50], [12.5, -60]], [[-20, -30], [-12, -30]], [[29, 8], [29, 16]], [[-28, 30], [-36, 30]]]) kit.fence(fence, a, b, { fit: { h: 0.9 }, height: 0.9, walkable: false, depthScale: 2, jitter: 0.05, clear: 0.6, fade: true });
  },

  /** Lantern Alley (0, −34): 3 lanterns to light (E), the balcony at 3 m and its crate steps. */
  async lanternAlley(kit) {
    const ctx = kit.ctx, level = kit.level;
    const [lan, crate] = await Promise.all([kit.tpl(M.lantern), kit.tpl(M.crate)]);
    const lit = [];
    const objective = () => ctx.objectives?.counter?.('lanterns') ?? (ctx.objectives?.get?.('lanterns') || ctx.objectives?.start?.('lanterns', { max: 3, textKey: 'obj.lanterns' }));
    LANTERNS.forEach(([x, z], i) => {
      const p = lan ? kit.place(lan, x, z, { fit: { h: 2.2 }, yaw: 0, collider: 'circle', shrink: 0.5, jitter: 0 }) : null;
      const top = (p?.top ?? kit.h(x, z) + 2.2) - 0.42;
      // fx draws the lantern glow + ignition when it can (ctx.fx.lantern); the light pool keeps the real light
      const fxh = typeof ctx.fx?.lantern === 'function' ? (() => { try { return ctx.fx.lantern(new THREE.Vector3(x, top, z), { lit: false }); } catch { return null; } })() : null;
      const flame = fxh ? fxLantern(fxh, level.lightPool?.add({ pos: new THREE.Vector3(x, top, z), color: '#FFC46B', intensity: 2.2, distance: 9, on: false, flicker: 0.15 }))
        : addFlame(level, level.lightPool, x, top, z, { size: 0.55, light: 2.2, distance: 9, glow: 1.4, halo: 1.3, on: false, flicker: 0.15, color: '#FFC46B' });
      const key = `town.lantern.${i + 1}`;
      const light = (silent) => {
        if (flame.on) return;
        flame.set(true);
        lit[i] = true;
        ctx.env?.contribute?.('lantern_' + (i + 1), { fogAdd: -0.005 });
        ctx.state?.setFlag?.(key, true);
        if (!silent) {
          ctx.audio?.play3D?.('lanternLight', new THREE.Vector3(x, top, z), { vol: 0.8 });
          if (!fxh) ctx.bus.emit(E.BURST, { kind: 'lanternLight', position: new THREE.Vector3(x, top, z), count: 10 });
          objective();
          ctx.objectives?.add?.('lanterns', 1);
        }
      };
      kit.interact({ id: `lantern_${i + 1}`, at: [x + (x < 0 ? 0.9 : -0.9), z], r: 1.9, kind: 'lantern', prompt: 'prompt.light',
        enabled: () => !flame.on && !ctx.story?.isPlaying, use: () => light(false) });
      kit.onLoaded(() => { if (ctx.state?.getFlag?.(key)) light(true); });
      kit.anchor(`lantern_${i + 1}`, x, z);
    });
    // the objective shows once she walks into the alley (and on loads with some lit), until all 3 are lit
    kit.onLoaded(() => {
      const n = lit.filter(Boolean).length;
      if (n > 0 && !ctx.state?.getFlag?.('town.lanterns') && !ctx.state?.getFlag?.('town.free')) { objective(); ctx.objectives?.set?.('lanterns', n); }
    });
    kit.trigger({ id: 'alley', at: [0, -45], r: 4, once: true, when: '!town.lanterns && !town.free', fire: () => { const o = objective(); if (o) ctx.objectives?.set?.('lanterns', lit.filter(Boolean).length); } });
    kit.level.listen(E.LEVEL_UNLOAD, () => { for (let i = 1; i <= 3; i++) ctx.env?.clear?.('lantern_' + i); });
    // the balcony (5, −30) at 3.0 m over its crate steps (1 / 2 / 3 m)
    const [bx, bz] = BALCONY.at;
    kit.place(kit.proc('alley_balcony', balconyParts), bx, bz, { collider: false, clear: false, occupy: 1.6, jitter: 0.03 });
    const g = kit.h(bx, bz);
    kit.collider({ x: bx, z: bz, hx: BALCONY.size[0] / 2, hz: BALCONY.size[1] / 2, y0: g + BALCONY.y - 0.4, y1: g + BALCONY.y, balcony: true });
    kit.collider({ ax: bx - BALCONY.size[0] / 2 + 0.05, az: bz - 0.95, bx: bx - BALCONY.size[0] / 2 + 0.05, bz: bz + 0.95, r: 0.06, y0: g + BALCONY.y, y1: g + BALCONY.y + 0.9, walkable: false });
    kit.anchor('balcony', bx, bz, g + BALCONY.y, Math.PI);
    if (crate) for (const [x, z, n] of CRATE_STEPS) {
      for (let k = 0; k < n; k++) kit.place(crate, x, z, { fit: { h: 1.0 }, yaw: k * 0.25 + x, y: kit.h(x, z) + k, collider: false, clear: 0.6, occupy: 0.7, jitter: 0.08 });
      kit.collider({ x, z, hx: 0.5, hz: 0.5, y0: kit.h(x, z) - 0.6, y1: kit.h(x, z) + n, crateStep: n });
    }
  },

  /** Bakery Street: Marmalade's bakery (−26, −20) with its bread sign, the Post Office (market, mail sign), chase anchors. */
  async bakery(kit) {
    const level = kit.level;
    const [bak, post, stall] = await Promise.all([kit.tpl(M.homeBR), kit.tpl(M.marketB), kit.tpl(M.stallR)]);
    if (bak) kit.place(bak, -26.6, -20.4, { fit: { h: 6.5 }, yaw: Math.PI * 0.3, collider: 'box', shrink: 0.86, jitter: 0, clear: 3, camFade: 'roof' });
    kit.place(kit.proc('sign_bread', () => signParts('bread', '#D9A55A')), -23.3, -18.0, { yaw: Math.PI * 0.3 + Math.PI / 2, lift: 3.2, collider: false, clear: false, occupy: false, jitter: 0 });
    if (stall) kit.place(stall, -21.0, -21.8, { fit: { h: 2.4 }, yaw: Math.PI * 0.3, collider: 'box', jitter: 0.04 });
    kit.anchor('bakery_door', -23.2, -19.2, undefined, Math.PI * 0.3);
    kit.anchor('bakery_meet', -21.4, -16.6, undefined, Math.PI + Math.PI * 0.3);
    kit.anchor('bakery_cot', -22, -20, undefined, -Math.PI / 2);
    if (post) kit.place(post, POST.at[0], POST.at[1], { fit: { max: 9 }, yaw: Math.PI / 2, collider: 'box', shrink: 0.88, jitter: 0, clear: 3, camFade: 'roof' });
    kit.place(kit.proc('sign_mail', () => signParts('letter')), -36.4, 6.4, { yaw: Math.PI / 2 + Math.PI / 2, lift: 3.0, collider: false, clear: false, occupy: false, jitter: 0 });
    kit.anchor('post_office', POST.at[0], POST.at[1], undefined, Math.PI / 2);
    kit.anchor('post_steps', POST.steps[0], POST.steps[1], undefined, Math.PI / 2);
    CHASE.forEach(([x, z], i) => kit.anchor('chase_' + i, x, z));
    kit.paint(-24, -17, 4, '#E0C69A', 0.3);
    level.bakery = { door: [-23.2, -19.2] };
  },

  /** The Forge Yard (19, −4): the blacksmith (32.5, −10), anvil + hearth (lit flame), weapon rack. */
  async forge(kit) {
    const level = kit.level;
    const smith = await kit.tpl(M.smith);
    if (smith) kit.place(smith, 32.5, -10, { fit: { h: 6.5 }, yaw: -Math.PI / 2, collider: 'box', shrink: 0.85, jitter: 0, clear: 3, camFade: 'roof' });
    const fp = kit.place(kit.proc('forge_yard', forgeParts), 26.4, -12.2, { yaw: -0.3, collider: 'box', shrink: 0.9, jitter: 0.03 });
    if (fp) addFlame(level, level.lightPool, 26.4 + Math.cos(-0.3) * 1.9 + Math.sin(-0.3) * -0.4, fp.y + 1.1, -12.2 - Math.sin(-0.3) * 1.9 + Math.cos(-0.3) * -0.4, { size: 0.9, light: 1.6, distance: 7, glow: 1.2 });
    kit.place(kit.proc('sign_anvil', () => signParts('anvil')), 28.3, -6.2, { yaw: -Math.PI / 2, lift: 3.0, collider: false, clear: false, occupy: false, jitter: 0 });
    kit.anchor('forge', 26.4, -9.6, undefined, -Math.PI / 2);
  },

  /** The Square (0, 8): the fountain (rim 0.6) with the cat statue (base 1.6, top 2.5), stalls round the edge. */
  async square(kit, zone) {
    const level = kit.level, [cx, cz] = zone.at;
    const [fountain, stallR, stallG, bench, banner] = await Promise.all([kit.tpl(M.fountain), kit.tpl(M.stallR), kit.tpl(M.stallG), kit.tpl(M.stallBench), kit.tpl(M.banner)]);
    const g = kit.h(cx, cz);
    if (fountain) {
      const b = fountain.box, s = (SQUARE.fountainR * 2) / (b.max.x - b.min.x), sy = SQUARE.rim / (b.max.y - b.min.y);
      kit.place(fountain, cx, cz, { scale: [s, sy, s], yaw: 0, collider: false, clear: 3.6, occupy: 3.6, jitter: 0 });
    }
    kit.place(kit.proc('fountain_water', fountainWaterParts), cx, cz, { collider: false, clear: false, occupy: false, jitter: 0 });
    kit.place(kit.proc('cat_statue', statueParts), cx, cz, { yaw: Math.PI, collider: false, clear: false, occupy: false, jitter: 0 });
    // rim (walkable 0.6), statue base (1.6), statue top (2.5): Toffee's climb
    kit.collider({ x: cx, z: cz, r: SQUARE.fountainR, y0: g - 0.6, y1: g + SQUARE.rim, fountain: true });
    kit.collider({ x: cx, z: cz, hx: 0.75, hz: 0.75, y0: g + SQUARE.rim - 0.1, y1: g + SQUARE.base });
    kit.collider({ x: cx, z: cz, r: 0.36, y0: g + SQUARE.base - 0.1, y1: g + SQUARE.top });
    kit.anchor('fountain', cx, cz, g + SQUARE.rim, 0);
    kit.anchor('statue_top', cx, cz, g + SQUARE.top, Math.PI);
    // market stalls and benches around the edge of the square (outside the fighting ring)
    const ring = [[stallR, 0.7], [stallG, 1.35], [stallR, 2.25], [stallG, 3.75], [stallR, 4.5], [stallG, 5.6]];
    for (const [t, a] of ring) { if (!t) continue; const x = cx + Math.sin(a) * 16.6, z = cz + Math.cos(a) * 16.6; if (kit.roadClearance(x, z) < 1.2) continue; kit.place(t, x, z, { fit: { h: 2.5 }, yaw: a + Math.PI, collider: 'box', jitter: 0.05 }); }
    if (bench) for (const a of [0.3, 2.9, 3.5, 6.0]) { const x = cx + Math.sin(a) * 6.2, z = cz + Math.cos(a) * 6.2; kit.place(bench, x, z, { fit: { max: 1.6 }, yaw: a, collider: 'box', jitter: 0.05 }); }
    // the occupiers' banners (only while the town is occupied)
    const hb = kit.proc('hyena_banner', hyenaBannerParts);
    const hbs = [];
    for (const [x, z, yaw] of [[-6.5, 18.5, 0.5], [7.5, -3.5, 2.6], [-3.5, -47, 0.2], [3.4, -27, -0.4]]) { const p = kit.place(hb, x, z, { yaw, tiltZ: 0.12, collider: false, clear: 0.4, occupy: 0.5, jitter: 0.03 }); if (p) hbs.push(p); }
    kit.onFlag('town.free', (v) => { for (const p of hbs) kit.batch.setVisible(p.handle, !v); });
    if (banner) for (const [x, z, yaw] of [[-2.9, 31.5, 0], [2.9, 31.5, 0]]) kit.place(banner, x, z, { fit: { h: 1.6 }, lift: 2.6, yaw, collider: false, clear: false, occupy: false, jitter: 0 });
    level.square = { at: zone.at };
  },

  /** Castle Steps, terrace, Bell Tower (outside stair flights, the loft ledge, the bell platform + Sunbell), castle. */
  async castle(kit) {
    const level = kit.level;
    const [castle, tower, towerBlue, church, tavern] = await Promise.all([kit.tpl(M.castle), kit.tpl(M.towerA), kit.tpl(M.towerABlue), kit.tpl(M.church), kit.tpl(M.tavern)]);
    const T0 = TERRACE, top = T0.h;
    // steps up to the terrace (z 36.8 → 41), retaining walls left and right
    const run = (T0.z0 - T0.stepsZ0) / T0.steps, rise = top / T0.steps;
    const g0 = kit.h(0, T0.stepsZ0 - 0.5);
    const stone = kit.merged('terrace');
    kit.place(kit.proc('castle_steps', () => stepsParts(T0.steps, T0.stepsW, run, rise)), 0, T0.stepsZ0, { y: g0, collider: false, clear: false, occupy: false, jitter: 0, ground: false, into: stone });
    for (let i = 0; i < T0.steps; i++) kit.collider({ x: 0, z: T0.stepsZ0 + run * (i + 0.5), hx: T0.stepsW / 2, hz: run / 2, y0: g0 - 0.6, y1: g0 + rise * (i + 1) });
    for (const sx of [-1, 1]) {
      const x0 = sx * (T0.stepsW / 2 + 0.6), x1 = sx * T0.x1, len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
      kit.place(kit.proc('terrace_wall_' + Math.round(len), () => terraceWallParts(len, top + 0.5)), cx, T0.z0 - 0.3, { y: g0, collider: false, clear: false, occupy: false, jitter: 0.02, ground: false, into: stone });
      kit.collider({ x: cx, z: T0.z0 - 0.3, hx: len / 2, hz: 0.35, y0: g0 - 0.6, y1: g0 + top + 0.5, walkable: false });
      kit.collider({ x: sx * (T0.stepsW / 2 + 0.3), z: T0.stepsZ0 + (T0.z0 - T0.stepsZ0) / 2, hx: 0.3, hz: (T0.z0 - T0.stepsZ0) / 2, y0: g0 - 0.6, y1: g0 + top + 0.5, walkable: false });
    }
    // the terrace's side walls (east and west), then the masonry mesh
    for (const sx of [-1, 1]) {
      const len = T0.z1 - T0.z0 - 2;
      const tpl = kit.proc('terrace_side', () => terraceWallParts(len, top + 0.5).map(([g, c]) => [g.rotateY(Math.PI / 2), c]));
      kit.place(tpl, sx * (T0.x1 + 0.3), T0.z0 + len / 2, { y: g0, collider: false, clear: false, occupy: false, jitter: 0.02, ground: false, into: stone });
      kit.collider({ x: sx * (T0.x1 + 0.3), z: T0.z0 + len / 2, hx: 0.35, hz: len / 2, y0: g0 - 0.6, y1: g0 + top + 0.5, walkable: false });
    }
    stone.build();
    kit.anchor('castle_steps', 0, 38, undefined, Math.PI);
    kit.anchor('snowpaw', 0, 41.6, top + kit.h(0, 41.6) - top, Math.PI);
    // the Bell Tower (16 m) on the terrace, the castle behind it
    const [tx, tz] = TOWER.at, tg = kit.h(tx, tz);
    if (tower) kit.place(tower, tx, tz, { fit: { h: TOWER.h }, yaw: Math.PI, collider: 'box', shrink: 0.85, jitter: 0, clear: 4, camFade: 'solid' });
    if (castle) kit.place(castle, 0, 65.6, { fit: { h: 18 }, yaw: Math.PI, collider: 'box', shrink: 0.85, jitter: 0, clear: 5, cull: false, camFade: 'solid' });
    // three stair flights up the tower's south face to the loft ledge (y 6 above the terrace)
    const tGround = kit.h(-5, 47);
    FLIGHTS.forEach((f, i) => {
      kit.place(kit.proc('tower_flight_' + i, () => flightParts(f, 0)), 0, 0, { y: tGround, collider: false, clear: false, occupy: false, jitter: 0.03, ground: false });
      const n = 8, rn = Math.abs(f.x1 - f.x0) / n;
      for (let k = 0; k < n; k++) kit.collider({ x: f.x0 + f.dir * rn * (k + 0.5), z: f.z, hx: rn / 2, hz: (f.w ?? 1.4) / 2, y0: tGround - 0.6, y1: tGround + f.y0 + (k + 1) * 0.25, step: `f${i}` });
    });
    // landings between flights (east after flight 1, west after flight 2)
    for (const [x0, x1, z0, z1, y] of [[-3, -1.6, 45.0, 48.0, 2], [-8.4, -7, 46.5, 49.5, 4]]) {
      kit.place(kit.proc(`landing_${x0}`, () => landingParts(x0, x1, z0, z1, y)), 0, 0, { y: tGround, collider: false, clear: false, occupy: false, jitter: 0.03, ground: false });
      kit.collider({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y0: tGround - 0.6, y1: tGround + y });
    }
    // the loft ledge (Octree-style box 2.5 × 1.5 at y 6), widened west to meet the last flight
    const L = TOWER.ledge, ly = kit.h(L.at[0], L.at[1]) + L.y;
    kit.place(kit.proc('loft_ledge', () => [[box(L.size[0] + 1.8, 0.16, L.size[1], -0.9, -0.08, 0), C.plank], [box(L.size[0] + 1.8, 0.06, 0.06, -0.9, 0.9, -L.size[1] / 2 + 0.03), C.wood],
      ...[-2.6, -1.2, 0.2, 1.2].map((x) => [cyl(0.04, 0.04, 0.9, x, 0, -L.size[1] / 2 + 0.03, 5), C.woodDark])]), L.at[0], L.at[1], { y: ly, collider: false, clear: false, occupy: false, jitter: 0, ground: false });
    kit.collider({ x: L.at[0] - 0.9, z: L.at[1], hx: (L.size[0] + 1.8) / 2, hz: L.size[1] / 2, y0: ly - 0.5, y1: ly, ledge: true });
    kit.collider({ ax: L.at[0] - 2.75, az: L.at[1] - L.size[1] / 2, bx: L.at[0] + 1.25, bz: L.at[1] - L.size[1] / 2, r: 0.05, y0: ly, y1: ly + 0.9, walkable: false });
    kit.anchor('loft_ledge', L.at[0], L.at[1], ly, 0);
    // the bell platform (r 2.5) and the Sunbell above it
    const by = kit.h(L.at[0], L.at[1]) + TOWER.bell.y;
    kit.place(kit.proc('bell_platform', bellPlatformParts), L.at[0], L.at[1], { y: by, collider: false, clear: false, occupy: false, jitter: 0, ground: false });
    kit.collider({ x: L.at[0], z: L.at[1], r: 2.5, y0: by - 0.5, y1: by, bellPlatform: true });
    const bell = kit.mesh(kit.proc('sunbell', sunbellParts), { name: 'sunbell' });
    const bellG = new THREE.Group(); bellG.name = 'sunbellPivot'; bellG.position.set(L.at[0], by + 3.0, L.at[1]); bell.position.y = -1.45; bellG.add(bell);
    kit.object(bellG);
    level.sunbell = bellG;
    let swing = 0;
    level.animators.push({ render: (dt, t) => { swing = Math.max(0, swing - dt * 0.15); bellG.rotation.x = Math.sin(t * 2.2) * 0.35 * swing; } });
    level.ringBell = (amt = 1) => { swing = Math.min(1, swing + amt); };
    kit.anchor('sunbell', L.at[0], L.at[1], by + 2.0, 0);
    kit.anchor('bell_platform', L.at[0], L.at[1], by, 0);
    // the Dawnstone glow in the bell once the ending has been seen
    const glow = makeGlowSprite({ color: '#FFC46B', size: 7, intensity: 2.2, fog: true });
    glow.position.set(L.at[0], by + 2.1, L.at[1]);
    level.groups.dawnstone.add(glow);
    kit.onFlag('ending.seen', (v) => level.setDawnstone(!!v));
    // library (church), tavern (patio tables), lookout tower
    if (church) kit.place(church, -21, 26.5, { fit: { h: 9 }, yaw: Math.PI / 2 + 0.3, collider: 'box', shrink: 0.85, jitter: 0, clear: 3, camFade: 'roof' });
    kit.place(kit.proc('sign_book', () => signParts('book')), -17.6, 23.6, { yaw: 0.3, lift: 3.0, collider: false, clear: false, occupy: false, jitter: 0 });
    if (tavern) kit.place(tavern, 19.6, 19.6, { fit: { h: 8 }, yaw: -Math.PI / 2, collider: 'box', shrink: 0.86, jitter: 0, clear: 3, camFade: 'roof' });
    const table = kit.proc('patio_table', () => [[cyl(0.5, 0.5, 0.06, 0, 0.72, 0, 12), C.plank], [cyl(0.06, 0.08, 0.72), C.woodDark], [cyl(0.25, 0.3, 0.04), C.woodDark],
      [cyl(0.05, 0.04, 0.12, 0.2, 0.78, 0.1, 8), C.cream]]);
    for (const [x, z] of [[13.6, 18.6], [14.4, 21.6]]) kit.place(table, x, z, { yaw: x, collider: 'circle', jitter: 0.04 });
    kit.anchor('tavern_patio', 14, 20, undefined, Math.PI / 2);
    if (towerBlue) kit.place(towerBlue, 23, 31.5, { fit: { h: 12 }, yaw: -2.4, collider: 'box', shrink: 0.85, jitter: 0, clear: 3, camFade: 'solid' });
    kit.place(kit.proc('sign_eye', () => signParts('eye')), 20.3, 29.0, { yaw: -2.4, lift: 3.0, collider: false, clear: false, occupy: false, jitter: 0 });
    kit.place(kit.proc('sign_hanger', () => signParts('hanger')), -13.6, 29.0, { yaw: Math.PI, lift: 2.8, collider: false, clear: false, occupy: false, jitter: 0 });
    kit.paint(0, 50, 9, '#E0C69A', 0.45, 3);
  },

  /** The hub: Quest Board, barracks banner, wardrobe stall, station interactables, the South Gate exit (Hub.js). */
  async hub(kit) { buildHub(kit); },
};

/**
 * CS-07 frees the town in place: the occupiers still standing leave (despawned with a poof), the arenas count as
 * cleared, the banners come down (square setpiece) and Env tweens to hub_gold (Level.moodLive).
 */
function decorate(kit) {
  const ctx = kit.ctx, level = kit.level;
  level.listen(E.FLAG_SET, (p) => {
    if (p?.key !== 'town.free' || !p.value) return;
    for (const e of [...level.spawnedEnemies]) if (ctx.enemies?.list?.includes?.(e)) { ctx.bus.emit(E.BURST, { kind: 'poof', position: e.pos.clone() }); ctx.enemies.despawn(e); }
    for (const a of level.arenas) if (!a.cleared) { for (const e of a.enemies) if (ctx.enemies?.list?.includes?.(e)) ctx.enemies.despawn(e); a.restore(); a._dropWall?.(); a.locked = false; }
  });
}

// ---------------------------------------------------------------------------------------------- the level
const occupied = '!town.free';
export default defineLevel({
  id: 'town', size: 140, res: 140, seed: 31, hills: { amp: 0.4 }, pathWidth: 6, rim: 3, pathSurface: 'stone',
  // WA §2.2: CS-10 "Big Yawn" is lavender (hub_hush; `hub_grey` is its alias), never grey
  env: { default: 'town_occupied', byFlag: [['ending.seen', 'ending_gold'], ['gate.done', 'hub_hush'], ['town.free', 'hub_gold']] }, moodLive: true,
  music: { explore: 'village_town_theme', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop',
    byFlag: [['ending.seen', 'village_bards_tale'], ['gate.done', 'story_lament_warriors_soul'], ['town.free', 'village_bards_tale']] },
  spine: SPINE,
  // CONTROLS_SPEC §11 iso camera: yaw π (the Castle Steps are north). §4.2 town_occupied / hub_*: ρ 0.04, clear 6 / 7.5,
  // topMul 1.4 (roofs fade from above, §3; the eaves' shadows draw the street edges)
  cam: { yaw: Math.PI, fog: { clear: 6, clearCombat: 7.5, topMul: 1.4 } },
  // §2.7 the Meme Cam spot: the fountain (she faces south, the fountain and the cat statue behind her)
  memeSpot: { at: [0, 3.2], yaw: Math.PI, r: 4 },
  // §5.4 Waffles' crate balcony: the 1 / 2 / 3 m crate steps up to the 3.0 m balcony (hops, both ways)
  navLinks: crateLinks(),
  // click-to-move walks round the fountain, never hops onto its rim / the statue base (Toffee's climb stays a
  // deliberate jump): a no-go disc over the basin + the agent's footprint, so a click there snaps to the paving
  navBlock: [{ at: SQUARE.at, r: SQUARE.fountainR + 0.4 }],
  paths: [{ pts: BAKERY_ST, width: 5 }, { pts: FORGE_ST, width: 5 }, { pts: EAST_ST, width: 4 }, { pts: LIB_ST, width: 4 }],
  // the castle terrace (+1.2 m) behind its retaining wall
  keep: [{ box: [TERRACE.x0, TERRACE.z0, TERRACE.x1, TERRACE.z1 + 8], h: TERRACE.h, feather: 0.9 }],
  spawns: { start: [0, -66, 0], hub: [0, -46, 0], bakery_cot: [-22, -20, -Math.PI / 2], belltower: [0, 50.5, 0, TERRACE.h + TOWER.bell.y] },
  anchors: {
    gate_road: [0, -68, null, 0], square_center: [0, 8], steps: [0, 34, null, Math.PI], crane_sunbell: [0, 30, 14], hub_view: [0, -40, 4],
  },
  zones: [
    { id: 'walls', kind: 'setpiece', at: [0, 0], props: 'townWall' },
    { id: 'houses', kind: 'setpiece', at: [0, 0], props: 'houses' },
    { id: 'southgate', kind: 'open', at: [0, -55], r: 6, onlyIf: occupied, spawns: [['rat_pike', 3, [0, -48], 3]] },
    { id: 'vigil_1', kind: 'checkpoint', at: [-5, -50], facing: 0 },
    { id: 'alley', kind: 'open', at: [0, -34], size: [8, 14], props: 'lanternAlley', onlyIf: occupied, spawns: [['rat_pike', 2, [0, -31], 3]] },
    { id: 'waffles', kind: 'kitten', kittenId: 'waffles', at: BALCONY.at, hide: 'climb', y: BALCONY.y, facing: Math.PI },
    // story plays D-03 on `arena:clear {id: 'bakery'}` (clearEvent): Bakery Street is an open fight, not a locked arena
    { id: 'bakery', kind: 'open', at: [-20, -18], r: 8, props: 'bakery', onlyIf: occupied, clearEvent: true,
      spawns: [['stealer', 3, [-21, -16], 3], ['rat_pike', 2, [-17, -20], 2]] },
    { id: 'forge', kind: 'arena', at: [19, -4], r: 9, props: 'forge', autoLockWhen: occupied, clearedWhen: 'town.free',
      waves: [[['pug', 2], ['rat_pike', 2]]],
      hints: [{ key: 'tut.pug', on: 'alert', type: 'pug' }] },
    { id: 'letter_3', kind: 'letter', letterId: 'l3', at: [28, -2] },
    { id: 'vigil_2', kind: 'checkpoint', at: [-8, -9] },
    { id: 'square', kind: 'arena', at: SQUARE.at, r: SQUARE.r, props: 'square', cam: { dist: 16 }, autoLockWhen: occupied, clearedWhen: 'town.free',
      waves: [[['rat_pike', 4]], [['pug', 2], ['rat_pike', 2]], [['stealer', 3], ['rat_pike', 2]], [['pug', 2], ['rat_xbow', 2], ['crow', 2]], [['jelly_giant', 1, { at: 'center' }]]] },
    // companions perch a climb kitten `y` above the walkable surface under it (the fountain rim, 0.6): the statue top 2.5
    { id: 'toffee', kind: 'kitten', kittenId: 'toffee', at: SQUARE.at, hide: 'climb', y: SQUARE.top - SQUARE.rim, facing: Math.PI },
    { id: 'steps', kind: 'trigger', at: [0, 34], r: 5, play: 'cs07', when: 'town.cleared.square && town.clover && !town.free', once: true },
    { id: 'castle', kind: 'setpiece', at: [0, 50], props: 'castle' },
    { id: 'muffin', kind: 'kitten', kittenId: 'muffin', at: TOWER.ledge.at, hide: 'climb', y: TOWER.ledge.y, facing: 0 },
    { id: 'hub', kind: 'setpiece', at: [0, -50], props: 'hub' },
    // §11 the hub (after `town.free`): a slightly wider view inside the walls (the square's 16 m wins there)
    { id: 'hub_view', kind: 'camera', at: [0, 0], r: WALL_R - 2, camIf: 'town.free', cam: { dist: 15 } },
  ],
  setpieces: SETPIECES,
  decorate,
  scatter: [
    { model: [M.treeD, M.treeO], n: 26, fit: { h: [6, 9] }, band: [61, 68], minDist: 5, tree: true, ignoreBlockers: true, warn: false, edge: 1 },
    { model: [M.flowers], n: 40, fit: { h: [0.5, 0.9] }, area: { at: [0, 0], r: 56 }, minDistFromPath: 3.6, minDist: 2, collider: false, clear: 0.4 },
  ],
  crates: { n: 8, milk: 2 },
  fishLines: [[[0, -60], [0, -52], 4], [[-6, -14], [-16, -16], 5], [[8, -6], [14, -6], 4], [[-30, -12], [-40, -7], 5], [[-44, 4], [-42, 11], 4], [[0, 24], [0, 31], 5], [[16, 24], [19, 28], 3]],
  // LI §4.3: the cobbles stay, multiplied toward the path cream with their contrast squeezed (≤ ±12 % L) and lifted
  pave: { texture: PAVE, tint: '#E8D7B6', mapMix: 0.4, contrast: 0.45, gain: 1.7, tile: 2.6, discs: [[SQUARE.at[0], SQUARE.at[1], SQUARE.r + 2.2]], extra: [{ pts: [[0, 41.5], [0, 60]], width: 22 }] },
  horizon: { n: 70, h: [8, 14] }, horizonFog: 0.6,
  // LI W11: the free town's festival bunting (full candy set) over the streets and Main Street, shown once `town.free`
  accent: 'town',
  buntingWhen: 'town.free',
  bunting: [
    ...PRANK_STRINGS.map(([a, b]) => ({ a: [a[0], a[1], a[2]], b: [b[0], b[1], b[2]] })),
    { a: [-5.2, 5.6, -36], b: [5.2, 5.6, -36] },
  ],
  lights: 2,
  grass: { height: 0.2, near: 0.6, flowers: 1.6 },
  grassMask: (x, z) => (Math.hypot(x, z) > 58 ? 1 : 0.75),
  models: [M.wall, M.gate, M.towerB, M.towerA, M.towerABlue, M.castle, M.homeAR, M.homeAB, M.homeBR, M.homeBB, M.tavern, M.smith, M.marketR, M.marketB, M.church, M.well,
    M.fountain, M.lantern, M.stallR, M.stallG, M.stallBench, M.banner, M.hedge, M.fence, M.cart, M.crate, M.barrel, M.sack, M.treeD, M.treeO],
});
