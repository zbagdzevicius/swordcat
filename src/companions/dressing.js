// src/companions/dressing.js  (owner: companions) — small procedural set dressing this area builds around its actors
// (GAME_DESIGN §12.4–§12.6, §12.5 hub activity spots): the town stocks that hold Clover (D-04), the treetop rope
// posts and rope of Sage's hanging cage (D-02), the hub kittens' fishing sticks, tavern cups and butterfly.
// Every builder returns a THREE.Group whose meshes share module-level geometries / materials (no per-call shader
// compile); `disposeDressing(root)` frees only what a builder created per call (`userData.owned`).
import * as THREE from 'three';
import { kitMaterial, RM } from '../characters/index.js';
import { GeoBuilder, rgb } from '../characters/util.js';

let _mats = null;
/** Shared materials (lazy: no WebGL / allocation at import). */
export function dressingMats() {
  if (_mats) return _mats;
  const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.85, metalness: o.m ?? 0, ...(o.extra ?? {}) });
  _mats = {
    wood: m('#7A5A3E'), woodDark: m('#5A3E2B'), woodPale: m('#9C7B57'), iron: m('#4A4C52', { r: 0.45, m: 0.7 }),
    rope: m('#B89A6A', { r: 0.95 }), line: new THREE.LineBasicMaterial({ color: '#EDE6D6', transparent: true, opacity: 0.7 }),
    latch: m('#8E5A2E'), bow: m('#C9A8FF', { r: 0.5 }), cup: m('#D9D2C2', { r: 0.4 }), milk: m('#FFFDF6', { r: 0.3 }), cloth: m('#B0503C'),
    wing: new THREE.MeshBasicMaterial({ color: '#FFD34D', side: THREE.DoubleSide, transparent: true, opacity: 0.95, fog: true }),
  };
  for (const k in _mats) _mats[k].userData.shared = true;
  return _mats;
}

const _geo = new Map();
/** Cached geometry by key (shared by every dressing instance). */
function geo(key, make) { let g = _geo.get(key); if (!g) { g = make(); _geo.set(key, g); } return g; }
const box = (w, h, d) => geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r0, r1, h, n = 8) => geo(`cyl:${r0}:${r1}:${h}:${n}`, () => new THREE.CylinderGeometry(r0, r1, h, n));

function mesh(g, mat, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, mat);
  o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true;
  return o;
}

/**
 * The town stocks (§12.5 `square`, Clover D-04): two posts, a split board with a head hole and two paw holes at the
 * held kitten's neck height. userData: { size: [w, h, d], setOpen(t) (the top board swings up), neckY }.
 * @param {{ neckY?: number, width?: number }} [o]
 */
export function buildStocks({ neckY = 0.55, width = 1.3 } = {}) {
  const M = dressingMats();
  const g = new THREE.Group(); g.name = 'stocks';
  const postH = neckY + 0.45, hw = width / 2;
  for (const x of [-hw, hw]) g.add(mesh(cyl(0.05, 0.06, postH, 8), M.woodDark, x, postH / 2, 0));
  g.add(mesh(box(width + 0.12, 0.06, 0.12), M.woodDark, 0, postH + 0.03, 0));            // cap beam
  g.add(mesh(box(0.5, 0.04, 0.5), M.woodDark, 0, 0.02, 0.05, false));                   // a little plank floor
  // lower board (fixed) with half-holes: three short pieces leave gaps for the neck and the paws
  const by = neckY - 0.06;
  const seg = (x0, x1, y, top) => {
    const w = Math.max(0.02, x1 - x0);
    const b = mesh(box(w, 0.12, 0.07), top ? M.woodPale : M.wood, (x0 + x1) / 2, y, 0);
    return b;
  };
  const holes = [[-0.32, 0.05], [0, 0.07], [0.32, 0.05]];               // paw, neck, paw (x, half-width)
  const cutRow = (y, top, parent) => {
    let x0 = -hw;
    for (const [hx, r] of holes) { parent.add(seg(x0, hx - r, y, top)); x0 = hx + r; }
    parent.add(seg(x0, hw, y, top));
  };
  cutRow(by, false, g);
  // upper board on a hinge at the left post: swings up when she frees the prisoner
  const hinge = new THREE.Group(); hinge.name = 'stocksBoard';
  hinge.position.set(-hw, by + 0.12, 0);
  const upper = new THREE.Group(); upper.position.set(hw, 0, 0);
  cutRow(0, true, upper);
  upper.add(mesh(box(0.08, 0.09, 0.06), M.latch, hw - 0.09, 0, 0.05));                   // the wooden latch (WA20: no metal)
  upper.add(mesh(box(0.14, 0.07, 0.03), M.bow, hw - 0.09, 0.075, 0.07, false));            // + its lilac bow
  hinge.add(upper);
  g.add(hinge);
  g.userData.size = [width + 0.12, postH + 0.06, 0.5];
  g.userData.neckY = neckY;
  g.userData.setOpen = (t) => { hinge.rotation.z = Math.max(0, Math.min(1, t)) * 1.35; };
  g.userData.kind = 'stocks';
  return g;
}

