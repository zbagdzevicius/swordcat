// tests/smoke/fx.mjs  (owner: fx) — the fx area in the running game (GAME_DESIGN §8.1, §8.2, §17, §18.3, §19.9 item 4).
// Screenshots → tests/shots/fx/*.png
//   fx:telegraphs  every §8.1 kind / §19.5 shape around her (glints, "!", "!!", swirl, rings, aim line, decals, shadow)
//                  + a real rat_pike's windup glint arriving through combat:telegraph
//   fx:live        a live crossbow rat's aim line and a crow's dive shadow (live tellPos / tellDir vectors)
//   fx:juice       the J combo on a rat: hit-stars + damage numbers, the kill poof (one per kill), block sparks
//   fx:holy        Shard 1 + Valor: hold J → silver → gold charge (sparkles, warm light, bloom 1.2), release → the crescent
//   fx:trail       a slash mid-swing: the ribbon follows her blade
//   fx:mist        an arena fog wall rises and dissolves; ambient mist cards and meadow motes are on; Meme Cam locks the
//                  mist drift to the camera loop; the shader warm-up ran on level load
//   fx:horde       CS-02's 40 silhouettes march horde_a → horde_b in the fog, part around her, then flee
//   fx:dizzy       boss Dizzy stars + gold "!", the hurt vignette and the low-HP pulse
//   fx:gallery     every burst kind frozen in front of her (art review)
//
// Robust under load (other agents share the GPU / CPU): every moment worth a screenshot is frozen in SIM time by an
// in-page bus listener (`__fxFreeze`: time scale 0 a fixed sim delay after the event), and every wait polls a condition
// instead of sleeping a fixed number of milliseconds.
import fs from 'node:fs';
import path from 'node:path';

const shotDir = (t) => fs.mkdirSync(path.join(t.shotsDir, 'fx'), { recursive: true });
const stats = (t) => t.G(() => window.__GAME__.ctx.fx.stats());

/** Poll a page-side predicate (function source evaluated with `g` = __GAME__) until it holds; → its last value or null. */
async function untilPage(t, src, ms = 10000, arg = null) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await t.G(([s, a]) => { const g = window.__GAME__; return new Function('g', 'a', `return (${s})(g, a)`)(g, a); }, [src, arg]);   // eslint-disable-line no-new-func
    if (v) return v;
    if (Date.now() > end) return null;
    await t.wait(120);
  }
}

/** Poll fx.stats() until `pred(stats)` holds; → last stats or null. */
async function until(t, pred, ms = 8000) {
  const end = Date.now() + ms;
  let s = await stats(t);
  while (!pred(s)) {
    if (Date.now() > end) return null;
    await t.wait(150);
    s = await stats(t);
  }
  return s;
}

/** Page-side: spawn an enemy at (angle relative to her facing, distance), facing her; `ai` false = a still target. */
const SPAWN = (type, rel, dist, ai) => {
  const g = window.__GAME__, ctx = g.ctx, p = ctx.player, THREE = g.THREE;
  const a = p.facing + rel;
  const pos = new THREE.Vector3(p.pos.x + Math.sin(a) * dist, 0, p.pos.z + Math.cos(a) * dist);
  pos.y = ctx.physics.heightAt(pos.x, pos.z);
  const e = ctx.enemies.spawn(type, pos, { facing: Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z) });
  if (!ai) e.ai = false;
  return e;
};

/** Page-side: put her at (x, z) facing `f` with the camera snapped behind her; clear enemies. */
const PLACE = (x, z, f) => {
  const g = window.__GAME__, ctx = g.ctx;
  for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);
  ctx.player.teleport({ pos: new g.THREE.Vector3(x, ctx.physics.heightAt(x, z), z), facing: f });
  ctx.cam.snapBehind?.();
  return true;
};

/**
 * Page-side: freeze the world (time scale 0) `delay` sim seconds after the next `E[key]` event that passes the filter
 * (`target`: the hit target's actor id; `attackId`; telegraph `kind`). Sets `__fxFrozen = true` once frozen. Hitstop does not count.
 */
