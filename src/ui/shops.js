// src/ui/shops.js  (owner: ui) — the hub station panels of GAME_DESIGN §13.3–§13.5 / §14.3: Bakery (Marmalade: Bigger
// Satchel I/II), Forge (Tofu: Sharpness I–III + the sword skins, previewed on a turntable), Library (Earl Grey: Quick
// Charge, Valor Gain, Holy Wave Reach), Wardrobe (Pearl: capes, previewed on a turntable), Lookout (Pip: which kittens
// are still out there) and the Barracks banner (companion swap).
//
// Purchase flow: focus a row → the preview pane explains it → confirm once to arm ("Buy for 120 fish?") → confirm again
// to buy: fish are deducted from state.fish, the upgrade / cosmetic is written to state (§19.7 `upgrades`, `cosmetics`),
// the player is nudged to re-read it, and `save:request {reason: 'shop'}` autosaves (§19.7 "shop purchases").
// Equipping a skin / cape writes `state.cosmetics.sword|cape` (the player model polls it) and autosaves too.
//
// The model half (STATIONS, itemState, shopRows, purchase, equip) is pure and node-tested; `openShop(menus, id)` builds
// the screen with the Menus stack helpers.
import { ECONOMY, KITTENS_BY_LEVEL, LEVEL_IDS } from '../core/config.js';
import { E } from '../core/events.js';
import { el, flag, setHtml, setText, pulse } from './dom.js';
import { tx, esc, rich, levelKittens } from './text.js';
import { portraitSVG } from './portraits.js';
import { swordArt, capeMannequin, itemIcon } from './shopArt.js';
import * as I from './icons.js';

/** Sword skins in display order (§13.4) and capes (§13.5). */
export const SKINS = Object.freeze(['borrowed', 'twig', 'fishbone', 'baguette', 'diamond', 'toobig', 'dawnblade']);
export const CAPE_IDS = Object.freeze(['cream', 'red', 'memeWhite', 'blue', 'green', 'midnight', 'gold']);
export const CAPE_COLORS = Object.freeze({ cream: '#E2D6C0', red: '#A3202C', memeWhite: '#F2EFE8', blue: '#3F6FB5', green: '#5E7F3E', midnight: '#22242A', gold: '#D9B26A' });

/** Station id → keeper, sign key, item ids, preview kind. */
export const STATIONS = Object.freeze({
  bakery: { keeper: 'marmalade', sign: 'shop.bakery', items: ['satchel'] },
  forge: { keeper: 'tofu', sign: 'shop.forge', items: ['sharp', ...SKINS.map((s) => `skin:${s}`)], preview: 'sword' },
  library: { keeper: 'earlgrey', sign: 'shop.library', items: ['quickCharge', 'valorGain', 'waveReach'] },
  wardrobe: { keeper: 'pearl', sign: 'shop.wardrobe', items: CAPE_IDS.map((c) => `cape:${c}`), preview: 'cape' },
  lookout: { keeper: 'pip', sign: 'shop.lookout', items: [] },
  barracks: { keeper: null, sign: 'ui.shop.barracks', items: [] },
});

/** World / story ids for the same stations ('shop_forge', 'station-bakery', 'tofu', 'questboard' ...) → station id. */
export function stationId(id) {
  const s = String(id ?? '').toLowerCase().replace(/^(shop|station|stall|hub)[_:.-]/, '');
  if (STATIONS[s]) return s;
  for (const [k, v] of Object.entries(STATIONS)) if (v.keeper && v.keeper === s) return k;
  if (/banner|barrack/.test(s)) return 'barracks';
  return null;
}

const SHOPS = ECONOMY.shops;
const flagOn = (st, k) => !!(st?.cond ? st.cond(k) : st?.flags?.[k]);
const owns = (list, id) => Array.isArray(list) && list.includes(id);

/** Is a sword skin unlocked (in the owned list, or its §13.4 condition holds)? Pure. */
export function skinUnlocked(st, id) {
  if (owns(st?.cosmetics?.swords, id)) return true;
  const r = ECONOMY.skins[id];
  if (r === 'start') return true;
  if (r?.kittens) return (st?.kittens?.length ?? 0) >= r.kittens;
  if (r?.flag) return flagOn(st, r.flag);
  return false;
}

