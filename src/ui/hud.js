// src/ui/hud.js  (owner: ui) — the §14.2 HUD: portrait (worried at HP ≤ 2, determined + glowing in Golden Hour),
// hearts (half-hearts, wobble on hit, pulse at HP ≤ 2), Grit shields (flash in the Stand, cracked at 0), the sword-
// shaped Valor meter (fills from the hilt; gold notch at 50; all gold with sparkles + the Golden Hour glyph at 100 once Shard 2 is held),
// lives (cat head + ×9, a ghost kitten floats up on a lost life), milk bottles (sip drains one), fish / kittens n/3 /
// letter seal (pop on change), the companion portrait with its radial cooldown ring and "zzz", the boss bar (name
// ribbon, red fill + white chip trail, phase pips, gold Dizzy bar), the objective line + bar, the lock-on reticle with
// enemy HP pips (shown on the first hit, fade after 3 s) and the "⚔ Riposte!" prompt.
// Reads player / companion / boss fields (§19.4) + bus events; counters from ctx.state at 10 Hz (tech.md §15).
import * as THREE from 'three';
import { PLAYER } from '../core/config.js';
import { E } from '../core/events.js';
import { SIGNATURE } from '../characters/palette.js';
import { el, setText, setHtml, flag, setVar, pulse, place } from './dom.js';
import { tx, heartStates, frac, objectiveText, levelKittens, levelLetterId, actionGlyph, esc } from './text.js';
import { portraitSVG } from './portraits.js';
import * as I from './icons.js';

const PIP_LIFE = 3.0;          // §14.2: the pip bar fades 3 s after the last hit
const CHIP_HOLD = 0.55, CHIP_RATE = 0.45;
export const HUD_SAVE_SEC = 1.8;  // the "Saved" seal stays up this long
const _v = new THREE.Vector3();

/** The sword-shaped Valor meter (viewBox 0 0 220 40). Blade 40 → 204 (tip 214). */
const BLADE = { x0: 40, x1: 204, tip: 214 };
function valorSvg() {
  const g = I.uid('vg');
  const blade = `M${BLADE.x0} 13.5H${BLADE.x1}L${BLADE.tip} 20 ${BLADE.x1} 26.5H${BLADE.x0}Z`;
  return `<svg class="valor-svg" viewBox="0 0 222 40" aria-hidden="true"><defs>`
    + `<linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#CDD3DB"/><stop offset="1" stop-color="#8E949E"/></linearGradient>`
    + `<linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6DA"/><stop offset=".45" stop-color="#FFD34D"/><stop offset="1" stop-color="#D99A2B"/></linearGradient>`
    + `<clipPath id="${g}c"><path d="${blade}"/></clipPath></defs>`
    // blade well
    + `<path d="${blade}" fill="#2A211B" fill-opacity=".55"/>`
    + `<g clip-path="url(#${g}c)"><rect class="v-fill" x="${BLADE.x0}" y="10" width="0" height="20" fill="url(#${g}s)"/>`
    + `<rect class="v-gold" x="${BLADE.x0}" y="10" width="0" height="20" fill="url(#${g}g)"/>`
    + `<rect class="v-shine" x="${BLADE.x0}" y="10" width="26" height="20" fill="#fff" opacity="0"/></g>`
    + `<path d="M${BLADE.x0 + 2} 20H${BLADE.x1 - 4}" stroke="#2A211B" stroke-width="1.2" opacity=".35"/>`
    + `<path d="${blade}" fill="none" stroke="#2A1E18" stroke-width="2" stroke-linejoin="round"/>`
    // the 50 notch
    + `<path class="v-notch" d="M${(BLADE.x0 + BLADE.x1) / 2} 8.5l3.6 4.6-3.6 4.6-3.6-4.6Z" stroke="#2A1E18" stroke-width="1.4"/>`
    // hilt: pommel, grip, crossguard
    + '<circle cx="8.5" cy="20" r="6" fill="#D9B26A" stroke="#2A1E18" stroke-width="1.8"/><circle cx="7" cy="18.4" r="1.8" fill="#FFF1C4"/>'
    + '<rect x="13.5" y="16" width="20" height="8" rx="3" fill="#6B4429" stroke="#2A1E18" stroke-width="1.8"/>'
    + '<path d="M17 16.5v7M21.5 16.5v7M26 16.5v7" stroke="#4A2E1F" stroke-width="1.6"/>'
    + '<rect x="33.5" y="5" width="7" height="30" rx="3.2" fill="#D9B26A" stroke="#2A1E18" stroke-width="1.8"/><path d="M35.6 8v8" stroke="#FFF1C4" stroke-width="1.6" stroke-linecap="round"/>'
    + '<g class="v-sparks" fill="#FFF6DA"><path d="M70 9l1.4 3.4 3.4 1.4-3.4 1.4L70 18.6l-1.4-3.4-3.4-1.4 3.4-1.4Z"/><path d="M128 25l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2Z"/><path d="M176 8l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z"/></g>'
    + '</svg>';
}

