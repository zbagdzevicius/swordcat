// tests/smoke/save.mjs  (owner: save) — persistence in the running game (GAME_DESIGN §19.7, tech.md §16).
//   save:autosave  (?test, autosave switched on for the block) New Game → level load, a real Vigil Stone checkpoint
//                  (healed state lands in the save), kitten rescue + objective coalesced into one write, cutscene
//                  deferral, settings written at once, a level exit storing the next level as the resume point.
//   save:continue  (?debug = a normal boot that loads the save) core applies the stored save at boot, the title never
//                  writes and ctx.state keeps the saved resume point, Continue (ui → story flow when present) lands on
//                  the saved Vigil Stone, Quit to Title saves and shows the stored game; a tech.md v1 save (hp 6, holy)
//                  is migrated at boot and continues; pagehide keeps the playtime. Restores ?test + an empty slot.
// Screenshots: tests/shots/save/*.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'swordcat.save.v1';
const SHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'save');
fs.mkdirSync(SHOT_DIR, { recursive: true });

/** The stored record, parsed (null if none). */
const readRec = (t) => t.page.evaluate((k) => { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }, KEY);
const saveInfo = (t) => t.G(() => { const s = window.__GAME__.ctx.save; return { ...s.lastSave, atTitle: s.atTitle, committed: s.committed, enabled: s.enabled, dirty: s.dirty, readOnly: s.readOnly, otherTab: s.otherTab }; });

/** Stand `dist` m in front of a Vigil Stone, facing it, so the follow camera frames her and the lantern. */
async function faceVigil(t, vigilId, dist = 2.6) {
  return t.G(([id, d]) => {
    const g = window.__GAME__, ctx = g.ctx, L = ctx.levels.current;
    const v = L.vigils.find((x) => x.id === id) ?? L.vigils[0];
    if (!v) return null;
    const x = v.pos.x + Math.sin(v.facing) * d, z = v.pos.z + Math.cos(v.facing) * d;
    const y = ctx.physics?.heightAt?.(x, z) ?? v.pos.y;
    ctx.player.teleport({ pos: new g.THREE.Vector3(x, y, z), facing: v.facing + Math.PI });
    ctx.cam?.recenter?.();
    return { id: v.id, pos: v.pos.toArray() };
  }, [vigilId, dist]);
}

/**
 * "Continue" the way a player does it: ui's main-menu flow (→ story.continueGame) when they exist, else save's own.
 * Not awaited in the page (the menu flow fades over real frames); callers wait for the spawn.
 */
async function continueVia(t) {
  return t.G(() => {
    const ctx = window.__GAME__.ctx;
    if (typeof ctx.ui?.continueGame === 'function') { ctx.ui.continueGame(); return 'ui'; }
    if (typeof ctx.story?.continueGame === 'function') { ctx.story.continueGame(); return 'story'; }
    ctx.save.continueGame(); return 'save';
  });
}

/** Pause → Quit to Title (ui, else story, else a plain title load). */
async function quitVia(t) {
  return t.G(() => {
    const ctx = window.__GAME__.ctx;
    if (typeof ctx.ui?.quitToTitle === 'function') { ctx.ui.quitToTitle(); return 'ui'; }
    if (typeof ctx.story?.toTitle === 'function') { ctx.story.toTitle(); return 'story'; }
    ctx.levels.load('meadow', 'title'); return 'levels';
  });
}

/** Wait until the current level sits at `spawnId` and no load is running. */
async function waitSpawn(t, spawnId, timeout = 30000) {
  try {
    await t.page.waitForFunction((sp) => { const c = window.__GAME__?.ctx; return c?.levels?.current?.spawnId === sp && !c.levels.loading; }, spawnId, { timeout, polling: 100 });
    return true;
  } catch { t.fail(`level never reached spawn "${spawnId}" within ${timeout} ms`); return false; }
}

/** Back to a clean ?test page: empty slot, booted, ready (the harness's state for later blocks). */
async function restoreTestPage(t) {
  // saving off first: the pagehide handler would otherwise patch the playtime back into the emptied slot
  await t.page.evaluate((k) => {
    window.__GAME__?.ctx?.save?.setEnabled(false);
    localStorage.removeItem(k); localStorage.removeItem(k + '.bak');
  }, KEY);
  await t.page.goto(`${t.base}?test=1&seed=1`);
  await t.page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 60000 });
}

