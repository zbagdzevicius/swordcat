// src/world/levels/meadow.js  (owner: world) — L1 Purrdale Meadows, prologue + Chapter 1 (GAME_DESIGN §12.3; the
// reference-image level: dense grey-green fog over a dark meadow). Practice field (fenced 40 × 40 with the gate that
// opens on `prologue.tutorial`, armoury barn, windmill, height chart, 3 straw dummies, swinging sack, Wobble Knight,
// cracked boulder, sleeping cow), Sir Tallbert's statue, the far Pawsbury skyline + Dawnstone, the lane, crossroads
// (drystone walls, signposts, rats), the Standing Stones arena, the Picnic Glade (hay bale → CS-03, Pudding's rope
// posts, arena), the Crow Fields (wheat, hay bales, crows, the second cow), the Old Bridge over the stream (arena,
// Mochi's cage cart) and the exit to the forest. 3 lost kittens (Noodle, Button, Biscuit) and Letter #1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineLevel } from '../LevelKit.js';
import { PropActor, SwingingSack, WobbleKnight } from '../PropActor.js';
import { WheatField } from '../Wheat.js';
import { makeStoneMaterial } from '../Props.js';
import { E } from '../../core/events.js';
import { smoothPolyline, pointAlong, distToPolyline } from '../noise.js';

const M = {
  fence: 'models/env/nature/fence_simple.glb',
  barn: 'models/env/village-kaykit/buildings/building_home_A_red.glb',
  windmill: 'models/env/village-kaykit/buildings/building_windmill_red.glb',
  target: 'models/env/village-kaykit/decoration/target.glb',
  boulder: 'models/env/nature/rock_largeA.glb',
  cow: 'models/creatures/animals/Cow.glb',
  knight: 'models/characters/kaykit/Knight.glb',
  tower: 'models/env/village-kaykit/buildings/building_tower_A_red.glb',
  castle: 'models/env/village-kaykit/buildings/building_castle_red.glb',
  wall: 'models/env/graveyard/stone-wall.glb',
  hay: 'models/env/graveyard/hay-bale.glb',
  bridge: 'models/env/castle/bridge-straight.glb',
  bridgePillar: 'models/env/castle/bridge-straight-pillar.glb',
  cart: 'models/env/town/cart-high.glb',
  oak: 'models/env/nature/tree_oak.glb',
  treeDefault: 'models/env/nature/tree_default.glb',
  treeDetailed: 'models/env/nature/tree_detailed.glb',
  weaponrack: 'models/env/village-kaykit/decoration/weaponrack.glb',
  sack: 'models/env/village-kaykit/decoration/sack.glb',
  lily: 'models/env/nature/lily_large.glb',
  reeds: 'models/env/nature/grass_large.glb',
  log: 'models/env/nature/log.glb',
  stump: 'models/env/nature/stump_old.glb',
};
const STONES_TALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((k) => `models/env/nature/stone_tall${k}.glb`);
const ROCKS_SMALL = ['A', 'B', 'C', 'D', 'E'].map((k) => `models/env/nature/rock_small${k}.glb`);
const STONES_LARGE = ['A', 'B', 'C', 'D'].map((k) => `models/env/nature/stone_large${k}.glb`);
const BUSHES = ['models/env/nature/plant_bush.glb', 'models/env/nature/plant_bushLarge.glb', 'models/env/nature/plant_bushDetailed.glb'];

/** Palette bits (art.md §6.2). */
const C = { wood: '#7A5B3E', woodDark: '#4E3A28', plank: '#A0825A', straw: '#C9B26A', burlap: '#9C8460', rope: '#8C6A4A', red: '#B0453C',
  cream: '#EFE3CF', steel: '#9EA4AC', stone: '#8E918A', stoneDark: '#6E716B', moss: '#5E6A3A', dirt: '#4A4030', iron: '#4A4C50' };

const ROPE_POSTS = [[-2, 24], [6, 24], [2, 28]];
/** §12.3 spine; LANE = the carved path (Terrain smooths the spine the same way: Catmull-Rom, 2 m). */
const SPINE = [[0, -80], [0, -62], [-6, -50], [-22, -30], [-20, -4], [2, 18], [24, 40], [30, 62], [30, 90]];
const LANE = smoothPolyline(SPINE, 2);
/** The crossroads centre and its arc length along the lane. */
const CROSSROADS = [-22, -30];
const S_CROSS = (() => { const o = { i: 0, t: 0, along: 0 }; distToPolyline(CROSSROADS[0], CROSSROADS[1], LANE, o); return o.along; })();
/** A point `off` m beside the carved lane at arc length `s` (side +1 = left of travel toward the exit, −1 = right). */
function beside(s, off, side) {
  const [x, z, yaw] = pointAlong(LANE, s);
  return [x + Math.cos(yaw) * off * side, z - Math.sin(yaw) * off * side];
}
/** The lane's south-west drystone wall (4 m right of the lane) carries the crossbow perch, 1.1 m before the crossroads. */
const PERCH_WALL = { s0: S_CROSS - 16, s1: S_CROSS + 1, off: 4.0, side: -1 };
const CROSSROADS_PERCH = beside(S_CROSS - 1.1, PERCH_WALL.off, PERCH_WALL.side).map((v) => Math.round(v * 100) / 100);
/** The Kenney hay bale keeps its colormap bands: nearly desaturated (its orange reads rust in the fog), then straw-tinted. */
const HAY = { sat: 0.12, mul: 1.0, tint: '#E6CF8C', key: 'hay' };
const BRIDGE = { x: 30, z0: 57, z1: 67, width: 4, deckY: 0.32 };
/** Mochi's cage cart (§12.3 Old Bridge). */
const MOCHI_CAGE = [30, 74];

// ---------------------------------------------------------------------------------------------- procedural parts
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

