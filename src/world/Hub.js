// src/world/Hub.js  (owner: world) — Pawsbury as the hub (GAME_DESIGN §12.5 "Hub mode", §13.3, §12.1 "The hub's way
// out"): the station table, the Quest Board, the kitten activity spots and the South Gate exit.
//   STATIONS            every hub station (who, where, the flag that opens it, its ui panel id)
//   stationOpen(s, st)  is a station open in this save? (pure)
//   nextLevel(st)       the next chapter the Quest Board offers ("Next: {chapter}"), or null (pure)
//   questBoard(st)      the board rows: { id, cleared, unlocked, next, bestRank, kittens, kittensTotal } (pure)
//   HUB_KITTEN_SPOTS    §12.5 activity spots (companions' HubKittens reads them; town defines `hub_<id>` anchors)
//   RESCUE_KEEPER       the Token Tails cat, keeper of the Pawsbury Rescue House (docs/TOKENTAILS-PLAN.md §2.4):
//                       where it stands by the rescued kittens, its speaker key and line keys; keeperLines(strings)
//   RESCUE_HOUSE        the Rescue House landmark by the fountain behind the keeper (docs/TOKENTAILS-PLAN.md §10.5):
//                       a procedural arch + awning, a cream board with a love-pink paw (a generic paw, never Pink Paw's
//                       daisy logo), a gold ':3' coin crest and daisy flower boxes; rescueHouseParts() (no 3D text: its
//                       name lives in strings, BRAND.rescueHouse)
//   ttBannerParts() / ttWallBannerParts()  Token Tails night banners (#2A1F45, gold trim, gold coin emblem)
//   buildHub(kit, opts) town setpiece: station props (stalls, banner, notice board, signs), interactables (kind
//                       'station' / 'questboard' / 'talk', which ui opens on `interact`), the South Gate exit trigger
// UI listens to `interact {target: {id, kind}}`: 'station_<id>' + kind 'station' opens that shop, kind 'questboard'
// opens the Quest Board (ui travels on a pick). Nothing here runs while the town is still occupied (`!town.free`).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { LEVEL_IDS, KITTENS_BY_LEVEL } from '../core/config.js';
import { condOk } from './Level.js';
import { coinPieces } from '../characters/Accessories.js';

/** §12.5 hub stations. `use` = where she stands to interact (beside the counter); `opens` = the flag that opens it. */
export const STATIONS = Object.freeze([
  { id: 'bakery', who: 'marmalade', at: [-26, -20], use: [-22.6, -18.4], opens: 'town.free', kind: 'station', prompt: 'prompt.shop' },
  { id: 'forge', who: 'tofu', at: [30, -10], use: [25.8, -7.4], opens: 'town.free', kind: 'station', prompt: 'prompt.shop' },
  { id: 'library', who: 'earlgrey', at: [-20, 24], use: [-17.6, 20.6], opens: 'town.free', kind: 'station', prompt: 'prompt.shop' },
  { id: 'barracks', who: null, at: [8, -2], use: [8, -2], opens: 'town.free', kind: 'station', prompt: 'prompt.interact' },
  { id: 'questboard', who: null, at: [4.6, -52], use: [3.4, -52], opens: 'town.free', kind: 'questboard', prompt: 'prompt.board' },
  { id: 'vigil', who: null, at: [-5, -50], use: [-5, -50], opens: null, kind: 'vigil' },          // the hub Vigil Stone (vigil_1)
  { id: 'lookout', who: 'pip', at: [20, 30], use: [17.4, 27.4], opens: 'gate.done', kind: 'station', prompt: 'prompt.shop' },
  { id: 'wardrobe', who: 'pearl', at: [-12, 30], use: [-12, 27.8], opens: 'bog.done', kind: 'station', prompt: 'prompt.shop' },
  { id: 'snowpaw', who: 'snowpaw', at: [0, 40], use: [0, 38.4], opens: 'town.free', kind: 'talk', prompt: 'prompt.talk' },
  { id: 'coo', who: 'coo', at: [-36, 4], use: [-35, 2.8], opens: 'ending.seen', kind: 'talk', prompt: 'prompt.talk' },
]);

/** Is station `s` open in this save? (`opens` null = always). Pure. */
export function stationOpen(s, st) {
  if (!s) return false;
  if (!s.opens) return true;
  return typeof st?.cond === 'function' ? !!st.cond(s.opens) : !!st?.flags?.[s.opens];
}

