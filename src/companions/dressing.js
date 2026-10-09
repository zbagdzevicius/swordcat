// src/companions/dressing.js  (owner: companions) — small procedural set dressing this area builds around its actors
// (GAME_DESIGN §12.4–§12.6, §12.5 hub activity spots): the town stocks that hold Clover (D-04), the treetop rope
// posts and rope of Sage's hanging cage (D-02), the hub kittens' fishing sticks, tavern cups and butterfly.
// Every builder returns a THREE.Group whose meshes share module-level geometries / materials (no per-call shader
// compile); `disposeDressing(root)` frees only what a builder created per call (`userData.owned`).
import * as THREE from 'three';

let _mats = null;
/** Shared materials (lazy: no WebGL / allocation at import). */
export function dressingMats() {
  if (_mats) return _mats;
  const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.85, metalness: o.m ?? 0, ...(o.extra ?? {}) });
  _mats = {
    wood: m('#7A5A3E'), woodDark: m('#5A3E2B'), woodPale: m('#9C7B57'), iron: m('#4A4C52', { r: 0.45, m: 0.7 }),
    rope: m('#B89A6A', { r: 0.95 }), line: new THREE.LineBasicMaterial({ color: '#EDE6D6', transparent: true, opacity: 0.7 }),
    cup: m('#D9D2C2', { r: 0.4 }), milk: m('#FFFDF6', { r: 0.3 }), cloth: m('#B0503C'),
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
  upper.add(mesh(box(0.06, 0.07, 0.03), M.iron, hw - 0.08, 0, 0.05));                    // the padlock
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
