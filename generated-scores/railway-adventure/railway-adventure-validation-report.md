# Railway Adventure — Validation Report

Generated: 2026-07-27

## Automated results

| Check | Result |
|---|---|
| Canonical AST validation | PASS |
| Measure duration totals | PASS — 738 part-measures complete |
| MusicXML parse and re-import | PASS |
| MusicXML version | PASS — score-partwise 4.0 |
| Parts / staves | PASS — 9 parts / 10 staves |
| Piano grand staff | PASS — one piano part, staves 1 (treble) and 2 (bass) |
| Transposing metadata | PASS — B-flat clarinet -2, B-flat trumpet -2, horn in F -7 |
| Written key signatures | PASS — E major for B-flat parts, A major for F horn, D major for concert parts |
| MIDI percussion channel | PASS — zero-based channel 9 / conventional MIDI channel 10 |
| MIDI creation | PASS — 30309 bytes |
| Tempo/time maps | PASS — 4/4; 110 BPM opening plus four arrival tempo events |
| Measured score duration | PASS — 182.81 seconds (3:03) |
| Slur and wedge pairing | PASS — numbered start/stop pairs emitted |
| Final cadence/barline | PASS — soft D-major arrival and light-heavy final barline |

## Studio browser validation

| Check | Result |
|---|---|
| MusicXML file import | PASS — Studio loaded “Railway Adventure” with D major, 4/4, 110 BPM and 82 unique measures |
| OSMD engraving | PASS — one SVG rendered 3,372 notes without a console error or crash |
| Requested score regions | PASS — opening railway texture, piano grand staff, **ff** climax and **pp** ending visually inspected |
| Mixer | PASS — all 9 requested parts appeared as separate tracks |
| Playback start/cursor | PASS — Basic Synth entered playing state, sounded measure 1 events and advanced to M1 · B4 |
| Displayed duration | PASS — transport displayed 3:02; exact timeline/MIDI duration is 182.81 seconds |

Evidence: `browser-opening.png`, `browser-climax.png`, and `browser-ending.png`.

## Musical checks

- The trumpet introduces a recurring eight-measure principal theme at measures 9–16.
- The theme is varied through counterstatement, fragmentation, sequence, octave transfer and full-orchestra reprise.
- The middle section uses a distinct legato theme with B-minor colouring.
- The climax is materially denser and louder than the introduction.
- Instrumental texture includes deliberate rests; trumpet and percussion do not play continuously.
- Concert-pitch ranges are stored in the composition spec for review.

## Limitations

- Percussion uses General MIDI pitches on the project’s current pitched-note AST because the canonical model does not yet expose unpitched MusicXML display-step metadata. Playback channel and musical placement are correct; notation appears on a treble staff.
- Studio reports three non-blocking fidelity advisories: hairpin playback interpolation is not implemented, transposition is normalized to concert pitch on import, and harmony symbols are not retained in the canonical round trip.
- Browser playback was sampled at the opening rather than allowed to run for the full three minutes; the complete 328-beat timeline and 182.81-second MIDI were validated programmatically.