export class Hud {
  /** @param {any} ctx @param {HTMLElement} parent */
  constructor(ctx, parent) {
    this.ctx = ctx;
    const root = this.root = el('div', 'hud', { parent });
    // ---- top-left cluster
    const tl = el('div', 'hud-tl', { parent: root });
    this.portraitWrap = el('div', 'hud-portrait', { parent: tl });
    this.portraitImg = el('div', 'hud-portrait-img', { parent: this.portraitWrap });
    el('div', 'hud-portrait-bow', { html: I.bowSvg(), parent: this.portraitWrap });
    this.livesEl = el('div', 'hud-lives', { parent: this.portraitWrap, html: `<span class="lives-ico">${I.catHead()}</span><span class="lives-n"></span>` });
    this.livesN = this.livesEl.querySelector('.lives-n');
    this.ghost = el('div', 'hud-ghost', { html: I.ghostKitten(), parent: this.livesEl });
    const stats = el('div', 'hud-stats', { parent: tl });
    this.heartsEl = el('div', 'hud-hearts', { parent: stats });
    this.gritEl = el('div', 'hud-grit', { parent: stats });
    this.valorEl = el('div', 'hud-valor', { parent: stats, html: valorSvg() + `<span class="valor-sun">${I.sun()}</span>` });
    this.vFill = this.valorEl.querySelector('.v-fill');
    this.vGold = this.valorEl.querySelector('.v-gold');
    this.vShine = this.valorEl.querySelector('.v-shine');
    // ---- bottom-left: milk
    this.milkEl = el('div', 'hud-milk', { parent: root });
    // ---- top-right: fish, kittens, letter
    const tr = el('div', 'hud-tr', { parent: root });
    this.fishEl = el('div', 'hud-count hud-fish', { parent: tr, html: `<span class="c-ico">${I.fish()}</span><span class="c-n">0</span>` });
    this.kitEl = el('div', 'hud-count hud-kits', { parent: tr, html: `<span class="c-ico">${I.catHead({ fur: '#E3C9A2', deep: '#C9A47A', bow: false, eyes: '#5E8FA8' })}</span><span class="c-n">0/3</span>` });
    this.letterEl = el('div', 'hud-count hud-letter', { parent: tr, html: `<span class="c-ico"></span>` });
    // ---- bottom-right: companion
    this.compEl = el('div', 'hud-comp', { parent: root });
    this.compEl.innerHTML = `<div class="comp-ring">${I.ring('comp-ring-svg')}</div><div class="comp-face"></div><div class="comp-key"></div><div class="comp-zzz">z<span>z</span><span>z</span></div>`;
    this.compRing = this.compEl.querySelector('.ring-fg');
    this.compFace = this.compEl.querySelector('.comp-face');
    this.compKey = this.compEl.querySelector('.comp-key');
    // ---- bottom-right, above the companion: the "Saved" wax seal (§14.1; polls ctx.save.lastSave, requests/save.md)
    this.saveEl = el('div', 'hud-save', { parent: root, html: `<span class="save-seal">${I.waxSeal(I.PINK_DEEP, 'paw')}</span><span class="save-txt"></span>` });
    this.saveTxt = this.saveEl.querySelector('.save-txt');
    this.saveT = 0;
    // ---- top-centre: boss bar + objective line
    const tc = el('div', 'hud-tc', { parent: root });
    this.bossEl = el('div', 'hud-boss', { parent: tc });
    this.bossEl.innerHTML = '<div class="boss-name"><span></span></div>'
      + '<div class="boss-row"><div class="boss-medal"><div class="boss-face"></div></div><div class="boss-bars">'
      + '<div class="boss-bar"><div class="boss-chip"></div><div class="boss-fill"></div><div class="boss-shine"></div><div class="boss-pips"></div></div>'
      + `<div class="boss-dizzy"><span class="dizzy-ico">${I.dizzyStars()}</span><div class="dizzy-track"><div class="dizzy-fill"></div></div><span class="dizzy-lbl"></span></div>`
      + '</div><div class="boss-cap"></div></div>';
    this.bossFace = this.bossEl.querySelector('.boss-face');
    this.bossName = this.bossEl.querySelector('.boss-name span');
    this.bossFill = this.bossEl.querySelector('.boss-fill');
    this.bossChip = this.bossEl.querySelector('.boss-chip');
    this.bossPips = this.bossEl.querySelector('.boss-pips');
    this.dizzyFill = this.bossEl.querySelector('.dizzy-fill');
    this.dizzyLbl = this.bossEl.querySelector('.dizzy-lbl');
    this.objEl = el('div', 'hud-obj', { parent: tc });
    this.objEl.innerHTML = `<div class="obj-line"><span class="obj-ico">${I.flag()}</span><span class="obj-txt"></span><span class="obj-pct"></span></div><div class="obj-bar"><div class="obj-fill"></div><div class="obj-marks"></div></div>`;
    this.objPct = this.objEl.querySelector('.obj-pct');
    this.objMarks = this.objEl.querySelector('.obj-marks');
    this.objTxt = this.objEl.querySelector('.obj-txt');
    this.objFill = this.objEl.querySelector('.obj-fill');
    this.toastSlot = el('div', 'hud-toast-slot', { parent: tc });
    // ---- world-anchored: lock reticle, enemy pips, riposte prompt
    this.reticle = el('div', 'hud-reticle', { parent: root, html: '<div class="ret-ring"></div><div class="ret-pips"></div>' });
    this.retPips = this.reticle.querySelector('.ret-pips');
    this.pipEls = [0, 1, 2, 3].map(() => el('div', 'hud-epips', { parent: root }));
    this.riposte = el('div', 'hud-riposte', { parent: root });

    // ---- model
    this.v = {};                 // last written values (DOM writes only on change)
    this.valorShown = 0;
    this.hits = new Map();       // enemy → seconds since the player's last hit
    this.boss = null; this.bossMax = 1; this.bossChipV = 1; this.bossHold = 0; this.bossOut = 0;
    this.objs = new Map(); this.objCur = null; this.objDoneT = 0;
    this.lastHit = 0;
    this.stillT = 0;
    this.visible = true; this.meme = false;
    const bus = ctx.bus, on = (n, f) => this._offs.push(bus.on(n, f));
    this._offs = [];
    on(E.PLAYER_DAMAGED, () => { pulse(this.heartsEl, 'is-hit'); pulse(this.portraitWrap, 'is-hit'); this.poll(true); });
    on(E.PLAYER_HEALED, () => { pulse(this.heartsEl, 'is-heal'); this.poll(true); });
    on(E.PLAYER_GRIT, (p) => { if (p?.broken) pulse(this.gritEl, 'is-broken'); else pulse(this.gritEl, 'is-tick'); this.poll(true); });
    on(E.PLAYER_VALOR, () => this.poll(true));
    on(E.PLAYER_GOLDEN, () => this.poll(true));
    on(E.PLAYER_MILK, (p) => this._milkEvent(p));
    on(E.PLAYER_LIFE_LOST, () => { pulse(this.ghost, 'is-float'); this.poll(true); });
    on(E.PLAYER_STILL_STANDING, () => { this.stillT = 1.4; pulse(this.heartsEl, 'is-still'); });
    on(E.ITEM_PICKUP, (p) => { if (p?.item === 'fish') this._pop(this.fishEl); this.poll(true); });
    on(E.KITTEN_RESCUED, () => { this._pop(this.kitEl); this.poll(true); });
    on(E.HIT, (h) => this._onHit(h));
    on(E.BOSS_START, (p) => this._bossStart(p));
    on(E.BOSS_PHASE, () => pulse(this.bossEl, 'is-phase'));
    on(E.BOSS_DIZZY, (p) => this._bossDizzy(p));
    on(E.BOSS_DEFEATED, () => { this.bossOut = 1.6; });
    on(E.OBJECTIVE, (p) => this._objective(p));
    on(E.LEVEL_LOADING, () => { this._bossHide(); this.objs.clear(); this.objCur = null; flag(this.objEl, 'is-on', false); this.hits.clear(); });
    on(E.LEVEL_LOADED, () => this.poll(true));
    on(E.COMPANION_CHANGED, () => this.poll(true));
    on(E.COMPANION_NAP, () => this.poll(true));
    on(E.INPUT_DEVICE, () => this.poll(true));
    this._pollT = 0;
  }

