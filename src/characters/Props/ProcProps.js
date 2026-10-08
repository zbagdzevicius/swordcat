// Procedural cutscene / held props and cages (GAME_DESIGN §5.1 `prop` step, §18.3 "Cutscene props", CS-02 cages).
// Every prop is ONE mesh with the shared kit material (vertex colours + rmse), so each costs one draw call.
// Kitten-scale units (1 = Swordcat's height).
import * as THREE from 'three';
import { PAL } from '../palette.js';
import { GeoBuilder, mat, rgb, mixRgb, smoothstep } from '../util.js';
import { kitMaterial, RM } from '../materials.js';
import { potHelmGeometry } from '../Accessories.js';
import { bowGeometry, bowMaterial } from '../Bow.js';

/** Contract prop names (GAME_DESIGN §19.4) + extras. */
export const PROP_NAMES = Object.freeze(['milk_cup', 'lantern', 'spoon', 'letter', 'pot_helm',
  'milk_bottle', 'colander', 'signpost', 'post_bag', 'cot', 'soup_bowl', 'jester_hat', 'postmaster_hat', 'cage']);

/**
 * Where a kitten holds / wears each prop (joint + local transform). `name@at` variants override (e.g. letter@belt).
 * Props flagged `upright` re-orient each frame so they stay level relative to the kitten.
 */
export const PROP_MOUNTS = {
  milk_cup: { joint: 'pawL', p: [-0.012, -0.05, 0.045], r: [0, 0, 0] },
  milk_bottle: { joint: 'pawL', p: [-0.01, -0.05, 0.045], r: [0, 0, 0] },
  lantern: { joint: 'pawL', p: [0, -0.07, 0.03], r: [0, 0, 0] },
  spoon: { joint: 'pawR', p: [0, -0.04, 0.035], r: [-0.3, 0, 0] },
  letter: { joint: 'pawL', p: [0, -0.06, 0.05], r: [-0.5, 0, 0.2] },
  'letter@belt': { joint: 'hips', p: [0.11, 0.02, 0.15], r: [-0.15, 0.55, -0.25] },
  pot_helm: { joint: 'head', p: [0, 0.285, -0.005], r: [0.12, 0.15, 0.14] },
  colander: { joint: 'head', p: [0, 0.29, 0], r: [0.1, 0, -0.12] },
  soup_bowl: { joint: 'pawL', p: [0, -0.06, 0.06], r: [0, 0, 0] },
  jester_hat: { joint: 'head', p: [0, 0.3, 0], r: [0, 0, 0] },
  postmaster_hat: { joint: 'head', p: [0, 0.31, 0], r: [0.1, 0, 0] },
  post_bag: { joint: 'chest', p: [-0.17, -0.12, 0.02], r: [0, -0.4, 0] },
};

const mesh = (gb, name) => {
  const m = new THREE.Mesh(gb.build(), kitMaterial());
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
};

/** Keep a prop upright relative to the kitten root (cups, lanterns, bowls held in animated paws). */
function makeUpright(obj, tilt = [0, 0, 0]) {
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), qr = new THREE.Quaternion();
  const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(...tilt));
  obj.userData.update = () => {
    if (!obj.parent) return;
    let root = obj.parent; while (root.parent && !root.userData.kitten) root = root.parent;
    obj.parent.getWorldQuaternion(qp); root.getWorldQuaternion(qr);
    q.copy(qp).invert().multiply(qr).multiply(tq);
    obj.quaternion.copy(q);
  };
  return obj;
}

// ------------------------------------------------------------------ held props

export function milkCup() {
  const gb = new GeoBuilder();
  const prof = [[0.0001, 0], [0.027, 0], [0.034, 0.09], [0.036, 0.095]];
  gb.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24), {
    color: (v) => (v.y < 0.072 ? mixRgb(rgb(PAL.milk), rgb('#E9E1D0'), smoothstep(0.0, 0.07, v.y) * 0.3) : rgb('#DCE3E8')), rmse: (v) => (v.y < 0.072 ? RM.milk : RM.plastic),
  });
  gb.add(new THREE.SphereGeometry(0.037, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), { matrix: mat([0, 0.095, 0]), color: rgb('#E8EEF2'), rmse: RM.plastic });
  // straw: up and angled toward the mouth (+z, +y)
  const straw = new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 8);
  gb.add(straw, { matrix: mat([0.0, 0.14, 0.012], [0.35, 0, 0]), color: (v) => (Math.sin(v.y * 140) > 0 ? rgb('#F2A2B8') : rgb('#FFFFFF')), rmse: RM.plastic });
  return makeUpright(mesh(gb, 'milk_cup'), [0.05, 0, 0]);
}

