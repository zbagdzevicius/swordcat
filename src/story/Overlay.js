// src/story/Overlay.js  (owner: story) — the cutscene overlay story falls back on until the ui area draws it
// (§14.2 "Cutscene letterbox bars", §14.3 Cutscene overlay / Dialogue box / Chapter card / Title). Each feature steps
// aside as soon as `ctx.ui.handles[feature]` is truthy (requests/story.md); StoryManager's Cinema routes the calls.
// Look (ART_WARM §9.1–9.2, WA §2.7): candy notecards on cream, cocoa ink, pink ribbon, butter accents; **Fredoka
// everywhere** through ui's font-role variables (`--f-logo`, `--f-head`, `--f-body`, `--f-lore`; ui/fonts.css registers
// the one Fredoka woff2), so the overlay downloads no font of its own. No colour darker than the cocoa ink family
// (`#2A1E18`–`#5A3B2E`, letterbox `#3A2630`); fades are cream `FADE_COLOR`, never black.
// No DOM at import: everything is built in init() and the class is inert where `document` is missing (node tests).
import { CHARS_PER_SEC } from './Cutscene.js';

const HAS_DOM = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

const ROUND = '"Fredoka","Nunito","Segoe UI Rounded",system-ui,sans-serif';
/** Font stacks: ui's role variables first, then rounded fallbacks (ART §9.2). Story registers no font face of its own. */
export const FONTS = Object.freeze({
  logo: `var(--f-logo,${ROUND})`,
  head: `var(--f-head,${ROUND})`,
  body: `var(--f-body,${ROUND})`,
  lore: `var(--f-lore,${ROUND})`,
});

/** Overlay palette (ART §9.1 candy tokens; WA §2.7 cocoa ink allowlist). */
export const OVERLAY_COLORS = Object.freeze({
  cream: '#FFF8EE', fade: '#FFF1DE', ink: '#5A3B2E', inkDeep: '#3A2A1F', shadow: '#4A2A1F', bar: '#3A2630',
  pink: '#FF8FB1', pinkDeep: '#E0638A', pinkEdge: '#C24E78', butter: '#FFD86B', gold: '#F2B33D', lilac: '#C9B6F2', mint: '#8FE3C0',
});

/** Portrait colours per speaker (art.md §7 coats, brightened for WA); unknown speakers get cream. */
export const PORTRAIT = Object.freeze({
  swordcat: ['#F2A65A', '#FFF1DC'], pearl: ['#EDE8F2', '#FFF6FA'], whiskerbottom: ['#B9BCC4', '#F1EEF6'], marmalade: ['#F09A45', '#FFE3B8'],
  snowpaw: ['#FFFFFF', '#D9CCF4'], mochi: ['#6A5A6E', '#F7F2EC'], sage: ['#C4C7CA', '#9CC77A'], clover: ['#F2DFC4', '#E88A52'],
  pudding: ['#F2705A', '#FFD49A'], cacklejaw: ['#D9B07A', '#FFE6C2'], pilfer: ['#B89C7C', '#F2E2CC'], coo: ['#C4CAD4', '#F4F2EE'],
  squire: ['#E3C49A', '#FFF1DC'], kitten: ['#F2D9B0', '#FFF8EC'],
});

