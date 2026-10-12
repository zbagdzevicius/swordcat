// src/world/levels/gate.js  (owner: world) — L4 The Low Gate, "The Line", Chapter 4 (GAME_DESIGN §12.6, never cut).
// Tidal water (y −1.2) everywhere |x| > 6 between the shores; the causeway (12 m stone deck, y 0, z −61 … +47) with
// low parapets broken every 20 m, pillars under it, and the two flanking towers on piers at x ±8, z +8 that narrow it
// to ~8 m; the chalk Line at z +10; the gatehouse (two towers, the arch, the portcullis) and its walls on the north
// shore, the winch (0, +41) and its 4 m zone; the yard (start, vigil_1); the Old Battlefield on the south shore (siege
// wrecks, the hyena war-wagon cage with Tater, Mittens and Pip, skirmishes S1 / S2); the stone stair down to the ledge
// at y −0.8 (Heart Bell #2, Socks); the hyena ballista raft at (−16, −4). The Line itself runs in Objectives.js
// (LineController); this file starts it at the marker, re-arms Vigil 2, tests the portcullis at 100 % and locks
// Cacklejaw's causeway arena (fog walls at z −10 and +30).
import * as THREE from 'three';
import { defineLevel } from '../LevelKit.js';
import { addFlame, texturedMaterial, worldBoxesGeometry } from '../Dressing.js';
import { smooth, valueNoise } from '../noise.js';
import { LINE } from '../../core/config.js';
import { E } from '../../core/events.js';

const K = (n) => `models/env/castle/${n}.glb`;
const G = (n) => `models/env/graveyard/${n}.glb`;
const M = {
  tower: K('tower-square'), wall: K('wall'), portcullis: K('metal-gate'), banner: K('flag-banner-long'), flag: K('flag'),
  siegeTower: K('siege-tower-demolished'), catapult: K('siege-catapult-demolished'), ram: K('siege-ram-demolished'), ballista: K('siege-ballista'), ballistaWreck: K('siege-ballista-demolished'),
  rocksL: K('rocks-large'), rocksS: K('rocks-small'), debris: G('debris'), debrisWood: G('debris-wood'), brazier: G('fire-basket'), hay: G('hay-bale'),
  crate: 'models/env/village-kaykit/decoration/crate_A_big.glb', barrel: 'models/env/village-kaykit/decoration/barrel.glb', cart: 'models/env/town/cart-high.glb',
  stoneL: 'models/env/nature/stone_largeA.glb', stoneL2: 'models/env/nature/stone_largeB.glb', reeds: 'models/env/nature/grass_large.glb',
};
const BRICKS = 'textures/bricks076c/color.jpg';
/** The causeway's pale kerb / ledge rim colour (vertex colour × the brick map). */
const LIP = '#FFFDF6';

/** §12.6 geometry. */
export const GATE = Object.freeze({
  water: -1.2, seabed: -2.9,
  deck: { x: 6, z0: -61, z1: 47 },                  // the causeway deck (y 0), x −6 … +6
  north: 49.5, south: -60.5,                         // shores (land y 0 beyond)
  ledge: { x0: 6, x1: 10.5, z0: -55.5, z1: -49, y: -0.8 },
  towers: [[-8.6, 8], [8.6, 8]], towerH: 10,
  gatehouse: { z: 48.6, towerX: 6.9, towerH: 11, arch: [-3.2, 3.2], archY: [5.0, 10.4] },
  winch: LINE.winch, winchR: LINE.winchRadius, line: 10,
  raft: [-16, -4], wagon: [6, -80],
});
/** Parapet runs (0.6 m high, 0.4 m thick) along both edges: 18 m with 2 m gaps, none where the towers stand. */
export const PARAPETS = Object.freeze([[-60, -42], [-40, -22], [-20, -2], [0, 4.4], [11.6, 18], [20, 38], [40, 44.2]]);

/** The Line's disc arms once S1 and S2 are beaten (world's zone flags, or story's `gate.back`). */
export const LINE_WHEN = 'gate.back && !gate.line || gate.cleared.s1 && gate.cleared.s2 && !gate.line';

/** The tidal level shape (pure): deck, ledge, shores, sea bed. */
export function gateShape(x, z, h) {
  const g = GATE, d = g.deck, L = g.ledge;
  if (Math.abs(x) <= d.x + 1e-6 && z >= d.z0 && z <= d.z1) return 0;
  if (x >= L.x0 && x <= L.x1 && z >= L.z0 && z <= L.z1) return L.y;
  const bed = g.seabed + 0.5 * (valueNoise(x * 0.06, z * 0.06, 77) - 0.5) + 0.25 * valueNoise(x * 0.21, z * 0.21, 78);
  const land = Math.max(smooth(44, 50, z), smooth(-55, -61.5, z));
  const shore = Math.min(h, 0.6) * 0.5;                  // gentle shore ground near y 0
  return bed + (shore - bed) * land;
}
const gateGrass = (x, z, h) => (h < -0.45 ? 0 : Math.abs(x) <= 6.4 && z > -61.5 && z < 47.5 ? 0 : 1);
const gateGround = (x, z, h, out) => {
  if (h < -0.6) out.lerp(_sand, Math.min(1, (-0.6 - h) * 1.2));
};
const _sand = new THREE.Color('#5E5848');

