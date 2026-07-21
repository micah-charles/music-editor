import type { Mode, Step } from "../ast/types";

const MAJOR_FIFTHS: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  F: -1
};

const MINOR_FIFTHS: Record<string, number> = {
  A: 0,
  E: 1,
  B: 2,
  "F#": 3,
  "C#": 4,
  D: -1,
  G: -2,
  C: -3,
  F: -4
};

const FIFTHS_TO_MAJOR: Record<number, Step> = {
  [-1]: "F",
  0: "C",
  1: "G",
  2: "D",
  3: "A",
  4: "E",
  5: "B"
};

const FIFTHS_TO_MINOR: Record<number, Step> = {
  [-4]: "F",
  [-3]: "C",
  [-2]: "G",
  [-1]: "D",
  0: "A",
  1: "E",
  2: "B",
  3: "F",
  4: "C"
};

export function keyToFifths(tonic: Step, mode: Mode): number {
  if (mode === "minor") {
    return MINOR_FIFTHS[tonic] ?? 0;
  }
  return MAJOR_FIFTHS[tonic] ?? 0;
}

export function fifthsToKey(fifths: number, mode: Mode = "major"): { tonic: Step; mode: Mode } {
  return {
    tonic: (mode === "minor" ? FIFTHS_TO_MINOR[fifths] : FIFTHS_TO_MAJOR[fifths]) ?? "C",
    mode
  };
}

export function parseKeyName(key: string): { tonic: Step; mode: Mode } {
  const normalized = key.trim().replace(/\s+/g, " ");
  const [rawTonic, rawMode] = normalized.split(" ");
  const tonic = rawTonic?.charAt(0).toUpperCase() as Step;

  if (!["A", "B", "C", "D", "E", "F", "G"].includes(tonic)) {
    return { tonic: "C", mode: "major" };
  }

  return {
    tonic,
    mode: rawMode?.toLowerCase() === "minor" ? "minor" : "major"
  };
}
