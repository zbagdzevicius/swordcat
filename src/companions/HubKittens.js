// src/companions/HubKittens.js  (owner: companions) — Pawsbury as the hub (GAME_DESIGN §12.5 "Kitten activity spots",
// §3.4 service kittens, §6.4 / §6.5 hub lines). In `town` once `town.free` is set:
//   • every rescued lost kitten lives at its fixed activity spot doing its little thing (fishing on the fountain rim,
//     napping in the sun, playing tag round the square, chasing a butterfly, knocking a cup off the tavern table...);
//   • seeded villager kittens fill the rest, up to 20 residents on screen (12 on Low);
//   • the station keepers (Marmalade, Tofu, Earl Grey, Pip, Pearl, Snowpaw, Coo) stand at their stalls once their
//     flag opens them, unless world's Hub already placed them;
//   • walking up to a resident shows its line in a bubble (the kitten's §6.4 rescue line, a §6.5 hub line);
//   • iso controls (CONTROLS_SPEC §7.6, §14 `tut.talk`): click / tap a resident (or [Interact] next to it) to hear its
//     line now: residents are 'npc' pickables and, clear of world's interactables, a `talk_<id>` level interactable
//     (prompt.talk); a station keeper stands for its station (`interactId`: a click opens the shop);
//   • distance LOD measured from the camera focus (§2.8), not from her.
// HubKittens is driven by CompanionManager (enter() on `level:loaded`, update / render each step, leave() on unload);
// the residents are NpcActors registered in ctx.actors (`<kittenId>`, `villager_hub_<i>`, station ids).
import * as THREE from 'three';
import { KITTEN_IDS, LEVEL_IDS, KITTENS_BY_LEVEL } from '../core/config.js';
import { damp, dampAngle } from '../core/math.js';
import { lostKittenConfig, villagerConfig } from '../characters/index.js';
import { NpcActor } from './NpcActor.js';
import { BarkGate, groundY, lodOrigin } from './steering.js';
import { lineText } from './lines.js';
import { buildFishingStick, buildCup, buildTable, buildButterfly, disposeDressing } from './dressing.js';

const FOUNTAIN = [0, 8];
/** Behaviours that keep their spot (seated, napping, perched): no physics, no drifting. */
const PINNED = new Set(['fish', 'nap', 'read', 'sit', 'sort', 'stareUp', 'guard', 'copyVigil', 'cupKnock']);
const toCentre = (x, z, c = FOUNTAIN) => Math.atan2(c[0] - x, c[1] - z);

/**
 * §12.5 activity spots. `y` = perch height above the ground (balcony, statue top, bell-tower ledge); `beh` the
 * behaviour; `facing` the home facing (radians, atan2(x, z)).
 */
export const HUB_SPOTS = Object.freeze({
  biscuit: { at: [3.5, 8], beh: 'fish', facing: toCentre(3.5, 8), y: 0.55 },
  noodle: { at: [-4, -36], beh: 'sit', facing: Math.PI / 2 },
  button: { at: [0, 36], beh: 'copyVigil', facing: Math.PI },
  pickles: { at: [-24, -16], beh: 'nap', facing: Math.PI / 2 },
  pebble: { at: [-3.5, 8], beh: 'fish', facing: toCentre(-3.5, 8), y: 0.55 },
  sprout: { at: [14, 20], beh: 'cupKnock', facing: -Math.PI / 2 },
  waffles: { at: [5, -30], beh: 'wave', facing: Math.PI, y: 3.0 },
  toffee: { at: [0, 8], beh: 'guard', facing: Math.PI, y: 2.5 },
  muffin: { at: [0, 50.5], beh: 'stareUp', facing: 0, y: 6.0 },
  tater: { at: [8, 8], beh: 'tag', phase: 0 },
  mittens: { at: [-8, 8], beh: 'tag', phase: Math.PI },
  socks: { at: [2, 36], beh: 'nap', facing: Math.PI },
  juniper: { at: [-10, 26], beh: 'read', facing: 2.2 },
  bramble: { at: [12, 14], beh: 'butterfly', facing: 0 },
  fennel: { at: [-2, 36], beh: 'nap', facing: Math.PI },
  bean: { at: [28, -12], beh: 'tools', facing: -Math.PI / 2 },
  crumpet: { at: [-34, 6], beh: 'sort', facing: Math.PI / 2 },
  dumpling: { at: [8.8, -2.6], beh: 'guard', facing: Math.PI },
});

