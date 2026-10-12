# Open requests from core

No open requests. (Applied in the S2/W1 config merge: `CAMERA.iso.occl.archOpacity` 0.1; `frameOffset*` and `lead.up` marked retired in config.js.) The API notes of this area are archived in `docs/api/core.md`; what core applied is in `requests/RESOLVED.md`.

## from player (Phase W) — optional config adoption
Player-local design constants live in `src/player/juice.js` (like tuning.js: config wins once it has them): `SQUASH`
(ART §6.5 event table), `FEEL` (head lag λ 18, face pitch 0.14 rad, glance / look / groom / twirl timings, KO head tilt,
dropped sword, glow height, blob r), `ORDER_FX` (WA §3.6 snap 0.7 / λ 24 / 0.35 s, double tap 0.35 s / 0.75 m, self tap
0.6 m / 40 px, triple 3 in 1.5 s), `HIT_WORDS` (WA §5.3 texts, 0.25 s, lift 0.25 m). Adopt them into config if you
want them there. Events (additive JSDoc): `player:order` gains `double` (bool).
