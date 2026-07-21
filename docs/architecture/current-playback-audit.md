# Current Playback Audit

Date: 2026-07-20
Baseline commit: `ad20400a2919f55db126cf04fe01d5a359cd4825`

## Scope and discrepancies

The implementation brief describes the correct architectural risks, but the repository is ahead of its own README in several areas. Direct browser SF2 playback, multi-part MusicXML import, staff and voice handling, OMR integration, active-note highlighting, and OSMD cursor synchronization already exist. The README still describes some of these as missing or limited.

The private saved-page archive is available at `/Volumes/ExtremePro/AIWorkspace/docs/music.zip`. It is not extracted into or committed with the project. No third-party code, assets, APIs, or score data from that archive are used by this work.

## Current ownership

| Concern | Current owner | Finding |
| --- | --- | --- |
| AST source of truth | `packages/music-core/src/ast/types.ts` | `FoxChildMusicScore` v2 is consistently used by import, edit, render, playback, and export. |
| Playback event flattening | `packages/music-core/src/playback/astToPlaybackEvents.ts` | Sequential per-measure cursor, floating-point beats, constant meter, no explicit positions. |
| Transport state | `apps/studio/src/components/PlaybackControls.tsx` | Component owns engine, status, speed, volume, loading warnings, and completion timer. |
| Playback completion | `PlaybackControls.tsx` | Estimated with `setTimeout(totalBeats * secondsPerBeat)`. |
| Audio scheduling | Three engine classes in `apps/studio/src/music/playback/` | Each engine schedules independently and exposes a minimal, uneven pause/resume contract. |
| Active notes | `PlaybackEngine.ts` timer callbacks | UI note state uses wall-clock timers separate from the audio engine clock. |
| Score cursor | `apps/studio/src/components/ScoreViewer.tsx` | Resets OSMD cursor and walks from score start for each active-note change; converts beats with hard-coded `/ 4`. |
| Piano highlighting | `App.tsx` and `PianoKeyboard.tsx` | Merges playback, UI keyboard, and MIDI pitches correctly, but depends on component callbacks. |
| Metronome | `apps/studio/src/music/playback/metronome.ts` | Independent clock and lifecycle from transport playback. |
| Recording clock | `apps/studio/src/music/recording/recordingClock.ts` | Independent `performance.now()` clock; can drift from playback. |
| Track controls | `NoteEditor.tsx` | Instrument, channel, mute, solo, active input track, add/delete; no volume, pan, meter, visibility, or reorder. |
| Large score rendering | `ScoreViewer.tsx` | Detects large scores and limits bars initially, but OSMD remains a monolithic render. |

## Baseline verification

Commands run from the repository root:

| Check | Result | Notes |
| --- | --- | --- |
| `npm test` | Pass | 9 files, 44 tests. |
| `npm run typecheck` | Pass | Core and Studio pass. |
| `npm run build` | Pass | Vite reports the existing OSMD chunk above 500 kB. |
| Browser baseline | Blocked | Headless browser could not allocate a control port; in-app browser rejected localhost automation under its URL policy. |

The Studio dev server is available at `http://127.0.0.1:5176/` for manual use. Browser evidence must be captured again when an approved browser automation path is available.

## Main risks

1. Audio, UI highlighting, metronome, recording, and finish detection use separate clocks.
2. A floating-point sequential event list cannot faithfully represent independent voices or structural playback.
3. React component ownership makes seek, looping, keyboard shortcuts, and notation following difficult to coordinate.
4. Cursor walking is proportional to distance from score start and becomes unstable on large scores.
5. Existing import fidelity is stronger than documented but unsupported constructs are not represented through a general extension mechanism.

## Baseline evidence

The intended screenshot path is `docs/validation/screenshots/baseline-player.png`. It is currently absent because both available browser automation paths were blocked before capture. This is a documented validation gap, not a successful result.
