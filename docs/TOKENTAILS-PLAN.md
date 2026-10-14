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
  (the fence nav link opens only after `tut.jump.done`, `meadow.js:630`), so F while walking never counts; only
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
| 8–12 s | Bonk | 3-hit combo on the dummy; the chip says LMB/J or tap ⚔ (the right-click wording goes). tutbow becomes a 2-s Pearl bark ("Bow's perfect. Now bonk!"); the bow flag is set silently, the reward toast stays. |
| 12–30 s | Sir Wobble drill | Pearl waits at Wobble; trail to a stand spot 1.3 m from him. Block once, then parry once. Wobble steps toward Clem when she is over 1.4 m away; past 1.6 m the prompt says "Get close to Sir Wobble!". The first swing plays in slow motion; after 3 parry fails the slow motion stays and the Kitten-mode offer appears. His telegraph ring is drawn under him. Sir Sacky stands beside him; rolling past him is an optional tip, and roll is taught for real on the first crossbow bolt. |
| 30–40 s | Bell → CS-01 | The bell rings right after the parry; CS-01 plays in place, cut to ≤ 10 s (one "one ear-tuft short" gag). The height-chart walk goes. |
| 40–60 s | CS-02 | Cut to ≤ 20 s: glow out, horde, Pearl's sign, Pilfer's theft; it ends with rats spilling into the practice field. |
| 60–80 s | First fight | 3 rats on the practice field (`onboard.firstFight`). Forgiving: the rats wait for her first order or 3 s, and the first hit on her is soft. |
| after | Armour | Trail to the barn chest; the tag reads "Open"; CS-01b becomes a ≤ 6-s inline beat, then the Chapter 1 card. |
| after | North to Mochi | Trail north; G-01 becomes a non-blocking bark (no letterbox, no input lock). The cart fight and the Bright Slash lesson stay; D-01 ≤ 12 s. |
| after | Lantern Stone 1, Noodle | The Lantern Stone menu never opens while foes are alerted. Noodle's barrel teaches Meow for real: within 6 m the prompt says "Meow [C] to call hidden kittens" (the cow lesson, its 1.2-s wipe and tutpearl go; tutpearl's lines become a bark). Jump is taught at the first hop link outside practice, and click/tap across a fence + F counts as a hop everywhere. `onboard.done` is set when the Standing Stones arena is reached after Noodle. |

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
   (not `?test`, which turns off story beats). Its only inputs come from `__GAME__.guide()`: right-click / tap on the
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
6. Click-across-fence + F and tap-across-fence + jump count as a hop; Sir Wobble's lesson completes with the bot's
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
