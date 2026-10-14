// src/world/Hub.js  (owner: world) — Pawsbury as the hub (GAME_DESIGN §12.5 "Hub mode", §13.3, §12.1 "The hub's way
// out"): the station table, the Quest Board, the kitten activity spots and the South Gate exit.
//   STATIONS            every hub station (who, where, the flag that opens it, its ui panel id)
//   stationOpen(s, st)  is a station open in this save? (pure)
//   nextLevel(st)       the next chapter the Quest Board offers ("Next: {chapter}"), or null (pure)
//   questBoard(st)      the board rows: { id, cleared, unlocked, next, bestRank, kittens, kittensTotal } (pure)
//   HUB_KITTEN_SPOTS    §12.5 activity spots (companions' HubKittens reads them; town defines `hub_<id>` anchors)
//   RESCUE_KEEPER       the Token Tails cat, keeper of the Pawsbury Rescue House (docs/TOKENTAILS-PLAN.md §2.4):
//                       where it stands by the rescued kittens, its speaker key and line keys; keeperLines(strings)
//   buildHub(kit, opts) town setpiece: station props (stalls, banner, notice board, signs), interactables (kind
//                       'station' / 'questboard' / 'talk', which ui opens on `interact`), the South Gate exit trigger
// UI listens to `interact {target: {id, kind}}`: 'station_<id>' + kind 'station' opens that shop, kind 'questboard'
// opens the Quest Board (ui travels on a pick). Nothing here runs while the town is still occupied (`!town.free`).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { LEVEL_IDS, KITTENS_BY_LEVEL } from '../core/config.js';
import { condOk } from './Level.js';

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
  for (const [x, y, r] of notes) { p.push([box(0.38, 0.46, 0.012, x, y, 0.1, 0).rotateZ(r), '#EFE3CF']); p.push([new THREE.SphereGeometry(0.03, 6, 4).translate(x, y + 0.19, 0.11), '#C9587C']); }
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

/** The barracks banner pole (companion swap): a pole, a crossbar, a pink-and-cream pennant with a paw. */
function bannerParts() {
  return [[cyl(0.07, 0.09, 3.6), '#4E3A28'], [box(1.1, 0.07, 0.07, 0, 3.3, 0), '#4E3A28'], [new THREE.SphereGeometry(0.1, 8, 6).translate(0, 3.66, 0), '#E8C35A'],
    [box(0.95, 1.5, 0.03, 0, 2.5, 0.02), '#C9587C'], [box(0.95, 0.18, 0.035, 0, 1.68, 0.02), '#EFE3CF'],
    [new THREE.CircleGeometry(0.18, 12).translate(0, 2.6, 0.045), '#EFE3CF'],
    ...[-0.22, -0.07, 0.07, 0.22].map((x, i) => [new THREE.CircleGeometry(0.06, 8).translate(x, 2.86 + (i % 3 ? 0.06 : 0), 0.045), '#EFE3CF'])];
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
  kit.place(kit.proc('wardrobe_stall', () => stallParts('#C9587C')), wd.at[0], wd.at[1] + 1.2, { yaw: Math.PI, collider: 'box', jitter: 0 });
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
