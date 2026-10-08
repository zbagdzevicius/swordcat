// src/physics/PhysicsDebug.js  (owner: physics) — collider overlay for ?debug / smoke screenshots (visual only).
// Yellow: static props (circles, boxes, segments; tops drawn where walkable). Magenta: rings (fog walls).
// Cyan: architecture triangles. Green / orange cylinders: actors on the ground / in the air.
// Created by Physics.setDebug(true); never built in normal play.
import * as THREE from 'three';

const SEG = 24;                 // circle segments
const MAX_ACTORS = 64;

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

  /** Per frame: actor cylinders at their interpolated positions. */
  update() {
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
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry?.dispose());
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
