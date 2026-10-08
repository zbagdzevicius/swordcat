// tests/smoke/player.mjs  (owner: player) — Swordcat's §7 moveset in the running game (GAME_DESIGN §19.9 items 2–5
// plus the player's own checks). Screenshots go to tests/shots/player/ (Read them when reviewing).
//   player:move      W runs (≥ 4.5 m/s, 'run'), Space jumps and lands, the 3-hit combo chains (combo 1 → 2 → 3)
//   player:parry     a passive rat_pike pokes into a fresh Stand → player:parry +20 Valor; ⚔ within 0.8 s → Riposte;
//                    a late poke is a block (1 Grit); Standing Ground pays Valor while planted near an alerted rat
//   player:dodge     Shift Tumbles; a poke during the i-frames → player:perfectDodge (+12 Valor, crit window)
//   player:holy      §19.9.4: setShards(1), setValor(50), hold J 1.3 s → player:holy (Valor −50) → holy.png
//   player:golden    setShards(2), setValor(100), V → Golden Hour (fog ×0.5), its end → Sunburst + player:golden off
//   player:lives     Still Standing at 1 HP, then a faint (player:lifeLost, 8 lives) and the respawn at full HP;
//                    Milk Break heals 4; Meow
//   player:memecam   §19.9.5: idle(16) → Meme Cam (camera:meme, mode memecam, Oath) → memecam.png + blank check; W exits
//   player:look      studio gallery: idle, Big Swoosh, the Stand, Golden Hour Oath, run (SMOKE_PLAYER_LOOK=full: every
//                    pose / swing — slash1-3, bright, riposte, jump, pounce, sip, charge, holy, hurt, faint)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'player');
fs.mkdirSync(DIR, { recursive: true });

/** Page-side helpers, installed once per block on __GAME__.__pl. */
const HELPERS = `({
  g: () => window.__GAME__,
  /** Spawn an AI-less enemy at (angle relative to her facing, distance), facing her. */
  rat(rel = 0, dist = 1.3, type = 'rat_pike') {
    const g = window.__GAME__, ctx = g.ctx, p = ctx.player, THREE = g.THREE;
    const a = p.facing + rel;
    const pos = new THREE.Vector3(p.pos.x + Math.sin(a) * dist, 0, p.pos.z + Math.cos(a) * dist);
    pos.y = ctx.physics.heightAt(pos.x, pos.z);
    const e = ctx.enemies.spawn(type, pos, { facing: Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z) });
    e.ai = false;
    return e;
  },
  /** One enemy attack into her through the real resolve path. */
  poke(e, id = 'rat_poke', extra = null) {
    const ctx = window.__GAME__.ctx, def = extra ? { ...ctx.config.ATTACKS[id], ...extra } : ctx.config.ATTACKS[id];
    return ctx.combat.applyHit(e, ctx.player, def);
  },
  /** Resolve after n rendered frames. */
  frames(n) { return window.__GAME__.waitFrames(n); },
  /**
   * Resolve when pred(player, ctx) is true (checked every frame), else false once "timeout" ms have passed in real
   * time AND as simulation time (a loaded GPU renders a few fps: real-time-only waits would give up too early), or
   * after 4 × timeout real ms at the latest.
   */
  until(pred, timeout = 8000) {
    const g = window.__GAME__, game = g.ctx.game;
    return new Promise((resolve) => {
      const t0 = performance.now(), s0 = game.time;
      const off = game.addFrameHook(() => {
        let ok = false; try { ok = !!pred(g.ctx.player, g.ctx); } catch (e) { ok = false; }
        const real = performance.now() - t0, sim = (game.time - s0) * 1000;
        if (ok || (real > timeout && sim > timeout) || real > timeout * 4) { off(); resolve(ok); }
      });
    });
  },
  /** Resolve after "sec" of SIMULATION time (first-use shader compiles stall frames; real-time waits lie). */
  simWait(sec, timeout = 15000) {
    const t0 = window.__GAME__.ctx.game.time;
    return this.until((p, ctx) => ctx.game.time - t0 >= sec, timeout);
  },
  /** Press / release an input action as the keyboard would (released one frame later). */
  tap(action) { const input = window.__GAME__.ctx.input; input._press(action, 'k:test'); return this.frames(1).then(() => input._release(action, 'k:test')); },
  /** Run start(g), then freeze the sim (time scale 0) once pred(player, ctx) is true. */
  freezeWhen(start, pred, timeout = 15000) {
    const g = window.__GAME__, game = g.ctx.game;
    game.setTimeScale(1);
    start(g);
    return this.until(pred, timeout).then((ok) => { game.setTimeScale(0); return ok; });
  },
  /** Studio framing around her (anchor-local [x, y, z]; +X = her left, +Z = in front of her). */
  cam(pos = [1.5, 0.85, 2.3], look = [0, 0.5, 0], fov = 36) {
    window.__GAME__.ctx.cam.preset('HERO_LOW', 'swordcat', { pos, look, fov, blend: 0, mode: 'cut' });
  },
  resume() { const ctx = window.__GAME__.ctx; ctx.game.setTimeScale(1); ctx.cam.mode('follow', { blend: 0 }); },
  /** Small player summary for assertions. */
  ps() {
    const p = window.__GAME__.ctx.player;
    return { state: p.state, name: p.stateName, hp: p.hp, maxHp: p.maxHp, valor: p.valor, grit: p.grit, lives: p.lives, milk: p.milk,
      alive: p.alive, golden: p.golden, guarding: p.guarding, swing: p.swing?.def.id ?? null, onGround: p.onGround,
      speed: Math.hypot(p.vel.x, p.vel.z), pos: p.pos.toArray(), y: p.pos.y, critT: p.critT, charge: p.charge, tier: p.chargeTier };
  },
})`;

