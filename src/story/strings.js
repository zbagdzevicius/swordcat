// src/story/strings.js  (owner: story) — EVERY line of display text in the game (GAME_DESIGN §4.4, §5, §6, §14), plus
// the resolver exposed as ctx.strings.t(key, vars) / has(key) / S.
//
// Format (§19.6): S[key] = { default: '...' }. There are no alternate caption variants: every row has its default
// text only (Token Tails pass, 2026-10-13; see docs/PROVENANCE.md).
// Keys: cutscene lines are `<sceneId>.<n>` (cs03.1 …); barks `bark.<speaker>.<trigger>[.n]`; boss barks keep the short
// `<boss>.<beat>` keys the enemy data uses (B.4: 'barkus.p2'); lost-kitten lines `kitten.<id>`; names `name.<id>`.
// `{name}` placeholders are filled from `vars`. Missing keys return the key itself (never throws).
// Pure data + pure functions: node-safe, no DOM; the only import is core/brand.js (pure data).
// Brand (TOKENTAILS-PLAN §10.4 / §10.5): the title, the Rescue House name and the four Pink Paw kitten names come from
// BRAND, so a rename is one edit there. Other packages register their own rows with `addStrings(table)`
// (G2's strings.onboarding.js). Rows marked `// claim:fiction` invent a story; they state nothing about a real cat.
import { BRAND, brandKittenName } from '../core/brand.js';

/** §1: the title comes from core/brand.js so a rename is one edit there. */
export const GAME_TITLE = BRAND.titleCaps;
export const GAME_SUBTITLE = BRAND.subtitle;

const d = (text) => ({ default: text });

