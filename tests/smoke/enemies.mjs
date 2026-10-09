// tests/smoke/enemies.mjs  (owner: enemies) — the enemies area in the running game. Screenshots → tests/shots/enemies/.
//   enemies:looks     rat_pike / rat_xbow / crow: real GLBs fitted (±10% of §10.2), animated, facing +Z (close-ups)
//   enemies:cs02      the CS-02 cast (scripted, AI-less): Cacklejaw, Pilfer (signpost + post bag), caged hyenas (Pearl)
//   enemies:pike      rat_pike FSM: alert hop → chase (token) → windup with a white `parry` glint → strike → hit
//                     on her → recover; then it's defeated: enemy:died, poof, the helm spins off, it scampers away
//   enemies:xbow      rat_xbow: `aim` telegraph (line) → a bolt flies at her → reload
//   enemies:crow      crow: circles 4 m up, `shadow` decal → dive → lands and pecks (hittable) → defeated
//   enemies:budget    §8.3 arena budget: 10 AI spawns → 8 active + 2 dormant; despawns free slots
//   enemies:meow      §7.7 Meow alerts an unalerted rat behind her
//   enemies:level     the meadow's own open-zone spawns after the prologue (world's LevelKit → ctx.enemies.spawn):
//                     crossroads pikes + a crossbowman perched on the wall (y 1.2), Crow Fields crows + perched xbows
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

fs.mkdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'enemies'), { recursive: true });

/** Page-side helpers (installed per block as window.__GAME__.__en). */
const HELPERS = () => {
  const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, E = g.E;
  const h = {
    tele: [], offs: [],
    /** spawn `type` at (angle relative to her facing, distance) facing her */
    spawn(type, rel, dist, opts = {}) {
      const p = ctx.player, a = p.facing + rel;
      const pos = new THREE.Vector3(p.pos.x + Math.sin(a) * dist, 0, p.pos.z + Math.cos(a) * dist);
      const facing = opts.facing ?? Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z);
      const e = ctx.enemies.spawn(type, pos, { ...opts, facing });
      if (opts.passive) e.ai = false;
      return e;
    },
    loaded() { return ctx.enemies.list.every((e) => e.dormant || (e.visual && (e.anim || !e.def.anims))); },
    /** fitted visual height (m) vs the def height */
    fit(e) {
      e.object3d.updateMatrixWorld(true);
      const b = new THREE.Box3();
      e.visual.traverse((o) => {
        if (!o.isMesh || !o.visible || o.userData.sharedProp || !o.geometry) return;
        let hidden = false; for (let q = o; q && q !== e.visual; q = q.parent) if (!q.visible) hidden = true;
        if (hidden) return;
        if (o.isSkinnedMesh) { const v = new THREE.Vector3(); const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 3) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); b.expandByPoint(v); } }
        else b.expandByObject(o);
      });
      const s = b.getSize(new THREE.Vector3());
      return { y: s.y, x: s.x, z: s.z };
    },
    /** camera: a cut framing in `actor`'s local frame (+Z = in front of it) */
    frame(actor, pos, look, fov = 35) { ctx.game.setMode('play'); return ctx.cam.shot({ anchor: actor, pos, look, mode: 'cut', fov }); },
    follow() { ctx.cam.mode('follow', { blend: 0 }); },
    listen() {
      h.offs.push(ctx.bus.on(E.TELEGRAPH, (p) => {
        h.tele.push({ id: p.id, kind: p.kind, shape: p.shape, type: p.actor?.def?.id, dur: p.duration, at: ctx.game.time, actor: p.actor });
        if (h.freezeKind === p.kind && h.freezeAt === Infinity) h.freezeAt = ctx.game.time + h.freezeDelay;
      }));
      h.offs.push(ctx.bus.on(E.TELEGRAPH_END, (p) => {
        const t = h.tele.find((x) => x.id === p.id);
        if (t && t.endAt == null) { t.endAt = ctx.game.time; t.endState = t.actor?.stateName; }
      }));
      h.offs.push(ctx.bus.on(E.ENEMY_ALERTED, () => {
        if (h.freezeKind === 'alert' && h.freezeAt === Infinity) h.freezeAt = ctx.game.time + h.freezeDelay;
      }));
      // screenshots of split-second states: freeze the simulation (time scale 0) at a chosen sim time
      h.offs.push(ctx.game.addFrameHook(() => {
        if (!h.frozen && ctx.game.time >= h.freezeAt) { ctx.game.setTimeScale(0); h.frozen = true; }
      }));
    },
    freezeKind: null, freezeDelay: 0, freezeAt: Infinity, frozen: false,
    /** freeze `delay` sim-seconds after the next telegraph of `kind` ('alert' = the next enemy:alerted; null = now) */
    freezeAfter(kind, delay) { h.freezeKind = kind; h.freezeDelay = delay; h.freezeAt = kind ? Infinity : ctx.game.time + delay; h.frozen = false; },
    thaw() { h.freezeKind = null; h.freezeAt = Infinity; h.frozen = false; ctx.game.setTimeScale(1); },
    done() { h.thaw(); for (const off of h.offs) off(); h.offs.length = 0; h.follow(); ctx.enemies.clear(); },
  };
  g.__en = h;
  g.god(true);
  // step off the start spawn (the practice-field fence sits between the camera and the lane there)
  const p = ctx.player, ahead = new THREE.Vector3(p.pos.x + Math.sin(p.facing) * 7, 0, p.pos.z + Math.cos(p.facing) * 7);
  ahead.y = ctx.physics.heightAt(ahead.x, ahead.z);
  p.teleport({ pos: ahead, facing: p.facing });
  ctx.cam.snapBehind?.();
  ctx.input.setDevice?.('kbm');
  ctx.game.setTimeScale(1);
  return true;
};

