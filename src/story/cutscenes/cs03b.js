// src/story/cutscenes/cs03b.js  (owner: story) — the CS-03 follow-up beat (GAME_DESIGN §5.4, "When all 3 ropes are cut
// and the arena is clear", ~8 s, dialogue only). Played by StoryManager on objective:progress {net_ropes, done}, right
// after it sets `meadow.pudding = true`: companions run Pudding's sniff → purr → nod (`Yes`) → lift-off (`Fast_Flying`)
// to the pud_1..4 perches. Ambient: gameplay keeps running (he must animate), the line is subtitled with babble and
// she keeps control; no camera or letterbox.
import { say, wait } from './lib.js';

export default {
  id: 'cs03b', kind: 'ambient', skippable: false,
  steps: [
    { t: 'sfx', id: 'cat/cat_purractive_loop', at: 'pudding', rate: 0.6, vol: 0.8, loop: true, handle: 'purr' },
    wait(1.4),
    say('pudding', 'cs03b.1', 3.4),
    { t: 'sfx', stop: 'purr', fade: 0.8 },
    wait(0.6),
  ],
  end: { cam: false },
};
