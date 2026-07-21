# Idol First Bars OMR Fidelity Report

Date: 2026-07-20  
Baseline HEAD: `ad20400a2919f55db126cf04fe01d5a359cd4825`  
Final commit: not created; the working tree contains pre-existing and current uncommitted work.

## Executive result

FoxChild now preserves canonical MusicXML key fifths, tempo provenance, title/subtitle/credits, arranger and lyricist, dynamics, slurs, chord articulations, beams, tuplets, and dotted durations through import, AST, export, OSMD rendering, and playback timing.

The supplied `imported-musicxml.musicxml` is not raw source evidence. It already says C major, 90 BPM, `Imported MusicXML`, and `FoxChild`, and contains no dynamics, slurs, staccatos, or beams. Those missing facts cannot be recovered safely without the original scan or retained raw Audiveris XML. FoxChild now reports the likely key loss instead of silently guessing E major.

## Supplied file trace

Run:

```bash
npm run omr:trace -- --input /Volumes/ExtremePro/AIWorkspace/docs/imported-musicxml.musicxml --measures 1-6
```

| Evidence | Source XML | Imported AST / current behavior |
|---|---:|---|
| Key signature | `0` fifths | C major; critical possible-lost-key warning |
| Tempo | 90 | 90 BPM, source `musicxml` |
| Title | Imported MusicXML | preserved without replacement |
| Subtitle / arranger | absent | absent; editable in review |
| Dynamics | 0 | 0 |
| Slurs | 0 | 0 |
| Staccatos | 0 | 0 |
| Beams | 0 | 0 |
| Duration/type defects | 114 | unambiguous values normalized from duration |
| Redundant full-bar rests | repeated OMR lanes | 180 redundant rests suppressed |

## Generalized acceptance fixture

The synthetic fixture `packages/music-core/src/__tests__/fixtures/omr-fidelity.musicxml` proves the supported pipeline without hard-coding the supplied composition.

| Semantic | Source | AST | Export / renderer |
|---|---:|---:|---:|
| Key | 4 fifths | E major, 4 fifths | `<fifths>4</fifths>` |
| Tempo | 163 | 163, source `musicxml` | 163 BPM and playback timeline 163 |
| Metadata | title, subtitle, composer, arranger | preserved | re-exported |
| Forte | 1 | direction event | rendered and exported |
| Cross-bar slur | start + stop | 2 slur marks | rendered and exported |
| Chord staccato | repeated on chord tones | one chord-level mark | one `<staccato/>` |
| Beams | begin/end | 2 anchor marks | explicit `<beam>` values |
| Empty voices | voices 2 and 6 | suppressed | not exported |
| Three-beat rest | half without dot | dotted-half repair | half plus `<dot/>` |

## Root causes and fixes

1. **Canonical key loss risk**: the AST previously stored only tonic/mode and re-derived fifths. It now stores imported `global.key.fifths` and exports that canonical value.
2. **Tempo provenance loss**: imported and default tempo were indistinguishable. `tempo.source` now records `musicxml`, `omr`, `user`, or `default`, including FoxChild export/reimport preservation.
3. **Metadata flattening**: import previously selected one title and inherited a generated composer fallback. Work title, movement title, subtitle, credits, composer, arranger, and lyricist are now preserved.
4. **Expression/notation loss**: dynamics, slurs, articulations, and beam data had no AST representation. They now have typed fields and round-trip export.
5. **Phantom voices**: import created synthetic full-measure rests for every discovered lane. Synthetic fallback rests were removed; measures containing multiple redundant rest-only OMR lanes suppress those whole rests and report the repair.
6. **Dotted duration mismatch**: self-closing `<dot/>` nodes were counted incorrectly, and type could disagree with numeric duration. Dot counting is fixed; unambiguous duration values are normalized and reported.
7. **Silent likely key failure**: repeated explicit sharps with zero fifths now produce: “Possible lost key signature: repeated explicit accidentals detected while key signature is C major.” No automatic semantic correction is made.

## Before and after excerpts

Before, exact fifths were reduced to a derived key on export:

```xml
<fifths>0</fifths>
```

The generalized round trip now preserves source semantics:

```xml
<fifths>4</fifths>
<per-minute>163</per-minute>
<dynamics><f/></dynamics>
<slur type="start" number="1"/>
<articulations><staccato/></articulations>
<beam number="1">begin</beam>
```

## UI and diagnostics

- OMR Review now presents `Original PDF | Recognised Score | Issue Inspector`.
- Source XML, AST, and exported key/tempo values are shown separately.
- Findings are categorized and offer Accept source, Accept recognised, Edit, and Ignore.
- MusicXML can be pasted directly into Import for diagnosis.
- `npm run omr:trace` reports raw XML, imported AST, exported XML, and reimported AST for selected measures.

Browser evidence:

- [Supplied-file OMR review](screenshots/idol-omr-fidelity-review.png)
- [Corrected semantic fixture rendered by OSMD](screenshots/omr-fidelity-fixture-score.png)

Browser checks confirmed OSMD produced an SVG without a render error, Direct SF2 playback started on the supplied 928-note score, and the corrected fixture displayed E major / 163 BPM with visible key signature, forte, and slur.

## Files changed for this fidelity work

- `packages/music-core/src/ast/types.ts`, `schema.ts`, `factory.ts`, `validateScore.ts`, `migrateScoreToLatest.ts`
- `packages/music-core/src/importers/musicXmlToAst.ts`
- `packages/music-core/src/exporters/astToMusicXml.ts`, `astToSimpleJson.ts`
- `packages/music-core/src/theory/key.ts`, `rhythm/measure.ts`, `validation/measureValidation.ts`
- `packages/music-core/src/timeline/compileScoreTimeline.ts`, `measureMap.ts`
- `packages/music-core/src/__tests__/music-core.test.ts` and `fixtures/omr-fidelity.musicxml`
- `qa/regression/real-score-corpus.test.ts`
- `tools/omr-trace.ts`, root `package.json`
- `apps/studio/src/components/OmrFidelityReview.tsx`, `ImportPanel.tsx`, `OmrImportPanel.tsx`, `ScoreMetadataEditor.tsx`, `NoteEditor.tsx`
- `apps/studio/src/App.tsx`, `styles/app.css`

## Verification

- `npm test`: 75/75 passed.
- `npm run typecheck`: passed for core and Studio.
- `npm run build`: passed.
- Browser: supplied MusicXML import, OMR review, SVG render, Direct SF2 Play/Stop, and corrected fixture render passed.

## Remaining limitations

- The original PDF and raw Audiveris export for this run were not supplied, so the exact stage that first replaced four sharps/163 BPM and removed expression marks cannot be proven from this file alone.
- Source-region jumping requires retaining the original scan and Audiveris glyph/measure coordinates. The review UI currently reports that source imagery is unavailable rather than fabricating a region.
- Hairpins, ornaments, grace-note playback, detailed credit typography, and page/system layout remain warning-backed unsupported data.
- The current key compatibility fields use natural-letter tonic plus canonical fifths. Four-sharp minor is preserved exactly as fifths/mode, while its compatibility tonic label cannot spell the sharp in the legacy `Step` type.
