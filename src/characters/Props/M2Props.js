// M2 props (Acts I–II, GAME_DESIGN §11.2, §12.5, §9.3): hub activity props for the rescued kittens, Grizzlechop's
// feathered hat / cheese-wheel shield / giant cheese wheel (B1), and the Spoon Brigade's throw. Like ProcProps, every
// prop is ONE mesh (or one group with one mesh) on the shared kit material: one draw call each.
// Units: metres (Swordcat = 1.0). Beast props take `size` / `r` so enemies can fit them to their fitted GLBs.
import * as THREE from 'three';
import { PAL } from '../palette.js';
import { GeoBuilder, mat, rgb, mixRgb, smoothstep, mulberry32 } from '../util.js';
import { kitMaterial, RM } from '../materials.js';
import { flipShell } from '../Accessories.js';

/** Cheese palette (§11.2 `#E8C35A`), rind and hole shade. */
export const CHEESE = Object.freeze({ body: '#E8C35A', rind: '#C99A35', hole: '#A8822C', wax: '#B0503C' });

const mesh = (gb, name, shadow = true) => {
  const m = new THREE.Mesh(gb.build(), kitMaterial());
  m.name = name; m.castShadow = shadow; m.receiveShadow = true;
  return m;
};

// ------------------------------------------------------------------ hub activity props (§12.5)

/** Book (Earl Grey's library, Juniper "reading upside down"): `open` (default) or closed. Origin at the spine bottom. */
export function book(o = {}) {
  const gb = new GeoBuilder(), cover = rgb(o.color ?? '#7A2E3A'), paper = rgb(PAL.paper);
  if (o.open === false) {
    gb.add(new THREE.BoxGeometry(0.12, 0.16, 0.035), { matrix: mat([0, 0.08, 0]), color: cover, rmse: RM.leather });
    gb.add(new THREE.BoxGeometry(0.112, 0.15, 0.029), { matrix: mat([0.006, 0.08, 0]), color: paper, rmse: RM.paper });
  } else {
    for (const s of [1, -1]) {
      gb.add(new THREE.BoxGeometry(0.085, 0.006, 0.12), { matrix: mat([s * 0.044, 0.003, 0], [0, 0, -s * 0.12]), color: cover, rmse: RM.leather });
      // page block, curved up toward the spine
      const pg = new THREE.BoxGeometry(0.078, 0.014, 0.11, 6, 1, 1);
      const p = pg.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) * s; p.setY(i, p.getY(i) + 0.012 * (1 - smoothstep(-0.04, 0.03, x))); }
      pg.computeVertexNormals();
      gb.add(pg, { matrix: mat([s * 0.043, 0.013, 0], [0, 0, -s * 0.12]), color: paper, rmse: RM.paper });
    }
    gb.add(new THREE.BoxGeometry(0.004, 0.003, 0.09), { matrix: mat([0.0, 0.022, 0.01]), color: rgb('#C2353B'), rmse: RM.satin });   // ribbon
  }
  return mesh(gb, 'book');
}

/** Fishing stick with a string and a red-white float (Biscuit, Pebble at the fountain). Rod along +Y from the grip. */
export function fishingRod(o = {}) {
  const len = o.length ?? 0.62, gb = new GeoBuilder(), wood = rgb('#8A6440');
  const rod = new THREE.CylinderGeometry(0.005, 0.009, len, 7, 6).translate(0, len / 2, 0);
  const p = rod.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / len; p.setZ(i, p.getZ(i) + t * t * 0.07); }   // gentle bend
  rod.computeVertexNormals();
  gb.add(rod, { color: wood, rmse: RM.wood });
  gb.add(new THREE.SphereGeometry(0.012, 6, 5).scale(1.6, 1, 1), { matrix: mat([0.006, len * 0.45, 0.012]), color: rgb('#6E9A3C'), rmse: RM.leaf });  // a leaf
  const tip = new THREE.Vector3(0, len, 0.07), drop = o.drop ?? 0.32;
  const line = new THREE.CylinderGeometry(0.0012, 0.0012, drop, 3).translate(0, -drop / 2, 0);
  gb.add(line, { matrix: mat(tip.toArray()), color: rgb('#E9E2D2'), rmse: RM.cloth });
  gb.add(new THREE.SphereGeometry(0.016, 10, 8), { matrix: mat([tip.x, tip.y - drop - 0.008, tip.z]), color: (v, n, lp) => (lp.y > 0 ? rgb('#C2353B') : rgb('#F2EFE8')), rmse: RM.plastic });
  const m = mesh(gb, 'fishing_rod');
  // idle bob (the float dips now and then); visual only, phase fixed per instance
  let t = o.phase ?? 0.7;
  m.userData.update = (dt) => { t += dt; m.rotation.x = -0.05 + Math.sin(t * 1.4) * 0.03 + (Math.sin(t * 0.37) > 0.92 ? 0.08 : 0); };
  return m;
}

