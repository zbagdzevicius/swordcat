// src/world/levels/forest.js  (owner: world) — L2 Whiskerwood, Chapter 2 (GAME_DESIGN §12.4). A giant-oak forest in
// green-grey fog: the Forest Gate (an arch of two leaning oaks), the Mushroom Ring (5 cap platforms in a spiral,
// caps 2 and 4 bounce, Heart Bell #1 on cap 5; the mushroom house), Spider Hollow (arena, web patches, the cracked
// boulder hiding Pebble), the Treetop (the giant oak, its branch holding Sage's cage over the path, root ledges for
// the crossbows; companions hang the cage and its 3 rope posts), the Stump Crossing (deep stream, 6 stumps, the
// fallen-log bridge at x 40, Letter #2 on stump 4), the Lantern Camp (campfire, tent, Pudding's sleeping spot,
// CS-04), the Rat Camp (arena, torches, tents, Sprout's cage) and the Cheese Mill (B1 Grizzlechop's arena: the
// watermill, 6 millstone pillars, the mill deck and its stairs), then the exit to Pawsbury.
import * as THREE from 'three';
import { defineLevel } from '../LevelKit.js';
import { PropActor } from '../PropActor.js';
import { LightPool, addFlame, Fireflies, ropeGeometry } from '../Dressing.js';
import { BOSSES } from '../../core/config.js';
import { E } from '../../core/events.js';

const N = (n) => `models/env/nature/${n}.glb`;
const M = {
  oak: N('tree_oak'), fat: N('tree_fat'), detailed: N('tree_detailed'),
  // LI §5: warm autumn accents between the greens (≥ 6 m off the path) instead of the dark oaks
  oakFall: N('tree_oak_fall'), defaultFall: N('tree_default_fall'),
  mushRedTall: N('mushroom_redTall'), mushRedGroup: N('mushroom_redGroup'), mushTanTall: N('mushroom_tanTall'), mushRed: N('mushroom_red'), mushTanGroup: N('mushroom_tanGroup'),
  stumpRound: N('stump_round'), stumpOld: N('stump_old'), stumpOldTall: N('stump_oldTall'), log: N('log'), logLarge: N('log_large'), logStack: N('log_stack'),
  campfire: N('campfire_logs'), tent: N('tent_detailedOpen'), tentSmall: N('tent_smallOpen'),
  bush: N('plant_bush'), bushLarge: N('plant_bushLarge'), fern: N('plant_flatTall'), boulder: N('rock_largeA'), rockTallA: N('rock_tallA'), rockTallB: N('rock_tallB'),
  // LI §4.2: the rat camp's dungeon torches become stakes with an uncarved pumpkin lantern on top (warm, not grim)
  pumpkin: 'models/env/graveyard/pumpkin.glb', mill: 'models/env/village-kaykit/buildings/building_watermill_red.glb',
  wheel: 'models/env/town/watermill.glb', lily: N('lily_large'), reeds: N('grass_large'),
};
const ROCKS = ['A', 'B', 'C', 'D', 'E'].map((k) => N('rock_small' + k));
const STONES = ['A', 'B', 'C'].map((k) => N('stone_large' + k));

const C = { bark: '#7E4E2A', barkDark: '#5E3A22', wood: '#B7773F', woodDark: '#7E4E2A', plank: '#D9A86A', rope: '#C9A06A', stone: '#C9BCA6', stoneDark: '#9C8E7C',
  cream: '#FFF3E2', capRed: '#E8553F', capTan: '#C9A27A', stem: '#E6DCC4', leaf: '#58A84A', leafDark: '#2F7A45', cheese: '#E8C35A', cheeseDark: '#C99A34', web: '#D8DCD6', moss: '#8DB65A' };

/** §12.4 spine (+ a bend at (27, 0) so the path passes beside the giant oak instead of through its trunk). */
const SPINE = [[0, -85], [-20, -58], [-10, -30], [18, -8], [27, 0], [24, 18], [6, 40], [-16, 56], [-10, 84]];
/** Mushroom Ring caps (§12.4): ~2.5 m apart in a spiral, heights 1 / 2 / 3 / 4 / 5.2, caps 2 and 4 bounce (vy 9). */
export const MUSHROOM_CAPS = Object.freeze([
  { at: [-26.6, -55.3], y: 1.0, bounce: 0 }, { at: [-28.3, -57.1], y: 2.0, bounce: 9 }, { at: [-28.2, -59.6], y: 3.0, bounce: 0 },
  { at: [-26.4, -61.3], y: 4.0, bounce: 9 }, { at: [-24.0, -62.0], y: 5.2, bounce: 0 },
]);
export const CAP_R = 1.2;
/** CONTROLS_SPEC §11 the Mushroom Ring hint: the camera swings to the spiral's open (east) side, flatter and closer. */
export const MUSHROOM_CAM = Object.freeze({ yaw: 1.75, pitch: 0.768 /* 44° */, dist: 11, clear: 7 });
/** Stump Crossing (§12.4): the deep stream (z 13–23) and its 6 stumps; gaps ≤ 3.0 m. */
export const STREAM = { y: -0.4, width: 10, pts: [[-100, 16.5], [-70, 19], [-40, 17.2], [-10, 18.6], [10, 17.6], [24, 18], [44, 18.4], [70, 17], [100, 18.8]] };
export const STUMPS = Object.freeze([[20, 12.5], [22, 15], [25, 16.5], [23, 19], [26, 21], [24, 23.5]]);
export const STUMP = Object.freeze({ r: 0.8, top: 0.1 });
/** The Treetop: the giant oak, the hanging point (companions' cage at (18, −8), 4 m), the crossbow root ledges. */
export const TREETOP = Object.freeze({ trunk: [17, -1], cage: [18, -8], ledges: [[14.0, -2.0], [19.0, 1.4]], ledgeY: 1.5 });
/** The Cheese Mill (§11.2): arena r 12 at (−10, 84), 6 millstone pillars r 0.8 × 2.5 m at radius 8. */
const MILL = { at: [-10, 84], r: 12, deck: { x0: -16.5, x1: -3.5, z0: 92.2, z1: 95.6, y: 2.0 } };
export const MILL_PILLARS = Object.freeze(Array.from({ length: BOSSES.grizzlechop.pillars.n }, (_, i) => {
  const a = Math.PI / 6 + (i / BOSSES.grizzlechop.pillars.n) * Math.PI * 2, R = BOSSES.grizzlechop.pillars.r;
  return [Math.round((MILL.at[0] + Math.sin(a) * R) * 100) / 100, Math.round((MILL.at[1] + Math.cos(a) * R) * 100) / 100];
}));
const CAMP = { at: [6, 40], fire: [6, 40], tent: [10, 44], pud: [6, 48] };
const RATCAMP = { at: [-16, 56], r: 13 };

// ---------------------------------------------------------------------------------------------- procedural parts
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

