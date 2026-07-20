# FoxChild Music MCP Tool Spec

## create_score

Creates a beginner-friendly FoxChild Music AST v2 score.

Input:

```json
{
  "title": "Beginner Melody",
  "key": "C major",
  "timeSignature": "4/4",
  "tempo": 90,
  "constraints": {
    "range": "C4-G4",
    "bars": 8,
    "difficulty": "beginner"
  }
}
```

Output:

```json
{
  "scoreAst": {},
  "summary": "Generated 8-bar beginner melody in C major."
}
```

## validate_score

Checks:

- schema validity
- required metadata
- valid pitch objects
- supported durations
- measure overflow

Output:

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

## render_score_svg

Converts AST to MusicXML and renders a requested page as SVG.

Input:

```json
{
  "scoreAst": {},
  "page": 1
}
```

Output:

```json
{
  "svg": "<svg>...</svg>"
}
```

## export_musicxml

Output:

```json
{
  "musicXml": "..."
}
```

## export_midi

Output:

```json
{
  "midiBase64": "..."
}
```

## import_midi

Imports MIDI as a draft transcription and returns AST v2.

Output metadata should include:

```json
{
  "sourceMetadata": {
    "originalFormat": "midi",
    "draftTranscription": true
  }
}
```

## analyse_score

Output:

```json
{
  "range": "C4-G4",
  "difficulty": "beginner",
  "noteCount": 16,
  "skills": []
}
```

## simplify_score

Simplifies:

- rhythm
- note range
- accidentals
- leaps
- density

## generate_learning_pack

Creates Learning Web-compatible activity JSON from AST v2.