  setVisible(on) { if (this.visible !== on) { this.visible = on; flag(this.root, 'is-hidden', !on); } }
  setMeme(on) { this.meme = on; flag(this.root, 'is-meme', on); }

  _pop(e) { pulse(e, 'is-pop'); }

  /** Flash the "Saved" wax seal for HUD_SAVE_SEC. */
  showSaved() {
    setText(this.saveTxt, tx(this.ctx, 'toast.saved'));
    this.saveT = HUD_SAVE_SEC;
    flag(this.saveEl, 'is-on', true);
    pulse(this.saveEl, 'is-stamp');
  }

  // ------------------------------------------------------------------ events
  _milkEvent(p) {
    if (!p) return;
    if (p.phase === 'heal') {
      const bottles = this.milkEl.children, i = Math.max(0, Math.min(bottles.length - 1, p.left ?? 0));
      if (bottles[i]) pulse(bottles[i], 'is-sip');
    } else if (p.phase === 'start') pulse(this.milkEl, 'is-wiggle');
    this.poll(true);
  }

  _onHit(h) {
    if (!h || !h.target || h.blocked) return;
    const att = h.attacker, tgt = h.target;
    const byPlayer = att && (att === this.ctx.player || att.faction === 'player' || att.owner === this.ctx.player);
    if (!byPlayer || tgt === this.ctx.player || tgt === this.boss) return;
    if (!(tgt.tags?.has?.('enemy') || tgt.faction === 'enemy')) return;
    this.hits.set(tgt, 0);
    if (this.hits.size > 8) this.hits.delete(this.hits.keys().next().value);
  }