const FREEZE = (key, delay, filter) => {
  const g = window.__GAME__, ctx = g.ctx;
  g.__fxFrozen = false;
  g.__fxOffFreeze?.();
  let t0 = -1, offHook = null;
  const off = ctx.bus.on(g.E[key], (p) => {
    if (t0 >= 0) return;
    if (filter?.target != null && p?.target?.id !== filter.target) return;
    if (filter?.attackId != null && p?.attackId !== filter.attackId) return;
    if (filter?.kind != null && p?.kind !== filter.kind) return;
    t0 = ctx.game.time;
    off();
    offHook = ctx.game.addFrameHook(() => {
      if (ctx.game.time - t0 < delay) return;
      ctx.game.setTimeScale(0);
      g.__fxFrozen = true;
      offHook();
    });
  });
  g.__fxOffFreeze = () => { off(); offHook?.(); };
  return true;
};

/** Arm a freeze, run `act`, wait (≤ ms) until frozen. → true when the moment was caught. */
async function freezeOn(t, key, delay, filter, act, ms = 30000) {
  await t.G(([k, d, f]) => window.__GAME__.__fxFreeze(k, d, f), [key, delay, filter]);
  await act();
  const ok = !!(await untilPage(t, '(g) => g.__fxFrozen', ms));
  if (!ok) await t.G(() => window.__GAME__.__fxOffFreeze?.());
  return ok;
}

const resume = (t) => t.G(() => { window.__GAME__.ctx.game.setTimeScale(1); return true; });

/** A clear stretch of the meadow lane (no fence between her and the camera), facing +Z. */
async function prepare(t, at = [-4, -50, 0]) {
  shotDir(t);
  await t.G(([src, place, freeze, at]) => {
    const g = window.__GAME__;
    g.__fxSpawn = new Function(`return (${src})`)();     // eslint-disable-line no-new-func
    g.__fxPlace = new Function(`return (${place})`)();   // eslint-disable-line no-new-func
    g.__fxFreeze = new Function(`return (${freeze})`)(); // eslint-disable-line no-new-func
    g.god(true);
    g.ctx.game.setTimeScale(1);
    g.ctx.input.setDevice?.('kbm');
    g.__fxPlace(...at);
    return true;
  }, [SPAWN.toString(), PLACE.toString(), FREEZE.toString(), at]);
  await t.frames(30);
}