const C = OVERLAY_COLORS;
const SCALLOP = (edge) => `radial-gradient(10px 10px at 10px ${edge},#FFF0 98%,#FFF) 0 0/20px 100% repeat-x`;
const CSS = `
.st-root{position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;font-family:${FONTS.body};font-weight:500;color:${C.ink}}
.st-root *{box-sizing:border-box}
.st-bar{position:absolute;left:0;right:0;height:0;background:${C.bar};transition:height .55s cubic-bezier(.3,.7,.3,1);z-index:2}
.st-bar.top{top:0;-webkit-mask:${SCALLOP('100%')};mask:${SCALLOP('100%')}}
.st-bar.bot{bottom:0;-webkit-mask:${SCALLOP('0')};mask:${SCALLOP('0')}}
.st-root.lb .st-bar{height:10%}
.st-fade{position:absolute;inset:0;background:${C.fade};opacity:0;z-index:9}
.st-caption{position:absolute;left:50%;bottom:16%;transform:translateX(-50%);width:min(90vw,980px);text-align:center;z-index:10;
  font-family:${FONTS.lore};font-weight:600;font-size:clamp(20px,2.6vw,34px);color:${C.cream};letter-spacing:.02em;
  text-shadow:0 2px 0 ${C.shadow},0 0 14px #4A2A1F99;opacity:0;transition:opacity .9s ease}
.st-caption.on{opacity:1}
.st-title{position:absolute;left:0;right:0;top:12%;text-align:center;z-index:8;opacity:0;transition:opacity 1.2s ease;transform:translateY(10px) scale(.92)}
.st-title.on{opacity:1;transform:none;transition:opacity 1.2s ease,transform .7s cubic-bezier(.3,1.5,.5,1)}
.st-logo{display:inline-block;position:relative;font-family:${FONTS.logo};font-weight:700;
  font-size:clamp(46px,8.2vw,112px);letter-spacing:.03em;line-height:1;
  background:linear-gradient(180deg,#FFF3B8 0%,${C.butter} 45%,${C.gold} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-stroke:5px ${C.ink};paint-order:stroke fill}
.st-o{position:relative;display:inline-block}
.st-bow{position:absolute;left:50%;top:-.16em;width:.62em;height:.34em;transform:translateX(-50%) rotate(-8deg);pointer-events:none}
.st-bow i{position:absolute;top:0;width:.3em;height:.3em;background:radial-gradient(circle at 35% 35%,#FFD2DE,#FF9FBE 55%,${C.pinkDeep});border-radius:60% 40% 55% 45%}
.st-bow i.l{left:0;transform:rotate(-24deg) scaleX(1.25)}.st-bow i.r{right:0;transform:rotate(24deg) scaleX(1.25)}
.st-bow b{position:absolute;left:50%;top:.08em;width:.12em;height:.15em;transform:translateX(-50%);border-radius:40%;background:${C.pink};box-shadow:0 0 0 .02em ${C.pinkDeep}}
.st-bow s{position:absolute;top:.2em;width:.07em;height:.22em;background:${C.pink};border-radius:0 0 40% 40%}
.st-bow s.l{left:38%;transform:rotate(18deg)}.st-bow s.r{right:38%;transform:rotate(-18deg)}
.st-sub{margin-top:.5em;font-family:${FONTS.head};font-weight:700;font-size:clamp(16px,1.9vw,26px);letter-spacing:.12em;
  color:${C.cream};text-shadow:0 2px 0 ${C.shadow}}
.st-press{position:absolute;left:0;right:0;bottom:12%;text-align:center;z-index:8;font-family:${FONTS.head};font-weight:700;
  font-size:clamp(16px,1.6vw,22px);letter-spacing:.06em;color:${C.cream};text-shadow:0 2px 0 ${C.shadow};opacity:0;transition:opacity .8s}
.st-press.on{opacity:1;animation:st-pulse 2.2s ease-in-out infinite}
@keyframes st-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
.st-chapter{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.9);z-index:11;opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.3,1.6,.5,1);
  min-width:min(560px,86vw);padding:30px 56px 34px;text-align:center;border-radius:24px;
  background:${C.cream};box-shadow:0 6px 0 ${C.lilac},0 12px 26px #5A3B2E40,inset 0 0 0 3px #FFE3EC}
.st-chapter.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.st-chapter .lab{font-family:${FONTS.head};font-weight:700;font-size:clamp(14px,1.4vw,18px);letter-spacing:.14em;color:${C.pinkDeep}}
.st-chapter .ttl{margin:.25em 0 .2em;font-family:${FONTS.logo};font-weight:700;font-size:clamp(26px,3.6vw,48px);color:${C.ink};line-height:1.1}
.st-chapter .reg{font-family:${FONTS.lore};font-weight:500;font-size:clamp(16px,1.6vw,22px);color:#8A6A55}
.st-seal{position:absolute;right:-18px;bottom:-18px;width:64px;height:64px;border-radius:50%;transform:rotate(-12deg) scale(1.6);opacity:0;
  background:radial-gradient(circle at 38% 32%,#FFC2D4,${C.pink} 55%,${C.pinkDeep});box-shadow:0 3px 0 ${C.pinkEdge},inset 0 0 0 4px #FFD2DE88;transition:transform .25s cubic-bezier(.3,1.6,.5,1),opacity .2s}
.st-chapter.stamp .st-seal{transform:rotate(-12deg) scale(1);opacity:1}
.st-seal::after{content:"";position:absolute;inset:0;background:
  radial-gradient(circle at 50% 62%,${C.cream} 0 9px,transparent 10px),radial-gradient(circle at 30% 40%,${C.cream} 0 4px,transparent 5px),
  radial-gradient(circle at 43% 30%,${C.cream} 0 4px,transparent 5px),radial-gradient(circle at 57% 30%,${C.cream} 0 4px,transparent 5px),
  radial-gradient(circle at 70% 40%,${C.cream} 0 4px,transparent 5px)}
.st-dlg{position:absolute;left:50%;bottom:calc(10% + 18px);transform:translateX(-50%) translateY(14px);width:min(860px,94vw);z-index:12;opacity:0;
  transition:opacity .22s ease,transform .28s cubic-bezier(.3,1.5,.5,1);pointer-events:none}
.st-root.nolb .st-dlg{bottom:24px}
.st-dlg.on{opacity:1;transform:translateX(-50%);pointer-events:auto;cursor:pointer}
.st-scroll{position:relative;display:flex;gap:18px;align-items:center;padding:18px 30px 18px 22px;border-radius:26px;min-height:108px;
  background:${C.cream};box-shadow:0 5px 0 #F2D6C4,0 10px 22px #5A3B2E33,inset 0 0 0 3px #FFE3EC}
.st-port{flex:0 0 76px;height:76px;border-radius:50%;display:grid;place-items:center;font-family:${FONTS.logo};font-weight:700;font-size:34px;
  color:${C.ink};box-shadow:0 0 0 4px #FFFFFF,0 0 0 7px ${C.pink},0 4px 0 7px #C24E7855}
.st-body{flex:1;min-width:0}
.st-name{display:inline-block;margin:-34px 0 6px -6px;padding:3px 18px 4px;font-weight:700;font-size:17px;letter-spacing:.02em;color:#fff;
  background:linear-gradient(180deg,#FFB0C8,${C.pinkDeep});border-radius:999px;box-shadow:0 3px 0 ${C.pinkEdge};text-shadow:0 1px 0 ${C.pinkEdge}}
.st-text{font-size:clamp(17px,1.65vw,22px);line-height:1.38;font-weight:500;min-height:2.6em;white-space:pre-wrap}
.st-text em{font-style:normal;font-weight:700;color:${C.pinkDeep}}
.st-next{position:absolute;right:26px;bottom:10px;width:18px;height:18px;opacity:0;transition:opacity .2s;animation:st-bob .9s ease-in-out infinite;
  background:radial-gradient(circle at 50% 66%,${C.pinkDeep} 0 5px,transparent 6px),radial-gradient(circle at 22% 34%,${C.pinkDeep} 0 2.5px,transparent 3.5px),
  radial-gradient(circle at 42% 18%,${C.pinkDeep} 0 2.5px,transparent 3.5px),radial-gradient(circle at 62% 18%,${C.pinkDeep} 0 2.5px,transparent 3.5px),radial-gradient(circle at 80% 34%,${C.pinkDeep} 0 2.5px,transparent 3.5px)}
.st-dlg.done .st-next{opacity:1}
@keyframes st-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.st-prompt{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);z-index:13;text-align:center;opacity:0;transition:opacity .3s}
.st-prompt.on{opacity:1}
.st-prompt .txt{font-family:${FONTS.logo};font-weight:700;font-size:clamp(26px,3.4vw,46px);letter-spacing:.02em;
  color:${C.butter};-webkit-text-stroke:4px ${C.ink};paint-order:stroke fill}
.st-ring{width:86px;height:86px;margin:10px auto 0;display:block}
.st-ring circle{fill:none;stroke-width:8}
.st-ring .bg{stroke:#FFF8EE88}.st-ring .fg{stroke:${C.butter};stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%}
.st-key{display:inline-block;min-width:1.6em;padding:0 .45em;margin:0 .15em;border-radius:9px;font-weight:700;font-size:.92em;line-height:1.45em;text-align:center;
  color:#fff;background:linear-gradient(180deg,#FFB0C8,${C.pinkDeep});box-shadow:0 2px 0 ${C.pinkEdge};font-family:${FONTS.body};font-style:normal}
.st-tut{position:absolute;left:50%;top:84px;transform:translateX(-50%) translateY(-8px);z-index:12;opacity:0;transition:opacity .35s,transform .35s;
  max-width:min(640px,90vw);padding:12px 22px 13px 58px;border-radius:20px;background:${C.cream};
  box-shadow:0 4px 0 #F2D6C4,0 8px 16px #5A3B2E33;font-size:clamp(16px,1.45vw,19px);font-weight:600;line-height:1.35}
.st-tut.on{opacity:1;transform:translateX(-50%)}
.st-tut .hd{font-family:${FONTS.head};font-size:12px;font-weight:700;letter-spacing:.12em;color:${C.pinkDeep}}
.st-tut .num{position:absolute;left:12px;top:50%;width:36px;height:36px;margin-top:-18px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;
  background:radial-gradient(circle at 38% 32%,#FFC2D4,${C.pink} 55%,${C.pinkDeep});box-shadow:0 2px 0 ${C.pinkEdge}}
.st-tut.ok{box-shadow:0 4px 0 #BFEBD6,0 8px 16px #5A3B2E33,0 0 0 3px ${C.mint}}
.st-letter{position:absolute;inset:0;z-index:15;display:grid;place-items:center;opacity:0;transition:opacity 1.1s ease;background:radial-gradient(ellipse at 50% 50%,#FFF1E200 40%,#5A3B2E80 100%)}
.st-letter.on{opacity:1}
.st-letter .pg{position:relative;width:min(640px,86vw);padding:44px 56px 50px;border-radius:18px;transform:rotate(-1.2deg);
  background:${C.cream};box-shadow:0 6px 0 ${C.lilac},0 14px 32px #5A3B2E55,inset 0 0 0 3px #FFE3EC}
.st-letter .lb{font-family:${FONTS.head};font-weight:700;font-size:13px;letter-spacing:.14em;color:${C.pinkDeep};margin-bottom:6px}
.st-letter .tt{font-family:${FONTS.head};font-weight:700;font-size:clamp(18px,2vw,24px);color:${C.ink};margin-bottom:16px}
.st-letter .tx{font-family:${FONTS.lore};font-weight:500;font-size:clamp(19px,2.2vw,28px);line-height:1.5;color:${C.inkDeep};white-space:pre-wrap;transform:skewX(-4deg)}
.st-letter .st-seal{opacity:1;transform:rotate(-12deg) scale(.8);right:-14px;bottom:-14px}
.st-skip{position:absolute;right:28px;bottom:calc(10% + 18px);z-index:14;display:flex;align-items:center;gap:8px;opacity:0;transition:opacity .2s;
  font-family:${FONTS.head};font-weight:700;font-size:14px;letter-spacing:.04em;color:${C.cream};text-shadow:0 1px 0 ${C.shadow}}
.st-root.nolb .st-skip{bottom:28px}
.st-skip.on{opacity:1}
.st-skip svg{width:34px;height:34px}
.st-skip circle{fill:none;stroke-width:5}
.st-skip .bg{stroke:#FFF8EE55}.st-skip .fg{stroke:${C.pink};stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%}
`;