const flagOf = (st, k) => (typeof st?.cond === 'function' ? !!st.cond(k) : typeof st?.getFlag === 'function' ? !!st.getFlag(k) : !!st?.flags?.[k]);

/** The chapter the Quest Board points to after the town is free: the first story level after `town` not done. Pure. */
export function nextLevel(st) {
  const order = LEVEL_IDS;
  for (const id of order.slice(order.indexOf('town') + 1)) if (!flagOf(st, `${id}.done`)) return id;
  return null;
}

/** Quest Board rows (§12.5 level select and replays). Pure. */
export function questBoard(st) {
  const next = nextLevel(st);
  const kittens = st?.kittens ?? [];
  return LEVEL_IDS.map((id) => {
    const cleared = flagOf(st, `${id}.done`);
    const mine = KITTENS_BY_LEVEL[id] ?? [];
    return { id, cleared, next: id === next, unlocked: cleared || id === next, bestRank: st?.levels?.[id]?.bestRank ?? null,
      kittens: mine.filter((k) => kittens.includes(k)).length, kittensTotal: mine.length };
  });
}

/** §12.5 kitten activity spots: id → { at: [x, z], y (above the ground), act }. */
export const HUB_KITTEN_SPOTS = Object.freeze({
  biscuit: { at: [3.5, 8], y: 0.6, act: 'fish' },
  noodle: { at: [-4, -36], y: 0, act: 'sit' },
  button: { at: [0, 36], y: 0, act: 'vigilCopy' },
  pickles: { at: [-24, -16], y: 0, act: 'nap' },
  pebble: { at: [-3.5, 8], y: 0.6, act: 'fish' },
  sprout: { at: [14, 20], y: 0, act: 'cup' },
  waffles: { at: [5, -30], y: 3, act: 'wave' },
  toffee: { at: [0, 8], y: 2.5, act: 'guard' },
  muffin: { at: [0, 50.5], y: 6, act: 'stare' },
  tater: { at: [0, 8], y: 0, act: 'tag', loop: 8 },
  mittens: { at: [0, 8], y: 0, act: 'tag', loop: 8 },
  socks: { at: [2, 36], y: 0, act: 'nap' },
  juniper: { at: [-10, 26], y: 0, act: 'read' },
  bramble: { at: [12, 14], y: 0, act: 'butterfly', loop: 3 },
  fennel: { at: [-2, 36], y: 0, act: 'nap' },
  bean: { at: [28, -12], y: 0, act: 'help' },
  crumpet: { at: [-34, 6], y: 0, act: 'letters' },
  dumpling: { at: [8, -2], y: 0, act: 'guard' },
});

/**
 * The Token Tails cat (characters' `tokentails_cat`): keeper of the Pawsbury Rescue House, standing by the fountain
 * where the rescued kittens fish, guard and play tag (docs/TOKENTAILS-PLAN.md §2.4). Companions' HubKittens spawns it
 * once `when` is set; `speaker` / `lines` are string keys story writes (`name.ttcat`, `npc.ttcat.1..3`).
 */
export const RESCUE_KEEPER = Object.freeze({
  id: 'tokentails_cat', cfg: 'tokentails_cat', at: Object.freeze([4.8, 12.6]), facing: Math.atan2(0 - 4.8, 8 - 12.6), when: 'town.free',
  speaker: 'name.ttcat', lines: Object.freeze(['npc.ttcat.1', 'npc.ttcat.2', 'npc.ttcat.3']),
});

/**
 * The Rescue House (docs/TOKENTAILS-PLAN.md §10.5): the landmark the keeper stands in front of, 10.2 m out from the
 * fountain on the keeper's bearing (outside the kittens' 8 m tag loop, clear of East Street), its front (+Z local)
 * turned to the fountain, drawn at `scale` (the parts are built 3 m wide). `size` = [width, depth, height to the coin
 * crest] (m, scaled).
 */
export const RESCUE_HOUSE = (() => {
  const f = [0, 8], k = RESCUE_KEEPER.at, d = Math.hypot(k[0] - f[0], k[1] - f[1]), r = 10.2;
  const at = [+(f[0] + (k[0] - f[0]) / d * r).toFixed(2), +(f[1] + (k[1] - f[1]) / d * r).toFixed(2)];
  const scale = 1.2;
  return Object.freeze({ id: 'rescue_house', at: Object.freeze(at), yaw: Math.atan2(f[0] - at[0], f[1] - at[1]), scale, size: Object.freeze([3.0 * scale, 1.5 * scale, 4.5 * scale]) });
})();

