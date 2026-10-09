// src/story/dialogue/barks.js  (owner: story) — combat / exploration barks (GAME_DESIGN §6.1 Swordcat, §6.3 enemies
// and bosses). Companion barks (§6.2) are the companions area's (src/companions/lines.js); the party shares one gate.
//
// Rules (§6): at most 1 bark per 6 s across the whole party, 25% chance per trigger unless a row says otherwise, no
// repeat of the same line within 60 s; a bark is a small speech bubble over the speaker for 1.6 s plus babble audio.
// Enemy barks use their own, looser gate (they are the crowd, not the party).
//
// Pure tables + BarkGate are node-safe; BarkDirector listens to the bus at runtime and draws the bubbles with the
// companions' TextSprite (same parchment look as Mochi's bubbles).
import * as THREE from 'three';
import { E } from '../../core/events.js';
import { TextSprite } from '../../companions/Bubble.js';

/** Party gate (§6). */
export const PARTY_GATE = Object.freeze({ gap: 6, noRepeat: 60, chance: 0.25, dur: 1.6 });
/** Enemy gate: one crowd line every 2.5 s, no repeat within 20 s. */
export const ENEMY_GATE = Object.freeze({ gap: 2.5, noRepeat: 20, chance: 0.35, dur: 1.6 });
/** A "new encounter" = an alert after this many seconds without one (§6.1 "first alert of an encounter"). */
export const ENCOUNTER_GAP = 12;
/** Her answer to a rescued kitten waits for the kitten's own line (s). */
export const KITTEN_REPLY_DELAY = 1.8;
/** ...and is dropped when she is farther than this from the kitten by then (m). */
export const KITTEN_REPLY_RANGE = 10;
/** A speaker that moves farther than this in one rendered frame (teleport, respawn) drops its bubble (m). */
export const BUBBLE_JUMP = 4;
/** The sneeze bark's own minimum spacing (§6.1: 1 per 90 s). */
export const SNEEZE_GAP = 90;

/**
 * §6.1 Swordcat. `chance` (default PARTY_GATE.chance); `always` = forced past the gate's gap / chance (still counted);
 * `first` = the line for the very first time (saved flag `seen.<first>`).
 */
export const CLEM_BARKS = Object.freeze({
  alert: { keys: ['bark.clem.alert.1', 'bark.clem.alert.2', 'bark.clem.alert.3'], chance: 0.5 },
  stand: { keys: ['bark.clem.stand'], chance: 0.15 },
  standingGround: { keys: ['bark.clem.standingGround'], always: true },
  parry: { keys: ['bark.clem.parry.1', 'bark.clem.parry.2', 'bark.clem.parry.3'], chance: 0.3 },
  holy: { keys: ['bark.clem.holy.1', 'bark.clem.holy.2'], chance: 0.4 },
  golden: { keys: ['bark.clem.golden'], first: 'bark.clem.golden.first', always: true },
  stillStanding: { keys: ['bark.clem.stillStanding'], always: true },
  lowHp: { keys: ['bark.clem.lowHp'], always: true },
  respawn: { keys: ['bark.clem.respawn.1', 'bark.clem.respawn.2'], always: true },
  lastLife: { keys: ['bark.clem.lastLife'], always: true },
  milk: { keys: ['bark.clem.milk.1', 'bark.clem.milk.2'], chance: 0.3 },
  kitten: { keys: ['bark.clem.kitten'], always: true },
  arena: { keys: ['bark.clem.arena.1', 'bark.clem.arena.2'], chance: 0.4 },
  sneeze: { keys: ['bark.clem.sneeze'], always: true },
});

/** §6.3 enemies, by enemy type (`def.id`) and trigger. */
export const ENEMY_BARKS = Object.freeze({
  rat_pike: { alert: ['bark.rat.alert.1', 'bark.rat.alert.2'], flee: ['bark.rat.flee.1', 'bark.rat.flee.2'] },
  rat_xbow: { alert: ['bark.rat.alert.1', 'bark.rat.alert.2'], flee: ['bark.rat.flee.1', 'bark.rat.flee.2'] },
  hyena: { alert: ['bark.hyena.alert.1', 'bark.hyena.alert.2', 'bark.hyena.alert.3'], gloat: ['bark.hyena.gloat.1', 'bark.hyena.gloat.2', 'bark.hyena.gloat.3'],
    choke: ['bark.hyena.choke'], defeat: ['bark.hyena.defeat.1', 'bark.hyena.defeat.2', 'bark.hyena.defeat.3'] },
  stealer: { snatch: ['bark.stealer.snatch'], hit: ['bark.stealer.hit'], escape: ['bark.stealer.escape'] },
  pug: { alert: ['bark.pug.alert'], shield: ['bark.pug.shield'] },
  bonehead: { collapse: ['bark.bone.collapse'], reassemble: ['bark.bone.reassemble'], scattered: ['bark.bone.scattered'] },
});

