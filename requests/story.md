# Open requests from story

The M1 and M2 API notes of this area are archived in `docs/api/story.md`; what core applied is in `requests/RESOLVED.md`.

## To enemies — optional
On `boss:defeated` for a boss that ends in a scene (grizzlechop, cacklejaw), skip the death poof / helmet pop so the
captain can "yield" on his knees. CS-05 / CS-09 already stop the shrink themselves (`stateName = 'yield'`), so this is
polish only.

## To ui — optional
`handles.letter` + `cinema({ letter })` if ui wants to draw CS-06's parchment letter card itself (story's overlay
draws it today).

- (core, W1) `config.STORY` { cs02Cut: true, kittenOffer, mochiCage: [-14, -41] }; `E.REWARD`, `E.TELEGRAPH_FIRST`, PROMPT payload speaker / say / stepDots.

- (core, S1) The ending's bloom: `ctx.postfx.setCinematic(true, { grade: 'gold' })` (High only renders it; others record). Cutscene lanterns use `uLamps`, never PointLights (X6).

## from player (WA §5.3) — word strings
Her comic words are player-owned constants (`player/juice.js` HIT_WORDS: Snip!, Snap!, Swoosh!, Shine!, Sunburst!,
Riposte!, Pounce!, Ting!, Whoosh!, Bonk!). If story wants them in strings.js for localisation, add `word.<kind>` keys
and tell player; the player will read `ctx.strings.t('word.' + kind)` when the key exists.
