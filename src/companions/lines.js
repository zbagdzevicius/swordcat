// src/companions/lines.js  (owner: companions) — strings keys this area speaks (GAME_DESIGN §6.2 companion barks,
// §6.4 lost-kitten rescue lines) with the design text as a fallback until story's strings.js carries the keys
// (requested in requests/companions.md). Pure data.

/** Bark pools per speaker and trigger. Keys resolve through ctx.strings.t(). */
export const BARKS = {
  mochi: {
    ability: ['bark.mochi.ability.1', 'bark.mochi.ability.2'],
    combat: ['bark.mochi.combat.1', 'bark.mochi.combat.2'],
    kitten: ['bark.mochi.kitten'],
    idle: ['bark.mochi.idle'],
    caged: ['bark.mochi.caged.1', 'bark.mochi.caged.2'],
    hello: ['bark.mochi.ability.1'],
    // WA §8.4 / ON §6.1: Mochi in his carrier cheers each KO of the cart fight; ON §6.2: a normal hit tinks off the lock
    cheer: ['bark.mochi.cheer.1', 'bark.mochi.cheer.2', 'bark.mochi.cheer.3'],
    lock: ['bark.mochi.lock'],
  },
  sage: {
    ability: ['bark.sage.ability.1', 'bark.sage.ability.2'],
    combat: ['bark.sage.combat.1', 'bark.sage.combat.2'],
    kitten: ['bark.sage.kitten'],
    idle: ['bark.sage.idle'],
    caged: ['bark.sage.caged.1'],
    hello: ['bark.sage.hello'],
  },
  clover: {
    ability: ['bark.clover.ability.1', 'bark.clover.ability.2'],
    combat: ['bark.clover.combat.1', 'bark.clover.combat.2'],
    kitten: [],
    idle: ['bark.clover.idle'],
    caged: ['bark.clover.caged.1'],
    hello: ['bark.clover.hello'],
  },
  any: {
    nap: ['bark.companion.nap.1', 'bark.companion.nap.2'],
    wake: ['bark.companion.wake'],
    meow: ['bark.companion.mrrp'],
  },
};

/** Design text (§6.2 / §6.4) used when ctx.strings has no row for the key yet. */
export const FALLBACK = {
  'bark.mochi.ability.1': 'Squire on duty!',
  'bark.mochi.ability.2': "I'm not hiding, I'm BEING A WALL.",
  'bark.mochi.combat.1': 'Left! No, your other left!',
  'bark.mochi.combat.2': "I'm not scared! My tummy is scared. Separate thing.",
  'bark.mochi.kitten': 'Another one! Can we keep them all?',
  'bark.mochi.idle': 'Is it lunch? It feels like lunch.',
  'bark.mochi.caged.1': 'Over here! In the carrier! Hi!',
  'bark.mochi.caged.2': "I'd help, but I'm in a box.",
  'bark.sage.ability.1': 'Target. Down.',
  'bark.sage.ability.2': 'Volley.',
  'bark.sage.combat.1': 'Behind you. Obviously.',
  'bark.sage.combat.2': "That was... actually cool. Don't tell anyone I said that.",
  'bark.sage.kitten': 'Kitten nearby. I can smell the panic.',
  'bark.sage.idle': "I've counted forty hyenas. We have four kittens and a spoon.",
  'bark.clover.ability.1': 'Hold still, sweetpea. This purr is medicinal.',
  'bark.clover.ability.2': 'Mrrrr.',
  'bark.clover.combat.1': 'Who hurt you? Point.',
  'bark.clover.combat.2': "Not the face, she's growing into it!",
  'bark.clover.idle': 'Eat something. Knights need snacks.',
  'bark.companion.nap.1': 'Just... resting my eyes...',
  'bark.companion.nap.2': 'Zzz.',
  'bark.companion.wake': "I'm up! I'm up!",
  'bark.companion.mrrp': 'Mrrp!',
  // M2: caged squires call out at arena waves; swap greetings (§9.1); the swap toast
  'bark.sage.caged.1': "Up here. Yes, in the carrier. Don't laugh.",
  'bark.sage.hello': 'Ranger reporting. Quietly.',
  'bark.clover.caged.1': 'Psst. Sweetpea. A little help with this latch?',
  // WA §8.4 Mochi at the cart (ON §6.1–6.2)
  'bark.mochi.cheer.1': "Get 'em!",
  'bark.mochi.cheer.2': 'Ha! Bonked!',
  'bark.mochi.cheer.3': "You're SO small and SO good!",
  'bark.mochi.lock': "It's a tough one! Do the shiny swing!",
  'tut.bright': 'Hold [Attack] till it shines. Let go!',
  'tut.bright.touch': 'Hold ⚔ till it shines. Let go!',
  // wa_story §5 banter pairs (companion line, Clem's reply, sometimes a tag line)
  'banter.mochi.1': 'If we find a cheese wheel, can I ride it?',
  'banter.mochi.1.clem': 'Only downhill.',
  'banter.mochi.2': "When I'm a knight, my shield will have a face on it. MY face.",
  'banter.mochi.2.clem': '...Good face.',
  'banter.mochi.3': 'Do you think Pudding likes me? He hid behind a TWIG.',
  'banter.mochi.3.clem': 'He likes you. Twig was scary.',
  'banter.sage.1': "I've rated every cloud today. That one's a seven.",
  'banter.sage.1.clem': "That one's a dragon.",
  'banter.sage.1.end': '(...Hi.)',
  'banter.sage.2': "I don't cry at stories. My eyes just leak at the good parts.",
  'banter.sage.2.clem': 'Mine too.',
  'banter.sage.3': 'Forty hyenas. Four kittens. One spoon.',
  'banter.sage.3.clem': 'Two spoons.',
  'banter.clover.1': 'Did you eat breakfast? A knight needs breakfast.',
  'banter.clover.1.clem': 'I had a tuna snack.',
  'banter.clover.1.end': "That's a SNACK, sweetpea.",
  'banter.clover.2': "Bramble named the spiders. They're Kevin, Kevin and Susan.",
  'banter.clover.2.clem': 'Hello, Susan.',
  'banter.clover.3': "When this is over, I'm knitting you a scarf. A tiny one.",
  'banter.clover.3.clem': 'With a sword on it?',
  'bark.clover.hello': "Here I am, sweetpea. Snacks?",
  'toast.swap': '{name} is with you!',
  // §6.4: said when rescued (also their hub line)
  'kitten.biscuit': 'Is the cow gone? Is it? Okay. Hi.',
  'kitten.noodle': 'I was being a barrel. It was going well.',
  'kitten.button': 'You stood so still I thought you were a statue. I copied you!',
  'kitten.pickles': "The mushroom said I could stay. The mushroom didn't say anything. I was scared.",
  'kitten.pebble': 'You broke a ROCK. With a SWORD.',
  'kitten.sprout': 'They said I was too small to be worth cheese.',
  'kitten.waffles': "I can see the whole town from here! It's mostly rats.",
  'kitten.toffee': 'I climbed up and then I forgot how down works.',
  'kitten.muffin': "The bell's quiet. I don't like it quiet.",
  'kitten.tater': 'Pip said you\'d come. Pip says a lot of things.',
  'kitten.mittens': 'I bit one! On the tail! Gently!',
  'kitten.socks': "It's damp under here. I've been very brave about the damp.",
  'kitten.juniper': 'The lights in the water keep winking at me.',
  'kitten.bramble': 'There were spiders. I named them. Then I ran.',
  'kitten.fennel': 'Is the tower supposed to be sideways?',
  'kitten.bean': "The dogs aren't mean. They're just loud. Like Mochi.",
  'kitten.crumpet': 'The skeleton guard tells good jokes. Bad breath, though. He has no lungs.',
  'kitten.dumpling': "I'm not stuck. I'm guarding the banner.",
};