  _bossStart(p) {
    if (!p) return;
    this.boss = p.boss ?? null;
    this.bossMax = Math.max(1, p.maxHp ?? this.boss?.maxHp ?? 1);
    this.bossChipV = frac(this.boss?.hp ?? this.bossMax, this.bossMax); this.bossHold = 0; this.bossOut = 0; this._bossLast = null;
    setText(this.bossName, tx(this.ctx, p.name ?? p.id ?? ''));
    this.bossFace.innerHTML = portraitSVG(String(p.id ?? this.boss?.type ?? 'boss').replace(/^boss_/, ''), { expression: 'normal' });
    let pips = '';
    for (const at of p.phases ?? []) if (at > 0 && at < 1) pips += `<i style="left:${(at * 100).toFixed(1)}%"></i>`;
    setHtml(this.bossPips, pips);
    this._bossDizzy({ value: 0, max: p.dizzyMax ?? 100, dizzy: false });
    flag(this.bossEl, 'is-on', true);
    pulse(this.bossEl, 'is-enter');
  }

  _bossDizzy(p) {
    if (!p) return;
    setVar(this.dizzyFill, '--f', frac(p.value ?? 0, p.max ?? 100).toFixed(3));
    if (p.dizzy && !this.bossEl.classList.contains('is-dizzy')) pulse(this.bossEl, 'is-dizzy-in');
    flag(this.bossEl, 'is-dizzy', !!p.dizzy);
    setText(this.dizzyLbl, p.dizzy ? `${tx(this.ctx, 'hud.boss.dizzy')} ${tx(this.ctx, 'ui.boss.crit')}` : '');
  }