async function install(t, { god = true } = {}) {
  await t.G(([src, godOn]) => {
    const g = window.__GAME__;
    // eslint-disable-next-line no-new-func
    g.__pl = new Function(`return ${src}`)();
    g.god(godOn);
    g.ctx.game.setTimeScale(1);
    g.ctx.input.setDevice?.('kbm');
    // our own event log (player:*, camera:meme, the HIT results): __GAME__.events is a 200-entry ring buffer that
    // footsteps / env / audio chatter can overrun on a slow, loaded GPU
    g.__plTapOff?.();
    g.__plEv = [];
    g.__plTapOff = g.ctx.bus.tap((type, e) => {
      if (!/^player:|^camera:meme|^combat:hit$/.test(type)) return;
      g.__plEv.push({ type, attackId: e?.attackId, combo: e?.combo, on: e?.on, graze: e?.graze, phase: e?.phase, lives: e?.lives,
        result: e?.result, toPlayer: e?.target === g.ctx.player, t: g.ctx.game.time });
    });
    return true;
  }, [HELPERS, god]);
  await t.frames(5);
}

/** Names of the player events since install / the last clearEv. */
const pev = (t) => t.G(() => window.__GAME__.__plEv.map((e) => e.type));
const clearEv = (t) => t.G(() => { window.__GAME__.__plEv.length = 0; return true; });
const plast = (t, name) => t.G((n) => [...window.__GAME__.__plEv].reverse().find((e) => e.type === n) ?? null, name);
/** Resolves true when `name` was recorded within `ms` real ms. */
async function waitEv(t, name, ms = 8000) {
  try { await t.page.waitForFunction((n) => window.__GAME__.__plEv?.some((e) => e.type === n), name, { timeout: ms, polling: 50 }); return true; }
  catch { return false; }
}
/** Screenshot with the simulation paused (a loaded GPU can take seconds per screenshot; the game must not move on). */
async function shot(t, name) {
  await t.G(() => { const g = window.__GAME__.ctx.game; window.__GAME__.__plScale = g.baseTimeScale ?? 1; g.setTimeScale(0); return true; });
  await t.frames(2);
  await t.shot(name);
  await t.G(() => { window.__GAME__.ctx.game.setTimeScale(window.__GAME__.__plScale ?? 1); return true; });
}

