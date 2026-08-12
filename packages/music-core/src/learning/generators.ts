import type {
  Clef,
  FoxChildMusicScore,
  MusicEvent,
  NoteDurationValue,
  Step
} from "../ast/types";
import { DURATION_BEATS } from "../rhythm/duration";
import { eventsToMeasures } from "../rhythm/measure";
import { midiToPitch } from "../theory/pitch";
import { MusicGeneratorRegistry } from "./registries";
import type { MusicQuestionGenerator } from "./types";

const KEY_FIFTHS: Record<string, { tonic: Step; fifths: number }> = {
  C: { tonic: "C", fifths: 0 },
  G: { tonic: "G", fifths: 1 },
  D: { tonic: "D", fifths: 2 },
  A: { tonic: "A", fifths: 3 },
  E: { tonic: "E", fifths: 4 },
  B: { tonic: "B", fifths: 5 },
  "F#": { tonic: "F", fifths: 6 },
  "C#": { tonic: "C", fifths: 7 },
  F: { tonic: "F", fifths: -1 },
  Bb: { tonic: "B", fifths: -2 },
  Eb: { tonic: "E", fifths: -3 },
  Ab: { tonic: "A", fifths: -4 },
  Db: { tonic: "D", fifths: -5 },
  Gb: { tonic: "G", fifths: -6 },
  Cb: { tonic: "C", fifths: -7 }
};

export function createDefaultMusicGeneratorRegistry(): MusicGeneratorRegistry {
  const registry = new MusicGeneratorRegistry();
  [
    keySignatureGenerator,
    noteReadingGenerator,
    { ...noteReadingGenerator, id: "single-note-display@1" },
    melodicIntervalGenerator,
    { ...melodicIntervalGenerator, id: "interval-display@1" },
    chordGenerator,
    { ...chordGenerator, id: "chord-display@1" },
    rhythmFragmentGenerator,
    { ...rhythmFragmentGenerator, id: "note-value-display@2" },
    { ...rhythmFragmentGenerator, id: "time-signature-display@2" },
    sightReadingGenerator,
    scaleGenerator,
    tempoGenerator,
    melodyDictationGenerator,
    errorDetectionGenerator
  ].forEach((generator) => registry.register(generator));
  return registry;
}

export const keySignatureGenerator: MusicQuestionGenerator = {
  id: "key-signature-display@1",
  generate(seed, parameters) {
    const keyName = normaliseKeyName(String(parameters.tonic ?? "C"));
    const key = KEY_FIFTHS[keyName] ?? KEY_FIFTHS.C;
    const showNotes = parameters.showNotes === true || parameters.displayNote === true;
    const events: MusicEvent[] = showNotes
      ? [noteEvent("key-note-1", tonicMidi(keyName, 4), "whole")]
      : [{ id: "key-rest-1", type: "rest", duration: duration("whole") }];
    return score({
      id: deterministicId("key-signature", seed),
      title: `${keyName} ${String(parameters.mode ?? "major")} key signature`,
      clef: clef(parameters.clef),
      tonic: key.tonic,
      mode: parameters.mode === "minor" ? "minor" : "major",
      fifths: key.fifths,
      tempo: 90,
      events
    });
  }
};

export const noteReadingGenerator: MusicQuestionGenerator = {
  id: "note-reading@1",
  generate(seed, parameters) {
    const random = seededRandom(seed);
    const minimum = number(parameters.minimumMidi, 60);
    const maximum = number(parameters.maximumMidi, 72);
    const midi = Number.isFinite(Number(parameters.midi))
      ? Math.round(Number(parameters.midi))
      : Math.floor(minimum + random() * (maximum - minimum + 1));
    return score({
      id: deterministicId("note-reading", seed),
      title: "Note reading",
      clef: clef(parameters.clef),
      events: [noteEvent("target-note", midi, "whole")]
    });
  }
};

