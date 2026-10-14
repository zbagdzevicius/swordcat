// src/ui/portraits.js  (owner: ui) — procedural SVG portraits for the HUD (§14.2: Swordcat in a round gold frame,
// worried at HP ≤ 2, determined in Golden Hour), the dialogue scroll, the companion ring and the Kittens grid.
// Cats read their coat / eyes / bow / accessories from characters' configs (`catConfig`, the same data the 3D kittens
// use), so a portrait always matches the model. Other speakers (Pudding, hyenas, rats, dogs, birds, statues) get a
// species face. Pure strings; node-safe.
import { catConfig } from '../characters/configs.js';
import { uid, INK, PINK, PINK_DEEP, GOLD, GOLD_DEEP, pawPath } from './icons.js';
import { tx, esc } from './text.js';
import { BRAND } from '../core/brand.js';

/**
 * The fictional bio of a kitten named after a Pink Paw cat (TOKENTAILS-PLAN §10.5: `kitten.<id>.bio`, marked
 * `claim:fiction` in strings.js), or '' for every other kitten and for an id whose Pink Paw name was removed from
 * BRAND.pinkPawKittens. Pure.
 * @param {any} ctx @param {string} id
 */
export function kittenBio(ctx, id) {
  if (!id || !Object.prototype.hasOwnProperty.call(BRAND.pinkPawKittens, id)) return '';
  const key = `kitten.${id}.bio`, s = tx(ctx, key);
  return s && s !== key ? s : '';
}

/**
 * The rescue card's extra line for a named kitten: its name and bio (escaped HTML), '' for other kittens. The
 * celebration card (celebrate.js) and the Kittens grid (menus.js) show it. Pure.
 * @param {any} ctx @param {string} id
 */
export function rescueBioHtml(ctx, id) {
  const bio = kittenBio(ctx, id);
  if (!bio) return '';
  return `<p class="kit-bio"><b class="kit-bio-name">${esc(tx(ctx, `name.${id}`))}</b> ${esc(bio)}</p>`;
}

/** Speaker id → species for non-cats (prefix match). */
const SPECIES = [
  [/^(pudding|dragon)/, 'dragon'], [/^(hyena|cacklejaw|raider)/, 'hyena'], [/^(rat|grizzlechop)/, 'rat'],
  [/^(barkus|brutus|pug|dog|warhound|barky|husky)/, 'dog'], [/^(crow|coo|pigeon|bird)/, 'bird'],
  [/^(tallbert|statue|knight_statue)/, 'statue'], [/^(stealer|pilfer)/, 'hyena'],
];

/** Which face to draw for `id`: 'cat' | species | 'emblem'. */
export function portraitKind(id) {
  const s = String(id ?? '').toLowerCase();
  if (!s) return 'emblem';
  for (const [re, k] of SPECIES) if (re.test(s)) return k;
  return safeCat(s) ? 'cat' : 'emblem';
}

function safeCat(id) {
  try { return catConfig(id) ?? catConfig(String(id).replace(/[_-]\d+$/, '')) ?? null; } catch { return null; }
}

const HEAD = 'M50 26C72 26 88 38 88 58c0 4-.6 7.4-2.6 10.4L92 72l-7.4 2.6 4.4 5.4-9 .4C73 87.6 62.4 92 50 92S27 87.6 21 80.4l-9-.4 4.4-5.4L9 72l6.6-3.6C13.6 65.4 12 62 12 58c0-20 16-32 38-32Z';
const EAR_L = 'M17 47 20.5 8.5 46 29.5Z', EAR_R = 'M83 47 79.5 8.5 54 29.5Z';
const EAR_LI = 'M23 40 25 17.5 39.5 30Z', EAR_RI = 'M77 40 75 17.5 60.5 30Z';

/**
 * SVG portrait (viewBox 0 0 100 100). Expressions: 'normal' | 'worried' | 'determined' | 'happy' | 'sleep' | 'surprised'.
 * @param {string} id  speaker / actor / kitten id ('swordcat', 'mochi', 'biscuit', 'pudding', 'hyena_2', ...)
 * @param {{ expression?: string, shoulders?: boolean, cls?: string }} [o]
 */
export function portraitSVG(id, o = {}) {
  const kind = portraitKind(id);
  const cls = `portrait portrait--${kind}${o.cls ? ' ' + o.cls : ''}`;
  let body;
  switch (kind) {
    case 'cat': body = catFace(safeCat(String(id).toLowerCase()), String(id).toLowerCase(), o); break;
    case 'dragon': body = dragonFace(o); break;
    case 'hyena': body = hyenaFace(o, /stealer|pilfer/.test(String(id))); break;
    case 'rat': body = ratFace(o, /grizzlechop/.test(String(id))); break;
    case 'dog': body = dogFace(o, String(id)); break;
    case 'bird': body = birdFace(o, /coo|pigeon/.test(String(id))); break;
    case 'statue': body = statueFace(); break;
    default: body = `<circle cx="50" cy="50" r="40" fill="#E8D5AA"/><g transform="translate(14 14) scale(1.5)">${pawPath(PINK_DEEP, 0.85)}</g>`;
  }
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}

