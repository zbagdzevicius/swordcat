// KittenView: a buildKitten() cat bound to a core Actor (GAME_DESIGN §19.4). The drop-in visual for the player's
// Swordcat, companions, NpcActors, LostKittens and the CS-01 squires: it parents the kitten under
// `actor.object3d`, feeds it the actor's velocity / ground state, honours hitstop, pause and slow motion, follows
// core's quality preset, flips the hero cape to the looping sway in Meme Cam, and implements the ScriptedActor
// visual hooks (onPose / onEmote / onProp).
//
//   this.view = new KittenView(ctx, swordcatConfig({ cape: 'cream' }), { actor: this });   // in the actor's init()
//   this.view.bindScripted();                       // ScriptedActor pose()/emote()/prop() → the kitten
//   render(alpha, frameDt) { super.render(alpha); this.view.render(frameDt); }
//
// Animators that layer their own joint motion (run cycles, swings):
//   const dt = this.view.animate(frameDt);   // base pose + idle life (returns the visual dt it used)
//   ... multiply offsets onto this.view.rig.* quaternions ...
//   this.view.simulate();                    // cape, fur drag, eyes, bow, props
import * as THREE from 'three';
import { E } from '../core/events.js';
import { buildKitten, Kitten, PLAY_LOD } from './KittenBuilder.js';
import { catConfig } from './configs.js';
import { FUR_WIND } from './Fur.js';
import { initCharacters, characterFrame, visualDt } from './runtime.js';
import { setProxyXray, ringAnchor, XRAY } from './Readability.js';
import { READABILITY, TOP_VIEW } from './materials.js';
import { CHAR_Q } from './util.js';
import { OUTLINE, outlineAllowed, inkFor } from './Outline.js';

/** Meme Cam cape settings (GAME_DESIGN §7.8: 3.8 s loop, gust peak at 1.2 s; 0.3 s in, 0.6 s out; §5.2 cape wind ×1.6). */
export const MEME_CAPE = Object.freeze({ in: { blend: 0.3, period: 3.8, gustPeak: 1.2 }, out: { blend: 0.6 }, windMul: 1.6 });
/** Default pose blend for scripted pose() calls (seconds). */
export const POSE_BLEND = 0.3;

/**
 * Idle camera glance (the high LoL-style lens mostly sees her back): after `delay` s standing still in the calm 'idle'
 * pose she turns her head (+ a little upper body) up to `maxYaw` toward the lens (an over-the-shoulder look) with a chin lift and a head cock,
 * holds it for `hold` s, looks back ahead for `gap` s, and repeats. Additive on the final joints; any movement,
 * combat pose, scripted staging or Meme Cam cancels it at `outRate`.
 */
export const GLANCE = Object.freeze({
  delay: 2.5, hold: [2.0, 3.4], gap: [3.0, 6.0], maxYaw: THREE.MathUtils.degToRad(75), chestShare: 0.32,
  chin: -0.3, cock: 0.14, eyes: { x: 0.7, y: 0.5 }, inRate: 3.5, outRate: 10, stillSpeed: 0.15,
});