export const melodicIntervalGenerator: MusicQuestionGenerator = {
  id: "melodic-interval@1",
  generate(seed, parameters) {
    const root = Math.round(number(parameters.rootMidi, 60));
    const semitones = Math.round(number(parameters.semitones, 7));
    const direction = parameters.direction === "descending" ? -1 : 1;
    const value = durationName(parameters.duration, "quarter");
    const events: MusicEvent[] = [
      noteEvent("interval-note-1", root, value),
      noteEvent("interval-note-2", root + semitones * direction, value)
    ];
    return score({
      id: deterministicId("interval", seed),
      title: "Melodic interval",
      tempo: number(parameters.bpm, 90),
      events
    });
  }
};

export const chordGenerator: MusicQuestionGenerator = {
  id: "chord@1",
  generate(seed, parameters) {
    const root = Math.round(number(parameters.rootMidi, 60));
    const qualityIntervals: Record<string, number[]> = {
      major: [0, 4, 7],
      minor: [0, 3, 7],
      diminished: [0, 3, 6],
      augmented: [0, 4, 8],
      dominant7: [0, 4, 7, 10],
      "dominant-seventh": [0, 4, 7, 10]
    };
    const intervals = Array.isArray(parameters.intervals)
      ? parameters.intervals.map(Number).filter(Number.isFinite)
      : qualityIntervals[String(parameters.quality ?? "major")] ?? qualityIntervals.major;
    return score({
      id: deterministicId("chord", seed),
      title: "Chord",
      events: [{
        id: "target-chord",
        type: "chord",
        pitches: intervals.map((interval) => midiToPitch(root + interval)),
        duration: duration("whole")
      }]
    });
  }
};

export const rhythmFragmentGenerator: MusicQuestionGenerator = {
  id: "rhythm-fragment@1",
  generate(seed, parameters) {
    const random = seededRandom(seed);
    const authoredPattern = Array.isArray(parameters.pattern)
      ? parameters.pattern.map((value) => durationName(value, "quarter"))
      : undefined;
    const tuplet = isRecord(parameters.tuplet) ? parameters.tuplet : undefined;
    const allowed = asDurations(parameters.allowedDurations);
    const beats = Math.max(1, number(parameters.beats, 4));
    const authoredTimeSignature = isRecord(parameters.timeSignature) ? parameters.timeSignature : {};
    const timeSignature = {
      beats: Math.max(1, Math.round(number(authoredTimeSignature.beats, 4))),
      beatType: Math.max(1, Math.round(number(authoredTimeSignature.beatType, 4)))
    };
    if (authoredPattern?.length) {
      const actualNotes = tuplet ? Math.max(2, Math.round(number(tuplet.actualNotes, 0))) : 0;
      const normalNotes = tuplet ? Math.max(1, Math.round(number(tuplet.normalNotes, 0))) : 0;
      const normalType = durationName(tuplet?.normalType, "quarter");
      return score({
        id: deterministicId("rhythm", seed),
        title: "Rhythm fragment",
        tempo: number(parameters.bpm, 90),
        timeSignature,
        events: authoredPattern.map((value, index) => actualNotes > 1 && normalNotes > 0
          ? noteEventWithTuplet(`rhythm-note-${index + 1}`, 60, value, actualNotes, normalNotes, normalType)
          : noteEvent(`rhythm-note-${index + 1}`, 60, value))
      });
    }
    const events: MusicEvent[] = [];
    let used = 0;
    let index = 0;
    while (used < beats - 0.0001 && index < 64) {
      const candidates = allowed.filter((value) => DURATION_BEATS[value] <= beats - used + 0.0001);
      const value = candidates[Math.floor(random() * candidates.length)] ?? "quarter";
      events.push(noteEvent(`rhythm-note-${index + 1}`, 60, value));
      used += DURATION_BEATS[value];
      index += 1;
    }
    return score({
      id: deterministicId("rhythm", seed),
      title: "Rhythm fragment",
      tempo: number(parameters.bpm, 90),
      timeSignature,
      events
    });
  }
};