/** Villager spots (around the square and the main street, clear of stations and spots). [x, z, behaviour, facing] */
export const VILLAGER_SPOTS = Object.freeze([
  [-6, 18, 'wander', 0.4], [7, 1.5, 'chat', -0.6], [8.2, 2.6, 'chat', 2.5], [-9, 4, 'sit', 1.2], [-11, 12, 'watch', 1.9],
  [4, -12, 'wander', 0], [-3, -22, 'sit', 0.3], [12, -4, 'watch', -1.2], [-14, -6, 'wander', 2.2], [5, 24, 'chat', 2.6],
  [3.8, 22.8, 'chat', -0.5], [-5, 30, 'watch', 3.0], [16, 4, 'wander', -1.6], [-16, 16, 'sit', 1.0], [2, -44, 'watch', 3.1],
  [-2, -4, 'wander', 0.9], [10, 28, 'sit', -2.2], [-20, 4, 'watch', 1.5], [20, -2, 'sit', -1.0], [-8, -14, 'chat', 0.8],
]);

/**
 * Station keepers (§12.5 Hub mode table): where they stand (in front of their building), when they appear and the
 * §6.5 line keys. `bed` = Marmalade after L4 (in bed by the bakery, his own line).
 */
export const HUB_NPCS = Object.freeze([
  { id: 'marmalade', at: [-22.2, -18.2], facing: Math.PI / 2, when: 'town.free', lines: ['hub.marmalade.1', 'hub.marmalade.2'], bed: { when: 'gate.done', line: 'hub.marmalade.bed', pose: 'sleep' } },
  { id: 'tofu', at: [26.5, -7.5], facing: -1.25, when: 'town.free', lines: ['hub.tofu.1', 'hub.tofu.2'] },
  { id: 'earlgrey', at: [-17, 21.5], facing: 2.24, when: 'town.free', lines: ['hub.earlgrey.1', 'hub.earlgrey.2'] },
  { id: 'snowpaw', at: [0, 40], facing: Math.PI, when: 'town.free', lines: ['hub.snowpaw.1', 'hub.snowpaw.2'] },
  { id: 'pip', at: [17.5, 27.5], facing: -2.41, when: 'gate.done', lines: ['hub.pip.1', 'hub.pip.2'] },
  { id: 'pearl', at: [-12, 28.5], facing: 2.61, when: 'bog.done', lines: ['hub.pearl.1', 'hub.pearl.2'] },
  { id: 'coo', at: [-34, 7.2], facing: Math.PI, when: 'ending.seen', lines: ['hub.coo.1'] },
]);

export const HUB = Object.freeze({
  maxOnScreen: { low: 12, med: 20, high: 20 }, talkR: 2.1, npcTalkR: 2.8, repeatAfter: 25, gap: 2.5, lineDur: 2.6,
  tag: { r: 8, speed: 2.4, swapEvery: 7 }, cupEvery: 20, butterflyR: 1.5, copyVigilR: 4,
  // §18 draw budget: residents farther than cullR from her are hidden (the town fog has swallowed them), only those
  // within shadowR cast shadows; re-checked every lodEvery s
  cullR: 26, shadowR: 8, lodEvery: 0.25,
  // iso controls: [Interact] / click reach of a resident's talk interactable; a keeper within keeperR of a world
  // interactable stands for it; a resident within clearR of one gets no talk interactable (E stays the station's)
  talkUseR: 1.5, keeperR: 3.5, clearR: 2.5,
});
const _o = { x: 0, z: 0 };

