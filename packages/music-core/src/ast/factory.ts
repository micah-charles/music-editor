import type { FoxChildMusicScore, MusicEvent, Part, ScoreSource, Step } from "./types";
import { eventsToMeasures, getBeatsPerMeasure } from "../rhythm/measure";

export interface CreateScoreOptions {
  id?: string;
  title: string;
  composer?: string;
  source?: ScoreSource;
  tempo?: number;
  key?: {
    tonic: Step;
    mode?: "major" | "minor";
  };
  timeSignature?: {
    beats: number;
    beatType: number;
  };
  partName?: string;
  instrumentName?: string;
  midiProgram?: number;
  events?: MusicEvent[];
}

export function createScoreFromEvents(options: CreateScoreOptions): FoxChildMusicScore {
  const timeSignature = options.timeSignature ?? { beats: 4, beatType: 4 };
  const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
  const events = options.events ?? [];
  const part: Part = {
    id: "melody",
    name: options.partName ?? "Melody",
    instrument: {
      name: options.instrumentName ?? "Piano",
      midiProgram: options.midiProgram ?? 1
    },
    clef: "treble",
    measures: eventsToMeasures(events, beatsPerMeasure)
  };

  return {
    schemaVersion: "2.0",
    type: "FoxChildMusicScore",
    id: options.id ?? slugify(options.title),
    metadata: {
      title: options.title,
      composer: options.composer ?? "FoxChild",
      source: options.source ?? "manual",
      createdAt: new Date().toISOString().slice(0, 10)
    },
    global: {
      key: {
        tonic: options.key?.tonic ?? "C",
        mode: options.key?.mode ?? "major"
      },
      timeSignature,
      tempo: {
        bpm: options.tempo ?? 90,
        label: "Moderato"
      }
    },
    parts: [part],
    phrases: [
      {
        id: "phrase-a",
        label: "Phrase A",
        partId: part.id,
        fromMeasure: 1,
        toMeasure: Math.min(2, part.measures.length),
        description: "Opening phrase"
      }
    ],
    learning: {
      level: "beginner",
      skills: ["quarter notes", "stepwise motion", "treble clef"],
      suitableFor: ["sight-reading", "beginner piano", "music theory"]
    }
  };
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled-score";
}
