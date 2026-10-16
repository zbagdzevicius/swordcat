// src/companions/CompanionManager.js  (owner: companions) — the ctx.companions system (GAME_DESIGN §19.3, §9):
//   active                      Companion[] (COMPANIONS.maxActive = 1 in MVP); mirrored to state.companions.active
//   setActive(ids)              swap the party (known companion ids only; each newly active id is also unlocked)
//   spawnNpc(id, pos, facing)   scripted NPC (cutscene `spawn` step); 'pudding' → Pudding; an active companion id
//                               returns that Companion moved to `pos`
//   spawnKitten(id, pos, hide, opts?)  a LostKitten (hide: 'meow'|'cage'|'stand'|'break'|'climb'|null); companion
//                               ids make a caged squire (Mochi D-01) that joins when freed
//   pudding                     the Pudding actor or null
// Iso controls (CONTROLS_SPEC §7.5, §10.1, §12 companions; additive):
//   useAbility(i | { dir?, point?, mag?, id? })  smart cast (index / nothing) or an aimed cast (ui's drag release,
//               mouseOnly slot click); the Q / LT / portrait input is read here: tap = quick cast (at the cursor on
//               KBM, smart on pad and touch), hold = the indicator follows the aim, release casts; Esc / RMB / ✕ cancel
//   aim         { active, kittenId, ability, shape, valid, plan } while an ability is aimed (fx and ui read it;
//               AbilityIndicator draws it until fx takes over); aimAbility(req) / cancelAbilityAim() for ui
//   cooldownLeft(id?) / readiness(id?) / canCast(id?) / abilityShape(id?)   the ability bar and the ranges overlay
//   pickables(out) / use(actorOrId)   companion-area actors the camera's picker may hit (pickKind, useR,
//               interactId, use(); never the active party, whose clicks fall through to ground) and what a click /
//               tap on one does
// Extras for other areas (additive): unlock(id), useAbility(i), wallBetween(a, b) (Shield Wall occlusion for
// Combat), milkBonus (Mochi passive), kittens, bark(actor, category, opts), get(id), despawn(actor), clearLevel(),
// markCleared(arenaId), lowerCage(id), and (M2):
//   swapNext(dir) / swapTo(id) / canSwap()  §9.1 companion swap (ui's Vigil Stone menu and Barracks panel call
//               setActive / swapTo; a swap in play gets a little flourish: poof out, hop in, hello bark)
//   spoons      SpoonBrigade (§9.3: L4 Line + Cacklejaw; auto on CS-08 / B2 start)
//   hub         HubKittens (§12.5 activity spots, villagers, station keepers; auto in `town` once `town.free`)
//   rescues     placed per level from rescues.js when the level itself didn't (forest/town/gate kittens, Sage, Clover,
//               Marmalade, Tofu, Pip; Earl Grey pops out of the giant Gloomjelly)
// Listens: level load/unload, her Meow and swings, arena clears/waves, story flags (join flags, meadow.pudding),
// objectives (net_ropes, the treetop ropes), interact (vigil / barracks), enemy deaths (the giant jelly), cutscene
// start/end (D-03, CS-08), boss start/defeat (B2), quality changes. Reads the `ability` input (Q / LT) during play.
// Warm adventure (WA §5.6–5.7): `party` (party.js PartyLife: paw-bumps after a clear, parry meow, kill-streak cheer,
// the KO run / boing-back landing, banter pairs). Auto-camera (AUTOCAM §13 companions 2): while an ability is aimed,
// `player.aim.range` / `dir` carry its reach so the camera's aim pan can lead it.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { COMPANIONS } from '../core/config.js';
import { Companion } from './Companion.js';
import { NpcActor } from './NpcActor.js';
import { LostKitten } from './LostKitten.js';
import { Pudding, PUDDING } from './Pudding.js';
import { BARKS, lineText } from './lines.js';
import { BarkGate, COMPANION_IDS, JOIN_FLAGS, JOIN_SCENES, followSlot, groundY, nextCompanion, FOLLOW_SIDE, SLOT } from './steering.js';
import { SpoonBrigade } from './SpoonBrigade.js';
import { HubKittens } from './HubKittens.js';
import { RESCUES, RESCUE_AFTER, rowWanted } from './rescues.js';
import { CATS, visualDt } from '../characters/index.js';

import { planAbility, explicitAim, cursorGround, newPlan, abilityShape, CAST } from './abilityAim.js';
import { AbilityIndicator } from './AbilityIndicator.js';
import { setBubbleSafeInsets, setBubbleHush, setBubblePlayer, setBubbleBlockers } from './Bubble.js';
import { PartyLife } from './party.js';
import { emitCatSaved } from '../shelter/roster.js';

const _slot = { x: 0, z: 0 };
const _ex = { x: 0, z: 0, mag: 0, source: '' };
const _req = { dir: null, point: null, mag: undefined, source: 'smart' };
/** §7.5 cast modes (the castMode setting). */
export const CAST_MODES = Object.freeze(['smart', 'indicator', 'dragOnly']);
const toVec = (p) => (p == null ? new THREE.Vector3()
  : Array.isArray(p) ? (p.length >= 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], 0, p[1]))
    : new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));

/** Barks from farther away than this (m) are not spoken (the caged Mochi used to bark at every arena wave). */
const BARK_HEAR_R = 25;
/** §9.1 swap: a short cooldown so one press is one swap; Earl Grey's beat after the giant jelly pops (s). */
export const SWAP = Object.freeze({ cooldown: 0.6, earlGreyDelay: 1.0 });
/** The gate crew at the winch (§12.6: Earl Grey and Pip work it as scripted, invulnerable actors). */
export const GATE_CREW = Object.freeze({ earlgrey: { at: [-1.6, 42.2], facing: Math.PI }, pip: { at: [1.6, 42.2], facing: Math.PI, when: 'gate.pip' } });

