// tests/smoke/physics.mjs  (owner: physics) — collision in the running game (GAME_DESIGN §19.2 physics, tech.md §5):
// feet on the real level heightfield, a soak of synthetic actors over the level's props (no NaN, never under the
// ground, never inside a prop, cheap), the real player against a prop wall and an Octree course (stairs, landing,
// ramp), a fall and landing, actor separation, level bounds, the Old Bridge, a 60° terrain bank (no bunny-hopping up
// it; steering into it still slides her down), rays. Screenshots → tests/shots/physics/*.png
import fs from 'node:fs';
import path from 'node:path';

const shotDir = (t) => fs.mkdirSync(path.join(t.shotsDir, 'physics'), { recursive: true });
const shot = (t, name) => t.shot(`physics/${name}`);
const fmt = (a) => a.map((v) => v.toFixed(2)).join(', ');

/** Player + ground summary computed in the page. */
const ground = (t) => t.G(() => {
  const g = window.__GAME__, ph = g.ctx.physics, p = g.ctx.player;
  return { pos: p.pos.toArray(), onGround: p.onGround, kind: p.groundKind ?? null, terrain: ph.heightAt(p.pos.x, p.pos.z),
    top: ph.topAt ? ph.topAt(p.pos.x, p.pos.z) : ph.heightAt(p.pos.x, p.pos.z), radius: p.radius, height: p.height,
    hasLevel: !!ph.level, hf: !!ph.heightfield, statics: ph.statics.count, tris: ph.mesh?.triangles?.length ?? 0,
    bounds: ph.bounds ? [ph.bounds.min.x, ph.bounds.min.y, ph.bounds.max.x, ph.bounds.max.y] : null };
});

/** Horizontal camera forward (what W walks along). */
const camForward = (t) => t.G(() => {
  const c = window.__GAME__.ctx.camera, d = new window.__GAME__.THREE.Vector3();
  c.getWorldDirection(d); d.y = 0; d.normalize();
  return [d.x, d.z];
});

/** Record the player every rendered frame (sim time, feet, ground state) until recStop. */
const recStart = (t) => t.G(() => {
  const g = window.__GAME__, p = g.ctx.player, out = [];
  window.__PHYS_REC__?.off?.();
  const off = g.game.addFrameHook(() => { out.push({ t: g.game.time, pos: p.pos.toArray(), onGround: p.onGround, kind: p.groundKind ?? null, sl: !!p.sliding }); });
  window.__PHYS_REC__ = { out, off };
  return true;
});
/** Stop recording; returns the samples (plain JSON straight from page.evaluate: no 200-item cap). */
const recStop = (t) => t.page.evaluate(() => { const r = window.__PHYS_REC__; r?.off?.(); window.__PHYS_REC__ = null; return r ? r.out : []; });

/**
 * Hold W until she is `until` metres along `f` from `o` ([x, y, z]), or `simMax` seconds of game time passed (so a
 * slow, busy machine walks the same distance), or `realMax` ms of wall clock.
 */
async function walkAlong(t, o, f, until, simMax, realMax = 40000) {
  const t0 = await t.G(() => window.__GAME__.game.time);
  await t.page.keyboard.down('KeyW');
  try {
    await t.page.waitForFunction(([o, f, until, simMax, t0]) => {
      const g = window.__GAME__, p = g.ctx.player.pos;
      return (p.x - o[0]) * f[0] + (p.z - o[2]) * f[1] > until || g.game.time - t0 > simMax;
    }, [o, f, until, simMax, t0], { timeout: realMax, polling: 30 });
  } catch { /* wall-clock cap: the assertions report how far she got */ }
  finally { await t.page.keyboard.up('KeyW'); }
}

/** Wait until `sec` of game time passed. */
const simWait = async (t, sec) => {
  const t0 = await t.G(() => window.__GAME__.game.time);
  await t.page.waitForFunction(([t0, sec]) => window.__GAME__.game.time - t0 >= sec, [t0, sec], { timeout: 60000, polling: 30 });
};