/** Token Tails colours for the hub dressing (tokens from tokentails-app; love pink is the Pink Paw nod, §10.5). */
export const HUB_TT = Object.freeze({ pink: '#FF7AA2', cream: '#FCECBB', creamStone: '#EFE3CF', wall: '#F3E3C4', gold: '#FFCC55', goldDeep: '#E2C05A',
  night: '#2A1F45', nightDeep: '#1E1633', wood: '#8A5A3A', woodDark: '#4E3A28', mint: '#7FD66B', daisy: '#FFFDF6' });

/**
 * The keeper's line keys that exist in `strings` (the resolver returns a missing key as-is, so a key story has not
 * written yet is never shown). Pure.
 * @param {{ has?: (key: string) => boolean }} [strings]
 */
export function keeperLines(strings) {
  return typeof strings?.has === 'function' ? RESCUE_KEEPER.lines.filter((k) => strings.has(k)) : [];
}

/** The South Gate way out (§12.1): a trigger box, active once the town is free; it opens the Quest Board. */
export const SOUTH_GATE_EXIT = Object.freeze({ at: [0, -63], size: [8, 2] });

// ---------------------------------------------------------------------------------------------- props
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

/** The Quest Board: two posts, a shingled hood, a cork board with pinned parchments and the chapter crest. */
function questBoardParts() {
  const p = [[cyl(0.09, 0.11, 2.4, -1.0, 0, 0), '#4E3A28'], [cyl(0.09, 0.11, 2.4, 1.0, 0, 0), '#4E3A28'],
    [box(2.2, 1.3, 0.1, 0, 1.45, 0), '#7A5B3E'], [box(2.0, 1.12, 0.04, 0, 1.45, 0.07), '#B89A6A'],
    [box(2.6, 0.12, 0.7, 0, 2.38, 0), '#6E3A30'], [box(2.4, 0.1, 0.6, 0, 2.5, -0.05), '#8A4A3C']];
  const notes = [[-0.62, 1.68, 0.05], [-0.1, 1.72, -0.06], [0.48, 1.64, 0.08], [-0.42, 1.2, -0.04], [0.2, 1.18, 0.05], [0.7, 1.24, -0.08]];
  for (const [x, y, r] of notes) { p.push([box(0.38, 0.46, 0.012, x, y, 0.1, 0).rotateZ(r), '#EFE3CF']); p.push([new THREE.SphereGeometry(0.03, 6, 4).translate(x, y + 0.19, 0.11), HUB_TT.pink]); }
  p.push([new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16).rotateX(Math.PI / 2).translate(0, 2.06, 0.1), '#E8C35A']);   // gold crest
  return p;
}

/** A market stall counter with a striped awning (wardrobe, lookout desk). */
function stallParts(color = '#B0453C') {
  const p = [[box(2.4, 0.9, 0.9, 0, 0.45, 0), '#7A5B3E'], [box(2.5, 0.06, 1.0, 0, 0.92, 0), '#A0825A']];
  for (const x of [-1.15, 1.15]) for (const z of [-0.4, 0.4]) p.push([cyl(0.05, 0.05, 2.3, x, 0, z), '#4E3A28']);
  for (let i = 0; i < 6; i++) p.push([box(0.42, 0.05, 1.3, -1.05 + i * 0.42, 2.3 + (i % 2) * 0.01, 0.15), i % 2 ? '#EFE3CF' : color]);
  return p;
}

