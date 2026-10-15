// tests/smoke/combat.mjs  (owner: combat) — the combat resolve path in the running game (GAME_DESIGN §19.9 item 3 +
// combat's own checks). Screenshots go to tests/shots/combat/.
//   combat:arc      swept arcs on real enemies (API-driven: left/right hit, behind/far missed) + the J combo kills a rat
//   combat:parry    a real rat_pike pokes; the Stand starts just before its strike → player:parry, the rat staggers
//   combat:block    a held Stand blocks a poke (0 dmg, 1 Grit, hitstop 0.04); dropped, the next poke hurts (1 HP, 0.9 s i-frames)
//   combat:reflect  a crossbow bolt is parried → combat:reflect, it flies back gold and kills the shooter for 25
//   combat:holy     Holy Slash with Shard 2 → holyWave pierces a line of rats (each hit once)
//   combat:tokens   4 rats around her: never more than the difficulty's melee tokens attack at once (Knight 2, Kitten 1)
//   combat:visuals  every projectile look frozen in front of the camera (bolt, reflected bolt, orb, glob, wave, gleam)
// Iso controls (research/CONTROLS_SPEC.md §7–§8, §12 combat):
//   combat:reflect-aim  the cursor on a second rat: the parried bolt flies at it (±25° of the aim), the shooter is spared
//   combat:assist       §7.2 score on live actors (the rat winding up on her ranks first, §8.5 payload, nextParryable;
//                       frozen shot of the strike wedge + parry ring), then desktop LMB toward the cursor hits a side rat
//   combat:touch        390×844 and 844×390 hasTouch / isMobile: ⚔ with an idle stick = 360° auto-target + lunge
//                       magnetism; the parry ring (auto on touch) cues a 🛡 press from the touch button → parry
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

fs.mkdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'combat'), { recursive: true });

/** Page helper source: spawn an enemy at (angle relative to her facing, distance), optionally AI-less, facing her. */
const SPAWN = (type, rel, dist, opts = {}) => {
  const g = window.__GAME__, ctx = g.ctx, p = ctx.player, THREE = g.THREE;
  const a = p.facing + rel;
  const pos = new THREE.Vector3(p.pos.x + Math.sin(a) * dist, 0, p.pos.z + Math.cos(a) * dist);
  pos.y = ctx.physics.heightAt(pos.x, pos.z);
  const e = ctx.enemies.spawn(type, pos, { facing: Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z) });
  if (opts.passive) e.ai = false;
  return e;
};

/**
 * Install the page-side helpers once per block. `forward` (m) first walks her out along her facing, clear of the
 * fence rail right behind the meadow `start` spawn, so the follow camera has an open view.
 */
async function prepare(t, forward = 0) {
  await t.G(([spawnSrc, fwd]) => {
    const g = window.__GAME__, ctx = g.ctx, p = ctx.player;
    // eslint-disable-next-line no-new-func
    g.__combatSpawn = new Function(`return (${spawnSrc})`)();
    g.god(true);
    ctx.input.setDevice?.('kbm');
    ctx.game.setTimeScale(1);
    if (fwd > 0) {
      const f = p.facing, x = p.pos.x + Math.sin(f) * fwd, z = p.pos.z + Math.cos(f) * fwd;
      p.teleport({ pos: new g.THREE.Vector3(x, ctx.physics.heightAt(x, z), z), facing: f });
    }
    return true;
  }, [SPAWN.toString(), forward]);
  if (forward > 0) await t.frames(45);                       // let the follow camera settle behind her
}

/** Press the Stand (virtual guard) for `ms` real milliseconds from inside the page. */
const guardFor = (ms) => {
  const input = window.__GAME__.ctx.input;
  input.setVirtual('guard', true); input.setDevice?.('kbm');     // stay on kbm: touch would add Auto-Stand after a parry
  setTimeout(() => { input.setVirtual('guard', false); input.setDevice?.('kbm'); }, ms);
};