export function milkBottle() {
  const gb = new GeoBuilder();
  const prof = [[0.0001, 0], [0.028, 0], [0.03, 0.006], [0.03, 0.06], [0.018, 0.085], [0.014, 0.1], [0.016, 0.105]];
  gb.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20), { color: (v) => (v.y < 0.07 ? rgb(PAL.milk) : rgb('#D9E2E6')), rmse: (v) => (v.y < 0.07 ? RM.milk : RM.glass) });
  gb.add(new THREE.CylinderGeometry(0.031, 0.031, 0.02, 20), { matrix: mat([0, 0.035, 0]), color: rgb('#3F6FB5'), rmse: RM.paper });
  gb.add(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 8), { matrix: mat([0.005, 0.135, 0.01], [0.3, 0, 0.1]), color: (v) => (Math.sin(v.y * 140) > 0 ? rgb('#F2A2B8') : rgb('#FFFFFF')), rmse: RM.plastic });
  return makeUpright(mesh(gb, 'milk_bottle'));
}

/** Lantern (CS-04, CS-15): brass frame, warm glowing panes; opts.light adds PointLight #FFC46B (1.5, d 6). */
export function lantern(o = {}) {
  const gb = new GeoBuilder(), brass = rgb(PAL.brass), glow = rgb('#FFC46B');
  const h = 0.12, r = 0.045;
  gb.add(new THREE.CylinderGeometry(r * 0.95, r * 0.95, h * 0.78, 6, 1), { matrix: mat([0, -h * 0.5, 0]), color: glow, rmse: RM.glow });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    gb.add(new THREE.BoxGeometry(0.006, h * 0.8, 0.006), { matrix: mat([Math.cos(a) * r, -h * 0.5, Math.sin(a) * r]), color: brass, rmse: RM.brass });
  }
  gb.add(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.012, 6), { matrix: mat([0, -h * 0.92, 0]), color: brass, rmse: RM.brass });
  gb.add(new THREE.ConeGeometry(r * 1.2, 0.04, 6), { matrix: mat([0, -h * 0.08, 0]), color: brass, rmse: RM.brass });
  gb.add(new THREE.TorusGeometry(0.022, 0.004, 6, 16), { matrix: mat([0, 0.0, 0]), color: brass, rmse: RM.brass });
  gb.add(new THREE.CylinderGeometry(0.012, 0.012, 0.035, 8), { matrix: mat([0, -h * 0.72, 0]), color: rgb('#FFF4DA'), rmse: [0.6, 0, 0, 1.5] });
  const m = mesh(gb, 'lantern');
  if (o.light) {
    const L = new THREE.PointLight('#FFC46B', o.intensity ?? 1.5, o.distance ?? 6, 2);
    L.position.set(0, -h * 0.5, 0); L.castShadow = false; m.add(L); m.userData.light = L;
  }
  return makeUpright(m);
}

export function spoon(o = {}) {
  const gb = new GeoBuilder();
  const metal = o.wood ? rgb('#A27A4E') : rgb('#C9CED6'), rm = o.wood ? RM.wood : RM.steel;
  gb.add(new THREE.CylinderGeometry(0.007, 0.009, 0.2, 8), { matrix: mat([0, 0.06, 0]), color: metal, rmse: rm });
  const bowl = new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5).scale(1, 1.4, 0.5);
  gb.add(bowl, { matrix: mat([0, 0.19, 0], [Math.PI / 2, 0, 0]), color: metal, rmse: rm });
  gb.add(bowl, { matrix: mat([0, 0.19, -0.001], [-Math.PI / 2, 0, 0]), color: mixRgb(metal, [0, 0, 0], 0.2), rmse: rm });
  return mesh(gb, 'spoon');
}

