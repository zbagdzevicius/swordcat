// src/audio/cues.js  (owner: audio) — M2 cutscene cue sheets (GAME_DESIGN §5.4 CS-04 … CS-10, D-02 … D-06, G-02):
// named composite sounds a cutscene `sfx` step plays by id, e.g. `{ t: 'sfx', id: 'cs09.roar', at: 'pudding' }`.
// Each part is an SFX name, a file id or a procedural id (AudioManager PROCEDURAL), started `delay` seconds after the
// cue at the cue's position (or its own `at`). The cue returns one `{ name, stop(fade) }` handle stopping every part.
// Music is not part of a cue: cutscenes keep their `music` steps (the tracks below are the §5.4 Audio columns).
// Pure data (node-safe).
//
// Music per scene (story `music` steps; listed here so the cue sheets read whole):
//   CS-04 end      dark_forest_creepy (track volume 0.6)          CS-05   — (the boss sting already played)
//   CS-06 shot 4   null, 4 s, then story_lament_warriors_soul      CS-06 end  the level's explore track (`music: 'explore'`)
//   CS-07          village_bards_tale ("hubGold") as the bell crane starts
//   CS-08 shot 1   null ("music cut; wind only")  shot 5  battle_theme_a ("hits")
//   CS-09 shot 5   null (silence, then the purr cue)               CS-10   story_lament_warriors_soul ("emotional")

/**
 * @typedef {object} CuePart
 * @property {string} id       SFX name / file id / procedural id
 * @property {number} [delay]  seconds after the cue starts
 * @property {any} [at]        own position (else the cue's)
 * Any other field is passed through as the part's options (vol, rate, loop, dur, count, r, syllables, ...).
 */

