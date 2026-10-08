// Every named cat (GAME_DESIGN §3; research/art.md §7) as buildKitten configs, plus seeded villager / lost-kitten
// generators. Pure data (node-safe). Swordcat's bow is ALWAYS pink and on her LEFT ear (hard rule, §3.1 / §13.5).
import * as THREE from 'three';
import { PAL, VILLAGER_COATS, VILLAGER_CLOTH } from './palette.js';
import { mulberry32, hashString } from './util.js';

/** Iris colour set from one hex: lighter inner, the colour outer, dark ring. */
export function eyeSet(hex, o = {}) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  const inner = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.min(0.85, hsl.l + 0.22)).getHexString();
  const ring = new THREE.Color().setHSL(hsl.h, hsl.s * 0.6, Math.max(0.06, hsl.l * 0.3)).getHexString();
  return { inner: '#' + inner, outer: hex, ring: '#' + ring, pupil: PAL.pupil, ...o };
}

const SWORDCAT_COAT = Object.freeze({ pattern: 'mackerel', base: PAL.furGinger, deep: PAL.furGingerDeep, light: PAL.furGingerLight, cream: PAL.furCream, bib: '#E2D0BA', face: '#E4D5C3', stripe: 0.42 });
const SWORDCAT_BOW = Object.freeze({ color: PAL.bow, light: PAL.bowLight, shade: PAL.bowShade, knot: PAL.bowKnot, scale: 0.85 });

/**
 * Swordcat (Clementine). Options track story state:
 *  cape: 'cream' (start) | 'red' (CS-07+, title on a new save) | any CAPES id
 *  armour: false for the prologue tunic (CS-01 shots 1–5); bow: false only before CS-01 shot 5
 *  sword: skin id ('borrowed' default)
 */
export function swordcatConfig({ cape = 'cream', armour = true, bow = true, sword = 'borrowed', tier = 'hero' } = {}) {
  return {
    id: 'swordcat', name: 'Clementine', tier, scale: 1, width: 1, headScale: 1.0,
    coat: SWORDCAT_COAT,
    eyes: { inner: PAL.irisInner, outer: PAL.irisOuter, ring: PAL.irisRing, pupil: PAL.pupil, size: 1.0 },
    fur: { len: 0.046, cheek: 1.04 }, tail: { thick: 0.88 },
    bow: bow ? SWORDCAT_BOW : null,
    outfit: { armour: armour ? 'plate' : null },
    accessories: armour ? [] : [{ id: 'tunic', color: '#9C7B57', trim: '#6E5638' }],
    cape: armour && cape ? { style: cape } : null,
    sword: armour ? sword : null,
    expression: 'worried',
    holy: true,
  };
}

export const SWORDCAT = swordcatConfig();