const RING_C = 2 * Math.PI * 36;
const SKIP_C = 2 * Math.PI * 13;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** `[Key]` tokens → key caps, `*x*` → emphasis, ⚔ → the sword chip. Escapes everything else. Pure. */
export function glyphs(text) {
  return esc(text).replace(/\[([^\]]+)\]/g, (m, k) => `<kbd class="st-key">${k}</kbd>`)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/⚔(?![^<]*<\/kbd>)/g, '<kbd class="st-key">⚔</kbd>');
}

/** The first `n` visible characters of `text` as HTML (emphasis markers don't count). Pure. */
export function revealHtml(text, n) {
  const str = String(text ?? '');
  let out = '', left = Math.max(0, n | 0), em = false;
  for (let i = 0; i < str.length && left > 0; i++) {
    const ch = str[i];
    if (ch === '*') { out += em ? '</em>' : '<em>'; em = !em; continue; }
    out += esc(ch); left--;
  }
  if (em) out += '</em>';
  return out;
}

/** Visible length (without `*` emphasis markers). Pure. */
export const visibleLength = (s) => String(s ?? '').replace(/\*/g, '').length;

export class Overlay {
  /** @param {any} ctx @param {any} story */
  constructor(ctx, story) {
    this.ctx = ctx; this.story = story;
    this.root = null; this.el = {};
    this.letterboxOn = false;
    this.fade = { a: 0, from: 0, to: 0, t: 0, dur: 0 };
    this.line = null; this._shownChars = -1;
    this.chapterT = 0;
  }