/** Triggers that always speak (still gated by the enemy gap so a pack never talks over itself). */
export const ENEMY_ALWAYS = Object.freeze(new Set(['choke', 'snatch', 'hit', 'escape']));

/** Boss barks: `boss_<key>` → intro + one line per phase index (§6.3). Strings keys `<key>.<beat>`. */
export const BOSS_BARKS = Object.freeze({
  grizzlechop: { intro: 'grizzlechop.intro', phases: { 1: 'grizzlechop.p2' } },
  cacklejaw: { intro: 'cacklejaw.intro', early: 'cacklejaw.p1', phases: { 1: 'cacklejaw.p2', 2: 'cacklejaw.p3' } },
  brutus: { intro: 'brutus.show' },
  barkus: { intro: 'barkus.intro', early: 'barkus.p1', phases: { 1: 'barkus.p2', 2: 'barkus.p3' } },
});

/** Base enemy type of an enemy (`bonehead:minion` → 'bonehead', `boss_barkus` → 'boss_barkus'). Pure. */
export function enemyType(e) {
  const id = e?.def?.id ?? e?.type ?? '';
  return String(id).split(':')[0];
}

/** Boss key from a boss id (`boss_barkus` / `barkus` → 'barkus'). Pure. */
export function bossKey(id) { return String(id ?? '').replace(/^boss_/, ''); }

/**
 * The §6 gate: ≤ 1 line per `gap` s, `chance` per trigger, no repeat within `noRepeat` s. Same shape as the
 * companions' BarkGate (`pick(keys, now, rng, {chance, force})`), so the party can share theirs.
 */
export class BarkGate {
  constructor({ gap = PARTY_GATE.gap, noRepeat = PARTY_GATE.noRepeat } = {}) {
    this.gap = gap; this.noRepeat = noRepeat; this.lastAt = -Infinity;
    /** @type {Map<string, number>} key → last time spoken */
    this.used = new Map();
  }

  /**
   * @param {string[]} keys @param {number} now @param {() => number} rng
   * @param {{ chance?: number, force?: boolean }} [o]
   * @returns {string|null}
   */
  pick(keys, now, rng, { chance = PARTY_GATE.chance, force = false } = {}) {
    if (!keys?.length) return null;
    if (!force && now - this.lastAt < this.gap) return null;
    if (!force && rng() >= chance) return null;
    const fresh = keys.filter((k) => !(now - (this.used.get(k) ?? -Infinity) < this.noRepeat));
    const pool = fresh.length ? fresh : (force ? keys : []);
    if (!pool.length) return null;
    const key = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    this.used.set(key, now); this.lastAt = now;
    return key;
  }
}

/** Is `p` within `r` (XZ) of the camera-free play area of the heroine? (barks far away are skipped) */
const near = (a, b, r) => !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= r;
const HEAR_R = 22;

/**
 * Runtime bark driver (story-owned). Listens to gameplay events and shows bubbles; never runs in cutscenes.
 */
export class BarkDirector {
  /** @param {any} ctx @param {any} story StoryManager */
  constructor(ctx, story) {
    this.ctx = ctx; this.story = story;
    this.own = new BarkGate(PARTY_GATE);
    this.enemyGate = new BarkGate(ENEMY_GATE);
    /** @type {Map<any, {sprite: TextSprite, owner: any}>} actor → bubble (player, enemies) */
    this.bubbles = new Map();
    /** world-space bubbles for speakers that are gone (a defeated hyena): { sprite, holder } */
    this.loose = [];
    this.pending = [];
    this.lastAlertT = -Infinity;
    this.lowHpArmed = true;
    this.standingSaid = false;
    this.lastSneeze = -Infinity;
    this._sneezeNext = null;
    this._states = new WeakMap();
    this._thieves = new Map();
    this._pollT = 0;
    this._offs = [];
  }