/** Wicker bread basket a kitten naps in (Pickles at the bakery). World-placed, ~0.5 m long. */
export function breadBasket(o = {}) {
  const gb = new GeoBuilder(), straw = rgb(PAL.straw), deep = mixRgb(straw, [0.25, 0.15, 0.05], 0.4);
  const prof = [[0.0001, 0.0], [0.17, 0.0], [0.2, 0.02], [0.23, 0.1], [0.24, 0.13], [0.225, 0.135], [0.21, 0.11], [0.19, 0.03], [0.0001, 0.03]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32).scale(1.25 * (o.scale ?? 1), o.scale ?? 1, 0.85 * (o.scale ?? 1));
  gb.add(g, { color: (v) => mixRgb(straw, deep, 0.5 + 0.5 * Math.sin(v.y * 160 + Math.atan2(v.z, v.x) * 18) > 0.6 ? 0.55 : 0.1), rmse: RM.straw });
  // a cloth liner and two bread rolls tucked at one end
  gb.add(new THREE.CircleGeometry(0.19, 24).rotateX(-Math.PI / 2).scale(1.22, 1, 0.82), { matrix: mat([0, 0.035, 0]), color: rgb('#CDBFA2'), rmse: RM.cloth });
  for (const [x, z] of [[0.17, 0.04], [0.15, -0.06]]) gb.add(new THREE.CapsuleGeometry(0.035, 0.07, 4, 10).rotateZ(Math.PI / 2), { matrix: mat([x, 0.07, z], [0, 0.4, 0]), color: rgb('#C98A44'), rmse: RM.bread });
  return mesh(gb, 'bread_basket');
}

