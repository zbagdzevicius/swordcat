// src/world/LevelKit.js  (owner: world) — M0 STUB of `defineLevel` (Appendix B.1 format → tech.md LevelData).
// Builds: a seeded rolling heightfield with the spine path, spawn and arena discs carved flat; vertex-coloured
// ground; instanced primitive props (trees, rocks, blocks) with circle colliders; spawns, anchors, arenas.
// The world agent replaces this with the full kit (zones, scatter GLBs, grass, water, fog walls, triggers).
import * as THREE from 'three';
import { Heightfield } from '../physics/Heightfield.js';
import { createRng } from '../core/rng.js';
import { Arena } from './Arena.js';

/** Per-biome stub palette + prop recipe. */
const BIOMES = {
  meadow: { ground: ['#38431C', '#6F7C43'], path: '#8A8462', rock: '#8A8D84', leaf: '#4D5C2E', trunk: '#4A3B2C', trees: 70, rocks: 45, blocks: 0 },
  forest: { ground: ['#2F4A2A', '#5E7A3C'], path: '#6B5A40', rock: '#6E7468', leaf: '#3E5A30', trunk: '#4A3B2C', trees: 170, rocks: 30, blocks: 0 },
  town:   { ground: ['#7E7A62', '#A39C84'], path: '#B9AE9A', rock: '#9A948A', leaf: '#5A6A3A', trunk: '#5A3E2B', trees: 14, rocks: 10, blocks: 46, block: '#EFE6D4', roof: '#A4553F' },
  gate:   { ground: ['#4E5244', '#7A7C68'], path: '#8E8A80', rock: '#7A7A72', leaf: '#4A5236', trunk: '#4A4038', trees: 10, rocks: 40, blocks: 14, block: '#8E8A80', roof: '#5D6670' },
  bog:    { ground: ['#34402A', '#5C6844'], path: '#6B5A40', rock: '#5E6658', leaf: '#4A4038', trunk: '#4A4038', trees: 60, rocks: 25, blocks: 0 },
  keep:   { ground: ['#3A3638', '#5A5658'], path: '#6A6668', rock: '#4A4648', leaf: '#3B3D42', trunk: '#3B3D42', trees: 0, rocks: 40, blocks: 50, block: '#4A4648', roof: '#7A1622' },
};