/** Named cats. Keys are the actor / NPC ids used by companions, story and world. */
export const CATS = {
  swordcat: SWORDCAT,
  swordcat_red: swordcatConfig({ cape: 'red' }),
  swordcat_tunic: swordcatConfig({ armour: false, bow: false }),
  swordcat_tunic_bow: swordcatConfig({ armour: false, bow: true }),

  // ---- family, mentors, court (§3.2)
  pearl: {
    id: 'pearl', name: 'Pearl', tier: 'kitten', scale: 0.8, headScale: 1.07,
    coat: { pattern: 'dilute', base: '#C7A98E', deep: '#A2846C', light: '#E8D8C6', cream: '#E9DED3', bib: '#E2D6C8', stripe: 0.28 },
    eyes: { inner: PAL.irisInner, outer: '#4E7282', ring: PAL.irisRing, size: 1.04 },
    bow: { color: '#E9B9B9', light: '#FFE6EA', shade: '#C98A9A', knot: '#D9A0AE', scale: 0.8 },
    accessories: [{ id: 'tunic', color: '#8FA3B5', trim: '#C9B8A0', belt: true }],
    cape: { style: 'pilgrim' }, expression: 'happy',
  },
  marmalade: {
    id: 'marmalade', name: 'Sir Marmalade', tier: 'kitten', scale: 1.12, width: 1.25, headScale: 1.02,
    coat: { pattern: 'mackerel', base: '#C9783A', deep: '#8E4E22', light: '#E8A66A', cream: '#E9D9C2', stripe: 0.45, muzzle: '#B7AFA6' },
    eyes: eyeSet('#D6A53A'),
    outfit: { armour: 'rusty', pouch: false },
    accessories: [{ id: 'eyepatch', side: -1 }, { id: 'plumedHelm', plume: '#A3202C', style: 'rusty' }],
    cape: { style: 'rust' }, sword: 'borrowed', swordScale: 1.2, expression: 'smug', whiskers: { len: 0.27, droop: 0.06 },
  },
  snowpaw: {
    id: 'snowpaw', name: 'Princess Snowpaw', tier: 'kitten', scale: 0.92,
    coat: { pattern: 'solid', base: '#EAE7E2', deep: '#D6D1CA', light: '#F6F4F0', cream: '#EEEBE6' },
    eyes: { L: eyeSet('#6FA8DC'), R: eyeSet('#E8B84A') },
    fur: { len: 0.07, cheek: 1.15, density: 1.35 },
    accessories: [{ id: 'gown', color: '#B9A3D6' }, { id: 'tiara', gem: '#F2A2B8' }],
    expression: 'neutral', earInner: '#F2C2C0',
  },
  whiskerbottom: {
    id: 'whiskerbottom', name: 'Sergeant Whiskerbottom', tier: 'kitten', scale: 1.1, width: 1.08,
    coat: { pattern: 'mackerel', base: '#8D8F93', deep: '#4C4E52', light: '#C3C5C8', cream: '#DAD8D4', stripe: 0.5 },
    eyes: eyeSet('#C9B23A'),
    accessories: [{ id: 'tunic', color: '#3E4A5A', trim: '#D9B26A' }, 'whistle', 'sergeantCap'],
    expression: 'grumpy', whiskers: { len: 0.26, droop: 0.05 },
  },

  // ---- companions (§3.3)
  mochi: {
    id: 'mochi', name: 'Mochi', tier: 'kitten', scale: 0.95, width: 1.1,
    coat: { pattern: 'tuxedo', base: '#1E1F24', deep: '#121317', light: '#3A3C44', cream: '#E4DFD6', white: '#E4DFD6' },
    eyes: eyeSet('#E5A93B'), fur: { rim: 0.8 },
    accessories: [{ id: 'tunic', color: '#2C5290', trim: '#1E3A66' }, { id: 'tabard', color: '#3F6FB5' }, 'potHelm', 'towerShield'],
    expression: 'happy', signature: '#3F6FB5',
  },
  sage: {
    id: 'sage', name: 'Sage', tier: 'kitten', scale: 0.93,
    coat: { pattern: 'mackerel', base: '#8D8F93', deep: '#4C4E52', light: '#C3C5C8', cream: '#E4E2DE', stripe: 0.55 },
    eyes: eyeSet('#8CC63F'),
    accessories: [{ id: 'tunic', color: '#6B5A3A', trim: '#4A3E28' }, { id: 'hood', color: '#5E7F3E' }, 'quiver', 'shortBow'],
    expression: 'neutral', signature: '#5E7F3E',
  },
  clover: {
    id: 'clover', name: 'Clover', tier: 'kitten', scale: 0.94,
    coat: { pattern: 'calico', base: '#E2DBD0', deep: '#D0C7B9', light: '#F0EBE4', cream: '#E6E0D7', patches: ['#E09A4E', '#2A2624'], patchScale: 1.6 },
    eyes: eyeSet('#A58A4A'),
    accessories: [{ id: 'tunic', color: '#C9A9B6', trim: '#8E6A78' }, 'coif', 'bellCollar', 'satchel', 'flowerStaff'],
    expression: 'happy', signature: '#F6F1E8',
  },

  // ---- service kittens (§3.4)
  tofu: {
    id: 'tofu', name: 'Tofu', tier: 'kitten', scale: 0.86,
    coat: { pattern: 'solid', base: '#E6E1D8', deep: '#CFC8BC', light: '#F2EEE8', cream: '#EAE6DF', smudge: { at: [-0.06, 0.12, 0.13], r: 0.035, color: '#4A4644' } },
    eyes: eyeSet('#6FA8DC'),
    accessories: [{ id: 'apron', color: '#6B4429', big: true }],
    expression: 'surprised',
  },
  earlgrey: {
    id: 'earlgrey', name: 'Earl Grey', tier: 'kitten', scale: 0.9,
    coat: { pattern: 'siamese', base: '#EFE2CC', deep: '#D8C6A8', light: '#FAF2E4', cream: '#F6EEE0', points: '#4A3830' },
    eyes: eyeSet('#4F86C6'),
    accessories: [{ id: 'tunic', color: '#5C4A9C', trim: '#F2D16B' }, 'wizardHat', 'glasses', 'floatingBook'],
    expression: 'smug', signature: '#5C4A9C',
  },
  pip: {
    id: 'pip', name: 'Pip', tier: 'kitten', scale: 0.88,
    coat: { pattern: 'solid', base: '#1A1A1F', deep: '#101014', light: '#34343C', cream: '#2A2A30' },
    eyes: eyeSet('#C9D84A'), fur: { rim: 0.95 },
    accessories: [{ id: 'scarf', color: '#C2353B', length: 0.55 }, 'dagger'],
    expression: 'smug', signature: '#C2353B',
  },
};

