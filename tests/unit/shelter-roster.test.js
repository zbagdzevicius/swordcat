// tests/unit/shelter-roster.test.js  (owner: R, TOKENTAILS-PLAN §12.3 R acceptance) — real Pink Paw cats in the save
// slots: the roster picks, the names in every text, the no-API rule off tokentails.com, CAT_SAVED once per save and
// the copy rules. The gallery fetch is always stubbed: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { E } from '../../src/core/events.js';
import { EventBus } from '../../src/core/EventBus.js';
import {
  Roster, assign, parseGallery, usablePool, nameOk, foldName, statusLabel, SLOTS, REACHABLE, UNREACHABLE, FIXED, STORE_KEY,
  GALLERY_URL, catSavedPayload, slotKind,
} from '../../src/shelter/roster.js';
import { SNAPSHOT } from '../../src/shelter/snapshot.js';
import { cardInfo, mirrorNamedRows, savedSlotsFromState } from '../../src/shelter/card.js';
import * as strings from '../../src/story/strings.js';
import { lineText } from '../../src/companions/lines.js';
import { tx } from '../../src/ui/text.js';
import { rescueBioHtml, kittenBio, catPhotoHtml } from '../../src/ui/portraits.js';
import { kittenCells } from '../../src/ui/menus.js';
import { LostKitten } from '../../src/companions/LostKitten.js';
import { CompanionManager } from '../../src/companions/CompanionManager.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** A gallery body like the live one: at-shelter cats plus odd rows, duplicates and an adopted list. */
function galleryBody({ drop = [] } = {}) {
  const atShelter = SNAPSHOT.cats.filter((c) => !drop.includes(c.id)).map((c, i) => ({
    id: c.id, name: c.name, status: i % 7 === 3 ? 'RECOVERING' : 'WAITING',
    art: `https://tokentails.fra1.cdn.digitaloceanspaces.com/a${i}.webp`, photo: `https://tokentails.fra1.cdn.digitaloceanspaces.com/p${i}.webp`,
  }));
  atShelter.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1', name: 'VIagra', status: 'WAITING', art: null, photo: null });
  atShelter.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2', name: 'Majus nudus deus hennsessy', status: 'WAITING', art: null, photo: null });
  atShelter.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaa3', name: 'Twin', status: 'WAITING', art: null, photo: null });
  atShelter.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaa4', name: 'Twin', status: 'WAITING', art: null, photo: null });
  atShelter.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaa5', name: 'Bad Url', status: 'WAITING', art: 'http://x.test/a.webp', photo: 'javascript:alert(1)' });
  atShelter.push({ id: 'not-an-id', name: 'Nope', status: 'WAITING' });
  atShelter.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaa6', name: 'Gone', status: 'ADOPTED' });
  const adopted = [{ id: 'bbbbbbbbbbbbbbbbbbbbbbb1', name: 'Abi', status: 'ADOPTED' }, { id: 'bbbbbbbbbbbbbbbbbbbbbbb2', name: 'Adoptee', status: 'ADOPTED' }];
  return { slug: 'rozine-pedute', atShelter, adopted, truncated: false, generatedAt: '2026-10-15T10:00:00.000Z' };
}

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

function stubFetch(body, calls) {
  return async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => body }; };
}

const names = (slots) => SLOTS.map((s) => slots[s]?.name).filter(Boolean);