/** Teacup on a saucer (Sprout knocks it off the tavern table every 20 s). */
export function teacup() {
  const gb = new GeoBuilder(), china = rgb('#F2EFE8'), blue = rgb('#5C7FB0');
  gb.add(new THREE.CylinderGeometry(0.045, 0.035, 0.008, 20), { color: china, rmse: RM.ceramic });
  const cup = new THREE.LatheGeometry([[0.0001, 0.008], [0.022, 0.008], [0.03, 0.02], [0.034, 0.05], [0.032, 0.052]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  gb.add(cup, { color: (v) => (v.y > 0.036 && v.y < 0.042 ? blue : china), rmse: RM.ceramic });
  gb.add(flipShell(cup), { color: rgb('#B5835A'), rmse: RM.ceramic });   // tea
  gb.add(new THREE.TorusGeometry(0.012, 0.003, 6, 12, Math.PI * 1.3), { matrix: mat([0.036, 0.032, 0], [0, 0, -Math.PI * 0.65]), color: china, rmse: RM.ceramic });
  return mesh(gb, 'teacup');
}

/** Smith's hammer (Bean hands Tofu tools at the forge). Handle along +Y from the grip. */
export function hammer() {
  const gb = new GeoBuilder();
  gb.add(new THREE.CylinderGeometry(0.009, 0.011, 0.2, 8), { matrix: mat([0, 0.08, 0]), color: rgb('#8A6440'), rmse: RM.wood });
  gb.add(new THREE.BoxGeometry(0.075, 0.035, 0.035), { matrix: mat([0, 0.19, 0]), color: rgb(PAL.steelDark), rmse: RM.iron });
  gb.add(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 10), { matrix: mat([0.042, 0.19, 0], [0, 0, Math.PI / 2]), color: rgb(PAL.steel), rmse: RM.steel });
  return mesh(gb, 'hammer');
}

/**
 * Butterfly (Bramble chases one on a 3 m loop): two hinged wing pairs flapping on their own (`userData.update`).
 * Origin at the body; flies along +Z.
 */
export function butterfly(o = {}) {
  const root = new THREE.Group(); root.name = 'butterfly';
  const col = rgb(o.color ?? '#F2D16B'), edge = rgb('#5A3E2B');
  const wing = new THREE.CircleGeometry(0.035, 12).scale(1, 1.3, 1).translate(0.032, 0.006, 0);
  const wingCol = (v, n, lp) => mixRgb(col, edge, smoothstep(0.045, 0.06, Math.hypot(lp.x - 0.032, (lp.y - 0.006) / 1.3)));
  const wings = [];
  for (const s of [1, -1]) {
    const gb = new GeoBuilder();
    gb.add(wing, { matrix: mat([0, 0, 0], [-Math.PI / 2, 0, 0], [s, 1, 1]), color: wingCol, rmse: RM.satin });
    gb.add(flipShell(wing.clone().applyMatrix4(mat([0, 0, 0], [-Math.PI / 2, 0, 0], [s, 1, 1]))), { color: wingCol, rmse: RM.satin });
    const w = mesh(gb, 'wing', false);
    root.add(w); wings.push([w, s]);
  }
  const body = new GeoBuilder();
  body.add(new THREE.CapsuleGeometry(0.006, 0.04, 3, 6).rotateX(Math.PI / 2), { color: edge, rmse: RM.cloth });
  root.add(mesh(body, 'body', false));
  let t = o.phase ?? 0;
  root.userData.update = (dt) => {
    t += dt;
    const a = 0.2 + 0.9 * (0.5 + 0.5 * Math.sin(t * 22));
    for (const [w, s] of wings) w.rotation.z = s * a;
  };
  return root;
}

// ------------------------------------------------------------------ B1 Captain Grizzlechop (§11.2)

/**
 * Feathered cavalier hat (§11.2: "cone plus 3 feather cards"). `size` = brim diameter (default 0.42 m, a 1.6 m rat).
 * Origin at the brim centre, crown along +Y, front +Z; the plumes sweep back over his left side.
 */
export function featheredHat(o = {}) {
  const S = (o.size ?? 0.42) / 0.42, gb = new GeoBuilder();
  const felt = rgb(o.color ?? '#3A2E4A'), band = rgb(o.band ?? '#B0503C'), plume = [rgb('#F4F0E6'), rgb('#E8B33A'), rgb('#C2353B')];
  // wide brim, cocked up on the left side
  const brim = new THREE.CylinderGeometry(0.21, 0.21, 0.012, 40, 1);
  const bp = brim.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z), out = Math.max(0, r - 0.1);
    bp.setY(i, bp.getY(i) + out * (x > 0 ? 1.1 * smoothstep(0, 0.2, x) : -0.18));
  }
  brim.computeVertexNormals();
  gb.add(brim, { color: felt, rmse: RM.velvet });
  gb.add(flipShell(brim), { color: mixRgb(felt, [0, 0, 0], 0.3), rmse: RM.velvet });
  // crown: a soft rounded cone
  const crown = new THREE.LatheGeometry([[0.11, 0.0], [0.112, 0.06], [0.1, 0.12], [0.07, 0.16], [0.0001, 0.175]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  gb.add(crown, { color: felt, rmse: RM.velvet });
  gb.add(new THREE.CylinderGeometry(0.114, 0.114, 0.03, 28, 1, true), { matrix: mat([0, 0.025, 0]), color: band, rmse: RM.satin });
  gb.add(new THREE.BoxGeometry(0.035, 0.03, 0.01), { matrix: mat([0.075, 0.025, 0.085], [0, 0.7, 0]), color: rgb(PAL.brass), rmse: RM.brass });
  // three feather cards (curved, double-sided), rooted at the band on his left, sweeping back
  for (let k = 0; k < 3; k++) {
    const L = 0.34 - k * 0.05, f = new THREE.PlaneGeometry(0.085, L, 2, 10).translate(0, L / 2, 0);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / L, x = p.getX(i);
      p.setX(i, x * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)));        // pointed ends
      p.setZ(i, -t * t * 0.18);                                            // curls back
    }
    f.computeVertexNormals();
    const m = mat([0.09 - k * 0.012, 0.04, 0.03 - k * 0.03], [-0.35 - k * 0.12, 0.2, -0.55 + k * 0.18]);
    const c = plume[k];
    const fc = (v, n, lp) => mixRgb(c, mixRgb(c, [1, 1, 1], 0.4), smoothstep(0.02, 0.0, Math.abs(lp.x)));  // pale quill
    gb.add(f, { matrix: m, color: fc, rmse: RM.satin });
    gb.add(flipShell(f), { matrix: m, color: fc, rmse: RM.satin });
  }
  const g = gb.build(); if (S !== 1) g.scale(S, S, S);
  const out = new THREE.Mesh(g, kitMaterial());
  out.name = 'feathered_hat'; out.castShadow = true;
  return out;
}