// ---- the old knights of the Order (§3.6): Marmalade's look with varied coats, rusty plate
const OLD_KNIGHT_COATS = [
  ['snoozalot', 'Sir Snoozalot', { pattern: 'solid', base: '#F2EFEA', deep: '#D8D2C8', light: '#FFFFFF', cream: '#FFFFFF', muzzle: '#CFC8BE' }, '#7A9CC6'],
  ['oldknight_bramblewick', 'Dame Bramblewick', VILLAGER_COATS.brownTabby, '#5E7F3E'],
  ['oldknight_tumbleford', 'Sir Tumbleford', VILLAGER_COATS.grey, '#3F6FB5'],
  ['oldknight_purrcival', 'Sir Purrcival', VILLAGER_COATS.ginger, '#D9B26A'],
  ['oldknight_mitzi', 'Dame Mitzi', VILLAGER_COATS.tortie, '#7A5C9C'],
  ['oldknight_soot', 'Sir Soot', VILLAGER_COATS.black, '#C2353B'],
  ['oldknight_dumplington', 'Sir Dumplington', VILLAGER_COATS.bicolour, '#B0503C'],
];
for (const [id, name, coat, plume] of OLD_KNIGHT_COATS) {
  CATS[id] = {
    id, name, tier: 'lite', scale: 1.05, width: 1.15,
    coat: { ...coat, muzzle: coat.muzzle ?? '#B7AFA6' }, eyes: eyeSet(id === 'snoozalot' ? '#9AB0C0' : '#C9A24A'),
    outfit: { armour: 'rusty', pouch: false },
    accessories: [{ id: 'plumedHelm', plume, style: 'rusty', nightcap: id === 'snoozalot' }],
    cape: { style: 'rust' }, expression: id === 'snoozalot' ? 'sleepy' : 'neutral',
    whiskers: id === 'snoozalot' ? { len: 0.3, droop: 0.12 } : undefined,
  };
}
export const OLD_KNIGHT_IDS = Object.freeze(OLD_KNIGHT_COATS.map((k) => k[0]));

/** The 18 lost kittens (GAME_DESIGN §3.5 / §6.4), 3 per level. */
export const LOST_KITTENS = Object.freeze({
  meadow: ['biscuit', 'noodle', 'button'], forest: ['pickles', 'pebble', 'sprout'], town: ['waffles', 'toffee', 'muffin'],
  gate: ['tater', 'mittens', 'socks'], bog: ['juniper', 'bramble', 'fennel'], keep: ['bean', 'crumpet', 'dumpling'],
});
export const KITTEN_IDS = Object.freeze(Object.values(LOST_KITTENS).flat());
const KITTEN_NAMES = Object.fromEntries(KITTEN_IDS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]));

/** Hand-picked coats for the lost kittens so each reads distinctly (names hint at the look). */
const KITTEN_LOOKS = {
  biscuit: ['cream', 'strawHat'], noodle: ['ginger', 'scarf'], button: ['bicolour', null], pickles: ['grey', 'flowerCrown'],
  pebble: ['grey', 'bucketHelm'], sprout: ['brownTabby', 'flowerCrown'], waffles: ['ginger', 'bakerHat'], toffee: ['cream', 'scarf'],
  muffin: ['brownTabby', 'bakerHat'], tater: ['brownTabby', null], mittens: ['bicolour', 'scarf'], socks: ['tuxedoKit', null],
  juniper: ['tortie', 'flowerCrown'], bramble: ['black', 'scarf'], fennel: ['cream', 'strawHat'], bean: ['black', null],
  crumpet: ['ginger', 'bucketHelm'], dumpling: ['white', 'strawHat'],
};

