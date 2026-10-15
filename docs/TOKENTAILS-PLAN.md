# Swordcat → Token Tails: plan

Status: approved by the founder up front (2026-10-13): "make Swordcat Token Tails ready: changes towards
Token Tails IP, while keeping that pink cat with a ribbon; it is our game which we want to embed within the
Token Tails universe; fix all flaws that might exist." This plan turns four read-only audits (health, IP,
Token Tails brand and embed, code flaws) into seven work packages that can run in one pass.

Repos and branches:
- Swordcat: `/Users/zygimantasbagdzevicius/me/swordcat`, branch `tokentails`.
- Token Tails monorepo worktree: `/Users/zygimantasbagdzevicius/me/tokentails-swordcat`, branch `feat/swordcat` (based on `v2`).

Hard rules for every package: no git commit, push, branch switch, rebase or reset (the orchestrator commits);
never read `.env*`; no deploys or network transactions; Swordcat agents follow `CONTRIBUTING_AGENTS.md`
(own dev port, `SMOKE_NOHMR=1`, no build into `dist/` and no port 4173 except package SC3); Token Tails work
follows that repo's `CLAUDE.md`; nothing third-party is added without a licence recorded in
`public/assets/LICENSES.md`; no invented people, partners, facts or numbers.

---

## 1. Goals

1. **Token Tails IP.** The game ships under a Token Tails title and look, with nothing left that comes from the
   third-party viral meme it started from, the crypto tokens that used that meme, or the fan video series (see `docs/PROVENANCE.md`).
2. **Keep the pink cat with a ribbon.** Clementine ("Clem") stays the hero, with her pink satin bow on the LEFT
   ear (the existing hard rule in `Bow.js` / `configs.js`). She is re-coated to match the Token Tails mascot.
3. **Inside the Token Tails universe.** Token Tails co-branding, the Token Tails white cat as an in-world
   character, catnip as the currency, a rescue house in the hub, fonts and colours from the Token Tails
   brand, and an optional nod to the licensed Pink Paw (Rožinė pėdutė) cat names.
4. **Fix the flaws.** Every critical and high finding from the audits, plus the meaningful mediums (section 4).
5. **Embed on tokentails.com** behind a flag that defaults OFF, so production is unchanged until the founder
   flips it (section 5).

## 2. IP decisions

### 2.1 What the Token Tails mascot actually looks like (the reference)

From `tokentails-app/client/public/tail/mascot.png` and the 3×3 turnaround `mascot-from-angles.jpg` (canon):
solid ivory / off-white fur with no markings, dark maroon lineart, tall ears with salmon-pink inner ear,
large round crimson/ruby eyes with two white catchlights, small pink triangle nose, ":3" mouth, chibi
proportions (head ≈ 40 % of height), long thin white tail, no clothing, **no ribbon**. Brand prop: a gold
coin with a ":3" face (logo, `cat-promo.webp`). It has no name. 3D: `tail/mascot.glb`, `tail/mascot-animated.glb`
(`copyright: "Token Tails"`).

### 2.2 The heroine becomes the Token Tails pink-bow cat

Clementine keeps: her name (Clementine / "Clem": not from the meme), the pink satin bow on the left ear,
her chibi knight proportions, the oversized sword ("Borrowed Blade"), the nine-lives mechanic.

She changes (palette and configs only; package SC1):

