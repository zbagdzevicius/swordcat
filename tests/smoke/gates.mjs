// tests/smoke/gates.mjs  (owner: core / integrator) — Phase W integration gates (IMPLEMENTATION_PLAN §8 + Phase W):
// per-level draw calls / triangles / programs against PERF §5, frame luma per level in play, combat with telegraphs, a
// boss, a celebration card and the phone layouts, with one screenshot each under tests/shots/gates/.
//   npm run build:test && SMOKE_GATES=1 SMOKE_ONLY=gates node tests/smoke.mjs   (previews dist-test/ on :4173)
// Without SMOKE_GATES=1 every block logs "skipped" (level: null) so `npm run check` stays lean; the same budgets are
// gated per area by perf:* (SMOKE_PERF=1) and art:warm.
const ON = process.env.SMOKE_GATES === '1';
const skip = (t) => { if (!ON) { t.log('skipped (SMOKE_GATES=1 runs the integration gates)'); return true; } return false; };

/** PERF §5 budgets per quality (stage I1 frame calls gate; the End column is reported). */
const BUDGET = { low: { frameCalls: 70, endCalls: 40, tris: 80000 }, med: { frameCalls: 120, endCalls: 60, tris: 150000 }, high: { frameCalls: 150, endCalls: 90, tris: 260000 } };
const LEVELS = ['meadow', 'forest', 'town', 'gate', 'bog', 'keep'];

async function play(t, level, spawn = 'start') {
  await t.loadLevel(level, spawn);
  await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.skipDialog?.(); g.setMode('play'); g.god(true); });
  await t.frames(60);
}

export default [
  {
    name: 'gates:levels', order: 90, level: null, timeout: 900000,
    async run(t) {
      if (skip(t)) return;
      await t.G(() => { const s = window.__GAME__.ctx.state; for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done', 'tut.done']) s.setFlag?.(k, true); });
      for (const id of LEVELS) {
        try { await play(t, id); } catch (e) { t.fail(`gates:levels ${id}: load failed ${String(e?.message ?? e).split('\n')[0]}`); continue; }
        const p = await t.G(() => window.__GAME__.perf());
        const st = await t.G(() => window.__GAME__.state());
        const fs = await t.G(() => window.__GAME__.art.frameStats({ exclude: 'actors' }));
        const preset = await t.G(() => window.__GAME__.ctx.env?.presetName ?? null);
        const q = p.quality ?? 'med', B = BUDGET[q] ?? BUDGET.med;
        const cats = Object.entries(p.byCat ?? {}).map(([k, v]) => `${k} ${v.calls ?? v}`).join(', ');
        t.log(`${id} (${preset}, ${q}): frame calls ${p.calls} / ${B.frameCalls} (End ${B.endCalls}), tris ${p.tris} / ${B.tris}, programs ${p.programs}, luma ${fs.luma.toFixed(3)} dark ${(fs.dark * 100).toFixed(1)}% black ${(fs.black * 100).toFixed(2)}% R−B ${fs.warmth.toFixed(3)} | ${cats}`);
        t.assert(p.calls <= B.frameCalls, `gates:levels ${id}: ${p.calls} frame calls > ${B.frameCalls} (PERF §5 I1, ${q})`);
        // PERF §5: triangles are an End-column target (stage I1 gates frame calls only): reported
        if (p.tris > B.tris) t.warn(`${id}: ${p.tris} tris over the End target ${B.tris} (${q})`);
        if (p.calls > B.endCalls) t.warn(`${id}: ${p.calls} calls over the End column (${B.endCalls})`);
        t.assert(fs.black < 0.005, `gates:levels ${id}: black ${(fs.black * 100).toFixed(2)} % ≥ 0.5 % (WA §2.3a)`);
        t.assert(fs.luma >= 0.36, `gates:levels ${id}: mean luma ${fs.luma.toFixed(3)} < 0.36 (WA §2.3a floor)`);
        t.assert(st.mode === 'play', `gates:levels ${id}: mode ${st.mode}`);
        await t.shot(`gates/level-${id}`, { freeze: true });
      }
    },
  },
  {
    name: 'gates:combat', order: 91, level: null, timeout: 180000,
    async run(t) {
      if (skip(t)) return;
      await play(t, 'meadow', 'start');
      await t.clearEvents();
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.spawn('rat_pike', p.x + 2.5, p.z + 2); g.spawn('rat_pike', p.x - 2.5, p.z + 2.5); g.spawn('rat_xbow', p.x + 1, p.z + 6); });
      const tele = await t.waitForEvent('combat:telegraph', 15000);
      t.assert(tele, 'gates:combat: no combat:telegraph within 15 s');
      await t.wait(250);
      await t.shot('gates/combat-telegraph', { freeze: true });
      const p = await t.G(() => window.__GAME__.perf());
      t.log(`combat: frame calls ${p.calls}, tris ${p.tris}, programs ${p.programs}, telegraph ${tele}`);
      await t.tap('KeyJ', 3, 220);
      await t.wait(300);
      await t.shot('gates/combat-swing', { freeze: true });
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
    },
  },
  {
    name: 'gates:boss', order: 92, level: null, timeout: 240000,
    async run(t) {
      if (skip(t)) return;
      await play(t, 'forest', 'boss');
      const id = await t.G(() => { const g = window.__GAME__; g.startBoss(); return g.ctx.enemies.boss?.def.id ?? null; });
      t.assert(!!id, 'gates:boss: no boss after startBoss on forest');
      await t.wait(6000);
      await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.skipDialog?.(); g.setMode('play'); });
      await t.wait(1500);
      const p = await t.G(() => window.__GAME__.perf());
      t.log(`boss ${id}: frame calls ${p.calls} (+${15} boss allowance), tris ${p.tris}`);
      t.assert(p.calls <= (BUDGET[p.quality]?.frameCalls ?? 120) + 15, `gates:boss: ${p.calls} calls over budget + 15`);
      await t.shot('gates/boss', { freeze: true });
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); });
    },
  },
  {
    name: 'gates:celebrate', order: 93, level: null, timeout: 120000,
    async run(t) {
      if (skip(t)) return;
      await play(t, 'meadow', 'start');
      const ok = await t.G(() => window.__GAME__.ctx.ui.celebrate('card', 'holy'));
      t.assert(ok !== false, 'gates:celebrate: celebrate(card) refused');
      await t.wait(700);
      await t.shot('gates/celebrate-card');
      await t.wait(4000);
      await t.G(() => window.__GAME__.ctx.ui.celebrate('sticker', 'bonk'));
      await t.wait(600);
      await t.shot('gates/celebrate-sticker');
    },
  },
  {
    name: 'gates:mobile', order: 94, level: null, timeout: 400000,
    async run(t) {
      if (skip(t)) return;
      for (const [w, h, tag] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
        const s = await t.viewport(w, h, { touch: true, level: 'meadow', spawn: 'start' });
        try {
          await s.frames(60);
          const st = await s.G(() => window.__GAME__.state());
          t.log(`phone ${tag} ${w}×${h}: calls ${st.frameCalls} tris ${st.frameTris} q=${st.quality} dpr ${st.dpr}`);
          await s.shot(`gates/mobile-${tag}`);
        } finally { await s.close(); }
      }
    },
  },
];
