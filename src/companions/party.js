// src/companions/party.js  (owner: companions) — life between fights for the party (WA §5.6, §5.7; wa_story §5):
//   paw-bump   after each encounter clear (an arena clear, or the alerted enemies near her all gone after a fight):
//              every awake companion within PARTY.bumpR of her bumps paws (0.8 s, 3 stars + a heart); a new alert
//              in the PARTY.bumpDelay beat before it cancels it
//   parry      the nearest companion meows and a heart pops over it
//   streak     ≥ 3 KOs within 4 s → one cheer (the nearest companion; Mochi in his carrier cheers each cart KO)
//   knock-out  on her KO the companions run to her and shake their heads; when she boings back they land 1.5 m beside
//              her with a paw-bump
//   banter     lines.js BanterClock: a pair after 25 s with no alert within 20 m (one bubble at a time; her reply in a
//              bubble over her head)
// CompanionManager owns one PartyLife: bind() in init, update(dt) per fixed step, render(vdt) per frame, reset() on
// level unload. No per-step allocation.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { isEngaged } from './steering.js';
import { BanterClock, BANTER_RULE, banterLines, lineText } from './lines.js';
import { TextSprite } from './Bubble.js';

/** WA §5.6 / §5.7 numbers (m, s). */
export const PARTY = Object.freeze({
  bumpR: 8, bumpDelay: 0.5, bumpDur: 0.8, engagedR: 15, scanEvery: 0.1,
  parryR: 12, streak: Object.freeze({ n: 3, within: 4, cooldown: 6 }),
  koLandR: 1.5, cartCheerR: 14,
});

const _v = new THREE.Vector3();
/** An awake, free party member (not napping, not scripted, not attached)? */
const free = (c) => c.napT <= 0 && !c.scripted && !c.attachedTo;

export class PartyLife {
  /** @param {any} ctx @param {import('./CompanionManager.js').CompanionManager} mgr */
  constructor(ctx, mgr) {
    this.ctx = ctx; this.mgr = mgr;
    /** pending paw-bump: seconds left (−1 = none) */
    this.bumpT = -1;
    this.engaged = false; this._scanT = 0; this._fought = false;
    /** KO times (sim s) of the current streak */
    this.kills = []; this.streakCd = 0;
    this.herDown = false;
    this.banter = new BanterClock();
    /** the pair being played: { lines, i, t, speaker } or null */
    this.talk = null;
    /** her reply bubble (lazy: parented to her object3d) */
    this.clemBubble = null;
    this.stats = { bumps: 0, cheers: 0, parries: 0, banter: 0, koRuns: 0, koLands: 0 };
  }

  /** Subscribe to the bus; returns the unsubscribe functions. */
  bind(bus) {
    return [
      bus.on(E.ARENA_CLEAR, () => this.queueBump()),
      bus.on(E.ENEMY_ALERTED, () => { this.bumpT = -1; }),
      bus.on(E.PLAYER_PARRY, () => this.onParry()),
      bus.on(E.ENEMY_DIED, (p) => this.onKill(p)),
      bus.on(E.PLAYER_DIED, () => this.onHerKO()),
      bus.on(E.PLAYER_SPAWNED, () => this.onHerBack()),
    ];
  }

  /** Level unload: forget pending beats, stop a pair, every banter pair is new again. */
  reset() {
    this.bumpT = -1; this.engaged = false; this._fought = false; this.kills.length = 0; this.streakCd = 0;
    this.banter.reset(); this._stopTalk();
  }