export class CompanionManager {
  constructor(ctx) {
    // every speech bubble (ours, NPCs', story/enemy barks) stays clear of the HUD's safe insets (ability bar, boss plate)
    setBubbleSafeInsets(() => ctx.ui?.safeInsets);
    // TT5: no world bubble draws behind a modal's scrim (shelter card, results, offer)
    // (TT5 verify round: and on phones under a centre card; the line waits with its clock held, ui/messages.js)
    setBubbleHush(() => !!(ctx.ui?.messages?.bubbleHold?.() ?? ctx.ui?.messages?.p0));
    // tablets and desktops: bubbles step off the centre card and the toasts
    setBubbleBlockers(() => ctx.ui?.messages?.bubbleBlocks?.() ?? null);
    // TT5: a bubble that is not hers steps off Clem, and a newer bubble off an older one
    setBubblePlayer(() => ctx.player);
    this.ctx = ctx;
    /** @type {Companion[]} */
    this.active = [];
    /** @type {Pudding|null} */
    this.pudding = null;
    /** level-scoped actors (NPCs, lost kittens, Pudding) */
    this.actors = [];
    /** live Shield Walls */
    this.walls = [];
    /** hiding props and opened cages left behind by kittens who went home ({ root, collider }) */
    this.dressing = [];
    /** arena ids cleared in the current level (cage / stand hides that need a clear) */
    this.cleared = new Set();
    this.gate = new BarkGate({ gap: 6, noRepeat: 60 });
    /** §9.3 The Spoon Brigade (L4) */
    this.spoons = new SpoonBrigade(ctx, this);
    /** §12.5 hub residents */
    this.hub = new HubKittens(ctx, this);
    this.swapT = 0;
    /**
     * Iso controls: the kitten ability being aimed (CONTROLS_SPEC §7.5). `plan` is abilityAim.js planAbility's output
     * (shape, center, yaw, width, length, range, targets, dir, point, valid); fx's GroundDecals and ui read it.
     */
    this.aim = { active: false, kind: 'ability', kittenId: null, ability: null, shape: null, valid: false, source: null, range: 0, plan: newPlan() };
    /** the press being held: { t, shown, cancelled, device, req } */
    this._cast = null;
    this.indicator = new AbilityIndicator(ctx, this);
    /** WA §5.6 life between fights + banter */
    this.party = new PartyLife(ctx, this);
    /** pending timed calls (sim s): [{ t, fn }] */
    this._later = [];
    /** rescues waiting for a story flag on this level (RESCUE_AFTER): [{ flag, args }] */
    this._waiting = [];
    this._offs = [];
  }

  get maxActive() { return COMPANIONS.maxActive; }
  /** Lost kittens (and caged squires) in the level. */
  get kittens() { return this.actors.filter((a) => a instanceof LostKitten); }
  /** Mochi's passive: +1 milk capacity while he is in the party (§7.6, §9.2). */
  get milkBonus() { let n = 0; for (const c of this.active) n += c.cfg.milkBonus ?? 0; return n; }

  async init() {
    const bus = this.ctx.bus;
    this._offs.push(
      bus.on(E.LEVEL_UNLOAD, () => { this._endAim(); this.clearLevel(); }),
      bus.on(E.LEVEL_LOADED, (p) => this._onLevelLoaded(p)),
      bus.on(E.SAVE_LOADED, () => this._syncFromState()),
      bus.on(E.PLAYER_MEOW, (p) => this._onMeow(p?.position ?? this.ctx.player?.pos)),
      bus.on(E.PLAYER_SWING, (p) => { for (const k of this.kittens) k.onSwing(p?.attackId, this.ctx.player); }),
      bus.on(E.ARENA_CLEAR, (p) => { if (p?.id) this.markCleared(p.id); }),
      bus.on(E.ARENA_WAVE, () => { for (const k of this.kittens) if (k.companion && k.stateName === 'caged' && this._nearHer(k, BARK_HEAR_R)) this.bark(k, 'caged', { chance: 0.7 }); }),
      bus.on(E.FLAG_SET, (p) => this._onFlag(p?.key, p?.value)),
      bus.on(E.OBJECTIVE, (p) => { if (p?.id === 'net_ropes' && this.pudding) this.pudding.setRopesCut(p.value ?? 0); }),
      bus.on(E.QUALITY, (p) => this._applyQuality(p?.preset ?? this.ctx.quality)),
      bus.on(E.CUTSCENE_END, (p) => { this._ensurePudding(); this._safe('cutscene', () => this._onCutscene(p?.id, false)); }),
      bus.on(E.CUTSCENE_START, (p) => this._safe('cutscene', () => this._onCutscene(p?.id, true))),
      bus.on(E.OBJECTIVE, (p) => this._safe('objective', () => this._onObjective(p))),
      bus.on(E.ENEMY_DIED, (p) => this._safe('enemy died', () => this._onEnemyDied(p))),
      bus.on(E.BOSS_START, (p) => this._safe('boss start', () => { if (this._levelId() === 'gate' && /cacklejaw/.test(String(p?.id ?? p?.boss?.def?.id ?? ''))) this.spoons.start({ arm: true }); })),
      bus.on(E.BOSS_DEFEATED, () => { if (this.spoons.active) this.spoons.stop(); }),
      ...this.party.bind(bus),
    );
  }

  /** Run an M2 listener without letting a failure escape into the emitter (another area's flow). */
  _safe(what, fn) {
    try { return fn(); } catch (e) { console.error(`[companions] ${what} handler failed`, e); return undefined; }
  }

  _levelId() { return this.ctx.levels?.current?.id ?? null; }

  // ------------------------------------------------------------------ party

  _spawnCompanion(id, pos, facing = 0) {
    // a caged squire who just joined hands over his cat look (no buildKitten on the join frame)
    const h = this._handoff?.id === id ? this._handoff.visual : null;
    this._handoff = null;
    const c = new Companion(this.ctx, id, h ? { pos, facing, visual: h } : { pos, facing });
    this.ctx.actors.register(c, id);
    this.ctx.scene.add(c.object3d);
    return c;
  }

