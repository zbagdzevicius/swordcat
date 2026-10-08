// src/companions/ShieldWall.js  (owner: companions) — Mochi's Shield Wall (GAME_DESIGN §9.2, COMPANIONS.mochi):
// a 3.0 m × 1.6 m barrier for 4.0 s, planted 1.5 m in front of Swordcat facing her camera-forward. It
//   - blocks every enemy projectile and melee hit that reaches it: the wall is a row of fixed, hurtable `ally`
//     post actors whose resolveIncoming() answers 'block' (Combat then emits the blocked HIT, sparks and sound);
//   - staggers melee attackers that strike it for COMPANIONS.mochi.staggerAttacker s;
//   - physically stops walkers (the posts are `fixed`, so physics.separateActors pushes others out);
//   - answers `between(a, b)` so Combat can redirect hits that cross it (CompanionManager.wallBetween).
// The visual is a translucent blue energy pane with a hex shimmer, edge glow, rise/fade and hit ripples.
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { COMPANIONS } from '../core/config.js';
import { segmentHit, wallSide } from './steering.js';

const POST_SPACING = 0.5, POST_R = 0.3;

/** One collision post of the wall (not rendered; the wall draws one pane). */
export class WallPost extends Actor {
  constructor(ctx, wall, x, y, z) {
    super(ctx, { faction: 'ally', radius: POST_R, height: wall.height, maxHp: 1e6, mass: 100, maxPoise: 1e6 });
    this.wall = wall;
    this.fixed = true;
    this.home = new THREE.Vector3(x, y, z);
    this.pos.copy(this.home);
    this.facing = wall.yaw;
    this.tags.add('shieldWall');
    this.object3d.name = 'shieldWallPost';
    this.snap();
  }

  /** Combat hook: everything that reaches the wall is blocked. */
  resolveIncoming(att, def, dir) { return this.wall.struck(att, def, this); }

  /** Keep the post planted (Combat's block push and separation must not move it). */
  hold() { this.pos.copy(this.home); this.vel.set(0, 0, 0); this.hp = this.maxHp; this.invulnT = 0; this.staggerT = 0; this.poise = this.maxPoise; }

  onHit() { this.hold(); }
  onDeath() { this.alive = true; this.hold(); }
  render() {}
}

