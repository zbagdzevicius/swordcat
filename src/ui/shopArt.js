// src/ui/shopArt.js  (owner: ui) — illustrated SVG for the hub shops (GAME_DESIGN §13.3–§13.5, §14.3 "Forge (with a
// skin preview on a turntable) … Wardrobe (cape preview on a turntable)"): one large drawing per sword skin, the
// Swordcat mannequin seen from behind wearing any cape (the bow is ALWAYS pink and sits on her LEFT ear, which from
// behind is the viewer's left), and the item icons of the upgrade rows. Ink-line style (art.md §13). Pure strings.
import { uid, INK, PINK, PINK_DEEP, GOLD, GOLD_DEEP } from './icons.js';
import { CAPES } from '../characters/palette.js';

const HILT_GOLD = (g) => `<linearGradient id="${g}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A87C32"/><stop offset=".45" stop-color="#FFE3A3"/><stop offset="1" stop-color="#A87C32"/></linearGradient>`;

/** Shared hilt: crossguard at y 160, leather grip, gold pommel (viewBox 0 0 60 220). */
function hilt(g, { guard = `url(#${g}h)`, grip = '#6B4429', ribbon = false } = {}) {
  return `<path d="M8 157h44c2.4 0 3.6 2.6 2 4.2l-2 2c-.6.6-1.4.8-2.2.8H10.2c-.8 0-1.6-.2-2.2-.8l-2-2C4.4 159.6 5.6 157 8 157Z" fill="${guard}" stroke="${INK}" stroke-width="2"/>`
    + `<rect x="25" y="164" width="10" height="32" rx="3.5" fill="${grip}" stroke="${INK}" stroke-width="2"/>`
    + '<path d="M25.5 170l9 4M25.5 177l9 4M25.5 184l9 4M25.5 191l9 3" stroke="#3E2414" stroke-width="1.6" opacity=".7"/>'
    + `<circle cx="30" cy="203" r="7.5" fill="url(#${g}h)" stroke="${INK}" stroke-width="2"/><circle cx="27.6" cy="200.6" r="2.2" fill="#FFF6DA"/>`
    + (ribbon ? `<path d="M35 168c6 2 9 8 7 15M35 168c4 5 4 11 1 16" fill="none" stroke="${PINK_DEEP}" stroke-width="3" stroke-linecap="round"/><circle cx="35" cy="168" r="2.4" fill="${PINK}" stroke="${PINK_DEEP}"/>` : '');
}

function steelBlade(g, glow = false) {
  return `<linearGradient id="${g}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8E949E"/><stop offset=".48" stop-color="#FFFFFF"/><stop offset=".52" stop-color="#C9CED6"/><stop offset="1" stop-color="#7D8490"/></linearGradient>`
    + (glow ? `<radialGradient id="${g}gl" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".9"/><stop offset="1" stop-color="#FFD34D" stop-opacity="0"/></radialGradient>` : '');
}

