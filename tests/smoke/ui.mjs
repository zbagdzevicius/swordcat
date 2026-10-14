// tests/smoke/ui.mjs  (owner: ui) — the §14 screens in the running game, driven through __GAME__ hooks and the bus.
// Screenshots → tests/shots/ui/*.png. Blocks: HUD (+ boss bar, objective, toasts, threat arrows, interaction tag, story
// prompt, tutorial hint, lock pips), dialogue + cinema (letterbox, caption, chapter card, life lost), menus (pause,
// settings, kittens, letters, vigil, game over → retry), title flow (title → main → new game → settings → credits),
// results (showResults resolves on confirm), touch controls, Photo Cam caption, ui:warm (the warm-adventure layers).
// CONTROLS_SPEC (iso controls): ui:ability-bar (desktop bar: glyphs per preset, Tumble + kitten cooldown sweeps,
// tooltip, Grit arc, cursors, HP pills, controls card per preset, §10.7 settings), ui:touch-cluster (844 × 390 hasTouch:
// ⚔ tap swings, 🛡 hold guards, a swipe tumbles, the kitten drag aims and ✕ cancels, smart cast, Edit layout) and
// ui:portrait (390 × 844: ≥ 56 px buttons ≥ 8 px apart, condensed HUD strip, the one-time rotate toast).
import fs from 'node:fs';
import path from 'node:path';

/** Evaluate in the page with __GAME__ as G, ctx, E and the ui. */
const inPage = (t, fn, arg) => t.G(fn, arg);

/** Pause the sim around a screenshot so the frame is stable under GPU load (restores the time scale). */
async function shot(t, name) {
  await t.frames(2);
  return t.shot(`ui/${name}`);
}

/**
 * Phase W review: the guide bubble, its chip and all 7 paw dots lie inside the viewport (16 px SafeFrame gutters) with
 * a long line, and a dialogue scene hides the hint layers. `G` evaluates in the page, `wait(ms)` sleeps.
 */
async function guideInView(t, G, wait, tag) {
  await G(() => { const g = window.__GAME__; g.setMode('play'); g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', id: 'smoke', speaker: 'pearl', say: 'Race you to the sun-ring! Last one there is a soggy biscuit!', textKey: 'tut.parry', step: 6, stepDots: { n: 5, of: 7, half: true }, action: 'guard' }); });
  await wait(600);
  const r = await G(() => {
    const out = {};
    for (const s of ['.ui-guide', '.gd-bubble', '.gd-chip', '.gd-dots']) { const b = document.querySelector(s)?.getBoundingClientRect(); out[s] = b && b.width > 0 ? [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)] : null; }
    return { out, w: innerWidth, h: innerHeight, dots: document.querySelectorAll('.gd-dot:not(.is-hidden)').length, op: +getComputedStyle(document.querySelector('.ui-guide')).opacity };
  });
  const bad = Object.entries(r.out).filter(([, b]) => !b || b[0] < 15 || b[1] > r.w - 15 || b[2] < 0 || b[3] > r.h);
  t.log(`${tag}: guide rects ${JSON.stringify(r.out)} in ${r.w}x${r.h}`);
  t.assert(!bad.length && r.dots === 7 && r.op > 0.5, `${tag}: guide bubble / chip / 7 dots inside the viewport (${JSON.stringify(bad)}, dots ${r.dots}, opacity ${r.op})`);
  await G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.CUTSCENE_START, { id: 'smoke_dialog', kind: 'dialog' }); });
  await wait(500);
  const op = await G(() => +getComputedStyle(document.querySelector('.ui-guide')).opacity);
  await G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.CUTSCENE_END, { id: 'smoke_dialog' }); g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', id: 'smoke', speaker: 'pearl', textKey: 'tut.parry', step: 6, done: true }); g.setMode('play'); });
  t.assert(op < 0.05, `${tag}: hint layers hide in a dialogue scene (guide opacity ${op})`);
  await wait(700);
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

/**
 * Run `body` in a fresh mobile context (hasTouch / isMobile, DPR 2) at w × h: the meadow start in play with the
 * prologue done, god on, device 'touch' after a real first touch. `body(m)` gets { G, pg, ptr, mshot, untilM,
 * fontAudit, w, h }. Page errors fail the block.
 */