/** @param {object} def Appendix B level definition. Returns def + build(ctx) → LevelData. */
export function defineLevel(def) {
  return { ...def, build: (ctx) => buildLevel(ctx, def) };
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const dx = x - (ax + vx * t), dz = z - (az + vz * t), d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Build LevelData (tech.md §12.1 typedef) for a stub level. */
export async function buildLevel(ctx, def) {
  const biome = BIOMES[def.biome ?? def.id] ?? BIOMES.meadow;
  const size = def.size ?? 200, res = def.res ?? 128, half = size / 2;
  const rng = createRng(def.seed ?? 1);
  const amp = def.hills?.amp ?? 1;
  const ph = Array.from({ length: 6 }, () => rng() * Math.PI * 2);
  const spine = def.spine ?? [[0, -half + 10], [0, half - 10]];
  const pathW = def.pathWidth ?? 6;
  const flats = [];
  for (const s of Object.values(def.spawns ?? {})) flats.push([s[0], s[1], 6]);
  for (const z of def.zones ?? []) if (z.kind === 'arena') flats.push([z.at[0], z.at[1], (z.r ?? Math.max(...(z.size ?? [24, 24])) / 2) + 2]);

  const flatMask = (x, z) => {
    let m = smooth(pathW * 0.5, pathW * 0.5 + 3, distToPolyline(x, z, spine));
    for (const [fx, fz, r] of flats) m = Math.min(m, smooth(r, r + 3, Math.hypot(x - fx, z - fz)));
    return m;
  };
  const rawH = (x, z) => amp * (0.55 * Math.sin(x * 0.045 + ph[0]) * Math.cos(z * 0.05 + ph[1])
    + 0.3 * Math.sin(x * 0.11 + z * 0.07 + ph[2]) + 0.15 * Math.sin(z * 0.17 + ph[3]) * Math.cos(x * 0.13 + ph[4]));
  const hf = Heightfield.fromFunction(size, res, (x, z) => rawH(x, z) * flatMask(x, z));

  const root = new THREE.Group(); root.name = 'level:' + def.id;
  const groups = { terrain: new THREE.Group(), props: new THREE.Group(), grass: new THREE.Group() };
  for (const [k, g] of Object.entries(groups)) { g.name = k; root.add(g); }

  // ---- ground (vertex colours: two grass tones by noise, path colour along the spine) ----
  const geo = hf.toGeometry();
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(biome.ground[0]), c1 = new THREE.Color(biome.ground[1]), cp = new THREE.Color(biome.path), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = 0.5 + 0.5 * Math.sin(x * 0.21 + ph[5]) * Math.cos(z * 0.17 + ph[2]) * 0.8 + 0.1 * Math.sin(x * 1.3 + z * 0.9);
    c.copy(c0).lerp(c1, Math.max(0, Math.min(1, n)));
    const p = 1 - smooth(pathW * 0.35, pathW * 0.5 + 0.5, distToPolyline(x, z, spine));
    c.lerp(cp, p * 0.85);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true; ground.name = 'ground';
  groups.terrain.add(ground);

  // ---- props (instanced primitives) + colliders ----
  const circles = [], boxes = [];
  const keepOut = (x, z, extra) => {
    if (Math.abs(x) > half - 6 || Math.abs(z) > half - 6) return true;
    if (distToPolyline(x, z, spine) < pathW * 0.5 + extra) return true;
    for (const [fx, fz, r] of flats) if (Math.hypot(x - fx, z - fz) < r + extra * 0.5) return true;
    return false;
  };
  const place = (n, extra, fn) => {
    let tries = 0, made = 0;
    while (made < n && tries < n * 30) {
      tries++;
      const x = (rng() * 2 - 1) * (half - 6), z = (rng() * 2 - 1) * (half - 6);
      if (keepOut(x, z, extra)) continue;
      fn(x, hf.heightAt(x, z), z, made++);
    }
    return made;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const inst = (geom, color, count, opts = {}) => {
    const mesh = new THREE.InstancedMesh(geom, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.95, flatShading: true }), Math.max(1, count));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.count = 0;
    groups.props.add(mesh);
    return mesh;
  };
  const push = (mesh, x, y, z, sx, sy, sz, yaw = 0) => {
    q.setFromAxisAngle(up, yaw); m4.compose(p3.set(x, y, z), q, s3.set(sx, sy, sz));
    mesh.setMatrixAt(mesh.count++, m4);
  };

  if (biome.trees) {
    const trunks = inst(new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0), biome.trunk, biome.trees);
    const leaves = inst(new THREE.IcosahedronGeometry(1, 0), biome.leaf, biome.trees * 2);
    place(biome.trees, 8, (x, y, z) => {
      const h = 3 + rng() * 5, w = 1 + rng() * 0.6;
      push(trunks, x, y - 0.2, z, w, h * 0.55, w, rng() * 6.28);
      push(leaves, x, y + h * 0.55, z, h * 0.32, h * 0.38, h * 0.32, rng() * 6.28);
      push(leaves, x + (rng() - 0.5) * h * 0.3, y + h * 0.78, z + (rng() - 0.5) * h * 0.3, h * 0.22, h * 0.26, h * 0.22, rng() * 6.28);
      circles.push({ x, z, r: 0.35 * w, y0: y - 1, y1: y + h });
    });
  }
  if (biome.rocks) {
    const rocks = inst(new THREE.DodecahedronGeometry(1, 0), biome.rock, biome.rocks);
    place(biome.rocks, 3, (x, y, z) => {
      const tall = rng() < 0.35, r = 0.4 + rng() * 0.9;
      const sy = tall ? r * (2 + rng() * 1.5) : r * (0.6 + rng() * 0.4);
      push(rocks, x, y + sy * 0.6, z, r, sy, r * (0.7 + rng() * 0.3), rng() * 6.28);
      circles.push({ x, z, r: r * 0.85, y0: y - 1, y1: y + sy * 1.4 });
    });
  }
  if (biome.blocks) {
    const blocks = inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), biome.block, biome.blocks, { rough: 0.9 });
    const roofs = inst(new THREE.ConeGeometry(0.75, 0.6, 4).rotateY(Math.PI / 4).translate(0, 0.3, 0), biome.roof, biome.blocks);
    place(biome.blocks, 6, (x, y, z) => {
      const w = 3 + rng() * 4, d = 3 + rng() * 4, h = 3 + rng() * 4, yaw = Math.round(rng() * 4) * (Math.PI / 2);
      push(blocks, x, y - 0.3, z, w, h, d, yaw);
      push(roofs, x, y + h - 0.3, z, w * 1.05, h * 0.5, d * 1.05, yaw);
      const hw = (yaw % Math.PI === 0 ? w : d) / 2, hd = (yaw % Math.PI === 0 ? d : w) / 2;
      boxes.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y0: y - 1, y1: y + h * 1.5 });
    });
  }
  for (const m of groups.props.children) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }

  // ---- spawns, anchors, arenas ----
  const spawns = {};
  for (const [id, s] of Object.entries(def.spawns ?? {})) spawns[id] = { pos: new THREE.Vector3(s[0], hf.heightAt(s[0], s[1]), s[1]), facing: s[2] ?? 0 };
  if (!spawns.start) spawns.start = { pos: new THREE.Vector3(spine[0][0], hf.heightAt(spine[0][0], spine[0][1]), spine[0][1]), facing: 0 };
  const anchors = {};
  for (const [id, a] of Object.entries(def.anchors ?? {})) anchors[id] = { pos: new THREE.Vector3(a[0], a[2] ?? hf.heightAt(a[0], a[1]), a[1]), facing: a[3] ?? 0 };
  for (let i = 0; i < 8; i++) {          // §12.1: fog_edge_0..7 on the bounds, inset 6 m, 45° steps
    const a = (i / 8) * Math.PI * 2, r = half - 6, x = Math.max(-r, Math.min(r, Math.sin(a) * r * 1.5)), z = Math.max(-r, Math.min(r, Math.cos(a) * r * 1.5));
    anchors['fog_edge_' + i] = { pos: new THREE.Vector3(x, hf.heightAt(x, z), z), facing: a + Math.PI };
  }
  const arenas = (def.zones ?? []).filter((z) => z.kind === 'arena').map((z) => new Arena(ctx, z, (x, zz) => hf.heightAt(x, zz)));

  root.traverse((o) => { o.userData.owned = true; });

  return {
    id: def.id, root, groups, heightfield: hf,
    colliders: { circles, boxes }, octreeMeshes: [],
    spawns, anchors, arenas,
    enemySpawns: [], npcs: [], triggers: [],
    env: def.env ?? { default: 'meadow_day' }, music: def.music ?? null,
    bounds: { min: new THREE.Vector2(-half + 2, -half + 2), max: new THREE.Vector2(half - 2, half - 2) },
    update(dt) { for (const a of arenas) a.update(dt); },
    dispose() {},
  };
}