/** Yellowed envelope with a red wax paw seal (CS-06 / CS-10). */
export function letter() {
  const gb = new GeoBuilder();
  gb.add(new THREE.BoxGeometry(0.11, 0.075, 0.004), { color: rgb(PAL.paperOld), rmse: RM.paper });
  // flap: two thin triangles as darker paper
  const flap = new THREE.BufferGeometry();
  flap.setAttribute('position', new THREE.Float32BufferAttribute([-0.055, 0.0375, 0.0022, 0.055, 0.0375, 0.0022, 0, -0.005, 0.0022], 3));
  flap.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flap.setIndex([0, 2, 1]);
  gb.add(flap, { color: rgb('#C9B283'), rmse: RM.paper });
  gb.add(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 14), { matrix: mat([0, 0.0, 0.004], [Math.PI / 2, 0, 0]), color: rgb(PAL.waxRed), rmse: [0.35, 0, 0, 0] });
  return mesh(gb, 'letter');
}

export function potHelm() { const m = new THREE.Mesh(potHelmGeometry(0.95), kitMaterial()); m.name = 'pot_helm'; m.castShadow = true; return m; }

export function colander() {
  const gb = new GeoBuilder();
  const g = new THREE.SphereGeometry(0.19, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.75, 1);
  const metal = rgb('#B9BEC4');
  gb.add(g, { color: (v) => ((Math.sin(v.x * 160) * Math.sin(v.z * 160) > 0.7 && v.y > 0.03) ? rgb('#2A2C30') : metal), rmse: [0.3, 0.9, 0, 0] });
  for (const s of [1, -1]) gb.add(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), { matrix: mat([s * 0.2, 0.0, 0], [0, s > 0 ? 0 : Math.PI, Math.PI / 2 * s]), color: metal, rmse: RM.steel });
  return mesh(gb, 'colander');
}

/** Lane signpost (CS-02): post + 2 arrow boards; world-placed, ~1.4 H tall, with a hook for the post bag. */
export function signpost() {
  const gb = new GeoBuilder(), wood = rgb('#7A5A3E'), board = rgb('#A88458');
  gb.add(new THREE.CylinderGeometry(0.035, 0.045, 1.4, 8), { matrix: mat([0, 0.7, 0]), color: wood, rmse: RM.wood });
  let tilt = 0.031;
  const arrow = (y, yaw, len) => {
    tilt = -tilt * 1.4; // a little crooked, deterministic
    const s = new THREE.Shape();
    s.moveTo(0, -0.055); s.lineTo(len - 0.07, -0.055); s.lineTo(len, 0); s.lineTo(len - 0.07, 0.055); s.lineTo(0, 0.055); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false }).translate(0.02, 0, -0.011);
    gb.add(g, { matrix: mat([0, y, 0], [0, yaw, tilt]), color: (v) => mixRgb(board, wood, smoothstep(0.4, 0.9, Math.sin(v.x * 60) * 0.5 + 0.5) * 0.3), rmse: RM.wood });
  };
  arrow(1.22, 0.3, 0.42); arrow(1.06, Math.PI - 0.5, 0.38);
  gb.add(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI * 1.4), { matrix: mat([0.05, 0.85, 0], [0, 0, -0.5]), color: rgb('#3B3D42'), rmse: RM.iron });
  return mesh(gb, 'signpost');
}

/** Royal Post bag: leather satchel with a strap and a brass crest. */
export function postBag() {
  const gb = new GeoBuilder();
  gb.add(new THREE.BoxGeometry(0.16, 0.12, 0.06, 3, 3, 2), { color: rgb('#7A4A2A'), rmse: RM.leather });
  gb.add(new THREE.BoxGeometry(0.165, 0.05, 0.065), { matrix: mat([0, 0.045, 0.003]), color: rgb('#5E361E'), rmse: RM.leather });
  gb.add(new THREE.CircleGeometry(0.018, 14), { matrix: mat([0, 0.035, 0.037]), color: rgb(PAL.brass), rmse: RM.brass });
  gb.add(new THREE.TorusGeometry(0.12, 0.006, 6, 30, Math.PI), { matrix: mat([0, 0.06, 0]), color: rgb('#5E361E'), rmse: RM.leather });
  return mesh(gb, 'post_bag');
}