/**
 * wa_story §5 banter pairs per companion: `banter.<id>.<n>` (the companion), `.clem` (her earnest reply), `.end` (an
 * optional tag: the companion again, or Pudding off-screen in parentheses).
 */
export const BANTER = Object.freeze({
  mochi: Object.freeze(['banter.mochi.1', 'banter.mochi.2', 'banter.mochi.3']),
  sage: Object.freeze(['banter.sage.1', 'banter.sage.2', 'banter.sage.3']),
  clover: Object.freeze(['banter.clover.1', 'banter.clover.2', 'banter.clover.3']),
});

/**
 * Banter rule (WA §5.6, wa_story §5): a pair fires when no enemy has been alerted within `alertR` m of her for `calmFor`
 * s and the companion's idle bark is off cooldown (the bark gate's `gap`); never in combat; each pair once per level.
 * Lines show `lineDur` s each, one bubble at a time.
 */
export const BANTER_RULE = Object.freeze({ calmFor: 25, alertR: 20, lineDur: 2.6 });

/** The speaker sequence of a banter pair: [['c' | 'clem', key], ...] (keys that have no text are skipped by the player). */
export function banterLines(key, has = (k) => FALLBACK[k] != null) {
  const out = [['c', key], ['clem', key + '.clem']];
  if (has(key + '.end')) out.push(['c', key + '.end']);
  return out;
}

/**
 * The banter clock (pure; CompanionManager feeds it once per fixed step in play). `tick` returns the pair key that
 * should start now, or null. Calm time resets on any nearby alert and after a pair fires; `reset()` per level.
 */
export class BanterClock {
  constructor(rule = BANTER_RULE) { this.rule = rule; this.calmT = 0; this.used = new Set(); }
  /** New level: every pair is available again and the calm timer restarts. */
  reset() { this.calmT = 0; this.used.clear(); }
  /**
   * @param {number} dt @param {{ id: string|null, alertNear: boolean, barkReady: boolean, busy?: boolean }} s
   *   id: the speaking companion (null = no one free); alertNear: an alerted enemy within alertR; barkReady: the idle
   *   bark is off cooldown; busy: a pair is playing / a cutscene / a menu
   * @returns {string|null}
   */
  tick(dt, s) {
    if (s.alertNear || !s.id) { this.calmT = 0; return null; }
    if (s.busy) return null;
    this.calmT += dt;
    if (this.calmT < this.rule.calmFor || !s.barkReady) return null;
    const keys = BANTER[s.id];
    if (!keys?.length) return null;
    let key = null;
    for (const k of keys) if (!this.used.has(k)) { key = k; break; }
    if (!key) return null;
    this.used.add(key);
    this.calmT = 0;
    return key;
  }
}

/** Resolve a key through ctx.strings, falling back to the design text (never shows a raw key). */
export function lineText(ctx, key, vars) {
  const s = ctx?.strings;
  if (s?.has?.(key)) return s.t(key, vars);
  const f = FALLBACK[key];
  if (f == null) return s?.t ? s.t(key, vars) : key;
  return vars ? f.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : f;
}
