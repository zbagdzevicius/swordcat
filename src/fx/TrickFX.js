// src/fx/TrickFX.js  (owner: fx, TT3 package A) — the Paw Trick visuals (docs/TOKENTAILS-PLAN.md §11.3). Driven by
// player.tricks (PawTricks) from Player.render; visual only, never touches the simulation.
//   ":3" Coin Toss   a spinning gold ":3" coin (the Token Tails coin), a gold sparkle trail and a short streak
//   Ribbon Twirl     two thin pink swish arcs around her spinning bow rotor, pink petals / hearts while she glides
//   Catnip Cloud     the lilac pouch in flight, then a soft lilac dome with puffs, little hearts, "z" and "♪" icons
//   aim              a dotted gold line (coin) or the lilac landing ring (cloud) while the trick button is held
// Particles go through ctx.fx.burst (the shared pooled particles); the few meshes here are built once on first use and
// hidden when idle (no draw calls). No allocation per frame.
import * as THREE from 'three';

const PAL = Object.freeze({
  gold: '#FFD34D', goldDeep: '#C8902A', goldRim: '#A87C32', ink: '#5A3A14', sparkle: '#FFF1C4',
  pink: '#F2A2B8', pinkDeep: '#D9668A', petal: '#FFC2D6',
  lilac: '#C9A8F0', lilacDeep: '#9A88C9', lilacHi: '#F0C5FD', leaf: '#7FD66B',
});
const DOTS = 14;
/** TT4 coin look: radius (m; her head is ~0.5 m wide) and the halo sprite size (m). */
const COIN_FX = Object.freeze({ r: 0.16, halo: 0.62 });
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** TT4 twirl swish arcs: radius (m) around the bow rotor. */
const TWIRL_FX = Object.freeze({ r: 0.2 });
/** fx.burst option bags (reused: no allocation per frame) */
const B_TRAIL = Object.freeze({ count: 1, color: PAL.gold, scale: 0.6 });
const B_PUFF = Object.freeze({ count: 2, color: PAL.lilac, scale: 1.2 });
const B_HEART = Object.freeze({ count: 1, color: PAL.petal, scale: 0.8 });
const B_PETAL = Object.freeze({ count: 1, color: PAL.petal, scale: 0.7 });
const B_PINK = Object.freeze({ count: 1, color: PAL.pink, scale: 0.7 });