/** Cot with a blanket and pillow (CS-10 Marmalade). World-placed, ~1.1 long. */
export function cot() {
  const gb = new GeoBuilder(), wood = rgb('#8A6440');
  gb.add(new THREE.BoxGeometry(0.62, 0.05, 1.12), { matrix: mat([0, 0.22, 0]), color: wood, rmse: RM.wood });
  for (const x of [-0.28, 0.28]) for (const z of [-0.52, 0.52]) gb.add(new THREE.BoxGeometry(0.05, 0.22, 0.05), { matrix: mat([x, 0.11, z]), color: wood, rmse: RM.wood });
  gb.add(new THREE.BoxGeometry(0.58, 0.06, 1.06), { matrix: mat([0, 0.27, 0]), color: rgb('#EFE6D4'), rmse: RM.cloth });
  gb.add(new THREE.BoxGeometry(0.6, 0.05, 0.7), { matrix: mat([0, 0.31, 0.16]), color: (v) => ((Math.floor(v.x * 12) + Math.floor(v.z * 12)) % 2 ? rgb('#A3202C') : rgb('#C9B283')), rmse: RM.cloth });
  gb.add(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10).rotateZ(Math.PI / 2), { matrix: mat([0, 0.33, -0.4]), color: rgb('#F5F2EC'), rmse: RM.cloth });
  return mesh(gb, 'cot');
}

export function soupBowl() {
  const gb = new GeoBuilder();
  const prof = [[0.0001, 0], [0.03, 0], [0.05, 0.03], [0.055, 0.045]];
  gb.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20), { color: rgb('#C9A27A'), rmse: RM.ceramic });
  gb.add(new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2), { matrix: mat([0, 0.036, 0]), color: rgb('#D98A3A'), rmse: [0.25, 0, 0, 0.05] });
  gb.add(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), { matrix: mat([0.03, 0.06, 0], [0, 0, -0.6]), color: rgb('#C9CED6'), rmse: RM.steel });
  return makeUpright(mesh(gb, 'soup_bowl'));
}

/** Jester hat: `size` = head diameter it should fit (kitten default 0.36; KayKit beast heads pass their own). */
export function jesterHatProp(o = {}) {
  const gb = new GeoBuilder(), s = (o.size ?? 0.36) / 0.36, cols = [rgb('#A3202C'), rgb('#D9B26A')];
  gb.add(new THREE.SphereGeometry(0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), { matrix: mat([0, -0.1, 0]), color: (v) => (v.x > 0 ? cols[0] : cols[1]), rmse: RM.cloth });
  for (const k of [1, -1]) {
    const cone = new THREE.ConeGeometry(0.07, 0.26, 14, 6);
    const p = cone.attributes.position; for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 0.13) / 0.26; p.setX(i, p.getX(i) + t * t * 0.13); p.setY(i, p.getY(i) - t * t * 0.09); }
    cone.computeVertexNormals();
    gb.add(cone, { matrix: mat([k * 0.09, 0.08, 0], [0, k > 0 ? 0 : Math.PI, k * -0.5]), color: cols[k > 0 ? 0 : 1], rmse: RM.cloth });
    gb.add(new THREE.SphereGeometry(0.026, 10, 8), { matrix: mat([k * 0.27, 0.04, 0]), color: rgb(PAL.brass), rmse: RM.brass });
  }
  const g = gb.build(); g.scale(s, s, s);
  const m = new THREE.Mesh(g, kitMaterial()); m.name = 'jester_hat'; m.castShadow = true; return m;
}

