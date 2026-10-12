// tests/smoke/camera.mjs  (owner: camera) — the iso play camera (research/CONTROLS_SPEC.md §2, §3): fixed yaw, distance /
// pitch / clamps, zoom, the picker round trip, selection without camera swings, boss fit, the 1.0 s hand-back, tree / house
// fades and the x-ray silhouette; Meme Cam (§7.8), every §5.2 preset incl. WHIP_FALL / PULLBACK / CRANE_DOWN rails, shake.
// (`?cam=classic`, the old orbit + spring arm, is covered by controls:classic.)
// Screenshots → tests/shots/camera/*.png
import fs from 'node:fs';
import path from 'node:path';

const MEME = { pos: [0.06, 0.68, 1.9], fov: 38 };

/** Camera summary computed in the page (small JSON). */
const camState = (t) => t.G(() => {
  const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, p = g.ctx.player;
  const pp = p.object3d.position, s = Math.sin(p.facing), co = Math.cos(p.facing);
  const dx = cam.position.x - pp.x, dz = cam.position.z - pp.z;
  return {
    mode: c.modeName, gameMode: g.mode, pos: cam.position.toArray(), fov: cam.fov, pivot: c.pivot.toArray(),
    dist: cam.position.distanceTo(c.pivot), distance: c.distance, yaw: c.yaw, pitch: c.pitch,
    local: [dx * co - dz * s, cam.position.y - pp.y, dx * s + dz * co],        // camera in her frame (+Z forward, +X left)
    player: pp.toArray(), facing: p.facing, ground: g.ctx.physics.heightAt(cam.position.x, cam.position.z),
    lock: c.lockTarget ? c.lockTarget.id : null, roll: c._outPose.roll, memeT: c.memeT, trauma: c.shaker.trauma,
    faded: c._fader.fadedCount, fadeUnits: c._fader.count, looping: !!c.memeLooping, shotT: c._cut.t,
  };
});

const fmt = (a) => a.map((v) => v.toFixed(2)).join(', ');
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function shotDir(t) { fs.mkdirSync(path.join(t.shotsDir, 'camera'), { recursive: true }); }

/**
 * Wait (game state, not wall clock: other agents load this machine) until `pred(cam)` holds in the page.
 * `pred` is a function source evaluated in the page with `c` = ctx.cam. Returns true / false (timeout).
 */
async function until(t, pred, timeout = 15000) {
  try {
    await t.page.waitForFunction((src) => { const c = window.__GAME__?.ctx?.cam; return !!c && new Function('c', `return (${src});`)(c); }, pred, { timeout, polling: 50 });
    return true;
  } catch { return false; }
}

/**
 * A phone session (Playwright hasTouch + isMobile context at w × h, DPR 2) booted into the meadow in play, with the
 * same API subset as the harness' t.viewport(..., { touch: true }) session: { page, G, frames, shot, touch, close }.
 * Own loader with long timeouts (t.viewport's page.goto gives up after 30 s; the dev server is slow under load).
 * Page errors / console errors are asserted at close().
 */
