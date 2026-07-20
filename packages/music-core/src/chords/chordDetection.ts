import type { Pitch } from "../ast/types";
import { midiToPitch, pitchToMidi } from "../theory/pitch";

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function detectChordName(pitches: Pitch[]): string {
  if (pitches.length === 0) {
    return "N.C.";
  }

  const midiValues = pitches.map(pitchToMidi).sort((a, b) => a - b);
  const pitchClasses = [...new Set(midiValues.map((midi) => ((midi % 12) + 12) % 12))];
  const bass = PITCH_CLASS_NAMES[((midiValues[0] % 12) + 12) % 12];

  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12).sort((a, b) => a - b);
    const rootName = PITCH_CLASS_NAMES[root];

    if (containsIntervals(intervals, [0, 4, 7, 11])) return slashIfInverted(`${rootName}maj7`, rootName, bass);
    if (containsIntervals(intervals, [0, 4, 7, 10])) return slashIfInverted(`${rootName}7`, rootName, bass);
    if (containsIntervals(intervals, [0, 3, 7, 10])) return slashIfInverted(`${rootName}m7`, rootName, bass);
    if (containsIntervals(intervals, [0, 3, 6])) return slashIfInverted(`${rootName}dim`, rootName, bass);
    if (containsIntervals(intervals, [0, 4, 8])) return slashIfInverted(`${rootName}aug`, rootName, bass);
    if (containsIntervals(intervals, [0, 3, 7])) return slashIfInverted(`${rootName}m`, rootName, bass);
    if (containsIntervals(intervals, [0, 4, 7])) return slashIfInverted(rootName, rootName, bass);
    if (containsIntervals(intervals, [0, 5, 7])) return slashIfInverted(`${rootName}sus4`, rootName, bass);
    if (containsIntervals(intervals, [0, 2, 7])) return slashIfInverted(`${rootName}sus2`, rootName, bass);
  }

  return pitchToChordFallback(midiValues);
}

export function chordNameToPitches(chordName: string, octave = 4): Pitch[] {
  const parsed = parseChordName(chordName);
  const rootMidi = pitchClassToMidi(parsed.root, octave);
  const intervals = chordQualityIntervals(parsed.quality);
  return intervals.map((interval) => midiToPitch(rootMidi + interval));
}

export function parseChordName(chordName: string): { root: string; quality: string; bass?: string } {
  const [body, bass] = chordName.trim().split("/");
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(body);
  if (!match) {
    return { root: "C", quality: "", bass };
  }
  return {
    root: normalizeRoot(match[1]),
    quality: match[2] || "",
    bass
  };
}

export function pitchClassToMidi(root: string, octave = 4): number {
  const pitchClass = PITCH_CLASS_NAMES.indexOf(normalizeRoot(root));
  return (octave + 1) * 12 + Math.max(0, pitchClass);
}

function chordQualityIntervals(quality: string): number[] {
  if (quality.includes("maj7")) return [0, 4, 7, 11];
  if (quality.includes("m7")) return [0, 3, 7, 10];
  if (quality.includes("7")) return [0, 4, 7, 10];
  if (quality.includes("dim")) return [0, 3, 6];
  if (quality.includes("aug")) return [0, 4, 8];
  if (quality.includes("sus4")) return [0, 5, 7];
  if (quality.includes("sus2")) return [0, 2, 7];
  if (quality === "m" || quality.startsWith("min")) return [0, 3, 7];
  return [0, 4, 7];
}

function containsIntervals(actual: number[], expected: number[]): boolean {
  return expected.every((interval) => actual.includes(interval));
}

function slashIfInverted(name: string, root: string, bass: string): string {
  return root === bass ? name : `${name}/${bass}`;
}

function pitchToChordFallback(midiValues: number[]): string {
  return midiValues.map((midi) => PITCH_CLASS_NAMES[((midi % 12) + 12) % 12]).join("-");
}

function normalizeRoot(root: string): string {
  const flatMap: Record<string, string> = {
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#"
  };
  return flatMap[root] ?? root;
}