const C = { wood: '#7A5B3E', woodDark: '#4E3A28', plank: '#9C7E58', iron: '#4A4C50', rope: '#8C6A4A', chalk: '#F2EEE2', stone: '#9C9A92', hyena: '#5A5650', red: '#8A2E2A', cream: '#EFE3CF' };

// ---------------------------------------------------------------------------------------------- procedural parts
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

/** The winch (1.2 m): a drum between two A-frames, a crank wheel, the chain up to the gatehouse. */
function winchParts() {
  const p = [[box(2.6, 0.18, 1.2, 0, 0.09, 0), C.woodDark]];
  for (const sx of [-1.15, 1.15]) {
    for (const dz of [-0.4, 0.4]) { const g = new THREE.BoxGeometry(0.14, 1.35, 0.14); g.rotateX(dz > 0 ? -0.28 : 0.28); p.push([g.translate(sx, 0.75, dz * 0.6), C.wood]); }
  }
  const drum = new THREE.CylinderGeometry(0.42, 0.42, 2.0, 16); drum.rotateZ(Math.PI / 2); p.push([drum.translate(0, 1.0, 0), '#8A6B4A']);
  for (const x of [-0.6, 0, 0.6]) { const r = new THREE.TorusGeometry(0.43, 0.04, 5, 16); r.rotateY(Math.PI / 2); p.push([r.translate(x, 1.0, 0), C.iron]); }
  const wheel = new THREE.TorusGeometry(0.55, 0.05, 6, 18); wheel.rotateY(Math.PI / 2); p.push([wheel.translate(1.35, 1.0, 0), C.iron]);
  for (let i = 0; i < 4; i++) { const s = new THREE.BoxGeometry(0.04, 1.1, 0.06); s.rotateX((i / 4) * Math.PI); p.push([s.translate(1.35, 1.0, 0), C.iron]); }
  return p;
}

/** The chalk Line across the causeway (z +10): a long stroke and a few wobbly hatch marks. */
function lineParts(w = 11) {
  const p = [[box(w, 0.012, 0.16, 0, 0.006, 0), C.chalk]];
  for (let i = 0; i < 9; i++) p.push([box(0.06, 0.012, 0.42, -w / 2 + 0.6 + i * (w - 1.2) / 8, 0.007, -0.05, 0.25 - (i % 3) * 0.2), C.chalk]);
  return p;
}

/** A dashed chalk ring of radius r (the winch zone). */
function ringParts(r, n = 28) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([box(0.5, 0.01, 0.1, Math.sin(a) * r, 0.006, Math.cos(a) * r, a + Math.PI / 2), C.chalk]); }
  return p;
}

/** The hyena ballista raft: planks 4 × 3 m on two logs, a mooring post. */
function raftParts() {
  const p = [];
  for (let i = 0; i < 9; i++) p.push([box(0.42, 0.1, 3.0, -1.8 + i * 0.45, 0.25, 0), i % 2 ? C.plank : '#8A6E4C']);
  for (const z of [-1.1, 1.1]) { const g = new THREE.CylinderGeometry(0.22, 0.22, 4.3, 8); g.rotateZ(Math.PI / 2); p.push([g.translate(0, 0.05, z), C.woodDark]); }
  p.push([cyl(0.08, 0.08, 1.0, 1.9, 0.2, 1.3), C.woodDark], [box(0.9, 0.7, 0.03, -1.2, 1.4, -1.2), C.hyena]);
  return p;
}

/** Battlefield junk: a broken spear stuck in the ground, a dropped round shield, a cracked helmet. */
function spearParts() { return [[cyl(0.03, 0.03, 1.6), '#6E5238'], [new THREE.ConeGeometry(0.06, 0.25, 4).translate(0, 1.72, 0), C.iron]]; }
function shieldParts() { return [[new THREE.CylinderGeometry(0.42, 0.42, 0.06, 14).rotateX(0.2).translate(0, 0.08, 0), '#7A5B3E'], [new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.14, 0.02), C.iron]]; }
function hyenaBannerParts() {
  return [[cyl(0.05, 0.06, 3.2), C.woodDark], [box(0.8, 0.05, 0.05, 0, 3.0, 0), C.woodDark], [box(0.72, 1.5, 0.03, 0, 2.2, 0), C.hyena],
    [box(0.42, 0.08, 0.035, 0, 2.35, 0.02), '#C9C2A0'], [box(0.08, 0.32, 0.035, -0.13, 2.15, 0.02), '#C9C2A0'], [box(0.08, 0.32, 0.035, 0.13, 2.15, 0.02), '#C9C2A0'],
    [new THREE.ConeGeometry(0.1, 0.4, 4).translate(0, 3.35, 0), C.iron]];
}
/** An iron brazier on three legs (the yard, by the gatehouse). */
function brazierParts() {
  const p = [[new THREE.CylinderGeometry(0.42, 0.24, 0.36, 12, 1, true).translate(0, 1.0, 0), '#3E3A36'], [new THREE.TorusGeometry(0.42, 0.04, 5, 14).rotateX(Math.PI / 2).translate(0, 1.18, 0), '#5A5650']];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, g = new THREE.CylinderGeometry(0.035, 0.035, 0.95, 5).translate(0, 0.47, 0); g.rotateZ(0.18); g.rotateY(a); p.push([g.translate(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2), '#3E3A36']); }
  p.push([new THREE.DodecahedronGeometry(0.22, 0).translate(0, 1.02, 0), '#2A221C']);
  return p;
}