/** How many villagers fill in beside `rescued` kittens for a quality name (total ≤ maxOnScreen). Pure. */
export function villagerCount(rescued, quality = 'med') {
  const max = HUB.maxOnScreen[quality] ?? HUB.maxOnScreen.med;
  return Math.max(0, Math.min(VILLAGER_SPOTS.length, max - Math.min(rescued, max)));
}

/** Pip's hub line vars (§6.5): the first level with kittens still out, and how many. Pure. */
export function pipVars(rescued = [], names = {}) {
  for (const id of LEVEL_IDS ?? Object.keys(KITTENS_BY_LEVEL)) {
    const ks = KITTENS_BY_LEVEL[id] ?? [];
    const left = ks.filter((k) => !rescued.includes(k)).length;
    if (left > 0) return { n: left, level: names[id] ?? id };
  }
  return { n: 0, level: names.keep ?? 'keep' };
}

/** A hub resident: an NpcActor with an activity (kept in place, no AI). */
export class HubResident extends NpcActor {
  constructor(ctx, id, o = {}) {
    super(ctx, id, o);
    this.tags.add('hub');
    this.beh = o.beh ?? 'idle';
    this.spot = o.spot ?? null;
    this.lines = o.lines ?? null;
    this.perch = o.perch ?? 0;
    if (this.perch > 0) this.flying = true;
    this.home = this.pos.clone();
    this.bt = (ctx.rng?.() ?? 0.5) * 10;        // behaviour clock (sim s)
    this.talkAt = -Infinity;
    this.dress = null;
    this.greet = this.beh === 'station' || this.beh === 'wave';
    this.farCull = false;                       // the hub's own LOD (from the focus) hides far residents
    /** the `talk_<id>` level interactable while registered */
    this.talkIt = null;
  }

  /** A click / tap / [Interact] on this resident: its line now (a repeat is fine: she asked). */
  use() {
    if (this.scripted || this.disposed) return false;
    this._faceHerT = 2.5;
    const hub = this.ctx.companions?.hub;
    const said = this.talk(hub?.gate ?? new BarkGate({ gap: 0, noRepeat: 0 }), this.ctx.game?.time ?? 0, { force: true });
    if (!said) { this.visual?.emote('nod'); this.visual?.hop(0.12); }
    return true;
  }

  /**
   * Register the `talk_<id>` interactable (kind 'npc', prompt.talk) in the level, unless a world interactable is within
   * HUB.clearR (E stays the station's / the board's) or this keeper stands for one (then `interactId` = its id).
   */
  registerTalk() {
    const list = this.ctx.levels?.current?.interactables;
    if (!Array.isArray(list) || this.talkIt) return null;
    let near = null, nd = Infinity;
    for (const it of list) {
      if (!it?.pos || it.actor) continue;
      const d = Math.hypot(it.pos.x - this.home.x, it.pos.z - this.home.z);
      if (d < nd) { nd = d; near = it; }
    }
    if (this.beh === 'station' && near && nd <= HUB.keeperR) { this.interactId = near.id; return null; }
    if (near && nd <= HUB.clearR) return null;
    if (!this.lines?.length) return null;
    this.talkIt = {
      id: 'talk_' + this.npcId, kind: 'npc', pos: this.pos, r: HUB.talkUseR, prompt: 'prompt.talk', actor: this,
      enabled: () => !this.disposed && !this.scripted && this.object3d.visible,
      use: () => this.use(),
    };
    list.push(this.talkIt);
    this.interactId = this.talkIt.id;
    return this.talkIt;
  }

  _unregisterTalk() {
    const list = this.ctx.levels?.current?.interactables, it = this.talkIt;
    if (it && Array.isArray(list)) { const i = list.indexOf(it); if (i >= 0) list.splice(i, 1); }
    this.talkIt = null;
  }