  get ready() { return !!this.root; }

  init() {
    if (!HAS_DOM() || this.root) return;
    const doc = document;
    const style = doc.createElement('style');
    style.id = 'story-overlay-css';
    style.textContent = CSS;
    doc.head.appendChild(style);
    this.style = style;
    const host = doc.getElementById('ui') ?? doc.body;
    const root = this.root = doc.createElement('div');
    root.className = 'st-root nolb';
    root.innerHTML = `
      <div class="st-bar top"></div><div class="st-bar bot"></div>
      <div class="st-title"><div class="st-logo">SW<span class="st-o">O<span class="st-bow"><i class="l"></i><i class="r"></i><s class="l"></s><s class="r"></s><b></b></span></span>RDCAT</div><div class="st-sub"></div></div>
      <div class="st-press"></div>
      <div class="st-caption"></div>
      <div class="st-chapter"><div class="lab"></div><div class="ttl"></div><div class="reg"></div><div class="st-seal"></div></div>
      <div class="st-tut"><div class="num"></div><div class="hd"></div><div class="tx"></div></div>
      <div class="st-prompt"><div class="txt"></div><svg class="st-ring" viewBox="0 0 86 86"><circle class="bg" cx="43" cy="43" r="36"/><circle class="fg" cx="43" cy="43" r="36"/></svg></div>
      <div class="st-dlg"><div class="st-scroll"><div class="st-port"></div><div class="st-body"><div class="st-name"></div><div class="st-text"></div></div><div class="st-next"></div></div></div>
      <div class="st-letter"><div class="pg"><div class="lb"></div><div class="tt"></div><div class="tx"></div><div class="st-seal"></div></div></div>
      <div class="st-skip"><svg viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="13"/><circle class="fg" cx="17" cy="17" r="13"/></svg><span></span></div>
      <div class="st-fade"></div>`;
    host.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.el = {
      title: q('.st-title'), logo: q('.st-logo'), sub: q('.st-sub'), press: q('.st-press'), caption: q('.st-caption'),
      chapter: q('.st-chapter'), chLab: q('.st-chapter .lab'), chTtl: q('.st-chapter .ttl'), chReg: q('.st-chapter .reg'),
      tut: q('.st-tut'), tutNum: q('.st-tut .num'), tutHd: q('.st-tut .hd'), tutTx: q('.st-tut .tx'),
      prompt: q('.st-prompt'), promptTxt: q('.st-prompt .txt'), ring: q('.st-ring .fg'), ringSvg: q('.st-ring'),
      dlg: q('.st-dlg'), port: q('.st-port'), name: q('.st-name'), text: q('.st-text'),
      letter: q('.st-letter'), letLb: q('.st-letter .lb'), letTt: q('.st-letter .tt'), letTx: q('.st-letter .tx'),
      skip: q('.st-skip'), skipRing: q('.st-skip .fg'), skipTxt: q('.st-skip span'), fade: q('.st-fade'),
    };
    this.el.ring.style.strokeDasharray = `${RING_C}`; this.el.ring.style.strokeDashoffset = `${RING_C}`;
    this.el.skipRing.style.strokeDasharray = `${SKIP_C}`; this.el.skipRing.style.strokeDashoffset = `${SKIP_C}`;
    this._onClick = (e) => { e.preventDefault(); e.stopPropagation(); this.story?.advance?.(); };
    this.el.dlg.addEventListener('pointerdown', this._onClick);
  }

