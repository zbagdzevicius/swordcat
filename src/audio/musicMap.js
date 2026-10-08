// src/audio/musicMap.js  (owner: audio) — GAME_DESIGN §16.1 music table + rules, and the MusicDirector (pure state
// machine: explore ↔ combat ↔ boss, cutscene requests, stings). Node-safe; AudioManager drives the playback.

/**
 * @typedef {object} TrackDef
 * @property {string} file    path relative to public/assets/
 * @property {'explore'|'combat'|'boss'|'story'|'sting'|'results'} kind
 * @property {number} [vol]   design volume (§16.1, default 1)
 * @property {number} [meanDb] the file's mean level (ffmpeg volumedetect, dBFS): trackGain() normalises every track
 *                            to MUSIC_TARGET_DB (the means span −26 … −9 dB; unnormalised, the fight loop would be
 *                            17 dB louder than field_of_dreams)
 * @property {boolean} [loop] default true (stings: false)
 * @property {number} [offset] start offset in seconds
 * @property {boolean} [buffer] decode to an AudioBuffer (short seamless loops / stings); else streamed
 */

/** Target mean loudness every track is normalised to (dBFS, before the music bus). */
export const MUSIC_TARGET_DB = -18;

/** @type {Record<string, TrackDef>} — all 14 tracks are used (§16.1). */
export const TRACKS = {
  village_bards_tale:         { file: 'audio/music/village_bards_tale.mp3', kind: 'explore', meanDb: -21.0 }, // title, menu, CS-01, hub gold, credits tail
  field_of_dreams:            { file: 'audio/music/field_of_dreams.mp3', kind: 'explore', meanDb: -26.3 }, // meadow + forest day, ending flight
  battle_fast_fight_loop:     { file: 'audio/music/battle_fast_fight_loop.ogg', kind: 'combat', buffer: true, meanDb: -9.1 }, // 24 s seamless loop
  battle_theme_a:             { file: 'audio/music/battle_theme_a.mp3', kind: 'combat', meanDb: -13.1 }, // The Line waves, CS-02 sting, keep courtyard
  boss_epic_battle_loop:      { file: 'audio/music/boss_epic_battle_loop.ogg', kind: 'boss', meanDb: -8.6 },
  dark_forest_creepy:         { file: 'audio/music/dark_forest_creepy.ogg', kind: 'explore', vol: 0.6, meanDb: -26.0 }, // "at volume 0.6"
  cave_theme:                 { file: 'audio/music/cave_theme.ogg', kind: 'explore', meanDb: -14.1 },
  village_town_theme:         { file: 'audio/music/village_town_theme.mp3', kind: 'explore', meanDb: -15.6 },
  tavern_old_tower_inn:       { file: 'audio/music/tavern_old_tower_inn.mp3', kind: 'explore', meanDb: -20.3 },
  story_lament_warriors_soul: { file: 'audio/music/story_lament_warriors_soul.mp3', kind: 'story', meanDb: -19.5 },
  castle_kings_feast:         { file: 'audio/music/castle_kings_feast.mp3', kind: 'story', meanDb: -16.2 },
  festival_minstrel_dance:    { file: 'audio/music/festival_minstrel_dance.mp3', kind: 'story', meanDb: -15.2 },
  victory_fanfare:            { file: 'audio/music/victory_fanfare.mp3', kind: 'sting', loop: false, buffer: true, meanDb: -21.0 },
  victory_8bit_loop:          { file: 'audio/music/victory_8bit_loop.ogg', kind: 'results', meanDb: -18.2 },
};

/** Most a quiet track is boosted (+10 dB) by the normalisation. */
export const MUSIC_MAX_BOOST = 3.16;

/** Deck gain of a track: design volume × loudness normalisation to MUSIC_TARGET_DB. */
export const trackGain = (def) => (def?.vol ?? 1) *
  (Number.isFinite(def?.meanDb) ? Math.min(MUSIC_MAX_BOOST, 10 ** ((MUSIC_TARGET_DB - def.meanDb) / 20)) : 1);