/** A giant mushroom platform: a pale stem of height `h` (the cap top), a domed cap r CAP_R with spots. */
function capParts(h, bounce, arrowYaw = 0) {
  const capCol = bounce ? C.capRed : C.capTan;
  const cap = new THREE.SphereGeometry(CAP_R * 1.06, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.42, 1); cap.translate(0, h - 0.34, 0);
  const rim = new THREE.CylinderGeometry(CAP_R * 1.06, CAP_R * 0.9, 0.16, 18).translate(0, h - 0.42, 0);
  const p = [[cyl(0.26, 0.38, h - 0.3, 0, 0, 0, 10), C.stem], [cap, capCol], [rim, '#F0E4C8']];
  // a little skirt ring on the stem, spots on the cap
  p.push([new THREE.TorusGeometry(0.3, 0.05, 5, 12).rotateX(Math.PI / 2).translate(0, h * 0.62, 0), '#F0E4C8']);
  // CONTROLS_SPEC §11: bounce caps carry a pale up-arrow on top (readable from the iso camera: "this one bounces")
  if (bounce) {
    const top = h - 0.34 + CAP_R * 1.06 * 0.42 + 0.015;
    const tri = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.42), new THREE.Vector2(-0.34, 0.02), new THREE.Vector2(0.34, 0.02)]));
    tri.rotateX(-Math.PI / 2); tri.translate(0, 0, -0.02); tri.rotateY(arrowYaw); tri.translate(0, top, 0);
    const stem = new THREE.PlaneGeometry(0.2, 0.36); stem.rotateX(-Math.PI / 2); stem.translate(0, 0, 0.17); stem.rotateY(arrowYaw); stem.translate(0, top, 0);
    p.push([tri, '#F4EBD6'], [stem, '#F4EBD6']);
  }
  const spots = bounce ? 7 : 5;
  for (let i = 0; i < spots; i++) {
    const a = i * 2.4, rr = 0.35 + (i % 3) * 0.24, y = h - 0.34 + Math.sqrt(Math.max(0, 1 - (rr / (CAP_R * 1.06)) ** 2)) * CAP_R * 1.06 * 0.42;
    p.push([new THREE.SphereGeometry(0.12 + (i % 2) * 0.05, 8, 5).scale(1, 0.35, 1).translate(Math.sin(a) * rr, y, Math.cos(a) * rr), C.cream]);
  }
  return p;
}

/** The mushroom house (procedural): a cream stem cottage, round door facing +Z, two windows, a red spotted cap, a chimney. */
function mushroomHouseParts() {
  const p = [[cyl(1.35, 1.55, 2.5), C.stem], [cyl(1.6, 1.65, 0.18), '#D8C8A8']];
  const cap = new THREE.SphereGeometry(2.9, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.62, 1); cap.translate(0, 2.3, 0);
  p.push([cap, C.capRed], [new THREE.CylinderGeometry(2.9, 2.6, 0.22, 22).translate(0, 2.25, 0), '#F0E4C8']);
  for (let i = 0; i < 9; i++) { const a = i * 2.39, rr = 0.6 + (i % 3) * 0.7, y = 2.3 + Math.sqrt(Math.max(0, 1 - (rr / 2.9) ** 2)) * 2.9 * 0.62; p.push([new THREE.SphereGeometry(0.26, 8, 5).scale(1, 0.35, 1).translate(Math.sin(a) * rr, y, Math.cos(a) * rr), C.cream]); }
  // door (round top) facing +Z
  p.push([box(0.82, 1.15, 0.12, 0, 0.6, 1.47), C.woodDark], [new THREE.CylinderGeometry(0.41, 0.41, 0.12, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1.18, 1.47), C.woodDark]);
  p.push([new THREE.SphereGeometry(0.05, 6, 4).translate(0.25, 0.62, 1.55), '#E8C35A'], [box(1.2, 0.08, 0.5, 0, 0.04, 1.75), C.plank]);
  for (const s of [-1, 1]) { p.push([new THREE.CircleGeometry(0.26, 12).translate(0, 0, 0).rotateY(s * 0.9).translate(Math.sin(s * 0.9) * 1.46, 1.5, Math.cos(s * 0.9) * 1.46), '#FFD27A']); p.push([new THREE.TorusGeometry(0.27, 0.05, 5, 12).rotateY(s * 0.9).translate(Math.sin(s * 0.9) * 1.47, 1.5, Math.cos(s * 0.9) * 1.47), C.wood]); }
  p.push([cyl(0.2, 0.24, 1.3, -1.2, 3.2, -0.6), C.stoneDark], [cyl(0.26, 0.26, 0.14, -1.2, 4.48, -0.6), C.stone]);
  return p;
}

/** A spider-web patch on the ground (decal r 1.0): 8 spokes + 4 rings of thin pale strands. */
function webParts(r = 1.0) {
  const p = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push([box(0.025, 0.008, r, Math.sin(a) * r / 2, 0.012, Math.cos(a) * r / 2, a), C.web]); }
  for (let k = 1; k <= 4; k++) { const rr = (k / 4.4) * r; p.push([new THREE.TorusGeometry(rr, 0.012, 3, 16).rotateX(Math.PI / 2).translate(0, 0.012, 0), C.web]); }
  return p;
}

/** A root ledge (top at `y`): a gnarled wooden shelf on two root legs, plus a lower root step at y / 2. */
function rootLedgeParts(y, yaw = 0) {
  const p = [[box(1.9, 0.3, 1.5, 0, y - 0.15, 0), C.bark], [box(1.7, 0.08, 1.3, 0, y + 0.02, 0), '#8A5A36']];
  p.push([cyl(0.22, 0.32, y - 0.2, -0.6, 0, 0.4), C.barkDark], [cyl(0.2, 0.3, y - 0.2, 0.55, 0, -0.45), C.barkDark]);
  p.push([box(1.0, y / 2, 0.9, 0, y / 4, 1.15), C.bark], [box(0.9, 0.06, 0.8, 0, y / 2 + 0.03, 1.15), '#8A5A36']);
  p.push([box(0.9, 0.5, 0.5, 0.5, 0.25, -1.0, 0.4), C.mossDark ?? C.moss]);
  return p.map(([g, c]) => [yaw ? g.rotateY(yaw) : g, c]);
}

/** The oak's long branch reaching over the path (from the trunk to above the cage) with a leaf clump at its end. */
function branchParts(from, to) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(0.22, 0.42, len, 9);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q).translate(a.x, a.y, a.z);
  const p = [[g, C.bark]];
  // a fork and a knot near the tip
  const tip = b.clone(), side = new THREE.CylinderGeometry(0.1, 0.2, 2.2, 7).translate(0, 1.1, 0);
  side.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.4, -0.7))).translate(tip.x - d.x * 0.25, tip.y - d.y * 0.25, tip.z - d.z * 0.25);
  p.push([side, C.bark]);
  for (const [dx, dy, dz, r] of [[0.2, 0.8, 0.3, 1.5], [-1.0, 0.5, -0.5, 1.2], [0.9, 0.4, -0.9, 1.1], [-0.3, 1.2, -1.2, 1.0], [-1.6, 0.9, 1.0, 0.9]]) {
    p.push([new THREE.IcosahedronGeometry(r, 1).translate(tip.x + dx, tip.y + dy, tip.z + dz), (dx + dz) > 0 ? C.leaf : C.leafDark]);
  }
  // the rope ring the cage hangs from
  p.push([new THREE.TorusGeometry(0.16, 0.05, 5, 12).translate(tip.x, tip.y - 0.4, tip.z), C.rope]);
  return p;
}

