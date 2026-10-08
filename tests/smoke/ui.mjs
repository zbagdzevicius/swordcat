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
        ctx.bus.emit(E.TOAST, { text: ctx.strings.t('toast.kitten', { n: 1 }), key: 'toast.kitten' });
        ctx.bus.emit(E.ITEM_PICKUP, { item: 'letter', id: 'l1', amount: 1, position: ctx.player.pos.clone() });
        ctx.ui.hint('tut.combo', { step: 3, total: 8 });
      });
      await t.wait(500);
      await inPage(t, () => { window.__uiBoss.hp = 420; });
      await t.wait(350);
      const s1 = await inPage(t, () => ({
        low: !!document.querySelector('.hud-hearts.is-low'), full: !!document.querySelector('.hud-valor.is-full'),
        boss: !!document.querySelector('.hud-boss.is-on'), bossName: document.querySelector('.boss-name span')?.textContent,
        obj: document.querySelector('.hud-obj.is-on .obj-txt')?.textContent ?? '', toasts: document.querySelectorAll('.ui-toast').length,
        hint: document.querySelector('.ui-hint.is-on .hint-txt')?.innerHTML ?? '', fish: document.querySelector('.hud-fish .c-n')?.textContent,
      }));
      t.assert(!s1.low, 'no low-HP pulse at 3 HP');
      t.assert(s1.full, 'valor meter is gold at 100');
      t.assert(s1.boss && /GRIZZLECHOP/.test(s1.bossName ?? ''), `boss bar shown (${s1.bossName})`);
      t.assert(/1\/3/.test(s1.obj), `objective line "${s1.obj}"`);
      t.assert(s1.toasts >= 2, `toasts shown: ${s1.toasts}`);
      t.assert(/ui-key/.test(s1.hint), 'tutorial hint renders keycaps');
      t.assert(s1.fish === '42', `fish counter ${s1.fish}`);
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
      await t.wait(350);
      const life = await inPage(t, () => document.querySelector('.cin-life.is-on .life-txt')?.textContent ?? '');
      t.assert(/8/.test(life), `life lost card "${life}"`);
      await shot(t, '06-life-lost');
      await t.wait(1400);
    },
  },
  {
    name: 'ui:menus', order: 42, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await inPage(t, () => { window.__GAME__.kittens(5); window.__GAME__.ctx.state.letters = ['l1', 'l3']; });
      await t.page.keyboard.press('KeyP');
      await t.wait(500);
      const p = await inPage(t, () => ({ mode: window.__GAME__.mode, pause: !!document.querySelector('.menu--pause.is-on'), btns: document.querySelectorAll('.menu--pause .mi').length }));
      t.assert(p.mode === 'menu', `P pauses (mode ${p.mode})`);
      t.assert(p.pause && p.btns >= 5, `pause menu with ${p.btns} buttons`);
      await shot(t, '07-pause');
      // Kittens grid
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const kit = await inPage(t, () => ({ cells: document.querySelectorAll('.kit-cell').length, found: document.querySelectorAll('.kit-cell.is-found').length }));
      t.assert(kit.cells === 18 && kit.found === 5, `kittens grid ${kit.found}/${kit.cells}`);
      await shot(t, '08-kittens');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      // Letters
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('Enter'); await t.wait(500);
      const let_ = await inPage(t, () => document.querySelectorAll('.letter-card.is-found').length);
      t.assert(let_ === 2, `letters found cards ${let_}`);
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
      await t.page.keyboard.press('Enter');           // New Game (first item without a save)
      await t.wait(500);
      const diff = await inPage(t, () => document.querySelectorAll('.menu--newgame .btn--card').length);
      t.assert(diff === 3, 'difficulty cards: Kitten / Knight / Nine Lives');
      await shot(t, '18-new-game');
      await t.page.keyboard.press('Escape'); await t.wait(300);
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
      await t.page.keyboard.press('Enter'); await t.wait(700);  // Credits
      t.assert(await inPage(t, () => !!document.querySelector('.menu--credits.is-on')), 'credits open');
      await t.wait(1800);
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
];