  // ------------------------------------------------------------------ cinema commands
  /** @param {{letterbox?:boolean, caption?:string|null, title?:any, chapter?:any, fade?:any, press?:boolean|string, skip?:number, clear?:boolean}} c */
  apply(c) {
    if (!this.root || !c) return;
    if (c.clear) this.clear();
    if (c.letterbox !== undefined) this.letterbox(!!c.letterbox);
    if (c.caption !== undefined) this.caption(c.caption);
    if (c.title !== undefined) this.title(c.title);
    if (c.press !== undefined) this.press(c.press);
    if (c.chapter !== undefined) this.chapter(c.chapter);
    if (c.fade !== undefined) this.fadeTo(c.fade);
    if (c.skip !== undefined) this.skipRing(c.skip, c.skipText);
  }

  letterbox(on) {
    this.letterboxOn = on;
    this.root?.classList.toggle('lb', on);
    this.root?.classList.toggle('nolb', !on);
  }

  caption(text) {
    const el = this.el.caption; if (!el) return;
    if (text) { el.textContent = text; el.classList.add('on'); } else el.classList.remove('on');
  }

  /** `{ text, sub, logo }` (logo = the SWORDCAT wordmark with the pink bow on the O), or null. */
  title(t) {
    const el = this.el.title; if (!el) return;
    if (!t) { el.classList.remove('on'); return; }
    this.el.sub.textContent = t.sub ?? '';
    this.el.logo.style.display = t.logo === false ? 'none' : '';
    el.classList.add('on');
  }

