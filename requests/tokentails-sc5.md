# SC5 (Token Tails pass): memory, audio and saves

Plan: `docs/TOKENTAILS-PLAN.md` section 4 (F7, F15, F16, F17, F19). Save key `swordcat.save.v1` and the save format
are unchanged; old saves load as before.

## Requests to other packages

### SC2a (`src/story/strings.js`): two toast keys

SaveManager shows these through `ctx.ui.toast` and falls back to the English text below while the key is missing.
Status: both keys are in `strings.js` now (seen 2026-10-13), and U14 passes.

```js
'toast.noSave': d("Progress can't be saved in this browser mode."),
'toast.otherTab': d('This game was saved in another tab. Reload this page to continue from there.'),
```

### SC3 (`src/world/LevelManager.js`, `STATUS.md`)

- `releaseCpuOnUpload(root, opts)` keeps its name and signature. It is now safe to call after the first render (after
  build and warm-up): each marked attribute also gets `needsUpdate`, so the next render uploads it once more and then
  drops the array. Before this change an already uploaded attribute never fired `onUpload`, so a call after warm-up
  freed nothing. `userData.keepCpu = true` on any ancestor (a group or level sub-tree) now keeps that whole sub-tree.
- Copy the heap and size numbers below into STATUS.md.

### Orchestrator: KayKit Skeleton GLBs

`public/assets/models/creatures/skeletons/Skeleton_*.glb` (3.6 to 3.7 MB each) are outside SC5's file set. They have
the same layout as the KayKit characters below, so the same result applies: meshopt alone saves little.

## Measurements (2026-10-13, dev server :5323, Chromium headless, this machine)

| What | Before | After |
|---|---|---|
| Music MP3s (7 re-encoded to 128 kbps CBR; 2 already below 128 kbps left as is) | 30.2 MB | 14.7 MB |
| `public/assets/audio/music/` total (MP3 + OGG) | 40.3 MB | 24.8 MB |
| Pruned build (`dist-sc5`, `prune-assets`) | – | 58.2 MB kept assets (74 MB dir); music 23 MB |
| Raw audio bytes resident after unlock + decodes (`perf:audio-bytes`) | 257 files, 4.1 MB (plus a 4.1 MB `slice(0)` copy per decode while it runs) | 0 files, 0 MB |
| JS heap, meadow idle (`SMOKE_PERF=1 perf:frame`, forced GC, high tier) | 290 MB | 273 MB |

Notes on the heap:
- The gate is 120 MB and still fails. Most of it is geometry and decoded data. The step that frees it is SC3's
  `releaseCpuOnUpload(level.root)` call in LevelManager, which was not in the tree when this was measured.
- `perf:frame` never unlocks audio, so it does not show the decoded-bytes fix. The new `perf:audio-bytes` block does.
- Decoded PCM (AudioBuffer) is not counted in `usedJSHeapSize`. Freeing the compressed bytes saves about 4 MB of JS heap.
- Each heap number comes from one run on a machine running other agents' work, so treat them as approximate.

Music durations: the decoded length of each re-encoded file is identical to the original (`ffmpeg -f null`; for
example castle_kings_feast 2:10.16 before and after). The container's duration estimate moves by one MP3 frame
(about 26 ms, 138 ms for castle_kings_feast); playback is unchanged. Re-encode command:
`ffmpeg -i in.mp3 -codec:a libmp3lame -b:a 128k -map_metadata 0 out.mp3`. Skipped: `victory_fanfare.mp3`
(106 kbps mono) and `village_town_theme.mp3` (108 kbps): re-encoding them at 128 kbps would add size and lose quality.

## F19 GLB size: not shipped

`scripts/optimize-glb.mjs` (resample, dedup, weld, prune, quantize, meshopt) was run on all five KayKit characters
(`public/assets/models/characters/kaykit/*.glb`):

- Size: 2.66 to 2.71 MB down to 2.35 MB each (−12 %). The textures are 1024² PNGs of 13 to 16 KB, so there is
  nothing to resize. Most of each file is the JSON and keyframes of the 76 animation clips.
- Side effects: `quantize` split the single skin into 6 (one Skeleton per mesh after the clone, so more bone uploads
  per instance), and `prune` removed one mesh primitive from four of the five files (mesh count 15→14 on Knight).
- Decision: reverted (the originals are untouched). The task rules out changes to rigs and looks, and 12 % does not
  justify them.
- A real saving needs clip pruning: keep only the clips that `src/enemies/clipMaps.js`, the companions and the
  cutscenes use. That changes the clip set, which is a cross-area call (SC1 and enemies) and is not done here.

The script's dev dependencies are not in `package.json`. They were installed in a scratch directory for this run.

## Changes

- `src/core/Assets.js`
  - `dropBinary(path)` forgets a `bin:` entry, settled or pending.
  - `release(levelId)` also drops settled `bin:` entries the level does not list.
  - `releaseCpuOnUpload` internals: re-upload after the first render, and `keepCpu` on an ancestor (see the SC3 note).
- `src/audio/AudioManager.js`
  - F7: the bytes go straight to `decodeAudioData` (no `slice(0)` copy), after `_dropBytes(path)` clears
    `_bytes`, `_fetched` and the Assets `bin:` entry.
  - F7: `evict()` also drops bytes that were fetched but never decoded for files the next level does not list.
  - Re-decoding after `evict()` fetches again. A file that failed to load or decode stays failed (no refetch loop).
  - F15: `_build()` sets `navigator.audioSession.type = 'playback'` when the API exists.
  - F15: the gesture handler calls `musicPlayer.prime()` synchronously, after `unlock()` has built the graph.
- `src/audio/MusicPlayer.js`
  - `prime()` creates both deck elements and plays each one once, muted, on a 52-byte silent WAV `data:` URI.
    It pauses them again and restores `muted` when the play settles.
  - A streamed deck that autoplay held back resumes inside the gesture.
- `src/save/SaveManager.js`
  - F16a: a record with `v > SAVE_VERSION` loads read-only and is never written over. `isNewerSave` is checked at
    peek and again at write time. One warning is logged. `clear()`, which the player triggers, is still allowed.
  - F16b: no storage, or a failed write after the quota retry, shows the `toast.noSave` notice once, after a session
    has started. It goes through `ctx.ui.toast`, retried until the toast layer accepts it (about 10 s at most), or
    through `E.TOAST` when there is no ui.
  - F16c: a window `storage` event for the save key (or `key === null`) from another tab sets `otherTab`. From then
    on no autosave, settings patch or write happens, and `toast.otherTab` is shown once.
  - New exports: `NOTICES`, `isNewerSave`.
- `public/assets/audio/music/*.mp3`: seven files re-encoded, as listed above.
- Tests
  - Unit: `assets` (bin release, dropBinary, re-upload and keepCpu sub-tree); `audio` (bytes freed and no copy,
    refetch after evict, no refetch loop, audioSession and gesture prime); `save` (newer-version read-only,
    no-storage notice once, storage-event handling).
  - Smoke: `perf:audio-bytes` (new, always on); `audio:gate` now skips the post-boss story scene it triggers (it
    held `save:autosave`'s writes when both ran in one session); `save` logs `readOnly` / `otherTab` / story state
    when no save was written.

## Open issues

- With `audioSession.type = 'playback'` on iOS, game audio ignores the silent switch and interrupts other apps' audio,
  such as a podcast. That is what F15 asks for. If the founder prefers that the game mixes with other audio, use
  `'ambient'` instead (it respects the silent switch).
- The `toast.otherTab` toast cannot reload by itself because toasts have no action button. The player reloads by hand.
