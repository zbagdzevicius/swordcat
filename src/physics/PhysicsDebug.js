// src/physics/PhysicsDebug.js  (owner: physics) — collider overlay for ?debug / smoke screenshots (visual only).
// Yellow: static props (circles, boxes, segments; tops drawn where walkable). Magenta: rings (fog walls).
// Cyan: architecture triangles. Green / orange cylinders: actors on the ground / in the air.
// Nav overlay (Physics.navDebug(true), CONTROLS_SPEC §5.3 `nav.debugDraw`): cells within NAV_R m of the player
// (green walkable, red blocked, blue bounce caps), automatic links are implicit; authored links in white (open) and
// closed gates in red; the last path query as an orange polyline with link arcs.
// Created by Physics.setDebug(true); never built in normal play.
import * as THREE from 'three';

const SEG = 24;                 // circle segments
const MAX_ACTORS = 64;
const NAV_R = 20;               // nav overlay half-size (m) around the player
const NAV_MAX = (2 * NAV_R / 0.5 + 2) ** 2;

export class PhysicsDebug {
  /** @param {import('./Physics.js').Physics} physics */
  constructor(physics) {
    this.physics = physics;
    this.group = new THREE.Group();
    this.group.name = 'physics:debug';
    this.group.renderOrder = 999;
    const mat = (color, opacity = 0.95) => new THREE.LineBasicMaterial({ color, fog: false, transparent: true, opacity, depthTest: true, toneMapped: false });
    this.mats = { statics: mat(0xffd84a), rings: mat(0xff4ad8), mesh: mat(0x4ae0ff, 0.6), ground: mat(0x5cff6a), air: mat(0xff9a3c) };
    this.staticLines = null; this.ringLines = null; this.meshLines = null;
    // actors: one dynamic LineSegments per state colour
    const mk = (m) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ACTORS * (SEG * 2 + 4) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const l = new THREE.LineSegments(g, m); l.frustumCulled = false; this.group.add(l); return l;
    };
    this.actorGround = mk(this.mats.ground);
    this.actorAir = mk(this.mats.air);
    physics.ctx.scene.add(this.group);
    this.navOn = false;
    this.navGroup = null;
  }

  // ------------------------------------------------------------------ nav overlay
  showNav(on) {
    this.navOn = !!on;
    if (!on) { this._disposeNav(); return; }
    this.rebuildNav();
  }
  navDirty() { if (this.navOn) this._navAt = null; }
  _disposeNav() {
    if (!this.navGroup) return;
    this.navGroup.removeFromParent();
    this.navGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.navGroup = null; this.navPts = null; this.navPath = null;
  }
  /** Rebuild the nav overlay (links and gates; cells refresh around the player in update()). */
  rebuildNav() {
    if (!this.navOn) return;
    this._disposeNav();
    const nav = this.physics.nav;
    if (!nav) return;
    const G = new THREE.Group(); G.name = 'physics:nav'; G.renderOrder = 999;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NAV_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NAV_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setDrawRange(0, 0);
    this.navPts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, fog: false, depthTest: true, toneMapped: false }));
    this.navPts.frustumCulled = false; G.add(this.navPts);
    const open = [], closed = [];
    for (const l of nav.authored) {
      const ya = this.physics.topAt(l.a[0], l.a[1]) + 0.15, yb = this.physics.topAt(l.b[0], l.b[1]) + 0.15;
      if (l.open) arc(open, l.a[0], ya, l.a[1], l.b[0], yb, l.b[1]);
      else if (l.gate) { const [a, b] = l.gate; closed.push(a[0], this.physics.topAt(a[0], a[1]) + 1.2, a[1], b[0], this.physics.topAt(b[0], b[1]) + 1.2, b[1]); }
      else arc(closed, l.a[0], ya, l.a[1], l.b[0], yb, l.b[1]);
    }
    const lines = (arr, color) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, fog: false, depthTest: false, transparent: true, toneMapped: false }));
      l.frustumCulled = false; l.renderOrder = 1000; G.add(l);
    };
    lines(open, 0xffffff); lines(closed, 0xff3030);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4096 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setDrawRange(0, 0);
    this.navPath = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xff9a3c, fog: false, depthTest: false, transparent: true, toneMapped: false }));
    this.navPath.frustumCulled = false; this.navPath.renderOrder = 1001; G.add(this.navPath);
    this.navGroup = G;
    this.group.add(G);
    this._navAt = null; this._pathRef = null;
  }
  _updateNav() {
    const nav = this.physics.nav;
    if (!this.navGroup || !nav) return;
    const pl = this.physics.ctx.player?.pos;
    const fx = pl?.x ?? 0, fz = pl?.z ?? 0;
    if (!this._navAt || Math.hypot(this._navAt[0] - fx, this._navAt[1] - fz) > 2 || this._navAt[2] !== nav.version) {
      this._navAt = [fx, fz, nav.version];
      const P = this.navPts.geometry.attributes.position, C = this.navPts.geometry.attributes.color;
      let n = 0;
      for (let z = fz - NAV_R; z <= fz + NAV_R && n < NAV_MAX; z += nav.cell) {
        for (let x = fx - NAV_R; x <= fx + NAV_R && n < NAV_MAX; x += nav.cell) {
          const k = nav.index(x, z);
          if (k < 0) continue;
          const w = nav.walkable(k);
          const y = w ? nav.h[k] : this.physics.heightAt(nav.cx(k), nav.cz(k));
          P.setXYZ(n, nav.cx(k), y + 0.06, nav.cz(k));
          if (!w) C.setXYZ(n, nav.gate[k] ? 1 : 0.9, nav.gate[k] ? 0.2 : 0.15, nav.gate[k] ? 0.9 : 0.1);
          else if (nav.bounce[k]) C.setXYZ(n, 0.25, 0.55, 1);
          else C.setXYZ(n, 0.2, 0.95, 0.35);
          n++;
        }
      }
      this.navPts.geometry.setDrawRange(0, n); P.needsUpdate = true; C.needsUpdate = true;
    }
    const path = this.physics.lastPath;
    if (path && path !== this._pathRef) {
      this._pathRef = path;
      const a = [];
      let px = path.from.x, py = (path.from.y ?? this.physics.topAt(px, path.from.z)) + 0.2, pz = path.from.z;
      for (const q of path.points) {
        if (q.link && q.to) {
          a.push(px, py, pz, q.x, q.y + 0.2, q.z);
          arc(a, q.x, q.y + 0.2, q.z, q.to.x, q.to.y + 0.2, q.to.z);
          px = q.to.x; py = q.to.y + 0.2; pz = q.to.z;
          continue;
        }
        if (Math.hypot(q.x - px, q.z - pz) > 1e-3) a.push(px, py, pz, q.x, q.y + 0.2, q.z);
        px = q.x; py = q.y + 0.2; pz = q.z;
      }
      const L = this.navPath.geometry.attributes.position, m = Math.min(a.length, L.array.length);
      L.array.set(a.slice(0, m));
      this.navPath.geometry.setDrawRange(0, m / 3); L.needsUpdate = true;
    }
  }

  /** Rebuild the static parts (after setLevel / add / remove). */
  rebuild() {
    for (const k of ['staticLines', 'ringLines', 'meshLines']) {
      const l = this[k];
      if (l) { l.removeFromParent(); l.geometry.dispose(); this[k] = null; }
    }
    const ph = this.physics, st = ph.statics, pos = [], ring = [];
    const ground = (x, z) => ph.heightAt(x, z);
    const fin = (y, x, z, d) => (Number.isFinite(y) ? y : ground(x, z) + d);
    const loop = (out, cx, cz, r, y) => {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        out.push(cx + Math.sin(a0) * r, y, cz + Math.cos(a0) * r, cx + Math.sin(a1) * r, y, cz + Math.cos(a1) * r);
      }
    };
    for (const rec of st.records) {
      const y0 = Math.max(fin(rec.y0, rec.cx, rec.cz, -0.5), ground(rec.cx, rec.cz) - 0.05);
      const y1 = Math.min(fin(rec.y1, rec.cx, rec.cz, 3), y0 + 12);
      if (rec.kind === 0) {
        loop(pos, rec.cx, rec.cz, rec.r, y0 + 0.03); loop(pos, rec.cx, rec.cz, rec.r, y1);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2, x = rec.cx + Math.sin(a) * rec.r, z = rec.cz + Math.cos(a) * rec.r; pos.push(x, y0, z, x, y1, z); }
      } else if (rec.kind === 1) {
        const c = rec.c, s = rec.s, pts = [];
        for (const [lx, lz] of [[-rec.hx, -rec.hz], [rec.hx, -rec.hz], [rec.hx, rec.hz], [-rec.hx, rec.hz]]) pts.push([rec.cx + lx * c + lz * s, rec.cz - lx * s + lz * c]);
        for (let i = 0; i < 4; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4];
          pos.push(ax, y0 + 0.03, az, bx, y0 + 0.03, bz, ax, y1, az, bx, y1, bz, ax, y0, az, ax, y1, az);
        }
      } else {
        const gy = ground(rec.cx, rec.cz);
        loop(ring, rec.cx, rec.cz, rec.r, gy + 0.3); loop(ring, rec.cx, rec.cz, rec.r, gy + 1.6);
      }
    }
    const make = (arr, m) => {
      if (!arr.length) return null;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(g, m); l.frustumCulled = false; this.group.add(l); return l;
    };
    this.staticLines = make(pos, this.mats.statics);
    this.ringLines = make(ring, this.mats.rings);
    if (ph.mesh.triangles.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(ph.mesh.edgePositions(), 3));
      this.meshLines = new THREE.LineSegments(g, this.mats.mesh); this.meshLines.frustumCulled = false; this.group.add(this.meshLines);
    }
  }

  /** Per frame: actor cylinders at their interpolated positions (and the nav overlay when on). */
  update() {
    if (this.navOn) this._updateNav();
    const list = this.physics.ctx.actors?.list ?? [];
    const ga = this.actorGround.geometry.attributes.position, aa = this.actorAir.geometry.attributes.position;
    let ng = 0, na = 0;
    const put = (attr, k, x, y, z) => { attr.array[k * 3] = x; attr.array[k * 3 + 1] = y; attr.array[k * 3 + 2] = z; };
    for (let i = 0; i < list.length && i < MAX_ACTORS; i++) {
      const a = list[i];
      if (!a?.object3d || a.alive === false) continue;
      const p = a.object3d.position, r = a.radius ?? 0.35, h = a.height ?? 1;
      const onG = !!a.onGround, attr = onG ? ga : aa;
      let k = onG ? ng : na;
      for (let s = 0; s < SEG; s++) {
        const a0 = (s / SEG) * Math.PI * 2, a1 = ((s + 1) / SEG) * Math.PI * 2;
        const x0 = p.x + Math.sin(a0) * r, z0 = p.z + Math.cos(a0) * r, x1 = p.x + Math.sin(a1) * r, z1 = p.z + Math.cos(a1) * r;
        put(attr, k++, x0, p.y + 0.02, z0); put(attr, k++, x1, p.y + 0.02, z1);
        put(attr, k++, x0, p.y + h, z0); put(attr, k++, x1, p.y + h, z1);
      }
      put(attr, k++, p.x - r, p.y, p.z); put(attr, k++, p.x - r, p.y + h, p.z);
      put(attr, k++, p.x + r, p.y, p.z); put(attr, k++, p.x + r, p.y + h, p.z);
      if (onG) ng = k; else na = k;
    }
    this.actorGround.geometry.setDrawRange(0, ng); ga.needsUpdate = true;
    this.actorAir.geometry.setDrawRange(0, na); aa.needsUpdate = true;
  }

  dispose() {
    this._disposeNav();
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry?.dispose());
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

/** A jump arc (8 segments, 0.9 m high) from a to b, pushed as line segments into `out`. */
function arc(out, ax, ay, az, bx, by, bz) {
  const N = 8;
  let px = ax, py = ay, pz = az;
  for (let i = 1; i <= N; i++) {
    const t = i / N, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t + Math.sin(Math.PI * t) * 0.9;
    out.push(px, py, pz, x, y, z);
    px = x; py = y; pz = z;
  }
}
