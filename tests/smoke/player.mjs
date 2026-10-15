// tests/smoke/player.mjs  (owner: player) — Swordcat's §7 moveset in the running game (GAME_DESIGN §19.9 items 2–5
// plus the player's own checks). Screenshots go to tests/shots/player/ (Read them when reviewing).
//   player:move      W runs (≥ 4.5 m/s, 'run'), jump (F) and land, the 3-hit combo chains (combo 1 → 2 → 3)
//   player:parry     a passive rat_pike pokes into a fresh Stand → player:parry +20 Valor; ⚔ within 0.8 s → Riposte;
//                    a late poke is a block (1 Grit); Standing Ground pays Valor while planted near an alerted rat
//   player:dodge     Shift Tumbles; a poke during the i-frames → player:perfectDodge (+12 Valor, crit window)
//   player:holy      §19.9.4: setShards(1), setValor(50), hold J 1.3 s → player:holy (Valor −50) → holy.png
//   player:golden    setShards(2), setValor(100), V → Golden Hour (fog ×0.5), its end → Sunburst + player:golden off
//   player:lives     Still Standing at 1 HP, then a faint (player:lifeLost, 8 lives) and the respawn at full HP;
//                    Milk Break heals 4; Meow
//   player:memecam   §19.9.5: idle(16) → Meme Cam (camera:meme, mode memecam, Oath) → memecam.png + blank check; W exits
//   player:upgrades  M2 §13.3: satchel II → milkMax 4 (filled), Valor Gain ×1.25, Sharpness III ×1.5, Quick Charge tier 2 < 1.05 s
//   player:standing  M2 §7.3: Standing Ground pays through a block; stops when the rat targets a companion → standing-ground.png
//   player:cosmetics M2 §13.4/§13.5: six skin + cape pairs → look-skin-*.png; Even More Too Big tip on the ground / trailing
//   player:click-move    CONTROLS_SPEC §12: a real RMB click (`moba`) ≥ 9 m away past the practice fence at the barn
//                        door (TT2's open link): the path takes it, she auto-hops it and arrives within 0.5 m
//   player:attack-order  hover a rat (player.hover = enemy), LMB it (TT3 §11.2): attack order + selection, paths, chains
//   player:stand-snap    a rat winds up behind her: the Stand turns her to it on its first step; parry / block (Q fan)
//   player:wasd-override D cancels a click-move (`mouseOnly`) at once ('direct'); J cancels a move order and swings
//   player:touch         844×390 + 390×844 hasTouch: tap-to-move, tap a rat = loop auto-attack until it falls,
//                        hold 🛡 → parry → Auto-Riposte by itself, the ±90° touch guard arc
//   player:warm      Phase W / AUTOCAM: moveIntent order + groundY, idle steps (glance, groom, twirl), the knock-out sit
//                    + boing back, the Snip! word → warm-*.png
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

// ------------------------------------------------------------------ TT5 package J: the jump driver (page side)
/**
 * window.__jd(o): teleport her to (o.x, o.z) on the highest walkable top, then for o.dur s of SIMULATION time push the
 * stick toward (o.dx, o.dz) (world; converted through the camera's stick yaw) at o.mag, press Jump at o.jumpAt s and
 * release it o.hold s later; with o.twirl press it again right after the release and hold it (the Ribbon Twirl).
 * Resolves { start, end, top (feet above the start), twirled, jumped }.
 */
const JUMP_DRIVER = `window.__jd = (o) => new Promise((res) => {
  const g = window.__GAME__, c = g.ctx, p = c.player, input = c.input, ph = c.physics, game = c.game;
  const y = ph.topAt ? ph.topAt(o.x, o.z) : ph.heightAt(o.x, o.z);
  g.teleport(o.x, y + 0.02, o.z);
  p.vel.set(0, 0, 0); p.orders?.clear?.('smoke');
  const l = Math.hypot(o.dx, o.dz) || 1, dx = o.dx / l, dz = o.dz / l, mag = o.mag ?? 1;
  let settle = 0, t0 = null, y0 = 0, top = -1e9, tj = null, released = false, again = false, twirled = false, jumped = false;
  const start = [p.pos.x, p.pos.y, p.pos.z];
  const finish = () => { off(); input.virtualMove.x = 0; input.virtualMove.y = 0; input._release('jump', 'k:Space');
    res({ start, end: [p.pos.x, p.pos.y, p.pos.z], top, twirled, jumped, state: p.state }); };
  const off = game.addFrameHook(() => {
    if (t0 === null) {                                  // settle on the ground first (3 frames)
      if (++settle < 4) return;
      t0 = game.time; y0 = p.pos.y; start[0] = p.pos.x; start[1] = p.pos.y; start[2] = p.pos.z;
    }
    const t = game.time - t0;
    const yaw = (c.cam?.isIso ? c.cam.stickYaw : null) ?? c.cam?.yaw ?? Math.PI, sn = Math.sin(yaw), cs = Math.cos(yaw);
    input.virtualMove.x = (cs * dx - sn * dz) * mag; input.virtualMove.y = (-sn * dx - cs * dz) * mag;
    top = Math.max(top, p.pos.y - y0);
    if (tj === null && t >= o.jumpAt) { input._press('jump', 'k:Space'); tj = game.time; }
    if (tj !== null && !jumped && !p.onGround) jumped = true;
    if (tj !== null && !released && game.time - tj >= o.hold) { input._release('jump', 'k:Space'); released = true; }
    else if (o.twirl && released && !again) { input._press('jump', 'k:Space'); again = true; }
    if (p.state === 'twirl') twirled = true;
    if (t >= o.dur) finish();
  });
  setTimeout(finish, 20000);
});`;

/** Which side of the line a→b (x, z) the point is on (sign of the cross product). */
const sideOf = (a, b, q) => Math.sign((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));

/** Jump-attempts over a guard line: from both sides, with and without the twirl. Returns the crossings. */
async function attempts(t, label, guards) {
  const crossed = [];
  for (const gd of guards) {
    const [a, b] = gd.line, mx = (a[0] + b[0]) / 2 + (gd.shift?.[0] ?? 0), mz = (a[1] + b[1]) / 2 + (gd.shift?.[1] ?? 0);
    let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    for (const sgn of gd.sides ?? [1, -1]) for (const twirl of [false, true]) {
      const x = mx + nx * sgn * (gd.from ?? 1.6), z = mz + nz * sgn * (gd.from ?? 1.6);
      const r = await t.G((o) => window.__jd(o), { x, z, dx: -nx * sgn, dz: -nz * sgn, jumpAt: 0.12, hold: twirl ? 0.3 : 0.6, twirl, dur: twirl ? 2.6 : 1.6 });
      const s0 = sideOf(a, b, [r.start[0], r.start[2]]), s1 = sideOf(a, b, [r.end[0], r.end[2]]);
      const tag = `${label} ${gd.name} from ${sgn > 0 ? '+' : '-'} side${twirl ? ' + twirl' : ''}`;
      t.log(`${tag}: top ${r.top.toFixed(2)} m, ${r.jumped ? 'jumped' : 'NO JUMP'}${twirl ? (r.twirled ? ', twirled' : ', no twirl') : ''}, end ${r.end.map((v) => v.toFixed(2))}`);
      t.assert(r.jumped, `${tag}: she jumped`);
      if (twirl) t.assert(r.twirled, `${tag}: the twirl started`);
      t.assert(r.top <= 1.8 + 0.03, `${tag}: apex ${r.top.toFixed(2)} ≤ 1.8 m`);
      if (s0 !== s1) crossed.push(tag);
    }
  }
  return crossed;
}

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
/** Plain iso play: the prologue done, no story running, god on, KBM, no order and no selection. */
async function isoPlay(t, reload = null) {
  await t.G(async (sp) => {
    const g = window.__GAME__, c = g.ctx;
    g.story.skip?.(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
    for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
    if (sp) { await g.loadLevel('meadow', sp); g.story.skip?.(); }      // the day meadow (the prologue night is over)
    g.setMode('play'); g.god(true); c.input.setDevice('kbm');
    c.player.orders.clear('smoke'); c.cam.select?.(null); c.cam.zoom?.(1);
    return true;
  }, reload);
  await t.frames(20);
  await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); return true; });
}
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

/**
 * A hasTouch + isMobile phone session at w × h on the meadow (like `t.viewport(w, h, { touch: true })`, with the
 * generous navigation timeouts a loaded machine needs: the page's "load" can take > 30 s while other areas build).
 */