  /** The awake companion nearest to her within `r` m, or null. */
  nearest(r = Infinity) {
    const p = this.ctx.player;
    if (!p) return null;
    let best = null, bd = r;
    for (const c of this.mgr.active) { if (!free(c)) continue; const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z); if (d <= bd) { bd = d; best = c; } }
    return best;
  }

  // ------------------------------------------------------------------ paw-bump

  /** An encounter was cleared: paw-bump after a short beat (a new alert cancels it). */
  queueBump() { this.bumpT = PARTY.bumpDelay; }

  /** Paw-bump now: every free companion within PARTY.bumpR of her. Returns the companions that bumped. */
  pawBump() {
    const p = this.ctx.player, out = [];
    if (!p || p.alive === false) return out;
    for (const c of this.mgr.active) {
      if (!free(c) || Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > PARTY.bumpR) continue;
      if (c.pawBump?.(p) !== false) out.push(c);
    }
    if (out.length) this.stats.bumps++;
    return out;
  }

  // ------------------------------------------------------------------ reactions

  onParry() {
    const c = this.nearest(PARTY.parryR);
    if (!c) return;
    c.visual?.emote('meow'); c.visual?.punch(0.08);
    this.ctx.fx?.burst?.('heart', _v.set(c.pos.x, c.pos.y + c.height + 0.25, c.pos.z), { count: 1 });
    this.stats.parries++;
  }

  onKill(p) {
    const now = this.ctx.game?.time ?? 0;
    this._fought = true;
    // Mochi in his carrier cheers each KO of the cart fight (ON §6.1)
    const pos = p?.position ?? p?.enemy?.pos;
    for (const k of this.mgr.actors) {
      if (k.kittenId !== 'mochi' || k.stateName !== 'caged' || !pos) continue;
      if (Math.hypot(k.pos.x - pos.x, k.pos.z - pos.z) <= PARTY.cartCheerR) { k.cheer?.(); this.mgr.bark(k, 'cheer', { chance: 1, force: true, dur: 1.4 }); }
    }
    const K = this.kills;
    K.push(now);
    while (K.length && now - K[0] > PARTY.streak.within) K.shift();
    if (K.length >= PARTY.streak.n && this.streakCd <= 0) {
      K.length = 0; this.streakCd = PARTY.streak.cooldown;
      const c = this.nearest(PARTY.engagedR);
      if (c) { c.cheer?.(); this.stats.cheers++; }
    }
  }

  /** WA §5.7: she is knocked out → the companions run to her and shake their heads. */
  onHerKO() {
    this.herDown = true; this.bumpT = -1; this._stopTalk();
    for (const c of this.mgr.active) { if (!free(c)) continue; c.koRun?.(this.ctx.player); this.stats.koRuns++; }
  }

  /** She boings back (respawn teleport): companions land 1.5 m beside her with a paw-bump. */
  onHerBack() {
    if (!this.herDown) return;
    this.herDown = false;
    const p = this.ctx.player;
    if (!p) return;
    for (const c of this.mgr.active) { if (!free(c)) continue; c.landBeside?.(p, PARTY.koLandR); c.pawBump?.(p); this.stats.koLands++; }
  }

  // ------------------------------------------------------------------ loop

  /** An alerted enemy within `r` m of her? */
  _alertNear(p, r) {
    for (const e of this.ctx.enemies?.list ?? []) {
      if (!isEngaged(e)) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) <= r) return true;
    }
    return false;
  }

  update(dt) {
    const ctx = this.ctx, p = ctx.player;
    this.streakCd = Math.max(0, this.streakCd - dt);
    if (!p || ctx.game?.mode !== 'play' || ctx.levels?.loading) { if (ctx.game?.mode !== 'play') this._stopTalk(); return; }
    // the encounter read (10 Hz): engaged → calm after a fight = an encounter clear
    this._scanT -= dt;
    let alert = this.engaged;
    if (this._scanT <= 0) {
      this._scanT = PARTY.scanEvery;
      alert = this._alertNear(p, Math.max(PARTY.engagedR, BANTER_RULE.alertR));
      if (alert) this.bumpT = -1;
      else if (this.engaged && this._fought) this.queueBump();
      if (!alert) this._fought = false;
      this.engaged = alert;
    }
    if (this.bumpT >= 0 && (this.bumpT -= dt) < 0) { this.bumpT = -1; if (!alert) this.pawBump(); }
    // banter
    if (this.talk) { if (alert) this._stopTalk(); else this._stepTalk(dt); }
    const c = this.nearest(PARTY.bumpR);
    const gate = this.mgr.gate, now = ctx.game?.time ?? 0;
    const key = this.banter.tick(dt, {
      id: c && !c.target && c.stateName !== 'ability' ? c.kittenId : null, alertNear: alert,
      barkReady: now - gate.lastAt >= gate.gap && !(c?.bubble?.on), busy: !!this.talk || this.herDown,
    });
    if (key && c) this._startTalk(c, key);
  }

  render(vdt) { this.clemBubble?.update(vdt); }

  // ------------------------------------------------------------------ banter playback

  _startTalk(c, key) {
    const has = (k) => this.ctx.strings?.has?.(k) || lineText(this.ctx, k) !== k;
    this.talk = { c, lines: banterLines(key, has), i: -1, t: 0, key };
    this.mgr.gate.lastAt = this.ctx.game?.time ?? 0;
    this.stats.banter++;
    this._next();
  }

  _stepTalk(dt) {
    const t = this.talk;
    if (!t.c || t.c.napT > 0 || t.c.scripted || !this.mgr.active.includes(t.c)) { this._stopTalk(); return; }
    t.t -= dt;
    if (t.t <= 0) this._next();
  }

  _next() {
    const t = this.talk;
    t.i++;
    if (t.i >= t.lines.length) { this._stopTalk(); return; }
    const [who, key] = t.lines[t.i], text = lineText(this.ctx, key);
    t.t = BANTER_RULE.lineDur;
    if (who === 'clem') {
      t.c.bubble?.hide?.();                                       // one bubble at a time
      const b = this._clem();
      if (b) b.show(text, BANTER_RULE.lineDur);
      this.mgr.babble({ kittenId: 'swordcat' }, text);
    } else {
      this.clemBubble?.hide();
      t.c.bubble?.show(text, BANTER_RULE.lineDur);
      t.c.visual?.emote('meow');
      this.mgr.babble(t.c, text);
    }
  }

  _stopTalk() {
    if (!this.talk) return;
    this.talk.c?.bubble?.hide?.();
    this.clemBubble?.hide();
    this.talk = null;
  }

  /** Her reply bubble, parented to her (built once). */
  _clem() {
    const p = this.ctx.player;
    if (!p?.object3d) return null;
    if (!this.clemBubble) this.clemBubble = new TextSprite({ kind: 'bubble', y: (p.height ?? 1) + 0.45 });
    if (this.clemBubble.object.parent !== p.object3d) p.object3d.add(this.clemBubble.object);
    return this.clemBubble;
  }

  dispose() { this._stopTalk(); if (this.clemBubble) { this.clemBubble.object.removeFromParent(); this.clemBubble.dispose(); this.clemBubble = null; } }
}
