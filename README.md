# FoxChild Music Score Lab

FoxChild Music Score Lab is a static-first, local-first music notation studio.
It combines the V1 MVP scope with the V2 AST-first architecture:

- V1 feature surface: paste notes, load JSON/MusicXML/MIDI, render notation, play, edit, and export.
- V2 internal model: `FoxChildMusicScore` AST v2 is the source of truth.
- MIDI and MusicXML are import/export formats, not the editable data model.
- The app requires no backend, login, or CDN dependency.

## Workspace Layout

```text
packages/music-core/
  src/ast/          FoxChild Music AST v2 types, schema, validation, demo score
  src/theory/       pitch, key, transpose helpers
  src/rhythm/       durations, quantization, measure helpers
  src/importers/    AST JSON, V1 JSON, plain text, MusicXML, MIDI
  src/exporters/    AST to V1 JSON, MusicXML, MIDI
  src/playback/     AST to playback events
  src/analysis/     range and difficulty analysis
  src/learning/     Learning Web-style activity export
  src/chords/       free-midi-chords index, MIDI import, chord detection, roman numerals

apps/studio/
  src/              Static React Studio UI
  public/examples/  Pasteable/exportable examples

mcp/
  tools-spec.md     Future MCP tool contract
```

## Current MVP

Implemented:

- Load built-in demo AST score.
- Paste simple note text, AST v2 JSON, or V1 JSON.
- Import MusicXML and MIDI files in the browser.
- Import chord MIDI files into AST chord events.
- Browse, preview, and insert free-midi-chords-compatible progressions.
- Render chord symbols above the staff in MusicXML/OSMD.
- Render printable notation through OpenSheetMusicDisplay.
- Play scores with Tone.js Web Audio playback.
- Choose playback engine: Basic Synth, Sampled Piano, or SoundFont extracted-samples mode.
- Edit title, composer, tempo, key, meter, notes, rests, durations, and transposition.
- Export AST JSON, V1 JSON, MusicXML, MIDI, and a Learning Web-style pack.
- Validate AST and store measure validation results after edits.
- Warn when a bar is underfilled or overfilled, highlight affected notes, and offer repair actions.
- Generate beginner learning questions and simple difficulty analysis.
- Unit tests for validation, pitch, duration, V1 import, plain text import, MusicXML, MIDI, and learning packs.

Known MVP limits:

- MusicXML import handles the basic single-voice subset.
- MIDI import is quantized and labelled as a draft transcription.
- Large-score lazy rendering is detected but not fully virtualized yet.
- MCP server implementation is documented but not wired as a runtime server yet.
- Browser SoundFont mode uses extracted samples. Direct `.sf2` playback is documented as a future native/server renderer.
- The full upstream free-midi-chords MIDI pack is not vendored by default; add selected MIDI files under `apps/studio/public/chords/free-midi-chords/`.

## Run Locally

```bash
npm install
npm run dev
```

Vite prints the local Studio URL, usually `http://localhost:5173/`.

## Verify

```bash
npm test
npm run build
```

The build emits a static app under `apps/studio/dist/`.

## Measure Validation

After every score edit, the app writes measure validation into the AST:

```json
{
  "measure": 1,
  "status": "underfilled",
  "beatsUsed": 3.5,
  "beatsExpected": 4,
  "missingBeats": 0.5,
  "suggestions": [
    "Add an eighth rest",
    "Change C4 from eighth to quarter"
  ]
}
```

The Studio shows these results in the header, Notes panel, score warning area, and AST JSON view.

## Chord Progressions

The chord module adopts [free-midi-chords](https://github.com/ldrolez/free-midi-chords) without making MIDI the internal model:

```text
free-midi-chords MIDI
→ parse MIDI
→ FoxChild Music AST chord events
→ render / play / edit / export
```

Static index:

```text
apps/studio/public/chords/chord-library-index.json
```

Drop-in data folder:

```text
apps/studio/public/chords/free-midi-chords/
```

Setup notes:

```bash
scripts/setup-free-midi-chords.sh
```

The upstream MIT notice is preserved in `apps/studio/public/chords/free-midi-chords/LICENSE`.

## Sample Playback

The static browser sample player reads maps such as:

```text
apps/studio/public/samples/piano/sample-map.json
```

Generated placeholder WAV samples are included so Sampled Piano works locally. Replace them with licensed extracted SoundFont samples for better sound. See [docs/soundfont-workflow.md](/Volumes/ExtremePro/AIWorkspace/music-editor/docs/soundfont-workflow.md).

## Simple Note Paste Format

```text
C4 quarter
D4 quarter
E4 quarter
rest quarter
G4 half
```

Supported durations:

```text
whole
half
quarter
eighth
sixteenth
dotted-half
dotted-quarter
dotted-eighth
```

## AST-First Rule

Every flow normalizes into `FoxChildMusicScore` AST v2:

```text
Plain text / V1 JSON / MusicXML / MIDI
        ↓
FoxChild Music AST v2
        ↓
Notation / Playback / Editing / Exports / Learning Pack
```

That keeps AI-generated music, printable notation, playback, and learning activities attached to the same semantic score model.
