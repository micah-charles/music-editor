import type { FoxChildMusicScore, MusicEvent, Part } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { getBeatsPerMeasure } from "../rhythm/measure";
import { chordNameToPitches } from "./chordDetection";
import type { ChordProgressionAstOptions, ChordProgressionEntry } from "./chordLibraryTypes";
import { chordFunctionFromRoman, romanToChordName } from "./romanNumeral";

export function chordProgressionToAst(entry: ChordProgressionEntry, options: ChordProgressionAstOptions = {}): FoxChildMusicScore {
  const key = options.key ?? (entry.key?.charAt(0).toUpperCase() as never) ?? "C";
  const mode = options.mode ?? (entry.mode === "minor" ? "minor" : "major");
  const progression = options.progression ?? entry.progression ?? "I V vi IV";
  const timeSignature = { beats: 4, beatType: 4 };
  const beatsPerMeasure = getBeatsPerMeasure(timeSignature);

  const events: MusicEvent[] = progression.split(/[\s–—-]+/).filter(Boolean).map((roman, index) => {
    const chordName = romanToChordName(roman, `${key} ${mode}`);
    return {
      id: `chord-${index + 1}`,
      type: "chord",
      pitches: chordNameToPitches(chordName, 4),
      duration: {
        value: "whole",
        beats: beatsPerMeasure * (options.barsPerChord ?? 1)
      },
      velocity: 84,
      semantic: {
        chordName,
        roman,
        function: chordFunctionFromRoman(roman),
        sourceProgression: progression
      }
    };
  });

  const score = createScoreFromEvents({
    id: options.id ?? slugify(options.title ?? entry.title),
    title: options.title ?? entry.title,
    composer: "free-midi-chords / FoxChild",
    source: "free-midi-chords",
    tempo: options.tempo ?? 90,
    key: { tonic: key, mode },
    timeSignature,
    instrumentName: "Piano",
    events
  });

  score.parts[0] = createChordPart(events, beatsPerMeasure);
  score.learning = {
    level: "beginner",
    skills: ["chord symbols", "roman numerals", "harmonic function"],
    suitableFor: ["music theory", "composition", "ear training"]
  };
  score.sourceMetadata = {
    originalFormat: "free-midi-chords",
    warnings: [`Progression source: ${entry.sourcePath}`, "License: MIT"]
  };
  return score;
}

export function insertChordProgressionIntoScore(score: FoxChildMusicScore, progression: FoxChildMusicScore): FoxChildMusicScore {
  const next = structuredClone(score) as FoxChildMusicScore;
  const chordPart = progression.parts.find((part) => part.id === "chords") ?? progression.parts[0];
  const existingIndex = next.parts.findIndex((part) => part.id === "chords");

  if (existingIndex >= 0) {
    next.parts[existingIndex] = chordPart;
  } else {
    next.parts.push(chordPart);
  }

  next.metadata.updatedAt = new Date().toISOString().slice(0, 10);
  next.sourceMetadata = {
    ...next.sourceMetadata,
    warnings: [...(next.sourceMetadata?.warnings ?? []), "Chord progression inserted from free-midi-chords-compatible library."]
  };
  return next;
}

export function chordProgressionToLearningPack(scoreAst: FoxChildMusicScore) {
  const chordEvents = scoreAst.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events)).filter((event) => event.type === "chord");
  return {
    subject: "Music" as const,
    chapter: `${scoreAst.metadata.title} Chords`,
    activityType: "music-score" as const,
    scoreId: scoreAst.id,
    scoreAst,
    questions: chordEvents.flatMap((event) => {
      if (event.type !== "chord" || !event.semantic?.chordName) {
        return [];
      }
      return [{
        type: "chord-function" as const,
        question: `In ${scoreAst.global.key.tonic} ${scoreAst.global.key.mode}, what is the function of ${event.semantic.chordName}?`,
        answer: `${event.semantic.roman ?? "?"} / ${event.semantic.function ?? "other"}`
      }];
    })
  };
}

function createChordPart(events: MusicEvent[], beatsPerMeasure: number): Part {
  return {
    id: "chords",
    name: "Chords",
    instrument: {
      name: "Piano",
      midiProgram: 1
    },
    clef: "treble",
    measures: events.map((event, index) => ({
      number: index + 1,
      events: [{
        ...event,
        duration: {
          value: "whole" as const,
          beats: beatsPerMeasure
        }
      }]
    }))
  };
}
