# Audiveris OMR Investigation - 2026-07-09

## Input

- Uploaded scan: `tools/omr-helper/.omr-work/hDOJTlk-n1/input/PXL_20260709_071743674.jpg`
- Audiveris output: `tools/omr-helper/.omr-work/hDOJTlk-n1/output/PXL_20260709_071743674.mxl`
- Copied UI AST: `/Users/charlestan/Documents/Untitled-3.json`
- Corrected AST copy: `/Users/charlestan/Documents/Untitled-3.corrected.json`
- Audiveris source: `/Volumes/ExtremePro/AIWorkspace/audiveris`
- Audiveris commit checked on 2026-07-09: `ec7350e9b`

## Findings

The scan begins with cut time. Audiveris exporting `2/2` for this page is correct; forcing `4/4` would make the imported score less faithful to the original print.

The visible bar 7 underfill was not an Audiveris rhythm failure. Audiveris exported this in raw MusicXML:

```xml
<forward>
  <duration>8</duration>
  <voice>1</voice>
  <staff>1</staff>
</forward>
```

That means the upper piano staff voice has a leading half-measure gap before the half-note chord. FoxChild's MusicXML importer ignored `<forward>`, so the gap disappeared and the AST only contained the chord. The validator then correctly reported the imported AST as underfilled.

Audiveris source confirms this is intentional MusicXML export behavior:

- `app/src/main/java/org/audiveris/omr/score/PartwiseBuilder.java` inserts `<forward>` in `insertForward`.
- `PartwiseBuilder` also exports tuplets when a chord has `getTupletFactor()`.
- `app/src/main/java/org/audiveris/omr/sheet/rhythm/TupletsBuilder.java` links `TupletInter` symbols to embraced chords.
- `app/src/main/java/org/audiveris/omr/sheet/symbol/SymbolsLinker.java` calls `linkTuplets`.

The raw Audiveris MusicXML for this scan contains no `<time-modification>`, `<actual-notes>`, or `<normal-notes>`. So no recognized tuplet was exported. On this page, the visible printed numbers are mostly fingerings or a multi-measure-rest count, not necessarily tuplets. If a real tuplet is present in another scan, Audiveris must first classify/link a `TupletInter`; FoxChild can preserve it once it exists in MusicXML.

## Audiveris Variant Results

The same scan was reprocessed with local Audiveris variants:

| Variant | Result |
| --- | --- |
| Baseline | Valid after the FoxChild `<forward>` import fix; 0 exported tuplets. |
| `disconnectedBracedParts=true` | No meaningful structural change for this scan. |
| `implicitTuplets=true` | Worse output: six final-system overfill errors, still 0 exported tuplets. Do not enable by default. |
| `fingerings=true` | Preserves fingering markings in MusicXML without changing measure validation. Safe default for this repertoire. |

## Fix Applied In FoxChild

- `musicXmlToAst` now imports MusicXML `<forward>` elements as rests for the matching staff/voice lane.
- MusicXML import now preserves tuplets via `duration.tuplet` when `<time-modification>` exists.
- MusicXML export now emits `<time-modification>` back out, using higher `divisions` so fractional triplet beat lengths are representable.
- The OMR helper now enables Audiveris `fingerings=true` by default, exposes opt-in Audiveris processing switches, and surfaces Audiveris rhythm log warnings in the UI response.

## Remaining Audiveris-Side Issues

Audiveris logs still show later rhythm problems:

- `MeasureStack#24 no correct rhythm`
- `MeasureStack#25 no correct rhythm`
- Dummy part creation for single-staff systems in `PartwiseBuilder.processSystem`

These are upstream OMR quality issues, probably caused by scan layout/cropping and system/part association. Future improvements should test:

1. Pre-crop/deskew full-page scans before Audiveris.
2. Try Audiveris processing switch `disconnectedBracedParts=true` for piano pages with interrupted internal barlines.
3. Keep FoxChild post-import validation visible, because OMR remains draft output even when MusicXML is structurally valid.
4. Do not enable `implicitTuplets=true` globally; test it per score because it worsened this scan.