  /** The party's shared gate (companions' when present, so the 6 s spacing covers Mochi too). */
  get gate() {
    const g = this.ctx.companions?.gate;
    return g && typeof g.pick === 'function' ? g : this.own;
  }

  get now() { return this.ctx.game?.time ?? 0; }
  get rng() { return this.ctx.rng ?? Math.random; }
  /** Barks only during ordinary play (not in cutscenes / dialogue / menus / Meme Cam). */
  get live() { const m = this.ctx.game?.mode; return (m === 'play' || m == null) && !this.story?.isPlaying; }

  init() {
    const bus = this.ctx.bus, on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    on(E.ENEMY_ALERTED, (p) => this._onAlert(p?.enemy));
    on(E.PLAYER_GUARD, (p) => { if (p?.on) this.clem('stand'); });
    on(E.PLAYER_VALOR, (p) => { if (p?.reason === 'stand' && p.delta > 0 && !this.standingSaid) { this.standingSaid = !!this.clem('standingGround'); } });
    on(E.PLAYER_PARRY, () => this.clem('parry'));
    on(E.PLAYER_HOLY, () => this.clem('holy'));
    on(E.PLAYER_GOLDEN, (p) => { if (p?.on) this.clem('golden'); });
    on(E.PLAYER_STILL_STANDING, () => this.clem('stillStanding'));
    on(E.PLAYER_DAMAGED, (p) => { if (this.lowHpArmed && (p?.hp ?? 99) <= 2 && (p?.hp ?? 0) > 0 && this.clem('lowHp')) this.lowHpArmed = false; });
    on(E.PLAYER_LIFE_LOST, (p) => { this._respawnLine = (p?.lives === 1) ? 'lastLife' : (p?.gameOver ? null : 'respawn'); this.lowHpArmed = true; });
    on(E.PLAYER_SPAWNED, () => this._afterRespawn());
    on(E.PLAYER_VALOR, (p) => { if (p?.reason === 'respawn') this._afterRespawn(); });
    on(E.CHECKPOINT, () => { this.lowHpArmed = true; });
    on(E.PLAYER_MILK, (p) => { if (p?.phase === 'start') this.clem('milk'); });
    // her reply only while the kitten is still beside her (a teleport / respawn / vigil warp in the 1.8 s cancels it)
    on(E.KITTEN_RESCUED, (p) => this.later(KITTEN_REPLY_DELAY, () => {
      const k = p?.kittenId ? this.ctx.actors?.get?.(p.kittenId) : null;
      if (k?.pos && !near(k.pos, this.ctx.player?.pos, KITTEN_REPLY_RANGE)) return;
      this.clem('kitten');
    }));
    on(E.ARENA_CLEAR, () => this.later(0.8, () => this.clem('arena')));
    on(E.ENEMY_CHOKE, (p) => this.enemy(p?.enemy, 'choke'));
    on(E.ENEMY_JEER, (p) => { if (p?.on) this.enemy(p.enemy, 'gloat'); });
    on(E.ENEMY_DIED, (p) => { if (enemyType(p?.enemy) === 'hyena') this.enemy(p.enemy, 'defeat', { at: p.position }); });
    on(E.ITEM_STOLEN, (p) => { if (p?.thief) { this._thieves.set(p.thief, true); this.enemy(p.thief, 'snatch'); } });
    on(E.ITEM_RETURNED, (p) => { const th = p?.thief ?? [...this._thieves.keys()][0]; if (th) this.enemy(th, 'hit'); this._thieves.clear(); });
    on(E.HIT, (h) => { if (h?.blocked && enemyType(h.target) === 'pug' && h.attacker === this.ctx.player) this.enemy(h.target, 'shield'); });
    on(E.BOSS_START, (p) => this._bossStart(p));
    on(E.BOSS_PHASE, (p) => this._bossPhase(p));
    on(E.LEVEL_UNLOAD, () => this.clear());
    on(E.LEVEL_LOADED, () => { this.standingSaid = false; this.lowHpArmed = true; this.lastAlertT = -Infinity; });
    on(E.CUTSCENE_START, () => this.hideAll());
  }

  /** Run `fn` after `sec` of play (dropped on level unload). */
  later(sec, fn) { this.pending.push({ t: sec, fn }); }