export const sightReadingGenerator: MusicQuestionGenerator = {
  id: "sight-reading-melody@1",
  generate(seed, parameters) {
    const random = seededRandom(seed);
    const measures = Math.max(1, Math.round(number(parameters.measures, 4)));
    const pitchRange = isRecord(parameters.pitchRange) ? parameters.pitchRange : {};
    const minimum = Math.round(number(pitchRange.minimumMidi, 60));
    const maximum = Math.round(number(pitchRange.maximumMidi, 72));
    const maximumLeap = Math.max(1, Math.round(number(parameters.maximumLeapSemitones, 5)));
    const allowed = asDurations(parameters.allowedDurations);
    const events: MusicEvent[] = [];
    let current = Number.isFinite(Number(parameters.firstMidi))
      ? Math.round(number(parameters.firstMidi, minimum))
      : Math.round((minimum + maximum) / 2);
    let remaining = measures * 4;
    let index = 0;
    while (remaining > 0.0001) {
      const durations = allowed.filter((value) => DURATION_BEATS[value] <= remaining + 0.0001);
      const value = durations[Math.floor(random() * durations.length)] ?? "quarter";
      if (index > 0) {
        const leap = Math.floor(random() * (maximumLeap * 2 + 1)) - maximumLeap;
        current = Math.min(maximum, Math.max(minimum, current + leap));
      }
      events.push(noteEvent(`sight-note-${index + 1}`, current, value));
      remaining -= DURATION_BEATS[value];
      index += 1;
    }
    const key = isRecord(parameters.key) ? parameters.key : {};
    const tonicName = normaliseKeyName(String(key.tonic ?? "C"));
    const tonic = KEY_FIFTHS[tonicName] ?? KEY_FIFTHS.C;
    return score({
      id: deterministicId("sight-reading", seed),
      title: "Sight-reading melody",
      clef: clef(parameters.clef),
      tonic: tonic.tonic,
      fifths: tonic.fifths,
      mode: key.mode === "minor" ? "minor" : "major",
      tempo: number(parameters.bpm, 80),
      events
    });
  }
};

export const scaleGenerator: MusicQuestionGenerator = {
  id: "scale-display@2",
  generate(seed, parameters) {
    const root = Math.round(number(parameters.rootMidi, 60));
    const mode = String(parameters.mode ?? "major");
    const intervals = mode === "natural-minor"
      ? [0, 2, 3, 5, 7, 8, 10, 12]
      : mode === "harmonic-minor"
        ? [0, 2, 3, 5, 7, 8, 11, 12]
        : [0, 2, 4, 5, 7, 9, 11, 12];
    return score({
      id: deterministicId("scale", seed),
      title: `${mode.replaceAll("-", " ")} scale`,
      tempo: number(parameters.bpm, 84),
      events: intervals.map((interval, index) =>
        noteEvent(`scale-note-${index + 1}`, root + interval, "eighth")
      )
    });
  }
};

export const tempoGenerator: MusicQuestionGenerator = {
  id: "tempo-example@2",
  generate(seed, parameters) {
    const bpm = Math.max(30, Math.min(220, Math.round(number(parameters.bpm, 100))));
    return score({
      id: deterministicId("tempo", seed),
      title: `Tempo example at ${bpm} bpm`,
      tempo: bpm,
      events: Array.from({ length: 4 }, (_, index) =>
        noteEvent(`tempo-note-${index + 1}`, index % 2 === 0 ? 60 : 64, "quarter")
      )
    });
  }
};

export const melodyDictationGenerator: MusicQuestionGenerator = {
  id: "melody-dictation@2",
  generate(seed, parameters) {
    const random = seededRandom(seed);
    const root = Math.round(number(parameters.rootMidi, 60));
    const length = Math.max(3, Math.min(8, Math.round(number(parameters.length, 4))));
    const contour = String(parameters.contour ?? "mixed");
    let current = root;
    const events = Array.from({ length }, (_, index) => {
      if (index > 0) {
        const direction = contour === "ascending"
          ? 1
          : contour === "descending"
            ? -1
            : random() >= 0.5 ? 1 : -1;
        current += direction * (random() >= 0.5 ? 2 : 1);
      }
      return noteEvent(`dictation-note-${index + 1}`, current, "quarter");
    });
    return score({
      id: deterministicId("melody-dictation", seed),
      title: "Melody dictation",
      tempo: number(parameters.bpm, 72),
      events
    });
  }
};

