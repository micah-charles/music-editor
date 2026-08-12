# FoxChild Music Score Lab

FoxChild Music Score Lab is a static-first, local-first music notation studio.
It combines the V1 MVP scope with the V2 AST-first architecture:

- V1 feature surface: paste notes, load JSON/MusicXML/MIDI, render notation, play, edit, and export.
- V2 internal model: `FoxChildMusicScore` AST v2 is the source of truth.
- MIDI and MusicXML are import/export formats, not the editable data model.
- The app requires no backend, login, or CDN dependency.
- Backend-dependent features are opt-in. The browser contacts the local OMR
  helper only after a user selects a PDF/image for conversion.

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
  src/learning/     Adaptive activity and FCMLIF question engines
                    families, generators, curricula, assessment, mastery and review
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
- Edit the canonical score AST in the synchronized Track Editor, with grouped
  track controls, measure/beat lanes, event inspector, direct note entry,
  spreadsheet entry, piano input, educational overlays, and a mini score strip.
- Start from a responsive nine-card Home Launcher, then open the active project
  through a radial flower menu with previews for each synchronized workspace.
- Save editable projects to a versioned IndexedDB library with autosave,
  recovery snapshots, bounded revisions, recent projects and direct routes.
- Export normal music work as MusicXML, MIDI or Print / Save as PDF; internal
  JSON and diagnostics are available only when Developer Mode is enabled.
- Export AST JSON, V1 JSON, MusicXML, MIDI, and a Learning Web-style pack.
- Validate AST and store measure validation results after edits.
- Warn when a bar is underfilled or overfilled, highlight affected notes, and offer repair actions.
- Generate beginner learning questions and simple difficulty analysis.
- Run versioned FCMLIF learning modules with canonical notation stimuli.
- Build adaptive sessions across fourteen music domains and four curricula.
- Answer key-signature MCQs and note-reading exercises from the on-screen or MIDI keyboard.
- Validate and preview authored question-set JSON with structured diagnostics.
- Persist attempt results and per-skill mastery locally.
- Unit tests for validation, pitch, duration, V1 import, plain text import, MusicXML, MIDI, and learning packs.

Known MVP limits:

- MusicXML import handles the basic single-voice subset.
- MIDI import is quantized and labelled as a draft transcription.
- The Track Editor horizontally windows event lanes and samples dense overview
  strips; full-score notation still uses large-score lazy rendering.
- MCP server implementation is documented but not wired as a runtime server yet.
- Browser SoundFont mode uses extracted samples. Direct `.sf2` playback is documented as a future native/server renderer.
- The full upstream free-midi-chords MIDI pack is not vendored by default; add selected MIDI files under `apps/studio/public/chords/free-midi-chords/`.
- Specialised visual renderers for notation entry, score drag/drop, microphone
  recording and composition remain adapter-backed; their data contracts and
  assessment strategies are implemented, but the first interactive slice
  renders choice and single-note keyboard/MIDI items.

## Run Locally

```bash
npm install
npm run dev
```

Vite prints the local Studio URL, usually `http://localhost:5173/`.

## Feature Flags

Production defaults live in `apps/studio/src/config/features.ts`.

- `aiAnalysis: false` removes the incomplete AI Analysis workspace and safely
  redirects legacy Analysis URLs or saved layout state to Score.
- `omrImport: true` keeps PDF/image OMR available as an explicit, user-started
  optional-backend workflow.

## Save and Export

Save writes the current editable project to My Projects. It does not download a
file or ask the user to choose an internal format. Cmd/Ctrl+S and autosave use
the same local IndexedDB repository.

Export is for sharing music:

- MusicXML
- MIDI
- Print / Save as PDF

Learning progress can be transferred separately as `.fcmusic`. See
[project persistence, Save and Export](docs/architecture/project-persistence-save-export.md).

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

## Adaptive Music Learning

The Learning workspace uses `LearningActivity` 2.0 for adaptive selection and
FCMLIF `QuestionSet` 1.0 as its compatible authored-item and delivery layer:

```text
attempt history → mastery + scheduled review
→ curriculum/topic eligibility
→ 40% review / 30% developing / 20% new / 10% challenge
→ deterministic question family
→ canonical FoxChildMusicScore AST
→ shared notation / playback / piano / MIDI renderer
→ assessment → persisted evidence → next question
```

Learning Home provides a recommended session, curriculum/topic/length controls,
a fourteen-domain coverage map, mastery, recent history, common mistakes and
next-review timing. The original ten sets and all fifty authored questions
remain available through the authored practice library and v1-to-v2 migration.
The entire normal learning flow is static-first and browser-local.

Reference files:

- [Architecture](docs/learning/ARCHITECTURE.md)
- [Implementation report](docs/learning/IMPLEMENTATION_REPORT.md)
- [Migration policy](docs/learning/MIGRATIONS.md)
- [LearningActivity v2 schema](docs/learning/schemas/learning-activity-v2.schema.json)
- [Question-set schema](docs/learning/schemas/question-set-v1.schema.json)
- [Attempt schema](docs/learning/schemas/attempt-v1.schema.json)
- [Example question set](apps/studio/public/learning/music-learning-foundations.question-set.json)