/** @type {Record<string, CuePart[]>} */
export const CUES = {
  // ---- D-02 Sage Joins (forest, cage lowered)
  'd02.cage':      [{ id: 'cageLower' }, { id: 'cageOpen', delay: 2.0 }],
  'd02.tumble':    [{ id: 'land', delay: 0 }, { id: 'impact/cloth_heavy', delay: 0.05, rate: 1.1 }, { id: 'hurtVoice', delay: 0.1, vol: 0.6 }],
  // ---- CS-04 Lantern Night (shot 1: purr + crackle; shot 5: purr loop)
  'cs04.camp':     [{ id: 'campfire', vol: 1 }, { id: 'crickets', vol: 0.04 }],
  'cs04.crackle':  [{ id: 'world/wood_hit_01', vol: 0.25, rate: 1.3 }],
  'cs04.purr':     [{ id: 'cat/cat_purrsleepy_loop', loop: true, vol: 0.5 }],
  'cs04.snore':    [{ id: 'puddingSnore' }],
  'cs04.rollover': [{ id: 'impact/cloth_heavy', rate: 0.75, vol: 0.5 }, { id: 'kittenChirp', delay: 0.3, rate: 0.85, vol: 0.4 }],
  'cs04.tailCurl': [{ id: 'impact/cloth_heavy', rate: 0.55, vol: 0.6 }, { id: 'puddingPurr', delay: 0.4, dur: 3 }],
  // ---- CS-05 First Light (B1 defeated)
  'cs05.hatFly':   [{ id: 'swishHeavy', rate: 1.3 }, { id: 'impact/cloth', delay: 0.12, rate: 1.2 }],
  'cs05.yield':    [{ id: 'grizzleRoar', rate: 1.15 }],
  'cs05.shardRise': [{ id: 'pickup/powerup_rise05' }, { id: 'lanternGlow', delay: 0.4 }],
  'cs05.shardSink': [{ id: 'magic/magic1' }, { id: 'holyImpact', delay: 0.05, vol: 0.5 }],
  // ---- CS-06 The Letters (town, Post Office)
  'cs06.spill':    [{ id: 'mailbagDrop' }],
  'cs06.fan':      [{ id: 'letterFan' }, { id: 'letterFan', delay: 0.25 }, { id: 'letterFan', delay: 0.5 }],
  'cs06.coo':      [{ id: 'coo' }, { id: 'coo', delay: 1.1 }],
  'cs06.cooFlutter': [{ id: 'wings' }, { id: 'wings', delay: 0.18 }, { id: 'wings', delay: 0.36 }, { id: 'wings', delay: 0.6 }],
  'cs06.parchment': [{ id: 'ui.bookOpen' }, { id: 'ui/scroll_002', delay: 0.2, vol: 0.5 }],
  'cs06.fold':     [{ id: 'ui/bookFlip1', rate: 1.2 }, { id: 'impact/cloth', delay: 0.3 }],
  // ---- D-03 / D-04 (town)
  'd03.door':      [{ id: 'doorOpen' }],
  'd04.barrel':    [{ id: 'crateHit' }, { id: 'kittenMew', delay: 0.3 }],
  'd04.jellyPop':  [{ id: 'jellySplit' }, { id: 'splash', delay: 0.1 }],
  'd04.stocks':    [{ id: 'stocksOpen' }],
  // ---- CS-07 The Red Cape (town steps, hub_gold)
  'cs07.door':     [{ id: 'doorOpen' }, { id: 'world/creak3', delay: 0.15, vol: 0.6 }],
  'cs07.cape':     [{ id: 'impact/cloth_heavy', rate: 0.9 }, { id: 'jingles/jingles_PIZZI06', delay: 0.35, vol: 0.5 }],
  'cs07.point':    [{ id: 'sword/sword_unsheathe2', vol: 0.5, rate: 0.9 }],
  'cs07.free':     [{ id: 'jingles/jingles_SAX05', vol: 0.55 }, { id: 'kittenCheer', delay: 0.4 }],
  // ---- D-06 Pip Joins (gate, war-wagon)
  'd06.wagon':     [{ id: 'cageOpen' }, { id: 'world/creak1', delay: 0.2 }],
  // ---- CS-08 Nobody's Coming (gate, repair 70%)
  'cs08.horde':    [{ id: 'laughChorus', count: 6, r: 30, dur: 6 }, { id: 'cs08.drums', delay: 0.5 }],
  'cs08.drums':    [{ id: 'farDrums' }, { id: 'farDrums', delay: 1.3 }, { id: 'farDrums', delay: 2.6 }],
  'cs08.ears':     [{ id: 'impact/cloth', rate: 1.8, vol: 0.25 }],
  'cs08.spoons':   [{ id: 'spoonClink' }, { id: 'spoonClink', delay: 0.2 }, { id: 'spoonClink', delay: 0.45 }, { id: 'spoonClink', delay: 0.7 }, { id: 'kittenChirp', delay: 0.5, vol: 0.4 }],
  // ---- G-02 Marmalade's Leap (gate, repair 85%)
  'g02.ballista':  [{ id: 'ballistaFire' }],
  'g02.leap':      [{ id: 'impact/cloth_heavy', rate: 0.8 }, { id: 'marmaladeOof', delay: 0.3 }, { id: 'flourPuff', delay: 0.34 }],
  'g02.drag':      [{ id: 'impact/cloth_heavy', rate: 0.7, vol: 0.5 }, { id: 'kittenChirp', delay: 0.2, vol: 0.5 }],
  // ---- The Line set pieces (world / story call these; §12.6)
  'line.horn':     [{ id: 'farHorn' }],
  'line.pinStolen': [{ id: 'stealerSnatch' }, { id: 'repairFreeze', delay: 0.15 }],
  'line.pinBack':  [{ id: 'keys' }, { id: 'repairResume', delay: 0.2 }],
  'line.portcullis': [{ id: 'portcullisOpen' }, { id: 'portcullisClose', delay: 2.6 }],
  // ---- CS-09 Last Laugh (gate, B2 defeated)
  'cs09.laugh':    [{ id: 'laugh', rate: 0.9, syllables: 3, vol: 0.6 }, { id: 'laugh', delay: 1.1, rate: 0.85, syllables: 7, vol: 1.1 }],
  'cs09.charge':   [{ id: 'laughChorus', count: 10, r: 28, dur: 4, vol: 2.6 }, { id: 'rumble', dur: 4, vol: 0.9 }, { id: 'cs08.drums' }],
  'cs09.plant':    [{ id: 'impact/impactPlate_heavy_002', vol: 0.8 }, { id: 'sword/sword_unsheathe3', delay: 0.05, vol: 0.5 }],
  'cs09.shard':    [{ id: 'pickup/powerup_rise07' }, { id: 'jingles/jingles_STEEL03', delay: 0.55 }],
  'cs09.roar':     [{ id: 'creature/creature_roar_03', rate: 0.7, vol: 1 }, { id: 'creature/c80_roar_02', rate: 0.7, delay: 0.05, vol: 0.9 }],
  'cs09.scatter':  [{ id: 'laughChorus', count: 8, r: 30, dur: 3, rate: 1.35, vol: 1.6 }],
  'cs09.sob':      [{ id: 'laugh', rate: 0.72, syllables: 4, vol: 0.55 }],
  'cs09.wheeze':   [{ id: 'laugh', rate: 1.15, syllables: 3, vol: 0.4 }],
  'cs09.purr':     [{ id: 'cat/cat_purrsleepy_loop', loop: true, vol: 0.3 }],
  // ---- CS-10 Eighth Life (gate wall → town bakery)
  'cs10.cheer':    [{ id: 'kittenCheer' }],
  'cs10.soup':     [{ id: 'impact/metal_small2', rate: 1.7, vol: 0.35 }],
  'cs10.letter':   [{ id: 'ui/bookFlip1' }, { id: 'impact/cloth', delay: 0.4, vol: 0.4 }],
  'cs10.gloom':    [{ id: 'rumble', dur: 4.5, vol: 1 }, { id: 'farHorn', delay: 1.5, vol: 0.4, rate: 0.7 }],
};

/** Every file id the cue sheets name directly (manifest + U15). Procedural / SFX names are resolved elsewhere. */
export function cueFileIds() {
  const out = new Set();
  for (const parts of Object.values(CUES)) for (const p of parts) if (p.id.includes('/')) out.add(p.id);
  return [...out];
}

/** Options of a part (everything but id / delay / at). */
export function partOpts(p) {
  const { id, delay, at, ...o } = p;
  void id; void delay; void at;
  return o;
}
