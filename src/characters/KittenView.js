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
import { buildKitten, Kitten } from './KittenBuilder.js';
import { catConfig } from './configs.js';
import { FUR_WIND } from './Fur.js';
import { initCharacters, characterFrame, visualDt } from './runtime.js';
import { setProxyXray, ringAnchor, XRAY } from './Readability.js';

/** Meme Cam cape settings (GAME_DESIGN §7.8: 3.8 s loop, gust peak at 1.2 s; 0.3 s in, 0.6 s out; §5.2 cape wind ×1.6). */
export const MEME_CAPE = Object.freeze({ in: { blend: 0.3, period: 3.8, gustPeak: 1.2 }, out: { blend: 0.6 }, windMul: 1.6 });
/** Default pose blend for scripted pose() calls (seconds). */
export const POSE_BLEND = 0.3;

const _zero = new THREE.Vector3();

export class KittenView {
  /**
   * @param {any} ctx game ctx (null in tools)
   * @param {object | string | Kitten} what a buildKitten config, a cat id (configs.catConfig) or a built Kitten
   * @param {{ actor?: any, parent?: THREE.Object3D, pose?: string, expression?: string, memeCam?: boolean,
   *           castShadow?: boolean }} [o]  memeCam: follow camera:meme (default: true for the player)
   */
  constructor(ctx, what, o = {}) {
    this.ctx = ctx ?? null;
    this.actor = o.actor ?? null;
    initCharacters(this.ctx);
    let kitten = what;
    if (!(what instanceof Kitten)) {
      const cfg = typeof what === 'string' ? catConfig(what) : what;
      if (!cfg) throw new Error(`[characters] unknown cat id "${what}"`);
      kitten = buildKitten(cfg);
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
    this._dt = visualDt(this.ctx, frameDt);
    this.kitten.animate(this._dt, o);
    return this._dt;
  }

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
    if (this._meme && cape && cam && cam.memeLooping !== false && Number.isFinite(cam.memeT)) cape.setSwayTime(cam.memeT - this._dt);
    this.kitten.simulate(this._dt, { velocity, airborne, wind: FUR_WIND.value, frameId: this.ctx?.game?.frameCount });
    if (this._warm > 0 && this._hooked !== false) { this._warm--; this.kitten.warmBegin(); }
    return this;
  }

  /** animate() + simulate() for actors that only use poses (NPCs, scripted cats, lost kittens). */
  render(frameDt, o = {}) { this.animate(frameDt, o); return this.simulate(o); }

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
    this.kitten.warmEnd();
    for (const off of this._offs.splice(0)) off();
    this.kitten.dispose();
  }
}