async function touchRun(t, w, h, tag, body) {
  const errors = [];
  const ctxM = await t.browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctxM.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  pg.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource|favicon/.test(msg.text())) errors.push(`console.error: ${msg.text()}`); });
  const G = async (fn, arg) => { const hd = await pg.evaluateHandle(fn, arg); try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); } };
  const mshot = async (name) => {
    try { await pg.screenshot({ path: path.join(t.shotsDir, 'ui', `${name}.png`) }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); }
  };
  const untilM = async (fn, arg, ms = 8000) => { const t0 = Date.now(); let v = await G(fn, arg); while (!v && Date.now() - t0 < ms) { await pg.waitForTimeout(80); v = await G(fn, arg); } return v; };
  /** A synthetic touch pointer (drags Playwright's touchscreen can't do); moves / up go to the element it went down on. */
  const ptr = (type, x, y, id = 11) => G(([tp, px, py, pid]) => {
    const caps = (window.__ptrCap ??= {});
    const el = tp === 'pointerdown' ? (document.elementFromPoint(px, py)?.closest?.('.tbtn, .touch-root') ?? document.querySelector('.touch-root')) : (caps[pid] ?? document.querySelector('.touch-root'));
    if (tp === 'pointerdown') caps[pid] = el;
    el.dispatchEvent(new PointerEvent(tp, { bubbles: true, cancelable: true, pointerId: pid, clientX: px, clientY: py, pointerType: 'touch', isPrimary: pid === 11 }));
    if (tp === 'pointerup' || tp === 'pointercancel') delete caps[pid];
    return el.className;
  }, [type, x, y, id]);
  try {
    fs.mkdirSync(path.join(t.shotsDir, 'ui'), { recursive: true });
    await pg.goto(`${t.base}?test=1&seed=1`, { timeout: 240000, waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 240000 });
    await G(async () => {
      const g = window.__GAME__, c = g.ctx;
      g.story.skip?.(); g.setMode('play');
      for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
      c.state.setFlag('seen.tut.rotate', false);
      window.__toasts = []; c.bus.on(g.E.TOAST, (p) => window.__toasts.push(String(p?.text ?? p?.key ?? '')));
      await g.loadLevel('meadow', 'start');
      return true;
    });
    await pg.waitForTimeout(600);
    await pg.touchscreen.tap(Math.round(w * 0.6), Math.round(h * 0.4));     // the first touch: device 'touch'
    await G(() => {
      const g = window.__GAME__; g.story.skip?.(); if (Array.isArray(g.ctx.story?.queue)) g.ctx.story.queue.length = 0;
      g.setMode('play'); g.god(true); g.ctx.ui.touch.enable(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e);
    });
    await pg.waitForTimeout(800);
    t.assert((await G(() => window.__GAME__.ctx.input.device)) === 'touch', `${tag}: device touch`);
    const fontAuditM = async (label) => {
      const bad = await G(() => {
        const out = [];
        for (const root of [document.getElementById('ui'), document.getElementById('touch')]) {
          if (!root) continue;
          const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = tw.nextNode(); n; n = tw.nextNode()) {
            const e = n.parentElement;
            if (!n.textContent.trim() || !e || e.closest('svg')) continue;
            const r = e.getBoundingClientRect();
            if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
            let vis = true;
            for (let a = e; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) { vis = false; break; } }
            if (!vis) continue;
            // transforms (the portrait HUD strip scale) are allowed: the font size itself must stay ≥ 16 px
            const fs = parseFloat(getComputedStyle(e).fontSize);
            if (fs < 15.9) out.push(`${e.className || e.tagName} ${fs.toFixed(1)}px "${n.textContent.trim().slice(0, 24)}"`);
          }
        }
        return [...new Set(out)].slice(0, 6);
      });
      t.assert(bad.length === 0, `${label}: text under 16 px: ${bad.join('; ')}`);
    };
    await body({ G, pg, ptr, mshot, untilM, fontAudit: fontAuditM, w, h });
  } finally {
    t.assert(errors.length === 0, `${tag}: no page errors (${errors.slice(0, 3).join(' | ')})`);
    await ctxM.close().catch(() => {});
  }
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
        ctx.bus.emit(E.TOAST, { text: ctx.strings.t('toast.kitten', { n: 1, max: 3 }), key: 'toast.kitten' });
        ctx.bus.emit(E.ITEM_PICKUP, { item: 'letter', id: 'l1', amount: 1, position: ctx.player.pos.clone() });
        ctx.ui.hint('tut.bright', { step: 3, total: 8 });          // tut.combo retired with the Morning Practice (story.W1)
        ctx.state.companions.unlocked = ['mochi']; ctx.state.setFlag('meadow.mochi', true);    // joined (D-01): the slot shows him
        try { ctx.companions.setActive(['mochi']); } catch (err) { console.warn('[ui smoke] setActive', err?.message); }
        ctx.ui.hud.showSaved();
      });
      await t.wait(500);
      await inPage(t, () => { window.__uiBoss.hp = 420; });
      await t.wait(350);
      await inPage(t, () => window.__GAME__.ctx.ui.hint('tut.bright', { step: 3, total: 8 }));   // a story quest:update may have replaced it
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
      // the counter shows state.fish: the start spawn sits on a placed fish line, so a magnet fish may land meanwhile
      t.assert(s1.fish === String(await inPage(t, () => window.__GAME__.ctx.state.fish)) && +s1.fish >= 42, `fish counter ${s1.fish}`);
      t.assert(s1.comp || s1.compN === 0, `companion portrait shown for the active companion (${s1.compN})`);
      if (!s1.compN) t.warn('companions.setActive(["mochi"]) gave no active companion; portrait not checked');
      t.assert(/saved/i.test(s1.saved), `"Saved" wax seal ("${s1.saved}")`);
      // WA §4.2: a defeat signal while the boss still has HP never stamps "BONKED!" over the boss name
      const bk = await inPage(t, () => {
        const g = window.__GAME__;
        g.ctx.bus.emit(g.E.BOSS_DEFEATED, { boss: window.__uiBoss, id: 'smoke_none' });
        return { on: g.ctx.ui.hud.bonked, cls: document.querySelector('.hud-boss').classList.contains('is-bonked'), txt: document.querySelector('.boss-bonked').textContent };
      });
      t.assert(!bk.on && !bk.cls && !bk.txt, `no BONKED! stamp while the boss has HP (${JSON.stringify(bk)})`);
      await fontAudit(t, 'HUD');
      await shot(t, '01-hud');
      // threat arrow: a red telegraph from an enemy behind her; interaction tag; story prompt with a filling ring
      const arrow = await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, p = ctx.player, cam = ctx.camera;
        // off screen but inside TELEGRAPH.arrowRadius: beside her (the iso lens sees ~±7 m across at this distance)
        const fwd = cam.getWorldDirection(new g.THREE.Vector3()).setY(0).normalize();
        const side = new g.THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(13);
        const e = ctx.enemies.spawn('rat_pike', p.pos.clone().add(side));
        window.__uiRat = e;
        ctx.bus.emit(E.TELEGRAPH, { id: 'ui-smoke-tell', actor: e, kind: 'red', shape: 'glint', pos: e.pos, dir: null, size: 1, duration: 3 });
        // review: a Rest stop waits while a boss fight is on (its tag sat on the boss bar); other tags stay out of the top band
        ctx.bus.emit(E.INTERACT_AVAILABLE, { target: { id: 'vigil_1', kind: 'vigil', position: p.pos.clone().add(cam.getWorldDirection(new g.THREE.Vector3()).setY(0).normalize().multiplyScalar(2.5)) }, prompt: 'tut.vigil' });
        return true;
      });
      await t.wait(300);
      const restTag = await inPage(t, () => !!document.querySelector('.ui-tag.is-on'));
      t.assert(!restTag, 'no "Rest" tag while the boss fight is on');
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E, p = ctx.player, cam = ctx.camera;
        ctx.bus.emit(E.INTERACT_AVAILABLE, { target: { id: 'smoke_chest', kind: 'chest', position: p.pos.clone().add(cam.getWorldDirection(new g.THREE.Vector3()).setY(0).normalize().multiplyScalar(2.5)) }, prompt: 'prompt.open' });
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
      const band = await inPage(t, () => { const b = document.querySelector('.hud-boss.is-on')?.getBoundingClientRect(), tg = document.querySelector('.ui-tag.is-on .tag-in')?.getBoundingClientRect(); return b && tg ? { bb: Math.round(b.bottom), tt: Math.round(tg.top), ov: tg.top < b.bottom && tg.bottom > b.top && tg.right > b.left && tg.left < b.right } : null; });
      t.assert(!band?.ov, `the interaction tag stays off the boss bar (${JSON.stringify(band)})`);
      await shot(t, '02-hud-arrows-tag-prompt');
      // reduce HP to 2 → pulse; cleanup
      await inPage(t, () => {
        const g = window.__GAME__, ctx = g.ctx, E = g.E;
        g.player.setHp(2); ctx.ui.hud.poll(true);
        ctx.bus.emit(E.TELEGRAPH_END, { id: 'ui-smoke-tell' });
        ctx.bus.emit(E.INTERACT_CLEAR, {});
        ctx.bus.emit(E.PROMPT, { action: 'guard', hold: 1, textKey: 'prompt.holdStand', progress: 1, done: true });
        ctx.ui.hud._bossHide();      // clear the bar without a real defeat (boss:defeated grizzlechop would start CS-05)
        ctx.bus.emit(E.OBJECTIVE, { id: 'net_ropes', value: 3, max: 3, textKey: 'obj.ropes', frozen: false, done: true });
        ctx.ui.hint(null);
        if (window.__uiRat) ctx.enemies.despawn(window.__uiRat);
        try { ctx.companions.setActive([]); } catch { /* ignore */ }
        ctx.state.companions.unlocked = [];
      });
      await t.wait(200);
      const low = await inPage(t, () => !!document.querySelector('.hud-hearts.is-low'));
      t.assert(low, 'hearts pulse at HP ≤ 2');
      // review: the "where next" beacon: a quest step with a target shows the gold paw (over it, or on the edge)
      // (TT2 G1: the beacon asks story.guideTarget() first; with no story target it falls back to the quest step, which
      // is what this check is about, so story's answer is held off for it and restored below)
      await inPage(t, () => { const g = window.__GAME__; g.ctx.story.guideTarget = () => null; g.ctx.bus.emit(g.E.QUEST_UPDATE, { questId: 'meadow.mochi', state: 'active', text: 'Help Mochi out of the tipped cart' }); });
      await t.wait(600);
      const bc = await inPage(t, () => { const b = window.__GAME__.ctx.ui.beacon; return { on: !!document.querySelector('.ui-beacon.is-on'), marker: !!document.querySelector('.bc-marker.is-on'), edge: !!document.querySelector('.bc-edge.is-on'), has: b?.has, st: b?.state, prints: document.querySelectorAll('.bc-print.is-on').length, t: b?.target, boss: !!window.__GAME__.ctx.ui.hud.boss, tut: !!window.__GAME__.ctx.story?.tutorial?.active, sp: window.__GAME__.ctx.levels.current?.spawnId, mode: window.__GAME__.ctx.game.mode, hud: !!document.querySelector('.hud:not(.is-hidden)') }; });
      t.assert(bc.on && (bc.marker || bc.edge), `objective beacon shows the way (${JSON.stringify(bc)})`);
      await shot(t, '03-beacon');
      await inPage(t, () => { const g = window.__GAME__, p = g.ctx.player.pos, b = g.ctx.ui.beacon.target; const f = g.ctx.camera.getWorldDirection(new g.THREE.Vector3()).setY(0).normalize(), x = b.x - f.x * 6, z = b.z - f.z * 6; g.teleport(x, g.ctx.physics.heightAt(x, z), z); });   // 6 m short of it, the cart up-screen
      // (a scene the cart may start on arrival, e.g. the cs03b bark, hides the HUD and so the guide: let it go first)
      await t.wait(300);
      await inPage(t, () => { const g = window.__GAME__; if (g.ctx.story.playingId) { g.story.skip?.(); g.setMode('play'); } });
      await t.wait(1200);
      const bc2 = await inPage(t, () => { const g = window.__GAME__, b = g.ctx.ui.beacon.target, v = new g.THREE.Vector3(b.x, b.y + 2.6, b.z).project(g.ctx.camera); const bb = g.ctx.ui.beacon; return { marker: !!document.querySelector('.bc-marker.is-on'), on: !!document.querySelector('.ui-beacon.is-on'), ndc: [+v.x.toFixed(2), +v.y.toFixed(2)], p: g.ctx.player.pos.toArray().map((n) => +n.toFixed(1)), mode: g.ctx.game.mode, st: bb.state, hidden: bb.hidden, src: bb.guide.src, id: bb.guide.id, scene: !!g.ctx.story.sceneActive, inScene: !!g.ctx.ui.inScene, playing: g.ctx.story.playingId ?? null, boss: !!g.ctx.ui.hud.boss }; });
      t.assert(bc2.on && bc2.marker, `the beacon floats over the cart when it is on screen (${JSON.stringify(bc2)})`);
      await shot(t, '04-beacon-near');
      await inPage(t, () => { const g = window.__GAME__; delete g.ctx.story.guideTarget; g.player.setHp(g.ctx.player.maxHp); g.god(false); });
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
      // WA §5.7 knock-out: no card, no ghost; a cream wipe at KO.sitT, then the life toast and the lives-badge pop
      // the player owns the wipe (ui.fade at KO.sitT, cleared on the respawn); the harness plays the player's part
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_LIFE_LOST, { lives: 8, gameOver: false }); setTimeout(() => g.ctx.ui.fade({ to: '#FFF1DE', alpha: 1, dur: 0.35 }), 1200); });
      await t.wait(1350);
      const wipe = await inPage(t, () => { const f = document.querySelector('.cin-fade'); const cs = getComputedStyle(f); return { o: +cs.opacity, bg: cs.backgroundColor, card: !!document.querySelector('.cin-life.is-on') }; });
      t.assert(wipe.o > 0.05 && /255, 241, 222/.test(wipe.bg), `cream wipe (${wipe.o.toFixed(2)} ${wipe.bg})`);
      t.assert(!wipe.card, 'no life-lost card');
      await inPage(t, () => window.__GAME__.ctx.ui.fade({ to: null, dur: 0.35 }));
      await t.wait(700);
      const life = await inPage(t, () => [...document.querySelectorAll('.ui-toast')].map((e) => e.textContent).join(' | '));
      t.assert(/8/.test(life), `life toast "${life}"`);
      await shot(t, '06-life-lost');
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
      // Settings (after the WA §5.4 Stickers row): change master volume with ArrowRight, toggle reduce flashes
      await t.page.keyboard.press('ArrowDown'); await t.wait(120);
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
      // TOKENTAILS-PLAN §5.5 embed mode: the Token Tails host owns the exit, so the pause menu has no Quit to Title
      const quitIn = (embed) => inPage(t, async (on) => {
        const g = window.__GAME__, de = document.documentElement;
        if (on) de.dataset.embed = '1'; else delete de.dataset.embed;
        g.ctx.ui.pause(); await new Promise((r) => setTimeout(r, 300));
        const label = g.ctx.strings.t('pause.quit');
        const n = [...document.querySelectorAll('.menu--pause .mi .btn-lbl')].filter((b) => b.textContent === label).length;
        delete de.dataset.embed; g.setMode('play');
        return n;
      }, embed);
      const qOff = await quitIn(false), qOn = await quitIn(true);
      t.assert(qOff === 1 && qOn === 0, `Quit to Title: ${qOff} outside the host page, ${qOn} in embed mode`);
      await t.wait(200);
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
        stamp: document.querySelector('.res-stamp .res-word')?.textContent, mode: window.__GAME__.mode }));
      t.assert(r.on && r.rows === 5, `results rows ${r.rows}`);
      t.assert(/paw-some/i.test(r.stamp ?? ''), `rank stamp "${r.stamp}"`);
      await fontAudit(t, 'results');
      const stampFit = await inPage(t, () => {
        const p = document.querySelector('.res-panel').getBoundingClientRect(), s = document.querySelector('.res-stamp .res-word').getBoundingClientRect();
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
    // WA §4.3 (ui.W1): no main-menu panel and no difficulty picker on a new save: ONE candy button at 1.4 s; with a
    // save "Keep going!" + "New adventure"; the gear opens Settings (Credits inside); the button starts at Knight.
    name: 'ui:title', order: 45, level: null, timeout: 90000,
    async run(t) {
      await inPage(t, () => { const g = window.__GAME__; g.story.skip(); g.setMode('play'); const ui = g.ctx.ui; ui._hasSaveReal ??= ui.hasSave; ui.hasSave = () => false; ui.showTitle(); });
      await t.wait(2200);
      const s = await inPage(t, () => ({ on: !!document.querySelector('.ui-title.is-on.is-logo'), mode: window.__GAME__.mode, hud: !!document.querySelector('.hud.is-hidden'),
        btns: [...document.querySelectorAll('.menu--home .btn--home .btn-lbl')].map((b) => b.textContent), panel: !!document.querySelector('.menu--home .menu-panel'),
        shade: !!document.querySelector('.title-shade'), gear: !!document.querySelector('.ui-title .title-gear'), foot: document.querySelector('.title-foot')?.textContent ?? '' }));
      t.assert(s.on, 'title screen with the logo');
      t.assert(s.mode !== 'play', `world held still under the title (mode ${s.mode})`);
      t.assert(s.hud, 'HUD hidden on the title');
      t.assert(s.btns.length === 1 && /play/i.test(s.btns[0]), `one button without a save: ${s.btns.join(' · ')}`);
      t.assert(!s.panel && !s.shade, 'no main-menu panel, no dark shade');
      t.assert(s.gear && /Token Tails|purr/i.test(s.foot), `gear + footer "${s.foot}"`);
      // Token Tails co-brand (TOKENTAILS-PLAN §2.6): the logo image loads, the pink bow sits on the title once
      const brand = await inPage(t, () => { const img = document.querySelector('.title-foot .tt-logo');
        return { img: !!img && img.complete && img.naturalWidth > 0, bows: document.querySelectorAll('.ui-title .logo-bow').length,
          word: document.querySelector('.ui-title .logo-word')?.textContent.replace(/\s+/g, ' ') ?? '' }; });
      t.assert(brand.img, 'the Token Tails logo loads in the footer');
      t.assert(brand.bows === 1, `one pink bow on the title "${brand.word}" (${brand.bows})`);
      await fontAudit(t, 'title');
      await shot(t, '16-title');
      // with a save: two buttons
      await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui.hasSave = () => true; ui.menus.closeAll(); ui.showTitle({ fromStory: true }); });
      await t.wait(900);
      const two = await inPage(t, () => [...document.querySelectorAll('.menu--home .btn--home .btn-lbl')].map((b) => b.textContent));
      t.assert(two.length === 2, `two buttons with a save: ${two.join(' · ')}`);
      await shot(t, '17-title-save');
      // the gear: Settings with Credits inside
      await t.page.click('.title-gear');
      await t.wait(600);
      const set = await inPage(t, () => ({ on: !!document.querySelector('.menu--settings.is-on'), credits: [...document.querySelectorAll('.menu--settings .btn-lbl')].some((b) => /credit/i.test(b.textContent)) }));
      t.assert(set.on && set.credits, 'the gear opens Settings, with Credits inside');
      await shot(t, '18-title-settings');
      await inPage(t, () => window.__GAME__.ctx.ui.menus.openCredits());
      await t.wait(1800);
      await fontAudit(t, 'credits');
      const crFit = await inPage(t, () => document.querySelector('.menu--credits .menu-panel').getBoundingClientRect().bottom <= innerHeight + 1);
      t.assert(crFit, 'credits panel fits the viewport');
      await shot(t, '19-credits');
      // no save again: "Tap to play!" starts the game at Knight, no picker
      await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui.hasSave = () => false; ui.menus.closeAll(); ui.showTitle({ fromStory: true }); });
      await t.wait(900);
      await t.clearEvents();
      await t.page.click('.btn--play');
      const loaded = await t.waitForEvent('level:loaded', 40000);
      t.assert(loaded, 'Tap to play loads the first level');
      await t.wait(600);
      const ng = await inPage(t, () => ({ title: !!document.querySelector('.ui-title.is-on'), diff: window.__GAME__.ctx.state.difficulty, picker: !!document.querySelector('.menu--newgame') }));
      t.assert(!ng.title, 'title closed after play');
      t.assert(ng.diff === 'knight' && !ng.picker, `Knight, no picker (${ng.diff})`);
      await inPage(t, () => { const g = window.__GAME__; const ui = g.ctx.ui; if (ui._hasSaveReal) ui.hasSave = ui._hasSaveReal; g.story.skip(); g.setMode('play'); });
    },
  },
  {
    // The warm phase in one pass (IMPLEMENTATION_PLAN §6 ui + Phase W): #ui-vignette / #ui-flash, screenOccluders,
    // the calm HUD tuck, a celebration card + sticker, the guide bubble + paw dots, the Kitten-mode offer chips, a
    // fly-to-HUD fish, the candy ability bar, the warm results card.
    name: 'ui:warm', order: 51, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await inPage(t, () => { const g = window.__GAME__; g.god(true); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.setMode('play'); });
      await t.wait(400);
      const lay = await inPage(t, () => {
        const ui = window.__GAME__.ctx.ui, v = document.getElementById('ui-vignette'), f = document.getElementById('ui-flash');
        const spec = ui.flash('hurt');
        return { v: !!v && getComputedStyle(v).pointerEvents === 'none', f: !!f && getComputedStyle(f).pointerEvents === 'none', spec };
      });
      t.assert(lay.v && lay.f, '#ui-vignette and #ui-flash exist, pointer-events none');
      t.assert(lay.spec?.color === '#FF8FB1', `hurt flash ${JSON.stringify(lay.spec)}`);
      // a steady layout: the full HUD (the calm HUD's tuck legitimately moves rects) after its 0.3 s fades
      await inPage(t, () => { const g = window.__GAME__; g.ctx.state.settings.hudMode = 'full'; g.ctx.bus.emit(g.E.SETTINGS_CHANGED, { key: 'hudMode', value: 'full' }); });
      await t.wait(1200);
      const occ = await inPage(t, () => { const o = window.__GAME__.ctx.ui.screenOccluders(); return { v: o.version, kinds: o.rects.map((r) => r.kind), n: o.rects.length }; });
      t.assert(occ.v > 0 && occ.n >= 2 && occ.kinds.every((k) => ['hud', 'cluster', 'stick', 'bar', 'dialog', 'chip'].includes(k)), `occluders v${occ.v}: ${occ.kinds.join(',')}`);
      const v0 = occ.v;
      await t.wait(600);
      const v1 = await inPage(t, () => window.__GAME__.ctx.ui.screenOccluders().version);
      t.assert(v1 === v0, `a steady layout keeps its version (${v0} → ${v1})`);
      // calm HUD: out of combat for 4 s → Grit / Valor / counters tucked; 'full' shows them
      await inPage(t, () => { const g = window.__GAME__; g.ctx.state.settings.hudMode = 'calm'; g.ctx.bus.emit(g.E.SETTINGS_CHANGED, { key: 'hudMode', value: 'calm' }); });
      await t.wait(4600);
      const tuck = await inPage(t, () => { const h = document.querySelector('.hud'); return { grit: h.classList.contains('tuck-grit'), counts: h.classList.contains('tuck-counts') }; });
      t.assert(tuck.grit && tuck.counts, `calm HUD tucked (${JSON.stringify(tuck)})`);
      await shot(t, '30-calm-hud');
      // fly-to-HUD: a fish picked up near her flies to the counter (and the counters show)
      await inPage(t, () => { const g = window.__GAME__, p = g.ctx.player.pos; g.ctx.bus.emit(g.E.ITEM_PICKUP, { item: 'fish', amount: 1, position: { x: p.x + 1, y: p.y, z: p.z + 1 } }); });
      await t.wait(120);
      t.assert(await inPage(t, () => !!document.querySelector('.fly-ico.is-on')), 'a fish flies to its counter');
      await t.wait(700);
      t.assert(await inPage(t, () => !document.querySelector('.fly-ico.is-on')), 'the fish lands and its icon goes (no stray fish by the counter)');
      await guideInView(t, (fn, arg) => inPage(t, fn, arg), (ms) => t.wait(ms), 'desktop');
      // a celebration card (docks in combat; here it pops big)
      await inPage(t, () => window.__GAME__.ctx.ui.celebrate('card', 'holy'));
      await t.wait(450);
      const card = await inPage(t, () => ({ on: !!document.querySelector('.cel-card.is-on.is-card'), title: document.querySelector('.cel-title')?.textContent, ts: window.__GAME__.ctx.game.loop?.timeScale, mode: window.__GAME__.mode }));
      t.assert(card.on && /holy/i.test(card.title ?? ''), `card "${card.title}"`);
      t.assert(card.ts === 1 && card.mode === 'play', `a celebration never pauses the game (ts ${card.ts}, mode ${card.mode})`);
      await shot(t, '31-card');
      await t.wait(2200);
      await inPage(t, () => window.__GAME__.ctx.ui.celebrate('sticker', 'bonk'));
      await t.wait(450);
      t.assert(await inPage(t, () => !!document.querySelector('.cel-card.is-on.is-sticker')), 'sticker');
      t.assert(await inPage(t, () => !!window.__GAME__.ctx.state.getFlag('sticker.bonk')), 'the sticker book flag');
      await shot(t, '32-sticker');
      await t.wait(1800);
      // the guide bubble: Pearl + chip + paw dots; a second prompt replaces it (one bubble)
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', speaker: 'pearl', say: 'Race you to the sun-ring!', textKey: 'tut.move', step: 1, stepDots: { n: 1, of: 7, half: true }, action: 'move' }); });
      await t.wait(400);
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', speaker: 'pearl', say: 'Bonk the dummy!', textKey: 'tut.bonk', step: 2, stepDots: { n: 2, of: 7 }, action: 'attack' }); });
      await t.wait(400);
      const gd = await inPage(t, () => ({ n: document.querySelectorAll('.ui-guide.is-on').length, say: document.querySelector('.gd-say')?.textContent, dots: document.querySelectorAll('.gd-dot.is-full').length,
        pe: getComputedStyle(document.querySelector('.ui-guide')).pointerEvents, occl: window.__GAME__.ctx.ui.screenOccluders().rects.some((r) => r.kind === 'chip') }));
      t.assert(gd.n === 1 && /Bonk/.test(gd.say ?? '') && gd.dots === 2, `one bubble, replaced (${JSON.stringify(gd)})`);
      t.assert(gd.pe === 'none' && !gd.occl, 'the bubble is never an occluder');
      await shot(t, '33-guide');
      await inPage(t, () => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PROMPT, { kind: 'tutorial', speaker: 'pearl', textKey: 'tut.bonk', step: 2, done: true }); });
      await t.wait(800);
      // the Kitten-mode offer (once per save): chips are a `chip` occluder while open
      const offerP = inPage(t, () => { window.__GAME__.ctx.state.setFlag('seen.offer.kitten', false); window.__GAME__.ctx.ui.offerKitten(); return true; });
      await offerP; await t.wait(500);
      const of = await inPage(t, () => ({ on: !!document.querySelector('.ui-offer.is-on'), chips: document.querySelectorAll('.ui-offer .of-chip').length, occl: window.__GAME__.ctx.ui.screenOccluders().rects.some((r) => r.kind === 'chip') }));
      t.assert(of.on && of.chips === 2 && of.occl, `offer chips (${JSON.stringify(of)})`);
      await shot(t, '34-offer');
      await t.page.click('.of-no');
      await t.wait(300);
      t.assert(await inPage(t, () => window.__GAME__.ctx.state.difficulty !== 'kitten'), '"I got this" keeps the difficulty');
      t.assert((await inPage(t, () => window.__GAME__.ctx.ui.offerKitten().then((v) => v))) === null, 'not offered twice');
      // results: warm scrim, count-up, the rank stamp
      const resP = inPage(t, () => { window.__GAME__.ctx.ui.results.autoContinue = false; window.__GAME__.ctx.ui.showResults({ levelId: 'meadow', time: 512, kittens: 2, kittensTotal: 3, letter: true, fish: 64, lives: 7, livesLost: 2 }); return true; });
      await resP; await t.wait(1600);
      const res = await inPage(t, () => ({ on: !!document.querySelector('.ui-results.is-on'), title: document.querySelector('.res-title')?.textContent, word: document.querySelector('.res-word')?.textContent, bf: getComputedStyle(document.querySelector('.ui-results')).backdropFilter }));
      t.assert(res.on && /clear/i.test(res.title ?? '') && /PURR/i.test(res.word ?? ''), `results "${res.title}" ${res.word} (on ${res.on})`);
      t.assert(!res.bf || res.bf === 'none', 'no backdrop blur');
      await shot(t, '35-results');
      await inPage(t, () => window.__GAME__.ctx.ui.results.close()); await inPage(t, () => { window.__GAME__.ctx.ui.results.autoContinue = true; });
      await inPage(t, () => { const g = window.__GAME__; g.setMode('play'); g.ctx.state.settings.hudMode = 'calm'; });
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
      t.assert(/22:00|paw-some/i.test(rb.best ?? ''), `best line (${rb.best})`);
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
  // ------------------------------------------------------------------ CONTROLS_SPEC §9 / §10 (iso controls)
  {
    name: 'ui:ability-bar', order: 48, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      const page = t.page;
      await inPage(t, async () => {
        const g = window.__GAME__, c = g.ctx;
        g.story.skip?.(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
        for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
        await g.loadLevel('meadow', 'start');
        g.story.skip?.(); if (Array.isArray(c.story?.queue)) c.story.queue.length = 0;
        g.setMode('play'); g.god(true); c.input.setDevice('kbm');
        c.ui.touch.enable(false); c.input.setDevice('kbm');
        c.state.settings.controlPreset = 'hybrid'; c.bus.emit(g.E.SETTINGS_CHANGED, { key: 'controlPreset', value: 'hybrid' });
        for (const e of [...c.enemies.list]) c.enemies.despawn(e);
      });
      await t.wait(600);
      // ---- the bar: 8 slots with hybrid corner glyphs; HUD milk + companion portrait hidden (they live in the bar)
      const bar = await inPage(t, () => {
        const b = document.querySelector('.ability-bar'), key = (id) => b.querySelector(`.ab-${id} .ab-key`)?.textContent;
        const r = b.getBoundingClientRect();
        return { on: b.classList.contains('is-on'), slots: b.querySelectorAll('.ab-slot').length, keys: Object.fromEntries(['guard', 'dodge', 'jump', 'ability', 'golden', 'milk', 'meow', 'interact'].map((k) => [k, key(k)])),
          milkHud: getComputedStyle(document.querySelector('.hud-milk')).display, cx: r.x + r.width / 2, w: innerWidth, bottom: innerHeight - r.bottom,
          slot: b.querySelector('.ab-dodge').getBoundingClientRect().width };
      });
      t.log(`bar ${JSON.stringify(bar)}`);
      t.assert(bar.on && bar.slots === 8, 'the ability bar shows 8 slots on desktop');
      t.assert(Math.abs(bar.cx - bar.w / 2) < 4 && bar.bottom < 40, 'bottom centre');
      t.assert(bar.slot >= 47.5, `slots ≥ 48 px (${bar.slot})`);
      t.assert(bar.keys.guard === 'Space' && bar.keys.dodge === 'Shift' && bar.keys.jump === 'F' && bar.keys.ability === 'Q' && bar.keys.golden === 'V'
        && bar.keys.milk === 'R' && bar.keys.meow === 'C' && bar.keys.interact === 'E', `hybrid glyphs ${JSON.stringify(bar.keys)}`);
      t.assert(bar.milkHud === 'none', 'the HUD milk row moved into the bar');
      // ---- Tumble: the dodge slot sweeps (0.2 s)
      await page.mouse.move(700, 300);
      // watch the slot from before the press (the 0.2 s cooldown is only a few frames under load)
      await inPage(t, () => {
        const e = document.querySelector('.ab-dodge'), sw = e.querySelector('.ab-sweep');
        window.__dodgeSeen = { cd: false, sweep: 0 };
        // X21: the sweep is one CSS animation per cooldown start (--cd0 = the start angle, --cdd = its length)
        const mo = new MutationObserver(() => {
          if (e.classList.contains('is-cd')) { window.__dodgeSeen.cd = true; window.__dodgeSeen.sweep = Math.max(window.__dodgeSeen.sweep, parseFloat(sw.style.getPropertyValue('--cd0')) || 0); }
        });
        mo.observe(e, { attributes: true, attributeFilter: ['class'] }); mo.observe(sw, { attributes: true, attributeFilter: ['style'] });
        window.__dodgeMo = mo;
      });
      await t.tap('ShiftLeft');
      await t.wait(1200);
      const dcd = await inPage(t, () => { window.__dodgeMo?.disconnect(); return window.__dodgeSeen; });
      t.assert(dcd.cd, `Tumble starts the dodge slot cooldown (${JSON.stringify(dcd)})`);
      await t.wait(700);
      // ---- kitten ability: Q casts, the Q slot shows the conic sweep + whole seconds
      await inPage(t, () => { const c = window.__GAME__.ctx; c.state.companions.unlocked = ['mochi']; c.state.setFlag('meadow.mochi', true); c.companions.setActive(['mochi']); });
      await t.frames(30);
      await t.clearEvents();
      await t.tap('KeyQ');
      t.assert(await t.waitForEvent('companion:ability', 3000), 'Q casts the kitten ability');
      await t.wait(400);
      const kcd = await inPage(t, () => {
        const e = document.querySelector('.ab-ability');
        const sw = e.querySelector('.ab-sweep');
        return { cd: e.classList.contains('is-cd'), sweep: parseFloat(getComputedStyle(sw).getPropertyValue('--cd')) || 0, start: parseFloat(sw.style.getPropertyValue('--cd0')) || 0,
          run: sw.classList.contains('is-run'), num: e.querySelector('.ab-num').textContent,
          left: window.__GAME__.ctx.companions.cooldownLeft?.() ?? 0, op: getComputedStyle(sw).opacity };
      });
      t.log(`kitten slot ${JSON.stringify(kcd)}`);
      t.assert(kcd.cd && kcd.run && kcd.start > 30 && kcd.sweep > 30 && +kcd.op > 0.5, `kitten cooldown sweep (${JSON.stringify(kcd)})`);
      t.assert(/^\d+$/.test(kcd.num) && +kcd.num >= 1, `whole seconds on the slot ("${kcd.num}")`);
      await shot(t, '40-ability-bar-cooldown');
      // ---- hover tooltip (parchment, the move's rule + its key)
      const sr = await inPage(t, () => { const r = document.querySelector('.ab-guard').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.move(sr.x, sr.y);
      await t.wait(300);
      const tip = await inPage(t, () => { const e = document.querySelector('.ab-tip'); return { on: e.classList.contains('is-on'), text: e.textContent }; });
      t.assert(tip.on && /Stand/.test(tip.text) && /Space/.test(tip.text), `tooltip "${tip.text}"`);
      await fontAudit(t, 'ability bar + tooltip');
      await shot(t, '41-ability-tip');
      await page.mouse.move(640, 300);
      // ---- the Stand: Grit arc above her head
      await page.keyboard.down('Space');
      await t.wait(400);
      const grit = await inPage(t, () => ({ arc: document.querySelector('.grit-arc')?.classList.contains('is-on'), slot: document.querySelector('.ab-guard').classList.contains('is-active'), segs: document.querySelectorAll('.grit-arc .ga-seg.f').length }));
      await shot(t, '42-stand-grit-arc');
      await page.keyboard.up('Space');
      // a long Stand is the Meme Cam pose trigger: end it (Meme Cam has its own block)
      await inPage(t, () => { const g = window.__GAME__; g.ctx.player.memeCamTrigger?.reset?.(); if (g.mode !== 'play') g.setMode('play'); });
      await t.wait(300);
      t.assert(grit.arc && grit.slot && grit.segs >= 1, `Grit arc + active Stand slot (${JSON.stringify(grit)})`);
      // ---- presets: glyphs follow the bindings (diablo: Space = Tumble, L = Stand)
      await inPage(t, () => { const g = window.__GAME__, c = g.ctx; c.state.settings.controlPreset = 'diablo'; c.bus.emit(g.E.SETTINGS_CHANGED, { key: 'controlPreset', value: 'diablo' }); });
      for (let k = 0; k < 30 && (await inPage(t, () => document.querySelector('.ab-dodge .ab-key').textContent)) !== 'Space'; k++) await t.wait(100);
      const dk = await inPage(t, () => ({ dodge: document.querySelector('.ab-dodge .ab-key').textContent, guard: document.querySelector('.ab-guard .ab-key').textContent, preset: window.__GAME__.ctx.input.preset, mode: window.__GAME__.mode, cam: window.__GAME__.ctx.cam.modeName, bar: document.querySelector('.ability-bar').className, ev: window.__GAME__.events.slice(-15) }));
      t.assert(dk.dodge === 'Space' && dk.guard === 'L', `diablo glyphs ${JSON.stringify(dk)}`);
      await inPage(t, () => { const g = window.__GAME__, c = g.ctx; c.state.settings.controlPreset = 'hybrid'; c.bus.emit(g.E.SETTINGS_CHANGED, { key: 'controlPreset', value: 'hybrid' }); });
      // ---- §10.2 cursors: ground paw, sword over a foe, ×2 size, high contrast (no kitten around: Mochi is an NPC pick)
      await inPage(t, () => window.__GAME__.ctx.companions.setActive([]));
      await t.wait(300);
      const me = await inPage(t, () => window.__GAME__.ctx.player.pos.toArray());
      for (const [dx, dz] of [[2, 2], [-2, 3], [3, -1], [-3, -2], [0, 4]]) {       // a spot with nothing pickable on it
        const gs = await inPage(t, ([x, z]) => window.__GAME__.screen(x, z), [me[0] + dx, me[2] + dz]);
        await page.mouse.move(gs.x, gs.y); await t.frames(6);
        if ((await inPage(t, () => window.__GAME__.ctx.cam.hover.kind)) === 'ground') break;
      }
      const c0 = await inPage(t, () => ({ kind: document.getElementById('app').dataset.cursor, css: window.__GAME__.ctx.renderer.domElement.style.cursor.slice(0, 40) }));
      t.assert(c0.kind === 'ground' && /data:image\/svg/.test(c0.css), `ground cursor (${JSON.stringify(c0)})`);
      const rat = await inPage(t, ([x, z]) => { const e = window.__GAME__.spawn('rat_pike', x - 3, z + 4); e.ai && (e.ai.sleep = true); window.__uiRat = e; return true; }, [me[0], me[2]]);
      await t.frames(20);
      // the rat may wander: follow it with the mouse until the hover pick reports it (≤ 3 s)
      let c1 = null;
      for (let k = 0; k < 12; k++) {
        const rs = await inPage(t, () => { const e = window.__uiRat; return window.__GAME__.screen(e.pos.x, e.pos.z, e.pos.y + 0.45); });
        await page.mouse.move(rs.x, rs.y); await t.frames(4);
        c1 = await inPage(t, () => ({ kind: document.getElementById('app').dataset.cursor, hover: window.__GAME__.ctx.cam.hover.kind }));
        if (c1.kind === 'enemy') break;
      }
      t.assert(rat && c1.kind === 'enemy', `sword cursor over a foe (${JSON.stringify(c1)})`);
      // the hovered foe shows its HP pill
      const pill0 = await inPage(t, () => document.querySelectorAll('.hpb.is-on').length);
      t.assert(pill0 >= 1, `hover shows the HP pill (${pill0})`);
      await inPage(t, () => { const g = window.__GAME__, c = g.ctx; c.state.settings.cursorSize = 2; c.state.settings.cursorContrast = true; });
      await t.frames(4);
      const c2 = await inPage(t, () => decodeURIComponent(window.__GAME__.ctx.renderer.domElement.style.cursor));
      t.assert(/width="64"/.test(c2) && /#2A1E18/i.test(c2), 'cursor ×2 + high contrast (WA: dark-cocoa ink, never black)');
      await inPage(t, () => { const c = window.__GAME__.ctx; c.state.settings.cursorSize = 1; c.state.settings.cursorContrast = false; });
      // ---- §10.4 HP pills: hit two foes, select one; pills show, the selection is outlined, no centre reticle
      await page.mouse.move(40, 40);
      await inPage(t, ([x, z]) => {
        const g = window.__GAME__, c = g.ctx, E = g.E, p = c.player;
        const b = g.spawn('rat_pike', x + 2.5, z + 3.5); b.ai && (b.ai.sleep = true); window.__uiRat2 = b;
        for (const e of [window.__uiRat, b]) { e.hp = Math.round(e.maxHp * 0.55); c.bus.emit(E.HIT, { attacker: p, target: e, damage: 12, position: e.pos.clone(), dir: e.pos.clone().sub(p.pos).normalize(), killed: false, blocked: false }); }
        c.cam.select?.(window.__uiRat);
      }, [me[0], me[2]]);
      await t.frames(10);
      const pills = await inPage(t, () => {
        const on = [...document.querySelectorAll('.hpb.is-on')];
        return { n: on.length, sel: on.filter((e) => e.classList.contains('is-sel')).length, w: on[0]?.getBoundingClientRect().width ?? 0,
          f: on.map((e) => e.querySelector('.hpb-fill').getBoundingClientRect().width), reticle: document.querySelector('.hud-reticle')?.classList.contains('is-on') };
      });
      t.log(`pills ${JSON.stringify(pills)}`);
      t.assert(pills.n === 2 && pills.sel === 1, `two pills, one selected (${JSON.stringify(pills)})`);
      t.assert(pills.w >= 36 && pills.w <= 42 && pills.f.every((w) => w > 12 && w < 30), 'pill size 36 × 5 with a part fill');
      t.assert(!pills.reticle, 'no centre-screen lock reticle in iso (C8)');
      await shot(t, '43-hp-pills');
      // ---- controls card per preset (◀ ▶ flips the KBM column)
      await inPage(t, () => { const ui = window.__GAME__.ctx.ui; ui.pause(); ui.menus.openControls(); });
      await t.wait(500);
      const card0 = await inPage(t, () => ({ head: document.querySelector('.ctl-preset .ch-val')?.textContent, move: [...document.querySelectorAll('.ctl-row')].find((r) => /^Move/.test(r.textContent))?.textContent }));
      await inPage(t, () => { const s = window.__GAME__.ctx.ui.menus.top; s.items[0].adjust(1); s.items[0].adjust(1); });
      await t.wait(200);
      const card1 = await inPage(t, () => ({ head: document.querySelector('.ctl-preset .ch-val')?.textContent, move: [...document.querySelectorAll('.ctl-row')].find((r) => /^Move/.test(r.textContent))?.textContent }));
      t.log(`controls card ${JSON.stringify(card0)} → ${JSON.stringify(card1)}`);
      t.assert(/Hybrid/.test(card0.head) && /RMB \/ WASD/.test(card0.move), 'card: hybrid page');
      t.assert(/Diablo/.test(card1.head) && /LMB \/ WASD/.test(card1.move), 'card: diablo page');
      await fontAudit(t, 'controls card');
      await shot(t, '44-controls-card-diablo');
      // ---- settings: the §10.7 rows; invertY hidden in iso
      await inPage(t, () => { const m = window.__GAME__.ctx.ui.menus; m.pop(); m.openSettings(); });
      await t.wait(400);
      const rows = await inPage(t, () => [...document.querySelectorAll('.srow .srow-lbl')].map((e) => e.textContent));
      t.assert(rows.some((r) => /Cursor size/.test(r)) && rows.some((r) => /High-contrast/.test(r)) && rows.some((r) => /Auto-Riposte/.test(r)) && rows.some((r) => /Camera (follows|lock)/.test(r)), `new settings rows (${rows.length}: K7 camLockMode row)`);
      t.assert(!rows.some((r) => /invert/i.test(r)), 'invertY hidden in iso');
      await inPage(t, () => window.__GAME__.ctx.ui.resume());
      await t.wait(300);
      await inPage(t, () => { const c = window.__GAME__.ctx; c.cam.select?.(null); c.companions.setActive([]); for (const e of [...c.enemies.list]) c.enemies.despawn(e); });
    },
  },
  {
    name: 'ui:touch-cluster', order: 49, level: null, timeout: 420000,
    async run(t) {
      await touchRun(t, 844, 390, 'landscape', async (m) => {
        const { G, pg, ptr, mshot, untilM, w, h } = m;
        const L = await G(() => { const tc = window.__GAME__.ctx.ui.touch; const b = tc.layout.buttons; return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [v.x, v.y, v.size]])); });
        // geometry: ⚔ 96 px 68 px from the right / bottom, 🛡 76 px directly left, every visible button ≥ 56 px
        const dom = await G(() => Object.fromEntries([...document.querySelectorAll('.touch-cluster .tbtn')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.action, [r.x + r.width / 2, r.y + r.height / 2, r.width, e.classList.contains('is-hidden')]]; })));
        t.log(`cluster ${JSON.stringify(dom)}`);
        t.assert(Math.abs(dom.attack[2] - 96) < 1 && Math.abs(w - dom.attack[0] - 68) < 2 && Math.abs(h - dom.attack[1] - 68) < 2, `⚔ 96 px at 68/68 (${dom.attack})`);
        t.assert(Math.abs(dom.guard[2] - 76) < 1 && dom.guard[0] < dom.attack[0] - 100, '🛡 76 px left of ⚔');
        t.assert(Object.values(dom).filter((d) => !d[3]).every((d) => d[2] >= 55.5), 'every visible button ≥ 56 px');
        t.assert(L.attack && L.meow, 'layout from touchLayout.js');
        await guideInView(t, G, (ms) => pg.waitForTimeout(ms), 'landscape 844x390');
        // ---- hero clearance: no visible button + its 40 px dead ring reaches the disc around her on screen (layout.clearR:
        // 120 px from a 430 px short side, scaled below it)
        await pg.waitForTimeout(1200);
        const her = await G(() => { const c = window.__GAME__.ctx, v = c.player.pos.clone(); v.y += 0.8; v.project(c.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
        const clearR = await G(() => window.__GAME__.ctx.ui.touch.layout.clearR ?? 120);
        const intr = Object.entries(dom).filter(([, d]) => !d[3]).map(([n, d]) => [n, Math.hypot(d[0] - her[0], d[1] - her[1]) - d[2] / 2 - 40 - clearR]).filter(([, g]) => g < 0);
        t.log(`her chest at ${her.map(Math.round)}; intruding ${JSON.stringify(intr)}`);
        t.assert(intr.length === 0, `no button's dead ring within ${clearR.toFixed(0)} px of her (${JSON.stringify(intr)})`);
        // ---- ⚔ tap swings
        await G(() => window.__GAME__.clearEvents());
        await pg.touchscreen.tap(Math.round(dom.attack[0]), Math.round(dom.attack[1]));
        t.assert(!!(await untilM(() => window.__GAME__.events.includes('player:swing'), null, 3000)), '⚔ tap swings');
        await pg.waitForTimeout(800);
        // ---- 🛡 hold guards (+ the Grit arc over her head)
        await untilM(() => { const p = window.__GAME__.ctx.player; return !/attack|slash|swing|combo|charge|recover/i.test(p.stateName ?? ''); }, null, 5000);
        await ptr('pointerdown', dom.guard[0], dom.guard[1], 21);
        const g1 = await untilM(() => { const p = window.__GAME__.ctx.player; return p.stateName === 'guard' || p.state === 'guard'; }, null, 5000);
        const arc = await untilM(() => document.querySelector('.grit-arc')?.classList.contains('is-on'), null, 3000);
        await mshot('50-touch-stand');
        await ptr('pointerup', dom.guard[0], dom.guard[1], 21);
        // a long Stand is the Meme Cam pose trigger: end it (Meme Cam has its own block)
        await G(() => { const g = window.__GAME__; g.ctx.player.memeCamTrigger?.reset?.(); if (g.mode !== 'play') g.setMode('play'); });
        t.assert(!!g1, '🛡 hold guards');
        t.assert(!!arc, 'Grit arc shows while guarding');
        await pg.waitForTimeout(500);
        // ---- swipe on the free area tumbles (≥ 48 px in ≤ 150 ms)
        await G(() => window.__GAME__.clearEvents());
        const fx = Math.round(w * 0.6), fy = Math.round(h * 0.35);
        // one synchronous burst: 70 px in ~0 ms (a real flick; setTimeout steps stretch past 150 ms under load)
        await G(([x, y]) => {
          const root = document.querySelector('.touch-root');
          const ev = (type, px) => root.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31, clientX: px, clientY: y, pointerType: 'touch' }));
          ev('pointerdown', x); ev('pointermove', x + 30); ev('pointermove', x + 70); ev('pointerup', x + 70);
        }, [fx, fy]);
        t.assert(!!(await untilM(() => window.__GAME__.events.includes('player:dodge'), null, 2000)), 'a swipe tumbles');
        await pg.waitForTimeout(700);
        // ---- the kitten portrait: drag aims (pad + ✕ chip + the fx indicator), release over ✕ cancels
        await G(() => { const c = window.__GAME__.ctx; c.state.companions.unlocked = ['mochi']; c.state.setFlag('meadow.mochi', true); c.companions.setActive(['mochi']); });
        await untilM(() => !document.querySelector('.tb-ability').classList.contains('is-hidden'), null, 6000);
        await pg.waitForTimeout(400);
        const ab = await G(() => { const r = document.querySelector('.tb-ability').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, document.querySelector('.tb-ability').classList.contains('is-hidden')]; });
        t.assert(!ab[2], 'the kitten portrait shows with a companion');
        await G(() => window.__GAME__.clearEvents());
        await ptr('pointerdown', ab[0], ab[1], 41);
        for (let k = 1; k <= 5; k++) await ptr('pointermove', ab[0] - k * 10, ab[1] - k * 6, 41);
        await untilM(() => !!window.__GAME__.ctx.companions?.aim?.active, null, 3000);
        const aim = await G(() => ({ pad: document.querySelector('.tb-aimpad')?.classList.contains('is-on'), chip: document.querySelector('.tb-cancel')?.classList.contains('is-on'),
          ind: !!window.__GAME__.ctx.companions?.aim?.active, va: window.__GAME__.ctx.input.virtualAim?.active }));
        await mshot('51-touch-ability-aim');
        const cc = await G(() => { const r = document.querySelector('.tb-cancel').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        await ptr('pointermove', cc[0], cc[1], 41);
        await pg.waitForTimeout(120);
        const hot = await G(() => document.querySelector('.tb-cancel')?.classList.contains('is-hot'));
        await mshot('52-touch-ability-cancel');
        await ptr('pointerup', cc[0], cc[1], 41);
        await pg.waitForTimeout(600);
        const after = await G(() => ({ cast: window.__GAME__.events.includes('companion:ability'), ind: !!window.__GAME__.ctx.companions?.aim?.active, pad: document.querySelector('.tb-aimpad')?.classList.contains('is-on') }));
        t.log(`ability aim ${JSON.stringify(aim)} → hot ${hot} → ${JSON.stringify(after)}`);
        t.assert(aim.pad && aim.chip && aim.va, `drag shows the aim pad + ✕ (${JSON.stringify(aim)})`);
        t.assert(aim.ind, 'the fx / companions ability indicator is live while aiming');
        t.assert(hot, '✕ lights under the finger');
        t.assert(!after.cast && !after.ind && !after.pad, `release over ✕ cancels (${JSON.stringify(after)})`);
        // a plain tap smart-casts
        await pg.touchscreen.tap(Math.round(ab[0]), Math.round(ab[1]));
        t.assert(!!(await untilM(() => window.__GAME__.events.includes('companion:ability'), null, 3000)), 'portrait tap = smart cast');
        await pg.waitForTimeout(500);
        const cd = await G(() => ({ txt: document.querySelector('.tb-ability .tb-cd')?.textContent, cd: document.querySelector('.tb-ability').classList.contains('is-cd'), milk: document.querySelector('.tb-milk .tb-count')?.textContent }));
        t.assert(cd.cd && /^\d+$/.test(cd.txt), `portrait cooldown seconds (${JSON.stringify(cd)})`);
        t.assert(/^×\d+$/.test(cd.milk ?? ''), `milk count on the cluster (${cd.milk})`);
        // HP pills are the touch size (44 × 6) on a hit foe
        await G(() => { const g = window.__GAME__, c = g.ctx, p = c.player; const e = g.spawn('rat_pike', p.pos.x - 2, p.pos.z + 3); e.ai && (e.ai.sleep = true); e.hp = Math.round(e.maxHp / 2); c.bus.emit(g.E.HIT, { attacker: p, target: e, damage: 10, position: e.pos.clone(), dir: e.pos.clone().sub(p.pos).normalize(), killed: false, blocked: false }); });
        const pw = await untilM(() => document.querySelector('.hpb.is-on')?.getBoundingClientRect().width ?? 0, null, 3000);
        t.assert(pw >= 44 && pw <= 50, `touch HP pill 44 px (${pw})`);
        t.assert(!(await G(() => document.querySelector('.ability-bar')?.classList.contains('is-on'))), 'no desktop ability bar on touch');
        await mshot('53-touch-cluster');
        await m.fontAudit('touch cluster');
        // ---- settings on touch: desk-only rows hidden, Controls (touch rows + Edit layout) first
        await G(() => { const ui = window.__GAME__.ctx.ui; ui.pause(); ui.menus.openSettings(); });
        await pg.waitForTimeout(400);
        const ts = await G(() => {
          const sc = document.querySelector('.menu-scroll');
          return { dev: window.__GAME__.ctx.input.device, groups: [...sc.querySelectorAll('.srow-group')].map((e) => e.textContent), rows: [...sc.querySelectorAll('.srow .srow-lbl')].map((e) => e.textContent),
            btns: [...sc.querySelectorAll('button, .btn')].map((e) => e.textContent.trim()), h: sc.clientHeight, sh: sc.scrollHeight };
        });
        t.log(`touch settings ${ts.dev} ${ts.h}/${ts.sh} groups ${ts.groups.join(',')} first rows ${ts.rows.slice(0, 4).join(' | ')}`);
        t.assert(ts.groups[0] === 'Controls' && /Touch button size/.test(ts.rows[0] ?? ''), 'touch settings open on Controls (touch rows first)');
        t.assert(!ts.rows.some((r) => /Cursor size|High-contrast|Edge pan|Look sensitivity|Mouse & keys/i.test(r)), 'desk-only rows hidden on touch');
        t.assert(new Set(ts.groups).size === ts.groups.length, 'no duplicate group headings on touch');
        await mshot('53b-touch-settings');
        await G(() => window.__GAME__.ctx.ui.resume());
        await pg.waitForTimeout(300);
        // ---- §9.2 Edit layout: drag Meow; Done stores settings.touchLayout; the cluster follows
        await G(() => { const ui = window.__GAME__.ctx.ui; ui.pause(); ui.editTouchLayout(); });
        await pg.waitForTimeout(400);
        const mw = await G(() => { const r = document.querySelector('.tb-meow').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        await ptr('pointerdown', mw[0], mw[1], 51);
        for (let k = 1; k <= 4; k++) await ptr('pointermove', mw[0] - k * 10, mw[1] - k * 8, 51);
        await mshot('54-touch-edit-layout');
        await ptr('pointerup', mw[0] - 40, mw[1] - 32, 51);
        const edit = await G(() => ({ on: document.querySelector('.touch-root').classList.contains('is-edit'), panel: !!document.querySelector('.tedit-panel'), all: [...document.querySelectorAll('.touch-cluster .tbtn')].every((e) => getComputedStyle(e).opacity > 0.5) }));
        await G(() => document.querySelector('.tedit-done').click());
        await pg.waitForTimeout(300);
        const saved = await G(() => ({ lay: window.__GAME__.ctx.state.settings.touchLayout, mode: window.__GAME__.mode, pause: window.__GAME__.ctx.ui.menus.top?.id, r: (() => { const r = document.querySelector('.tb-meow').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })() }));
        t.log(`edit layout ${JSON.stringify(edit)} → ${JSON.stringify(saved)}`);
        t.assert(edit.on && edit.panel && edit.all, 'edit mode shows every button + the panel');
        t.assert(Array.isArray(saved.lay?.meow) && Math.abs(saved.r[0] - (mw[0] - 40)) < 3 && Math.abs(saved.r[1] - (mw[1] - 32)) < 3, 'Done stores the dragged Meow position');
        t.assert(saved.pause === 'pause', 'back to the pause menu');
        await G(() => { const g = window.__GAME__, c = g.ctx; c.state.settings.touchLayout = null; c.ui.resume(); for (const e of [...c.enemies.list]) c.enemies.despawn(e); c.companions.setActive([]); });
        await pg.waitForTimeout(600);
        // ---- a foe standing in a dead ring is still tappable; bare ground there is swallowed
        const ring = await G(() => {
          const g = window.__GAME__, c = g.ctx, tc = c.ui.touch, b = tc.layout.buttons.guard;
          for (const e of [...c.enemies.list]) c.enemies.despawn(e);
          c.cam.select?.(null);
          const sx = b.x - b.r - 22, sy = b.y - 6, gp = c.cam.screenToGround(sx, sy, new g.THREE.Vector3());
          if (!gp) return null;
          const e = c.enemies.spawn('rat_pike', gp.clone()); if (e.ai) e.ai.sleep = true;
          return { gy: b.y - b.r - 22 < tc.layout.hudBottom ? b.y + b.r + 20 : b.y - b.r - 20, gxx: b.x };
        });
        if (ring) {
          // the camera may still be easing: re-seat the (sleeping) rat until its chest projects into ⛨'s dead ring
          let rp = null;
          for (let i = 0; i < 6; i++) {
            await pg.waitForTimeout(400);
            rp = await G(() => { const g = window.__GAME__, c = g.ctx, e = c.enemies.list.at(-1), v = e.pos.clone(); v.y += 0.4; v.project(c.camera);
              const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, b = c.ui.touch.layout.buttons.guard, d = Math.hypot(x - b.x, y - b.y);
              const tx = b.x - b.r - 22, ty = b.y - 6;
              const f = e.pos.clone().project(c.camera), fy = (1 - f.y) / 2 * innerHeight;      // feet → chest screen offset
              if (!(d > b.r + 6 && d <= b.r + 34)) { const gp = c.cam.screenToGround(tx, ty + (fy - y), new g.THREE.Vector3()); if (gp) { c.enemies.despawn(e); const n = c.enemies.spawn('rat_pike', gp); if (n.ai) n.ai.sleep = true; } }
              return { x, y, inRing: d > b.r && d <= b.r + 40 }; });
            if (rp.inRing) break;
          }
          await G(() => window.__GAME__.clearEvents());
          await pg.touchscreen.tap(Math.round(rp.x), Math.round(rp.y));
          const hit = await untilM(() => window.__GAME__.events.some((e) => e === 'player:order' || e === 'target:changed'), null, 3000);
          t.log(`dead-ring foe at ${Math.round(rp.x)},${Math.round(rp.y)} (in ring ${rp.inRing}) → ${JSON.stringify(await G(() => window.__GAME__.events.slice(-6)))}`);
          t.assert(!rp.inRing || !!hit, 'a tap on a foe inside a dead ring selects / orders');
          await G(() => { const c = window.__GAME__.ctx; for (const e of [...c.enemies.list]) c.enemies.despawn(e); c.cam.select?.(null); c.player.orders?.order?.('stop'); });
          await pg.waitForTimeout(700);
          await G(() => window.__GAME__.clearEvents());
          await pg.touchscreen.tap(Math.round(ring.gxx), Math.round(ring.gy));
          await pg.waitForTimeout(500);
          t.assert(!(await G(() => window.__GAME__.events.includes('player:order'))), 'a bare-ground tap in a dead ring does nothing');
        } else t.warn('dead-ring tap: no ground under the guard ring');
        // ---- §9.1 the top strip is open where no HUD card is; the hearts swallow a tap
        await G(() => { const c = window.__GAME__.ctx; c.player.orders?.order?.('stop'); window.__GAME__.clearEvents(); });
        await pg.touchscreen.tap(Math.round(w * 0.62), Math.round(h * 0.08));
        t.assert(!!(await untilM(() => window.__GAME__.events.includes('player:order'), null, 3000)), 'a tap in the top strip (no HUD card) orders');
        const hp = await G(() => { const b = document.querySelector('.hud-hearts .heart').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
        await G(() => { const c = window.__GAME__.ctx; c.player.orders?.order?.('stop'); window.__GAME__.clearEvents(); });
        await pg.touchscreen.tap(Math.round(hp[0]), Math.round(hp[1]));
        await pg.waitForTimeout(500);
        t.assert(!(await G(() => window.__GAME__.events.includes('player:order'))), 'a tap on the hearts does not reach the world');
        // ---- a pinch with one finger in the stick zone zooms instead of walking
        const z0 = await G(() => window.__GAME__.ctx.cam.zoomMul ?? 1);
        const cx = Math.round(w * 0.42) + 20, cy = Math.round(h * 0.55);
        await ptr('pointerdown', cx - 50, cy, 41); await pg.waitForTimeout(40); await ptr('pointerdown', cx + 50, cy, 42);
        for (let i = 1; i <= 8; i++) { await ptr('pointermove', cx - 50 - i * 8, cy, 41); await ptr('pointermove', cx + 50 + i * 8, cy, 42); await pg.waitForTimeout(30); }
        await ptr('pointerup', cx - 114, cy, 41); await ptr('pointerup', cx + 114, cy, 42);
        await pg.waitForTimeout(400);
        const pz = await G(() => ({ z: window.__GAME__.ctx.cam.zoomMul ?? 1, stick: window.__GAME__.ctx.ui.touch.stick.id }));
        t.assert(pz.z !== z0 && pz.stick === null, `pinch from the stick zone zooms (${z0} → ${pz.z})`);
        await G(() => window.__GAME__.ctx.cam.zoom?.(1));
        // ---- the floating stick's base stays off the corner: full speed toward it
        await ptr('pointerdown', 14, h - 14, 43);
        for (let i = 1; i <= 4; i++) { await ptr('pointermove', 14 - i * 3, h - 14 + i * 3, 43); await pg.waitForTimeout(30); }
        const mv = await G(() => { const m = window.__GAME__.ctx.input.move; return Math.hypot(m.x, m.y); });
        await ptr('pointerup', 2, h - 2, 43);
        t.assert(mv > 0.9, `a corner thumb reaches full deflection (${mv.toFixed(2)})`);
      });
    },
  },
  {
    name: 'ui:portrait', order: 50, level: null, timeout: 300000,
    async run(t) {
      await touchRun(t, 390, 844, 'portrait', async (m) => {
        const { G, pg, mshot, untilM, w, h } = m;
        const s = await G(() => {
          const btns = [...document.querySelectorAll('.touch-cluster .tbtn:not(.is-hidden)')].map((e) => { const r = e.getBoundingClientRect(); return { a: e.dataset.action, x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2 }; });
          let gap = Infinity;
          for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) gap = Math.min(gap, Math.hypot(btns[i].x - btns[j].x, btns[i].y - btns[j].y) - btns[i].r - btns[j].r);
          const hud = document.querySelector('.hud-tl')?.getBoundingClientRect();
          return { btns, gap, inView: btns.every((b) => b.x - b.r >= 0 && b.x + b.r <= innerWidth && b.y + b.r <= innerHeight), hudBottom: hud ? hud.bottom : 0,
            portrait: document.querySelector('.touch-root').classList.contains('is-portrait'), rot: !!document.querySelector('.ui-rotate.is-on'),
            toast: [...document.querySelectorAll('.ui-toast')].map((e) => e.textContent).concat(window.__toasts ?? []).join(' | '), iso: window.__GAME__.cam.iso() };
        });
        t.log(`portrait ${s.btns.length} buttons, min gap ${s.gap.toFixed(1)}, hud bottom ${s.hudBottom.toFixed(0)}, toast "${s.toast}", catPx ${s.iso.catPx.toFixed(1)}`);
        t.assert(s.portrait && s.btns.length >= 6, 'portrait cluster');
        t.assert(s.btns.every((b) => b.r * 2 >= 55.5), 'every button ≥ 56 px in portrait');
        t.assert(s.gap >= 7.5 && s.inView, `≥ 8 px apart, inside the viewport (${s.gap.toFixed(1)})`);
        t.assert(s.btns.find((b) => b.a === 'attack').r * 2 >= 81, '⚔ ×0.85 in portrait (≈ 82 px)');
        t.assert(s.hudBottom < h * 0.2, `condensed HUD strip (bottom ${s.hudBottom.toFixed(0)} of ${h})`);
        t.assert(!s.rot && /sideways/i.test(s.toast), 'a one-time rotate toast, no blocking card');
        t.assert(s.iso.catPx >= 27.5, `cat ≥ 28 px (${s.iso.catPx.toFixed(1)})`);
        await mshot('55-portrait');
        await m.fontAudit('portrait');
        await guideInView(t, G, (ms) => pg.waitForTimeout(ms), 'portrait 390x844');
        // a long toast wraps inside the screen, and the lesson card under the strip steps aside while it is up
        await G(() => document.querySelector('.ui-hint')?.classList.add('is-on')); // a lesson card up, as in the tutorial
        await G(() => window.__GAME__.ctx.bus.emit('ui:toast', { text: 'Standing your ground fills Valor. Hold the Stand near enemies to block and counter their swings.', icon: 'valor' }));
        await untilM(() => [...document.querySelectorAll('.ui-toast:not(.is-out)')].some((e) => /Valor/.test(e.textContent)), null, 3000);
        await G(() => { for (const q of window.__GAME__.ctx.ui?.toasts?.q?.shown ?? []) if (/Valor/.test(q.text)) { q.__life = q.life; q.life = 1e4; } }); // hold it for the shot
        await pg.waitForTimeout(450); // the inDown entry + the card's .3 s fade
        const tr = await G(() => {
          const ts = [...document.querySelectorAll('.ui-toast:not(.is-out)')];
          if (!ts.some((e) => /Valor/.test(e.textContent))) return null;
          const hint = document.querySelector('.ui-hint.is-on');
          return { rects: ts.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }), w: innerWidth,
            hintOp: hint ? +getComputedStyle(hint).opacity : -1 };
        });
        t.assert(!!tr, 'long portrait toast shown');
        if (tr) {
          t.log(`portrait toasts ${JSON.stringify(tr.rects.map((r) => r.map(Math.round)))} of ${tr.w}, hint opacity ${tr.hintOp}`);
          t.assert(tr.rects.every(([l, r]) => l >= 0 && r <= tr.w), 'every portrait toast lies within 0..innerWidth');
          t.assert(tr.hintOp <= 0.05, `lesson card hidden while a toast is up (${tr.hintOp})`);
          await mshot('55b-portrait-toast');
        }
        await G(() => { window.__GAME__.ctx.ui?.toasts?.clear(); document.querySelector('.ui-hint')?.classList.remove('is-on'); });
        // ⚔ tap swings in portrait too
        const at = s.btns.find((b) => b.a === 'attack');
        await G(() => window.__GAME__.clearEvents());
        await pg.touchscreen.tap(Math.round(at.x), Math.round(at.y));
        t.assert(!!(await untilM(() => window.__GAME__.events.includes('player:swing'), null, 3000)), 'portrait ⚔ tap swings');
        // the toast is one-time (a flag)
        t.assert(await G(() => window.__GAME__.ctx.state.getFlag('seen.tut.rotate')), 'seen.tut.rotate set');
        // the title logo fits a portrait phone: the whole word and its pink bow inside the screen (was "AWSBURY KNIGH")
        await G(() => { const g = window.__GAME__; const ui = g.ctx.ui; ui._hasSaveReal ??= ui.hasSave; ui.hasSave = () => false; ui.showTitle({ fromStory: true }); });
        await untilM(() => !!document.querySelector('.ui-title.is-on.is-logo'), null, 4000);
        await pg.waitForTimeout(900); // logoPop
        const lg = await G(() => {
          const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [b.left, b.right, b.top, b.bottom] : null; };
          return { word: r('.ui-title .logo-word'), bow: r('.ui-title .logo-bow'), w: innerWidth, h: innerHeight };
        });
        t.log(`portrait title logo ${JSON.stringify(lg.word?.map(Math.round))}, bow ${JSON.stringify(lg.bow?.map(Math.round))} in ${lg.w}x${lg.h}`);
        const inside = (b) => !!b && b[0] >= 0 && b[1] <= lg.w && b[2] >= 0 && b[3] <= lg.h;
        t.assert(inside(lg.word), `portrait: the title word fits the viewport (${JSON.stringify(lg.word?.map(Math.round))} of ${lg.w})`);
        t.assert(inside(lg.bow), `portrait: the pink bow is on-screen (${JSON.stringify(lg.bow?.map(Math.round))})`);
        await mshot('55c-portrait-title');
        await G(() => { const g = window.__GAME__; const ui = g.ctx.ui; ui.menus.setTitle(false); if (ui._hasSaveReal) ui.hasSave = ui._hasSaveReal; g.setMode('play'); });
        void w;
      });
    },
  },
];
