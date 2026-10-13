// src/story/cutscenes/index.js  (owner: story) — the static map of every authored scene (§5.4), for node unit tests
// (U13 walks them all) and tools. The game itself uses `registry.js` (PERF S1t: meadow scenes bundled, the rest lazy)
// and never imports this file, so later chapters stay out of the boot bundle.
import cs00 from './cs00.js';
import cs01 from './cs01.js';
import cs01b from './cs01b.js';
import g01 from './g01.js';
import cs02 from './cs02.js';
import cs03 from './cs03.js';
import cs03b from './cs03b.js';
import d01 from './d01.js';
import tutpearl from './tutpearl.js';
import tutbow from './tutbow.js';
import tutlook from './tutlook.js';
import d02 from './d02.js';
import cs04 from './cs04.js';
import cs05 from './cs05.js';
import d03 from './d03.js';
import cs06 from './cs06.js';
import { d04tofu, d04earlgrey, d04clover } from './d04.js';
import cs07 from './cs07.js';
import d06 from './d06.js';
import cs08 from './cs08.js';
import g02 from './g02.js';
import cs09 from './cs09.js';
import cs10 from './cs10.js';
import { gate_yard, gate_back, gate_pin, gate_open } from './gate.js';

export { ALIASES, PLACEHOLDER_ENDS, PLACEHOLDER_DUR, placeholderScene, nextD04 } from './registry.js';

/** Authored scenes (M1: the prologue and Chapter 1; M2: Acts I–II, forest → town → gate; Phase W: cs01b, tutbow, tutlook). */
export const CUTSCENES = Object.freeze({ cs00, cs01, cs01b, g01, cs02, cs03, cs03b, d01, tutpearl, tutbow, tutlook,
  d02, cs04, cs05, d03, cs06, d04tofu, d04earlgrey, d04clover, cs07, d06, cs08, g02, cs09, cs10,
  gate_yard, gate_back, gate_pin, gate_open });