test('TT4 R: snapshot: generated, at-shelter cats only, valid names, no statuses, the four named cats with local photos', () => {
  assert.ok(SNAPSHOT.cats.length >= 25, 'enough cats for every slot');
  for (const c of SNAPSHOT.cats) {
    assert.match(c.id, /^[a-f0-9]{24}$/);
    assert.ok(nameOk(c.name), `snapshot name ${c.name}`);
    assert.ok(!('status' in c), 'snapshot cats carry no status');
    for (const u of [c.photo, c.art]) if (u) assert.ok(/^https:\/\//.test(u) || (/^pink-paw\/[a-z]+-(photo|card)\.webp$/.test(u) && fs.existsSync(path.join(ROOT, 'public', u))), `image ${u}`);
  }
  for (const f of Object.values(FIXED)) {
    const s = SNAPSHOT.cats.find((c) => c.id === f.id);
    assert.ok(s && s.name === f.name && s.photo === `pink-paw/${f.name.toLowerCase()}-photo.webp`, `${f.name} bundled`);
  }
  const folded = SNAPSHOT.cats.map((c) => foldName(c.name));
  assert.equal(new Set(folded).size, folded.length, 'no repeated names');
});

test('TT4 R: parseGallery keeps clean at-shelter rows only and never reads the adopted list', () => {
  const cats = parseGallery(galleryBody());
  assert.ok(cats.every((c) => c.status === 'WAITING' || c.status === 'RECOVERING'));
  assert.ok(!cats.some((c) => c.id === 'not-an-id' || c.name === 'Gone' || c.name === 'Abi'));
  const bad = cats.find((c) => c.name === 'Bad Url');
  assert.equal(bad.photo, null); assert.equal(bad.art, null);
  assert.equal(parseGallery({ adopted: [] }), null);
  assert.equal(parseGallery(null), null);
  const pool = usablePool(cats).map((c) => c.name);
  for (const n of ['VIagra', 'Majus nudus deus hennsessy', 'Twin']) assert.ok(!pool.includes(n), `${n} skipped`);
  for (const n of ['Mochi', 'Pip', 'Clem', 'Earl Grey', 'Adopted', 'X', 'a1']) assert.equal(nameOk(n), false, n);
  for (const n of ['Ankštė', 'Šilauogė', 'Leo', 'Dolė']) assert.equal(nameOk(n), true, n);
});

test('TT4 R: every slot gets a distinct real cat; the four named cats stay; same seed, same roster', () => {
  const cats = parseGallery(galleryBody());
  const a = assign({ seed: 42, cats, live: true });
  assert.equal(SLOTS.length, 25); assert.equal(REACHABLE.length, 19); assert.equal(UNREACHABLE.length, 6);
  for (const s of SLOTS) assert.ok(a[s]?.name, `slot ${s} filled`);
  const n = names(a).map(foldName);
  assert.equal(new Set(n).size, 25, 'no two equal names');
  const ids = SLOTS.map((s) => a[s].id);
  assert.equal(new Set(ids).size, 25, 'no cat twice');
  for (const s of SLOTS) assert.ok(nameOk(a[s].name) || Object.values(FIXED).some((f) => f.id === a[s].id), `ok name ${a[s].name}`);
  for (const [slot, f] of Object.entries(FIXED)) assert.equal(a[slot].name, f.name);
  for (const s of SLOTS) assert.ok(['WAITING', 'RECOVERING'].includes(a[s].status), 'live: real status');
  assert.deepEqual(assign({ seed: 42, cats, live: true }), a, 'deterministic');
  assert.notDeepEqual(names(assign({ seed: 7, cats, live: true })), names(a), 'another install, another shuffle');
  // snapshot (not live): no status at all
  const off = assign({ seed: 42, cats: SNAPSHOT.cats, live: false });
  for (const s of SLOTS) { assert.ok(off[s]?.name); assert.equal(off[s].status, null); }
});

test('TT4 R: live data that drops a cat re-picks only unsaved slots; a saved slot keeps its name with no status', () => {
  const cats = parseGallery(galleryBody());
  const a = assign({ seed: 9, cats, live: true });
  const savedSlot = 'biscuit', unsavedSlot = 'noodle', keepSlot = 'button';
  const drop = [a[savedSlot].id, a[unsavedSlot].id, FIXED.pickles.id];
  const b = assign({ seed: 9, cats: parseGallery(galleryBody({ drop })), live: true, prev: a, saved: [savedSlot] });
  assert.equal(b[savedSlot].name, a[savedSlot].name, 'saved: keeps the name');
  assert.equal(b[savedSlot].status, null, 'saved and gone: no status');
  assert.equal(b[savedSlot].gone, true);
  assert.notEqual(b[unsavedSlot].id, a[unsavedSlot].id, 'unsaved and gone: a new cat');
  assert.notEqual(b.pickles.id, FIXED.pickles.id, 'a named cat that left is replaced while unsaved');
  assert.equal(b[keepSlot].id, a[keepSlot].id, 'others keep their cat');
  const n = names(b).map(foldName);
  assert.equal(new Set(n).size, n.length);
  assert.equal(statusLabel('WAITING'), 'Waiting for a home');
  assert.equal(statusLabel('RECOVERING'), 'Recovering');
  assert.equal(statusLabel('ADOPTED'), '');
  assert.equal(statusLabel(null), '');
});

test('TT4 R: no GET outside tokentails.com; one cached GET there, credentials omitted; picks persist', async () => {
  for (const host of ['localhost', '127.0.0.1', 'www.tokentails.com', 'test.tokentails.com', 'evil.example', '']) {
    const calls = [];
    const r = new Roster({ host, storage: memStorage(), fetchImpl: stubFetch(galleryBody(), calls), seed: 1 });
    assert.equal(await r.refresh(), false);
    assert.equal(calls.length, 0, `${host}: no request`);
    assert.equal(r.live, false);
    for (const s of SLOTS) assert.ok(r.getCat(s)?.name, `${host}: snapshot fills ${s}`);
  }
  const calls = [], st = memStorage();
  let changed = 0;
  const r = new Roster({ host: 'tokentails.com', storage: st, fetchImpl: stubFetch(galleryBody(), calls), seed: 5, onChange: () => changed++ });
  assert.equal(await r.refresh(), true);
  await r.refresh(); await r.refresh();
  assert.equal(calls.length, 1, 'once per boot');
  assert.equal(calls[0].url, GALLERY_URL);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(changed, 1);
  assert.ok(SLOTS.every((s) => r.getCat(s).status), 'live statuses');
  // persisted: a second boot (offline) shows the same names
  r.markSaved('biscuit');
  const saved = JSON.parse(st.getItem(STORE_KEY));
  assert.equal(saved.v, 1); assert.equal(saved.seed, 5); assert.deepEqual(saved.saved, ['biscuit']);
  const r2 = new Roster({ host: 'localhost', storage: st, fetchImpl: null });
  for (const s of SLOTS) assert.equal(r2.getCat(s).name, r.getCat(s).name, `${s} kept`);
  assert.ok(r2.isSaved('biscuit'));
  // a failing fetch keeps the snapshot
  const r3 = new Roster({ host: 'tokentails.com', storage: memStorage(), fetchImpl: async () => { throw new Error('offline'); }, seed: 5 });
  assert.equal(await r3.refresh(), false);
  assert.ok(SLOTS.every((s) => r3.getCat(s)?.name));
});

test('TT4 R: all 19 reachable saves show the real name in dialogue, bubbles, cards, the Kittens grid and the results', () => {
  const r = new Roster({ host: 'localhost', storage: memStorage(), fetchImpl: null, seed: 3 });
  strings.setRealNames(r.names());
  mirrorNamedRows();
  try {
    const ctx = { strings: { t: strings.t, has: strings.has }, shelter: r, state: { kittens: [...REACHABLE] } };
    for (const slot of REACHABLE) {
      const real = r.getCat(slot).name, story = strings.storyName(slot);
      assert.equal(strings.t(`name.${slot}`), real, `ribbon name ${slot}`);
      assert.equal(strings.speakerName(slot), real, `speaker ${slot}`);
      assert.equal(cardInfo(ctx, r.getCat(slot), slot).name, real, `card ${slot}`);
      // every row that named the story kitten now names the real cat (dialogue, barks, bubbles, toasts, cards)
      for (const [k, row] of Object.entries(strings.S)) {
        const out = strings.t(k);
        if (story !== real && new RegExp(`(?<!\\p{L})${story}(?!\\p{L})(?! Gate)`, 'u').test(out)) assert.fail(`${k} still says ${story}: ${out}`);
        void row;
      }
    }
    assert.match(tx(ctx, 'card.mochi.title'), new RegExp(r.getCat('mochi').name));
    assert.match(lineText(ctx, 'kitten.tater'), new RegExp(r.getCat('pip').name));
    const cells = kittenCells(ctx);
    for (const c of cells.filter((x) => x.found)) assert.equal(c.name, r.getCat(c.id).name, `grid ${c.id}`);
    assert.equal(strings.t('region.gate'), 'Bramble Gate', 'a place keeps its name');
    // no made-up bio next to a real cat; the photo shows instead
    for (const id of Object.keys(FIXED)) { assert.equal(kittenBio(ctx, id), ''); assert.equal(rescueBioHtml(ctx, id), ''); }
    assert.match(catPhotoHtml(ctx, 'pickles'), /<img class="kit-photo" src="pink-paw\/judas-photo\.webp" alt="Judas"/);
  } finally { strings.setRealNames({}); }
});

test('TT4 R: card copy: real status only, "Meet them at Pink Paw, Kaunas.", no adopt, no em dash, no bio', () => {
  const ctx = { strings: { t: strings.t, has: strings.has } };
  const live = cardInfo(ctx, { id: 'x', name: 'Amsis', status: 'WAITING', photo: 'https://tokentails.fra1.cdn.digitaloceanspaces.com/a.webp' }, 'biscuit');
  assert.equal(live.status, 'Waiting for a home');
  assert.equal(live.meet, 'Meet them at Pink Paw, Kaunas.');
  assert.equal(live.img, 'https://tokentails.fra1.cdn.digitaloceanspaces.com/a.webp');
  assert.equal(cardInfo(ctx, { id: 'x', name: 'Amsis', status: 'RECOVERING' }, 'biscuit').status, 'Recovering');
  assert.equal(cardInfo(ctx, { id: 'x', name: 'Amsis', status: null }, 'biscuit').status, '', 'snapshot: no status');
  assert.equal(cardInfo(ctx, { id: 'x', name: 'Amsis', status: 'WAITING', gone: true }, 'biscuit').status, '', 'gone: no status');
  assert.equal(cardInfo(ctx, { id: 'x', name: 'Amsis', status: 'ADOPTED' }, 'biscuit').status, '', 'never an adopted status');
  for (const k of Object.keys(strings.S).filter((k) => k.startsWith('shelter.') || k === 'credits.pinkpaw')) {
    assert.ok(!/adopt/i.test(strings.t(k)), k); assert.ok(!/—/.test(strings.t(k)), `${k} em dash`);
  }
  assert.equal(strings.t('credits.pinkpaw'), 'The kittens you save carry the names and photos of real cats at Pink Paw (Rožinė pėdutė) in Kaunas. Their adventures here are made up.');
  for (const f of ['src/shelter/roster.js', 'src/shelter/card.js', 'src/shelter/card.css']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const lits = [...src.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]);
    for (const l of lits) assert.ok(!/\badopt(ed|ion)?\b/i.test(l) || l === 'adopt', `${f}: ${l}`);
  }
});