  _bossHide() { this.boss = null; this.bossOut = 0; flag(this.bossEl, 'is-on', false); }

  _objective(p) {
    if (!p || !p.id) return;
    const prev = this.objs.get(p.id);
    this.objs.set(p.id, { ...p });
    if (p.done) {
      if (this.objCur === p.id || !this.objCur) { this.objCur = p.id; this.objDoneT = 2.2; }
      if (!prev?.done) pulse(this.objEl, 'is-done');
    } else this.objCur = p.id;
    this._drawObjective();
  }

  _drawObjective() {
    const p = this.objCur ? this.objs.get(this.objCur) : null;
    flag(this.objEl, 'is-on', !!p);
    if (!p) return;
    const t = p.done ? tx(this.ctx, 'obj.done') : objectiveText(this.ctx, p);
    setText(this.objTxt, t);
    const showBar = (p.max ?? 0) > 1 && !p.done;
    flag(this.objEl, 'has-bar', showBar);
    flag(this.objEl, 'is-frozen', !!p.frozen);
    flag(this.objEl, 'is-complete', !!p.done);
    setVar(this.objFill, '--f', frac(p.value ?? 0, p.max ?? 1).toFixed(3));
    // percentage objectives (The Line: max 100) show the number beside the bar unless the text already carries it
    const pct = showBar && (p.max ?? 0) >= 100 && !/%/.test(t) ? `${Math.floor(frac(p.value ?? 0, p.max) * 100)}%` : '';
    setText(this.objPct, pct);
    // optional milestone ticks (`marks`: fractions 0..1, e.g. The Line's wave thresholds); passed ones turn gold
    const marks = Array.isArray(p.marks) ? p.marks : null, f = frac(p.value ?? 0, p.max ?? 1);
    setHtml(this.objMarks, marks ? marks.filter((m) => m > 0 && m < 1).map((m) => `<i class="${f >= m ? 'f' : ''}" style="left:${(m * 100).toFixed(1)}%"></i>`).join('') : '');
  }