async function prepare(t) {
  await t.G((src) => new Function(`return (${src})`)()(), HELPERS.toString());
  await t.G(() => window.__GAME__.__en.listen());
}

/** Wait until every spawned enemy has its model (or fail after `ms`). */
async function waitLoaded(t, ms = 45000) {
  try { await t.page.waitForFunction(() => window.__GAME__.__en.loaded(), null, { timeout: ms, polling: 100 }); return true; }
  catch { t.fail('enemy models did not finish loading'); return false; }
}

/** Poll a page predicate (returns true/false). */
async function until(t, fn, arg, ms = 8000) {
  try { await t.page.waitForFunction(fn, arg, { timeout: ms, polling: 30 }); return true; } catch { return false; }
}

export default [
  {
    name: 'enemies:looks', order: 40, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      await prepare(t);
      const FRONT = { rat_pike: [[0.55, 0.75, 2.0], [0, 0.4, 0]], rat_xbow: [[0.55, 0.75, 2.0], [0, 0.4, 0]], crow: [[0.9, 0.5, 2.6], [0, 0.1, 0]] };
      const SIDE = { rat_pike: [[-2.4, 0.75, 0.6], [0, 0.4, 0.2]], rat_xbow: [[-2.4, 0.75, 0.6], [0, 0.4, 0.2]], crow: [[-2.8, 0.6, 0.4], [0, 0.1, 0]] };
      for (const type of ['rat_pike', 'rat_xbow', 'crow']) {
        const id = await t.G((ty) => window.__GAME__.__en.spawn(ty, 0, 5, { passive: true }).id, type);
        await waitLoaded(t);
        await t.frames(20);
        const f = await t.G((rid) => {
          const g = window.__GAME__, h = g.__en, e = g.ctx.enemies.list.find((x) => x.id === rid);
          return { type: e.type, fit: h.fit(e), h: e.def.height, wing: e.def.fit?.x ?? null, clips: e.anim ? Object.keys(e.anim.actions).length : 0,
            current: e.anim?.currentName ?? null, helmet: !!e.helmet, tip: !!e.tipNode, alt: +(e.pos.y - g.ctx.physics.heightAt(e.pos.x, e.pos.z)).toFixed(2) };
        }, id);
        t.log(`${f.type}: visual ${f.fit.x.toFixed(2)} × ${f.fit.y.toFixed(2)} × ${f.fit.z.toFixed(2)} m, clip ${f.current}, ${f.clips} actions, helmet ${f.helmet}, tip ${f.tip}, alt ${f.alt}`);
        t.assert(f.clips > 0 && f.current, `${f.type}: no animation playing`);
        if (type === 'crow') {
          t.assert(Math.abs(f.fit.x / f.wing - 1) < 0.25, `crow wingspan ${f.fit.x.toFixed(2)} vs ${f.wing}`);
          t.assert(f.alt > 2.5, `crow flies (altitude ${f.alt} m)`);
        } else t.assert(f.fit.y >= f.h * 0.85 && f.fit.y <= f.h * 1.45, `${f.type}: height ${f.fit.y.toFixed(2)} vs ${f.h} (gear included)`);
        t.assert(f.helmet, `${f.type}: helm / hood worn`);
        if (type !== 'crow') t.assert(f.tip, `${f.type}: weapon mounted`);
        // close-ups (the model must face its +Z: toward the camera in the front shot)
        for (const [view, [pos, look]] of [['front', FRONT[type]], ['side', SIDE[type]]]) {
          await t.G(([rid, a, b]) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, a, b, 38); }, [id, pos, look]);
          await t.frames(6);
          await t.shot(`enemies/looks-${type}${view === 'side' ? '-side' : ''}`);
        }
        await t.G(() => window.__GAME__.__en.done());
      }
      // the three together, as she sees them
      await t.G(() => { const h = window.__GAME__.__en; h.spawn('rat_pike', 0.55, 4.5, { passive: true }); h.spawn('rat_xbow', -0.5, 4.8, { passive: true }); h.spawn('crow', 0, 7, { passive: true }); });
      await waitLoaded(t);
      await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [0.3, 2.4, -3.2], look: [0, 1.4, 5], mode: 'cut', fov: 55 }); });
      await t.frames(20);
      await t.shot('enemies/looks-lineup');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:cs02', order: 41, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      await prepare(t);
      const ids = await t.G(() => {
        const g = window.__GAME__, h = g.__en, ctx = g.ctx;
        const cj = h.spawn('cacklejaw', 0.0, 4.5, { id: 'cacklejaw', scripted: true, ai: false });
        const pf = h.spawn('pilfer', 0.55, 3.6, { id: 'pilfer', scripted: true, ai: false });
        const h1 = h.spawn('hyena', -0.6, 3.8, { id: 'hyena_1', scripted: true, ai: false, cage: 'pearl' });
        const h2 = h.spawn('hyena', -1.0, 5.5, { id: 'hyena_2', scripted: true, ai: false, cage: true, word: 'GRUMBLER' });
        ctx.game.setMode('cutscene');
        pf.prop('signpost', true); pf.prop('post_bag', true);
        return { cj: cj.id, pf: pf.id, h1: h1.id, h2: h2.id };
      });
      await waitLoaded(t);
      const info = await t.G(() => {
        const ctx = window.__GAME__.ctx, A = ctx.actors;
        const cj = A.get('cacklejaw'), pf = A.get('pilfer'), h1 = A.get('hyena_1'), h2 = A.get('hyena_2');
        cj.play('laugh'); cj.emote('laugh');
        return {
          found: !!(cj && pf && h1 && h2), scripted: [cj, pf, h1, h2].every((e) => e.scripted && !e.hurtable),
          plates: [cj.plateWord, pf.plateWord, h1.plateWord, h2.plateWord], heads: [cj, pf, h1, h2].every((e) => !!e.head),
          cage: [!!h1.extraProps.cage, h1.cageWho, !!h2.extraProps.cage, h2.cageWho], props: [!!pf.extraProps.signpost, !!pf.extraProps.post_bag],
          hat: !!cj.model?.scene.getObjectByName('Barbarian_Hat')?.visible,
        };
      });
      t.log(`cast: plates ${info.plates.join(' / ')}, cages ${info.cage.join(' ')}, pilfer props ${info.props}, cacklejaw hat ${info.hat}`);
      t.assert(info.found, 'CS-02 cast registered under their cutscene ids');
      t.assert(info.scripted, 'CS-02 cast is scripted and not hurtable');
      t.assert(info.heads, 'beast heads attached');
      t.assert(info.plates[0] === 'HATER-IN-CHIEF' && info.plates[1] === 'POST STEALER' && info.plates[3] === 'GRUMBLER', `plates ${info.plates}`);
      t.assert(info.cage[0] && info.cage[1] === 'pearl' && info.cage[2], 'caged hyenas (Pearl + a squire)');
      t.assert(info.props[0] && info.props[1], 'Pilfer holds the signpost and the post bag');
      t.assert(info.hat, 'Cacklejaw keeps Barbarian_Hat (hides the chipped ear, §11.3)');
      // the two files walk the lane at 1.6 m/s (scripted moveTo) while Cacklejaw laughs
      const w0 = await t.G(() => {
        const ctx = window.__GAME__.ctx, e = ctx.actors.get('hyena_2'), p = ctx.player.pos;
        e.moveTo([p.x - 4.6, p.z + 9], 1.6);
        return [e.pos.x, e.pos.z];
      });
      await t.wait(1200);
      const moving = await t.G(() => { const e = window.__GAME__.ctx.actors.get('hyena_2'); return { x: e.pos.x, z: e.pos.z, clip: e.anim?.currentName, moving: e.isMoving }; });
      const walked = Math.hypot(moving.x - w0[0], moving.z - w0[1]);
      t.assert(walked > 0.6, `scripted moveTo walks (${walked.toFixed(2)} m in 1.2 s)`);
      t.log(`hyena_2 walked ${walked.toFixed(2)} m, clip ${moving.clip}`);
      t.assert(/Walking|Running/.test(moving.clip ?? '') || !moving.moving, `walk clip while moving (${moving.clip})`);
      await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [0.2, 1.6, -2.6], look: [0, 1.1, 4.5], mode: 'cut', fov: 50 }); });
      await t.frames(30);
      await t.shot('enemies/cs02-cast');
      for (const id of ['cacklejaw', 'pilfer', 'hyena_1']) {
        await t.G((x) => {
          const g = window.__GAME__, e = g.ctx.actors.get(x), H = e.def.height ?? 1.3;
          return g.ctx.cam.shot({ anchor: e, pos: [0.5 * H, 0.75 * H, 1.6 * H], look: [0, 0.6 * H, 0], mode: 'cut', fov: 40 });
        }, id);
        await t.frames(8);
        await t.shot(`enemies/cs02-${id}`);
      }
      await t.G(() => { const g = window.__GAME__; g.ctx.game.setMode('play'); for (const e of [...g.ctx.enemies.list]) e.setScripted(false); g.__en.done(); });
    },
  },
  {
    name: 'enemies:pike', order: 42, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => window.__GAME__.__en.spawn('rat_pike', 0, 5.5, { passive: true }).id);
      await waitLoaded(t);
      await t.G((rid) => { const g = window.__GAME__; g.clearEvents(); g.__en.freezeAfter('alert', 0.12); g.ctx.enemies.list.find((x) => x.id === rid).ai = true; }, id);
      const alerted = await t.waitForEvent('enemy:alerted', 4000);
      t.assert(alerted, 'rat_pike alerted (her within 10 m in its FOV)');
      if (alerted && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        const bang = await t.G((rid) => { const e = window.__GAME__.ctx.enemies.list.find((x) => x.id === rid); return { on: !!e.bang?.visible, state: e.stateName }; }, id);
        t.assert(bang.on && bang.state === 'alert', `the alert "!" pops over its head (${bang.state})`);
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.4, 1.0, 2.6], [0, 0.7, 0], 42); }, id);
        await t.frames(3);
        await t.shot('enemies/pike-alert');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      await t.G(() => window.__GAME__.__en.freezeAfter('parry', 0.3));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'rat_pike'), null, 15000);
      t.assert(tele, 'rat_pike telegraphs its poke');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.3, 0.9, 1.9], [0, 0.45, 0.6], 42); }, id);
        await t.frames(3);
        await t.shot('enemies/pike-windup');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const hit = await until(t, () => window.__GAME__.ctx.combat.log.some((x) => x.attackId === 'rat_poke' || x.attackId === 'rat_poke2'), null, 12000);
      t.assert(hit, 'rat_poke connects with her (god mode: 0 damage)');
      const st = await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid);
        return { tele: g.__en.tele.filter((x) => x.type === 'rat_pike').map((x) => `${x.kind}/${x.shape}/${x.dur.toFixed(2)}`), state: e.stateName };
      }, id);
      t.log(`pike telegraphs ${st.tele.join(', ')}; state ${st.state}`);
      t.assert(st.tele.every((x) => x.startsWith('parry/glint') || x.startsWith('gold/glint')), 'rat_pike telegraphs are white (or gold follow-up) glints');
      t.assert(st.tele.every((x) => parseFloat(x.split('/')[2]) >= 0.45), 'windups ≥ 0.45 s (§10.1)');
      // defeat: heavy hits from her, seen from the side
      await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid);
        g.clearEvents();
        return g.ctx.cam.shot({ anchor: e, pos: [2.6, 1.6, 2.4], look: [0, 0.5, 0], mode: 'cut', fov: 50 });
      }, id);
      const dead = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        for (let i = 0; i < 6 && e.alive; i++) { e.invulnT = 0; ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash3); }
        ctx.game.hitstopT = 0;
        g.__en.freezeAfter(null, 0.22);
        return { alive: e.alive, state: e.stateName, helmet: !!e.helmet, debris: ctx.enemies.debris.length };
      }, id);
      t.assert(!dead.alive && dead.state === 'die', `rat_pike defeated (${dead.state})`);
      t.assert(dead.debris === 1 && !dead.helmet, 'the kettle helm spins off');
      t.assert((await t.events()).includes('enemy:died'), 'enemy:died emitted');
      if (await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.frames(3);
        await t.shot('enemies/pike-defeat');
        await t.G(() => window.__GAME__.__en.thaw());
      }
      const gone = await until(t, (rid) => !window.__GAME__.ctx.enemies.list.some((x) => x.id === rid), id, 12000);
      t.assert(gone, 'defeated rat despawns after scampering');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:xbow', order: 43, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => window.__GAME__.__en.spawn('rat_xbow', 0.2, 9).id);
      await waitLoaded(t);
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'rat_xbow' && x.kind === 'aim'), null, 8000);
      t.assert(tele, 'rat_xbow aims (aim telegraph, dotted line)');
      if (tele) {
        await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [2.4, 1.8, -2.2], look: [0, 0.6, 4], mode: 'cut', fov: 50 }); });
        await t.wait(250);
        await t.shot('enemies/xbow-aim');
        await t.G(() => window.__GAME__.__en.follow());
      }
      const shot = await until(t, () => (window.__GAME__.ctx.combat.stats?.projectiles ?? 0) > 0, null, 4000);
      t.assert(shot, 'rat_xbow fires a bolt');
      const res = await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid), p = g.ctx.player;
        return { d: Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z), state: e.stateName, tele: g.__en.tele.filter((x) => x.type === 'rat_xbow').map((x) => `${x.kind}/${x.shape}/${x.dur.toFixed(2)}`) };
      }, id);
      t.log(`xbow at ${res.d.toFixed(1)} m, state ${res.state}, telegraphs ${res.tele.join(', ')}`);
      t.assert(res.tele.every((x) => x.startsWith('aim/line') && parseFloat(x.split('/')[2]) >= 0.8), 'aim telegraph lasts ≥ 0.8 s');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:crow', order: 44, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => window.__GAME__.__en.spawn('crow', 0.3, 7).id);
      await waitLoaded(t);
      await t.frames(10);
      await t.shot('enemies/crow-circling');
      await t.G(() => window.__GAME__.__en.freezeAfter('shadow', 0.75));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'crow' && x.kind === 'shadow'), null, 10000);
      t.assert(tele, 'crow telegraphs its dive with a shadow decal');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        // from behind and above the hovering crow, looking down its dive line at the shadow under her
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.ctx.cam.shot({ anchor: e, pos: [1.0, 1.2, -3.0], look: [0, -2.6, 3.2], mode: 'cut', fov: 62 }); }, id);
        await t.frames(3);
        await t.shot('enemies/crow-shadow');
        await t.G(() => window.__GAME__.__en.follow());
      }
      // freeze the sim on the frame the peck starts (a slow page can otherwise poll past the 1.2 s peck)
      await t.G((rid) => {
        const g = window.__GAME__, h = g.__en, ctx = g.ctx;
        h.thaw();
        const off = ctx.game.addFrameHook(() => {
          if (ctx.enemies.list.find((x) => x.id === rid)?.stateName === 'peck') { ctx.game.setTimeScale(0); h.frozen = true; off(); }
        });
        h.offs.push(off);
      }, id);
      const peck = await until(t, (rid) => window.__GAME__.__en.frozen && window.__GAME__.ctx.enemies.list.find((x) => x.id === rid)?.stateName === 'peck', id, 8000);
      t.assert(peck, 'crow dives, lands and pecks');
      const sh = await t.G(() => { const x = window.__GAME__.__en.tele.find((q) => q.type === 'crow' && q.kind === 'shadow'); return x && { dur: x.dur, len: x.endAt - x.at, endState: x.endState }; });
      if (sh) t.log(`crow shadow: duration ${sh.dur.toFixed(2)} s, shown ${sh.len?.toFixed(2)} s, ended in ${sh.endState}`);
      t.assert(sh && sh.endState === 'peck', 'the shadow decal stays up until the dive lands');
      const r = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        const alt = e.pos.y - ctx.physics.heightAt(e.pos.x, e.pos.z);
        const res = ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash1);
        ctx.game.hitstopT = 0;
        return { alt, res, hp: e.hp, max: e.maxHp, grounded: e.grounded };
      }, id);
      t.log(`pecking crow: alt ${r.alt.toFixed(2)} m, slash1 → ${r.res} (hp ${r.hp}/${r.max})`);
      t.assert(r.res === 'hit', 'a pecking crow is hittable');
      await t.G(() => window.__GAME__.__en.thaw());
      if (peck) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.ctx.cam.shot({ anchor: e, pos: [1.2, 0.8, 2.0], look: [0, 0.2, 0], mode: 'cut', fov: 50 }); }, id);
        await t.wait(300);                              // past the 60 ms hit flash
        await t.shot('enemies/crow-peck');
        await t.G(() => window.__GAME__.__en.follow());
      }
      // airborne again: a sword can't reach it
      const up = await until(t, (rid) => { const e = window.__GAME__.ctx.enemies.list.find((x) => x.id === rid); return e && e.pos.y - window.__GAME__.ctx.physics.heightAt(e.pos.x, e.pos.z) > 2.6; }, id, 8000);
      if (up) {
        const r2 = await t.G((rid) => { const ctx = window.__GAME__.ctx, e = ctx.enemies.list.find((x) => x.id === rid); e.invulnT = 0; return ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash1); }, id);
        t.assert(r2 === 'immune', `an airborne crow is out of sword reach (got ${r2})`);
      } else t.warn('crow did not climb back above 2.6 m within 8 s');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:budget', order: 45, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await prepare(t);
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, h = g.__en;
        // one squad behind her, out of sight (all within TUNING.capRadius of each other: one fight)
        const list = []; for (let i = 0; i < 10; i++) list.push(h.spawn('rat_pike', Math.PI + (i - 5) * 0.15, 16));
        const before = { active: ctx.enemies.count(), pending: ctx.enemies.pending.length, cap: ctx.enemies.cap };
        ctx.enemies.despawn(list[0]); ctx.enemies.despawn(list[1]);
        return before;
      });
      await t.frames(3);
      const after = await t.G(() => { const ctx = window.__GAME__.ctx; return { active: ctx.enemies.count(), pending: ctx.enemies.pending.length, visible: ctx.enemies.list.filter((e) => e.object3d.visible).length }; });
      t.log(`budget: cap ${r.cap}; 10 spawns → ${r.active} active + ${r.pending} held; after 2 despawns → ${after.active} active + ${after.pending} held`);
      t.assert(r.active === r.cap && r.pending === 10 - r.cap, 'over-budget spawns are held dormant');
      t.assert(after.active === Math.min(8, r.cap) && after.pending === 0 && after.visible === 8, 'held spawns wake as slots free');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:leak', order: 45.5, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const counts = [];
      for (let wave = 0; wave < 5; wave++) {
        await t.G(() => { const h = window.__GAME__.__en; for (const [k, a] of [['rat_pike', 0.2], ['rat_xbow', -0.4], ['crow', 0.8], ['rat_pike', -0.9]]) h.spawn(k, a, 9, { passive: true }); });
        await waitLoaded(t);
        await t.frames(5);                               // rendered once: bone textures uploaded
        await t.G(() => { const ctx = window.__GAME__.ctx; for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e); });
        await t.frames(5);
        counts.push(await t.G(() => window.__GAME__.ctx.renderer.info.memory.textures));
      }
      t.log(`textures after each spawn/despawn wave: ${counts.join(' → ')}`);
      t.assert(counts[4] - counts[1] <= 1, 'despawned enemies free their GPU textures (skeleton bone textures)');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:meow', order: 46, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => {
        // stays on its post (patrol radius 0), looking away from her
        return window.__GAME__.__en.spawn('rat_pike', Math.PI, 6, { facing: window.__GAME__.ctx.player.facing + Math.PI, patrolRadius: 0 }).id;
      });
      await t.frames(10);
      const before = await t.G((rid) => window.__GAME__.ctx.enemies.list.find((x) => x.id === rid).alerted, id);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_MEOW, { position: g.ctx.player.pos.clone() }); });
      await t.frames(3);
      const after = await t.G((rid) => { const e = window.__GAME__.ctx.enemies.list.find((x) => x.id === rid); return { alerted: e.alerted, state: e.stateName }; }, id);
      t.assert(!before, 'a rat behind her (facing away) has not noticed her');
      t.assert(after.alerted && (after.state === 'alert' || after.state === 'chase'), `Meow pulls it (${after.state})`);
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:level', order: 47, level: null, timeout: 180000,
    async run(t) {
      await t.G(() => window.__GAME__.story.flag('prologue.done', true));
      await t.loadLevel('meadow', 'start');
      await prepare(t);
      try {
        await waitLoaded(t);
        const s0 = await t.G(() => {
          const ctx = window.__GAME__.ctx, by = {};
          for (const e of ctx.enemies.list) (by[e.type] ??= []).push(e);
          const g = (e) => +(e.pos.y - ctx.physics.heightAt(e.pos.x, e.pos.z)).toFixed(2);
          return {
            counts: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])),
            dormant: ctx.enemies.list.filter((e) => e.dormant).length,
            perched: (by.rat_xbow ?? []).map((e) => ({ id: e.id, perched: e.perched, alt: g(e), y: e.pos.y })),
            crows: (by.crow ?? []).map((e) => ({ id: e.id, alt: g(e), x: e.pos.x, z: e.pos.z })),
            patrol: (by.rat_pike ?? []).map((e) => e.patrolRadius),
          };
        });
        t.log(`meadow spawns ${JSON.stringify(s0.counts)}, dormant ${s0.dormant}; xbows ${s0.perched.map((p) => `${p.perched ? 'perched' : 'ground'}@${p.alt}`).join(' ')}; crows alt ${s0.crows.map((c) => c.alt).join(' ')}; pike patrol r ${s0.patrol.join(' ')}`);
        t.assert(s0.counts.rat_pike === 4 && s0.counts.rat_xbow === 3 && s0.counts.crow === 4, `crossroads + Crow Fields spawns (${JSON.stringify(s0.counts)})`);
        t.assert(s0.dormant === 0, 'two far-apart zones never hold each other back (§8.3 budget is per fight)');
        t.assert(s0.perched.every((p) => p.perched && p.alt >= 0.9), 'crossbowmen sit on their wall / hay bales');
        t.assert(s0.crows.every((c) => c.alt > 2.5), 'crows fly');
        t.assert(s0.patrol.includes(4) && s0.patrol.includes(2), 'zone patrol radii reach the pikes');
        const t0 = await t.G(() => window.__GAME__.ctx.game.time);
        await until(t, (a) => window.__GAME__.ctx.game.time >= a + 1.5, t0, 20000);     // 1.5 s of sim time
        const s1 = await t.G(() => {
          const ctx = window.__GAME__.ctx;
          return {
            perched: ctx.enemies.list.filter((e) => e.type === 'rat_xbow').map((e) => ({ id: e.id, y: e.pos.y })),
            crows: ctx.enemies.list.filter((e) => e.type === 'crow').map((e) => ({ id: e.id, x: e.pos.x, z: e.pos.z, st: e.stateName })),
            mode: ctx.game.mode, loading: !!ctx.levels.loading, time: ctx.game.time,
          };
        });
        t.log(`after 1.5 s: mode ${s1.mode}, loading ${s1.loading}; crows moved ${s1.crows.map((c) => { const o = s0.crows.find((q) => q.id === c.id); return `${c.st}:${Math.hypot(c.x - o.x, c.z - o.z).toFixed(1)}`; }).join(' ')}`);
        t.assert(s1.perched.every((p) => Math.abs(p.y - s0.perched.find((q) => q.id === p.id).y) < 0.01), 'perched crossbowmen stay put');
        t.assert(s1.crows.every((c) => { const o = s0.crows.find((q) => q.id === c.id); return Math.hypot(c.x - o.x, c.z - o.z) > 1; }), 'crows circle');
        // the crossroads perch, seen from the road
        await t.G(() => {
          const g = window.__GAME__, ctx = g.ctx;
          const x = ctx.enemies.list.find((e) => e.type === 'rat_xbow' && e.pos.z < 0);
          x.facing = Math.atan2(-18 - x.pos.x, -38 - x.pos.z);
          return ctx.cam.shot({ anchor: x, pos: [1.2, 0.6, 3.6], look: [0, -0.1, 0], mode: 'cut', fov: 50 });
        });
        await t.frames(20);
        await t.shot('enemies/level-crossroads');
        // Crow Fields: a crossbowman on a hay bale under the circling crows
        await t.G(() => {
          const g = window.__GAME__, ctx = g.ctx;
          const x = ctx.enemies.list.find((e) => e.type === 'rat_xbow' && e.pos.z > 40);
          x.facing = Math.atan2(24 - x.pos.x, 40 - x.pos.z);
          return ctx.cam.shot({ anchor: x, pos: [1.6, 1.0, 5.0], look: [-1.0, 2.2, 0], mode: 'cut', fov: 60 });
        });
        await t.frames(20);
        await t.shot('enemies/level-crowfields');
      } finally {
        await t.G(() => { const g = window.__GAME__; g.story.flag('prologue.done', false); g.__en?.done(); });
      }
    },
  },
];