export default [
  {
    name: 'combat:arc', order: 30, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(5);
      // 1) API-driven slash1 on four passive rats around her (real Enemy hooks, real HIT events)
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, S = g.__combatSpawn;
        const L = S('rat_pike', 1.0, 1.5, { passive: true }), R = S('rat_pike', -1.0, 1.5, { passive: true });
        const B = S('rat_pike', Math.PI, 1.5, { passive: true }), F = S('rat_pike', 0, 3.2, { passive: true });
        const s = ctx.combat.beginSwing(p, ctx.config.ATTACKS.slash1, { assist: false, projectiles: false });
        let n = 0; for (let i = 0; i < 30 && !s.done; i++) n += ctx.combat.updateSwing(s, 1 / 60);
        ctx.game.hitstopT = 0;
        const out = { n, L: L.hp, R: R.hp, B: B.hp, F: F.hp, max: L.maxHp, order: ctx.combat.log.slice(-2).map((e) => e.targetId === L.id ? 'L' : e.targetId === R.id ? 'R' : '?') };
        for (const e of [L, R, B, F]) ctx.enemies.despawn(e);
        return out;
      });
      t.assert(r.n === 2, `slash1 should hit 2 rats, hit ${r.n}`);
      t.assert(r.L === r.max - 10 && r.R === r.max - 10, `left/right rats take 10 (hp ${r.L}, ${r.R} of ${r.max})`);
      t.assert(r.B === r.max && r.F === r.max, `rats behind / out of range untouched (hp ${r.B}, ${r.F})`);
      t.assert(r.order.join('') === 'LR', `slash1 sweeps left → right (got ${r.order.join('')})`);
      // 2) the real combo: J J J on a rat right in front of her
      const id = await t.G(() => window.__GAME__.__combatSpawn('rat_pike', 0, 1.35, { passive: true }).id);
      await t.clearEvents();
      await t.G(() => window.__GAME__.ctx.combat.log.length = 0);
      await t.tap('KeyJ', 3, 260);
      await t.wait(150);
      await t.shot('combat/arc-combo');
      await t.wait(900);
      const c = await t.G((rid) => {
        const ctx = window.__GAME__.ctx, e = ctx.actors.list.find((a) => a.id === rid);
        return { hits: ctx.combat.log.filter((x) => x.targetId === rid && x.result === 'hit').map((x) => x.attackId), alive: e?.alive ?? false };
      }, id);
      const ev = await t.events();
      t.log(`combo hits: ${c.hits.join(', ') || 'none'}; rat alive=${c.alive}; combat:hit events ${ev.filter((e) => e === 'combat:hit').length}`);
      t.assert(c.hits.length >= 2, `the J combo should land ≥ 2 hits on the rat (got ${c.hits.length})`);
      t.assert(ev.includes('combat:hit') && ev.includes('fx:shake'), 'combat:hit + fx:shake emitted');
    },
  },
  {
    name: 'combat:parry', order: 31, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(5);
      await t.G((guardSrc) => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, input = ctx.input;
        const guard = new Function(`return (${guardSrc})`)();
        const rat = g.__combatSpawn('rat_pike', 0, 1.7);
        g.__parry = { rat: rat.id, tele: null, pressed: false, parried: null, stagger: null, riposteAt: -1, released: false };
        const st = g.__parry;
        st.offT = ctx.bus.on(E.TELEGRAPH, (p) => { if (p.actor === rat && !st.pressed) st.tele = { t: ctx.game.time, d: p.duration }; });
        st.offP = ctx.bus.on(E.PLAYER_PARRY, (p) => {
          st.parried = { gold: p.gold, attacker: p.attacker?.id, t: ctx.game.time };
          // the Stand stays held (Stand + ⚔ is the natural riposte input; a Stand held into a swing can't cancel it)
          st.riposteAt = ctx.game.time + 0.12;                     // ⚔ well inside the 0.8 s Riposte window
        });
        st.offH = ctx.game.addFrameHook(() => {
          if (st.parried && !st.stagger) st.stagger = { state: rat.stateName, staggerT: rat.staggerT };
          if (st.riposteAt >= 0 && ctx.game.time >= st.riposteAt && !st.released) {
            if (!st.attackOn) { st.attackOn = true; input.setVirtual('attack', true); input.setDevice?.('kbm'); st.attackT = ctx.game.time; }
            else if (ctx.game.time - st.attackT > 0.08) { input.setVirtual('attack', false); input.setDevice?.('kbm'); st.released = true; }
          }
          if (!st.tele || st.pressed) return;
          if (ctx.game.time >= st.tele.t + st.tele.d - 0.05) { st.pressed = true; guard(500); }
        });
        return true;
      }, guardFor.toString());
      const ok = await t.waitForEvent('player:parry', 12000);
      await t.wait(60);
      await t.shot('combat/parry');
      await t.wait(900);
      const s = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, st = g.__parry, rat = ctx.actors.list.find((a) => a.id === st.rat);
        st.offT(); st.offP(); st.offH();
        const rip = ctx.combat.log.filter((e) => e.attackId === 'riposte' && e.targetId === st.rat);
        return { parried: st.parried, pressed: st.pressed, ratId: st.rat, stagger: st.stagger, ratAlive: rat?.alive ?? false,
          riposte: rip.map((e) => `${e.result}:${e.damage}:${e.crit}`), log: ctx.combat.log.slice(-3).map((e) => `${e.attackId}:${e.result}:${e.damage}`),
          last: ctx.combat.lastParry ? ctx.combat.lastParry.attacker?.id : null };
      });
      t.assert(ok && s.parried, `player:parry not emitted (guard pressed=${s.pressed})`);
      if (s.parried) {
        t.assert(s.parried.attacker === s.ratId, `player:parry carries the attacking rat (got ${s.parried.attacker})`);
        t.assert(s.stagger && (s.stagger.state === 'stagger' || s.stagger.staggerT > 0), `parried rat should stagger (${JSON.stringify(s.stagger)})`);
        t.assert(s.last === s.ratId, 'combat.lastParry recorded');
      }
      // Riposte: ⚔ within 0.8 s of the parry → 18 × 2 crit = 36 kills the 30-HP pikeman (the trigger is the player area's)
      t.log(`after parry: ${s.log.join(' ')}; riposte ${s.riposte.join(', ') || 'none'}`);
      if (s.riposte.length) {
        t.assert(s.riposte[0] === 'hit:36:true', `riposte should crit for 36 (got ${s.riposte[0]})`);
        t.assert(!s.ratAlive, 'a Riposte kills a Rat Pikeman (§7.2 DPS check)');
      } else t.warn('no riposte hit after the parry (player area)');
    },
  },
  {
    name: 'combat:block', order: 31.5, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(5);
      // 1) a Stand held long before the poke (past the parry window) blocks: 0 damage, 1 Grit, block hitstop
      // 2) Stand dropped: the next poke hurts her (god off) with the hurt row: 1 HP, 0.9 s i-frames, hitstop 0.07
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, input = ctx.input, p = ctx.player;
        g.god(false);
        p.hp = p.maxHp;
        const rat = g.__combatSpawn('rat_pike', 0.45, 1.7);                 // inside her ±70° Stand, in view of the camera
        input.setDevice?.('kbm'); input.setVirtual('guard', true);
        const st = g.__block = { rat: rat.id, hits: [], grit0: p.grit, dropped: false };
        st.off = ctx.bus.on(E.HIT, (h) => {
          if (h.target !== p || st.hits.some((x) => !x.blocked)) return;
          st.hits.push({ result: h.result, blocked: h.blocked, damage: h.damage, hitstop: ctx.game.hitstopT, invulnT: p.invulnT, hp: p.hp, grit: p.grit });
          if (!h.blocked) g.god(true);                                        // one hurt is enough
          if (h.blocked && !st.dropped) { st.dropped = true; setTimeout(() => { input.setVirtual('guard', false); input.setDevice?.('kbm'); }, 50); }
        });
        return true;
      });
      await t.page.waitForFunction(() => window.__GAME__.__block.hits.some((h) => h.blocked), null, { timeout: 15000, polling: 100 }).catch(() => {});
      await t.wait(40);
      await t.shot('combat/block');
      await t.page.waitForFunction(() => window.__GAME__.__block.hits.some((h) => !h.blocked), null, { timeout: 15000, polling: 100 }).catch(() => {});
      await t.wait(80);
      await t.shot('combat/hurt');
      const s = await t.G(() => {
        const g = window.__GAME__, st = g.__block;
        st.off(); g.ctx.input.setVirtual('guard', false); g.god(true);
        return { hits: st.hits, grit0: st.grit0 };
      });
      t.log(`player hits: ${s.hits.map((h) => `${h.result}:${h.damage} (hitstop ${h.hitstop.toFixed(2)}, iframes ${h.invulnT.toFixed(2)})`).join(', ')}`);
      const b = s.hits.find((h) => h.blocked), h = s.hits.find((x) => !x.blocked);
      t.assert(!!b, 'a held Stand blocks the poke (combat:hit {blocked})');
      if (b) {
        t.assert(b.result === 'block' && b.damage === 0, `block: 0 damage (${JSON.stringify(b)})`);
        t.assert(b.grit === s.grit0 - 1, `block costs 1 Grit (${s.grit0} → ${b.grit})`);
        t.assert(Math.abs(b.hitstop - 0.04) < 0.011, `block hitstop 0.04 (got ${b.hitstop})`);
        t.assert(b.invulnT === 0, 'a block grants no i-frames');
      }
      t.assert(!!h, 'with the Stand dropped the next poke lands');
      if (h) {
        t.assert(h.result === 'hit' && h.damage === 1, `rat_poke hurts her for 1 HP (${JSON.stringify(h)})`);
        t.assert(Math.abs(h.hitstop - 0.07) < 0.011, `player-hurt hitstop 0.07 (got ${h.hitstop})`);
        t.assert(h.invulnT > 0.85, `0.9 s hurt i-frames (got ${h.invulnT})`);
      }
    },
  },
  {
    name: 'combat:reflect', order: 32, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(5);
      await t.G((guardSrc) => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, THREE = g.THREE, p = ctx.player;
        const guard = new Function(`return (${guardSrc})`)();
        const rat = g.__combatSpawn('rat_xbow', 0.7, 7, { passive: true });      // off to her left: the gold return is in view
        const from = new THREE.Vector3(rat.pos.x, rat.pos.y + rat.height * 0.6, rat.pos.z);
        const dir = new THREE.Vector3(p.pos.x - from.x, p.pos.y + p.height * 0.55 - from.y, p.pos.z - from.z);
        const bolt = ctx.combat.spawnProjectile(ctx.config.ATTACKS.rat_bolt, rat, from, dir);
        g.__reflect = { rat: rat.id, pressed: false, reflected: false, frozen: false, bolt: bolt.id };
        const st = g.__reflect;
        st.off = ctx.bus.on(E.REFLECT, () => { st.reflected = true; });
        st.offH = ctx.game.addFrameHook(() => {
          if (!bolt.alive) return;
          const d = Math.hypot(bolt.pos.x - p.pos.x, bolt.pos.z - p.pos.z);
          // freeze the world once the gold return is ~1.6 m out (frame-exact, whatever the machine load)
          if (st.reflected && !st.frozen && bolt.reflected && d >= 1.6) { st.frozen = true; ctx.game.setTimeScale(0); }
          if (st.pressed) return;
          if ((d - p.radius - bolt.r) / bolt.speed <= 0.07) { st.pressed = true; guard(400); }
        });
        return true;
      }, guardFor.toString());
      const ok = await t.waitForEvent('combat:reflect', 6000);
      try { await t.page.waitForFunction(() => window.__GAME__.__reflect.frozen, null, { timeout: 4000, polling: 'raf' }); } catch { t.warn('reflect: never froze for the shot'); }
      await t.frames(2);
      await t.shot('combat/reflect');
      await t.G(() => window.__GAME__.ctx.game.setTimeScale(1));
      await t.wait(1200);
      const s = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, st = g.__reflect;
        st.off(); st.offH();
        const rat = ctx.actors.list.find((a) => a.id === st.rat);
        const hit = ctx.combat.log.find((e) => e.targetId === st.rat);
        return { reflected: st.reflected, pressed: st.pressed, ratAlive: rat?.alive ?? false, hit, hp: ctx.player.hp, maxHp: ctx.player.maxHp, stats: ctx.combat.stats };
      });
      t.assert(ok && s.reflected, `bolt not reflected (guard pressed=${s.pressed})`);
      t.assert(s.hit && s.hit.attackId === 'rat_bolt' && s.hit.damage === 25, `reflected bolt should hit the shooter for 25 (got ${JSON.stringify(s.hit)})`);
      t.assert(!s.ratAlive, 'a 20-HP crossbow rat dies to its own reflected bolt');
      t.log(`reflects ${s.stats.reflects}, parries ${s.stats.parries}, player hp ${s.hp}/${s.maxHp}`);
    },
  },
  {
    name: 'combat:holy', order: 33, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      await t.G(() => { const g = window.__GAME__; g.player.setShards(2); g.player.setValor(100); return true; });
      await t.frames(3);
      const ids = await t.G(() => {
        const S = window.__GAME__.__combatSpawn;
        return [S('rat_pike', 0.05, 5, { passive: true }), S('rat_pike', -0.08, 7.5, { passive: true }), S('rat_pike', 0.6, 4.5, { passive: true })].map((e) => { e.hp = e.maxHp = 100; return e.id; });
      });
      await t.clearEvents();
      // hold ⚔ until the charge reaches tier 2 in game time (a loaded machine runs the sim slower than real time)
      await t.page.keyboard.down('KeyJ');
      try { await t.page.waitForFunction(() => (window.__GAME__.ctx.player.chargeTier ?? 0) >= 2, null, { timeout: 6000, polling: 'raf' }); } catch { /* fallback below */ }
      await t.page.keyboard.up('KeyJ');
      let holy = await t.waitForEvent('player:holy', 1000);
      if (!holy) {                                                   // player area not wired yet: fire the swing directly
        t.warn('no player:holy from a tier-2 charge; driving the holy swing through the API');
        await t.G(() => {
          const ctx = window.__GAME__.ctx, p = ctx.player, s = ctx.combat.beginSwing(p, ctx.config.ATTACKS.holy);
          for (let i = 0; i < 20; i++) ctx.combat.updateSwing(s, 1 / 60);
          return true;
        });
      }
      await t.wait(holy ? 330 : 30);
      await t.G(() => window.__GAME__.ctx.game.setTimeScale(0.04));
      await t.wait(150);
      await t.shot('combat/holy-wave');
      await t.G(() => window.__GAME__.ctx.game.setTimeScale(1));
      await t.wait(1400);
      const s = await t.G((rids) => {
        const ctx = window.__GAME__.ctx;
        const hits = ctx.combat.log.filter((e) => e.attackId === 'holyWave' && rids.includes(e.targetId));
        return { waves: ctx.combat.stats.projectiles, hits: hits.map((h) => rids.indexOf(h.targetId)), dmg: hits.map((h) => h.damage) };
      }, ids);
      t.log(`holyWave hits on rats #${s.hits.join(', #')} for ${s.dmg.join(', ')}`);
      t.assert(s.hits.includes(0) && s.hits.includes(1), 'holyWave pierces both rats in its path');
      t.assert(new Set(s.hits).size === s.hits.length, 'each rat hit once by the wave');
    },
  },
  {
    name: 'combat:tokens', order: 34, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      // sampled every rendered frame inside the page, in game time: Knight 4 s → Kitten (3 s settle) → 3 s
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, S = g.__combatSpawn, tk = ctx.combat.tokens;
        for (let i = 0; i < 4; i++) S('rat_pike', (i / 4) * Math.PI * 2, 3);
        const st = g.__tokens = { phase: 'knight', t0: ctx.game.time, knight: { max: 0, busy: 0, n: 0 }, kitten: { max: 0, busy: 0, n: 0 }, done: false };
        st.off = ctx.game.addFrameHook(() => {
          const dt = ctx.game.time - st.t0, c = tk.count('melee');
          if (st.phase === 'knight') {
            st.knight.max = Math.max(st.knight.max, c); st.knight.n++; if (c > 0) st.knight.busy++;
            if (dt >= 4) { ctx.state.difficulty = 'kitten'; st.phase = 'settle'; st.t0 = ctx.game.time; }
          } else if (st.phase === 'settle') {
            if (dt >= 3) { st.phase = 'kitten'; st.t0 = ctx.game.time; }
          } else if (st.phase === 'kitten') {
            st.kitten.max = Math.max(st.kitten.max, c); st.kitten.n++; if (c > 0) st.kitten.busy++;
            if (dt >= 3) { ctx.state.difficulty = 'knight'; st.phase = 'done'; st.done = true; st.off(); }
          }
        });
        return true;
      });
      await t.page.waitForFunction(() => window.__GAME__.__tokens.done, null, { timeout: 100000, polling: 250 });
      await t.shot('combat/tokens');
      const s = await t.G(() => { const st = window.__GAME__.__tokens; return { knight: st.knight, kitten: st.kitten }; });
      t.assert(s.knight.max <= 2, `Knight: at most 2 melee tokens (saw ${s.knight.max})`);
      t.assert(s.knight.busy > 0, 'rats took attack tokens');
      t.assert(s.kitten.max <= 1, `Kitten: at most 1 melee token (saw ${s.kitten.max})`);
      t.assert(s.kitten.busy > 0, 'Kitten: rats still attack, one at a time');
      t.log(`tokens: knight max ${s.knight.max} (busy ${s.knight.busy}/${s.knight.n} frames), kitten max ${s.kitten.max} (busy ${s.kitten.busy}/${s.kitten.n})`);
    },
  },
  {
    name: 'combat:visuals', order: 35, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(10);
      const n = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, A = ctx.config.ATTACKS;
        ctx.game.setTimeScale(0);
        const f = p.facing, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
        const at = (fwd, side, up) => { const x = p.pos.x + fx * fwd + rx * side, z = p.pos.z + fz * fwd + rz * side; return new THREE.Vector3(x, ctx.physics.heightAt(x, z) + up, z); };
        const across = new THREE.Vector3(-rx, 0, -rz), toward = new THREE.Vector3(-fx, 0, -fz);
        const shooter = { id: -1, faction: 'enemy', pos: at(9, 0, 0), facing: f + Math.PI, height: 0.8 };
        const list = [
          ctx.combat.spawnProjectile(A.rat_bolt, shooter, at(2.2, -0.9, 0.9), across),
          ctx.combat.spawnProjectile(A.bone_bolt, shooter, at(2.6, 0.9, 1.0), toward),
          ctx.combat.spawnProjectile(A.spider_web, shooter, at(2.4, 0.15, 0.55), toward.clone().add(across).normalize()),
          ctx.combat.spawnProjectile(A.holyWave, p, at(5.5, 0, 0), new THREE.Vector3(fx, 0, fz)),
          ctx.combat.spawnProjectile(A.gleam, p, at(3.4, -1.6, 0), new THREE.Vector3(fx, 0, fz)),
        ];
        const r = ctx.combat.spawnProjectile(A.rat_bolt, shooter, at(1.8, 0.55, 1.25), across);
        ctx.combat.reflect(r, p);
        for (const q of list) q.age = 0.12;                           // crescents fully grown
        return ctx.combat.projectiles.list.length;
      });
      await t.frames(6);
      await t.shot('combat/projectiles');
      await t.G(() => { const ctx = window.__GAME__.ctx; ctx.combat.projectiles.clear(); ctx.game.setTimeScale(1); return true; });
      t.assert(n === 6, `6 projectiles on screen (got ${n})`);
      await t.blankCheck('combat:visuals');
    },
  },
  // ================================================================ iso controls (CONTROLS_SPEC §7–§8, §12 combat)
  {
    name: 'combat:assist', order: 36, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(5);
      // 1) §7.2 score on live actors: a real pikeman winding up on her at 2.4 m outranks a passive one at 1.5 m;
      //    nextParryable reports its strike (activeAt in the future, the parry window); the parry ring + wedge draw.
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, S = g.__combatSpawn;
        ctx.state.settings.parryRing = 'on';
        const near = S('rat_pike', 1.4, 1.8, { passive: true });
        const wind = S('rat_pike', -0.5, 2.4);
        const st = g.__assist = { near: near.id, wind: wind.id, at: null, done: false };
        st.off = ctx.bus.on(E.TELEGRAPH, (p) => {
          if (p.actor !== wind || st.at || (p.kind !== 'parry' && p.kind !== 'gold')) return;
          const out = {};
          const pick = ctx.combat.assistTarget(ctx.player, 4.5, Math.PI, out);
          const nx = ctx.combat.nextParryable(ctx.player, 6);
          st.at = { pick: pick?.id ?? null, terms: out.terms, list: out.list.map((e) => ({ id: e.actor.id, s: +e.score.toFixed(2) })),
            nx: nx ? { attacker: nx.attacker?.id, left: nx.activeAt - ctx.game.time, window: nx.window, kind: nx.kind } : null,
            payload: { activeAt: p.activeAt, windup: p.windup, attackId: p.attackId, targetsPlayer: p.targetsPlayer } };
          // freeze ~0.3 s before the strike for the screenshot (parry ring mid-shrink + the strike wedge)
          const hook = ctx.game.addFrameHook(() => {
            if (ctx.game.time >= p.activeAt - 0.3) { ctx.game.setTimeScale(0); st.done = true; hook(); }
          });
        });
        return true;
      });
      try { await t.page.waitForFunction(() => window.__GAME__.__assist.done, null, { timeout: 15000, polling: 50 }); } catch { /* asserted below */ }
      await t.frames(2);
      await t.shot('combat/assist-windup');
      const a = await t.G(() => { const g = window.__GAME__, st = g.__assist; st.off(); g.ctx.game.setTimeScale(1); return { at: st.at, near: st.near, wind: st.wind }; });
      t.log(`telegraph: ${JSON.stringify(a.at?.payload)}; scores ${JSON.stringify(a.at?.list)}; next ${JSON.stringify(a.at?.nx)}`);
      t.assert(!!a.at, 'the live pikeman wound up (combat:telegraph)');
      if (a.at) {
        t.assert(a.at.pick === a.wind, `§7.2: the rat winding up on her ranks first (picked ${a.at.pick}, terms ${JSON.stringify(a.at.terms)})`);
        t.assert(a.at.terms?.windup === -2.5, 'the wind-up term is −2.5');
        t.assert(a.at.nx?.attacker === a.wind && a.at.nx.left > 0 && a.at.nx.window > 0, `nextParryable → the pikeman, strike ahead (${JSON.stringify(a.at.nx)})`);
        t.assert(typeof a.at.payload.activeAt === 'number' && typeof a.at.payload.windup === 'number' && a.at.payload.targetsPlayer === true,
          `§8.5 payload filled (${JSON.stringify(a.at.payload)})`);
      }
      // 2) desktop LMB toward the cursor: aim at a passive rat off to her side (outside the old facing cone), click →
      //    she swings toward it (§6 LMB attacks toward the cursor; KBM magnet ±25°) and it takes the hit.
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, S = g.__combatSpawn, p = ctx.player;
        for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);
        ctx.combat.log.length = 0;
        const side = S('rat_pike', 1.9, 1.7, { passive: true });
        side.hp = side.maxHp = 100;
        return { id: side.id, x: side.pos.x, z: side.pos.z, f0: p.facing };
      });
      await t.frames(3);
      // a real mouse press (the LMB = attack binding + the click pick), the cursor a little off the rat
      const sp = await t.G(([x, z]) => window.__GAME__.screen(x, z), [r.x + 0.25, r.z]);
      await t.page.mouse.move(sp.x, sp.y, { steps: 4 });
      await t.frames(2);
      await t.page.mouse.down({ button: 'left' });
      await t.wait(70);
      await t.page.mouse.up({ button: 'left' });
      await t.wait(120);
      await t.shot('combat/assist-lmb');
      await t.wait(600);
      const s = await t.G((rid) => {
        const ctx = window.__GAME__.ctx, p = ctx.player, e = ctx.actors.list.find((x) => x.id === rid);
        return { hits: ctx.combat.log.filter((x) => x.targetId === rid).map((x) => `${x.attackId}:${x.result}`),
          face: p.facing, want: Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z) };
      }, r.id);
      const err = Math.abs(Math.atan2(Math.sin(s.face - s.want), Math.cos(s.face - s.want)));
      t.log(`LMB at the side rat: hits ${s.hits.join(', ') || 'none'}; facing error ${(err * 57.3).toFixed(1)}°`);
      t.assert(s.hits.some((h) => h.endsWith(':hit')), 'the LMB swing toward the cursor hits the side rat');
      t.assert(err < 0.45, `she faces the rat after the swing (${(err * 57.3).toFixed(1)}°)`);
    },
  },
  {
    name: 'combat:reflect-aim', order: 32.5, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, 5);
      await t.frames(5);
      // §12 combat 4: the cursor points at a second rat; a parried bolt flies at it (±25° of the aim), not the shooter
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, S = g.__combatSpawn, p = ctx.player;
        const shooter = S('rat_xbow', 0.0, 7, { passive: true });
        const mark = S('rat_pike', -0.65, 5, { passive: true });   // 37° off the bolt: guarded by a cursor-facing Stand, outside the shooter's 25°
        return { shooter: shooter.id, mark: mark.id, mx: mark.pos.x, mz: mark.pos.z, my: mark.pos.y };
      });
      await t.frames(3);
      await t.aimAt(r.mx, r.mz);
      await t.frames(2);
      await t.G(([guardSrc, ids]) => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, THREE = g.THREE, p = ctx.player;
        const guard = new Function(`return (${guardSrc})`)();
        const rat = ctx.actors.list.find((a) => a.id === ids.shooter);
        const from = new THREE.Vector3(rat.pos.x, rat.pos.y + rat.height * 0.6, rat.pos.z);
        const dir = new THREE.Vector3(p.pos.x - from.x, p.pos.y + p.height * 0.55 - from.y, p.pos.z - from.z);
        const bolt = ctx.combat.spawnProjectile(ctx.config.ATTACKS.rat_bolt, rat, from, dir);
        const st = g.__ra = { pressed: false, reflected: null, frozen: false };
        st.off = ctx.bus.on(E.REFLECT, (e) => { st.proj = e.projectile; st.reflected = { homing: e.projectile.homing?.id ?? null, vx: e.projectile.vel.x, vz: e.projectile.vel.z }; });
        st.offH = ctx.game.addFrameHook(() => {
          if (!st.reflected) ctx.input.pointer.lastMoveT = performance.now();   // she keeps the mouse on the mark
          if (!bolt.alive) return;
          const d = Math.hypot(bolt.pos.x - p.pos.x, bolt.pos.z - p.pos.z);
          if (st.reflected && !st.frozen && bolt.reflected && d >= 1.8) { st.frozen = true; ctx.game.setTimeScale(0); }
          if (st.pressed) return;
          if ((d - p.radius - bolt.r) / bolt.speed <= 0.07) { st.pressed = true; guard(400); }
        });
        return true;
      }, [guardFor.toString(), r]);
      const ok = await t.waitForEvent('combat:reflect', 6000);
      try { await t.page.waitForFunction(() => window.__GAME__.__ra.frozen, null, { timeout: 4000, polling: 'raf' }); } catch { t.warn('reflect-aim: never froze for the shot'); }
      await t.frames(2);
      await t.shot('combat/reflect-aim');
      await t.G(() => window.__GAME__.ctx.game.setTimeScale(1));
      await t.wait(1400);
      const s = await t.G((ids) => {
        const g = window.__GAME__, ctx = g.ctx, st = g.__ra;
        st.off(); st.offH();
        const alive = (id) => ctx.actors.list.find((a) => a.id === id)?.alive ?? false;
        return { reflected: st.reflected, pressed: st.pressed, markHit: ctx.combat.log.find((e) => e.targetId === ids.mark && e.attackId === 'rat_bolt') ?? null,
          shooterAlive: alive(ids.shooter), markAlive: alive(ids.mark),
          end: st.proj ? { reason: st.proj.endReason, pos: st.proj.pos.toArray().map((v) => +v.toFixed(2)) } : null,
          markPos: (() => { const m = ctx.actors.list.find((a) => a.id === ids.mark); return m ? m.pos.toArray().map((v) => +v.toFixed(2)) : null; })(),
          log: ctx.combat.log.slice(-4).map((e) => `${e.attackId}:${e.result}:${e.targetId}`) };
      }, r);
      t.log(`reflect-aim: ${JSON.stringify(s.reflected)}; mark hit ${JSON.stringify(s.markHit)}; shooter alive ${s.shooterAlive}; bolt end ${JSON.stringify(s.end)} mark at ${JSON.stringify(s.markPos)}; log ${s.log.join(' ')}`);
      t.assert(ok && !!s.reflected, `bolt reflected (guard pressed=${s.pressed})`);
      if (s.reflected) t.assert(s.reflected.homing === r.mark, `the reflect flies at the rat under the cursor (homing ${s.reflected.homing}, mark ${r.mark})`);
      t.assert(s.markHit?.damage === 25, `the marked rat takes the 25 reflect (${JSON.stringify(s.markHit)})`);
      t.assert(s.shooterAlive, 'the shooter is spared (the aim chose the other rat)');
    },
  },
  {
    name: 'combat:touch', order: 37, level: null, timeout: 400000,
    async run(t) {
      const DIR = 'combat';
      // one orientation per browser context; a context whose GPU process crashes under machine load is retried once
      const todo = [[390, 844, 'portrait', 0], [844, 390, 'landscape', 0]];
      for (let k = 0; k < todo.length; k++) {
        const [w, h, tag, retry] = todo[k];
        let crashed = false;
        const errors = [];
        const ctxM = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const pg = await ctxM.newPage();
        pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
        const G = async (fn, arg) => { const hd = await pg.evaluateHandle(fn, arg); try { return await hd.evaluate((x) => (window.__GAME__?.plain ? window.__GAME__.plain(x) : x)); } finally { hd.dispose().catch(() => {}); } };
        const mshot = async (name) => { try { await pg.screenshot({ path: path.join(t.shotsDir, DIR, `${name}.png`) }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); } };
        const untilM = async (fn, arg, ms = 8000) => { const t0 = Date.now(); let v = await G(fn, arg); while (!v && Date.now() - t0 < ms) { await pg.waitForTimeout(120); v = await G(fn, arg); } return v; };
        try {
          await pg.goto(`${t.base}?test=1&seed=1`, { timeout: 200000, waitUntil: 'domcontentloaded' });
          await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 200000 });
          await G(async () => {
            const g = window.__GAME__, c = g.ctx;
            g.story.skip?.(); g.setMode('play');
            for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
            await g.loadLevel('meadow', 'start');
            return true;
          });
          await pg.waitForTimeout(600);
          await pg.touchscreen.tap(Math.round(w * 0.6), Math.round(h * 0.4));      // first touch: device 'touch'
          await G(() => {
            const g = window.__GAME__, c = g.ctx, p = c.player;
            g.story.skip?.(); g.setMode('play'); g.god(true); c.ui.touch.enable(true);
            c.state.settings.parryRing = 'auto'; c.state.settings.autoRiposte = 'auto';
            // a clear patch of meadow ahead of the spawn (away from the fence rail)
            const f = p.facing, x = p.pos.x + Math.sin(f) * 5, z = p.pos.z + Math.cos(f) * 5;
            p.teleport({ pos: new g.THREE.Vector3(x, c.physics.heightAt(x, z), z), facing: f });
          });
          await pg.waitForTimeout(700);
          const dev = await G(() => window.__GAME__.ctx.input.device);
          t.assert(dev === 'touch', `${tag}: device touch (${dev})`);
          const btn = (a) => G((x) => { const e = document.querySelector(`.tbtn[data-action="${x}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; }, a);
          // ---- 1) ⚔ with the stick idle: 360° auto-target within 4.5 m, the magnet turns her and the lunge closes in
          const r1 = await G(() => {
            const g = window.__GAME__, c = g.ctx, p = c.player;
            // TT3 K triage: the meadow's own rats can wander in by now (the landscape run starts later): only the test rat
            for (const e of [...c.enemies.list]) c.enemies.despawn(e);
            c.cam.select?.(null); p.orders?.clear?.('smoke'); p.setState?.('move');
            c.combat.log.length = 0;
            const a = p.facing + 2.2, x = p.pos.x + Math.sin(a) * 3.6, z = p.pos.z + Math.cos(a) * 3.6;
            const e = c.enemies.spawn('rat_pike', new g.THREE.Vector3(x, c.physics.heightAt(x, z), z), { facing: a + Math.PI });
            e.ai = false; e.hp = e.maxHp = 100;
            window.__tRat = e;
            return { id: e.id, d0: Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z), p0: [p.pos.x, p.pos.z], dir: [(e.pos.x - p.pos.x) / 3.6, (e.pos.z - p.pos.z) / 3.6] };
          });
          await pg.waitForTimeout(400);
          const [ax, ay, aw] = await btn('attack');
          t.assert(aw >= 56, `${tag}: ⚔ ≥ 56 px (${aw})`);
          for (let i = 0; i < 3; i++) { await pg.touchscreen.tap(Math.round(ax), Math.round(ay)); await pg.waitForTimeout(260); }
          await mshot(`touch-${tag}-01-autotarget`);
          await pg.waitForTimeout(500);
          const s1 = await G((r) => {
            const c = window.__GAME__.ctx, p = c.player, e = window.__tRat;
            return { hits: c.combat.log.filter((x) => x.targetId === r.id && x.result === 'hit').map((x) => x.attackId), d1: Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z),
              moved: (p.pos.x - r.p0[0]) * r.dir[0] + (p.pos.z - r.p0[1]) * r.dir[1], swings: c.combat.stats.swings };
          }, r1);
          t.log(`${tag}: ⚔ auto-target: hits ${s1.hits.join(', ') || 'none'}, she moved ${s1.moved.toFixed(2)} m toward it, distance ${r1.d0.toFixed(2)} → ${s1.d1.toFixed(2)} m (knockback)`);
          t.assert(s1.hits.length >= 1, `${tag}: ⚔ with an idle stick hits the rat 3.6 m away off her side (360° auto-target + lunge)`);
          t.assert(s1.moved > 1.0, `${tag}: lunge magnetism carried her toward it (${s1.moved.toFixed(2)} m)`);
          await G(() => { const c = window.__GAME__.ctx; c.enemies.despawn(window.__tRat); });
          // ---- 2) the parry ring (auto = on for touch) + 🛡 from the touch button just before the strike → parry
          let parried = false;
          for (let attempt = 0; attempt < 3 && !parried; attempt++) {
            await G(() => {
              const g = window.__GAME__, c = g.ctx, E = g.E, p = c.player;
              for (const e of [...c.enemies.list]) c.enemies.despawn(e);
              g.clearEvents();
              const a = p.facing + 0.6, x = p.pos.x + Math.sin(a) * 1.8, z = p.pos.z + Math.cos(a) * 1.8;
              const rat = c.enemies.spawn('rat_pike', new g.THREE.Vector3(x, c.physics.heightAt(x, z), z), { facing: a + Math.PI });
              const el = document.querySelector('.tbtn[data-action="guard"]');
              const rc = el.getBoundingClientRect(), cx = rc.x + rc.width / 2, cy = rc.y + rc.height / 2;
              const ev = (tp) => el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: 61, clientX: cx, clientY: cy, pointerType: 'touch' }));
              const st = window.__tp = { rat: rat.id, ring: null, pressed: false, parry: null, shot: false };
              st.offP = c.bus.on(E.PLAYER_PARRY, (e) => { st.parry = { attacker: e.attacker?.id, gold: e.gold }; });
              st.off = c.game.addFrameHook(() => {
                const nx = c.combat.nextParryable(p, 6);
                if (!nx || nx.attacker !== rat) return;
                const left = nx.activeAt - c.game.time;
                if (!st.ring && left <= 0.32) { st.ring = { left, window: nx.window }; c.game.setTimeScale(0); st.shot = true; }
                if (!st.pressed && left <= 0.10 && st.go) {
                  st.pressed = true; ev('pointerdown');
                  setTimeout(() => ev('pointerup'), 450);
                }
              });
              return true;
            });
            const froze = await untilM(() => window.__tp.shot, null, 12000);
            if (froze) { await pg.waitForTimeout(80); if (attempt === 0) await mshot(`touch-${tag}-02-parry-ring`); }
            await G(() => { window.__tp.go = true; window.__GAME__.ctx.game.setTimeScale(1); });
            await untilM(() => !!window.__tp.parry, null, 3000);
            await pg.waitForTimeout(150);
            if (attempt === 0) await mshot(`touch-${tag}-03-parry`);
            const st = await G(() => { const s = window.__tp; s.off(); s.offP(); return { ring: s.ring, pressed: s.pressed, parry: s.parry, rat: s.rat }; });
            parried = !!st.parry && st.parry.attacker === st.rat;
            t.log(`${tag}: parry attempt ${attempt + 1}: ring ${JSON.stringify(st.ring)}, 🛡 pressed ${st.pressed}, parry ${JSON.stringify(st.parry)}`);
            if (attempt === 0) t.assert(!!st.ring, `${tag}: nextParryable tracked the pikeman's strike (parry ring data)`);
            await pg.waitForTimeout(700);
          }
          t.assert(parried, `${tag}: 🛡 pressed on the ring's cue parries the pikeman (touch arc ±90°, auto-face)`);
          // Auto-Riposte (auto = on for touch) follows a melee parry within 4 m
          const rip = await untilM(() => window.__GAME__.ctx.combat.log.some((e) => e.attackId === 'riposte'), null, 2500);
          if (!rip) t.warn(`${tag}: no Auto-Riposte after the touch parry (player area)`);
          await mshot(`touch-${tag}-04-end`);
          await G(() => { const c = window.__GAME__.ctx; for (const e of [...c.enemies.list]) c.enemies.despawn(e); });
        } catch (e) {
          crashed = /crash/i.test(String(e?.message ?? e));
          if (crashed && !retry) { t.warn(`${tag}: the page crashed (${String(e?.message ?? e).split('\n')[0]}); retrying once`); todo.push([w, h, tag, 1]); }
          else t.fail(`${tag}: ${e?.message ?? e}`);
        } finally { await pg.close().catch(() => {}); await ctxM.close().catch(() => {}); }
        if (!crashed || retry) for (const e of errors) t.fail(`${tag} page: ${e}`);
      }
    },
  },
];