  // ------------------------------------------------------------------ speakers
  /**
   * Swordcat bark for a §6.1 trigger. @returns {string|null} the key spoken
   * @param {keyof typeof CLEM_BARKS} trigger
   */
  clem(trigger, { force = false } = {}) {
    const row = CLEM_BARKS[trigger], p = this.ctx.player;
    if (!row || !p || !this.live || p.alive === false) return null;
    let keys = row.keys;
    if (row.first) {
      const flag = 'seen.' + row.first;
      if (!this.ctx.state?.getFlag?.(flag)) { keys = [row.first]; this.ctx.state?.setFlag?.(flag, true); }
    }
    const key = this.gate.pick(keys, this.now, this.rng, { chance: row.chance ?? PARTY_GATE.chance, force: force || !!row.always });
    if (!key) return null;
    this.say(p, key, 'swordcat');
    return key;
  }

  /** Enemy bark (§6.3) for `trigger` on enemy `e`. @returns {string|null} */
  enemy(e, trigger, { at = null, force = false } = {}) {
    if (!e || !this.live) return null;
    const type = enemyType(e);
    const keys = ENEMY_BARKS[type]?.[trigger];
    if (!keys?.length) return null;
    const pos = at ?? e.pos;
    if (!near(pos, this.ctx.player?.pos, HEAR_R)) return null;
    const always = force || ENEMY_ALWAYS.has(trigger);
    if (always && this.now - this.enemyGate.lastAt < 0.8) return null;          // never two crowd lines on one frame
    const key = this.enemyGate.pick(keys, this.now, this.rng, { chance: ENEMY_GATE.chance, force: always });
    if (!key) return null;
    if (at || e.alive === false) this.sayAt(pos, (e.height ?? 1.2) + 0.35, key, type);
    else this.say(e, key, type);
    return key;
  }

  /**
   * Show `key` over `actor` for `dur` s, with babble. Actors with their own bubble (NPCs, companions) use it.
   * @returns {boolean}
   */
  say(actor, key, voice = null, dur = PARTY_GATE.dur) {
    const text = this.ctx.strings?.t?.(key) ?? key;
    if (actor?.bubble?.show) actor.bubble.show(text, dur);
    else {
      const b = this._bubbleFor(actor);
      if (!b) return false;
      b.sprite.show(text, dur);
    }
    if (actor === this.ctx.player) actor.emote?.('meow');
    this._babble(voice ?? actor?.actorId ?? actor?.npcId ?? 'swordcat', text);
    return true;
  }

  /** A bubble at a world point (the speaker is gone, e.g. a defeated hyena's last word). */
  sayAt(pos, y, key, voice = null, dur = PARTY_GATE.dur) {
    const scene = this.ctx.scene;
    if (!scene || !pos) return false;
    const text = this.ctx.strings?.t?.(key) ?? key;
    const holder = new THREE.Group();
    holder.position.set(pos.x, (pos.y ?? 0), pos.z);
    const sprite = new TextSprite({ kind: 'bubble', y });
    holder.add(sprite.object);
    scene.add(holder);
    sprite.show(text, dur);
    this.loose.push({ sprite, holder, t: dur + 0.4 });
    this._babble(voice, text);
    return true;
  }

  _babble(voice, text) {
    try { this.ctx.audio?.babble?.(voice ?? 'kitten', text); } catch (e) { console.warn('[story] babble failed', e); }
  }

  _bubbleFor(actor) {
    if (!actor?.object3d) return null;
    let b = this.bubbles.get(actor);
    if (b && b.sprite.object.parent !== actor.object3d) { this._drop(actor, b); b = null; }
    if (!b) {
      const h = (actor.height ?? 1) * (actor === this.ctx.player ? 1.0 : 1.0);
      const sprite = new TextSprite({ kind: 'bubble', y: h + 0.32 });
      actor.object3d.add(sprite.object);
      b = { sprite, owner: actor };
      this.bubbles.set(actor, b);
    }
    return b;
  }

  _drop(actor, b) {
    b.sprite.object.removeFromParent();
    b.sprite.dispose?.();
    this.bubbles.delete(actor);
  }