  // ------------------------------------------------------------------ polling (10 Hz + on events)
  poll(force = false) {
    const ctx = this.ctx, p = ctx.player, st = ctx.state, v = this.v;
    if (p) {
      const hp = Math.max(0, Math.round(p.hp ?? 0)), maxHp = Math.max(2, p.maxHp ?? 8);
      const hs = heartStates(hp, maxHp).join(',');
      if (force || v.hearts !== hs) {
        v.hearts = hs;
        const list = hs.split(',');
        const kids = this.heartsEl.children;
        while (kids.length < list.length) el('span', 'heart', { parent: this.heartsEl });
        while (kids.length > list.length) kids[kids.length - 1].remove();
        list.forEach((s, i) => { const k = kids[i]; if (k._s !== s) { k._s = s; k.innerHTML = I.heart(s); k.className = 'heart heart--' + s; } });
      }
      flag(this.heartsEl, 'is-low', hp > 0 && hp <= 2);
      // grit
      const gMax = p.gritMax ?? PLAYER.guard.grit, g = Math.max(0, p.grit ?? gMax);
      const gs = `${g}/${gMax}`;
      if (force || v.grit !== gs) {
        v.grit = gs;
        let html = '';
        for (let i = 0; i < gMax; i++) html += `<span class="grit">${I.gritShield(i < g ? 'full' : g <= 0 ? 'cracked' : 'empty')}</span>`;
        this.gritEl.innerHTML = html;
      }
      flag(this.gritEl, 'is-guard', !!p.guarding);
      // valor target (animated in render)
      this.valorTarget = Math.max(0, Math.min(PLAYER.valor.max, p.valor ?? 0));
      this.golden = !!p.golden;
      this.goldenFrac = p.golden ? frac(p.goldenT ?? 0, PLAYER.golden.dur) : 0;
      flag(this.root, 'is-golden', this.golden);
      // portrait
      const expr = p.golden ? 'determined' : p.alive === false || p.stateName === 'dead' ? 'sleep' : hp > 0 && hp <= 2 ? 'worried' : 'normal';
      const outfit = st?.cosmetics?.cape === 'red' ? 'swordcat_red' : 'swordcat';
      const pk = expr + outfit;
      if (force || v.portrait !== pk) { v.portrait = pk; this.portraitImg.innerHTML = portraitSVG(outfit, { expression: expr }); }
      flag(this.portraitWrap, 'is-worried', expr === 'worried');
      // lives
      const inf = !!p.infiniteLives || !Number.isFinite(p.lives);
      flag(this.livesEl, 'is-inf', inf);
      const ln = inf ? '' : tx(ctx, 'hud.lives', { n: p.lives ?? 9 });
      setText(this.livesN, ln);
      flag(this.livesEl, 'is-last', !inf && p.lives === 1);
      // milk
      const mm = Math.max(0, p.milkMax ?? 2), m = Math.max(0, Math.min(mm, p.milk ?? 0));
      const ms = `${m}/${mm}`;
      if (force || v.milk !== ms) {
        v.milk = ms;
        const kids = this.milkEl.children;
        while (kids.length < mm) el('span', 'milk', { parent: this.milkEl });
        while (kids.length > mm) kids[kids.length - 1].remove();
        for (let i = 0; i < mm; i++) { const k = kids[i], s = i < m ? 'f' : 'e'; if (k._s !== s) { k._s = s; k.innerHTML = I.milkBottle(s === 'f'); flag(k, 'is-empty', s === 'e'); } }
      }
    }
    // counters (§14.2: pop and bounce on change)
    if (st) {
      const fish = st.fish ?? 0;
      if (v.fish !== fish) { if (v.fish != null && fish !== v.fish) this._pop(this.fishEl); v.fish = fish; setText(this.fishEl.lastChild, String(fish)); }
      const lvl = ctx.levels?.current?.id ?? st.levelId;
      const k = levelKittens(st, lvl), ks = `${k.n}/${k.max}`;
      if (v.kits !== ks) { v.kits = ks; setText(this.kitEl.lastChild, tx(ctx, 'hud.kittens', { n: k.n, max: k.max })); }
      const lid = levelLetterId(lvl), has = !!lid && (st.letters ?? []).includes(lid);
      if (v.letter !== has) { if (v.letter === false && has) this._pop(this.letterEl); v.letter = has; this.letterEl.firstChild.innerHTML = I.letter(has); flag(this.letterEl, 'is-found', has); }
    }
    // save seal: a successful write since the last poll (the first poll only records the count)
    const ls = ctx.save?.lastSave;
    if (ls && Number.isFinite(ls.count)) {
      if (v.saveN != null && ls.count !== v.saveN && ls.ok !== false) this.showSaved();
      v.saveN = ls.count;
    }
    // companion portrait + ring
    const c = ctx.companions?.active?.[0] ?? null;
    flag(this.compEl, 'is-on', !!c);
    if (c) {
      const id = c.kittenId ?? c.id;
      if (v.comp !== id) {
        v.comp = id;
        this.compFace.innerHTML = portraitSVG(id, { expression: 'happy' });
        setVar(this.compEl, '--sig', SIGNATURE[id] ?? '#D9B26A');
      }
      const dev = ctx.input?.device ?? 'kbm';
      setText(this.compKey, actionGlyph('ability', dev));
      flag(this.compEl, 'is-nap', (c.napT ?? 0) > 0);
    }
  }