// ------------------------------------------------------------------ cats
function eyeColours(cfg) {
  const e = cfg?.eyes ?? {};
  const one = e.L ?? e;
  const two = e.R ?? e;
  return [{ inner: one.inner ?? '#8DB3C2', outer: one.outer ?? '#3F6170', ring: one.ring ?? '#2A1E18' },
    { inner: two.inner ?? one.inner ?? '#8DB3C2', outer: two.outer ?? one.outer ?? '#3F6170', ring: two.ring ?? one.ring ?? '#2A1E18' }];
}

function accIds(cfg) {
  const out = new Map();
  for (const a of cfg?.accessories ?? []) {
    if (!a) continue;
    if (typeof a === 'string') out.set(a, {}); else if (a.id) out.set(a.id, a);
  }
  return out;
}

function catFace(cfg, id, o) {
  const p = uid('pc');
  const coat = cfg?.coat ?? { base: '#C9A47A', deep: '#8A6A4A', light: '#E8D3B2', cream: '#F2E8DA' };
  const base = coat.base, deep = coat.deep ?? base, light = coat.light ?? base;
  let cream = coat.white ?? coat.cream ?? light;
  const pattern = coat.pattern ?? 'solid';
  const dark = luminance(base) < 0.25;
  const ink = dark ? '#2A1E18' : INK;
  const ears = eyeColours(cfg);
  const acc = accIds(cfg);
  const expr = o.expression ?? 'normal';
  const isHero = id.startsWith('swordcat');
  const earInner = cfg?.earInner ?? (dark ? '#B98A86' : '#EBB0A6');
  const nose = dark ? '#5A3A40' : '#C97F7A';
  const whisker = dark ? '#C9C3BA' : '#F5EEE6';
  if (pattern === 'siamese') cream = coat.cream ?? light;

  let s = `<defs><clipPath id="${p}h"><path d="${HEAD}"/></clipPath>`
    + `<radialGradient id="${p}f" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`
    + eyeGrad(`${p}e0`, ears[0]) + eyeGrad(`${p}e1`, ears[1]) + '</defs>';
  // background disc (frame interior)
  s += `<circle cx="50" cy="50" r="50" fill="${isHero ? '#CFD6DA' : '#E8D5AA'}"/>`;
  s += shoulders(cfg, id, base, deep);
  // ears (hidden under full helmets)
  const helm = acc.has('plumedHelm') || acc.has('potHelm') || acc.has('bucketHelm') || acc.has('wizardHat');
  const earFill = pattern === 'siamese' ? (coat.points ?? deep) : base;
  if (!helm || acc.has('wizardHat')) {
    s += `<path d="${EAR_L}" fill="${earFill}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/><path d="${EAR_R}" fill="${earFill}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`;
    s += `<path d="${EAR_LI}" fill="${earInner}"/><path d="${EAR_RI}" fill="${earInner}"/>`;
    s += '<path d="M24 22 28 30M76 22 72 30" stroke="#FFF6EA" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>';
  }
  // head + coat pattern
  s += `<path d="${HEAD}" fill="url(#${p}f)"/>`;
  s += `<g clip-path="url(#${p}h)">${coatPattern(coat, pattern, deep, light, cream)}</g>`;
  // muzzle / chin
  s += `<ellipse cx="42.5" cy="74" rx="9.5" ry="7.2" fill="${cream}"/><ellipse cx="57.5" cy="74" rx="9.5" ry="7.2" fill="${cream}"/><ellipse cx="50" cy="81" rx="10" ry="7" fill="${cream}"/>`;
  s += `<path d="${HEAD}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`;
  // blush
  if (!dark) s += '<ellipse cx="23.5" cy="70.5" rx="5.2" ry="2.8" fill="#F28CA6" opacity=".38"/><ellipse cx="76.5" cy="70.5" rx="5.2" ry="2.8" fill="#F28CA6" opacity=".38"/>';
  // eyes
  s += eyes(expr, p, ink, acc);
  // nose, mouth, whiskers
  s += `<path d="M46.2 67h7.6c0 2.6-1.8 4.2-3.8 5-2-.8-3.8-2.4-3.8-5Z" fill="${nose}" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/>`;
  s += mouth(expr, ink);
  s += `<g stroke="${whisker}" stroke-width="1.1" stroke-linecap="round" opacity=".95"><path d="M31 71.5 5.5 67.5M31 74.5 6.5 77M69 71.5 94.5 67.5M69 74.5 93.5 77"/></g>`;
  // brows / extras
  s += brows(expr, ink);
  // accessories over the head
  s += headwear(acc, cfg);
  if (cfg?.bow) s += bow(cfg.bow);
  if (expr === 'worried') s += '<path d="M88 34c3 4 4 6.4 4 8.2a4 4 0 0 1-8 0c0-1.8 1-4.2 4-8.2Z" fill="#BFE3F5" stroke="#5E8FA8" stroke-width="1.2"/>';
  if (expr === 'sleep') s += `<g fill="${INK}" font-family="Fredoka, system-ui, sans-serif" font-weight="700"><text x="74" y="30" font-size="13">z</text><text x="84" y="19" font-size="17">z</text></g>`;
  return s;
}