/** A millstone pillar (§11.2: r 0.8, 2.5 m): three stacked stones with holes, a cheese wedge on top. */
function millstoneParts() {
  const p = [];
  for (let i = 0; i < 3; i++) {
    const r = 0.8 - (i === 1 ? 0.06 : 0), y = i * 0.83;
    p.push([cyl(r, r, 0.78, 0, y, 0, 18), i === 1 ? C.stone : C.stoneDark], [cyl(0.16, 0.16, 0.8, 0, y, 0, 8), '#7E6A58']);
    p.push([new THREE.TorusGeometry(r - 0.02, 0.04, 4, 18).rotateX(Math.PI / 2).translate(0, y + 0.78, 0), '#9C8E7C']);
  }
  const wedge = new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12, 1, false, 0, Math.PI * 0.45).translate(0, 2.5 + 0.12, 0);
  p.push([wedge, C.cheese]);
  return p;
}

/** The mill deck (y 2.0 on the arena's north edge): planks on posts, a rail, and a stair down its south-east end. */
function millDeckParts(d, steps) {
  const w = d.x1 - d.x0, dp = d.z1 - d.z0, cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
  const p = [[box(w, 0.2, dp, cx, d.y - 0.1, cz), C.plank]];
  for (let i = 0; i < 7; i++) p.push([box(0.06, 0.012, dp, d.x0 + (i + 0.5) * (w / 7), d.y + 0.006, cz), C.woodDark]);
  for (const x of [d.x0 + 0.3, cx, d.x1 - 0.3]) for (const z of [d.z0 + 0.3, d.z1 - 0.3]) p.push([cyl(0.14, 0.16, d.y, x, 0, z), C.woodDark]);
  for (const x of [d.x0 + 0.1, d.x1 - 0.1]) p.push([box(0.08, 0.9, dp, x, d.y + 0.45, cz), C.wood]);
  p.push([box(w, 0.08, 0.08, cx, d.y + 0.9, d.z1 - 0.05), C.wood]);
  for (const s of steps) p.push([box(s.w, s.top, s.d, s.x, s.top / 2, s.z), C.plank], [box(s.w, 0.05, s.d, s.x, s.top + 0.02, s.z), '#B09068']);
  return p;
}

/** Stairs from the ground up to the mill deck (the middle of its south face, between two pillars): 8 steps of 0.25 m. */
function millSteps(d) {
  const out = [], n = 8, run = 0.42;
  for (let i = 0; i < n; i++) out.push({ x: (d.x0 + d.x1) / 2, z: d.z0 - run * (n - i) + run / 2, w: 1.8, d: run, top: (i + 1) * (d.y / n) });
  return out;
}

/** A standing stone ring around the campfire, plus a cooking tripod with a pot. */
function campRingParts() {
  const p = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; p.push([new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.03, 0).scale(1.2, 0.7, 1).translate(Math.sin(a) * 0.85, 0.08, Math.cos(a) * 0.85), i % 2 ? C.stone : C.stoneDark]); }
  const leg = (a) => { const g = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5).translate(0, 0.75, 0); g.rotateZ(0.32); g.rotateY(a); return g.translate(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42); };
  for (let i = 0; i < 3; i++) p.push([leg((i / 3) * Math.PI * 2 + 0.4), C.woodDark]);
  p.push([new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65).translate(0, 0.98, 0), '#6E7A8E']);
  return p;
}

/** Rat camp dressing: a cheese-wheel stack and a rat banner (a cheese wedge on red). */
function cheeseStackParts() {
  const p = [];
  for (const [x, z, y] of [[0, 0, 0], [0.75, 0.2, 0], [0.35, 0.05, 0.32], [-0.6, -0.5, 0]]) p.push([cyl(0.38, 0.38, 0.3, x, y, z, 16), C.cheese], [cyl(0.385, 0.385, 0.02, x, y + 0.14, z, 16), C.cheeseDark]);
  return p;
}
function ratBannerParts() {
  // LI §5: a silly, readable faction mark: a cheese wedge on Snickerpack teal (was dried-blood red)
  return [[cyl(0.05, 0.06, 2.8), C.woodDark], [box(0.9, 0.05, 0.05, 0.3, 2.6, 0), C.woodDark], [box(0.7, 1.1, 0.03, 0.42, 2.0, 0), '#3FA59A'],
    [new THREE.CylinderGeometry(0.22, 0.22, 0.04, 3).rotateX(Math.PI / 2).translate(0.42, 2.05, 0.03), C.cheese]];
}
/** The pumpkin-lantern stake (LI §4.2): a honey-wood stake, the pumpkin sits on top (base at 0, 1.7 m). */
function lanternStakeParts() {
  return [[cyl(0.07, 0.09, 1.7), C.wood], [box(0.34, 0.05, 0.34, 0, 1.7, 0), C.woodDark]];
}
/** Pointed stake palisade segment (4 stakes). */
function stakesParts() {
  const p = [];
  for (let i = 0; i < 4; i++) { const h = 1.4 + (i % 2) * 0.25; p.push([cyl(0.12, 0.13, h, -0.75 + i * 0.5, 0, 0, 6), C.wood], [new THREE.ConeGeometry(0.13, 0.35, 6).translate(-0.75 + i * 0.5, h + 0.17, 0), C.woodDark]); }
  p.push([box(2.1, 0.1, 0.08, 0, 0.9, 0.12), C.woodDark]);
  return p;
}
/** The gate sign "Whiskerwood": a post with an arrow plank. */
function gateSignParts() {
  return [[cyl(0.08, 0.1, 2.2), C.woodDark], [box(1.4, 0.36, 0.06, 0.45, 1.85, 0), C.plank], [new THREE.ConeGeometry(0.24, 0.3, 3).rotateZ(-Math.PI / 2).translate(1.27, 1.85, 0), C.plank],
    [box(1.0, 0.05, 0.065, 0.4, 1.88, 0), '#9A6A40'], [box(0.7, 0.05, 0.065, 0.3, 1.78, 0), '#9A6A40']];
}

