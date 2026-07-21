# Idol OMR Key, Tempo, and Title Analysis

Date: 2026-07-21

## Executive conclusion

The reported defects had two different causes.

| Symptom | Source evidence | Root cause | Owner | Status |
|---|---|---|---|---|
| Opening signature displayed as five flats | Audiveris XML measure 1 contains `<fifths>5</fifths>` | The FoxChild importer repeatedly overwrote the global key and retained the last signature, `-5` at measure 111 | FoxChild | Fixed |
| Later key changes were not represented | Audiveris XML contains `+5`, `0`, `+5`, and `-5` signatures | The AST had a `keyEvents` concept, but MusicXML import/export did not populate or emit it | FoxChild | Fixed |
| Opening tempo displayed as 90 | Previous Audiveris XML contained no OCR text or metronome data | Audiveris had no installed OCR language models, so the TEXTS stage could not produce metadata | Local Audiveris runtime | Fixed |
| `Vivace (quarter = 166)` missing | New OCR run exports `Vivace`, `<per-minute>166</per-minute>`, and `<sound tempo="166">` | Same missing OCR models | Local Audiveris runtime | Fixed |
| Later `Allegretto 150` did not affect playback | Audiveris exports `Allegretto (J = 150)` only as `<words>` | The note symbol was OCR'd as `J`, so Audiveris did not construct a `MetronomeInter`; FoxChild only read formal metronome elements | Audiveris recognition plus FoxChild fallback | Fixed with guarded fallback |
| Main title missing | New OCR run exports `Idol (アイ ドル)` as the largest page-one credit and `Oshi no Ko Opening` as movement title | FoxChild preferred movement title and ignored an untyped Audiveris title credit | FoxChild | Fixed |

## Reproduction evidence

The verified OCR output is:

`tools/omr-helper/.omr-work/idol2-ocr-verification/idol2.mxl`

The unpacked MusicXML is:

`tools/omr-helper/.omr-work/idol2-ocr-verification/unpacked/idol2.xml`

The new OMR run identified:

- Main title credit: `Idol (アイ ドル)`
- Movement/subtitle: `Oshi no Ko Opening`
- Composer text: `Yoasobi`
- Opening tempo: `Vivace`, 166 BPM
- Later tempo: measure 86, `Allegretto`, 150 BPM
- Opening key: five sharps
- Key changes: measure 38 to zero fifths, measure 106 to five sharps, measure 111 to five flats

## Key-signature defect

### What Audiveris produced

Audiveris correctly exported five sharps in measure 1. It also exported later key declarations as the piece changed key and repeated active signatures at some page/system starts.

### What FoxChild did incorrectly

`musicXmlToAst` scanned every measure in every part and assigned each encountered key to one `detectedKey` variable. The final declaration was five flats, so it became the global opening key. The renderer then placed five flats at measure 1 even though the source XML began with five sharps.

### Implemented model

The importer now:

1. Uses the first detected signature as `global.key`.
2. Uses one canonical part to build an ordered key timeline.
3. Ignores repeated declarations when the effective signature has not changed.
4. Stores genuine changes in `global.keyEvents` with measure and beat.
5. Preserves the exact circle-of-fifths integer on every event.

The exporter now emits a measure-level `<attributes><key>` block for each key event. Import, notation rendering, export, and reimport therefore preserve the complete sequence.

Verified sequence after importing the full 143-measure result:

```text
measure 1   +5 fifths
measure 38   0 fifths
measure 106 +5 fifths
measure 111 -5 fifths
```

The screenshot around measure 36 visibly shows cancellation/change symbols at the end of the system, which is consistent with a change near measure 38. The five-flat change at measure 111 should still be visually checked against that page of the source PDF; software preservation means FoxChild no longer relocates it, but does not by itself prove the OMR classification is musically correct.

## Tempo defect

### Why 90 BPM appeared

The older XML had no `<metronome>`, `<per-minute>`, or tempo-bearing `<sound>` element. FoxChild therefore used its documented 90 BPM fallback. It was not discarding a 166 BPM event; no event existed in that XML.

Audiveris logged that its installed OCR language collection was empty. Without OCR, it could recognize graphical notation but could not interpret `Vivace`, `166`, title text, or creator text.