/** Cape ownership: owned list or condition (purchasable capes are owned only once bought). Pure. */
export function capeUnlocked(st, id) {
  if (owns(st?.cosmetics?.capes, id)) return true;
  const r = ECONOMY.capes[id];
  if (r === 'start') return true;
  if (r?.flag) return flagOn(st, r.flag);
  if (r?.memeCam) return (st?.memeCamSeen ?? 0) >= r.memeCam;
  return false;
}

/** Why a skin / cape is locked: [key, vars]. */
function lockReason(rule) {
  if (rule?.kittens) return ['ui.shop.need.kittens', { n: rule.kittens }];
  if (rule?.flag) return [`ui.shop.need.${rule.flag}`, null];
  if (rule?.memeCam) return ['ui.shop.need.memeCam', null];
  return ['ui.shop.locked', null];
}

/**
 * The state of one item for `st`. Pure.
 * @returns {{ id:string, kind:'upgrade'|'skin'|'cape', status:'buy'|'maxed'|'owned'|'equipped'|'locked', cost:number,
 *   tier:number, maxTier:number, nameKey:string, nameVars?:object, descKey:string, descVars?:object, lockKey?:string,
 *   lockVars?:object, icon:string, value?:string }}
 */
export function itemState(st, itemId) {
  const up = st?.upgrades ?? {};
  if (itemId.startsWith('skin:')) {
    const id = itemId.slice(5), eq = (st?.cosmetics?.sword ?? 'borrowed') === id, ok = skinUnlocked(st, id);
    const [lk, lv] = lockReason(ECONOMY.skins[id]);
    return { id: itemId, kind: 'skin', value: id, status: eq ? 'equipped' : ok ? 'owned' : 'locked', cost: 0, tier: 0, maxTier: 0,
      nameKey: `ui.skin.${id}`, descKey: `ui.skin.${id}.desc`, lockKey: ok ? undefined : lk, lockVars: lv, icon: 'sword' };
  }
  if (itemId.startsWith('cape:')) {
    const id = itemId.slice(5), eq = (st?.cosmetics?.cape ?? 'cream') === id, ok = capeUnlocked(st, id);
    const rule = ECONOMY.capes[id], price = typeof rule === 'number' ? rule : 0;
    const status = eq ? 'equipped' : ok ? 'owned' : price ? 'buy' : 'locked';
    const [lk, lv] = lockReason(rule);
    return { id: itemId, kind: 'cape', value: id, status, cost: price, tier: 0, maxTier: 0, nameKey: `ui.cape.${id}`, descKey: `ui.cape.${id}.desc`,
      lockKey: status === 'locked' ? lk : undefined, lockVars: lv, icon: 'cape' };
  }
  switch (itemId) {
    case 'satchel': case 'sharp': {
      const def = SHOPS[itemId], tier = Math.max(0, up[itemId] | 0), maxTier = def.cost.length;
      const next = Math.min(tier + 1, maxTier);
      const vars = itemId === 'satchel' ? { n: def.max[next - 1] } : { mul: def.mul[next - 1].toFixed(2) };
      return { id: itemId, kind: 'upgrade', status: tier >= maxTier ? 'maxed' : 'buy', cost: tier >= maxTier ? 0 : def.cost[tier], tier, maxTier,
        nameKey: `ui.shop.${itemId}`, nameVars: { tier: roman(next) }, descKey: `ui.shop.${itemId}.desc`, descVars: vars, icon: itemId };
    }
    case 'quickCharge': case 'valorGain': case 'waveReach': {
      const def = SHOPS[itemId], have = !!up[itemId];
      const locked = itemId === 'waveReach' && !have && (st?.shards ?? 0) < def.needShards;
      const vars = itemId === 'quickCharge' ? { a: def.tier1, b: def.tier2 } : itemId === 'valorGain' ? { p: Math.round((def.mul - 1) * 100) } : { m: def.range };
      return { id: itemId, kind: 'upgrade', status: have ? 'maxed' : locked ? 'locked' : 'buy', cost: have ? 0 : def.cost, tier: have ? 1 : 0, maxTier: 1,
        nameKey: `ui.shop.${itemId}`, descKey: `ui.shop.${itemId}.desc`, descVars: vars, lockKey: locked ? 'ui.shop.need.shard2' : undefined, icon: itemId };
    }
    default: return null;
  }
}

const roman = (n) => ['', 'I', 'II', 'III', 'IV'][n] ?? String(n);

