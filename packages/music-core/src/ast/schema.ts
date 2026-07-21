export const foxChildMusicAstSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://foxchild.local/schemas/foxchild-music-ast-v2.schema.json",
  title: "FoxChild Music AST v2",
  type: "object",
  required: ["schemaVersion", "type", "id", "metadata", "global", "parts"],
  properties: {
    schemaVersion: { const: "2.0" },
    type: { const: "FoxChildMusicScore" },
    id: { type: "string", minLength: 1 },
    metadata: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", minLength: 1 },
        movementTitle: { type: "string" },
        subtitle: { type: "string" },
        composer: { type: "string" },
        arranger: { type: "string" },
        lyricist: { type: "string" },
        source: { type: "string" },
        createdAt: { type: "string" },
        updatedAt: { type: "string" },
        notes: { type: "string" }
      }
    },
    global: {
      type: "object",
      required: ["key", "timeSignature", "tempo"],
      properties: {
        key: {
          type: "object",
          required: ["tonic", "mode"],
          properties: {
            tonic: { enum: ["C", "D", "E", "F", "G", "A", "B"] },
            mode: { enum: ["major", "minor"] },
            fifths: { type: "integer", minimum: -7, maximum: 7 }
          }
        },
        timeSignature: {
          type: "object",
          required: ["beats", "beatType"],
          properties: {
            beats: { type: "number", minimum: 1 },
            beatType: { type: "number", minimum: 1 }
          }
        },
        tempo: {
          type: "object",
          required: ["bpm"],
          properties: {
            bpm: { type: "number", minimum: 20, maximum: 280 },
            label: { type: "string" },
            source: { enum: ["musicxml", "omr", "user", "default"] }
          }
        }
      }
    },
    parts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "name", "instrument", "clef", "measures"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          instrument: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
              midiProgram: { type: "number" },
              soundFontBank: { type: "number" },
              soundFontPreset: { type: "number" }
            }
          },
          clef: { enum: ["treble", "bass", "alto", "tenor"] },
          channel: { type: "number", minimum: 0, maximum: 15 },
          muted: { type: "boolean" },
          solo: { type: "boolean" },
          collapsed: { type: "boolean" },
          measures: {
            type: "array",
            items: {
              type: "object",
              required: ["number", "events"],
              properties: {
                number: { type: "number", minimum: 1 },
                events: { type: "array" }
              }
            }
          }
        }
      }
    },
    sourceMetadata: {
      type: "object",
      properties: {
        originalFormat: {
          enum: ["foxchild-v1", "musicxml", "midi", "plain-text", "manual", "free-midi-chords", "audiveris-omr"]
        },
        draftTranscription: { type: "boolean" },
        warnings: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  }
} as const;