/** Postmaster's peaked cap (Pilfer, post-credits). */
export function postmasterHat(o = {}) {
  const gb = new GeoBuilder(), s = (o.size ?? 0.36) / 0.36, navy = rgb('#2C3A5A');
  gb.add(new THREE.CylinderGeometry(0.16, 0.15, 0.09, 24), { matrix: mat([0, 0.0, 0]), color: navy, rmse: RM.cloth });
  gb.add(new THREE.CylinderGeometry(0.18, 0.16, 0.03, 24), { matrix: mat([0, 0.055, -0.01], [-0.12, 0, 0]), color: navy, rmse: RM.cloth });
  gb.add(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 20, 1, false, -0.9, 1.8), { matrix: mat([0, -0.035, 0.1], [0.3, 0, 0]), color: rgb('#15161A'), rmse: RM.leather });
  gb.add(new THREE.CircleGeometry(0.025, 12), { matrix: mat([0, 0.0, 0.158]), color: rgb(PAL.brass), rmse: RM.brass });
  const g = gb.build(); g.scale(s, s, s);
  const m = new THREE.Mesh(g, kitMaterial()); m.name = 'postmaster_hat'; m.castShadow = true; return m;
}

// ------------------------------------------------------------------ cages

/**
 * Procedural cage (CS-02 carried cages, Old Bridge cart bars, treetop cage, kennel cages).
 * @param {{style?: 'carry'|'hanging'|'cart'|'kennel', size?: number[], bars?: number, ribbon?: boolean|string}} o
 * @returns {THREE.Group} group with userData: { door: Object3D (hinge), setOpen(t 0..1), lock: Object3D, kind }
 */