/**
 * A rope post for the treetop cage (§12.4 `treetop`): a stout stake with a coil of rope. userData.setCut(on) tips
 * the frayed end over. Height ~1.1 m.
 */
export function buildRopePost() {
  const M = dressingMats();
  const g = new THREE.Group(); g.name = 'ropePost';
  g.add(mesh(cyl(0.09, 0.11, 1.1, 8), M.woodDark, 0, 0.55, 0));
  g.add(mesh(geo('ropeCoil', () => new THREE.TorusGeometry(0.12, 0.035, 6, 14)), M.rope, 0, 0.85, 0));
  const frayed = mesh(cyl(0.025, 0.025, 0.35, 5), M.rope, 0.08, 0.95, 0);
  frayed.rotation.z = -0.4;
  g.add(frayed);
  g.userData.setCut = (on) => { frayed.rotation.z = on ? -1.9 : -0.4; frayed.position.y = on ? 0.7 : 0.95; g.rotation.z = on ? 0.08 : 0; };
  return g;
}

/**
 * A straight rope (a thin cylinder) from `a` to `b` (world or parent space Vector3s), re-pointable with
 * userData.set(a, b). Owned geometry: unit-height cylinder scaled along Y (shared).
 */
export function buildRope(a, b, r = 0.025) {
  const M = dressingMats();
  const m = mesh(cyl(r, r, 1, 5), M.rope, 0, 0, 0, false);
  m.name = 'rope';
  const _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  m.userData.set = (p, q) => {
    _d.subVectors(q, p);
    const len = Math.max(1e-3, _d.length());
    m.position.copy(p).addScaledVector(_d, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(_up, _d.divideScalar(len));
  };
  m.userData.set(a, b);
  return m;
}

/** A fishing stick with a dangling line and a cork float (Biscuit / Pebble on the fountain rim). */
export function buildFishingStick() {
  const M = dressingMats();
  const g = new THREE.Group(); g.name = 'fishingStick';
  const pole = mesh(cyl(0.008, 0.014, 0.9, 5), M.woodPale, 0, 0.45, 0);
  const tip = new THREE.Group(); tip.position.set(0, 0.9, 0);
  g.add(pole);
  pole.add(tip); tip.position.set(0, 0.45, 0);
  const line = new THREE.Line(geo('fishLine', () => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.55, 0)])), M.line);
  tip.add(line);
  const cork = mesh(geo('cork', () => new THREE.SphereGeometry(0.025, 8, 6)), M.cloth, 0, -0.55, 0, false);
  tip.add(cork);
  g.userData.pole = pole; g.userData.tip = tip; g.userData.cork = cork;
  return g;
}

/** A small cup (Sprout's tavern table gag). */
export function buildCup() {
  const M = dressingMats();
  const g = new THREE.Group(); g.name = 'cup';
  g.add(mesh(cyl(0.045, 0.035, 0.09, 10), M.cup, 0, 0.045, 0));
  g.add(mesh(cyl(0.04, 0.04, 0.005, 10), M.milk, 0, 0.085, 0, false));
  return g;
}