/** The gatehouse arch's crenellations (world boxes on the lintel top at y, centred on z). */
function archCrenels(x0, x1, y, z) {
  const p = [];
  for (let x = x0 + 0.4; x < x1; x += 1.1) p.push({ x0: x - 0.3, x1: x + 0.3, y0: y, y1: y + 0.7, z0: z - 0.45, z1: z + 0.45, color: '#8E8C84' });
  return p;
}
/** CONTROLS_SPEC §3: the arch and the raised portcullis fade (roof rule) while she is in the passage or this close
 *  to either mouth of it: with the iso lens north of the gatehouse (yaw 0) they otherwise hang across the frame. */
const ARCH_ROOF_PAD = 2.6;

// ---------------------------------------------------------------------------------------------- setpieces
const SETPIECES = {
  /** The causeway: textured deck, sides, parapets, tower piers, the ledge and its steps; pillars underneath; the Line. */
  async causeway(kit) {
    const ctx = kit.ctx, level = kit.level, d = GATE.deck, L = GATE.ledge;
    const top = 0.02, bot = GATE.seabed - 0.6, stone = '#D8D1C4', dark = '#ADA79B';   // ×1.1 from above (CONTROLS_SPEC §4.2)
    const boxes = [
      { x0: -d.x, x1: d.x, y0: bot, y1: top, z0: d.z0, z1: d.z1, color: stone },                        // deck + its sides
      { x0: L.x0 + 1.5, x1: L.x1, y0: bot, y1: L.y + 0.02, z0: L.z0, z1: L.z1, color: dark },              // the ledge
    ];
    // the stone stair down to the ledge (east side, z −53 … −50): 3 steps
    for (let i = 0; i < 3; i++) boxes.push({ x0: d.x + i * 0.5, x1: d.x + (i + 1) * 0.5, y0: bot, y1: -(i + 1) * 0.27 + 0.02, z0: -53.6, z1: -50.4, color: dark });
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of PARAPETS) {
        if (sx > 0 && z0 < -50 && z1 > -54) {      // the stair gap on the east parapet
          boxes.push({ x0: d.x - 0.4, x1: d.x, y0: top, y1: 0.6, z0, z1: -54, color: dark });
          boxes.push({ x0: d.x - 0.4, x1: d.x, y0: top, y1: 0.6, z0: -50, z1, color: dark });
          continue;
        }
        boxes.push({ x0: sx > 0 ? d.x - 0.4 : -d.x, x1: sx > 0 ? d.x : -d.x + 0.4, y0: top, y1: 0.6, z0, z1, color: dark });
      }
      // the tower piers (x ±(4.2 … 12.8), z 3.6 … 12.4) from the sea bed to the deck
      const [tx, tz] = GATE.towers[sx > 0 ? 1 : 0];
      boxes.push({ x0: tx - 4.4, x1: tx + 4.4, y0: bot, y1: top + 0.01, z0: tz - 4.4, z1: tz + 4.4, color: dark });
      // a pale kerb (2.5 cm, visual only) inside each parapet line: the deck edge reads from above, gaps included
      boxes.push({ x0: sx > 0 ? d.x - 0.9 : -d.x + 0.4, x1: sx > 0 ? d.x - 0.4 : -d.x + 0.9, y0: top - 0.01, y1: top + 0.025, z0: d.z0, z1: d.z1, color: LIP });
    }
    // the ledge's edges: the deck lip over the stair gap and the ledge's outer rim (the drops read from the iso camera)
    boxes.push({ x0: d.x - 0.35, x1: d.x, y0: top - 0.01, y1: top + 0.025, z0: -54, z1: -50, color: LIP });
    boxes.push({ x0: L.x1 - 0.35, x1: L.x1, y0: L.y, y1: L.y + 0.045, z0: L.z0, z1: L.z1, color: LIP });
    const geo = worldBoxesGeometry(boxes, { tile: 2.2 });
    // §4.2 iso: the deck read dark and muddy from above (it is most of the frame): ×1.27 albedo (1.93 → 2.45) and the
    // brick map's dark joints lifted to a pale mortar (joint) so the courses read against her dark armour and the hyenas
    const mat = await texturedMaterial(ctx, BRICKS, { tint: '#FFF8EC', mapMix: 0.45, key: 'deck', gain: 2.45, joint: 0.38 });
    if (!mat.map) mat.color.set('#CCC6BA');   // no map (slow load): the same ×1.27 lift
    kit.castle = kit.merged('castle');
    // CONTROLS_SPEC §3 solids: the flanking towers and the gatehouse are their own merged meshes so the iso camera can
    // fade them (camFade 'solid') when they stand between the lens and her; the long shore walls stay in 'castle'
    kit.gateTowers = kit.merged('gate_towers');
    kit.gatehouseTowers = kit.merged('gatehouse');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'causeway'; mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.camFade = false;
    kit.object(mesh);
    level.surfaces.push({ kind: 'stone', test: (x, z) => Math.abs(x) <= d.x + 0.1 && z >= d.z0 && z <= d.z1 });
    // colliders: parapets (walkable 0.6 m), stair steps, the tower piers are under the towers (their colliders)
    for (const sx of [-1, 1]) for (const [z0, z1] of PARAPETS) {
      const segs = sx > 0 && z0 < -50 && z1 > -54 ? [[z0, -54], [-50, z1]] : [[z0, z1]];
      for (const [a, b] of segs) kit.collider({ x: sx * (d.x - 0.2), z: (a + b) / 2, hx: 0.2, hz: (b - a) / 2, y0: -1.5, y1: 0.6, parapet: true });
    }
    for (let i = 0; i < 3; i++) kit.collider({ x: d.x + (i + 0.5) * 0.5, z: -52, hx: 0.25, hz: 1.6, y0: -2, y1: -(i + 1) * 0.27 });
    // pillars under the deck every 10 m (both sides)
    const pillar = await kit.tpl(K('bridge-straight-pillar'), { sat: 0.15, mul: 0.6 });
    if (pillar) for (let z = d.z0 + 5; z < d.z1 - 2; z += 10) for (const sx of [-1, 1]) kit.place(pillar, sx * (d.x + 0.2), z, { fit: { h: 2.4 }, y: GATE.seabed - 0.2, yaw: Math.PI / 2, collider: false, clear: false, occupy: false, jitter: 0.05, ground: true });
    // the chalk Line at z +10 and the winch zone ring
    kit.place(kit.proc('chalk_line', () => lineParts(11.4)), 0, GATE.line, { y: top, collider: false, clear: false, occupy: false, jitter: 0, ground: false });
    kit.anchor('line_mark', 0, GATE.line, 0, Math.PI);
    kit.place(kit.proc('winch_ring', () => ringParts(GATE.winchR)), GATE.winch[0], GATE.winch[1], { y: top, collider: false, clear: false, occupy: false, jitter: 0, ground: false });
    // lanes and spoon rows (story, enemies)
    LINE.lanes.forEach(([x, z], i) => kit.anchor('lane_' + i, x, z, 0, 0));
    kit.anchor('spoons', 0, GATE.line + 2.5, 0, Math.PI);
    kit.anchor('ledge', 8.6, -52, L.y, -Math.PI / 2);
    kit.anchor('stairs_top', 5.0, -52, 0, Math.PI / 2);
  },

  /** The two flanking towers (10 m, on piers at x ±8.6, z +8) narrowing the causeway, banners, a parapet torch each. */
  async towers(kit) {
    const level = kit.level;
    const [tower, banner] = await Promise.all([kit.tpl(M.tower, { sat: 0.25, mul: 0.95 }), kit.tpl(M.banner)]);
    for (const [x, z] of GATE.towers) {
      if (tower) {
        const p = kit.place(tower, x, z, { fit: { h: GATE.towerH }, y: 0, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, collider: 'box', shrink: 0.98, jitter: 0.03, clear: false, occupy: 4.5, into: kit.gateTowers ?? kit.castle });
        if (p) kit.anchor(x < 0 ? 'tower_w' : 'tower_e', x, z, p.top, x < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      if (banner) kit.place(banner, x + (x < 0 ? 4.25 : -4.25), z, { fit: { h: 3.4 }, y: 4.2, yaw: x < 0 ? 0 : Math.PI, collider: false, clear: false, occupy: false, jitter: 0 });
    }
    kit.anchor('marmalade_tower', GATE.towers[0][0] + 2.6, GATE.towers[0][1], GATE.towerH - 0.6, Math.PI / 2);
    level.towers = GATE.towers;
  },

  /** The gatehouse: two towers, the arch over the 6.4 m passage, the portcullis (animated), walls along the shore, torches. */
  async gatehouse(kit) {
    const ctx = kit.ctx, level = kit.level, gh = GATE.gatehouse;
    const [tower, wall, port, banner, brazier] = await Promise.all([kit.tpl(M.tower, { sat: 0.25, mul: 0.95 }), kit.tpl(M.wall, { sat: 0.25, mul: 0.95 }), kit.tpl(M.portcullis),
      kit.tpl(M.banner), kit.tpl(M.brazier)]);
    for (const sx of [-1, 1]) if (tower) kit.place(tower, sx * gh.towerX, gh.z, { fit: { h: gh.towerH }, yaw: 0, collider: 'box', shrink: 0.98, jitter: 0.03, clear: 3, into: kit.gatehouseTowers ?? kit.castle });
    // the arch: a stone lintel block over the passage, with crenellations (one mesh: they fade together)
    const [a0, a1] = gh.arch, [y0, y1] = gh.archY;
    const lintel = worldBoxesGeometry([{ x0: a0 - 0.3, x1: a1 + 0.3, y0, y1, z0: gh.z - 1.9, z1: gh.z + 1.9, color: '#C4BEB2' },
      { x0: a0 - 0.5, x1: a1 + 0.5, y0: y0 - 0.25, y1: y0, z0: gh.z - 2.0, z1: gh.z + 2.0, color: '#A9A498' },
      ...archCrenels(a0 - 0.3, a1 + 0.3, y1, gh.z)], { tile: 2.2 });
    const lmat = await texturedMaterial(ctx, BRICKS, { tint: '#FFF8EC', mapMix: 0.45, key: 'bricks', gain: 1.93 /* §4.2: ×1.1, the deck read dark in gate_dusk */ });
    if (!lmat.map) lmat.color.set('#B8B2A6');
    const lmesh = new THREE.Mesh(lintel, lmat); lmesh.name = 'gatehouseArch'; lmesh.castShadow = true; lmesh.receiveShadow = true; lmesh.userData.camFade = 'roof'; lmesh.userData.roofPad = ARCH_ROOF_PAD;
    kit.object(lmesh);
    // the portcullis (Kenney metal gate stretched over the passage): raised; the 100 % test drops and lifts it
    if (port) {
      const b = port.box, mesh = kit.mesh(port, { name: 'portcullis' });
      const sw = (a1 - a0) / (b.max.z - b.min.z), sh = (y0 - 0.1) / (b.max.y - b.min.y);
      mesh.scale.set(1.6, sh, sw);
      mesh.rotation.y = Math.PI / 2;
      // CONTROLS_SPEC §3: raised, the bars hang across the passage at lens height when she walks under the arch (yaw 0:
      // the lens sits north of the gatehouse), so they fade by the roof rule like the lintel; dropped, they are a wall
      // (solid: fade only when they hide her). The camera's occluder boxes are static, so the pivot is re-registered
      // whenever it settles after a drop / lift (the 100 % test, gate_open).
      const pg = new THREE.Group(); pg.name = 'portcullisPivot'; pg.add(mesh);
      const tagPort = (down) => { pg.userData.camFade = down ? 'solid' : 'roof'; pg.userData.roofPad = down ? undefined : ARCH_ROOF_PAD + 1.2; };
      tagPort(false);
      mesh.position.set(-(b.min.z + b.max.z) / 2 * sw, -b.min.y * sh, 0);
      pg.position.set(0, 0, gh.z - 1.2);
      kit.object(pg);
      const up = y0 - 0.6;
      let pos = up, target = up;
      pg.position.y = up;
      const col = { x: 0, z: gh.z - 1.2, hx: (a1 - a0) / 2, hz: 0.12, y0: -1, y1: y0, walkable: false, portcullis: true };
      let colOn = false;
      level.animators.push({ render: (dt) => {
        if (pos === target) return;
        const step = dt * (target < pos ? 6 : 1.6);
        pos = Math.abs(target - pos) <= step ? target : pos + Math.sign(target - pos) * step;
        pg.position.y = pos;
        if (pos === target) { tagPort(target === 0); ctx.cam?.refreshFadeable?.(pg); }      // settled: move its fade boxes with it
      } });
      level.portcullis = {
        get down() { return target === 0; },
        set(downNow) {
          target = downNow ? 0 : up;                 // (the clank is story's `line.portcullis` cue in gate_open)
          if (downNow && !colOn) { level.addCollider(col); colOn = true; } else if (!downNow && colOn) { level.removeCollider(col); colOn = false; }
          if (downNow) ctx.bus.emit(E.SHAKE, { trauma: 0.2 });
        },
      };
    }
    kit.anchor('portcullis', 0, gh.z - 1.2, 0, Math.PI);
    kit.anchor('gatehouse_top', 0, gh.z, gh.archY[1] + 0.6, Math.PI);         // CS-09: Pudding rises over the gatehouse
    // shore walls from the gatehouse towers out into the fog (both sides)
    if (wall) for (const sx of [-1, 1]) kit.fence(wall, [sx * (gh.towerX + 3.6), gh.z], [sx * 52, gh.z + (sx > 0 ? 1.5 : -1)], { fit: { h: 6.5 }, height: 6.5, walkable: false, depthScale: 3.2, maxPieceScale: 5, jitter: 0.03, wobble: 0, clear: 2, into: kit.castle });
    if (banner) for (const sx of [-1, 1]) kit.place(banner, sx * (gh.towerX - 3.86), gh.z - 3.0, { fit: { h: 3.6 }, y: 4.6, yaw: Math.PI / 2 * sx, collider: false, clear: false, occupy: false, jitter: 0 });
    // two wall torches by the arch (§12.2 gate_dusk: `#FF8A3D`), the light pool follows them
    for (const sx of [-1, 1]) {
      const x = sx * 4.0, z = gh.z - 2.4;
      kit.place(kit.proc('wall_torch', () => [[box(0.1, 0.1, 0.5, 0, 0, 0.25), C.iron], [cyl(0.09, 0.06, 0.32, 0, -0.1, 0.5, 8), C.woodDark]]), x, z, { y: 3.0, yaw: Math.PI, collider: false, clear: false, occupy: false, jitter: 0, ground: false });
      addFlame(level, level.lightPool, x, 3.32, z - 0.5, { size: 0.7, light: 2.2, distance: 10, glow: 1.5, color: '#FF8A3D' });
    }
    const braz = kit.proc('brazier', brazierParts);
    for (const [x, z] of [[-4.6, 54.2], [4.6, 54.2]]) {
      const p = kit.place(braz, x, z, { collider: 'circle', shrink: 0.6, jitter: 0 });
      if (p) addFlame(level, level.lightPool, x, p.top - 0.1, z, { size: 1.1, light: 1.6, distance: 8, glow: 1.3, color: '#FF9A4A' });
    }
    void brazier;
  },

  /** The winch (0, +41): the drum and crank, the chain to the gatehouse; Earl Grey and Pip work it (anchors). */
  async winch(kit) {
    const [wx, wz] = GATE.winch;
    kit.place(kit.proc('winch', winchParts), wx, wz, { yaw: 0, collider: 'box', shrink: 0.9, jitter: 0, clear: false, occupy: 1.5, height: 1.4 });
    const chain = kit.proc('winch_chain', () => {
      const a = new THREE.Vector3(0, 1.0, 0), b = new THREE.Vector3(0, GATE.gatehouse.archY[0] - 0.2, GATE.gatehouse.z - 1.4 - wz);
      const p = [];
      for (let i = 0; i < 18; i++) { const t = (i + 0.5) / 18, q = a.clone().lerp(b, t); q.y -= Math.sin(t * Math.PI) * 0.4; const l = new THREE.TorusGeometry(0.08, 0.025, 4, 8); if (i % 2) l.rotateY(Math.PI / 2); p.push([l.translate(q.x, q.y, q.z), C.iron]); }
      return p;
    });
    kit.place(chain, wx, wz, { y: 0, collider: false, clear: false, occupy: false, jitter: 0, ground: false });
    kit.anchor('winch', wx, wz, 0, Math.PI);
    kit.anchor('winch_a', wx - 1.7, wz + 0.8, 0, Math.PI);
    kit.anchor('winch_b', wx + 1.9, wz + 0.4, 0, -Math.PI / 2);
  },

  /** The yard (0, +57): crates, barrels, a cart, hay, sandbag barricade, the road north to town. */
  async yard(kit) {
    const [crate, barrel, cart, hay] = await Promise.all([kit.tpl(M.crate), kit.tpl(M.barrel), kit.tpl(M.cart), kit.tpl(M.hay, { sat: 0.12, tint: '#E6CF8C' })]);
    const put = (t, list, fit) => { if (t) for (const [x, z, yaw] of list) kit.place(t, x, z, { fit, yaw, collider: 'box', shrink: 0.95, jitter: 0.08 }); };
    put(crate, [[6.5, 56, 0.2], [7.3, 56.8, 0.9], [6.8, 57.6, 1.7], [-9.5, 61, 0.4]], { h: 0.85 });
    put(barrel, [[-7.6, 55.4, 0], [-8.4, 56.2, 1], [8.8, 61.5, 0.3]], { h: 0.95 });
    put(hay, [[10.5, 58.6, 0.4], [-12, 57, 1.2]], { h: 1.0 });
    if (cart) kit.place(cart, -10.4, 63.5, { fit: { max: 2.4 }, yaw: 0.5, collider: 'box', shrink: 0.9, jitter: 0.04 });
    kit.paint(0, 57, 9, '#6A6450', 0.4, 3);
  },

  /** The Old Battlefield (0, −72): siege wrecks, debris, spears, shields, craters, hyena banners by the war-wagon. */
  async battlefield(kit) {
    const tpls = await Promise.all([M.siegeTower, M.catapult, M.ram, M.ballistaWreck, M.debris, M.debrisWood, M.rocksL].map((m) => kit.tpl(m, { sat: 0.55, mul: 0.85 })));
    const [tw, cat, ram, bw, deb, debW, rocks] = tpls;
    const put = (t, x, z, max, yaw) => { if (t) kit.place(t, x, z, { fit: { max }, yaw, collider: 'box', shrink: 0.75, jitter: 0.06 }); };
    put(tw, -17, -72, 7, 0.6); put(cat, 15, -66, 5, 2.1); put(ram, -6, -84, 5, -0.4); put(bw, 18, -84, 4.2, 1.1); put(cat, -24, -84, 5, 3.6);
    for (const [x, z, y] of [[-10, -76, 0.3], [9, -71, 1.4], [-2, -66, 2.2], [20, -76, 0.9], [-20, -64, 1.8], [4, -88, 0.2]]) put(x > 0 ? deb : debW, x, z, 2.2, y);
    put(rocks, 24, -70, 3.2, 0.4); put(rocks, -28, -76, 3.6, 2.0);
    const spear = kit.proc('bf_spear', spearParts), shield = kit.proc('bf_shield', shieldParts);
    const rng = kit.rng.fork('battlefield');
    for (let i = 0; i < 26; i++) {
      const x = -26 + rng() * 52, z = -88 + rng() * 26;
      if (kit.roadClearance(x, z) < 0.6 || !kit.free(x, z, 0.5)) continue;
      if (i % 3) kit.place(spear, x, z, { yaw: rng.angle(), tiltX: (rng() - 0.5) * 0.7, tiltZ: (rng() - 0.5) * 0.7, collider: false, clear: 0.2, occupy: false, jitter: 0.1 });
      else kit.place(shield, x, z, { yaw: rng.angle(), collider: false, clear: 0.3, occupy: false, jitter: 0.1, sink: 0.04 });
    }
    for (let i = 0; i < 9; i++) kit.paint(-22 + rng() * 44, -86 + rng() * 22, 1.6 + rng() * 2, '#3A3428', 0.55, 1.2);
    const hb = kit.proc('hyena_banner', hyenaBannerParts);
    for (const [x, z, yaw] of [[3.2, -77.6, 0.4], [9.2, -82.6, 2.8], [-6.5, -63.8, 0.2], [12.5, -79.5, 1.5]]) kit.place(hb, x, z, { yaw, collider: 'circle', shrink: 0.2, jitter: 0.04 });
    kit.paint(0, -74, 18, '#4A4634', 0.3, 4);
    kit.anchor('wagon', GATE.wagon[0], GATE.wagon[1], undefined, Math.PI);
    kit.anchor('horde', 0, -68);
    kit.anchor('horde_a', -22, -70); kit.anchor('horde_b', 22, -72);
  },

  /** The hyena ballista raft (−16, −4), bobbing 0.1 m at 0.3 Hz, aimed north-east (scenery; fires in G-02). */
  async raft(kit) {
    const level = kit.level, [x, z] = GATE.raft;
    const ballista = await kit.tpl(M.ballista, { sat: 0.6 });
    const g = new THREE.Group(); g.name = 'raft';
    g.add(kit.mesh(kit.proc('raft', raftParts), { name: 'raftPlanks' }));
    if (ballista) {
      const b = ballista.box, s = 2.5 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      const m = kit.mesh(ballista, { name: 'raftBallista' }); m.scale.setScalar(s); m.position.set(0, 0.3 - b.min.y * s, 0); m.rotation.y = Math.PI / 4;
      g.add(m);
    }
    g.position.set(x, GATE.water - 0.05, z);
    g.rotation.y = 0.3;
    kit.object(g);
    level.raft = g;
    level.animators.push({ render: (dt, t) => { g.position.y = GATE.water - 0.05 + Math.sin(t * Math.PI * 2 * 0.3) * 0.1; g.rotation.z = Math.sin(t * 1.3) * 0.03; g.rotation.x = Math.cos(t * 1.1) * 0.025; } });
    kit.anchor('ballista_raft', x, z, GATE.water + 2.2, Math.PI / 4);
    kit.anchor('raft', x, z, GATE.water, 0);
  },
};

// ---------------------------------------------------------------------------------------------- The Line
/**
 * Level glue for The Line (§12.6): after S1 and S2 a far horn and "Back to the Line!"; the disc at (0, +10) starts
 * the LineController (Objectives.js), activates vigil_2 and shows `tut.line`; at 100 % the portcullis drops and
 * lifts (Mochi: "The gate works!", Clem: "Not yet."), then Cacklejaw's causeway arena locks.
 */
async function decorate(kit) {
  const ctx = kit.ctx, level = kit.level;
  const cond = (c) => !!ctx.state?.cond?.(c);
  // (story plays `gate_back` — the far horn and "Back to the Line!" — once S1 and S2 are beaten, flag gate.back)
  const start = () => {
    if (ctx.objectives?.line?.active || cond('gate.line')) return;
    const v2 = level.vigils.find((v) => v.id === 'vigil_2');
    try { v2?.activate?.(); } catch { /* optional */ }
    ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.('tut.line') ?? 'Hold the Line!', icon: 'hint', key: 'tut.line' });
    ctx.objectives?.startLine?.({
      vec: (p) => new THREE.Vector3(p.x, p.y, p.z),
      onDone: () => finish(),
    });
    level.lineStarted = true;
  };
  const finish = () => {
    // the portcullis test (story's gate_open scene says the lines and plays the clank), then Cacklejaw steps out
    level.portcullis?.set(true);
    level.after(1.4, () => level.portcullis?.set(false));
    level.after(4.8, () => { const a = level.arena('causeway'); if (a && !a.cleared && !cond('gate.boss')) a.lock(); });
  };
  level.startLine = start;
  kit.castle?.build();
  for (const b of [kit.gateTowers, kit.gatehouseTowers]) { const m = b?.build(); if (m) m.userData.camFade = 'solid'; }
  kit.trigger({ id: 'line', at: [0, GATE.line], r: 3, once: false, when: LINE_WHEN, fire: start });
}

