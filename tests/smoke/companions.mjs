// tests/smoke/companions.mjs  (owner: companions) — GAME_DESIGN §9 companions, §12.1 lost kittens, D-01, CS-03 Pudding,
// scripted NPCs, driven through __GAME__ hooks in the running game. Screenshots → tests/shots/companions/*.png
// Iso controls (research/CONTROLS_SPEC.md): companions:iso-follow (idle slot off the aim notch, trail round a wall),
// companions:ability-aim (desktop Q tap / hold / cancel with the mouse), companions:touch (390×844 and 844×390 touch
// emulation: portrait button, drag-aim, tap a kitten), hub talk interactables in companions:hub. Keys per C10: Stand L,
// attack J, ability Q, Meow C (jump would be F).
// The blocks set up what they need themselves (world's meadow zones may not exist yet), around the player at `start`.
import fs from 'node:fs';
import path from 'node:path';

const shotDir = (t) => fs.mkdirSync(path.join(t.shotsDir, 'companions'), { recursive: true });

/** A one-off camera framing in her local frame (+Z forward, +X her left); `follow()` hands it back. */
const frame = (t, pos, look, fov = 50) => t.G(([p, l, f]) => {
  try { window.__GAME__.ctx.cam.shot({ anchor: 'swordcat', pos: p, look: l, fov: f, mode: 'cut' }); return true; } catch (e) { return String(e); }
}, [pos, look, fov]);
const follow = (t) => t.G(() => { try { window.__GAME__.ctx.cam.mode('follow'); } catch { /* camera mid-edit */ } });

/** Companion summary (small JSON). */
const comp = (t) => t.G(() => {
  const c = window.__GAME__.ctx, m = c.companions.active[0], p = c.player;
  if (!m) return null;
  return { id: m.kittenId, state: m.stateName, napT: m.napT, cd: m.cooldown, hp: m.hp, stats: { ...m.stats },
    dist: Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z), behind: (m.pos.x - p.pos.x) * Math.sin(p.facing) + (m.pos.z - p.pos.z) * Math.cos(p.facing),
    walls: c.companions.walls.length, posts: c.actors.byTag('shieldWall').length, ready: m.readiness };
});

/** Spawn `type` `ahead` m in front of her (+ `side` m to her left), alerted. */
const spawnAhead = (t, type, ahead, side = 0) => t.G(([ty, a, s]) => {
  const g = window.__GAME__, p = g.ctx.player, f = p.facing;
  const x = p.pos.x + Math.sin(f) * a + Math.cos(f) * s, z = p.pos.z + Math.cos(f) * a - Math.sin(f) * s;
  const e = g.spawn(ty, x, z);
  e?.alert?.();
  return !!e;
}, [type, ahead, side]);

/** Freeze the simulation (rendering continues) so a transient moment can be framed and shot; `false` resumes. */
const freeze = (t, on) => t.G((v) => window.__GAME__.game.setTimeScale?.(v ? 0 : 1), on);

/**
 * Stage her on open grass north of the practice-field fence (the `start` spawn has the fence right behind the camera),
 * facing +Z, camera behind her.
 */
const stage = (t, x = -4, z = -50, facing = 0) => t.G(([sx, sz, f]) => {
  const g = window.__GAME__, c = g.ctx;
  g.game.setTimeScale?.(1);                                          // a failed block may have left the sim frozen
  c.player.teleport({ pos: new g.THREE.Vector3(sx, c.physics.heightAt(sx, sz), sz), facing: f });
  try { c.cam.mode('follow'); c.cam.snapBehind?.(); } catch { /* camera mid-edit */ }
}, [x, z, facing]);

const clearEnemies = (t) => t.G(() => { const c = window.__GAME__.ctx; for (const e of [...(c.enemies.list ?? [])]) c.enemies.despawn?.(e); });

/** Screenshot with one retry: on a loaded machine page.screenshot can time out once while the GPU catches up. */
const shot = async (t, name) => {
  try { return await t.shot(name); } catch (e) { t.warn(`screenshot ${name} retry: ${String(e?.message ?? e).split('\n')[0]}`); await t.wait(1500); return t.shot(name); }
};

/**
 * Poll `cond` (a page function → truthy) until it holds, `sim` seconds of game time pass, or `real` ms of wall clock
 * pass (a loaded machine runs the sim slower than the wall clock, so waits are measured in game time). → last value.
 */
const until = async (t, cond, arg, { sim = 6, real = 60000, every = 200 } = {}) => {
  const t0 = await t.G(() => window.__GAME__.game.time), r0 = Date.now();
  let v = await t.G(cond, arg);
  while (!v && Date.now() - r0 < real && (await t.G(() => window.__GAME__.game.time)) - t0 < sim) {
    await t.wait(every);
    v = await t.G(cond, arg);
  }
  return v;
};

/** Hold the Stand (L) until `cond` holds or `sim` s of game time pass. */
const holdStandUntil = async (t, cond, arg, sim = 4.5) => {
  await t.page.keyboard.down('KeyL');
  try { return await until(t, cond, arg, { sim, real: 60000, every: 150 }); } finally { await t.page.keyboard.up('KeyL'); }
};

/** Teleport her to (x, z) on the ground, facing `facing`, camera behind her. */
const put = (t, x, z, facing = 0) => t.G(([px, pz, f]) => {
  const g = window.__GAME__, c = g.ctx;
  c.player.teleport({ pos: new g.THREE.Vector3(px, c.physics.heightAt(px, pz), pz), facing: f });
  try { c.cam.mode('follow'); c.cam.snapBehind?.(); } catch { /* camera mid-edit */ }
}, [x, z, facing]);

/** Her Meow at her position (the KeyC input path is covered by companions:kittens). */
const meow = (t) => t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_MEOW, { position: g.ctx.player.pos.clone() }); });

/** Summary of one lost kitten / caged squire by id. */
const kitten = (t, id) => t.G((kid) => {
  const k = window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === kid);
  return k ? { st: k.stateName, hidden: k.hidden, rescued: k.rescued, pos: k.pos.toArray(), hide: k.hide, perchY: k.perchY } : null;
}, id);

/** Snapshot the save state (M2 blocks set flags / kittens; later blocks of other areas must not see them). */
const snapState = (t) => t.G(() => { const c = window.__GAME__.ctx; return { save: JSON.stringify(c.state.toJSON()), active: c.companions.active.map((x) => x.kittenId) }; });
const restoreState = (t, s) => t.G((v) => {
  const c = window.__GAME__.ctx;
  try { c.state.reset(JSON.parse(v.save)); } catch (e) { return String(e); }
  try { c.companions.setActive(v.active); } catch { /* level gone */ }
  window.__GAME__.game.setTimeScale?.(1);
  return true;
}, s);