  /** Build this resident's activity dressing (fishing stick, table + cup, butterfly, basket...). */
  dressUp() {
    const v = this.visual;
    switch (this.beh) {
      case 'fish': {
        v?.setPose('sit', 0);
        this.dress = buildFishingStick();
        this.dress.position.set(0.12, 0.25, 0.18); this.dress.rotation.x = 0.85;
        this.object3d.add(this.dress);
        break;
      }
      case 'sit': v?.setPose('sit', 0); break;
      case 'nap': case 'stareUp': if (this.beh === 'nap') { v?.setPose('sleep', 0); v?.setExpression('sleep'); } else v?.setExpression('sad'); break;
      case 'read': v?.setPose('faint', 0); v?.setProp('letter', true); v?.setExpression('happy'); break;
      case 'sort': v?.setPose('sit', 0); break;
      case 'guard': v?.setPose('idle', 0); v?.setExpression('determined'); break;
      case 'cupKnock': {
        const t = buildTable(), c = buildCup();
        this.cupHome = new THREE.Vector3(0.35, 0.625, 0.45);
        t.position.set(0, 0, 0.55);
        this.dress = new THREE.Group(); this.dress.name = 'hubDress:' + this.npcId;
        this.dress.add(t);
        this.cup = c; this.cup.position.copy(this.cupHome);
        this.dress.add(c);
        this.object3d.add(this.dress);
        break;
      }
      case 'butterfly': {
        this.fly = buildButterfly();
        this.ctx.scene?.add(this.fly);
        break;
      }
      default: break;
    }
    if (this.beh === 'station' && this.bedPose) { v?.setPose(this.bedPose, 0); v?.setExpression('sleepy'); }
  }

  /** Shadow-map draws on / off for this resident (dressing included); a no-op when unchanged. */
  setShadows(on) {
    if (this._shadows === on) return;
    this._shadows = on;
    this.object3d.traverse((m) => { if (m.isMesh && m !== this.bubble?.sprite) m.castShadow = on; });
  }

  /**
   * Say a line in a bubble when she walks up (manager's gate keeps it to one at a time); `force` (she clicked it) skips
   * the repeat wait and the gate.
   */
  talk(gate, now, { force = false } = {}) {
    const keys = this.lines;
    if (!keys?.length || (!force && now - this.talkAt < HUB.repeatAfter)) return false;
    const key = gate.pick(keys, now, this.ctx.rng ?? Math.random, { chance: 1, force });
    if (!key) return false;
    this.talkAt = now;
    const vars = this.npcId === 'pip' ? pipVars(this.ctx.state?.kittens ?? [], this._levelNames()) : undefined;
    this.say(lineText(this.ctx, key, vars), HUB.lineDur);
    if (this.beh !== 'nap' && !this.bedPose) this.visual?.hop(0.15);
    return true;
  }

  _levelNames() {
    const s = this.ctx.strings, out = {};
    for (const id of Object.keys(KITTENS_BY_LEVEL)) out[id] = s?.has?.('level.' + id) ? s.t('level.' + id) : id;
    return out;
  }