  // ------------------------------------------------------------------ per frame
  /** @param {number} dt real seconds */
  render(dt) {
    this._pollT += dt;
    if (this._pollT >= 0.1) { this._pollT = 0; this.poll(false); }
    const ctx = this.ctx, p = ctx.player;
    // valor: ease toward the target; gold state at 100 / Golden Hour drain
    const vt = this.valorTarget ?? 0;
    this.valorShown += (vt - this.valorShown) * Math.min(1, dt * 10);
    if (Math.abs(vt - this.valorShown) < 0.05) this.valorShown = vt;
    const w = BLADE.x1 - BLADE.x0 + (BLADE.tip - BLADE.x1);
    const full = vt >= PLAYER.valor.max - 0.01;
    const gold = this.golden || full;
    const fv = this.golden ? this.goldenFrac : this.valorShown / PLAYER.valor.max;
    const fw = (fv * w).toFixed(1);
    if (this.v.vw !== fw || this.v.vgold !== gold) {
      this.v.vw = fw; this.v.vgold = gold;
      this.vFill.setAttribute('width', gold ? '0' : fw);
      this.vGold.setAttribute('width', gold ? fw : '0');
    }
    flag(this.valorEl, 'is-half', vt >= PLAYER.valor.max * 0.5);
    flag(this.valorEl, 'is-full', full || this.golden);
    // the sun glyph promises Golden Hour: only once it is possible (Shard 2, same check as the touch Golden button)
    flag(this.valorEl, 'can-golden', this.golden || (full && (ctx.state?.shards ?? 0) >= 2));
    // a shine sweeps the blade while full
    if (full || this.golden) {
      this._shine = ((this._shine ?? 0) + dt * 0.8) % 1.6;
      const x = BLADE.x0 - 30 + this._shine * (w + 60) / 1.6;
      this.vShine.setAttribute('x', x.toFixed(1)); this.vShine.setAttribute('opacity', '0.45');
    } else if (this._shine != null) { this._shine = null; this.vShine.setAttribute('opacity', '0'); }
    // companion ring
    const c = ctx.companions?.active?.[0];
    if (c && this.compRing) {
      const r = Math.max(0, Math.min(1, c.readiness ?? (c.cooldown > 0 ? 0 : 1)));
      const off = (I.RING_LEN * (1 - r)).toFixed(1);
      if (this.v.ring !== off) { this.v.ring = off; this.compRing.setAttribute('stroke-dashoffset', off); }
      flag(this.compEl, 'is-ready', r >= 1 && !((c.napT ?? 0) > 0));
    }
    // boss bar
    this._renderBoss(dt);
    // objective done flourish → hide
    if (this.objDoneT > 0 && (this.objDoneT -= dt) <= 0) {
      const cur = this.objCur ? this.objs.get(this.objCur) : null;
      if (cur?.done) { this.objs.delete(this.objCur); this.objCur = null; for (const [id, o] of this.objs) if (!o.done) this.objCur = id; }
      this._drawObjective();
    }
    if (this.stillT > 0) this.stillT -= dt;
    if (this.saveT > 0 && (this.saveT -= dt) <= 0) flag(this.saveEl, 'is-on', false);
    this._renderWorld(dt, p);
  }

  _renderBoss(dt) {
    const b = this.boss;
    if (!b) return;
    if (this.bossOut > 0 && (this.bossOut -= dt) <= 0) { this._bossHide(); return; }
    if (b.alive === false && this.bossOut <= 0) this.bossOut = 1.6;
    const f = frac(b.hp ?? 0, this.bossMax);
    if (f < this.bossChipV) {
      if (this._bossLast != null && f < this._bossLast - 1e-4) this.bossHold = CHIP_HOLD;
      if (this.bossHold > 0) this.bossHold -= dt; else this.bossChipV = Math.max(f, this.bossChipV - CHIP_RATE * dt);
    } else this.bossChipV = f;
    this._bossLast = f;
    setVar(this.bossFill, '--f', f.toFixed(4));
    setVar(this.bossChip, '--f', this.bossChipV.toFixed(4));
  }