test('TT4 R: CAT_SAVED fires exactly once for a lost, a service and a squire save', async () => {
  const bus = new EventBus(), seen = [];
  bus.on(E.CAT_SAVED, (p) => seen.push(p));
  const shelter = new Roster({ host: 'localhost', storage: memStorage(), fetchImpl: null, seed: 11 });
  const kittens = [];
  const ctx = { bus, shelter, state: { addKitten: (k) => kittens.push(k), getFlag: () => false, setFlag() {} }, story: null, companions: null, fx: null, player: null };
  const fakeKitten = (id, o = {}) => ({
    ...o, ctx, kittenId: id, rescued: false, hidden: false, lock: null, companion: false, cage: null, opts: {}, pos: new THREE.Vector3(), home: new THREE.Vector3(),
    perchY: 0, visual: null, bubble: { show() {} }, reveal() {}, _startReunion() {}, _serviceRescue: LostKitten.prototype._serviceRescue,
  });
  const lost = fakeKitten('noodle');
  LostKitten.prototype.rescue.call(lost); LostKitten.prototype.rescue.call(lost);
  const service = fakeKitten('tofu', { service: true });
  LostKitten.prototype.rescue.call(service); LostKitten.prototype.rescue.call(service);
  // the service fallback path (no story): FLAG_SET is heard too
  const flags = [];
  bus.on(E.FLAG_SET, (p) => flags.push(p.key));
  const pip = fakeKitten('pip', { service: true });
  LostKitten.prototype.rescue.call(pip);
  assert.deepEqual(flags, ['gate.pip']);
  // squire: CompanionManager.unlock on a fresh join only
  const st = { companions: { unlocked: [] } };
  const mgr = { ctx: { ...ctx, state: st }, actors: [], active: [], maxActive: 1, setActive() {}, despawn() {}, _poofOut() {} };
  CompanionManager.prototype.unlock.call(mgr, 'mochi');
  CompanionManager.prototype.unlock.call(mgr, 'mochi');
  assert.deepEqual(seen.map((p) => [p.slot, p.kind]), [['noodle', 'lost'], ['tofu', 'service'], ['pip', 'service'], ['mochi', 'squire']]);
  for (const p of seen) { assert.equal(p.catName, shelter.getCat(p.slot).name); assert.equal(p.catId, shelter.getCat(p.slot).id); }
  assert.deepEqual(catSavedPayload(null, 'biscuit'), { slot: 'biscuit', kind: 'lost' });
  assert.equal(slotKind('earlgrey'), 'service'); assert.equal(slotKind('sage'), 'squire'); assert.equal(slotKind('pudding'), null);
  assert.deepEqual(savedSlotsFromState({ kittens: ['noodle', 'x'], companions: { unlocked: ['mochi'] }, getFlag: (f) => f === 'town.tofu' }), ['noodle', 'mochi', 'tofu']);
});