function heightChartParts() {
  const p = [[cyl(0.06, 0.07, 1.9, -0.44, 0, 0), C.woodDark], [cyl(0.06, 0.07, 1.9, 0.44, 0, 0), C.woodDark],
    [box(0.8, 1.6, 0.05, 0, 0.95, 0.04), C.plank], [box(0.86, 0.06, 0.08, 0, 1.78, 0.04), C.woodDark],
    [box(0.84, 0.035, 0.06, 0, 1.05, 0.075), C.red]];                 // the painted line at 1.05 m
  for (let i = 0; i < 8; i++) { const y = 0.3 + i * 0.2; if (Math.abs(y - 1.05) < 0.05) continue; p.push([box(i % 2 ? 0.12 : 0.22, 0.015, 0.06, -0.28, y, 0.07), '#3A2A1F']); }
  return p;
}

function signpostParts() {
  return [[cyl(0.07, 0.09, 2.1), C.woodDark], [box(0.2, 0.08, 0.2, 0, 2.12, 0), C.wood]];
}

function plinthParts() {
  return [[box(2.6, 0.35, 2.6, 0, 0.175, 0), C.stoneDark], [box(2.1, 0.5, 2.1, 0, 0.6, 0), C.stone], [box(2.3, 0.12, 2.3, 0, 0.9, 0), C.stoneDark]];
}

function blanketParts() {
  const p = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) p.push([box(0.3, 0.012, 0.3, -0.75 + i * 0.3 + 0.15, 0.006, -0.75 + j * 0.3 + 0.15), (i + j) % 2 ? C.red : C.cream]);
  const basket = new THREE.CylinderGeometry(0.2, 0.16, 0.22, 10).translate(0.45, 0.11, 0.35);
  const handle = new THREE.TorusGeometry(0.16, 0.02, 5, 12, Math.PI).translate(0.45, 0.22, 0.35);
  p.push([basket, '#8A6A3E'], [handle, '#6B4E2E']);
  return p;
}

function scarecrowParts() {
  return [[cyl(0.06, 0.07, 2.0), C.woodDark], [box(1.4, 0.07, 0.07, 0, 1.45, 0), C.woodDark], [box(0.55, 0.7, 0.25, 0, 1.2, 0), C.burlap],
    [new THREE.SphereGeometry(0.22, 10, 8).translate(0, 1.82, 0), C.burlap], [new THREE.ConeGeometry(0.42, 0.28, 12).translate(0, 2.08, 0), C.straw],
    [box(0.16, 0.5, 0.16, -0.7, 1.25, 0), C.straw], [box(0.16, 0.5, 0.16, 0.7, 1.25, 0), C.straw]];
}

/** The practice-field gate leaf (hinged at its local origin, 4 m wide, opens around +Y). */
function gateLeafParts(w = 4.0, h = 1.45) {
  const p = [];
  for (const y of [0.35, 0.8, 1.25]) p.push([box(w, 0.14, 0.06, w / 2, y, 0), C.plank]);
  p.push([box(0.12, h, 0.08, 0.06, h / 2, 0), C.wood], [box(0.12, h, 0.08, w - 0.06, h / 2, 0), C.wood]);
  const brace = new THREE.BoxGeometry(Math.hypot(w, h * 0.7), 0.1, 0.05); brace.rotateZ(Math.atan2(h * 0.7, w)); brace.translate(w / 2, h * 0.5, 0.04);
  p.push([brace, C.woodDark]);
  return p;
}

function ropePostParts() {
  return [[cyl(0.11, 0.14, 1.15), C.wood], [new THREE.ConeGeometry(0.11, 0.18, 8).rotateX(Math.PI).translate(0, -0.05, 0), C.woodDark],
    [new THREE.TorusGeometry(0.15, 0.045, 6, 14).rotateX(Math.PI / 2).translate(0, 0.85, 0), C.rope],
    [new THREE.TorusGeometry(0.15, 0.045, 6, 14).rotateX(Math.PI / 2).translate(0, 0.72, 0), C.rope]];
}

function sackFrameParts() {
  return [[cyl(0.08, 0.1, 2.7, -1.5, 0, 0), C.woodDark], [cyl(0.08, 0.1, 2.7, 1.5, 0, 0), C.woodDark], [box(3.3, 0.14, 0.14, 0, 2.62, 0), C.wood]];
}

/** Sack + rope, origin at the pivot (rope 1.8 m, sack 0.6 m). */
function sackParts() {
  const sack = new THREE.SphereGeometry(0.3, 12, 10); sack.scale(1, 1.25, 1); sack.translate(0, -2.05, 0);
  return [[cyl(0.02, 0.02, 1.8, 0, -1.8, 0, 5), C.rope], [sack, C.burlap], [new THREE.CylinderGeometry(0.1, 0.16, 0.12, 8).translate(0, -1.75, 0), C.rope]];
}

/** Wobble Knight body (spring dummy) and its sword arm (pivot at the shoulder). */
function wobbleBodyParts() {
  const p = [[new THREE.CylinderGeometry(0.42, 0.48, 0.16, 14).translate(0, 0.08, 0), C.woodDark]];
  for (let i = 0; i < 5; i++) p.push([new THREE.TorusGeometry(0.13, 0.03, 5, 12).rotateX(Math.PI / 2).translate(0, 0.22 + i * 0.07, 0), C.iron]);
  const body = new THREE.CapsuleGeometry(0.27, 0.45, 4, 12); body.translate(0, 0.86, 0);
  p.push([body, C.burlap], [new THREE.SphereGeometry(0.2, 12, 10).translate(0, 1.36, 0), C.burlap]);
  const helm = new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); helm.translate(0, 1.4, 0);
  p.push([helm, C.steel], [new THREE.TorusGeometry(0.24, 0.025, 5, 16).rotateX(Math.PI / 2).translate(0, 1.4, 0), C.iron],
    [box(0.06, 0.04, 0.05, -0.08, 1.37, 0.19), '#1E1A16'], [box(0.06, 0.04, 0.05, 0.08, 1.37, 0.19), '#1E1A16'],
    [box(0.36, 0.3, 0.05, 0.0, 0.92, 0.25), C.red]);                                       // a red tabard patch
  return p;
}
function wobbleArmParts() {
  return [[cyl(0.05, 0.05, 0.42, 0, -0.42, 0, 6).rotateZ(Math.PI / 2).translate(0, 0, 0), C.burlap],
    [box(0.07, 0.07, 1.55, 0.42, 0, 0.72), '#B89A6A'], [box(0.28, 0.05, 0.06, 0.42, 0, -0.04), C.woodDark],
    [new THREE.SphereGeometry(0.1, 10, 8).scale(1, 1, 1.4).translate(0.42, 0, 1.52), C.burlap]];      // a long padded practice blade
}

