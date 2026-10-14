# Pink Paw Knight (a Token Tails game)

A tiny cat knight with a pink bow rescues 18 lost kittens on Purrhaven Isle. It is a
three.js + Vite browser game in the [Token Tails](https://tokentails.com) universe; Token Tails embeds it at
`/swordcat` behind a flag. The repository and internal ids keep the working name `swordcat` (file names, events,
the save key `swordcat.save.v1`). The display title (not yet approved by Pink Paw as a name) lives in one constant,
`BRAND` in [src/core/brand.js](src/core/brand.js); `BRAND.usePinkPawName` switches the title and the Rescue House name.

- Status, controls and known issues: [STATUS.md](STATUS.md)
- Design: [GAME_DESIGN.md](GAME_DESIGN.md); area-agent rules: [CONTRIBUTING_AGENTS.md](CONTRIBUTING_AGENTS.md)
- The Token Tails pass (IP, flaw fixes, embed): [docs/TOKENTAILS-PLAN.md](docs/TOKENTAILS-PLAN.md)
- Third-party asset licences: [public/assets/LICENSES.md](public/assets/LICENSES.md)

## Run

Node 22 or newer.

```bash
npm install
npm run dev                 # http://localhost:5175/ (5173 is left to the Token Tails catnip-heist dev server)
```

Debug URL switches work only in the dev server and in `npm run build:test` bundles (never in a production build,
never inside the Token Tails embed): `?test=1` (test hooks `window.__GAME__`, fixed seed, no save load), `?debug`
(hooks + stats + lil-gui), `?perf` (perf overlay), `?level=forest&spawn=boss`. Everywhere: `?seed=N`,
`?quality=low|med|high`, `?mute`, `?cam=classic`.

## Test and build

```bash
npm run test:unit           # node:test unit suites (pure modules, no browser)
npm run build               # production bundle → dist/ (assets pruned, bundle budgets checked); no debug hooks
npm run build:test          # hooks-on bundle (VITE_SWORDCAT_DEBUG=1) → dist-test/, used only by the smoke
npm run smoke               # Playwright smoke against a vite preview of dist-test/ on :4173
npm run check               # build, test:unit, build:test, smoke
```

Smoke against your own dev server instead of a build:

```bash
SMOKE_NOHMR=1 npx vite --port 5301 --strictPort &
SMOKE_URL=http://localhost:5301/ SMOKE_ONLY=embed,core node tests/smoke.mjs
```

`SMOKE_ONLY` takes areas (`tests/smoke/<area>.mjs`) or block names, comma-separated. Screenshots go to `tests/shots/`.
Only one process at a time should build into `dist/` or `dist-test/` or use port 4173. Dev-only probes live in
`scripts/dev/` (`npm run perf:alloc` = camera heap allocation check).

## Embedding (Token Tails contract)

Open the game in an iframe with `?embed=1`. In embed mode the page sets `<html data-embed="1">`, hides its own
Fullscreen and Quit items and never installs debug hooks. The host and the game talk with `postMessage` envelopes
`{ ns: 'tt-swordcat', v: 1, type, ... }`:

- host → game: `hello` (game answers `ready { version }`), `session { signedIn }` (stored only, never a token),
  `audio { muted }`, `pause`, `resume`
- game → host: `ready`, `level-complete { levelId, time, kittens, catnip, lives, rank }`, `kitten-rescued { kittenId }`,
  `paused { paused }`

The game accepts messages only from `window.parent` and from an origin in `VITE_EMBED_ORIGINS` (build-time,
comma-separated; default `https://tokentails.com,https://www.tokentails.com,http://localhost:3000`). The first valid
`hello` fixes the host origin, and the game posts only to that origin, never `'*'`. The host should send `hello` until
it gets `ready` (the game answers once it has booted). No scores are saved to Token Tails in this version. Full
design: [docs/TOKENTAILS-PLAN.md §5](docs/TOKENTAILS-PLAN.md).

## Licence

Code licence: all rights reserved, Token Tails (pending founder decision). Third-party assets keep their own
licences, listed in [public/assets/LICENSES.md](public/assets/LICENSES.md).