  press(on) {
    const el = this.el.press; if (!el) return;
    if (on) { el.textContent = typeof on === 'string' ? on : ''; el.classList.add('on'); } else el.classList.remove('on');
  }

  /** `{ label, title, region }` or null. The wax seal stamps in 0.35 s after the card appears. */
  chapter(c) {
    const el = this.el.chapter; if (!el) return;
    if (!c) { el.classList.remove('on', 'stamp'); return; }
    this.el.chLab.textContent = c.label ?? ''; this.el.chTtl.textContent = c.title ?? ''; this.el.chReg.textContent = c.region ?? '';
    el.classList.remove('stamp');
    el.classList.add('on');
    this.chapterT = 0.35;
  }

  /** `{ to: FADE_COLOR, alpha = 1, dur = 0.6 }`, a number (alpha) or null (clear). StoryManager's Cinema turns black into cream. */
  fadeTo(f) {
    const el = this.el.fade; if (!el) return;
    if (f == null || f === false) { this.fade.to = 0; this.fade.from = this.fade.a; this.fade.t = 0; this.fade.dur = 0.4; return; }
    const o = typeof f === 'number' ? { alpha: f } : f;
    if (o.to) el.style.background = o.to;
    this.fade.from = this.fade.a; this.fade.to = o.alpha ?? 1; this.fade.t = 0; this.fade.dur = Math.max(0, o.dur ?? 0.6);
    if (!(this.fade.dur > 0)) { this.fade.a = this.fade.to; el.style.opacity = String(this.fade.a); }
  }

  /** The parchment letter card: `{ label, title, text }` or null. */
  letter(c) {
    const el = this.el.letter; if (!el) return;
    if (!c) { el.classList.remove('on'); return; }
    this.el.letLb.textContent = c.label ?? ''; this.el.letTt.textContent = c.title ?? ''; this.el.letTx.textContent = c.text ?? '';
    el.classList.add('on');
  }

  skipRing(p, label) {
    const el = this.el.skip; if (!el) return;
    const on = p > 0.001;
    el.classList.toggle('on', on);
    if (on) {
      this.el.skipRing.style.strokeDashoffset = String(SKIP_C * (1 - Math.min(1, p)));
      if (label) this.el.skipTxt.textContent = label;
    }
  }

