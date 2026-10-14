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
