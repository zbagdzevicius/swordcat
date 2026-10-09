// tests/smoke/ui.mjs  (owner: ui) — the §14 screens in the running game, driven through __GAME__ hooks and the bus.
// Screenshots → tests/shots/ui/*.png. Blocks: HUD (+ boss bar, objective, toasts, threat arrows, interaction tag, story
// prompt, tutorial hint, lock pips), dialogue + cinema (letterbox, caption, chapter card, life lost), menus (pause,
// settings, kittens, letters, vigil, game over → retry), title flow (title → main → new game → settings → credits),
// results (showResults resolves on confirm), touch controls, Meme Cam caption.
/** Evaluate in the page with __GAME__ as G, ctx, E and the ui. */
const inPage = (t, fn, arg) => t.G(fn, arg);

/** Pause the sim around a screenshot so the frame is stable under GPU load (restores the time scale). */
async function shot(t, name) {
  await t.frames(2);
  return t.shot(`ui/${name}`);
}

/** §14.1: no visible ui / touch text under 16 px (SVG illustration text excluded). */
async function fontAudit(t, label) {
  const bad = await inPage(t, () => {
    const out = [];
    for (const root of [document.getElementById('ui'), document.getElementById('touch')]) {
      if (!root) continue;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const e = n.parentElement;
        if (!n.textContent.trim() || !e || e.closest('svg')) continue;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        let vis = true;
        for (let a = e; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) { vis = false; break; } }
        if (!vis) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 15.9) out.push(`${e.className || e.tagName} ${fs.toFixed(1)}px "${n.textContent.trim().slice(0, 24)}"`);
      }
    }
    return [...new Set(out)].slice(0, 6);
  });
  t.assert(bad.length === 0, `${label}: text under 16 px: ${bad.join('; ')}`);
}

/** Focus the item of the top menu screen whose text matches `re` (keyboard nav is covered elsewhere; this is load-proof). */
const focusItem = (t, re) => inPage(t, (src) => {
  const m = window.__GAME__.ctx.ui.menus, s = m.top, rx = new RegExp(src);
  const i = s.items.findIndex((it) => rx.test(it.el.textContent));
  if (i >= 0) m._focus(s, i, false);
  return i;
}, re);

/** Freeze the CSS animations under `sel` for a screenshot (page.screenshot can take > 1 s under GPU load). */
const freezeAnims = (t, sel, on) => inPage(t, ([s, o]) => {
  for (const e of document.querySelectorAll(`${s}, ${s} *`)) e.style.animationPlayState = o ? 'paused' : '';
}, [sel, on]);