export default [
  {
    name: 'physics:ground', order: 30, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.frames(20);
      const s = await ground(t);
      t.assert(s.hasLevel && s.hf, 'physics has no level / heightfield after loadLevel(meadow)');
      t.assert(s.statics > 0, `meadow registered no static colliders (${s.statics})`);
      t.assert(s.onGround, 'player not on the ground at the start spawn');
      t.assert(Math.abs(s.pos[1] - s.top) < 0.03, `feet ${s.pos[1].toFixed(3)} vs ground ${s.top.toFixed(3)} (terrain ${s.terrain.toFixed(3)})`);
      // rays: straight down onto the terrain under her, and the camera's spring-arm sphere cast
      const r = await t.G(() => {
        const g = window.__GAME__, T = g.THREE, ph = g.ctx.physics, p = g.ctx.player.pos;
        const down = ph.raycast(new T.Ray(new T.Vector3(p.x + 0.7, p.y + 20, p.z), new T.Vector3(0, -1, 0)), 60);
        const want = ph.heightAt(p.x + 0.7, p.z);
        const dn = down ? { kind: down.kind, y: down.point.y, ny: down.normal.y } : null;
        const cam = g.ctx.camera.position, dir = new T.Vector3().subVectors(cam, p).normalize();
        const sc = ph.sphereCast(new T.Ray(new T.Vector3(p.x, p.y + 0.6, p.z), dir), 0.2, 30);
        return { dn, want, sc: sc ? sc.distance : null, los: ph.lineOfSight(new T.Vector3(p.x, p.y + 0.6, p.z), new T.Vector3(p.x, p.y + 30, p.z)) };
      });
      t.assert(r.dn && r.dn.kind === 'terrain' && Math.abs(r.dn.y - r.want) < 1e-3 && r.dn.ny > 0.5, `down ray ${JSON.stringify(r.dn)} vs terrain ${r.want.toFixed(3)}`);
      t.assert(r.los === true, 'line of sight straight up is blocked');
      // the collider overlay over the real level (trees and rocks in yellow, actors as green cylinders)
      await t.G(() => window.__GAME__.ctx.physics.setDebug(true));
      await t.frames(3);
      await shot(t, 'colliders');
      await t.G(() => window.__GAME__.ctx.physics.setDebug(false));
      t.log(`feet ${fmt(s.pos)} ground ${s.top.toFixed(3)} · ${s.statics} props, ${s.tris} architecture tris · bounds ${s.bounds?.map((v) => v.toFixed(0)).join(',')}`);
    },
  },
  {
    name: 'physics:soak', order: 31, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      // 32 synthetic actors run 10 s of fixed steps over the real meadow data (terrain + props), steering into the
      // nearest props, jumping now and then, shoving each other. Invariants are checked every step.
      const res = await t.G(() => {
        const g = window.__GAME__, T = g.THREE, ph = g.ctx.physics, P = g.ctx.player.pos;
        const recs = ph.statics.records.filter((r) => r.kind !== 2 && Math.hypot(r.cx - P.x, r.cz - P.z) < 60).slice(0, 24);
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const list = [];
        for (let i = 0; i < 32; i++) {
          const rec = recs[i % Math.max(1, recs.length)];
          const cx = rec ? rec.cx : P.x + (rnd() - 0.5) * 30, cz = rec ? rec.cz : P.z + (rnd() - 0.5) * 30;
          const an = rnd() * Math.PI * 2, d = (rec ? Math.max(rec.r, rec.hx, rec.hz) : 0) + 1.5 + rnd() * 2;
          const x = cx + Math.sin(an) * d, z = cz + Math.cos(an) * d;
          const r = i % 4 === 0 ? 0.45 : 0.32, h = i % 4 === 0 ? 1.3 : 1.0;
          list.push({ id: 900000 + i, pos: new T.Vector3(x, ph.heightAt(x, z) + 0.5, z), prevPos: new T.Vector3(), vel: new T.Vector3(),
            radius: r, height: h, mass: i % 4 === 0 ? 2 : 1, onGround: false, alive: true, faction: 'enemy', tx: cx, tz: cz });
        }
        const realCtx = ph.ctx;
        ph.ctx = { ...realCtx, actors: { list } };                      // separate only the synthetic crowd
        const bad = { nan: 0, under: 0, inside: 0, out: 0 };
        let worst = '', steps = 0, grounded = 0, collided = 0;
        const t0 = performance.now();
        try {
          for (let s = 0; s < 600; s++) {
            for (const a of list) {
              a.prevPos.copy(a.pos);
              const dx = a.tx - a.pos.x, dz = a.tz - a.pos.z, dl = Math.hypot(dx, dz) || 1, sp = 3 + (a.id % 3) * 2.2;
              const wob = Math.sin(s * 0.05 + a.id) * 0.6;
              a.vel.x = (dx / dl) * sp + Math.cos(s * 0.03 + a.id) * wob * sp; a.vel.z = (dz / dl) * sp + Math.sin(s * 0.03 + a.id) * wob * sp;
              if (a.onGround && (s + a.id) % 97 === 0) { a.vel.y = 7.4; a.onGround = false; }
              ph.moveActor(a, 1 / 60);
              if (a.wallHit) collided++;
              if (a.onGround) grounded++;
            }
            ph.separateActors();
            for (const a of list) {
              steps++;
              const p = a.pos;
              if (!Number.isFinite(p.x + p.y + p.z)) { bad.nan++; continue; }
              const gy = ph.heightAt(p.x, p.z);
              if (p.y < gy - 1e-3) { bad.under++; worst ||= `under ${a.id} y ${p.y.toFixed(3)} < ${gy.toFixed(3)}`; }
              const hit = ph.statics.overlaps(p.x, p.z, a.radius - 0.05, p.y + 0.31, p.y + a.height - 0.05, a, true);
              if (hit) { bad.inside++; worst ||= `inside ${a.id} at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`; }
              if (!ph.inBounds(p.x, p.z, a.radius - 1e-3)) bad.out++;
            }
          }
        } finally { ph.ctx = realCtx; }
        const ms = performance.now() - t0;
        return { props: recs.length, steps, ms, perActorStepUs: (ms * 1000) / steps, bad, worst, grounded: grounded / steps, collided };
      });
      t.assert(res.props > 4, `too few props near the spawn to soak against (${res.props})`);
      t.assert(res.bad.nan === 0, `${res.bad.nan} NaN positions`);
      t.assert(res.bad.under === 0, `${res.bad.under} actor-steps under the terrain (${res.worst})`);
      t.assert(res.bad.inside === 0, `${res.bad.inside} actor-steps inside a prop (${res.worst})`);
      t.assert(res.bad.out === 0, `${res.bad.out} actor-steps outside the bounds`);
      t.assert(res.collided > 100, `the crowd barely touched a prop (${res.collided} wall contacts): the soak is not testing much`);
      t.assert(res.perActorStepUs < 600, `moveActor + separation ${res.perActorStepUs.toFixed(1)} µs per actor-step`);
      if (res.perActorStepUs > 150) t.warn(`soak: ${res.perActorStepUs.toFixed(1)} µs per actor-step (≈10 when the machine is idle)`);
      t.log(`soak: 32 actors × 600 steps around ${res.props} props in ${res.ms.toFixed(0)} ms (${res.perActorStepUs.toFixed(1)} µs/actor-step), ${res.collided} wall contacts, grounded ${(res.grounded * 100).toFixed(0)}%`);
    },
  },
  {
    name: 'physics:wall', order: 32, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await t.frames(10);
      const f = await camForward(t);
      // a 4 m × 1.2 m fence (static box collider + a visible plank) 2.5 m ahead, across her path
      const w = await t.G((fw) => {
        const g = window.__GAME__, T = g.THREE, ph = g.ctx.physics, p = g.ctx.player.pos;
        const cx = p.x + fw[0] * 2.5, cz = p.z + fw[1] * 2.5, yaw = Math.atan2(fw[0], fw[1]), gy = ph.heightAt(cx, cz);
        const col = { x: cx, z: cz, hx: 2, hz: 0.15, yaw, y0: gy - 1, y1: gy + 1.2 };
        ph.addCollider(col);
        const m = new T.Mesh(new T.BoxGeometry(4, 1.2, 0.3), new T.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 }));
        m.position.set(cx, gy + 0.6, cz); m.rotation.y = yaw; m.castShadow = true; m.receiveShadow = true; m.name = 'physics:test-fence';
        g.ctx.scene.add(m);
        window.__PHYS_TEST__ = { col, mesh: m };
        return { c: [cx, gy, cz] };
      }, f);
      await t.frames(2);
      await recStart(t);
      await walkAlong(t, w.c, f, 5, 1.6);
      const samples = await recStop(t);
      const s = await ground(t);
      const end = s.pos;
      const d = (end[0] - w.c[0]) * f[0] + (end[2] - w.c[2]) * f[1];          // signed distance past the fence centre
      const deepest = Math.max(...samples.map((q) => (q.pos[0] - w.c[0]) * f[0] + (q.pos[2] - w.c[2]) * f[1]));
      t.assert(deepest <= -(0.15 + s.radius) + 0.03, `pressed into the fence on some frame (${deepest.toFixed(3)} m past its centre)`);
      t.assert(d <= -(0.15 + s.radius) + 0.03, `walked into / through the fence (${d.toFixed(3)} m past its centre)`);
      t.assert(d > -1.2, `stopped too early (${d.toFixed(2)} m): did she walk at all?`);
      await shot(t, 'wall');
      // the collider (not something else) stopped her: remove it and she walks on
      await t.G(() => { const x = window.__PHYS_TEST__; window.__GAME__.ctx.physics.removeCollider(x.col); x.mesh.removeFromParent(); x.mesh.geometry.dispose(); x.mesh.material.dispose(); });
      await walkAlong(t, w.c, f, 1.5, 1.2);
      const e2 = (await ground(t)).pos, d2 = (e2[0] - w.c[0]) * f[0] + (e2[2] - w.c[2]) * f[1];
      t.assert(d2 > 0.5, `after removeCollider she should walk past the fence line (${d2.toFixed(2)})`);
      t.log(`fence: ${samples.length} frames, stopped ${(-d).toFixed(3)} m before its centre (≥ ${(0.15 + s.radius).toFixed(2)}), then walked ${d2.toFixed(2)} m past once removed`);
    },
  },
  {
    name: 'physics:course', order: 33, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await t.frames(10);
      const f = await camForward(t);
      // Octree architecture: 5 stairs (0.25 m rise) → 3 m landing at 1.25 m → 25° ramp back down, 3 m wide
      const c = await t.G((fw) => {
        const g = window.__GAME__, T = g.THREE, ph = g.ctx.physics, p = g.ctx.player.pos;
        const ox = p.x + fw[0] * 2.0, oz = p.z + fw[1] * 2.0, yaw = Math.atan2(fw[0], fw[1]);
        const base = Math.max(ph.heightAt(ox, oz), ph.heightAt(ox + fw[0] * 8, oz + fw[1] * 8)) - 0.02;
        const grp = new T.Group(); grp.name = 'physics:test-course';
        const stone = new T.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95 });
        const box = (w, h, d, x, y, z, rx = 0) => {
          const m = new T.Mesh(new T.BoxGeometry(w, h, d), stone); m.position.set(x, y, z); m.rotation.x = rx;
          m.castShadow = true; m.receiveShadow = true; grp.add(m); return m;
        };
        const rise = 0.25, tread = 0.45, n = 5, top = rise * n, land0 = tread * n, land1 = land0 + 3;
        for (let i = 0; i < n; i++) box(3, rise * (i + 1) + 1, tread, 0, (rise * (i + 1) - 1) / 2, tread * (i + 0.5));
        box(3, top + 1, 3, 0, (top - 1) / 2, land0 + 1.5);
        const a = 25 * Math.PI / 180, L = top / Math.sin(a);
        const slab = box(3, 0.4, L, 0, 0, 0, a);                                // top face falls from the landing edge
        slab.position.set(0, top / 2 - Math.cos(a) * 0.2, land1 + Math.cos(a) * L / 2 - Math.sin(a) * 0.2);
        grp.position.set(ox, base, oz); grp.rotation.y = yaw;
        g.ctx.scene.add(grp);
        ph.addMesh(grp);
        window.__PHYS_TEST__ = { grp };
        return { o: [ox, base, oz], top, land0, land1, end: land1 + Math.cos(a) * L, tris: ph.mesh.triangles.length };
      }, f);
      t.assert(c.tris >= 7 * 12, `course not in the architecture octree (${c.tris} triangles)`);
      await t.frames(2);
      const along = (p) => (p[0] - c.o[0]) * f[0] + (p[2] - c.o[2]) * f[1];
      await recStart(t);
      await walkAlong(t, c.o, f, c.end + 1.5, 6);
      const samples = await recStop(t);
      t.assert(samples.length > 20, `only ${samples.length} frames recorded`);
      const onLanding = samples.filter((s) => { const u = along(s.pos); return u > c.land0 + 0.4 && u < c.land1 - 0.4; });
      const maxY = Math.max(...samples.map((s) => s.pos[1] - c.o[1]));
      const last = samples[samples.length - 1];
      t.assert(onLanding.length > 0, `never reached the landing (furthest ${Math.max(...samples.map((s) => along(s.pos))).toFixed(2)} m along the course)`);
      for (const s of onLanding) {
        if (Math.abs(s.pos[1] - c.o[1] - c.top) > 0.08) { t.fail(`on the landing at height ${(s.pos[1] - c.o[1]).toFixed(3)} (want ${c.top}); kind ${s.kind}`); break; }
      }
      t.assert(onLanding.some((s) => s.onGround && s.kind === 'mesh'), 'not grounded on the architecture (groundKind mesh) while on the landing');
      t.assert(maxY < c.top + 0.6, `bounced/launched above the course (${maxY.toFixed(2)})`);
      t.assert(along(last.pos) > c.end, `stuck on the course at ${along(last.pos).toFixed(2)} m (ramp ${c.land1}..${c.end.toFixed(2)})`);
      // every frame on the course: feet never inside a step, the landing or the ramp (a few cm of capsule rim allowed)
      let sunk = 0, sunkAt = '';
      for (const s of samples) {
        const u = along(s.pos), y = s.pos[1] - c.o[1];
        if (u <= 0.35 || u >= c.end) continue;
        const surf = u < c.land0 ? 0.25 * Math.min(5, Math.floor(u / 0.45) + 1) : u < c.land1 ? c.top : c.top - (u - c.land1) * Math.tan(25 * Math.PI / 180);
        const slack = u < c.land0 ? 0.25 + 0.05 : 0.06;                     // on the stairs: at most one riser below the tread ahead
        if (y < surf - slack) { sunk++; sunkAt ||= `u ${u.toFixed(2)} y ${y.toFixed(3)} surface ${surf.toFixed(2)}`; }
      }
      t.assert(sunk === 0, `${sunk} frames with her feet inside the course (${sunkAt})`);
      const airborne = samples.filter((s) => { const u = along(s.pos); return u > 0.3 && u < c.end - 0.5 && !s.onGround; }).length;
      if (airborne > 3) t.warn(`airborne on ${airborne}/${samples.length} frames on the course`);
      // a still: on the stairs, facing up them, with the collider overlay (architecture in cyan)
      await t.G(([c, f]) => {
        const g = window.__GAME__, T = g.THREE, u = 1.1;
        g.ctx.player.teleport({ pos: new T.Vector3(c.o[0] + f[0] * u, c.o[1] + 1.0, c.o[2] + f[1] * u), facing: Math.atan2(f[0], f[1]) });
      }, [c, f]);
      await simWait(t, 0.6);
      const still = await ground(t);
      t.assert(still.onGround && Math.abs(still.pos[1] - c.o[1] - 0.75) < 0.06, `standing on step 3: y +${(still.pos[1] - c.o[1]).toFixed(3)} (want +0.75), onGround ${still.onGround}`);
      await t.G(() => window.__GAME__.ctx.physics.setDebug(true));
      await t.frames(3);
      await shot(t, 'course');
      await t.G(() => window.__GAME__.ctx.physics.setDebug(false));
      await t.G(() => { const x = window.__PHYS_TEST__; const ph = window.__GAME__.ctx.physics; ph.removeMesh(x.grp); x.grp.removeFromParent(); x.grp.traverse((o) => o.geometry?.dispose()); });
      const tris = await t.G(() => window.__GAME__.ctx.physics.mesh.triangles.length);
      t.assert(tris === c.tris - 7 * 12, `removeMesh left ${tris} triangles`);
      t.log(`course: ${samples.length} frames, landing at +${c.top} m held (${onLanding.length} frames), max +${maxY.toFixed(2)} m, airborne ${airborne}, exit at ${along(last.pos).toFixed(1)} m`);
    },
  },
  {
    name: 'physics:fall', order: 34, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      const s0 = await ground(t);
      await t.clearEvents();
      await t.G((p) => window.__GAME__.teleport(p[0], p[1] + 8, p[2]), s0.pos);
      await t.frames(2);
      const mid = await ground(t);
      t.assert(!mid.onGround && mid.pos[1] > s0.pos[1] + 5, `teleported 8 m up but onGround=${mid.onGround} y=${mid.pos[1].toFixed(2)}`);
      const landed = await t.waitForEvent('player:land', 5000);
      await t.frames(10);
      const s = await ground(t);
      const ev = await t.lastEvent('player:land');
      t.assert(landed, 'no player:land after an 8 m drop');
      t.assert(s.onGround && Math.abs(s.pos[1] - s.top) < 0.03, `after the drop: onGround ${s.onGround}, feet ${s.pos[1].toFixed(3)} vs ground ${s.top.toFixed(3)}`);
      t.assert(ev && ev.impact > 9, `landing impact ${ev?.impact} (an 8 m drop is ≥ 12 m/s, capped by terminalFall 14)`);
      t.log(`drop 8 m → landed, impact ${ev?.impact?.toFixed?.(2)} m/s`);
    },
  },
  {
    name: 'physics:separation', order: 35, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await t.G(() => window.__GAME__.god(true));
      const sp = await t.G(() => {
        const g = window.__GAME__, p = g.ctx.player.pos, out = [];
        try { for (let i = 0; i < 3; i++) out.push(g.spawn('rat_pike', p.x + 0.05 * i, p.z + 0.04)); } catch (e) { return { err: String(e?.message ?? e) }; }
        return { n: out.filter(Boolean).length };
      });
      if (sp.err) { t.warn(`enemies.spawn failed (enemies area in progress?): ${sp.err} — separation is covered by physics:soak`); return; }
      await t.frames(30);
      const r = await t.G(() => {
        const g = window.__GAME__, list = g.ctx.actors.list.filter((a) => a.alive !== false && a.pos && a.radius > 0 && !a.ghost && !a.attachedTo && a.collideActors !== false);
        let worst = 0, pair = '';
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.fixed && b.fixed) continue;
          if (a.pos.y >= b.pos.y + (b.height ?? 1) || b.pos.y >= a.pos.y + (a.height ?? 1)) continue;
          const over = a.radius + b.radius - Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
          if (over > worst) { worst = over; pair = `${a.constructor?.name}#${a.id} / ${b.constructor?.name}#${b.id}`; }
        }
        return { n: list.length, worst, pair };
      });
      await shot(t, 'separation');
      t.assert(r.worst < 0.08, `actors overlap by ${r.worst.toFixed(3)} m (${r.pair})`);
      await t.G(() => { const g = window.__GAME__; for (const e of [...(g.ctx.enemies?.list ?? [])]) g.ctx.enemies.despawn?.(e); g.god(false); });
      t.log(`separation: ${r.n} solid actors, worst overlap ${r.worst.toFixed(3)} m`);
    },
  },
  {
    name: 'physics:bounds', order: 36, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await t.frames(5);
      const f = await camForward(t);
      const s0 = await ground(t);
      t.assert(!!s0.bounds, 'level has no bounds');
      const [minX, minZ, maxX, maxZ] = s0.bounds;
      // 3 m from the edge she is walking toward (along the dominant camera axis)
      const x = Math.abs(f[0]) > Math.abs(f[1]) ? (f[0] > 0 ? maxX - 3 : minX + 3) : s0.pos[0];
      const z = Math.abs(f[0]) > Math.abs(f[1]) ? s0.pos[2] : (f[1] > 0 ? maxZ - 3 : minZ + 3);
      await t.G((p) => { const g = window.__GAME__; g.teleport(p[0], g.ctx.physics.heightAt(p[0], p[1]) + 0.5, p[1]); }, [x, z]);
      await t.frames(20);
      await recStart(t);
      await walkAlong(t, [x, 0, z], f, 1e9, 2.5);
      const samples = await recStop(t);
      const r = s0.radius;
      const outside = samples.filter((s) => s.pos[0] < minX + r - 1e-3 || s.pos[0] > maxX - r + 1e-3 || s.pos[2] < minZ + r - 1e-3 || s.pos[2] > maxZ - r + 1e-3);
      const last = samples[samples.length - 1].pos;
      t.assert(outside.length === 0, `left the level bounds (${fmt(outside[0]?.pos ?? [])})`);
      const gap = Math.min(last[0] - minX, maxX - last[0], last[2] - minZ, maxZ - last[2]);
      t.assert(gap < 1.0, `never reached the edge (${gap.toFixed(2)} m from it): did she walk?`);
      await shot(t, 'bounds');
      t.log(`bounds: held ${gap.toFixed(3)} m inside the edge (radius ${r})`);
    },
  },
  {
    name: 'physics:bridge', order: 37, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      // the meadow's Old Bridge (world architecture in the Octree) over the deep stream at z ≈ 62
      const b = await t.G(() => {
        const g = window.__GAME__, L = g.ctx.levels.current, a = L?.anchor?.('bridge_mid') ?? L?.anchors?.bridge_mid ?? null;
        return a ? { x: a.pos.x, y: a.pos.y, z: a.pos.z, tris: g.ctx.physics.mesh.triangles.length } : null;
      });
      if (!b) { t.warn('meadow has no bridge_mid anchor yet (world in progress): skipped'); return; }
      t.assert(b.tris > 0, 'the Old Bridge is not in the architecture octree');
      // a synthetic walker crosses it south → north (pure physics, independent of the player controller)
      const r = await t.G((b) => {
        const g = window.__GAME__, T = g.THREE, ph = g.ctx.physics;
        const a = { id: 990001, pos: new T.Vector3(b.x, 0, b.z - 9), prevPos: new T.Vector3(), vel: new T.Vector3(), radius: 0.32, height: 1,
          mass: 1, onGround: false, alive: true, faction: 'player' };
        a.pos.y = ph.heightAt(a.pos.x, a.pos.z) + 0.2;
        const out = { deck: [], deep: 0, sunk: 0, under: 0, minZ: 1e9, maxZ: -1e9 };
        for (let i = 0; i < 300; i++) {
          a.prevPos.copy(a.pos); a.vel.x = (b.x - a.pos.x) * 2; a.vel.z = 4;
          ph.moveActor(a, 1 / 60);
          const p = a.pos;
          if (Math.abs(p.z - b.z) < 3.5) out.deck.push([+p.y.toFixed(3), a.onGround, a.groundKind]);
          if (ph.isDeepWater(p.x, p.z, p.y)) out.deep++;
          if (ph.mesh.penetrates(p.x, p.y, p.z, 0.27, 1, 0.03)) out.sunk++;
          if (p.y < ph.heightAt(p.x, p.z) - 1e-3) out.under++;
          if (p.z > b.z + 9) break;
        }
        out.endZ = a.pos.z;
        out.topDeck = ph.topAt(b.x, b.z); out.deepNoY = ph.isDeepWater(b.x, b.z); out.streamBeside = ph.isDeepWater(b.x + 4, b.z);
        return out;
      }, b);
      t.assert(r.endZ > b.z + 6, `could not cross the bridge (stopped at z ${r.endZ.toFixed(2)}; deck at z ${b.z})`);
      t.assert(r.deep === 0, `${r.deep} steps in deep water while crossing the bridge`);
      t.assert(r.sunk === 0 && r.under === 0, `inside the bridge mesh on ${r.sunk} steps, under the terrain on ${r.under}`);
      const off = r.deck.filter(([y, on, kind]) => !on || kind !== 'mesh' || Math.abs(y - b.y) > 0.25);
      t.assert(r.deck.length > 10 && off.length === 0, `on the deck: ${off.length}/${r.deck.length} steps off it (e.g. ${JSON.stringify(off[0])}, deck y ${b.y})`);
      t.assert(r.deepNoY === false && r.streamBeside === true, `isDeepWater without y: deck ${r.deepNoY} (want false), stream beside ${r.streamBeside} (want true)`);
      // the real player dropped onto the middle of the deck stays on it (no fall-through into the stream, no splash)
      await t.clearEvents();
      await t.G((b) => { const g = window.__GAME__; g.ctx.player.teleport({ pos: new g.THREE.Vector3(b.x, b.y + 1.5, b.z), facing: 0 }); }, b);
      await simWait(t, 1.0);
      const s = await ground(t);
      const burst = await t.lastEvent('fx:burst');
      t.assert(s.onGround && s.kind === 'mesh' && Math.abs(s.pos[1] - b.y) < 0.15 && Math.abs(s.pos[2] - b.z) < 1.5,
        `player on the deck: onGround ${s.onGround} kind ${s.kind} at ${fmt(s.pos)} (deck y ${b.y}, z ${b.z})`);
      t.assert(burst?.kind !== 'splash', 'the player splashed (deep water) standing on the bridge deck');
      await t.G(() => window.__GAME__.ctx.physics.setDebug(true));
      await t.frames(3);
      await shot(t, 'bridge');
      await t.G(() => window.__GAME__.ctx.physics.setDebug(false));
      t.log(`bridge: crossed (${r.deck.length} steps on the deck at y ${b.y}, ${b.tris} tris), player held at y ${s.pos[1].toFixed(3)}`);
    },
  },
  {
    name: 'physics:cliff', order: 38, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      // a 60° bank, 3.5 m tall, raised into a copy of the meadow heightfield 3 m ahead of her (physics + a matching
      // stone mesh); the real level data is untouched and restored afterwards
      await t.frames(10);
      const f = await camForward(t);
      const c = await t.G((fw) => {
        const g = window.__GAME__, T = g.THREE, ph = g.ctx.physics, p = g.ctx.player.pos, hf = ph.heightfield;
        const k = Math.tan(60 * Math.PI / 180), w = hf.res + 1, h = hf.h.slice(), changed = new Uint8Array(w * w);
        for (let iz = 0; iz < w; iz++) for (let ix = 0; ix < w; ix++) {
          const x = ix * hf.cell - hf.half, z = iz * hf.cell - hf.half;
          const u = (x - p.x) * fw[0] + (z - p.z) * fw[1], v = -(x - p.x) * fw[1] + (z - p.z) * fw[0];
          if (u > 3 && Math.abs(v) < 7) { h[iz * w + ix] += Math.min(3.5, (u - 3) * k) * Math.min(1, (7 - Math.abs(v)) / 1.5); changed[iz * w + ix] = 1; }
        }
        const bank = new hf.constructor(hf.size, hf.res, h);
        const geo = bank.toGeometry(), idx = geo.index.array, keep = [];
        for (let i = 0; i < idx.length; i += 3) if (changed[idx[i]] || changed[idx[i + 1]] || changed[idx[i + 2]]) keep.push(idx[i], idx[i + 1], idx[i + 2]);
        geo.setIndex(keep);
        const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.95, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        mesh.name = 'physics:test-bank'; mesh.receiveShadow = true; mesh.castShadow = true;
        g.ctx.scene.add(mesh);
        window.__PHYS_TEST__ = { orig: hf, bank, mesh };
        ph.heightfield = bank;
        // the grid samples the bank: depending on alignment, the triangles at its foot form small walkable ramps (up to
        // ~0.35 m on a 1 m grid) whose height varies along the bank; one jump from the top of those she can stand on is
        // the most she may gain (the same goes for its top edge). walkTop: the highest spot on the lower half of the
        // bank, within 0.8 m either side of her path (the slide follows the triangles' normals, so she drifts), where
        // her capsule fits — physics' walkable test under her feet and under its rim wherever the rim is above them;
        // steepA..steepB is the clearly-too-steep run on her path
        let walkTop = 0, steepA = -1, steepB = -1;
        const n = new T.Vector3(), r = g.ctx.player.radius ?? 0.32;
        for (let u = 0; u < 9; u += 0.02) {
          const x = p.x + fw[0] * u, z = p.z + fw[1] * u;
          const steep = bank.faceNormalAt(x, z, n).y < 0.65;
          if (steep) { if (steepA < 0) steepA = u; steepB = u; } else if (steepA >= 0) break;
        }
        const fits = (x, z) => {
          if (ph._terrainSteep(x, z)) return false;
          const y = bank.heightAt(x, z);
          for (let i = 0; i < 16; i++) {
            const qx = x + Math.cos(i * Math.PI / 8) * r, qz = z + Math.sin(i * Math.PI / 8) * r;
            if (bank.heightAt(qx, qz) - y > 0.05 && ph._terrainSteep(qx, qz)) return false;
          }
          return true;
        };
        for (let u = 0; u < steepA + (steepB - steepA) / 2; u += 0.02) for (let v = -0.8; v <= 0.801; v += 0.05) {
          const x = p.x + fw[0] * u - fw[1] * v, z = p.z + fw[1] * u + fw[0] * v;
          if (fits(x, z)) walkTop = Math.max(walkTop, bank.heightAt(x, z) - hf.heightAt(x, z));
        }
        return { o: [p.x, p.y, p.z], k, walkTop, steepA, steepB };
      }, f);
      const restore = () => t.G(() => {
        const x = window.__PHYS_TEST__, ph = window.__GAME__.ctx.physics;
        window.__GAME__.game.setTimeScale(1);
        if (!x) return;
        if (ph.heightfield === x.bank) ph.heightfield = x.orig;
        x.mesh.removeFromParent(); x.mesh.geometry.dispose(); x.mesh.material.dispose(); window.__PHYS_TEST__ = null;
      });
      try {
        await t.frames(2);
        const along = (q) => (q[0] - c.o[0]) * f[0] + (q[2] - c.o[2]) * f[1];
        const rise = (s) => t.page.evaluate((pts) => { const x = window.__PHYS_TEST__; return pts.map((q) => [q[1] - x.orig.heightAt(q[0], q[2]), q[1] - x.bank.heightAt(q[0], q[2])]); }, s.map((q) => q.pos));
        // 1. run at it, jumping (held 0.45 s, full height) whenever she can, for 3 s of game time
        await recStart(t);
        const t0 = await t.G(() => window.__GAME__.game.time);
        await t.page.keyboard.down('KeyW');
        try {
          for (let i = 0; i < 40 && (await t.G(() => window.__GAME__.game.time)) - t0 < 3; i++) {
            await t.page.keyboard.down('Space'); await t.wait(450); await t.page.keyboard.up('Space'); await t.wait(60);
          }
        } finally { await t.page.keyboard.up('KeyW'); await t.page.keyboard.up('Space'); }
        const hop = await recStop(t);
        const hr = await rise(hop);
        const maxRise = Math.max(...hr.map((r) => r[0])), under = hr.filter((r) => r[1] < -1e-3).length;
        const apex = 7.4 ** 2 / (2 * 22);
        t.assert(hop.length > 20 && Math.max(...hop.map((s) => along(s.pos))) > 1.5, `she never reached the bank (furthest ${Math.max(...hop.map((s) => along(s.pos))).toFixed(2)} m)`);
        // every take-off is from ground she stood on (never from a slide on the face), and that ground is no higher
        // than the walkable foot
        const stood = Math.max(0, ...hr.filter((r, i) => hop[i].onGround).map((r) => r[0]));
        t.assert(stood < c.walkTop + 0.05, `stood ${stood.toFixed(2)} m up the 60° bank (walkable foot ${c.walkTop.toFixed(2)})`);
        t.assert(maxRise < stood + apex + 0.15, `climbed the 60° bank by hopping: ${maxRise.toFixed(2)} m above the old ground (highest ground stood on ${stood.toFixed(2)} + one jump ${apex.toFixed(2)})`);
        t.assert(under === 0, `${under} frames with her feet under the bank`);
        // 2. put her high on the steep run and hold W into it: she still slides down to its foot
        t.assert(c.steepB - c.steepA > 1, `setup: steep run ${c.steepA.toFixed(2)}..${c.steepB.toFixed(2)} m`);
        await t.G(([c, f]) => {
          window.__GAME__.game.setTimeScale(0);
          const g = window.__GAME__, T = g.THREE, u = c.steepA + 0.7 * (c.steepB - c.steepA), x = c.o[0] + f[0] * u, z = c.o[2] + f[1] * u;
          g.ctx.player.teleport({ pos: new T.Vector3(x, window.__PHYS_TEST__.bank.heightAt(x, z) + 0.02, z), facing: Math.atan2(f[0], f[1]) });
        }, [c, f]);
        // a still of her on the bank (time frozen from the teleport on, so the recording below sees the whole slide;
        // the collider overlay draws her orange while she isn't grounded)
        await t.G(() => { const g = window.__GAME__; g.ctx.physics.setDebug(true); });
        try { await t.frames(3); await shot(t, 'cliff'); }
        finally { await t.G(() => window.__GAME__.ctx.physics.setDebug(false)); }
        await recStart(t);
        await t.G(() => window.__GAME__.game.setTimeScale(1));
        await walkAlong(t, c.o, f, 1e9, 2.0);
        const sl = await recStop(t);
        const sr = await rise(sl);
        const end = sr[sr.length - 1], last = sl[sl.length - 1];
        t.assert(sl.some((s) => s.sl), 'never flagged sliding on the 60° bank');
        t.assert(last.onGround && end[0] < c.walkTop + 0.05 && along(last.pos) < c.steepA + 0.3, `held on the bank while steering into it: ${end[0].toFixed(2)} m up at ${along(last.pos).toFixed(2)} m (walkable foot ${c.walkTop.toFixed(2)} m, steep from ${c.steepA.toFixed(2)} m)`);
        t.assert(sr.every((r) => r[1] > -1e-3), 'feet under the bank while sliding');
        t.log(`cliff: hopping topped out ${maxRise.toFixed(2)} m above the old ground (stood at most ${stood.toFixed(2)}, walkable foot ${c.walkTop.toFixed(2)}, jump ${apex.toFixed(2)}); from high on the bank she slid down to ${end[0].toFixed(2)} m in ${sl.findIndex((s) => s.onGround && !s.sl)} frames while steering into it`);
      } finally { await restore(); }
    },
  },
];