// ---------------------------------------------------------------------------------------------- the level
export default defineLevel({
  id: 'gate', size: 180, res: 120, seed: 41, hills: { amp: 0.6 }, pathWidth: 8, rim: 4,
  shape: gateShape, grassMask: gateGrass, groundColor: gateGround,
  env: { default: 'gate_dusk' },
  // CONTROLS_SPEC §11: the causeway runs toward −z, so the iso camera sits north (yaw 0): screen-up = onward;
  // The Line needs width (clear 8 in the arena)
  // §4.2 gate_dusk: the low sun along the causeway draws long shadows (good height cues), so its azimuth stays
  cam: { yaw: 0, fog: { clear: 6, clearCombat: 8, topMul: 1.3 } },
  // §2.7 the Meme Cam spot: the causeway rampart (she faces the gatehouse; the causeway runs off into the fog behind her)
  memeSpot: { at: [0, 30], yaw: 0, r: 4 },
  music: { explore: 'village_town_theme', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },   // audio holds battle_theme_a through the Line
  spine: [[0, 66], [0, 52], [0, 41], [0, 10], [0, -30], [0, -60], [0, -72], [4, -80]],
  paths: [{ pts: [[0, -66], [-8, -66]], width: 3 }, { pts: [[0, -70], [10, -78]], width: 3 }],
  spawns: { start: [0, 58, Math.PI], boss: [2.5, 20, Math.PI], line: [0, 12, Math.PI] },
  anchors: { horde_line: [0, -66], crane_gate: [0, 30, 9], causeway_mid: [0, 10] },
  zones: [
    { id: 'causeway_set', kind: 'setpiece', at: [0, -7], props: 'causeway' },
    { id: 'towers', kind: 'setpiece', at: [0, 8], props: 'towers' },
    { id: 'gatehouse', kind: 'setpiece', at: [0, 48.6], props: 'gatehouse' },
    { id: 'winch', kind: 'setpiece', at: GATE.winch, props: 'winch' },
    { id: 'yard', kind: 'setpiece', at: [0, 57], props: 'yard', keepClear: 6 },
    { id: 'vigil_1', kind: 'checkpoint', at: [-4, 56], facing: Math.PI },
    { id: 'battlefield', kind: 'setpiece', at: [0, -72], r: 18, props: 'battlefield' },
    { id: 's1', kind: 'open', at: [-8, -66], r: 6, spawns: [['hyena', 3, [-8, -66], 3]], hints: [{ key: 'tut.jeer', on: 'jeer' }] },
    { id: 's2', kind: 'open', at: [10, -78], r: 6, spawns: [['hyena', 2, [10, -78], 3], ['rat_xbow', 2, [13, -81], 1]] },
    { id: 'tater', kind: 'kitten', kittenId: 'tater', at: GATE.wagon, hide: 'cage', opts: { cage: 'cart', size: [1.5, 0.95, 1.05], hits: 3, facing: Math.PI } },
    { id: 'mittens', kind: 'kitten', kittenId: 'mittens', at: GATE.wagon, hide: 'cage', opts: { cageWith: 'tater', off: [-0.38, 0.1] } },
    { id: 'vigil_3', kind: 'checkpoint', at: [-4, -56], facing: 0 },
    { id: 'letter_4', kind: 'letter', letterId: 'l4', at: [-14, -80] },
    { id: 'bell_2', kind: 'heartBell', bellId: 'hb2', at: [9.3, -53.6] },
    { id: 'socks', kind: 'kitten', kittenId: 'socks', at: [9.3, -50.6], hide: 'climb', facing: Math.PI },
    { id: 'vigil_2', kind: 'checkpoint', at: [4.6, 20], facing: Math.PI },
    { id: 'raft', kind: 'setpiece', at: GATE.raft, props: 'raft' },
    { id: 'causeway', kind: 'arena', at: [0, 10], size: [12, 40], boss: 'boss_cacklejaw', autoLockWhen: 'gate.line && !gate.boss' },
    // §11 camera zones: The Line (17 m at 56°, wide enough for every lane; armed only while it can run) and the raft
    { id: 'line_view', kind: 'camera', at: [0, 12], size: [16, 34], camIf: LINE_WHEN, cam: { dist: 17, pitch: 0.977 } },
    // the raft floats 10 m off the west edge: on the causeway beside it the view widens enough to keep it in frame
    { id: 'raft_view', kind: 'camera', at: [0, -12], size: [12, 14], cam: { dist: 14 } },
  ],
  setpieces: SETPIECES,
  decorate,
  water: [{ kind: 'plane', y: GATE.water, deep: true }],
  scatter: [
    { model: [M.stoneL, M.stoneL2], n: 18, fit: { h: [0.8, 1.6] }, area: { at: [0, -76], size: [70, 28] }, minDistFromPath: 4, minDist: 3, sink: 0.15, warn: false },
    { model: [M.rocksS], n: 16, fit: { max: [1, 2] }, area: { at: [0, 66], size: [80, 30] }, minDistFromPath: 4, minDist: 3, warn: false },
    { model: M.reeds, n: 40, fit: { h: [0.6, 1.2] }, area: { at: [0, -60], size: [90, 6] }, collider: false, clear: false, minDist: 1, warn: false },
    { model: M.reeds, n: 30, fit: { h: [0.6, 1.2] }, area: { at: [0, 46], size: [90, 5] }, collider: false, clear: false, minDist: 1, warn: false },
  ],
  crates: { n: 6, milk: 2 },
  fishLines: [[[0, 52], [0, 46], 4], [[-3, 30], [-3, 16], 6], [[3, 4], [3, -10], 6], [[-3, -20], [-3, -40], 8], [[0, -64], [-8, -70], 5], [[6, -70], [10, -74], 4], [[-14, -76], [-14, -82], 3]],
  horizon: false,
  lights: 2,
  grass: { height: 0.24, near: 0.7 },
  models: [M.tower, M.wall, M.portcullis, M.banner, M.brazier, M.crate, M.barrel, M.cart, M.hay, M.siegeTower, M.catapult, M.ram, M.ballistaWreck, M.debris, M.debrisWood,
    M.rocksL, M.ballista, K('bridge-straight-pillar')],
});