export default [
  {
    name: 'ui:hud', order: 40, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      // base HUD: hearts = maxHp / 2, valor meter, lives, milk, counters
      const base = await inPage(t, () => {
        const g = window.__GAME__, p = g.ctx.player;
        g.ctx.ui.hud.poll(true);
        return { hearts: document.querySelectorAll('.hud-hearts .heart').length, maxHp: p.maxHp, hud: !!document.querySelector('.hud:not(.is-hidden)'),
          valor: !!document.querySelector('.hud-valor svg'), milk: document.querySelectorAll('.hud-milk .milk').length, milkMax: p.milkMax,
          lives: document.querySelector('.hud-lives .lives-n')?.textContent ?? '' };
      });
      t.assert(base.hud, 'HUD is visible in play');
      t.assert(base.hearts === Math.ceil(base.maxHp / 2), `hearts ${base.hearts} vs maxHp ${base.maxHp}`);
      t.assert(base.valor, 'valor sword meter rendered');
      t.assert(base.milk === base.milkMax, `milk bottles ${base.milk} vs ${base.milkMax}`);
      t.assert(/×\s*9|×9/.test(base.lives), `lives counter "${base.lives}"`);
      // low HP, full valor (gold + sun), grit, fish pop, a companion-free HUD, objective + boss + toasts
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        g.god(true);
        g.player.setHp(3);
        g.player.setValor(100);
        ctx.state.fish = 42;
        ctx.bus.emit(E.PLAYER_DAMAGED, { amount: 1, hp: 3, maxHp: ctx.player.maxHp, source: null });
        ctx.bus.emit(E.OBJECTIVE, { id: 'net_ropes', value: 1, max: 3, textKey: 'obj.ropes', frozen: false, done: false });
        const boss = { hp: 640, maxHp: 1000, alive: true, pos: ctx.player.pos.clone() };
        window.__uiBoss = boss;
        ctx.bus.emit(E.BOSS_START, { boss, id: 'grizzlechop', name: 'CAPTAIN GRIZZLECHOP', maxHp: 1000, phases: [1, 0.65, 0.35], dizzyMax: 100 });
        ctx.bus.emit(E.BOSS_DIZZY, { boss, value: 55, max: 100, dizzy: false });
        ctx.bus.emit(E.TOAST, { text: ctx.strings.t('toast.kitten', { n: 1, max: 3 }), key: 'toast.kitten' });
        ctx.bus.emit(E.ITEM_PICKUP, { item: 'letter', id: 'l1', amount: 1, position: ctx.player.pos.clone() });
        ctx.ui.hint('tut.combo', { step: 3, total: 8 });
        ctx.state.companions.unlocked = ['mochi'];
        try { ctx.companions.setActive(['mochi']); } catch (err) { console.warn('[ui smoke] setActive', err?.message); }
        ctx.ui.hud.showSaved();
      });
      await t.wait(500);
      await inPage(t, () => { window.__uiBoss.hp = 420; });
      await t.wait(350);
      const s1 = await inPage(t, () => ({
        low: !!document.querySelector('.hud-hearts.is-low'), full: !!document.querySelector('.hud-valor.is-full'),
        boss: !!document.querySelector('.hud-boss.is-on'), bossName: document.querySelector('.boss-name span')?.textContent,
        obj: document.querySelector('.hud-obj.is-on .obj-txt')?.textContent ?? '', toasts: document.querySelectorAll('.ui-toast').length,
        hint: document.querySelector('.ui-hint.is-on .hint-txt')?.innerHTML ?? '', fish: document.querySelector('.hud-fish .c-n')?.textContent,
        comp: !!document.querySelector('.hud-comp.is-on .comp-face svg'), compN: window.__GAME__.ctx.companions?.active?.length ?? 0,
        saved: document.querySelector('.hud-save.is-on .save-txt')?.textContent ?? '',
      }));
      t.assert(!s1.low, 'no low-HP pulse at 3 HP');
      t.assert(s1.full, 'valor meter is gold at 100');
      t.assert(s1.boss && /GRIZZLECHOP/.test(s1.bossName ?? ''), `boss bar shown (${s1.bossName})`);
      t.assert(/1\/3/.test(s1.obj), `objective line "${s1.obj}"`);
      t.assert(s1.toasts >= 2, `toasts shown: ${s1.toasts}`);
      t.assert(/ui-key/.test(s1.hint), 'tutorial hint renders keycaps');
      t.assert(s1.fish === '42', `fish counter ${s1.fish}`);
      t.assert(s1.comp || s1.compN === 0, `companion portrait shown for the active companion (${s1.compN})`);
      if (!s1.compN) t.warn('companions.setActive(["mochi"]) gave no active companion; portrait not checked');
      t.assert(/saved/i.test(s1.saved), `"Saved" wax seal ("${s1.saved}")`);
      await fontAudit(t, 'HUD');
      await shot(t, '01-hud');
      // threat arrow: a red telegraph from an enemy behind her; interaction tag; story prompt with a filling ring
      const arrow = await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, p = ctx.player, cam = ctx.camera;
        const back = cam.getWorldDirection(new g.THREE.Vector3()).setY(0).normalize().multiplyScalar(-6);
        const e = ctx.enemies.spawn('rat_pike', p.pos.clone().add(back));
        window.__uiRat = e;
        ctx.bus.emit(E.TELEGRAPH, { id: 'ui-smoke-tell', actor: e, kind: 'red', shape: 'glint', pos: e.pos, dir: null, size: 1, duration: 3 });
        ctx.bus.emit(E.INTERACT_AVAILABLE, { target: { id: 'vigil_1', kind: 'vigil', position: p.pos.clone().add(cam.getWorldDirection(new g.THREE.Vector3()).setY(0).normalize().multiplyScalar(2.5)) }, prompt: 'tut.vigil' });
        ctx.bus.emit(E.PROMPT, { action: 'guard', hold: 1, textKey: 'prompt.holdStand', progress: 0.6, done: false });
        return true;
      });
      t.assert(arrow, 'spawned a telegraphing rat behind her');
      await t.wait(400);
      const s2 = await inPage(t, () => ({ arrows: document.querySelectorAll('.ui-arrow.is-on').length, tag: !!document.querySelector('.ui-tag.is-on'),
        tagTxt: document.querySelector('.ui-tag .tag-txt')?.textContent, prompt: !!document.querySelector('.ui-prompt.is-on') }));
      t.assert(s2.arrows >= 1, `off-screen threat arrow shown (${s2.arrows})`);
      t.assert(s2.tag, `interaction tag shown ("${s2.tagTxt}")`);
      t.assert(s2.prompt, 'story prompt overlay shown');
      await shot(t, '02-hud-arrows-tag-prompt');
      // reduce HP to 2 → pulse; cleanup
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        g.player.setHp(2); ctx.ui.hud.poll(true);
        ctx.bus.emit(E.TELEGRAPH_END, { id: 'ui-smoke-tell' });
        ctx.bus.emit(E.INTERACT_CLEAR, {});
        ctx.bus.emit(E.PROMPT, { action: 'guard', hold: 1, textKey: 'prompt.holdStand', progress: 1, done: true });
        ctx.bus.emit(E.BOSS_DEFEATED, { boss: window.__uiBoss, id: 'grizzlechop' });
        ctx.bus.emit(E.OBJECTIVE, { id: 'net_ropes', value: 3, max: 3, textKey: 'obj.ropes', frozen: false, done: true });
        ctx.ui.hint(null);
        if (window.__uiRat) ctx.enemies.despawn(window.__uiRat);
        try { ctx.companions.setActive([]); } catch { /* ignore */ }
        ctx.state.companions.unlocked = [];
      });
      await t.wait(200);
      const low = await inPage(t, () => !!document.querySelector('.hud-hearts.is-low'));
      t.assert(low, 'hearts pulse at HP ≤ 2');
      await inPage(t, () => { const g = window.__GAME__; g.player.setHp(g.ctx.player.maxHp); g.god(false); });
    },
  },
  {
    name: 'ui:dialog', order: 41, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        g.setMode('dialog');
        ctx.bus.emit(E.DIALOG_START, { id: 'ui-smoke' });
        ctx.bus.emit(E.DIALOG_LINE, { speaker: 'swordcat', text: ctx.strings.t('cs01.9'), portrait: 'swordcat', id: 'ui-smoke' });
      });
      await t.wait(300);
      const mid = await inPage(t, () => ({ on: !!document.querySelector('.ui-dialog.is-on'), n: document.querySelector('.dlg-text')?.textContent.length ?? 0,
        name: document.querySelector('.dlg-name span')?.textContent }));
      t.assert(mid.on, 'dialogue scroll open');
      t.assert(mid.n > 0 && mid.n < 80, `typewriter reveals gradually (${mid.n} chars after 0.3 s)`);
      t.assert(mid.name === 'Clem', `speaker ribbon "${mid.name}"`);
      await t.wait(3200);
      const done = await inPage(t, () => !!document.querySelector('.ui-dialog.is-complete'));
      t.assert(done, 'line completes and shows the paw');
      await fontAudit(t, 'dialogue');
      await shot(t, '03-dialog');
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        ctx.bus.emit(E.DIALOG_LINE, { speaker: 'mochi', text: ctx.strings.t('bark.mochi.ability.1') !== 'bark.mochi.ability.1' ? ctx.strings.t('bark.mochi.ability.1') : 'Squire on duty!', portrait: 'mochi', id: 'ui-smoke' });
      });
      await t.wait(1200);
      await shot(t, '04-dialog-mochi');
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.DIALOG_END, { id: 'ui-smoke' }); g.setMode('play'); });
      await t.wait(300);
      t.assert(!(await inPage(t, () => !!document.querySelector('.ui-dialog.is-on'))), 'dialogue closes on dialog:end');
      // cinema: letterbox + caption + chapter card via the story-facing api
      await inPage(t, () => {
        const ui = window.__GAME__.ctx.ui;
        ui.cinema.apply({ letterbox: true, hud: false, caption: 'cs01.caption' });
        ui.cinema.apply({ chapter: 1 });
      });
      await t.wait(1300);
      const cin = await inPage(t, () => ({ lb: !!document.querySelector('.ui-cinema.is-letterbox'), cap: document.querySelector('.cin-caption.is-on')?.textContent ?? '',
        chap: document.querySelector('.cin-chapter.is-on .chap-title')?.textContent ?? '', hud: !!document.querySelector('.hud.is-hidden') }));
      t.assert(cin.lb, 'letterbox bars on');
      t.assert(cin.cap.length > 5, `caption "${cin.cap}"`);
      t.assert(cin.chap.length > 3, `chapter card "${cin.chap}"`);
      t.assert(cin.hud, 'HUD hidden by the cutscene ui step');
      await shot(t, '05-chapter-letterbox');
      await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui.cinema.apply({ letterbox: false, hud: true, caption: null }, null, true); ui.cinema.clear(); });
      // life lost card
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_LIFE_LOST, { lives: 8, gameOver: false }); });
      await t.wait(380);
      await freezeAnims(t, '.cin-life', true);
      const life = await inPage(t, () => document.querySelector('.cin-life.is-on .life-txt')?.textContent ?? '');
      t.assert(/8/.test(life), `life lost card "${life}"`);
      await shot(t, '06-life-lost');
      await freezeAnims(t, '.cin-life', false);
      await t.wait(1600);
      t.assert(!(await inPage(t, () => !!document.querySelector('.cin-life.is-on'))), 'life lost card clears after 1.5 s');
    },
  },
  {
    name: 'ui:menus', order: 42, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await inPage(t, () => { window.__GAME__.kittens(5); window.__GAME__.ctx.state.letters = ['l1', 'l3']; });
      await t.page.mouse.move(640, 360);   // resting cursor mid-screen, where the pause buttons appear
      await t.page.keyboard.press('KeyP');
      await t.wait(500);
      const f0 = await inPage(t, () => [...document.querySelectorAll('.menu--pause .mi')].findIndex((b) => b.classList.contains('is-focus')));
      t.assert(f0 === 0, `pause opens focused on Resume despite the resting cursor (focus ${f0})`);
      const p = await inPage(t, () => ({ mode: window.__GAME__.mode, pause: !!document.querySelector('.menu--pause.is-on'), btns: document.querySelectorAll('.menu--pause .mi').length }));
      t.assert(p.mode === 'menu', `P pauses (mode ${p.mode})`);
      t.assert(p.pause && p.btns >= 5, `pause menu with ${p.btns} buttons`);
      await fontAudit(t, 'pause');
      await shot(t, '07-pause');
      // Kittens grid
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const kit = await inPage(t, () => ({ cells: document.querySelectorAll('.kit-cell').length, found: document.querySelectorAll('.kit-cell.is-found').length }));
      t.assert(kit.cells === 18 && kit.found === 5, `kittens grid ${kit.found}/${kit.cells}`);
      await fontAudit(t, 'kittens');
      await shot(t, '08-kittens');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      // Letters
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const let_ = await inPage(t, () => ({ found: document.querySelectorAll('.lv-tab.is-found').length, text: document.querySelector('.lv-text')?.textContent ?? '' }));
      t.assert(let_.found === 2, `letters found tabs ${let_.found}`);
      t.assert(/Mum/.test(let_.text), `letter viewer opens on the first found letter (${let_.text.slice(0, 40)})`);
      await t.page.keyboard.press('ArrowDown'); await t.wait(350);
      await t.page.keyboard.press('ArrowDown'); await t.wait(500);
      const l3 = await inPage(t, () => document.querySelector('.lv-text')?.textContent ?? '');
      t.assert(/NAYSAYER/.test(l3), `focusing letter 3 shows it in the viewer (${l3.slice(0, 40)})`);
      await fontAudit(t, 'letters');
      await shot(t, '09-letters');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      // Settings: change master volume with ArrowRight, toggle reduce flashes
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const before = await inPage(t, () => window.__GAME__.ctx.state.settings.master);
      await t.page.keyboard.press('ArrowRight'); await t.wait(150);
      await t.page.keyboard.press('ArrowLeft'); await t.wait(150);
      await t.page.keyboard.press('ArrowLeft'); await t.wait(150);
      const after = await inPage(t, () => ({ master: window.__GAME__.ctx.state.settings.master, ev: window.__GAME__.emitted('settings:changed') }));
      t.assert(Math.abs(after.master - (before - 0.05)) < 1e-6, `master volume stepped ${before} → ${after.master}`);
      t.assert(after.ev, 'settings:changed emitted');
      await fontAudit(t, 'settings');
      await shot(t, '10-settings');
      await inPage(t, () => { const g = window.__GAME__; g.ctx.state.settings.master = 0.8; });
      await t.page.keyboard.press('Escape'); await t.wait(300);
      await t.page.keyboard.press('Escape'); await t.wait(400);
      const resumed = await inPage(t, () => ({ mode: window.__GAME__.mode, open: !!document.querySelector('.menu-screen') }));
      t.assert(resumed.mode === 'play' && !resumed.open, `Esc resumes (mode ${resumed.mode})`);
      // external unpause closes the pause screen (smoke harness / debug)
      await inPage(t, () => window.__GAME__.ctx.ui.pause());
      await inPage(t, () => window.__GAME__.setMode('play'));
      await t.wait(200);
      t.assert(!(await inPage(t, () => !!document.querySelector('.menu--pause'))), 'external setMode(play) closes the pause menu');
      // Vigil Stone menu
      await inPage(t, () => { const g = window.__GAME__; g.ctx.state.companions.unlocked = ['mochi']; g.ctx.ui.openVigil(); });
      await t.wait(500);
      t.assert(await inPage(t, () => !!document.querySelector('.menu--vigil.is-on')), 'vigil menu open');
      await shot(t, '11-vigil');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      await inPage(t, () => { window.__GAME__.ctx.state.companions.unlocked = []; });
      // Game over → Wake up reloads the level and returns to play
      await inPage(t, () => window.__GAME__.ctx.ui.gameOver());
      await t.wait(600);
      t.assert(await inPage(t, () => !!document.querySelector('.menu--gameover.is-on') && window.__GAME__.mode === 'menu'), 'game over screen (world frozen)');
      await shot(t, '12-gameover');
      const goBtns = await inPage(t, () => [...document.querySelectorAll('.menu--gameover .mi')].map((b) => b.textContent.trim()));
      t.assert(goBtns.length === 2, `game over offers 2 options (${goBtns.join(' | ')})`);
      await t.clearEvents();
      await t.page.keyboard.press('Enter');
      const loaded = await t.waitForEvent('level:loaded', 30000);
      t.assert(loaded, 'Wake up reloads the level');
      await t.wait(300);
      t.assert((await inPage(t, () => window.__GAME__.mode)) === 'play', 'back in play after Wake up');
    },
  },
  {
    name: 'ui:results', order: 43, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await inPage(t, () => {
        const ui = window.__GAME__.ctx.ui;
        ui.results.autoContinue = false;
        window.__uiRes = 'pending';
        ui.showResults({ levelId: 'meadow', time: 754, kittens: 2, kittensTotal: 3, letter: true, fish: 128, lives: 8, livesLost: 1, rank: 'pawsome' }).then(() => { window.__uiRes = 'done'; });
      });
      await t.wait(2600);
      const r = await inPage(t, () => ({ on: !!document.querySelector('.ui-results.is-on'), rows: document.querySelectorAll('.res-row.is-in').length,
        stamp: document.querySelector('.res-stamp span')?.textContent, mode: window.__GAME__.mode }));
      t.assert(r.on && r.rows === 5, `results rows ${r.rows}`);
      t.assert(r.stamp === 'Paw-some', `rank stamp "${r.stamp}"`);
      await fontAudit(t, 'results');
      const stampFit = await inPage(t, () => {
        const p = document.querySelector('.res-panel').getBoundingClientRect(), s = document.querySelector('.res-stamp span').getBoundingClientRect();
        return s.left >= p.left && s.right <= p.right && s.bottom <= p.bottom;
      });
      t.assert(stampFit, 'rank ribbon inside the results card');
      await shot(t, '13-results');
      await t.page.keyboard.press('Enter');
      await t.wait(400);
      const after = await inPage(t, () => ({ res: window.__uiRes, mode: window.__GAME__.mode }));
      t.assert(after.res === 'done', 'showResults resolves on confirm');
      t.assert(after.mode === 'play', `mode handed back (${after.mode})`);
      await inPage(t, () => { window.__GAME__.ctx.ui.results.autoContinue = true; });
    },
  },
  {
    name: 'ui:meme-touch', order: 44, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await inPage(t, () => window.__GAME__.idle(16));
      const meme = await t.waitForEvent('camera:meme', 6000);
      t.assert(meme, 'Meme Cam started');
      await t.wait(2600);
      const m = await inPage(t, () => ({ cap: document.querySelector('.cin-meme.is-on')?.textContent ?? '', hud: !!document.querySelector('.hud.is-meme') }));
      t.assert(m.cap.length > 5, `meme caption "${m.cap}"`);
      t.assert(m.hud, 'HUD fades in Meme Cam');
      await shot(t, '14-memecam');
      await t.page.keyboard.press('KeyW');
      await t.wait(800);
      // touch controls (forced on), then off again
      await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui.touch.enable(true); window.__GAME__.ctx.input.setDevice('touch'); window.__GAME__.player.setValor(100); window.__GAME__.player.setShards(2); });
      await t.wait(500);
      const tc = await inPage(t, () => ({ on: document.getElementById('touch')?.classList.contains('on'), btns: [...document.querySelectorAll('.touch-cluster .tbtn')].filter((b) => !b.classList.contains('is-hidden')).length }));
      t.assert(tc.on && tc.btns >= 6, `touch cluster visible (${tc.btns} buttons)`);
      // a virtual press reaches input
      const pressed = await inPage(t, () => {
        const b = document.querySelector('.tb-jump'), r = b.getBoundingClientRect();
        const ev = (type) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: r.x + 5, clientY: r.y + 5, pointerType: 'touch' }));
        ev('pointerdown');
        const down = window.__GAME__.ctx.input.down('jump');
        ev('pointerup');
        return down;
      });
      t.assert(pressed, 'touch Jump button drives input.setVirtual');
      await shot(t, '15-touch');
      await inPage(t, () => { const g = window.__GAME__; g.ctx.ui.touch.enable(false); g.ctx.input.setDevice('kbm'); g.player.setShards(0); g.player.setValor(0); });
    },
  },
  {
    name: 'ui:title', order: 45, level: null, timeout: 90000,
    async run(t) {
      await inPage(t, () => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); g.ctx.ui.showTitle(); });
      await t.wait(2900);
      const s = await inPage(t, () => ({ on: !!document.querySelector('.ui-title.is-on.is-ready'), mode: window.__GAME__.mode, hud: !!document.querySelector('.hud.is-hidden') }));
      t.assert(s.on, 'title screen with the press prompt');
      t.assert(s.mode !== 'play', `world held still under the title (mode ${s.mode})`);
      t.assert(s.hud, 'HUD hidden on the title');
      await shot(t, '16-title');
      await t.page.keyboard.press('Enter');
      await t.wait(600);
      const main = await inPage(t, () => [...document.querySelectorAll('.menu--main .btn-lbl')].map((b) => b.textContent));
      t.assert(main.includes('New Game') && main.includes('Settings') && main.includes('Credits'), `main menu: ${main.join(' · ')}`);
      await shot(t, '17-main-menu');
      // New Game (navigate by label: a stored save adds Continue above it)
      const ngAt = main.indexOf('New Game');
      for (let i = 0; i < ngAt; i++) { await t.page.keyboard.press('ArrowDown'); await t.wait(120); }
      await t.page.keyboard.press('Enter');
      await t.wait(500);
      const diff = await inPage(t, () => document.querySelectorAll('.menu--newgame .btn--card').length);
      t.assert(diff === 3, 'difficulty cards: Kitten / Knight / Nine Lives');
      await shot(t, '18-new-game');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      for (let i = ngAt; i < main.indexOf('Credits'); i++) { await t.page.keyboard.press('ArrowDown'); await t.wait(120); }
      await t.page.keyboard.press('Enter'); await t.wait(700);  // Credits
      t.assert(await inPage(t, () => !!document.querySelector('.menu--credits.is-on')), 'credits open');
      await t.wait(1800);
      await fontAudit(t, 'credits');
      const crFit = await inPage(t, () => document.querySelector('.menu--credits .menu-panel').getBoundingClientRect().bottom <= innerHeight + 1);
      t.assert(crFit, 'credits panel fits the viewport');
      await shot(t, '19-credits');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      // New Game → Kitten: the ui starts the game (story.newGame, else the prologue load)
      await t.clearEvents();
      await inPage(t, () => window.__GAME__.ctx.ui.menus.openNewGame());
      await t.wait(400);
      await t.page.keyboard.press('ArrowUp'); await t.wait(150);
      await t.page.keyboard.press('Enter');
      const loaded = await t.waitForEvent('level:loaded', 40000);
      t.assert(loaded, 'New Game loads the first level');
      await t.wait(600);
      const ng = await inPage(t, () => ({ title: !!document.querySelector('.ui-title.is-on'), diff: window.__GAME__.ctx.state.difficulty, level: window.__GAME__.levelId }));
      t.assert(!ng.title, 'title closed after New Game');
      t.assert(ng.diff === 'kitten', `difficulty set (${ng.diff})`);
      await inPage(t, () => { const g = window.__GAME__; g.story.skip(); g.ctx.state.difficulty = 'knight'; g.ctx.bus.emit(g.E.SETTINGS_CHANGED, { key: 'difficulty', value: 'knight' }); g.setMode('play'); });
    },
  },
  {
    // M2: hub stations (§13.3) — every shop panel, the two-press purchase flow (fish, state, save request), equipping a
    // skin / cape, the Quest Board (§12.5) and travel through it, the Lookout and the Barracks.
    name: 'ui:hub', order: 46, level: 'town', spawn: 'hub', timeout: 360000,
    async run(t) {
      await inPage(t, () => {
        const g = window.__GAME__, st = g.ctx.state;
        g.god(true);
        for (const f of ['prologue.done', 'meadow.done', 'forest.done', 'town.free']) g.story.flag(f, true);
        st.levels = { meadow: { cleared: true, bestRank: 'pawsome', bestTime: 812 }, forest: { cleared: true, bestRank: 'purrfect', bestTime: 1034 } };
        g.kittens(7); st.letters = ['l1', 'l2'];
        st.fish = 500; st.shards = 1;
        st.upgrades = { satchel: 0, sharp: 0, quickCharge: false, valorGain: false, waveReach: false };
        st.cosmetics = { swords: ['borrowed', 'twig'], capes: ['cream', 'red'], sword: 'borrowed', cape: 'red' };
        st.companions.unlocked = ['mochi', 'sage'];
      });
      // ---- Forge: Sharpness I, two presses
      await t.clearEvents();
      await inPage(t, () => { window.__shopClosed = false; window.__GAME__.ctx.ui.openShop('shop_forge').then(() => { window.__shopClosed = true; }); });
      await t.wait(700);
      const f0 = await inPage(t, () => ({ on: !!document.querySelector('.menu--shop.shop--forge.is-on'), rows: document.querySelectorAll('.shop-row').length,
        mode: window.__GAME__.mode, purse: document.querySelector('.pu-n')?.textContent,
        locked: document.querySelectorAll('.shop-row.row--locked').length, focus: document.querySelector('.shop-row.is-focus .sr-name')?.textContent }));
      t.assert(f0.on && f0.rows === 8, `forge panel with 8 rows (${f0.rows})`);
      t.assert(f0.mode === 'menu', `shop freezes the world (${f0.mode})`);
      t.assert(f0.purse === '500', `purse shows 500 (${f0.purse})`);
      t.assert(/Sharpness I/.test(f0.focus ?? ''), `focus on Sharpness (${f0.focus})`);
      t.assert(f0.locked >= 3, `locked skins shown (${f0.locked})`);
      await t.page.keyboard.press('Enter'); await t.wait(450);
      const armed = await inPage(t, () => ({ armed: !!document.querySelector('.shop-row.is-armed'), fish: window.__GAME__.ctx.state.fish }));
      t.assert(armed.armed && armed.fish === 500, 'first confirm arms the purchase (no fish spent yet)');
      await fontAudit(t, 'forge');
      await shot(t, '20-forge-armed');
      await t.page.keyboard.press('Enter'); await t.wait(400);
      const bought = await inPage(t, () => ({ fish: window.__GAME__.ctx.state.fish, sharp: window.__GAME__.ctx.state.upgrades.sharp,
        purse: document.querySelector('.pu-n')?.textContent, save: window.__GAME__.events.includes('save:request'), name: document.querySelector('.shop-row.is-focus .sr-name')?.textContent }));
      t.assert(bought.fish === 380 && bought.sharp === 1, `Sharpness I bought (fish ${bought.fish}, sharp ${bought.sharp})`);
      t.assert(bought.purse === '380', `purse updated (${bought.purse})`);
      t.assert(bought.save, 'purchase requests an autosave');
      t.assert(/Sharpness II/.test(bought.name ?? ''), `row advances to the next tier (${bought.name})`);
      // equip the Fishbone Sword (6+ kittens): sharp, borrowed, twig, fishbone
      await t.page.keyboard.press('ArrowDown'); await t.wait(160);
      t.assert(/Borrowed/.test(await inPage(t, () => document.querySelector('.shop-row.is-focus .sr-name')?.textContent ?? '')), 'ArrowDown moves the shop focus');
      await focusItem(t, 'Fishbone');
      t.log('forge done');
      const fb = await inPage(t, () => document.querySelector('.shop-row.is-focus .sr-name')?.textContent);
      t.assert(/Fishbone/.test(fb ?? ''), `focus on Fishbone (${fb})`);
      await t.page.keyboard.press('Enter'); await t.wait(400);
      t.assert((await inPage(t, () => window.__GAME__.ctx.state.cosmetics.sword)) === 'fishbone', 'Fishbone Sword equipped');
      await t.wait(400);
      await shot(t, '21-forge-skin');
      await t.page.keyboard.press('Escape'); await t.wait(500);
      const closed = await inPage(t, () => ({ closed: window.__shopClosed, mode: window.__GAME__.mode }));
      t.assert(closed.closed && closed.mode === 'play', `Esc closes the shop and resumes (${closed.mode})`);
      // ---- Bakery: Satchel I raises milkMax
      const mm0 = await inPage(t, () => window.__GAME__.ctx.player.milkMax);
      await inPage(t, () => { window.__GAME__.ctx.ui.openShop('bakery'); }); await t.wait(600);
      await t.page.keyboard.press('Enter'); await t.wait(450); await t.page.keyboard.press('Enter'); await t.wait(400);
      const bk = await inPage(t, () => ({ satchel: window.__GAME__.ctx.state.upgrades.satchel, milkMax: window.__GAME__.ctx.player.milkMax, fish: window.__GAME__.ctx.state.fish }));
      t.assert(bk.satchel === 1 && bk.fish === 280, `Satchel I bought (${bk.satchel}, fish ${bk.fish})`);
      t.assert(bk.milkMax > mm0, `milkMax rises ${mm0} → ${bk.milkMax}`);
      await shot(t, '22-bakery');
      await t.page.keyboard.press('Escape'); await t.wait(400);
      // ---- Library: Holy Wave Reach is locked before Shard 2; a purchase without enough fish is refused
      await inPage(t, () => { window.__GAME__.ctx.state.fish = 120; window.__GAME__.ctx.ui.openShop('library'); }); await t.wait(600);
      const lib = await inPage(t, () => [...document.querySelectorAll('.shop-row.row--locked .sr-name')].map((e) => e.textContent));
      t.assert(lib.some((n) => /Wave/.test(n)), `Holy Wave Reach locked without Shard 2 (${lib.join(',')})`);
      await t.page.keyboard.press('Enter'); await t.wait(450); await t.page.keyboard.press('Enter'); await t.wait(300);
      const lib2 = await inPage(t, () => ({ qc: window.__GAME__.ctx.state.upgrades.quickCharge, fish: window.__GAME__.ctx.state.fish }));
      t.assert(lib2.qc === false && lib2.fish === 120, 'not enough fish: Quick Charge refused');
      await fontAudit(t, 'library');
      await shot(t, '23-library');
      await t.page.keyboard.press('Escape'); await t.wait(400);
      // ---- Wardrobe: buy + wear Order Blue (cream, red, memeWhite, blue)
      await inPage(t, () => { window.__GAME__.ctx.state.fish = 200; window.__GAME__.ctx.ui.openShop('wardrobe'); }); await t.wait(600);
      const wf = await inPage(t, () => document.querySelector('.shop-row.is-focus .sr-name')?.textContent);
      await focusItem(t, 'Order Blue');
      await t.page.keyboard.press('Enter'); await t.wait(450);
      t.assert(await inPage(t, () => !!document.querySelector('.shop-row.is-armed .sr-name')?.textContent.includes('Order Blue')), 'Order Blue armed');
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const wr = await inPage(t, () => ({ cape: window.__GAME__.ctx.state.cosmetics.cape, capes: window.__GAME__.ctx.state.cosmetics.capes, fish: window.__GAME__.ctx.state.fish }));
      t.assert(wr.cape === 'blue' && wr.capes.includes('blue') && wr.fish === 120, `Order Blue bought and worn (${wr.cape}, fish ${wr.fish}, first focus ${wf})`);
      await t.wait(300);
      await shot(t, '24-wardrobe');
      await t.page.keyboard.press('Escape'); await t.wait(400);
      // ---- Lookout + Barracks
      await inPage(t, () => { window.__GAME__.ctx.ui.openShop('lookout'); }); await t.wait(600);
      t.assert((await inPage(t, () => document.querySelectorAll('.look-card').length)) === 6, 'lookout lists 6 regions');
      await shot(t, '25-lookout');
      await t.page.keyboard.press('Escape'); await t.wait(400);
      await inPage(t, () => window.__GAME__.ctx.bus.emit(window.__GAME__.E.INTERACT, { target: { id: 'barracks_banner', kind: 'banner' } })); await t.wait(600);
      t.assert(await inPage(t, () => !!document.querySelector('.shop--barracks.is-on') && document.querySelectorAll('.vigil-kit').length === 2), 'interacting with the banner opens the companion swap');
      await t.page.keyboard.press('Escape'); await t.wait(400);
      // ---- Quest Board: cards, Next, replay
      await inPage(t, () => { window.__boardPick = 'pending'; window.__GAME__.ctx.ui.openQuestBoard({ onPick: (id, p) => { window.__boardPick = p; } }); });
      await t.wait(700);
      const qb = await inPage(t, () => ({ cards: document.querySelectorAll('.qcard').length, cleared: document.querySelectorAll('.qcard.is-cleared').length,
        closed: document.querySelectorAll('.qcard.is-closed').length,
        btn: document.querySelector('.board-next')?.textContent, focus: document.querySelector('.menu--board .is-focus')?.textContent }));
      t.assert(qb.cards === 6 && qb.cleared === 2, `board: ${qb.cards} cards, ${qb.cleared} cleared`);
      t.assert(qb.closed === 3, `here + 2 unreached cards closed (${qb.closed})`);
      t.assert(/Chapter 4/.test(qb.btn ?? ''), `Next button names chapter 4 (${qb.btn})`);
      t.assert(/Next/.test(qb.focus ?? ''), `board opens focused on Next (${qb.focus})`);
      await fontAudit(t, 'board');
      await shot(t, '26-quest-board');
      await t.page.keyboard.press('ArrowUp'); await t.wait(200);
      t.assert(await inPage(t, () => !!document.querySelector('.qcard.is-focus')), 'ArrowUp from Next reaches the cards');
      await focusItem(t, 'Small Paws');
      const foc = await inPage(t, () => document.querySelector('.qcard.is-focus .qc-title')?.textContent);
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const pick = await inPage(t, () => ({ pick: window.__boardPick, mode: window.__GAME__.mode }));
      t.assert(pick.pick && pick.pick.levelId === 'meadow' && pick.pick.replay === true, `board picks the meadow replay (focus ${foc}, ${JSON.stringify(pick.pick)})`);
      t.assert(pick.mode === 'play', `board closes into play (${pick.mode})`);
      // without onPick the ui travels: Next → gate (the town's first exit shows its results first)
      await t.clearEvents();
      await inPage(t, () => { window.__GAME__.ctx.ui.openQuestBoard(); }); await t.wait(600);
      await t.page.keyboard.press('Enter');
      const went = await t.waitForEvent('level:loaded', 60000);
      const at = await inPage(t, () => window.__GAME__.ctx.levels.current?.id);
      t.assert(went && at === 'gate', `Next travels to the gate (${at})`);
      t.assert(await inPage(t, () => window.__GAME__.events.includes('level:results')), 'the town exit shows its results card');
    },
  },
  {
    // M2: boss bar (medallion, phase pips, Dizzy + crit label), The Line objective with milestones, results bests, the
    // controls card, the language placeholder and settings reset.
    name: 'ui:m2hud', order: 47, level: 'gate', spawn: 'start', timeout: 90000,
    async run(t) {
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        g.god(true);
        const boss = { hp: 420, maxHp: 1200, alive: true, pos: ctx.player.pos.clone(), type: 'boss_cacklejaw' };
        window.__uiBoss = boss;
        ctx.bus.emit(E.BOSS_START, { boss, id: 'cacklejaw', name: 'WARCHIEF CACKLEJAW', maxHp: 1200, phases: [1, 0.6, 0.3], dizzyMax: 100 });
        ctx.bus.emit(E.BOSS_DIZZY, { boss, value: 100, max: 100, dizzy: true });
        ctx.bus.emit(E.OBJECTIVE, { id: 'line', value: 64, max: 100, textKey: 'obj.line', frozen: false, done: false, marks: [0.2, 0.45, 0.7, 0.85] });
      });
      await t.wait(900);
      const h = await inPage(t, () => ({ boss: !!document.querySelector('.hud-boss.is-on .boss-face svg'), dizzy: document.querySelector('.dizzy-lbl')?.textContent,
        obj: document.querySelector('.obj-txt')?.textContent, marks: document.querySelectorAll('.obj-marks i').length, gold: document.querySelectorAll('.obj-marks i.f').length }));
      t.assert(h.boss, 'boss bar with a medallion portrait');
      t.assert(/DIZZY/.test(h.dizzy ?? ''), `dizzy label (${h.dizzy})`);
      t.assert(/64%/.test(h.obj ?? ''), `The Line text (${h.obj})`);
      t.assert(h.marks === 4 && h.gold === 2, `line milestones ${h.gold}/${h.marks}`);
      await fontAudit(t, 'm2hud');
      await shot(t, '27-boss-line');
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.OBJECTIVE, { id: 'line', value: 64, max: 100, textKey: 'obj.line', frozen: true, done: false }); });
      await t.wait(200);
      t.assert(await inPage(t, () => document.querySelector('.hud-obj')?.classList.contains('is-frozen')), 'frozen objective styled');
      await inPage(t, () => { window.__uiBoss.alive = false; });   // the bar leaves by itself (no boss:defeated: that would start CS-09)
      // results against a previous best → ribbons + best line
      await inPage(t, () => {
        const ui = window.__GAME__.ctx.ui;
        ui._levelStart = { id: 'gate', rec: { cleared: true, bestRank: 'purrfect', bestTime: 1500 } };
        ui.results.autoContinue = false;
        ui.showResults({ levelId: 'gate', time: 1320, kittens: 3, kittensTotal: 3, letter: true, fish: 210, lives: 9, livesLost: 0, rank: 'pawsome' });
      });
      await t.wait(2600);
      const rb = await inPage(t, () => ({ r: [...document.querySelectorAll('.res-ribbon')].map((e) => e.textContent), best: document.querySelector('.res-best')?.textContent }));
      t.assert(rb.r.length === 2, `results ribbons: ${rb.r.join(', ')}`);
      t.assert(/22:00|Paw-some/.test(rb.best ?? ''), `best line (${rb.best})`);
      await shot(t, '28-results-best');
      await t.page.keyboard.press('Enter'); await t.wait(400);
      await inPage(t, () => { window.__GAME__.ctx.ui.results.autoContinue = true; });
      // settings: language placeholder, controls card, reset to defaults
      await inPage(t, () => { window.__GAME__.ctx.state.settings.shake = 0.3; window.__GAME__.ctx.ui.pause(); window.__GAME__.ctx.ui.menus.openSettings(); });
      await t.wait(500);
      t.assert(await inPage(t, () => !!document.querySelector('.srow--lang')), 'language placeholder row');
      await inPage(t, () => window.__GAME__.ctx.ui.menus.openControls()); await t.wait(500);
      t.assert((await inPage(t, () => document.querySelectorAll('.ctl-row').length)) >= 13, 'controls card rows');
      await fontAudit(t, 'controls');
      await shot(t, '29-controls');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      await inPage(t, () => { const s = window.__GAME__.ctx.ui.menus.top; s.items.find((it) => /Reset/.test(it.el.textContent)).activate(); });
      await t.wait(400);
      await inPage(t, () => { const s = window.__GAME__.ctx.ui.menus.top; s.items[0].activate(); });   // "Yes"
      await t.wait(300);
      t.assert((await inPage(t, () => window.__GAME__.ctx.state.settings.shake)) === 1, 'reset restores shake to 100%');
      await inPage(t, () => window.__GAME__.ctx.ui.resume()); await t.wait(400);
      const endMode = await inPage(t, () => window.__GAME__.mode + ' ' + window.__GAME__.ctx.ui.menus.stack.map((x) => x.id).join('/'));
      t.assert(/^play/.test(endMode), `back to play (${endMode})`);
    },
  },
];