/** All rows of a station for `st`. Pure. */
export function shopRows(st, station) {
  return (STATIONS[station]?.items ?? []).map((id) => itemState(st, id)).filter(Boolean);
}

/** Can `st` afford / buy the item right now? → { ok, reason: 'ok'|'poor'|'locked'|'owned' }. Pure. */
export function canBuy(st, itemId) {
  const s = itemState(st, itemId);
  if (!s) return { ok: false, reason: 'locked' };
  if (s.status === 'locked') return { ok: false, reason: 'locked' };
  if (s.status !== 'buy') return { ok: false, reason: 'owned' };
  if ((st?.fish ?? 0) < s.cost) return { ok: false, reason: 'poor' };
  return { ok: true, reason: 'ok' };
}

/**
 * Buy an item: deduct fish, write the upgrade / cape to state, nudge the player, autosave. Returns { ok, reason, cost }.
 */
export function purchase(ctx, itemId) {
  const st = ctx?.state;
  const chk = canBuy(st, itemId);
  if (!chk.ok) return { ok: false, reason: chk.reason, cost: 0 };
  const s = itemState(st, itemId);
  st.fish = Math.max(0, (st.fish ?? 0) - s.cost);
  st.upgrades ??= {};
  const p = ctx.player;
  if (s.kind === 'cape') {
    st.cosmetics ??= { swords: ['borrowed', 'twig'], capes: ['cream'], sword: 'borrowed', cape: 'cream' };
    if (!st.cosmetics.capes.includes(s.value)) st.cosmetics.capes.push(s.value);
    st.cosmetics.cape = s.value;
  } else if (itemId === 'satchel' || itemId === 'sharp') {
    st.upgrades[itemId] = (st.upgrades[itemId] | 0) + 1;
    if (itemId === 'satchel') {
      // the player re-reads milkMax on level load / companion change; apply now and top up the new bottle
      try { (p?.recomputeMax ?? p?._recomputeMax)?.call(p); } catch { /* player optional */ }
      if (p && Number.isFinite(p.milkMax) && Number.isFinite(p.milk)) { p.milk = Math.min(p.milkMax, p.milk + 1); st.milk = p.milk; st.milkMax = p.milkMax; }
    }
  } else {
    st.upgrades[itemId] = true;
    if (itemId === 'valorGain' && p?.valorState && 'gainMul' in p.valorState) p.valorState.gainMul = SHOPS.valorGain.mul;
  }
  ctx.bus?.emit(E.SAVE_REQUEST, { reason: 'shop' });
  return { ok: true, reason: 'ok', cost: s.cost };
}

/** Equip an unlocked skin / cape (adds a condition-unlocked one to the owned list). Returns true when it changed. */
export function equip(ctx, itemId) {
  const st = ctx?.state, s = st && itemState(st, itemId);
  if (!s || (s.kind !== 'skin' && s.kind !== 'cape') || s.status === 'locked' || s.status === 'buy') return false;
  if (s.status === 'equipped') return false;
  st.cosmetics ??= { swords: ['borrowed', 'twig'], capes: ['cream'], sword: 'borrowed', cape: 'cream' };
  const list = s.kind === 'skin' ? (st.cosmetics.swords ??= []) : (st.cosmetics.capes ??= []);
  if (!list.includes(s.value)) list.push(s.value);
  if (s.kind === 'skin') st.cosmetics.sword = s.value; else st.cosmetics.cape = s.value;
  ctx.bus?.emit(E.SAVE_REQUEST, { reason: 'shop' });
  return true;
}

/** Lookout (Pip): kittens still missing per level (§6.5 hub.pip.1). Pure. */
export function lookoutRows(ctx) {
  const st = ctx?.state;
  return LEVEL_IDS.map((id) => {
    const k = levelKittens(st, id);
    const visited = !!(st?.levels?.[id]?.cleared || flagOn(st, `${id}.done`) || (KITTENS_BY_LEVEL[id] ?? []).some((x) => st?.kittens?.includes(x)));
    return { id, region: tx(ctx, `region.${id}`), n: k.n, max: k.max, missing: k.max - k.n, visited };
  });
}