export default [
  {
    name: 'save:autosave', order: 90, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await t.G(() => {
        const g = window.__GAME__, s = g.ctx.save;
        g.__saveSnap = g.ctx.state.toJSON();
        s.clear(); s.setEnabled(true);
        s.newGame({ difficulty: 'knight', skipPrologue: true });
      });
      try {
        // 1. level load → autosave (the new game takes over the slot)
        await t.loadLevel('meadow', 'start');
        await t.frames(4);
        let rec = await readRec(t);
        t.assert(rec?.progress === true, `level load: no progress save written (${JSON.stringify(rec)?.slice(0, 120)})`);
        t.assert(rec?.levelId === 'meadow' && rec?.spawnId === 'start', `level load: resume ${rec?.levelId}/${rec?.spawnId}, expected meadow/start`);
        t.assert(rec?.flags?.['prologue.done'] === true, 'skip-prologue flags not saved');
        t.assert(!('holy' in (rec ?? {})) && rec?.v === 1, 'record is not the §19.7 shape');

        // 2. a real Vigil Stone: she is hurt, uses the stone → checkpoint heals her → the save holds the healed state
        //    (the rats guarding the lane are cleared first so the screenshot shows the stone, not a rat in the lens)
        await t.G(() => {
          const ctx = window.__GAME__.ctx, L = ctx.levels.current, v = L.vigils.find((x) => x.id === 'vigil_1') ?? L.vigils[0];
          for (const e of [...ctx.enemies.list]) if (v && e.pos.distanceTo(v.pos) < 35) ctx.enemies.despawn(e);
          window.__GAME__.god(true);
        });
        const v = await faceVigil(t, 'vigil_1');
        t.assert(!!v, 'meadow has no Vigil Stone');
        await t.frames(30);
        await t.G(() => { window.__GAME__.player.setHp(3); });
        const before = (await saveInfo(t)).count;
        const used = await t.G((id) => window.__GAME__.ctx.levels.interact(id), v?.id);
        t.assert(used === true, `levels.interact(${v?.id}) refused`);
        await t.frames(3);
        rec = await readRec(t);
        const info = await saveInfo(t);
        t.assert(info.count === before + 1 && info.reason === 'checkpoint', `checkpoint: expected one write, got ${info.count - before} (${info.reason})`);
        t.assert(rec?.spawnId === v?.id, `checkpoint: resume spawn ${rec?.spawnId}, expected ${v?.id}`);
        t.assert(rec?.hp === rec?.maxHp && rec?.milk === rec?.milkMax, `checkpoint: saved hp ${rec?.hp}/${rec?.maxHp} milk ${rec?.milk}/${rec?.milkMax} (the heal must land before the write)`);
        await t.wait(900);
        await t.shot('save/checkpoint');

        // 3. several triggers in one step → one write
        const c0 = (await saveInfo(t)).count;
        await t.G(() => {
          const { ctx, E } = window.__GAME__;
          ctx.state.addKitten('biscuit');
          ctx.bus.emit(E.KITTEN_RESCUED, { kittenId: 'biscuit' });
          ctx.bus.emit(E.OBJECTIVE, { id: 'save_smoke', value: 1, max: 1, textKey: null, frozen: false, done: true });
          ctx.bus.emit(E.SAVE_REQUEST, {});
        });
        await t.frames(3);
        const c1 = (await saveInfo(t)).count;
        rec = await readRec(t);
        t.assert(c1 === c0 + 1, `coalescing: 3 triggers in one step wrote ${c1 - c0} times`);
        t.assert(rec?.kittens?.includes('biscuit'), 'rescued kitten not in the save');

        // 4. held while a story scene plays (G-01, the Tallbert gag), written once it ends (skipped here)
        const playing = await t.G(() => {
          const { ctx, E } = window.__GAME__;
          ctx.story.play('g01');
          ctx.state.fish = 42; ctx.bus.emit(E.SAVE_REQUEST, {});
          return !!ctx.story.isPlaying;
        });
        if (playing) {
          await t.frames(20);
          t.assert((await saveInfo(t)).count === c1, 'saved in the middle of a cutscene');
          await t.G(() => window.__GAME__.story.skip());
          await t.page.waitForFunction((n) => window.__GAME__.ctx.save.lastSave.count > n, c1, { timeout: 10000 }).catch(() => {});
        } else {
          t.warn('story.play(g01) did not start a scene; deferral checked in unit tests only');
          await t.frames(3);
        }
        rec = await readRec(t);
        t.assert((await saveInfo(t)).count >= c1 + 1 && rec?.fish === 42, 'deferred cutscene save not written after the cutscene');
        await t.setMode('play');

        // 5. settings are written at once (no frame needed), progress untouched
        const s5 = await t.G((k) => {
          const { ctx, E } = window.__GAME__;
          ctx.state.settings.music = 0.25;
          ctx.bus.emit(E.SETTINGS_CHANGED, { key: 'music', value: 0.25 });
          return JSON.parse(localStorage.getItem(k));
        }, KEY);
        t.assert(s5?.settings?.music === 0.25 && s5?.fish === 42 && s5?.progress === true, 'settings change not saved immediately');

        // 6. the bridge exit: the resume point becomes the next level before it even loads, then the load saves again
        await t.clearEvents();
        await t.G(() => { window.__GAME__.ctx.levels.exit('forest', 'start'); });
        t.assert(await t.waitForEvent('level:exit', 5000), 'level:exit not emitted');
        await t.frames(2);
        rec = await readRec(t);
        t.assert(rec?.levelId === 'forest' && rec?.spawnId === 'start', `exit: resume ${rec?.levelId}/${rec?.spawnId}, expected forest/start`);
        t.assert(rec?.flags?.['meadow.done'] === true && rec?.levels?.meadow?.cleared === true, 'exit: meadow.done / levels.meadow.cleared not saved');
        t.assert(await t.waitForEvent('level:loaded', 30000), 'forest did not load after the exit');
        await t.frames(5);
        const fin = await saveInfo(t);
        // M2: story's quest step completes on the load too (quest:update done → a 'quest' save right after the 'level' one)
        t.assert((fin.reason === 'level' || fin.reason === 'quest') && fin.ok === true, `forest load: last save ${fin.reason}/${fin.ok}`);
        if (!fin.count) t.log(`save state: ${JSON.stringify(fin)} story=${await t.G(() => { const s = window.__GAME__.ctx.story; return JSON.stringify({ p: s?.isPlaying, cur: s?.current?.id ?? s?.playing ?? null, mode: window.__GAME__.ctx.game.mode }); })} loading=${await t.G(() => !!window.__GAME__.ctx.levels?.loading)}`);
        t.log(`saves: ${fin.count}, last=${fin.reason}; record ${JSON.stringify(await readRec(t)).length} bytes`);
      } finally {
        await t.G(() => {
          const g = window.__GAME__, s = g.ctx.save;
          s.setEnabled(false); s.clear();
          if (g.__saveSnap) { g.ctx.state.reset(g.__saveSnap); g.ctx.bus.emit(g.E.SAVE_LOADED, { data: g.__saveSnap, reason: 'smoke' }); }
          s.endSession();
        });
      }
    },
  },
  {
    name: 'save:continue', order: 91, level: null, timeout: 180000,
    async run(t) {
      const page = t.page;
      try {
        // a mid-game save at meadow's vigil_2 (some fish, two kittens, Mochi, Nine Lives, non-default settings)
        await page.evaluate((k) => {
          localStorage.removeItem(k + '.bak');
          localStorage.setItem(k, JSON.stringify({
            v: 1, levelId: 'meadow', spawnId: 'vigil_2', difficulty: 'nine', playtime: 754.5, savedAt: Date.now() - 60000,
            hp: 8, maxHp: 8, lives: 6, milk: 2, milkMax: 2, fish: 137, shards: 0, heartBells: [], kittens: ['biscuit', 'noodle'], letters: [],
            companions: { unlocked: ['mochi'], active: ['mochi'] },
            upgrades: { satchel: 0, sharp: 0, quickCharge: false, valorGain: false, waveReach: false },
            cosmetics: { swords: ['borrowed', 'twig'], capes: ['cream'], sword: 'borrowed', cape: 'cream' }, levels: {},
            flags: { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true, 'meadow.mochi': true }, memeCamSeen: 0,
            settings: { master: 0.8, music: 0.35, sfx: 0.8, invertY: true, sensitivity: 1.3, quality: 'auto', shake: 0.5, reduceFlashes: false,
              holdStand: true, holdCharge: true, autoStand: false, patterns: false, subtitleSize: 1, dialogSpeed: 1, touchSize: 1 },
            progress: true,
          }));
        }, KEY);

        // 1. normal boot (no ?test): core loads + applies the save; the title backdrop does not overwrite it, and
        //    ctx.state carries the saved resume point again (what story's Continue reads)
        await page.goto(`${t.base}?debug=1&seed=7`);
        await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 60000 });
        await t.frames(30);
        const boot = await t.G(() => {
          const g = window.__GAME__, ctx = g.ctx, st = ctx.state;
          return { fish: st.fish, kittens: st.kittens.length, difficulty: st.difficulty, music: st.settings.music, invertY: st.settings.invertY,
            loaded: g.emitted('save:loaded') || ctx.save.loaded?.progress === true, level: ctx.levels.current?.id, spawn: ctx.levels.current?.spawnId,
            stLevel: st.levelId, stSpawn: st.spawnId, atTitle: ctx.save.atTitle, hasSave: ctx.save.hasSave(), summary: ctx.save.summary() };
        });
        t.assert(boot.loaded && boot.fish === 137 && boot.kittens === 2 && boot.difficulty === 'nine', `boot: save not applied (${JSON.stringify(boot)})`);
        t.assert(boot.music === 0.35 && boot.invertY === true, 'boot: saved settings not applied');
        t.assert(boot.level === 'meadow' && boot.spawn === 'title' && boot.atTitle, `boot: expected the title backdrop, got ${boot.level}/${boot.spawn} atTitle=${boot.atTitle}`);
        t.assert(boot.stLevel === 'meadow' && boot.stSpawn === 'vigil_2', `boot: ctx.state resume point ${boot.stLevel}/${boot.stSpawn}, expected meadow/vigil_2`);
        t.assert(boot.hasSave && boot.summary?.spawnId === 'vigil_2' && boot.summary?.kittens === 2, 'boot: Continue summary wrong');
        await t.shot('save/title');
        let rec = await readRec(t);
        t.assert(rec?.spawnId === 'vigil_2' && rec?.playtime === 754.5, `the title overwrote the save (${rec?.spawnId}, ${rec?.playtime})`);

        // 2. Continue (the game's own menu flow when ui/story provide it) → the saved Vigil Stone, lit; the load autosaves
        const via = await continueVia(t);
        await waitSpawn(t, 'vigil_2');
        await t.frames(10);
        const cont = await t.G(() => {
          const ctx = window.__GAME__.ctx, L = ctx.levels.current, v = L?.vigils?.find((x) => x.id === 'vigil_2');
          return { level: L?.id, spawn: L?.spawnId, lit: v?.lit, vpos: v?.spawn?.pos?.toArray(), ppos: ctx.player.pos.toArray(),
            playtime: ctx.state.playtime, fish: ctx.state.fish, info: { ...ctx.save.lastSave }, active: ctx.save.active };
        });
        t.log(`continue via ${via}`);
        t.assert(cont.level === 'meadow' && cont.spawn === 'vigil_2' && cont.lit === true, `continue: level ${cont.level}/${cont.spawn}, stone lit ${cont.lit}`);
        const d = cont.vpos ? Math.hypot(cont.ppos[0] - cont.vpos[0], cont.ppos[2] - cont.vpos[2]) : 99;
        t.assert(d < 1.5, `continue: she is ${d.toFixed(2)} m from the vigil_2 spawn`);
        t.assert(cont.fish === 137, `continue: fish ${cont.fish}`);
        t.assert(cont.playtime >= 754.5 && cont.playtime < 765, `continue: playtime ${cont.playtime?.toFixed(1)} (title time must not leak in)`);
        await page.waitForFunction(() => window.__GAME__.ctx.save.lastSave.reason === 'level', null, { timeout: 15000 }).catch(() => {});
        const after = await t.G(() => ({ ...window.__GAME__.ctx.save.lastSave, active: window.__GAME__.ctx.save.active }));
        t.assert(after.active && after.reason === 'level' && after.ok, `continue: no autosave after the load (${JSON.stringify(after)})`);
        await t.G(() => { const c = window.__GAME__.ctx; for (const e of [...c.enemies.list]) if (e.pos.distanceTo(c.player.pos) < 30) c.enemies.despawn(e); });
        await faceVigil(t, 'vigil_2', 2.8);
        await t.frames(40);
        await t.shot('save/continue');

        // 3. Quit to Title: final save; the title shows the stored game again
        await t.G(() => { window.__GAME__.ctx.state.fish = 150; });
        await quitVia(t);
        await waitSpawn(t, 'title');
        await t.frames(5);
        rec = await readRec(t);
        const q = await t.G(() => { const ctx = window.__GAME__.ctx; return { atTitle: ctx.save.atTitle, fish: ctx.state.fish, sp: ctx.state.spawnId }; });
        t.assert(q.atTitle && rec?.fish === 150 && rec?.spawnId === 'vigil_2', `quit to title: stored fish ${rec?.fish}, spawn ${rec?.spawnId}, atTitle ${q.atTitle}`);
        t.assert(q.fish === 150 && q.sp === 'vigil_2', `quit to title: ctx.state fish ${q.fish} / spawn ${q.sp}`);

        // 4. tech.md's original v1 shape (hp 6, holy, inventory, quests) is migrated at boot and continues
        await page.evaluate((k) => {
          localStorage.removeItem(k + '.bak');
          localStorage.setItem(k, JSON.stringify({ v: 1, levelId: 'meadow', spawnId: 'start', hp: 4, maxHp: 6, holy: 35,
            flags: { 'prologue.armour': true, 'prologue.done': true }, inventory: { fish: 23 }, kittens: ['biscuit'], quests: { q1: 'done' },
            playtime: 99, savedAt: 1, settings: { master: 0.7, music: 0.6, sfx: 0.8, invertY: false, sensitivity: 1, quality: 'auto' } }));
        }, KEY);
        await page.reload();
        await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 60000 });
        const mig = await t.G(() => {
          const st = window.__GAME__.ctx.state;
          return { hp: st.hp, maxHp: st.maxHp, holy: 'holy' in st, fish: st.fish, master: st.settings.master, shake: st.settings.shake,
            kittens: st.kittens, has: window.__GAME__.ctx.save.hasSave() };
        });
        t.assert(mig.maxHp === 8 && mig.hp === 8 && !mig.holy && mig.fish === 23 && mig.master === 0.7 && mig.shake === 1 && mig.has,
          `legacy v1 save not migrated: ${JSON.stringify(mig)}`);
        await continueVia(t);
        await waitSpawn(t, 'start');
        await page.waitForFunction(() => window.__GAME__.ctx.save.lastSave.ok === true, null, { timeout: 15000 }).catch(() => {});
        rec = await readRec(t);
        t.assert(rec?.maxHp === 8 && !('holy' in (rec ?? {})) && !('inventory' in (rec ?? {})) && rec?.progress === true && rec?.fish === 23,
          `the first autosave after a legacy continue is not §19.7: ${JSON.stringify(rec)?.slice(0, 160)}`);
        await t.frames(30);
        await t.shot('save/legacy-continue');
        await t.blankCheck('save/legacy-continue');

        // 5. the slot is kept current when the tab goes away (pagehide → playtime patch), and a reload sees it
        const pt = await t.G(() => { const ctx = window.__GAME__.ctx; ctx.state.playtime += 30; return ctx.state.playtime; });
        await page.reload();
        await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 60000 });
        rec = await readRec(t);
        t.assert(Math.abs((rec?.playtime ?? 0) - pt) < 1, `pagehide: stored playtime ${rec?.playtime}, expected ≈ ${pt.toFixed(1)}`);
      } finally {
        await restoreTestPage(t);
      }
    },
  },
];