/** The ":3" coin face (Token Tails coin): gold disc, darker rim, ink ":3". Browser only. */
function coinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(52, 48, 6, 64, 64, 64);
  grd.addColorStop(0, '#FFF3B0'); grd.addColorStop(0.55, PAL.gold); grd.addColorStop(1, PAL.goldDeep);
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.lineWidth = 7; g.strokeStyle = PAL.goldRim; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = PAL.ink; g.font = 'bold 58px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(':3', 66, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round gold glow (additive halo behind the coin). Browser only. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,180,1)'); grd.addColorStop(0.35, 'rgba(255,211,77,0.55)'); grd.addColorStop(1, 'rgba(255,211,77,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A small glyph sprite texture ("z", "♪", a heart) in lilac ink. Browser only. */
function glyphTexture(ch, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.strokeText(ch, 32, 34);
  g.fillStyle = color; g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TrickFX {
  /** @param {any} ctx @param {import('../player/tricks/PawTricks.js').PawTricks} tricks */
  constructor(ctx, tricks) {
    this.ctx = ctx; this.tricks = tricks;
    this.root = new THREE.Group();
    this.root.name = 'trickfx';
    this.root.userData.perfCat = 'fx';
    ctx.scene?.add(this.root);
    this.built = false;
    this._t = 0; this._trailT = 0; this._cloudT = 0; this._petalT = 0;
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this.stats = { frames: 0 };
  }

  _build() {
    if (this.built) return;
    this.built = true;
    const owned = (o) => { o.userData.owned = true; return o; };
    // ---- the coin: a thick little disc, ":3" on both faces, gold rim
    const tex = coinTexture();
    const face = owned(new THREE.MeshBasicMaterial({ map: tex, color: '#FFFFFF' }));
    const rim = owned(new THREE.MeshBasicMaterial({ color: PAL.goldDeep }));
    const coinGeo = new THREE.CylinderGeometry(COIN_FX.r, COIN_FX.r, 0.045, 28, 1).rotateX(Math.PI / 2);   // faces along ±Z
    this.coin = new THREE.Mesh(coinGeo, [rim, face, face]);
    this.coin.name = 'trick:coin';
    this.coin.visible = false; this.coin.renderOrder = 4;
    this.root.add(this.coin);
    // a soft gold glow behind it so the coin reads at phone size against grass and stone
    this.halo = new THREE.Sprite(owned(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })));
    this.halo.visible = false; this.halo.renderOrder = 3; this.halo.scale.setScalar(COIN_FX.halo);
    this.root.add(this.halo);
    // the streak behind it: a stretched additive quad, always facing up-ish
    const streakMat = owned(new THREE.MeshBasicMaterial({ color: PAL.sparkle, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12).translate(-0.5, 0, 0), streakMat);
    this.streak.visible = false; this.streak.rotation.order = 'YXZ';
    this.root.add(this.streak);
    // ---- the aim: dotted line (coin) + landing ring (cloud)
    const dotMat = owned(new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.11, 12).rotateX(-Math.PI / 2), dotMat, DOTS);
    this.dots.name = 'trick:aim'; this.dots.count = 0; this.dots.frustumCulled = false; this.dots.visible = false; this.dots.renderOrder = 3;
    this.root.add(this.dots);
    const ringMat = owned(new THREE.MeshBasicMaterial({ color: PAL.lilac, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40).rotateX(-Math.PI / 2), ringMat);
    this.ring.visible = false; this.ring.renderOrder = 3;
    this.root.add(this.ring);
    // ---- the pouch: a lilac bag with a green tie
    const pouchMat = owned(new THREE.MeshLambertMaterial({ color: PAL.lilac, emissive: new THREE.Color(PAL.lilacDeep), emissiveIntensity: 0.35 }));
    const tieMat = owned(new THREE.MeshLambertMaterial({ color: PAL.leaf }));
    this.pouch = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), pouchMat); bag.scale.set(1, 0.9, 1);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12).rotateX(Math.PI / 2), tieMat); tie.position.y = 0.13;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 8), pouchMat); tuft.position.y = 0.2;
    this.pouch.add(bag, tie, tuft);
    this.pouch.visible = false;
    this.root.add(this.pouch);
    // ---- the cloud: a soft lilac dome + a rim ring + glyph sprites
    const domeMat = owned(new THREE.MeshBasicMaterial({ color: PAL.lilac, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    this.dome.visible = false; this.dome.renderOrder = 2;
    this.root.add(this.dome);
    // TT4: a bolder rim (the reach of the cloud must read at a glance next to a hyena's big jeer wave)
    const rimMat = owned(new THREE.MeshBasicMaterial({ color: PAL.lilacDeep, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.cloudRim = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48).rotateX(-Math.PI / 2), rimMat);
    this.cloudRim.renderOrder = 3;
    this.cloudRim.visible = false;
    this.root.add(this.cloudRim);
    this.glyphs = [];
    const gz = glyphTexture('z', PAL.lilacDeep), gn = glyphTexture('♪', PAL.pinkDeep), gh = glyphTexture('♥', PAL.pinkDeep);
    const texs = [gz, gn, gh, gz, gn, gh];
    for (let i = 0; i < texs.length; i++) {
      const m = owned(new THREE.SpriteMaterial({ map: texs[i], transparent: true, depthWrite: false, fog: false }));
      const s = new THREE.Sprite(m);
      s.visible = false; s.renderOrder = 6; s.scale.setScalar(0.38);
      this.root.add(s);
      this.glyphs.push(s);
    }
    // ---- the twirl: two thin pink swish arcs around her spinning bow (TT4: centred on the bow itself, small, so the
    // bow reads as the propeller; they were a big disc a head above her)
    const ribMat = owned(new THREE.MeshBasicMaterial({ color: PAL.pink, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    const ribDeep = owned(new THREE.MeshBasicMaterial({ color: PAL.pinkDeep, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.ribbons = new THREE.Group();
    const loopGeo = new THREE.TorusGeometry(TWIRL_FX.r, 0.012, 5, 24, Math.PI * 0.9);
    const l1 = new THREE.Mesh(loopGeo, ribMat); l1.rotation.x = Math.PI / 2;
    const l2 = new THREE.Mesh(loopGeo, ribDeep); l2.rotation.x = Math.PI / 2; l2.rotation.z = Math.PI;
    this.ribbons.add(l1, l2);
    this.ribbons.visible = false;
    this.root.add(this.ribbons);
  }

  _burst(kind, pos, opts) {
    try { this.ctx.fx?.burst?.(kind, pos, opts); } catch { /* fx optional */ }
  }

  render(alpha, frameDt) {
    const tr = this.tricks, p = tr.player;
    const busy = tr.coin.active || tr.cloudSim.active || tr.aim.on || p.state === 'twirl' || this.ribbons?.visible;
    if (!busy && !this.built) return;
    this._build();
    this.stats.frames++;
    const g = this.ctx.game, dt = g?.hitstopT > 0 || g?.mode === 'menu' ? 0 : (frameDt ?? 0);
    this._t += dt;
    this._coin(alpha, dt);
    this._aim();
    this._cloud(dt);
    this._twirl(dt);
  }

  _coin(alpha, dt) {
    const c = this.tricks.coin, m = this.coin, s = this.streak;
    if (!c.active) { m.visible = false; s.visible = false; this.halo.visible = false; return; }
    const v = this._v.lerpVectors(c.prev, c.pos, Math.max(0, Math.min(1, alpha ?? 1)));
    m.visible = true; this.halo.visible = true;
    m.position.copy(v); this.halo.position.copy(v);
    // the ":3" face turned to the camera, rocking ±50° like a tossed coin (never edge-on: it reads at phone size)
    const cam = this.ctx.camera;
    if (cam) m.lookAt(cam.position);
    m.rotateY(Math.sin(c.spin * 0.55) * 0.9);
    m.rotateZ(Math.sin(c.spin * 0.21) * 0.25);
    // TT4: small and halo-less beside her (the glow tinted her crimson eyes amber); full size once it is away
    const p = this.tricks.player, d = Math.hypot(v.x - p.pos.x, v.z - p.pos.z);
    m.scale.setScalar(0.45 + 0.55 * smooth(0.3, 0.9, d));
    this.halo.scale.setScalar(COIN_FX.halo * (0.9 + 0.12 * Math.sin(this._t * 18)));
    this.halo.material.opacity = smooth(0.7, 1.5, d);
    const sp = Math.hypot(c.vel.x, c.vel.z);
    s.visible = sp > 2;
    if (s.visible) {
      s.position.copy(v);
      s.rotation.set(-Math.PI / 2, Math.atan2(c.vel.x, c.vel.z) - Math.PI / 2, 0, 'YXZ');
      s.scale.set(Math.min(1.4, sp * 0.06), 1, 1);
    }
    if ((this._trailT -= dt) <= 0) { this._trailT = 0.045; this._burst('sparkle', v, B_TRAIL); }
  }

  _aim() {
    const a = this.tricks.aim, p = this.tricks.player, d = this.dots, r = this.ring;
    if (!a.on) { d.visible = false; r.visible = false; return; }
    const y = p.pos.y + 0.05;
    const len = a.id === 'cloud' ? Math.hypot(a.point.x - p.pos.x, a.point.z - p.pos.z) : (a.len || 8);
    // the landing ring: the cloud's 2.5 m, or a small gold ring where the coin turns back
    r.visible = true;
    const ex = a.id === 'cloud' ? a.point.x : p.pos.x + a.dir.x * len, ez = a.id === 'cloud' ? a.point.z : p.pos.z + a.dir.z * len;
    const ey = this.ctx.physics?.heightAt?.(ex, ez);
    r.position.set(ex, (Number.isFinite(ey) ? ey : y) + 0.06, ez);
    if (a.id === 'cloud') { r.scale.setScalar(2.5); r.material.color.set(PAL.lilac); }
    else { r.scale.setScalar(0.45); r.material.color.set(PAL.gold); }
    r.material.opacity = 0.45 + 0.2 * Math.sin(this._t * 6);
    const n = Math.max(2, Math.min(DOTS, Math.round(len / 0.6)));
    d.count = n; d.visible = true;
    const off = (this._t * 1.6) % 1;
    for (let i = 0; i < n; i++) {
      const u = (i + off) / n, k = 0.8 + 0.4 * (1 - u);
      this._s.setScalar(k);
      const x = p.pos.x + a.dir.x * len * u, z = p.pos.z + a.dir.z * len * u, gy = this.ctx.physics?.heightAt?.(x, z);
      this._m.compose(this._v.set(x, (Number.isFinite(gy) ? Math.max(gy, y - 0.6) : y) + 0.06, z), this._q, this._s);
      d.setMatrixAt(i, this._m);
    }
    d.instanceMatrix.needsUpdate = true;
    d.material.color.set(a.id === 'cloud' ? PAL.lilacHi : PAL.gold);
  }

  _cloud(dt) {
    const cs = this.tricks.cloudSim, pc = cs.pouch, c = cs.cloud;
    this.pouch.visible = !!pc;
    if (pc) { this.pouch.position.copy(pc.pos); this.pouch.rotation.y += dt * 8; this.pouch.rotation.z = Math.sin(this._t * 9) * 0.4; }
    const on = !!c;
    this.dome.visible = on; this.cloudRim.visible = on;
    for (const s of this.glyphs) s.visible = on;
    if (!on) return;
    const R = 2.5, u = Math.min(1, c.t / 0.25), fade = Math.min(1, Math.max(0, (c.dur - c.t) / 0.4));
    const k = (0.4 + 0.6 * u) * R;
    this.dome.position.copy(c.pos); this.dome.scale.set(k, k * 0.42 * (1 + 0.04 * Math.sin(this._t * 3)), k);
    this.dome.material.opacity = 0.22 * fade;
    this.cloudRim.position.set(c.pos.x, c.pos.y + 0.04, c.pos.z); this.cloudRim.scale.setScalar(k);
    this.cloudRim.material.opacity = 0.8 * fade;
    for (let i = 0; i < this.glyphs.length; i++) {
      const s = this.glyphs[i], a = this._t * 0.8 + (i / this.glyphs.length) * Math.PI * 2, rr = R * (0.35 + 0.35 * ((i * 37) % 10) / 10);
      const rise = ((this._t * 0.5 + i * 0.37) % 1);
      s.position.set(c.pos.x + Math.sin(a) * rr, c.pos.y + 0.6 + rise * 1.4, c.pos.z + Math.cos(a) * rr);
      s.material.opacity = fade * Math.sin(rise * Math.PI);
    }
    if ((this._cloudT -= dt) <= 0 && fade > 0.2) {
      this._cloudT = 0.12;
      const a = this._t * 5.3, rr = R * 0.7 * ((this._t * 13.7) % 1);
      this._v.set(c.pos.x + Math.sin(a) * rr, c.pos.y + 0.3, c.pos.z + Math.cos(a) * rr);
      this._burst('smoke', this._v, B_PUFF);
      if (((this._t * 7) % 1) < 0.35) this._burst('hearts', this._v, B_HEART);
    }
  }

  _twirl(dt) {
    const p = this.tricks.player, on = p.state === 'twirl';
    const rb = this.ribbons;
    if (!on) { rb.visible = false; return; }
    rb.visible = true;
    const bow = p.model?.k?.bow;
    if (bow?.parent) { bow.updateWorldMatrix(true, false); bow.getWorldPosition(rb.position); }
    else rb.position.set(p.object3d.position.x, p.object3d.position.y + (p.height ?? 1) * 0.95, p.object3d.position.z);
    rb.rotation.y += dt * 18;
    const sq = 1 + 0.08 * Math.sin(this._t * 20);
    rb.scale.set(sq, 1, sq);
    if ((this._petalT -= dt) <= 0) {
      this._petalT = 0.09;
      this._v.set(p.pos.x + Math.sin(this._t * 11) * 0.35, p.pos.y + 1.1, p.pos.z + Math.cos(this._t * 11) * 0.35);
      const heart = ((this._t * 10) % 1) < 0.5;
      this._burst(heart ? 'hearts' : 'sparkle', this._v, heart ? B_PETAL : B_PINK);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) for (const x of m) { x.map?.dispose?.(); x.dispose?.(); } else if (m) { m.map?.dispose?.(); m.dispose?.(); }
    });
    this.root.removeFromParent();
  }
}
