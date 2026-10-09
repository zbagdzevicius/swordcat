# Open requests from story

The M1 and M2 API notes of this area are archived in `docs/api/story.md`; what core applied is in `requests/RESOLVED.md`.

## To enemies — optional
On `boss:defeated` for a boss that ends in a scene (grizzlechop, cacklejaw), skip the death poof / helmet pop so the
captain can "yield" on his knees. CS-05 / CS-09 already stop the shrink themselves (`stateName = 'yield'`), so this is
polish only.

## To ui — optional
`handles.letter` + `cinema({ letter })` if ui wants to draw CS-06's parchment letter card itself (story's overlay
draws it today).