  /**
   * Swap the active companions (max COMPANIONS.maxActive). Unknown ids are ignored; kept ids keep their instance.
   * @param {string[]} ids @param {{ place?: boolean }} [o]
   * @returns {Companion[]}
   */
  setActive(ids = [], { place = true, quiet = false } = {}) {
    const want = [...new Set((ids ?? []).filter((id) => COMPANION_IDS.includes(id)))].slice(0, this.maxActive);
    const next = [];
    // a swap during play / a menu (ui's Vigil Stone and Barracks panels): the old one poofs, the new one hops in
    const mode = this.ctx.game?.mode;
    const flourish = !quiet && (mode === 'play' || mode === 'menu') && !this.ctx.levels?.loading && this.active.length > 0;
    for (const c of this.active) {
      if (want.includes(c.kittenId)) continue;
      if (flourish) this._poofOut(c);
      this.ctx.actors.unregister(c); c.dispose();
    }
    const fresh = [];
    for (const id of want) {
      let c = this.active.find((x) => x.kittenId === id);
      if (!c) { c = this._spawnCompanion(id); fresh.push(c); }
      next.push(c);
    }
    this.active = next;
    const st = this.ctx.state;
    if (st) {
      st.companions.active = want.slice();
      for (const id of want) if (!st.companions.unlocked.includes(id)) st.companions.unlocked.push(id);
    }
    if (place) this._place(fresh);
    if (flourish) for (const c of fresh) this._hello(c);
    this.ctx.bus.emit(E.COMPANION_CHANGED, { active: want.slice() });
    return this.active;
  }

  /** Put companions beside her (just behind her shoulder, on their side, where the camera sees them), on the ground. */
  _place(list = this.active) {
    const p = this.ctx.player;
    if (!p) return;
    for (const c of list) {
      followSlot(p.pos, p.facing, FOLLOW_SIDE[c.kittenId] ?? 1, _slot, { dist: SLOT.regroupDist, angle: SLOT.regroupAngle });
      c.pos.set(_slot.x, groundY(this.ctx, _slot.x, _slot.z, p.pos.y), _slot.z);
      c.vel.set(0, 0, 0); c.facing = p.facing; c.heading = p.facing; c.target = null; c.losT = 0;
      c.herStillT = SLOT.besideAfter; c.settled = true;
      c.snap(); c.visual?.snap();
    }
  }

  /** Unlock a companion (join flag / freed cage). Joins the party if there is room, appearing where `at` stood. */
  unlock(id, { at = null, activate = true } = {}) {
    if (!COMPANION_IDS.includes(id)) return false;
    const st = this.ctx.state;
    const fresh = !!st && !st.companions.unlocked.includes(id);
    if (st && fresh) st.companions.unlocked.push(id);
    if (fresh) emitCatSaved(this.ctx, id, 'squire');            // TT4 §12.3: once per squire, after its join scene
    const caged = at ?? this.actors.find((a) => a instanceof LostKitten && a.kittenId === id) ?? null;
    if (this.active.some((c) => c.kittenId === id)) { if (caged && this.actors.includes(caged)) this.despawn(caged); return true; }
    // a squire who just joined takes the slot (§5.4 D-02 / D-04: the newcomer fights beside her; the one swapped out
    // goes back to the Barracks, "Swap kittens at any Vigil Stone"); a re-sent join flag never swaps
    const full = this.active.length >= this.maxActive;
    if (!activate || (full && !(fresh || caged))) return true;
    const pos = caged ? caged.pos.clone() : null, facing = caged?.facing ?? 0;
    const vis = caged?.kittenId === id ? caged.takeVisual?.() ?? null : null;
    if (caged && this.actors.includes(caged)) this.despawn(caged);
    if (vis) this._handoff = { id, visual: vis };
    const keep = this.active.map((c) => c.kittenId);
    if (full) { for (const c of keep.splice(this.maxActive - 1)) this._poofOut(this.active.find((x) => x.kittenId === c)); }
    this.setActive([...keep, id], { place: !pos, quiet: true });
    if (this._handoff) { this._handoff.visual.dispose(); this._handoff = null; }   // not used (already in the party)
    const c = this.active.find((x) => x.kittenId === id);
    if (c && pos) {
      pos.y = groundY(this.ctx, pos.x, pos.z, pos.y);
      c.pos.copy(pos); c.facing = facing; c.snap(); c.visual?.snap(); c.visual?.hop(0.3);
    }
    return true;
  }

  /** Little goodbye for a companion leaving the party (poof where it stood). */
  _poofOut(c) {
    if (!c) return;
    this.ctx.fx?.burst?.('poof', c.pos, { scale: 0.5 });
    this.ctx.fx?.burst?.('sparkle', c.pos, { count: 6 });
  }

  // ------------------------------------------------------------------ swap (§9.1)

  /** Can she swap companions now? (≥ 2 unlocked, in play, no locked arena, not loading.) */
  canSwap() {
    const ctx = this.ctx, st = ctx.state;
    if (!st || ctx.levels?.loading) return false;
    if (ctx.game?.mode !== 'play') return false;
    if (ctx.levels?.current?.arenas?.some?.((a) => a.locked)) return false;
    const cur = this.active[0]?.kittenId ?? null;
    return !!nextCompanion(st.companions.unlocked, cur, 1) && (cur === null || COMPANION_IDS.filter((i) => st.companions.unlocked.includes(i)).length > 1);
  }

  /**
   * Swap to the next unlocked companion (dir −1 = previous): the old one poofs off to the Barracks, the new one hops in
   * beside her and says hello; toast "<name> is with you!". Returns the new id or null.
   */
  swapNext(dir = 1) {
    if (!this.canSwap() || this.swapT > 0) return null;
    const id = nextCompanion(this.ctx.state.companions.unlocked, this.active[0]?.kittenId ?? null, dir);
    return id ? this.swapTo(id) : null;
  }