/** The barracks banner pole (companion swap): a pole, a crossbar, a love-pink pennant on cream with a paw, gold finial. */
function bannerParts() {
  return [[cyl(0.07, 0.09, 3.6), '#4E3A28'], [box(1.1, 0.07, 0.07, 0, 3.3, 0), '#4E3A28'], [new THREE.SphereGeometry(0.1, 8, 6).translate(0, 3.66, 0), HUB_TT.gold],
    [box(1.03, 1.58, 0.025, 0, 2.5, 0.0), HUB_TT.cream],   // the cream ground the pink pennant sits on
    [box(0.95, 1.5, 0.03, 0, 2.5, 0.02), HUB_TT.pink], [box(0.95, 0.18, 0.035, 0, 1.68, 0.02), HUB_TT.cream],
    [box(0.95, 1.5, 0.03, 0, 2.5, -0.02), HUB_TT.pink], [box(0.95, 0.18, 0.035, 0, 1.68, -0.02), HUB_TT.cream],   // the back face
    [new THREE.CircleGeometry(0.18, 12).translate(0, 2.6, 0.045), HUB_TT.cream],
    ...[-0.22, -0.07, 0.07, 0.22].map((x, i) => [new THREE.CircleGeometry(0.06, 8).translate(x, 2.86 + (i % 3 ? 0.06 : 0), 0.045), HUB_TT.cream])];
}

/** Linear rgb array (characters' coinPieces) → a THREE.Color procTemplate accepts. */
const linColor = (a) => new THREE.Color().setRGB(a[0], a[1], a[2], THREE.LinearSRGBColorSpace);

/** The gold ':3' coin (characters' coinPieces) as procTemplate parts, placed by `m` (front faces +Z of `m`). */
export function coinParts(r, m) {
  return coinPieces(r).map((p) => [p.geo.applyMatrix4(m.clone().multiply(p.matrix)), linColor(p.color)]);
}

/** A love-pink paw (pad + four beans) on a plane facing +Z at (x, y, z), pad radius `r`: generic, not Pink Paw's logo. */
function pawParts(x, y, z, r, color = HUB_TT.pink) {
  const p = [[new THREE.CircleGeometry(r, 16).scale(1.15, 0.95, 1).translate(x, y, z), color]];
  for (const [bx, by] of [[-1.25, 1.2], [-0.45, 1.72], [0.45, 1.72], [1.25, 1.2]]) p.push([new THREE.CircleGeometry(r * 0.4, 10).translate(x + bx * r, y + by * r, z), color]);
  return p;
}

/** A daisy flower box (wood trough, mint leaves, white daisies with gold hearts), centred at (x, 0, z), width `w`. */
function flowerBoxParts(x, z, w = 0.9) {
  const p = [[box(w, 0.32, 0.32, x, 0.16, z), HUB_TT.wood], [box(w + 0.06, 0.05, 0.36, x, 0.33, z), HUB_TT.woodDark]];
  const n = Math.max(3, Math.round(w / 0.22));
  for (let i = 0; i < n; i++) {
    const fx = x - w / 2 + (i + 0.5) * (w / n), fz = z + (i % 2 ? 0.05 : -0.05), y = 0.42 + (i % 3) * 0.04;
    p.push([new THREE.SphereGeometry(0.09, 6, 4).scale(1, 0.6, 1).translate(fx, 0.38, fz), HUB_TT.mint]);
    p.push([new THREE.CircleGeometry(0.075, 8).rotateX(-Math.PI / 2 + 0.5).translate(fx, y, fz), HUB_TT.daisy]);
    p.push([new THREE.SphereGeometry(0.03, 6, 4).translate(fx, y + 0.012, fz + 0.012), HUB_TT.gold]);
  }
  return p;
}

/**
 * The Rescue House (local frame: ground at y 0, front +Z, width 3 m): a cream back wall with a round-topped door under a
 * night roof with a gold ridge, two cream stone pillars with gold caps carrying an arch, a love-pink / cream striped
 * awning between wall and pillars, the cream board with the love-pink paw inside the arch, the gold ':3' coin crest on
 * the arch, and daisy flower boxes at both pillar feet. ONE procTemplate (one batch entry, no extra draw).
 */