const ps = (t) => t.G(() => window.__GAME__.__pl.ps());
/** Wait for a sim-side condition (source of a (p, ctx) => bool expression), up to `ms` real ms. */
const until = (t, pred, ms = 8000) => t.G(([src, m]) => window.__GAME__.__pl.until(new Function('p', 'ctx', `return (${src})`), m), [pred, ms]);
const simWait = (t, sec) => t.G((x) => window.__GAME__.__pl.simWait(x), sec);

/** Freeze a pose, frame it, screenshot tests/shots/player/look-<name>.png, resume. */
async function pose(t, name, start, pred, cam) {
  const ok = await t.G(([s, p]) => window.__GAME__.__pl.freezeWhen(new Function('g', s), new Function('p', 'ctx', `return (${p})`)), [start, pred]);
  await t.G(([c]) => { window.__GAME__.__pl.cam(...(c ?? [])); return true; }, [cam]);
  await t.frames(3);
  await t.shot(`player/look-${name}`);
  if (!ok) t.warn(`look ${name}: condition not reached`);
  await t.G(() => { window.__GAME__.__pl.resume(); return true; });
  await t.frames(2);
}

export default [
  // ------------------------------------------------------------------ locomotion + combo (§19.9.2)
  {
    name: 'player:move', order: 20, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      const a = await ps(t);
      await t.page.keyboard.down('KeyW');
      await until(t, 'Math.hypot(p.vel.x, p.vel.z) > 5.0 && p.stateName === "run"', 4000);
      const mid = await ps(t);
      await shot(t, 'player/move-run');
      await t.page.keyboard.up('KeyW');
      const moved = Math.hypot(mid.pos[0] - a.pos[0], mid.pos[2] - a.pos[2]);
      t.assert(moved > 0.5, `W: moved only ${moved.toFixed(2)} m`);
      t.assert(mid.speed > 4.5 && (mid.name === 'run' || mid.name === 'zoomies'), `W: expected a run at ~5.5 m/s, got ${mid.name} ${mid.speed.toFixed(2)} m/s`);
      await t.wait(400);
      // jump: Space → airborne → lands (apex ~1.2 m)
      await clearEv(t);
      const apex = await t.G(() => new Promise((resolve) => {        // held jump, measured in the page (no latency)
        const g = window.__GAME__, p = g.ctx.player, input = g.ctx.input, y0 = p.pos.y; let top = 0, left = false;
        input._press('jump', 'k:Space');
        const done = () => { off(); input._release('jump', 'k:Space'); resolve(top); };
        const off = g.ctx.game.addFrameHook(() => { top = Math.max(top, p.pos.y - y0); if (!p.onGround) left = true; if (left && p.onGround) done(); });
        setTimeout(done, 6000);
      }));
      const ev = await pev(t);
      t.assert(ev.includes('player:jump') && ev.includes('player:land'), 'Space: player:jump / player:land not emitted');
      t.assert(apex > 0.9 && apex < 1.5, `jump apex ${apex.toFixed(2)} m (expected ~1.2)`);
      // the 3-hit combo
      await clearEv(t);
      await t.G(async () => {                                              // presses paced by the swing clock, page-side: the
        const L = window.__GAME__.__pl;                                    // harness round trip can outlast a 0.4 s swing
        await L.tap('attack');
        await L.until((p) => p.swing?.def.id === 'slash1' && p.swing.t >= 0.2); await L.tap('attack');
        await L.until((p) => p.swing?.def.id === 'slash2' && p.swing.t >= 0.2); await L.tap('attack');
        return L.until((p) => p.swing?.def.id === 'slash3' && p.swing.t >= 0.24);
      });
      await shot(t, 'player/move-combo');
      await until(t, 'p.state === "move"');
      const combos = await t.G(() => window.__GAME__.__plEv.filter((e) => e.type === 'player:swing').length);
      const last = await plast(t, 'player:swing');
      t.assert(combos >= 3, `combo: ${combos} player:swing`);
      t.assert(last?.combo === 3 || last?.attackId === 'slash3', `combo: the third swing is ${last?.attackId} (combo ${last?.combo}), expected slash3`);
      const end = await ps(t);
      t.assert(end.state === 'move', `back to move after the combo (${end.state})`);
      t.log(`run ${mid.speed.toFixed(2)} m/s, moved ${moved.toFixed(2)} m, apex ${apex.toFixed(2)} m, combo → ${last?.attackId}`);
    },
  },

  // ------------------------------------------------------------------ the Stand, parry, Riposte, block, Standing Ground
  {
    name: 'player:parry', order: 21, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      const r = await t.G(async () => {
        const L = window.__GAME__.__pl, ctx = window.__GAME__.ctx, p = ctx.player;
        const rat = L.rat(0, 1.3);
        await L.frames(3);
        ctx.input._press('guard', 'k:KeyL');
        await L.until((pl) => pl.guarding && pl.guardT > 0.02, 1000);
        const guardT = p.guardT;
        const res = L.poke(rat);
        const s = L.ps();
        await L.frames(2);
        await L.tap('attack');                    // ⚔ within 0.8 s → Riposte, with the Stand still held (real play)
        const rip = await L.until((pl) => pl.swing?.def.id === 'riposte', 1500);
        // the held Stand must not cancel it: it reaches its active frames, then she is back in the Stand
        const ripActive = await L.until((pl) => pl.swing?.def.id === 'riposte' && pl.swing.t >= 0.12 || pl.state === 'guard', 1500) && p.swing?.def.id === 'riposte';
        const ripState = p.state;
        const after = (await L.until((pl) => pl.state === 'guard' && !pl.swing, 2000)) ? 'guard' : p.state;
        ctx.input._release('guard', 'k:KeyL');
        return { res, guardT, valor: s.valor, hp: s.hp, rip, ripActive, ripState, after };
      });
      t.assert(r.res === 'parry', `poke into a fresh Stand (guardT ${r.guardT.toFixed(3)}): ${r.res}, expected parry`);
      t.assert(r.valor >= 20, `parry Valor ${r.valor}`);
      t.assert(await waitEv(t, 'player:parry', 3000), 'player:parry not emitted');
      t.assert(r.rip, 'no Riposte from ⚔ within 0.8 s of the parry');
      t.assert(r.ripActive && r.ripState === 'attack' && r.after === 'guard', `held Stand vs Riposte: reached active ${r.ripActive} (${r.ripState}), then ${r.after} (expected guard)`);
      await shot(t, 'player/riposte');
      await until(t, 'p.state === "move"');
      // a poke into a Stand held 0.4 s is a block (1 Grit, no damage)
      const b = await t.G(async () => {
        const L = window.__GAME__.__pl, ctx = window.__GAME__.ctx, p = ctx.player;
        const rat = ctx.enemies.list.find((e) => e.alive) ?? L.rat(0, 1.3);
        p.facing = Math.atan2(rat.pos.x - p.pos.x, rat.pos.z - p.pos.z);
        ctx.input._press('guard', 'k:KeyL');
        await L.until((pl) => pl.guardT > 0.4, 2000);
        const hp = p.hp, grit = p.grit;
        const res = L.poke(rat);
        return { res, dHp: hp - p.hp, dGrit: grit - p.grit };
      });
      t.assert(b.res === 'block' && b.dHp === 0 && b.dGrit === 1, `late poke: ${b.res}, hp −${b.dHp}, Grit −${b.dGrit} (expected block, 0, 1)`);
      // Standing Ground: planted in the Stand near an alerted rat → Valor climbs
      const sg = await t.G(async () => {
        const L = window.__GAME__.__pl, ctx = window.__GAME__.ctx, p = ctx.player;
        for (const e of ctx.enemies.list) { e.alerted = true; e.stateName = 'chase'; }
        const v0 = p.valor;
        await L.until((pl) => pl.valor - v0 >= 5, 10000);                // 1 s planted, then +5/s
        const standing = p.standingGround;
        ctx.input._release('guard', 'k:KeyL');
        return { gain: p.valor - v0, standing };
      });
      t.assert(sg.gain >= 5 && sg.standing, `Standing Ground: +${sg.gain.toFixed(1)} Valor while planted (standing ${sg.standing})`);
      t.log(`parry at guardT ${r.guardT.toFixed(3)}, Valor ${r.valor}, block ok, Standing Ground +${sg.gain.toFixed(1)}`);
      await t.G(() => { for (const e of window.__GAME__.ctx.enemies.list) window.__GAME__.ctx.enemies.despawn(e); return true; });
    },
  },

  // ------------------------------------------------------------------ Tumble + Purrfect Dodge
  {
    name: 'player:dodge', order: 22, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      await clearEv(t);
      const r = await t.G(async () => {
        const L = window.__GAME__.__pl, ctx = window.__GAME__.ctx, p = ctx.player;
        const rat = L.rat(Math.PI * 0.5, 1.4);
        await L.frames(3);
        const x0 = p.pos.clone();
        ctx.input._press('dodge', 'k:ShiftLeft');
        await L.until((pl) => pl.state === 'dodge' && pl.guardState.dodgeT >= 0.06, 1500);
        ctx.input._release('dodge', 'k:ShiftLeft');
        const res = L.poke(rat);
        const v = p.valor, crit = p.critT;
        await L.until((pl) => pl.state !== 'dodge', 1500);
        return { res, v, crit, dist: Math.hypot(p.pos.x - x0.x, p.pos.z - x0.z) };
      });
      const ev = await pev(t);
      t.assert(ev.includes('player:dodge'), 'player:dodge not emitted');
      t.assert(r.res === 'immune' && ev.includes('player:perfectDodge'), `poke in the i-frames: ${r.res}, perfectDodge ${ev.includes('player:perfectDodge')}`);
      t.assert(r.v >= 12 && r.crit > 0.5, `Purrfect Dodge: Valor ${r.v}, crit window ${r.crit.toFixed(2)} s`);
      t.assert(r.dist > 1.8 && r.dist < 3.4, `Tumble distance ${r.dist.toFixed(2)} m (expected ~2.6)`);
      await pose(t, 'dodge', 'g.ctx.player.startDodge()', 'p.state === "dodge" && p.stateT >= 0.14', [[2.4, 0.6, 0.6], [0, 0.4, 0.3], 40]);
      t.log(`Tumble ${r.dist.toFixed(2)} m, perfect dodge → Valor ${r.v}`);
      await t.G(() => { for (const e of window.__GAME__.ctx.enemies.list) window.__GAME__.ctx.enemies.despawn(e); return true; });
    },
  },

  // ------------------------------------------------------------------ charge → Holy Slash (§19.9.4)
  {
    name: 'player:holy', order: 23, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      await t.G(() => { const g = window.__GAME__; g.player.setShards(1); g.player.setValor(50); return true; });
      await clearEv(t);
      await t.page.keyboard.down('KeyJ');
      await until(t, 'p.state === "charge" && p.chargeT >= 1.15', 6000);
      const mid = await ps(t);
      await shot(t, 'player/charge');
      await t.page.keyboard.up('KeyJ');
      const holy = await waitEv(t, 'player:holy', 8000);
      await until(t, 'p.swing?.def.id === "holy" && p.swing.t >= 0.27', 4000);
      await shot(t, 'player/holy');
      const after = await ps(t);
      t.assert(mid.state === 'charge' && mid.tier === 2, `holding J 1.15 s: state ${mid.state} tier ${mid.tier}, expected charge tier 2`);
      t.assert(holy, `release after 1.3 s with Shard 1 + Valor 50: no player:holy (tier ${mid.tier})`);
      t.assert(after.valor <= 0.5, `Holy costs 50 Valor (left ${after.valor})`);
      // without the shard the charge fizzles into a Bright Slash
      await until(t, 'p.state === "move"');
      await t.G(() => { const g = window.__GAME__; g.player.setShards(0); g.player.setValor(80); return true; });
      await clearEv(t);
      await t.page.keyboard.down('KeyJ');
      await until(t, 'p.state === "charge" && p.chargeT >= 1.2', 6000);
      await t.page.keyboard.up('KeyJ');
      await until(t, 'p.swing?.def.id === "bright"', 2000);
      const sw = await plast(t, 'player:swing');
      const ev = await pev(t);
      t.assert(!ev.includes('player:holy') && sw?.attackId === 'bright', `no shard: expected bright, got ${sw?.attackId} (holy ${ev.includes('player:holy')})`);
      t.log(`charge tier ${mid.tier} → holy; no shard → ${sw?.attackId}`);
    },
  },

  // ------------------------------------------------------------------ Golden Hour
  {
    name: 'player:golden', order: 24, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      await t.G(() => { const g = window.__GAME__; g.player.setShards(2); g.player.setValor(100); return true; });
      await clearEv(t);
      const fog0 = await t.G(() => window.__GAME__.ctx.env?.fogDensity ?? 0);
      await t.tap('KeyV');
      t.assert(await waitEv(t, 'player:golden', 8000), 'V with full Valor + Shard 2: no player:golden');
      await until(t, 'p.state === "golden" && p.stateT >= 0.4');
      await shot(t, 'player/golden-oath');
      const s = await ps(t);
      t.assert(s.golden && s.valor === 0, `Golden Hour: golden ${s.golden}, Valor ${s.valor}`);
      await until(t, 'p.state === "move"');
      await until(t, `(ctx.env?.fogDensity ?? 0) < ${fog0 * 0.6}`, 4000);
      const fog1 = await t.G(() => window.__GAME__.ctx.env?.fogDensity ?? 0);
      t.assert(fog1 < fog0 * 0.8 || fog0 === 0, `fog density ${fog0.toFixed(3)} → ${fog1.toFixed(3)} (expected ×0.5)`);
      await t.tap('KeyJ');
      await until(t, 'p.swing && p.swing.t >= 0.16');
      await shot(t, 'player/golden-slash');
      // fast-forward to the end: Sunburst + Valor lock
      const end = await t.G(() => new Promise((resolve) => {             // event order, not frame timing (loaded GPU)
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        let off = false, sun = false;
        const o1 = ctx.bus.on(E.PLAYER_GOLDEN, (e) => { if (e?.on === false) off = true; });
        const o2 = ctx.bus.on(E.PLAYER_SWING, (e) => { if (e?.attackId === 'sunburst' && off) sun = true; });
        ctx.player.goldenT = 0.1;
        g.__pl.until(() => off && sun, 15000).then(() => { o1(); o2(); resolve({ off, sun, golden: ctx.player.golden }); });
      }));
      t.assert(end.off && end.sun && !end.golden, `Golden Hour end: off ${end.off}, automatic Sunburst ${end.sun}`);
      if (await until(t, 'p.swing?.def.id === "sunburst" && p.swing.t >= 0.24', 4000)) await shot(t, 'player/sunburst');
      const last = await plast(t, 'player:golden');
      t.assert(last && last.on === false, 'player:golden {on: false} not emitted');
      t.log(`fog ${fog0.toFixed(3)} → ${fog1.toFixed(3)}`);
    },
  },

  // ------------------------------------------------------------------ health, Still Standing, Nine Lives, Milk, Meow
  {
    name: 'player:lives', order: 25, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t, { god: false });
      await clearEv(t);
      const r = await t.G(async () => {
        const L = window.__GAME__.__pl, ctx = window.__GAME__.ctx, p = ctx.player;
        const rat = L.rat(0, 1.3);
        await L.frames(3);
        p.hp = 1; p.invulnT = 0;
        const res1 = L.poke(rat, 'rat_poke', { dmg: 2 });
        const ss = { res: res1, hp: p.hp, alive: p.alive, state: p.state };
        await L.until((pl) => pl.immuneT <= 0 && pl.state === 'move', 4000);
        p.invulnT = 0; p.hp = 1;
        const res2 = L.poke(rat, 'rat_poke', { dmg: 2 });
        return { ss, res2, alive: p.alive, state: p.state, lives: p.lives };
      });
      t.assert(r.ss.alive && r.ss.hp === 1 && r.ss.state === 'rise', `Still Standing: ${JSON.stringify(r.ss)}`);
      const ev = await pev(t);
      t.assert(ev.includes('player:stillStanding'), 'player:stillStanding not emitted');
      t.assert(!r.alive && r.state === 'dead' && ev.includes('player:lifeLost') && r.lives === 8, `faint: alive ${r.alive}, state ${r.state}, lives ${r.lives}`);
      await until(t, 'p.state === "dead" && p.stateT >= 1.0');
      await shot(t, 'player/faint');
      const back = await t.G(() => window.__GAME__.__pl.until((p) => p.alive && p.state === 'move', 12000));
      const s = await ps(t);
      t.assert(back && s.hp === s.maxHp, `respawn: alive ${s.alive}, hp ${s.hp}/${s.maxHp}`);
      // Milk Break
      await t.G(() => { const p = window.__GAME__.ctx.player; p.hp = 3; p.invulnT = 0; p.blinkT = 0; for (const e of window.__GAME__.ctx.enemies.list) window.__GAME__.ctx.enemies.despawn(e); return true; });
      await clearEv(t);
      const milk0 = (await ps(t)).milk;
      await t.tap('KeyR');
      await until(t, 'p.state === "sip" && p.stateT >= 0.3');
      await shot(t, 'player/milk');
      await until(t, 'p.state === "move"');
      const m = await ps(t);
      t.assert(m.hp === 7 && m.milk === milk0 - 1, `Milk Break: hp ${m.hp} (expected 7), milk ${milk0} → ${m.milk}`);
      // Meow
      await clearEv(t);
      await t.tap('KeyC');
      t.assert(await waitEv(t, 'player:meow', 4000), 'C: player:meow not emitted');
      await t.G(() => { window.__GAME__.god(true); return true; });
      t.log(`Still Standing → faint → lives ${r.lives} → respawn ${s.hp}/${s.maxHp}; milk ${milk0} → ${m.milk}`);
    },
  },

  // ------------------------------------------------------------------ Meme Cam (§19.9.5)
  {
    name: 'player:memecam', order: 26, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      await t.wait(300);
      await clearEv(t);
      await t.G(() => { window.__GAME__.idle(16); return true; });
      const on = await waitEv(t, 'camera:meme', 8000);
      t.assert(on, 'idle(16): camera:meme not emitted');
      await simWait(t, 2.6);                                                // 2.0 s glide into MEME_LOOP + caption
      const st = await t.state();
      t.assert(st.mode === 'memecam' && st.player.state === 'memecam', `Meme Cam: mode ${st.mode}, player ${st.player.state}`);
      await shot(t, 'player/memecam');
      await t.blankCheck('memecam');
      await t.page.keyboard.down('KeyW');
      await until(t, 'ctx.game.mode === "play"', 3000);
      await t.page.keyboard.up('KeyW');
      const st2 = await t.state();
      t.assert(st2.mode === 'play', `any input exits the Meme Cam (mode ${st2.mode})`);
    },
  },

  // ------------------------------------------------------------------ the pose / swing gallery (visual review)
  {
    name: 'player:look', order: 29, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      const full = process.env.SMOKE_PLAYER_LOOK === 'full';
      await install(t);
      await t.frames(20);
      await pose(t, 'idle', '', 'true');
      if (full) await pose(t, 'slash1', 'g.ctx.player.startAttack("slash1")', 'p.swing && p.swing.t >= 0.15');
      if (full) await pose(t, 'slash2', 'g.ctx.player.startAttack("slash2")', 'p.swing && p.swing.t >= 0.15');
      if (full) await pose(t, 'slash3-wind', 'g.ctx.player.startAttack("slash3")', 'p.swing && p.swing.t >= 0.15');
      await pose(t, 'slash3', 'g.ctx.player.startAttack("slash3")', 'p.swing && p.swing.t >= 0.26');
      if (full) await pose(t, 'bright', 'g.ctx.player.startAttack("bright")', 'p.swing && p.swing.t >= 0.2');
      if (full) await pose(t, 'riposte', 'g.ctx.player.startAttack("riposte")', 'p.swing && p.swing.t >= 0.15');
      await pose(t, 'guard', 'g.ctx.input._press("guard", "t")', 'p.state === "guard" && p.guardT > 0.3');
      await t.G(() => { window.__GAME__.ctx.input._release('guard', 't'); return true; });
      await t.frames(20);
      if (full) await pose(t, 'jump', 'g.ctx.player.doJump()', '!p.onGround && p.vel.y < 1');
      await t.frames(40);
      if (full) await pose(t, 'pounce', 'g.ctx.player.doJump(); setTimeout(() => g.ctx.player.setState("pounce"), 250)', 'p.state === "pounce" && p.stateT >= 0.13');
      await t.frames(40);
      if (full) await pose(t, 'sip', 'g.ctx.player.hp = 3; g.ctx.player.setState("sip")', 'p.state === "sip" && p.stateT > 0.3');
      await t.frames(40);
      if (full) await pose(t, 'charge', 'g.player.setShards(1); g.player.setValor(60); g.ctx.input._press("attack", "t")', 'p.state === "charge" && p.chargeT > 1.2');
      await t.G(() => { window.__GAME__.ctx.input._release('attack', 't'); return true; });
      await t.frames(70);
      if (full) await pose(t, 'holy', 'g.player.setValor(60); g.ctx.player.startAttack("holy")', 'p.swing && p.swing.t >= 0.3');
      await t.frames(60);
      if (full) await pose(t, 'hurt', 'const p = g.ctx.player; p.hp = 8; p.invulnT = 0; p.onHit({ dmg: 1, attacker: null, def: { knock: 3 } })', 'p.state === "hurt" && p.stateT > 0.08');
      await t.frames(40);
      await pose(t, 'golden', 'g.player.setShards(2); g.player.setValor(100); g.ctx.player.startGolden()', 'p.state === "golden" && p.stateT > 0.4');
      await t.frames(50);
      if (full) await pose(t, 'golden-run', 'g.ctx.input.setVirtualMove(0, 1)', 'Math.hypot(p.vel.x, p.vel.z) > 5.3');
      await t.G(() => { const g = window.__GAME__; g.ctx.input.setVirtualMove(0, 0); g.ctx.input.setDevice('kbm'); g.ctx.player.endGolden(false); return true; });
      await t.frames(30);
      if (full) await pose(t, 'run', 'g.ctx.input.setVirtualMove(0, 1)', 'Math.hypot(p.vel.x, p.vel.z) > 5.3', [[0.0, 0.9, 3.0], [0, 0.5, 0], 36]);
      await pose(t, 'run-side', full ? '' : 'g.ctx.input.setVirtualMove(0, 1)', full ? 'true' : 'Math.hypot(p.vel.x, p.vel.z) > 5.3', [[2.6, 0.7, 0.4], [0, 0.45, 0.2], 36]);
      await t.G(() => { const g = window.__GAME__; g.ctx.input.setVirtualMove(0, 0); g.ctx.input.setDevice('kbm'); return true; });
      await t.frames(30);
      if (full) await pose(t, 'faint', 'const p = g.ctx.player; p.god = false; p.hp = 0; p.alive = false; p.onDeath()', 'p.state === "dead" && p.stateT > 1.2');
      if (full) await t.G(() => window.__GAME__.__pl.until((p) => p.alive, 5000));
    },
  },
];