/** Cheese body geometry with rind band and dimple holes (one face direction: the wheel axis is +Y). */
function cheeseDisc(gb, r, w, { holes = 7, seed = 7, matrix = null } = {}) {
  const body = rgb(CHEESE.body), rind = rgb(CHEESE.rind), hole = rgb(CHEESE.hole);
  const rnd = mulberry32(seed);
  const spots = [];
  for (let i = 0; i < holes; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.8; spots.push([Math.cos(a) * d, Math.sin(a) * d, (0.08 + rnd() * 0.08) * r]); }
  const face = (v, n, lp) => {
    let c = body;
    for (const [x, z, hr] of spots) c = mixRgb(c, hole, smoothstep(hr, hr * 0.6, Math.hypot(lp.x - x, lp.y - z)));
    return mixRgb(c, rind, smoothstep(r * 0.86, r, Math.hypot(lp.x, lp.y)) * 0.6);
  };
  const side = new THREE.CylinderGeometry(r, r, w, 40, 4, true);
  const p = side.attributes.position;
  for (let i = 0; i < p.count; i++) {      // a pressed wheel: the rind bulges a little at mid-height
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.06 * (1 - (2 * y / w) ** 2);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  side.computeVertexNormals();
  const M = matrix ?? new THREE.Matrix4();
  gb.add(side, { matrix: M, color: (v, n, lp) => mixRgb(rind, body, 0.25 + 0.15 * Math.sin(Math.atan2(lp.z, lp.x) * 40)), rmse: RM.milk });
  for (const s of [1, -1]) {
    const cap = new THREE.RingGeometry(0, r, 48, 16);   // in XY facing +Z (rings, so the holes have vertices); turned onto ±Y
    gb.add(cap, { matrix: M.clone().multiply(mat([0, s * w / 2, 0], [-s * Math.PI / 2, 0, 0])), color: face, rmse: RM.milk });
  }
}

/** Cheese-wheel shield (§11.2: cylinder r 0.45, `#E8C35A`), face toward +Z, strap + wooden grip on the back. */
export function cheeseShield(o = {}) {
  const r = o.r ?? 0.45, w = o.width ?? 0.12, gb = new GeoBuilder();
  cheeseDisc(gb, r, w, { seed: o.seed ?? 11, holes: 9, matrix: mat([0, 0, 0], [Math.PI / 2, 0, 0]) });
  // a red wax seal stamped with a crude rat-skull sigil (pompous), and the iron grip behind
  gb.add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.012, 24), { matrix: mat([0, r * 0.12, w / 2 + 0.004], [Math.PI / 2, 0, 0]), color: rgb(CHEESE.wax), rmse: [0.4, 0, 0, 0] });
  gb.add(new THREE.BoxGeometry(r * 0.9, 0.04, 0.03), { matrix: mat([0, 0, -w / 2 - 0.02]), color: rgb(PAL.leatherDark), rmse: RM.leather });
  return mesh(gb, 'cheese_shield');
}