### Runtime correction

Legacy-compatible Tesseract 4.x `eng` and `jpn` models were installed in:

`/Users/charlestan/Library/Application Support/AudiverisLtd/audiveris/tessdata`

The helper now explicitly supplies:

```text
org.audiveris.omr.text.Language.defaultSpecification=eng+jpn
```

This is configurable with `AUDIVERIS_OCR_LANGUAGES`.

The full rerun confirmed `Installed OCR languages: eng,jpn`, executed the TEXTS stage, and exported the opening metronome mark at 166 BPM.

### Later tempo changes

At measure 86, Audiveris OCR produced `Allegretto (J = 150)` as ordinary words. This happens because the printed quarter-note glyph was interpreted as a letter rather than a beat-unit symbol. FoxChild now has a conservative fallback that accepts a BPM number only when the same text contains a conventional tempo term such as `Allegretto`, `Vivace`, or `Presto`. Arbitrary page and measure numbers are not treated as tempo.

Tempo labels and metronome values are now both exported, so `Vivace 166` and `Allegretto 150` survive export/reimport and remain visible notation as well as playback data.

## Title and creator OCR

The new run exports the following first-page metadata:

```text
Idol (アイ ドル)
Oshi no Ko Opening
Yoasobi
Amngemmt by Bomberkung
```

Audiveris classified `Oshi no Ko Opening` as the movement title and emitted the larger `Idol` heading as an untyped credit. For Audiveris-generated MusicXML only, FoxChild now selects the largest first-page untyped credit of title size as the main title, and retains the movement title as subtitle/movement metadata.

Two OCR imperfections remain:

- Japanese spacing is `アイ ドル` rather than `アイドル`.
- `Arrangement by Bomberkung` is misread as `Amngemmt by Bomberkung` and classified as another composer. A human or AI review proposal should correct this; silently guessing creator identity would be unsafe.

## Audiveris source investigation

No Audiveris Java patch was necessary for the three primary failures.

- `TesseractOrder.process()` already initializes the configured language specification and intentionally uses `OEM_TESSERACT_ONLY` legacy mode. This is why full `tessdata` files are required; `tessdata_fast` is incompatible.
- `TextRole.guess()` already distinguishes title, creator, direction, and likely metronome text using page position, text size, and proximity to the staff.
- `MetronomeInter` already parses recognized metronome sentences into beat unit and BPM.
- `PartwiseBuilder` already exports title/creator credits and formal metronome marks with MusicXML tempo data.

The successful rerun proves these paths work once compatible language data is present. Changing Java before establishing that prerequisite would have hidden the deployment fault and created an unnecessary Audiveris fork. A future Java enhancement is justified for fuzzy recovery of OCR strings such as `Allegretto (J = 150)`, but FoxChild now handles that case at the import boundary without altering upstream note recognition.

## Remaining OMR limitations

These are separate from the fixed metadata and key-timeline defects:

- Audiveris still reports rhythm inconsistencies in several measure stacks. These require measure-level comparison or correction proposals.
- Small-head recognition remains disabled in the successful fallback because enabling it crashes this score during STEMS processing. Cue-sized notes may be absent.
- Creator-role OCR is imperfect, especially the arranger line.
- Key events are now faithfully preserved, but every OMR-detected modulation should still be checked against the corresponding source measure.
- The AST stores exact `fifths`, but its tonic type is still a natural letter. For five flats the exact signature is preserved as `-5`, while the convenience tonic label falls back to `C` instead of spelling D-flat. Rendering and MusicXML export use `fifths` and remain correct; a future pitch-spelling model should represent accidental-bearing tonic names directly.

## Verification

- Focused core/helper tests: 34 passed.
- Full regression suite: 84 passed across 14 test files.
- TypeScript typecheck: passed for core and Studio.
- Production build: passed.
- Full PDF OMR: completed across 10 pages with English/Japanese OCR active.
- Full-score import result: title, 166 BPM opening, 150 BPM measure-86 change, and all four key states verified.
- Full-score MusicXML export: key tags `[5, 0, 5, -5]`; metronome values `[166, 150]`.