  update(dt) {
    if (!this.ctx.game.simActive(this)) return;
    if (this.scripted || this.attachedTo) { super.update(dt); return; }
    this.bt += dt;
    const p = this.ctx.player;
    const d = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : Infinity;
    const b = this.beh, H = this.home;
    let vx = 0, vz = 0, face = null;
    switch (b) {
      case 'tag': {                                              // round the square, swapping who chases every 7 s
        const T = HUB.tag, w = T.speed / T.r;
        const dir = Math.floor(this.bt / T.swapEvery) % 2 ? -1 : 1;
        const a = (this.spot?.phase ?? 0) + this.bt * w * dir + Math.sin(this.bt * 0.9) * 0.35;
        const tx = FOUNTAIN[0] + Math.sin(a) * T.r, tz = FOUNTAIN[1] + Math.cos(a) * T.r;
        vx = (tx - this.pos.x) * 4; vz = (tz - this.pos.z) * 4;
        const s = Math.hypot(vx, vz), mx = T.speed * 1.8;
        if (s > mx) { vx *= mx / s; vz *= mx / s; }
        break;
      }
      case 'wander': {                                           // amble between home and a spot 2.5 m along its facing
        const u = (Math.sin(this.bt * 0.35) + 1) / 2;
        const tx = H.x + Math.sin(this.homeFacing) * 2.5 * u, tz = H.z + Math.cos(this.homeFacing) * 2.5 * u;
        vx = (tx - this.pos.x) * 1.6; vz = (tz - this.pos.z) * 1.6;
        break;
      }
      case 'tools': {                                            // Bean trots tools between two spots by the forge
        const u = Math.floor(this.bt / 3) % 2;
        const tx = H.x + (u ? 1.6 : 0), tz = H.z;
        vx = (tx - this.pos.x) * 3; vz = (tz - this.pos.z) * 3;
        if (Math.abs(tx - this.pos.x) < 0.1 && !this._hopped) { this._hopped = true; this.visual?.hop(0.18); this.visual?.setProp('spoon', u === 1); }
        if (Math.abs(tx - this.pos.x) > 0.4) this._hopped = false;
        break;
      }
      case 'butterfly': {                                        // Bramble chases a butterfly on a 3 m loop
        const a = this.bt * 1.1;
        const fx = H.x + Math.sin(a) * HUB.butterflyR, fz = H.z + Math.cos(a) * HUB.butterflyR;
        const lag = a - 0.7;
        const tx = H.x + Math.sin(lag) * HUB.butterflyR, tz = H.z + Math.cos(lag) * HUB.butterflyR;
        vx = (tx - this.pos.x) * 3; vz = (tz - this.pos.z) * 3;
        this.flyPos = this.flyPos ?? new THREE.Vector3();
        this.flyPos.set(fx, H.y + 0.75 + Math.sin(this.bt * 3.1) * 0.25, fz);
        if (Math.floor(this.bt / 2.3) !== Math.floor((this.bt - dt) / 2.3)) this.visual?.hop(0.28);
        break;
      }
      case 'copyVigil': {                                        // Button copies her Vigil pose when she is near
        const near = d < HUB.copyVigilR;
        if (near !== this._copying) { this._copying = near; this.visual?.setPose(near ? 'vigil' : 'idle', 0.3); this.visual?.setExpression(near ? 'determined' : 'happy'); }
        face = near ? p.facing : null;
        break;
      }
      case 'cupKnock': {                                         // Sprout knocks a cup off the table every 20 s
        const k = this.bt % HUB.cupEvery;
        if (k < dt && this.cup) { this.visual?.attack('swipe'); this.cupT = 0; }
        if (this.cupT != null) {
          this.cupT += dt;
          if (this.cupT > 0.18 && this.cup) {
            const u = Math.min(1, (this.cupT - 0.18) / 0.45);
            this.cup.position.set(this.cupHome.x + 0.45 * u, this.cupHome.y * (1 - u * u), this.cupHome.z + 0.1 * u);
            this.cup.rotation.z = -u * 1.6;
            if (u >= 1 && !this._clinked) { this._clinked = true; this.ctx.audio?.play3D?.('impact/metal_small1', this.pos, { volume: 0.4 }); }
          }
          if (this.cupT > 6) { this.cupT = null; this._clinked = false; if (this.cup) { this.cup.position.copy(this.cupHome); this.cup.rotation.set(0, 0, 0); } }
        }
        break;
      }
      case 'sort': if (Math.floor(this.bt / 2) !== Math.floor((this.bt - dt) / 2)) this.visual?.setProp('letter', Math.floor(this.bt / 2) % 2 === 0); break;
      case 'chat': if (Math.floor(this.bt / 3.1) !== Math.floor((this.bt - dt) / 3.1)) { this.visual?.emote('nod'); this.visual?.hop(0.08); } break;
      default: break;
    }
    // perched / seated residents stay put (a perch the level has not built yet must not drop them)
    const pinned = this.perch > 0 || PINNED.has(b);
    if (pinned) {
      this.pos.copy(H); this.vel.set(0, 0, 0); this.onGround = true;
    } else {
      this.vel.x = damp(this.vel.x, vx, 8, dt); this.vel.z = damp(this.vel.z, vz, 8, dt);
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this._faceHerT > 0) this._faceHerT -= dt;
    if (this._faceHerT > 0 && p && !PINNED.has(b)) this.facing = dampAngle(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 8, dt);
    else if (face != null) this.facing = dampAngle(this.facing, face, 4, dt);
    else if (sp > 0.3) this.facing = dampAngle(this.facing, Math.atan2(this.vel.x, this.vel.z), 8, dt);
    else if (d < 3.2 && b !== 'nap' && b !== 'fish' && b !== 'read' && b !== 'stareUp' && !this.bedPose) this.facing = dampAngle(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 3, dt);
    else this.facing = dampAngle(this.facing, this.homeFacing, 1.5, dt);
    this.visual?.setWave(this.greet && d < 6 && d > 1.5 && !this.bedPose);
    if (!pinned) this.ctx.physics.moveActor(this, dt);
  }