/**
 * Rolling cheese wheel: the toss (§11.2: 0.9 m wheel → r 0.45) or the giant phase-2 ride (`giant: true` → r 0.8,
 * width 0.6). Axis along X (rolls along ±Z). `crack(0..1)` darkens a wedge when the wheel hits a millstone pillar.
 */
export function cheeseWheel(o = {}) {
  const giant = !!o.giant, r = o.r ?? (giant ? 0.8 : 0.45), w = o.width ?? (giant ? 0.6 : 0.24);
  const gb = new GeoBuilder();
  cheeseDisc(gb, r, w, { seed: o.seed ?? (giant ? 23 : 5), holes: giant ? 14 : 8, matrix: mat([0, 0, 0], [0, 0, Math.PI / 2]) });
  if (giant) {   // an axle peg each side and a saddle on top for Grizzlechop
    for (const s of [1, -1]) gb.add(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 14), { matrix: mat([s * (w / 2 + 0.03), 0, 0], [0, 0, Math.PI / 2]), color: rgb('#5A3E2B'), rmse: RM.wood });
  }
  const m = mesh(gb, giant ? 'cheese_wheel_giant' : 'cheese_wheel');
  m.userData.radius = r; m.userData.width = w;
  /** Spin for a travelled distance (metres). */
  m.userData.roll = (dist) => { m.rotation.x += dist / r; };
  return m;
}

/** Cheese wedge (the phase-3 Snack, §11.2: he eats a wedge over 0.8 s). `bite(0..1)` shrinks it. */
export function cheeseWedge(o = {}) {
  const r = o.r ?? 0.14, gb = new GeoBuilder();
  const g = new THREE.CylinderGeometry(r, r, r * 0.6, 12, 1, false, 0, Math.PI / 3.2);
  gb.add(g, { color: (v, n) => (Math.abs(n.y) > 0.6 ? rgb(CHEESE.body) : n.x * n.x + n.z * n.z > 0.5 && Math.hypot(v.x, v.z) > r * 0.9 ? rgb(CHEESE.rind) : rgb(CHEESE.body)), rmse: RM.milk });
  const m = mesh(gb, 'cheese_wedge');
  m.userData.bite = (k) => m.scale.setScalar(Math.max(0.05, 1 - k * 0.95));
  return m;
}

/** Builders by prop name (merged into ProcProps' factory). */
export const M2_BUILDERS = Object.freeze({
  book, fishing_rod: fishingRod, bread_basket: breadBasket, teacup, hammer, butterfly,
  feathered_hat: featheredHat, cheese_shield: cheeseShield, cheese_wheel: cheeseWheel,
  cheese_wheel_giant: (o = {}) => cheeseWheel({ ...o, giant: true }), cheese_wedge: cheeseWedge,
});

/** Where a kitten holds / wears the M2 props (joint + local transform). */
export const M2_MOUNTS = Object.freeze({
  book: { joint: 'pawL', p: [-0.05, -0.05, 0.06], r: [-1.1, 0, 0] },
  'book@upsidedown': { joint: 'pawL', p: [-0.05, -0.05, 0.06], r: [-1.1, 0, Math.PI] },
  fishing_rod: { joint: 'pawR', p: [0, -0.04, 0.03], r: [-0.75, 0, 0] },
  teacup: { joint: 'pawL', p: [-0.01, -0.05, 0.045], r: [0, 0, 0] },
  hammer: { joint: 'pawR', p: [0, -0.04, 0.03], r: [-0.4, 0, 0] },
  // Spoon Brigade grip: the spoon sticks out past the fist (away from the elbow), so a raised arm shows it overhead
  'spoon@throw': { joint: 'pawR', p: [0, -0.05, 0.03], r: [Math.PI - 0.35, 0, 0], s: 1.35 },
});
