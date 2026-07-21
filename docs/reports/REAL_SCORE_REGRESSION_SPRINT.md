# Real-Score Regression And Fidelity Sprint

Date: 2026-07-20

## Scope

The architecture was frozen. This sprint built an eight-category legal corpus, ran semantic import/export checks, measured core processing, investigated OMR structures, and fixed only defects reproduced by regression tests.

## Outcome

- Added seven generated fixtures and three existing Audiveris variants to the automated corpus.
- All real-score acceptance tests pass, including repeat-expanded engine events and unified piano grand staff round trips.
- Fixed eight MusicXML, timeline, and validation defects without changing schema version or replacing architecture.
- Added a repeatable analyzer through `npm run qa:real-scores`.
- Added visible unsupported-data warnings.
- Published the feature-support matrix and defect register.

## Core Metrics

The generated 320-measure fixture contains 1,280 timeline events. The latest run measured 26.95 ms import, 6.82 ms timeline compilation, and 19.88 ms export/reimport. The raw Audiveris output contains 345 timeline events across 25 measures; its two source parts and piano staff/voice lanes remain intact after round trip.

Performance numbers are development-mode core measurements, not browser rendering or first-audible-note measurements.

## Browser Gate

The app server responds at `http://127.0.0.1:5176/`, but browser control rejects localhost under its URL policy. Browser tests were attempted and stopped at that policy boundary. No screenshots, console pass, notation comparison, audio judgement, cursor-motion judgement, or auto-scroll judgement are claimed.

## Next Approved Work

1. Add meter/key-change and expression fixtures before implementing those adapters.
2. Extend repeat coverage only when nested/discontinuous navigation fixtures define the intended semantics.
3. Run the browser matrix in an approved localhost-capable environment.

Architecture changes should remain frozen until the first two decisions are reviewed.