// ---------------------------------------------------------------------------------------------- setpieces
const SETPIECES = {
  /** §12.3 practice field: fences, gate, barn, windmill, height chart, dummies, sack, Wobble Knight, boulder, statue. */
  async practiceField(kit, zone) {
    const ctx = kit.ctx, level = kit.level;
    const [fence, barn, windmill, target, boulder, knight, rack, sack] = await Promise.all([
      kit.tpl(M.fence), kit.tpl(M.barn), kit.tpl(M.windmill, { dynamic: ['building_windmill_top_fan_red'] }), kit.tpl(M.target), kit.tpl(M.boulder),
      kit.tpl(M.knight, { pose: 'Idle', poseT: 0.1, show: ['2H_Sword', 'Knight_Helmet', 'Knight_Cape'], flatColor: C.stone, key: 'tallbert' }),
      kit.tpl(M.weaponrack), kit.tpl(M.sack)]);
    const [cx, cz] = zone.at, half = zone.size[0] / 2;
    const x0 = cx - half, x1 = cx + half, z0 = cz - half, z1 = cz + half;
    // mown yard, worn patches
    kit.terrain.grassHeight(cx, cz, half - 2, 0.62);
    kit.paint(0, -76, 6.5, '#4B4630', 0.45, 2.5);
    kit.paint(-6, -66, 2.2, '#4B4630', 0.5);
    kit.paint(0, -86, 2.5, '#4B4630', 0.45);
    // perimeter fence 1.5 m (too tall to jump), gap at (0, −60) for the gate
    const fo = { fit: { h: 1.5 }, height: 1.5, fade: true };
    kit.fence(fence, [x0, z0], [x1, z0], fo);
    kit.fence(fence, [x0, z0], [x0, z1], fo);
    kit.fence(fence, [x1, z0], [x1, z1], fo);
    kit.fence(fence, [x0, z1], [-2.2, z1], fo);
    kit.fence(fence, [2.2, z1], [x1, z1], fo);
    // inner fence for the jump lesson (1.0 m): z = −87 from x −20 to −2
    kit.fence(fence, [x0, -87], [-2, -87], { fit: { h: 1.0 }, height: 1.0, fade: true });
    // the gate (procedural), closed until prologue.tutorial
    const posts = kit.proc('gate_posts', () => [[cyl(0.11, 0.13, 1.9, -2.15, 0, 0), C.woodDark], [cyl(0.11, 0.13, 1.9, 2.15, 0, 0), C.woodDark],
      [box(0.3, 0.1, 0.3, -2.15, 1.92, 0), C.wood], [box(0.3, 0.1, 0.3, 2.15, 1.92, 0), C.wood]]);
    kit.place(posts, 0, z1, { collider: false, jitter: 0, fade: true });     // the `start` camera sits just behind them
    for (const sx of [-2.15, 2.15]) kit.collider({ x: sx, z: z1, r: 0.16, y0: kit.h(sx, z1) - 0.5, y1: kit.h(sx, z1) + 1.9 });
    const leafTpl = kit.proc('gate_leaf', () => gateLeafParts(4.0));
    const leaf = kit.mesh(leafTpl, { name: 'practiceGate' });
    const hinge = new THREE.Group(); hinge.name = 'practiceGateHinge';
    hinge.position.set(-2.0, kit.h(-2, z1), z1);
    hinge.add(leaf);
    kit.object(hinge);
    const gy = kit.h(0, z1);
    const gateCol = { ax: -2.05, az: z1, bx: 2.05, bz: z1, r: 0.12, y0: gy - 0.5, y1: gy + 1.5, walkable: false, gate: 'practice' };
    kit.collider(gateCol);
    let open = 0, target01 = 0, opened = false;
    const setOpen = (on, instant) => {
      target01 = on ? 1 : 0;
      if (instant) open = target01;
      if (on && !opened) { opened = true; level.removeCollider(gateCol); if (!instant) ctx.audio?.play3D?.('world/creak2', new THREE.Vector3(0, gy, z1), { vol: 0.8 }); }
    };
    kit.onFlag('prologue.tutorial', (v, atLoad) => setOpen(!!v, atLoad));
    level.animators.push({ render: (dt) => { if (open !== target01) { open += Math.sign(target01 - open) * Math.min(Math.abs(target01 - open), dt * 0.9); } hinge.rotation.y = open * 1.75; } });   // swings inward (into the field): the lane stays clear
    kit.anchor('practice_gate', 0, z1, undefined, 0);
    // armoury barn (5 m) and windmill (9 m, turning sails)
    kit.place(barn, -14, -92, { fit: { h: 5 }, yaw: 0, collider: 'box', shrink: 0.82, jitter: 0 });
    kit.anchor('barn_door', -14, -88.6, undefined, 0);
    kit.place(rack, -9.6, -91.5, { fit: { h: 1.3 }, yaw: -0.3, collider: 'box' });
    kit.place(sack, -18.2, -88.4, { fit: { h: 0.6 }, yaw: 0.6, collider: 'circle' });
    kit.place(sack, -17.6, -88.0, { fit: { h: 0.55 }, yaw: 2.1, collider: false });
    const wm = kit.place(windmill, 16, -95, { fit: { h: 9 }, yaw: Math.PI * 0.85, collider: 'circle', shrink: 0.55, jitter: 0 });
    if (wm?.parts?.length) {
      const fan = wm.parts[0], rot = new THREE.Matrix4(), out = new THREE.Matrix4();
      let ang = 0;
      level.animators.push({ render: (dt) => { ang += dt * (0.25 + 0.35 * (ctx.env?.wind ?? 0.6)); rot.makeRotationZ(ang); out.multiplyMatrices(fan.base, rot); kit.batch.setMatrix(fan.handle, out); } });
    }
    // height chart board at (−6, −66)
    const chart = kit.proc('height_chart', heightChartParts);
    kit.place(chart, -6, -66, { yaw: Math.PI, collider: 'box', jitter: 0, clear: 0.8 });
    kit.anchor('chart', -6, -66, undefined, Math.PI);
    kit.anchor('chart_front', -6, -67.3, undefined, 0);
    // 3 straw dummies (1.0 m), infinite, wobble on hits
    [[-5, -76], [0, -76], [5, -76]].forEach(([x, z], i) => {
      const p = kit.place(target, x, z, { fit: { h: 1.0 }, yaw: Math.PI, collider: 'circle', jitter: 0.04 });
      if (!p) return;
      const a = new PropActor(ctx, { id: `dummy_${i + 1}`, kind: 'dummy', infinite: true, hp: 999, radius: 0.35, height: 1.0, pos: new THREE.Vector3(x, p.y, z),
        facing: Math.PI, wobble: 0.45, visual: { batch: kit.batch, handle: p.handle, base: p.matrix } });
      kit.onLoaded(() => kit.actor(a, null));
    });
    // swinging sack at (8, −84): 0.6 m sack on a 1.8 m rope, 2.0 s period (ATTACKS.sack_swing)
    kit.place(kit.proc('sack_frame', sackFrameParts), 8, -84, { collider: false, jitter: 0, clear: 1.6 });
    for (const sx of [6.5, 9.5]) kit.collider({ x: sx, z: -84, r: 0.14, y0: kit.h(sx, -84) - 0.5, y1: kit.h(sx, -84) + 2.7 });
    const sackMesh = kit.mesh(kit.proc('sack_rope', sackParts), { name: 'swingingSack' });
    const sackRoot = new THREE.Group(); sackRoot.add(sackMesh); kit.object(sackRoot);
    const sackActor = new SwingingSack(ctx, { id: 'sack', pivot: new THREE.Vector3(8, kit.h(8, -84) + 2.62, -84), axis: 'x', amp: 0.75, mesh: sackRoot, breakable: false });
    kit.onLoaded(() => kit.actor(sackActor, null));
    // Wobble Knight at (0, −86): swings every 2.0 s with a white glint (dummy_swing) while she is within its reach,
    // spins when parried
    const wk = new THREE.Group(); wk.name = 'wobbleKnight';
    wk.add(kit.mesh(kit.proc('wobble_body', wobbleBodyParts)));
    const arm = new THREE.Group(); arm.position.set(0.3, 1.0, 0.0); arm.add(kit.mesh(kit.proc('wobble_arm', wobbleArmParts))); wk.add(arm);
    kit.object(wk);
    kit.clear(0, -86, 0.9, 0.2);
    // §5.4 step 6: the one-time slow-mo parry hint belongs to the Parry step (not the Stand step before it)
    const parryHint = () => ctx.story?.tutorial?.active !== false && ctx.story?.tutorial?.log?.step?.id === 'parry';
    const wkActor = new WobbleKnight(ctx, { id: 'wobble_knight', pos: new THREE.Vector3(0, kit.h(0, -86), -86), facing: 0, mesh: wk, armPivot: arm, delay: 1.0, hint: parryHint });
    kit.onLoaded(() => kit.actor(wkActor, 'wobble_knight'));
    // cracked boulder (−10, −84): only Bright / Holy (`breaks: ['cracked']`)
    const bp = kit.place(boulder, -10, -84, { fit: { h: 1.2 }, yaw: 0.4, collider: 'circle', shrink: 0.8, color: '#9A968C', jitter: 0 });
    if (bp) {
      const bpos = new THREE.Vector3(-10, bp.y, -84);
      const rock = new PropActor(ctx, { id: 'practice_boulder', kind: 'boulder', hp: 1, breaks: 'cracked', radius: bp.radius * 0.8, height: 1.2, pos: bpos, wobble: 0.05,
        visual: { batch: kit.batch, handle: bp.handle, base: bp.matrix },
        onBreak: (self) => {
          kit.batch.setVisible(bp.handle, false);
          for (const c of bp.colliders) level.removeCollider(c);
          ctx.bus.emit(E.BURST, { kind: 'rocks', position: bpos.clone().setY(bpos.y + 0.5), count: 16 });
          ctx.bus.emit(E.SHAKE, { trauma: 0.25 });
          ctx.audio?.play3D?.('impact/impactPunch_heavy_001', bpos.clone(), { vol: 1 });
          level.removeActor(self);
        } });
      rock.tags.add('cracked');
      kit.onLoaded(() => kit.actor(rock, null));
    }
    // Sir Tallbert (4, −55.5), facing −Z, beside the lane, on a plinth. §5.4 says (4, −57) with her mark at −59.5, but
    // the field's north fence runs at z −60, so the MEME_LOOP camera (1.15 m in front of her face) sat behind the fence
    // rails; statue and mark are 1.5 m further north (still 2.5 m apart).
    const plinth = kit.place(kit.proc('tallbert_plinth', plinthParts), 4, -55.5, { yaw: Math.PI, collider: 'box', jitter: 0 });
    if (knight && plinth) {
      const k = kit.place(knight, 4, -55.5, { fit: 'tallbert', yaw: Math.PI, y: plinth.top - 0.02, collider: false, jitter: 0, clear: false, occupy: 1.6 });
      // the knight's own footprint centre followed the sword's box (~1.9 m in front of the plinth, over g01_mark,
      // requests/story.md): a body circle on the plinth instead, from the plinth top to the helm
      if (k) kit.collider({ x: 4, z: -55.5, r: 0.75, y0: plinth.top - 0.1, y1: k.top, walkable: false });
      kit.anchor('tallbert', 4, -55.5, undefined, Math.PI);
    }
    kit.anchor('g01_mark', 4, -58, undefined, Math.PI);
    kit.block({ x: 4, z: -55.5, r: 3.4 });               // no crates / scatter crowding the statue (G-01 frames it)
    kit.paint(4, -55.5, 2.4, '#4B4630', 0.35, 1.5);
    // lantern glow on the barn corner post (warm at night)
    kit.place(kit.proc('lantern_post', () => [[cyl(0.06, 0.08, 2.2), C.woodDark], [box(0.5, 0.05, 0.05, 0.22, 2.1, 0), C.woodDark],
      [box(0.16, 0.22, 0.16, 0.42, 1.88, 0), C.iron]]), -12.2, -88.9, { collider: 'circle', jitter: 0, fade: true });   // clear of the `practice` spawn's camera
    // a few hay bales around the yard
    const hay = await kit.tpl(M.hay, HAY);
    for (const [x, z, y] of [[-17.5, -84, 0.3], [-16.6, -82.6, 1.4], [12.5, -66, 2.2], [17, -64, 0.2]]) kit.place(hay, x, z, { fit: { h: 0.9 }, yaw: y, collider: 'box' });
  },

  /**
   * Crossroads (−22, −30): drystone walls (1.2 m) along the four roads, kept ≥ 0.9 m off every road edge and out of
   * the Standing Stones arena; the lane's south-west wall carries the crossbow perch (CROSSROADS_PERCH, y 1.2); four
   * bare signposts in the corners between the roads.
   */
  async crossroads(kit) {
    const wall = await kit.tpl(M.wall, { flatColor: '#8E9086' });
    const [cx, cz] = CROSSROADS;
    const dir = (to) => { const dx = to[0] - cx, dz = to[1] - cz, l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
    const lane = dir([-6, -50]), north = dir([-20, -4]), west = dir([-38, -27]), east = dir([-9, -23]);
    const skip = (x, z) => kit.roadClearance(x, z) < 0.9 || kit.inArena(x, z, 2.5) || Math.hypot(x + 16, z + 36) < 2.4;
    const wo = { fit: { h: 1.2 }, height: 1.2, walkable: true, wobble: 0.02, jitter: 0.08, thick: 0.22, skip };
    // walls follow the carved lane in 2.5 m chords (so they bend with it), `off` m to its side
    const along = ({ s0, s1, off, side }) => {
      for (let s = s0; s < s1 - 0.05; s += 2.5) kit.fence(wall, beside(s, off, side), beside(Math.min(s1, s + 2.5), off, side), wo);
    };
    along(PERCH_WALL);                                                       // lane, south-west: the crossbow perch
    along({ s0: S_CROSS - 21, s1: S_CROSS - 5, off: 4.3, side: 1 });        // lane, north-east (vigil_1 between path and wall)
    along({ s0: S_CROSS + 3, s1: S_CROSS + 12, off: 4.2, side: -1 });       // north road, west
    along({ s0: S_CROSS + 6, s1: S_CROSS + 12, off: 4.2, side: 1 });        // north road, east
    // the west road (a straight side path): its south side
    const wn = [-west[1], west[0]];
    kit.fence(wall, [cx + west[0] * 5 + wn[0] * 2.9, cz + west[1] * 5 + wn[1] * 2.9], [cx + west[0] * 15 + wn[0] * 2.9, cz + west[1] * 15 + wn[1] * 2.9], wo);
    // signposts: one in each corner between two roads, stepped out along the bisector until clear of both
    const post = kit.proc('signpost_bare', signpostParts);
    for (const [a, b] of [[lane, west], [west, north], [north, east], [east, lane]]) {
      let bx = a[0] + b[0], bz = a[1] + b[1];
      const l = Math.hypot(bx, bz) || 1; bx /= l; bz /= l;
      for (let d = 3; d < 12; d += 0.25) {
        const x = cx + bx * d, z = cz + bz * d;
        if (kit.roadClearance(x, z) < 0.7) continue;
        kit.place(post, x, z, { yaw: kit.rng.angle(), collider: 'circle', tiltX: (kit.rng() - 0.5) * 0.08 });
        break;
      }
    }
    kit.paint(cx, cz, 5, '#5E5743', 0.4, 3);
  },

  /** Picnic Glade: the hay bale (CS-03 interact), a picnic blanket, and the rope posts (30 HP each) after CS-03. */
  async picnicGlade(kit, zone) {
    const ctx = kit.ctx, level = kit.level;
    const hay = await kit.tpl(M.hay, HAY);
    kit.place(hay, 0, 16, { fit: { h: 0.75 }, yaw: 0.25, collider: 'box' });
    kit.place(kit.proc('picnic_blanket', blanketParts), 1.6, 14.6, { yaw: -0.3, collider: false, clear: 1.2, jitter: 0 });
    kit.anchor('picnic', 0, 16, undefined, Math.PI);
    kit.paint(1, 15, 3.2, '#46502A', 0.3);
    // rope posts appear with the net (flag meadow.pudding === 'netted'), 30 HP each, her hits only
    const postTpl = kit.proc('rope_post', ropePostParts);
    const live = [];
    const ensureObjective = () => {
      const ob = ctx.objectives;
      if (ob && !ob.get?.('net_ropes')) ob.start('net_ropes', { max: 3, textKey: 'obj.ropes', needClear: zone.id });
    };
    const spawnPosts = () => {
      if (live.length) return;
      ensureObjective();
      ROPE_POSTS.forEach(([x, z], i) => {
        const y = kit.h(x, z);
        const mesh = kit.mesh(postTpl, { name: 'ropePost' });
        const a = new PropActor(ctx, { id: `rope_post_${i + 1}`, kind: 'rope_post', hp: 30, radius: 0.3, height: 1.15, pos: new THREE.Vector3(x, y, z), wobble: 0.25,
          onBreak: (self) => {
            level.removeCollider(col);
            ctx.bus.emit(E.BURST, { kind: 'wood', position: self.pos.clone().setY(y + 0.6), count: 12 });
            ctx.audio?.play3D?.('world/wood_breaking_02', self.pos.clone(), { vol: 0.9 });
            ensureObjective();
            ctx.objectives?.add?.('net_ropes', 1);
            level.removeActor(self);
            const k = live.indexOf(self); if (k >= 0) live.splice(k, 1);
          } });
        a.object3d.add(mesh);
        a.render = function render() { this.object3d.position.copy(this.pos); this.object3d.rotation.set(this.wob.y * 0.6, 0, -this.wob.x * 0.6); };
        const col = { x, z, r: 0.2, y0: y - 0.5, y1: y + 1.15, walkable: false };
        level.addCollider(col);
        kit.actor(a, null);
        live.push(a);
      });
    };
    kit.onFlag('meadow.pudding', (v) => { if (v === 'netted') spawnPosts(); });
  },

  /**
   * Crow Fields: ~600 swaying wheat clumps (Wheat.js: tapered stalks, seed heads, awns; height / lean / colour jitter)
   * in patchy rows on both sides of the path, 4 hay bales (2 crossbow perches at 1.0 m), a scarecrow.
   */
  async wheatField(kit, zone) {
    const ctx = kit.ctx, level = kit.level;
    const hay = await kit.tpl(M.hay, HAY);
    const bales = [[16, 46, 0.2], [32, 34, 1.3], [9, 33, 2.4], [39, 49, 0.7]];
    for (const [x, z, yaw] of bales) {
      const p = kit.place(hay, x, z, { fit: { h: 1.0 }, yaw, collider: 'box', walkable: true, shrink: 0.95 });
      if (p) kit.occupy(x, z, 1.6);
    }
    kit.place(kit.proc('scarecrow', scarecrowParts), 21, 51, { yaw: -2.4, collider: 'circle', jitter: 0 });
    kit.occupy(21, 51, 1.2);
    const [cx, cz] = zone.at, [w, d] = zone.size;
    const rng = kit.rng.fork('wheat');
    const field = new WheatField({ seed: 23 });
    let n = 0;
    const max = zone.wheat ?? 600, keepEvery = ctx.quality?.id === 'low' ? 2 : 1;   // §18 budget: Low keeps every other clump
    const spine = kit.terrain.spine;
    for (let z = cz - d / 2 + 1; z < cz + d / 2 - 1 && n < max; z += 1.25) {
      for (let x = cx - w / 2 + 1; x < cx + w / 2 - 1 && n < max; x += 0.95) {
        const px = x + (rng() - 0.5) * 0.4, pz = z + (rng() - 0.5) * 0.3;
        const dp = distanceTo(spine, px, pz);
        if (dp < 6.2) continue;
        const patch = Math.sin(px * 0.21 + 1.3) * Math.cos(pz * 0.17 - 0.4) + Math.sin((px + pz) * 0.08) * 0.6;
        if (patch < 0.15) continue;
        if (Math.hypot(px - 30, pz - 70) < 15 || Math.hypot(px - 2, pz - 18) < 16 || Math.hypot(px - 28, pz - 52) < 4) continue;
        if (pz > 55 || !kit.free(px, pz, 0.35)) continue;
        const h = 0.85 + rng() * 0.35, yaw = rng.angle(), tx = (rng() - 0.5) * 0.16, tz = (rng() - 0.5) * 0.16, tint = (rng() - 0.35) * 0.9;
        if (n % keepEvery === 0) field.add(px, kit.h(px, pz) - 0.02, pz, { h: keepEvery > 1 ? h * 1.08 : h, yaw, tiltX: tx, tiltZ: tz, tint });
        kit.clear(px, pz, 0.55, 0.25);
        kit.paint(px, pz, 0.8, '#4A4428', 0.55, 0.6);
        n++;
      }
    }
    const mesh = field.build();
    if (!mesh) return;
    kit.object(mesh);
    level.wheat = field;
    level.animators.push({ render: (dt, t) => field.update(t ?? 0, ctx.env, ctx.player?.alive !== false ? ctx.player?.object3d?.position ?? null : null) });
  },

  /** Old Bridge (x = 30, z 57–67, 4 m wide) over the stream; Mochi's cage cart at (30, 74); reeds and lily pads. */
  async oldBridge(kit) {
    const level = kit.level;
    const stone = { sat: 0.15, mul: 0.46 };
    const [bridge, pillar, cart, lily, reeds] = await Promise.all([kit.tpl(M.bridge, stone), kit.tpl(M.bridgePillar, stone), kit.tpl(M.cart),
      kit.tpl(M.lily), kit.tpl(M.reeds, { recolorMap: { grass: '#4E5A2E' } })]);
    if (bridge) {
      const len = BRIDGE.z1 - BRIDGE.z0, n = 3, seg = len / n;
      const b = bridge.box, rawW = b.max.x - b.min.x, rawL = b.max.z - b.min.z;
      // the Kenney piece walks along its local X (arch tunnel along Z, rails on the ±Z edges): turn it 90° so it spans
      // the stream along world Z; local X = length (seg), local Z = width (4 m, a 3 m walkway between the rails)
      const sLen = (seg / rawW) * 1.002, sWid = BRIDGE.width / rawL, sy = 1.55;
      const deckRaw = 1.06;                                       // walkable deck height in the raw model (rails reach 1.18)
      const baseY = BRIDGE.deckY - deckRaw * sy;
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      const geos = [];
      for (let i = 0; i < n; i++) {
        const tpl = i === 1 && pillar ? pillar : bridge;
        const z = BRIDGE.z0 + seg * (i + 0.5);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(BRIDGE.x, baseY, z), turn, new THREE.Vector3(sLen, sy, sWid))
          .multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2));
        const g = tpl.geometry.clone().applyMatrix4(m);
        geos.push(g);
      }
      const merged = mergeGeometries(geos, false); for (const g of geos) g.dispose();
      const mat = makeStoneMaterial();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'oldBridge'; mesh.castShadow = true; mesh.receiveShadow = true;
      kit.object(mesh, { collide: true });
      level.surfaces.push({ kind: 'stone', test: (x, z) => Math.abs(x - BRIDGE.x) <= BRIDGE.width / 2 && z >= BRIDGE.z0 && z <= BRIDGE.z1 });
      kit.occupy(BRIDGE.x, (BRIDGE.z0 + BRIDGE.z1) / 2, 5.5);
      kit.anchor('bridge_mid', BRIDGE.x, 62, BRIDGE.deckY, 0);
    }
    // the rat cage cart (2.0 m) at (30, 74). While Mochi is still caged the companions area builds the whole cage cart
    // (their open `cart` + bars + collider, requests/companions.md), so ours is hidden then; it is the empty cart left
    // standing on later visits.
    if (cart) {
      const [x, z] = MOCHI_CAGE;
      const p = kit.place(cart, x, z, { fit: { h: 2.0 }, yaw: Math.PI / 2, collider: 'box', shrink: 0.9, jitter: 0 });
      if (p) {
        kit.anchor('bridge_cage', x, z, p.y, Math.PI);
        kit.onLoaded(() => {
          if (!mochiCaged(kit.ctx) || !kit.ctx.companions?.spawnKitten) return;
          kit.batch.setVisible(p.handle, false);
          for (const c of p.colliders) level.removeCollider(c);
        });
      }
    }
    // reeds along the banks, lily pads on the water
    const rng = kit.rng.fork('bridge-banks');
    if (reeds) for (let i = 0; i < 46; i++) {
      const x = -60 + rng() * 140, side = rng.sign(), z = 62 + side * (3.9 + rng() * 1.6);
      if (Math.abs(x - BRIDGE.x) < 4) continue;
      kit.place(reeds, x, z, { fit: { h: 0.6 + rng() * 0.7 }, yaw: rng.angle(), collider: false, clear: false, occupy: false, jitter: 0.15, sink: 0.05 });
    }
    if (lily) for (let i = 0; i < 18; i++) {
      const x = -40 + rng() * 120, z = 62 + (rng() - 0.5) * 5;
      if (Math.abs(x - BRIDGE.x) < 4) continue;
      kit.place(lily, x, z, { fit: { x: 0.6 + rng() * 0.6 }, yaw: rng.angle(), y: -0.39, ground: false, collider: false, clear: false, occupy: false, jitter: 0.1 });
    }
  },
};