/** Large sword drawing per skin (§13.4). viewBox 0 0 60 220, tip up. */
export function swordArt(skin = 'borrowed') {
  const g = uid('sk');
  let defs = HILT_GOLD(g), body = '';
  switch (skin) {
    case 'twig':
      body = `<path d="M30 200c-2-30 1-62-1-96-1.6-28 1-60 0-90" fill="none" stroke="#7A5232" stroke-width="9" stroke-linecap="round"/>`
        + `<path d="M30 200c-2-30 1-62-1-96-1.6-28 1-60 0-90" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round" opacity=".25"/>`
        + '<path d="M30 200c-2-30 1-62-1-96-1.6-28 1-60 0-90" fill="none" stroke="#8C6440" stroke-width="7" stroke-linecap="round"/>'
        + '<path d="M29 120c-6-6-10-14-11-22M30 70c5-4 9-10 10-18" fill="none" stroke="#7A5232" stroke-width="4" stroke-linecap="round"/>'
        + `<path d="M40 52c8-6 15-5 18-2-3 7-11 10-18 2Z" fill="#7FB04E" stroke="${INK}" stroke-width="1.8"/><path d="M41 52c5-1 10-1 15-2" stroke="#4E7A2E" stroke-width="1.2"/>`
        + '<ellipse cx="29.5" cy="140" rx="3" ry="2" fill="#5A3A20"/>';
      return wrap(defs, body);
    case 'fishbone': {
      defs += `<linearGradient id="${g}f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E9E2CF"/><stop offset=".5" stop-color="#FFFDF4"/><stop offset="1" stop-color="#D3C9B0"/></linearGradient>`;
      let ribs = '';
      for (let i = 0; i < 9; i++) { const y = 48 + i * 11.5, w = 15 - Math.abs(i - 3) * 1.6; ribs += `<path d="M30 ${y}q-${w * .6} 2-${w} 9M30 ${y}q${w * .6} 2 ${w} 9" fill="none" stroke="url(#${g}f)" stroke-width="3.4" stroke-linecap="round"/><path d="M30 ${y}q-${w * .6} 2-${w} 9M30 ${y}q${w * .6} 2 ${w} 9" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity=".45"/>`; }
      body = `<rect x="27.5" y="40" width="5" height="118" rx="2.5" fill="url(#${g}f)" stroke="${INK}" stroke-width="1.6"/>${ribs}`
        + `<path d="M30 6c9 6 13 18 11 30-3 4-8 6-11 6s-8-2-11-6c-2-12 2-24 11-30Z" fill="url(#${g}f)" stroke="${INK}" stroke-width="2"/>`
        + `<circle cx="30" cy="24" r="4.2" fill="${INK}"/><circle cx="31.2" cy="22.8" r="1.3" fill="#fff"/>` + hilt(g);
      return wrap(defs, body);
    }
    case 'baguette':
      defs += `<linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B8742E"/><stop offset=".45" stop-color="#F0BE6E"/><stop offset="1" stop-color="#A9652A"/></linearGradient>`;
      body = `<path d="M30 8c8 0 11 8 11 16v128c0 4-3 6-11 6s-11-2-11-6V24c0-8 3-16 11-16Z" fill="url(#${g}r)" stroke="${INK}" stroke-width="2"/>`
        + [36, 58, 80, 102, 124].map((y) => `<path d="M21 ${y + 9}q8-3 18-12" fill="none" stroke="#FFE7B5" stroke-width="3" stroke-linecap="round"/><path d="M22 ${y + 11}q8-3 17-11" fill="none" stroke="#8A4D1E" stroke-width="1.2" opacity=".6"/>`).join('')
        + '<path d="M25 18c1.5-4 4-6 7-6" stroke="#FFF1D2" stroke-width="2" stroke-linecap="round" fill="none"/>'
        + '<g fill="#FFF6E6"><circle cx="26" cy="140" r="1"/><circle cx="33" cy="70" r="1"/><circle cx="27" cy="95" r=".9"/></g>' + hilt(g);
      return wrap(defs, body);
    case 'diamond':
      defs += `<linearGradient id="${g}d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4FBFF"/><stop offset=".5" stop-color="#5FD6E6"/><stop offset="1" stop-color="#2A8FB0"/></linearGradient>`;
      body = `<path d="M30 6 40 26 37 156H23L20 26Z" fill="url(#${g}d)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + '<path d="M30 6v150M20 26l10 14 10-14M22 80l8 10 8-10M23 120l7 8 7-8" fill="none" stroke="#E4FBFF" stroke-width="1.4" opacity=".8"/>'
        + '<path d="M24 34 26 140" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>'
        + hilt(g, { guard: '#3FB3C9', grip: '#2D5E7A' });
      return wrap(defs, body);
    case 'toobig':
      defs += steelBlade(g);
      // too big: the blade runs off the top of the frame (it drags on the ground in game)
      body = `<path d="M18 -40H42L46 156H14Z" fill="url(#${g}b)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + '<path d="M30 -40v190" stroke="#8E949E" stroke-width="2.2"/><path d="M21 -30 19 148" stroke="#fff" stroke-width="2" opacity=".7"/>'
        + `<path d="M0 154h60v8H0Z" fill="url(#${g}h)" stroke="${INK}" stroke-width="2"/>`
        + `<rect x="24" y="162" width="12" height="40" rx="4" fill="#4A2E1F" stroke="${INK}" stroke-width="2"/><circle cx="30" cy="208" r="8.5" fill="url(#${g}h)" stroke="${INK}" stroke-width="2"/>`;
      return wrap(defs, body, '0 -44 60 264');
    case 'dawnblade':
      defs += steelBlade(g, true);
      body = `<ellipse cx="30" cy="84" rx="30" ry="94" fill="url(#${g}gl)"/>`
        + `<path d="M30 6 36.5 22 35 156H25L23.5 22Z" fill="#FFE9A8" stroke="${GOLD_DEEP}" stroke-width="2" stroke-linejoin="round"/>`
        + '<path d="M30 14v138" stroke="#FFF8DC" stroke-width="2.4"/><path d="M26 30 27 148" stroke="#fff" stroke-width="2" opacity=".9"/>'
        + hilt(g, { ribbon: true })
        + '<g class="art-sparks" fill="#FFF6DA">' + [[12, 40], [48, 70], [10, 110], [50, 130], [22, 16], [44, 28]].map(([x, y]) => `<path d="M${x} ${y - 5}l1.4 3.6 3.6 1.4-3.6 1.4L${x} ${y + 5}l-1.4-3.6-3.6-1.4 3.6-1.4Z"/>`).join('') + '</g>';
      return wrap(defs, body);
    default:   // the Borrowed Blade (art.md §4.3): silver, a fuller, gold guard, a pink ribbon on the grip
      defs += steelBlade(g);
      body = `<path d="M30 6 36.5 22 35 156H25L23.5 22Z" fill="url(#${g}b)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + '<path d="M30 20v134" stroke="#8E949E" stroke-width="2"/><path d="M26 30 27 148" stroke="#fff" stroke-width="1.8" opacity=".8"/>'
        + '<path d="M33 60l-1 14M33 100l-1 10" stroke="#6B717C" stroke-width="1" opacity=".5"/>' + hilt(g, { ribbon: true });
      return wrap(defs, body);
  }
}

function wrap(defs, body, vb = '0 0 60 220') {
  return `<svg class="art-sword" viewBox="${vb}" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

/**
 * Clementine from behind wearing cape `id` (viewBox 0 0 160 200): ivory Token Tails coat (no stripes) with the pink bow on
 * her left ear (viewer's left from behind), silver pauldrons, the cape (colour, lining, gold hem) in a swaying group, her
 * long white tail below.
 */
export function capeMannequin(id = 'cream') {
  const c = CAPES[id] ?? CAPES.cream;
  const g = uid('cm');
  return `<svg class="art-cape" viewBox="0 0 160 200" aria-hidden="true"><defs>`
    + `<linearGradient id="${g}c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.lining}"/><stop offset=".3" stop-color="${c.color}"/><stop offset=".55" stop-color="${c.sheen}" stop-opacity=".9"/><stop offset=".75" stop-color="${c.color}"/><stop offset="1" stop-color="${c.lining}"/></linearGradient>`
    + `<linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F6F9"/><stop offset="1" stop-color="#8E949E"/></linearGradient>`
    + `<radialGradient id="${g}f" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCD3C8"/></radialGradient></defs>`
    // tail (behind the cape, curling out at the bottom right)
    + `<path d="M92 168c18 6 30 0 34-14 3-10 12-12 16-6" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`
    + '<path d="M92 168c18 6 30 0 34-14 3-10 12-12 16-6" fill="none" stroke="#F3EEE6" stroke-width="11" stroke-linecap="round"/>'
    // legs / sabatons
    + `<path d="M62 176h14v14H58c0-6 1-10 4-14ZM84 176h14c3 4 4 8 4 14H84Z" fill="url(#${g}s)" stroke="${INK}" stroke-width="2"/>`
    // head (back of the head) + ears
    + `<path d="M44 52 40 10 66 32ZM116 52l4-42-26 22Z" fill="url(#${g}f)" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`
    + `<ellipse cx="80" cy="54" rx="40" ry="32" fill="url(#${g}f)" stroke="${INK}" stroke-width="2.2"/>`
    // the bow: ALWAYS pink, on her LEFT ear (viewer's left from behind)
    + `<g transform="translate(46 22) rotate(-16)"><path d="M0 0-13-8c-2-1.2-4.4.2-4.4 2.6v10.8c0 2.4 2.4 3.8 4.4 2.6Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="2"/>`
    + `<path d="M0 0 13-8c2-1.2 4.4.2 4.4 2.6v10.8c0 2.4-2.4 3.8-4.4 2.6Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="2"/><circle r="3.6" fill="#E88AA6" stroke="${PINK_DEEP}" stroke-width="1.6"/>`
    + `<path d="M-2 3-6 14M2 3 6 14" stroke="${PINK_DEEP}" stroke-width="2.4" stroke-linecap="round"/></g>`
    // pauldrons
    + `<path d="M40 86c4-10 14-14 22-12l4 14c-8 2-16 4-26-2ZM120 86c-4-10-14-14-22-12l-4 14c8 2 16 4 26-2Z" fill="url(#${g}s)" stroke="${INK}" stroke-width="2"/>`
    // cape (sways)
    + `<g class="cape-sway"><path d="M54 82c8 4 44 4 52 0 6 30 12 62 16 90-12 6-26 3-34-1-6 4-22 6-38 1 2-30 2-60 4-90Z" fill="url(#${g}c)" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`
    + `<path d="M50 172c16 5 32 3 38-1 8 4 22 7 34 1" fill="none" stroke="${c.hem}" stroke-width="3.4" stroke-linecap="round"/>`
    + `<path d="M70 92c-2 26-3 52-4 76M90 92c2 26 5 52 8 77" stroke="${c.lining}" stroke-width="2" opacity=".55" fill="none"/>`
    + `<path d="M56 84c10 5 38 5 48 0" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/><circle cx="80" cy="87" r="4" fill="${GOLD}" stroke="${GOLD_DEEP}" stroke-width="1.4"/></g>`
    + '</svg>';
}

/** Small row / preview icons for the upgrades (viewBox 0 0 48 48). */
export function itemIcon(kind, opt = {}) {
  const g = uid('ii');
  switch (kind) {
    case 'satchel':
      return `<svg class="art-ico" viewBox="0 0 48 48" aria-hidden="true"><path d="M14 16c0-6 4-10 10-10s10 4 10 10" fill="none" stroke="#6B4429" stroke-width="3.4"/>`
        + `<path d="M8 18h32l-3 22c-.4 2.4-2.4 4-4.8 4H15.8c-2.4 0-4.4-1.6-4.8-4Z" fill="#B07A4A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="M8 18h32v8c-10 4-22 4-32 0Z" fill="#8C5A32" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + `<circle cx="24" cy="27" r="3.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`
        // a tuna-snack tin peeking out (the Snack Break item; internal id `milk`)
        + `<path d="M29 9.5c0-1 2.2-1.8 5-1.8s5 .8 5 1.8v8.5H29Z" fill="#C9D3DC" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
        + `<path d="M29 12.4h10v3.6H29Z" fill="${PINK}"/><ellipse cx="34" cy="9.5" rx="5" ry="1.8" fill="#E7EAEE" stroke="${INK}" stroke-width="1.2"/></svg>`;
    case 'sharp':
      return `<svg class="art-ico" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="32" width="36" height="9" rx="3" fill="#8D8A84" stroke="${INK}" stroke-width="2"/>`
        + `<path d="M36 6l6 2-22 24-5-3Z" fill="#E7EAEE" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M12 25l8 8" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`
        + '<g fill="#FFD34D" stroke="#A87C32" stroke-width=".8"><path d="M10 10l1.6 4 4 1.6-4 1.6L10 21l-1.6-3.8-4-1.6 4-1.6Z"/><path d="M28 18l1 2.4 2.4 1-2.4 1L28 25l-1-2.6-2.4-1 2.4-1Z"/></g>'
        + (opt.tier ? `<text x="40" y="30" text-anchor="middle" font-size="11" font-weight="700" fill="${PINK_DEEP}" stroke="#fff" stroke-width="3" paint-order="stroke">${'I'.repeat(opt.tier)}</text>` : '') + '</svg>';
    case 'quickCharge':
      return `<svg class="art-ico" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 5h24M12 43h24" stroke="#6B4429" stroke-width="3.4" stroke-linecap="round"/>`
        + `<path d="M15 6c0 10 9 13 9 18s-9 8-9 18h18c0-10-9-13-9-18s9-8 9-18Z" fill="#FFF6E6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="M19 38c2-4 5-6 5-9 0 3 3 5 5 9Z" fill="${GOLD}"/><path d="M27 14l-6 9h5l-3 8 8-11h-5l3-6Z" fill="#FFD34D" stroke="${GOLD_DEEP}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    case 'valorGain':
      return `<svg class="art-ico" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#CDD3DB"/><stop offset="1" stop-color="#FFD34D"/></linearGradient></defs>`
        + `<path d="M24 4l4 8v26h-8V12Z" fill="url(#${g})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M14 38h20" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`
        + `<path d="M24 38v6" stroke="#6B4429" stroke-width="4" stroke-linecap="round"/><path d="M36 22l5-6 5 6M41 16v12" fill="none" stroke="${PINK_DEEP}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'waveReach':
      return `<svg class="art-ico" viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke-linecap="round"><path d="M8 40a20 20 0 0 1 32 0" stroke="#FFD34D" stroke-width="4"/>`
        + `<path d="M3 36a27 27 0 0 1 42 0" stroke="#FFE9A8" stroke-width="3" opacity=".8"/><path d="M14 42a12 12 0 0 1 20 0" stroke="${GOLD_DEEP}" stroke-width="3"/></g>`
        + `<path d="M24 6l3 8-3 20-3-20Z" fill="#FFF6DA" stroke="${GOLD_DEEP}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    case 'lock':
      return `<svg class="art-ico art-lock" viewBox="0 0 48 48" aria-hidden="true"><path d="M15 22v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#7B6A5C" stroke-width="4"/>`
        + `<rect x="10" y="21" width="28" height="22" rx="5" fill="#B8A88A" stroke="${INK}" stroke-width="2"/><circle cx="24" cy="31" r="3" fill="${INK}"/><path d="M24 33v5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    case 'spyglass':
      return `<svg class="art-ico" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 34 30 12l8 8-24 22Z" fill="#B07A4A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="M28 10l10 10 4-4-10-10Z" fill="${GOLD}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M14 26l8 8" stroke="${GOLD}" stroke-width="3"/></svg>`;
    default: return '';
  }
}
