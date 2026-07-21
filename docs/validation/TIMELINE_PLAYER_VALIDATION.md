# Timeline Player Validation

## Baseline

Date: 2026-07-20
Commit: `ad20400a2919f55db126cf04fe01d5a359cd4825`

| Area | Command or scenario | Result |
| --- | --- | --- |
| Unit tests | `npm test` | Pass: 9 files, 44 tests. |
| Type safety | `npm run typecheck` | Pass. |
| Production build | `npm run build` | Pass with existing OSMD chunk-size warning. |
| Dev server | `npm --workspace apps/studio run dev -- --host 127.0.0.1 --port 5176` | Running. |
| Browser automation | Load and inspect `http://localhost:5176/` | Blocked by available browser-control infrastructure; no screenshot claimed. |
| Private saved-page reference | Locate supplied ZIP | Available as `/Volumes/ExtremePro/AIWorkspace/docs/music.zip`; used only as an uncommitted behavior reference. |

## Regression matrix

Each checkpoint must update this file.

| Scenario | Unit/integration | Browser | Status |
| --- | --- | --- | --- |
| Existing demo playback parity | Pass | Blocked | Automated timeline parity passes. |
| Rational arithmetic | Pass | N/A | Normalization and arithmetic pass. |
| Simultaneous voices | Pass | Blocked | Explicit-position voice test passes. |
| Tempo-map conversion | Pass | Blocked | Score-time/seconds conversion passes. |
| Pickup measure navigation | Pass | Blocked | Measure-map test passes. |
| Play/pause/resume/stop | Pass | Blocked | Deterministic session test passes. |
| Seek to seconds/measure | Pass | Blocked | Session restart/seek test passes. |
| Loop range | Pass | Blocked | Loop test passes. |
| Piano and notation synchronization | Cursor mapping passes | Blocked | Both consume session active events/time. |
| Multi-part mute/solo | Pass in core suite | Blocked | Playback projection preserves source timeline. |
| Direct SF2 | Pass: 4 SMF tests | Blocked | Multi-channel program, volume, and pan generation covered. |
| Shared recording/metronome clock | Pass | Blocked | Session/fallback adapter tests pass. |
| Migration and structural MusicXML | Pass | Blocked | Existing v2 and v1 migration plus structural round trip pass. |

## Final automated checks

| Check | Result |
| --- | --- |
| `npm test` | Pass: 12 files, 60 tests. |
| `npm run typecheck` | Pass. |
| `npm run build` | Pass; existing notation-renderer chunk warning remains. |
| `npm run benchmark:timeline` | Pass: 2,500 measures / 10,000 events, 20 iterations. |

## Performance metrics

On this machine, the final canonical timeline run for 10,000 note events measured 12.05 ms median and 12.92 ms p95 (20 iterations after 3 warmups). The repeatable command is `npm run benchmark:timeline`; timings naturally vary slightly between runs.

OSMD parse/render/index timing, first-audible-note latency, seek latency, scrolling frame rate, and visual drift require a browser runtime that permits localhost automation. They are not inferred from unit tests.

## Evidence policy

No feature is marked browser-passed without an actual interaction and console check. Manual availability of the app does not count as automated browser evidence.

The real-score gate is recorded in [REAL_SCORE_FEATURE_SUPPORT_MATRIX.md](./REAL_SCORE_FEATURE_SUPPORT_MATRIX.md), with concrete defects in [MUSICXML_DEFECT_REGISTER.md](../reports/MUSICXML_DEFECT_REGISTER.md).