/** A little round tavern table (0.62 m) for the cup. */
export function buildTable() {
  const M = dressingMats();
  const g = new THREE.Group(); g.name = 'tavernTable';
  g.add(mesh(cyl(0.38, 0.38, 0.05, 14), M.woodPale, 0, 0.6, 0));
  g.add(mesh(cyl(0.05, 0.07, 0.6, 8), M.woodDark, 0, 0.3, 0));
  return g;
}

/** A butterfly: two flapping wing quads (Bramble chases it on a 3 m loop). userData.flap(t). */
export function buildButterfly(color = '#FFD34D') {
  const M = dressingMats();
  const mat = color === '#FFD34D' ? M.wing : M.wing.clone();
  if (mat !== M.wing) { mat.color.set(color); mat.userData.owned = true; }
  const g = new THREE.Group(); g.name = 'butterfly';
  const wg = geo('wing', () => { const p = new THREE.PlaneGeometry(0.07, 0.06); p.translate(0.035, 0, 0); p.rotateX(-Math.PI / 2); return p; });
  const l = new THREE.Mesh(wg, mat), r = new THREE.Mesh(wg, mat);
  r.scale.x = -1;
  g.add(l, r);
  g.userData.flap = (t) => { const a = Math.sin(t * 22) * 0.9; l.rotation.z = a; r.rotation.z = -a; };
  return g;
}

/** Free what a dressing builder created per call (cloned materials); shared geometry / materials stay cached. */
export function disposeDressing(root) {
  root?.traverse?.((o) => {
    const m = o.material;
    if (m?.userData?.owned) m.dispose();
  });
  root?.removeFromParent?.();
}

// ------------------------------------------------------------------ WA20 kitten carriers

/**
 * WA20 kitten-carrier palette: honey wood slats, rope lashing, a lilac bow, a pink polka-dot cushion with cream dots.
 * No metal anywhere (the old iron cages read as a prison); the latch is wood. `crack` is the cracked latch inset.
 */
export const CARRIER = Object.freeze({
  wood: '#B7773F', woodDark: '#8E5A2E', rope: '#E8B87A', bow: '#C9A8FF', bowLight: '#E2D2FF', bowKnot: '#A988E8',
  cushion: '#FF9EC0', dots: '#FFF1DE', crack: '#5A3A20', wheel: '#9C6436', wheelHub: '#E8B87A',
  /** thinnest structural member (m): no slat, rope or rail below it (WA20) */
  minMember: 0.06, slat: 0.08, slatDepth: 0.06, gap: 0.15,
});
/** Every colour a carrier uses (unit lint: none of them is an iron grey). */
export const CARRIER_COLORS = Object.freeze(Object.values(CARRIER).filter((v) => typeof v === 'string'));

const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler(), _cs = new THREE.Vector3(), _cp = new THREE.Vector3(), _cu = new THREE.Vector3();
/** A compose() matrix (a fresh Matrix4: GeoBuilder keeps none of them; build time only). */
const cmat = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => _cm.compose(_cp.set(x, y, z), _cq.setFromEuler(_ce.set(rx, ry, rz)), _cs.set(sx, sy, sz)).clone();

/** A lilac bow (two loops, a knot, two tails) into `gb`, centred at (x, y, z), facing +z. */
function addBow(gb, x, y, z, s = 1) {
  const loop = new THREE.SphereGeometry(0.07 * s, 10, 8);
  gb.add(loop, { matrix: cmat(x - 0.075 * s, y + 0.01 * s, z, 0, 0, 0.5, 1.15, 0.7, 0.45), color: rgb(CARRIER.bow), rmse: RM.satin });
  gb.add(loop, { matrix: cmat(x + 0.075 * s, y + 0.01 * s, z, 0, 0, -0.5, 1.15, 0.7, 0.45), color: rgb(CARRIER.bow), rmse: RM.satin });
  gb.add(new THREE.SphereGeometry(0.035 * s, 8, 6), { matrix: cmat(x, y, z + 0.01 * s), color: rgb(CARRIER.bowKnot), rmse: RM.satin });
  const tail = new THREE.BoxGeometry(0.035 * s, 0.11 * s, 0.02 * s);
  gb.add(tail, { matrix: cmat(x - 0.03 * s, y - 0.07 * s, z, 0, 0, 0.35), color: rgb(CARRIER.bowLight), rmse: RM.satin });
  gb.add(tail, { matrix: cmat(x + 0.03 * s, y - 0.07 * s, z, 0, 0, -0.35), color: rgb(CARRIER.bowLight), rmse: RM.satin });
}