export function rescueHouseParts() {
  const T = HUB_TT, p = [];
  const ax = 1.15, az = 0.3, ay = 2.6, ar = 1.15, tube = 0.16;
  p.push([box(3.0, 0.16, 1.5, 0, 0.08, -0.15), '#D9C7A6']);                                   // stone step
  p.push([box(2.6, 2.6, 0.25, 0, 1.3, -0.62), T.wall]);                                       // back wall
  p.push([box(0.9, 1.45, 0.06, 0, 0.88, -0.47), T.wood], [new THREE.CircleGeometry(0.45, 12, 0, Math.PI).translate(0, 1.6, -0.47), T.wood]);   // door
  p.push([new THREE.SphereGeometry(0.04, 6, 4).translate(0.3, 0.95, -0.42), T.gold]);         // door knob
  p.push([new THREE.CylinderGeometry(0.8, 0.8, 2.9, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).translate(0, 2.98, -0.62), T.night]);   // gable roof
  p.push([box(2.95, 0.07, 0.1, 0, 3.78, -0.62), T.goldDeep]);                                 // gold ridge
  for (const sx of [-1, 1]) {
    p.push([box(0.34, 2.6, 0.34, sx * ax, 1.3, az), T.creamStone]);                            // pillars
    p.push([box(0.44, 0.12, 0.44, sx * ax, 2.62, az), T.goldDeep]);                            // gold caps
    p.push([box(0.44, 0.14, 0.44, sx * ax, 0.23, az), '#D9C7A6']);                             // pillar feet
  }
  p.push([new THREE.TorusGeometry(ar, tube, 6, 20, Math.PI).translate(0, ay, az), T.creamStone]);   // the arch
  p.push([new THREE.TorusGeometry(ar + tube * 0.9, 0.035, 4, 20, Math.PI).translate(0, ay, az + 0.05), T.goldDeep]);   // gold arch trim
  // the cream board inside the arch, a gold frame, the love-pink paw
  p.push([box(1.2, 0.78, 0.06, 0, ay + 0.42, az - 0.02), T.goldDeep], [box(1.08, 0.66, 0.08, 0, ay + 0.42, az), T.cream]);
  p.push(...pawParts(0, ay + 0.34, az + 0.045, 0.13));
  // the striped awning from the wall to the arch, sloping down to the front, with a scalloped pink valance
  const n = 6, w = 2.2 / n;
  for (let i = 0; i < n; i++) {
    const x = -1.1 + w * (i + 0.5);
    p.push([new THREE.BoxGeometry(w, 0.05, 1.05).rotateX(0.32).translate(x, 2.32, -0.08), i % 2 ? T.cream : T.pink]);
    p.push([new THREE.CircleGeometry(w / 2, 8, Math.PI, Math.PI).translate(x, 2.15, 0.42), i % 2 ? T.cream : T.pink]);
  }
  // the gold ':3' coin crest on the arch
  p.push(...coinParts(0.3, new THREE.Matrix4().makeTranslation(0, ay + ar + tube + 0.3, az)));
  // daisy flower boxes at the pillar feet (outside the arch)
  for (const sx of [-1, 1]) p.push(...flowerBoxParts(sx * 1.78, az + 0.1, 0.62));
  return p;
}

/**
 * A Token Tails night banner on a pole (replaces the red KayKit banners): night cloth #2A1F45 with gold trim bands and
 * a gold ':3' coin emblem, a gold finial and crossbar caps. Local frame: pole at the origin, cloth facing +Z, 3.6 m.
 */
export function ttBannerParts() {
  const T = HUB_TT;
  return [[cyl(0.07, 0.09, 3.6), T.woodDark], [box(1.1, 0.07, 0.07, 0, 3.3, 0), T.woodDark],
    [new THREE.SphereGeometry(0.1, 8, 6).translate(0, 3.66, 0), T.gold],
    ...[-0.55, 0.55].map((x) => [new THREE.SphereGeometry(0.05, 6, 4).translate(x, 3.3, 0), T.gold]),
    ...ttClothParts(0.95, 1.5, 2.5, 0.02),
  ];
}

/** A Token Tails night wall banner (hangs from a gold rod; top at y 0, front +Z): `w` × `h` m. */
export function ttWallBannerParts(w = 0.9, h = 1.6) {
  const T = HUB_TT;
  return [[new THREE.CylinderGeometry(0.03, 0.03, w + 0.2, 6).rotateZ(Math.PI / 2).translate(0, 0, 0.03), T.gold],
    ...[-1, 1].map((sx) => [new THREE.SphereGeometry(0.05, 6, 4).translate(sx * (w / 2 + 0.12), 0, 0.03), T.gold]),
    ...ttClothParts(w, h, -h / 2, 0.02)];
}