export default [
  {
    name: 'fx:telegraphs', order: 50, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t);
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, THREE = g.THREE, S = g.__fxSpawn, fx = ctx.fx;
        const f = p.facing, fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f)), side = new THREE.Vector3(Math.cos(f), 0, -Math.sin(f));
        const at = (fw, sd) => { const v = p.pos.clone().addScaledVector(fwd, fw).addScaledVector(side, sd); v.y = ctx.physics.heightAt(v.x, v.z); return v; };
        const rats = [S('rat_pike', 0.75, 4.2), S('rat_pike', 0.3, 5.0), S('rat_pike', -0.3, 5.0), S('rat_pike', -0.75, 4.2), S('rat_pike', 0.05, 7.5), S('rat_xbow', -0.12, 9)];
        const ids = [];
        const D = 30;    // long: the screenshot may take seconds under load; ended explicitly below
        ids.push(fx.telegraph({ actor: rats[0], kind: 'parry', duration: D }));
        ids.push(fx.telegraph({ actor: rats[1], kind: 'gold', duration: D }));
        ids.push(fx.telegraph({ actor: rats[2], kind: 'red', duration: D }));
        ids.push(fx.telegraph({ actor: rats[3], kind: 'grab', duration: D }));
        ids.push(fx.telegraph({ actor: rats[4], kind: 'jeer', shape: 'rings', size: 2.2, duration: D }));
        ids.push(fx.telegraph({ actor: rats[5], kind: 'aim', shape: 'line', size: 18, duration: D }));
        ids.push(fx.telegraph({ kind: 'aoe', shape: 'circle', pos: at(2.6, 2.4).toArray(), size: 1.4, duration: 3 }));
        ids.push(fx.telegraph({ kind: 'aoe', shape: 'lane', pos: at(1.2, -2.6).toArray(), dir: fwd.toArray(), size: [1.4, 4.5], duration: 3 }));
        ids.push(fx.telegraph({ kind: 'aoe', shape: 'cone', pos: at(5.5, 2.8).toArray(), dir: fwd.clone().negate().toArray(), size: [2.5, 1.2], duration: 3 }));
        ids.push(fx.telegraph({ kind: 'red', shape: 'ring', pos: at(6.5, -2.5).toArray(), size: [1.5, 2.3], duration: 3 }));
        ids.push(fx.telegraph({ kind: 'shadow', shape: 'shadow', pos: at(2.4, -0.4).toArray(), size: 0.9, duration: 3 }));
        g.__fxIds = ids;
        g.__fxT0 = ctx.game.time;
        return { n: ids.length };
      });
      // decals half full (1.5 s of their 3 s), glints popped: freeze there
      t.assert(!!(await untilPage(t, '(g) => g.ctx.game.time - g.__fxT0 >= 1.5', 15000)), 'sim time never advanced 1.5 s');
      await t.G(() => window.__GAME__.ctx.game.setTimeScale(0));
      await t.frames(2);
      await t.shot('fx/telegraphs');
      const s = await stats(t);
      await resume(t);
      t.assert(s.telegraphs === r.n, `telegraphs drawn ${s.telegraphs}, expected ${r.n}`);
      t.assert(s.marks >= 10, `telegraph marks ${s.marks}`);
      for (const k of ['parry', 'gold', 'red', 'aoe', 'aim', 'grab', 'jeer', 'shadow']) t.assert(s.byKind[k] >= 1, `kind ${k} never drawn`);
      await t.G(() => { const g = window.__GAME__; for (const id of g.__fxIds) g.ctx.fx.telegraphEnd(id); });
      t.assert(!!(await until(t, (x) => x.telegraphs === 0, 8000)), 'telegraphs did not end');
      // a real enemy windup: the rat's own combat:telegraph reaches fx
      const before = (await stats(t)).byKind;
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.__fxSpawn('rat_pike', 0, 1.6, true); });
      const got = await freezeOn(t, 'TELEGRAPH', 0.12, null, () => t.clearEvents(), 15000);
      t.assert(got, 'a live rat_pike never telegraphed');
      if (got) {
        await t.shot('fx/telegraph-rat');
        const s2 = await stats(t);
        t.assert(s2.byKind.parry + s2.byKind.gold + s2.byKind.red > before.parry + before.gold + before.red, 'the rat\'s telegraph was not drawn by fx');
      }
      await resume(t);
      t.log(`telegraphs ${r.n}, marks ${s.marks}`);
    },
  },
  {
    // live enemies drive the live-vector telegraphs: the crossbow's aim line (stops tracking before the shot) and the
    // crow's dive shadow (tracks, then freezes)
    name: 'fx:live', order: 50.5, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t);
      const b0 = (await stats(t)).byKind;
      await t.G(() => { const g = window.__GAME__; g.__fxSpawn('rat_xbow', 0.45, 8, true); return true; });
      const aim = await freezeOn(t, 'TELEGRAPH', 0.3, { kind: 'aim' }, () => t.clearEvents(), 25000);
      t.assert(aim, 'the crossbow rat never aimed (no telegraph)');
      if (aim) {
        const s = await stats(t);
        await t.shot('fx/live-aim');
        const lines = await t.G(() => window.__GAME__.ctx.fx.telegraphs.lines.filter((l) => l.mesh.visible).length);
        t.assert(s.byKind.aim > b0.aim, 'the crossbow telegraph was not an aim line');
        t.assert(lines >= 1, 'no aim line visible during the windup');
      }
      await resume(t);
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.__fxSpawn('crow', -0.5, 7, true); return true; });
      const sh = await freezeOn(t, 'TELEGRAPH', 0.35, { kind: 'shadow' }, () => t.clearEvents(), 30000);
      t.assert(sh, 'the crow never dove (no telegraph)');
      if (sh) {
        const s = await stats(t);
        t.assert(s.byKind.shadow > b0.shadow, 'the crow telegraph was not a shadow');
        await t.shot('fx/live-shadow');
      }
      await resume(t);
    },
  },
  {
    name: 'fx:juice', order: 51, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t);
      // a sturdy still rat a little to her left (aim assist turns her to it; the camera sees it past her shoulder)
      const id = await t.G(() => { const e = window.__GAME__.__fxSpawn('rat_pike', 0.5, 1.45, false); e.hp = e.maxHp = 999; return e.id; });
      const c0 = (await stats(t)).counts;
      // slash1 lands: freeze 0.07 s (sim) after the hit, while the stars fly
      const hit = await freezeOn(t, 'HIT', 0.07, { target: id }, () => t.page.keyboard.press('KeyJ'));
      t.assert(hit, 'slash1 did not hit the rat');
      if (hit) {
        const s = await stats(t);
        await t.shot('fx/hit');
        // the 4 hit-stars (0.34–0.5 s) outlive the flash / slash sparks (≤ 0.2 s) when a slow frame overshoots the freeze
        t.assert(s.particles >= 4, `hit-star particles ${s.particles}`);
        t.assert(s.numbersActive >= 1, `damage numbers on screen ${s.numbersActive}`);
      }
      await resume(t);
      // the rest of the combo
      for (let k = 0; k < 2; k++) {
        const n0 = (await stats(t)).counts.hits;
        await t.page.keyboard.press('KeyJ');
        await until(t, (x) => x.counts.hits > n0, 6000);
      }
      let s = await stats(t);
      t.assert(s.counts.hits >= c0.hits + 2, `combat:hit reached fx ${s.counts.hits - c0.hits}×`);
      t.assert(s.numbersShown >= 2, `damage numbers ${s.numbersShown}`);
      // the kill: one poof (enemy:died + the enemy's own fx:burst are folded together); wait for the combo to finish
      await untilPage(t, '(g) => !g.ctx.player.swing', 8000);
      const p0 = (await stats(t)).counts.poofs;
      await t.G((rid) => { const e = window.__GAME__.ctx.actors.list.find((a) => a.id === rid); if (e && e.alive) e.hp = 1; }, id);
      const died = await freezeOn(t, 'ENEMY_DIED', 0.12, null, () => t.page.keyboard.press('KeyJ'));
      t.assert(died, 'rat did not die');
      if (died) {
        s = await stats(t);
        await t.shot('fx/poof');
        t.assert(s.counts.poofs === p0 + 1, `kill poofs ${s.counts.poofs - p0}, expected exactly 1`);
        t.assert(s.particles > 15, `poof particles ${s.particles}`);
      }
      await resume(t);
      // block sparks: a combat:hit {blocked} on her
      const blk = await freezeOn(t, 'HIT', 0.06, null, () => t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
        ctx.bus.emit(g.E.HIT, { attacker: p, target: p, attackId: 'rat_poke', damage: 0, position: p.pos.clone(), dir: new g.THREE.Vector3(0, 0, -1), blocked: true, killed: false });
      }));
      t.assert(blk, 'block moment not caught');
      await t.shot('fx/block');
      t.assert((await stats(t)).counts.blocks >= 1, 'block sparks');
      await resume(t);
      t.log(`hits ${s.counts.hits}, numbers ${s.numbersShown}, particles ${s.particles}`);
    },
  },
  {
    name: 'fx:holy', order: 52, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t);
      await t.G(() => { const g = window.__GAME__; g.player.setShards(1); g.player.setValor(100); });
      await t.frames(5);
      const base = await t.G(() => window.__GAME__.ctx.postfx.bloomBase.strength);
      await t.page.keyboard.down('KeyJ');
      const silver = await untilPage(t, '(g) => g.ctx.player.chargeTier >= 1', 30000);
      t.assert(!!silver, 'charge never reached tier 1');
      await t.shot('fx/holy-silver');
      const gold = await untilPage(t, '(g) => g.ctx.player.chargeTier >= 2 && g.ctx.fx.stats().holy.player > 0.6', 30000);
      t.assert(!!gold, 'charge never reached tier 2 (gold)');
      await t.wait(300);
      const charge = await stats(t);
      await t.shot('fx/holy-gold');
      await t.G(() => { window.__GAME__.ctx.fx.screen.peakBloom = 0; });
      const cast = await freezeOn(t, 'PLAYER_HOLY', 0.3, null, () => t.page.keyboard.up('KeyJ'));
      t.assert(cast, 'no player:holy on release');
      if (cast) await t.shot('fx/holy-cast');
      await resume(t);
      const s = await until(t, (x) => x.holy.casts >= 1 && x.peakBloom >= 1.15, 8000) ?? await stats(t);
      t.assert(charge.holy.flashes >= 2, `charge tier flashes ${charge.holy.flashes}`);
      t.assert(charge.holy.player > 0.3, `holy level while charging ${charge.holy.player.toFixed(2)}`);
      t.assert(charge.holy.light > 0.1, `warm point light ${charge.holy.light.toFixed(2)}`);
      t.assert(charge.bloom > base + 0.2, `bloom while charging ${charge.bloom.toFixed(2)} (base ${base})`);
      t.assert(s.holy.casts >= 1, 'holy crescent never cast');
      t.assert(s.peakBloom >= 1.15, `holy bloom spike ${s.peakBloom.toFixed(2)}`);
      const after = await until(t, (x) => Math.abs(x.bloom - base) < 0.02, 12000);
      t.assert(!!after, 'bloom was not handed back to PostFX after the holy slash');
      t.log(`charge level ${charge.holy.player.toFixed(2)}, light ${charge.holy.light.toFixed(2)}, bloom ${charge.bloom.toFixed(2)} → peak ${s.peakBloom.toFixed(2)}`);
    },
  },
  {
    name: 'fx:trail', order: 53, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await prepare(t);
      const s0 = await stats(t);
      // freeze late in slash1's active window: the ribbon spans most of the arc
      const ok = await freezeOn(t, 'PLAYER_SWING', 0.2, { attackId: 'slash1' }, () => t.page.keyboard.press('KeyJ'));
      t.assert(ok, 'no slash1 swing');
      const s = await stats(t);
      await t.shot('fx/trail');
      await resume(t);
      t.assert(s.trailSamples > s0.trailSamples + 2, `trail samples ${s.trailSamples - s0.trailSamples}`);
      t.assert(s.trailVisible, 'trail ribbon not visible mid-swing');
    },
  },
  {
    name: 'fx:mist', order: 54, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      let s = await stats(t);
      t.assert(s.ambientMist, 'ambient mist cards off in meadow');
      t.assert(s.motes === 'fluff' || s.motes === 'fireflies', `meadow motes ${s.motes}`);
      t.assert(s.warmups >= 1, 'the fx shader warm-up never ran on level load');
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
        const c = p.pos.clone().add(new g.THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing)).multiplyScalar(9));
        g.__fxWall = ctx.fx.mistRing(c, 6);
        g.__fxT0 = ctx.game.realTime;
      });
      await untilPage(t, '(g) => g.ctx.game.realTime - g.__fxT0 > 1.0', 10000);
      await t.shot('fx/mist-wall');
      s = await stats(t);
      t.assert(s.walls === 1, `walls ${s.walls}`);
      await t.G(() => window.__GAME__.__fxWall.dispose());
      t.assert(!!(await until(t, (x) => x.walls === 0, 12000)), 'fog wall did not dissolve');
      // Meme Cam: the mist drift locks to the camera's 3.8 s loop, and lets go again on exit
      await t.G(() => window.__GAME__.idle(16));
      const locked = await until(t, (x) => x.mistLoop > 0.9, 15000);
      t.assert(!!locked, 'mist drift never locked to the Meme Cam loop');
      if (locked) await t.shot('fx/mist-memecam');
      await t.page.keyboard.press('KeyW');
      t.assert(!!(await until(t, (x) => x.mistLoop === 0, 15000)), 'mist loop lock not released after Meme Cam');
      const st = await t.state();
      t.log(`calls ${st.calls} tris ${st.tris}`);
    },
  },
  {
    name: 'fx:horde', order: 55, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      // stand ~23 m north of the lane (horde_a → horde_b passes z ≈ −50 here), facing it
      await prepare(t, [-4, -27, Math.PI]);
      const mode = await t.G(() => { const g = window.__GAME__; g.__fxT0 = g.ctx.game.realTime; return g.ctx.fx.horde(true, 'horde_a'); });
      t.assert(mode === 'march', `horde mode ${mode}`);
      await untilPage(t, '(g) => g.ctx.game.realTime - g.__fxT0 > 2.5', 15000);
      let s = await stats(t);
      await t.shot('fx/horde-march');
      t.assert(s.horde.count >= 24, `horde members ${s.horde.count}`);
      t.assert(s.horde.visible >= 10, `visible silhouettes ${s.horde.visible}`);
      const st = await t.state();
      t.log(`horde ${s.horde.count} (${s.horde.visible} visible), calls ${st.calls}`);
      // shot 10: the stream parts around her (crane view: no near fade)
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player; g.__fxT0 = g.ctx.game.realTime; g.ctx.fx.horde(true, p, { dir: [1, 0, 0], avoid: p, near: 0, length: 40, width: 6 }); });
      await untilPage(t, '(g) => g.ctx.game.realTime - g.__fxT0 > 1.5', 15000);
      await t.shot('fx/horde-part');
      const gap = await t.G(() => {
        const fx = window.__GAME__.ctx.fx, h = fx.hordeFx, p = window.__GAME__.ctx.player.pos, a = h.iA.array;
        let min = Infinity;
        for (let i = 0; i < h.count; i++) min = Math.min(min, Math.hypot(a[i * 4] - p.x, a[i * 4 + 2] - p.z));
        return min;
      });
      t.assert(gap > 2.0, `the horde walks through her (closest ${gap.toFixed(2)} m)`);
      await t.G(() => { const g = window.__GAME__; g.__fxT0 = g.ctx.game.realTime; g.ctx.fx.horde('flee', g.ctx.player); });
      await untilPage(t, '(g) => g.ctx.game.realTime - g.__fxT0 > 0.9', 15000);
      await t.shot('fx/horde-flee');
      t.assert(!!(await until(t, (x) => x.horde.mode === 'off', 20000)), 'the horde never finished fleeing');
    },
  },
  {
    name: 'fx:dizzy', order: 56, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await prepare(t);
      await t.G(() => {
        const g = window.__GAME__, e = g.__fxSpawn('rat_pike', 0, 2.6, false);
        g.ctx.bus.emit(g.E.BOSS_DIZZY, { boss: e, value: 100, max: 100, dizzy: true });
        g.ctx.player.hp = 2;
        g.ctx.bus.emit(g.E.PLAYER_DAMAGED, { amount: 1, hp: 2, maxHp: g.ctx.player.maxHp, source: null });
        g.__fxT0 = g.ctx.game.realTime;
      });
      await untilPage(t, '(g) => g.ctx.game.realTime - g.__fxT0 > 0.08', 8000);
      const s = await stats(t);
      await t.shot('fx/dizzy-hurt');
      t.assert(s.dizzy === 1, `dizzy actors ${s.dizzy}`);
      t.assert(s.vignette > 0.2, `hurt vignette ${s.vignette.toFixed(2)}`);
      await untilPage(t, '(g) => g.ctx.game.realTime - g.__fxT0 > 0.9', 8000);
      t.assert((await stats(t)).vignette > 0.1, 'low-HP vignette pulse');
      await t.G(() => { const g = window.__GAME__; g.ctx.player.hp = g.ctx.player.maxHp; });
      t.assert(!!(await until(t, (x) => x.vignette < 0.02, 6000)), 'vignette not cleared at full HP');
    },
  },
  {
    // art review: every burst kind laid out in front of her with the clock frozen (deterministic screenshots)
    name: 'fx:gallery', order: 57, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const kinds = [['poof', 3.2, 1.9, { type: 'rat_pike' }], ['heavyHit', 3.4, 0, {}], ['spark', 3.2, -1.9, {}],
        ['feathers', 5.5, 3.2, {}], ['droplets', 5.5, 1.1, {}], ['heal', 5.5, -1.1, {}], ['splash', 5.5, -3.2, {}],
        ['sparkle', 8, 3, { count: 14 }], ['confetti', 8, 1, {}], ['fish', 8, -1, { count: 5 }], ['rocks', 8, -3, {}],
        ['crate', 10.5, 2, {}], ['lock', 10.5, 0, {}], ['smoke', 10.5, -2, {}]];
      const shoot = async (name, sec) => {
        await t.G((dt) => {
          const g = window.__GAME__, fx = g.ctx.fx;
          g.ctx.game.setTimeScale(0);
          for (let i = 0; i < Math.round(dt * 60); i++) fx.particles.update(1 / 60);
          return true;
        }, sec);
        await t.frames(2);
        await t.shot(name);
      };
      await t.G((list) => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, THREE = g.THREE, f = p.facing;
        const fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f)), side = new THREE.Vector3(Math.cos(f), 0, -Math.sin(f));
        ctx.game.setTimeScale(0);
        for (const [k, a, b, o] of list) {
          const v = p.pos.clone().addScaledVector(fwd, a).addScaledVector(side, b);
          v.y = ctx.physics.heightAt(v.x, v.z) + (k === 'splash' || k === 'poof' ? 0 : 0.7);
          ctx.fx.burst(k, v, o);
        }
        return true;
      }, kinds);
      await shoot('fx/gallery-a', 0.1);
      await shoot('fx/gallery-b', 0.25);
      // holy crescent + ground ring, frozen mid-flight
      await t.G(() => { const g = window.__GAME__; g.ctx.fx.particles.clear(); g.ctx.fx.burst('holy', g.ctx.player); return true; });
      await t.G(() => { const g = window.__GAME__; for (let i = 0; i < 9; i++) g.ctx.fx.holyFx.render(1 / 60, 1 / 60); return true; });
      await shoot('fx/gallery-holy', 0.15);
      const s = await stats(t);
      await resume(t);
      t.assert(s.particles > 0, 'gallery particles');
    },
  },
  {
    // review fixes: a fog wall between the lens and her thins out (no grey-out); a flanker between the lens and her
    // gets screen-capped, softened marks (no frame-filling glint)
    name: 'fx:occlusion', order: 57.5, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, f = p.facing;
        const c = p.pos.clone().add(new g.THREE.Vector3(Math.sin(f), 0, Math.cos(f)).multiplyScalar(5.5));
        g.__fxWall = ctx.fx.mistRing(c, 6.2);
        return true;
      });
      t.assert(!!(await until(t, (x) => x.walls >= 1, 5000)), 'wall never rose');
      await t.wait(1500);
      const w = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, wall = ctx.scene.getObjectByName('fx.mist.wall');
        return { cam: ctx.camera.position.distanceTo(ctx.player.pos), focus: wall?.material.uniforms.uFocus.value.toArray() ?? null };
      });
      await t.shot('fx/occl-wall');
      t.assert(w.focus && w.focus[1] === 1 && w.focus[0] > 1, `wall focus uniform ${JSON.stringify(w.focus)}`);
      await t.G(() => { window.__GAME__.__fxWall?.remove(); return true; });
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, cam = ctx.camera.position;
        // a rat right between the lens and her
        const a = Math.atan2(cam.x - p.pos.x, cam.z - p.pos.z) - p.facing;
        const d = Math.hypot(cam.x - p.pos.x, cam.z - p.pos.z);
        const rat = g.__fxSpawn('rat_pike', a, Math.max(1.2, d - 1.6), false);
        g.__fxIds = [ctx.fx.telegraph({ actor: rat, kind: 'parry', duration: 30 })];
        return { d };
      });
      await t.wait(600);
      await t.G(() => window.__GAME__.ctx.game.setTimeScale(0));
      await t.frames(2);
      await t.shot('fx/occl-marks');
      await resume(t);
      await t.G(() => { const g = window.__GAME__; for (const id of g.__fxIds) g.ctx.fx.telegraphEnd(id); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); return true; });
      t.log(`cam→her ${w.cam.toFixed(2)} m, wall focus ${w.focus?.[0]?.toFixed(2)}, rat cam distance ~${(r.d - Math.max(1.2, r.d - 1.6)).toFixed(2)}`);
    },
  },
];