/** The polka-dot cushion on the carrier floor (pink, cream dots on top). */
function addCushion(gb, w, d, y, round = false) {
  const h = 0.07;
  const g = round ? new THREE.CylinderGeometry(w / 2, w / 2, h, 20) : new THREE.BoxGeometry(w, h, d);
  gb.add(g, { matrix: cmat(0, y + h / 2, 0), color: rgb(CARRIER.cushion), rmse: RM.velvet });
  const dot = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10);
  const nx = Math.max(2, Math.floor(w / 0.16)), nz = Math.max(2, Math.floor(d / 0.16));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = ((i + 0.5 + (j % 2 ? 0.35 : 0)) / nx) * w - w / 2, z = ((j + 0.5) / nz) * d - d / 2;
    if (round && Math.hypot(x, z) > w / 2 - 0.05) continue;
    if (Math.abs(x) > w / 2 - 0.04) continue;
    gb.add(dot, { matrix: cmat(x, y + h + 0.004, z), color: rgb(CARRIER.dots), rmse: RM.cloth });
  }
}

/** A loose cart wheel lying on the ground (ON §6.1 "one broken wheel prop") at (x, y, z) in `gb`. */
function addWheel(gb, x, y, z, yaw = 0) {
  const r = 0.32;
  gb.add(new THREE.TorusGeometry(r, 0.045, 6, 18), { matrix: cmat(x, y + 0.045, z, Math.PI / 2, 0, yaw), color: rgb(CARRIER.wheel), rmse: RM.wood });
  gb.add(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10), { matrix: cmat(x, y + 0.05, z), color: rgb(CARRIER.wheelHub), rmse: RM.wood });
  const spoke = new THREE.BoxGeometry(r * 2 - 0.08, 0.06, 0.06);
  for (let i = 0; i < 2; i++) gb.add(spoke, { matrix: cmat(x, y + 0.045, z, 0, yaw + i * Math.PI / 3, 0), color: rgb(CARRIER.wheel), rmse: RM.wood });
  // the broken spoke: a short stub
  const a = yaw + (2 * Math.PI) / 3;
  gb.add(new THREE.BoxGeometry(r * 0.6, 0.06, 0.06), { matrix: cmat(x + Math.cos(a) * r * 0.35, y + 0.045, z - Math.sin(a) * r * 0.35, 0, a, 0.2), color: rgb(CARRIER.wheel), rmse: RM.wood });
}

/** The wooden latch on the door (cracked: a dark zigzag split through it), with the lilac bow on it. */
function addLatch(gb, x, y, z, cracked) {
  gb.add(new THREE.BoxGeometry(0.12, 0.14, 0.07), { matrix: cmat(x, y, z), color: rgb(CARRIER.woodDark), rmse: RM.wood });
  if (cracked) {
    const seg = new THREE.BoxGeometry(0.016, 0.05, 0.012);
    gb.add(seg, { matrix: cmat(x - 0.01, y + 0.04, z + 0.037, 0, 0, 0.5), color: rgb(CARRIER.crack), rmse: RM.wood });
    gb.add(seg, { matrix: cmat(x + 0.008, y, z + 0.037, 0, 0, -0.55), color: rgb(CARRIER.crack), rmse: RM.wood });
    gb.add(seg, { matrix: cmat(x - 0.006, y - 0.045, z + 0.037, 0, 0, 0.45), color: rgb(CARRIER.crack), rmse: RM.wood });
  }
  addBow(gb, x, y + 0.11, z + 0.03, 0.85);
}