  render(alpha, dt) {
    super.render(alpha, dt);
    if (this.beh === 'fish' && this.dress) {
      const t = this.bt, c = this.dress.userData;
      c.pole.rotation.x = Math.sin(t * 1.3) * 0.05;
      c.cork.position.y = -0.55 + Math.sin(t * 2.2) * 0.02;
    }
    if (this.beh === 'stareUp' && this.visual) this.visual.root.rotation.x = -0.18;
    if (this.fly && this.flyPos) { this.fly.position.copy(this.flyPos); this.fly.rotation.y = this.bt * 1.1 + Math.PI / 2; this.fly.userData.flap(this.bt); }
  }

  dispose() {
    this._unregisterTalk();
    if (this.dress) disposeDressing(this.dress);
    if (this.fly) disposeDressing(this.fly);
    this.dress = null; this.fly = null;
    super.dispose();
  }
}

export class HubKittens {
  /** @param {any} ctx @param {import('./CompanionManager.js').CompanionManager} mgr */
  constructor(ctx, mgr) {
    this.ctx = ctx; this.mgr = mgr;
    this.active = false;
    /** @type {HubResident[]} */
    this.residents = [];
    this.gate = new BarkGate({ gap: HUB.gap, noRepeat: 30 });
  }

  /** Is `town` in hub mode? */
  isHub(levelId = this.ctx.levels?.current?.id) { return levelId === 'town' && !!this.ctx.state?.getFlag?.('town.free'); }

  /** Fill the hub (idempotent). */
  enter() {
    if (this.active) this.leave();
    this.active = true;
    const st = this.ctx.state, rescued = (st?.kittens ?? []).filter((k) => KITTEN_IDS.includes(k));
    for (const id of rescued) {
      const s = HUB_SPOTS[id];
      if (!s) continue;
      this._spawn(id, s.at, { beh: s.beh, facing: s.facing ?? 0, perch: s.y ?? 0, spot: s, cfg: lostKittenConfig(id), lines: ['kitten.' + id] });
    }
    const q = this.ctx.quality?.id ?? this.ctx.postfx?.qualityName ?? 'med';
    const nv = villagerCount(rescued.length, q);
    for (let i = 0; i < nv; i++) {
      const [x, z, beh, facing] = VILLAGER_SPOTS[i];
      const id = 'villager_hub_' + i;
      this._spawn(id, [x, z], { beh, facing, cfg: villagerConfig(id, { id, scale: 0.72 + ((i * 37) % 9) * 0.02, tier: 'lite' }),
        lines: ['hub.villager.1', 'hub.villager.2', 'hub.villager.3', 'hub.villager.4', 'hub.villager.5', 'hub.villager.6'] });
    }
    for (const n of HUB_NPCS) {
      if (!st?.getFlag?.(n.when)) continue;
      if (this.mgr.actors.some((a) => a.npcId === n.id && !(a instanceof HubResident))) continue;   // world's Hub placed it
      const bed = n.bed && st.getFlag?.(n.bed.when) ? n.bed : null;
      const r = this._spawn(n.id, n.at, { beh: 'station', facing: n.facing, lines: bed ? [bed.line] : n.lines, bedPose: bed?.pose ?? null });
      if (r && bed) { r.bedPose = bed.pose; r.visual?.setPose(bed.pose, 0); r.visual?.setExpression('sleepy'); }
    }
    return this.residents.length;
  }

