import type { FoxChildMusicScore } from "./types";

export const simpleMelodyAst: FoxChildMusicScore = {
  schemaVersion: "2.0",
  type: "FoxChildMusicScore",
  id: "simple-melody-c-major",
  metadata: {
    title: "Simple Melody in C",
    composer: "FoxChild AI",
    source: "ai-generated",
    createdAt: "2026-07-04"
  },
  global: {
    key: {
      tonic: "C",
      mode: "major"
    },
    timeSignature: {
      beats: 4,
      beatType: 4
    },
    tempo: {
      bpm: 90,
      label: "Moderato"
    }
  },
  parts: [
    {
      id: "melody",
      name: "Melody",
      instrument: {
        name: "Piano",
        midiProgram: 1
      },
      clef: "treble",
      measures: [
        {
          number: 1,
          events: [
            {
              id: "m1-n1",
              type: "note",
              pitch: { step: "C", octave: 4, alter: 0 },
              duration: { value: "quarter", beats: 1 },
              semantic: { scaleDegree: 1, function: "tonic" }
            },
            {
              id: "m1-n2",
              type: "note",
              pitch: { step: "D", octave: 4, alter: 0 },
              duration: { value: "quarter", beats: 1 },
              semantic: { scaleDegree: 2, function: "passing" }
            },
            {
              id: "m1-n3",
              type: "note",
              pitch: { step: "E", octave: 4, alter: 0 },
              duration: { value: "quarter", beats: 1 },
              semantic: { scaleDegree: 3, function: "passing" }
            },
            {
              id: "m1-n4",
              type: "note",
              pitch: { step: "C", octave: 4, alter: 0 },
              duration: { value: "quarter", beats: 1 },
              semantic: { scaleDegree: 1, function: "tonic" }
            }
          ]
        },
        {
          number: 2,
          events: [
            {
              id: "m2-n1",
              type: "note",
              pitch: { step: "E", octave: 4, alter: 0 },
              duration: { value: "quarter", beats: 1 }
            },
            {
              id: "m2-n2",
              type: "note",
              pitch: { step: "F", octave: 4, alter: 0 },
              duration: { value: "quarter", beats: 1 }
            },
            {
              id: "m2-n3",
              type: "note",
              pitch: { step: "G", octave: 4, alter: 0 },
              duration: { value: "half", beats: 2 }
            }
          ]
        }
      ]
    }
  ],
  phrases: [
    {
      id: "phrase-a",
      label: "Phrase A",
      partId: "melody",
      fromMeasure: 1,
      toMeasure: 2,
      description: "Simple stepwise opening phrase"
    }
  ],
  learning: {
    level: "beginner",
    skills: ["read C4", "read D4", "quarter notes", "stepwise motion"],
    suitableFor: ["sight-reading", "beginner piano", "music theory"]
  }
};