| Trait | Now (meme-derived) | New (Token Tails) |
|---|---|---|
| Coat | ginger mackerel tabby + cream bib | ivory coat like the mascot (≈ #F3EEE6 base, #FFFFFF light, #DCD3C8 shade), no tabby stripes, salmon inner ear (≈ #F2A08C), pink nose |
| Eyes | blue-grey (#8DB3C2 → #3F6170) | crimson / ruby like the mascot turnaround (≈ #B3212F → #5E0E18), two catchlights |
| Cape | cream / "memeWhite" at start, red later | royal red from the start, with Token Tails gold trim (#E2C05A / #FFCC55) |
| Armour | plain silver plate | silver plate with gold trim and a small gold ":3" coin crest on the chest plate |
| Bow | pink #FF9EC0, left ear | **unchanged** |

`PAL.furGinger` and the other ginger keys stay in the palette, because other cats (e.g. Sir Marmalade) use them;
only Clementine's config points at the new ivory keys. Her silhouette must still pass the readability tests
(outline, hero-read smoke) on the cream world.

### 2.3 Names, title, world, currency, story

Display text only. Internal ids (`swordcat`, `VigilStone`, `MEME_LOOP`, file names, event names, the save
key `swordcat.save.v1`) stay, per the "nothing is ever renamed" contract. All display text lives in
`src/story/strings.js` and `src/ui/text.js`.

| Item | Now | New (default; founder may override, see "Your call") |
|---|---|---|
| Title (`GAME_TITLE`) | SWORDCAT | **PINK PAW KNIGHT** |
| Subtitle (`GAME_SUBTITLE`) | Nine Lives of Meow Island | **A Token Tails Adventure** |
| World | Meow Island | **Purrhaven Isle** (the GDD's own fallback) |
| Region L4 | The Low Gate (a fan-series episode title) | **Bramble Gate** |
| Checkpoints | Vigil Stones | **Lantern Stones** |
| Oath / pose | Vigil Oath / "Vigil" pose | **Lantern Promise** / "Promise" pose |
| Epilogue chapter | Dame Swordcat of the Ninth Seat | **Dame Clementine of Pawsbury** |
| In-world nickname line | "Could it be Swordcat? Everyone calls me that" | rewritten without "Swordcat" |
| Currency | fish (silver 1, gold 10) | **catnip** (catnip sprig 1, golden catnip 10); Swordcat-local, never Token Tails' balance |
| Heal mechanic | Milk Break (cats drinking cow's milk) | **Snack Break** with tuna snacks; Bakery sells snack satchels |
| Photo mode | Meme Cam + meme captions | **Photo Cam** with original captions |
| Hyena plates | HATER, POST STEALER, HATER-IN-CHIEF (→ HYPE-IN-CHIEF), POSTMASTER | GRUMP, SNACK SNATCHER, GRUMP-IN-CHIEF (→ CHEER-IN-CHIEF), SNACK SHARER; GRUMBLER / NAYSAYER / SCOFFER / SNEERER / SPOILER stay |
| Pilfer | "the Post Stealer" | "the Snack Snatcher" |
| Credits team | "the Swordcat team" | "Token Tails" |
| Title foot | Made with lots of purrs | A Token Tails game |
| Pawsbury hub | town hub | **Pawsbury Rescue House**: where rescued kittens live (fiction) |

Removed outright (not gated): every `homage` variant in `strings.js` and the `pick(row, homage)` branch,
"Too small for the sword", "born to :3, forced to ⚔", "me trying to handle things maturely", "The hour is gold",
"Protecting Meow Island". `config.HOMAGE_LINES` stays `false` (the constant may remain for the import).
"Nine Lives" stays as a difficulty and lives mechanic name (generic cat lore), and "Golden Hour" stays as a
mechanic name.

Story beats kept, because they already fit Token Tails: rescue 18 lost kittens who then live visibly in
Pawsbury; "Small is not the same as weak"; "You don't have to stand alone"; "Nobody came because nobody knew";
no blood (foes poof into sparkles); dogs reconciled at the end; the banned-word list (`cage`, `war`, `kill`, …)
in `tests/unit/story.test.js`.

Story beats changed: the title loop CS-00 no longer recreates the meme poster (different camera angle, sword
lowered at her side, the Token Tails cat beside her when available); the L4 "one tiny knight holds the gate and
the champion kneels" beat keeps its gameplay but loses the fan-series wording.

### 2.4 The Token Tails cat in the game

A new procedural character config `tokentails_cat` (no new asset): ivory fur, crimson eyes, salmon inner ears,
no clothing, **no bow** (the bow is Clem's), holding a gold ":3" coin trinket. It stands in the Pawsbury Rescue
House and welcomes rescued kittens. Speaker name: "Token Tails Cat" (the mascot has no name; the founder may
give it one). Lines are string keys `name.ttcat`, `npc.ttcat.1` … `npc.ttcat.3` (SC2a writes them, SC1 uses them).

### 2.5 Pink Paw nod (fiction, no claims)

Default: four of the 18 lost kittens take the display names of licensed Pink Paw cats: **Judas, Raudvis,
Zare, Simas** (the names `tokentails-swordcat/client/components/yourcat/pinkPawPick.ts` already uses). The credits
add one line: "Four kittens here share their names with real cats at Pink Paw (Rožinė pėdutė). Their adventures
are made up." No money, donation, impact or chain words in the game (Token Tails CLAIMS R2, R3, R8, R9, R10).

**Superseded by §12 (Phase TT4, founder request 2026-10-15):** every saved cat is a real Pink Paw cat, and the
rescue card offers a sponsored treat. The money call still happens only in the host; the game carries the treat copy.

### 2.6 Look and feel

- Fonts: Nunito (body) and Passion One (titles) from `tokentails-swordcat/client/public/fonts/` (OFL; licence
  texts copied with them). Passion One has no Lithuanian glyphs, so it is used only for the title and headings
  with ASCII text; names and body text use Nunito. Fredoka stays as the fallback.
- Colours: a Token Tails skin by overriding the `:root` variables in `ui.css`: panels use Token Tails parchment
  (#F7E6B8 → #E9CF8F) with ink #4A1D08, CTA gold #FFCC55, love pink #FF7AA2; splash, title backdrop and loading
  veil use night #0B0820 → #2A1F45 with gold. In-world HUD stays light and readable.
- Logo: the title shows "PINK PAW KNIGHT" with the pink bow (fallback placement, since the new title has no "O")
  and "A Token Tails game" with `logo.webp` (copied from `tokentails-swordcat/client/public/logo/logo.webp`,
  founder-owned, already public in the Token Tails repo).
- `index.html`: title "Pink Paw Knight · Token Tails", meta description, OG/Twitter tags, favicon and
  apple-touch-icon from the Token Tails logo, `theme-color` #0B0820, splash recoloured to night/gold (the splash
  SVG paw, sword and pink bow are original and stay), pinch-zoom allowed (canvas keeps `touch-action: none`).

### 2.7 Repo hygiene for IP

- Delete from the working tree: `research/videos/`, `research/images/`, `research/ref/`, `research/next/tools/shots/`,
  `research/next/tools/dist_perf2/` and tracked `*.map` under research. Strip coin contract addresses, coin
  sites and creator handles from `research/trend.md`; move a neutral, dev-only provenance note to
  `docs/PROVENANCE.md` (not shipped, not shown in credits).
- `public/assets/LICENSES.md` loses its "Not included" memecoin section (the Credits screen renders this file).
- History rewrite of the public Swordcat repo (filter-repo of `tests/shots` and `research/` media) is a founder
  decision and is NOT done here.

## 3. What stays

The pink bow rule; Clementine's name, proportions and sword; every mechanic (combat, nine lives, companions,
abilities, lost kittens, hub, shops, Golden Hour); all levels, art kits, music and SFX; internal ids and event
names; the save key and save format (old saves keep loading); the warm, no-blood tone; Fredoka as a fallback;
all third-party CC0/OFL assets.

## 4. Flaw fixes

| # | Finding | Severity | Fix | Package |
|---|---|---|---|---|
| F1 | Heroine, title, subtitle, captions, Vigil / Low Gate lore from meme, memecoins and fan series | critical | Section 2 | SC1, SC2a, SC2b |
| F2 | Credits screen prints "memecoin" from LICENSES.md | high | Remove the section; `licensesHtml` skips any "Not included" section defensively | SC2a, SC2b |
| F3 | Third-party media committed under `research/` | high | Delete from tree (2.7); history rewrite is a founder call | SC2a |
| F4 | `?test` / `?debug` / `?perf` (god mode, `window.__GAME__`, teleport) work in production | high | Hooks only when `import.meta.env.DEV` or the build flag `VITE_SWORDCAT_DEBUG=1`; `?level` / `?spawn` ignored in production; `npm run build:test` builds a hooks-on bundle into `dist-test/` for smoke | SC3 |
| F5 | No WebGL context-loss handling | high | `webglcontextlost` → preventDefault, stop loop, save, "Tap to continue" overlay; restore or tap → reload | SC3 |
| F6 | Level / chunk load failure leaves an empty scene | high | Import + preload first, unload after; catch → keep old level and show a Retry panel; `vite:preloadError` reload-once guard; friendly boot error with Reload | SC3 |
| F7 | JS heap 202 MB vs 120 MB | high | Call `releaseCpuOnUpload(level.root)` after build and warm-up (respect `userData.keepCpu`), free audio bytes after decode (no `slice(0)` copy; drop `_bytes` and `bin:` cache), `Assets.release()` drops unlisted `bin:` entries | SC3 (LevelManager call), SC5 (Assets, audio) |
| F8 | Smoke `core:touch`: ground tap near a prop gives an attack order, tap-to-move fails | high | Fix the picker so a ground tap that is not on an attackable's pick area gives a move order, or move the test spot if Phase W props made it stale; both orientations | SC4 |
| F9 | Smoke `controls:touch`: first ⚔ tap lost | high | First tap on the attack button always swings (pointer capture / state race) | SC4 |
| F10 | Smoke `flow:first-minute` (no first reward ≤ 60 s) and `story:tutorial-touch` (practice never ends) | high | Find the regression against a hooks-on build; fix the reward emit / tutorial completion on touch | SC4 |
| F11 | `dist/` race between parallel builds and smoke | high | Smoke uses `dist-test/` built by `build:test`; package agents use their own dev server; only SC3 builds | SC3 |
| F12 | Camera smoke failures (presets, occlusion, teamfight hold, threat visibility, reduce-motion) | med | Re-run against a dev server with no other load; fix real failures; if a number is a spec target that is reported elsewhere, mark it report-only with a comment citing STATUS | SC4 |
| F13 | `ui:touch-cluster`: Meow button over the cat | med | Move the Meow button in `touchLayout.js` outside the 109 px dead ring | SC4 |
| F14 | `characters:hero-read`: practice tunic hides the sword | med | Fix the tunic variant so the sword stays on screen | SC1 |
| F15 | iOS audio: silent switch mutes all, music may start outside the gesture | med | `navigator.audioSession.type = 'playback'` when available; synchronous muted `play()` on music decks inside the gesture | SC5 |
| F16 | Save gaps: newer-version saves overwritten, no-storage silently "saves", two tabs clobber | med | Read-only when `v > SAVE_VERSION`; emit a one-time "can't save in this browser mode" toast; `storage` listener offers reload | SC5 |
| F17 | Music at 320 kbps (≈ 33 MB) | med | Re-encode the shipped music MP3s to 128 kbps (same names, same format) | SC5 |
| F18 | Phone-portrait framing misses targets | med | Not fixed in this pass (spec conflict); the embed page recommends landscape on phones; see "Left out" | – |
| F19 | Bundle over report-only budgets; 90 MB dist | med | F7 and F17 shrink heap and download; GLB optimisation of KayKit skeletons if visually identical | SC5 |
| F20 | Root scratch scripts, `.gitignore` gaps, merged comment in `vite.config.js`, dev port clash with catnip-heist (5173), no `engines` | low | Move `_*.mjs` to `scripts/dev/`; ignore `dist-*/`, `*.map`, research outputs, `.DS_Store`; fix comment; dev port 5175; `"engines": {"node": ">=22"}` | SC3 |
| F21 | Pinch-zoom blocked, empty favicon, no metadata | low | 2.6 | SC3 |
| F22 | Licence evidence gaps (Ultimate Monsters file header, Cube Pets version, Cute Monsters missing) | low | Note them in LICENSES.md as known gaps (packs are not shipped); do not fetch | SC2a |

## 5. Embed design (tokentails.com)

### 5.1 Route and page (package TT1)

- `client/pages/swordcat.tsx`, modelled on `pages/heist.tsx`: `<FirebaseAuthProvider authMode="optional">`,
  `SeoHead` (title "Pink Paw Knight - Token Tails", `noindex` while flagged), `<SwordcatHost/>`.
- When the flag is off the page renders nothing but a client redirect to `/game` (works in both the web build
  and the Capacitor static export). `/swordcat` is added to the sitemap `exclude` list.
- `SwordcatHost`: full-bleed night background, one iframe with `src = NEXT_PUBLIC_SWORDCAT_URL + ?embed=1`,
  `allow="autoplay; fullscreen; gamepad"`, `title="Pink Paw Knight"`, the frame inside the safe area, an exit button
  back to `/game` (44 px, 6 px inside the frame's top-left corner; in embed mode the game keeps a 56 px corner free of
  HUD, `--embed-gut` in `src/ui/ui.css`, final pass 2026-10-14), a "Turn your phone sideways for the best view" hint on portrait phones (dismissable).
  No `sandbox` attribute (the game needs same-site storage and WebGL). Pauses the game while a Token Tails
  `GameModal` is open, using the existing suspension registry pattern from `components/heist/suspension.ts`
  (imported, not edited).

### 5.2 Flags (all default OFF)

| Flag | Meaning |
|---|---|
| `NEXT_PUBLIC_SWORDCAT` | `1`/`true`/`yes`/`on` enables `/swordcat`. Anything else: redirect to `/game`. |
| `NEXT_PUBLIC_SWORDCAT_URL` | Optional override (absolute https URL, http://localhost, or a same-origin path). Default: the same-origin build `/swordcat-game/index.html` (founder decision 2026-10-14, §5.4). |
| `NEXT_PUBLIC_SWORDCAT_PICKER` | `1`/… shows the card in the PLAY picker. Requires the page flag too. |

Documented in `docs/CLIENT.md`; the game is described in `docs/GAMES.md`.

### 5.3 Picker card

`GameSelectModal.gameCards()` gets an `includeSwordcat` option behind `swordcatPickerEnabled()` (unit-tested like
`heistPickerEnabled`): `{ key: 'SWORDCAT', href: '/swordcat', title: 'PINK PAW KNIGHT', description: 'Rescue lost
kittens with a tiny knight', badge: 'NEW', previewVariant: 'SWORDCAT' }`. `key` is a free string and `type` is
omitted, so no `GameType` is added. The preview is an inline SVG (sword and pink bow on night/gold), so no new
image file is needed.

### 5.4 Hosting

Founder decision 2026-10-14: same origin at tokentails.com, like Catnip Heist's `client/public/heist-game/`, not a
subdomain. `npm run build:tokentails` here builds and runs `scripts/copy-to-tokentails.mjs`, which replaces
`tokentails-swordcat/client/public/swordcat-game/` with `dist/` minus `.vite/` and source maps (`--dest` /
`TT_SWORDCAT_DEST` for another checkout; it refuses a single file over 50 MB). `/swordcat` frames
`/swordcat-game/index.html?embed=1`; `base: './'` keeps every path relative, so no base path is needed. The copy is
large (see STATUS.md for the measured size): it lands in every Vercel deploy and in the Capacitor app, so an asset
diet, Git LFS or a CDN override (`NEXT_PUBLIC_SWORDCAT_URL`) are the options if that is too much. Local dev against
the game's dev server: `NEXT_PUBLIC_SWORDCAT_URL=http://localhost:5175/` with `npm run dev` here.

### 5.5 postMessage bridge, version 1

Envelope: `{ ns: 'tt-swordcat', v: 1, type, ...payload }`. Unknown types are ignored. The host says `hello` until it
hears `ready` (every 0.5 s for 10 s, then every 2 s, no hard stop; a "still loading" note at 10 s, a Reload / Back panel
at 2 min) and again after the frame reloads (final pass 2026-10-14: the first version gave up after 10 s).

Host → game:

| type | payload | game does |
|---|---|---|
| `hello` | – | replies `ready` |
| `session` | `{ signedIn: boolean }` | stores it (no token, ever) |
| `audio` | `{ muted: boolean }` | mutes / unmutes master |
| `pause` / `resume` | – | enters / leaves the pause menu state |

Game → host:

| type | payload | from event |
|---|---|---|
| `ready` | `{ version }` | `GAME_READY` (or on `hello`) |
| `level-complete` | `{ levelId, time, kittens, catnip, lives, rank }` | `LEVEL_RESULTS` (`fish` is sent as `catnip`) |
| `kitten-rescued` | `{ kittenId }` | `KITTEN_RESCUED` |
| `paused` | `{ paused }` | `GAME_PAUSE` |

Security: the game accepts messages only when `event.source === window.parent` and `event.origin` is in an
allowlist (`VITE_EMBED_ORIGINS`, default `https://tokentails.com,https://www.tokentails.com,http://localhost:3000`),
and posts to that exact origin, never `'*'`. The host accepts only `event.source === iframe.contentWindow` and
`event.origin === new URL(NEXT_PUBLIC_SWORDCAT_URL, location.href).origin`. The host never sends the
`accesstoken` or Firebase token. In embed mode the game hides its own Fullscreen and Quit menu items
(`document.documentElement.dataset.embed === '1'`) and never installs debug hooks.

### 5.6 Scores

**Phase 1 (this pass): no score saves.** The host receives `level-complete` and does nothing with it except
optional console debug. Reasons: `GameType`, caps and bridge types live in `shared/`, which this pass may not
touch, and Swordcat has no deterministic replay, so any posted score could be forged.

**Phase 2 (later, needs founder OK to edit `shared/` and the backend):** add `SWORDCAT` to `shared/enums.ts` with a
tiny cap table (chapter clears only), regenerate every copy (docs/DEVELOPMENT.md), and post `{type:'SWORDCAT',
level, outcome:'won'}` only through `POST /user/catbassadors/live` from the host, earning no catnip or Tails
(like the Heist). No second write path.

## 6. Work packages (disjoint file ownership)

Each package edits only its own files. A package that needs something from another writes it to its own
`requests/tokentails-<id>.md` and codes defensively. String keys used across packages are fixed here:
`name.ttcat`, `npc.ttcat.1..3` (SC2a writes, SC1 reads); config id `tokentails_cat` (SC1 writes, SC2a cutscenes read
defensively); `document.documentElement.dataset.embed` (SC3 sets, SC2b reads).

| Id | Title | Repo | Dev port |
|---|---|---|---|
| SC1 | Heroine re-coat, Token Tails cat NPC, plate words | swordcat | 5313 |
| SC2a | Story text, names, credits text, research purge, docs | swordcat | 5321 |
| SC2b | UI brand: title logo, fonts, Token Tails skin, currency icons, menus | swordcat | 5322 |
| SC3 | Core: debug gating, embed bridge, recovery, build/smoke infra, index.html | swordcat | 5301 |
| SC4 | Mobile and smoke regressions: touch, tutorial, first reward, camera | swordcat | 5314 |
| SC5 | Memory, audio, saves, music size | swordcat | 5323 |
| TT1 | Token Tails `/swordcat` page, host bridge, picker card, docs | tokentails | – |

Ownership and tasks are listed in the orchestrator's package list (same content as below, in short).

- **SC1** owns `src/characters/**`, `src/enemies/names.js`, `src/core/config.js`, `src/world/Hub.js`,
  `src/companions/NpcActor.js`, `src/companions/HubKittens.js`, `tests/unit/characters.test.js`,
  `tests/unit/enemies.test.js`, `tests/unit/companions.test.js`, `tests/unit/world.test.js`,
  `tests/smoke/characters.mjs`, `tests/smoke/enemies.mjs`, `tests/smoke/companions.mjs`, `tests/smoke/world.mjs`, `requests/tokentails-sc1.md`.
- **SC2a** owns `src/story/strings.js`, `src/ui/text.js`, `src/story/cutscenes/**`, `src/story/dialogue/**`,
  `public/assets/LICENSES.md`, `public/assets/licenses/**`, `research/**`, `GAME_DESIGN.md`, `docs/PROVENANCE.md`,
  `tests/unit/story.test.js`, `tests/unit/contracts.test.js`, `requests/tokentails-sc2a.md`.
- **SC2b** owns `src/ui/**` except `text.js`, `touch.js`, `touchLayout.js`, `touchEditor.js`; plus
  `public/assets/fonts/**`, `public/assets/ui/**`, `tests/unit/ui.test.js`, `tests/unit/colorLanguage.test.js`,
  `tests/smoke/ui.mjs`, `tests/smoke/art.mjs`, `requests/tokentails-sc2b.md`.
- **SC3** owns `src/core/Game.js`, `src/core/debug.js`, `src/core/embed.js` (new), `src/core/recovery.js` (new),
  `src/main.js`, `src/world/LevelManager.js`, `index.html`, `public/favicon.png`, `public/apple-touch-icon.png`,
  `public/og.jpg`, `vite.config.js`, `package.json`, `package-lock.json`, `.gitignore`, `STATUS.md`, `README.md`,
  `_alloc.mjs`, `_dbg.mjs`, `_fx.mjs`, `_rate.mjs`, `scripts/dev/**`, `tests/smoke.mjs`, `tests/smoke/gates.mjs`,
  `tests/smoke/slice.mjs`, `tests/smoke/embed.mjs` (new), `tests/unit/core.test.js`, `tests/unit/events.test.js`,
  `tests/unit/embed.test.js` (new), `tests/unit/levelload.test.js` (new), `requests/tokentails-sc3.md`.
- **SC4** owns `src/core/Input.js`, `src/ui/touch.js`, `src/ui/touchLayout.js`, `src/ui/touchEditor.js`,
  `src/camera/**`, `src/player/**`, `src/combat/**`, `src/story/tutorial.js`, `src/story/rewards.js`,
  `src/story/quests.js`, `tests/smoke/core.mjs`, `tests/smoke/controls.mjs`, `tests/smoke/flow.mjs`,
  `tests/smoke/story.mjs`, `tests/smoke/camera.mjs`, `tests/smoke/player.mjs`, `tests/smoke/combat.mjs`,
  `tests/unit/controls.test.js`, `tests/unit/camera.test.js`, `tests/unit/player.test.js`, `tests/unit/nav.test.js`,
  `tests/unit/combat.test.js`, `tests/unit/combat.warm.test.js`, `requests/tokentails-sc4.md`.
- **SC5** owns `src/core/Assets.js`, `src/audio/**`, `src/save/**`, `public/assets/audio/music/**`,
  `public/assets/models/characters/kaykit/**`, `scripts/optimize-glb.mjs`, `scripts/bundle-budget.mjs`,
  `tests/unit/save.test.js`, `tests/unit/assets.test.js`, `tests/unit/audio.test.js`, `tests/smoke/save.mjs`,
  `tests/smoke/audio.mjs`, `tests/smoke/perf.mjs`, `requests/tokentails-sc5.md`.
- **TT1** owns, in `/Users/zygimantasbagdzevicius/me/tokentails-swordcat`: `client/pages/swordcat.tsx`,
  `client/components/swordcat/**`, `client/components/shared/GameSelectModal.tsx`,
  `client/__test__/game-select-modal.test.tsx`, `client/__test__/swordcat-*.test.ts(x)`,
  `client/next-sitemap.config.js`, `docs/CLIENT.md`, `docs/GAMES.md`.

Build and smoke order (orchestrator, after all packages): `npm run test:unit` → `npm run build` (SC3's rules) →
`npm run build:test` → `npm run smoke` (serialised; nothing else builds meanwhile). Package agents never build
into `dist/` or `dist-test/`; SC5 may build into its own `dist-sc5/` and delete it after.

## 7. Acceptance criteria

1. A grep for the old title, world, lore and meme / token names (the list lives in `tests/unit/story.test.js`) over
   the **display text** (`src/story/strings.js`, `src/ui/text.js`, `public/assets/LICENSES.md`, `index.html`) finds
   no hit except internal keys / ids (e.g. `name.swordcat` key with value "Clem"). A unit test in
   `tests/unit/story.test.js` enforces the banned display words list including these.
2. No `homage` variant exists in `strings.js`.
3. Clementine renders with an ivory coat, crimson eyes, red cape with gold trim and the pink bow on the left ear
   (characters smoke screenshots read by SC1); the Token Tails cat stands in Pawsbury with no bow.
4. The Credits screen shows no "Not included" section and credits Token Tails.
5. A production build (`npm run build`) opened with `?debug`, `?test`, `?perf`, `?level=gate` behaves exactly like
   no query: no `window.__GAME__`, no lil-gui, normal save load. `npm run build:test` + `npm run smoke` passes with
   hooks on.
6. `npm run test:unit` is green in Swordcat (1033 + new tests).
7. The smoke blocks that failed in the audit (`core:touch`, `controls:touch`, `flow:first-minute`,
   `story:tutorial-touch`, `ui:touch-cluster`, `characters:hero-read`, the camera blocks) pass, or a remaining
   failure is a documented, report-only spec gap in STATUS.md with the reason.
8. Killing the WebGL context (`WEBGL_lose_context`) shows the overlay; a forced level import failure keeps the old
   level and shows Retry (unit-tested in `tests/unit/levelload.test.js`, smoke-tested in `tests/smoke/embed.mjs`).
9. Embed: with `?embed=1` inside a test parent page, `hello` gets `ready`, `pause` pauses, a message from a wrong
   origin is ignored, and the game posts only to the allowed origin (`tests/smoke/embed.mjs`).
10. Built heap after the title and the meadow is reported in STATUS.md (target ≤ 120 MB; must be lower than 202 MB).
11. `dist/` shrinks by at least 15 MB from the music re-encode.
12. Token Tails: with no `NEXT_PUBLIC_SWORDCAT*` set, the picker and every page are unchanged and `/swordcat`
    redirects to `/game`; `npx tsc --noEmit`, `npx eslint` on the changed files and `npm test` pass in `client/`.
    No file under `shared/`, `backend/`, `contracts/`, `catnip-heist/`, `client/public/heist-game/`,
    `client/components/shelter-payouts/` or `funding/` changed.

## 8. Deliberately left out

- **Score saves to Token Tails** (Phase 2 in 5.6), any `GameType`, cap or `shared/` change, any catnip or Tails
  earned on tokentails.com from Swordcat.
- **Deploying / hosting** the Swordcat build and DNS for a subdomain.
- **Git history rewrite** of the public Swordcat repo (`tests/shots`, `research/` media) and deleting the 121.5 MB
  of unused source packs from `public/assets` (they never ship; removing them only matters together with the
  history rewrite).
- **Phone-portrait AUTOCAM retune** (spec conflict between `minCatPxPortrait` and the 9 m ground width); the
  host page recommends landscape instead.
- **Bog and keep levels (M3 stubs)**, hero bake (H7), hub LOD, meadow prop merging.
- **UI scale setting and sound-cue captions** (accessibility lows).
- A code licence file: the founder picks one; the README states "All rights reserved, Token Tails" until then.
- Legal sign-off: the renames remove the known meme, memecoin and fan-series material; a lawyer's check is still
  the founder's call.

## 9. Your call (defaults applied if no answer)

| Question | Default |
|---|---|
| Final game title and subtitle | PINK PAW KNIGHT / A Token Tails Adventure |
| Currency name | catnip (Swordcat-local, never the Token Tails balance) |
| Name for the Token Tails cat | none: "Token Tails Cat" |
| Use the four Pink Paw cat names for lost kittens | yes (Judas, Raudvis, Zare, Simas) with the "adventures are made up" credit line |
| Hosting | same origin, `client/public/swordcat-game/` (decided 2026-10-14) |
| Rewrite the public Swordcat repo history to purge research media and old screenshots | not done; recommended before launch |
| Code licence | All rights reserved, Token Tails |
| Phase 2 score saves | not done; needs OK to edit `shared/` and backend |

---

## 10. Phase TT2: Token Tails + Pink Paw theme, guided onboarding

Status: requested by the founder on 2026-10-14: "make sure it's ultimately Token Tails themed. Currently the intro
doesn't guide where to go: create footprints showing where to go, as it's not clear how to pass every onboarding
step (or make it faster). It must be both Pink Paw and Token Tails themed." Built from three read-only audits on
2026-10-14 (a Playwright playthrough of the intro from a new save, a Token Tails theming audit, a Pink Paw facts
audit) plus the leftovers of the first fix pass (checkpoints swordcat `d6fa734`, tokentails-swordcat `b76f405f`).
Hard rules from the top of this file still apply; in addition, the founder's dev server on port **5180** is never
killed, restarted or bound, and every agent kills only the servers it started.

### 10.1 What the audits found (short)

**Onboarding (playthrough at 1280×720 mouse and keyboard, plus phone landscape).**

- Two dead ends. (1) The jump lesson cannot be passed with click or tap: the move order paths around the fence
  (the fence nav link opens only after `tut.jump.done`, `meadow.js:630`), so F (jump before TT3; Space since §11.2) while walking never counts; only
  WASD/stick + F works and nothing on screen says WASD. (2) The parry lesson stalls silently: Sir Wobble swings only
  within 1.6 m and after the block he ended 2.57 m away (about 100 s waited, `parryFails` 10, no feedback).
- In 5 of 7 lessons the target starts off-screen and nothing points at it: `beaconState()` returns `'off'` in
  practice (`beacon.js:128`). Clem sits at y≈480 of 720, so only 130–220 px of ground is visible south of her,
  where the practice field is; clicks lower than that land on the ability bar and are dropped silently.
- About 141 s of scenes before the first fight (tutlook 1.7, tutbow 11.2, tutpearl 9.1, CS-01 36.6, CS-02 56.1,
  CS-01b 16.3, G-01 10.0), plus D-01 18.3 after it. A realistic human without blockers needs 5–6 min to the first
  fight; the audit run needed 12 min. The first fight (2 rats, 8 HP) killed an idle player in 15 s.
- Skipping exists (hold Esc / ❚❚ 1 s) but is explained only after 20 s on a lesson, and the scene ring appears only
  while already holding. A new player cannot skip practice from the title.
- The existing guide (`ui/beacon.js`: gold paw badge, edge pointer, pink DOM paw trail) shows its trail for 3.6 s
  in a straight line in candy pink #FF8FB1. `StoryManager._sparkleTrail` calls `ctx.fx.guideArrow`, which does not
  exist (`StoryManager.js:792`).
- Other bugs: barn chest tag shows the raw "[Interact]" instead of "Open"; Sir Wobble's telegraph ring is drawn away
  from him; HUD and beacon stay drawn over the G-01 close-up; the Photo Cam fires on idle during the prologue; the
  tutlook shot is washed out by fog; cutscene file headers state stale lengths; the edge pointer can sit beside the
  ability bar; Lantern Stone 1's menu opens while foes 8 m away are alerted; the input-device label can flip to touch.

**Token Tails theming.** HTML UI already uses Token Tails fonts and tokens. Still off-brand: the ginger loading
paw (`index.html:67-71` #F4A462), the ginger cursor (`cursor.js:65`), Clem's ginger dialogue portrait
(`Overlay.js:30`); Fredoka on canvas text (`Plate.js:15`, `Bubble.js:9`, `rig.js:205,209`); generic KayKit red
banners and candy bunting; no Rescue House building or sign; a green-leaf catnip icon (Token Tails catnip has a
lilac flower spike); a catnip name clash with the real per-account Token Tails catnip; the title hard-coded in about
eight places per repo; no Token Tails mark on the results card or pause menu; an OG image without the game.

**Pink Paw.** True and usable: "Pink Paw" (Rožinė pėdutė), a real Lithuanian cat shelter and Token Tails' partner
shelter; four licensed cat names (Judas, Raudvis, Zare, Simas). Not usable: Pink Paw's logo (paw holding a
daisy), any shelter photo or card art inside the game, any number, city, year or size. Pink Paw has no documented
colour, so the Pink Paw pink in the game is Token Tails love pink #FF7AA2. The four named kittens wear coats that do
not match the real cats (Judas is shown grey; he is a tuxedo).

### 10.2 Guidance system: the Pink Paw trail (package G1)

One system for every objective, onboarding first, reused for every later quest step.

1. **Target source.** `ctx.story.guideTarget()` (G2) returns the current objective for every practice lesson, every
   prologue step and every later quest step (contract in 10.7). The beacon falls back to the existing
   `questTarget` when the method is missing. The beacon is no longer off in practice.
2. **Paw prints on the ground.** World-space ground decals in `fx/GroundDecals.js` (one instanced pool of at most
   14 quads, one draw call, reusing `DECAL.PAW`). Each print is an ivory pad #F3EEE6 with love-pink #FF7AA2 toe
   beans and a maroon #4A1D08 rim (the Token Tails `logo/paw.webp` look; a generic paw, not Pink Paw's logo).
   Prints alternate left/right, 1.2 m apart, along the NavGrid / Pathfind path (read-only use of
   `src/physics`), so the trail goes round fences and through gates. The path is recomputed at most at 2 Hz.
3. **Animation.** Prints light up one by one from Clem outward (0.12 s apart), then the cycle repeats every 2.5 s
   while she is idle or not closing distance; the 2–3 prints just ahead of her stay lit while she walks the right
   way. Reduced motion: static prints, no cycling.
4. **Auto-hide.** The trail fades out within 0.5 s once Clem is inside the target's `arriveR` (default 2.2 m), and
   during cutscenes, dialogue, boss fights and the results card. In ordinary fights it dims to 35 % but stays.
5. **Edge arrow.** When the target is off-screen: a gold Token Tails ":3" coin (#FFCC55) with a pink paw-tip
   pointer, 56 px on desktop and 44 px on phones, kept clear of the ability bar, hearts and the touch clusters
   (`dodgeRects`). On-screen targets get the gold coin badge where the trail ends. Hidden in cutscene and dialogue
   modes (it showed over the G-01 close-up).
6. **Objective line.** One short HUD line (≤ 40 characters, paw icon, from the target's `textKey`) at the top
   centre on desktop and under the hearts on phones; it is shown in practice too and uses the device-aware key
   glyphs. It replaces the need to read a chip at the bottom of the screen.
7. **Camera look-ahead.** `FollowCamera` biases framing toward the active target by up to 2.5 m (eased over 0.6 s)
   when the target is off-screen and she is not fighting or locked on, so south targets get ground on screen.
   Constants live in `FollowCamera.js`, not `core/config.js`.
8. **Clicks under the HUD.** Empty parts of the ability bar pass pointer events through, so a right-click below Clem
   becomes a move order instead of being dropped.
9. **Off-screen speakers.** A guide bubble whose speaker (Pearl, a kitten) is off-screen is pinned to the screen
   edge next to the arrow. Bubble text uses Nunito 800.
10. **Phones.** Prints are drawn 1.3× on touch devices so each is at least 18 px wide at 844×390; the trail must be
    readable at 844×390 and 390×844.
11. **Settings.** `settings.guideTrail` (default on; G3 adds the toggle). Off hides the trail but keeps the edge
    arrow and the objective line.
12. **Photo Cam** never fires during the prologue or while an onboarding target is active.
13. **Test hook.** `__GAME__.guide()` (dev and `build:test` only) returns what a player can see: the projected
    prints, the edge arrow, the badge, the objective line, the current prompt text and the skip chip rectangle
    (10.7). The onboarding bot (G6) uses nothing else.

### 10.3 Faster onboarding, no dead ends (package G2)

Target: the first real fight within 60–90 s of pressing Play with no skipping, and within 40 s when every skip chip
is used. Save flags keep their names (`tut.*.done`, `prologue.raid`, `prologue.armour`); a save made mid-practice
under the old flow continues at the nearest new step.

| Time | Step | Change |
|---|---|---|
| 0 s | Title → play | Control in under 1.5 s. tutlook is dropped (the trail and look-ahead replace it). The title offers "Skip practice" to new players too (G3 draws the link, G2 implements `newGame({ skipPractice: true })`). |
| 0–8 s | Move | "Race Pearl to the dummy!" Trail to the middle dummy (0, −76). Done within 2.2 m. |
| 8–12 s | Bonk | 3-hit combo on the dummy; the chip says LMB or tap ⚔ (the right-click wording goes; TT3 dropped "or J" too). tutbow becomes a 2-s Pearl bark ("Bow's perfect. Now bonk!"); the bow flag is set silently, the reward toast stays. |
| 12–30 s | Sir Wobble drill | Pearl waits at Wobble; trail to a stand spot 1.3 m from him. Block once, then parry once. Wobble steps toward Clem when she is over 1.4 m away; past 1.6 m the prompt says "Get close to Sir Wobble!". The first swing plays in slow motion; after 3 parry fails the slow motion stays and the Kitten-mode offer appears. His telegraph ring is drawn under him. Sir Sacky stands beside him; rolling past him is an optional tip, and roll is taught for real on the first crossbow bolt. |
| 30–40 s | Bell → CS-01 | The bell rings right after the parry; CS-01 plays in place, cut to ≤ 10 s (one "one ear-tuft short" gag). The height-chart walk goes. |
| 40–60 s | CS-02 | Cut to ≤ 20 s: glow out, horde, Pearl's sign, Pilfer's theft; it ends with rats spilling into the practice field. |
| 60–80 s | First fight | 3 rats on the practice field (`onboard.firstFight`). Forgiving: the rats wait for her first order or 3 s, and the first hit on her is soft. |
| after | Armour | Trail to the barn chest; the tag reads "Open"; CS-01b becomes a ≤ 6-s inline beat, then the Chapter 1 card. |
| after | North to Mochi | Trail north; G-01 becomes a non-blocking bark (no letterbox, no input lock). The cart fight and the Bright Slash lesson stay; D-01 ≤ 12 s. |
| after | Lantern Stone 1, Noodle | The Lantern Stone menu never opens while foes are alerted. Noodle's barrel teaches Meow for real: within 6 m the prompt says "Meow [C] to call hidden kittens" (the cow lesson, its 1.2-s wipe and tutpearl go; tutpearl's lines become a bark). Jump is taught at the first hop link outside practice, and click/tap across a fence + F (Space since TT3 §11.2) counts as a hop everywhere. `onboard.done` is set when the Standing Stones arena is reached after Noodle. |

Skipping: a visible "Skip ▸▸" chip (hold Esc / ❚❚, or tap and hold the chip on touch) appears from second 0 of every
skippable scene and of practice, never only after 20 s. Every scene file header states its measured length.
The dead `ctx.fx.guideArrow` call and the chart/barn sparkle ticks are removed in favour of `guideTarget()`.

### 10.4 Token Tails theming of every surface

| Surface | Today | TT2 | Package |
|---|---|---|---|
| Title constant | `GAME_TITLE` + ~8 hard-coded copies per repo | `src/core/brand.js` `BRAND` (title, titleCaps, subtitle, tagline, shelter names, rescue house names, Pink Paw kitten names, site); `strings.js`, `icons.js`, `Overlay.js`, `recovery.js` import it; `index.html` uses `%GAME_TITLE%` placeholders replaced by `vite.config.js` `transformIndexHtml`; LICENSES.md says "this game". Token Tails: `client/components/swordcat/title.ts` `SWORDCAT_TITLE` used by the page, host, picker and tests | G3, TT2 |
| Loading splash | ginger paw #F4A462 | ivory #F3EEE6 paw, white highlight, pink beans #FF7AA2/#FFB3C7, maroon #4A1D08 outline | G3 |
| Loading tips | mechanics only | add 2–3 fiction tips ("The Token Tails Cat keeps a warm spot for every kitten you bring home.") | G3 |
| Title | gold Passion One logo, 28 px pixel-logo pill | + tagline `BRAND.tagline` ("One tiny knight. Eighteen lost kittens. One warm Rescue House."), small `logo-text.webp` wordmark on wide screens (copied, © Token Tails in LICENSES.md), "Skip practice" link, short procedural coin-ding + meow jingle on reveal | G3 |
| Cursor | ginger paw | ivory paw, pink beans, maroon outline | G3 |
| Dialogue portraits | Clem `['#F2A65A','#FFF1DC']` | `['#F3EEE6','#FFF1DC']` with crimson #B3212F accents | G3 |
| Canvas fonts | Fredoka on plates, bubbles, cutscene signs | plates Passion One 900 for ASCII words with per-character Nunito fallback; bubbles and signs Nunito 700/800 | G4 (plates, signs), G1 (bubbles) |
| Currency icon | green leaf sprig | mint leaves + lilac flower spike (#F0C5FD → #9A88C9), procedural; 3D pickups match | G3 (icon), G4 (pickups) |
| Currency name | "catnip", local | keep "catnip"; results card and pause menu say "Catnip here stays in this game for now." Never "Tails" or "treats" | G3 |
| Results card | puns + count | gold ":3" coin behind the rank badge, "A Token Tails game" pill, the catnip line, the jingle | G3 |
| Pause menu | generic | co-brand pill at the foot, no link out (the host owns navigation) | G3 |
| Credits | team + one Pink Paw line (duplicated in `text.js` and `strings.js`) | one source; adds 10.5 lines; tokentails.com link with `target=_blank rel=noopener` | G3 |
| Banners, bunting | KayKit red, candy colours | night #2A1F45 banners with gold trim and a gold coin emblem (`coinPieces`); bunting gold, love pink, lilac, mint, sky, cream. Done: hub and town square (TT3 R2, `tt_wall_banner`); the gate keeps the hyena fort colours (default) | G4, R2 |
| Cutscene signs | generic | Token Tails parchment #F7E6B8→#E9CF8F, ink #4A1D08 | G4 |
| Guide colours | candy pink #FF8FB1 trail, gold dots | love pink #FF7AA2 prints, step dots and ghost paw; gold coin arrow | G1 |
| OG image | Token Tails cat only | Clem with her bow, the title and the co-brand pill; alt text from BRAND | G3 |
| Favicon / manifest | Token Tails pixel cat; no manifest | unchanged (same-origin host manifest covers it) | – |
| Picker card | abstract sword/bow SVG | SVG with Clem's silhouette, pink bow and the gold coin; title from `SWORDCAT_TITLE` | TT2 |

Not in TT2 (see 10.9): Starter-cat looks in the wardrobe, the mascot `.glb` in close-ups, a share/screenshot export,
a commissioned Token Tails theme.

### 10.5 Pink Paw theming (no false claims)

- **Rescue House.** By the fountain next to the Token Tails Cat: a procedural arch with an awning, a cream board with
  a love-pink pad and four beans (generic paw, not Pink Paw's daisy logo), a gold ":3" coin crest and a generic daisy
  flower box. No 3D text: its name lives in strings from `BRAND.rescueHouse` ("Pink Paw Rescue House", falling back
  to "Pawsbury Rescue House" through one switch `BRAND.usePinkPawName`, which also switches the title). Pawsbury and
  Purrhaven stay the town and island names. Barracks pennant retinted to #FF7AA2 on cream with a gold finial.
- **Paw-print motif.** Pink paw prints mean "this way" everywhere (trail, step dots, badge, Rescue House sign). The
  character rule stays: Clem's bow is the only pink on a character, Pearl's bow is lilac.
- **Named kittens.** Coats match the real cats: Judas (`pickles`) tuxedo, Zare (`socks`) brown tabby, Raudvis
  (`muffin`) ginger with a white chest, Simas (`pebble`) Siamese seal point with blue eyes. Accessories stay. Short
  fictional bios (`kitten.<id>.bio`), shown on the rescue card and in the hub, each marked
  `// claim:fiction` and inventing nothing about the real cat: Judas "Naps in bread baskets. Swears he was guarding
  them." Simas "Blue eyes, very still, very patient. Has caught zero fish." Raudvis "Climbed the Bell Tower to see the
  sunrise. Needed help down." Zare "Follows sunbeams across the square all afternoon." `BRAND.pinkPawKittens` maps
  each id to its name; deleting an entry reverts that kitten to Pickles / Pebble / Muffin / Socks.
- **Credits.** Keep: "Four kittens here share their names with real cats at Pink Paw. Their adventures are made up."
  Add `credits.pinkpaw.about`: "Pink Paw (Rožinė pėdutė) is a real cat shelter in Lithuania and Token Tails' partner
  shelter. Meet its cats at tokentails.com." Add `credits.fiction`: "The Pink Paw Rescue House, Pawsbury and
  Purrhaven Isle are made up." LICENSES.md lines 127–131 match.
- **Never:** Pink Paw's logo or daisy-paw art, shelter photos or card art in the bundle, numbers or places about Pink
  Paw beyond the line above, "help / save / feed / support / fund / donate" next to a shelter noun, treats, Tails,
  token or chain words (Token Tails CLAIMS R2, R3, R9, R10; the game also ships inside the app). Headings that need
  "Rožinė pėdutė" use Nunito (Passion One has no ė).

### 10.6 Leftovers from the first fix pass

| # | Item | Package |
|---|---|---|
| a | `npm run build:tokentails` into `tokentails-swordcat/client/public/swordcat-game/`; measure size and file count (estimate ~58 MB / 560 files); record them; apply the 10.9 default | G6 |
| b | Flag-ON dev-server check of `/swordcat` (`NEXT_PUBLIC_SWORDCAT=1` inline on the command, port 3021+), screenshots 1440×900 and 390×844, read them | G6 |
| c | Full `npm run smoke` after all TT2 edits, run twice, both green or each failure documented | G6 |
| d | Clem's maroon outline band behind her head in close-ups (the outline follows the outermost fur shell): fix like the Token Tails Cat fix while keeping her silhouette readable | G4 |
| e | Stray tracked `tests/_ready_tmp.mjs`: remove if unused | G6 |

### 10.7 Cross-package contracts (fixed here)

- `StoryManager.guideTarget()` (G2) → `{ id, x, z, arriveR, textKey, vars?, kind: 'lesson'|'quest'|'optional', speaker? } | null`.
  `StoryManager.sceneActive` (G2) is true during cutscenes and blocking dialogue. G1 reads both defensively.
- `StoryManager.newGame({ skipPractice })` (G2); the title link calls it defensively (G3).
- Story flags `onboard.firstFight` (first fight arena locks) and `onboard.done` (Standing Stones reached after
  Noodle) (G2); the bot reads them through the existing state hook.
- `strings.js` exports `addStrings(table)` (G3); G2 keeps all its new and changed onboarding copy in
  `src/story/strings.onboarding.js` and registers it with `addStrings?.()`. G3's banned-word test also scans that file.
- `icons.js` exports `ttCoin(px)` and `pinkPaw(px)` SVG strings (G3); G1 uses them with a local fallback.
- `settings.guideTrail` default `true` (G3: `GameState.js`, `settings.js`, `text.js` label); G1 reads `!== false`.
- `__GAME__.guide()` (G1, `src/core/debug.js`) → `{ phase, target: { id, kind, textKey } | null, objective,
  prompt, prints: [{ sx, sy, lit }], edge: { sx, sy } | null, badge: { sx, sy } | null, skipChip: { x, y, w, h } | null }`.
  The skip chip is the DOM element `.cin-skip-chip` (G2 creates it in `cinema.js`).
- New CSS goes in package-owned files: `src/ui/guidance.css` (G1), `src/ui/onboarding.css` (G2); `ui.css` is G3's.
- A change that breaks another package's test is written to `requests/tokentails-tt2-<id>.md` with the exact edit;
  the orchestrator applies it. Nobody edits a file it does not own.

### 10.8 Work packages (disjoint file ownership)

| Id | Title | Repo | Dev port |
|---|---|---|---|
| G1 | Guidance: Pink Paw trail, coin edge arrow, objective line, look-ahead | swordcat | 5331 |
| G2 | Onboarding flow: merge, shorten, skip chip, no dead ends | swordcat | 5332 |
| G3 | Brand UI, title constant, copy, credits, results, audio jingle | swordcat | 5333 |
| G4 | World and characters: Rescue House, banners, kitten coats, fonts, Clem outline | swordcat | 5334 |
| TT2 | tokentails.com: title constant, picker card, docs | tokentails | – |
| G6 | QA and ship: onboarding bot, build:tokentails, flag-ON check, smoke ×2, STATUS | swordcat | 4191–4192, 3021 |

G1–G4 and TT2 run in parallel; G6 writes its bot in parallel and runs its builds and checks only after the others
finish. Ownership lists are in the orchestrator's package list.

### 10.9 Your call (defaults applied if no answer)

| Question | Default |
|---|---|
| Rescue House name | "Pink Paw Rescue House", switched together with the title by `BRAND.usePinkPawName` |
| "in Lithuania" in the credits | printed (the founder's brief calls Pink Paw a Lithuanian shelter) |
| Currency | keep "catnip" + "Catnip here stays in this game for now." |
| Jump and Meow lessons | out of practice, taught in context (first hop, Noodle's barrel) |
| Four Pink Paw names | kept, with a founder check before each release (the game cannot hide a cat whose status changes) |
| Starter-cat looks in the wardrobe | not in TT2 |
| Mascot `.glb` in close-ups | no, the procedural Token Tails Cat stays |
| `swordcat-game/` size (~58 MB) | copied as is behind the OFF flag; Capacitor exclusion decided later |

### 10.10 Acceptance criteria (TT2)

Guidance and onboarding:
1. **Trail bot.** `npm run bot:onboarding` (G6) drives a fresh-storage `build:test` bundle opened with `?debug`
   (not `?test`, which turns off story beats). Its only inputs come from `__GAME__.guide()`: WASD from Clem toward the trail (mouse runs, since TT3 §11.2; it was a right-click) / tap on the
   farthest lit print (or the edge arrow pulled 80 px inward, or the badge), the key or button named in the visible
   prompt or objective line, LMB / ⚔ on foes while a fight prompt is shown, and holding the skip chip in skip runs.
   It never reads world positions. It finishes from Play to `onboard.done` with zero dead ends (a dead end = 15 game
   seconds with no flag progress and no prompt change) at 1280×720 mouse and 844×390 touch, 3 seeds each, with an
   injected 1.5 s reaction delay, and dies 0 times in the first fight.
2. **Times** (game seconds, median of 3 seeds, reported in STATUS.md and in this section): Play → `onboard.firstFight`
   ≤ 90 s mouse and ≤ 110 s touch without skipping; ≤ 40 s with skipping; Play → `onboard.done` ≤ 4 min without skipping.
3. Within 1.0 s of every onboarding step starting, at least 3 lit prints or the edge arrow are on screen in both
   1280×720 and 844×390 (also 390×844 for the first three steps); each print is ≥ 18 px wide at 844×390.
4. The trail fades within 0.5 s inside `arriveR`; no trail, edge arrow or badge is drawn in a cutscene or blocking
   dialogue (G-01 included).
5. The skip chip is visible within 0.5 s of every skippable scene start and of practice; measured CS-01 ≤ 10 s,
   CS-02 ≤ 20 s, CS-01b ≤ 6 s, D-01 ≤ 12 s; G-01 locks no input.
6. Click-across-fence + F (Space since TT3) and tap-across-fence + jump count as a hop; Sir Wobble's lesson completes with the bot's
   1.5 s delay; the barn chest tag reads "Open"; the Lantern Stone menu does not open while foes are alerted.
7. Unit tests: `beaconState` with `practice: true` is not `'off'`; trail path routes round the practice fence; auto-hide
   radius; `guideTarget()` returns a target for every lesson and prologue step; old mid-practice saves resume.

Theming and Pink Paw:
8. `grep -rni "pink paw knight"` over `src/`, `index.html`, `vite.config.js`, `public/assets/LICENSES.md` hits only
   `src/core/brand.js`; in tokentails-swordcat `client/` only `components/swordcat/title.ts` and tests. Changing
   `BRAND.title` changes the title screen, `<title>`, OG tags, recovery screen and dialogue fallback (unit test).
9. No `#F4A462`, `#E89A55`, `#F2A65A` in `index.html`, `cursor.js`, `Overlay.js`; no `Fredoka` in canvas font strings
   (`Plate.js`, `Bubble.js`, `rig.js`); the catnip icon contains the lilac spike.
10. The banned-word test (`tests/unit/brand.test.js`) over all display strings, including `strings.onboarding.js`,
    finds no donate / donation / treat(s) / Tails (as a noun) / token / airdrop / chain words and no shelter noun
    next to help / save / feed / support / fund. No file from `tokentails-app/client/public/logo/shelters/` and no
    Pink Paw photo or card art is in the swordcat repo or its `dist/`.
11. Kitten coats: a unit test asserts tuxedo / brown tabby / ginger-white / Siamese blue-eyed for Judas / Zare /
    Raudvis / Simas; bios exist and carry `claim:fiction`.
12. Screenshots read by the owning agent: title, loading, results, pause, credits (both orientations), the Rescue House
    in the hub, a Clem close-up without the maroon band.

Leftovers and gates:
13. `npm run test:unit` green; `npm run smoke` green twice in a row after all edits (or each failure is a documented
    report-only spec gap in STATUS.md).
14. `swordcat-game/` size and file count recorded; flag-ON `/swordcat` screenshots at 1440×900 and 390×844 read; with
    no `NEXT_PUBLIC_SWORDCAT*` set, every page is unchanged. `npx tsc --noEmit`, `npx eslint` on changed files and
    `npm test` pass in `client/`. Nothing under `backend/src/shelter/**`, `shared/**`, `contracts/**/src`,
    `catnip-heist/**`, `client/public/heist-game/**`, `client/components/shelter-payouts/**`, the /heist or
    /shelter-payouts pages or `funding/` changed.
15. `tests/_ready_tmp.mjs` is gone (or kept with a reason). The founder's port 5180 server is still listening at the end.

### 10.11 Status after the first TT2 pass (2026-10-14, 12:00 Vilnius) and the continuation packages

G1–G4 and the tokentails-side title constant are built in the working tree (uncommitted, on top of swordcat `d6fa734`
and tokentails-swordcat `b76f405f`). G2 measured Play → `onboard.firstFight` at 42.8 game s (mouse, 1.5 s reaction
delay, no skipping) and CS-01 7.7 s, CS-02 17.6 s, CS-01b 3.8 s, D-01 11.3 s. `tests/_ready_tmp.mjs` is gone (leftover
e done). `npm run test:unit`: 1127/1129, the two failures are the ones G2 and G3 asked to fix in files they do not own.

Still open: the cross-owner edits in `requests/tokentails-tt2-g{1,2,3,4}.md` that nobody owned, the phone toast
placement, the onboarding bot run with its times, `build:tokentails`, the flag-ON `/swordcat` check, two green smoke
runs and STATUS.md. The continuation packages below take them with disjoint files; QA runs last.

| Id | Title | Takes |
|---|---|---|
| R1 | Apply the unowned core/UI/test requests | g1 §1 (MemeCamTrigger), g2 §1 (controls.test.js), g3 §1 (core.test.js), g3 §6 (celebrate.js bio), g3 §7 (ui assets manifest) |
| R2 | Token Tails banners in the town square | g4 §1 (town.js + world assets manifest); g4 §2 gate banners stay as they are (default) |
| R3 | Phone toasts and edge-arrow taps | g1 §2 (toast slot on phones), g1 §3 (dead beacon CSS), g2 §2 (a tap on the edge arrow or objective pill becomes a move order toward the target) |
| TT3 | tokentails.com check | verify `title.ts` / picker / host / docs; tsc, eslint, jest |
| Q1 | QA and ship | onboarding bot (acceptance 1–3), build:tokentails (leftover a), flag-ON check (b), smoke ×2 (c), Clem close-up (d), STATUS.md, times written into 10.10 |

Acceptance stays 10.10; Q1 writes the measured bot times and the build size into this subsection.

**Q1 measured (2026-10-14, after R1/R2/R3/TT3; report `tests/shots/bot/onboarding-bot.{json,md}`).**

| Viewport | Skip | Play → `onboard.firstFight` median (per seed) | Limit | Play → `onboard.done` | First-fight deaths |
|---|---|---|---|---|---|
| 1280×720 mouse | no | 47.9 s (47.9 / 50.4 / 46.6) | ≤ 90 s ✓ | not reached: dead end at Mochi's cart (3/3) | 0 |
| 1280×720 mouse | yes | 11.2 s (11.2 / 11.3 / 11.2) | ≤ 40 s ✓ | not reached (3/3 Mochi's cart) | 0 |
| 844×390 touch | no | 54.0 s (58.0 / 50.0 / stalled at Sir Wobble) | ≤ 110 s ✓ (2 of 3) | not reached (Mochi / barn chest / Wobble) | 0 |
| 844×390 touch | yes | 11.3 s (11.3 / 11.2 / 11.3) | ≤ 40 s ✓ | not reached (3/3 Mochi's cart) | 0 |

- #1 / #2: first-fight targets met; **`onboard.done` ≤ 4 min not met / not measurable**: Mochi's cage needs the cart
  arena cleared first but the guide points at the cart (`arriveR` 3, no key named, nothing shown inside 3 m); the Sir
  Wobble stand spot can stall (`arriveR` 0.9 > `closeR − standR` 0.3; the badge sits on Wobble so a click engages him);
  one touch stall at the barn chest. Fixes with diffs: `requests/tokentails-tt3-q1.md` §1–§3.
- #3: the way is shown within 1.0 s at every walking step (move, stand, chart, first fight, chest) in all three
  viewports (390×844 for the first three steps); `tut.bonk` / `tut.parry` show the badge or objective line only because
  she is already there (§7 of the request: accept that, or draw prints onto the dummy). Smallest lit print at 844×390:
  25.3 px (≥ 18 ✓).
- #4 / #5: no trail, coin or badge in any scene ✓; Skip chip ≤ 0.1 s after every skippable scene start ✓; CS-01 7.7 s ✓,
  CS-01b 3.7 s ✓, CS-02 31.5 s as a `sceneActive` span (> 20 s; G2 measured 17.6 s for the scene alone, request §7).
- Leftover a: `build:tokentails` → `swordcat-game/` **632 files, 61.6 MiB** (largest file 3.6 MB). Default applied:
  copied as is behind the OFF flag.
- Leftover b: flag-ON `/swordcat` at 1440×900 and 390×844 read: title, embed reaching the game title, Token Tails
  co-brand ✓; the host's "Still loading" note stays up on any origin outside the game's allowlist (dev port 3021,
  previews; request §6) and "Skip practice" overlaps the footer on 390×844 (request §5).
- Leftover c: `npm run smoke` run A 2931 s, 10 of 265 blocks with failures (18 assertions), each a documented spec gap
  in STATUS.md (stale pre-TT2 fence-link assertions, the 390×844 skip-link overlap, untouched-area flakes); run B 2976 s,
  the same 10 blocks plus two B-only ones (`player:touch` tap-to-move, `art:warm` gate luma 0.496 vs ≥ 0.5): 12 blocks.
- #8–#11 greps ✓ (title only in `brand.js` / `title.ts` + tests; no ginger hexes; no Fredoka; banned-word test green;
  no Pink Paw logo or photo in the repo or `dist/`). #12 screenshots read ✓ (Clem close-up without the maroon band).

**Fix round 2 (2026-10-14, evening).** Onboarding bot (13 runs): 0 dead ends; firstFight median 50.7 s mouse / 44.9 s
touch (11.1 / 11.3 s skipping); `onboard.done` 147.4 s mouse / 173.0 s touch (≤ 240 s ✓); #3 passes at every step
(in-place lessons now ring their object with lit prints; `guide().ring` = she is there, the bot acts in place);
scenes CS-01 6.3 s, CS-02 17.6 s, CS-01b 3.3 s, D-01 10.3 s (the 33 s / 41 s readings were a bot measurement bug).
Flag-ON `/swordcat` shows no "Still loading" banner (same-origin parent accepted, request §6). Open: request §5
(390×844 Skip-practice / footer overlap), #15 (the founder's 5180 server was already down; agents do not restart it).
Details: STATUS.md "TT2 fix round 2".

## 11. Phase TT3: characters, controls, abilities

Three read-only audits (2026-10-14) found 7 serious character defects, a browser-unsafe default binding table and a
moveset with no ranged option, no air movement and little crowd control. This phase fixes the characters, moves the
controls to the common convention, and adds three Pink Paw themed Paw Tricks. Audit screenshots:
`/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/90036e17-2f2f-4789-b2bd-035db0b49f4b/scratchpad/swordcat/chars/audit/`
(`S-*` contact sheets, `d-*` 1280×720, `m-*` 844×390).

Package names here (C, K, A, T) are new. They are not the earlier §10.11 continuation ids (R1–R3, TT3, Q1).

### 11.1 What the audits found (short)

**Characters.** P1: Pug's head floats above the armour collar (Barkus too, weaker); every cat's eyes bulge past the
head in profile (`KittenBuilder.js:632` seats the eye middle on the skull surface), the crow's eyes float; the sword
covers Clem's face in the front 3/4 view (first slash wind-up, hurt, run carry, `SwordcatModel.js` `CARRY`); Clem's
tail drags on the ground (`TAIL_CURVE` ends at 0.05) and shows maroon rings at the joints; Sir Wobble has almost no
face, his target square stands off the surface and his arm plank passes through the body; Grizzlechop's hat floats
and his cheese shield reads as a cart wheel; Simas's bucket clips his ears. P2: dark maroon ear and cape-lining bands;
stray fur strands and white hash marks in the inner ears; Clem defaults to `worried` brows; tired lids and an
under-eye crescent on the Token Tails Cat and Pearl; the Token Tails Cat's mannequin seams and stick tail; sleepy
rolls on Raudvis and Zare; Judas's blurry blaze; a dark band over Barkus's helm; faceted shading on rats,
Grizzlechop, spider and crow; blurry hyena spots; a 2 to 3 px bow at phone size; a jump that looks like idle; a grey
disc inside the jelly. Correct today: bow from frame one, crimson eyes with catchlights, red cape with gold trim, gold
":3" badge, the coin in the Token Tails Cat's paws, Pearl's lilac bow, licensed kitten coats, the GRUMP-IN-CHIEF /
NAYSAYER / SNACK SNATCHER plates.

**Controls.** The default `hybrid` preset puts the Stand on Space, jump on F and move orders on RMB. Ctrl (show
ranges, queue move) is critical: Ctrl held with WASD gives Ctrl+W (closes the tab, cannot be blocked) and Ctrl+D.
Alt peeks (Alt+Left goes back in history), F1 opens browser help, Space+LMB fires Golden Hour by accident, Esc in
fullscreen exits fullscreen instead of skipping. The rebinding backend exists (`settings.bindings`,
`cleanBindings`, `Input.rebind()`, `input.codesFor`); only the screen is missing.

**Abilities.** No ranged option without Valor, no way to catch a fleeing SNACK SNATCHER (6 m/s vs 5.5 m/s), no answer
to crows without Sage, no air movement, Meow pauses enemies for only 0.3 s. `PLAYER.glide` (config.js:21) is dead
config. No stamina system; keep it that way.

**Open from TT2 (commit 023b049).** On 390×844 the title "Skip practice" link overlaps the "A Token Tails game" pill
(`src/ui/ui.css`). 9 smoke blocks red: 4 still expect the old fence hop, 1 is that overlap, 4 not triaged, plus one
flaky audio check.

### 11.2 The new default bindings (fixed here)

K implements this table in `INPUT` (config.js). Every other package reads action names only, never key codes.

| Action (`INPUT` name) | Keyboard and mouse | Touch | Gamepad (standard layout) |
|---|---|---|---|
| move | WASD / arrows (click-to-move stays in `moba` and `diablo`) | floating stick, tap ground | L-stick |
| `attack` (hold = charge) | LMB, J. LMB on a foe gives the attack order | ⚔ | X (2) |
| `guard` (hold = Stand, tap = parry) | RMB, Q, L | 🛡 | LB (4), RB (5) |
| `jump` (in air + attack = Pounce) | Space | Jump | A (0) |
| `dodge` (tap = Tumble) | Shift, K, Mouse3 | swipe, Tumble button | B (1) |
| `sprint` (new, virtual) | `dodge` key still held 0.18 s after the Tumble starts: run at Zoomies speed at once | hold Tumble | hold B |
| `interact` | E, Enter, click | ! / tap | Y (3) |
| `ability` (kitten, tap = cast, hold = aim) | G | portrait | LT (6), RS aims |
| `trick` (new, Paw Trick slot, tap = cast, hold = aim) | F | ":3" button | RT (7), RS aims |
| `trick1`..`trick3` (new, pick a Paw Trick) | 1, 2, 3 | long press ":3" opens a 3-way picker | hold RT + D-pad left/right/up |
| `golden` | V, or `guard` + `attack` pressed within 0.1 s | sun | `guard` + X within 0.1 s |
| `milk` / `meow` | R / C | buttons | D-pad up (12) / D-pad down (13) (TT4: was L3) |
| `lockon`, `lockPrev`, `lockNext` | Tab (Shift+Tab back), LMB on a foe | tap foe | R3 (11); D-pad left/right in combat |
| `attackMove` / `stop` | X / H | none | none |
| zoom | wheel | pinch | View (8) cycles zoom |
| `camLock` / `centre` | Y / Home (F1 removed) | none | none |
| `peek` and `ranges` (one hold) | Z, MMB (Alt removed, Ctrl removed) | none | L3 held (10) (TT4: was D-pad down) |
| `pause` | Esc, P | ❚❚ | Start (9) |
| skip practice / cutscene | hold Esc or hold P | Skip chip | hold Start |
| `back` (menus, aim cancel) | Esc, Backspace | Back | B |

Rules: no bound action uses Ctrl, Alt, Meta or an F-key. `Input.js` ignores any keydown that carries `ctrlKey` or
`metaKey`. Queue move is Shift+RMB in `moba` only. Preset changes: `diablo` keeps Space as dodge and moves jump off F
to KeyT; `mouseOnly` jump from F to Space;
`keyboardOnly` and `?cam=classic` already match. The controls card moves into the pause menu (View is zoom now).

### 11.3 The Paw Tricks (fixed here)

One swappable Paw Trick slot (like the hats in A Hat in Time), so each device gains one button only. Owned tricks
are save flags (`trick.coin`, `trick.cloud` = true; equipped = `trick.equipped`), stored through the existing
generic `flags` record, so `SaveManager.js` does not change for this. All unlocks come after the first fight.

1. **":3" Coin Toss** (boomerang). Out 8 m and back, 0.9 s total; 8 damage out, 8 back; stops at the first foe on the
   way out, then returns; collects catnip and hearts on the way back. Cooldown 4.0 s, one coin out at a time, +2 Valor
   per hit. Small foes (rat, jelly S, bonehead mage) stunned 0.6 s; `rat_xbow` hit in `aimLock` loses its bolt and
   restarts the reload; a crow below 3 m grounded 1.5 s; a SNACK SNATCHER stunned 1.2 s and drops half the stolen
   catnip; a pug blocks it from the front (clang), takes it from the side; jellies knocked back, never split; bosses
   6 damage and +4 Dizzy. Aim: tap = cursor (KBM), locked or nearest foe (pad, touch); hold = aim line. Unlock: end of
   the meadow, before Crow Fields, the Token Tails Cat hands over the coin in a 3 s bark. VFX: spinning gold ":3"
   disc, sparkle trail, short streak; Clem's tail flicks up. SFX (zzfx): "ting" throw, "tink" hit, soft chime catch.
2. **Ribbon Twirl** (glide). Press `jump` again in the air and hold it: the pink bow spins like a propeller. Uses
   `PLAYER.glide` (fall speed capped at 1.8, speed 4.5, up to 1.5 s, once per jump). On start, a spin hits all around
   within 1.0 m for 6 damage and knocks crows back. After a Pounce pogo it carries further. Always owned after the
   unlock (it is not in the slot). Unlock: forest entry; Pearl says "Twirl your bow!". VFX: ribbon loops, pink petals,
   cape flutter. SFX: rising whirr loop, "fwip" on the spin hit.
3. **Catnip Cloud** (crowd control). Pouch thrown up to 7 m; cloud of 2.5 m radius for 3 s; normal enemies inside are
   `giddy` 2.5 s: on their backs, no attacks, plate shows the `plateWordsFriend` word (GRUMP → GIGGLER, SNACK
   SNATCHER → SNACK SHARER); the first hit wakes it for ×1.5 damage ("belly-rub bonk"). Bosses and elites (poise ≥ 5)
   get +20 Dizzy only. A GRUMP's jeer is cancelled. Cooldown 16 s. Unlock: town, Pearl gives the pouch after her
   rescue, before the first jeering GRUMP pack. VFX: lilac puffs with small hearts, "z" / "♪" icons. SFX: a "poof"
   and a giggle babble.

Not built: Ribbon Lasso (stretch goal for a later phase), Purr Shield (overlaps Shield Wall and Standing Ground).

### 11.4 Cross-package contracts (fixed here)

- **Action names** (K writes in `INPUT.actions`, A reads): `sprint`, `trick`, `trick1`, `trick2`, `trick3`. `golden`
  stays the action name; K derives the chord inside `Input.js`, so `input.pressed('golden')` is true for V and for
  the chord. `sprint` is held while the dodge key stays down past 0.18 s.
- **Model poses** (C writes in `SwordcatModel.js`, A calls defensively with `model.setTrickPose?.(...)`):
  `setTrickPose('toss', w)` (throwing paw forward, tail flicked up), `setTrickPose('twirl', w)` (bow spins, cape
  flutters, arms out), `setTrickPose(null)`. `w` is 0..1 blend weight.
- **Enemy hooks** (C writes in the type files, A calls defensively): `enemy.dropStolen?.(frac)` on `stealer` and
  Pilfer; `enemy.blocksFrom?.(dir)` true on a pug's front arc. Generic stun, giddy and the belly-rub bonus live in
  `Enemy.js` / `Combat.js` (A), not in the type files.
- **String keys** (K adds the text verbatim, A reads): `trick.coin.name` ":3 Coin Toss", `trick.coin.bark` "Take my
  lucky coin. Throw it, it comes back!", `trick.coin.hint` "[Trick] Toss the coin at that crow!", `trick.twirl.name`
  "Ribbon Twirl", `trick.twirl.bark` "Twirl your bow!", `trick.twirl.hint` "[Jump] again in the air and hold to
  twirl", `trick.cloud.name` "Catnip Cloud", `trick.cloud.bark` "Catnip! They can't stay grumpy in this.",
  `trick.cloud.hint` "[Trick] Puff catnip on the pack", `trick.swap` "Paw Trick: {name}". The `[Trick]` and `[Jump]`
  tokens become glyphs through `text.js` (K adds `trick` to `TOKEN_ACTION`).
- **Events** (A emits on the bus, K listens in `tutorial.js` for the hint and trail): `trick.unlocked {id}`,
  `trick.used {id}`. K shows `trick.<id>.hint` once after `trick.unlocked`, with the paw-print trail pointing at the
  nearest valid target if the guide supports it, else the hint line only.
- **New smoke file** `tests/smoke/tricks.mjs` (A writes; K registers it in `tests/smoke.mjs`).
- **CSS**: A styles its buttons in a new `src/ui/tricks.css` imported from `touch.js`; nobody else edits `ui.css`.

### 11.5 Work packages (disjoint file ownership)

C, K and A run in parallel. T runs last. A package that needs a change in a file it does not own writes it, with a
diff, to `requests/tt3-<pkg>.md` (`tt3-c.md`, `tt3-k.md`, `tt3-a.md`, `tt3-t.md`) and codes defensively. After the
parallel wave, each owner applies the requests addressed to it in one short fix round. T never edits another
package's files.

| Id | Title | Dev port | Screenshot folder (under `.../scratchpad/swordcat/chars/`) |
|---|---|---|---|
| C | Character fixes and cuteness pass | 5331 | `c/` |
| K | Control remap, prompts, tutorials, docs, rebinding UI, all smoke fixes | 5332 | `k/` |
| A | Paw Tricks: Coin Toss, Ribbon Twirl, Catnip Cloud | 5333 | `a/` |
| T | Integration: contract tests, final runs, embed copy, commits | 5334 (smoke preview 5434) | `t/` |

Agents run targeted smoke against their own dev server: `SMOKE_URL=http://localhost:53xx/ SMOKE_ONLY=<area> node
tests/smoke.mjs`. Only T builds `dist/` or `dist-test/` and runs the full suite (`SMOKE_PORT=5434`). Kill every
server you start. Never use ports 5180, 3000, 3005, 5173.

**C owns** `src/characters/**` (KittenBuilder, Eyes, Fur, Bow, Cape, Sword, Poses, BeastHead, BeastDress, Armour,
Plate, configs, palette, materials, Readability, Outline, ...), `src/player/SwordcatModel.js`,
`src/companions/KittenVisual.js`, `src/companions/NpcActor.js`, `src/companions/dressing.js`,
`src/enemies/types/**`, `src/enemies/scripted/**`, `src/enemies/look.js`, `src/enemies/bake.js`,
`src/enemies/rig.js`, `src/enemies/palette.js`, `src/enemies/lod.js`, `src/enemies/props.js`,
`src/enemies/VisualPool.js`, `src/world/PropActor.js` (Sir Wobble), `tests/unit/characters.test.js`,
`tests/unit/enemies.test.js`, `tests/unit/brand.test.js`, `docs/api/characters.md`, `docs/api/enemies.md`,
`requests/tt3-c.md`.

C tasks:
1. P1 fixes 1 to 7 from 11.1: close the Pug and Barkus neck gap; seat every cat's eyes deeper (or flatter) so no eye
   passes the head outline in profile, and seat the crow's eyes on its head; keep the sword off Clem's face in the
   front 3/4 view for the slash wind-ups, hurt and the run carry; lift the tail into a question-mark curl (start from
   `[[0,0.2,-0.13],[0.04,0.3,-0.26],[0.06,0.47,-0.29],[0,0.57,-0.2]]`), smooth its joints and add an idle sway; give
   Sir Wobble big painted dot eyes with highlights, rosy cheeks, a wide smile, a pink heart target flush on the
   surface and the arm on a visible peg; seat Grizzlechop's hat and recolour the shield as cheese (yellow, holes);
   shrink and lift Simas's bucket so the ears show.
2. P2 fixes 8 to 18: no dark maroon ear or cape-lining bands; trim stray fur strands and inner-ear hash marks; Clem
   defaults to `happy`, brows only in story beats; light thin lids and no under-eye crescent on the Token Tails Cat
   and Pearl; soft belly over the Token Tails Cat's seams, curled tail, coin raised to chest height in both paws;
   named kittens never roll `sleepy`; crisp white blaze on Judas; tabby forehead stripes on Zare; lighter seal-point
   mask on Simas; bigger rounder lilac bow on Pearl; remove Barkus's helm band; smooth shading on rats, Grizzlechop,
   spider and crow; sharper hyena spots; no disc inside the jelly; bigger pupils on the pikeman; plainer crossbow helmet;
   a tuft in place of the crow's cone; larger Cacklejaw plate text.
3. Cuteness: soft pink cheek blush on all cats; Clem's bow 1.3× and tilted toward the back of the head for the high
   camera; a squash-and-tuck jump; ">_<" eyes when hurt; slashes with more body lean.
4. Contracts from 11.4: `setTrickPose('toss' | 'twirl' | null, w)`, `dropStolen(frac)` on `stealer` and Pilfer,
   `blocksFrom(dir)` on the pug.
5. Do not touch the 14 other lost kittens' coats; re-shoot them to check the shared builder changes did not break them.

C acceptance:
- Re-shoot the audit set (front, 3/4, side, back, face close-ups, gameplay camera, 844×390) into `chars/c/` and read
  every image. No head gap from behind on Pug or Barkus; no eye past the head outline in profile on any cat or the
  crow; no sword over Clem's face in the front 3/4 shots of slash wind-up, hurt and run; no floating hat; no ear
  through Simas's bucket; no z-fighting, no floating parts, no dark outline bands.
- Unit tests in `characters.test.js`: each cat's eye bounds in head space stay inside the head radius plus 0.005;
  Clem's lowest tail point is at least 0.15 above her feet in idle, walk and run; named kittens never get `sleepy`
  over 200 seeds; Clem's default expression is `happy`; `setTrickPose` exists and blends back to rest.
- At 844×390 from the gameplay camera the pink bow covers at least 6 px across (measured in a screenshot).
- Cuteness re-score by the C agent from the new shots: no character below 6; Clem ≥ 8; Sir Wobble ≥ 6.
- `npm run test:unit` green for C's test files; `scripts/bundle-budget.mjs` still passes; triangle count of Clem plus
  one kitten within +10% of today.
- Identity kept: ivory fur, crimson eyes, pink bow from the first frame, red cape with gold trim, gold ":3" badge,
  Token Tails Cat holding the coin, Pearl's lilac bow, plate words unchanged.

**K owns** `src/core/config.js`, `src/core/Input.js`, `src/player/Orders.js`, `src/fx/GroundDecals.js`,
`src/camera/**`, `src/ui/hud.js`, `src/ui/UI.js`, `src/ui/text.js`, `src/ui/prompts.js`, `src/ui/settings.js`,
`src/ui/menus.js`, `src/ui/beacon.js`, `src/ui/guide.js`, `src/ui/guidance.css`, `src/ui/onboarding.css`,
`src/ui/ui.css`, `src/companions/CompanionManager.js`, `src/companions/abilityAim.js`, `src/save/SaveManager.js`,
`src/story/strings.js`, `src/story/strings.onboarding.js`, `src/story/tutorial.js`, `scripts/dev/onboarding-bot.mjs`,
`tests/smoke.mjs`, every existing file in `tests/smoke/`, `tests/unit/core.test.js`, `tests/unit/ui.test.js`,
`tests/unit/controls.test.js`, `tests/unit/player.test.js`, `tests/unit/companions.test.js`,
`tests/unit/camera.test.js`, `tests/unit/nav.test.js`, `tests/unit/onboarding.test.js`,
`tests/unit/guidance.test.js`, `tests/unit/story.test.js`, `tests/unit/contracts.test.js`,
`tests/unit/save.test.js`, `tests/unit/fixround2.test.js`, `STATUS.md`, `docs/api/player.md`,
`docs/api/companions.md`, `docs/api/fx.md`, `docs/api/camera.md`, `docs/api/ui.md`, `research/CONTROLS_SPEC.md`,
`requests/tt3-k.md`.

K tasks:
1. Implement 11.2 in `INPUT` (keys, presets, pad, `preventDefault`): remove ControlLeft/Right, AltLeft and F1; add
   KeyZ, KeyG, Digit1 to Digit3 and the new actions. Keep `?cam=classic` as is.
2. `Input.js`: ignore keydowns with `ctrlKey` or `metaKey`; read RMB on the UI root too (a right-click on the Pearl
   bubble or any HUD element still guards); derive `sprint` and the `golden` chord; hold P skips like hold Esc.
3. `Orders.js`: LMB on a foe gives the attack order (walk in and chain); queue move is Shift+RMB in `moba` only.
4. Rename the ranges hold in `GroundDecals.js`; remove the hardcoded Shift in `FollowCamera.js` (cycle back) and the
   Tab-hold peek in `hud.js`; aim cancel in `CompanionManager.js:423` and `abilityAim.js` moves from `move` to `back`
   or `guard`.
5. `text.js`: keyboard and pad `ACTION_GLYPH`, `TOKEN_ACTION` (space = jump, f = trick, g = ability, z = peek, new
   `trick`), `guard` in `MOUSE_FIRST` so the Stand prompt says RMB.
6. Strings: remove "or J" in `tut.bonk` (`strings.onboarding.js:17`); rewrite `tut.click`, `tut.move`, `tut.bonk`
   "Right-click" text; `prompt.skip` mentions hold P; `loading.tip.*`, settings labels, the `beacon.js:258` copy and
   the `tutorial.js` comments (around lines 14 and 924); the `trick.*` keys from 11.4 verbatim.
7. Tutorial: the four lessons keep their count and order. Add the one-time `trick.<id>.hint` after `trick.unlocked`.
8. Rebinding screen in the Controls card (`menus.js` `openControls`, `settings.js` `CONTROL_ROWS`): keyboard and
   mouse only, about 13 actions (attack, guard, jump, dodge, interact, trick, ability, milk, meow, golden, peek,
   lockon, pause); "Press a key" capture, swap on conflict, "Reset to default"; refuse Ctrl, Alt, Meta, F-keys and
   Esc. `cleanBindings` also rejects modifier keys. Gamepad keeps the standard layout.
9. Fix the 390×844 "Skip practice" / "A Token Tails game" pill overlap in `ui.css`.
10. Smoke: update every key in `controls.mjs`, `story.mjs`, `flow.mjs`, `physics.mjs`, `companions.mjs`,
    `player.mjs`, `core.mjs`; fix the 4 fence-hop blocks, the overlap block, triage and fix the 4 others, and make the
    audio check deterministic (no retries hiding a race). New blocks: rebind Stand to a new key and pass the parry
    lesson; Ctrl+W, Ctrl+D and Meta+W during play trigger no game action; gamepad standard layout drives the four
    lessons. Register `tests/smoke/tricks.mjs`.
11. Docs: STATUS.md controls table, `docs/api/player.md:134,150`, `docs/api/companions.md:220,242`,
    `docs/api/fx.md:185–186`, `research/CONTROLS_SPEC.md` (§6.2: record the new default and why). The text edits for
    TOKENTAILS-PLAN §10 (old §391, §480, §610 binding mentions) go to `requests/tt3-t.md` as exact replacements.

K acceptance:
- `grep` finds no `ControlLeft`, `ControlRight`, `AltLeft`, `MetaLeft` or `F1` in any `INPUT` table, and no bound
  code in any preset is a modifier.
- Unit: binding table (Space = jump, RMB/Q/L = guard, F = trick, G = ability, Z = peek); conflict swap in the rebind
  model; `cleanBindings` drops modifiers; `sprint` after 0.18 s; `golden` chord within 0.1 s and not after; a keydown
  with `ctrlKey` sets no action.
- Every on-screen prompt, tutorial line, help screen, loading tip and settings label shows the new keys on keyboard,
  touch and pad (screenshots of each lesson prompt in `chars/k/`, read).
- The onboarding bot (mouse 1280×720 and touch 844×390, 3 seeds each) reaches `onboard.firstFight` with a median
  ≤ 60 s and `onboard.done` ≤ 240 s, no dead ends.
- 390×844: the Skip link and the pill do not overlap (bounding boxes disjoint, screenshot read).
- `npm run test:unit` green for K's files; targeted smoke for every area K touched green on K's dev server, twice.

**A owns** `src/player/Player.js`, `src/player/PlayerStates.js`, `src/player/tricks/**` (new: `PawTricks.js`,
`CoinToss.js`, `RibbonTwirl.js`, `CatnipCloud.js`, `tuning.js`, `unlocks.js`), `src/combat/**`,
`src/player/tuning.js`, `src/enemies/Enemy.js`, `src/enemies/EnemyManager.js`, `src/enemies/status.js`, `src/enemies/Dizzy.js`,
`src/fx/TrickFX.js` (new), `src/audio/sfxMap.js`, `src/audio/cues.js`, `src/ui/abilityBar.js`, `src/ui/icons.js`,
`src/ui/touch.js`, `src/ui/touchLayout.js`, `src/ui/touchEditor.js`, `src/ui/tricks.css` (new),
`src/world/levels/forest.js` (only if a twirl gap is added), `tests/unit/tricks.test.js` (new),
`tests/unit/combat.test.js`, `tests/unit/combat.warm.test.js`, `tests/unit/fx.test.js`,
`tests/unit/audio.test.js`, `tests/smoke/tricks.mjs` (new), `docs/api/tricks.md` (new), `docs/api/combat.md`,
`requests/tt3-a.md`.

A tasks:
1. `PawTricks` controller built by `Player.js` (`this.tricks`), reading `trick`, `trick1..3` and the aim; one slot,
   flags as in 11.3; tuning in `src/player/tricks/tuning.js` (numbers from 11.3).
2. Coin Toss: a `coin` projectile kind with a return path in `Projectiles.js`, a 0.25 s `toss` state in
   `PlayerStates.js`, stun / ground / drop / block rules via the 11.4 hooks.
3. Ribbon Twirl: the glide state from `PLAYER.glide`, second jump press in the air, 1.0 m spin hit, once per jump.
4. Catnip Cloud: shared `giddy` state in `Enemy.js` (roll onto the back, wiggle, no attacks, friend plate word),
   `giddy` added to `PASSIVE_ENEMY_STATES` in `src/player/tuning.js`. Belly-rub ×1.5 in `Combat.js`; poise ≥ 5 and bosses only get +20 Dizzy.
5. `Player.js` reads `sprint` (Zoomies speed at once) and `golden` (K's chord).
6. Unlocks in `unlocks.js` from bus events (meadow end, forest entry, Pearl's rescue in town), emitting
   `trick.unlocked`; barks through the existing bubble API with the 11.4 keys.
7. UI: Paw Trick slot with cooldown in `abilityBar.js`; ":3" touch button with long-press picker in `touch.js` and
   `touchLayout.js`; icons; VFX in `TrickFX.js`; zzfx sounds in `sfxMap.js` / `cues.js`.

A acceptance:
- Unit (`tricks.test.js`): coin out-and-back path and 0.9 s total; first-foe stop; one coin at a time; cooldown;
  per-enemy rules (stun times, crow ground, steal drop half, pug front block, jelly no split, boss +4 Dizzy); twirl
  fall cap, 1.5 s limit, once per jump; giddy 2.5 s, no attacks while giddy, wake with ×1.5, bosses only Dizzy;
  flags round-trip through the save `flags` record.
- `tests/smoke/tricks.mjs` blocks: Crow Fields coin grounds a crow; forest twirl crosses a gap (or glides 1.5 s if no
  gap was added); town Catnip Cloud makes a GRUMP pack giddy and flips the plate word. Green twice on A's dev server.
- Each trick works by KBM, touch (844×390) and pad; screenshots of the throw, twirl and cloud in `chars/a/`, read:
  readable at phone size, cute, Pink Paw / Token Tails themed.
- The first fight does not change: no trick is owned or shown before `onboard.firstFight`.
- `npm run test:unit` green for A's files; no frame-time regression in `perf.mjs` beyond 5%.

**T owns** `tests/unit/tt3.test.js` (new), `docs/TOKENTAILS-PLAN.md`, `requests/tt3-t.md`, and in
`/Users/zygimantasbagdzevicius/me/tokentails-swordcat`: `client/public/swordcat-game/**` (the `build:tokentails`
copy only). T also makes the commits.

T tasks:
1. After the parallel wave, collect every `requests/tt3-*.md`, send each item to its owner for the fix round, and
   apply the §10 text replacements K asked for in this file.
2. `tt3.test.js` checks the contracts in 11.4: every action in 11.2 exists in `INPUT.actions` with the listed codes;
   every `trick.*` string key exists; `setTrickPose`, `dropStolen`, `blocksFrom` exist; no prompt string names a key
   that is not bound to its action.
3. Final runs, serialised: `npm run test:unit`, `npm run build`, `npm run build:test`, `SMOKE_PORT=5434 npm run smoke`
   twice, the onboarding bot, `npm run build:tokentails`, a flag-ON `/swordcat` check at 1440×900 and 390×844.
4. Write the measured results into 11.8 below.
5. Commit on `tokentails` in swordcat; commit the embed copy on `feat/swordcat` in tokentails-swordcat (exclude
   `client/.vitest/` and `client/next-env.d.ts`). No push. Messages end with
   "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".

T acceptance: 11.6 all ticked; both smoke runs fully green (0 failing blocks, no retries counted as passes); unit
fully green; commits made, nothing pushed.

### 11.6 Acceptance criteria (TT3)

1. All 7 P1 character defects are gone in fresh screenshots, read by the agent; P2 items 8 to 18 are fixed or listed
   with a reason in STATUS.md.
2. No cat scores below 6 on cuteness; Clem ≥ 8; Sir Wobble ≥ 6.
3. Default bindings match 11.2 on keyboard and mouse, touch and gamepad; no action uses Ctrl, Alt, Meta or F-keys;
   Ctrl+W during play does no game action.
4. Every prompt, tutorial, help screen, doc and smoke test matches the new bindings.
5. A working rebinding screen with conflict swap and reset, tested by smoke.
6. Coin Toss, Ribbon Twirl and Catnip Cloud work on all three input types, with VFX, zzfx sounds, touch buttons,
   pad mapping, unit tests and one smoke block each.
7. First fight median ≤ 60 s (mouse and touch); `onboard.done` ≤ 240 s; no dead ends.
8. The 390×844 Skip link no longer overlaps the pill.
9. `npm run smoke` fully green twice in a row; `npm run test:unit` fully green.
10. Identity kept (11.5 C acceptance, last line); the title still lives only in `brand.js` / `title.ts`.
11. `build:tokentails` copied; commits made in both repos; no push.

### 11.7 Your call (defaults applied if no answer)

| # | Question | Default |
|---|---|---|
| 1 | Kitten ability key now that Q guards and F is the Paw Trick | G. Alternative: keep Q for the kitten and guard on RMB and L only |
| 2 | Golden Hour on the pad, now that RT is the Paw Trick | `guard` + X within 0.1 s (it needs full Valor, so accidents are rare) |
| 3 | How the Paw Trick slot swaps | 1/2/3 on keyboard, long press on touch, hold RT + D-pad on pad |
| 4 | Ribbon Twirl input | second `jump` press in the air, held (holding from takeoff never twirls) |
| 5 | Giddy plate words for hyena and stealer | yes, flip to the friend word for 2.5 s |
| 6 | Shift as Tumble despite Windows Sticky Keys after 5 presses | keep Shift; K and Mouse3 stay as alternatives; note it in the controls card |
| 7 | Forest gap for the twirl | add one only if `forest.js` supports it cheaply; else unlock on forest entry |

### 11.8 Status

Integrated 2026-10-15 (T). Per acceptance criterion:

1. C fixed all 7 P1 defects and P2 8 to 18 (list in STATUS.md). Clem plus one kitten: 25,614 to 27,716 triangles
   (+8.2 %, inside +10 %). Bow 13.8 px across at 844×390.
2. C's scores from the new shots: Clem 8.5, Pearl 8, Token Tails Cat 8, named kittens 7, Sir Wobble 6.5, foes 6 or more.
3. The 11.2 table is live on all three devices. No action uses Ctrl, Alt, Meta or an F-key; a keydown with Ctrl or
   Meta does nothing (`controls:browser-keys`).
4. Prompts, tutorial lessons, the controls card, docs and smoke follow the new keys. `hybrid` has no click-to-move, so
   WASD players cross the 1.0 m practice fence with a held Space (a tap is cut to a 0.3 m hop; the `tut.jump` hint
   says so at the fence).
5. The rebinding screen (pause → Controls) swaps on conflict and resets (`controls:rebind`).
6. Coin Toss, Ribbon Twirl and Catnip Cloud work on keyboard and mouse, touch and pad (`tricks:*`, 16 unit tests).
   Changes from 11.3: the coin is its own simulation (`CoinToss.js`); the cloud is handed over 1.6 s after entering
   the town (Pearl is found in the bog, not the town); the twirl unlocks on forest entry (no gap added).
7. Onboarding bot (K, WASD mouse runs): first fight median 48.1 s mouse, 44.2 s touch; `onboard.done` 142.1 s /
   161.6 s; 0 first-fight deaths. The smoke playthrough reached the first fight in 44.9 to 46.8 game s.
8. "Skip practice" sits top-left at 390×844, clear of the pill.
9. `npm run test:unit` 1188 / 1188. Full `npm run smoke`, 272 blocks: run 1 had 4 red, run 2 had 1 red (each fixed
   on the test side), run 3 fully green, run 4 had 1 red (`art:warm` gate luma 0.499 against the 0.50 floor:
   `gate_dusk` exposure raised to 1.13), run 5 on the final tree fully green (2958 s). Runs 3 and 5 are green, but
   not twice in a row on one tree: the pause-menu fit, a smoke reset fix and the exposure change landed in between.
10. Identity kept; the title still lives only in `brand.js` / `title.ts`.
11. `build:tokentails` copied; local commits in both repos; no push.

Smoke triage (K): the 4 fence-hop blocks follow the TT2 rule (one hop link by the barn door); `combat:touch` clears the
meadow's own rats first; `enemies:onscreen-rule` searches both sides of the screen; `world:fog-audit` treats the §4.2
table as a ceiling with a 30 % floor (forest_day and gate_dusk were lifted for readability); `audio:unlock` waits for a
still camera focus. Integration fixes are listed in `requests/RESOLVED.md` (Phase TT3 integration).

## 12. Phase TT4: real shelter cats and treats

Founder request (2026-10-15): every cat saved in the game is a real Pink Paw cat. After each save the player can have
Token Tails send Pink Paw a treat, as in Catnip Heist, but without leaving the game. The game is part of Token Tails and
the landing page mentions it. Time box: about 2 hours for the whole phase. No gold-plating.

### 12.1 Decisions (defaults, no founder answer needed)

1. **Slots.** 25 save slots get a real cat: 18 lost kittens (12 reachable, 6 in the bog and keep stubs, mapped but never
   promised), 3 squires (mochi, sage, clover) and 4 service kittens (marmalade, tofu, earlgrey, pip).
2. **The game owns the roster.** On tokentails.com the game frame is same-origin, and CORS allows
   `https://tokentails.com`, so the game itself GETs `https://api.tokentails.com/shelter/rozine-pedute/gallery`.
   On any other host (localhost, www, preview) it makes no API call and uses the bundled snapshot. The host sends no cat
   data. This keeps R and E independent.
3. **Picking cats.** Use `atShelter` only (WAITING or RECOVERING). pickles, pebble, muffin and socks stay Judas, Simas,
   Raudvis and Zare. Every other slot takes the next cat from a shuffle seeded per install. The shuffle skips names
   already used, duplicate names in the gallery and odd names: the name must match `^\p{L}[\p{L} '-]{1,15}$`, and a
   small blocklist (starting with "VIagra") is skipped. The roster is assigned once, kept in localStorage
   (`swordcat.shelter.v1`), and re-checked against the live gallery at boot. A slot not yet saved whose cat left the
   shelter gets a new cat. A saved slot keeps its name but shows no status and no treat button.
4. **Status copy.** WAITING shows "Waiting for a home". RECOVERING shows "Recovering". Snapshot cats show no status.
   The words "adopt" and "adopted" never appear. No cat from the `adopted` list is ever shown.
5. **Real facts only.** The game's dialogue stays fiction with the real name. The fiction bios (`kitten.<id>.bio`) are
   hidden whenever a real cat fills the slot. The card's only fact line is the status, plus "Meet her at Pink Paw,
   Kaunas." (or "Meet him", or "Meet them" when unknown; the gallery has no sex field, so the default is "Meet them").
   New credits line: "The kittens you save carry the names and photos of real cats at Pink Paw (Rožinė pėdutė) in
   Kaunas. Their adventures here are made up."
6. **Looks.** The procedural 3D kittens stay. Only the 4 named kittens keep their matched coats. Other cats are not
   recoloured from photos (not cheap enough). The real photo appears in the card and the Kittens grid.
7. **Treat goes through the host.** The game shows the treat panel; the host makes the call. Embedded, the game posts
   `treat-request`, and the host calls the existing `sendTreat()` in `client/components/codex/impact/treat.ts`
   (signed-in first, then guest, `source: "page"`) and posts back `treat-result`. Tokens never enter the frame. Not
   embedded, the panel shows a link, "Send a treat on Token Tails", which opens
   `https://tokentails.com/shelter-payouts/give?cat=<name>` in a new tab. The game itself never POSTs anything.
8. **One treat a day.** The backend allows one treat per player per UTC day. Once the host reports `sentToday`, later
   cards show "Today's treat is on its way to Pink Paw. Back tomorrow." with no button.
9. **Source value.** `source: "page"`. A `swordcat` source would need `shared/**` and backend edits (not allowed).
   Reported in 12.6.
10. **Landing.** A compact `SwordcatSection` after the Heist section. It uses `/swordcat-game/og.jpg` as a lazy still
    (no video; `funding/` media is never linked or copied). It is gated by `swordcatEnabled() && !isAppBuild()`, so
    production stays unchanged until the founder sets `NEXT_PUBLIC_SWORDCAT`. No release date, no hero change.

### 12.2 Bridge additions (v1 stays, all additive)

Game → host:

| type | payload | when |
|---|---|---|
| `cat-saved` | `{ slot, kind: 'lost'\|'squire'\|'service', catId?, catName? }` | every save (`CAT_SAVED` game event) |
| `treat-request` | `{ requestId, slot, catId?, catName }` | the player presses "Send {name} a treat" |

Host → game:

| type | payload | game does |
|---|---|---|
| `treat-state` | `{ rail: 'checking'\|'live'\|'exhausted'\|'soon', sentToday: boolean, amountLabel?: string }` | stores it; sent after `ready` and after every result |
| `treat-result` | `{ requestId, kind: 'sent'\|'already-today'\|'paused'\|'budget-spent'\|'failed'\|'retry'\|'not-eligible'\|'signed-out', explorerUrl?, receiptPath?, amountLabel? }` | updates the open panel |

Limits: `slot` and `catId` are at most 64 characters, `catName` at most 32, `requestId` at most 40. `explorerUrl` must be
https. `receiptPath` must start with `/shelter-payouts/receipt?`. Free-text messages are never sent across. Both
sides drop anything that fails these checks. `kitten-rescued` stays for back-compat.

Panel states, as the game shows them:
- open: "Send {name} a treat"
- sending
- sent: "Treat sent! {amountLabel} is on its way to Pink Paw (Rožinė pėdutė).", plus "View on explorer" and
  "Receipt" (new tab)
- already: "Token Tails already sent your treat today. Come back tomorrow."
- exhausted: "Today's treats are gone, back at 00:00 UTC."
- soon (paused or not deployed): "Real shelter treats open soon."
- error (failed, retry, not-eligible or signed-out): "The treat could not be sent. Your game progress is safe." with
  "Try again" for `retry` and `failed`

Every state carries the line "Token Tails sends the treat. It is free for you." and the custody line
"Held by Token Tails for the shelter until handover."

### 12.3 Packages (strict file ownership)

Requests to another package go to `requests/shelter-<pkg>.md` in the repo that owns the file.

#### R: Roster (game repo `/Users/zygimantasbagdzevicius/me/swordcat`)

Owns:
- new `src/shelter/roster.js` (fetch, cache, pick, persist, `getCat(slot)`, `statusLabel`), `src/shelter/snapshot.js`
  (generated), `scripts/snapshot-shelter.mjs`
- new `src/shelter/card.js` and `card.css` (the rescued cat card)
- `public/pink-paw/{judas,raudvis,zare,simas}-{card,photo}.webp` (copied from `client/public/heist-game/assets/images/pink-paw/`)
- `src/core/events.js` (`CAT_SAVED`, `SHELTER_CARD_OPEN`, `SHELTER_CARD_CLOSE`), `src/core/debug.js` (`__GAME__.shelter`)
- `src/story/strings.js` (name override map read by `t()`, credits line, card copy), `src/core/brand.js`
- `src/companions/LostKitten.js` (emit `CAT_SAVED` for lost and service saves; the `FLAG_SET` fix in `_serviceRescue`),
  `src/companions/CompanionManager.js` (emit `CAT_SAVED` for squires after the join scene)
- `src/ui/portraits.js` (hide fiction bios, show photo), `src/ui/menus.js` (Kittens grid: photo, real name, status),
  `src/ui/celebrate.js` and `src/ui/UI.js` (open the card after the celebration, queue bursts)
- tests: `tests/unit/shelter-roster.test.js`, `tests/unit/brand.test.js`, `tests/unit/story.test.js`, smoke
  `tests/smoke/shelter.mjs`

Card contract: after the celebration (and any join scene), R's card opens. It pauses the game like a lesson card, shows
the real photo (or art, else the procedural portrait), the name, the status and "Meet them at Pink Paw, Kaunas.", and has a
"Continue" button (Esc or pad B). It emits `SHELTER_CARD_OPEN { slot, kind, cat, actionsEl }`. `actionsEl` is a
nav-able container inside the card where T mounts its button and panel. Closing emits `SHELTER_CARD_CLOSE`. Saves that
arrive in a burst (the cage holding Tater, Mittens and Pip) show one after another. The card never blocks progress:
Continue always works, including while a treat is sending.

Acceptance:
1. All 19 reachable saves show a real name in the dialogue, the bubbles, the card, the Kittens grid and the results.
   Unit test over every slot id.
2. The roster never holds two equal names, an adopted cat, or a blocklisted or odd name. Same seed, same roster.
   Live data that drops a cat re-picks only unsaved slots.
3. No GET happens outside tokentails.com. The snapshot works offline. The GET is cached and sent once per boot, with
   `credentials: 'omit'`. The gallery fetch is stubbed in unit tests.
4. `CAT_SAVED` fires exactly once for every lost, squire and service save, including the service fallback path.
5. No "adopt", no em dash and no fiction bio next to a real cat (`story.test.js` banned words).
6. The smoke `shelter:card` block passes for a lost kitten, a squire and a service kitten, with screenshots read at
   1280×720 and 390×844. CDN images are route-intercepted to local files, so smoke makes no outside request.
7. `npm run test:unit` is green.

#### T: Treat (game repo `/Users/zygimantasbagdzevicius/me/swordcat`)

Owns:
- new `src/shelter/treat.js` (panel state machine, mounts on `SHELTER_CARD_OPEN`), `src/shelter/treatCopy.js`,
  `src/shelter/treat.css`
- `src/core/embed.js` (`cat-saved` and `treat-request` out; `treat-state` and `treat-result` in; checks from 12.2;
  add the new types to `HOST_TYPES`)
- tests: `tests/unit/treat.test.js`, `tests/unit/embed.test.js`, smoke `tests/smoke/treat.mjs`
- T registers `__GAME__.treat` from its own module behind `import.meta.env.VITE_SWORDCAT_DEBUG`, not in `debug.js`

Until R lands, T codes against the 12.3 card contract with a fake `SHELTER_CARD_OPEN` in its tests.

Acceptance:
1. One treat per save: after `sent`, the button is gone for that card. While `sentToday` is true, every later card
   shows the "already" line and no button.
2. Every state in 12.2 renders, and each carries the free line and the custody line.
3. A `treat-result` with an unknown `requestId` is ignored. A request still unanswered after 15 s shows the error state
   with "Try again".
4. Not embedded: no `postMessage`, no fetch, only the new-tab link. Embedded: never a link, never `'*'`.
5. Works with keyboard (Enter sends, Esc continues), touch and pad (A sends, B continues). Continue always works.
6. The unit tests stub `postMessage` and fetch. The smoke `treat:panel` block fakes the host with an `?embed=1`
   parent page that answers `treat-result`. Every `**/shelter/donate**` route is intercepted. No real POST.
7. `npm run test:unit` is green.

#### E: Embed and landing (host worktree `/Users/zygimantasbagdzevicius/me/tokentails-swordcat`)

Owns:
- `client/components/swordcat/bridge.ts` (new types, parse limits), `client/components/swordcat/SwordcatHost.tsx`
  (`onCatSaved` for analytics and a dev log; `onTreatRequest` calls `sendTreat()`, one call in flight, dedupe by
  `requestId`, posts `treat-result`; reads `GET /shelter/donate/status` and `fetchDonateMe()`, maps them to
  `treat-state`, and sends that after `ready` and after each result; on `sent`, emits the existing `treat_sent`
  analytics event; reads `?from=` and strips it like `heist/session.ts`)
- `client/components/swordcat/flags.ts`, `client/components/shared/GameSelectModal.tsx` (picker card copy: "Every cat you
  save is a real Pink Paw cat")
- new `client/components/landing/SwordcatSection.tsx`, `client/pages/index.tsx` (insert after the Heist boundary)
- tests: `client/__test__/swordcat-{bridge,host}.test.ts(x)`, `game-select-modal.test.tsx`, new
  `landing-swordcat-section.test.tsx`, and `landing-routing.test.tsx` if it lists the sections

Landing copy:
- label: "Early access"
- heading: `SWORDCAT_TITLE`
- line: "Save lost kittens with a tiny knight. Every cat you save is a real cat at Pink Paw in Kaunas."
- beat (rail live): "Save one, and Token Tails can send Pink Paw a free treat. Held by Token Tails for the shelter until
  handover."
- one CTA: "Play {SWORDCAT_TITLE}", linking to `/swordcat?from=landing_swordcat`

Acceptance:
1. With the flags off, the landing, the picker and `/swordcat` render exactly as today (tests).
2. The bridge parses the new types and drops oversized or wrong-typed fields and non-https explorer URLs.
3. The host maps every `TreatSend` kind to `treat-result` and never sends a token or free text. `sendTreat` is mocked
   with `fetchImpl` in the tests, and there is no request to api.tokentails.com.
4. The landing section is hidden when the flag is off and in the app build. It has one link, no "adopt", no em dash,
   and no number that is not read live.
5. `npx tsc --noEmit`, `npx eslint <changed files>` and `npm test` (jest) are green.

### 12.4 Integration order

1. This section is the frozen contract. R, T and E run in parallel. R and T share the repo but have no file in
   common.
2. Game integration (after R and T):
   - `npm run test:unit`
   - `npm run build:test`
   - `SMOKE_PORT=54xx SMOKE_ONLY=shelter,treat,embed,brand npm run smoke`
   - read the shots
   - fix through requests
3. `npm run build:tokentails` copies the build to `client/public/swordcat-game/`. The integrator owns that folder.
4. Host end to end: `next dev -p 55xx` with `NEXT_PUBLIC_SWORDCAT=1 NEXT_PUBLIC_SWORDCAT_PICKER=1`. In Playwright,
   route `**/shelter/donate**` POSTs to a fake `{txHash, explorerUrl}`, open `/` and `/swordcat`, save the meadow kitten
   (through debug hooks), press "Send a treat", and see the sent state. Screenshots go to
   `scratchpad/pinkpaw-shelter/<agent>/` and must be read. Kill the server afterwards.
5. Commit locally in both repos ("TT4: real shelter cats and treats"). Never commit `client/.vitest/` or
   `client/next-env.d.ts`. No push.
6. Update STATUS.md and add 12.7 Status.

### 12.5 Acceptance for the phase

The founder can play `/swordcat` with the flag on. Every reachable save shows a real Pink Paw cat with a photo and its
live status. Each save offers a free sponsored treat in the game, with no redirect, the custody line and the
one-a-day rule. Landing and picker point to the game. With the flag off, production is unchanged.

### 12.6 Known gaps to report (not fixed here)

- **Signed-out treats.** The guest treat route answers 503 in production until `TRUST_PROXY` or `CF_ORIGIN_SECRET`
  is set (tracker, Bet #3). Signed-out players see the error state; signed-in players can send.
- **No `swordcat` donate source.** No `swordcat` value in `DONATE_SOURCES` and no `swordcat_open` analytics event.
  Both need `shared/**` edits.
- **App export size.** `client/scripts/prune-app-export.mjs` does not prune `public/swordcat-game` (63 MB) from the
  app export.
- **Title approval.** Pink Paw has not approved the title "Pink Paw Knight". Going live needs the founder to set
  `NEXT_PUBLIC_SWORDCAT` (and `_PICKER`) in Vercel.
- **Catnip Heist redirect.** The Heist still opens a new tab to give a treat. Left as is.

### 12.7 Status (2026-10-15)

Integrated and committed locally in both repos. Nothing pushed or merged.

- **Commits.** swordcat `tokentails`: `db20bb2` (TT4) and `749e144` (treat panel fixes). tokentails-swordcat
  `feat/swordcat`: `587fe404` (embed, picker, landing) and `08fd9c98` (landing treat line per rail state, rebuilt embed).
- **Cats.** 25 slots take real Pink Paw cats (`src/shelter/roster.js`). Fixed: pickles is Judas, pebble is Simas,
  muffin is Raudvis, socks is Zare. The other 21 slots take cats from a per-install seeded shuffle of the cats at the
  shelter (live gallery on tokentails.com, else the 99-cat snapshot of 2026-10-15). Bog and keep slots are mapped but not
  reachable yet.
- **Treat.** Embedded on `/swordcat`, the game posts `treat-request`. The host calls `sendTreat()` (signed-in route,
  then guest, `source: "page"`) and posts back `treat-result`. No redirect. Not embedded, the card shows a new-tab link to
  `/shelter-payouts/give?cat=<name>`. Button: "Send Pink Paw a treat for X". States: checking, live, sending, sent,
  already today, paused, used up, failed and retry, not open yet. Every state shows the free line and the custody line.
- **No real treat was sent.** Unit tests stub fetch and `postMessage`. The smoke mocks every `**/shelter/donate**`
  route and aborts any non-read request to a tokentails.com host. It blocked 0, so none was attempted.
- **Landing.** `SwordcatSection` after the Heist section, behind `NEXT_PUBLIC_SWORDCAT` and not in the app build.
  Label "Early access", the title, "Save lost kittens with a tiny knight. Every cat you save is a real cat at Pink Paw
  in Kaunas.", one treat line per rail state, and a "Play" CTA to `/swordcat?from=landing_swordcat`.
- **Checks.** `npm run test:unit` 1219/1219. Full smoke: 275 blocks OK on `db20bb2`. On `749e144` the full run failed 7
  checks in `story:tutorial` only, which passed alone (timing under load). Host: `tsc` clean, eslint clean on changed
  files, jest 3348/3348.
- **Go live.** Pink Paw approves the title "Pink Paw Knight" and the cat photos in the game, then merge
  `feat/swordcat`, then set `NEXT_PUBLIC_SWORDCAT` (and `NEXT_PUBLIC_SWORDCAT_PICKER` for the picker) on Vercel.
- **Still open.** Signed-out players see "open soon" until `TRUST_PROXY` or `CF_ORIGIN_SECRET` is set (guest route
  answers 503). No `swordcat` donate source and no `swordcat_open` event. App export size not pruned. `og.jpg` says
  "Eighteen lost kittens" (game fiction). `/shelter-payouts/give` may ignore `?cat=`. The treat panel has not been seen
  inside the real `/swordcat` page with the live rail. `not-eligible` and `signed-out` show a generic error. The Heist
  redirect is unchanged.

## 13. Phase TT5: messages, jumps, fixes, in-modal treats

Founder requests (2026-10-15):
1. "It should be allowed to send a treat from that modal itself without navigating away. Same thing for Catnip Heist
   as well, as that navigation will clear in-game progress and is bad UX."
2. "Improve in-game messages display (banners like Pink Bow etc. that appear after doing something; on mobile they
   overlap too much, similar on desktop). Make jumps higher so it is easier to jump on things. Also verify for bugs
   and issues."

Inputs: the TT5 audits in the scratchpad (`inline-treats/knight-audit/`, `inline-treats/knight/`), summarised below.
Base: `tokentails` at `7e51988`. Time box: about 4 hours for the Knight packages, 3 hours for the Heist.

### 13.1 Decisions (defaults, no founder answer needed)

1. **One message system.** A new `src/ui/messages.js` decides where and when every banner shows. The existing
   renderers (toasts, celebrate, guide, offer, prompts) stay; they ask `messages` for a slot.
   - Levels: P0 modal (shelter card, results, offer chips), P1 moment (friend, kitten, ability cards), P2 toast,
     P3 tip (`tut.*`, hint card). A P0 hides P1 to P3. A new message never covers an older one; it waits.
   - Two slots only. Top toast slot under the HUD inside the safe area (1 toast on phones, 2 on tablet and desktop;
     the hint card is the slot's bottom row; stickers become an icon toast). Centre card slot at
     `max(tc-b + 8px, 12vh)`, sized per viewport (phone portrait `min(92vw, 340px)` with a 64px portrait and 24px
     title; phone landscape a horizontal card `min(46vw, 360px)`, at most 52vh tall, 56px portrait; tablet 120px;
     desktop 160px). Cards avoid the touch buttons and HUD rects from `occluders.js`; if no room, they dock small.
   - While a centre card shows, Pearl's guide bubble folds to its chip, and the offer waits.
   - Taps: a card is skipped only by a tap on the card itself (today any tap skips it and eats an attack tap).
   - In combat (alerted foe within 15m) a card becomes an icon toast instead of the 0.6 scale dock.
   - Confetti stays inside the card box on phones. Damage words: at most 2 on screen, in lanes away from the card.
   - Reduced motion or reduce flashes: 120ms fade, no confetti, no fly-home.
   - Every slot uses `env(safe-area-inset-*)`. P2 and P3 paint below the touch buttons.
2. **Jump preset "B".** `jumpV` 7.4 to 8.4, fall multiplier 1.35 to 1.5, jump cut 0.5 to 0.65 applied only after
   0.10 s of rise, coyote 0.12 to 0.15 s, buffer 0.15 to 0.20 s (after fixing the buffered tiny hop), hard landing
   9 to 12, mushroom bounce 9 to 10 (config and the `forest.js` literals). Gravity stays 22 (shared by every actor).
   Air damping stays 4. Apex 1.245 m to 1.604 m. A keyboard tap of 80 ms reaches about 1.03 m.
   - Jump assist rise limit 1.1 to 1.4, moved into `AIM.jumpAssist`.
   - `NAV.hop.upMax` (1.1) and `NAV.fence.top` (1.05) stay, so tap paths do not auto-hop onto walls.
   - Twirl: 0.55x gravity only while falling (no twirl super-jump).
   - Sequence guards: practice perimeter fence and gate colliders 2.0 m (models stay 1.5 m); town road hedge
     colliders 1.9 m. Meadow dry-stone walls (1.2 m, walkable) become reachable; that is fine if no lane gate is
     skipped (checked by a test).
3. **Standalone treat in the modal.** The game sends the treat itself when it runs unframed on `https://tokentails.com`
   (`/swordcat-game/`), which CORS allows. It calls `POST https://api.tokentails.com/shelter/donate/guest` with
   `{source:'page', chainId?}`, JSON headers and `credentials:'omit'`. It reads `GET /shelter/donate/status` and
   `GET /shelter/donate/guest/me` first. The response mapping copies `sendTreat` in the host (a 429 with
   `DONATE_ALREADY_TODAY` is "already today", a bare 429 is retry). Never a `text/plain` request.
   - Panel modes: `embedded` (bridge, as TT4), `direct` (tokentails.com over https), `link` (any other host).
   - `link` no longer points at `/shelter-payouts/give`. It is a new-tab link to `https://tokentails.com/swordcat`
     with "Play on tokentails.com/swordcat to send a free treat. Opens in a new tab." plus a Copy link button.
   - The game tab never navigates. Receipt and explorer links open in a new tab.
   - While `checking`, the button is disabled ("Checking today's treat…").
   - Standalone sends always use the guest route, even for a signed-in player; the game never reads the Firebase token.
4. **Ownership.** Strict file ownership below. A package that needs a change in another package's file writes a request
   in `requests/tt5-<owner>.md` (this repo) or `/Users/zygimantasbagdzevicius/me/tokentails-swordcat/requests/tt5-<owner>.md`.
5. **Ports.** Smoke runs use `SMOKE_PORT=54xx` (M 5431, T 5432, J 5433, B 5434, integration 5435). Never 4173 if
   another run may hold it, never 5180, 3000, 3005 or 5173. The founder's dev server on 5180 is never stopped.
6. **No real treat.** Every test mocks the treat POST. `tests/smoke.mjs` keeps aborting every non-GET to
   `*.tokentails.com`, and the run must report 0 blocked.

### 13.2 Work packages (disjoint file ownership)

**M: messages and layout**
- Owns: `src/ui/messages.js` (new), `src/ui/toasts.js`, `src/ui/celebrate.js`, `src/ui/guide.js`, `src/ui/offer.js`,
  `src/ui/prompts.js`, `src/ui/hud.js`, `src/ui/layers.js`, `src/ui/UI.js`, `src/ui/text.js`, `src/ui/ui.css`,
  `src/ui/guidance.css`, `src/ui/onboarding.css`, `src/fx/DamageNumbers.js`, `src/shelter/card.js`,
  `src/shelter/card.css`, `index.html`, `tests/unit/ui.test.js`, `tests/unit/guidance.test.js`,
  `tests/unit/messages.test.js` (new), `tests/smoke/ui.mjs`, `tests/smoke/guidance.mjs`, `tests/smoke/shelter.mjs`,
  `tests/smoke.mjs` (block registry only).
- Does: decision 1, and these audit bugs, all in M's files:
  - hint fades back over a leaving toast (`ui.css:964`, `:1045`);
  - three boxes stack in a phone-landscape fight (hint top ignores `--tl-b`; `ui.css:962`, `:1070`, `hud.js:575+`);
  - celebration cards too big, card over Pearl's bubble, confetti over the HUD;
  - toasts under the kitten card; tablet toast column jumps rows;
  - sticker lands on the play field;
  - portrait boss fight: lesson card over the boss name (rule only in the landscape query, `ui.css:1046`);
  - same line twice: objective pill and lesson card (`hud.js:565-568`, `prompts.js:243`);
  - gamepad labels "D-pad ↑" and "D-pad ↓" collide (`text.js:310-311`, `ui.css:911/913`);
  - offer visible behind the shelter scrim; offer can stack over a card (check `ui.busy` in real play);
  - shelter card: at `max-height: 420px` the photo shrinks and Continue is sticky and fully visible (667x375);
  - shelter card opens mid-fight: `canOpen()` waits while `alertedNear` (`card.js:128-136`);
  - card skip listens to every window pointer-down (`celebrate.js:196`);
  - cinema Skip chip copy says "hold Esc / P" on touch (copy in `text.js`; if the fix is in `cinema.js`, request to B).
- Does not touch `src/shelter/treat*.js` (T). The treat panel sits inside the card; M only sizes the card around it.

**T: standalone in-modal treat (and host, if needed)**
- Owns: `src/shelter/treatApi.js` (new), `src/shelter/treat.js`, `src/shelter/treatCopy.js`, `src/shelter/treat.css`,
  `src/core/embed.js`, `src/main.js`, `src/shelter/roster.js` (only to share `API_HOSTS`), `tests/unit/treat.test.js`,
  `tests/unit/embed.test.js`, `tests/smoke/treat.mjs`, `tests/smoke/embed.mjs`, and in
  `/Users/zygimantasbagdzevicius/me/tokentails-swordcat`: `client/components/swordcat/**`, `client/__test__/*swordcat*`,
  `client/public/swordcat-game/**` (rebuild only, at integration).
- Does: decision 3, as specified in the TT5 treat spec (`treatApi.js`: `directAllowed`, `readRail`, `readMe`,
  `sendGuestTreat`; controller gets an injected `direct` transport, stores `chainId`, reuses `result()`; one in-flight
  send; 15 s timeout; receipt `https://tokentails.com/shelter-payouts/receipt?chain=..&tx=..` only for a valid
  `0x` + 64 hex hash). Host change only if the rebuilt embed needs it (expected: none). Keep `isAppBuild` handling as is.
- Test hook: a `VITE_SWORDCAT_DEBUG`-only override of `directAllowed` through `__SWORDCAT_TREAT__`. Production builds
  never carry it.

**J: jumps**
- Owns: `src/core/config.js`, `src/player/Player.js`, `src/player/PlayerStates.js`, `src/player/Orders.js`,
  `src/player/tricks/RibbonTwirl.js`, `src/player/Aim.js`, `src/world/levels/meadow.js`, `forest.js`, `town.js`
  (colliders and bounce literals only), `tests/unit/player.test.js`, `tests/unit/physics.test.js`,
  `tests/unit/controls.test.js`, `tests/unit/world.test.js`, `tests/smoke/player.mjs`, `tests/smoke/physics.mjs`,
  `tests/smoke/world.mjs`.
- Does: decision 2, plus jump bugs: buffered jump becomes a 0.31 m hop (remember whether Jump was held at take-off);
  tap cannot clear the 1.0 m fence; hard landings on ordinary jumps; twirl super-jump.
- If M needs a value in `config.js` (`config.js:761`, celebrate), M asks J in `requests/tt5-j.md`; default: M keeps its
  numbers in `messages.js`.

**B: bug fixes (high and medium; low only if cheap)**
- Owns: every other file under `src/`, in particular `src/ui/icons.js`, `src/ui/beacon.js`, `src/ui/occluders.js`,
  `src/ui/cinema.js`, `src/ui/touch.js`, `src/ui/touchLayout.js`, `src/ui/abilityBar.js`, plus
  `tests/unit/fixtt5.test.js` (new), `tests/smoke/flow.mjs`.
- Does:
  - sticker inner icon draws off the disc (`icons.js:425`: give the inner icon `width="32" height="32"` or use a `<g>`);
  - guide marker (edge coin) sits on touch buttons at 667x375, after rotating, and next to the ability bar on desktop
    (`beacon.js` edge placement must avoid the occluder rects);
  - a fresh bug sweep after M, T and J land: console errors, softlocks, stuck input, out-of-bounds sweep with the new
    jump at the six viewports. Bugs in other owners' files go to `requests/tt5-<owner>.md`.

### 13.3 Acceptance

Shared: `npm run test:unit` green, `npm run build` green (bundle budget), `npm run build:test` then
`SMOKE_PORT=54xx npm run smoke` green with 0 blocked writes, no console errors. Screenshots at 390x844, 844x390,
667x375 (touch), 1024x768, 1280x720, 1920x1080 under the scratchpad `inline-treats/<package>/`, every image read.

- **M.** A messages smoke replays audit scenes 02 to 08 (Pink Bow, sticker burst, kitten card burst, combat card,
  offer, shelter card) at the six viewports. No P1, P2 or P3 box overlaps another message, a touch button or Clem's
  box by more than 4% of either box. Nothing visible behind the shelter scrim. Continue fully inside the viewport at
  667x375. A tap on Attack never skips a card. Unit tests for the queue (priority, wait, dedupe, P0 hides lower).
- **T.** Unit: `directAllowed` (tokentails.com https true; www, localhost, http false); every response (200, 429 with
  and without the code, both 409 codes, 424, 503, 401, thrown TypeError); receipt building and https-only explorer;
  controller direct flow and timeout; checking state disables the button. Smoke with `page.route('**/shelter/donate/**')`
  fulfilling both GETs and the POST: sending, sent with links `target=_blank`, already, used up, paused, retry;
  `page.url()` never changes; `link` mode shows the `/swordcat` new-tab link and no `/shelter-payouts/give`.
  Embedded path from TT4 unchanged (existing tests green). Copy: "Token Tails sends a free treat", custody line in
  every state, no "adopt", no token words.
- **J.** Apex 1.60 ± 0.02 m held, 80 ms tap at least 1.0 m, buffered jump with early release at least 1.0 m, no hard
  landing after a full jump onto ground 0.5 m lower, twirl apex at most 1.8 m. Perimeter fence, gate and road hedges
  not jumpable (smoke tries from every side, with and without twirl). Mushroom Ring, crate steps and lesson fence
  passable with a tap. Updated pinned numbers in the listed tests.
- **B.** Each fixed bug has a test. The post-merge sweep reports what it ran and finds no high bug.

### 13.4 Order and integration

1. M, T, J and B work in parallel on their files. Requests are answered by the owner before integration.
2. Integration (one agent): run all checks once on the merged tree, then `npm run build:tokentails` to refresh
   `/Users/zygimantasbagdzevicius/me/tokentails-swordcat/client/public/swordcat-game`, run the host jest tests there
   (`npx jest`, node_modules symlinked from tokentails-app and removed before commit), and screenshot `/swordcat`
   with the treat mocked.
3. Commit locally: this repo on `tokentails`; tokentails-swordcat on `feat/swordcat` (never `client/.vitest/` or
   `client/next-env.d.ts`). No push.

### 13.5 Mention, not fix

- Standalone sends use the guest route, so a signed-in player can get one account treat on `/swordcat` and one
  address treat standalone per day. The per-chain daily budget caps it.
- The guest route answers 503 when it sees no visitor address; that shows as "paused".
- `www.tokentails.com` is not in CORS; today it 307s to the apex, so it does not matter.
- `tokentails.com/swordcat-game/` is not deployed yet, so the real-origin send is only checked with mocks.
- The "sent" text uses the host's amount label ("0.01 USDC"); check it against the copy rules at go-live.