/** Per-level defaults (used when the level def has no `music`; the level's own `music` wins). */
export const LEVEL_MUSIC = {
  meadow: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  forest: { explore: 'field_of_dreams', night: 'dark_forest_creepy', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  town:   { explore: 'village_town_theme', combat: 'battle_fast_fight_loop', zones: [] },
  gate:   { explore: 'village_town_theme', combat: 'battle_theme_a', boss: 'boss_epic_battle_loop' },
  bog:    { explore: 'cave_theme', combat: 'battle_fast_fight_loop' },
  keep:   { explore: 'cave_theme', combat: 'battle_theme_a', boss: 'boss_epic_battle_loop' },
};

/** Named contexts other areas may ask for (`ctx.audio.music(CONTEXT_MUSIC.title)`). */
export const CONTEXT_MUSIC = {
  title: 'village_bards_tale', menu: 'village_bards_tale', knightingEve: 'village_bards_tale', hubGold: 'village_bards_tale',
  hubGrey: 'story_lament_warriors_soul', emotional: 'story_lament_warriors_soul', knighting: 'castle_kings_feast',
  credits: 'festival_minstrel_dance', festival: 'festival_minstrel_dance', victory: 'victory_fanfare', results: 'victory_8bit_loop',
  bakery: 'tavern_old_tower_inn', ending: 'field_of_dreams',
};

/** Ambience loops per level (wind is procedural everywhere). Ids are sfx file ids. */
export const AMBIENCE = {
  gate: { id: 'world/loop_water_01', vol: 0.18 },
  bog:  { id: 'world/loop_water_01', vol: 0.3 },
  keep: { id: 'world/loop_rain', vol: 0.35 },
};

/** §16.1 rules. */
export const MUSIC_RULES = {
  crossfade: 1.5,          // A/B crossfade (tech.md §14)
  combatFade: 0.8,
  bossSnap: 0.3,           // boss track snaps in within 0.3 s at the fog wall
  combatRadius: 20,        // "1 or more enemies alerted within 20 m"
  calmDelay: 4,            // "Explore resumes 4 s after the last kill"
  restoreFade: 2.0,        // after a cutscene left the music silent
  stingDur: 4.2,
  titleFade: 2.0,          // CS-00: bards tale fades in over 2 s after the unlock
};

/** Normalise a track request ('field_of_dreams', 'music/field_of_dreams.mp3', a full audio/music/ path) → id | null. */
export function trackId(track) {
  if (track == null || track === '' || track === false) return null;
  if (typeof track === 'object') track = track.track ?? track.id ?? null;
  if (track == null) return null;
  const s = String(track).replace(/\\/g, '/');
  const base = s.split('/').pop().replace(/\.(mp3|ogg|wav)$/i, '');
  if (TRACKS[base]) return base;
  if (CONTEXT_MUSIC[base]) return CONTEXT_MUSIC[base];
  return null;
}

/**
 * Track ids that the director can choose for a level. A level's `music.prologue` track (meadow: the bards' tale that
 * CS-01 fades in, carried through the night tutorial) replaces its explore track while `opts.prologue` is true (flag
 * `prologue.done` unset); requests for the day explore track are then read as the prologue track (`alias`).
 * @param {string|null} levelId @param {object|null} def  the level's `music` block
 * @param {{prologue?: boolean}} [opts]
 */
export function levelMusic(levelId, def, { prologue = false } = {}) {
  const fb = LEVEL_MUSIC[levelId] ?? {};
  const m = def && typeof def === 'object' ? def : {};
  const day = trackId(m.explore) ?? trackId(fb.explore);
  const pro = prologue ? trackId(m.prologue) : null;
  return {
    explore: pro ?? day,
    alias: pro && day && pro !== day ? day : null,
    combat: trackId(m.combat) ?? trackId(fb.combat) ?? 'battle_fast_fight_loop',
    boss: trackId(m.boss) ?? trackId(fb.boss) ?? 'boss_epic_battle_loop',
    zones: Array.isArray(m.zones) ? m.zones : (fb.zones ?? []),
  };
}

/**
 * Pure music state machine (§16.1 rules). AudioManager feeds it events and polls `take()` for track changes.
 *
 *  - `request(track, fade)`  explicit requests (E.MUSIC, cutscene `music` steps, ctx.audio.music). Explore/story/results
 *    tracks become the `base`; combat/boss tracks force that state; `null` silences now (base kept; restored when
 *    play resumes after a cutscene); stings play over the ducked music.
 *  - `tick(dt, {mode, threat, zone})`  combat starts on a locked arena or a threat; explore resumes `calmDelay`
 *    seconds after the last threat. Only evaluated in play / memecam (cutscenes keep their music).
 */
export class MusicDirector {
  constructor() {
    /** @type {string|null} explore track to come back to */
    this.base = null;
    /** @type {string|null} what should be playing */
    this.target = null;
    this.fade = MUSIC_RULES.crossfade;
    this.combat = false;
    this.boss = false;
    /** @type {string|null} combat track forced by an explicit request */
    this.forced = null;
    this.calmT = 0;
    this.arenas = new Set();
    this.level = levelMusic(null, null);
    this.restorePending = false;
    /** @type {string|null} one-shot sting to start (consumed by take()) */
    this.sting = null;
    this.zone = null;
    this.version = 0;          // bumps on every target change
    this._taken = -1;
  }

  _set(track, fade) {
    if (track === this.target) return;
    this.target = track; this.fade = fade; this.version++;
  }

  /**
   * New level: dynamic state resets; its explore track arrives through E.MUSIC.
   * @param {string|null} levelId @param {object|null} def @param {{prologue?: boolean}} [opts]  see levelMusic()
   */
  setLevel(levelId, def, opts) {
    this.level = levelMusic(levelId, def, opts);
    this.combat = false; this.boss = false; this.forced = null; this.calmT = 0; this.arenas.clear(); this.zone = null;
  }

  request(track, fade = MUSIC_RULES.crossfade, { mode = 'play' } = {}) {
    let id = trackId(track);
    if (id && id === this.level.alias) id = this.level.explore;      // the day track asked for during the prologue
    if (!id) {
      // silence: inside a cutscene/dialogue the level music comes back when play resumes; in play it stays silent
      this._set(null, fade); this.restorePending = mode === 'cutscene' || mode === 'dialog'; this.forced = null;
      return null;
    }
    // the level's own explore track is explore music whatever its kind (a level may explore to battle_theme_a)
    const kind = id === this.level.explore ? 'explore' : TRACKS[id].kind;
    if (kind === 'sting') { this.sting = id; return id; }
    this.restorePending = false;
    if (kind === 'combat') {
      this.forced = id; this.combat = true; this.calmT = 0;
      if (!this.base) this.base = this.level.explore;
      this._set(id, fade);
    } else if (kind === 'boss') {
      this.boss = true; this._set(id, Math.min(fade, MUSIC_RULES.bossSnap));
    } else {
      this.base = id;
      // an explore request during a live fight (play mode) only changes where we come back to
      if (!((this.combat || this.boss) && (mode === 'play' || mode === 'memecam'))) this._set(id, fade);
    }
    return id;
  }

  arenaLock(id) { this.arenas.add(id ?? 'arena'); }
  arenaClear(id) { if (this.arenas.delete(id ?? 'arena') || this.arenas.size === 0) this.sting = 'victory_fanfare'; }

  bossStart() { this.boss = true; this._set(this.level.boss, MUSIC_RULES.bossSnap); }
  bossDefeated() {
    this.boss = false; this.combat = false; this.forced = null; this.arenas.clear(); this.calmT = 0;
    this._set(null, 0.5); this.restorePending = true; this.sting = 'victory_fanfare';
  }

  /**
   * @param {number} dt
   * @param {{mode?: string, threat?: boolean, zone?: string|null}} s
   */
  tick(dt, { mode = 'play', threat = false, zone = null } = {}) {
    if (mode !== 'play' && mode !== 'memecam') return;
    if (this.restorePending && this.target == null && !this.boss) {
      this.restorePending = false;
      if (this.base) this._set(this.base, MUSIC_RULES.restoreFade);
    }
    if (this.boss) return;
    const fight = this.arenas.size > 0 || threat;
    if (fight) {
      this.calmT = 0;
      if (!this.combat) { this.combat = true; this._set(this.forced ?? this.level.combat, MUSIC_RULES.combatFade); }
      return;
    }
    if (this.combat) {
      this.calmT += dt;
      if (this.calmT >= MUSIC_RULES.calmDelay) {
        this.combat = false; this.forced = null; this.calmT = 0;
        this._set(zone ?? this.base, MUSIC_RULES.crossfade);
      }
      return;
    }
    const want = zone ?? this.base;
    if (zone !== this.zone) { this.zone = zone; if (this.target !== null || zone) this._set(want, MUSIC_RULES.crossfade); }
  }

  /** The pending change since the last take(): { track, fade, sting } or null. */
  take() {
    let out = null;
    if (this._taken !== this.version) { this._taken = this.version; out = { track: this.target, fade: this.fade, sting: null }; }
    if (this.sting) { out = out ?? { track: undefined, fade: 0, sting: null }; out.sting = this.sting; this.sting = null; }
    return out;
  }

  reset() {
    this.base = null; this.target = null; this.combat = false; this.boss = false; this.forced = null; this.calmT = 0;
    this.arenas.clear(); this.restorePending = false; this.sting = null; this.zone = null; this.version++;
  }
}

/** Every music file (manifest generation + U15 checks). */
export function musicFiles() { return Object.values(TRACKS).map((t) => t.file); }
