// src/enemies/clipMaps.js  (owner: enemies) — GAME_DESIGN §10.4 clip maps (pure data + tiny helpers; node-safe).
//
// A clip "spec" is either a clip name (string) or a sub-range of one clip:
//   { clip: 'Rat_Attack', from: 0, to: 0.4, speed: 'fit' }    from/to are fractions of the clip duration,
//   speed is a time scale, or 'fit' = stretch the range over the state's duration (windups follow the telegraph).
// Enemy types map ROLES (idle, walk, run, windup, strike, hit, death, + extras) to specs; per-attack overrides live
// under the attack id (Appendix B.3: `anims.hyena_slash.windup`). U11 checks every mapped clip exists in its GLB.
import * as THREE from 'three';

/** Rig → { files (GLBs sharing the clip set), roles }. Roles hold clip specs; `null` = no clip (procedural squash). */
export const CLIP_MAPS = {
  rat: {
    files: ['models/creatures/polypizza/Rat.glb'],
    roles: {
      idle: 'Rat_Idle', walk: 'Rat_Walk', run: 'Rat_Run',
      windup: { clip: 'Rat_Attack', from: 0, to: 0.4, speed: 'fit' },
      strike: { clip: 'Rat_Attack', from: 0.4, to: 1, speed: 1.5 },
      hit: null, death: 'Rat_Death', hop: 'Rat_Jump',
    },
  },
  pigeon: {                                   // Pigeon S13 (crow); Coo uses the S1 blob pigeon (companions)
    files: ['models/creatures/monsters-flying/Pigeon.glb'],
    roles: {
      idle: 'Flying_Idle', walk: 'Flying_Idle', run: 'Fast_Flying', fly: 'Fast_Flying', hover: 'Flying_Idle',
      windup: { clip: 'Flying_Idle', speed: 1.6 }, strike: 'Fast_Flying', peck: 'Headbutt',
      hit: 'HitReact', death: 'Death',
    },
  },
  spider: {
    files: ['models/creatures/polypizza/Spider.glb'],
    roles: {
      idle: 'Spider_Idle', walk: 'Spider_Walk', run: 'Spider_Walk',
      windup: { clip: 'Spider_Attack', from: 0, to: 0.4, speed: 'fit' }, strike: { clip: 'Spider_Attack', from: 0.4, to: 1, speed: 1.4 },
      hit: null, death: 'Spider_Death', hop: 'Spider_Jump',
    },
  },
  kaykit: {                                   // KayKit S3: hyena, stealer, pug, Brutus, Cacklejaw, Barkus, Tallbert
    files: ['models/characters/kaykit/Barbarian.glb', 'models/characters/kaykit/Knight.glb', 'models/characters/kaykit/Rogue_Hooded.glb'],
    roles: {
      idle: 'Idle', idle2H: '2H_Melee_Idle', walk: 'Walking_A', run: 'Running_A',
      windup: { clip: '1H_Melee_Attack_Chop', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Chop', from: 0.35, to: 1, speed: 1.3 },
      hit: 'Hit_A', death: 'Death_A', laugh: 'Cheer', cheer: 'Cheer', jeer: 'Cheer', gloat: 'Cheer',
      slash: '1H_Melee_Attack_Slice_Horizontal', stab: '1H_Melee_Attack_Stab', bash: 'Block_Attack', slam: '2H_Melee_Attack_Chop',
      chop: '1H_Melee_Attack_Chop', snatch: 'Dodge_Forward', guard: 'Blocking', guardHit: 'Block_Hit',
      slice2H: '2H_Melee_Attack_Slice', chop2H: '2H_Melee_Attack_Chop', spin: '2H_Melee_Attack_Spinning', throw: 'Throw',
      kick: 'Unarmed_Melee_Attack_Kick', sitDown: 'Sit_Floor_Down', sit: 'Sit_Floor_Idle', sitPose: 'Sit_Floor_Pose',
      kneel: 'PickUp', interact: 'Interact', pickUp: 'PickUp', walkBack: 'Walking_Backwards',
    },
  },
  skeleton: {                                 // KayKit S15 (Boneheads)
    files: ['models/creatures/skeletons/Skeleton_Minion.glb', 'models/creatures/skeletons/Skeleton_Warrior.glb',
      'models/creatures/skeletons/Skeleton_Rogue.glb', 'models/creatures/skeletons/Skeleton_Mage.glb'],
    roles: {
      idle: 'Idle_Combat', walk: 'Walking_D_Skeletons', run: 'Running_C',
      windup: { clip: '1H_Melee_Attack_Chop', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Chop', from: 0.35, to: 1, speed: 1.3 },
      stab: '1H_Melee_Attack_Stab', cast: 'Spellcast_Shoot', hit: 'Hit_A', death: 'Death_C_Skeletons',
      resurrect: 'Death_C_Skeletons_Resurrect', spawn: 'Spawn_Ground_Skeletons', guard: 'Blocking', guardHit: 'Block_Hit',
    },
  },
  dragon: {                                   // Dragon_Evolved S13 (Pudding; companions own the actor)
    files: ['models/creatures/monsters-flying/Dragon_Evolved.glb'],
    roles: { idle: 'Flying_Idle', run: 'Fast_Flying', strike: 'Headbutt', hit: 'HitReact', death: 'Death', yes: 'Yes', no: 'No' },
  },
  slime: {                                    // Gloomjelly fallback (§10.2: procedural first, Slime.glb fallback)
    files: ['models/creatures/polypizza/Slime.glb'],
    roles: {
      idle: 'Slime_Idle', walk: 'Slime_Walk', run: 'Slime_Walk',
      windup: { clip: 'Slime_Attack', from: 0, to: 0.4, speed: 'fit' }, strike: { clip: 'Slime_Attack', from: 0.4, to: 1, speed: 1.2 },
      hit: null, death: 'Slime_Death',
    },
  },
  bat: {                                      // [MVP+] Cellar Bat
    files: ['models/creatures/polypizza/Bat.glb'],
    roles: {
      idle: 'Bat_Flying', walk: 'Bat_Flying', run: 'Bat_Flying',
      windup: { clip: 'Bat_Attack', from: 0, to: 0.4, speed: 'fit' }, strike: { clip: 'Bat_Attack', from: 0.4, to: 1, speed: 1.2 },
      hit: 'Bat_Hit', death: 'Bat_Death',
    },
  },
  wasp: {                                     // [MVP+] Hornet Lancer
    files: ['models/creatures/polypizza/Wasp.glb'],
    roles: {
      idle: 'Wasp_Flying', walk: 'Wasp_Flying', run: 'Wasp_Flying',
      windup: { clip: 'Wasp_Attack', from: 0, to: 0.4, speed: 'fit' }, strike: { clip: 'Wasp_Attack', from: 0.4, to: 1, speed: 1.2 },
      hit: null, death: 'Wasp_Death',
    },
  },
  husky: {                                    // Husky S9 [MVP+] warhound
    files: ['models/creatures/animals/Husky.glb'],
    roles: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', windup: { clip: 'Idle_2_HeadLow', speed: 'fit' }, strike: 'Attack',
      hit: 'Idle_HitReact1', death: 'Death', eat: 'Eating',
    },
  },
};

/** Every clip name a role map references (strings and `{clip}` specs, recursing into per-attack overrides). */
export function clipNames(roles, out = new Set()) {
  for (const v of Object.values(roles ?? {})) {
    if (!v) continue;
    if (typeof v === 'string') out.add(v);
    else if (typeof v === 'object' && typeof v.clip === 'string') out.add(v.clip);
    else if (typeof v === 'object') clipNames(v, out);
  }
  return out;
}

/** Action key for a spec ('Rat_Attack[0-0.4]' for sub-ranges, the clip name otherwise; null for none). */
export function clipKey(spec) {
  if (!spec) return null;
  if (typeof spec === 'string') return spec;
  if (spec.from == null && spec.to == null) return spec.clip;
  return `${spec.clip}[${spec.from ?? 0}-${spec.to ?? 1}]`;
}

/** Is `v` a clip spec (string or {clip}) rather than a nested per-attack role map? */
export function isSpec(v) { return typeof v === 'string' || (v != null && typeof v === 'object' && typeof v.clip === 'string'); }

const _subCache = new WeakMap();

/** Sub-range of `clip` as its own AnimationClip (AnimationUtils.subclip; cached per source clip). */
export function subclip(clip, from = 0, to = 1, fps = 60) {
  let m = _subCache.get(clip);
  if (!m) _subCache.set(clip, (m = new Map()));
  const key = `${from}-${to}`;
  let c = m.get(key);
  if (!c) {
    const frames = Math.max(1, Math.round(clip.duration * fps));
    const a = Math.max(0, Math.floor(from * frames)), b = Math.min(frames, Math.max(a + 1, Math.ceil(to * frames)));
    c = THREE.AnimationUtils.subclip(clip, clipKey({ clip: clip.name, from, to }), a, b + 1, fps);
    if (!(c.duration > 0)) c.duration = Math.max(1 / fps, (b - a) / fps);
    m.set(key, c);
  }
  return c;
}

/**
 * The GLB's clips plus every sub-range clip the role map needs (Animator gets them all as actions).
 * @param {Record<string, any>} roles @param {THREE.AnimationClip[]} animations
 */
export function clipsFor(roles, animations = []) {
  const byName = new Map(animations.map((c) => [c.name, c]));
  const out = [...animations];
  const seen = new Set();
  const visit = (r) => {
    for (const v of Object.values(r ?? {})) {
      if (!v || typeof v !== 'object') continue;
      if (typeof v.clip === 'string') {
        if (v.from == null && v.to == null) continue;
        const key = clipKey(v), src = byName.get(v.clip);
        if (src && !seen.has(key)) { seen.add(key); out.push(subclip(src, v.from ?? 0, v.to ?? 1)); }
      } else visit(v);
    }
  };
  visit(roles);
  return out;
}

/** Duration (s) of the spec's range in `animations` (0 if unknown). */
export function specDuration(spec, animations) {
  if (!spec) return 0;
  const name = typeof spec === 'string' ? spec : spec.clip;
  const c = animations?.find?.((a) => a.name === name);
  if (!c) return 0;
  if (typeof spec === 'string') return c.duration;
  return c.duration * ((spec.to ?? 1) - (spec.from ?? 0));
}

/** Rig whose files include `path` (null if none). */
export function rigFor(path) {
  for (const [name, r] of Object.entries(CLIP_MAPS)) if (r.files.includes(path)) return name;
  return null;
}
