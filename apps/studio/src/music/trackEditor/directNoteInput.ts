import {
  DURATION_BEATS,
  detectChordName,
  parsePitchName,
  type Duration,
  type MusicEvent,
  type NoteDurationValue,
  type Pitch
} from "@foxchild/music-core";

export interface ParsedDirectNote {
  kind: "note" | "chord" | "rest";
  pitches: Pitch[];
  duration: Duration;
  grace: boolean;
  source: string;
}

export interface DirectNoteParseResult {
  valid: boolean;
  entries: ParsedDirectNote[];
  error?: string;
  errorToken?: string;
}

const durationAliases: Record<string, NoteDurationValue> = {
  w: "whole",
  h: "half",
  q: "quarter",
  "8": "eighth",
  "1/8": "eighth",
  "16": "sixteenth",
  "1/16": "sixteenth",
  "32": "thirty-second",
  "1/32": "thirty-second"
};

export const directNoteSuggestions = [
  "C4 q",
  "C4,E4,G4 q",
  "R h",
  "C4 triplet 1/8",
  "grace D5 1/16"
];

export function parseDirectNoteInput(input: string, defaultOctave = 4): DirectNoteParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { valid: false, entries: [], error: "Type a note, chord or rest.", errorToken: "" };

  const entries: ParsedDirectNote[] = [];
  let index = 0;
  while (index < tokens.length) {
    const sourceStart = index;
    let grace = false;
    if (tokens[index]?.toLowerCase() === "grace") {
      grace = true;
      index += 1;
    }
    const pitchToken = tokens[index];
    if (!pitchToken) return invalid(entries, "Grace must be followed by a pitch.", tokens[sourceStart]);
    index += 1;

    let triplet = false;
    if (tokens[index]?.toLowerCase() === "triplet") {
      triplet = true;
      index += 1;
    }
    const durationToken = tokens[index]?.toLowerCase();
    const durationValue = durationToken ? durationAliases[durationToken] : undefined;
    if (!durationValue) {
      return invalid(entries, `Expected a duration after "${pitchToken}" (q, h, w, 8, 16 or 32).`, tokens[index] ?? pitchToken);
    }
    index += 1;

    const isRest = /^r(?:est)?$/i.test(pitchToken);
    if (grace && isRest) return invalid(entries, "A grace event must contain a pitch.", pitchToken);
    let pitches: Pitch[] = [];
    if (!isRest) {
      try {
        pitches = pitchToken.split(",").map((value) => parseFlexiblePitch(value, defaultOctave));
      } catch (error) {
        return invalid(entries, error instanceof Error ? error.message : String(error), pitchToken);
      }
    }
    const duration: Duration = {
      value: durationValue,
      beats: DURATION_BEATS[durationValue],
      ...(triplet ? { tuplet: { actualNotes: 3, normalNotes: 2, normalType: durationValue } } : {})
    };
    entries.push({
      kind: isRest ? "rest" : pitches.length > 1 ? "chord" : "note",
      pitches,
      duration,
      grace,
      source: tokens.slice(sourceStart, index).join(" ")
    });
  }
  return { valid: true, entries };
}

export function directNotesToEvents(entries: readonly ParsedDirectNote[], idPrefix: string): MusicEvent[] {
  return entries.map((entry, index) => {
    const common = {
      id: `${idPrefix}-${index + 1}`,
      duration: entry.duration
    };
    if (entry.kind === "rest") return { ...common, type: "rest" };
    const notation = entry.grace ? { grace: { slash: true } } : undefined;
    if (entry.kind === "chord") {
      return {
        ...common,
        type: "chord",
        pitches: entry.pitches,
        notation,
        semantic: { chordName: detectChordName(entry.pitches) }
      };
    }
    return {
      ...common,
      type: "note",
      pitch: entry.pitches[0],
      notation
    };
  });
}

function parseFlexiblePitch(value: string, defaultOctave: number): Pitch {
  const trimmed = value.trim();
  const match = /^([A-Ga-g])([#b]?)(-?\d+)?$/.exec(trimmed);
  if (!match) throw new Error(`"${value}" is not a valid pitch. Try C4, F#5 or Bb3.`);
  const [, step, accidental, octave] = match;
  return parsePitchName(`${step.toUpperCase()}${accidental}${octave ?? defaultOctave}`);
}

function invalid(entries: ParsedDirectNote[], error: string, errorToken: string): DirectNoteParseResult {
  return { valid: false, entries, error, errorToken };
}
