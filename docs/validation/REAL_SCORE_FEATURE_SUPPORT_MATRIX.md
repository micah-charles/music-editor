# Real-Score Feature Support Matrix

Date: 2026-07-20

Architecture was frozen for this sprint. Changes were limited to regression fixtures, tests, diagnostics, fidelity warnings, and defects proven by the corpus.

## Corpus

| Fixture | Core result | Export/reimport | Browser result | Notes |
| --- | --- | --- | --- | --- |
| Simple single-line melody | Pass | Pass | Blocked | 1 part, 1 measure, 4 notes, tempo 96. |
| Piano grand staff, two voices | Pass | Pass | Blocked | One piano part retains two staves, numbered clefs, independent voices, and simultaneous timing. |
| Multi-instrument ensemble | Pass | Pass | Blocked | Three programs/channels and simultaneous attacks survive; mute/solo projection passes. |
| Ties and tuplets | Pass | Pass | Blocked | Six triplet notes preserve 3:2 ratios; cross-measure tie resolves to one four-beat sounding attack. |
| Pickup and tempo changes | Pass | Pass | Blocked | One-beat implicit pickup and measure-2 beat-2 tempo change survive without a false underfill warning. |
| First/second endings | Pass for supported repeats | Pass | Blocked | Repeat map `[1, 2, 1, 3]` expands engine events and maps second-pass cursor time back to source notation. |
| Large, 320 measures | Pass | Pass | Blocked | 1,280 events; latest run: import 26.95 ms, compile 6.82 ms, export/reimport 19.88 ms. |
| Audiveris MusicXML | Pass with warnings | Pass for represented fields | Blocked | Draft, repaired, and raw output import without non-finite timing; source parts and piano lanes survive round trip. |

Browser status is blocked because the browser-control URL policy rejects localhost interaction. The server itself returns HTTP 200. No visual, audio, console, cursor-motion, or auto-scroll pass is inferred from core tests.

## Acceptance Areas

| Area | Status | Evidence or limitation |
| --- | --- | --- |
| Visual notation correctness | Browser blocked | Structural MusicXML checks pass; page/system layout is intentionally reflowed. |
| Playback pitch and rhythm | Core pass, audio blocked | Timeline pitch/start/duration assertions pass for melody, polyphony, ensemble, ties, tuplets, pickup, and tempo. |
| Repeat behaviour | Pass for ordinary repeats/endings | Playback events, tempo map, duration, session scheduling, and playback-to-source cursor mapping are verified. Nested and discontinuous navigation remains provisional. |
| Cursor location | Unit pass, browser blocked | Indexed cursor mapping tests pass; visual position is unverified. |
| Auto-scroll | Browser blocked | Follow/suspension code exists but requires live visual validation. |
| Seek accuracy | Integration pass, browser blocked | Session seek/restart tests pass. |
| Pause/resume accuracy | Integration pass, browser blocked | Deterministic session clock tests pass. |
| Mixer mute/solo/instruments | Core pass, audio blocked | Real ensemble projection and program/channel assertions pass. |
| Export/reimport consistency | Pass for represented fields | Semantic signature covers parts, clefs, instruments, channels, positions, voices, staves, duration, tuplets, pitch, ties, lyrics, repeats, pickup, and tempo events. |
| Browser console errors | Browser blocked | No claim made. |
| Unsupported-data warnings | Pass | Import now reports unsupported notation and layout constructs in `sourceMetadata.warnings` and Studio displays them. |

## Fidelity Levels

| Construct | Level | Detail |
| --- | --- | --- |
| Notes, rests, chords, pitch alterations | Preserved | Sounding pitch and duration are retained. |
| Parts, MIDI programs, channels | Preserved | Mixer projection verified with ensemble fixture. |
| Voices and staves | Preserved | One source part retains `staffCount`, numbered clefs, and staff/voice event lanes through round trip. |
| Ties | Preserved | Start/stop and sounding duration survive round trip. |
| Tuplets | Preserved for explicit time modification | Ratio and fractional duration survive; missing OMR tuplet recognition cannot be reconstructed. |
| Pickup measures | Preserved | `implicit` and actual first-measure duration drive timeline and validation. |
| Tempo changes | Preserved | Base tempo is global; non-redundant position changes remain events. |
| Ordinary repeats and endings | Preserved for supported forms | Repeat passes drive engine events, duration, seek boundaries, and source-notation cursor mapping. |
| Slurs, beams, explicit accidental display | Warned normalization | Sounding notes remain, visual metadata does not. |
| Ornaments, articulations, pedal, fermata, dynamics | Unsupported with warning | Not interpreted by playback. |
| Original page/system layout | Unsupported with warning | Renderer reflows notation. |

## Commands

```bash
npm test -- --run qa/regression/real-score-corpus.test.ts
npm run qa:real-scores
npm test
npm run typecheck
npm run build
```