let _mat = null;
function paneMaterial() {
  if (_mat) return _mat.clone();
  _mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: {
      uTime: { value: 0 }, uRise: { value: 0 }, uAlpha: { value: 1 }, uW: { value: 3 }, uH: { value: 1.6 },
      uColor: { value: new THREE.Color('#5E95E8') }, uEdge: { value: new THREE.Color('#BFD8FF') },
      uHits: { value: [new THREE.Vector4(0, 0, -10, 0), new THREE.Vector4(0, 0, -10, 0), new THREE.Vector4(0, 0, -10, 0), new THREE.Vector4(0, 0, -10, 0)] },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vLocal;
      void main() { vUv = uv; vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uRise, uAlpha, uW, uH; uniform vec3 uColor, uEdge; uniform vec4 uHits[4];
      varying vec2 vUv; varying vec3 vLocal;
      float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
      void main() {
        float y = vUv.y;
        if (y > uRise) discard;
        vec2 p = vec2(vLocal.x, vLocal.y) * 4.2;
        vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
        vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        float hex = smoothstep(0.42, 0.5, hexDist(g));                     // cell borders
        float edgeX = smoothstep(0.42, 0.5, abs(vUv.x - 0.5));
        float top = smoothstep(uRise - 0.08, uRise, y);
        float base = smoothstep(0.12, 0.0, y);
        float scan = 0.5 + 0.5 * sin(y * 40.0 - uTime * 6.0);
        float rip = 0.0;
        for (int i = 0; i < 4; i++) {
          float age = uTime - uHits[i].z;
          if (age < 0.0 || age > 0.6) continue;
          float d = length(vec2(vLocal.x - uHits[i].x, vLocal.y - uHits[i].y));
          rip += smoothstep(0.12, 0.0, abs(d - age * 2.6)) * (1.0 - age / 0.6) * 1.6;
        }
        float fadeTop = 1.0 - smoothstep(0.75, 1.0, y) * 0.6;
        float a1 = (0.10 + 0.22 * hex * (0.7 + 0.3 * scan) + 0.55 * edgeX + 0.6 * top + 0.35 * base) * fadeTop + rip;
        vec3 col = mix(uColor, uEdge, clamp(edgeX + top + rip * 0.6, 0.0, 1.0));
        gl_FragColor = vec4(col * max(a1, 0.0) * uAlpha * 0.9, 1.0);
      }`,
  });
  return _mat.clone();
}

export class ShieldWall {
  /**
   * @param {any} ctx
   * @param {{ center: THREE.Vector3, yaw: number, owner?: any, width?: number, height?: number, dur?: number }} o
   */
  constructor(ctx, { center, yaw, owner = null, width = COMPANIONS.mochi.width, height = COMPANIONS.mochi.height, dur = COMPANIONS.mochi.dur }) {
    this.ctx = ctx; this.owner = owner;
    this.width = width; this.height = height; this.dur = dur;
    this.yaw = yaw;
    this.center = center.clone();
    this.nx = Math.sin(yaw); this.nz = Math.cos(yaw);                 // outward normal (toward enemies)
    this.tx = Math.cos(yaw); this.tz = -Math.sin(yaw);                // along the wall
    this.t = 0; this.alive = true; this.fadeT = -1; this.hits = 0; this._hitI = 0;
    this.posts = [];
    const n = Math.max(3, Math.round(width / POST_SPACING) + 1);
    for (let i = 0; i < n; i++) {
      const s = -width / 2 + (width * i) / (n - 1);
      const x = center.x + this.tx * s, z = center.z + this.tz * s;
      const y = ctx.physics?.heightAt?.(x, z) ?? center.y;
      this.posts.push(new WallPost(ctx, this, x, y, z));
    }
    this.mesh = null;
    if (ctx.scene) this._buildMesh();
  }

  _buildMesh() {
    const g = new THREE.Group(); g.name = 'shieldWall';
    const geo = new THREE.PlaneGeometry(this.width, this.height, 24, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {                             // gentle outward bow
      const x = pos.getX(i);
      pos.setZ(i, 0.18 * (1 - (2 * x / this.width) ** 2));
      pos.setY(i, pos.getY(i) + this.height / 2);
    }
    geo.computeVertexNormals();
    const mat = paneMaterial();
    mat.uniforms.uW.value = this.width; mat.uniforms.uH.value = this.height;
    const pane = new THREE.Mesh(geo, mat); pane.renderOrder = 5; pane.frustumCulled = false;
    const sg = new THREE.PlaneGeometry(this.width + 0.4, 0.5).rotateX(-Math.PI / 2);
    const smat = new THREE.MeshBasicMaterial({ color: '#6FA8FF', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    const strip = new THREE.Mesh(sg, smat); strip.position.y = 0.03; strip.position.z = 0.05;
    g.add(pane, strip);
    g.position.copy(this.center); g.rotation.y = this.yaw;
    this.pane = pane; this.strip = strip;
    this.mesh = g;
  }

  /** Register the posts and show the pane. */
  start() {
    for (const p of this.posts) this.ctx.actors.register(p);
    if (this.mesh) this.ctx.scene.add(this.mesh);
  }

  /** Called by a post's resolveIncoming(): ripple, stagger melee attackers, always 'block'. */
  struck(att, def, post) {
    if (!this.alive) return 'immune';
    this.hits++;
    if (this.pane) {
      const lx = (post.pos.x - this.center.x) * this.tx + (post.pos.z - this.center.z) * this.tz;
      const hy = def?.projectile || att?.isProjectile ? (att?.pos?.y ?? post.pos.y + 0.8) - post.pos.y : 0.8;
      const h = this.pane.material.uniforms.uHits.value[this._hitI++ % 4];
      h.set(lx, Math.max(0.1, Math.min(this.height - 0.1, hy)), this.t, 0);
    }
    if (att && !att.isProjectile && att.faction === 'enemy' && att.alive) {
      const s = COMPANIONS.mochi.staggerAttacker;
      if (typeof att.stagger === 'function') att.stagger(s); else att.staggerT = Math.max(att.staggerT ?? 0, s);
    }
    return 'block';
  }

  /** Does the XZ segment a → b cross the wall (and come from the outside)? */
  between(ax, az, bx, bz) {
    if (!this.alive) return false;
    const hw = this.width / 2 + POST_R;
    const x0 = this.center.x - this.tx * hw, z0 = this.center.z - this.tz * hw;
    const x1 = this.center.x + this.tx * hw, z1 = this.center.z + this.tz * hw;
    if (segmentHit(ax, az, bx, bz, x0, z0, x1, z1) < 0) return false;
    return wallSide(ax, az, this.center.x, this.center.z, this.nx, this.nz) > 0;
  }

  /** Point on the protected side? (behind the wall) */
  behind(x, z) { return wallSide(x, z, this.center.x, this.center.z, this.nx, this.nz) < 0; }

  /** Fixed step. Returns false once the wall has fully faded (the manager drops it). */
  update(dt) {
    this.t += dt;
    if (this.alive) {
      for (const p of this.posts) p.hold();
      if (this.t >= this.dur) this.end();
    }
    if (this.fadeT >= 0) { this.fadeT += dt; if (this.fadeT >= 0.35) { this.dispose(); return false; } }
    return true;
  }

  /** Visual only. */
  render(frameDt) {
    if (!this.pane) return;
    const u = this.pane.material.uniforms;
    u.uTime.value = this.t;
    u.uRise.value = Math.min(1.02, this.t / 0.22);
    const life = this.alive ? 1 : Math.max(0, 1 - this.fadeT / 0.35);
    const warn = this.alive && this.dur - this.t < 0.8 ? 0.65 + 0.35 * Math.cos((this.dur - this.t) * 28) : 1;   // flicker before it drops
    u.uAlpha.value = life * warn;
    this.strip.material.opacity = 0.35 * life * warn;
  }

  /** Drop the posts now; the pane fades for 0.35 s. */
  end() {
    if (!this.alive) return;
    this.alive = false; this.fadeT = 0;
    for (const p of this.posts) { p.alive = false; p.hurtable = false; this.ctx.actors.unregister(p); }
  }

  dispose() {
    this.end();
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.pane.geometry.dispose(); this.pane.material.dispose();
      this.strip.geometry.dispose(); this.strip.material.dispose();
      this.mesh = null; this.pane = null;
    }
  }
}