/** @type {Record<string, {default: string}>} */
export const S = {
  // ================================================================== title, chapters, regions (§1, §4.2, §4.4, §14.3)
  'game.title': d(GAME_TITLE),
  'game.subtitle': d(GAME_SUBTITLE),
  'title.press': d('Press any key to play!'),
  'title.tap': d('Tap to play!'),
  'title.prompt': d('Press any key to play!'),
  'title.foot': d('A Token Tails game'),
  'title.tagline': d(BRAND.tagline),
  'title.skipPractice': d('Skip practice'),
  'title.settings': d('Settings'),
  'ch.label': d('Chapter {n}'),
  'ch.label.prologue': d('Prologue'),
  'ch.label.epilogue': d('Epilogue'),
  'ch.prologue': d('Knighting Morning'),
  'ch.1': d('Small Paws, Big Sword'),
  'ch.2': d('The Big Cheese'),
  'ch.3': d('Lanterns On, Pawsbury!'),
  'ch.4': d('Where I Stand'),
  'ch.5': d('The Crooked Bow'),
  'ch.6': d('Sunny Steps for Everyone'),
  'ch.epilogue': d('Dame Clementine of Pawsbury'),
  'region.meadow': d('Purrdale Meadows'),
  'region.forest': d('Whiskerwood'),
  'region.town': d('Pawsbury'),
  'region.gate': d('Bramble Gate'),
  'region.bog': d('Glimmerbog'),
  'region.keep': d('Houndhold Keep'),
  'region.sky': d('Above the Clouds'),
  'region.rescueHouse': d(BRAND.rescueHouse),

  // ================================================================== speaker names (dialogue ribbon)
  'name.swordcat': d('Clem'),
  'name.clementine': d('Clementine'),
  'name.pearl': d('Pearl'),
  'name.marmalade': d('Sir Marmalade'),
  'name.snowpaw': d('Princess Snowpaw'),
  'name.whiskerbottom': d('Sgt. Whiskerbottom'),
  'name.mochi': d('Mochi'),
  'name.sage': d('Sage'),
  'name.clover': d('Clover'),
  'name.tofu': d('Tofu'),
  'name.earlgrey': d('Earl Grey'),
  'name.pip': d('Pip'),
  'name.pudding': d('Pudding'),
  'name.dragon': d('Very Big Dragon'),
  'name.coo': d('Coo'),
  'name.snoozalot': d('Sir Snoozalot'),
  'name.cacklejaw': d('Big Chief Cacklejaw'),
  'name.pilfer': d('Pilfer'),
  'name.stealer': d('Snack Snatcher'),
  'name.grizzlechop': d('Captain Grizzlechop'),
  'name.brutus': d('Sir Brutus'),
  'name.barkus': d('Lord Barkus'),
  'name.squire': d('Squire'),
  'name.squires': d('Squires'),
  'name.kittens': d('Kittens'),
  'name.villager': d('Villager'),
  'name.hyena': d('Hyena'),
  'name.rat': d('Rat'),
  'name.biscuit': d('Biscuit'), 'name.noodle': d('Noodle'), 'name.button': d('Button'),
  'name.pickles': d(brandKittenName('pickles')), 'name.pebble': d(brandKittenName('pebble')), 'name.sprout': d('Sprout'),
  'name.waffles': d('Waffles'), 'name.toffee': d('Toffee'), 'name.muffin': d(brandKittenName('muffin')),
  'name.tater': d('Tater'), 'name.mittens': d('Mittens'), 'name.socks': d(brandKittenName('socks')),
  'name.juniper': d('Juniper'), 'name.bramble': d('Bramble'), 'name.fennel': d('Fennel'),
  'name.bean': d('Bean'), 'name.crumpet': d('Crumpet'), 'name.dumpling': d('Dumpling'),
  'name.cow': d('Very Suspicious Cow'),
  'name.wobble': d('Sir Wobble'),
  'name.sacky': d('Sir Sacky'),
  'name.ttcat': d('Token Tails Cat'),

  // ================================================================== CS-00 Title Loop
  // (no lines; the logo + prompt are 'game.title' / 'game.subtitle' / 'title.prompt')

  // ================================================================== CS-01 One Ear-Tuft Short (the height chart) + CS-01b Suit Up
  'cs01.1': d('Tall enough! Next!'),
  'cs01.2': d('Tall enough! Next!'),
  'cs01.3': d('Just under the line, Clementine. One ear-tuft short. Next year!'),
  'cs01.4': d('I was one ear-tuft short LAST year.'),
  'cs01.5': d('And very consistent about it! Next!'),
  'cs01.6': d('Hey. You bonked that dummy SO hard.'),
  'cs01.7': d('...I really did.'),
  'cs01.8': d('Tomorrow I\'m front row. I made a sign!'),
  'cs01.chest': d('M. — my first'),
  'cs01.helm': d('Nope.'),
  'cs01b.card': d('Chapter 1 — Small Paws, Big Sword'),
  'cs01.10': d('...Borrowing this.'),

  // ================================================================== Morning Practice (WA §7, ON §4; post-prologue hints §6.6)
  // CONTROLS_SPEC §14: the iso controls. Base = KBM `hybrid` (TOKENTAILS-PLAN §11.2: WASD walks, LMB attacks, RMB / Q
  // = the Stand, Space = jump); `.pad` / `.touch` variants are picked by ui's tx() for the active device; [Token] glyphs
  // resolve through the active bindings.
  'tut.move': d('Walk with [Move].'),
  'tut.move.pad': d('Walk with [LS].'),
  'tut.move.touch': d('Tap the ground to walk.'),
  'tut.jump': d('Hop the fence! [Jump]'),
  'tut.jump.touch': d('Hop the fence! Tap [Jump].'),
  'tut.roll': d('Roll past Sir Sacky! [Tumble]'),
  'tut.roll.pad': d('Roll past Sir Sacky! [Tumble]'),
  'tut.roll.touch': d('Swipe to roll past Sir Sacky!'),
  'tut.stand': d('Hold [Stand] to block!'),
  'tut.stand.touch': d('Hold 🛡 to block!'),
  'tut.parry': d('Tap [Stand] when you see the shield!'),
  'tut.parry.touch': d('Tap 🛡 when you see the shield!'),
  'tut.bright': d('Hold [Attack] till it shines. Let go!'),
  'tut.bright.touch': d('Hold ⚔ till it shines. Let go!'),
  'tut.meow': d('Find Pearl! Meow [Meow].'),
  'tut.meow.touch': d('Find Pearl! Tap the cat face.'),
  'tut.pearl1': d('Found me! Okay, okay, you\'re good.'),
  'tut.pearl2': d('...You\'re getting REALLY good, Clem.'),
  'tut.pearl.anyway': d('Found me anyway! Hee hee.'),
  'tut.riposte': d('Parried! [Attack] now for a Riposte.'),
  'tut.riposte.touch': d('Parried! Tap ⚔ now for a Riposte.'),
  'tut.riposte.auto': d('Parried! She ripostes all by herself.'),
  'tut.pounce': d('Jump, then [Attack] in the air: Pounce!'),
  'tut.pounce.pad': d('Jump, then [Attack] in the air: Pounce!'),
  'tut.pounce.touch': d('Jump, then ⚔ in the air: Pounce!'),
  'tut.reflect': d('Parry the bolt to send it back!'),
  'tut.milk': d('Low hearts! Grab a tuna snack [Snack].'),
  'tut.milk.touch': d('Low hearts! Tap the tuna snack.'),
  'tut.vigil': d('Lantern Stone: [Interact] to rest and save.'),
  'tut.vigil.pad': d('Lantern Stone: [Interact] to rest and save.'),
  'tut.vigil.touch': d('Tap the Lantern Stone: rest and save.'),
  'tut.valor': d('Hold [Stand] near foes to fill Valor.'),
  'tut.companion': d('[Ability]: your friend\'s special move!'),
  'tut.companion.pad': d('[Ability]: your friend\'s special move!'),
  'tut.companion.touch': d('Tap your friend\'s portrait: special move!'),
  'tut.holy': d('Got Valor? Hold [Attack] for gold!'),
  'tut.holy.touch': d('Got Valor? Hold ⚔ for gold!'),
  'tut.fizzle': d('Needs more Valor! Stand near foes.'),
  'tut.golden': d('Full Valor? Golden Hour: [Golden]!'),
  'tut.golden.pad': d('Full Valor? Golden Hour: [Golden]!'),
  'tut.golden.touch': d('Tap the golden sun at full Valor.'),
  'tut.line': d('Hold the Line! Guard the winch!'),
  'tut.jeer': d('Giggles? Hold [Stand] to shrug off!'),
  'tut.pug': d('Shield pup? Go around, or shine!'),
  'tut.bones': d('Squeakybones! Bonk the pile, hard!'),
  'tut.target': d('Click a foe: she charges in!'),
  'tut.target.pad': d('[R3] picks the nearest foe.'),
  'tut.target.touch': d('Tap a foe: she charges in!'),
  'tut.zoom': d('Scroll to zoom.'),
  'tut.zoom.pad': d('[Zoom] to zoom.'),
  'tut.zoom.touch': d('Pinch to zoom.'),
  'tut.click': d('[Move] the ground: she walks there!'),
  'tut.click.touch': d('Tap anywhere: she walks there!'),
  'tut.talk': d('Click a friend to chat.'),
  'tut.talk.pad': d('[Interact] to chat with a friend.'),
  'tut.talk.touch': d('Tap a friend to chat.'),
  'tut.rotate': d('Plays best sideways.'),
  'toast.cam.locked': d('Camera locked.'),
  'toast.cam.unlocked': d('Camera free: mouse to the edge. [Y]'),
  'toast.cam.fitHold': d('The camera keeps foes in view'),
  'tut.title': d('Morning Practice'),
  'tut.step': d('{n}/{total}'),
  'tut.skip': d('Hold [Esc] or [P] to skip practice'),
  'tut.skip.pad': d('Hold [Start] to skip practice'),
  'tut.skip.touch': d('Hold ❚❚ to skip practice'),
  'tut.done': d('Practice: paw-some!'),
  'tut.skipped': d('Practice skipped. To the bell!'),
  'tut.bonk': d('Bonk the dummy! [Attack]'),
  'tut.bonk.pad': d('[Attack] to bonk!'),
  'tut.bonk.touch': d('Tap the dummy. Bonk!'),
  'tut.red': d('Arrows on the ground? Roll away!'),
  'tut.aoe': d('Dots in a circle? Step out!'),
  'tut.gold': d('Gold star? Parry it: big stun!'),
  'pearl.start': d('Knighting Day is TOMORROW! Practice time!'),
  'pearl.race': d('Race you to the dummy!'),
  'pearl.bonk': d('Bonk it! Bonk it good!'),
  'pearl.fence': d('Over here! Hop!'),
  'pearl.sack': d("Don't get bonked by Sir Sacky!"),
  'pearl.roll.ok': d('Whoa! Nothing can touch you mid-roll!'),
  'pearl.wobble': d('Sir Wobble wants a fight! Block him!'),
  'pearl.parry': d('Sneaky one! Tap it right on the sparkle!'),
  'pearl.parry.letgo': d('Let go, then tap it right on the sparkle!'),
  'pearl.parry.ok': d("PARRY! He didn't see that coming!"),
  'pearl.hide': d('Hide and seek! Count to three!'),
  'pearl.bell': d("The bell! It's measuring time! Come ON!"),
  'pearl.stuck': d('Psst! Like this!'),
  'tutbow.1': d('There! Now you look like a REAL hero.'),
  'tutbow.2': d('I already was one.'),
  'tutbow.3': d('Obviously.'),
  'tut.cow.1': d('Moo. (...Nice jump, Clem!)'),
  'tut.cow.2': d("MOO. (Ooh, you're getting warmer!)"),
  'tut.cow.3': d('Moooo! (I mean. Moo. Normally.)'),
  'mochi.hint.pounce': d('Ooh, do the jumpy one!'),
  'mochi.hint.reflect': d('Bonk it back at them!'),
  'mochi.hint.milk': d('Snack break! Quick!'),
  'mochi.hint.valor': d('Stand tall. Well, tall-ish.'),
  'mochi.hint.companion': d('My turn! Press it!'),
  'mochi.hint.vigil': d('Nap stone! Best stone.'),
  'mochi.hint.click': d('Point and she goes! Neat!'),
  'mochi.hint.jeer': d("Don't listen to him!"),
  'mochi.hint.bright': d('Hold the swing till it shines!'),
  'mochi.hint.fizzle': d('Pfft! Needs more Valor first!'),
  'offer.kitten.q': d('Want gentler bonks? You can switch anytime.'),
  'offer.kitten.yes': d('Yes please'),
  'offer.kitten.no': d('I got this'),
  'offer.kitten.toast': d('Kitten mode: gentle hits, wider parries.'),
  'sticker.bonk': d('First Bonk!'),
  'sticker.bow': d('Pink Bow!'),
  'sticker.hop': d('Fence Hopper'),
  'sticker.roll': d('Tumble Pro'),
  'sticker.stand': d('Stand Strong'),
  'sticker.parry': d('Perfect Parry!'),
  'sticker.found': d('Found You!'),
  'sticker.knight': d('Knight-ish!'),
  'sticker.mochi': d('New Friend: Mochi'),
  'sticker.book': d('Sticker book'),
  'card.holy.title': d('Holy Slash!'),
  'card.holy.line': d("Fill Valor, hold [Attack] till you glow, let go. Sunshine in a sword."),
  'card.golden.title': d('Golden Hour!'),
  'card.golden.line': d('Full Valor? [Golden]! Everything sparkles. Including you.'),
  'card.mochi.title': d('Mochi joined the party!'),
  'card.mochi.line': d("Shield Wall: [Ability] or his portrait, and he'll hold the line."),
  'card.sage.title': d('Sage joined!'),
  'card.sage.line': d('Swap buddies at any Lantern Stone.'),
  'card.clover.title': d('Clover joined!'),
  'card.clover.line': d("Three's a party."),
  'card.heartbell.title': d('Heart Bell!'),
  'card.heartbell.line': d('One more heart. Ding!'),
  'card.kitten.title': d('Kitten found! {n}/{max}'),
  'card.kitten.line.1': d('Off home you go!'),
  'card.kitten.line.2': d('Safe and snuggly.'),
  'card.kitten.line.3': d('One more for the nap pile.'),
  'card.shard.title': d('Dawnstone shard!'),
  'card.shard.line': d("It's warm. Like a sunny windowsill."),
  'card.bow.title': d('Pink Bow!'),
  'card.bow.line': d('Tied by Pearl. Extra brave.'),
  'card.knight.title': d('Knight-ish!'),
  'card.knight.line': d('Borrowed armour. Real courage.'),

  // ================================================================== G-01 Sir Tallbert
  'g01.1': d('...Hello.'),

  // ================================================================== CS-02 The Giggling Mist (WA15; never removed, tightened behind STORY.cs02Cut)
  'cs02.1': d('CLEM! Follow the letters!'),
  'cs02.2': d('A kitten! With a SWORD! And a little BOW!'),
  'cs02.3': d("HAHAHA— no, stop, I can't— leave it. LEAVE it! It isn't even a threat!"),
  'cs02.4': d('Mine.'),
  'cs02.5': d('Also mine.'),
  'cs02.6': d('...Okay. Hold on, Pearl. I\'m coming.'),
  'cs02.7': d('First... armour.'),
  'cs02.sign': d('HELP (please)'),

  // ================================================================== CS-03 Snack Break (never cut)
  'cs03.1': d('Day one of rescuing everyone. Morale: high.'),
  'cs03.2': d('Snacks: also high.'),
  'cs03.3': d('ROOOAAR. (Is that... a tuna snack?)'),
  'cs03.4': d('...It is.'),
  'cs03.5': d('RRrrr. (I haven\'t had a snack since Tuesday.)'),
  'cs03.5b': d('(The giggly dogs scared me out of my cave.)'),
  'cs03.6': d('Why are you tied up?'),
  'cs03.7': d('(...They also had a net.)'),
  'cs03.8': d('Here.'),
  'cs03.9': d("(...It's very good.)"),
  'cs03.10': d("What's your name?"),
  'cs03.11': d('(Pudding.)'),
  'cs03.12': d("ROAR! (Sorry! Sorry. I roar when I'm nervous.)"),
  'cs03.13': d("Hold still. I'll cut you loose."),
  'cs03b.1': d("(I'll... follow. From a distance. A safe distance.)"),

  // ================================================================== D-01 Mochi Joins
  'd01.1': d('Squire Mochi, reporting! ...Almost-squire. Too clumsy, they said.'),
  'd01.2': d('Too small, they said.'),
  'd01.3': d('Then we\'re the Almost Knights!'),
  'd01.4': d("I'll do the shield. You do the... pointy part."),
  'toast.mochi': d('Mochi joined the party! [Ability] Shield Wall'),
  'bark.mochi.cheer.1': d("Get 'em!"),
  'bark.mochi.cheer.2': d('Ha! Bonked!'),
  'bark.mochi.cheer.3': d("You're SO small and SO good!"),

  // wa_story §5 companion banter pairs (companions/lines.js BANTER; .clem = her reply, .end = optional tag)
  'banter.mochi.1': d('If we find a cheese wheel, can I ride it?'),
  'banter.mochi.1.clem': d('Only downhill.'),
  'banter.mochi.2': d("When I'm a knight, my shield will have a face on it. MY face."),
  'banter.mochi.2.clem': d('...Good face.'),
  'banter.mochi.3': d('Do you think Pudding likes me? He hid behind a TWIG.'),
  'banter.mochi.3.clem': d('He likes you. Twig was scary.'),
  'banter.sage.1': d("I've rated every cloud today. That one's a seven."),
  'banter.sage.1.clem': d("That one's a dragon."),
  'banter.sage.1.end': d('(...Hi.)'),
  'banter.sage.2': d("I don't cry at stories. My eyes just leak at the good parts."),
  'banter.sage.2.clem': d('Mine too.'),
  'banter.sage.3': d('Forty hyenas. Four kittens. One spoon.'),
  'banter.sage.3.clem': d('Two spoons.'),
  'banter.clover.1': d('Did you eat breakfast? A knight needs breakfast.'),
  'banter.clover.1.clem': d('I had a tuna snack.'),
  'banter.clover.1.end': d("That's a SNACK, sweetpea."),
  'banter.clover.2': d("Bramble named the spiders. They're Kevin, Kevin and Susan."),
  'banter.clover.2.clem': d('Hello, Susan.'),
  'banter.clover.3': d("When this is over, I'm knitting you a scarf. A tiny one."),
  'banter.clover.3.clem': d('With a sword on it?'),

  // ================================================================== D-02 Sage Joins
  'd02.1': d('Thanks for the landing.'),
  'd02.2': d('Mrrf.'),
  'd02.3': d("You're the one with the sword bigger than you."),
  'd02.4': d('Yes.'),
  'd02.5': d('...Fair.'),
  'toast.sage': d('Sage joined! Swap kittens at any Lantern Stone.'),

  // ================================================================== CS-04 Lantern Night
  'cs04.1': d("Can I ask something? Why you? You're the smallest of us."),
  'cs04.2': d('Because I was there.'),
  'cs04.3': d("I'm not brave. I'm just... here."),
  'cs04.4': d("That's what brave is, I think. Being scared and being here."),
  'cs04.5': d("...Don't tell anyone I cried."),

  // ================================================================== CS-05 First Light
  'cs05.1': d('I yield! I YIELD! Mind the cheese!'),
  'cs05.2': d('Take the shiny rock! Lord Barkus paid us in cheese to slow you down.'),
  'cs05.2b': d('We expected someone... taller.'),
  'cs05.3': d('The kittens went to Pawsbury. The Woof Brigade moved in!'),
  'cs05.3b': d('They don\'t even wipe their paws!'),
  'cs05.4': d("Then I'm going home."),
  'cs05.5': d('Want a tuna snack? For the cheese.'),
  'cs05.6': d('Tuna... AND cheese? That\'s a whole *feast*.'),
  'toast.friend': d('New friend: {name}!'),
  'toast.holy': d('Holy Slash learned! Fill Valor, then hold [Attack] till gold.'),

  // ================================================================== D-03 On Loan
  'd03.1': d('Clem? Is that... my armour?'),
  'd03.2': d("...It's borrowed."),
  'd03.3': d('Is it now.'),
  'd03.4': d("That armour's on loan, then. Bring it back with a story in it."),
  'd03.5': d("Pilfer, the Snack Snatcher, nabbed the Royal Post! Get it back, would you? My knees don't run anymore."),

  // ================================================================== CS-06 The Letters
  'cs06.1': d("'To the Knights of the Order of Nine Lives. Please come home. The gate needs holding. — Snowpaw.'"),
  'cs06.2': d('Eight of these. None delivered.'),
  'cs06.3': d('They never got them. Nobody came because nobody knew.'),
  'cs06.4': d('Then we tell them.'),
  'cs06.5': d('Coo.'),
  'cs06.6': d('Every knight. Fast as you can.'),
  'cs06.7': d('Coo.'),

  // ================================================================== D-04 Rescues in town
  'd04.tofu.1': d('Is it over? ...Is that a sword or a door?'),
  'd04.tofu.2': d('A sword.'),
  'd04.tofu.3': d('Huh. Want it sharper? I can barely lift it, but I can sharpen it.'),
  'd04.earlgrey.1': d('Do you MIND? I was nearly at the good chapter.'),
  'd04.earlgrey.2': d('...Oh. You\'re rescuing me. How embarrassing. Carry on.'),
  'd04.clover.1': d("Well, aren't you a tiny thing in a big tin."),
  'd04.clover.2': d('Somebody has to keep you lot alive. Hold still, sweetpea.'),
  'toast.clover': d('Clover joined!'),

  // ================================================================== CS-07 The Red Cape
  'cs07.1': d('You chased off the Woof Brigade. All of them. By yourself?'),
  'cs07.2': d('With friends.'),
  'cs07.3': d('Mostly her.'),
  'cs07.4': d('The Royal Wardrobe has nothing your size. Except this.'),
  'cs07.5': d('It was a tablecloth. Velvet, mostly.'),
  'cs07.6': d('...Thank you, Your Highness.'),
  'cs07.7': d("The Dawnstone's in three pieces now. You've got one in that sword."),
  'cs07.8': d("The rats say the hyenas have the second. They'll come for the town, through the Bramble Gate."),
  'cs07.9': d("Then I'll be at the gate."),
  'toast.free': d('Pawsbury is awake! Lanterns on!'),
  'toast.shops': d('Shops are open.'),
  'toast.hub': d(`${BRAND.rescueHouse}: kittens you rescue live here.`),

  // ================================================================== D-06 Pip Joins
  'd06.1': d('Took you long enough. I was waiting for dramatic effect.'),
  'd06.2': d("That pin they pinched? I know who's got it. Leave him to me."),

  // ================================================================== CS-08 Nobody's Coming (never cut)
  'cs08.1': d("Nobody's coming."),
  'cs08.2': d("So I'm staying."),
  'cs08.3': d('Nobody? Excuse me. We are SOMEBODY.'),
  'cs08.4': d('I brought a spoon!'),
  'cs08.5': d('I brought two!'),
  'cs08.6': d('...Thank you.'),

  // ================================================================== G-02 Marmalade's Leap
  'g02.1': d('OOF!'),

  // ================================================================== CS-09 Last Laugh
  'cs09.1': d('Get her! ALL OF YOU! Everybody CHARGE!'),
  'cs09.2': d('ROOOOAR! (NOT. MY. FRIENDS.)'),
  'cs09.3': d('They used to laugh at me. The runt. So I laughed first. Always first.'),
  'cs09.4': d("You can stop now. I'll hold it for a bit."),
  'cs09.5': d("...You're very strange."),
  'cs09.6': d('I know.'),
  'cs09.7': d('...Hee.'),
  'cs09.8': d('Did you just... laugh? WITH me?'),
  'cs09.9': d('LADS! She laughed WITH me! Best day EVER!'),
  'toast.golden': d('Golden Hour unlocked! At full Valor: [Golden]'),

  // ================================================================== CS-10 Eighth Life
  'cs10.1': d("Where's Sir Marmalade?"),
  'cs10.2': d('Eighth life. Used it up. Best catch of my career.'),
  'cs10.3': d('...Seven months old. Look at that handwriting.'),
  'cs10.4': d("Doctor says bed and soup. You'll have to finish this one, Dame—"),
  'cs10.5': d("I'm not a dame."),
  'cs10.6': d('...Yet.'),
  'cs10.7': d('That\'s Barkus, pulling the curtains on the whole island.'),
  'cs10.7b': d('Last shard\'s on his collar. Houndhold Keep, past the Glimmerbog.'),
  'cs10.8': d('And the ferry dock is where they send the kittens. To scratch dog ears. All day. In shifts.'),
  'cs10.9': d('Pearl.'),

  // ================================================================== M2 in-level beats (§12.4–§12.6), quest log, letter card
  'gate.yard.1': d("The Snickerpack's coming up the south road. And the portcullis winch is jammed. Some hyena pinched the pin."),
  'gate.yard.2': d('I can fashion a new pin. Give me four minutes, and nobody near the winch.'),
  'gate.yard.3': d('Four minutes. Nobody near the winch.'),
  'gate.yard.4': d('Scout the Hyena Toy Fort first. They keep kitten carriers on a snack wagon there.'),
  'gate.back': d('Back to the Line!'),
  'gate.pin.back': d("Stole it back. You're welcome."),
  'gate.open.1': d('The gate works! Come inside, Clem!'),
  'gate.open.2': d('Not yet.'),
  'toast.pip': d('Pip is back at the gatehouse.'),
  'toast.results': d('Hooray! Chapter clear!'),
  'letter.card.label': d('A yellowed letter'),
  'quest.label': d('Quest'),
  'quest.prologue': d('Morning Practice'),
  'quest.prologue.chart': d('Race Pearl to the height chart!'),
  'quest.prologue.suit': d('Borrow armour from the barn!'),
  'quest.boss': d('Bonk the big bully!'),
  'quest.boss.grizzlechop': d('Bonk Captain Grizzlechop!'),
  'quest.boss.cacklejaw': d('Bonk Big Chief Cacklejaw!'),
  'quest.boss.brutus': d('Stand up to Sir Brutus!'),
  'quest.boss.barkus': d('Bonk Lord Barkus!'),
  'quest.meadow.follow': d('Follow the trail of letters'),
  'quest.meadow.pudding': d('Free the dragon in the Picnic Glade'),
  'quest.meadow.mochi': d('Help Mochi out of the tipped cart'),
  'quest.meadow.exit': d('Follow the cart tracks into Whiskerwood'),
  'quest.forest.sage': d('Follow the rat supply trail'),
  'quest.forest.camp': d('Make camp in the clearing'),
  'quest.forest.mill': d('Crash the Cheese Mill party'),
  'quest.forest.exit': d('Go home to Pawsbury'),
  'quest.town.bakery': d('Light Lantern Alley and find the bakery'),
  'quest.town.chase': d('Catch Pilfer, the Snack Snatcher'),
  'quest.town.rescue': d('Free the town: the forge and the market square'),
  'quest.town.steps': d('Go to the Castle Steps'),
  'quest.hub.gate': d('Hold the Bramble Gate'),
  'quest.gate.scout': d('Scout the Hyena Toy Fort'),
  'quest.gate.line': d('Hold the gate!'),
  'quest.gate.boss': d('Bonk Big Chief Cacklejaw'),
  'quest.hub.bog': d('Across the Glimmerbog: find Pearl!'),
  'quest.bog.pearl': d('Find Pearl at the ferry dock'),
  'quest.keep.gate': d('Knock on Houndhold Keep (loudly)'),
  'quest.keep.boss': d('Climb to Barkus\'s sunny spot'),
  'quest.ending': d('Ring the Sunbell'),
  'quest.done': d('Purrhaven Isle is sunny again!'),

  // ================================================================== CS-11 The Bow
  'cs11.1': d('You came!'),
  'cs11.2': d("Of course. I'm a knight."),
  'cs11.3': d('Since when?'),
  'cs11.4': d('...Since now.'),
  'cs11.5': d("Hold still. Your bow's crooked. You can't save an island with a crooked bow."),
  'cs11.6': d("It's been a long week."),
  'cs11.7': d("I know. You're doing good."),
  'cs11.8': d("I'll go home and tell everyone. Go get them, Clem."),

  // ================================================================== CS-12 Get On
  'cs12.1': d('(Get on. Before I change my mind.)'),
  'cs12.2': d("(I'm not scared. I'm not scared. I'm a little scared.)"),
  'cs12.3': d('Me too.'),

  // ================================================================== CS-13 Dragonfire Gate
  'cs13.1': d('ROAR! (Sorry!)'),
  'cs13.2': d('(...No. Not sorry.)'),
  'cs13.3': d("(I'm going back for the others. Everyone wanted to come. EVERYONE.)"),
  'cs13.4': d('Be careful.'),
  'cs13.5': d("(I'm a DRAGON.)"),
  'cs13.6': d("(...I'll be careful.)"),

  // ================================================================== CS-14 The Champion Kneels
  'cs14.1': d("I don't fight from up there. Down here, we're equals."),
  'cs14.2': d('I watched you at the gate. You never stepped back once.'),
  'cs14.3': d("I couldn't. The gate was behind me."),
  'cs14.4': d('And now?'),
  'cs14.5': d('Now the kittens are.'),
  'cs14.6': d('Then we understand each other.'),

  // ================================================================== D-05 Brutus Yields
  'd05.1': d('...You stood.'),
  'd05.2': d('Hold your gate, little knight.'),

  // ================================================================== CS-15 Nine Lives (never cut)
  'cs15.1': d('Shoo! SHOO, little thing!'),
  'cs15.2': d('Why won\'t you SHOO?'),
  'cs15.3': d('Not strong yet. Still here.'),
  'cs15.4': d('GO, CLEM!'),
  'cs15.5': d('CLEMENTINE! CLEMENTINE!'),
  'prompt.holdStand': d('HOLD THE STAND'),
  'prompt.chargeRelease': d('Hold [Attack], then let go'),

  // ================================================================== CS-16 The Golden Hour (never cut)
  'cs16.1': d('Every morning the bell rang. And every morning, the cats got the sunny steps.'),
  'cs16.2': d('Here. It helps.'),
  'cs16.3': d('...It is warm.'),
  'prompt.ringBell': d('Ring the Sunbell'),
  'cs16.4': d('Did we miss it?'),
  'cs16.5': d('Coo.'),
  'cs16.6': d('Kneel, squire.'),
  'cs16.7': d("...Actually, stand. I can't see you."),
  'cs16.8': d('By the power vested in me by the Order of Nine Lives, and also my mum... Arise, Dame Clementine of the Pink Bow, Knight of Pawsbury.'),
  'cs16.9': d("...Your Highness? Could it be just 'Clem'? Everyone calls me that."),
  'cs16.10': d('Arise, Dame Clem of Pawsbury.'),
  'cs16.11': d('Still small. Still a knight.'),
  'cs16.12': d("The armour. It's on loan."),
  'cs16.13': d('Bring it back with a story in it, I said.'),
  'cs16.14': d('...There are a few more stories in there yet. Keep it.'),
  'cs16.15': d('Special delivery.'),
  'cs16.17': d('...They shooed me too. Off these steps.'),
  'cs16.18': d("Then sit. There's room."),
  'cs16.19': d('SUNNY STEPS: Cats, dogs, dragons. Naps only.'),
  'postcredits.pilfer1': d('The posts...'),
  'postcredits.pilfer2': d("...And this time, it's yours."),
  'ending.caption': d('And the sun came home.'),

  // ================================================================== TT4 §12.1: the rescued cat card (src/shelter/card.js)
  // The only facts: the cat's real name, photo and live status (from the Pink Paw gallery) and where the shelter is.
  'shelter.card.kicker': d('A real cat at Pink Paw'),
  'shelter.card.meet': d('Meet them at Pink Paw, Kaunas.'),
  'shelter.card.continue': d('Continue'),
  'shelter.status.WAITING': d('Waiting for a home'),
  'shelter.status.RECOVERING': d('Recovering'),
  'credits.title': d('Credits'),
  'credits.thanks': d('Thank you for playing.'),
  'credits.assets': d('Asset attribution'),
  // TOKENTAILS-PLAN §12.1 item 5 (TT4): every saved kitten carries a real Pink Paw cat's name and photo
  'credits.pinkpaw': d(`The kittens you save carry the names and photos of real cats at ${BRAND.shelterName} (${BRAND.shelterLocal}) in Kaunas. Their adventures here are made up.`),
  // TOKENTAILS-PLAN §10.5: the only facts about Pink Paw the game states (true: a real Lithuanian cat shelter, Token
  // Tails' partner shelter); nothing about numbers, places or what play does
  'credits.pinkpaw.about': d(`${BRAND.shelterName} (${BRAND.shelterLocal}) is a real cat shelter in Lithuania and Token Tails' partner shelter. Meet its cats at ${BRAND.site}.`),
  'credits.fiction': d(`The ${BRAND.rescueHouse}, Pawsbury and Purrhaven Isle are made up.`),

  // ================================================================== §6.1 Clem's barks
  'bark.clem.alert.1': d('Halt, villain. ...Please.'),
  'bark.clem.alert.2': d('Prepare to be bonked. ...Gently.'),
  'bark.clem.alert.3': d('I am a knight. Mostly.'),
  'bark.clem.stand': d('Hold.'),
  'bark.clem.standingGround': d('Not one step.'),
  'bark.clem.parry.1': d('No, thank you.'),
  'bark.clem.parry.2': d('Mrrp.'),
  'bark.clem.parry.3': d('Not today.'),
  'bark.clem.holy.1': d('For Pearl!'),
  'bark.clem.holy.2': d('Shine.'),
  'bark.clem.golden.first': d('Where I stand, the gate holds.'),
  'bark.clem.golden': d('Now.'),
  'bark.clem.stillStanding': d('...Still standing.'),
  'bark.clem.lowHp': d("I'm fine. I'm fine. I'm fine."),
  'bark.clem.respawn.1': d('Not strong yet. Still here.'),
  'bark.clem.respawn.2': d('...Ow. Okay.'),
  'bark.clem.lastLife': d('Ninth life. Making it count.'),
  'bark.clem.milk.1': d('Mm.'),
  'bark.clem.milk.2': d('Snack break.'),
  'bark.clem.kitten': d("You're safe now. Follow the lanterns home."),
  'bark.clem.arena.1': d('Small paws. Big sword. Still standing.'),
  'bark.clem.arena.2': d('Sorry! Sorry.'),
  'bark.clem.sneeze': d('...chu.'),
  'bark.clem.twoSpoons': d('Two spoons.'),
  'bark.clem.bonk': d('Bonk. ...Sorry.'),

  // ================================================================== §6.2 companion barks (keys used by src/companions/lines.js)
  'bark.mochi.ability.1': d('Squire on duty!'),
  'bark.mochi.ability.2': d("I'm not hiding, I'm BEING A WALL."),
  'bark.mochi.combat.1': d('Left! No, your other left!'),
  'bark.mochi.combat.2': d("I'm not scared! My tummy is scared. Separate thing."),
  'bark.mochi.kitten': d('Another one! Can we keep them all?'),
  'bark.mochi.idle': d('Is it lunch? It feels like lunch.'),
  'bark.mochi.caged.1': d('Over here! In the carrier! Hi!'),
  'bark.mochi.caged.2': d("I'd help, but I'm in a box."),
  'bark.mochi.lock': d("It's a tough one! Do the shiny swing!"),
  'bark.sage.ability.1': d('Target. Down.'),
  'bark.sage.ability.2': d('Volley.'),
  'bark.sage.combat.1': d('Behind you. Obviously.'),
  'bark.sage.combat.2': d("That was... actually cool. Don't tell anyone I said that."),
  'bark.sage.kitten': d('Kitten nearby. I can smell the panic.'),
  'bark.sage.idle': d("I've counted forty hyenas. We have four kittens and a spoon."),
  'bark.clover.ability.1': d('Hold still, sweetpea. This purr is medicinal.'),
  'bark.clover.ability.2': d('Mrrrr.'),
  'bark.clover.combat.1': d('Who hurt you? Point.'),
  'bark.clover.combat.2': d("Not the face, she's growing into it!"),
  'bark.clover.idle': d('Eat something. Knights need snacks.'),
  'bark.sage.caged.1': d('Up here. Yes, in the carrier. Don\'t laugh.'),
  'bark.sage.hello': d("Sage. Scout. Don't make it weird."),
  'bark.clover.caged.1': d('Psst. Sweetpea. A little help with this latch?'),
  'bark.clover.hello': d('Clover. I patch up knights. Mostly their feelings.'),
  'toast.swap': d('At your side: {name}'),
  'prompt.swap': d('Swap kitten'),
  'prompt.light': d('Light'),
  'bark.companion.nap.1': d('Just... resting my eyes...'),
  'bark.companion.nap.2': d('Zzz.'),
  'bark.companion.wake': d("I'm up! I'm up!"),
  'bark.companion.mrrp': d('Mrrp!'),

  // ================================================================== §6.3 enemy barks
  'bark.rat.alert.1': d('Squeak formation!'),
  'bark.rat.alert.2': d('Cheese for the Captain!'),
  'bark.rat.flee.1': d('Eek!'),
  'bark.rat.flee.2': d('Nope. Nope nope nope.'),
  'bark.hyena.alert.1': d('Look at it! A kitten with a butter knife!'),
  'bark.hyena.alert.2': d('Bedtime, fluffball!'),
  'bark.hyena.alert.3': d('Aww, is that a SWORD? Adorable!'),
  'bark.hyena.gloat.1': d('Hehehe-HAHA-hoo!'),
  'bark.hyena.gloat.2': d('BOOOO!'),
  'bark.hyena.gloat.3': d('Encore! ENCORE! Hehehe!'),
  'bark.hyena.choke': d('hrk!'),
  'bark.hyena.defeat.1': d('...That was actually kinda cool.'),
  'bark.hyena.defeat.2': d('Okay, that was AWESOME.'),
  'bark.hyena.defeat.3': d("I'm telling my mum."),
  'bark.stealer.snatch': d('Finders keepers! Snatchers... also keepers!'),
  'bark.stealer.hit': d('Ow! Fine! Take it!'),
  'bark.stealer.escape': d('Bye-bye, catnip!'),
  'bark.pug.alert': d('HRRF.'),
  'bark.pug.shield': d('Wall. Am wall.'),
  'bark.bone.collapse': d('*clatter*'),
  'bark.bone.reassemble': d('Ta-daa.'),
  'bark.bone.scattered': d('*clack*'),
  'grizzlechop.intro': d('Halt! This cheese is under the protection of Captain Grizzlechop!'),
  'grizzlechop.p2': d('Charge! ...I said CHARGE! Why is nobody charging?'),
  'grizzlechop.wheel': d('My WHEEL!'),
  'grizzlechop.snack': d("Snack break! Captain's privilege!"),
  'grizzlechop.choke': d('hrk— wrong pipe! WRONG PIPE!'),
  'grizzlechop.cheese': d('MY CHEESE!'),
  'cacklejaw.intro': d("Oh, it's YOU! The tiny one! Lads, she came all this way!"),
  'cacklejaw.p1': d('Is that a sword or a toothpick?'),
  'cacklejaw.p2': d('GIGGLE RUSH!'),
  'cacklejaw.stumble': d('How are you STILL there?'),
  'cacklejaw.p3': d("Who's laughing now? ...Me. It's still me."),
  'cacklejaw.meowed': d('WHAT?'),
  'cacklejaw.choked': d("hrk— that's rude!"),
  'pilfer.pin': d("It's a post! Technically!"),
  'pilfer.chased': d('Catch me if you— why are you so FAST?'),
  'toast.chase.restart': d('Pilfer slipped away! He doubled back to the bakery…'),
  'brutus.parry': d('Good.'),
  'brutus.again': d('Again.'),
  'brutus.show': d('Show me your Stand.'),
  'brutus.one': d('One.'),
  'brutus.two': d('Two.'),
  'barkus.intro': d('No cats. On the sunny. Steps.'),
  'barkus.p1': d('MY sun! MY steps! MY nap!'),
  'barkus.p2': d('My HELMET? ...WALKIES! EVERYBODY! WALKIES!'),
  'barkus.p3': d('You want your shiny rock? COME AND GET IT!'),
  'barkus.parry1': d('WHAT?'),
  'barkus.parry2': d('STOP THAT!'),
  'barkus.parry3': d('MY ROCK!'),

  // ================================================================== §6.4 lost kittens (rescue line; also their hub line)
  'kitten.biscuit': d('Is the bridge still wobbly? Okay. Hi.'),
  'kitten.noodle': d('I was being a barrel. It was going well.'),
  'kitten.button': d('You stood so still I thought you were a statue. I copied you!'),
  'kitten.pickles': d("The mushroom said I could stay. The mushroom didn't say anything. I was scared."),
  'kitten.pebble': d('You broke a ROCK. With a SWORD.'),
  'kitten.sprout': d('They said I was too small to count. I counted them. Eleven.'),
  'kitten.waffles': d("I can see the whole town from here! It's mostly rats."),
  'kitten.toffee': d('I climbed up and then I forgot how down works.'),
  'kitten.muffin': d('The bell\'s having a nap. I like it better awake.'),
  'kitten.tater': d("Pip said you'd come. Pip says a lot of things."),
  'kitten.mittens': d('I bit one! On the tail! Gently!'),
  'kitten.socks': d("It's damp under here. I've been very brave about the damp."),
  // TOKENTAILS-PLAN §10.5: short bios for the four kittens named after Pink Paw cats (rescue card, Kittens grid).
  // Made-up stories that invent nothing about the real cats.
  'kitten.pickles.bio': d('Naps in bread baskets. Swears he was guarding them.'),                 // claim:fiction
  'kitten.pebble.bio': d('Blue eyes, very still, very patient. Has caught zero fish.'),           // claim:fiction
  'kitten.muffin.bio': d('Climbed the Bell Tower to see the sunrise. Needed help down.'),        // claim:fiction
  'kitten.socks.bio': d('Follows sunbeams across the square all afternoon.'),                     // claim:fiction
  'kitten.juniper': d('The lights in the water keep winking at me.'),
  'kitten.bramble': d('There were spiders. I named them. Then I ran.'),
  'kitten.fennel': d('Is the tower supposed to be sideways?'),
  'kitten.bean': d("The dogs aren't mean. They're just loud. Like Mochi."),
  'kitten.crumpet': d('The squeaky-bone guard tells good jokes. He squeaks at the punchline.'),
  'kitten.dumpling': d("I'm not stuck. I'm guarding the banner."),
  'kitten.where.biscuit': d('A carrier at the Old Bridge'), 'kitten.where.noodle': d('In a barrel, the crossroads'),
  'kitten.where.button': d('The Standing Stones'), 'kitten.where.pickles': d('A mushroom house'),
  'kitten.where.pebble': d('Behind a cracked boulder'), 'kitten.where.sprout': d('A carrier in the rat tents'),
  'kitten.where.waffles': d('Above Lantern Alley'), 'kitten.where.toffee': d('On the fountain statue'),
  'kitten.where.muffin': d('The Bell Tower loft'), 'kitten.where.tater': d('The hyena snack wagon'),
  'kitten.where.mittens': d('The hyena snack wagon'), 'kitten.where.socks': d('Under the causeway stairs'),
  'kitten.where.juniper': d('A hollow tree stump'), 'kitten.where.bramble': d('The Spider Reeds'),
  'kitten.where.fennel': d('The sunken tower'), 'kitten.where.bean': d('A barrel in the Courtyard'),
  'kitten.where.crumpet': d('A kennel carrier, the cellars'), 'kitten.where.dumpling': d('A banner beam on the ramparts'),

  // ================================================================== §6.5 hub lines
  'hub.marmalade.1': d("Snacks are on the house. Napkins are extra. Kidding. Napkins are free."),
  'hub.marmalade.2': d("Bend the knees, girl. The tail's for balance, not for swishing at butterflies."),
  'hub.marmalade.bed': d("Take what you need. Leave the catnip in the jar. Doctor's watching."),
  'hub.tofu.1': d('Sharpen it? I can barely *lift* it.'),
  'hub.tofu.2': d('Every notch on that blade is a story. Please stop adding notches.'),
  'hub.earlgrey.1': d("Fascinating. The shard resonates with your blade. Or you're vibrating. Kittens do that."),
  'hub.earlgrey.2': d('Knowledge is power. Also, power is power.'),
  'hub.pip.1': d("{n} kittens still out in {level}. One's somewhere silly. Don't ask how I know."),
  'hub.pip.2': d("Found your catnip. ...I'm keeping a sprig."),
  'hub.pearl.1': d("Red's your colour. Every colour's your colour. You're my sister."),
  'hub.pearl.2': d("Twirl. ...Okay, don't twirl in armour."),
  'hub.snowpaw.1': d('The castle steps are yours, little knight. Share them nicely.'),
  'hub.snowpaw.2': d("I'm practising knighting people on the cook. He's very patient."),
  'hub.coo.1': d('Coo.'),
  'hub.villager.1': d("Is that THE knight with the big sword? She's so small!"),
  'hub.villager.2': d('My nan says the bell will ring again.'),
  'hub.villager.3': d("I'm going to be a knight too. I'm already too small, so that part's done."),
  'hub.villager.4': d("Mind the fountain, it bites. It doesn't. But it might."),
  'hub.villager.5': d('Thank you, Dame— um. Squire. Um. Clem!'),
  'hub.villager.6': d('Catnip? Catnip!'),
  // the Token Tails Cat, keeper of the Rescue House (BRAND.rescueHouse; TOKENTAILS-PLAN §2.4, §10.5; fiction only)
  'npc.ttcat.1': d(`Welcome to the ${BRAND.rescueHouse}! Every kitten you bring home gets a warm spot here.`),
  'npc.ttcat.2': d('Blankets by the window, naps by the fire. Nobody waits alone.'),
  'npc.ttcat.3': d('Another little one safe? Go on, knight. I will tuck them in.'),

  // ================================================================== §6.7 Lost Letters
  'letter.l1.title': d("Mochi's letter home"),
  'letter.l1': d("Dear Mum. Squire food is fine. Please send tuna snacks. Not the crunchy ones. — Mochi"),
  'letter.l2.title': d("Grizzlechop's shopping list"),
  'letter.l2': d("Grizzlechop's shopping list: cheese, more cheese, a hat with a bigger feather, cheese."),
  'letter.l3.title': d('A request to the Armour-Painting Office'),
  'letter.l3': d("To the Snickerpack Armour-Painting Office: please change my word from NAYSAYER to YAYSAYER. I've thought about it a lot. — Private Snorkle"),
  'letter.l4.title': d('A letter for Pudding'),
  'letter.l4': d('Dear Pudding. You can come home now. We fixed the cave. — the bats'),
  'letter.l5.title': d('A secret letter'),
  'letter.l5': d("Dear Clem, if you're reading this, you found my secret letter spot. I'm proud of you. — P."),
  'letter.l6.title': d('A pup\'s letter'),
  'letter.l6': d("Dear Mum. The cats said no dogs on the sunny steps again. One day I'll get my own sun. — Barky, age 1"),
  'letter.marmalade.title': d("Marmalade's letter"),
  'letter.marmalade': d("Dear Knights. They say I'm too little to be a squire. I've decided to be one anyway. I will practise every night. — Marmalade, age 7 months."),
  'letter.summons': d('To the Knights of the Order of Nine Lives. Please come home. The gate needs holding. — Snowpaw.'),

  // ================================================================== §4.4 Photo Cam captions, achievements (keys keep the old `meme.` ids)
  'meme.cap1': d('Bow straight. Paws ready. Smile!'),
  'meme.cap2': d('Somewhere, a kitten is on the way home.'),
  'meme.cap3': d('Small knight. Sunny day. Big heart.'),
  'ach.memecam': d('Picture Purrfect'),

  // ================================================================== §6.6 objectives
  'obj.ropes': d('Cut the net ropes {n}/{max}'),
  'obj.kitten': d('Free the kitten'),
  'obj.stealer': d('Catch Pilfer!'),
  'obj.lanterns': d('Light the lanterns {n}/{max}'),
  'obj.line': d('Hold the Line! Gate repair {p}%'),
  'obj.keys': d('Find the keys {n}/{max}'),
  'obj.belltower': d('Reach the Bell Tower'),
  'obj.mochi': d('Pop Mochi\'s carrier open'),
  'obj.follow': d('Follow the trail of letters'),
  'obj.done': d('Objective complete!'),

  // ================================================================== prompts (interaction tags, cutscene prompts)
  'prompt.interact': d('[Interact]'),
  'prompt.talk': d('Talk'),
  'prompt.picnic': d('Sit for a Snack Break [Interact]'),
  'prompt.vigil': d('Rest'),
  'prompt.read': d('Read'),
  'prompt.open': d('Open'),
  'prompt.shop': d('Browse'),
  'prompt.board': d('Quest Board'),
  'prompt.skip': d('Hold [Esc] or [P] to skip'),
  'prompt.skip.pad': d('Hold [Start] to skip'),
  'prompt.skip.touch': d('Hold Skip to skip'),
  'prompt.next': d('Next'),
  'prompt.continue': d('Continue'),

  // ================================================================== §6.8 UI copy
  'life.lost': d('Boing! Back on her paws. {n} lives left'),
  'life.lost1': d('Boing! 1 life left. Careful-ish!'),
  'life.last': d('Last life! Big brave hops!'),
  'gameover.title': d('Time for a cat nap.'),
  'gameover.retry': d('Stretch and try again'),
  'gameover.hub': d('Back to Pawsbury'),
  'results.title': d('Hooray! Chapter clear!'),
  'results.time': d('Time'),
  'results.kittens': d('Kittens'),
  'results.letter': d('Letter'),
  'results.fish': d('Catnip'),
  'results.lives': d('Lives left'),
  'results.rank': d('Rank'),
  'results.rank.pawsome': d('PAW-SOME!'),
  'results.rank.purrfect': d('PURR-FECT!'),
  'results.rank.mewtiful': d('Good kitty!'),
  'results.rank.clawsome': d('CLAW-SOME!'),
  'results.next': d('Onward'),
  // TOKENTAILS-PLAN §10.4: the in-game catnip is not the per-account Token Tails catnip
  'results.catnipNote': d('Catnip here stays in this game for now.'),
  'results.brand': d('A Token Tails game'),
  'pause.catnipNote': d('Catnip here stays in this game for now.'),
  'pause.brand': d('A Token Tails game'),
  'toast.kitten': d('Kitten found! {n}/{max}'),   // n/3 for this level, like the HUD (M2); {total} = n/18
  'toast.exit.mochi': d('Mochi\'s still stuck in his carrier! Back to the cart!'),
  'toast.exit.forest': d('The road home runs past the Cheese Mill. Captain Grizzlechop first!'),
  'toast.exit.town': d('Pawsbury still needs you. Find Princess Snowpaw at the Castle Steps.'),
  'toast.exit.gate': d('The gate needs holding. Not yet.'),
  'toast.letter': d('Letter found: {title}'),
  'toast.heartbell': d('Heart Bell! +1 heart'),
  'toast.stolen': d('A Snack Snatcher swiped {n} catnip! Bonk it to get it back!'),
  'toast.stolenMilk': d('A Snack Snatcher swiped your tuna snack! Bonk it to get it back!'),
  'toast.returned': d('Got it back! +5 catnip'),
  'toast.memecam': d('Picture purrfect! (Moonlight White cape unlocked)'),
  'toast.skin': d('Sword unlocked: {name}'),
  'toast.cape': d('Cape unlocked: {name}'),
  'toast.objective': d('Objective complete!'),
  'toast.saved': d('Saved.'),
  'toast.noSave': d("Progress can't be saved in this browser mode."),
  'toast.otherTab': d('This game was saved in another tab. Reload this page to continue from there.'),
  'toast.checkpoint': d('Lantern Stone lit! Cozy spot saved.'),
  'toast.shard': d('A shard of the Dawnstone! ({n}/3)'),
  'loading.title': d('Loading…'),
  'loading.tip.1': d('Shield on the ground? Parry it!'),
  'loading.tip.2': d('Red means move!'),
  'loading.tip.3': d('Hyenas giggle after a hit. Bonk them mid-giggle!'),
  'loading.tip.4': d('Meow near barrels. Kittens hide in silly places.'),
  'loading.tip.5': d('Bright Slash pops slimes without splitting them.'),
  'loading.tip.6': d('Standing your ground fills Valor.'),
  'loading.tip.7': d('Nine lives per level. Cats are like that.'),
  // CONTROLS_SPEC §14 loading tips (ui's CINEMA.tipCount picks from 1..n; device variants via tx())
  'loading.tip.8': d('The notch on your ring is where your sword goes.'),
  'loading.tip.9': d('Pressing the Stand plants your paws: perfect for Standing Ground.'),
  'loading.tip.10': d('[H] to stand still.'),
  'loading.tip.10.pad': d('Let go of the stick and she stands still.'),
  'loading.tip.10.touch': d('Let go of the joystick and she stands still.'),
  'loading.tip.11': d('Click a foe to charge in.'),
  'loading.tip.11.pad': d('R3 picks the nearest foe.'),
  'loading.tip.11.touch': d('Tap a foe to charge in.'),
  'loading.tip.12': d('[Y] frees the camera.'),
  'loading.tip.12.pad': d('View zooms the camera in and out.'),
  'loading.tip.12.touch': d('Pinch to zoom.'),
  'loading.tip.13': d('Every bonked boss becomes a friend. Visit them in Pawsbury!'),
  // TOKENTAILS-PLAN §10.4: Token Tails fiction tips (the game's own story; no claims about the real world)
  'loading.tip.14': d('The Token Tails Cat keeps a warm spot for every kitten you bring home.'),
  'loading.tip.15': d(`Rescued kittens nap at the ${BRAND.rescueHouse}. Pop in and say hi!`),
  'loading.tip.16': d('Pink paw prints show the way. Follow them!'),

  // ================================================================== §14.3 menus (ui reads these keys)
  'menu.continue': d('Keep going!'),
  'menu.newGame': d('New adventure'),
  'menu.settings': d('Settings'),
  'menu.credits': d('Credits'),
  'menu.stickers': d('Sticker book'),
  'menu.back': d('Back'),
  'menu.confirm': d('Confirm'),
  'menu.yes': d('Yes'),
  'menu.no': d('No'),
  'newgame.title': d('New adventure'),
  'newgame.skipPrologue': d('Skip the prologue?'),
  'difficulty.title': d('Difficulty'),
  'difficulty.kitten': d('Kitten'),
  'difficulty.kitten.desc': d('Gentle hits, endless lives, wider parries. Just enjoy the story.'),
  'difficulty.knight': d('Knight'),
  'difficulty.knight.desc': d('The full adventure. Nine lives per level.'),
  'difficulty.nine': d('Nine Lives'),
  'difficulty.nine.desc': d('Nine lives for the whole game. Every one counts.'),
  'pause.title': d('Paused'),
  'pause.resume': d('Resume'),
  'pause.kittens': d('Kittens'),
  'pause.letters': d('Letters'),
  'pause.settings': d('Settings'),
  'pause.controls': d('Controls'),
  'pause.hub': d('Return to Pawsbury'),
  'pause.quit': d('Quit to Title'),
  'pause.missing': d('???'),
  'settings.title': d('Settings'),
  'settings.master': d('Master volume'),
  'settings.music': d('Music'),
  'settings.sfx': d('Sound effects'),
  'settings.invertY': d('Invert Y'),
  'settings.sensitivity': d('Look sensitivity'),
  'settings.quality': d('Quality'),
  'settings.quality.auto': d('Auto'),
  'settings.quality.low': d('Low'),
  'settings.quality.med': d('Medium'),
  'settings.quality.high': d('High'),
  'settings.difficulty': d('Difficulty'),
  'settings.holdStand': d('Stand: hold (off = toggle)'),
  'settings.holdCharge': d('Charge: hold (off = toggle)'),
  'settings.autoStand': d('Auto-Stand assist'),
  'settings.shake': d('Screen shake'),
  'settings.reduceFlashes': d('Reduce flashes'),
  'settings.patterns': d('Telegraph patterns'),
  'settings.subtitleSize': d('Subtitle size'),
  'settings.dialogSpeed': d('Dialogue speed'),
  'settings.touchSize': d('Touch button size'),
  // CONTROLS_SPEC §10.7 (iso controls)
  'settings.controlPreset': d('Mouse & keys layout'),
  'settings.camZoom': d('Camera distance'),
  'settings.autoAttack': d('Auto-attack after a click'),
  'settings.tapToMove': d('Tap the ground to move'),
  'settings.swipeTumble': d('Swipe to tumble'),
  'settings.castMode': d('Kitten ability casting'),
  'settings.parryRing': d('Parry ring'),
  'settings.leftHanded': d('Left-handed touch layout'),
  'settings.buttonOpacity': d('Touch button opacity'),
  'settings.haptics': d('Vibration'),
  'settings.reduceCameraMotion': d('Reduce camera motion'),
  'settings.edgePanSpeed': d('Edge pan speed (camera free)'),
  'settings.reduceCameraMotion.help': d('Softer camera moves: no shakes, slower turns.'),
  'settings.camZoom.help': d('How far the camera sits. Pinch or scroll does the same.'),
  'settings.camZoomPortrait': d('Camera distance (portrait)'),
  'settings.biggerHero': d('Bigger hero'),
  'settings.biggerHero.help': d('Keeps Clem larger on screen. Limits how far you can zoom out.'),
  'settings.camLockMode': d('Camera lock (mouse & keys)'),
  'settings.camLockMode.help': d('Locked follows Clem. Semi lets you peek, then springs back. Free roams with the mouse.'),
  'settings.camLockMode.locked': d('Locked'),
  'settings.camLockMode.semi': d('Semi'),
  'settings.camLockMode.free': d('Free'),
  'settings.camCursorLead': d('Cursor look-ahead'),
  'settings.camCursorLead.help': d('The camera leans a little toward the mouse.'),
  'settings.hudMode': d('HUD'),
  'settings.hudMode.calm': d('Calm'),
  'settings.hudMode.full': d('Full'),
  'settings.hudMode.help': d('Calm tucks the HUD away when nothing is happening.'),
  'settings.hitWords': d('Hit words'),
  'settings.tutorialHints': d('Tutorial hints'),
  'settings.tutorialHints.help': d('Pearl and Mochi show you how, with a little ghost paw.'),
  'settings.guideTrail': d('Paw-print trail'),
  'settings.guideTrail.help': d('Pink paw prints on the ground show where to go next.'),
  'settings.pathPreview': d('Path preview'),
  'settings.pathPreview.auto': d('Auto'),
  'settings.pathPreview.on': d('On'),
  'settings.pathPreview.off': d('Off'),
  'settings.pathPreview.help': d('Paw prints show where she will walk. Auto: on for touch while you learn.'),
  'settings.fpsCap': d('Frame rate cap'),
  'settings.fpsCap.auto': d('Auto'),
  'settings.fpsCap.off': d('Off'),
  'settings.batterySaver': d('Battery saver'),
  'settings.batterySaver.help': d('30 fps and lighter effects. Easier on phones.'),
  'settings.on': d('On'),
  'settings.off': d('Off'),
  'vigil.title': d('Lantern Stone'),
  'vigil.rest': d('Rest'),
  'vigil.swap': d('Swap kitten'),
  'vigil.difficulty': d('Difficulty'),
  'shop.bakery': d('Bakery'),
  'shop.forge': d('Forge'),
  'shop.library': d('Library'),
  'shop.wardrobe': d('Wardrobe'),
  'shop.lookout': d('Lookout'),
  'shop.buy': d('Buy'),
  'shop.owned': d('Owned'),
  'shop.equip': d('Equip'),
  'shop.equipped': d('Equipped'),
  'shop.cost': d('{n} catnip'),
  'shop.poor': d('Not enough catnip.'),
  'board.title': d('Quest Board'),
  'board.next': d('Next: {chapter}'),
  'board.cleared': d('Cleared'),
  'hud.boss.dizzy': d('DIZZY!'),
  'hud.boss.bonked': d('BONKED!'),
  'hud.lives': d('×{n}'),
  'hud.kittens': d('{n}/{max}'),
  'memecam.hint': d('Any key to stop posing'),
  'hud.riposte': d('Riposte!'),
  'menu.quitConfirm': d('Return to the title screen? Your progress up to the last Lantern Stone is kept.'),
  'menu.close': d('Close'),
  'pause.foundIn': d('{region}'),
  'pause.kittensCount': d('{n}/{max} found'),
  'pause.lettersCount': d('{n}/{max} found'),
  'credits.made': d('Made with love for one very small knight.'),
  'credits.team': d('Design · Code · Art · Music direction: Token Tails'),
  'vigil.swapNone': d('No squires yet. Rescue one!'),
  'vigil.active': d('At your side'),
  'results.infinite': d('∞'),
  'loading.hint': d('Loading'),
  'rotate.hint': d('Turn your device sideways'),
};