const _zero = new THREE.Vector3();
const _gp = new THREE.Vector3(), _gf = new THREE.Vector3(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gr = new THREE.Quaternion();
const _wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class KittenView {
  /**
   * @param {any} ctx game ctx (null in tools)
   * @param {object | string | Kitten} what a buildKitten config, a cat id (configs.catConfig) or a built Kitten
   * @param {{ actor?: any, parent?: THREE.Object3D, pose?: string, expression?: string, memeCam?: boolean,
   *           castShadow?: boolean, glance?: boolean, role?: 'hero'|'companion'|'npc', lod?: 'play'|'full',
   *           outline?: boolean }} [o]  memeCam: follow camera:meme; glance: idle camera glance (GLANCE); both default
   *           to true for the player. role: hero pop-out scale / outline tier (default from the actor's tags);
   *           lod: 'play' in game (the play-LOD set, ART §6.4), 'full' in tools.
   */
  constructor(ctx, what, o = {}) {
    this.ctx = ctx ?? null;
    this.actor = o.actor ?? null;
    initCharacters(this.ctx);
    let kitten = what;
    if (!(what instanceof Kitten)) {
      const cfg = typeof what === 'string' ? catConfig(what) : what;
      if (!cfg) throw new Error(`[characters] unknown cat id "${what}"`);
      kitten = buildKitten(cfg, { lod: o.lod ?? (this.ctx?.game && CHAR_Q.playLod ? 'play' : 'full') });
    }
    /** @type {Kitten} */
    this.kitten = kitten;
    kitten.view = this;
    this.root = kitten.root;
    if (o.castShadow === false) kitten.root.traverse((c) => { if (c.isMesh) c.castShadow = false; });
    const parent = o.parent ?? this.actor?.object3d ?? null;
    if (parent) parent.add(kitten.root);
    if (o.pose) kitten.setPose(o.pose, { blend: 0 });
    if (o.expression) kitten.setExpression(o.expression, true);
    this._dt = 0;
    this._meme = false;
    this._offs = [];
    // hero pop-out (WARM_ADVENTURE_SPEC §3.3): the visual root grows in the iso gameplay modes (hitboxes unchanged)
    const tags = this.actor?.tags;
    this.role = o.role ?? (tags?.has?.('player') || kitten.tier === 'hero' ? 'hero' : tags?.has?.('companion') ? 'companion' : 'npc');
    this._baseScale = kitten.root.scale.x;
    this._playK = 1;
    this._actOverride = null;
    this._frames = 0; this._idleQueued = false;
    this._outlineWant = o.outline;
    this._outlineTier = null;
    // the hero's x-ray proxy is built now (level load), not on the first occlusion mid-fight (CONTROLS_SPEC §3)
    if (this.ctx && kitten.tier === 'hero') kitten.getSilhouetteProxy();
    // shader warm-up (requests/fx.md, player.md): the first frames, then every level load and quality change
    this._warm = 2;
    if (this.ctx?.bus?.on) {
      this._offs.push(this.ctx.bus.on(E.LEVEL_LOADED, () => { this._warm = 2; }));
      this._offs.push(this.ctx.bus.on(E.QUALITY, () => { this._warm = 2; }));
    }
    const hook = this.ctx?.game?.addFrameHook?.(() => this.kitten.warmEnd());
    this._hooked = typeof hook === 'function';                     // no frame hook (tools): never warm (nothing restores)
    if (this._hooked) this._offs.push(hook);
    // idle camera glance: on by default for the player (o.glance overrides)
    this.glanceEnabled = o.glance ?? !!this.actor?.tags?.has?.('player');
    this._g = { still: 0, phase: 'wait', t: 0, w: 0, side: 1, yaw: 0, driving: false };
    const followMeme = o.memeCam ?? !!this.actor?.tags?.has?.('player');
    if (followMeme && this.ctx?.bus?.on) this._offs.push(this.ctx.bus.on(E.MEME_CAM, (p) => this.setMemeCam(!!p?.on)));
  }

  /** Duck-typing flag for characters' resolvers (Readability.resolveTarget). */
  get isKittenView() { return true; }

  /** Joint rig (KittenBuilder rig: body, hips, chest, head, shoulderL/R, ..., swordSocket, capeAnchor, bowAnchor). */
  get rig() { return this.kitten.rig; }
  /** Sword handle ({ group, tip, mid, grip, pommel, setCharge, setValorGlow }) or null. */
  get sword() { return this.kitten.sword; }

  // ------------------------------------------------------------------ per frame

  /**
   * Base pose blend + idle life + emotes for this frame. Returns the visual dt used (0 during hitstop / pause).
   * @param {number} frameDt real frame seconds (Game render's frameDt)
   * @param {{ idle?: boolean }} [o]
   */
  animate(frameDt, o = {}) {
    characterFrame(this.ctx);
    const k = this.kitten;
    // the shadow proxy (shells don't cast) only feeds the shadow pass: with shadows off (Low) skip its draw call too
    const sp = k.shadowProxy, sm = this.ctx?.renderer?.shadowMap;
    if (sp && sm) sp.visible = sm.enabled !== false && k.root.visible;
    this._dt = visualDt(this.ctx, frameDt);
    if (this.ctx) this._lodFrame(frameDt);
    k.animate(this._dt, o);
    return this._dt;
  }

  /** Per-frame LOD glue: activity tier, close-up flag, hero pop-out scale, outline tier, idle close-up build. */
  _lodFrame(frameDt) {
    const k = this.kitten, cam = this.ctx.cam;
    // activity (PERF §4.3, X13): camera's activityOf(actor) unless someone set a tier explicitly
    const act = this._actOverride ?? (this.actor && typeof cam?.activityOf === 'function' ? cam.activityOf(this.actor) | 0 : 0);
    k.setActivity(act);
    // close-up (ART §6.1): camera's cam.closeUp, else the lens hysteresis Readability computes
    if (typeof TOP_VIEW.closeUp === 'boolean') k.setCloseUp(TOP_VIEW.closeUp);
    // the full-detail close-up set builds in an idle slice after the first frames (never on the close-up frame)
    if (!this._idleQueued && k.lod === 'play' && ++this._frames >= PLAY_LOD.idleAfter) {
      this._idleQueued = true;
      const run = () => { if (this.kitten === k && !this._disposed) k.prepareCloseUp(); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
      else if (typeof setTimeout === 'function') setTimeout(run, 0);
    }
    // hero pop-out: ×1.12 hero / ×1.08 companions in the iso modes, 1.0 in cutscenes, blended over scaleBlend
    const want = this.playScaleTarget();
    if (this._playK !== want) {
      const step = Math.abs(READABILITY.playScale - 1) * (frameDt / READABILITY.scaleBlend);
      this._playK = want > this._playK ? Math.min(want, this._playK + step) : Math.max(want, this._playK - step);
      k.root.scale.setScalar(this._baseScale * this._playK);
    }
    // outline hull per QUALITY.outline (X9): hero (+ boss) always; companions on Med; everyone on High
    if (this._outlineTier !== CHAR_Q.outline) {
      this._outlineTier = CHAR_Q.outline;
      const on = this._outlineWant ?? outlineAllowed(CHAR_Q.outline, this.role);
      if (on || k.outline) {
        const hero = this.role === 'hero';
        k.setOutline(on, { px: hero ? OUTLINE.px.hero : OUTLINE.px.companion, color: hero ? OUTLINE.hero : inkFor(k.coat?.base ?? OUTLINE.ink) });
      }
    }
  }

  /** The pop-out scale this view is heading to (1 outside the iso gameplay modes and for other cats). */
  playScaleTarget() {
    if (!TOP_VIEW.iso) return 1;
    return this.role === 'hero' ? READABILITY.playScale : this.role === 'companion' ? READABILITY.playScaleCompanion : 1;
  }
  /** Current visual pop-out factor (1 = cutscene size). */
  get playScale() { return this._playK; }

  /**
   * Secondary motion after the joints are final: cape, fur drag, eyes, bow, props.
   * @param {{ velocity?: THREE.Vector3, airborne?: boolean }} [o] defaults from the actor (vel, !onGround)
   */
  simulate(o = {}) {
    const a = this.actor;
    const velocity = o.velocity ?? (a?.attachedTo ? _zero : a?.vel) ?? _zero;
    const airborne = o.airborne ?? (a ? a.onGround === false && !a.attachedTo && !a.scripted : false);
    // Meme Cam: lock the cape sway to the camera's 3.8 s loop (requests/camera.md: ctx.cam.memeT), so the cape, the
    // camera sway, the grass and the mist all repeat on the same frame (the cape adds this frame's dt itself)
    const cam = this.ctx?.cam, cape = this.kitten.cape;
    this._glance(this._dt);
    if (this._meme && cape && cam && cam.memeLooping !== false && Number.isFinite(cam.memeT)) cape.setSwayTime(cam.memeT - this._dt);
    this.kitten.simulate(this._dt, { velocity, airborne, wind: FUR_WIND.value, frameId: this.ctx?.game?.frameCount });
    if (this._warm > 0 && this._hooked !== false) { this._warm--; this.kitten.warmBegin(); }
    return this;
  }

  /** Is she in a calm, still, unscripted idle where a glance at the lens reads as charm (not as a lapse)? */
  _glanceEligible() {
    const a = this.actor, k = this.kitten;
    if (!this.glanceEnabled || !a || this._meme || !this.ctx?.camera) return false;
    if (a.scripted || a.attachedTo || a.onGround === false || a.alive === false || !k.root.visible) return false;
    if (k.poseName !== 'idle') return false;                       // player shows 'ready' when moving / in combat
    const v = a.vel;
    return !v || Math.hypot(v.x, v.z) < GLANCE.stillSpeed;
  }

  /** Additive head / upper-body turn toward the camera (GLANCE). Runs after every animator layer, before simulate. */
  _glance(dt) {
    const g = this._g, k = this.kitten, J = k.rig.joints;
    const range = (r) => r[0] + k.rnd() * (r[1] - r[0]);
    if (this._glanceEligible()) {
      g.still += dt;
      if (g.phase === 'wait') { if (g.still >= GLANCE.delay) { g.phase = 'hold'; g.t = range(GLANCE.hold); g.side = 0; } }
      else if ((g.t -= dt) <= 0) {
        if (g.phase === 'hold') { g.phase = 'gap'; g.t = range(GLANCE.gap); }
        else { g.phase = 'hold'; g.t = range(GLANCE.hold); g.side = 0; }
      }
    } else { g.still = 0; g.phase = 'wait'; }
    const on = g.phase === 'hold';
    if (on && dt > 0) {
      // camera bearing in her root frame (the root carries the actor yaw plus any whole-body spin)
      k.root.getWorldPosition(_gp);
      k.root.getWorldQuaternion(_gq);
      _gf.set(0, 0, 1).applyQuaternion(_gq);
      const cam = this.ctx.camera.position;
      let rel = _wrap(Math.atan2(cam.x - _gp.x, cam.z - _gp.z) - Math.atan2(_gf.x, _gf.z));
      // the lens straight behind her: pick a side once per glance (no flip-flopping across ±π)
      if (!g.side) g.side = Math.abs(rel) > 2.9 ? (k.rnd() < 0.5 ? -1 : 1) : Math.sign(rel) || 1;
      if (Math.abs(rel) > 2.6 && Math.sign(rel) !== g.side) rel = g.side * Math.PI;
      g.yaw = THREE.MathUtils.clamp(rel, -GLANCE.maxYaw, GLANCE.maxYaw);
    }
    const rate = on ? GLANCE.inRate : GLANCE.outRate;
    g.w += ((on ? 1 : 0) - g.w) * (1 - Math.exp(-rate * dt));
    if (g.w < 1e-3) {
      g.w = 0;
      if (g.driving) { k.eyes?.lookAt(0, 0); g.driving = false; }
      return;
    }
    // smoothstep the weight so the turn eases in and out like a deliberate look
    const w = g.w * g.w * (3 - 2 * g.w), yaw = g.yaw * w, s = Math.sign(g.yaw) || g.side || 1;
    const cs = GLANCE.chestShare;
    J.chest.quaternion.multiply(_gr.setFromEuler(_ge.set(0, yaw * cs, 0)));
    // yaw, then the chin lift and head cock in the turned head's own frame (so the face tips up toward the high lens)
    J.head.quaternion.multiply(_gr.setFromEuler(_ge.set(0, yaw * (1 - cs), 0)));
    J.head.quaternion.multiply(_gr.setFromEuler(_ge.set(GLANCE.chin * w, 0, -s * GLANCE.cock * w)));
    // pupils finish the look the head can't (lens behind her), and up toward the high camera
    const rest = Math.min(1, Math.max(0, (Math.abs(g.yaw) - 0.3) / GLANCE.maxYaw));
    k.eyes?.lookAt(s * GLANCE.eyes.x * rest * w, GLANCE.eyes.y * w);
    g.driving = true;
  }

  /**
   * animate() + simulate() for actors that only use poses (NPCs, scripted cats, lost kittens). Off-screen tiers
   * (PERF §4.3): tier 2 animates every 4th frame with the summed dt, tier 3 not at all.
   */
  render(frameDt, o = {}) {
    const k = this.kitten;
    if (k.activity >= 2) {
      const d = k.activityDt(frameDt);
      if (d === 0) { characterFrame(this.ctx); if (this.ctx) this._lodFrame(frameDt); return this; }
      frameDt = d;
    }
    this.animate(frameDt, o); return this.simulate(o);
  }

  /**
   * Activity tier override (PERF §4.3, X13; replaces the draft setOffscreen). null = follow camera's activityOf(actor).
   * @param {0|1|2|3|null} tier
   */
  setActivity(tier) { this._actOverride = tier === null || tier === undefined ? null : tier | 0; if (this._actOverride !== null) this.kitten.setActivity(this._actOverride); return this; }
  /** Close-up on / off by hand (camera normally drives it through cam.closeUp). @param {boolean} on */
  setCloseUp(on) { this.kitten.setCloseUp(on); return this; }
  /** Squash kick (ART §6.5): jump +3.5, land −2.5 × min(1, fallSpeed / 6), hit −2.0, meow +2.0. */
  squashKick(dv) { this.kitten.squashKick(dv); return this; }
  /** Squash target for this frame (gait bounce, wind-up −0.08, Holy charge −0.10, tumble −0.2; 0 = rest). */
  setSquashTarget(v) { this.kitten.squashTarget = v; return this; }
  /** Outline hull on / off by hand (null = follow QUALITY.outline). */
  setOutline(on) { this._outlineWant = on === null ? undefined : !!on; this._outlineTier = null; return this; }
  /** Feature summary for smoke / debug (Kitten.debugFeatures + view state). */
  debugFeatures() { return { ...this.kitten.debugFeatures(), role: this.role, playScale: this._playK }; }

  /** Snap secondary motion after a teleport or a camera cut. */
  snap() { this.kitten.snap(); return this; }

  // ------------------------------------------------------------------ look controls

  /** Meme Cam (§7.8): the hero cape cross-fades to the 3.8 s looping sway and back. */
  setMemeCam(on) {
    if (on === this._meme) return this;
    this._meme = on;
    this.kitten.setCapeMode(on ? 'sway' : 'verlet', on ? MEME_CAPE.in : MEME_CAPE.out);
    if (this.kitten.cape) this.kitten.cape.windMul = on ? MEME_CAPE.windMul : 1;
    return this;
  }
  setPose(name, o) { this.kitten.setPose(name, { blend: POSE_BLEND, ...o }); return this; }
  setExpression(name) { this.kitten.setExpression(name); return this; }
  setHoly(v) { this.kitten.setHoly(v); return this; }
  setFlash(v) { this.kitten.setFlash(v); return this; }
  setVisible(on) { this.kitten.root.visible = !!on; return this; }

  // ------------------------------------------------------------------ readability from above (CONTROLS_SPEC §3, §7.4)

  /**
   * The x-ray silhouette proxy: one merged skinned mesh (body, ears, bow, sword; no fur), a hidden child of the kitten
   * root. Camera's Occluders shows it (`visible`, or setXray) while she is occluded; it draws only where something
   * nearer than her hides her (depthFunc GreaterDepth with a depth pull), flat #FFE4EC at 0.55.
   * @returns {THREE.SkinnedMesh | null}
   */
  getSilhouetteProxy() { return this.kitten.getSilhouetteProxy(); }
  /**
   * Show / hide the x-ray silhouette. @param {boolean} on
   * @param {{ color?: THREE.ColorRepresentation, alpha?: number }} [o] default her pink-white at 0.55
   */
  setXray(on, o = {}) {
    const p = on ? this.getSilhouetteProxy() : this.kitten.silhouetteProxy;
    setProxyXray(p, on, { color: o.color ?? XRAY.color, alpha: o.alpha ?? XRAY.alpha });
    return this;
  }
  /** Hover / selection rim: `color` (null clears) x `strength` (§7.4: white on NPCs and kittens). */
  setHighlight(color, strength = 1) { this.kitten.setHighlight(color, strength); return this; }
  /** Ground point under her body + ring radius (hero / selection rings). @param {THREE.Vector3} [out] */
  ringAnchor(out) { return ringAnchor(this, out); }

  // ------------------------------------------------------------------ ScriptedActor visual hooks (§19.4)

  /** pose('vigil'|'oath'|'sip'|'selfie'|'faint'|'kneel'|'sit'|'sleep'|'idle', { hold }) */
  onPose(name, o = {}) { this.kitten.setPose(name, { blend: o.blend ?? POSE_BLEND }); }
  /** emote('earsFlat'|'tailPuff'|'blink'|'nod'|'shake' + 'meow'|'sneeze'|'bowBounce') */
  onEmote(name) { this.kitten.emote(name); }
  /** prop('milk_cup'|'lantern'|'spoon'|'letter'|'pot_helm', on, { at }) */
  onProp(name, on, o = {}) { this.kitten.setProp(name, on, o); }

  /**
   * Point the actor's ScriptedActor hooks (core/ScriptedActor.js) at this view, without replacing hooks the actor
   * already defines.
   * @param {any} [actor]
   */
  bindScripted(actor = this.actor) {
    if (!actor) return this;
    if (typeof actor.onPose !== 'function') actor.onPose = (n, o) => this.onPose(n, o);
    if (typeof actor.onEmote !== 'function') actor.onEmote = (n) => this.onEmote(n);
    if (typeof actor.onProp !== 'function') actor.onProp = (n, on) => this.onProp(n, on);
    return this;
  }

  dispose() {
    this._disposed = true;
    this.kitten.warmEnd();
    for (const off of this._offs.splice(0)) off();
    this.kitten.dispose();
  }
}