/**
 * WA20 kitten carrier (replaces the iron cage for every rescue: Mochi's tipped cart, Biscuit at the Old Bridge, Sage's
 * treetop carrier, the snack-wagon carrier, kittens in carriers). Two draws (body, door) on the shared kit material,
 * one fewer than the old cage (body, door bars, ribbon).
 * userData: { size: [w, h, d], door, kind: 'carrier', style, cracked, setOpen(t) }.
 * @param {{ style?: 'carry'|'cart'|'hanging'|'kennel', size?: number[], ribbon?: boolean|string, cracked?: boolean,
 *   wheel?: number[] }} [o] wheel: [x, y, z, yaw?] of a loose broken wheel in the carrier's frame (Mochi's cart)
 */
export function buildCarrier(o = {}) {
  const style = o.style || 'carry';
  const group = new THREE.Group(); group.name = 'carrier:' + style;
  const C = CARRIER, wood = rgb(C.wood), woodD = rgb(C.woodDark), rope = rgb(C.rope), t = C.minMember;
  const gb = new GeoBuilder(), dgb = new GeoBuilder();
  const door = new THREE.Group(); door.name = 'carrierDoor';
  const slat = (g, x, y0, y1, z, ry = 0) => g.add(new THREE.BoxGeometry(C.slat, y1 - y0, C.slatDepth), { matrix: cmat(x, (y0 + y1) / 2, z, 0, ry, 0), color: wood, rmse: RM.wood });
  let W, H, D;
  if (style === 'hanging') {
    W = o.size?.[0] ?? 0.95; H = o.size?.[1] ?? 1.0; D = o.size?.[2] ?? W;
    const R = W / 2, n = 10;
    gb.add(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.07, 22), { matrix: cmat(0, 0.035, 0), color: woodD, rmse: RM.wood });
    gb.add(new THREE.TorusGeometry(R, 0.035, 6, 26), { matrix: cmat(0, H * 0.72, 0, Math.PI / 2), color: rope, rmse: RM.cloth });
    gb.add(new THREE.TorusGeometry(R, 0.035, 6, 26), { matrix: cmat(0, 0.1, 0, Math.PI / 2), color: rope, rmse: RM.cloth });
    addCushion(gb, W * 0.82, W * 0.82, 0.07, true);
    const span = (Math.PI / n) * 1.6, hx = Math.cos(Math.PI / 2 + span) * R, hz = Math.sin(Math.PI / 2 + span) * R;
    door.position.set(hx, 0, hz);
    const rib = new THREE.BoxGeometry(t, 1, t);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R, ry = -a + Math.PI / 2;
      if (Math.abs(a - Math.PI / 2) < span) slat(dgb, x - hx, 0.07, H * 0.72, z - hz, ry);
      else slat(gb, x, 0.07, H * 0.72, z, ry);
      // dome ribs up to the hook
      const ax = x * 0.15, az = z * 0.15;
      _cu.set(ax - x, H * 0.28, az - z);
      const len = _cu.length();
      _cq.setFromUnitVectors(_cs.set(0, 1, 0), _cu.normalize());
      gb.add(rib, { matrix: _cm.compose(_cp.set((x + ax) / 2, H * 0.86, (z + az) / 2), _cq, _cs.set(1, len, 1)).clone(), color: wood, rmse: RM.wood });
    }
    gb.add(new THREE.TorusGeometry(0.08, 0.03, 6, 14), { matrix: cmat(0, H + 0.06, 0), color: rope, rmse: RM.cloth });
    addLatch(dgb, -hx + 0.02, H * 0.42, R - hz + 0.04, !!o.cracked);
    if (o.ribbon !== false) addBow(gb, 0, H + 0.12, 0.06, 1.2);
  } else {
    W = o.size?.[0] ?? (style === 'cart' ? 1.2 : style === 'kennel' ? 0.9 : 0.6);
    H = o.size?.[1] ?? (style === 'cart' ? 0.9 : style === 'kennel' ? 0.8 : 0.75);
    D = o.size?.[2] ?? (style === 'cart' ? 0.8 : style === 'kennel' ? 0.9 : 0.5);
    const hw = W / 2, hd = D / 2;
    gb.add(new THREE.BoxGeometry(W + 0.06, 0.07, D + 0.06), { matrix: cmat(0, 0.035, 0), color: woodD, rmse: RM.wood });
    addCushion(gb, W - 0.14, D - 0.14, 0.07);
    // roof: a solid board (kennel) or a slatted top on a rim
    if (style === 'kennel') gb.add(new THREE.BoxGeometry(W + 0.08, 0.07, D + 0.1), { matrix: cmat(0, H + 0.035, 0), color: woodD, rmse: RM.wood });
    else {
      for (const z of [-hd, hd]) gb.add(new THREE.BoxGeometry(W + 0.04, t, t), { matrix: cmat(0, H, z), color: wood, rmse: RM.wood });
      for (const x of [-hw, hw]) gb.add(new THREE.BoxGeometry(t, t, D + 0.04), { matrix: cmat(x, H, 0), color: wood, rmse: RM.wood });
      const nt = Math.max(2, Math.round(W / 0.22));
      for (let i = 1; i < nt; i++) gb.add(new THREE.BoxGeometry(C.slat, t, D), { matrix: cmat(-hw + (i / nt) * W, H, 0), color: wood, rmse: RM.wood });
    }
    // corner posts + rope lashing at the top corners
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) {
      gb.add(new THREE.BoxGeometry(0.08, H, 0.08), { matrix: cmat(x, H / 2, z), color: woodD, rmse: RM.wood });
      gb.add(new THREE.TorusGeometry(0.06, 0.03, 6, 12), { matrix: cmat(x, H - 0.08, z, Math.PI / 2), color: rope, rmse: RM.cloth });
    }
    // slats: back and sides (vertical, ≥ CARRIER.minMember thick), the front ones on the door
    const nx = Math.max(2, Math.round(W / (C.slat + C.gap))), nz = Math.max(2, Math.round(D / (C.slat + C.gap)));
    for (let i = 1; i < nx; i++) {
      const x = -hw + (i / nx) * W;
      slat(dgb, x + hw, 0.07, H - t / 2, 0);
      if (style !== 'kennel') slat(gb, x, 0.07, H - t / 2, -hd);
    }
    if (style === 'kennel') gb.add(new THREE.BoxGeometry(W, H, t), { matrix: cmat(0, H / 2, -hd), color: wood, rmse: RM.wood });
    for (let i = 1; i < nz; i++) { const z = -hd + (i / nz) * D; slat(gb, -hw, 0.07, H - t / 2, z, Math.PI / 2); slat(gb, hw, 0.07, H - t / 2, z, Math.PI / 2); }
    // door: a rail across its slats, the latch (+ lilac bow) at the free edge
    dgb.add(new THREE.BoxGeometry(W, t, t), { matrix: cmat(hw, H * 0.5, 0.02), color: woodD, rmse: RM.wood });
    addLatch(dgb, W - 0.09, H * 0.5, 0.06, !!o.cracked);
    door.position.set(-hw, 0, hd);
    if (style === 'carry') gb.add(new THREE.TorusGeometry(0.1, 0.03, 6, 14, Math.PI), { matrix: cmat(0, H + 0.03, 0), color: rope, rmse: RM.cloth });
    // a bow on top as well (the "gift" read from the iso camera)
    if (o.ribbon !== false) addBow(gb, 0.12, H + 0.06, hd - 0.04, 1.2);
  }
  group.userData.size = [W, H, D];
  if (Array.isArray(o.wheel)) addWheel(gb, o.wheel[0], o.wheel[1], o.wheel[2], o.wheel[3] ?? 0.6);
  const mat = kitMaterial();
  const body = new THREE.Mesh(gb.build(), mat); body.name = 'carrierBody'; body.castShadow = false; body.receiveShadow = true;
  group.add(body);
  const dm = new THREE.Mesh(dgb.build(), mat); dm.name = 'carrierDoorSlats'; dm.castShadow = false; door.add(dm);
  group.add(door);
  group.userData.door = door;
  group.userData.kind = 'carrier';
  group.userData.style = style;
  group.userData.cracked = !!o.cracked;
  group.userData.setOpen = (u) => { door.rotation.y = -Math.max(0, Math.min(1, u)) * 1.9; };
  return group;
}