/** Number of `loading.tip.<n>` rows (1..n, no gaps): the loading veil may pick from all of them. */
export function loadingTipCount() {
  let n = 0;
  while (Object.prototype.hasOwnProperty.call(S, `loading.tip.${n + 1}`)) n++;
  return n;
}

/**
 * Register more rows (TOKENTAILS-PLAN §10.7): `table` maps key → text or `{ default }`. Later tables override earlier
 * rows (G2's strings.onboarding.js changes onboarding copy this way). Returns the number of rows written.
 * @param {Record<string, string|{default: string}>} table
 */
export function addStrings(table) {
  if (!table || typeof table !== 'object') return 0;
  let n = 0;
  for (const [k, v] of Object.entries(table)) {
    const text = typeof v === 'string' ? v : v && typeof v.default === 'string' ? v.default : null;
    if (text == null) continue;
    S[k] = d(text); n++;
  }
  return n;
}

/** The text of a row (its default; rows have no variants). Pure. */
export function pick(row) {
  return row ? row.default : null;
}

/** Fill `{name}` placeholders from `vars` (unknown placeholders stay as they are). Pure. */
export function fill(s, vars) {
  if (!vars || typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/** Resolve `key` with `{name}` placeholders filled from `vars`. Missing keys return the key itself. */
export function t(key, vars = null) {
  const row = Object.prototype.hasOwnProperty.call(S, key) ? S[key] : null;
  return row ? realize(fill(pick(row), vars)) : fill(String(key), vars);
}

// ================================================================== TT4 §12.1: real Pink Paw names (src/shelter/roster.js)
/** The 25 save slots whose display name a real cat replaces. */
const REAL_SLOTS = ['biscuit', 'noodle', 'button', 'pickles', 'pebble', 'sprout', 'waffles', 'toffee', 'muffin', 'tater', 'mittens',
  'socks', 'juniper', 'bramble', 'fennel', 'bean', 'crumpet', 'dumpling', 'mochi', 'sage', 'clover', 'marmalade', 'tofu', 'earlgrey', 'pip'];
/** slot → the name the story text uses for it today ("Sir Marmalade" is "Marmalade"; the four named cats' current names). */
const STORY_NAMES = Object.fromEntries(REAL_SLOTS.map((id) => [id, String(S[`name.${id}`]?.default ?? id).replace(/^Sir /, '')]));
/** Words that are a place, not the kitten ("Bramble Gate"). */
const NOT_A_NAME = { Bramble: '(?! Gate)' };
/** @type {Map<string, string>} story name → real name */
const REAL = new Map();
let realRe = null;

/**
 * Give save slots their real cats' names (TT4): `map` is slot id → real name. Every row resolved by t() then shows the
 * real name wherever the story used the slot's name (speaker ribbons, bubbles, cards, toasts, the Kittens grid). Pass
 * {} to go back to the story names. Returns the number of names set.
 * @param {Record<string, string>} map
 */
export function setRealNames(map) {
  REAL.clear();
  for (const [id, name] of Object.entries(map ?? {})) {
    if (!REAL_SLOTS.includes(id) || typeof name !== 'string' || !name.trim()) continue;
    const from = STORY_NAMES[id];
    if (from && from !== name) REAL.set(from, name.trim());
    if (id === 'marmalade') REAL.set('Sir Marmalade', name.trim());          // a real cat gets no made-up title
  }
  const keys = [...REAL.keys()].sort((a, b) => b.length - a.length).map((k) => `${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${NOT_A_NAME[k] ?? ''}`);
  realRe = keys.length ? new RegExp(`(?<![\\p{L}])(?:${keys.join('|')})(?![\\p{L}])`, 'gu') : null;
  return REAL.size;
}

/** The text with story names swapped for real names (one pass, so a real name is never swapped again). Pure. */
export function realize(s) {
  if (!realRe || typeof s !== 'string') return s;
  return s.replace(realRe, (m) => REAL.get(m) ?? m);
}

/** The story name a slot had before a real cat filled it ('Mochi', 'Earl Grey'). */
export function storyName(id) { return STORY_NAMES[id] ?? null; }

/** Is `key` a strings row? */
export function has(key) { return Object.prototype.hasOwnProperty.call(S, key); }

/** Text for a key OR literal text: keys resolve through `t`, anything else passes through (cutscene `ui` steps). */
export function text(keyOrText, vars = null) {
  if (keyOrText == null) return '';
  return has(keyOrText) ? t(keyOrText, vars) : fill(String(keyOrText), vars);
}

/** Display name for a cutscene speaker id ('swordcat' → 'Clem'); unknown ids are capitalised. */
export function speakerName(who) {
  if (!who) return '';
  const k = 'name.' + who;
  if (has(k)) return t(k);
  const base = String(who).replace(/[_-]\d+$/, '');
  if (has('name.' + base)) return t('name.' + base);
  return String(who).charAt(0).toUpperCase() + String(who).slice(1);
}