export const errorDetectionGenerator: MusicQuestionGenerator = {
  id: "error-detection@2",
  generate(seed, parameters) {
    const root = Math.round(number(parameters.rootMidi, 60));
    const errorIndex = Math.max(0, Math.min(3, Math.round(number(parameters.errorIndex, hashSeed(seed) % 4))));
    const pitches = [root, root + 2, root + 4, root + 5];
    pitches[errorIndex] += Math.round(number(parameters.errorSemitones, 1));
    return score({
      id: deterministicId("error-detection", seed),
      title: "Find the notation error",
      tempo: 80,
      events: pitches.map((midi, index) => noteEvent(`error-note-${index + 1}`, midi, "quarter"))
    });
  }
};

function score(options: {
  id: string;
  title: string;
  events: MusicEvent[];
  clef?: Clef;
  tonic?: Step;
  mode?: "major" | "minor";
  fifths?: number;
  tempo?: number;
  timeSignature?: { beats: number; beatType: number };
}): FoxChildMusicScore {
  const timeSignature = options.timeSignature ?? { beats: 4, beatType: 4 };
  const measureBeats = timeSignature.beats * 4 / timeSignature.beatType;
  return {
    schemaVersion: "2.0",
    type: "FoxChildMusicScore",
    id: options.id,
    metadata: {
      title: options.title,
      composer: "FoxChild Learning Generator",
      source: "ai-generated"
    },
    global: {
      key: { tonic: options.tonic ?? "C", mode: options.mode ?? "major", fifths: options.fifths ?? 0 },
      timeSignature,
      tempo: { bpm: options.tempo ?? 90, source: "default" }
    },
    parts: [{
      id: "learning-part",
      name: "Learning",
      instrument: { name: "Piano", midiProgram: 1 },
      clef: options.clef ?? "treble",
      measures: eventsToMeasures(options.events, measureBeats)
    }],
    learning: {
      suitableFor: ["music-learning"],
      skills: []
    }
  };
}

function noteEvent(id: string, midi: number, value: NoteDurationValue): MusicEvent {
  return { id, type: "note", pitch: midiToPitch(midi), duration: duration(value) };
}

function noteEventWithTuplet(
  id: string,
  midi: number,
  value: NoteDurationValue,
  actualNotes: number,
  normalNotes: number,
  normalType: NoteDurationValue
): MusicEvent {
  return {
    id,
    type: "note",
    pitch: midiToPitch(midi),
    duration: {
      value,
      beats: DURATION_BEATS[value] * normalNotes / actualNotes,
      tuplet: { actualNotes, normalNotes, normalType }
    }
  };
}

function duration(value: NoteDurationValue) {
  return { value, beats: DURATION_BEATS[value] };
}

function durationName(value: unknown, fallback: NoteDurationValue): NoteDurationValue {
  const aliases: Record<string, NoteDurationValue> = {
    "1/1": "whole",
    "1/2": "half",
    "1/4": "quarter",
    "1/8": "eighth",
    "1/16": "sixteenth"
  };
  const candidate = aliases[String(value)] ?? value;
  return typeof candidate === "string" && candidate in DURATION_BEATS
    ? candidate as NoteDurationValue
    : fallback;
}

function asDurations(value: unknown): NoteDurationValue[] {
  const values = Array.isArray(value) ? value : ["quarter", "half"];
  const normalised = values.map((item) => durationName(item, "quarter"));
  return [...new Set(normalised)];
}

function clef(value: unknown): Clef {
  return ["treble", "bass", "alto", "tenor"].includes(String(value)) ? value as Clef : "treble";
}

function normaliseKeyName(value: string): string {
  return value.replace("♭", "b").replace("♯", "#").replace("-flat", "b").replace("-sharp", "#");
}

function tonicMidi(keyName: string, octave: number): number {
  const pitchClass: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11, Cb: 11
  };
  return (octave + 1) * 12 + (pitchClass[keyName] ?? 0);
}

function deterministicId(prefix: string, seed: string): string {
  return `${prefix}-${hashSeed(seed).toString(16).padStart(8, "0")}`;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state |= 0;
    state = state + 0x6d2b79f5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function number(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
