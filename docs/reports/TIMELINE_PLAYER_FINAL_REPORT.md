# Timeline Player Final Report

Date: 2026-07-20  
Baseline commit: `ad20400a2919f55db126cf04fe01d5a359cd4825`  
Delivery state: working tree implementation, not committed by this task

## Result

The editor now compiles AST v2 into a deterministic rational-time timeline and drives transport, active notes, notation cursor, piano highlighting, seek, looping, recording timing, and metronome timing from a shared playback session. Track mixer settings persist in the AST and document edits use bounded undo/redo history.

The supplied private archive was not extracted into the repository, copied, reconstructed, or referenced in shipped code or documentation. It was treated only as a private behavior reference.

## Before and after

Before, playback state and finish timing lived in React, active-note callbacks used separate timers, notation cursor movement repeatedly walked from the beginning, and recording/metronome clocks ran independently.

After:

```text
AST v2 -> rational timeline -> playback session -> engine adapter
                    |              |       |
                    |              |       +-> transport / piano / track activity
                    |              +-> recording + metronome shared time
                    +-> measure/tempo maps -> indexed notation cursor + follow
```

## Main changes

- Added rational arithmetic, measure and tempo maps, explicit positions, tie resolution, and ordinary repeat mapping under `packages/music-core/src/timeline/`.
- Added optional voice, staff, position, extensions, structural events, and mixer fields without changing schema version.
- Added v1/v2 migration with warnings and extension preservation.
- Expanded MusicXML timing for voices, backup/forward, staves, ties, tempo changes, pickup metadata, MIDI programs, and repeat barlines.
- Added `PlaybackSessionController`, shared clock, context hooks, engine capability contracts, seek, looping, and deterministic tests.
- Added transport progress, elapsed/total time, measure navigation, BPM/speed/volume/transpose controls, loop-current-measure, and guarded keyboard shortcuts.
- Added indexed notation cursor movement, follow suspension, reduced-motion behavior, and mapping tests.
- Added persistent track volume, pan, colour, notation visibility, ordering, activity indication, input-track selection, mute/solo, and explicit zero-based channel 9 drum behavior.
- Added shared recording/metronome timing, overdub/replace selection, and 50-entry undo/redo history.
- Added a repeatable 10,000-event timeline benchmark.

## Migration

No schema-version bump is required. Existing v2 documents remain valid because new fields are optional. JSON import normalizes v1/v2 input through `migrateScoreToLatest()`, preserves known IDs, retains root extension data, and reports migration warnings in source metadata.

## Fidelity

Preserved or normalized: multiple parts, staves, voices, chords, rests, explicit offsets, ties, pickups, tempo changes, MIDI channel/program/bank, and ordinary repeat barlines.

Limited or deferred: numbered-ending playback, nested repeats, D.C./D.S./Coda/Fine, tuplets, grace-note timing, ornaments, pedal, transposing-instrument playback, lyrics/dynamics semantics, and complete articulation interpretation. These must not be treated as lossless playback constructs.

## Timing and tests

- Timeline benchmark: 2,500 measures, 10,000 events, median 12.05 ms, p95 12.92 ms over 20 measured iterations on the final run.
- Unit/integration suite: 12 files, 60 tests passed.
- TypeScript: core and Studio passed.
- Production build: passed; the existing notation-renderer chunk remains above Vite's 500 kB advisory threshold.

## Browser evidence

No browser pass or screenshot is claimed. The standalone browser runner could not allocate a control port, and the in-app browser rejected localhost navigation under its URL-security policy. The dev server remains available at `http://127.0.0.1:5176/` for manual inspection.

Because browser automation is blocked, audio output, cursor appearance, auto-follow motion, keyboard shortcuts, mixer responsiveness, console cleanliness, and end-to-end import/export interaction remain browser validation gaps.

## Known limits

- Engines batch-schedule internally; the look-ahead scheduler primitive is not yet connected to a per-note engine scheduling API.
- Basic synthesis applies per-track gain but does not provide independent stereo panning per polyphonic track instance.
- Recording replace begins on the first committed event; dedicated punch ranges, latency calibration, quantize preview, and browser MIDI timestamps are not implemented.
- Large-score timeline compilation is measured, but notation page virtualization and browser render metrics are not implemented.
- Engine pause/seek uses restart adapters where native support is unavailable.

## Commands

```bash
npm test
npm run typecheck
npm run build
npm run benchmark:timeline
npm run dev -- --host 127.0.0.1 --port 5176
```