/** Night cloth `w` × `h` centred at height `cy` (z offset `z`): gold trim bands, a swallow-tail hem, a coin emblem. */
function ttClothParts(w, h, cy, z) {
  const T = HUB_TT;
  const p = [[box(w, h, 0.03, 0, cy, z), T.night],
    [box(w, 0.07, 0.035, 0, cy + h / 2 - 0.1, z), T.goldDeep], [box(w, 0.07, 0.035, 0, cy - h / 2 + 0.16, z), T.goldDeep],
    [box(0.05, h - 0.1, 0.035, -w / 2 + 0.06, cy, z), T.goldDeep], [box(0.05, h - 0.1, 0.035, w / 2 - 0.06, cy, z), T.goldDeep]];
  // swallow-tail hem: two night points under the cloth
  for (const sx of [-1, 1]) p.push([new THREE.ConeGeometry(w / 4, 0.24, 3).rotateZ(Math.PI).scale(1, 1, 0.12).translate(sx * w / 4, cy - h / 2 - 0.1, z), T.nightDeep]);
  p.push(...coinParts(Math.min(w, h) * 0.24, new THREE.Matrix4().makeTranslation(0, cy + h * 0.08, z + 0.03)));
  return p;
}

/** A small hanging sign on a bracket (shop signs: bread, anvil, book, envelope, eye). */
export function signParts(icon = 'bread', color = '#E8C35A') {
  const p = [[box(0.08, 0.08, 1.0, 0, 0, 0.5), '#3A2A1F'], [box(0.02, 0.4, 0.02, 0, -0.2, 0.85), '#3A2A1F'],
    [box(0.06, 0.62, 0.78, 0, -0.62, 0.85), '#7A5B3E']];
  const icons = {
    bread: [[new THREE.SphereGeometry(0.2, 10, 6).scale(1.5, 0.75, 0.5).rotateY(Math.PI / 2).translate(0.04, -0.62, 0.85), color]],
    anvil: [[box(0.04, 0.12, 0.44, 0.04, -0.56, 0.85), '#3A3C40'], [box(0.04, 0.16, 0.16, 0.04, -0.7, 0.85), '#3A3C40']],
    book: [[box(0.04, 0.32, 0.46, 0.04, -0.62, 0.85), '#5A6FA0'], [box(0.045, 0.28, 0.02, 0.045, -0.62, 0.85), '#EFE3CF']],
    letter: [[box(0.04, 0.3, 0.46, 0.04, -0.62, 0.85), '#EFE3CF'], [new THREE.CircleGeometry(0.05, 10).rotateY(Math.PI / 2).translate(0.07, -0.62, 0.85), '#C9587C']],
    eye: [[new THREE.SphereGeometry(0.16, 10, 6).scale(0.3, 0.7, 1.2).translate(0.04, -0.62, 0.85), '#EFE3CF'], [new THREE.SphereGeometry(0.07, 8, 6).translate(0.08, -0.62, 0.85), '#3A2A1F']],
    hanger: [[box(0.04, 0.05, 0.5, 0.04, -0.5, 0.85), '#C9A27A'], [box(0.04, 0.34, 0.3, 0.04, -0.7, 0.85), '#B0453C']],
    // the Rescue House sign (§10.5): a love-pink paw on a cream plaque, on both faces (generic paw, not Pink Paw's logo)
    paw: [[box(0.07, 0.5, 0.62, 0, -0.62, 0.85), HUB_TT.cream],
      ...[1, -1].flatMap((sx) => pawParts(0, -0.68, 0, 0.1).map(([g, c]) => [g.rotateY(sx * Math.PI / 2).translate(sx * 0.04, 0, 0.85), c]))],
  };
  p.push(...(icons[icon] ?? icons.bread));
  return p;
}

/**
 * Hub setpiece (town): the Quest Board, the barracks banner, the wardrobe stall, the lookout desk, station signs and
 * the interactables (opened by `town.free` / later flags), plus the South Gate exit (opens the Quest Board).
 */