/**
 * Seeded villager kitten (art.md §7: coat ∈ {ginger, cream, grey, black, white, brown tabby, tortie, bicolour},
 * accessory ∈ {apron, straw hat, flower crown, scarf, bucket helm, baker's hat}; sheen fur only → tier 'lite').
 * @param {number|string} seed
 */
export function villagerConfig(seed, o = {}) {
  const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const rnd = mulberry32(s || 1);
  const coatKeys = Object.keys(VILLAGER_COATS);
  const coatKey = o.coat || coatKeys[Math.floor(rnd() * coatKeys.length)];
  const coat = coatKey === 'tuxedoKit' ? { pattern: 'tuxedo', base: '#2A2B30', deep: '#18191C', light: '#4A4C52', cream: '#F5F2EC', white: '#F5F2EC' } : VILLAGER_COATS[coatKey];
  const accPool = ['apron', 'strawHat', 'flowerCrown', 'scarf', 'bucketHelm', 'bakerHat', null];
  const accId = o.accessory !== undefined ? o.accessory : accPool[Math.floor(rnd() * accPool.length)];
  const cloth = VILLAGER_CLOTH[Math.floor(rnd() * VILLAGER_CLOTH.length)];
  const eyeHex = ['#E5A93B', '#8CC63F', '#6FA8DC', '#A58A4A', '#C9D84A', '#4F86C6', '#D6A53A'][Math.floor(rnd() * 7)];
  const acc = [];
  if (rnd() < 0.55 || accId === 'apron') acc.push({ id: 'tunic', color: cloth, trim: '#6E5638', belt: rnd() < 0.5 });
  if (accId === 'apron') acc.push({ id: 'apron', color: '#E9E2D2' });
  else if (accId === 'scarf') acc.push({ id: 'scarf', color: VILLAGER_CLOTH[Math.floor(rnd() * VILLAGER_CLOTH.length)], length: 0.3 });
  else if (accId) acc.push(accId);
  return {
    id: o.id || 'villager_' + s, name: o.name || 'Villager', tier: o.tier || 'lite', seed: s,
    scale: o.scale ?? 0.78 + rnd() * 0.22, width: 0.95 + rnd() * 0.12, headScale: 1 + rnd() * 0.06,
    coat, eyes: eyeSet(eyeHex), accessories: acc, expression: ['happy', 'neutral', 'surprised', 'sleepy'][Math.floor(rnd() * 4)],
    ears: { size: 0.9 + rnd() * 0.25 },
  };
}

/** Config for one of the 18 lost kittens (stable per id). */
export function lostKittenConfig(kittenId, o = {}) {
  const look = KITTEN_LOOKS[kittenId] || [];
  return villagerConfig('kitten:' + kittenId, { id: kittenId, name: KITTEN_NAMES[kittenId] || kittenId, coat: look[0], accessory: look[1] ?? null, scale: 0.72, tier: o.tier || 'lite', ...o });
}

/** The 6 squire kittens at the height chart (CS-01). Wooden swords, plain tunics. */
export const SQUIRE_IDS = Object.freeze(['squire_1', 'squire_2', 'squire_3', 'squire_4', 'squire_5', 'squire_6']);
export function squireConfig(i, o = {}) {
  const c = villagerConfig('squire:' + i, { id: SQUIRE_IDS[i % 6], name: 'Squire', accessory: null, scale: 0.86 + (i % 3) * 0.06, ...o });
  c.accessories = [{ id: 'tunic', color: ['#9C7B57', '#7A6A4A', '#8A5A3A'][i % 3], trim: '#5A4630' }, 'woodenSword'];
  return c;
}

/** Spoon-brigade kitten (CS-08 / L4): lost-kitten look + pot helm or colander (props) and a spoon. */
export function spoonBrigadeConfig(kittenId, i = 0) {
  const c = lostKittenConfig(kittenId);
  c.accessories = c.accessories.filter((a) => (typeof a === 'string' ? a : a.id) === 'tunic');
  c.props = [i % 2 ? 'colander' : 'pot_helm', 'spoon'];
  return c;
}

/** Look up any cat config by id (named, old knight, lost kitten, squire, villager_<seed>). */
export function catConfig(id) {
  if (CATS[id]) return CATS[id];
  if (KITTEN_IDS.includes(id)) return lostKittenConfig(id);
  const sq = SQUIRE_IDS.indexOf(id); if (sq >= 0) return squireConfig(sq);
  if (id.startsWith('villager_')) return villagerConfig(id.slice(9));
  return null;
}