  // ------------------------------------------------------------------ dialogue
  /** Show a line (`story.line` shape) or hide the box (null). */
  dialog(line) {
    const el = this.el.dlg; if (!el) return;
    if (!line) { el.classList.remove('on', 'done'); this.line = null; return; }
    if (this.line !== line) {
      this.line = line; this._shownChars = -1;
      this.el.name.textContent = line.name ?? '';
      const [c0, c1] = PORTRAIT[line.portrait] ?? PORTRAIT[String(line.portrait ?? '').replace(/_\d+$/, '')] ?? ['#F2E4CC', '#FFF8EE'];
      this.el.port.style.background = `radial-gradient(circle at 50% 38%, ${c1} 0 30%, ${c0} 31% 100%)`;
      this.el.port.textContent = (line.name ?? '?').trim().charAt(0).toUpperCase();
      this.el.text.innerHTML = '';
    }
    el.classList.add('on');
  }

  // ------------------------------------------------------------------ prompts
  /** `story:prompt` payload (cutscene prompts: centred text + ring; tutorial: the parchment tag). */
  prompt(p) {
    if (!this.root || !p) return;
    if (p.kind === 'tutorial') return this.tutorialTag(p);
    const el = this.el.prompt;
    if (p.done) { el.classList.remove('on'); return; }
    this.el.promptTxt.innerHTML = glyphs(this.ctx.strings?.t?.(p.textKey) ?? p.textKey ?? '');
    const hold = (p.hold ?? 0) > 0 || p.action === 'chargeRelease';
    this.el.ringSvg.style.display = hold ? '' : 'none';
    this.el.ring.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, p.progress ?? 0))));
    el.classList.add('on');
  }

  tutorialTag(p) {
    const el = this.el.tut;
    if (p.done && !p.textKey) { el.classList.remove('on', 'ok'); return; }
    if (p.done) { el.classList.add('ok'); return; }
    el.classList.remove('ok');
    this.el.tutNum.textContent = String(p.step ?? '');
    this.el.tutHd.textContent = `${this.ctx.strings?.t?.('tut.title') ?? 'Morning Practice'} · ${p.step ?? ''}/${p.total ?? ''}`;
    this.el.tutTx.innerHTML = glyphs(this.ctx.strings?.t?.(p.textKey) ?? p.textKey ?? '');
    el.classList.add('on');
  }

  hideTutorial() { this.el.tut?.classList.remove('on', 'ok'); }

  clear() {
    if (!this.root) return;
    this.caption(null); this.title(null); this.press(false); this.chapter(null); this.dialog(null); this.skipRing(0); this.letter(null);
    this.el.prompt.classList.remove('on');
  }

  // ------------------------------------------------------------------ per frame
  render(frameDt) {
    if (!this.root) return;
    const f = this.fade;
    if (f.dur > 0 && f.t < f.dur) {
      f.t = Math.min(f.dur, f.t + frameDt);
      const u = f.t / f.dur, e = u * u * (3 - 2 * u);
      f.a = f.from + (f.to - f.from) * e;
      this.el.fade.style.opacity = String(f.a);
    }
    if (this.chapterT > 0 && (this.chapterT -= frameDt) <= 0) this.el.chapter.classList.add('stamp');
    const line = this.line;
    if (line) {
      const len = visibleLength(line.text);
      const n = line.complete ? len : Math.min(len, Math.floor((line.revealed ?? 0) * len + 1e-6));
      if (n !== this._shownChars) { this._shownChars = n; this.el.text.innerHTML = revealHtml(line.text, n); }
      this.el.dlg.classList.toggle('done', !!line.complete && !(line.auto > 0));
    }
  }

  dispose() {
    this.el.dlg?.removeEventListener('pointerdown', this._onClick);
    this.root?.remove(); this.style?.remove();
    this.root = null; this.el = {};
  }
}

/** Seconds a line takes to type out (for data authors: `auto` must be ≥ this + a beat). */
export const typeTime = (text) => visibleLength(text) / CHARS_PER_SEC;