export function buildHub(kit) {
  const ctx = kit.ctx, level = kit.level;
  const board = kit.proc('quest_board', questBoardParts);
  const qb = STATIONS.find((s) => s.id === 'questboard');
  kit.place(board, qb.at[0], qb.at[1], { yaw: -Math.PI / 2, collider: 'box', shrink: 0.9, jitter: 0, height: 2.4 });
  kit.anchor('quest_board', qb.use[0], qb.use[1], undefined, Math.PI / 2);
  const ban = STATIONS.find((s) => s.id === 'barracks');
  kit.place(kit.proc('barracks_banner', bannerParts), ban.at[0] + 0.9, ban.at[1] + 0.6, { yaw: -0.4, collider: 'circle', shrink: 0.3, jitter: 0, height: 3.6 });
  const wd = STATIONS.find((s) => s.id === 'wardrobe');
  kit.place(kit.proc('wardrobe_stall', () => stallParts(HUB_TT.pink)), wd.at[0], wd.at[1] + 1.2, { yaw: Math.PI, collider: 'box', jitter: 0 });
  // the Rescue House by the fountain (§10.5), its paw sign on the keeper's side and a Token Tails night banner beside it
  {
    const H = RESCUE_HOUSE, c = Math.cos(H.yaw), sn = Math.sin(H.yaw);
    const loc = (lx, lz) => [H.at[0] + (lx * c + lz * sn) * H.scale, H.at[1] + (-lx * sn + lz * c) * H.scale];   // local (x, z) → world
    const placed = [kit.place(kit.proc('rescue_house', rescueHouseParts), H.at[0], H.at[1], { yaw: H.yaw, scale: H.scale, collider: 'box', shrink: 0.92, jitter: 0, height: 3.8 * H.scale, clear: 2.4, occupy: 2.4 })];
    const [sx, sz] = loc(1.32, 0.3);
    placed.push(kit.place(kit.proc('sign_paw', () => signParts('paw')), sx, sz, { yaw: H.yaw + Math.PI / 2, lift: 2.35 * H.scale, collider: false, clear: false, occupy: false, jitter: 0 }));
    const [bx, bz] = loc(-2.35, 0.1);
    placed.push(kit.place(kit.proc('tt_banner', ttBannerParts), bx, bz, { yaw: H.yaw, collider: 'circle', shrink: 0.3, jitter: 0, height: 3.6, clear: false, occupy: 0.6 }));
    kit.anchor(H.id, ...loc(0, 1.4), undefined, H.yaw);
    // the batch entries (smoke world:rescue-house measures their draw cost by hiding them)
    level.rescueHouseHandles = placed.filter((p) => p?.handle != null).map((p) => p.handle);
  }
  for (const s of STATIONS) {
    if (s.kind === 'vigil') continue;
    const id = s.kind === 'questboard' ? 'quest_board' : s.kind === 'talk' ? 'npc_' + s.id : 'station_' + s.id;
    kit.interact({ id, at: s.use, r: s.kind === 'station' ? 2.2 : 1.9, kind: s.kind, prompt: s.prompt ?? 'prompt.interact', station: s.kind === 'station' ? s.id : undefined,
      enabled: () => stationOpen(s, ctx.state) && !ctx.story?.isPlaying,
      // ui opens the panel on `interact` (kind station / questboard); a talk spot asks story for a hub line
      use: () => { if (s.kind === 'talk') { try { ctx.story?.hubTalk?.(ctx.actors?.get?.(s.who) ?? s.who); } catch { /* optional */ } } } });
    kit.anchor('station_' + s.id, s.use[0], s.use[1]);
    kit.clear(s.use[0], s.use[1], 1.2, 0.3);
  }
  // the South Gate way out: once the town is free, walking out opens the Quest Board (ui travels on a pick)
  kit.trigger({ id: 'south_gate', at: SOUTH_GATE_EXIT.at, size: SOUTH_GATE_EXIT.size, once: false, when: 'town.free',
    fire: () => { if (typeof ctx.ui?.openQuestBoard === 'function') ctx.ui.openQuestBoard(); else ctx.bus.emit(E.INTERACT, { target: { id: 'quest_board', kind: 'questboard', position: new THREE.Vector3(0, 0, -63) } }); } });
  for (const [id, s] of Object.entries(HUB_KITTEN_SPOTS)) kit.anchor('hub_' + id, s.at[0], s.at[1], kit.h(s.at[0], s.at[1]) + (s.y ?? 0));
  { const k = RESCUE_KEEPER; kit.anchor('hub_' + k.id, k.at[0], k.at[1], undefined, k.facing); kit.clear(k.at[0], k.at[1], 0.9, 0.3); }
  level.hub = { stations: STATIONS, open: (id) => stationOpen(STATIONS.find((s) => s.id === id), ctx.state), next: () => nextLevel(ctx.state), board: () => questBoard(ctx.state),
    active: () => condOk(ctx, 'town.free') };
}