function eyeGrad(id, e) {
  return `<radialGradient id="${id}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="${e.inner}"/><stop offset=".72" stop-color="${e.outer}"/><stop offset="1" stop-color="${e.ring}"/></radialGradient>`;
}

function eyes(expr, p, ink, acc) {
  const L = 34, R = 66, Y = 58;
  if (expr === 'happy') return `<path d="M${L - 10} ${Y + 2}q10-11 20 0M${R - 10} ${Y + 2}q10-11 20 0" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`;
  if (expr === 'sleep') return `<path d="M${L - 9} ${Y}q9 7 18 0M${R - 9} ${Y}q9 7 18 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  const pr = expr === 'surprised' ? [3.4, 3.4] : expr === 'worried' ? [3.8, 5.8] : expr === 'determined' ? [4, 6.6] : [4.6, 7];
  let s = '';
  [[L, 0], [R, 1]].forEach(([cx, i]) => {
    if (acc.has('eyepatch') && ((acc.get('eyepatch').side ?? -1) < 0 ? i === 0 : i === 1)) {
      s += `<ellipse cx="${cx}" cy="${Y}" rx="11.5" ry="10" fill="#3A2A1F" stroke="${ink}" stroke-width="1.6"/><path d="M${cx - 18} ${Y - 14}L${cx + 18} ${Y - 4}" stroke="#3A2A1F" stroke-width="2.4"/>`;
      return;
    }
    s += `<circle cx="${cx}" cy="${Y}" r="10.8" fill="url(#${p}e${i})" stroke="${ink}" stroke-width="1.6"/>`;
    s += `<ellipse cx="${cx}" cy="${Y + 0.6}" rx="${pr[0]}" ry="${pr[1]}" fill="#2A1E18"/>`;
    s += `<circle cx="${cx - 3.6}" cy="${Y - 4.2}" r="3.1" fill="#fff"/><circle cx="${cx + 3.6}" cy="${Y + 3.8}" r="1.4" fill="#fff" opacity=".9"/>`;
    if (expr === 'worried') s += `<path d="M${cx - 7} ${Y + 8.2}q7 2.4 14 0" stroke="#fff" stroke-width="1.3" fill="none" opacity=".75" stroke-linecap="round"/>`;
    s += `<path d="M${cx - 11.4} ${Y - 1.5}q11.4-13.5 22.8 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
  });
  if (acc.has('glasses')) s += `<g fill="none" stroke="#3A2A1F" stroke-width="2"><circle cx="${L}" cy="${Y}" r="13"/><circle cx="${R}" cy="${Y}" r="13"/><path d="M47 57q3-2 6 0"/></g><g fill="#E8F4FA" opacity=".18"><circle cx="${L}" cy="${Y}" r="12"/><circle cx="${R}" cy="${Y}" r="12"/></g>`;
  return s;
}

function mouth(expr, ink) {
  if (expr === 'happy') return `<path d="M44 75c1 5 11 5 12 0Z" fill="#B85A66" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`;
  if (expr === 'surprised') return `<ellipse cx="50" cy="77.5" rx="2.8" ry="3.4" fill="#7A3A44" stroke="${ink}" stroke-width="1.3"/>`;
  if (expr === 'worried') return `<path d="M44.5 77.5q2.8-2.4 5.5 0 2.7 2.4 5.5 0" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`;
  if (expr === 'determined') return `<path d="M45 76.5h10" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`;
  return `<path d="M44 74.5q3 3.2 6-.4 3 3.6 6 .4" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function brows(expr, ink) {
  if (expr === 'worried') return `<path d="M24 44.5 38.5 39M76 44.5 61.5 39" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
  if (expr === 'determined') return `<path d="M24 40.5 39 45M76 40.5 61 45" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>`;
  return '';
}