async function phoneSession(t, w, h, tag) {
  const context = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  const G = async (fn, arg) => { const hd = await page.evaluateHandle(fn, arg); try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); } };
  const s = {
    page, G, w, h,
    frames: (n = 1) => G((k) => window.__GAME__.waitFrames(k), n),
    async shot(name) { try { await page.screenshot({ path: path.join(t.shotsDir, `${name}.png`), timeout: 90000 }); } catch (e) { t.warn(`phone shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); } },
    touch: (type, x, y, id = 11) => G(([tp, px, py, pid]) => {
      const caps = (window.__ptrCap ??= {});
      const el = tp === 'pointerdown' ? (document.elementFromPoint(px, py)?.closest?.('.tbtn, .touch-root') ?? document.querySelector('.touch-root')) : (caps[pid] ?? document.querySelector('.touch-root'));
      if (!el) return null;
      if (tp === 'pointerdown') caps[pid] = el;
      el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: pid, clientX: px, clientY: py, pointerType: 'touch', isPrimary: pid === 11 }));
      if (tp === 'pointerup' || tp === 'pointercancel') delete caps[pid];
      return el.className;
    }, [type, x, y, id]),
    async close() {
      const own = errors.filter((e) => !/Material Name: fx\./.test(e));             // fx shaders: that area's own smoke
      t.assert(own.length === 0, `${tag}: page errors: ${own.slice(0, 3).map((e) => e.slice(0, 300)).join(' | ')}`);
      if (errors.length > own.length) t.warn(`${tag}: ${errors.length - own.length} shader errors from other areas (fx) ignored here`);
      await context.close().catch(() => {});
    },
  };
  try {
    await page.goto(`${t.base}?test=1&seed=1`, { timeout: 300000 });
    await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 300000 });
    await G(async () => {
      const g = window.__GAME__, c = g.ctx;
      g.story.skip?.(); g.setMode('play');
      for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
      await g.loadLevel('meadow', 'start');
      g.story.skip?.(); g.setMode('play');
    });
    return s;
  } catch (e) {
    t.log(`${tag}: phone session failed (${String(e?.message ?? e).split('\n')[0]})`);
    await context.close().catch(() => {});
    return null;
  }
}

export default [
  {
    name: 'camera:iso-follow', order: 40, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.frames(10);
      const a = await t.G(() => ({ iso: window.__GAME__.cam.iso(), mode: window.__GAME__.ctx.cam.modeName, near: window.__GAME__.ctx.camera.near, far: window.__GAME__.ctx.camera.far }));
      t.assert(a.mode === 'follow', `mode ${a.mode}`);
      t.assert(Math.abs(a.iso.yaw - Math.PI) < 1e-6, `fixed yaw π (${a.iso.yaw})`);
      t.assert(a.iso.dist >= 9 && a.iso.dist <= 18, `distance ${a.iso.dist.toFixed(2)} in [9, 18]`);
      t.assert(a.iso.pitch > 0.78 && a.iso.pitch < 1.03, `pitch ${(a.iso.pitch * 57.3).toFixed(1)}° in [46, 58]`);
      t.assert(Math.abs(a.near - 0.3) < 1e-6 && Math.abs(a.far - 90) < 1e-6, `near / far 0.3 / 90 (${a.near} / ${a.far})`);
      // walking (W = screen-up = +Z at yaw π): the focus follows her, the yaw never changes, the lens stays above ground
      const p0 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      await t.hold('KeyW', 900);
      await t.frames(20);
      const b = await t.G(() => { const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, p = g.ctx.player.pos; return { iso: g.cam.iso(), p: p.toArray(), cy: cam.position.y - g.ctx.physics.heightAt(cam.position.x, cam.position.z), fz: c.focus.z - p.z }; });
      t.assert(b.p[2] - p0[2] > 2, `W walks screen-up (+Z): Δz ${(b.p[2] - p0[2]).toFixed(2)}`);
      t.assert(Math.abs(b.iso.yaw - Math.PI) < 1e-6, 'the yaw never turns');
      t.assert(b.cy > 5, `lens well above the ground (${b.cy.toFixed(1)} m)`);
      t.assert(Math.abs(b.fz) < 3, `focus near her (Δz ${b.fz.toFixed(2)})`);
      await t.shot('camera/iso-follow');
      // screen ↔ ground round trip (the picker): a ground point 4 m ahead projects and un-projects to itself
      const rt = await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos, x = p.x + 1, z = p.z + 4; const s = g.screen(x, z); const w = g.ctx.cam.screenToGround(s.x, s.y); return [x, z, w.x, w.z]; });
      t.assert(Math.hypot(rt[0] - rt[2], rt[1] - rt[3]) < 0.15, `screenToGround round trip (${fmt(rt)})`);
      // teleport: the rig cuts (no sweep across the map)
      await t.G(() => { const g = window.__GAME__; g.teleport(-20, g.ctx.physics.heightAt(-20, 7), 7); });
      await t.frames(3);
      const c = await t.G(() => { const g = window.__GAME__, f = g.ctx.cam.focus, p = g.ctx.player.pos; return Math.hypot(f.x - p.x, f.z - p.z); });
      t.assert(c < 3, `teleport snaps the focus (${c.toFixed(2)} m)`);
      // zoom clamps 0.7–1.4 and the cat-size clamp
      const z = await t.G(async () => { const g = window.__GAME__; g.cam.zoom(9); await g.waitFrames(60); const hi = g.cam.iso(); g.cam.zoom(0.1); await g.waitFrames(60); const lo = g.cam.iso(); g.cam.zoom(1); await g.waitFrames(30); return [hi.dist, hi.catPx, lo.dist]; });
      t.assert(z[0] <= 18.1 && z[1] >= 29.5 && z[2] >= 8.99, `zoom: far ${z[0].toFixed(2)} m (${z[1].toFixed(1)} px), near ${z[2].toFixed(1)} m`);
      t.log(`iso: d ${a.iso.dist.toFixed(2)} pitch ${(a.iso.pitch * 57.3).toFixed(1)}° fov ${a.iso.fov} cat ${a.iso.catPx.toFixed(0)} px; zoom ${z.map((v) => v.toFixed(1))}`);
    },
  },
  {
    name: 'camera:select', order: 43, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.god(true); g.spawn('rat_pike', p.x + 2, p.z + 4); g.spawn('rat_pike', p.x - 3, p.z + 3); });
      await t.frames(20);
      const yaw0 = await t.G(() => window.__GAME__.ctx.cam.yaw);
      await t.tap('Tab');
      await t.frames(5);
      const a = await camState(t);
      t.assert(a.lock != null, 'Tab selects a hostile');
      t.assert(Math.abs(a.yaw - yaw0) < 1e-6, 'a selection never turns the camera (§7.4)');
      await t.shot('camera/select');
      await t.tap('Tab');
      await t.frames(5);
      const b = await camState(t);
      t.assert(b.lock != null && b.lock !== a.lock, 'Tab again cycles to the other one');
      // kill the selection: it hands over to the other engaged rat within 6 m, or clears
      await t.G(() => { const g = window.__GAME__, e = g.ctx.cam.lockTarget; e.alerted = true; g.ctx.combat.applyHit(g.ctx.player, e, { ...g.ctx.config.ATTACKS.slash3, dmg: 999 }); });
      await t.frames(30);
      const c = await camState(t);
      t.assert(c.lock !== b.lock, 'a dead selection does not stay selected');
      // walking 17 m away breaks it
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.teleport(p.x, g.ctx.physics.heightAt(p.x, p.z - 18), p.z - 18); });
      await t.frames(20);
      const d = await camState(t);
      t.assert(d.lock == null, 'the selection breaks beyond 16 m');
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
    },
  },
  {
    name: 'camera:boss-fit', order: 44.2, level: 'forest', spawn: 'boss', timeout: 480000,
    async run(t) {
      shotDir(t);
      // §2.4 boss framing (B1 forest mill, B2 gate causeway): both on screen, d in [14, 22], focus between them
      for (const L of [{ level: 'forest', id: 'B1' }, { level: 'gate', id: 'B2' }]) {
        // a fresh B2: an earlier block (world:line) may have left gate.line set, which starts Cacklejaw on arrival
        if (L.level === 'gate') await t.G(() => { const st = window.__GAME__.ctx.state; for (const k of ['gate.line', 'gate.boss']) st.setFlag(k, false); });
        if (L.level !== 'forest') await t.loadLevel(L.level, 'boss');
        await t.clearEvents();
        await t.G((lv) => {
          const g = window.__GAME__, c = g.ctx; g.god(true);
          if (lv === 'gate') c.state.setFlag('gate.line', true);   // B2's arena waits for The Line
          // an earlier block's fight may have saved the arena as cleared (restored on load): reopen it for this shot
          const a = c.levels.arenaNear(c.player.pos);
          if (a?.cleared) { a.cleared = false; a.locked = false; a.wave = 0; }
        }, L.level);
        await t.G(() => window.__GAME__.startBoss());
        let started = await t.waitForEvent('boss:start', 15000);
        if (!started) { await t.frames(30); await t.G(() => window.__GAME__.startBoss()); started = await t.waitForEvent('boss:start', 15000); }
        if (!started) t.log(JSON.stringify(await t.G(() => { const c = window.__GAME__.ctx, a = c.levels.arenaNear(c.player.pos); return { arena: a?.id, locked: a?.locked, cleared: a?.cleared, boss: c.enemies.boss?.def?.id ?? null, mode: c.game.mode, story: !!c.story?.isPlaying, list: c.enemies.list.map((e) => e.def?.id), pos: c.player.pos.toArray() }; })));
        t.assert(started, `${L.id}: startBoss() did not emit boss:start`);
        if (!started) continue;
        // placements around her (screen axes): the default 6.7 m diagonal, then 10.5 m straight down-screen (toward
        // the lens, the playtest failure: Cacklejaw under the ability bar), up-screen and to the side
        const r = await t.G(async () => {
          const g = window.__GAME__, ctx = g.ctx, b = ctx.enemies.boss, p = ctx.player, cam = ctx.camera;
          if (!b) return null;
          b.ai = false;
          const yaw = g.cam.iso().yaw, upX = -Math.sin(yaw), upZ = -Math.cos(yaw), rX = Math.cos(yaw), rZ = -Math.sin(yaw);
          const cv = ctx.renderer.domElement.getBoundingClientRect();
          const rectOf = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return q.height > 0 && getComputedStyle(e).display !== 'none' ? q : null; };
          const out = [];
          for (const [id, ax, ay] of [['diag', 0, 0], ['up', 0, 10.5], ['side', 10.5, 0], ['downSide', 7.4, -7.4], ['down', 0, -10.5]]) {
            let x, z;
            if (id === 'diag') { x = p.pos.x + 6; z = p.pos.z + 3; } else { x = p.pos.x + rX * ax + upX * ay; z = p.pos.z + rZ * ax + upZ * ay; }
            b.pos.set(x, ctx.physics.heightAt(x, z), z); b.object3d.position.copy(b.pos); b.vel?.set?.(0, 0, 0);
            await g.waitFrames(120);
            const bar = rectOf('.ability-bar.is-on'), plate = rectOf('.hud-boss.is-on');
            const top = plate ? plate.bottom - cv.top : 0, bottom = bar ? bar.top - cv.top : cv.height;
            // screen px (canvas) of feet / head (± footprint) for her and the boss
            const px = (o, h, dx = 0) => { const v = o.object3d.position.clone(); v.x += dx; v.y += h; v.project(cam); return [(v.x + 1) / 2 * cv.width, (1 - v.y) / 2 * cv.height]; };
            const span = (o, h, rr) => { const a = [px(o, 0, -rr), px(o, 0, rr), px(o, h), px(o, 0)]; return { minX: Math.min(...a.map((q) => q[0])), maxX: Math.max(...a.map((q) => q[0])), minY: Math.min(...a.map((q) => q[1])), maxY: Math.max(...a.map((q) => q[1])) }; };
            const bs = span(b, b.height ?? 1.6, b.radius ?? 1), hs = span(p, 1.0, 0.3);
            out.push({ id, top, bottom, w: cv.width, h: cv.height, boss: bs, her: hs, iso: g.cam.iso(), mode: ctx.cam.modeName, sep: Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) });
          }
          return out;
        });
        t.assert(!!r, `${L.id}: no boss`);
        if (!r) continue;
        for (const q of r) {
          const B = q.boss, Hh = q.her, f = (s) => `[${s.minX.toFixed(0)}..${s.maxX.toFixed(0)} × ${s.minY.toFixed(0)}..${s.maxY.toFixed(0)}]`;
          t.log(`${L.id} ${q.id} (${q.sep.toFixed(1)} m): safe y ${q.top.toFixed(0)}..${q.bottom.toFixed(0)}, boss ${f(B)}, her ${f(Hh)}, d ${q.iso.dist.toFixed(1)}`);
          t.assert(B.minX >= 0 && B.maxX <= q.w && B.minY >= q.top - 2 && B.maxY <= q.bottom + 2, `${L.id} ${q.id}: the boss sits clear of the HUD (${f(B)}, safe y ${q.top.toFixed(0)}..${q.bottom.toFixed(0)})`);
          t.assert(Hh.minX >= 0 && Hh.maxX <= q.w && Hh.minY >= q.top && Hh.maxY <= q.bottom, `${L.id} ${q.id}: she sits clear of the HUD (${f(Hh)})`);
          t.assert(q.iso.dist >= 13.9 && q.iso.dist <= 22.1, `${L.id} ${q.id}: boss distance ${q.iso.dist.toFixed(1)} in [14, 22]`);
          t.assert(q.mode === 'boss' || q.mode === 'lock', `${L.id} ${q.id}: cam mode ${q.mode}`);
          if (q.id === 'diag') {
            const cx = (Hh.minX + Hh.maxX) / 2 / q.w * 2 - 1, cy = 1 - (Hh.minY + Hh.maxY) / 2 / q.h * 2;
            t.assert(Math.abs(cx) < 0.62 && Math.abs(cy) < 0.7, `${L.id}: she sits inside the inner frame (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
          }
        }
        await t.shot(`camera/boss-${L.id}`, { freeze: true });       // the last placement: 10.5 m toward the lens
        // BOSS_INTRO reveal (height-scaled) on the boss still works from the iso rig
        await t.setMode('cutscene');
        await t.G(() => { const g = window.__GAME__; g.ctx.cam.shot({ preset: 'BOSS_INTRO', anchor: g.ctx.enemies.boss, mode: 'cut' }); });
        await t.frames(4);
        const intro = await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss, v = b.object3d.position.clone(); v.y += b.height * 0.8; v.project(g.ctx.camera); return { head: [v.x, v.y], mode: g.ctx.cam.modeName }; });
        t.assert(intro.mode === 'preset' && Math.abs(intro.head[0]) < 0.9 && Math.abs(intro.head[1]) < 0.95, `${L.id}: BOSS_INTRO head ${fmt(intro.head)}`);
        await t.shot(`camera/boss-intro-${L.id}`, { freeze: true });
        await t.setMode('play');
        await t.G(() => { const g = window.__GAME__; g.ctx.cam.mode('follow', { blend: false }); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
        await t.frames(4);
      }
    },
  },
  {
    // §2.4 combat fit: an engaged crossbow 9–10 m below her on screen (and 10 m above) stays inside the frame (exact
    // perspective vs the HUD-free rect), she stays in her inner band; ranged hostiles count up to their attack range
    name: 'camera:combat-fit', order: 44.4, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      shotDir(t);
      const probe = (dz, tag) => t.G(async ([dz, tag]) => {
        const g = window.__GAME__, c = g.ctx, ph = c.physics;
        for (const e of [...c.enemies.list]) c.enemies.despawn(e);
        const x = 24, z = 40;
        g.teleport(x, ph.heightAt(x, z), z);
        g.god(true);
        await g.waitFrames(30);
        const e = g.spawn('rat_xbow', x + 0.5, z + dz);
        e.alerted = true;
        const W = c.renderer.domElement.clientWidth, H = c.renderer.domElement.clientHeight;
        const V = new c.camera.position.constructor();
        const scr = (p, dy = 0) => { V.set(p.x, p.y + dy, p.z).project(c.camera); return { x: (V.x + 1) * 0.5 * W, y: (1 - V.y) * 0.5 * H }; };
        let worst = -Infinity, best = Infinity, herMin = Infinity, herMax = -Infinity, n = 0, eng = 0, dist = 0, far = 0;
        for (let f = 0; f < 480; f++) {
          await g.waitFrames(1);
          if (!e.alive || e.dead) break;
          // her feet → ears, steady state only (after the first 2 s of easing)
          if (f < 120) continue;
          const pp = c.player.object3d.position, ep = e.object3d?.position ?? e.pos;
          const a = scr(ep), b = scr(ep, e.height ?? 0.8), h0 = scr(pp), h1 = scr(pp, 1.0);
          worst = Math.max(worst, a.y, b.y); best = Math.min(best, a.y, b.y);
          herMin = Math.min(herMin, h1.y); herMax = Math.max(herMax, h0.y);
          eng = Math.max(eng, c.cam.engaged.length); dist = Math.max(dist, c.cam.distance);
          far = Math.max(far, Math.hypot(ep.x - pp.x, ep.z - pp.z));
          n++;
        }
        return { tag, W, H, worst, best, herMin, herMax, n, eng, dist, far, bar: c.ui?.bar?.insetBottom ?? 0 };
      }, [dz, tag]);
      const south = await probe(-9.5, 'south');
      t.log(`xbow south: rat y ${south.best.toFixed(0)}..${south.worst.toFixed(0)} / ${south.H}, her ${south.herMin.toFixed(0)}..${south.herMax.toFixed(0)}, d ${south.dist.toFixed(1)} m, ≤${south.far.toFixed(1)} m, eng ${south.eng}, bar ${south.bar}`);
      t.assert(south.n > 30 && south.eng >= 1, `south: the crossbow is engaged (${south.eng}, ${south.n} samples)`);
      t.assert(south.worst <= south.H, `south: the crossbow stays on screen (lowest ${south.worst.toFixed(0)} px of ${south.H})`);
      t.assert(south.herMin >= south.H * 0.15, `south: she is not pushed to the top (ears ${south.herMin.toFixed(0)} px)`);
      await t.shot('camera/combat-fit-south');
      const north = await probe(10, 'north');
      t.log(`xbow north: rat y ${north.best.toFixed(0)}..${north.worst.toFixed(0)}, her ${north.herMin.toFixed(0)}..${north.herMax.toFixed(0)}, d ${north.dist.toFixed(1)} m`);
      t.assert(north.best >= 0, `north: the crossbow's head stays on screen (top ${north.best.toFixed(0)} px)`);
      t.assert(north.herMax <= north.H * 0.85, `north: her feet stay clear of the bottom (${north.herMax.toFixed(0)} px)`);
      await t.shot('camera/combat-fit-north');
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
    },
  },
  {
    // picking: near-miss grass by a Vigil Stone stays a move; the Lantern Alley balcony deck (reached by crate hops) picks
    name: 'camera:pick-props', order: 44.6, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      const v = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx, ph = c.physics;
        g.teleport(-16, ph.heightAt(-16, -40), -40);
        await g.waitFrames(60);
        const out = {};
        for (const [k, x, z] of [['ne', -17.2, -35], ['sw', -14.8, -37], ['w', -17.6, -36], ['e', -14.4, -36], ['nw', -14.8, -35], ['s', -16, -37.6]]) {
          const s = g.screen(x, z); const p = c.cam.pick(s.x, s.y); out[k] = p.kind + (p.id ? ':' + p.id : '');
        }
        // (straight behind it the grass is hidden under the stone's top on screen: a click there is on the stone)
        const sb = g.screen(-16, -36); out.base = c.cam.pick(sb.x, sb.y).kind;
        const st = g.screen(-16, -36, ph.heightAt(-16, -36) + 1.2); out.body = c.cam.pick(st.x, st.y).kind;
        return out;
      });
      t.log(`vigil picks: ${JSON.stringify(v)}`);
      for (const k of ['ne', 'nw', 'sw', 'w', 'e', 's']) t.assert(v[k] === 'ground', `grass 1.6 m from the stone (${k}) is a move, not a use (${v[k]})`);
      t.assert(v.base === 'interact' && v.body === 'interact', `the stone itself is a use (base ${v.base}, body ${v.body})`);
      const b = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx;
        await g.loadLevel('town', 'hub'); g.story.skip?.(); g.setMode('play');
        const ph = c.physics;
        g.teleport(3, ph.heightAt(3, -35), -35);
        // the island audit (nav ready + islands built) runs a few frames after load
        for (let i = 0; i < 600 && !(ph.nav?.islands && ph.nav.islands.version === ph.nav.version); i++) await g.waitFrames(1);
        await g.waitFrames(30);
        const gy = ph.heightAt(5, -30), res = [];
        for (const [x, z] of [[5, -30], [4.2, -29.6], [5.8, -30.4], [5, -30.7]]) {
          const s = g.screen(x, z, gy + 3.0); const w = c.cam.screenToGround(s.x, s.y);
          res.push(+(w.y - gy).toFixed(2));
        }
        // a free-standing tall top elsewhere must still not pick: compare with the ground right by the deck
        return { res, islands: !!ph.nav?.islands };
      });
      t.log(`balcony deck picks (y above ground): ${b.res.join(', ')} (islands ${b.islands})`);
      t.assert(b.res.every((y) => Math.abs(y - 3) < 0.2), `the balcony deck is a click target (${b.res.join(', ')})`);
    },
  },
  {
    name: 'camera:handback', order: 45.2, level: 'forest', spawn: 'start', timeout: 120000,
    async run(t) {
      shotDir(t);
      // §2.6: a cutscene shot → back to play: a 1.0 s crane arc to the iso pose, never through the ground
      await t.setMode('cutscene');
      await t.G(() => window.__GAME__.ctx.cam.preset('HERO_LOW', 'swordcat', { mode: 'cut' }));
      await t.frames(5);
      await t.setMode('play');
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, ph = g.ctx.physics;
        c.mode('follow');
        let minClear = Infinity, frames = 0;
        const t0 = performance.now();
        while (c._blend.active && frames < 600) { await g.waitFrames(1); frames++; minClear = Math.min(minClear, cam.position.y - ph.heightAt(cam.position.x, cam.position.z)); }
        return { dur: c._blend.dur, minClear, frames, ms: performance.now() - t0, iso: g.cam.iso(), mode: c.modeName };
      });
      t.assert(Math.abs(r.dur - 1.0) < 1e-6, `hand-back blend ${r.dur} s (1.0)`);
      t.assert(r.minClear > 0.1, `the hand-back never dips under the terrain (min ${r.minClear.toFixed(2)} m)`);
      t.assert(r.mode === 'follow' && r.iso.dist > 9, `back in the iso rig (${r.mode}, d ${r.iso.dist.toFixed(1)})`);
      await t.shot('camera/handback');
      t.log(`hand-back: ${r.frames} frames, lowest ${r.minClear.toFixed(2)} m above ground`);
    },
  },
  {
    name: 'camera:occlusion', order: 46, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      // a fadeable tree right on the lens side of her (south at yaw π): it fades; her x-ray shows behind solid things
      const info = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, fader = ctx.cam._fader;
        const p = new THREE.Vector3();
        let best = null, bd = Infinity;
        const pp = ctx.player.pos;
        for (const u of fader.units) {
          if (u.solid) continue;
          const part = u.parts[0];
          p.setFromMatrixPosition(part.world);
          const d = Math.hypot(p.x - pp.x, p.z - pp.z) + (/tree/i.test(u.root.name ?? '') ? 0 : 1000);
          if (d < bd) { bd = d; best = { pos: p.clone(), name: u.root.name, top: u.center.y + u.radius }; }
        }
        if (!best) return { ok: false, n: fader.count };
        // her 4 m north of the tree: the line lens → her passes the crown
        const x = best.pos.x, z = best.pos.z + 4;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
        await g.waitFrames(60);
        // §3: the fade is dithered (alpha-hash, opaque, depth writes); trunks never fade
        const mats = [];
        let trunkFaded = 0;
        for (const u of fader.active) for (const part of u.parts) {
          if (part.never && (part.faded || part.proxy)) trunkFaded++;
          const m = part.proxy?.mesh.material ?? (Array.isArray(part.faded) ? part.faded[0] : part.faded);
          if (m && typeof m === 'object') mats.push({ hash: !!m.userData?.camDither, tr: !!m.transparent, shader: !!m.isShaderMaterial });
        }
        return { ok: true, n: fader.count, faded: fader.fadedCount, tree: best.name, mats, trunkFaded, crowns: fader.crownCount };
      });
      t.assert(info.ok && info.n > 10, `fadeable props registered (${info.n})`);
      if (info.ok) t.assert(info.faded > 0, `a tree between the lens and her fades (${info.faded} faded, ${info.tree})`);
      if (info.ok) {
        const plain = info.mats.filter((m) => !m.shader);
        t.assert(plain.length > 0 && plain.every((m) => m.hash && !m.tr), `faded props are dithered, not blended (${JSON.stringify(info.mats.slice(0, 4))})`);
        t.assert(info.trunkFaded === 0, `trunks never fade (${info.trunkFaded})`);
        t.log(`occlusion: ${info.n} units, ${info.crowns} crowns, ${info.faded} faded`);
      }
      await t.shot('camera/occlusion-tree', { freeze: true });
      // x-ray: a solid box right on the lens line hides her: the silhouette proxy shows
      const x = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, cam = ctx.camera, p = ctx.player;
        const chest = p.object3d.position.clone(); chest.y += 0.5;
        const at = chest.clone().lerp(cam.position, 0.3);
        const col = { x: at.x, z: at.z, hx: 1.2, hz: 1.2, y0: at.y - 3, y1: at.y + 1.2, cam: true };
        ctx.physics.addCollider(col);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.2, 2.4), new THREE.MeshStandardMaterial({ color: '#6E6A62' }));
        mesh.position.set(at.x, at.y - 0.9, at.z); ctx.scene.add(mesh);
        await g.waitFrames(30);
        window.__camOcc = { mesh, col };
        return { on: !!ctx.cam._xrayOn };
      });
      await t.shot('camera/occlusion-xray', { freeze: true });
      await t.G(async () => { const o = window.__camOcc, ctx = window.__GAME__.ctx; ctx.physics.removeCollider(o.col); o.mesh.removeFromParent(); o.mesh.geometry.dispose(); o.mesh.material.dispose(); delete window.__camOcc; await window.__GAME__.waitFrames(20); });
      t.assert(x.on, 'her x-ray silhouette shows while a solid prop hides her');
      const off = await t.G(() => !window.__GAME__.ctx.cam._xrayOn);
      t.assert(off, 'the x-ray goes away once she is visible again');
    },
  },
  {
    name: 'camera:town-occlusion', order: 46.8, level: 'town', spawn: 'hub', timeout: 180000,
    async run(t) {
      shotDir(t);
      const info = await t.G(() => { const c = window.__GAME__.ctx.cam; return { solids: c.solidOccluders, units: c._fader.count }; });
      t.assert(info.solids >= 6, `town: only ${info.solids} solid occluders registered (houses, castle, tower)`);
      await t.shot('camera/town-follow', { freeze: true });
      // her just north of a house (the lens is south at yaw π): the house hides her → it fades
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, f = ctx.cam._fader, p0 = ctx.player.pos;
        let best = null;
        for (const u of f.units) {
          if (!u.solid || u.radius < 3 || u.radius > 9) continue;
          const d = Math.hypot(u.center.x - p0.x, u.center.z - p0.z);
          if (!best || d < best.d) best = { u, d };
        }
        if (!best) return null;
        const u = best.u, box = new THREE.Box3();
        for (const pt of u.parts) box.union(pt.box.clone().applyMatrix4(pt.world));
        for (const dz of [0.8, 1.2, 1.8, 2.5]) {
          const x = u.center.x, z = box.max.z + dz;
          if (ctx.physics.blockedAt?.(x, z, 0.35, ctx.physics.heightAt(x, z) + 0.2, ctx.physics.heightAt(x, z) + 1.0)) continue;
          ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
          break;
        }
        await g.waitFrames(60);
        return { faded: f.fadedSolidCount, top: box.max.y, xray: !!ctx.cam._xrayOn };
      });
      t.assert(r, 'no house-sized solid occluder near the hub spawn');
      if (!r) return;
      t.assert(r.faded >= 1 || r.xray, `a house hiding her fades (faded solids ${r.faded}, x-ray ${r.xray})`);
      await t.shot('camera/town-house-fade', { freeze: true });
      t.log(`town: ${info.solids} solid occluders; house behind-her test: faded ${r.faded}, x-ray ${r.xray}`);
      // §3 roofs (world tags roof batch instances `camFadeRoofIds`): beside a house, inside its roof footprint + 1.5 m,
      // the roof fades (walls stay)
      const roof = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, f = ctx.cam._fader, p0 = ctx.player.pos;
        g.god(true); for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);    // no hurt blink in the shot
        const roofs = f.units.filter((u) => u.roof).sort((a, b) => Math.hypot(a.center.x - p0.x, a.center.z - p0.z) - Math.hypot(b.center.x - p0.x, b.center.z - p0.z));
        if (!roofs.length) return { n: 0 };
        for (const u of roofs.slice(0, 8)) {
          const b = u.aabb, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
          for (const [x, z] of [[cx, b.max.z + 0.9], [cx, b.min.z - 0.9], [b.max.x + 0.9, cz], [b.min.x - 0.9, cz]]) {
            const y = ctx.physics.heightAt(x, z);
            if (ctx.physics.blockedAt?.(x, z, 0.35, y + 0.2, y + 1.0)) continue;
            ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
            await g.waitFrames(40);
            return { n: roofs.length, f: u.f, at: [x, z] };
          }
        }
        return { n: roofs.length, f: -1 };
      });
      if (roof.n === 0) t.warn('town: no roof units (`camFadeRoofIds`) registered yet (world)');
      else {
        t.assert(roof.f > 0.9, `a roof beside her fades (f ${roof.f}, ${roof.n} roofs)`);
        await t.shot('camera/town-roof-fade', { freeze: true });
      }
    },
  },
  {
    name: 'camera:forest-canopy', order: 46.4, level: 'forest', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      // §3 crowns from above: she stands just north of a forest crown (on the lens side of her at yaw π); the crown
      // fades (dithered), its trunk stays; the fade comes in fast (0.15 s) and goes out slowly (0.40 s)
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, f = ctx.cam._fader, THREE = g.THREE, pp = ctx.player.pos;
        let best = null;
        for (const u of f.units) {
          if (!u.crown) continue;
          const d = Math.hypot(u.center.x - pp.x, u.center.z - pp.z);
          if (d > 4 && (!best || d < best.d)) best = { u, d };
        }
        if (!best) return { ok: false, crowns: f.crownCount };
        const c = best.u.aabb, x = (c.min.x + c.max.x) / 2;
        let z = c.max.z + 1.2;
        for (const dz of [1.2, 2, 3, 4]) {
          const zz = c.max.z + dz;
          if (!ctx.physics.blockedAt?.(x, zz, 0.35, ctx.physics.heightAt(x, zz) + 0.2, ctx.physics.heightAt(x, zz) + 1.0)) { z = zz; break; }
        }
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
        await g.waitFrames(4);
        const t0 = performance.now(); let n = 0;
        while (best.u.f < 1 && n < 240) { await g.waitFrames(1); n++; }
        const inMs = performance.now() - t0;
        await g.waitFrames(20);
        window.__camCrown = best.u;
        return { ok: true, crowns: f.crownCount, f: best.u.f, inMs, faded: f.fadedCount, never: best.u.parts.filter((q) => q.never).length,
          cut: best.u.parts.some((q) => Number.isFinite(q.crownY)), name: best.u.root.name };
      });
      t.assert(r.ok, `forest: crown units registered (${r.crowns})`);
      if (!r.ok) return;
      t.assert(r.f === 1, `the crown beside her fades (${r.name}, f ${r.f})`);
      t.assert(r.never > 0 || r.cut, `its trunk stays (never-fade parts ${r.never}, crown cut ${r.cut})`);
      await t.shot('camera/forest-canopy', { freeze: true });
      // walking away: the fade goes out over ~0.4 s (never instantly)
      const out = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player.pos, THREE = g.THREE, u = window.__camCrown;
        const x = p.x, z = p.z + 16;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
        await g.waitFrames(4);
        const mid = u.f;
        let n = 0;
        while (u.f > 0 && n < 240) { await g.waitFrames(1); n++; }
        delete window.__camCrown;
        return { mid, after: u.f };
      });
      t.assert(out.mid > 0 && out.after === 0, `the crown fades back gradually (f ${out.mid.toFixed(2)} four frames later, then ${out.after})`);
      t.log(`forest: ${r.crowns} crowns, ${r.faded} faded, ${r.name}: in ${r.inMs.toFixed(0)} ms (wall clock)`);
    },
  },
  {
    name: 'camera:phone', order: 46.9, level: 'meadow', spawn: 'start', timeout: 400000,
    async run(t) {
      shotDir(t);
      // §2.1 phones (hasTouch + isMobile): landscape 844×390 (38°) and portrait 390×844 (50°, 58° pitch), the cat-size
      // clamp, the clear focus fog, pinch zoom on the free area, and the iso occlusion on a phone
      for (const [w, h, tag] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
        // a fresh phone session: hasTouch + isMobile (its dev-server page load can take minutes on a loaded machine)
        const s = await phoneSession(t, w, h, tag);
        if (!t.assert(!!s, `${tag}: phone session booted`)) continue;
        try {
          await s.page.touchscreen.tap(Math.round(w * 0.62), Math.round(h * 0.3));     // first touch: device 'touch'
          await s.G(() => { const g = window.__GAME__; g.story?.skip?.(); g.setMode('play'); g.god(true); g.ctx.ui?.touch?.enable?.(true); });
          await s.frames(40);
          const a = await s.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; return { iso: g.cam.iso(), dev: g.ctx.input.device, fog: g.fogAt(p.x, p.z), fade: g.ctx.cam._fader.count, dither: g.ctx.cam._fader.dither }; });
          t.log(`${tag}: device ${a.dev}, d ${a.iso.dist.toFixed(2)}, pitch ${(a.iso.pitch * 57.3).toFixed(1)}°, fov ${a.iso.fov}, cat ${a.iso.catPx.toFixed(1)} px, fog ${a.fog == null ? 'n/a' : a.fog.toFixed(3)}`);
          t.assert(a.iso.phone, `${tag}: phone rig`);
          t.assert(a.iso.catPx >= (tag === 'portrait' ? 28 : 30) - 0.5, `${tag}: cat-size clamp (${a.iso.catPx.toFixed(1)} px)`);
          if (tag === 'portrait') {
            t.assert(a.iso.portrait && Math.abs(a.iso.fov - 50) < 0.6, `portrait FOV 50° (${a.iso.fov})`);
            t.assert(Math.abs(a.iso.pitch * 57.2958 - 58) < 1.5, `portrait pitch 58° (${(a.iso.pitch * 57.2958).toFixed(1)})`);
          } else {
            t.assert(!a.iso.portrait && Math.abs(a.iso.fov - 38) < 0.6, `landscape FOV 38° (${a.iso.fov})`);
            t.assert(a.iso.dist >= 9 && a.iso.dist <= 15.2, `landscape distance ${a.iso.dist.toFixed(2)}`);
          }
          if (a.fog != null) t.assert(a.fog < 0.03, `${tag}: clear fog at her (${a.fog.toFixed(3)})`);
          t.assert(a.fade > 10 && a.dither, `${tag}: occluders registered + dithered (${a.fade})`);
          await s.shot(`camera/phone-${tag}`);
          // pinch out (fingers apart) on the free area: zooms in (closer)
          const cx = Math.round(w * 0.7), cy = Math.round(h * 0.32);
          const d0 = a.iso.dist;
          await s.G(() => { const g = window.__GAME__; g.story?.skip?.(); g.setMode('play'); });
          const el1 = await s.touch('pointerdown', cx - 20, cy, 21), el2 = await s.touch('pointerdown', cx + 20, cy, 22);
          const pd = await s.G(() => { const tc = window.__GAME__.ctx.ui?.touch; return { mode: window.__GAME__.mode, free: tc?.free?.size ?? -1, pinch: !!tc?.pinch }; });
          for (let k = 1; k <= 8; k++) { await s.touch('pointermove', cx - 20 - k * 8, cy, 21); await s.touch('pointermove', cx + 20 + k * 8, cy, 22); }
          await s.touch('pointerup', cx - 84, cy, 21); await s.touch('pointerup', cx + 84, cy, 22);
          await s.frames(60);
          const b = await s.G(() => window.__GAME__.cam.iso());
          t.assert(b.dist < d0 - 0.3 || b.dist <= 9.05, `${tag}: pinch-out zooms in (${d0.toFixed(2)} → ${b.dist.toFixed(2)} m; ${el1}/${el2} ${JSON.stringify(pd)})`);
          await s.shot(`camera/phone-${tag}-pinch`);
          // a crown on the lens side of her fades on a phone too
          const o = await s.G(async () => {
            const g = window.__GAME__, ctx = g.ctx, f = ctx.cam._fader, THREE = g.THREE, pp = ctx.player.pos;
            g.cam.zoom(1); await g.waitFrames(40);
            let best = null, bd = Infinity;
            for (const u of f.units) { if (!u.crown) continue; const d = Math.hypot(u.center.x - pp.x, u.center.z - pp.z); if (d < bd) { bd = d; best = u; } }
            if (!best) return null;
            const x = (best.aabb.min.x + best.aabb.max.x) / 2, z = best.aabb.max.z + 1.5;
            ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
            await g.waitFrames(60);
            return { f: best.f, faded: f.fadedCount };
          });
          if (o) t.assert(o.f > 0.9, `${tag}: a crown on the lens side fades on a phone (f ${o.f.toFixed(2)}, ${o.faded} faded)`);
          await s.shot(`camera/phone-${tag}-canopy`);
        } finally { await s.close(); }
      }
    },
  },
  {
    name: 'camera:meme', order: 42, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.frames(5);
      await t.G(() => window.__GAME__.idle(16));
      const on = await t.waitForEvent('camera:meme', 3000);
      t.assert(on, 'idle(16) did not emit camera:meme');
      if (!on) return;
      t.assert((await t.lastEvent('camera:meme'))?.on === true, 'camera:meme {on:true}');
      await t.wait(400);
      await t.shot('camera/meme-blend');
      t.assert(await until(t, "c.modeName === 'meme' && !c._blend.active"), 'Meme Cam blend-in (2.0 s) never finished');
      await t.frames(2);
      const a = await camState(t);
      t.assert(a.mode === 'meme', `cam mode ${a.mode}`);
      t.assert(Math.abs(a.fov - MEME.fov) < 0.3, `meme fov ${a.fov.toFixed(1)}, expected ${MEME.fov}`);
      const err = dist3(a.local, MEME.pos);
      t.assert(err < 0.02, `MEME_LOOP placement off by ${err.toFixed(3)} m (local ${fmt(a.local)})`);
      await t.shot('camera/meme');
      await t.blankCheck('camera/meme');
      await t.wait(500);
      const b = await camState(t);
      const sway = dist3(a.pos, b.pos);
      t.assert(sway > 0 && sway < 0.018, `meme sway ${sway.toFixed(4)} m (expected tiny, non-zero; ≤ 2·0.005·√3)`);
      t.assert(b.memeT >= 0 && b.memeT < 3.8, `memeT ${b.memeT}`);
      await t.clearEvents();
      await t.hold('KeyW', 120);                            // any input exits
      const off = await t.waitForEvent('camera:meme', 2000);
      t.assert(off && (await t.lastEvent('camera:meme'))?.on === false, 'input did not exit Meme Cam (camera:meme {on:false})');
      await until(t, "c.modeName !== 'meme' && !c._blend.active", 5000);
      await t.frames(5);
      const c = await camState(t);
      t.assert(c.mode === 'follow', `after exit cam mode ${c.mode}`);
      const isoD = await t.G(() => window.__GAME__.cam.iso().dist);
      t.assert(isoD > 9 && isoD < 18.5, `after exit: back in the iso rig (${isoD.toFixed(2)} m)`);
      t.log(`meme local ${fmt(a.local)} fov ${a.fov.toFixed(1)}; sway ${(sway * 1000).toFixed(1)} mm/0.5 s`);

      // a wall right in front of her face: the framing swings around her to a clear 3/4 view (never inside the wall)
      await t.frames(60);
      const wall = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, f = p.facing, s = Math.sin(f), co = Math.cos(f);
        const cx = p.pos.x + s * 0.85 + co * 0.15, cz = p.pos.z + co * 0.85 - s * 0.15, gy = ctx.physics.heightAt(cx, cz);
        const col = { x: cx, z: cz, r: 0.35, y0: gy - 1, y1: gy + 3 };
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 14), new THREE.MeshStandardMaterial({ color: '#7A7468' }));
        mesh.position.set(cx, gy + 1.5, cz); mesh.name = 'smoke:pillar'; ctx.scene.add(mesh);
        ctx.physics.addCollider(col);
        window.__camSmoke = { col, mesh };
        return { off: ctx.cam.memeYawOffset(p) };
      });
      t.assert(wall.off !== 0, 'a pillar in front of her face did not rotate the Meme Cam framing');
      await t.clearEvents();
      await t.G(() => window.__GAME__.idle(16));
      t.assert(await t.waitForEvent('camera:meme', 10000), 'second Meme Cam did not start');
      t.assert(await until(t, "c.modeName === 'meme' && !c._blend.active"), 'second Meme Cam blend-in never finished');
      const w = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, cam = ctx.camera;
        const eyes = new THREE.Vector3(p.pos.x, p.pos.y + 0.82, p.pos.z);
        return { off: ctx.cam._meme.yawOffset, clear: ctx.physics.lineOfSight(eyes, cam.position, { terrain: true, mesh: true, statics: true }) };
      });
      t.assert(w.off !== 0 && w.clear, `meme behind the pillar: yaw offset ${w.off}, clear view ${w.clear}`);
      await t.shot('camera/meme-pillar');
      await t.hold('KeyW', 120);
      await until(t, "c.modeName !== 'meme'", 3000);
      await t.G(() => {
        const ctx = window.__GAME__.ctx, k = window.__camSmoke;
        ctx.physics.removeCollider(k.col); k.mesh.removeFromParent(); k.mesh.geometry.dispose(); k.mesh.material.dispose();
        delete window.__camSmoke;
      });
      t.log(`pillar in front of her: Meme Cam framing rotated ${(w.off * 180 / Math.PI).toFixed(0)}°`);
    },
  },
  {
    name: 'camera:presets', order: 45, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      shotDir(t);
      await t.setMode('cutscene');
      const STATIC = { MEME_LOOP: MEME.pos, REVERSE_HORDE: [0.35, 0.55, -1.4], SELFIE: [0.25, 0.92, 0.45], ECU_EYES: [0, 0.79, 0.35], TWO_SHOT_LOW: [1.6, 0.75, 1.6], HERO_LOW: [0.8, 0.35, 2.2] };
      const FOV = { MEME_LOOP: MEME.fov, REVERSE_HORDE: 38, SELFIE: 50, ECU_EYES: 25, TWO_SHOT_LOW: 35, HERO_LOW: 40 };
      for (const [name, want] of Object.entries(STATIC)) {
        await t.G((n) => window.__GAME__.ctx.cam.preset(n, 'swordcat', { mode: 'cut' }), name);
        await t.frames(4);
        const s = await camState(t);
        const err = dist3(s.local, want);
        t.assert(err < 0.04, `${name}: camera off by ${err.toFixed(3)} m (local ${fmt(s.local)})`);
        t.assert(Math.abs(s.fov - FOV[name]) < 0.3, `${name}: fov ${s.fov.toFixed(1)}, expected ${FOV[name]}`);
        if (name === 'MEME_LOOP') t.assert(s.looping && s.memeT > 0, `MEME_LOOP shot: memeT ${s.memeT} (cape / grass loop sync)`);
        await t.shot(`camera/preset-${name}`);
      }
      // FLIGHT_ORBIT: r 9, h 2 around her, 8°/s
      await t.G(() => window.__GAME__.ctx.cam.preset('FLIGHT_ORBIT', 'swordcat'));
      await t.frames(3);
      const o1 = await camState(t), t1 = o1.shotT;                  // pose + shot clock sampled in the same frame
      await until(t, `c._cut.t >= ${t1 + 1.0}`, 20000);
      const o2 = await camState(t), t2 = o2.shotT;
      const r = Math.hypot(o2.local[0], o2.local[2]);
      const da = Math.abs(Math.atan2(o2.local[0], o2.local[2]) - Math.atan2(o1.local[0], o1.local[2])) * 180 / Math.PI, want = 8 * (t2 - t1);
      t.assert(Math.abs(r - 9) < 0.05 && Math.abs(o2.local[1] - 2) < 0.05, `orbit radius ${r.toFixed(2)} / height ${o2.local[1].toFixed(2)}`);
      t.assert(want > 1 && Math.abs(da - want) < 0.5, `orbit advanced ${da.toFixed(2)}° in ${(t2 - t1).toFixed(2)} s of shot time, expected ${want.toFixed(2)} (8°/s)`);
      await t.shot('camera/preset-FLIGHT_ORBIT');
      // SELFIE → WHIP_FALL (0.53 s): lands sideways in the grass
      await t.G(() => window.__GAME__.ctx.cam.preset('SELFIE', 'swordcat', { mode: 'cut' }));
      await t.frames(3);
      await t.G(() => { window.__camShot = window.__GAME__.ctx.cam.shot({ preset: 'WHIP_FALL', anchor: 'swordcat', dur: 0.53 }); });
      await until(t, 'c._cut.t >= 0.12', 5000);
      await t.shot('camera/whip-mid');
      await t.G(async () => { await window.__camShot; });
      await t.frames(2);
      let s = await camState(t);
      t.assert(Math.abs(s.roll - Math.PI / 2) < 0.01, `WHIP_FALL roll ${(s.roll * 180 / Math.PI).toFixed(1)}°, expected 90`);
      t.assert(Math.abs(s.pos[1] - s.ground - 0.12) < 0.03, `WHIP_FALL height above ground ${(s.pos[1] - s.ground).toFixed(3)}, expected 0.12`);
      t.assert(Math.abs(s.fov - 65) < 0.5, `WHIP_FALL fov ${s.fov.toFixed(1)}, expected 65`);
      await t.shot('camera/whipfall');
      // PULLBACK: MEME_LOOP → (0, 4, 14) over 6 s, FOV 38 → 50
      await t.G(() => { window.__camShot = window.__GAME__.ctx.cam.shot({ preset: 'PULLBACK', anchor: 'swordcat' }); });
      await until(t, 'c._cut.t >= 3.0', 20000);
      await t.shot('camera/pullback-mid');
      await t.G(async () => { await window.__camShot; delete window.__camShot; });
      await t.frames(2);
      s = await camState(t);
      t.assert(dist3(s.local, [0, 4, 14]) < 0.05, `PULLBACK end ${fmt(s.local)}, expected 0, 4, 14`);
      t.assert(Math.abs(s.fov - 50) < 0.3, `PULLBACK fov ${s.fov.toFixed(1)}, expected 50`);
      await t.shot('camera/pullback');
      // CRANE_DOWN along level anchors crane_bell → crane_field
      const done = await t.G(async () => { await window.__GAME__.ctx.cam.shot({ preset: 'CRANE_DOWN', path: ['crane_bell', 'crane_field'], dur: 2.5 }); return true; });
      t.assert(done === true, 'CRANE_DOWN promise');
      await t.frames(2);
      s = await camState(t);
      const field = await t.G(() => window.__GAME__.ctx.levels.anchor('crane_field').pos.toArray());
      t.assert(dist3(s.pos, field) < 0.1, `CRANE_DOWN ended at ${fmt(s.pos)}, expected crane_field ${fmt(field)}`);
      t.assert(Math.abs(s.fov - 40) < 0.3, `CRANE_DOWN fov ${s.fov.toFixed(1)}`);
      await t.shot('camera/crane');
      // handback: follow with the iso crane arc (CONTROLS_SPEC §2.6: 1.0 s)
      await t.setMode('play');
      const blending = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam;
        c.mode('follow');
        await g.waitFrames(1);
        const b = c._blend;
        return b.active && Math.abs(b.dur - 1.0) < 1e-6 && b.t < b.dur;
      });
      t.assert(blending, 'handback was a cut, expected a 1.0 s blend');
      await until(t, '!c._blend.active', 5000);
      await t.frames(5);
      s = await camState(t);
      const isoD = await t.G(() => window.__GAME__.cam.iso().dist);
      t.assert(s.mode === 'follow' && isoD > 9, `handback: mode ${s.mode}, iso distance ${isoD.toFixed(2)}`);
      await t.shot('camera/handback');
      t.log('presets OK: static ×6, orbit, whip-fall, pull-back, crane rail, handback');
    },
  },
  {
    name: 'camera:shake', order: 47, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await t.frames(5);
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, THREE = g.THREE;
        g.ctx.bus.emit(g.E.SHAKE, { trauma: 0.8 });
        const trauma = c.shaker.trauma;                                   // read before real-time decay (loaded machines)
        await g.waitFrames(2);
        const fwd = cam.getWorldDirection(new THREE.Vector3()), want = c._outPose.look.clone().sub(c._outPose.pos).normalize();
        const angle = fwd.angleTo(want);
        for (let i = 0; i < 100 && c.shaker.trauma > 0; i++) await new Promise((res) => setTimeout(res, 50));
        return { angle, trauma, after: c.shaker.trauma };
      });
      t.assert(r.trauma > 0.5, `trauma ${r.trauma}`);
      t.assert(r.angle > 0.001, `shake did not rotate the camera (${r.angle})`);
      t.assert(r.after === 0, `trauma did not decay (${r.after})`);
      // a light hit (§8.2 0.15) must still visibly jolt the view: peak displacement of the look point 3.6 m ahead
      const light = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, THREE = g.THREE;
        c.shaker.reset();
        g.ctx.bus.emit(g.E.SHAKE, { trauma: 0.15 });
        let peak = 0;
        for (let i = 0; i < 12; i++) {
          await g.waitFrames(1);
          const want = c._outPose.look.clone().sub(c._outPose.pos).normalize();
          const at = cam.position.clone().addScaledVector(cam.getWorldDirection(new THREE.Vector3()), 3.6);
          const ideal = c._outPose.pos.clone().addScaledVector(want, 3.6);
          peak = Math.max(peak, at.distanceTo(ideal));
        }
        return peak;
      });
      t.assert(light > 0.02, `light hit shake moved the view only ${(light * 100).toFixed(1)} cm at 3.6 m`);
      t.log(`shake: ${(r.angle * 180 / Math.PI).toFixed(2)}° offset at trauma ${r.trauma.toFixed(2)}; light hit ${(light * 100).toFixed(1)} cm`);
    },
  },
  {
    name: 'camera:pullback-cs08', order: 45.5, level: 'gate', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      // CS-08 shot 4 at the Line marker (0, +10), facing the fog (south): the rescued kittens stand in rows behind her
      await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE;
        for (const e of [...(ctx.enemies?.list ?? [])]) ctx.enemies.despawn(e);
        ctx.player.teleport({ pos: new THREE.Vector3(0, ctx.physics.heightAt(0, 10), 10), facing: Math.PI });
        await g.waitFrames(5);
      });
      await t.setMode('cutscene');
      await t.G(() => window.__GAME__.ctx.cam.shot({ preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' }));
      await t.frames(5);
      await t.shot('camera/cs08-meme', { freeze: true });
      await t.G(() => { window.__camShot = window.__GAME__.ctx.cam.shot({ preset: 'PULLBACK', anchor: 'swordcat' }); });
      await until(t, 'c._cut.t >= 3.0', 20000);
      const mid = await camState(t);
      await t.shot('camera/cs08-pullback-mid', { freeze: true });
      await t.G(async () => { await window.__camShot; delete window.__camShot; });
      await t.frames(2);
      const end = await camState(t);
      await t.shot('camera/cs08-pullback-end', { freeze: true });
      t.assert(mid.local[1] < 2.6, `mid-rail height ${mid.local[1].toFixed(2)} m: the dolly leads, the crane comes last`);
      t.assert(dist3(end.local, [0, 4, 14]) < 0.3 || end.dist < 14, `PULLBACK end ${fmt(end.local)}`);
      t.assert(Math.abs(end.fov - 50) < 0.3, `PULLBACK fov ${end.fov.toFixed(1)}`);
      t.assert(end.pos[1] >= end.ground + 0.1, 'rail below the terrain');
      // her (and the rows 2.5–4.5 m behind her) are inside the final frame
      const frame = await t.G(() => {
        const g = window.__GAME__, p = g.ctx.player, f = p.facing, out = [];
        for (const [lx, lz] of [[0, 0], [-2.5, -2.5], [2.5, -2.5], [-2.5, -4.5], [2.5, -4.5]]) {
          const v = new g.THREE.Vector3(p.pos.x + lx * Math.cos(f) + lz * Math.sin(f), p.pos.y + 0.4, p.pos.z - lx * Math.sin(f) + lz * Math.cos(f)).project(g.ctx.camera);
          out.push([v.x, v.y]);
        }
        return out;
      });
      for (const [x, y] of frame) t.assert(Math.abs(x) < 0.95 && Math.abs(y) < 0.95, `brigade point off screen (${x.toFixed(2)}, ${y.toFixed(2)})`);
      await t.setMode('play');
      await t.G(() => window.__GAME__.ctx.cam.mode('follow', { blend: false }));
      t.log(`CS-08 rail: mid ${fmt(mid.local)}, end ${fmt(end.local)}, fov ${end.fov.toFixed(1)}`);
    },
  },
];