export function buildCage(o = {}) {
  const style = o.style || 'carry';
  const group = new THREE.Group(); group.name = 'cage:' + style;
  const iron = rgb('#3B3D42'), ironL = rgb('#5A5D63'), wood = rgb('#7A5A3E'), woodD = rgb('#5A3E2B');
  const gb = new GeoBuilder(), doorGb = new GeoBuilder();
  let door = new THREE.Group(); door.name = 'cageDoor';
  const bar = (g, x0, y0, z0, x1, y1, z1, r = 0.012, c = iron) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(r, r, len, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(geo, { matrix: new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), color: c, rmse: RM.iron });
  };
  if (style === 'hanging') {
    const R = (o.size?.[0] ?? 0.9) / 2, H = o.size?.[1] ?? 0.95, n = o.bars ?? 16;
    gb.add(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.05, 24), { matrix: mat([0, 0.025, 0]), color: woodD, rmse: RM.wood });
    gb.add(new THREE.TorusGeometry(R, 0.016, 6, 32), { matrix: mat([0, H * 0.72, 0], [Math.PI / 2, 0, 0]), color: ironL, rmse: RM.iron });
    gb.add(new THREE.TorusGeometry(R, 0.016, 6, 32), { matrix: mat([0, 0.06, 0], [Math.PI / 2, 0, 0]), color: ironL, rmse: RM.iron });
    const span = (Math.PI / n) * 2.2, hx = Math.cos(Math.PI / 2 + span) * R, hz = Math.sin(Math.PI / 2 + span) * R;
    door.position.set(hx, 0, hz);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      if (Math.abs(a - Math.PI / 2) < span) bar(doorGb, x - hx, 0.06, z - hz, x - hx, H * 0.7, z - hz);
      else bar(gb, x, 0.05, z, x, H * 0.72, z);
      bar(gb, x, H * 0.72, z, x * 0.15, H, z * 0.15, 0.01);
    }
    gb.add(new THREE.TorusGeometry(0.06, 0.012, 6, 16), { matrix: mat([0, H + 0.05, 0]), color: ironL, rmse: RM.iron });
  } else {
    const W = o.size?.[0] ?? (style === 'cart' ? 1.2 : style === 'kennel' ? 0.9 : 0.6);
    const H = o.size?.[1] ?? (style === 'cart' ? 0.9 : style === 'kennel' ? 0.8 : 0.75);
    const D = o.size?.[2] ?? (style === 'cart' ? 0.8 : style === 'kennel' ? 0.9 : 0.5);
    const hw = W / 2, hd = D / 2;
    if (style !== 'cart') gb.add(new THREE.BoxGeometry(W + 0.04, 0.05, D + 0.04), { matrix: mat([0, 0.025, 0]), color: woodD, rmse: RM.wood });
    if (style === 'kennel') {
      gb.add(new THREE.BoxGeometry(W + 0.06, 0.04, D + 0.08), { matrix: mat([0, H + 0.02, 0]), color: wood, rmse: RM.wood });
      gb.add(new THREE.BoxGeometry(W, H, 0.03), { matrix: mat([0, H / 2, -hd]), color: wood, rmse: RM.wood });
    } else {
      gb.add(new THREE.BoxGeometry(W + 0.04, 0.04, D + 0.04), { matrix: mat([0, H, 0]), color: wood, rmse: RM.wood });
    }
    // frame posts
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) gb.add(new THREE.BoxGeometry(0.04, H, 0.04), { matrix: mat([x, H / 2, z]), color: wood, rmse: RM.wood });
    // bars on the four sides; the front (+z) is the door
    const nx = Math.max(3, Math.round(W / 0.085)), nz = Math.max(3, Math.round(D / 0.085));
    for (let i = 1; i < nx; i++) {
      const x = -hw + (i / nx) * W;
      bar(doorGb, x + hw, 0.05, 0, x + hw, H - 0.02, 0);
      if (style !== 'kennel') bar(gb, x, 0.05, -hd, x, H - 0.02, -hd);
    }
    for (let i = 1; i < nz; i++) { const z = -hd + (i / nz) * D; bar(gb, -hw, 0.05, z, -hw, H - 0.02, z); bar(gb, hw, 0.05, z, hw, H - 0.02, z); }
    doorGb.add(new THREE.BoxGeometry(W, 0.03, 0.03), { matrix: mat([hw, H * 0.5, 0]), color: ironL, rmse: RM.iron });
    // lock
    doorGb.add(new THREE.BoxGeometry(0.06, 0.07, 0.03), { matrix: mat([W - 0.06, H * 0.5, 0.025]), color: rgb('#6E5A3A'), rmse: RM.brass });
    door.position.set(-hw, 0, hd);
    if (style === 'carry') {
      // carry handle on top
      gb.add(new THREE.TorusGeometry(0.08, 0.014, 6, 16, Math.PI), { matrix: mat([0, H + 0.02, 0]), color: ironL, rmse: RM.iron });
    }
    group.userData.size = [W, H, D];
  }
  const body = new THREE.Mesh(gb.build(), kitMaterial()); body.castShadow = true; body.name = 'cageBody';
  group.add(body);
  if (!doorGb.empty) { const dm = new THREE.Mesh(doorGb.build(), kitMaterial()); dm.castShadow = true; dm.name = 'cageDoorBars'; door.add(dm); }
  group.add(door);
  if (o.ribbon) {
    const color = typeof o.ribbon === 'string' ? o.ribbon : '#E9B9B9';
    const rb = new THREE.Mesh(bowGeometry({ color, light: '#FFE0E8', shade: '#C98A9A', knot: '#D9A0AE', scale: 1.6 }), bowMaterial('#FFE0E8'));
    const H = group.userData.size?.[1] ?? (o.size?.[1] ?? 0.95);
    rb.position.set(0.1, H + 0.04, (group.userData.size?.[2] ?? 0.5) / 2 + 0.01); rb.rotation.z = -0.3;
    rb.name = 'cageRibbon';
    group.add(rb);
  }
  group.userData.door = door;
  group.userData.kind = style;
  group.userData.setOpen = (t) => { door.rotation.y = -Math.max(0, Math.min(1, t)) * 1.9; };
  return group;
}

// ------------------------------------------------------------------ factory

const BUILDERS = {
  milk_cup: milkCup, milk_bottle: milkBottle, lantern, spoon, letter, pot_helm: potHelm, colander, signpost,
  post_bag: postBag, cot, soup_bowl: soupBowl, jester_hat: jesterHatProp, postmaster_hat: postmasterHat, cage: buildCage,
};

/**
 * Build a prop by name. Unknown names return null.
 * @param {string} name one of PROP_NAMES
 * @param {object} [opts] builder options (lantern {light}, spoon {wood}, cage {style, ribbon}, hats {size})
 * @returns {THREE.Object3D|null}
 */
export function buildProp(name, opts = {}) {
  const fn = BUILDERS[name];
  return fn ? fn(opts) : null;
}