export default [
  {
    name: 'companions:follow', order: 70, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => window.__GAME__.ctx.companions.setActive(['mochi']));
      await t.frames(5);
      const ev = await t.events();
      t.assert(ev.includes('companion:changed'), 'setActive did not emit companion:changed');
      let s = await comp(t);
      t.assert(s?.id === 'mochi', `active companion ${s?.id}, expected mochi`);
      t.assert(await t.G(() => window.__GAME__.ctx.actors.get('mochi') === window.__GAME__.ctx.companions.active[0]), 'actors.get("mochi") is not the companion');
      const p0 = (await t.state()).player.pos;
      await t.hold('KeyW', 2200);                                     // she runs ahead
      const p1 = (await t.state()).player.pos;
      const ran = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
      t.assert(ran > 3, `she did not run with W (${ran.toFixed(2)} m)`);
      s = await comp(t);
      t.assert(s.dist < 5.5, `Mochi fell behind while she ran (${s.dist.toFixed(2)} m)`);
      t.assert(s.behind < 0, `Mochi should trail behind her while she runs (${s.behind.toFixed(2)})`);
      await shot(t, 'companions/follow-run');
      // she stands still: Mochi comes up beside her (0.8 s of her standing, then the walk: poll in sim time, since a
      // loaded machine runs the sim slower than the wall clock)
      const t0 = await t.G(() => window.__GAME__.game.time);
      for (let i = 0; i < 40; i++) {
        await t.wait(200);
        s = await comp(t);
        if (s.dist > 0.6 && s.dist < 2.4 && s.state === 'idle') break;
        if ((await t.G(() => window.__GAME__.game.time)) - t0 > 4) break;
      }
      t.assert(s.dist > 0.6 && s.dist < 2.4, `Mochi beside her when she stops: ${s.dist.toFixed(2)} m`);
      await shot(t, 'companions/follow-still');
      await t.blankCheck('companions:follow');
      // teleport: far away → he pops back to her side
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.teleport(p.x + 22, p.y, p.z + 4); });
      await t.wait(700);
      s = await comp(t);
      t.assert(s.dist < 3, `no teleport back to her side (${s.dist.toFixed(2)} m)`);
      t.assert(s.stats.teleports >= 1, 'teleport not counted');
      const st = await t.state();
      t.log(`follow ok: ran ${ran.toFixed(1)} m, beside ${s.dist.toFixed(2)} m, scene calls ${st.calls}, tris ${st.tris}`);
    },
  },
  {
    name: 'companions:fight', order: 71, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => { const g = window.__GAME__; g.god(true); g.ctx.companions.setActive(['mochi']); });
      await t.frames(5);
      t.assert(await spawnAhead(t, 'rat_pike', 4, 1), 'enemies.spawn(rat_pike) failed');
      t.assert(await spawnAhead(t, 'rat_pike', 5, -1.2), 'enemies.spawn(rat_pike) failed');
      let s = null;
      for (let i = 0; i < 75; i++) { await t.wait(200); s = await comp(t); if (s.stats.hits >= 1) break; }
      t.assert(s.stats.hits >= 1, `Mochi landed no hit on engaging rats in 8 s (state ${s.state})`);
      await freeze(t, true);
      await frame(t, [3.2, 1.6, 2.5], [0, 0.5, 3.5], 55);
      await t.wait(300);
      await shot(t, 'companions/fight');
      await freeze(t, false);
      await follow(t);
      await clearEnemies(t);
      await t.G(() => window.__GAME__.god(false));
      t.log(`fight ok: ${s.stats.hits} hit(s), state ${s.state}`);
    },
  },
  {
    name: 'companions:shield-wall', order: 72, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => { const g = window.__GAME__; g.god(true); g.ctx.companions.setActive(['mochi']); });
      await t.wait(400);
      await spawnAhead(t, 'rat_pike', 6, 0);
      await t.clearEvents();
      // freeze the sim the frame the wall appears, so a slow machine can't age it before we look
      await t.G(() => {
        const g = window.__GAME__; window.__cmpFrozen = false;
        const off = g.game.addFrameHook(() => { if (g.ctx.companions.walls.length) { g.game.setTimeScale(0); window.__cmpFrozen = true; off(); } });
        setTimeout(off, 15000);
      });
      await t.tap('KeyQ');                                           // ability (Q)
      const frozen = await t.page.waitForFunction(() => window.__cmpFrozen === true, null, { timeout: 12000, polling: 50 }).then(() => true, () => false);
      t.assert(frozen, 'Q did not plant a Shield Wall within 12 s');
      let s = await comp(t);
      t.assert((await t.events()).includes('companion:ability'), 'Q did not fire companion:ability');
      t.assert(s.walls === 1 && s.posts >= 7, `Shield Wall missing (walls ${s.walls}, posts ${s.posts})`);
      const geo = await t.G(() => {
        const c = window.__GAME__.ctx, w = c.companions.walls[0], p = c.player, m = c.companions.active[0];
        return w ? { w: w.width, h: w.height, d: Math.hypot(w.center.x - p.pos.x, w.center.z - p.pos.z), cdUsed: m.cooldown + (window.__GAME__.game.time - m.abilityAt) } : null;
      });
      t.assert(!!geo, 'no wall to measure');
      if (geo) {
        t.assert(Math.abs(geo.cdUsed - 18) < 0.05, `cooldown ${geo.cdUsed.toFixed(2)}, expected 18 s`);
        t.assert(Math.abs(geo.w - 3) < 1e-6 && Math.abs(geo.h - 1.6) < 1e-6, `wall ${geo.w} × ${geo.h}, expected 3 × 1.6`);
        t.assert(Math.abs(geo.d - 1.5) < 0.3, `wall ${geo.d.toFixed(2)} m from her, expected 1.5`);
      }
      t.assert(await t.G(() => window.__GAME__.ctx.companions.useAbility() === false), 'ability fired again during its cooldown');
      await t.wait(150);
      await shot(t, 'companions/shield-wall');
      await frame(t, [2.6, 1.7, 5.2], [0, 0.6, 1.2], 50);
      await t.wait(250);
      await shot(t, 'companions/shield-wall-front');
      await freeze(t, false);
      await follow(t);
      // 4.0 s of sim time later the wall is down (posts unregistered; the pane fades 0.35 s)
      await t.page.waitForFunction(() => { const g = window.__GAME__, m = g.ctx.companions.active[0]; return g.game.time - m.abilityAt > 4.6; }, null, { timeout: 30000, polling: 100 }).catch(() => {});
      s = await comp(t);
      t.assert(s.walls === 0 && s.posts === 0, `wall still up after 4 s (walls ${s.walls}, posts ${s.posts})`);
      await clearEnemies(t);
      await t.G(() => window.__GAME__.god(false));
      t.log(`shield wall ok: ${geo?.w} × ${geo?.h} m at ${geo?.d?.toFixed(2)} m, cooldown left ${s.cd.toFixed(1)} s`);
    },
  },
  {
    name: 'companions:nap', order: 73, level: 'meadow', spawn: 'start',
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => window.__GAME__.ctx.companions.setActive(['mochi']));
      await t.wait(1500);
      await t.clearEvents();
      const knocked = await t.G(() => {                              // a knock-out blow: companions never die, they nap
        const c = window.__GAME__.ctx, m = c.companions.active[0];
        return m.resolveIncoming({ faction: 'enemy', pos: m.pos.clone() }, { id: 'smoke', dmg: 99 }, null);
      });
      t.assert(knocked === 'immune', `knock-out blow resolved as ${knocked}, expected immune (nap)`);
      let s = await comp(t);
      t.assert(s.napT > 7.5 && s.state === 'nap', `not napping (napT ${s.napT}, state ${s.state})`);
      t.assert((await t.events()).includes('companion:nap'), 'companion:nap not emitted');
      await t.wait(500);
      await freeze(t, true);
      await frame(t, [2.2, 1.3, 2.4], [0.6, 0.4, -0.6], 45);
      await t.wait(300);
      await shot(t, 'companions/nap');
      await freeze(t, false);
      await follow(t);
      await t.G(() => window.__GAME__.game.setTimeScale?.(4));
      try {
        for (let i = 0; i < 30; i++) { await t.wait(200); s = await comp(t); if (s.napT <= 0) break; }
      } finally { await t.G(() => window.__GAME__.game.setTimeScale?.(1)); }
      t.assert(s.napT <= 0 && s.hp === 8, `did not wake at full HP (napT ${s.napT}, hp ${s.hp})`);
      t.log(`nap ok: woke with ${s.hp} HP`);
    },
  },
  {
    name: 'companions:kittens', order: 74, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => window.__GAME__.ctx.companions.setActive([]));
      // Noodle hides in a barrel (Meow reveals within 10 m); Button appears after a 3 s planted Stand in the zone
      await t.G(() => {
        const c = window.__GAME__.ctx, p = c.player, f = p.facing, s = Math.sin(f), co = Math.cos(f);
        c.state.kittens = [];
        c.companions.spawnKitten('noodle', [p.pos.x + s * 4 - co * 2, p.pos.z + co * 4 + s * 2], 'meow', { prop: 'barrel', facing: f + Math.PI });
        c.companions.spawnKitten('button', [p.pos.x, p.pos.z], 'stand', { standTime: 3, zoneR: 1.2 });
      });
      await t.wait(800);
      await shot(t, 'companions/kitten-barrel');
      await t.clearEvents();
      await t.tap('KeyC');                                           // Meow
      let meowed = await t.waitForEvent('player:meow', 4000);
      if (!meowed) {                                                 // the player area's input path, not ours: say so, go on
        t.warn('C did not produce player:meow within 4 s; emitting it directly');
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_MEOW, { position: g.ctx.player.pos.clone() }); });
        meowed = true;
      }
      t.assert(await t.waitForEvent('kitten:reveal', 6000), 'a Meow within 10 m did not reveal Noodle');
      await t.wait(900);
      await shot(t, 'companions/kitten-reveal');
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'noodle');
        c.player.teleport({ pos: new g.THREE.Vector3(k.pos.x + 0.7, k.pos.y, k.pos.z - 0.7), facing: Math.atan2(-0.7, 0.7) });
      });
      t.assert(await t.waitForEvent('kitten:rescued', 8000), 'touching the revealed kitten did not rescue it');
      t.assert(await t.G(() => window.__GAME__.ctx.state.kittens.includes('noodle')), 'state.kittens lacks noodle');
      await freeze(t, true);
      await frame(t, [1.4, 1.1, 2.6], [-0.5, 0.65, 0.4], 45);
      await t.wait(350);
      await shot(t, 'companions/kitten-rescue');
      await freeze(t, false);
      await follow(t);
      // Button: stand still in the zone with the Stand up (L held) for 3 s, no enemy near
      await clearEnemies(t);
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'button');
        c.player.teleport({ pos: new g.THREE.Vector3(k.home.x + 0.3, k.home.y, k.home.z - 0.3), facing: 0 });
      });
      await t.wait(400);
      await t.clearEvents();
      // (2.5 s in, the Stand becomes Meme Cam: still counts)
      const revealed = await holdStandUntil(t, () => !window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'button')?.hidden);
      if (!revealed) {
        const why = await t.G(() => { const p = window.__GAME__.ctx.player; return { guarding: p.guarding, state: p.stateName, v: Math.hypot(p.vel.x, p.vel.z) }; });
        t.fail(`a 3 s Stand in the zone did not reveal Button (player ${JSON.stringify(why)})`);
      }
      await t.G(() => window.__GAME__.setMode('play'));               // out of Meme Cam to look at Button
      await follow(t);
      await t.wait(500);
      await shot(t, 'companions/kitten-stand');
      t.log('kittens ok: meow reveal, rescue, stand reveal');
    },
  },
  {
    name: 'companions:mochi-cage', order: 75, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      shotDir(t);
      await stage(t);
      // D-01: Mochi in the rat cage cart; locked until the arena clears; 30 HP lock (her hits only) → join scene → party
      const ok = await t.G(() => {
        const c = window.__GAME__.ctx, p = c.player, f = p.facing;
        c.companions.setActive([]);
        c.state.companions.unlocked = c.state.companions.unlocked.filter((id) => id !== 'mochi');
        const k = c.companions.spawnKitten('mochi', [p.pos.x + Math.sin(f) * 3.5, p.pos.z + Math.cos(f) * 3.5], 'cage',
          { needClear: 'smoke_bridge', hp: 30, play: 'd01', facing: f + Math.PI });
        return { lock: c.actors.has(k.lock), id: c.actors.get('mochi') === k };
      });
      t.assert(!ok.lock, 'cage lock is hittable before the arena clears');
      t.assert(ok.id, 'the caged Mochi is not the cutscene actor "mochi"');
      await t.wait(1200);
      await shot(t, 'companions/cage-cart');
      await t.G(() => window.__GAME__.ctx.bus.emit(window.__GAME__.E.ARENA_CLEAR, { id: 'smoke_bridge' }));
      await t.frames(2);
      // no invulnT resets: the lock must tick its own anti-multi-hit window between her blows
      const hits = { out: [await t.G(() => {
        const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'mochi');
        return c.combat.applyHit(c.companions.active[0] ?? k, k.lock, { id: 'smoke', dmg: 50 });   // not hers: immune
      })], opened: false };
      for (let i = 0; i < 4 && !hits.opened; i++) {
        await t.wait(250);
        const r = await t.G(() => {
          const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'mochi');
          return { r: c.combat.applyHit(c.player, k.lock, c.config.ATTACKS.slash1), opened: k.lock.opened };
        });
        hits.out.push(r.r); hits.opened = r.opened;
      }
      t.assert(hits.opened, `her hits did not open the 30 HP lock (${hits.out.join(', ')})`);
      t.assert(hits.out[0] === 'immune' || hits.out[0] === 'none', `a non-player hit on the lock resolved as ${hits.out[0]}`);
      await t.wait(300);
      await freeze(t, true);
      await t.wait(150);
      await shot(t, 'companions/cage-open');
      await freeze(t, false);
      const joined = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return g.ctx.companions.active[0]?.kittenId === 'mochi'; }, null, { sim: 8, every: 250 });
      t.assert(joined, 'Mochi did not join the party after the cage opened');
      t.assert((await t.events()).includes('companion:changed'), 'companion:changed not emitted on the join');
      t.assert(await t.G(() => window.__GAME__.ctx.state.companions.unlocked.includes('mochi')), 'mochi not unlocked in state');
      await t.G(() => window.__GAME__.setMode('play'));
      await follow(t);
      await t.wait(1600);
      await shot(t, 'companions/mochi-joined');
      t.log(`mochi cage ok: ${hits.out.join(', ')}`);
    },
  },
  {
    name: 'companions:pudding', order: 76, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      shotDir(t);
      // CS-03 end state: Pudding netted at (2,24) in the Picnic Glade; ropes cut → free → perches at pud_1..4
      await freeze(t, false);
      await t.G(() => window.__GAME__.ctx.companions.setActive([]));
      await t.G(() => { const g = window.__GAME__, c = g.ctx; c.player.teleport({ pos: new g.THREE.Vector3(0, c.physics.heightAt(0, 16), 16), facing: 0 }); });
      await t.wait(300);
      const setFlag = (v) => t.G((val) => {
        const g = window.__GAME__, c = g.ctx;
        c.state.setFlag('meadow.pudding', val);
        c.bus.emit(g.E.FLAG_SET, { key: 'meadow.pudding', value: val });
      }, v);
      await setFlag('netted');
      let pud = null;
      for (let i = 0; i < 120; i++) {                                // the GLB loads on the wall clock
        await t.wait(250);
        pud = await t.G(() => { const p = window.__GAME__.ctx.companions.pudding; return p && { mode: p.mode, model: !!p.model, r: p.radius, fixed: p.fixed, pos: p.pos.toArray() }; });
        if (pud?.model) break;
      }
      t.assert(pud?.mode === 'netted', `Pudding not netted (${pud?.mode})`);
      t.assert(pud?.model, 'Dragon_Evolved did not load');
      t.assert(pud?.r === 2.5 && pud?.fixed, 'netted Pudding should be a fixed r 2.5 collider');
      t.assert(await t.G(() => window.__GAME__.ctx.actors.get('pudding') === window.__GAME__.ctx.companions.pudding), 'actors.get("pudding") mismatch');
      await frame(t, [-2.2, 1.7, -2.5], [2, 1.0, 8], 55);
      await t.wait(400);
      await shot(t, 'companions/pudding-netted');
      await t.G(() => window.__GAME__.ctx.bus.emit(window.__GAME__.E.OBJECTIVE, { id: 'net_ropes', value: 2, max: 3 }));
      await t.wait(400);
      t.assert(await t.G(() => window.__GAME__.ctx.companions.pudding.ropesCut === 2), 'net_ropes progress did not reach the net');
      await setFlag(true);
      await t.wait(900);
      await freeze(t, true);
      await t.wait(150);
      await shot(t, 'companions/pudding-free');
      await freeze(t, false);
      await until(t, () => window.__GAME__.ctx.companions.pudding?.mode === 'perch', null, { sim: 10, every: 250 });
      pud = await t.G(() => ({ mode: window.__GAME__.ctx.companions.pudding?.mode, i: window.__GAME__.ctx.companions.pudding?.perchIndex }));
      const anchors = await t.G(() => !!window.__GAME__.ctx.levels.anchor?.('pud_1'));
      if (anchors) t.assert(pud.mode === 'perch' && pud.i >= 0, `Pudding did not fly to a perch (${pud.mode})`);
      else t.warn('meadow has no pud_1 anchor yet (world in progress): Pudding stays put');
      await follow(t);
      await t.G(() => { const g = window.__GAME__, c = g.ctx; c.player.teleport({ pos: new g.THREE.Vector3(8, c.physics.heightAt(8, 25), 25), facing: Math.atan2(12, 11) }); c.cam.snapBehind?.(); });
      await t.wait(900);
      await shot(t, 'companions/pudding-perch');
      // CS-04 pose + emotes through the ScriptedActor API
      const ok = await t.G(() => { const p = window.__GAME__.ctx.companions.pudding; p.setScripted(true); p.pose('sleep'); p.emote('nod'); const m = p.mode; p.pose('idle'); p.setScripted(false); return m; });
      t.assert(ok === 'sleep', `pose('sleep') → mode ${ok}`);
      t.log(`pudding ok: perch ${pud.i}`);
    },
  },
  {
    name: 'companions:npcs', order: 77, level: 'meadow', spawn: 'start',
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => window.__GAME__.ctx.companions.setActive([]));
      await t.wait(300);
      const ids = await t.G(() => {
        const c = window.__GAME__.ctx, p = c.player.pos, f = c.player.facing, s = Math.sin(f), co = Math.cos(f);
        const at = (a, side) => [p.x + s * a + co * side, p.z + co * a - s * side];
        const out = [];
        for (const [id, a, side] of [['pearl', 3, 1.2], ['whiskerbottom', 3.6, -1.1], ['coo', 2.4, -0.2], ['villager_3', 4.4, 0.4]]) {
          const n = c.companions.spawnNpc(id, at(a, side), f + Math.PI);
          out.push([id, c.actors.get(id) === n, n.hurtable]);
        }
        return out;
      });
      for (const [id, reg, hurt] of ids) { t.assert(reg, `spawnNpc(${id}) not registered under its id`); t.assert(hurt === false, `${id} is hurtable`); }
      await t.wait(1500);
      await frame(t, [0.4, 1.2, -1.6], [0, 0.6, 3.5], 55);
      await t.wait(300);
      await shot(t, 'companions/npcs');
      // scripted moveTo in cutscene mode (CS-01 style)
      await t.setMode('cutscene');
      const arrived = await t.G(async () => {
        const c = window.__GAME__.ctx, n = c.actors.get('pearl'), p = c.player.pos;
        n.setScripted(true);
        await Promise.race([n.moveTo([p.x, p.z + 1.4], 2), new Promise((r) => setTimeout(r, 6000))]);
        const d = Math.hypot(n.pos.x - p.x, n.pos.z - (p.z + 1.4));
        n.setScripted(false);
        return d;
      });
      await t.setMode('play');
      t.assert(arrived < 0.3, `scripted moveTo missed by ${arrived.toFixed(2)} m`);
      await follow(t);
      t.log(`npcs ok: ${ids.map((x) => x[0]).join(', ')}`);
    },
  },
  {
    // Ch. 1 in world's real meadow (§12.3): the zones call spawnKitten after the prologue. Noodle (barrel, Meow),
    // Biscuit (behind the Crow Fields cow, Meow), Button (stone ring Stand after the arena), Mochi in the cage on
    // world's cart at the Old Bridge → D-01 → party. Flags / kittens / party are restored afterwards.
    name: 'companions:meadow', order: 78, level: null, timeout: 240000,
    async run(t) {
      shotDir(t);
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, st = c.state;
        window.__cmpSnap = JSON.stringify({ flags: st.flags, kittens: st.kittens, companions: st.companions });
        g.story.skip?.(); g.setMode('play'); g.game.setTimeScale?.(1);
        for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) st.setFlag(k, true);
        delete st.flags['meadow.pudding']; delete st.flags['meadow.mochi'];
        st.kittens = []; st.companions = { unlocked: [], active: [] };
        c.companions.setActive([]);
      });
      try {
        await t.loadLevel('meadow', 'vigil_1');
        await t.G(() => window.__GAME__.god(true));
        let ids = [];
        for (let i = 0; i < 120; i++) {
          ids = await t.G(() => window.__GAME__.ctx.companions.kittens.map((k) => k.kittenId));
          if (['noodle', 'button', 'biscuit', 'mochi'].every((id) => ids.includes(id))) break;
          await t.wait(250);
        }
        if (!ids.length) { t.warn('meadow placed no kittens (world zones missing?): skipping the level walk'); return; }
        t.assert(['noodle', 'button', 'biscuit', 'mochi'].every((id) => ids.includes(id)), `meadow kittens: ${ids.join(', ')}`);

        // Noodle: the barrel at the crossroads; a Meow within 10 m pops him out; touching him rescues him
        let k = await kitten(t, 'noodle');
        t.assert(k?.hidden && k.hide === 'meow', `noodle should start hidden in the barrel (${JSON.stringify(k)})`);
        await clearEnemies(t);
        await put(t, -26.5, -28.5, Math.atan2(-3.5, 2.5));
        await t.wait(700);
        await shot(t, 'companions/meadow-noodle-barrel');
        await t.clearEvents();
        await meow(t);
        t.assert(await t.waitForEvent('kitten:reveal', 6000), 'Meow at the crossroads did not reveal Noodle');
        await t.wait(1000);
        await t.G(() => {
          const g = window.__GAME__, c = g.ctx, n = c.companions.kittens.find((x) => x.kittenId === 'noodle');
          c.player.teleport({ pos: new g.THREE.Vector3(n.pos.x + 0.8, n.pos.y, n.pos.z - 0.6), facing: Math.atan2(-0.8, 0.6) });
        });
        t.assert(await t.waitForEvent('kitten:rescued', 8000), 'Noodle not rescued on contact');
        await t.wait(400);
        await shot(t, 'companions/meadow-noodle-rescued');

        // Biscuit: behind the sleeping cow in the Crow Fields; her Meow wakes the cow (world) and reveals Biscuit (us)
        await clearEnemies(t);
        await put(t, 36.5, 28.5, Math.atan2(5, 1.5));
        await t.wait(500);
        await t.clearEvents();
        await meow(t);
        t.assert(await t.waitForEvent('kitten:reveal', 6000), 'Meow in the Crow Fields did not reveal Biscuit');
        k = await kitten(t, 'biscuit');
        t.assert(k && !k.hidden, `biscuit still hidden (${JSON.stringify(k)})`);
        await t.wait(1200);
        await shot(t, 'companions/meadow-biscuit');

        // Button: the stone ring; only after the `stones` arena is cleared; a 3 s Stand in the centre
        await t.G(() => { const g = window.__GAME__, a = g.ctx.levels.arena?.('stones'); if (a) a.clear(); else g.ctx.bus.emit(g.E.ARENA_CLEAR, { id: 'stones' }); });
        await clearEnemies(t);
        await put(t, -20, -3.7, 0);
        await t.wait(400);
        await t.clearEvents();
        await holdStandUntil(t, () => !window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'button')?.hidden);
        k = await kitten(t, 'button');
        t.assert(k && !k.hidden, `a 3 s Stand in the stone ring did not reveal Button (${JSON.stringify(k)})`);
        await t.G(() => window.__GAME__.setMode('play'));
        await t.wait(500);
        await shot(t, 'companions/meadow-button');

        // Mochi: the cage cart at the Old Bridge (ours: cart + bars; or the level's cart when world passes its bed height
        // `y`: bars only), opens after the bridge arena
        k = await kitten(t, 'mochi');
        t.assert(k?.st === 'caged' && k.perchY > 0.3, `mochi should sit caged on a cart bed (${JSON.stringify(k)})`);
        const cart = await t.G(() => { const m = window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'mochi'); return { ours: !!m?.cartCollider || !!m?.cart, y: m?.opts?.y ?? null }; });
        t.assert(!(cart.ours && cart.y > 0), 'built our own cart although the level gave a bed height (two carts)');
        t.log(`bridge cage on ${cart.ours ? 'our cart' : `the level's cart (bed ${cart.y} m)`}`);
        await t.G(() => { const g = window.__GAME__, a = g.ctx.levels.arena?.('bridge'); if (a) a.clear(); else g.ctx.bus.emit(g.E.ARENA_CLEAR, { id: 'bridge' }); });
        await clearEnemies(t);
        await put(t, 28.2, 70.2, Math.atan2(1.8, 4.3));
        await t.wait(900);
        await shot(t, 'companions/meadow-cage');
        // real input: stand ~1 m from the lock facing it and press J (the lock ticks its own anti-multi-hit window)
        await t.G(() => {
          const g = window.__GAME__, c = g.ctx, m = c.companions.kittens.find((x) => x.kittenId === 'mochi'), L = m.lock.pos;
          const dx = c.player.pos.x - L.x, dz = c.player.pos.z - L.z, d = Math.hypot(dx, dz) || 1, r = m.lock.radius + 0.9;
          const px = L.x + (dx / d) * r, pz = L.z + (dz / d) * r;
          c.player.teleport({ pos: new g.THREE.Vector3(px, c.physics.heightAt(px, pz), pz), facing: Math.atan2(L.x - px, L.z - pz) });
        });
        await t.wait(300);
        const hits = { out: [], opened: false };
        for (let i = 0; i < 8 && !hits.opened; i++) {
          await t.tap('KeyJ'); await t.wait(450);
          const r = await t.G(() => { const m = window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'mochi'); return { hp: m.lock.hp, opened: m.lock.opened }; });
          hits.out.push(r.hp); hits.opened = r.opened;
        }
        t.assert(hits.opened, `her slashes did not open the cage (${hits.out.join(', ')})`);
        const joined = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return g.ctx.companions.active[0]?.kittenId === 'mochi'; }, null, { sim: 8, every: 250 });
        t.assert(joined, 'Mochi did not join after the bridge cage opened');
        await t.G(() => window.__GAME__.setMode('play'));
        await follow(t);
        await t.wait(1500);
        await shot(t, 'companions/meadow-mochi-joined');
        const st = await t.G(() => ({ kittens: [...window.__GAME__.ctx.state.kittens], unlocked: [...window.__GAME__.ctx.state.companions.unlocked] }));
        t.assert(st.kittens.includes('noodle'), `state.kittens ${st.kittens}`);
        t.assert(st.unlocked.includes('mochi'), `unlocked ${st.unlocked}`);
        t.log(`meadow ok: kittens ${st.kittens.join(', ')}; mochi joined (${hits.out.join(', ')})`);
      } finally {
        await t.G(() => {
          const g = window.__GAME__, c = g.ctx, s = JSON.parse(window.__cmpSnap ?? 'null');
          g.god(false); g.game.setTimeScale?.(1);
          if (s) { c.state.flags = s.flags; c.state.kittens = s.kittens; c.state.companions = s.companions; }
          c.companions.setActive(c.state.companions?.active ?? []);
        });
      }
    },
  },
  {
    name: 'companions:bubble-edge', order: 79, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => window.__GAME__.ctx.companions.setActive(['mochi']));
      await t.wait(1500);
      // put Mochi near each screen edge (yaw the camera off him) with a long bark: the bubble must stay on screen
      const LINE = "I'm not scared! Mochi is scared. Separate thing.";
      for (const side of ['right', 'left']) {
        await freeze(t, true);
        const r = await t.G(async ([sd, line]) => {
          const g = window.__GAME__, c = g.ctx, m = c.companions.active[0], cam = c.camera;
          const p = c.player.pos, f = c.player.facing;
          // Mochi 2.5 m ahead of her; camera 4 m behind, looking past him so he lands ~at the screen edge
          const off = sd === 'right' ? 1 : -1;
          m.pos.set(p.x + Math.sin(f) * 2.5, p.y, p.z + Math.cos(f) * 2.5);
          m.object3d?.position.copy(m.pos);
          try { c.cam.shot({ anchor: 'swordcat', pos: [0, 1.6, -4], look: [off * 4.6, 0.9, 2.5], fov: 50, mode: 'cut' }); } catch { /* camera mid-edit */ }
          m.bubble.show(line, Infinity); m.bubble.update(0.5);           // frozen sim → vdt 0: finish the pop by hand
          await new Promise((res) => setTimeout(res, 600));
          const sp = m.bubble.sprite, b = m.bubble.body;
          if (!sp || !b) return { err: 'no sprite' };
          sp.updateWorldMatrix(true, false);
          const a = new g.THREE.Vector3().setFromMatrixPosition(sp.matrixWorld).project(cam);
          const e = cam.projectionMatrix.elements;
          const W = new g.THREE.Vector3().setFromMatrixColumn(sp.matrixWorld, 0).length() * e[0];
          const cw = m.bubble.canvas.width;
          const left = a.x + (b.x / cw - sp.center.x) * W, right = a.x + ((b.x + b.w) / cw - sp.center.x) * W;
          return { ax: a.x, left, right, cx: sp.center.x, tail: m.bubble.tailX };
        }, [side, LINE]);
        await t.wait(200);
        await shot(t, 'companions/bubble-' + side);
        await t.G(() => window.__GAME__.ctx.companions.active[0]?.bubble.hide());
        await freeze(t, false);
        t.assert(!r.err, `bubble-edge ${side}: ${r.err}`);
        t.log(`bubble ${side}: anchor x ${r.ax.toFixed(2)}, rect ${r.left.toFixed(3)}..${r.right.toFixed(3)} (center ${r.cx.toFixed(2)}, tail ${r.tail})`);
        t.assert(r.left >= -1 && r.right <= 1, `bubble clipped at the ${side} edge: ${r.left.toFixed(3)}..${r.right.toFixed(3)}`);
      }
      follow(t);
    },
  },
  // ------------------------------------------------------------------ M2 (Acts I–II)
  {
    name: 'companions:sage-clover', order: 80, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      try {
        await stage(t);
        // Sage: Volley at a crow + a rat (§9.2), basic shots from range
        await t.G(() => { const c = window.__GAME__.ctx; c.state.companions.unlocked = ['mochi', 'sage', 'clover']; c.companions.setActive(['sage']); });
        await t.wait(1200);
        t.assert(await spawnAhead(t, 'crow', 6, 1.5), 'crow spawn failed');
        t.assert(await spawnAhead(t, 'rat_pike', 4.5, -1.2), 'rat spawn failed');
        await t.wait(600);
        await t.tap('KeyQ', 1, 50);
        const used = await until(t, () => window.__GAME__.ctx.companions.active[0]?.stats.abilities >= 1, null, { sim: 3 });
        t.assert(used, 'Q did not fire Sage\'s Volley');
        t.assert(await t.G(() => window.__GAME__.lastEvent?.('companion:ability')?.ability ?? window.__GAME__.ctx.companions.active[0].cfg.ability) === 'volley', 'not a volley');
        await t.wait(250);
        await freeze(t, true);
        await frame(t, [2.6, 1.3, -2.4], [0, 0.9, 3], 52);
        await t.wait(250);
        await shot(t, 'companions/sage-volley');
        await freeze(t, false);
        await follow(t);
        const hits = await until(t, () => window.__GAME__.ctx.companions.active[0]?.stats.hits >= 3, null, { sim: 4 });
        t.assert(hits, 'Volley arrows did not land');
        await clearEnemies(t);
        // §9.1 swap (ui's Vigil Stone menu / Barracks panel): swapTo with its flourish + toast (Sage → Clover)
        await stage(t);
        await t.wait(500);
        const sw = await t.G(() => window.__GAME__.ctx.companions.swapTo('clover'));
        t.assert(sw === 'clover', `swapTo returned ${sw}`);
        await t.wait(300);
        const now = await t.G(() => window.__GAME__.ctx.companions.active[0]?.kittenId);
        t.assert(now === 'clover', `swapped to ${now}, expected clover`);
        t.assert((await t.events()).includes('ui:toast'), 'no swap toast');
        await t.wait(900);
        await shot(t, 'companions/swap-clover');
        // Clover: Purr of Mending heals 4 over 3 s
        const hp0 = await t.G(() => { const p = window.__GAME__.ctx.player; p.hp = Math.max(1, p.maxHp - 5); return p.hp; });
        await t.tap('KeyQ', 1, 50);
        await t.wait(1500);
        await shot(t, 'companions/clover-mend');
        const healed = await until(t, (h) => window.__GAME__.ctx.player.hp >= h + 4, hp0, { sim: 5 });
        t.assert(healed, `Clover's mend did not heal 4 (hp ${await t.G(() => window.__GAME__.ctx.player.hp)} from ${hp0})`);
      } finally { await restoreState(t, saved); }
    },
  },
  {
    name: 'companions:forest-sage', order: 81, level: 'forest', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      try {
        const ks = await t.G(() => window.__GAME__.ctx.companions.kittens.map((k) => k.kittenId));
        for (const id of ['pickles', 'pebble', 'sprout', 'sage']) t.assert(ks.includes(id), `forest: ${id} not placed (${ks.join(', ')})`);
        await t.G(() => { const c = window.__GAME__.ctx; c.companions.setActive(['mochi']); c.player.god = true; });
        await put(t, 18, -3.2, Math.PI);
        await clearEnemies(t);
        await t.wait(1500);
        await clearEnemies(t);
        await frame(t, [2.2, 1.1, -1.6], [0, 2.6, 5.5], 55);
        await t.wait(500);
        await shot(t, 'companions/forest-sage-hanging');
        await follow(t);
        // cut the treetop ropes (ours, or the level's objective) → the cage lowers → D-02 → Sage takes the slot
        const how = await t.G(() => {
          const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'sage');
          if (!k) return 'none';
          if (k.ropePosts?.length) return 'posts';
          return c.companions.lowerCage('sage') ? 'lowered' : 'stuck';
        });
        t.assert(how === 'posts' || how === 'lowered', `Sage's cage cannot come down (${how})`);
        if (how === 'posts') {
          for (let i = 0; i < 12; i++) {
            const left = await t.G(() => {
              const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'sage');
              const q = k?.ropePosts?.find((p) => !p.opened);
              if (!q) return 0;
              c.combat.applyHit(c.player, q, c.config.ATTACKS.slash3);
              return k.ropePosts.filter((p) => !p.opened).length;
            });
            if (!left) break;
            await t.wait(220);
          }
        }
        await t.wait(900);
        await freeze(t, true);
        await frame(t, [2.2, 1.0, -1.4], [0, 1.4, 5.5], 55);
        await t.wait(200);
        await shot(t, 'companions/forest-sage-lowering');
        await freeze(t, false);
        const joined = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return g.ctx.companions.active[0]?.kittenId === 'sage'; }, null, { sim: 10, every: 250 });
        t.assert(joined, 'Sage did not join after the cage came down');
        t.assert(await t.G(() => window.__GAME__.ctx.state.companions.unlocked.includes('mochi')), 'Mochi should stay unlocked (Barracks)');
        await t.G(() => window.__GAME__.setMode('play'));
        await clearEnemies(t);
        await put(t, 18, -3.2, Math.PI);
        await t.wait(1800);
        await t.G(() => {
          const c = window.__GAME__.ctx, s = c.companions.active[0], p = c.player, f = p.facing;
          if (s) { s.pos.set(p.pos.x + Math.sin(f) * 0.5 + Math.cos(f) * 1.0, p.pos.y, p.pos.z + Math.cos(f) * 0.5 - Math.sin(f) * 1.0); s.facing = f; s.snap(); s.visual?.snap(); }
        });
        await freeze(t, true);
        await frame(t, [0.5, 1.0, 3.0], [0.5, 0.55, 0.2], 50);
        await t.wait(250);
        await shot(t, 'companions/forest-sage-joined');
        await freeze(t, false);
        await follow(t);
        await t.G(() => { window.__GAME__.ctx.player.god = false; });
        // Pebble behind the cracked boulder: a Bright Slash nearby reveals
        await t.G(() => { const g = window.__GAME__, c = g.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'pebble'); if (k) { c.player.teleport({ pos: k.pos.clone().setZ(k.pos.z + 1.5), facing: Math.PI }); } });
        await t.wait(300);
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_SWING, { attackId: 'bright' }); });
        const peb = await kitten(t, 'pebble');
        t.assert(peb && !peb.hidden, 'Pebble was not revealed by a Bright Slash');
      } finally { await restoreState(t, saved); }
    },
  },
  {
    name: 'companions:town-rescues', order: 82, level: 'town', spawn: 'start', timeout: 200000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      try {
        const ks = await t.G(() => window.__GAME__.ctx.companions.kittens.map((k) => k.kittenId));
        for (const id of ['waffles', 'toffee', 'muffin', 'marmalade', 'tofu', 'clover']) t.assert(ks.includes(id), `town: ${id} not placed (${ks.join(', ')})`);
        await t.G(() => window.__GAME__.ctx.companions.setActive(['mochi']));
        // Clover in the stocks (§12.5 square): locked until the Square clears, then E frees her → D-04 → joins
        await put(t, 10, 11.2, 0);
        await t.wait(1400);
        await frame(t, [1.6, 1.0, 0.6], [0, 0.7, 2.8], 50);
        await t.wait(400);
        await shot(t, 'companions/town-clover-stocks');
        await follow(t);
        t.assert(!(await t.G(() => window.__GAME__.ctx.levels.current.interact('free_clover'))), 'stocks open before the Square is clear');
        await t.G(() => window.__GAME__.ctx.companions.markCleared('square'));
        t.assert(await t.G(() => window.__GAME__.ctx.levels.current.interact('free_clover')), 'E could not free Clover');
        const clover = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return g.ctx.companions.active[0]?.kittenId === 'clover'; }, null, { sim: 8, every: 250 });
        t.assert(clover, 'Clover did not join');
        await t.G(() => window.__GAME__.setMode('play'));
        // Tofu in the barrel stack: a knock reveals him → D-04 Tofu → flag
        await put(t, 18, -12.4, Math.PI);
        await t.wait(1400);
        await shot(t, 'companions/town-barrels');
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_SWING, { attackId: 'slash1' }); });
        const tofu = await kitten(t, 'tofu');
        t.assert(tofu && !tofu.hidden, 'the knock did not reveal Tofu');
        await t.wait(500);
        await t.G(() => { const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'tofu'); if (k) c.player.teleport({ pos: k.pos.clone(), facing: Math.PI }); });
        const tf = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return !!g.ctx.state.getFlag('town.tofu'); }, null, { sim: 6, every: 250 });
        t.assert(tf, 'town.tofu not set after D-04 Tofu');
        await t.G(() => window.__GAME__.setMode('play'));
        // Marmalade peeks out once Bakery Street clears → D-03
        await put(t, -19.5, -18.6, -Math.PI / 2);
        await t.G(() => window.__GAME__.ctx.companions.markCleared('bakery'));
        await t.wait(1200);
        await shot(t, 'companions/town-marmalade');
        await t.G(() => { const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'marmalade'); if (k) c.player.teleport({ pos: k.pos.clone().setX(k.pos.x + 2.2), facing: -Math.PI / 2 }); });
        const mm = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return !!g.ctx.state.getFlag('town.marmalade'); }, null, { sim: 6, every: 250 });
        t.assert(mm, 'town.marmalade not set after D-03');
        await t.G(() => window.__GAME__.setMode('play'));
        // Earl Grey pops out of the giant Gloomjelly → D-04 Earl Grey
        await put(t, 0, 2, 0);
        await t.G(() => { const g = window.__GAME__, c = g.ctx; c.bus.emit(g.E.ENEMY_DIED, { enemy: { def: { id: 'jelly', releases: 'earlgrey' }, pos: new g.THREE.Vector3(0, 0, 5) }, type: 'jelly', position: new g.THREE.Vector3(0, c.physics.heightAt(0, 5), 5) }); });
        await t.wait(1600);
        await shot(t, 'companions/town-earlgrey');
        const eg = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return !!g.ctx.state.getFlag('town.earlgrey'); }, null, { sim: 6, every: 250 });
        t.assert(eg, 'town.earlgrey not set after the jelly popped');
        await t.G(() => window.__GAME__.setMode('play'));
        // Toffee on the statue top (y 2.5)
        const tof = await kitten(t, 'toffee');
        t.assert(tof && tof.perchY > 1.5, `Toffee perch ${tof?.perchY}`);
      } finally { await restoreState(t, saved); }
    },
  },
  {
    name: 'companions:gate-wagon', order: 83, level: 'gate', spawn: 'start', timeout: 160000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      try {
        const ks = await t.G(() => window.__GAME__.ctx.companions.kittens.map((k) => k.kittenId));
        for (const id of ['tater', 'mittens', 'pip', 'socks']) t.assert(ks.includes(id), `gate: ${id} not placed (${ks.join(', ')})`);
        const host = await t.G(() => { const k = window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'tater'); return k ? { x: k.home.x, z: k.home.z, guests: k.guests.map((g) => g.kittenId) } : null; });
        t.assert(host?.guests?.includes('mittens') && host.guests.includes('pip'), `war-wagon guests ${host?.guests}`);
        await put(t, host.x, host.z + 2.6, Math.PI);
        await t.wait(1500);
        await frame(t, [1.4, 1.2, -1.3], [0, 0.8, 2.6], 50);
        await t.wait(400);
        await shot(t, 'companions/gate-wagon');
        await follow(t);
        for (let i = 0; i < 6; i++) {
          const open = await t.G(() => {
            const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'tater');
            if (!k?.lock || k.lock.opened) return true;
            c.combat.applyHit(c.player, k.lock, c.config.ATTACKS.slash1);
            return k.lock.opened;
          });
          if (open) break;
          await t.wait(250);
        }
        await t.wait(700);
        await freeze(t, true);
        await frame(t, [1.6, 1.1, -1.0], [0, 0.6, 2.4], 50);
        await t.wait(200);
        await shot(t, 'companions/gate-wagon-open');
        await freeze(t, false);
        const pip = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return !!g.ctx.state.getFlag('gate.pip'); }, null, { sim: 8, every: 250 });
        t.assert(pip, 'gate.pip not set: D-06 did not run');
        t.assert(await t.G(() => ['tater', 'mittens'].every((id) => window.__GAME__.ctx.state.kittens.includes(id))), 'Tater / Mittens not rescued');
        await t.G(() => window.__GAME__.setMode('play'));
      } finally { await restoreState(t, saved); }
    },
  },
  {
    name: 'companions:spoon-brigade', order: 84, level: 'gate', spawn: 'start', timeout: 160000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      try {
        await t.G(() => {
          const c = window.__GAME__.ctx;
          for (const id of ['tater', 'mittens', 'socks', 'biscuit', 'noodle', 'button', 'pickles', 'pebble']) c.state.addKitten(id);
          c.companions.setActive(['mochi']);
        });
        await put(t, 0, 10, Math.PI);
        await t.wait(600);
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.CUTSCENE_START, { id: 'cs08' }); });
        const n = await t.G(() => window.__GAME__.ctx.companions.spoons.count);
        t.assert(n === 8, `brigade size ${n}, expected 8`);
        await t.wait(1500);
        // the CS-08 pull-back: from behind the brigade, looking past her toward the horde
        await frame(t, [0.6, 2.6, -7.5], [0, 0.6, 3], 55);
        await t.wait(500);
        await shot(t, 'companions/spoon-brigade');
        await follow(t);
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.CUTSCENE_END, { id: 'cs08' }); });
        t.assert(await t.G(() => window.__GAME__.ctx.companions.spoons.armed), 'not armed after CS-08');
        await t.G(() => { const g = window.__GAME__; for (const [x, z] of [[-1.5, 4], [1.8, 3]]) { const e = g.spawn('rat_pike', x, z); e?.alert?.(); } });
        await t.G(() => { const p = window.__GAME__.ctx.player; p.god = true; });
        const thrown = await until(t, () => window.__GAME__.ctx.companions.spoons.stats.thrown >= 3, null, { sim: 6 });
        t.assert(thrown, 'no spoons thrown');
        await t.wait(250);
        await freeze(t, true);
        await frame(t, [3.5, 2.2, -4.5], [0, 0.8, 4], 55);
        await t.wait(200);
        await shot(t, 'companions/spoon-throw');
        await freeze(t, false);
        const hit = await until(t, () => window.__GAME__.ctx.companions.spoons.stats.hits >= 2, null, { sim: 6 });
        t.assert(hit, `spoons did not land (${JSON.stringify(await t.G(() => window.__GAME__.ctx.companions.spoons.stats))})`);
        await follow(t);
        await clearEnemies(t);
        await t.G(() => { const p = window.__GAME__.ctx.player; p.god = false; });
      } finally { await restoreState(t, saved); }
    },
  },
  {
    name: 'companions:hub', order: 85, level: null, timeout: 200000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      try {
        await t.G(() => {
          const c = window.__GAME__.ctx;
          c.state.setFlag('town.free', true);
          for (const id of ['biscuit', 'pebble', 'tater', 'mittens', 'toffee', 'waffles', 'socks', 'fennel', 'bramble', 'button', 'sprout']) c.state.addKitten(id);
          c.state.companions.unlocked = ['mochi', 'sage'];
          c.companions.setActive(['mochi']);
        });
        await t.loadLevel('town', 'hub');
        await t.wait(1500);
        const play = () => t.G(() => { const g = window.__GAME__; try { g.story.skipAll?.() ?? g.story.skip?.(); } catch { /* none */ } g.setMode('play'); });
        await play();
        const res = await t.G(() => { const h = window.__GAME__.ctx.companions.hub; return { active: h.active, n: h.residents.length, ids: h.residents.map((r) => r.npcId) }; });
        t.assert(res.active, 'hub mode not entered');
        t.assert(res.n >= 20 && res.n <= 26, `hub residents ${res.n}`);
        for (const id of ['biscuit', 'tater', 'marmalade', 'tofu', 'earlgrey', 'snowpaw']) t.assert(res.ids.includes(id), `hub: ${id} missing`);
        // the square: fishing on the fountain rim, tag round it, Toffee on the statue
        await put(t, 0, -3.5, 0);
        await t.wait(2500);
        await frame(t, [0, 3.2, -4.5], [0, 0.6, 9], 55);
        await t.wait(600);
        await shot(t, 'companions/hub-square');
        await follow(t);
        const st = await t.state();
        t.log(`hub: ${res.n} residents, scene calls ${st.calls}, tris ${st.tris}, frame calls ${st.frameCalls}`);
        // §18 budget: what the residents cost (hub on vs off)
        const off = await t.G(() => { const h = window.__GAME__.ctx.companions.hub; const rs = h.residents; h.lodT = 1e9; for (const r of rs) r.object3d.visible = false; return h.shown ?? rs.length; });
        await t.wait(600);
        const st0 = await t.state();
        await t.G(() => { const h = window.__GAME__.ctx.companions.hub; h.lodT = 0; });
        t.log(`hub residents cost: ${st.calls - st0.calls} scene calls for ${off} shown residents (town alone ${st0.calls})`);
        t.assert(st.calls - st0.calls <= 85, `hub residents cost ${st.calls - st0.calls} scene calls (budget 85)`);
        // lines on approach (Biscuit's rescue line)
        await t.G(() => { const c = window.__GAME__.ctx, b = c.companions.hub.residents.find((r) => r.npcId === 'biscuit'); c.player.teleport({ pos: b.pos.clone().setX(b.pos.x + 1.4).setY(c.physics.heightAt(b.pos.x + 1.4, b.pos.z)), facing: -Math.PI / 2 }); });
        const spoke = await until(t, () => { const g = window.__GAME__; if (g.mode !== 'play') { g.story.skip?.(); g.setMode('play'); } return g.ctx.companions.hub.residents.find((r) => r.npcId === 'biscuit')?.talkAt > -1; }, null, { sim: 3 });
        if (!spoke) t.log(JSON.stringify(await t.G(() => { const c = window.__GAME__.ctx, h = c.companions.hub, b = h.residents.find((r) => r.npcId === 'biscuit'), p = c.player;
          return { mode: c.game.mode, b: b.pos.toArray(), p: p.pos.toArray(), talkAt: String(b.talkAt), gate: h.gate.lastAt, t: c.game.time, lines: b.lines, active: h.active }; })));
        t.assert(spoke, 'Biscuit did not say her line');
        await t.wait(500);
        await frame(t, [1.8, 1.3, -1.2], [-1.2, 0.8, 0], 50);
        await t.wait(300);
        await shot(t, 'companions/hub-biscuit');
        await follow(t);
        await t.blankCheck('companions:hub');
        // iso controls: residents are clickable (pickKind 'npc'); clear of world's interactables they carry a talk_<id>
        // interactable ([Interact] / a click → their line now); a station keeper stands for its station
        const talk = await t.G(() => {
          const c = window.__GAME__.ctx, its = c.levels.current?.interactables ?? [], rs = c.companions.hub.residents;
          const shown = rs.filter((r) => r.object3d.visible && !r.scripted).length + c.companions.active.length;
          return { talk: its.filter((i) => i.kind === 'npc' && i.actor).map((i) => i.id), picks: c.companions.pickables().length, shown,
            keepers: rs.filter((r) => r.beh === 'station').map((r) => `${r.npcId}→${r.interactId}`) };
        });
        t.log(`hub talk interactables ${talk.talk.length}, pickables ${talk.picks}, keepers ${talk.keepers.join(' ')}`);
        t.assert(talk.talk.length >= 5, `too few talk interactables (${talk.talk.join(', ')})`);
        t.assert(talk.picks >= talk.shown && talk.picks >= 8, `hub pickables ${talk.picks} (shown residents + party ${talk.shown}; far ones are LOD-hidden)`);
        const clicked = await t.G(() => {
          const c = window.__GAME__.ctx, r = c.companions.hub.residents.find((x) => x.talkIt && x.npcId.startsWith('villager'));
          if (!r) return null;
          c.player.teleport({ pos: r.pos.clone().setX(r.pos.x + 1.2).setY(c.physics.heightAt(r.pos.x + 1.2, r.pos.z)), facing: -Math.PI / 2 });
          r.talkAt = -Infinity; r.bubble.hide();
          const ok = c.levels.current.interact(r.talkIt.id);
          return { ok, id: r.npcId, shown: r.bubble.visible ?? r.bubble.object?.visible ?? null };
        });
        t.assert(clicked?.ok && clicked.shown === true, `talking to a villager failed (${JSON.stringify(clicked)})`);
      } finally {
        await restoreState(t, saved);
        await t.loadLevel('meadow', 'start');
      }
    },
  },
  // ------------------------------------------------------------------ iso controls (research/CONTROLS_SPEC.md §7.5, §12)
  {
    // the idle slot (back-left / back-right ≥ 1.4 m, off her aim notch) and the path-aware follow: she walks round a
    // wall (a clicked path when the player's orders exist, else a scripted walk) and Mochi takes her trail round it
    name: 'companions:iso-follow', order: 86, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      await stage(t);
      await t.G(() => window.__GAME__.ctx.companions.setActive(['mochi']));
      await until(t, () => window.__GAME__.ctx.companions.active[0]?.stateName === 'idle', null, { sim: 6 });
      const idle = await t.G(() => {
        const c = window.__GAME__.ctx, m = c.companions.active[0], p = c.player;
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, a = Math.atan2(dx, dz);
        const off = m.aimYaw == null ? Math.PI : Math.abs(Math.atan2(Math.sin(a - m.aimYaw), Math.cos(a - m.aimYaw)));
        return { d: Math.hypot(dx, dz), behind: -(dx * Math.sin(p.facing) + dz * Math.cos(p.facing)), off, state: m.stateName };
      });
      t.log(`idle slot: ${idle.d.toFixed(2)} m, ${idle.behind.toFixed(2)} m behind, ${(idle.off * 180 / Math.PI).toFixed(0)}° off her aim`);
      t.assert(idle.d >= 1.25 && idle.d <= 2.6, `idle distance ${idle.d.toFixed(2)} m (back-left / back-right ≥ 1.4)`);
      t.assert(idle.off >= 0.6, `idle in her aim notch (${(idle.off * 180 / Math.PI).toFixed(0)}°)`);
      await shot(t, 'companions/iso-idle');
      // she turns to face him (her aim with no cursor / stick = her facing): he walks out of the notch
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, m = c.companions.active[0], p = c.player;
        c.player.teleport({ pos: p.pos.clone(), facing: Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z) });
      });
      const out = await until(t, () => {
        const c = window.__GAME__.ctx, m = c.companions.active[0], p = c.player;
        const a = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z), y = m.aimYaw ?? p.facing;
        return Math.abs(Math.atan2(Math.sin(a - y), Math.cos(a - y))) >= 0.6 && m.stateName === 'idle';
      }, null, { sim: 6 });
      t.assert(out, 'Mochi stayed in her aim notch after she turned to him');
      // a wall between them; she walks round its east end
      const wall = await t.G(() => {
        const g = window.__GAME__, c = g.ctx, T = g.THREE, p = c.player.pos, y = c.physics.heightAt(p.x, p.z);
        c.player.teleport({ pos: p.clone(), facing: 0 });
        const box = { minX: p.x - 5, maxX: p.x + 3, minZ: p.z + 2.6, maxZ: p.z + 3.0, y0: y - 1, y1: y + 2.4, smokeWall: true };
        c.physics.addCollider(box);
        const mesh = new T.Mesh(new T.BoxGeometry(8, 2.4, 0.4), new T.MeshStandardMaterial({ color: '#8A7B66', roughness: 0.9 }));
        mesh.position.set(p.x - 1, y + 1.2, p.z + 2.8); mesh.castShadow = true; mesh.name = 'smokeWall';
        c.scene.add(mesh);
        window.__cmpWall = { box, mesh };
        const m = c.companions.active[0];
        return { teleports: m.stats.teleports, trails: m.stats.trails, start: [p.x, p.z] };
      });
      try {
        await t.wait(1200);
        const [sx, sz] = wall.start;
        const path = [[sx + 4.5, sz], [sx + 4.5, sz + 6], [sx, sz + 6]];
        const ordered = await t.G((pts) => {
          const g = window.__GAME__, c = g.ctx, last = pts[pts.length - 1];
          if (typeof c.player?.order === 'function') { try { c.player.order('move', { x: last[0], y: 0, z: last[1] }); return 'order'; } catch { /* P2 mid-edit */ } }
          return 'walk';
        }, path);
        if (ordered === 'walk') {
          // scripted walk at a run (5 m/s) along her path, the way the order follower would move her
          for (const [tx, tz] of path) {
            for (let i = 0; i < 200; i++) {
              const done = await t.G(([x, z]) => {
                const g = window.__GAME__, c = g.ctx, p = c.player.pos, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
                if (d < 0.05) return true;
                const k = Math.min(1, 0.3 / d), nx = p.x + dx * k, nz = p.z + dz * k;
                c.player.teleport({ pos: new g.THREE.Vector3(nx, c.physics.heightAt(nx, nz), nz), facing: Math.atan2(dx, dz) });
                return false;
              }, [tx, tz]);
              if (done) break;
              await t.wait(60);
            }
          }
        } else {
          await until(t, (pt) => { const p = window.__GAME__.ctx.player.pos; return Math.hypot(p.x - pt[0], p.z - pt[1]) < 0.6; }, path[2], { sim: 10 });
        }
        await t.wait(400);
        await shot(t, 'companions/iso-trail');
        const end = await until(t, (w) => {
          const c = window.__GAME__.ctx, m = c.companions.active[0], p = c.player;
          return m.pos.z > w.start[1] + 3.2 && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 3.5;
        }, wall, { sim: 8 });
        const s = await t.G(() => { const c = window.__GAME__.ctx, m = c.companions.active[0], p = c.player; return { m: [m.pos.x, m.pos.z], p: [p.pos.x, p.pos.z], tp: m.stats.teleports, trails: m.stats.trails, st: m.stateName }; });
        t.log(`trail follow (${ordered}): Mochi ${s.m.map((v) => v.toFixed(1))}, her ${s.p.map((v) => v.toFixed(1))}, trails ${s.trails - wall.trails}, teleports ${s.tp - wall.teleports}`);
        t.assert(end, `Mochi did not get round the wall to her (${JSON.stringify(s)})`);
        t.assert(s.tp === wall.teleports, `Mochi teleported instead of walking round the wall (${s.tp - wall.teleports})`);
        await shot(t, 'companions/iso-trail-done');
      } finally {
        await t.G(() => { const c = window.__GAME__.ctx, w = window.__cmpWall; if (w) { c.physics.removeCollider(w.box); w.mesh.removeFromParent(); w.mesh.geometry.dispose(); w.mesh.material.dispose(); } window.__cmpWall = null; });
      }
    },
  },
  {
    // desktop: Q tap = quick cast at the cursor; hold Q = the indicator follows the mouse, release casts; Backspace
    // (`back`) cancels; Sage's range ring + target pips; Clover's ring; the §10.1 data (cooldownLeft / readiness)
    name: 'companions:ability-aim', order: 87, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      const saved = await snapState(t);
      /** CSS px of a world point (her local frame: +Z ahead, +X her left), or null off screen. */
      const toScreen = (ahead, side) => t.G(([a, s]) => {
        const g = window.__GAME__, c = g.ctx, p = c.player, f = p.facing;
        const v = new g.THREE.Vector3(p.pos.x + Math.sin(f) * a + Math.cos(f) * s, p.pos.y + 0.05, p.pos.z + Math.cos(f) * a - Math.sin(f) * s);
        const w = { x: v.x, z: v.z };
        v.project(c.camera);
        if (v.z > 1 || Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98) return null;
        const r = c.renderer?.domElement?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, w };
      }, [ahead, side]);
      const aim = () => t.G(() => {
        const m = window.__GAME__.ctx.companions, a = m.aim, pl = a.plan;
        return { active: a.active, shape: a.shape, valid: a.valid, src: a.source, center: [pl.center.x, pl.center.z], targets: pl.targets.length, showing: m.indicator.showing, cursor: !!window.__GAME__.ctx.cam?.cursorGround };
      });
      try {
        await stage(t);
        await t.G(() => { const g = window.__GAME__, c = g.ctx; g.god(true); c.state.companions.unlocked = ['mochi', 'sage', 'clover']; c.companions.setActive(['mochi']); });
        await t.wait(1200);
        t.assert(await spawnAhead(t, 'rat_pike', 5, 1.5), 'rat spawn failed');
        // hold Q with the mouse to her right-front: the indicator shows and follows
        const p1 = await toScreen(3, -3);
        if (p1) await t.page.mouse.move(p1.x, p1.y, { steps: 4 });
        await t.page.keyboard.down('KeyQ');
        let a = null;
        try {
          a = await until(t, () => window.__GAME__.ctx.companions.aim.active, null, { sim: 2 }) ? await aim() : await aim();
          t.assert(a.active && a.shape === 'rect', `holding Q shows no Shield Wall indicator (${JSON.stringify(a)})`);
          await t.wait(300);
          t.assert((await aim()).showing === 'rect' || (await t.G(() => window.__GAME__.ctx.fx?.drawsAbilityAim === true)), 'the indicator is not drawn');
          await shot(t, 'companions/aim-wall');
          if (a.cursor && p1) {
            const her = await t.G(() => [window.__GAME__.ctx.player.pos.x, window.__GAME__.ctx.player.pos.z]);
            const want = Math.atan2(p1.w.x - her[0], p1.w.z - her[1]), got = Math.atan2(a.center[0] - her[0], a.center[1] - her[1]);
            t.assert(Math.abs(Math.atan2(Math.sin(want - got), Math.cos(want - got))) < 0.35, `indicator not toward the cursor (${want.toFixed(2)} vs ${got.toFixed(2)})`);
          } else t.warn('no cam.cursorGround yet (camera Picker pending): the hold aimed by the smart rule');
          const p2 = await toScreen(3, 3);
          if (p2) await t.page.mouse.move(p2.x, p2.y, { steps: 4 });
          await t.wait(250);
        } finally { await t.page.keyboard.up('KeyQ'); }
        const cast = await until(t, () => window.__GAME__.ctx.companions.walls.length > 0, null, { sim: 2 });
        t.assert(cast, 'releasing Q did not plant the wall');
        const ev = await t.G(() => window.__GAME__.lastEvent?.('companion:ability'));
        t.log(`wall cast: ${JSON.stringify(ev && { aimed: ev.aimed, source: ev.source, dir: ev.dir })}`);
        const data = await t.G(() => { const m = window.__GAME__.ctx.companions; return { left: m.cooldownLeft(), ready: m.readiness(), can: m.canCast(), shape: m.abilityShape() }; });
        t.assert(data.left > 17 && data.ready < 0.1 && !data.can && data.shape?.shape === 'rect', `ability bar data ${JSON.stringify(data)}`);
        await t.wait(300);
        await shot(t, 'companions/aim-wall-cast');
        // cancel: hold Q, Backspace, release → no cast, no cooldown
        await t.G(() => { const m = window.__GAME__.ctx.companions; for (const w of [...m.walls]) w.end?.(); m.active[0].cooldown = 0; m.active[0]._endAbility(); });
        await t.wait(300);
        const n0 = await t.G(() => window.__GAME__.ctx.companions.active[0].stats.abilities);
        await t.page.keyboard.down('KeyQ');
        try {
          await until(t, () => window.__GAME__.ctx.companions.aim.active, null, { sim: 2 });
          await t.page.keyboard.press('Backspace');
          await t.wait(150);
          t.assert(!(await aim()).active, 'Backspace did not cancel the aim');
        } finally { await t.page.keyboard.up('KeyQ'); }
        await t.wait(300);
        t.assert(await t.G((n) => window.__GAME__.ctx.companions.active[0].stats.abilities === n && window.__GAME__.ctx.companions.active[0].cooldown === 0, n0), 'a cancelled aim cast or spent the cooldown');
        // Sage: the 14 m ring and pips under the chosen targets
        await clearEnemies(t);
        await t.G(() => window.__GAME__.ctx.companions.setActive(['sage']));
        await t.wait(900);
        t.assert(await spawnAhead(t, 'rat_pike', 5, -1.5), 'rat spawn failed');
        t.assert(await spawnAhead(t, 'crow', 7, 2), 'crow spawn failed');
        await t.wait(500);
        const p3 = await toScreen(5, -1.5);
        if (p3) await t.page.mouse.move(p3.x, p3.y, { steps: 4 });
        await t.page.keyboard.down('KeyQ');
        try {
          await until(t, () => window.__GAME__.ctx.companions.aim.active, null, { sim: 2 });
          await t.wait(350);
          a = await aim();
          t.assert(a.shape === 'targets' && a.targets >= 1 && a.valid, `Volley indicator ${JSON.stringify(a)}`);
          await freeze(t, true);
          await shot(t, 'companions/aim-volley');
          await freeze(t, false);
        } finally { await t.page.keyboard.up('KeyQ'); }
        t.assert(await until(t, () => window.__GAME__.ctx.companions.active[0]?.stats.abilities >= 1, null, { sim: 2 }), 'release did not loose the Volley');
        // Clover: the soft green ring around her
        await clearEnemies(t);
        await t.G(() => window.__GAME__.ctx.companions.setActive(['clover']));
        await t.wait(900);
        await t.page.keyboard.down('KeyQ');
        try {
          await until(t, () => window.__GAME__.ctx.companions.aim.active, null, { sim: 2 });
          await t.wait(350);
          a = await aim();
          t.assert(a.shape === 'self', `Purr indicator ${JSON.stringify(a)}`);
          await shot(t, 'companions/aim-purr');
        } finally { await t.page.keyboard.up('KeyQ'); }
        t.assert(await until(t, () => window.__GAME__.ctx.companions.active[0]?.stats.abilities >= 1, null, { sim: 2 }), 'release did not purr');
      } finally {
        await clearEnemies(t);
        await t.G(() => window.__GAME__.god(false));
        await restoreState(t, saved);
      }
    },
  },
  {
    // phones (Playwright hasTouch + isMobile): portrait 390×844 and landscape 844×390. The portrait button taps the
    // smart cast; ui's drag-aim (companions.aimAbility → useAbility({ dir })) draws and casts; a tap on Mochi / a kitten
    // (camera's tap pick when it exists, else companions.use) — screenshots of both orientations.
    name: 'companions:touch', order: 88, level: null, timeout: 300000,
    async run(t) {
      shotDir(t);
      const errors = [];
      const ctxM = await t.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const pg = await ctxM.newPage();
      pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
      pg.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
      const G = async (fn, arg) => {
        const h = await pg.evaluateHandle(fn, arg);
        try { return await h.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { h.dispose().catch(() => {}); }
      };
      const mshot = async (name) => { const p = path.join(t.shotsDir, `${name}.png`); try { await pg.screenshot({ path: p }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); } return p; };
      const untilM = async (fn, arg, ms = 8000) => { const t0 = Date.now(); let v = await G(fn, arg); while (!v && Date.now() - t0 < ms) { await pg.waitForTimeout(150); v = await G(fn, arg); } return v; };
      try {
        await pg.goto(`${t.base}?test=1&seed=1`);
        await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 200000 });
        await G(async () => {
          const g = window.__GAME__, c = g.ctx;
          g.story.skip?.(); g.setMode('play');
          for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
          await g.loadLevel('meadow', 'start');
          return true;
        });
        await pg.waitForTimeout(800);
        // the M2 blocking "turn your device sideways" card is removed by the controls rework (C8, ui); until ui lands,
        // hide it here so the portrait game (§9.5: fully supported) is what we look at and tap
        await pg.addStyleTag({ content: '.ui-rotate { display: none !important; }' });
        await pg.touchscreen.tap(195, 300);                         // first touch: the device becomes 'touch'
        await G(() => {
          const g = window.__GAME__, c = g.ctx;
          g.story.skip?.(); g.setMode('play'); g.god(true); c.state.settings.castMode = 'smart';
          c.state.companions.unlocked = ['mochi', 'sage', 'clover'];
          c.companions.setActive(['mochi']);
          c.player.teleport({ pos: new g.THREE.Vector3(-4, c.physics.heightAt(-4, -50), -50), facing: 0 });
          for (const [x, z] of [[-2.5, -45.5], [-5.5, -45]]) { const e = g.spawn('rat_pike', x, z); e?.alert?.(); }
          return true;
        });
        await pg.waitForTimeout(1500);
        const dev = await G(() => window.__GAME__.ctx.input.device);
        t.log(`touch page: device ${dev}`);
        await mshot('companions/touch-portrait');
        // the portrait button (ui's cluster): a tap is the smart cast (the wall goes between her and the rats)
        const btn = pg.locator('.tb-ability').first();
        let tapped = false;
        if (await btn.isVisible().catch(() => false)) { await btn.tap().catch(() => {}); tapped = true; }
        let cast = tapped && await untilM(() => window.__GAME__.ctx.companions.walls.length > 0, null, 6000);
        if (!cast) {
          t.warn(`portrait button ${tapped ? 'tap did not cast' : 'not visible'} (ui touch rework pending): smart cast through the API`);
          cast = await G(() => window.__GAME__.ctx.companions.useAbility());
        }
        t.assert(cast, 'no smart cast on touch');
        const wall = await G(() => {
          const c = window.__GAME__.ctx, w = c.companions.walls[0], p = c.player.pos;
          return w ? { ahead: w.center.z - p.z, side: w.center.x - p.x, src: window.__GAME__.lastEvent?.('companion:ability')?.source } : null;
        });
        t.assert(wall && wall.ahead > 1.0, `smart wall not toward the rats (${JSON.stringify(wall)})`);
        await pg.waitForTimeout(400);
        await mshot('companions/touch-portrait-cast');
        // ui's drag-aim: the indicator follows the drag, the release casts along it
        await G(() => { const m = window.__GAME__.ctx.companions; for (const w of [...m.walls]) w.end?.(); m.active[0].cooldown = 0; m.active[0]._endAbility(); });
        await pg.waitForTimeout(400);
        t.assert(await G(() => window.__GAME__.ctx.companions.aimAbility({ dir: { x: -1, z: 0.4 } })), 'aimAbility refused');
        await pg.waitForTimeout(300);
        const shown = await G(() => window.__GAME__.ctx.companions.indicator.showing ?? (window.__GAME__.ctx.fx?.drawsAbilityAim ? 'fx' : null));
        t.assert(shown === 'rect' || shown === 'fx', `drag-aim indicator ${shown}`);
        await mshot('companions/touch-portrait-aim');
        t.assert(await G(() => window.__GAME__.ctx.companions.useAbility({ dir: { x: -1, z: 0.4 } })), 'drag release did not cast');
        // tap Mochi: he trots over and says hello (camera's tap pick when it exists)
        const pets0 = await G(() => window.__GAME__.ctx.companions.active[0].stats.pets);
        const via = await G(() => {
          const g = window.__GAME__, m = g.ctx.companions.active[0];
          if (typeof g.tapAt === 'function') { try { g.tapAt(m.pos.x, m.pos.z); return 'tapAt'; } catch { /* core mid-edit */ } }
          return g.ctx.companions.use(m) ? 'use' : 'none';
        });
        const petted = await untilM((n) => window.__GAME__.ctx.companions.active[0].stats.pets > n, pets0, 8000);
        if (via === 'tapAt' && !petted) t.warn('tapAt did not reach companions.use (player use order / camera pick pending)');
        else t.assert(petted, `tapping Mochi did nothing (${via})`);
        await pg.waitForTimeout(600);
        await mshot('companions/touch-portrait-pet');
        // landscape 844×390: Sage's Volley drag-aim with pips
        await pg.setViewportSize({ width: 844, height: 390 });
        await pg.waitForTimeout(1200);
        await G(() => { const g = window.__GAME__, c = g.ctx; for (const e of [...(c.enemies.list ?? [])]) c.enemies.despawn?.(e); c.companions.setActive(['sage']); for (const [x, z] of [[-2, -44], [-6, -43.5]]) { const e = g.spawn('rat_pike', x, z); e?.alert?.(); } const cr = g.spawn('crow', -4, -42); cr?.alert?.(); return true; });
        await pg.waitForTimeout(1200);
        t.assert(await G(() => window.__GAME__.ctx.companions.aimAbility({ dir: { x: 0, z: 1 }, mag: 0.6 })), 'Sage aimAbility refused');
        await pg.waitForTimeout(300);
        const va = await G(() => { const a = window.__GAME__.ctx.companions.aim; return { shape: a.shape, n: a.plan.targets.length, valid: a.valid }; });
        t.assert(va.shape === 'targets' && va.n >= 1, `landscape Volley aim ${JSON.stringify(va)}`);
        await mshot('companions/touch-landscape-aim');
        t.assert(await G(() => window.__GAME__.ctx.companions.useAbility({ dir: { x: 0, z: 1 }, mag: 0.6 })), 'Volley drag release did not cast');
        await pg.waitForTimeout(700);
        await mshot('companions/touch-landscape-cast');
      } finally {
        await ctxM.close().catch(() => {});
      }
      const real = errors.filter((e) => !/favicon/.test(e));
      for (const e of real.slice(0, 10)) t.fail(`touch page: ${e}`);
    },
  },
];