  _spawn(id, at, o) {
    const x = at[0], z = at[1];
    const base = groundY(this.ctx, x, z, 0);
    const perch = o.perch ?? 0;
    // a perch the level built (balcony, statue, ledge) is walkable ground near that height: stand on it
    const top = perch > 0 ? groundY(this.ctx, x, z, base + perch) : base;
    const y = perch > 0 && top > base + perch * 0.5 && Math.abs(top - (base + perch)) < 0.6 ? top : base + perch;
    const r = new HubResident(this.ctx, id, { pos: new THREE.Vector3(x, y, z), facing: o.facing ?? 0, cfg: o.cfg, beh: o.beh, spot: o.spot, lines: o.lines, perch });
    r.homeFacing = o.facing ?? 0;
    r.bedPose = o.bedPose ?? null;
    r.setShadows(false);                                         // §18 budget: only residents near her cast shadows
    this.mgr._add(r, id);
    r.dressUp();
    try { r.registerTalk(); } catch (e) { console.warn('[companions] hub talk interactable failed', e); }
    r.snap?.(); r.visual?.snap();
    this.residents.push(r);
    return r;
  }

  /** Drop the hub (level unload; the manager despawns the actors). */
  leave() {
    for (const r of this.residents) if (this.mgr.actors.includes(r)) this.mgr.despawn(r);
    this.residents.length = 0;
    this.active = false;
  }

  /** Distance LOD (§18), from the camera focus (CONTROLS_SPEC §2.8): hide far residents, shadows only near it. */
  lod(dt) {
    this.lodT = (this.lodT ?? 0) - dt;
    if (this.lodT > 0) return;
    this.lodT = HUB.lodEvery;
    if (!this.ctx.player && !this.ctx.cam?.focus) return;
    const o = lodOrigin(this.ctx, _o);
    let shown = 0;
    for (const r of this.residents) {
      const d = Math.hypot(o.x - r.pos.x, o.z - r.pos.z);
      const vis = d < HUB.cullR || r.scripted;
      r.object3d.visible = vis;
      if (r.fly) r.fly.visible = vis;
      r.setShadows(vis && d < HUB.shadowR);
      if (vis) shown++;
    }
    this.shown = shown;
  }

  /** Lines on approach: the nearest resident within reach speaks (one at a time); distance LOD. */
  update(dt = 1 / 60) {
    if (!this.active) return;
    this.lod(dt);
    if (this.ctx.game?.mode !== 'play') return;
    const p = this.ctx.player;
    if (!p) return;
    let best = null, bd = Infinity;
    for (const r of this.residents) {
      if (r.disposed || r.scripted) continue;
      const reach = r.beh === 'station' ? HUB.npcTalkR : HUB.talkR;
      const d = Math.hypot(p.pos.x - r.pos.x, p.pos.z - r.pos.z);
      if (d < reach && Math.abs(p.pos.y - r.pos.y) < 2 && d < bd && (this.ctx.game.time - r.talkAt) >= HUB.repeatAfter) { bd = d; best = r; }
    }
    if (best) best.talk(this.gate, this.ctx.game.time ?? 0);
  }
}