function coatPattern(coat, pattern, deep, light, cream) {
  const st = Math.max(0.15, Math.min(1, (coat.stripe ?? 0.4) * 1.6));
  switch (pattern) {
    case 'mackerel': case 'tabby':
      return `<g stroke="${deep}" stroke-width="3.4" stroke-linecap="round" opacity="${st}" fill="none"><path d="M50 28v12M41 30.5l2.6 9M59 30.5l-2.6 9"/>`
        + '<path d="M12 57h9M13 63h8M88 57h-9M87 63h-8"/></g>';
    case 'tuxedo':
      return `<path d="M50 40c-5 9-11 16-22 22-4 12 2 30 22 30s26-18 22-30c-11-6-17-13-22-22Z" fill="${cream}"/>`;
    case 'calico': {
      const [a, b] = coat.patches ?? ['#E09A4E', '#5A4A44'];
      return `<ellipse cx="30" cy="38" rx="18" ry="14" fill="${a}"/><ellipse cx="72" cy="46" rx="15" ry="12" fill="${b}"/><ellipse cx="80" cy="30" rx="10" ry="8" fill="${a}" opacity=".9"/>`;
    }
    case 'siamese': {
      const pts = coat.points ?? '#4A3830';
      return `<radialGradient id="sm${pts.slice(1)}" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="${pts}" stop-opacity=".95"/><stop offset=".6" stop-color="${pts}" stop-opacity=".55"/><stop offset="1" stop-color="${pts}" stop-opacity="0"/></radialGradient>`
        + `<ellipse cx="50" cy="70" rx="26" ry="22" fill="url(#sm${pts.slice(1)})"/>`;
    }
    case 'dilute': return `<g stroke="${deep}" stroke-width="3" stroke-linecap="round" opacity=".35"><path d="M50 29v10M42 31l2 8M58 31l-2 8"/></g>`;
    default: return `<ellipse cx="50" cy="40" rx="22" ry="10" fill="${light}" opacity=".35"/>`;
  }
}

function shoulders(cfg, id, base, deep) {
  if (id.startsWith('swordcat') && cfg?.outfit?.armour) {
    const g = uid('ps');
    const capeCol = /red/.test(id) ? '#A3202C' : '#CDBB98';
    return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF1F4"/><stop offset=".5" stop-color="#AEB5BF"/><stop offset="1" stop-color="#6E747E"/></linearGradient></defs>`
      + `<path d="M4 100c2-10 10-15 18-15h56c8 0 16 5 18 15Z" fill="${capeCol}"/>`
      + `<path d="M12 100c2-9 14-14 38-14s36 5 38 14Z" fill="url(#${g})" stroke="${INK}" stroke-width="1.6"/>`
      + `<path d="M8 98c0-9 7-15 16-15 6 0 10 4 11 9" fill="url(#${g})" stroke="${INK}" stroke-width="1.6"/><path d="M92 98c0-9-7-15-16-15-6 0-10 4-11 9" fill="url(#${g})" stroke="${INK}" stroke-width="1.6"/>`
      + `<path d="M50 86v14" stroke="#6B4429" stroke-width="5"/><path d="M38 89.5h24" stroke="${GOLD}" stroke-width="4.4" stroke-linecap="round"/><path d="M38 89.5h24" stroke="${GOLD_DEEP}" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>`;
  }
  const tunic = [...(cfg?.accessories ?? [])].find((a) => a && typeof a === 'object' && (a.id === 'tunic' || a.id === 'gown' || a.id === 'apron'));
  const col = tunic?.color ?? (cfg?.outfit?.armour ? '#8C8F93' : deep);
  return `<path d="M10 100c3-9 16-14 40-14s37 5 40 14Z" fill="${col}" stroke="${INK}" stroke-width="1.6"/>`
    + (tunic?.trim ? `<path d="M36 87.5q14 8 28 0" fill="none" stroke="${tunic.trim}" stroke-width="2.4"/>` : '')
    + `<path d="M30 92c6-4 12-5 20-5s14 1 20 5" fill="none" stroke="${base}" stroke-width="5" stroke-linecap="round" opacity=".9"/>`;
}