/** Text of the price / status chip for an item state. */
export function chipText(ctx, s, armed = false) {
  switch (s.status) {
    case 'buy': return armed ? tx(ctx, 'ui.shop.confirm') : String(s.cost);
    case 'maxed': return tx(ctx, 'shop.owned');
    case 'owned': return tx(ctx, 'shop.equip');
    case 'equipped': return tx(ctx, 'shop.equipped');
    default: return tx(ctx, 'ui.shop.lockedChip');
  }
}

// ======================================================================================================== the screen
/**
 * Open a station panel on the Menus stack. Resolves when it closes. `menus` is the Menus instance, `ui` the facade.
 * @param {import('./menus.js').Menus} menus @param {string} station
 */
export function openShop(menus, station) {
  const ctx = menus.ctx, ui = menus.ui, def = STATIONS[station];
  if (!def) return Promise.resolve();
  return new Promise((resolve) => {
    const e = el('div', `ui-screen menu-screen menu--shop shop--${station}`);
    const p = el('div', 'panel menu-panel shop-panel', { parent: e });
    // hanging wooden sign (MedievalSharp, §14.1 "shop signs")
    el('div', 'shop-sign', { parent: p, html: `<i class="sg-rope"></i><span>${esc(tx(ctx, def.sign))}</span>` });
    const head = el('div', 'shop-head', { parent: p });
    if (def.keeper) {
      head.innerHTML = `<div class="shop-keeper">${portraitSVG(def.keeper, { expression: 'happy' })}</div>`
        + `<div class="shop-say"><b>${esc(tx(ctx, `name.${def.keeper}`))}</b><span></span></div>`;
      setHtml(head.querySelector('.shop-say span'), rich(keeperLine(ctx, def.keeper, menus.ui?.rand ?? Math.random)));
    }
    const purse = el('div', 'shop-purse', { parent: head, html: `<span class="pu-ico">${I.fish()}</span><span class="pu-n"></span>` });
    const purseN = purse.querySelector('.pu-n');
    const body = el('div', 'shop-body', { parent: p });
    const items = [];
    let refreshAll = () => {};
    const s = { id: `shop:${station}`, el: e, items, layer: 'pause', scroll: true };
    s.onClose = () => { s.armed = null; resolve(); };
    s.back = () => { if (s.armed) { disarm(); menus.sfx('ui.back'); return false; } ui.closeShop?.(); return undefined; };
    const disarm = () => { if (!s.armed) return; const r = s.armed; s.armed = null; r.refresh?.(); };

    if (station === 'barracks') buildBarracks(menus, body, items);
    else if (station === 'lookout') buildLookout(menus, body, items);
    else {
      const list = el('div', 'shop-list menu-scroll', { parent: body });
      const pane = el('div', 'shop-pane', { parent: body });
      pane.innerHTML = '<div class="pn-stage"><div class="pn-glow"></div><div class="pn-spin"><div class="pn-face pn-front"></div><div class="pn-face pn-back"></div></div><div class="pn-cushion"></div></div>'
        + '<div class="pn-name"></div><div class="pn-desc"></div><div class="pn-note"></div>';
      const stage = pane.querySelector('.pn-stage'), front = pane.querySelector('.pn-front'), back = pane.querySelector('.pn-back');
      const pName = pane.querySelector('.pn-name'), pDesc = pane.querySelector('.pn-desc'), pNote = pane.querySelector('.pn-note');
      const showPreview = (row) => {
        const st = row.state();
        let art = '';
        if (st.kind === 'skin') art = swordArt(st.value);
        else if (st.kind === 'cape') art = capeMannequin(st.value);
        else art = itemIcon(st.icon, { tier: Math.min(st.tier + 1, st.maxTier) });
        const key = `${st.id}|${st.status}`;
        if (stage._k !== key) {
          stage._k = key;
          front.innerHTML = art; back.innerHTML = st.kind === 'skin' ? art : '';
          stage.className = `pn-stage pn--${st.kind}${st.status === 'locked' ? ' is-locked' : ''}${st.value === 'dawnblade' ? ' is-gold' : ''}`;
          pulse(stage, 'is-swap');
        }
        setText(pName, tx(ctx, st.nameKey, st.nameVars));
        setText(pDesc, tx(ctx, st.descKey, st.descVars));
        const fish = ctx.state?.fish ?? 0;
        let note = '';
        if (st.status === 'locked') note = tx(ctx, st.lockKey ?? 'ui.shop.locked', st.lockVars);
        else if (s.armed === row) note = tx(ctx, 'ui.shop.confirmLong', { n: st.cost });
        else if (st.status === 'buy') note = fish < st.cost ? tx(ctx, 'shop.poor') : tx(ctx, 'ui.shop.buyHint', { n: st.cost });
        else if (st.status === 'owned') note = tx(ctx, 'ui.shop.equipHint');
        else if (st.status === 'equipped') note = tx(ctx, 'ui.shop.equippedNote');
        else note = tx(ctx, 'ui.shop.maxed');
        setText(pNote, note);
        flag(pNote, 'is-warn', st.status === 'buy' && fish < st.cost);
        flag(pNote, 'is-armed', s.armed === row);
      };
      s.onFocus = (it) => { if (s.armed && s.armed !== it) disarm(); if (it?.state) showPreview(it); };
      for (const itemId of def.items) {
        const row = el('div', 'mi shop-row', { parent: list });
        row.innerHTML = '<span class="sr-ico"></span><span class="sr-main"><span class="sr-name"></span><span class="sr-sub"></span></span><span class="sr-tier"></span><span class="sr-chip"><i class="ch-fish"></i><b></b></span>';
        const ico = row.querySelector('.sr-ico'), nm = row.querySelector('.sr-name'), sub = row.querySelector('.sr-sub');
        const tierEl = row.querySelector('.sr-tier'), chip = row.querySelector('.sr-chip'), chipB = chip.querySelector('b'), chipFish = chip.querySelector('.ch-fish');
        chipFish.innerHTML = I.fish();
        const it = { el: row, state: () => itemState(ctx.state, itemId) };
        it.refresh = () => {
          const st = it.state();
          const icoKey = st.kind === 'cape' ? `cape:${st.value}` : st.kind === 'skin' ? `skin:${st.value}` : `${st.icon}:${st.tier}`;
          if (ico._k !== icoKey) { ico._k = icoKey; ico.innerHTML = st.kind === 'cape' ? I.cape(CAPE_COLORS[st.value]) : st.kind === 'skin' ? `<span class="sr-sword">${swordArt(st.value)}</span>` : itemIcon(st.icon, { tier: Math.min(st.tier + 1, st.maxTier) }); }
          setText(nm, tx(ctx, st.nameKey, st.nameVars));
          setText(sub, st.status === 'locked' ? tx(ctx, st.lockKey ?? 'ui.shop.locked', st.lockVars) : tx(ctx, st.descKey, st.descVars));
          let tiers = '';
          if (st.maxTier > 1) for (let i = 0; i < st.maxTier; i++) tiers += `<i class="${i < st.tier ? 'f' : ''}"></i>`;
          setHtml(tierEl, tiers);
          const armed = s.armed === it;
          setText(chipB, chipText(ctx, st, armed));
          if (row._st !== st.status) {
            if (row._st) { row.classList.remove(`row--${row._st}`); chip.classList.remove(`chip--${row._st}`); }
            row._st = st.status; row.classList.add(`row--${st.status}`); chip.classList.add(`chip--${st.status}`);
          }
          flag(row, 'is-armed', armed); flag(chip, 'is-armed', armed);
          flag(chip, 'is-poor', st.status === 'buy' && (ctx.state?.fish ?? 0) < st.cost);
          if (menus.top === s && s.nav?.current === it) showPreview(it);
        };
        it.activate = () => {
          const st = it.state();
          if (st.status === 'buy') {
            const chk = canBuy(ctx.state, itemId);
            if (!chk.ok) { menus.sfx('ui.error'); pulse(row, 'is-nope'); pulse(purse, 'is-nope'); return; }
            if (s.armed !== it) { disarm(); s.armed = it; it.refresh(); menus.sfx('ui.select'); return; }
            s.armed = null;
            const r = purchase(ctx, itemId);
            if (r.ok) {
              menus.sfx('fish'); menus.sfx('ui.stamp');
              pulse(row, 'is-bought'); pulse(purse, 'is-spend');
              stampOn(row, tx(ctx, 'ui.shop.bought'));
              ui.hud?.poll?.(true);
            } else menus.sfx('ui.error');
            refreshAll();
          } else if (st.status === 'owned') {
            if (equip(ctx, itemId)) { menus.sfx('ui.toggle'); pulse(row, 'is-bought'); ui.hud?.poll?.(true); }
            refreshAll();
          } else if (st.status === 'locked') { menus.sfx('ui.error'); pulse(row, 'is-nope'); }
          else menus.sfx('ui.click');
        };
        items.push(it);
      }
    }
    items.push(menus._button(el('div', 'shop-foot', { parent: p }), tx(ctx, 'menu.close'), () => ui.closeShop?.(), { cls: 'btn--plain' }));
    refreshAll = () => {
      setText(purseN, String(ctx.state?.fish ?? 0));
      for (const it of items) it.refresh?.();
      const cur = s.nav?.current;
      if (cur?.state) s.onFocus?.(cur);
    };
    s.refreshAll = refreshAll;
    refreshAll();
    menus.push(menus._wire(s), { sound: 'ui.bookOpen' });
    s.onFocus?.(s.nav.current);
  });
}

