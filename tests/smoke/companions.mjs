// tests/smoke/companions.mjs  (owner: companions) — GAME_DESIGN §9 companions, §12.1 lost kittens, D-01, CS-03 Pudding,
// scripted NPCs, driven through __GAME__ hooks in the running game. Screenshots → tests/shots/companions/*.png
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
      await t.shot('companions/follow-run');
      await t.wait(2200);                                            // she stands still: Mochi comes up beside her
      s = await comp(t);
      t.assert(s.dist > 0.6 && s.dist < 2.4, `Mochi beside her when she stops: ${s.dist.toFixed(2)} m`);
      await t.shot('companions/follow-still');
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
      await t.shot('companions/fight');
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
      await t.shot('companions/shield-wall');
      await frame(t, [2.6, 1.7, 5.2], [0, 0.6, 1.2], 50);
      await t.wait(250);
      await t.shot('companions/shield-wall-front');
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
      await t.shot('companions/nap');
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
      await t.shot('companions/kitten-barrel');
      await t.clearEvents();
      await t.tap('KeyC');                                           // Meow
      let meowed = await t.waitForEvent('player:meow', 4000);
      if (!meowed) {                                                 // the player area's input path, not ours: say so, go on
        t.warn('C did not produce player:meow within 4 s; emitting it directly');
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_MEOW, { position: g.ctx.player.pos.clone() }); });
        meowed = true;
      }
      t.assert(await t.waitForEvent('kitten:reveal', 3000), 'a Meow within 10 m did not reveal Noodle');
      await t.wait(900);
      await t.shot('companions/kitten-reveal');
      await t.G(() => {
        const g = window.__GAME__, c = g.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'noodle');
        c.player.teleport({ pos: new g.THREE.Vector3(k.pos.x + 0.7, k.pos.y, k.pos.z - 0.7), facing: Math.atan2(-0.7, 0.7) });
      });
      t.assert(await t.waitForEvent('kitten:rescued', 2000), 'touching the revealed kitten did not rescue it');
      t.assert(await t.G(() => window.__GAME__.ctx.state.kittens.includes('noodle')), 'state.kittens lacks noodle');
      await freeze(t, true);
      await frame(t, [1.4, 1.1, 2.6], [-0.5, 0.65, 0.4], 45);
      await t.wait(350);
      await t.shot('companions/kitten-rescue');
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
      await t.hold('KeyL', 3600);                                    // (2.5 s in, the Stand becomes Meme Cam: still counts)
      const revealed = await t.G(() => !window.__GAME__.ctx.companions.kittens.find((x) => x.kittenId === 'button')?.hidden);
      if (!revealed) {
        const why = await t.G(() => { const p = window.__GAME__.ctx.player; return { guarding: p.guarding, state: p.stateName, v: Math.hypot(p.vel.x, p.vel.z) }; });
        t.fail(`a 3 s Stand in the zone did not reveal Button (player ${JSON.stringify(why)})`);
      }
      await t.wait(400);
      await t.shot('companions/kitten-stand');
      await t.G(() => window.__GAME__.setMode('play'));
      await follow(t);
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
      await t.shot('companions/cage-cart');
      await t.G(() => window.__GAME__.ctx.bus.emit(window.__GAME__.E.ARENA_CLEAR, { id: 'smoke_bridge' }));
      await t.frames(2);
      const hits = await t.G(() => {
        const c = window.__GAME__.ctx, k = c.companions.kittens.find((x) => x.kittenId === 'mochi');
        const out = [c.combat.applyHit(c.companions.active[0] ?? k, k.lock, { id: 'smoke', dmg: 50 })];   // not hers: immune
        for (let i = 0; i < 4 && !k.lock.opened; i++) { k.lock.invulnT = 0; out.push(c.combat.applyHit(c.player, k.lock, c.config.ATTACKS.slash1)); }
        return { out, opened: k.lock.opened };
      });
      t.assert(hits.opened, `her hits did not open the 30 HP lock (${hits.out.join(', ')})`);
      t.assert(hits.out[0] === 'immune' || hits.out[0] === 'none', `a non-player hit on the lock resolved as ${hits.out[0]}`);
      await t.wait(300);
      await freeze(t, true);
      await t.wait(150);
      await t.shot('companions/cage-open');
      await freeze(t, false);
      let joined = false;
      for (let i = 0; i < 40 && !joined; i++) {
        await t.wait(250);
        joined = await t.G(() => { const g = window.__GAME__; if (g.mode !== 'play') g.story.skip?.(); return g.ctx.companions.active[0]?.kittenId === 'mochi'; });
      }
      t.assert(joined, 'Mochi did not join the party after the cage opened');
      t.assert((await t.events()).includes('companion:changed'), 'companion:changed not emitted on the join');
      t.assert(await t.G(() => window.__GAME__.ctx.state.companions.unlocked.includes('mochi')), 'mochi not unlocked in state');
      await t.G(() => window.__GAME__.setMode('play'));
      await follow(t);
      await t.wait(1600);
      await t.shot('companions/mochi-joined');
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
      for (let i = 0; i < 40; i++) {
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
      await t.shot('companions/pudding-netted');
      await t.G(() => window.__GAME__.ctx.bus.emit(window.__GAME__.E.OBJECTIVE, { id: 'net_ropes', value: 2, max: 3 }));
      await t.wait(400);
      t.assert(await t.G(() => window.__GAME__.ctx.companions.pudding.ropesCut === 2), 'net_ropes progress did not reach the net');
      await setFlag(true);
      await t.wait(900);
      await freeze(t, true);
      await t.wait(150);
      await t.shot('companions/pudding-free');
      await freeze(t, false);
      for (let i = 0; i < 40; i++) { await t.wait(250); pud = await t.G(() => ({ mode: window.__GAME__.ctx.companions.pudding?.mode, i: window.__GAME__.ctx.companions.pudding?.perchIndex })); if (pud.mode === 'perch') break; }
      const anchors = await t.G(() => !!window.__GAME__.ctx.levels.anchor?.('pud_1'));
      if (anchors) t.assert(pud.mode === 'perch' && pud.i >= 0, `Pudding did not fly to a perch (${pud.mode})`);
      else t.warn('meadow has no pud_1 anchor yet (world in progress): Pudding stays put');
      await follow(t);
      await t.G(() => { const g = window.__GAME__, c = g.ctx; c.player.teleport({ pos: new g.THREE.Vector3(8, c.physics.heightAt(8, 25), 25), facing: Math.atan2(12, 11) }); c.cam.snapBehind?.(); });
      await t.wait(900);
      await t.shot('companions/pudding-perch');
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
      await t.shot('companions/npcs');
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
];