async function phone(t, w, h) {
  const context = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await context.newPage();
  pg.setDefaultTimeout(120000); pg.setDefaultNavigationTimeout(240000);
  pg.on('pageerror', (e) => t.fail(`[${w}×${h} touch] pageerror: ${e.message}`));
  const G = async (fn, arg) => {
    const hd = await pg.evaluateHandle(fn, arg);
    try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); }
  };
  const s = {
    page: pg, G, w, h,
    frames: (n = 1) => G((k) => window.__GAME__.waitFrames(k), n),
    async shot(name) {
      const p = path.join(t.shotsDir, `${name}.png`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      try { await pg.screenshot({ path: p }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); }
      return p;
    },
    screen: (x, z, y) => G(([a, b, c]) => window.__GAME__.screen(a, b, c), [x, z, y]),
    async tapAt(x, z) { const p = await s.screen(x, z); if (p) await pg.touchscreen.tap(Math.round(p.x), Math.round(p.y)); return p; },
    touch: (type, x, y, id = 11) => G(([tp, px, py, pid]) => {
      const caps = (window.__ptrCap ??= {});
      const el = tp === 'pointerdown' ? (document.elementFromPoint(px, py)?.closest?.('.tbtn, .touch-root') ?? document.querySelector('.touch-root')) : (caps[pid] ?? document.querySelector('.touch-root'));
      if (!el) return null;
      if (tp === 'pointerdown') caps[pid] = el;
      el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: pid, clientX: px, clientY: py, pointerType: 'touch', isPrimary: pid === 11 }));
      if (tp === 'pointerup' || tp === 'pointercancel') delete caps[pid];
      return el.className;
    }, [type, x, y, id]),
    close: () => context.close().catch(() => {}),
  };
  try {
    await pg.goto(`${t.base}?test=1&seed=1`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000, polling: 250 });
    await G(async () => {
      const g = window.__GAME__, c = g.ctx;
      g.story.skip?.(); g.setMode('play');
      for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag?.(k, true);
      await g.loadLevel('meadow', 'start');
      g.story.skip?.(); g.setMode('play');
      return true;
    });
    await s.frames(10);
  } catch (e) { await s.close(); throw e; }
  return s;
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
      // jump: Space → airborne → lands (apex ~1.6 m since TT5)
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
      t.assert(apex > 1.3 && apex < 1.75, `jump apex ${apex.toFixed(2)} m (expected ~1.6)`);
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
      await until(t, 'p.state === "dead" && p.stateT >= 0.6');
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

  // ------------------------------------------------------------------ combo rhythm under mashing (§7.2 ≈1.4 s)
  {
    name: 'player:combo-rhythm', order: 26.2, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await install(t);
      await t.wait(300);
      await clearEv(t);
      // real J taps every 100 ms (sim time) for 1.8 s
      await t.G(async () => {
        const pl = window.__GAME__.__pl;
        for (let i = 0; i < 18; i++) { await pl.tap('attack'); await pl.simWait(0.1); }
        return true;
      });
      await until(t, 'p.state === "move"', 4000);
      const sw = await t.G(() => window.__GAME__.__plEv.filter((e) => e.type === 'player:swing').map((e) => [e.attackId, e.t]));
      t.log(`mash: ${sw.map(([id, tt]) => `${id}@${tt.toFixed(3)}`).join(' ')}`);
      t.assert(sw.length >= 3 && sw[0][0] === 'slash1' && sw[1][0] === 'slash2' && sw[2][0] === 'slash3', `combo order ${sw.map((s) => s[0])}`);
      const d1 = sw[1][1] - sw[0][1], d2 = sw[2][1] - sw[1][1];
      t.assert(d1 >= 0.38 && d2 >= 0.38, `each slash runs to its 0.40 s end before the next (${d1.toFixed(3)}, ${d2.toFixed(3)})`);
    },
  },

  // ------------------------------------------------------------------ Meme Cam stays off on the practice field
  {
    name: 'player:memecam-practice', order: 26.4, level: 'meadow', spawn: 'practice', timeout: 120000,
    async run(t) {
      await install(t);
      await t.wait(300);
      await clearEv(t);
      await t.page.keyboard.down('KeyL');
      await simWait(t, 4.0);
      const st = await t.state();
      const p = await ps(t);
      await t.page.keyboard.up('KeyL');
      t.log(`practice hold: mode ${st.mode}, player ${p.state}, guarding ${p.guarding}, pos ${p.pos.map((v) => v.toFixed(1))}`);
      t.assert(st.mode === 'play' && p.guarding, `holding the Stand on the practice field must not start Meme Cam (mode ${st.mode}, ${p.state})`);
      await t.G(() => { window.__GAME__.idle(16); return true; });
      await simWait(t, 0.5);
      const st2 = await t.state();
      t.assert(st2.mode === 'play', `idle Meme Cam suppressed on the practice field (mode ${st2.mode})`);
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
      if (full) await pose(t, 'faint', 'const p = g.ctx.player; p.god = false; p.hp = 0; p.alive = false; p.onDeath()', 'p.state === "dead" && p.stateT > 0.8');
      if (full) await t.G(() => window.__GAME__.__pl.until((p) => p.alive, 5000));
    },
  },
  // ------------------------------------------------------------------ Phase W + ART §6.5 + AUTOCAM §5.3 (player)
  {
    name: 'player:warm', order: 29.5, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      await install(t);
      await isoPlay(t);
      // AUTOCAM §5.3 / §4: moveIntent 'order' toward the path 2.5 m ahead, groundY = her contact
      const mi = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, L = g.__pl, THREE = g.THREE;
        p.order('move', new THREE.Vector3(p.pos.x + 6, p.pos.y, p.pos.z - 6), { source: 'api' });
        await L.simWait(0.3);
        const out = { kind: p.moveIntent.kind, speed: p.moveIntent.speed, gy: p.groundY, y: p.pos.y, la: p.orders.lookAhead(2.5, { x: 0, z: 0 }) };
        p.orders.clear('smoke');
        await L.simWait(0.6);
        out.idle = p.moveIntent.kind;
        return out;
      });
      t.assert(mi.kind === 'order' && mi.speed > 0 && mi.la, `moveIntent ${JSON.stringify(mi)}`);
      t.assert(Number.isFinite(mi.gy) && Math.abs(mi.gy - mi.y) < 0.5 && mi.idle === 'idle', `groundY ${mi.gy} (feet ${mi.y}), then ${mi.idle}`);
      await shot(t, 'player/warm-iso');                             // iso: face pitch toward the lens, her ring
      // WA §5.6 idle ladder steps (visual; ?test never runs the clock, so the steps are fired by hand)
      await pose(t, 'warm-glance', 'g.ctx.player.model.idleStep("glance")', 'p.model.glanceW > 0.9', [[0.6, 0.9, 2.4], [0, 0.55, 0], 34]);
      await pose(t, 'warm-groom', 'g.ctx.player.model.idleStep("groom")', 'p.model.idleAnim?.name === "groom" && p.model.idleAnim.t > 0.5', [[1.2, 0.8, 2.0], [0, 0.5, 0], 34]);
      await pose(t, 'warm-twirl', 'g.ctx.player.model.idleStep("twirl")', 'p.model.clip?.idle && p.model.clip.t > 0.3', [[1.5, 1.0, 2.6], [0, 0.5, 0], 38]);
      await t.frames(30);
      // WA §5.7 knock-out: a dizzy sit with the sword beside her, the cream wipe, boing back at 1.55 s
      await t.G(() => { const g = window.__GAME__; g.god(false); return true; });
      await pose(t, 'warm-ko', 'const p = g.ctx.player; p.hp = 0; p.alive = false; p.onDeath()', 'p.state === "dead" && p.stateT > 0.7 && p.model.dropW > 0.9', [[1.4, 0.9, 2.2], [0.1, 0.35, 0], 36]);
      const ko = await t.G(async () => {
        const g = window.__GAME__, p = g.ctx.player, L = g.__pl;
        const pose0 = p.model.basePose(), t0 = g.ctx.game.time;
        const back = await L.until((pl) => pl.alive && pl.state === 'move', 8000);
        return { pose0, back, dt: g.ctx.game.time - t0, stateT: p.stateT };
      });
      t.assert(ko.pose0 === 'sit', `knock-out pose ${ko.pose0} (never lying flat)`);
      t.assert(ko.back, `respawned (${JSON.stringify(ko)})`);
      await t.G(() => { window.__GAME__.god(true); return true; });
      // WA §5.3 words on her hits: Snip! on the first swing at a rat
      const w = await t.G(async () => {
        const g = window.__GAME__, L = g.__pl, p = g.ctx.player;
        await L.simWait(1.2);
        const rat = L.rat(0, 1.2);
        await L.frames(3);
        const n0 = p.words ?? 0;
        p._wordT = -Infinity;
        await L.tap('attack');
        await L.until((pl) => (pl.words ?? 0) > n0, 3000);
        const out = { words: (p.words ?? 0) - n0, last: p.lastWord };
        g.ctx.enemies.despawn?.(rat);
        return out;
      });
      t.assert(w.words >= 1 && w.last === 'Snip!', `hit word ${JSON.stringify(w)}`);
      t.log(`moveIntent ${mi.kind} ${mi.speed.toFixed(1)} m/s; KO back after ${ko.dt.toFixed(2)} s; word ${w.last}`);
    },
  },
  // ------------------------------------------------------------------ M2: shop upgrades (§13.3)
  {
    name: 'player:upgrades', order: 27, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, u = ctx.state.upgrades;
        const saved = { ...u };
        g.__plUpg = saved;
        p.milk = 1;
        Object.assign(u, { satchel: 2, sharp: 3, quickCharge: true, valorGain: true, waveReach: true });
        return true;
      });
      t.assert(r, 'upgrades set');
      await simWait(t, 0.1);
      const s = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
        p.setValor(0); p.addValor(20, 'test');
        return { milkMax: p.milkMax, milk: p.milk, valor: p.valor, gainMul: p.valorState.gainMul, dealt: ctx.combat.dealtMul?.(p) ?? null,
          t1: p.tier1Time(), t2: p.tier2Time() };
      });
      t.assert(s.milkMax >= 4, `Bigger Satchel II: milkMax ${s.milkMax} (expected ≥ 4)`);
      t.assert(s.milk >= 3, `the bought slots come filled (milk ${s.milk})`);
      t.assert(Math.abs(s.valor - 25) < 1e-6, `Valor Gain: +20 → ${s.valor} (expected 25)`);
      t.assert(s.dealt === null || Math.abs(s.dealt - 1.5) < 1e-6, `Sharpness III: dealtMul ${s.dealt}`);
      t.assert(Math.abs(s.t1 - 0.45) < 1e-6 && Math.abs(s.t2 - 0.85) < 1e-6, `Quick Charge tiers ${s.t1} / ${s.t2}`);
      // Quick Charge in play: Shard 1 + Valor 50, tier 2 after ~0.85 s of holding J
      await t.G(() => { const g = window.__GAME__; g.player.setShards(1); g.player.setValor(60); return true; });
      await t.page.keyboard.down('KeyJ');
      const tier2 = await until(t, 'p.state === "charge" && p.chargeTier === 2', 6000);
      const ct = await t.G(() => window.__GAME__.ctx.player.chargeT);
      await t.page.keyboard.up('KeyJ');
      t.assert(tier2 && ct < 1.05, `Quick Charge: tier 2 at chargeT ${ct.toFixed(2)} (base 1.10)`);
      await until(t, 'p.state === "move"', 4000);
      await t.G(() => { const g = window.__GAME__; Object.assign(g.ctx.state.upgrades, g.__plUpg); return true; });
      await simWait(t, 0.1);
      const back = await t.G(() => window.__GAME__.ctx.player.milkMax);
      t.log(`satchel → milkMax ${s.milkMax}, Valor ×${s.gainMul}, sharp ×${s.dealt}, quick tier 2 at ${ct.toFixed(2)} s; restored milkMax ${back}`);
    },
  },

  // ------------------------------------------------------------------ M2: Standing Ground (§7.3)
  {
    name: 'player:standing', order: 27.2, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await install(t);
      await t.G(() => {
        const g = window.__GAME__, pl = g.__pl, ctx = g.ctx;
        ctx.player.setValor(0);
        const e = pl.rat(0, 3.0);
        e.alerted = true; e.stateName = 'chase';
        g.__plRat = e;
        return true;
      });
      await clearEv(t);
      await t.page.keyboard.down('KeyL');
      const paying = await until(t, 'p.standingGround && p.valor >= 2', 8000);
      // a block in the middle of it: the pushback must not un-plant her
      const v0 = await t.G(() => window.__GAME__.ctx.player.valor);
      await t.G(() => { const g = window.__GAME__; g.__plRat.pos.set(g.ctx.player.pos.x + Math.sin(g.ctx.player.facing) * 1.2, g.ctx.player.pos.y, g.ctx.player.pos.z + Math.cos(g.ctx.player.facing) * 1.2); g.ctx.player.guardState.guardT = 1; return g.__pl.poke(g.__plRat); });
      await simWait(t, 0.5);
      const after = await ps(t);
      const sg = await t.G(() => window.__GAME__.ctx.player.standingGround);
      await shot(t, 'player/standing-ground');
      // the token goes to a companion for good: the payout stops
      await t.G(() => { const g = window.__GAME__, e = g.__plRat; e.targetActor = () => ({ id: 'mochi' }); return true; });
      const stops = await until(t, '!p.standingGround', 4000);
      await t.page.keyboard.up('KeyL');
      await t.G(() => { const g = window.__GAME__; g.ctx.enemies.despawn?.(g.__plRat); return true; });
      t.assert(paying, 'Standing Ground: no Valor while planted in the Stand near an alerted rat');
      t.assert(after.valor > v0 && sg, `still paying after a block (Valor ${v0.toFixed(1)} → ${after.valor.toFixed(1)}, standing ${sg})`);
      t.assert(stops, 'an enemy targeting a companion does not count');
      t.log(`Valor ${v0.toFixed(1)} → ${after.valor.toFixed(1)} through a block; grit ${after.grit}`);
    },
  },

  // ------------------------------------------------------------------ M2: sword skins + capes (§13.4, §13.5)
  {
    name: 'player:cosmetics', order: 27.4, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      await install(t);
      await t.G(() => { const g = window.__GAME__; g.__plCos = { ...g.ctx.state.cosmetics }; return true; });
      const looks = [['twig', 'blue'], ['fishbone', 'memeWhite'], ['baguette', 'green'], ['diamond', 'midnight'], ['dawnblade', 'gold'], ['toobig', 'red']];
      for (const [sword, cape] of looks) {
        await t.G(([s, c]) => { const cos = window.__GAME__.ctx.state.cosmetics; cos.sword = s; cos.cape = c; return true; }, [sword, cape]);
        const ok = await until(t, `p.model.k?.sword?.skin === "${sword}" && p.model.capeApplied === "${cape}" && (!${sword === 'diamond' || sword === 'toobig'} || p.model.k.sword.group.getObjectByName("swordModel"))`, 15000);
        t.assert(ok, `skin ${sword} + cape ${cape} not applied`);
        await simWait(t, 0.4);
        await pose(t, `skin-${sword}`, '', 'true', [[1.7, 0.8, 1.9], [0, 0.45, 0.25], 38]);
      }
      // Even More Too Big: the tip rests on the ground (idle) and drags behind her (running)
      const tip = await t.G(() => {
        const p = window.__GAME__.ctx.player, k = p.model.k, v = new window.__GAME__.THREE.Vector3();
        k.sword.tip.getWorldPosition(v);
        return { tipY: v.y - p.pos.y, dragW: p.model.dragW };
      });
      t.assert(tip.dragW > 0.9 && Math.abs(tip.tipY) < 0.12, `toobig tip at ${tip.tipY.toFixed(3)} m above her feet (dragW ${tip.dragW.toFixed(2)})`);
      await pose(t, 'skin-toobig-run', 'g.ctx.input.setVirtualMove(0, 1)', 'Math.hypot(p.vel.x, p.vel.z) > 5.3', [[-2.4, 1.1, -1.2], [0, 0.35, -0.5], 40]);
      const runTip = await t.G(() => {
        const p = window.__GAME__.ctx.player, v = new window.__GAME__.THREE.Vector3();
        p.model.k.sword.tip.getWorldPosition(v);
        const dx = v.x - p.pos.x, dz = v.z - p.pos.z;
        return { y: v.y - p.pos.y, behind: -(dx * Math.sin(p.facing) + dz * Math.cos(p.facing)) };
      });
      t.assert(Math.abs(runTip.y) < 0.2 && runTip.behind > 0.4, `running: the toobig tip trails behind on the ground (y ${runTip.y.toFixed(2)}, behind ${runTip.behind.toFixed(2)} m)`);
      await t.G(() => { const g = window.__GAME__; g.ctx.input.setVirtualMove(0, 0); g.ctx.input.setDevice('kbm'); Object.assign(g.ctx.state.cosmetics, g.__plCos); return true; });
      const back = await until(t, 'p.model.k?.sword?.skin === "borrowed"', 8000);
      t.assert(back, 'the Borrowed Blade comes back');
      t.log(`toobig tip y ${tip.tipY.toFixed(3)} m`);
    },
  },

  // ================================================================== CONTROLS_SPEC (LoL-style iso controls, §12 player 6)
  // ------------------------------------------------------------------ click-to-move past the practice fence
  {
    name: 'player:click-move', order: 28.1, level: 'meadow', spawn: 'start', timeout: 200000,
    async run(t) {
      // the jump lesson done (through story.flag: physics re-evaluates the practice-fence nav link on story:flag)
      await t.G(() => { const c = window.__GAME__.ctx; if (c.story?.flag) c.story.flag('tut.jump.done', true); else c.state.setFlag('tut.jump.done', true); return true; });
      await isoPlay(t, 'practice');
      await install(t);
      // TT3 §11.2: RMB click-to-move is the `moba` preset's (`hybrid` walks on WASD; RMB is the Stand there)
      await t.G(() => { const c = window.__GAME__.ctx; c.state.settings.controlPreset = 'moba'; c.bus.emit('settings:changed', { key: 'controlPreset', value: 'moba' }); c.input.rebind('moba'); return true; });
      // outside the practice field's inner fence (z −87, x −20…−2) by the barn door, the fence's one open hop link
      // (TT2 §10.3, x −14.5); zoomed out so the far side is on screen
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx;
        g.teleport(-14.5, c.physics.topAt(-14.5, -92), -92);
        c.cam.zoom?.(1.4);
        return true;
      });
      await t.frames(20);
      // the farthest point up-screen (≥ 9 m, across the fence) that is on screen with a margin
      const goal = await t.G(() => {
        const g = window.__GAME__, W = innerWidth, H = innerHeight;
        for (let z = -77; z >= -83; z -= 0.5) {
          const s = g.screen(-14.5, z);
          if (s && s.x > 40 && s.x < W - 40 && s.y > 60 && s.y < H - 60) return { x: -14.5, z, sx: s.x, sy: s.y };
        }
        return null;
      });
      if (!t.assert(goal, 'a goal past the fence is on screen')) {
        t.log(JSON.stringify(await t.G(() => { const g = window.__GAME__, c = g.ctx; return { lvl: c.levels?.current?.id, pos: c.player.pos.toArray(), s: g.screen(-14.5, -80), W: innerWidth, H: innerHeight, mode: c.game.mode }; })));
        return;
      }
      const from = await ps(t);
      const dist = Math.hypot(goal.x - from.pos[0], goal.z - from.pos[2]);
      await clearEv(t);
      await t.page.mouse.move(goal.sx, goal.sy);
      await t.page.mouse.down({ button: 'right' }); await t.page.mouse.up({ button: 'right' });     // a click, not a hold
      if (!t.assert(await waitEv(t, 'player:order', 3000), 'RMB → player:order')) {
        t.log(JSON.stringify(await t.G(() => { const g = window.__GAME__, c = g.ctx, p = c.player;
          return { mode: c.game.mode, scripted: p.scripted, state: p.state, pos: p.pos.toArray(), o: g.orders(), dev: c.input.device, story: !!c.story?.isPlaying, flag: c.state.getFlag('tut.jump.done') }; })));
      }
      const ord = await t.G(() => window.__GAME__.orders());
      t.log(`click ${dist.toFixed(1)} m → path ${JSON.stringify(ord.path.map((q) => [+q[0].toFixed(1), +q[1].toFixed(1), q[2]]))}`);
      t.assert(ord.kind === 'move' && ord.path.some((q) => q[2]), 'a move order whose path takes the fence link');
      // a frame mid-hop for the review
      const hop = await until(t, '!p.onGround && p.pos.z > -88.5 && p.pos.z < -85.5', 8000);
      if (hop) await shot(t, 'player/click-move-hop'); else t.warn('no mid-hop frame caught');
      const ok = await until(t, `Math.hypot(p.pos.x - (${goal.x}), p.pos.z - (${goal.z})) < 0.5 && !p.orders.kind`, 15000);
      const end = await t.G(() => ({ o: window.__GAME__.orders(), pos: window.__GAME__.ctx.player.pos.toArray() }));
      t.assert(ok, `arrives within 0.5 m (${end.pos.map((v) => v.toFixed(2))} vs ${goal.x}, ${goal.z}; ${end.o.last})`);
      t.assert(end.o.hops >= 1, `auto-jumped the fence (${end.o.hops} hops)`);
      await shot(t, 'player/click-move-arrived');
      await t.G(() => { window.__GAME__.ctx.cam.zoom?.(1); return true; });
    },
  },

  // ------------------------------------------------------------------ Lantern Alley: crate steps → Waffles' balcony
  // A use / move order up the crate steps must either reach the balcony or end (grey ✕) — never hop crate 2 ↔ 3 forever
  {
    name: 'player:crate-balcony', order: 28.15, level: 'town', spawn: 'start', timeout: 240000,
    async run(t) {
      await install(t);
      await t.G(() => { const g = window.__GAME__, c = g.ctx; g.story.skip?.(); g.setMode('play'); c.input.setDevice('kbm'); return true; });
      const probe = async (label, issueSrc) => {
        await t.G(() => { const g = window.__GAME__, c = g.ctx; c.player.orders.clear('smoke'); g.teleport(3, c.physics.topAt(3, -33), -33); c.player.orders.hops = 0; return true; });
        await t.frames(20);
        const issued = await t.G((src) => new Function('g', 'c', src)(window.__GAME__, window.__GAME__.ctx), issueSrc);
        const first = await t.G(() => window.__GAME__.orders());
        const ended = await until(t, '!p.orders.kind', 20000);
        const end = await t.G(() => { const g = window.__GAME__, p = g.ctx.player; return { o: g.orders(), pos: p.pos.toArray().map((v) => +v.toFixed(2)) }; });
        t.log(`${label}: ${JSON.stringify(issued)} path ${JSON.stringify(first.path.map((q) => [+q[0].toFixed(1), +q[1].toFixed(1), q[2]]))} → ${end.o.last} at ${end.pos} after ${end.o.hops} hops`);
        t.assert(ended, `${label}: the order ends within 20 s (${end.o.kind ?? end.o.last}, ${end.o.hops} hops)`);
        t.assert(end.o.hops <= 12, `${label}: no crate hop loop (${end.o.hops} hops)`);
        return end;
      };
      const use = await probe('use Waffles', `
        const list = c.companions?.pickables?.([]) ?? [];
        const w = list.find((a) => Math.hypot(a.pos.x - 5, a.pos.z + 30) < 1.6);
        if (!w) return { err: 'no kitten on the balcony', n: list.length };
        return { ok: c.player.order('use', w), y: +w.pos.y.toFixed(2) };`);
      if (use.o.last === 'used') t.log('use Waffles: reached her'); else t.warn(`use Waffles ended ${use.o.last} (no climb)`);
      await shot(t, 'player/crate-balcony-use');
      await probe('move onto the balcony', `return c.player.order('move', { x: 5, y: 3, z: -30.3 });`);
      await shot(t, 'player/crate-balcony-move');
      await probe('move under the balcony', `return c.player.order('move', { x: 5.71, y: 0, z: -30.98 });`);
    },
  },

  // ------------------------------------------------------------------ TT5 package J: jumps (docs/TOKENTAILS-PLAN.md §13)
  // held apex 1.60 ± 0.02 m (real physics), an 80 ms Space tap ≥ 1.0 m and over the 1.0 m lesson fence, the practice
  // perimeter fence and its closed gate (2.0 m) never cleared from either side with or without the Ribbon Twirl, twirl
  // apex ≤ 1.8 m, a tap up onto Mushroom Ring cap 1 and onto Waffles' first crate step; town road hedges (1.9 m) hold.
  // Screenshots at the six TT5 viewports: her held-jump apex beside the lesson fence (J_SHOTS_DIR, default tests/shots).
  {
    name: 'player:jumps', order: 28.05, level: null, timeout: 900000,
    async run(t) {
      const SHOT_DIR = process.env.J_SHOTS_DIR || path.join(t.shotsDir, 'player');
      const TAG = process.env.J_SHOTS_TAG || 'jumps';
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      const setup = async (G, level, spawn, closedGate = false) => G(async ([lv, sp, closed, src]) => {
        const g = window.__GAME__, c = g.ctx;
        g.story.skip?.(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
        for (const k of ['prologue.armour', 'prologue.done']) c.state.setFlag(k, true);
        c.state.setFlag('prologue.tutorial', !closed);
        c.state.setFlag('trick.twirl', true); c.state.setFlag('onboard.firstFight', true);
        await g.loadLevel(lv, sp); g.story.skip?.(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
        g.setMode('play'); g.god(true); c.input.setDevice?.('kbm'); c.player.orders.clear('smoke');
        g.ctx.game.setTimeScale(1); c.player.tricks?.init?.();
        new Function(src)();
        return true;
      }, [level, spawn, closedGate, JUMP_DRIVER]);
      await setup(t.G, 'meadow', 'practice', true);
      await t.frames(20);
      await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); return true; });
      // 1. held apex and the 80 ms tap on open ground inside the field (−10, −72), straight up
      const held = await t.G((o) => window.__jd(o), { x: -12, z: -72, dx: 0, dz: 1, mag: 0, jumpAt: 0.05, hold: 0.8, dur: 1.4 });
      t.assert(Math.abs(held.top - 1.604) <= 0.02, `held jump apex ${held.top.toFixed(3)} m (1.60 ± 0.02)`);
      const tap = await t.G((o) => window.__jd(o), { x: -12, z: -72, dx: 0, dz: 1, mag: 0, jumpAt: 0.05, hold: 0.08, dur: 1.2 });
      t.assert(tap.top >= 1.0 && tap.top < held.top - 0.2, `80 ms tap apex ${tap.top.toFixed(3)} m (≥ 1.0, below the held jump)`);
      t.log(`held apex ${held.top.toFixed(3)} m, 80 ms tap ${tap.top.toFixed(3)} m`);
      // 2. the 1.0 m lesson fence (z −87) at x −16 with an 80 ms tap, running north from 2.2 m south of it
      let over = null;
      for (const jumpAt of [0.22, 0.26, 0.3]) {
        const r = await t.G((o) => window.__jd(o), { x: -16, z: -89.2, dx: 0, dz: 1, jumpAt, hold: 0.08, dur: 1.4 });
        t.log(`lesson fence tap at ${jumpAt}s: top ${r.top.toFixed(2)}, end z ${r.end[2].toFixed(2)}`);
        if (r.end[2] > -86.6) { over = r; break; }
      }
      t.assert(!!over, 'an 80 ms tap clears the 1.0 m lesson fence');
      // 3. the practice perimeter (2.0 m) and the closed gate: never over, from either side, with or without the twirl
      const crossed = await attempts(t, 'meadow', [
        { name: 'north fence', line: [[-20, -60], [-2.2, -60]], shift: [-4, 0] },
        { name: 'gate', line: [[-2.05, -60], [2.05, -60]] },
        { name: 'south fence', line: [[-20, -100], [20, -100]], shift: [6, 0] },
        { name: 'east fence', line: [[20, -100], [20, -60]], shift: [0, -4] },
        { name: 'west fence', line: [[-20, -100], [-20, -60]], shift: [0, 4] },
      ]);
      t.assert(!crossed.length, `the practice field fence / gate was jumped: ${crossed.join('; ')}`);
      // 4. Mushroom Ring (forest): a tap from the ground onto cap 1 (1.0 m), a tap from cap 1 onto cap 2
      await setup(t.G, 'forest', 'start');
      await t.frames(20);
      const caps = [[-26.6, -55.3, 1.0], [-28.3, -57.1, 2.0]];
      const g0 = await t.G(() => window.__GAME__.ctx.physics.heightAt(-26.6, -55.3));
      let onCap = null;
      for (const jumpAt of [0.1, 0.16, 0.22]) {
        const r = await t.G((o) => window.__jd(o), { x: -26.6 + 2.2, z: -55.3, dx: -1, dz: 0, mag: 0.6, jumpAt, hold: 0.08, dur: 1.4 });
        t.log(`cap 1 tap at ${jumpAt}s: top ${r.top.toFixed(2)}, end y ${(r.end[1] - g0).toFixed(2)} at ${r.end.map((v) => v.toFixed(2))}`);
        if (r.end[1] - g0 > 0.9 && Math.hypot(r.end[0] - caps[0][0], r.end[2] - caps[0][1]) < 1.3) { onCap = r; break; }
      }
      t.assert(!!onCap, 'a tap gets her onto Mushroom Ring cap 1 (1.0 m)');
      // 5. Waffles' crate steps (town): a tap from the street onto crate 1 (1.0 m)
      await setup(t.G, 'town', 'start');
      await t.frames(20);
      const gc = await t.G(() => window.__GAME__.ctx.physics.heightAt(5.1, -37.6));
      let onCrate = null;
      for (const jumpAt of [0.12, 0.18, 0.24]) {
        const r = await t.G((o) => window.__jd(o), { x: 5.1, z: -37.6, dx: 0, dz: 1, mag: 0.7, jumpAt, hold: 0.08, dur: 1.2 });
        t.log(`crate 1 tap at ${jumpAt}s: end y ${(r.end[1] - gc).toFixed(2)} at ${r.end.map((v) => v.toFixed(2))}`);
        if (r.end[1] - gc > 0.9) { onCrate = r; break; }
      }
      t.assert(!!onCrate, 'a tap gets her onto the first crate step (1.0 m)');
      // 6. the town road hedges (1.9 m) between the gate and the level edge, from the road (the road runs in a cutting:
      // the bank behind each hedge rises to ~1.7 m, so the outside is never a place she stands)
      const hedges = await attempts(t, 'town', [
        { name: 'west hedge', line: [[-4.2, -63.5], [-4.2, -68]], sides: [1], from: 1.2 },
        { name: 'east hedge', line: [[4.2, -63.5], [4.2, -68]], sides: [-1], from: 1.2 },
      ]);
      t.assert(!hedges.length, `a town road hedge was jumped: ${hedges.join('; ')}`);
      // 7. screenshots: her held-jump apex beside the lesson fence at the six TT5 viewports
      const apexShot = async (G, shoot, frames) => {
        await G(() => { const g = window.__GAME__, c = g.ctx; g.teleport(-12.5, c.physics.heightAt(-12.5, -88.6), -88.6); c.player.facing = 0; return true; });
        await frames(30);
        await G(() => new Promise((res) => {
          const g = window.__GAME__, c = g.ctx, p = c.player, game = c.game; let up = false;
          c.input._press('jump', 'k:Space');
          const off = game.addFrameHook(() => { if (p.vel.y > 0) up = true; if (up && p.vel.y <= 0.3) { off(); game.setTimeScale(0); res(true); } });
          setTimeout(() => { off(); game.setTimeScale(0); res(false); }, 5000);
        }));
        await frames(2);
        await shoot();
        await G(() => { const g = window.__GAME__; g.ctx.input._release('jump', 'k:Space'); g.ctx.game.setTimeScale(1); return true; });
      };
      await setup(t.G, 'meadow', 'practice', true);
      await t.frames(20);
      for (const [w, h] of [[1024, 768], [1280, 720], [1920, 1080]]) {
        await t.viewport(w, h);
        await t.frames(10);
        await apexShot(t.G, () => t.page.screenshot({ path: path.join(SHOT_DIR, `${TAG}-${w}x${h}.png`) }), t.frames);
      }
      await t.viewport(1280, 720);
      for (const [w, h] of [[390, 844], [844, 390], [667, 375]]) {
        const s = await phone(t, w, h);
        try {
          await s.page.touchscreen.tap(Math.round(w * 0.6), Math.round(h * 0.35));
          await setup(s.G, 'meadow', 'practice', true);
          await s.frames(20);
          await s.G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); g.ctx.input.setDevice?.('touch'); g.ctx.ui?.touch?.enable?.(true); return true; });
          await s.frames(10);
          await apexShot(s.G, () => s.page.screenshot({ path: path.join(SHOT_DIR, `${TAG}-${w}x${h}-touch.png`) }), s.frames);
        } finally { await s.close(); }
      }
    },
  },

  // ------------------------------------------------------------------ touch: a drag-aimed charge keeps its aim (§7.1)
  // ⚔ held ~1.6 s while dragging screen-left, a rat 2.6 m screen-right: the Bright Swoosh must swing left, not turn
  // back 180° to the rat once the drag pad lets go (ui clears virtualAim ~2 frames after the release)
  {
    name: 'player:touch-charge-aim', order: 28.16, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await isoPlay(t);
      await install(t);
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx, p = c.player, input = c.input, L = g.__pl, THREE = g.THREE;
        c.input.setDevice('touch');
        const yaw = c.cam.stickYaw ?? c.cam.yaw ?? Math.PI;
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);                                 // screen-right on the ground
        const pos = new THREE.Vector3(p.pos.x + rx * 2.6, 0, p.pos.z + rz * 2.6);
        pos.y = c.physics.heightAt(pos.x, pos.z);
        const e = c.enemies.spawn('rat_pike', pos, { facing: Math.atan2(-rx, -rz) });
        e.ai = false; e.hp = e.maxHp = 9999;
        const left = Math.atan2(-rx, -rz);
        p.facing = Math.atan2(rx, rz);                                                   // facing the rat to start
        input.setVirtual('attack', true);
        input.setVirtualAim(-1, 0);                                                      // drag screen-left
        await L.simWait(1.6);
        input.setVirtualAim(-1, 0);
        input.setVirtual('attack', false);
        await L.frames(2);
        input.setVirtualAim(0, 0, false);                                                // the pad lets go
        const ok = await L.until((pp) => pp.swing && pp.swing.t >= (pp.swing.def.active?.[0] ?? 0) + 0.02, 4000);
        const out = { ok, id: p.swing?.def.id ?? null, src: p.swing?.aimSource ?? null, facing: p.facing, left, err: Math.abs(Math.atan2(Math.sin(p.facing - left), Math.cos(p.facing - left))) };
        c.enemies.despawn(e);
        c.input.setDevice('kbm');
        return out;
      });
      t.log(`touch charge: ${JSON.stringify(r)}`);
      t.assert(r.ok && /bright|holy|slash3/.test(r.id ?? ''), `the charge released a swing (${r.id})`);
      t.assert(r.src === 'explicit', `the swing keeps its explicit aim source (${r.src})`);
      t.assert(r.err < 0.35, `it swings screen-left, not back at the rat (facing ${r.facing?.toFixed(2)} vs ${r.left?.toFixed(2)})`);
    },
  },

  // ------------------------------------------------------------------ LMB on a rat (TT3 §11.2): path, select, auto-chain, hits
  {
    name: 'player:attack-order', order: 28.2, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await isoPlay(t, 'start');                                          // the day meadow (readable shots)
      await install(t);
      const rat = await t.G(() => {
        const g = window.__GAME__, c = g.ctx, p = c.player;
        c.state.settings.autoAttack = 'auto';                            // every device → loop (LoL)
        const e = g.spawn('rat_pike', p.pos.x + 1.0, p.pos.z + 5.5);   // 5.5 m up-screen, AI off (a training dummy)
        e.ai = false;
        g.__plRat = e;
        return { hp: e.hp };
      });
      await t.frames(5);
      const sp = await t.G(() => { const e = window.__GAME__.__plRat; return window.__GAME__.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); });
      await t.page.mouse.move(sp.x, sp.y);
      await t.frames(3);
      const hover = await t.G(() => window.__GAME__.ctx.player.hover?.kind ?? null);
      t.assert(hover === 'enemy', `player.hover = the rat (${hover})`);
      await clearEv(t);
      await t.page.mouse.down({ button: 'left' }); await t.page.mouse.up({ button: 'left' });
      t.assert(await waitEv(t, 'player:order', 3000), 'LMB on the rat → player:order (TT3: hybrid has no RMB orders)');
      const o = await t.G(() => ({ o: window.__GAME__.orders(), sel: window.__GAME__.ctx.cam.lockTarget === window.__GAME__.__plRat, swing: window.__GAME__.events.includes('player:swing') }));
      t.assert(!o.swing, 'the press does not swing at the air 5.5 m short of it');
      t.assert(o.o.kind === 'attack', `an attack order (${o.o.kind})`);
      t.assert(o.sel, 'the rat is selected (gold ring)');
      const swung = await until(t, 'ctx.player.state === "attack"', 8000);
      t.assert(swung, 'she walks into reach and swings');
      await shot(t, 'player/attack-order');
      const done = await until(t, '!window.__GAME__.__plRat.alive || (p.orders.kind === "attack" && p.orders._chainStrings >= 1)', 10000);
      const r = await t.G(() => {
        const g = window.__GAME__, ev = g.__plEv;
        return { hits: ev.filter((e) => e.type === 'combat:hit' && !e.toPlayer).length, swings: ev.filter((e) => e.type === 'player:swing').map((e) => e.combo),
          hp: g.__plRat.hp, alive: g.__plRat.alive };
      });
      t.log(`attack order: swings ${r.swings}, hits ${r.hits}, rat hp ${r.hp} alive ${r.alive}`);
      t.assert(done, 'the auto-attack ran a full string (or the rat fell)');
      t.assert(r.hits >= 2 && r.swings[0] === 1, 'the combo hits the rat');
      await t.G(() => { const g = window.__GAME__, c = g.ctx; c.player.orders.clear('smoke'); c.cam.select?.(null); if (g.__plRat.alive) c.enemies.despawn(g.__plRat); return true; });
    },
  },

  // ------------------------------------------------------------------ the Stand wins over the auto-attack chain (§8.3)
  {
    name: 'player:order-parry', order: 28.25, level: 'meadow', spawn: 'start', timeout: 200000,
    async run(t) {
      await isoPlay(t, 'start');
      await install(t);
      // an attack order on a live rat_pike: while she is mid-swing in the auto chain, press the Stand
      // activeAt − 0.08 s before its poke lands → a parry; once at − 0.28 s → at least a block (she is in the Stand)
      const r = await t.G(() => new Promise((resolve) => {
        const g = window.__GAME__, c = g.ctx, p = c.player, input = c.input, L = g.__pl;
        c.state.settings.autoAttack = 'loop';                            // keep swinging (no chain rest)
        const e = L.rat(0, 1.6);
        e.ai = true; e.alerted = true; e.hp = e.maxHp = 9999;
        e.superArmor = true;                                             // her chain must not stagger it out of its poke (a hyena / boss case)
        g.__plRat = e;
        p.order('attack', e);
        const leads = [0.08, 0.08, 0.28, 0.08], trials = [];
        let phase = 0, pressAt = 0, tel = null, k = 0, t0 = performance.now(), hits0 = 0;
        // her side of each poke: a combat:hit on her (hit / block) or a player:parry (the parried poke never lands)
        const hitsOnHer = () => g.__plEv.filter((x) => (x.type === 'combat:hit' && x.toPlayer) || x.type === 'player:parry')
          .map((x) => (x.type === 'player:parry' ? { ...x, result: 'parry' } : x));
        const off = c.game.addFrameHook(() => {
          const now = c.game.time;
          if (phase === 0) {
            const nx = c.combat.nextParryable?.(p, 6);
            if (nx && nx.attacker === e && p.state === 'attack') {
              const lead = nx.activeAt - now;
              if (lead > 0 && lead <= leads[k] && lead > leads[k] - 0.06) {
                input._press('guard', 'k:Space'); pressAt = now; tel = nx; hits0 = hitsOnHer().length;
                const sw = p.swing, act = sw?.def.active ?? [0, 0];
                // the active frames themselves are never cancelled (§7.3): the Stand takes over at their end
                const activeLeft = sw && sw.t >= act[0] && sw.t < act[1] ? act[1] - sw.t : 0;
                trials.push({ lead: +lead.toFixed(3), swing: sw?.def.id ?? null, queued: !!sw?.queued, activeLeft: +activeLeft.toFixed(3) });
                phase = 1;
              }
            }
          } else if (phase === 1) {
            const tr = trials[trials.length - 1];
            if (tr.guardAt === undefined && p.state === 'guard') tr.guardAt = +(now - pressAt).toFixed(3);
            const hs = hitsOnHer();
            if (hs.length > hits0 || now - pressAt > 1.2) {
              // only the poke that was due (lead + 0.2 s) counts; a later poke (the due one was cancelled, e.g. her
              // swing pushed the rat out of reach) lands on a held Stand and says nothing about the parry window
              const due = hs.length > hits0 && hs[hs.length - 1].t - pressAt <= tr.lead + 0.2;
              tr.result = due ? hs[hs.length - 1].result : 'none';
              tr.hitDt = +((hs.length > hits0 ? hs[hs.length - 1].t : now) - pressAt).toFixed(3);
              tr.ratState = e.stateName ?? e.state ?? null; tr.ratStag = !!(e.staggerT > 0 || e.stunned);
              input._release('guard', 'k:Space'); phase = 2; pressAt = now;
            }
          } else if (phase === 2 && now - pressAt > 0.3) {
            if (!c.player.orders.kind) p.order('attack', e);               // re-issue (a parry can end it)
            if (++k >= leads.length) { off(); resolve({ ok: true, trials }); return; }
            phase = 0;
          }
          if (performance.now() - t0 > 90000) { off(); input._release('guard', 'k:Space'); resolve({ ok: false, trials, phase }); }
        });
      }));
      t.log(`order-parry trials ${JSON.stringify(r.trials)}`);
      t.assert(r.ok, `caught ${r.trials.length}/4 rat pokes mid-chain (phase ${r.phase})`);
      for (const tr of r.trials) {
        // the queued / next auto swing must never swallow the press: she is in the Stand within a frame or two
        // (or right after the active frames she was in)
        t.assert(tr.guardAt !== undefined && tr.guardAt <= tr.activeLeft + 0.1,
          `Stand pressed ${tr.lead}s before the poke during ${tr.swing}${tr.queued ? ' (next queued)' : ''}: in the Stand after ${tr.guardAt}s (active left ${tr.activeLeft}s)`);
        // inside the 0.15 s parry window → parry; the early −0.28 s press is outside it → a block. Never a clean hit
        // ('none' = the poke never landed, e.g. her swing knocked the rat out of reach)
        const want = tr.lead <= 0.15 ? ['parry', 'none'] : ['parry', 'block', 'none'];
        t.assert(want.includes(tr.result), `Stand at −${tr.lead}s mid-chain: ${tr.result} (expected ${want.join(' / ')})`);
      }
      const parries = r.trials.filter((tr) => tr.result === 'parry').length, early = r.trials.filter((tr) => tr.lead <= 0.15 && tr.result !== 'none').length;
      t.assert(parries >= 1 && parries >= early, `mid-chain parries ${parries} of ${early} landed in-window pokes`);
      await t.G(() => { const g = window.__GAME__, c = g.ctx; c.player.orders.clear('smoke'); c.cam.select?.(null); c.state.settings.autoAttack = 'auto'; if (g.__plRat.alive) c.enemies.despawn(g.__plRat); return true; });
    },
  },

  // ------------------------------------------------------------------ the Stand snaps to the incoming wind-up (§8.1)
  {
    name: 'player:stand-snap', order: 28.3, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await isoPlay(t, 'start');                                          // the day meadow (readable shots)
      await install(t);
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, p = c.player;
        const e = g.__pl.rat(Math.PI * 0.75, 1.6);                     // behind her left; its AI runs
        e.ai = true; e.alerted = true;
        g.__plRat = e;
        return true;
      });
      // when its wind-up on her is 0.2–0.6 s from landing: turn her away, then press the Stand (same frame)
      const r = await t.G(() => new Promise((resolve) => {
        const g = window.__GAME__, c = g.ctx, p = c.player, e = g.__plRat, input = c.input;
        let phase = 0, away = 0, t0 = performance.now(), snapF = null;
        const off = c.game.addFrameHook(() => {
          const nx = c.combat.nextParryable?.(p, 6);
          if (phase === 0 && nx && nx.attacker === e) {
            const lead = nx.activeAt - c.game.time;
            if (lead > 0.2 && lead < 0.6) {
              away = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);  // facing directly away from the rat
              p.facing = away;
              input._press('guard', 'k:Space');
              phase = 1;
              return;
            }
          }
          if (phase === 1 && p.state === 'guard') {
            const want = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
            snapF = Math.abs(Math.atan2(Math.sin(p.facing - want), Math.cos(p.facing - want)));
            phase = 2;
          }
          if (phase >= 2 && phase++ > 40) { off(); input._release('guard', 'k:Space'); resolve({ ok: true, snapErr: snapF, away }); }
          if (performance.now() - t0 > 25000) { off(); input._release('guard', 'k:Space'); resolve({ ok: false, phase }); }
        });
      }));
      t.assert(r.ok, `caught a rat wind-up on her (phase ${r.phase})`);
      if (r.ok) t.assert(r.snapErr < 0.2, `the Stand snapped to the threat on its first step (off by ${(r.snapErr * 57.3).toFixed(1)}°)`);
      const res = await t.G(() => window.__GAME__.__plEv.filter((e) => e.type === 'combat:hit' && e.toPlayer).map((e) => e.result));
      const parried = await t.G(() => window.__GAME__.__plEv.some((e) => e.type === 'player:parry'));
      t.log(`stand-snap: off ${(r.snapErr * 57.3).toFixed(1)}°, results ${JSON.stringify(res)} parry ${parried}`);
      t.assert(parried || res.some((x) => x === 'block' || x === 'parry'), 'the snapped Stand met the poke (parry or block)');
      await t.G(() => { const g = window.__GAME__; if (g.__plRat.alive) g.ctx.enemies.despawn(g.__plRat); return true; });
      // the fan screenshot: a fresh Stand facing the cursor
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player; g.aimAt(p.pos.x - 3, p.pos.z + 1); return true; });
      await t.page.keyboard.down('KeyQ');                                // TT3 §11.2: Q (and RMB / L) = the Stand
      await until(t, 'p.state === "guard"', 3000);
      await shot(t, 'player/stand-fan');
      await t.page.keyboard.up('KeyQ');
    },
  },

  // ------------------------------------------------------------------ WASD always overrides an order (§5.1)
  {
    name: 'player:wasd-override', order: 28.4, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await install(t);
      await isoPlay(t);
      // TT3 §11.2: a click order AND WASD walking: `mouseOnly` (RMB moves, WASD walks); `hybrid` has no move click
      await t.G(() => { const c = window.__GAME__.ctx; c.state.settings.controlPreset = 'mouseOnly'; c.bus.emit('settings:changed', { key: 'controlPreset', value: 'mouseOnly' }); c.input.rebind('mouseOnly'); return true; });
      await t.G(() => { window.__GAME__.ctx.cam.zoom?.(1.4); return true; });
      await t.frames(10);
      const p0 = await ps(t);
      const goal = await t.G(([x, z]) => {
        const g = window.__GAME__, H = innerHeight;
        for (let d = 12; d >= 5; d -= 0.5) { const s = g.screen(x, z + d); if (s && s.y > 60 && s.y < H - 60) return { ...s, d }; }
        return null;
      }, [p0.pos[0], p0.pos[2]]);
      await t.page.mouse.move(goal.x, goal.y);
      await t.page.mouse.down({ button: 'right' }); await t.page.mouse.up({ button: 'right' });
      t.assert(await until(t, 'p.orders.kind === "move"', 3000), 'the click issues a move order');
      const mid = await ps(t);
      await t.page.keyboard.down('KeyD');
      const cut = await until(t, '!p.orders.kind', 2000);
      await t.wait(500);
      await t.page.keyboard.up('KeyD');
      const o = await t.G(() => window.__GAME__.orders());
      const end = await ps(t);
      t.assert(cut && o.last === 'direct', `D cancels the order at once (${o.kind} / ${o.last})`);
      t.assert(end.pos[0] < mid.pos[0] - 0.8, `and she walks screen-right (−X at yaw π): Δx ${(end.pos[0] - mid.pos[0]).toFixed(2)}`);
      t.assert(end.pos[2] - p0.pos[2] < goal.d - 0.5, `she never reached the order point (${(end.pos[2] - p0.pos[2]).toFixed(2)} of ${goal.d} m)`);
      await t.G(() => { window.__GAME__.ctx.cam.zoom?.(1); return true; });
      // an LMB press cancels a move order too (attack input, §5.2), and swings toward the cursor
      await t.G(([x, z]) => window.__GAME__.order('move', [x, z]), [end.pos[0], end.pos[2] + 8]);
      await t.frames(5);
      await t.G(() => { const p = window.__GAME__.ctx.player; window.__GAME__.aimAt(p.pos.x - 3, p.pos.z); return true; });
      await t.frames(2);
      await clearEv(t);
      await t.tap('KeyJ');
      t.assert(await waitEv(t, 'player:swing', 2000), 'J swings');
      const o2 = await t.G(() => ({ o: window.__GAME__.orders(), f: window.__GAME__.ctx.player.facing }));
      t.assert(!o2.o.kind && o2.o.last === 'attack', `attack input cancels the move order (${o2.o.last})`);
      t.assert(Math.abs(Math.atan2(Math.sin(o2.f + Math.PI / 2), Math.cos(o2.f + Math.PI / 2))) < 0.4, `the swing faces the cursor (facing ${o2.f.toFixed(2)})`);
    },
  },

  // ------------------------------------------------------------------ touch: tap orders, loop auto-attack, Auto-Riposte, ±90°
  {
    name: 'player:touch', order: 28.5, level: null, timeout: 400000,
    async run(t) {
      for (const [w, h, tag] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
        const s = await phone(t, w, h);
        try {
          await s.page.touchscreen.tap(Math.round(w * 0.6), Math.round(h * 0.35));       // first touch: device 'touch'
          await s.G(() => { const g = window.__GAME__; g.story.skip?.(); g.setMode('play'); g.god(true); g.ctx.ui?.touch?.enable?.(true); g.ctx.player.orders.clear('smoke'); return true; });
          await s.frames(20);
          const dev = await s.G(() => window.__GAME__.ctx.input.device);
          t.assert(dev === 'touch', `${tag}: device touch (${dev})`);
          const until2 = async (src, ms = 8000) => {
            const t0 = Date.now();
            for (;;) {
              const v = await s.G((code) => { try { return !!new Function('g', 'p', `return (${code})`)(window.__GAME__, window.__GAME__.ctx.player); } catch { return false; } }, src);
              if (v || Date.now() - t0 > ms) return v;
              await s.page.waitForTimeout(100);
            }
          };
          // ---- tap the ground 3 m up-screen: a move order that arrives
          const p0 = await s.G(() => window.__GAME__.ctx.player.pos.toArray());
          const goal = [p0[0] + 1, p0[2] + 3];
          await s.tapAt(goal[0], goal[1]);
          const arrived = await until2(`Math.hypot(p.pos.x - ${goal[0]}, p.pos.z - ${goal[1]}) < 0.7 && !p.orders.kind`, 8000);
          t.assert(arrived, `${tag}: tap-to-move arrives`);
          // ---- tap a rat: attack order; on touch autoAttack 'auto' = loop: she keeps chaining until it falls
          await s.G(() => {
            const g = window.__GAME__, c = g.ctx, p = c.player;
            c.state.settings.autoAttack = 'auto';
            const e = g.spawn('rat_pike', p.pos.x - 1.5, p.pos.z + 3.5); e.ai = false;
            window.__tRat = e; window.__tSw = 0;
            window.__tOff?.(); window.__tOff = c.bus.on('player:swing', () => { window.__tSw++; });
            return true;
          });
          await s.frames(10);
          const rsp = await s.G(() => { const e = window.__tRat; return window.__GAME__.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); });
          await s.page.touchscreen.tap(Math.round(rsp.x), Math.round(rsp.y));
          let ord = await until2('p.orders.kind === "attack" || !window.__tRat.alive', 3000);
          if (!ord) {                                                       // a loaded GPU can drop the first tap's frame
            const dbg = await s.G(() => ({ o: window.__GAME__.orders(), ev: window.__GAME__.lastEvent('player:order'), dev: window.__GAME__.ctx.input.device }));
            t.warn(`${tag}: first tap on the rat → ${JSON.stringify(dbg)} (${Math.round(rsp.x)}, ${Math.round(rsp.y)}); tapping again`);
            const r2 = await s.G(() => { const e = window.__tRat; return window.__GAME__.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); });
            await s.page.touchscreen.tap(Math.round(r2.x), Math.round(r2.y));
            ord = await until2('p.orders.kind === "attack" || !window.__tRat.alive', 3000);
          }
          t.assert(ord, `${tag}: a tap on the rat = an attack order`);
          await until2('p.state === "attack"', 6000);
          await s.shot(`player/touch-${tag}-attack`);
          const dead = await until2('!window.__tRat.alive', 15000);
          const sw = await s.G(() => window.__tSw);
          t.assert(dead, `${tag}: loop auto-attack keeps chaining until the rat falls (${sw} swings)`);
          // ---- Auto-Riposte: hold 🛡, a poke is parried, the Riposte fires by itself 0.15 s later
          await s.G(() => {
            const g = window.__GAME__, c = g.ctx, p = c.player;
            c.player.orders.clear('smoke'); c.cam.select?.(null);
            const a = p.facing, e = g.spawn('rat_pike', p.pos.x + Math.sin(a) * 1.3, p.pos.z + Math.cos(a) * 1.3); e.ai = false;
            window.__tRat2 = e; window.__tRip = 0;
            window.__tOff2?.(); window.__tSwAll = [];
            window.__tOff2 = c.bus.on('player:swing', (x) => { window.__tSwAll.push(x?.attackId); if (x?.attackId === 'riposte') window.__tRip++; });
            return true;
          });
          await s.frames(10);
          const gb = await s.G(() => { const b = document.querySelector('.touch-cluster .tbtn[data-action="guard"]'); const r = b?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
          t.assert(gb, `${tag}: the 🛡 button`);
          if (gb) {
            // press 🛡 (a synthetic touch on the button) and poke on the Stand's first step, page-side: a harness round
            // trip outlasts the 0.20 s touch parry window on a loaded machine
            const res = await s.G(([x, y]) => new Promise((resolve) => {
              const g = window.__GAME__, c = g.ctx, p = c.player, e = window.__tRat2;
              p.invulnT = 0; p.guardState.grit = p.guardState.gritMax; p.guardState.lockoutT = 0;
              const el = document.elementFromPoint(x, y)?.closest?.('.tbtn');
              (window.__ptrCap ??= {})[21] = el;
              el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 21, clientX: x, clientY: y, pointerType: 'touch' }));
              const t0 = performance.now();
              const off = c.game.addFrameHook(() => {
                if (p.state === 'guard') { off(); p.invulnT = 0; resolve(c.combat.applyHit(e, p, c.config.ATTACKS.rat_poke)); }
                else if (performance.now() - t0 > 15000) { off(); resolve(`no-guard (${el?.className} ${p.state})`); }
              });
            }), [gb.x, gb.y]);
            t.assert(res === 'parry', `${tag}: holding 🛡 raises the Stand, a poke on its first step is parried (${res})`);
            const rip = await until2('window.__tRip > 0', 10000);            // slow motion + hitstop on a loaded GPU
            if (!t.assert(rip, `${tag}: Auto-Riposte fired on touch`)) {
              t.log(JSON.stringify(await s.G(() => { const p = window.__GAME__.ctx.player; return { sw: window.__tSwAll, st: p.state, ar: p.autoRiposteT, n: p.autoRiposted ?? 0, rt: p.riposteT, tgt: !!p.riposteTarget, dev: window.__GAME__.ctx.input.device, ts: window.__GAME__.ctx.game.timeScale }; })));
            }
            await s.shot(`player/touch-${tag}-riposte`);
            // ±90° on touch: a poke from 80° off her nose meets the Stand (KBM's ±70° would not)
            await until2('p.state === "guard"', 4000);
            const side = await s.G(() => {
              const g = window.__GAME__, c = g.ctx, p = c.player, e = window.__tRat2;
              if (!e.alive) return 'dead';
              p.invulnT = 0; p.guardState.grit = p.guardState.gritMax;
              p.facing = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z) + (80 * Math.PI) / 180;
              return c.combat.applyHit(e, p, c.config.ATTACKS.rat_poke);
            });
            t.assert(side === 'block' || side === 'parry' || side === 'dead', `${tag}: 80° off the nose is inside the touch guard arc (${side})`);
            await s.touch('pointerup', gb.x, gb.y, 21);
          }
          await s.G(() => { const c = window.__GAME__.ctx; for (const e of [...c.enemies.list]) c.enemies.despawn(e); return true; });
          await s.shot(`player/touch-${tag}-end`);
        } finally { await s.close(); }
      }
    },
  },
];
