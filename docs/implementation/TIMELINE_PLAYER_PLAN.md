# Timeline Player Implementation Plan

Baseline: `ad20400`

## Checkpoint 1: audit and baseline

Status: complete. Browser capture was blocked and recorded as a validation gap.

- Record exact ownership and clock duplication.
- Run tests, typecheck, and production build.
- Record browser and reference-archive availability.
- Produce architecture, implementation, and validation documents.

Exit: documents exist and baseline failures are explicit.

## Checkpoint 2: canonical timeline

Status: complete for rational time, sequential compatibility, explicit voices, pickup measures, tempo maps, ties, and ordinary repeat playback projection.

- Add rational arithmetic and score/seconds conversion.
- Add optional AST position, staff, voice, tie, tempo, and repeat metadata without a schema-version bump.
- Compile parts, measures, sequential events, explicit positions, chords, rests, pickup bars, and tempo segments.
- Resolve tied playback duration while retaining source events.
- Expand supported repeat passes into playback events, tempo segments, measure boundaries, and duration while retaining source notation time.
- Keep `astToPlaybackEvents()` as a compatibility adapter.

Exit: parity and new polyphony/tempo/pickup tests pass.

## Checkpoint 3: shared session

Status: complete with restart adapters for engines lacking native seek/pause.

- Introduce controller, monotonic playback clock, look-ahead scheduler, context, and subscription hook.
- Normalize engine prepare/schedule/cancel/all-notes-off/dispose capabilities.
- Remove component-owned finish timers.

Exit: play, pause, resume, stop, clock, and end-state integration tests pass.

## Checkpoint 4: transport and seek

Status: complete in code; browser interaction remains unverified.

- Add start, previous/next measure, play/pause, stop, elapsed/total time, seek, BPM, speed, volume, loop, and transpose controls.
- Add accessible labels and guarded keyboard shortcuts.
- Keep the score document stable during progress updates.

Exit: seek, measure navigation, loop, speed, and BPM tests pass.

## Checkpoint 5: notation position adapter

Status: complete in code with deterministic mapping tests; browser visual evidence remains unavailable.

- Build an OSMD index after render.
- Drive cursor and active-note state from session time.
- Add follow suspension and reduced-motion behavior.

Exit: cursor no longer walks from score start; mapping tests and browser evidence pass.

## Checkpoint 6: structural fidelity

Status: complete for positions, voices, unified multi-staff parts, numbered clefs, ties, tempo changes, pickups, and ordinary repeats. Advanced notation and navigation constructs remain in the fidelity boundary.

- Expand importer/exporter fixtures for positions, voices, staves, ties, tempo changes, pickup bars, ordinary repeats, and endings.
- Preserve unsupported navigation and expression metadata through `extensions`.
- Produce a fidelity matrix.

Exit: import/export/reimport semantic tests pass.

## Checkpoint 7: mixer and recording

Status: complete for persistent mixer controls, activity, ordering, drum-channel semantics, shared timing, overdub/replace selection, and bounded undo/redo. Latency calibration and MIDI event timestamps remain deferred.

- Add track volume, pan, activity, visibility, reorder, and explicit drum-channel handling.
- Move count-in, metronome, and recording start to the playback clock.
- Add overdub/replace transaction and undoable commit boundaries.

Exit: mixer and recording clock integration tests pass.

## Checkpoint 8: performance and final QA

Status: complete for repeatable timeline benchmarking and automated build/test validation. Browser and notation-render performance measurements remain blocked by browser control policy.

- Measure parse, compile, render, index, first-note, seek, and frame behavior by fixture class.
- Optimize measured bottlenecks only.
- Run unit, integration, build, and browser scenarios.
- Write the final report with evidence and remaining limits.

## Approval gates

Stop for user approval only if an implementation requires a serialized schema migration, dependency replacement, new license obligation, or a verified feature deferral. Optional backward-compatible AST fields do not require a migration.