  // ------------------------------------------------------------------ triggers
  _onAlert(e) {
    if (!e) return;
    const now = this.now;
    const fresh = now - this.lastAlertT > ENCOUNTER_GAP;
    this.lastAlertT = now;
    if (fresh) this.later(0.5, () => this.clem('alert'));
    this.enemy(e, 'alert');
  }

  _afterRespawn() {
    const line = this._respawnLine;
    if (!line) return;
    this._respawnLine = null;
    this.later(0.9, () => this.clem(line));
  }

  _bossStart(p) {
    const key = bossKey(p?.id ?? p?.boss?.def?.id), row = BOSS_BARKS[key], boss = p?.boss;
    if (!row || !boss) return;
    const t = this.ctx.strings;
    const sayBoss = (k) => { if (k && (!t?.has || t.has(k)) && boss.alive !== false) this.say(boss, k, key, 2.4); };
    this.later(0.6, () => sayBoss(row.intro));
    if (row.early) this.later(9, () => sayBoss(row.early));
  }

  _bossPhase(p) {
    const boss = p?.boss, key = bossKey(boss?.def?.id ?? p?.id), row = BOSS_BARKS[key];
    const k = row?.phases?.[p?.phase];
    if (k && boss && (!this.ctx.strings?.has || this.ctx.strings.has(k))) this.later(0.4, () => { if (boss.alive !== false) this.say(boss, k, key, 2.4); });
  }

  /** 4 Hz: state entries that have no event (rats fleeing, hyenas gloating, a stealer escaping with the loot, sneezes). */
  _poll() {
    const list = this.ctx.enemies?.list ?? [];
    for (const e of list) {
      const prev = this._states.get(e), s = e.stateName;
      if (prev !== s) {
        this._states.set(e, s);
        if (s === 'flee' && prev && enemyType(e).startsWith('rat')) this.enemy(e, 'flee');
        else if (s === 'gloat' && prev) this.enemy(e, 'gloat');
      }
    }
    for (const th of [...this._thieves.keys()]) {
      if (!list.includes(th)) { if (th.alive !== false) this.enemy(th, 'escape', { at: th.pos, force: true }); this._thieves.delete(th); }
    }
    const m = this.ctx.player?.model;
    if (m && typeof m.sneezeNext === 'number') {
      if (this._sneezeNext != null && m.sneezeNext !== this._sneezeNext && this.now - this.lastSneeze >= SNEEZE_GAP * 0.5) {
        this.lastSneeze = this.now;
        this.clem('sneeze');
      }
      this._sneezeNext = m.sneezeNext;
    }
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    if (!this.live) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if ((p.t -= dt) <= 0) { this.pending.splice(i, 1); try { p.fn(); } catch (e) { console.warn('[story] bark failed', e); } }
    }
    if ((this._pollT -= dt) <= 0) { this._pollT = 0.25; this._poll(); }
  }

  /** Bubbles animate on rendered frames (they pop and fade). */
  render(frameDt) {
    const g = this.ctx.game, dt = g?.hitstopT > 0 ? 0 : frameDt;
    for (const [actor, b] of this.bubbles) {
      if (!actor.object3d?.parent || actor.alive === false && !b.sprite.visible) { this._drop(actor, b); continue; }
      // a teleport / respawn / level warp: the line belonged to where she was (STATUS M1 "lingering bark")
      const p = actor.pos;
      if (p) {
        if (b.last && b.sprite.visible && b.last.distanceToSquared(p) > BUBBLE_JUMP * BUBBLE_JUMP) b.sprite.hide?.();
        (b.last ??= new THREE.Vector3()).copy(p);
      }
      b.sprite.update?.(dt);
    }
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const l = this.loose[i];
      l.sprite.update?.(dt);
      if ((l.t -= frameDt) <= 0) { l.holder.removeFromParent(); l.sprite.dispose?.(); this.loose.splice(i, 1); }
    }
  }

  hideAll() {
    for (const b of this.bubbles.values()) b.sprite.hide?.();
    for (const l of this.loose) l.sprite.hide?.();
    this.pending.length = 0;
  }

  clear() {
    for (const [a, b] of [...this.bubbles]) this._drop(a, b);
    for (const l of this.loose) { l.holder.removeFromParent(); l.sprite.dispose?.(); }
    this.loose.length = 0;
    this.pending.length = 0;
    this._thieves.clear();
    this._respawnLine = null;
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.clear();
  }
}
