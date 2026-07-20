import type { Mode, Step } from "../ast/types";
import { parseChordName } from "./chordDetection";

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STEP_MAJOR: Record<Step, string[]> = {
  C: ["C", "D", "E", "F", "G", "A", "B"],
  D: ["D", "E", "F#", "G", "A", "B", "C#"],
  E: ["E", "F#", "G#", "A", "B", "C#", "D#"],
  F: ["F", "G", "A", "A#", "C", "D", "E"],
  G: ["G", "A", "B", "C", "D", "E", "F#"],
  A: ["A", "B", "C#", "D", "E", "F#", "G#"],
  B: ["B", "C#", "D#", "E", "F#", "G#", "A#"]
};
const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export function detectRomanNumeral(chordName: string, key: string): string {
  const { tonic, mode } = parseKey(key);
  const parsed = parseChordName(chordName);
  const scale = mode === "minor" ? naturalMinorScale(tonic) : STEP_MAJOR[tonic];
  const numerals = mode === "minor" ? MINOR_NUMERALS : MAJOR_NUMERALS;
  const degreeIndex = scale.indexOf(parsed.root);

  if (degreeIndex === -1) {
    return "?";
  }

  let numeral = numerals[degreeIndex];
  if (parsed.quality.includes("7") && !numeral.includes("7")) {
    numeral = numeral.replace("°", "") + "7" + (numeral.includes("°") ? "°" : "");
  }
  return numeral;
}

export function chordFunctionFromRoman(roman: string): "tonic" | "dominant" | "subdominant" | "predominant" | "other" {
  const normalized = roman.replace(/[°0-9]/g, "");
  if (["I", "i", "III", "vi"].includes(normalized)) return "tonic";
  if (["V", "v", "VII", "vii"].includes(normalized)) return "dominant";
  if (["IV", "iv"].includes(normalized)) return "subdominant";
  if (["ii", "ii"].includes(normalized)) return "predominant";
  return "other";
}

export function romanToChordName(roman: string, key: string): string {
  const { tonic, mode } = parseKey(key);
  const scale = mode === "minor" ? naturalMinorScale(tonic) : STEP_MAJOR[tonic];
  const cleaned = roman.trim();
  const accidentalOffset = cleaned.startsWith("b") ? -1 : cleaned.startsWith("#") ? 1 : 0;
  const bare = cleaned.replace(/^[b#]/, "").replace(/(?:sus[24]|add9|maj7|m7|7|6|9|dom7|dim|°).*$/i, "");
  const degree = romanDegree(bare);
  const root = transposePitchClass(scale[Math.max(0, degree - 1)] ?? scale[0], accidentalOffset);
  const quality = qualityFromRoman(cleaned);
  return `${root}${quality}`;
}

export function transposeChordName(chordName: string, semitones: number): string {
  const parsed = parseChordName(chordName);
  const nextRoot = transposePitchClass(parsed.root, semitones);
  const nextBass = parsed.bass ? `/${transposePitchClass(parsed.bass, semitones)}` : "";
  return `${nextRoot}${parsed.quality}${nextBass}`;
}

export function transposeProgressionChordNames(chordNames: string[], semitones: number): string[] {
  return chordNames.map((chordName) => transposeChordName(chordName, semitones));
}

export function parseKey(key: string): { tonic: Step; mode: Mode } {
  const [rawTonic, rawMode] = key.trim().split(/\s+/);
  const tonic = (rawTonic?.charAt(0).toUpperCase() || "C") as Step;
  return {
    tonic: ["A", "B", "C", "D", "E", "F", "G"].includes(tonic) ? tonic : "C",
    mode: rawMode?.toLowerCase().startsWith("min") ? "minor" : "major"
  };
}

function naturalMinorScale(tonic: Step): string[] {
  const major = STEP_MAJOR[tonic];
  const offsets = [0, 2, 3, 5, 7, 8, 10];
  return offsets.map((offset) => transposePitchClass(major[0], offset));
}

function romanDegree(roman: string): number {
  const lowered = roman.toLowerCase();
  if (lowered.startsWith("vii")) return 7;
  if (lowered.startsWith("vi")) return 6;
  if (lowered.startsWith("iv")) return 4;
  if (lowered.startsWith("v")) return 5;
  if (lowered.startsWith("iii")) return 3;
  if (lowered.startsWith("ii")) return 2;
  return 1;
}

function qualityFromRoman(roman: string): string {
  const hasSeven = /(?:7|dom7)/i.test(roman);
  const hasDim = /(?:dim|°)/i.test(roman);
  const hasSus2 = /sus2/i.test(roman);
  const hasSus4 = /sus4/i.test(roman);
  const bare = roman.replace(/^[b#]/, "");
  const minor = /^[iv]+/.test(bare) && bare === bare.toLowerCase();

  if (hasSus2) return "sus2";
  if (hasSus4) return "sus4";
  if (hasDim) return "dim";
  if (/maj7/i.test(roman)) return "maj7";
  if (hasSeven && minor) return "m7";
  if (hasSeven) return "7";
  return minor ? "m" : "";
}

function transposePitchClass(root: string, semitones: number): string {
  const index = CHROMATIC.indexOf(root);
  const next = (index + semitones + 120) % 12;
  return CHROMATIC[next];
}