// ---------------------------------------------------------------------------------------------- setpieces
const SETPIECES = {
  /** Forest Gate (0, −85): two giant oaks leaning into an arch, roots, a sign, a lantern post. */
  async forestGate(kit) {
    const [oak] = await Promise.all([kit.tpl(M.oak)]);
    if (oak) {
      kit.place(oak, -5.6, -83.5, { fit: { h: 14 }, tree: true, yaw: 0.4, tiltZ: -0.14, sink: 0.3, trunk: 0.9, jitter: 0.04 });
      kit.place(oak, 5.8, -84.2, { fit: { h: 14.5 }, tree: true, yaw: 2.2, tiltZ: 0.15, sink: 0.3, trunk: 0.9, jitter: 0.04 });
    }
    kit.place(kit.proc('forest_sign', gateSignParts), -3.2, -88.5, { yaw: Math.PI * 0.08, collider: 'circle', shrink: 0.2, jitter: 0 });
    kit.paint(0, -85, 6, '#8E9A54', 0.35, 3);
  },

  /** Mushroom Ring (−20, −58): 5 cap platforms (caps 2 and 4 bounce), the mushroom house, a fairy ring. */
  async mushroomRing(kit) {
    MUSHROOM_CAPS.forEach((c, i) => {
      // the arrow points screen-up under the ring's camera hint (local −Z turned by hint yaw − the cap's yaw)
      const tpl = kit.proc(`mush_cap_${i}`, () => capParts(c.y, c.bounce, MUSHROOM_CAM.yaw - i * 1.3));
      const [x, z] = c.at, g = kit.h(x, z);
      kit.place(tpl, x, z, { yaw: i * 1.3, collider: false, jitter: 0.03, clear: 1.0, occupy: CAP_R + 0.3 });
      // the cap is a walkable disc at its top (a solid prism from the ground: no walking under it)
      kit.collider({ x, z, r: CAP_R, y0: g - 0.6, y1: g + c.y, ...(c.bounce ? { bounce: c.bounce } : {}), cap: i + 1 });
      kit.anchor(`cap_${i + 1}`, x, z, g + c.y);
    });
    const house = kit.proc('mushroom_house', mushroomHouseParts);
    kit.place(house, -12, -53.6, { yaw: 0, collider: 'circle', shrink: 0.5, jitter: 0, height: 3.6, clear: 2.6 });
    kit.anchor('mushroom_door', -12, -51.9, undefined, 0);
    kit.paint(-12, -51, 1.6, '#A88A5E', 0.5);
    // the fairy ring: small mushrooms on a circle around the caps
    const [r1, r2] = await Promise.all([kit.tpl(M.mushRed), kit.tpl(M.mushTanGroup)]);
    const rng = kit.rng.fork('fairy');
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, R = 6.4 + (rng() - 0.5) * 0.6, x = -26.8 + Math.sin(a) * R, z = -58.6 + Math.cos(a) * R;
      if (kit.roadClearance(x, z) < 0.5) continue;
      const t = i % 3 ? r1 : r2;
      if (t) kit.place(t, x, z, { fit: { h: 0.35 + rng() * 0.35 }, yaw: rng.angle(), collider: false, clear: 0.3, occupy: false, jitter: 0.1 });
    }
    kit.paint(-26.8, -58.6, 7.5, '#8E9A54', 0.3, 2);
  },

  /** Spider Hollow (−10, −30): web patches, dead roots, the cracked boulder (Bright / Holy only) before Pebble's nook. */
  async spiderHollow(kit, zone) {
    const ctx = kit.ctx, level = kit.level;
    const web = kit.proc('web_patch', () => webParts(1.0));
    const rng = kit.rng.fork('webs');
    const webs = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.3, R = 4 + (i % 3) * 2.4, x = zone.at[0] + Math.sin(a) * R, z = zone.at[1] + Math.cos(a) * R;
      const p = kit.place(web, x, z, { yaw: rng.angle(), scale: 1 + rng() * 0.3, collider: false, clear: 1.1, occupy: false, lift: 0.01, jitter: 0.03 });
      kit.paint(x, z, 1.4, '#8E9A54', 0.35);
      if (p) webs.push({ x, y: p.y, z, handle: p.handle });
    }
    // §12.4: the patches slow her (enemies' WebPatches: a slash cuts one); our decal goes when it is cut
    kit.onLoaded(() => {
      const svc = ctx.enemies?.webs;
      if (typeof svc?.add !== 'function') return;
      for (const w of webs) {
        try {
          const h = svc.add([w.x, w.y, w.z], { r: 1.0, life: Infinity, decal: false });
          if (h && typeof h === 'object') h.onCut = () => kit.batch.setVisible(w.handle, false);
        } catch (e) { console.warn('[world] web patch', e); }
      }
    });
    kit.paint(zone.at[0], zone.at[1], 11, '#8E9A54', 0.35, 3);
    // the nook: tall rocks around Pebble's hiding spot, the cracked boulder in its mouth
    const [boulder, ra, rb] = await Promise.all([kit.tpl(M.boulder), kit.tpl(M.rockTallA), kit.tpl(M.rockTallB)]);
    for (const [x, z, t, yaw, h] of [[-24.6, -24.4, ra, 0.6, 3.2], [-24.2, -28.4, rb, 2.1, 2.8], [-26.2, -26.6, ra, 4.0, 3.6]]) if (t) kit.place(t, x, z, { fit: { h }, yaw, collider: 'circle', shrink: 0.7, jitter: 0.05 });
    if (boulder) {
      const bp = kit.place(boulder, -21.6, -26, { fit: { h: 1.8 }, yaw: 0.7, collider: 'circle', shrink: 0.82, color: '#C9BCA6', jitter: 0 });
      if (bp) {
        const bpos = new THREE.Vector3(-21.6, bp.y, -26);
        // a crack: a dark sliver down its face
        kit.place(kit.proc('crack_mark', () => [[box(0.06, 1.2, 0.04, 0, 0.6, 0, 0.2), '#7E6248'], [box(0.04, 0.5, 0.04, 0.12, 0.9, 0.02, -0.6), '#7E6248']]), -20.7, -25.6, { yaw: 1.1, collider: false, clear: false, occupy: false, jitter: 0 });
        const rock = new PropActor(ctx, { id: 'hollow_boulder', kind: 'boulder', hp: 1, breaks: 'cracked', radius: bp.radius * 0.8, height: 1.8, pos: bpos, wobble: 0.05,
          visual: { batch: kit.batch, handle: bp.handle, base: bp.matrix },
          onBreak: (self) => {
            kit.batch.setVisible(bp.handle, false);
            for (const c of bp.colliders) level.removeCollider(c);
            ctx.bus.emit(E.BURST, { kind: 'rocks', position: bpos.clone().setY(bpos.y + 0.6), count: 18 });
            ctx.bus.emit(E.SHAKE, { trauma: 0.25 });
            ctx.audio?.play3D?.('impact/impactPunch_heavy_001', bpos.clone(), { vol: 1 });
            // Pebble (companions' LostKitten 'break' hide) comes out
            try { ctx.actors?.get?.('pebble')?.reveal?.(); } catch { /* not placed */ }
            level.removeActor(self);
          } });
        rock.tags.add('cracked');
        if (ctx.state?.kittens?.includes?.('pebble')) { kit.batch.setVisible(bp.handle, false); for (const c of bp.colliders) level.removeCollider(c); }
        else kit.onLoaded(() => kit.actor(rock, null));
      }
    }
  },

  /** Treetop (18, −8): the giant oak, its branch over the path (Sage's cage hangs from it), two root ledges (y 1.5). */
  async treetop(kit) {
    const fat = await kit.tpl(M.fat);
    const [tx, tz] = TREETOP.trunk;
    if (fat) kit.place(fat, tx, tz, { fit: { h: 16 }, tree: true, yaw: 2.6, sink: 0.4, trunk: 1.25, jitter: 0.03 });
    const g = kit.h(tx, tz), cy = kit.h(TREETOP.cage[0], TREETOP.cage[1]);
    const tip = [TREETOP.cage[0], cy + 8.6, TREETOP.cage[1]];
    kit.place(kit.proc('oak_branch', () => branchParts([0, 0, 0], [tip[0] - tx, tip[1] - g - 0.4, tip[2] - tz])), tx, tz, { y: g + 0.4, collider: false, clear: false, occupy: false, jitter: 0, cull: false });
    kit.anchor('treetop_branch', tip[0], tip[2], tip[1]);
    kit.anchor('treetop_cage', TREETOP.cage[0], TREETOP.cage[1], undefined, Math.PI);
    TREETOP.ledges.forEach(([x, z], i) => {
      const yaw = Math.atan2(x - tx, z - tz);
      kit.place(kit.proc(`root_ledge_${i}`, () => rootLedgeParts(TREETOP.ledgeY, 0)), x, z, { yaw, collider: false, jitter: 0.04, clear: 1.2, occupy: 1.4 });
      const y0 = kit.h(x, z);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      kit.collider({ x, z, hx: 0.95, hz: 0.75, yaw, y0: y0 - 0.6, y1: y0 + TREETOP.ledgeY });
      kit.collider({ x: x + s * 1.15, z: z + c * 1.15, hx: 0.5, hz: 0.45, yaw, y0: y0 - 0.6, y1: y0 + TREETOP.ledgeY / 2 });
      kit.anchor(`root_ledge_${i + 1}`, x, z, y0 + TREETOP.ledgeY, yaw);
    });
    kit.paint(tx, tz, 6, '#8E9A54', 0.4, 3);
  },

  /** Stump Crossing (24, 18): 6 stumps over the deep stream, reeds and lilies, the fallen-log bridge at x 40. */
  async stumpStream(kit) {
    const level = kit.level;
    const [stump, logL, lily, reeds] = await Promise.all([kit.tpl(M.stumpRound), kit.tpl(M.logLarge), kit.tpl(M.lily), kit.tpl(M.reeds, { recolorMap: { grass: '#4E5A2E' } })]);
    STUMPS.forEach(([x, z], i) => {
      const bed = kit.h(x, z), h = STUMP.top - bed;
      if (stump) {
        const b = stump.box, sx = (STUMP.r * 2) / (b.max.x - b.min.x), sy = h / (b.max.y - b.min.y), sz = (STUMP.r * 2) / (b.max.z - b.min.z);
        kit.place(stump, x, z, { scale: [sx, sy, sz], yaw: i * 1.7, y: bed, collider: false, clear: false, occupy: 1.0, jitter: 0.04 });
      }
      kit.collider({ x, z, r: STUMP.r * 0.92, y0: bed - 0.5, y1: STUMP.top, stump: i + 1 });
      kit.anchor(`stump_${i + 1}`, x, z, STUMP.top);
    });
    // the safe way round: a fallen giant log over the stream at x 40
    if (logL) {
      const b = logL.box, len = 14, sx = len / (b.max.x - b.min.x), sy = 1.7, sz = 2.0;
      const top = 0.32, y = top - (b.max.y - b.min.y) * sy;
      kit.place(logL, 40, 18, { scale: [sx, sy, sz], yaw: Math.PI / 2, y, collider: false, clear: 0.8, occupy: 2, jitter: 0 });
      kit.collider({ x: 40, z: 18, hx: 0.55, hz: len / 2 - 0.2, y0: y - 1, y1: top, log: true });
      level.surfaces.push({ kind: 'wood', test: (px, pz) => Math.abs(px - 40) < 0.7 && Math.abs(pz - 18) < len / 2 });
      kit.anchor('log_bridge', 40, 18, top);
    }
    const rng = kit.rng.fork('stream-banks');
    if (reeds) for (let i = 0; i < 60; i++) {
      const x = -60 + rng() * 130, side = rng.sign();
      const z = STREAM_Z(x) + side * (STREAM.width / 2 - 0.2 + rng() * 1.6);
      if (Math.abs(x - 24) < 6 || Math.abs(x - 40) < 2.5) continue;
      kit.place(reeds, x, z, { fit: { h: 0.6 + rng() * 0.8 }, yaw: rng.angle(), collider: false, clear: false, occupy: false, jitter: 0.15, sink: 0.05 });
    }
    if (lily) for (let i = 0; i < 26; i++) {
      const x = -50 + rng() * 110, z = STREAM_Z(x) + (rng() - 0.5) * (STREAM.width - 2);
      if (STUMPS.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.4) || Math.abs(x - 40) < 1.6) continue;
      kit.place(lily, x, z, { fit: { x: 0.6 + rng() * 0.7 }, yaw: rng.angle(), y: STREAM.y + 0.01, ground: false, collider: false, clear: false, occupy: false, jitter: 0.1 });
    }
  },

  /** Lantern Camp (6, 40): campfire with a stone ring and pot, the tent, sitting logs, Pudding's sleeping spot. */
  async lanternCamp(kit) {
    const level = kit.level;
    const [fire, tent, log, stack] = await Promise.all([kit.tpl(M.campfire), kit.tpl(M.tent), kit.tpl(M.log), kit.tpl(M.logStack)]);
    const [fx, fz] = CAMP.fire, fy = kit.h(fx, fz);
    if (fire) kit.place(fire, fx, fz, { fit: { x: 1.1 }, yaw: 0.3, collider: 'circle', shrink: 0.7, jitter: 0, height: 0.3 });
    kit.place(kit.proc('camp_ring', campRingParts), fx, fz, { collider: false, jitter: 0.04, clear: 1.6 });
    const flame = addFlame(level, level.lightPool, fx, fy + 0.1, fz, { size: 1.9, light: 2.4, distance: 11, glow: 1.0, halo: 1.0, flicker: 0.3 });
    level.campfire = flame;
    if (tent) kit.place(tent, CAMP.tent[0], CAMP.tent[1], { fit: { h: 2.4 }, yaw: Math.PI + 0.5, collider: 'box', shrink: 0.85, jitter: 0.03 });
    if (log) { kit.place(log, 3.2, 41.6, { fit: { max: 1.9 }, yaw: 1.1, collider: 'box', jitter: 0.05 }); kit.place(log, 8.8, 37.6, { fit: { max: 1.7 }, yaw: -0.5, collider: 'box', jitter: 0.05 }); }
    if (stack) kit.place(stack, 12.4, 41.2, { fit: { max: 1.6 }, yaw: 0.2, collider: 'box', jitter: 0.05 });
    kit.paint(fx, fz, 4.5, '#A88A5E', 0.55, 2.5);
    kit.clear(fx, fz, 3.4, 0.15);
    kit.clear(CAMP.pud[0], CAMP.pud[1], 4.5, 0.4);
    kit.anchor('camp_fire', fx, fz, fy, 0);
    kit.anchor('camp_tent', CAMP.tent[0], CAMP.tent[1], undefined, Math.PI + 0.5);
    kit.anchor('pud_sleep', CAMP.pud[0], CAMP.pud[1], undefined, Math.PI);
    kit.anchor('camp_clem', 5.2, 45.8, undefined, Math.PI);
    kit.anchor('camp_mochi', 4.0, 39.2, undefined, 1.2);
    kit.anchor('camp_sage', 8.0, 39.0, undefined, -1.2);
    kit.anchor('camp_crane', 6, 32, 8);
  },

  /** Rat Camp (−16, 56): stake palisade, 6 pumpkin lanterns on stakes (lamp pools), tents, crates, cheese, banners. */
  async ratCamp(kit, zone) {
    const level = kit.level, [cx, cz] = zone.at, R = zone.r;
    const [pumpkin, tentS] = await Promise.all([kit.tpl(M.pumpkin, { tint: '#FF9A3C', key: 'pumpkin_lantern' }), kit.tpl(M.tentSmall)]);
    const stake = kit.proc('lantern_stake', lanternStakeParts);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6, x = cx + Math.sin(a) * (R - 1.6), z = cz + Math.cos(a) * (R - 1.6);
      const p = kit.place(stake, x, z, { yaw: a, collider: 'circle', shrink: 1, jitter: 0, clear: 0.6 });
      const top = p ? p.top : kit.h(x, z) + 1.75;
      if (pumpkin) kit.place(pumpkin, x, z, { y: top, fit: { h: 0.42 }, yaw: a, collider: false, clear: false, occupy: false, jitter: 0 });
      addFlame(level, level.lightPool, x, top + 0.42, z, { size: 0.55, light: 2.0, distance: 9, glow: 1.2, color: '#FFC46B' });
    }
    if (tentS) for (const [x, z, yaw] of [[-25.6, 51.5, 1.0], [-6.8, 50.2, -1.2], [-22.6, 67.6, Math.PI * 0.9]]) kit.place(tentS, x, z, { fit: { h: 2.0 }, yaw, collider: 'box', shrink: 0.85, jitter: 0.04 });
    kit.place(kit.proc('cheese_stack', cheeseStackParts), cx - 4.5, cz - 6.5, { yaw: 0.4, collider: 'circle', shrink: 0.7, jitter: 0.03 });
    for (const [x, z, yaw] of [[cx - 9.6, cz + 3.6, 0.5], [cx + 9.0, cz + 5.0, -2.2], [cx + 2.0, cz + 10.4, 3.0]]) kit.place(kit.proc('rat_banner', ratBannerParts), x, z, { yaw, collider: 'circle', shrink: 0.2, jitter: 0.03 });
    // stake palisade arcs on the east and west flanks (the spine runs through north–south)
    const stakes = kit.proc('stakes', stakesParts);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = cx + Math.sin(a) * (R + 1.2), z = cz + Math.cos(a) * (R + 1.2);
      if (kit.roadClearance(x, z) < 1.6) continue;
      kit.place(stakes, x, z, { yaw: a + Math.PI / 2, collider: 'box', shrink: 0.9, jitter: 0.05, tiltX: (kit.rng() - 0.5) * 0.12, clear: 0.8 });
    }
    kit.paint(cx, cz, R - 1, '#A88A5E', 0.42, 3);
  },

  /** Cheese Mill (−10, 84): the watermill (wheel turning) on the north edge, 6 millstone pillars, the deck and stairs. */
  async cheeseMill(kit, zone) {
    const level = kit.level, [cx, cz] = zone.at, d = MILL.deck;
    const [mill, wheel] = await Promise.all([kit.tpl(M.mill, { dynamic: ['building_watermill_wheel_red'] }), kit.tpl(M.wheel)]);
    if (mill) {
      const p = kit.place(mill, -10, 101.5, { fit: { h: 8 }, yaw: Math.PI, collider: 'box', shrink: 0.8, jitter: 0, clear: 5 });
      if (p?.parts?.length) {
        const part = p.parts[0], rot = new THREE.Matrix4(), out = new THREE.Matrix4();
        let ang = 0;
        level.animators.push({ render: (dt) => { ang += dt * 0.5; rot.makeRotationX(ang); out.multiplyMatrices(part.base, rot); kit.batch.setMatrix(part.handle, out); } });
      }
    }
    // two extra Kenney water wheels on the mill race (§11.2: the watermill ×3), turning
    if (wheel) for (const [x, z] of [[-17.6, 99.2], [-2.4, 99.2]]) {
      const tpl = wheel, b = tpl.box, sc = 4.2 / (b.max.y - b.min.y), y = kit.h(x, z) + 2.0;
      const mesh = kit.mesh(tpl, { name: 'millWheel' });
      mesh.scale.setScalar(sc);
      const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.add(mesh);
      mesh.position.set(-(b.min.x + b.max.x) / 2 * sc, -(b.min.y + b.max.y) / 2 * sc, -(b.min.z + b.max.z) / 2 * sc);
      kit.object(pivot);
      level.animators.push({ render: (dt) => { pivot.rotation.x -= dt * 0.55; } });
      kit.collider({ x, z, hx: 0.6, hz: 2.1, y0: y - 3, y1: y + 2.1, walkable: false });
    }
    // millstone pillars (enemies' B1 reads level.bossPillars / anchors mill_pillar_0..5)
    const pil = kit.proc('millstone_pillar', millstoneParts), cfg = BOSSES.grizzlechop.pillars;
    level.bossPillars = [];
    MILL_PILLARS.forEach(([x, z], i) => {
      kit.place(pil, x, z, { yaw: i * 0.9, collider: false, jitter: 0.04, clear: 1.0, occupy: 1.0, camFade: 'solid' });   // §11: fade from above
      const g = kit.h(x, z);
      level.bossPillars.push(kit.collider({ x, z, r: cfg.radius, y0: g - 0.6, y1: g + cfg.height, pillar: i }));
      kit.anchor(`mill_pillar_${i}`, x, z, g);
    });
    // the mill deck (y 2.0) with its stairs (parts built in world x / z, placed at the origin on the deck's ground)
    const steps = millSteps(d);
    const g0 = kit.h((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2);
    kit.place(kit.proc('mill_deck', () => millDeckParts(d, steps)), 0, 0, { y: g0, collider: false, jitter: 0.03, clear: false, occupy: false, ground: false });
    kit.clear((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, 6, 0.2); kit.occupy((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, 6);
    kit.collider({ x: (d.x0 + d.x1) / 2, z: (d.z0 + d.z1) / 2, hx: (d.x1 - d.x0) / 2, hz: (d.z1 - d.z0) / 2, y0: g0 - 0.6, y1: g0 + d.y, deck: true });
    for (const s of steps) kit.collider({ x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, y0: g0 - 0.6, y1: g0 + s.top });
    level.surfaces.push({ kind: 'wood', test: (x, z) => x > d.x0 && x < d.x1 && z > d.z0 - 3.6 && z < d.z1 });
    kit.anchor('mill_deck', (d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, g0 + d.y, Math.PI);
    kit.anchor('mill_deck_a', d.x0 + 2.5, (d.z0 + d.z1) / 2, g0 + d.y, Math.PI);
    kit.anchor('mill_deck_b', d.x1 - 3.5, (d.z0 + d.z1) / 2, g0 + d.y, Math.PI);
    kit.place(kit.proc('cheese_stack', cheeseStackParts), cx + 9.6, cz + 7.0, { yaw: 1.2, collider: 'circle', shrink: 0.7, jitter: 0.03 });
    kit.place(kit.proc('rat_banner', ratBannerParts), cx - 11.2, cz + 5.0, { yaw: 1.0, collider: 'circle', shrink: 0.2, jitter: 0.03 });
    kit.paint(cx, cz, zone.r, '#A88A5E', 0.45, 3);
  },
};

/** §5.4 Treetop links: for each root ledge, ground → its half-height step → the ledge top (hops, both ways). */
function treetopLinks() {
  const [tx, tz] = TREETOP.trunk, out = [];
  for (const [x, z] of TREETOP.ledges) {
    const d = Math.hypot(x - tx, z - tz) || 1, ux = (x - tx) / d, uz = (z - tz) / d;
    const r = (v) => Math.round(v * 100) / 100;
    const step = [r(x + ux * 1.15), r(z + uz * 1.15)], ground = [r(x + ux * 2.4), r(z + uz * 2.4)];
    out.push({ a: ground, b: step, kind: 'hop' }, { a: step, b: [x, z], kind: 'hop' });
  }
  return out;
}

/**
 * §5.4 Stump Crossing links: south bank → the 6 stumps in order → north bank (hops, both ways). Each end sits 0.5 m
 * inside the stump top's edge toward the next one, so the assisted hop covers the gap, not centre to centre (≤ 5.5 m/s).
 */
function stumpLinks() {
  const pts = [[STUMPS[0][0] - 0.3, STUMPS[0][1] - 1.9], ...STUMPS, [STUMPS[5][0], STUMPS[5][1] + 2.0]];
  const r = (v) => Math.round(v * 100) / 100, out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], d = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / d, uz = (bz - az) / d;
    const ia = i === 0 ? 0 : STUMP.r - 0.3, ib = i === pts.length - 2 ? 0 : STUMP.r - 0.3;      // banks: no inset
    out.push({ a: [r(ax + ux * ia), r(az + uz * ia)], b: [r(bx - ux * ib), r(bz - uz * ib)], kind: 'hop' });
  }
  return out;
}

/** z of the stream centre line at x (piecewise linear through STREAM.pts). */
function STREAM_Z(x) {
  const p = STREAM.pts;
  for (let i = 0; i < p.length - 1; i++) if (x >= p[i][0] && x <= p[i + 1][0]) { const t = (x - p[i][0]) / (p[i + 1][0] - p[i][0]); return p[i][1] + (p[i + 1][1] - p[i][1]) * t; }
  return p[p.length - 1][1];
}

/** Level glue: a puff of spores when she bounces off a mushroom cap (audio / fx `bounce`). */
function decorate(kit) {
  const ctx = kit.ctx, level = kit.level;
  let was = 0;
  level.onUpdate(() => {
    const p = ctx.player, b = p?.bounced ?? 0;
    if (b > 0 && !(was > 0) && p.pos) ctx.bus.emit(E.BURST, { kind: 'bounce', position: p.pos.clone(), color: '#E8D8B0' });
    was = b;
  });
}

// ---------------------------------------------------------------------------------------------- the level
export default defineLevel({
  id: 'forest', size: 200, res: 200, seed: 23, hills: { amp: 3.0, octaves: 3, freq: 0.014 }, pathWidth: 5, rim: 6,
  // the forest floor: thinner grass under the canopy, leaf litter where it is driest
  grassMask: (x, z) => 0.55 + 0.45 * Math.max(0, Math.sin(x * 0.07 + 1.1) * Math.cos(z * 0.06 - 0.4)),
  // WA §2.2: Lantern Night is a cozy periwinkle twilight with its own lamps (forest_twilight; `forest_night` is its alias)
  env: { default: 'forest_day', byFlag: [['forest.camp', 'forest_twilight']] }, moodLive: true,
  music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop', byFlag: [['forest.camp', 'field_of_dreams']] },
  spine: SPINE,
  // CONTROLS_SPEC §11 iso camera: yaw π (the spine runs north). §4.2 fog: forest_day ρ 0.06 clear 5.5 / 7 topMul 1.35;
  // forest_twilight clear 4.5 / 6 (the lantern pools are the stage; the warm-toon twilight preset is bright on its own);
  // by day the sun swings to the side of the view (crowns fade from above, their shadows fall across the screen)
  cam: { yaw: Math.PI,
    fog: { clear: 5.5, clearCombat: 7, topMul: 1.35, forest_twilight: { clear: 4.5, clearCombat: 6, topMul: 1.35 } },
    // the twilight row is lifted in the preset (periwinkle, lamp pools); from above only a little more fill
    light: { forest_day: { sunAz: -1.35 }, forest_twilight: { hemiMul: 1.2 } } },
  // §2.7 the Meme Cam spot: the Mushroom Ring (the caps and the mushroom house behind her)
  memeSpot: { at: [-20.5, -57], yaw: 1.5, r: 4 },
  // §5.4 authored links: the Treetop root ledges (ground → the 0.75 m step → the 1.5 m ledge) and Stump Crossing
  navLinks: [...treetopLinks(), ...stumpLinks()],
  // click-to-move walks round the Lantern Camp fire, never into its stone ring (stones r ~1.1 + the agent's footprint)
  navBlock: [{ at: CAMP.fire, r: 1.5 }],
  paths: [{ pts: [[27, 4], [36, 8], [40, 11], [40, 25], [32, 30], [20, 30]], width: 2.6 }, { pts: [[-10, 84], [-18, 90], [-24, 95]], width: 4 }],
  spawns: { start: [0, -92, 0], boss: [-10, 70.5, 0], camp: [3, 33, 0] },     // [x, z, yaw]
  anchors: {
    horde_forest: [-14, 74], mill_center: [-10, 84], mill_gate: [-10, 72.5, null, 0], exit_mill: [-24, 94],
    crane_camp: [6, 32, 9], hollow_center: [-10, -30],
  },
  flats: [[-26.4, -58.6, 4.5], [6, 42, 7], [-10, 96, 6], [0, -86, 9], [0, -74, 6]],
  zones: [
    { id: 'gate', kind: 'open', at: [0, -85], r: 8, props: 'forestGate', keepClear: 6, spawns: [['rat_pike', 2, [-6, -70], 4]] },
    { id: 'vigil_1', kind: 'checkpoint', at: [0, -78] },
    // §11 the Mushroom Ring climb: a camera-only zone round the caps (the hint swings to the spiral's open side)
    { id: 'mushroom_climb', kind: 'camera', at: [-26.4, -58.6], r: 5.5, cam: MUSHROOM_CAM },
    { id: 'mushrooms', kind: 'open', at: [-20, -58], r: 15, props: 'mushroomRing', keepClear: 9, spawns: [['rat_pike', 2, [-14, -64], 4]] },
    { id: 'bell_1', kind: 'heartBell', bellId: 'hb1', at: MUSHROOM_CAPS[4].at, y: MUSHROOM_CAPS[4].y },
    { id: 'pickles', kind: 'kitten', kittenId: 'pickles', at: [-12, -50.6], hide: 'meow', prop: 'barrel', facing: 0 },
    { id: 'hollow', kind: 'arena', at: [-10, -30], r: 12, props: 'spiderHollow', cam: { dist: 12 },
      waves: [[['spider', 3]], [['spider', 3], ['rat_pike', 2]]] },
    { id: 'pebble', kind: 'kitten', kittenId: 'pebble', at: [-23.4, -26.4], hide: 'break', facing: 1.2 },
    { id: 'vigil_2', kind: 'checkpoint', at: [2, -20] },
    { id: 'treetop', kind: 'open', at: [18, -8], r: 9, props: 'treetop', cam: { pitch: 0.663 /* 38°: a side view of the ledges */, dist: 10 },
      spawns: [['rat_xbow', 1, TREETOP.ledges[0], 0, { y: TREETOP.ledgeY }], ['rat_xbow', 1, TREETOP.ledges[1], 0, { y: TREETOP.ledgeY }],
        ['crow', 2, [18, -8], 6], ['rat_pike', 2, [21, -13], 3]] },
    { id: 'stream', kind: 'setpiece', at: [24, 18], props: 'stumpStream', r: 7 },
    { id: 'letter_2', kind: 'letter', letterId: 'l2', at: STUMPS[3], yAbs: STUMP.top + 0.02 },
    { id: 'camp', kind: 'trigger', at: CAMP.at, r: 6, play: 'cs04', when: 'forest.sage && !forest.camp', once: true },
    { id: 'campsite', kind: 'setpiece', at: CAMP.at, r: 10, props: 'lanternCamp', keepClear: 9 },
    { id: 'vigil_3', kind: 'checkpoint', at: [2, 36] },
    { id: 'ratcamp', kind: 'arena', at: RATCAMP.at, r: RATCAMP.r, props: 'ratCamp',
      waves: [[['rat_pike', 4], ['rat_xbow', 1]], [['rat_pike', 3], ['rat_xbow', 2], ['spider', 2]], [['rat_pike', 4], ['crow', 2]]] },
    { id: 'sprout', kind: 'kitten', kittenId: 'sprout', at: [-22, 66], hide: 'cage', needClear: 'ratcamp', facing: Math.PI / 2, ribbon: true },
    { id: 'vigil_4', kind: 'checkpoint', at: [-13.2, 69.6], facing: 0 },
    { id: 'mill', kind: 'arena', at: MILL.at, r: MILL.r, boss: 'boss_grizzlechop', props: 'cheeseMill' },
    { id: 'exit', kind: 'exit', at: [-24, 94], size: [8, 2], to: 'town', spawnId: 'start', when: 'forest.boss',
      blocked: { toast: 'toast.exit.forest', text: 'The Cheese Mill still stands. Captain Grizzlechop guards the road!' } },
  ],
  setpieces: SETPIECES,
  decorate,
  water: [{ kind: 'stream', pts: STREAM.pts, width: STREAM.width, y: STREAM.y, deep: true },
    { kind: 'stream', pts: [[-26, 98.6], [-10, 98.2], [6, 98.8], [20, 101]], width: 3, y: -0.3, deep: false, flow: 0.6 }],
  lights: 2,              // (fireflies: fx's forest ambient motes)
  scatter: [
    // §12.4: 120 giant oaks (12–18 m); half of them line the path so the trunks frame it
    { model: [M.oak, M.fat, M.detailed], n: 60, fit: { h: [12, 18] }, along: [6.5, 16], minDistFromPath: 6.5, minDist: 6, tree: true },
    { model: [M.oak, M.fat, M.detailed], n: 60, fit: { h: [13, 18] }, minDistFromPath: 9, minDist: 7, tree: true },
    { model: [M.oakFall, M.defaultFall], n: 6, fit: { h: [10, 14] }, minDistFromPath: 9, minDist: 7, tree: true, warn: false },
    { model: [M.mushRedTall, M.mushRedGroup, M.mushTanTall], n: 80, fit: { h: [2, 6] }, minDistFromPath: 4, minDist: 2.6, shrink: 0.25, sink: 0.08, tilt: 0.12 },
    { model: [M.bush, M.bushLarge], n: 80, fit: { h: [0.7, 1.6] }, along: [3.4, 12], minDistFromPath: 3.4, minDist: 1.8, collider: false, clear: 0.6 },
    { model: M.fern, n: 140, fit: { h: [0.6, 1.3] }, along: [3.0, 14], minDistFromPath: 3.0, minDist: 1.1, collider: false, clear: 0.4 },
    { model: [M.stumpOld, M.stumpOldTall, M.log, M.logLarge], n: 22, fit: { max: [1.2, 3] }, minDistFromPath: 4, minDist: 2.6 },
    { model: STONES, n: 16, fit: { h: [0.7, 1.5] }, minDistFromPath: 4, minDist: 2, sink: 0.12 },
    { model: ROCKS, n: 50, fit: { h: [0.2, 0.45] }, minDistFromPath: 3.2, minDist: 1, collider: false, clear: 0.3 },
  ],
  crates: { n: 10, milk: 2 },
  fishLines: [
    [[0, -74], [-8, -66], 5], [[-14, -54], [-17, -46], 5], [[-12, -40], [-11, -34], 4], [[6, -20], [14, -12], 6],
    [[26, 2], [25, 9], 4], [[22, 28], [14, 34], 5], [[0, 46], [-8, 50], 4], [[-12, 72], [-11, 76], 3], [[38, 12], [38, 24], 5],
  ],
  horizon: { n: 90, h: [14, 24] }, horizonFog: 0.65,                 // LI W6: teal aerial perspective (Sky SILHOUETTE.forest)
  // LI §4.2: Lantern Night's paper lanterns on strings around the camp (bunting lantern variant, ≤ 60)
  accent: 'forest',
  bunting: [
    { a: [-1, 3.6, 35], b: [6, 4.2, 31.5], kind: 'lantern', set: ['#FFC46B', '#FFD84A', '#FF8A7A'] },
    { a: [6, 4.2, 31.5], b: [13, 3.6, 35.5], kind: 'lantern', set: ['#FFC46B', '#FFD84A', '#9BE3C4'] },
    { a: [13, 3.6, 46], b: [6, 4.0, 49.5], kind: 'lantern', set: ['#FFC46B', '#FF8A7A', '#FFD84A'] },
  ],
  grass: { height: 0.26, near: 0.8 },
  // loaded by the setpieces above (listed for the manifest test and per-level preloading)
  models: [M.oak, M.fat, M.mushRed, M.mushTanGroup, M.boulder, M.rockTallA, M.rockTallB, M.stumpRound, M.logLarge, M.lily, M.reeds, M.campfire, M.tent, M.log,
    M.logStack, M.pumpkin, M.tentSmall, M.mill, M.wheel],
});

export { STREAM_Z };