/** A "Bought!" wax stamp that thumps onto a row and fades. */
function stampOn(row, text) {
  const st = el('span', 'sr-stamp', { parent: row, html: `${I.waxSeal(I.PINK_DEEP, 'paw')}<b>${esc(text)}</b>` });
  setTimeout(() => st.remove(), 1400);
}

/** Keeper greeting: one of the §6.5 hub lines (Marmalade's "help yourself" jar once she's in bed after L4). */
export function keeperLine(ctx, keeper, rand = Math.random) {
  if (keeper === 'marmalade' && flagOn(ctx?.state, 'gate.done') && ctx?.strings?.has?.('hub.marmalade.bed')) return tx(ctx, 'hub.marmalade.bed');
  const keys = [1, 2].map((n) => `hub.${keeper}.${n}`).filter((k) => !ctx?.strings?.has || ctx.strings.has(k));
  if (!keys.length) return '';
  const k = keys[Math.floor(rand() * keys.length) % keys.length];
  if (keeper === 'pip') {
    const rows = lookoutRows(ctx).filter((r) => r.missing > 0);
    const r = rows[0];
    return tx(ctx, k, { n: r ? r.missing : 0, level: r ? r.region : tx(ctx, 'region.town') });
  }
  return tx(ctx, k);
}

function buildLookout(menus, body, items) {
  const ctx = menus.ctx;
  body.classList.add('shop-body--lookout');
  const grid = el('div', 'look-grid', { parent: body });
  for (const r of lookoutRows(ctx)) {
    const c = el('div', `mi look-card${r.missing === 0 ? ' is-done' : ''}${r.visited ? '' : ' is-far'}`, { parent: grid });
    let cats = '';
    for (let i = 0; i < r.max; i++) cats += `<span class="lk-cat${i < r.n ? ' f' : ''}">${I.catHead({ fur: i < r.n ? '#E3C9A2' : '#B8A88A', deep: '#9A8B6E', bow: false, eyes: i < r.n ? '#5E8FA8' : '#7B6A5C' })}</span>`;
    c.innerHTML = `<div class="lk-region">${esc(r.region)}</div><div class="lk-cats">${cats}</div>`
      + `<div class="lk-note">${esc(r.missing === 0 ? tx(ctx, 'ui.look.all') : tx(ctx, 'ui.look.missing', { n: r.missing }))}</div>`;
    items.push({ el: c });
  }
}

function buildBarracks(menus, body, items) {
  const ctx = menus.ctx, ui = menus.ui;
  body.classList.add('shop-body--barracks');
  const unlocked = ctx.state?.companions?.unlocked ?? [];
  const active = new Set((ctx.companions?.active ?? []).map((c) => c.kittenId ?? c.id));
  const row = el('div', 'vigil-swap barracks-swap', { parent: body });
  el('div', 'vigil-lbl', { parent: row, text: tx(ctx, 'vigil.swap') });
  if (!unlocked.length) el('div', 'vigil-none', { parent: row, text: tx(ctx, 'vigil.swapNone') });
  for (const id of unlocked) {
    const b = el('button', `mi vigil-kit${active.has(id) ? ' is-active' : ''}`, { parent: row, attrs: { type: 'button' } });
    b.innerHTML = `<span class="vk-face">${portraitSVG(id, { expression: 'happy' })}</span><span class="vk-name">${esc(tx(ctx, `name.${id}`))}</span>`;
    items.push({ el: b, activate: () => { ui.swapCompanion?.(id); for (const x of row.querySelectorAll('.vigil-kit')) flag(x, 'is-active', x === b); } });
  }
}