  /** A companion arriving by a swap: hop, sparkle, hello. */
  _hello(c) {
    c.visual?.hop(0.3); c.visual?.setExpression('happy');
    this.ctx.fx?.burst?.('sparkle', c.pos, { count: 10 });
    this.bark(c, 'hello', { force: true, chance: 1, dur: 2.0 });
  }

  /** Swap to `id` (must be unlocked): the flourish plus a toast "<name> is with you!". */
  swapTo(id) {
    const st = this.ctx.state;
    if (!COMPANION_IDS.includes(id) || !st?.companions?.unlocked?.includes(id)) return null;
    if (this.active[0]?.kittenId === id) return id;
    const had = this.active.length > 0;
    this.setActive([id]);
    this.swapT = SWAP.cooldown;
    const c = this.active[0];
    if (c && !had) this._hello(c);
    const name = this.ctx.strings?.has?.('name.' + id) ? this.ctx.strings.t('name.' + id) : (CATS[id]?.name ?? id);
    this.ctx.bus.emit(E.TOAST, { text: lineText(this.ctx, 'toast.swap', { name }), icon: id });
    return id;
  }

  /** A caged squire's cage opened: play its join scene (e.g. D-01), then unlock. */
  joinFromCage(k) {
    const id = k.kittenId, play = k.opts?.play ?? JOIN_SCENES[id];
    k.visual?.setPose('cheer', 0.2); k.visual?.setExpression('happy'); k.visual?.hop(0.35);
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      if (!this.actors.includes(k)) return this.unlock(id, { activate: true });
      this.unlock(id, { at: k });                                // a newcomer takes the slot (the old one poofs to the Barracks)
    };
    if (play && this.ctx.story?.play) {
      try { Promise.resolve(this.ctx.story.play(play)).then(finish, finish); } catch (e) { console.warn('[companions] join scene failed', e); finish(); }
    } else finish();
  }

  /** Active companion by id ('mochi'), index (0) or nothing (the first). */
  _comp(id) {
    if (id == null) return this.active[0] ?? null;
    if (typeof id === 'number') return this.active[id] ?? null;
    return this.active.find((c) => c.kittenId === id) ?? null;
  }

  /**
   * Fire an active companion's ability. `useAbility()` / `useAbility(i)`: the smart cast (§7.5). `useAbility({ dir,
   * point, mag, id, index })`: an aimed cast (ui's drag-aim release, a click on the ability-bar slot in `mouseOnly`);
   * no dir / point → smart. Ends any aiming in progress. Returns true when the ability fired.
   */
  useAbility(arg = 0) {
    if (arg == null || typeof arg === 'number') return this.active[arg ?? 0]?.useAbility() ?? false;
    const c = this._comp(arg.id ?? arg.index ?? null);
    if (!c) return false;
    this._endAim();
    const aimed = (arg.dir && Number.isFinite(arg.dir.x)) || (arg.point && Number.isFinite(arg.point.x));
    return c.useAbility(aimed ? { dir: arg.dir ?? null, point: arg.point ?? null, mag: arg.mag, source: arg.source ?? 'api' } : null);
  }

  /** Seconds of ability cooldown left (§10.1 ability bar), 0 when ready or unknown. */
  cooldownLeft(id) { return this._comp(id)?.cooldownLeft ?? 0; }
  /** 0..1 ability readiness (§10.1 cooldown sweep; the HUD ring). */
  readiness(id) { return this._comp(id)?.readiness ?? 0; }
  /** Could the ability fire now (off cooldown, awake, not mid-cast)? */
  canCast(id) { return !!this._comp(id)?.canCast; }
  /** Static indicator shape / range of a companion's ability (ranges overlay, tooltips), or null. */
  abilityShape(id) { const c = this._comp(id); return c ? abilityShape(c.cfg) : null; }

  /**
   * ui's drag-aim: set the aim of the press being held (`{ dir?, point?, mag? }`, world space), or start an aim when
   * none is held (touch: the portrait button pressed through ui instead of the `ability` action). Shows the indicator.
   */
  aimAbility(req) {
    const c = this._comp(req?.id ?? null);
    if (!c || !c.canCast) return false;
    if (!this._cast) this._cast = { t: 0, shown: true, cancelled: false, device: this.ctx.input?.device ?? 'touch', req: null, viaApi: true };
    this._cast.req = req ?? null; this._cast.shown = true; this._cast.cancelled = false;
    this._refreshAim(c);
    return true;
  }

  /** ✕ / Esc / RMB: drop the ability being aimed; the release then casts nothing. */
  cancelAbilityAim() {
    if (!this._cast) return false;
    this._cast.cancelled = true;
    this.aim.active = false;
    if (this._cast.viaApi) this._endAim();
    return true;
  }

  _endAim() { this._cast = null; this.aim.active = false; this.aim.kittenId = null; this.aim.range = 0; }

  /** The castMode setting (§7.5): 'smart' (default) | 'indicator' | 'dragOnly'. */
  get castMode() { const m = this.ctx.state?.settings?.castMode; return CAST_MODES.includes(m) ? m : 'smart'; }

  /** The request the held press casts with now: the explicit aim (ui / touch drag / RS), else the cursor, else smart. */
  _castReq(cast) {
    const ctx = this.ctx;
    _req.dir = null; _req.point = null; _req.mag = undefined; _req.source = 'smart';
    const r = cast.req;
    if (r && (r.dir || r.point)) { _req.dir = r.dir ?? null; _req.point = r.point ?? null; _req.mag = r.mag; _req.source = r.source ?? 'touch'; return _req; }
    const ex = explicitAim(ctx, _ex);
    if (ex) { cast.explicit = true; _req.dir = ex; _req.mag = ex.mag; _req.source = ex.source; return _req; }
    const g = cursorGround(ctx);
    if (g) { _req.point = g; _req.source = 'cursor'; return _req; }
    return null;
  }

  /** Recompute the shown indicator for the held press. */
  _refreshAim(c) {
    const a = this.aim, cast = this._cast;
    if (!cast || cast.cancelled || !cast.shown) { a.active = false; return; }
    planAbility(this.ctx, c, this._castReq(cast), a.plan);
    a.active = true; a.kittenId = c.kittenId; a.ability = a.plan.ability; a.shape = a.plan.shape; a.valid = a.plan.valid;
    a.source = a.plan.source;
    this._shareAim(a.plan);
  }

  /**
   * AUTOCAM §13 companions 2: the held ability's reach into `player.aim` (range: the wall's far edge, Volley's range,
   * the purr's radius; dir: the aim) so the camera's aim pan leads it. The player re-resolves her own aim every step.
   */
  _shareAim(plan) {
    if (!plan) return;
    const r = plan.shape === 'rect' ? (plan.range ?? 0) + (plan.length ?? 0) / 2 : plan.shape === 'self' ? (plan.width ?? 0) / 2 : plan.range ?? 0;
    this.aim.range = Number.isFinite(r) ? r : 0;
    const pa = this.ctx.player?.aim;
    if (!pa) return;
    if (Number.isFinite(r) && r > 0) pa.range = r;
    if (plan.dir && Number.isFinite(plan.dir.x) && Number.isFinite(plan.dir.z) && pa.dir && (plan.dir.x || plan.dir.z)) { pa.dir.x = plan.dir.x; pa.dir.z = plan.dir.z; }
    pa.active = true;
  }

  /**
   * The ability input (Q / LT / the touch portrait through the `ability` action), per fixed step in play (§6.2–6.4,
   * §7.5): press → hold ≥ CAST.hold (or castMode 'indicator', or an explicit drag / RS aim) shows the indicator;
   * release casts (a tap: at the cursor on KBM, smart on pad and touch; 'dragOnly' touch taps cast nothing);
   * Esc / RMB (`back` / `guard`) or ui's ✕ cancel.
   */
  _updateCast(dt) {
    const ctx = this.ctx, inp = ctx.input, p = ctx.player;
    const c = this.active[0];
    const live = ctx.game.mode === 'play' && !ctx.levels?.loading && !!c && !!p && p.alive !== false && !p.scripted;
    if (!live) { if (this._cast) this._endAim(); return; }
    const pressed = !!inp?.pressed?.('ability');
    const hasDown = typeof inp?.down === 'function';
    const down = hasDown ? !!inp.down('ability') : false;
    const released = typeof inp?.released === 'function' ? !!inp.released('ability') : pressed && !down;
    if (pressed && !this._cast) {
      if (!c.canCast) {                                            // cooling down / napping: nothing to aim
        if (released || !down) return;
        try { inp?.haptic?.('orderRejected'); } catch { /* core mid-edit */ }
        this._cast = { t: 0, shown: false, cancelled: true, device: inp?.device ?? 'kbm', req: null };
        return;
      }
      const dev = inp?.device ?? 'kbm', mode = this.castMode;
      this._cast = { t: 0, shown: mode === 'indicator' || (mode === 'dragOnly' && dev !== 'touch'), cancelled: false, device: dev, req: null };
    }
    const cast = this._cast;
    if (!cast) return;
    if (cast.viaApi) { if (!cast.cancelled) this._refreshAim(c); return; }   // ui drives it (aimAbility / useAbility)
    if (!pressed && !down && !released) { this._endAim(); return; }           // the release was lost (focus loss)
    cast.t += dt;
    // TT3 §11.2: Esc / Backspace or the Stand (RMB / Q / LB) cancels the aim (RMB is no longer a move order)
    if (!cast.cancelled && (inp?.pressed?.('back') || inp?.pressed?.('guard'))) { cast.cancelled = true; this.aim.active = false; }
    if (!cast.cancelled) {
      if (!cast.shown && (cast.t >= CAST.hold || explicitAim(ctx, _ex))) cast.shown = true;
      this._refreshAim(c);
    }
    if (!released) return;
    // release: cast
    let req = null, go = !cast.cancelled && c.canCast;
    if (go && cast.shown) req = this._castReq(cast);
    else if (go) {                                                 // a tap
      if (this.castMode === 'dragOnly' && cast.device === 'touch') go = false;
      else if (cast.device === 'kbm') { const g = cursorGround(ctx); if (g) { _req.dir = null; _req.point = g; _req.mag = undefined; _req.source = 'cursor'; req = _req; } }
      else { const ex = explicitAim(ctx, _ex); if (ex) { _req.dir = ex; _req.point = null; _req.mag = ex.mag; _req.source = ex.source; req = _req; } }
    }
    if (go) c.useAbility(req);
    this._endAim();
  }

  // ------------------------------------------------------------------ click / tap (iso controls)

  /**
   * This area's actors the camera's picker may hit (CONTROLS_SPEC §7.6: kind 'npc' for NPCs, kitten rescues as
   * 'kitten'): each has `pickKind`, `useR` (a `use` order's reach), `interactId` (a level interactable it stands for,
   * e.g. a station keeper) and `use()`. Fills and returns `out`.
   * The active party is NOT offered: a companion trails ~1.3 m behind her, so its pick zone sits exactly where a
   * step-back / sidestep click lands and would swallow the move (worst mid-fight). Those clicks fall through to
   * ground; `use(companionOrId)` still works for direct callers.
   */
  pickables(out = []) {
    out.length = 0;
    for (const a of this.actors) if (a.pickKind && !this.active.includes(a)) out.push(a);
    return out;
  }

  /**
   * She clicked / tapped `target` (an actor or an id) and arrived (the player's `use` order calls this, or the level
   * interactable it stands for): talk, say hello, get rescued. Returns true when something happened.
   */
  use(target) {
    const a = typeof target === 'string' ? this.get(target) : target;
    if (!a?.pickKind) return false;
    if (a.interactId && this.ctx.levels?.current?.interact?.(a.interactId)) return true;
    try { return !!a.use?.(); } catch (e) { console.error('[companions] use failed', e); return false; }
  }

  // ------------------------------------------------------------------ spawning

  _add(actor, id) {
    this.actors.push(actor);
    // a party member keeps its cutscene id (a reloaded level re-spawning the empty squire cage must not steal 'mochi')
    const taken = this.active.some((c) => c.kittenId === id && c !== actor);
    this.ctx.actors.register(actor, taken ? undefined : id);
    this.ctx.scene.add(actor.object3d);
    return actor;
  }

  /** Spawn a scripted NPC (cutscene `spawn` step). 'pudding' creates the Pudding actor. */
  spawnNpc(id, pos, facing = 0) {
    const at = toVec(pos);
    if (at.y === 0) at.y = groundY(this.ctx, at.x, at.z, this.ctx.physics?.heightAt?.(at.x, at.z) ?? 0);
    if (id === 'pudding') {
      if (this.pudding) this.despawn(this.pudding);
      const p = new Pudding(this.ctx, { pos: at, facing });
      this.pudding = p;
      this._add(p, 'pudding');
      p.loadVisual();
      return p;
    }
    const comp = this.active.find((c) => c.kittenId === id);
    if (comp) {                                                   // the party member steps into the scene
      comp.pos.copy(at); comp.facing = facing; comp.vel.set(0, 0, 0); comp.snap(); comp.visual?.snap();
      return comp;
    }
    const prev = this.actors.find((a) => a instanceof NpcActor && a.npcId === id);
    if (prev) this.despawn(prev);
    // a cutscene spawning a service kitten we hold as a rescue (Marmalade at the door, Pip in the wagon) takes over
    const held = this.actors.find((a) => a instanceof LostKitten && a.service && a.kittenId === id);
    if (held) this.despawn(held, { keepDressing: true });
    return this._add(new NpcActor(this.ctx, id, { pos: at, facing }), id);
  }

  /**
   * Place a lost kitten (hide: 'meow' | 'cage' | 'stand' | 'break' | 'climb' | null).
   * opts (all optional): { facing, prop: 'barrel'|'bush', standTime, needClear: arenaId, zoneR, zoneAt, cage: style,
   * hits, hp, play: cutsceneId (companion join scene), y: perch height }.
   */
  spawnKitten(kittenId, pos, hide = null, opts = {}) {
    const after = RESCUE_AFTER[this._levelId()]?.[kittenId];
    if (after && this.ctx.state && !this.ctx.state.getFlag?.(after)) {         // WA16: not before its story beat
      this._waiting = this._waiting.filter((w) => w.args[0] !== kittenId);
      this._waiting.push({ flag: after, args: [kittenId, pos, hide, opts] });
      return null;
    }
    const prev = this.actors.find((a) => a instanceof LostKitten && a.kittenId === kittenId);
    // a level re-placing a kitten replaces ours outright (no second hiding barrel / cage left behind)
    if (prev) this.despawn(prev, { keepDressing: prev.rescued });
    let o = { ...opts, pos: toVec(pos), hide };
    if (opts.cageWith) {                                          // a guest in another kitten's cage (war-wagon)
      const host = this.actors.find((a) => a instanceof LostKitten && a.kittenId === opts.cageWith && a.stateName === 'caged' && !a.host);
      if (host) o = { ...o, host, hide: 'cage' };
      else o = { ...o, hide: null, cageWith: null };              // the host is gone: wait beside where the cage stood
    }
    const k = new LostKitten(this.ctx, kittenId, o);
    if (opts.needClear && this.cleared.has(opts.needClear)) k.cleared = true;
    this._add(k, kittenId);
    k.attachToWorld();
    if (opts.appearOn && this.cleared.has(opts.appearOn) && k.stateName === 'hidden') k.reveal();
    return k;
  }

  /** Lower a hanging cage now (Sage's treetop cage; world's rope objective may call it directly). */
  lowerCage(kittenId = 'sage', dur) {
    const k = this.actors.find((a) => a instanceof LostKitten && a.kittenId === kittenId);
    return k ? k.lower(dur) : false;
  }

  despawn(actor, { keepDressing = true } = {}) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    const d = actor instanceof LostKitten && keepDressing ? actor.releaseDressing() : null;    // the barrel / empty cage stays
    if (d) this.dressing.push(d);
    if (this.pudding === actor) this.pudding = null;
    this.ctx.actors.unregister(actor);
    actor.dispose();
    for (const c of this.active) if (!this.ctx.actors.get(c.kittenId)) this.ctx.actors.register(c, c.kittenId);
  }

  clearLevel() {
    for (const a of [...this.actors]) this.despawn(a);
    for (const d of this.dressing) {
      d.root.removeFromParent();
      d.cage?.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });     // procedural; GLB clones share the cache
      if (d.collider) { try { this.ctx.physics?.removeCollider?.(d.collider); } catch { /* level gone */ } }
      for (const c of d.colliders ?? []) { try { this.ctx.physics?.removeCollider?.(c); } catch { /* level gone */ } }
    }
    this.dressing.length = 0;
    for (const w of this.walls) w.dispose();
    this.walls.length = 0;
    this.spoons.reset();
    this.hub.residents.length = 0; this.hub.active = false;
    this._later.length = 0;
    this._waiting.length = 0;
    this.party.reset();
    for (const c of this.active) { c._endAbility(); c.clearArrows(); c.target = null; }
    this.cleared.clear();
  }

  /** Actor by id among this area's actors (active companions first). */
  get(id) { return this.active.find((c) => c.kittenId === id) ?? this.actors.find((a) => a.actorId === id || a.kittenId === id || a.npcId === id) ?? null; }

  // ------------------------------------------------------------------ Shield Wall

  addWall(wall) { this.walls.push(wall); wall.start(); return wall; }

  /**
   * The live Shield Wall crossed by the XZ segment a → b coming from the wall's outer side (an enemy blow or
   * shot aimed at someone behind it), or null. Combat redirects such hits to the wall (requests/companions.md).
   */
  wallBetween(a, b) {
    if (!a || !b) return null;
    for (const w of this.walls) if (w.alive && w.between(a.x, a.z, b.x, b.z)) return w.posts[Math.floor(w.posts.length / 2)] ?? w;
    return null;
  }

  // ------------------------------------------------------------------ barks

  /**
   * Bark (§6): ≤ 1 per 6 s across the party, `chance` per trigger, no repeat within 60 s; shown in a bubble
   * over the speaker for 1.6 s. `pool` 'any' uses the shared nap / wake / meow lines. 'meow' answers bypass the gate.
   * @returns {string|null} the strings key spoken
   */
  bark(actor, category, { chance = 0.25, force = false, pool = null, dur = 1.6 } = {}) {
    if (!actor?.bubble) return null;
    const keys = (pool === 'any' ? BARKS.any : BARKS[actor.kittenId ?? actor.npcId])?.[category];
    if (!keys?.length) return null;
    let key;
    if (category === 'meow') key = keys[0];
    else key = this.gate.pick(keys, this.ctx.game?.time ?? 0, this.ctx.rng ?? Math.random, { chance, force });
    if (!key) return null;
    const text = lineText(this.ctx, key);
    actor.bubble.show(text, dur);
    actor.visual?.emote('meow');
    this.babble(actor, text);
    return key;
  }

  /**
   * Arena `id` counts as cleared for `needClear` hides (world calls it for arenas restored as cleared from the save,
   * which emit no `arena:clear`). Idempotent.
   */
  markCleared(id) {
    if (!id) return;
    const fresh = !this.cleared.has(id);
    this.cleared.add(id);
    if (fresh) for (const k of this.kittens) k.onArenaClear(id);
  }

  /** Is `actor` within `r` m of her (barks only play where she can hear them; M2 lingering-bark fix). */
  _nearHer(actor, r) {
    const p = this.ctx.player?.pos, a = actor?.pos;
    if (!p || !a) return true;
    const dx = a.x - p.x, dz = a.z - p.z;
    return dx * dx + dz * dz <= r * r;
  }

  /** Babble blips for a bubble line (§16.4), only in play: cutscene dialogue owns the voice channel. */
  babble(actor, text) {
    if (this.ctx.game?.mode !== 'play' && this.ctx.game?.mode !== 'memecam') return;
    try { this.ctx.audio?.babble?.(actor.kittenId ?? actor.npcId ?? 'kitten', text); } catch (e) { console.warn('[companions] babble failed', e); }
  }

  /** A lost kitten was rescued: the active companion may cheer about it. */
  onKittenRescued(k) {
    for (const c of this.active) if (c.napT <= 0 && !c.scripted) { this.bark(c, 'kitten', { chance: 0.25 }); break; }
  }

  // ------------------------------------------------------------------ events

  _onMeow(pos) {
    if (!pos) return;
    for (const c of this.active) c.onMeow();
    for (const k of this.kittens) k.onMeow(pos);
  }

  _onFlag(key, value) {
    const on = value !== undefined && value !== null && value !== false && value !== 0;
    if (on && this._waiting.length) {
      for (const w of this._waiting.filter((x) => x.flag === key)) {
        this._waiting.splice(this._waiting.indexOf(w), 1);
        this._safe('waiting rescue', () => this.spawnKitten(...w.args));
      }
    }
    if (JOIN_FLAGS[key] && on) this.unlock(JOIN_FLAGS[key]);
    if (key === 'meadow.pudding' && this.ctx.levels?.current?.id === 'meadow') {
      if (value === 'netted') {
        if (!this.pudding) this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing);
        if (!this.pudding.netted) this.pudding.setNetted(true);
      } else if (on) {
        if (!this.pudding) { this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing); this.pudding.perchNow(); }
        else this.pudding.free();
      }
    }
  }

  _syncFromState() {
    const want = this.ctx.state?.companions?.active ?? [];
    const have = this.active.map((c) => c.kittenId);
    if (want.length !== have.length || want.some((id, i) => id !== have[i])) this.setActive(want, { quiet: true });
  }

  _onLevelLoaded(p) {
    this._syncFromState();
    for (const c of this.active) if (c.object3d.parent !== this.ctx.scene) this.ctx.scene.add(c.object3d);   // a level swap may clear the scene
    this._place();
    for (const c of this.active) { if (c.napT > 0) c.wake(); c.hp = c.maxHp; c.cooldown = 0; }
    this._ensurePudding(p?.id);
    const id = p?.id ?? this._levelId();
    try { this.placeRescues(id); } catch (e) { console.error('[companions] rescues failed', e); }
    if (id === 'town' && this.hub.isHub(id)) {
      try { this.hub.enter(); } catch (e) { console.error('[companions] hub failed', e); }
    }
    if (id === 'gate') this._placeGateCrew();
  }

  /**
   * Place this level's rescues (rescues.js) that the level itself did not place (world's onLoaded hooks ran first) and
   * that the save still wants. Returns the ids placed.
   */
  placeRescues(levelId = this._levelId()) {
    const rows = RESCUES[levelId];
    if (!rows) return [];
    const st = this.ctx.state, placed = [];
    for (const row of rows) {
      const [id, at, hide, opts = {}] = row;
      if (this.actors.some((a) => (a instanceof LostKitten && a.kittenId === id) || (a instanceof NpcActor && a.npcId === id))) continue;
      if (!rowWanted(levelId, row, st)) continue;
      const y = this.ctx.physics?.heightAt?.(at[0], at[1]) ?? 0;
      this.spawnKitten(id, [at[0], Number.isFinite(y) ? y : 0, at[1]], hide, opts);
      placed.push(id);
    }
    return placed;
  }

  /** Earl Grey (and Pip once freed) at the winch for the Line (§12.6), until the gate is done. */
  _placeGateCrew() {
    const st = this.ctx.state;
    if (st?.getFlag?.('gate.done')) return;
    for (const [id, c] of Object.entries(GATE_CREW)) {
      if (c.when && !st?.getFlag?.(c.when)) continue;
      if (this.actors.some((a) => a.npcId === id || (a.kittenId === id && a.stateName !== 'gone'))) continue;
      const npc = this.spawnNpc(id, [c.at[0], 0, c.at[1]], c.facing);
      npc.homeFacing = c.facing;
    }
  }

  /** CS-08 stands the Spoon Brigade behind her (shot 4 pull-back) and arms it at its end; D-03 reveals Marmalade. */
  _onCutscene(id, start) {
    if (!id) return;
    if (id === 'cs08' && this._levelId() === 'gate') this.spoons.start({ arm: !start });
    if (id === 'd03' && start) { const m = this.kittens.find((k) => k.kittenId === 'marmalade'); if (m?.stateName === 'hidden') m.reveal(); }
    if (id === 'd06' && !start && this._levelId() === 'gate') this._later.push({ t: 3.5, fn: () => this._placeGateCrew() });
  }

  /** Objectives: the treetop rope objective lowers Sage's cage (`lowerOn.objective`). */
  _onObjective(p) {
    if (!p?.id || !p.done) return;
    for (const k of this.kittens) {
      const on = k.opts?.lowerOn?.objective;
      if (k.hanging && (on === p.id || (Array.isArray(on) && on.includes(p.id)))) k.lower();
    }
  }

  /** The giant Gloomjelly pops (§12.5 `square`): Earl Grey tumbles out with his book, then D-04 Earl Grey. */
  _onEnemyDied(p) {
    const e = p?.enemy, def = e?.def ?? {};
    const giant = def.releases === 'earlgrey' || e?.size === 'GIANT' || e?.sizeKey === 'GIANT' || /jelly_giant|giant/i.test(String(p?.type ?? def.id ?? ''));
    if (!giant || this._levelId() !== 'town' || this.ctx.state?.getFlag?.('town.earlgrey')) return;
    if (this.actors.some((a) => a.kittenId === 'earlgrey' || a.npcId === 'earlgrey')) return;
    const src = p.position ?? e?.pos;
    const pos = new THREE.Vector3(src?.x ?? 0, src?.y ?? 0, src?.z ?? 0);
    this._later.push({ t: SWAP.earlGreyDelay, fn: () => {
      const k = this.spawnKitten('earlgrey', [pos.x, pos.y, pos.z], null, { autoRescue: 0.6, leaveTo: [-20, 24], expression: 'smug' });
      k.visual?.setPose('sit', 0); k.visual?.hop(0.45);
      this.ctx.fx?.burst?.('sparkle', k.pos, { count: 16 });
    } });
  }

  /**
   * Pudding's meadow state after CS-03 (`meadow.pudding` 'netted' → in the net, true → perched along the level). Runs
   * on level load (reload after a death or a save) and after every cutscene: a scene that spawned its own Pudding and
   * despawned him at its end (or set the flag before that despawn) must not leave the glade empty.
   */
  _ensurePudding(levelId = this.ctx.levels?.current?.id) {
    if (levelId !== 'meadow' || this.pudding || this.ctx.levels?.loading) return;
    const f = this.ctx.state?.getFlag?.('meadow.pudding');
    if (f === 'netted') { this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing); this.pudding.setNetted(true); }
    else if (f === true) { this.spawnNpc('pudding', PUDDING.net.at, PUDDING.net.facing); if (!this.pudding.perchNow()) this.despawn(this.pudding); }
  }

  _applyQuality(preset) {
    if (!preset) return;
    for (const c of this.active) c.visual?.applyQuality(preset);
    for (const a of this.actors) a.visual?.applyQuality?.(preset);
  }

  // ------------------------------------------------------------------ loop

  update(dt) {
    const ctx = this.ctx, g = ctx.game;
    this.swapT = Math.max(0, this.swapT - dt);
    if (this._later.length && (g.mode === 'play' || g.mode === 'memecam')) {
      for (let i = this._later.length - 1; i >= 0; i--) {
        const l = this._later[i];
        if ((l.t -= dt) > 0) continue;
        this._later.splice(i, 1);
        try { l.fn(); } catch (e) { console.error('[companions] timed call failed', e); }
      }
    }
    this._updateCast(dt);
    for (const c of this.active) c.update(dt);
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      a.update(dt);
      if (a.stateName === 'gone' && a instanceof LostKitten) this.despawn(a);
    }
    if (g.mode === 'play' || g.mode === 'memecam') {
      for (let i = this.walls.length - 1; i >= 0; i--) if (!this.walls[i].update(dt)) this.walls.splice(i, 1);
    }
    this.spoons.update(dt);
    this.hub.update(dt);
    this.party.update(dt);
    if (this.aim.active && this._cast) this._shareAim(this.aim.plan);       // after her own step re-resolved it
  }

  render(alpha, dt) {
    for (const c of this.active) c.render(alpha, dt);
    for (const a of this.actors) a.render(alpha, dt);
    for (const w of this.walls) w.render(dt);
    this.spoons.render(dt);
    this.indicator.render(dt ?? 0);
    this.party.render(visualDt(this.ctx, dt ?? 0));
  }

  dispose() {
    this._endAim();
    this.indicator.dispose();
    this.clearLevel();
    this.party.dispose();
    for (const c of this.active) { this.ctx.actors.unregister(c); c.dispose(); }
    this.active = [];
    for (const off of this._offs) off();
    this._offs.length = 0;
  }
}