function headwear(acc, cfg) {
  let s = '';
  if (acc.has('hood')) {
    const c = acc.get('hood').color ?? '#5E7F3E';
    s += `<path d="M8 76C4 36 26 12 50 12s46 24 42 64l-7-2c1-26-12-42-35-42S14 48 15 74Z" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
      + '<path d="M24 26q26-14 52 0" fill="none" stroke="#fff" stroke-width="1.6" opacity=".25"/>';
  }
  if (acc.has('coif')) s += `<path d="M10 74C8 38 28 18 50 18s42 20 40 56l-6-1c0-24-13-40-34-40S16 49 16 73Z" fill="#F4ECDD" stroke="${INK}" stroke-width="1.8"/>`;
  if (acc.has('potHelm')) s += `<path d="M20 38C22 18 34 10 50 10s28 8 30 28Z" fill="#8C8F88" stroke="${INK}" stroke-width="2"/><path d="M14 38h72" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M14 38h72" stroke="#A7AAA2" stroke-width="3" stroke-linecap="round"/><path d="M30 18q8-5 14-5" stroke="#fff" stroke-width="2" opacity=".5" stroke-linecap="round"/><path d="M86 34q8 0 8 6" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
  if (acc.has('bucketHelm')) s += `<path d="M24 38 28 10h44l4 28Z" fill="#9AA0A8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M24 38h52" stroke="${INK}" stroke-width="2.4"/><path d="M34 14v20" stroke="#fff" stroke-width="2" opacity=".4"/>`;
  if (acc.has('plumedHelm')) {
    const a = acc.get('plumedHelm');
    const plate = a.style === 'rusty' ? '#8C8F93' : '#B8BEC6';
    s += `<path d="M58 12c12-12 30-8 32 6-8-6-18-6-26 2Z" fill="${a.plume ?? '#A3202C'}" stroke="${INK}" stroke-width="1.6"/>`
      + `<path d="M18 42C18 20 32 10 50 10s32 10 32 32Z" fill="${plate}" stroke="${INK}" stroke-width="2"/><path d="M50 10v32" stroke="${INK}" stroke-width="1.6" opacity=".5"/>`
      + (a.style === 'rusty' ? '<circle cx="34" cy="28" r="3" fill="#8E5A3A" opacity=".7"/><circle cx="66" cy="22" r="2" fill="#8E5A3A" opacity=".6"/>' : '');
    if (a.nightcap) s += '<path d="M30 14c10-12 30-12 42 2l14 10" fill="none" stroke="#7A9CC6" stroke-width="5" stroke-linecap="round"/>';
  }
  if (acc.has('wizardHat')) s += `<path d="M22 32 52-6l26 38Z" fill="#5C4A9C" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M18 32h64" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M18 32h64" stroke="#6E5BB0" stroke-width="4" stroke-linecap="round"/><path d="M30 26h40" stroke="#F2D16B" stroke-width="3"/><circle cx="56" cy="8" r="2.2" fill="#F2D16B"/>`;
  if (acc.has('sergeantCap')) s += `<path d="M24 32c2-12 12-18 26-18s24 6 26 18Z" fill="#3E4A5A" stroke="${INK}" stroke-width="2"/><path d="M22 32h56" stroke="#D9B26A" stroke-width="3.4" stroke-linecap="round"/><circle cx="50" cy="22" r="3" fill="#D9B26A"/>`;
  if (acc.has('tiara')) s += `<path d="M36 30 40 20l5 7 5-11 5 11 5-7 4 10Z" fill="#E8C66A" stroke="${GOLD_DEEP}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="22" r="2.4" fill="${acc.get('tiara').gem ?? PINK}"/>`;
  if (acc.has('strawHat')) s += `<ellipse cx="50" cy="30" rx="40" ry="7" fill="#D9BC6A" stroke="${INK}" stroke-width="1.8"/><path d="M30 30c0-12 9-18 20-18s20 6 20 18Z" fill="#E3C97A" stroke="${INK}" stroke-width="1.8"/><path d="M30 27h40" stroke="#C2353B" stroke-width="3"/>`;
  if (acc.has('bakerHat')) s += `<path d="M30 32c-8-2-10-12-2-16 2-8 12-10 16-4 4-6 14-4 16 2 8-2 12 8 6 14Z" fill="#FBF8F1" stroke="${INK}" stroke-width="1.8"/><rect x="30" y="28" width="40" height="7" rx="2" fill="#F1ECE0" stroke="${INK}" stroke-width="1.6"/>`;
  if (acc.has('flowerCrown')) {
    const f = (x, y, c) => `<g transform="translate(${x} ${y})"><circle r="3.4" cx="-2.6" fill="${c}"/><circle r="3.4" cx="2.6" fill="${c}"/><circle r="3.4" cy="-2.6" fill="${c}"/><circle r="3.4" cy="2.6" fill="${c}"/><circle r="2" fill="#F2D16B"/></g>`;
    s += '<path d="M22 34q28-12 56 0" fill="none" stroke="#5E7F3E" stroke-width="2.6"/>' + f(28, 31, '#F2A2B8') + f(40, 27, '#FFFFFF') + f(52, 26, '#B9A3D6') + f(64, 27, '#F2A2B8') + f(75, 31, '#FFFFFF');
  }
  if (acc.has('scarf')) {
    const c = acc.get('scarf').color ?? '#C2353B';
    s += `<path d="M24 88c8 4 18 6 26 6s18-2 26-6v8c-8 4-18 6-26 6s-18-2-26-6Z" fill="${c}" stroke="${INK}" stroke-width="1.6"/><path d="M64 92l6 8h-9Z" fill="${c}" stroke="${INK}" stroke-width="1.4"/>`;
  }
  return s;
}

function bow(b) {
  const c = b.color ?? PINK, sh = b.shade ?? PINK_DEEP, li = b.light ?? '#FFD2DE', k = b.knot ?? '#E88AA6';
  // on her LEFT ear = the viewer's right in a front-facing portrait (§3.1 hard rule)
  return `<g transform="translate(72 15) rotate(22) scale(1.05)">`
    + `<path d="M0 0-12.5-7.5c-1.6-1-3.6.2-3.6 2v11c0 1.8 2 3 3.6 2Z" fill="${c}" stroke="${sh}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M0 0 12.5-7.5c1.6-1 3.6.2 3.6 2v11c0 1.8-2 3-3.6 2Z" fill="${c}" stroke="${sh}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M-12-3.5-5-.5M12-3.5 5-.5" stroke="${li}" stroke-width="1.8" stroke-linecap="round"/>`
    + `<ellipse rx="3.4" ry="3.8" fill="${k}" stroke="${sh}" stroke-width="1.4"/></g>`;
}

// ------------------------------------------------------------------ other species
/** Pudding: matches the recoloured Dragon_Evolved model — rust-orange hide, red belly / mouth, blue-grey horns and
 *  fangs, grey half-lidded sleepy eyes (§3.6 "huge, nervous"). */
function dragonFace(o) {
  const HIDE = '#A4532A', HIDE_D = '#7A3A1C', HIDE_L = '#BE6A3C', BELLY = '#D2443C', HORN = '#9AA3B5', HORN_D = '#6E7688';
  const wide = o.expression === 'surprised' || o.expression === 'worried';
  const shut = o.expression === 'sleep';
  const lidY = wide ? 39 : 47; // upper lid edge: half-lidded by default
  const eye = (x, flip) => shut
    ? `<path d="M${x - 9} 48q9 5 18 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
    : `<ellipse cx="${x}" cy="48" rx="9" ry="8.5" fill="#D6D9E0" stroke="${INK}" stroke-width="1.8"/>`
      + `<circle cx="${x + flip}" cy="${wide ? 47 : 50.5}" r="${wide ? 3.6 : 3.2}" fill="#3A3F4A"/><circle cx="${x + flip - 1.2}" cy="${wide ? 45.6 : 49.4}" r="1.1" fill="#fff"/>`
      + `<path d="M${x - 10} ${lidY}Q${x} ${lidY - 3} ${x + 10} ${lidY}L${x + 10} 38Q${x} 33 ${x - 10} 38Z" fill="${HIDE}"/>`
      + `<path d="M${x - 10} ${lidY}Q${x} ${lidY - 3} ${x + 10} ${lidY}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  return '<circle cx="50" cy="50" r="50" fill="#CFC6B8"/>'
    // blue-grey horns sweeping up and out
    + `<path d="M30 30 14 8c-2-3 2-5 4-3l18 18M70 30 86 8c2-3-2-5-4-3L64 23" fill="${HORN}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + `<path d="M20 12 30 25M80 12 70 25" stroke="${HORN_D}" stroke-width="1.6" stroke-linecap="round"/>`
    // head
    + `<path d="M50 18c22 0 36 14 36 32 0 10-4 16-10 22 4 8 2 22-26 24-28-2-30-16-26-24-6-6-10-12-10-22 0-18 14-32 36-32Z" fill="${HIDE}" stroke="${INK}" stroke-width="2.2"/>`
    + `<path d="M50 14l-4 8h8ZM39 18l-1 8 7-3ZM61 18l1 8-7-3Z" fill="${HIDE_D}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`
    + `<ellipse cx="50" cy="32" rx="16" ry="6" fill="${HIDE_L}" opacity=".55"/>`
    // snout + red mouth with grey fangs
    + `<ellipse cx="50" cy="76" rx="21" ry="13" fill="${HIDE_L}" stroke="${INK}" stroke-width="1.8"/>`
    + `<ellipse cx="43" cy="71" rx="2.4" ry="1.6" fill="${INK}"/><ellipse cx="57" cy="71" rx="2.4" ry="1.6" fill="${INK}"/>`
    + `<path d="M34 79q16 ${wide ? 14 : 10} 32 0Z" fill="${BELLY}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`
    + `<path d="M39 80l2 5 2.4-4.4M56.6 80.6l2.4 4.4 2-5" fill="${HORN}" stroke="${INK}" stroke-width="1"/>`
    + eye(35, 1) + eye(65, -1)
    + (o.expression === 'happy' ? '<ellipse cx="25" cy="62" rx="5" ry="3" fill="#F28CA6" opacity=".5"/><ellipse cx="75" cy="62" rx="5" ry="3" fill="#F28CA6" opacity=".5"/>' : '');
}

function hyenaFace(o, rogue) {
  const fur = rogue ? '#8C7A62' : '#C9A36A';
  return '<circle cx="50" cy="50" r="50" fill="#D8CFC0"/>'
    + `<circle cx="24" cy="24" r="12" fill="${fur}" stroke="${INK}" stroke-width="2"/><circle cx="76" cy="24" r="12" fill="${fur}" stroke="${INK}" stroke-width="2"/><circle cx="24" cy="24" r="6" fill="#4A3426"/><circle cx="76" cy="24" r="6" fill="#4A3426"/>`
    + `<path d="M50 20c22 0 34 14 34 32 0 12-6 20-14 26H30c-8-6-14-14-14-26 0-18 12-32 34-32Z" fill="${fur}" stroke="${INK}" stroke-width="2.2"/>`
    + '<g fill="#6B4A2E" opacity=".75"><circle cx="30" cy="40" r="3"/><circle cx="68" cy="36" r="3.4"/><circle cx="74" cy="50" r="2.4"/><circle cx="24" cy="54" r="2.6"/><circle cx="58" cy="30" r="2"/></g>'
    + (rogue ? `<path d="M14 54C10 26 30 10 50 10s40 16 36 44l-6-2C80 30 66 18 50 18S20 30 20 52Z" fill="#3E4A3E" stroke="${INK}" stroke-width="2"/>` : '')
    + `<path d="M30 66c4-10 12-14 20-14s16 4 20 14c-4 14-12 20-20 20s-16-6-20-20Z" fill="#4A3426" stroke="${INK}" stroke-width="1.8"/>`
    + `<ellipse cx="50" cy="62" rx="6" ry="4.4" fill="#3A2A1F"/><path d="M34 72q16 14 32 0Z" fill="#7A2A30" stroke="${INK}" stroke-width="1.6"/>`
    + '<path d="M37 73l3 4 3-3.4 3 4 4-4 4 4 3-4 3 3.4 3-4" fill="#fff" stroke="#3A2A1F" stroke-width="1"/>'
    + `<circle cx="36" cy="46" r="5" fill="#F4C04A" stroke="${INK}" stroke-width="1.6"/><circle cx="64" cy="46" r="5" fill="#F4C04A" stroke="${INK}" stroke-width="1.6"/><circle cx="36" cy="46.5" r="2.2" fill="${INK}"/><circle cx="64" cy="46.5" r="2.2" fill="${INK}"/>`
    + `<path d="M28 38 42 41M72 38 58 41" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
}

/** The rats' colours, matching enemies/props.js `P` (ratFur plum, ratBelly lilac, peach ears): portrait = model. */
const RAT = Object.freeze({ fur: '#6E5A86', face: '#7C6894', belly: '#9C88B4', ear: '#D9A494', nose: '#E58A9A', disc: '#FFE6BC' });

function ratFace(o, captain) {
  return `<circle cx="50" cy="50" r="50" fill="${RAT.disc}"/>`
    + `<circle cx="22" cy="30" r="15" fill="${RAT.fur}" stroke="${INK}" stroke-width="2"/><circle cx="78" cy="30" r="15" fill="${RAT.fur}" stroke="${INK}" stroke-width="2"/><circle cx="22" cy="30" r="9" fill="${RAT.ear}"/><circle cx="78" cy="30" r="9" fill="${RAT.ear}"/>`
    + `<path d="M50 24c18 0 30 12 30 28 0 10-8 18-18 26l-12 12-12-12c-10-8-18-16-18-26 0-16 12-28 30-28Z" fill="${RAT.face}" stroke="${INK}" stroke-width="2.2"/>`
    + `<path d="M40 70q10-8 20 0l-10 14Z" fill="${RAT.belly}"/>`
    + `<ellipse cx="50" cy="88" rx="5" ry="4" fill="${RAT.nose}" stroke="${INK}" stroke-width="1.4"/>`
    + `<circle cx="38" cy="54" r="5" fill="#2A1E18"/><circle cx="62" cy="54" r="5" fill="#2A1E18"/><circle cx="36.5" cy="52.5" r="1.6" fill="#fff"/><circle cx="60.5" cy="52.5" r="1.6" fill="#fff"/>`
    + '<g stroke="#F5EEE6" stroke-width="1.1" stroke-linecap="round"><path d="M44 82 20 76M44 85 22 88M56 82 80 76M56 85 78 88"/></g>'
    + (captain ? `<path d="M26 30c4-14 14-20 24-20s20 6 24 20Z" fill="#3E2C1E" stroke="${INK}" stroke-width="2"/><path d="M60 14c8-10 22-10 26 0-8-2-16 0-22 6Z" fill="#E8C66A" stroke="${INK}" stroke-width="1.4"/>` : '');
}

function dogFace(o, id) {
  const pug = /pug/.test(id), barkus = /barkus/.test(id), brutus = /brutus/.test(id);
  const fur = pug ? '#D9B98A' : barkus ? '#6B5A4A' : '#8A6A4A';
  let s = '<circle cx="50" cy="50" r="50" fill="#D6CEC2"/>'
    + `<path d="M22 24C8 30 6 52 14 62c6-4 10-14 12-26Z" fill="#4A3828" stroke="${INK}" stroke-width="2"/><path d="M78 24c14 6 16 28 8 38-6-4-10-14-12-26Z" fill="#4A3828" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M50 20c18 0 30 12 30 30 0 18-12 32-30 32S20 68 20 50c0-18 12-30 30-30Z" fill="${fur}" stroke="${INK}" stroke-width="2.2"/>`
    + `<ellipse cx="50" cy="68" rx="16" ry="12" fill="${pug ? '#5A4A44' : '#E8D9C4'}" stroke="${INK}" stroke-width="1.6"/>`
    + `<ellipse cx="50" cy="61" rx="7" ry="5" fill="#3A2A1F"/><path d="M50 66v6M42 74q8 6 16 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
    + `<circle cx="38" cy="46" r="5" fill="#2A1E18"/><circle cx="62" cy="46" r="5" fill="#2A1E18"/><circle cx="36.6" cy="44.6" r="1.8" fill="#fff"/><circle cx="60.6" cy="44.6" r="1.8" fill="#fff"/>`;
  if (barkus) s += `<path d="M20 34C20 16 34 8 50 8s30 8 30 26Z" fill="#5A5E66" stroke="${INK}" stroke-width="2"/><path d="M22 22 8 6l18 8M78 22 92 6 74 14" fill="#F1E6CF" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
  if (brutus) s += `<path d="M22 36C22 18 34 10 50 10s28 8 28 26Z" fill="#B8BEC6" stroke="${INK}" stroke-width="2"/><path d="M28 30h44" stroke="${INK}" stroke-width="3"/>`;
  return s;
}

function birdFace(o, pigeon) {
  const c = pigeon ? '#9AA0B4' : '#2A2B34';
  return '<circle cx="50" cy="50" r="50" fill="#D3D6D8"/>'
    + `<path d="M50 16c20 0 32 16 32 34s-14 34-32 34-32-16-32-34 12-34 32-34Z" fill="${c}" stroke="${INK}" stroke-width="2.2"/>`
    + (pigeon ? '<path d="M24 66q26 18 52 0v10q-26 14-52 0Z" fill="#6FA59A" opacity=".8"/>' : '')
    + `<path d="M42 52 50 72 58 52Z" fill="#E8A33A" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`
    + '<circle cx="36" cy="42" r="6" fill="#F4E7C9"/><circle cx="64" cy="42" r="6" fill="#F4E7C9"/><circle cx="36" cy="42" r="3" fill="#2A1E18"/><circle cx="64" cy="42" r="3" fill="#2A1E18"/>';
}

function statueFace() {
  return '<circle cx="50" cy="50" r="50" fill="#C9CDC6"/>'
    + `<path d="M24 86V44c0-18 12-30 26-30s26 12 26 30v42Z" fill="#9A9E98" stroke="${INK}" stroke-width="2.2"/>`
    + `<path d="M30 46h40v8H30Z" fill="#3A3E3A" stroke="${INK}" stroke-width="1.6"/><path d="M50 14v30" stroke="${INK}" stroke-width="1.6" opacity=".5"/>`
    + '<path d="M34 64h32M34 72h32" stroke="#7E837C" stroke-width="2"/><circle cx="66" cy="30" r="4" fill="#A7A77A" opacity=".7"/><circle cx="34" cy="78" r="5" fill="#A7A77A" opacity=".6"/>';
}

/** Relative luminance (0..1) of a hex colour. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