/** Is Mochi still waiting in the Old Bridge cage (not in the party, D-01 not played)? */
function mochiCaged(ctx) {
  const st = ctx.state;
  return !(st?.companions?.unlocked?.includes?.('mochi') || st?.getFlag?.('meadow.mochi'));
}

/** Distance from (x, z) to a polyline (local helper; LevelKit's terrain has the smoothed spine). */
function distanceTo(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], vx = pts[i + 1][0] - ax, vz = pts[i + 1][1] - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), dx = x - ax - vx * t, dz = z - az - vz * t;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------------------------- the level
export default defineLevel({
  id: 'meadow', size: 200, res: 200, seed: 11, hills: { amp: 1.5, octaves: 3 }, pathWidth: 6, rim: 3.5,
  env: { default: 'meadow_day', byFlag: [['!prologue.done', 'meadow_night']] },
  music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', prologue: 'village_bards_tale', byFlag: [['!prologue.done', 'village_bards_tale']] },
  spine: SPINE,
  paths: [{ pts: [[-22, -30], [-38, -27], [-56, -31], [-80, -28]], width: 3 }, { pts: [[-22, -30], [-9, -23], [8, -27], [30, -22]], width: 3 }],
  spawns: { title: [0, -64, Math.PI], practice: [-10, -90, 0], start: [-1.5, -54.5, -0.4], boss: [30, 66, 0] },   // [x, z, yaw]; yaw 0 faces +Z
  anchors: {
    bell_far: [-130, -20, 30], horde_a: [-40, -45], horde_b: [30, -55], crane_bell: [-60, -40, 25], crane_field: [0, -70, 3],
    pud_1: [20, 36], pud_2: [36, 50], pud_3: [40, 72], pud_4: [22, 84],
    lane_post: [-4, -52, null, Math.PI / 2], lane: [-6, -52, null, Math.PI * 0.85], cow_practice: [12, -72, null, -Math.PI / 2], cow_fields: [40, 30, null, -Math.PI / 2],
    squires: [-6, -69, null, Math.PI], fence_steps: [-8, -61.2, null, Math.PI], stones_centre: [-20, -4],
  },
  keep: [{ box: [27.6, 50, 32.4, 57.8], h: 0.32, feather: 2.5 }, { box: [27.6, 66.2, 32.4, 72], h: 0.32, feather: 2.5 }],
  zones: [
    { id: 'practice', kind: 'setpiece', at: [0, -80], size: [40, 40], props: 'practiceField', tutorial: true, keepClear: true, flat: 26 },
    { id: 'tallbert', kind: 'trigger', at: [0, -61], r: 2.5, play: 'g01', when: 'prologue.tutorial && !prologue.done', once: true },
    { id: 'lane', kind: 'trigger', at: [-6, -52], r: 3, play: 'cs02', when: 'prologue.tutorial && !prologue.done', once: true },
    { id: 'vigil_1', kind: 'checkpoint', at: [-16, -36] },
    { id: 'crossroads', kind: 'open', at: [-22, -30], r: 10, props: 'crossroads', onlyIf: 'prologue.done',
      spawns: [['rat_pike', 2, [-14, -42], 4], ['rat_pike', 2, [-24, -32], 2], ['rat_xbow', 1, CROSSROADS_PERCH, 0, { y: 1.2 }]] },
    { id: 'noodle', kind: 'kitten', kittenId: 'noodle', at: [-30, -26], hide: 'meow', prop: 'barrel', onlyIf: 'prologue.done' },
    { id: 'letter_1', kind: 'letter', letterId: 'l1', at: [-18, -24] },
    { id: 'stones', kind: 'arena', at: [-20, -4], r: 12, props: 'stoneRing8', stones: STONES_TALL.slice(1, 6),   // same 5 templates as the scatter: 5 fade sets, not 8
      waves: [[['rat_pike', 3]], [['rat_pike', 3], ['rat_xbow', 1]]] },
    { id: 'button', kind: 'kitten', kittenId: 'button', at: [-20, -4], hide: 'stand', standTime: 3.0, zoneR: 1.2, needClear: 'stones', onlyIf: 'prologue.done' },
    { id: 'vigil_2', kind: 'checkpoint', at: [-12, 8] },
    { id: 'glade', kind: 'arena', at: [2, 18], r: 14, lockOn: 'cs03:end', autoLockWhen: (s) => s?.getFlag?.('meadow.pudding') === 'netted',
      restoreUnless: (s) => s?.getFlag?.('meadow.pudding') === 'netted',     // the ropes fight re-arms until Pudding is free
      objective: { id: 'net_ropes', max: 3 }, props: 'picnicGlade',
      interact: { id: 'picnic', at: [0, 16], play: 'cs03', when: 'prologue.done && !meadow.pudding', prompt: 'prompt.picnic', r: 1.8 },
      waves: [[['rat_pike', 4]], [['rat_pike', 3], ['rat_xbow', 1]]] },
    { id: 'crowfields', kind: 'open', at: [24, 40], size: [50, 40], props: 'wheatField', onlyIf: 'prologue.done', keepClear: true,
      spawns: [['crow', 4, [24, 40], 8], ['rat_xbow', 1, [16, 46], 0, { y: 1.0 }], ['rat_xbow', 1, [32, 34], 0, { y: 1.0 }]],
      hints: [{ key: 'tut.pounce', on: 'alert', type: 'crow' }, { key: 'tut.reflect', on: 'telegraph', type: 'rat_xbow' }],
      placed: [{ id: 'cow_fields', model: M.cow, at: [40, 30], fit: { h: 1.6 }, yaw: -Math.PI / 2, clip: 'Idle_Headlow', meowWakes: true, walkTo: [40, 36], kind: 'cow', radius: 0.9 }] },
    { id: 'biscuit', kind: 'kitten', kittenId: 'biscuit', at: [41.5, 30], hide: 'meow', prop: 'cow', onlyIf: 'prologue.done' },
    { id: 'vigil_3', kind: 'checkpoint', at: [28, 52] },
    { id: 'bridge', kind: 'arena', at: [30, 70], r: 12, props: 'oldBridge',
      rescue: { companion: 'mochi', cage: MOCHI_CAGE, hp: 30, play: 'd01', flag: 'meadow.mochi', style: 'cart', facing: Math.PI },
      waves: [[['rat_pike', 3], ['rat_xbow', 1]], [['rat_pike', 3], ['rat_xbow', 2]], [['rat_pike', 4], ['crow', 2]]] },
    // gated on Mochi: the forest expects her in the party (§12.3); reaching the exit early nudges her back to the cage
    { id: 'exit', kind: 'exit', at: [30, 92], size: [8, 2], to: 'forest', spawnId: 'start', when: (s, c) => !mochiCaged(c),
      blocked: { toast: 'toast.exit.mochi', text: 'Mochi is still caged at the Old Bridge!' } },
    // the tutorial cow (practice field): Meow → moo, wake, walk 6 m east, reveals Pearl (story)
    { id: 'practice_cow', kind: 'setpiece', at: [12, -72],
      placed: [{ id: 'cow_practice', model: M.cow, at: [12, -72], fit: { h: 1.6 }, yaw: -Math.PI / 2, clip: 'Idle_Headlow', meowWakes: true, walkTo: [18, -72], kind: 'cow', radius: 0.9 }] },
  ],
  setpieces: SETPIECES,
  water: [{ kind: 'stream', pts: [[-100, 60.5], [-70, 63], [-40, 61], [-10, 62.8], [14, 61.4], [30, 62], [46, 62.6], [70, 60.8], [100, 62.5]], width: 8, y: -0.4, deep: true }],
  scatter: [
    { model: STONES_TALL.slice(1, 6), n: 30, fit: { h: [1.5, 3] }, minDistFromPath: 5, minDist: 2.5, fade: true },
    { model: M.oak, n: 25, fit: { h: [8, 12] }, minDistFromPath: 10, minDist: 6, tree: true },
    { model: [M.treeDefault, M.treeDetailed], n: 22, fit: { h: [7, 11] }, minDistFromPath: 12, minDist: 7, tree: true },
    { model: M.hay, n: 12, fit: { h: 1.0 }, minDistFromPath: 3, minDist: 3, tpl: HAY },
    { model: STONES_LARGE, n: 14, fit: { h: [0.7, 1.4] }, minDistFromPath: 4, minDist: 2, sink: 0.12 },
    { model: ROCKS_SMALL, n: 60, fit: { h: [0.2, 0.45] }, minDistFromPath: 3.2, minDist: 1, collider: false, clear: 0.3 },
    { model: BUSHES, n: 46, fit: { h: [0.6, 1.3] }, minDistFromPath: 3.5, minDist: 1.8, collider: false, clear: 0.6 },
    { model: [M.log, M.stump], n: 10, fit: { max: [0.8, 1.6] }, minDistFromPath: 4, minDist: 2.5 },
  ],
  crates: { n: 12, milk: 2 },
  // shader warm-up (LevelManager._prewarm): CS-02's hyena cast, on top of the zone enemy types
  warm: [{ types: ['hyena'], when: '!prologue.done' }, { types: ['hyena'], opts: { cage: 'pearl', word: 'GRUMBLER' }, when: '!prologue.done' },
    { types: ['hyena'], opts: { cage: true, word: 'GRUMBLER' }, when: '!prologue.done' }],
  fishLines: [
    [[0, -55], [-10, -42], 5], [[-20, -18], [-5, 10], 6], [[-10, -39], [-12, -31], 5], [[-21, -24], [-20, -14], 6], [[-8, 9], [-1, 14], 5],
    [[6, 22], [16, 32], 7], [[18, 36], [25, 44], 6], [[26.5, 42.5], [28, 48.5], 6], [[30, 76], [30, 86], 7], [[-28, -30], [-40, -27], 6], [[-6, -24], [6, -27], 7],
  ],
  breadcrumbs: { from: [-6, -50], to: [-21, -32], n: 6 },
  skyline: [{ model: M.tower, at: [-130, -20], fit: { h: 30 }, yaw: 0.4 }, { model: M.castle, at: [-140, -6], fit: { h: 20 }, yaw: 0.2 }],
  dawnstone: { anchor: 'bell_far', color: '#FFC46B', size: 10, intensity: 2.4, offWhen: 'prologue.done' },
  horizon: { n: 80 }, horizonFog: 0.84,
  grass: { height: 0.27 },
  // loaded by the setpieces above (listed for the manifest test and per-level preloading)
  models: [M.fence, M.barn, M.windmill, M.target, M.boulder, M.knight, M.weaponrack, M.sack, M.wall, M.hay, M.bridge, M.bridgePillar, M.cart,
    M.lily, M.reeds, M.cow, ...STONES_TALL],
});