  /** World point (actor feet + `up`) → screen px, or null when behind the camera / far off screen. */
  _proj(a, up, W, H) {
    const cam = this.ctx.camera;
    _v.copy(a.pos); _v.y += up;
    _d.copy(_v).sub(cam.position);
    if (_d.dot(cam.getWorldDirection(_dir)) <= 0) return null;
    _v.project(cam);
    if (Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return null;
    _sp.x = (_v.x * 0.5 + 0.5) * W; _sp.y = (-_v.y * 0.5 + 0.5) * H;
    return _sp;
  }

  /** Lock reticle, enemy HP pips, riposte prompt (world → screen via the camera). */
  _renderWorld(dt, p) {
    const ctx = this.ctx, cam = ctx.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const lock = this.visible && !this.meme && cam ? ctx.cam?.lockTarget : null;
    const lp = lock && lock.alive !== false ? this._proj(lock, (lock.height ?? 1) * 0.55, W, H) : null;
    flag(this.reticle, 'is-on', !!lp);
    if (lp) {
      place(this.reticle, lp.x, lp.y);
      this._pips(this.retPips, lock, lock !== this.boss && this.hits.has(lock));
    }
    // recent hits → pip bars above heads (not the locked one: its pips sit under the reticle)
    let i = 0;
    for (const [e, t] of this.hits) {
      const nt = t + dt;
      if (nt > PIP_LIFE || e.alive === false || e.hp <= 0) { this.hits.delete(e); continue; }
      this.hits.set(e, nt);
      if (e === lock || i >= this.pipEls.length || !this.visible || this.meme || !cam) continue;
      const sp = this._proj(e, (e.height ?? 1) + 0.35, W, H);
      if (!sp) continue;
      const pe = this.pipEls[i++];
      flag(pe, 'is-on', true);
      setVar(pe, '--a', Math.min(1, (PIP_LIFE - nt) / 0.6).toFixed(2));
      place(pe, sp.x, sp.y);
      this._pips(pe, e, true);
    }
    for (; i < this.pipEls.length; i++) flag(this.pipEls[i], 'is-on', false);
    // riposte prompt (§7.3: "Parried! ... a Riposte prompt")
    const rt = p && (p.riposteT ?? 0) > 0 && p.riposteTarget && this.visible && !this.meme && cam ? p.riposteTarget : null;
    flag(this.riposte, 'is-on', !!rt);
    if (rt) {
      const sp = this._proj(rt, (rt.height ?? 1) + 0.9, W, H);
      const key = actionGlyph('attack', ctx.input?.device ?? 'kbm');
      setHtml(this.riposte, `<kbd class="ui-key ui-key--sword">${esc(key)}</kbd><span>${esc(tx(ctx, 'hud.riposte'))}</span>`);
      if (sp) place(this.riposte, sp.x, sp.y); else place(this.riposte, W * 0.5, H * 0.38);
    }
  }

  _pips(host, e, on) {
    flag(host, 'has-pips', on);
    if (!on) return;
    const max = Math.max(1, e.maxHp ?? 1), n = Math.max(1, Math.min(10, Math.ceil(max / 10)));
    const filled = Math.max(0, Math.min(n, Math.ceil(((e.hp ?? 0) / max) * n)));
    const key = `${n}/${filled}`;
    if (host._pk === key) return;
    host._pk = key;
    let html = '';
    for (let k = 0; k < n; k++) html += `<i class="${k < filled ? 'f' : ''}"></i>`;
    host.innerHTML = html;
  }

  dispose() { for (const off of this._offs) off(); this._offs.length = 0; this.root.remove(); }
}

const _dir = new THREE.Vector3(), _d = new THREE.Vector3(), _sp = { x: 0, y: 0 };
