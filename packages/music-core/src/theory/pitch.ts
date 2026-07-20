import type { Pitch, Step } from "../ast/types";

const STEP_TO_SEMITONE: Record<Step, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

const SHARP_NAMES: Array<{ step: Step; alter?: number }> = [
  { step: "C" },
  { step: "C", alter: 1 },
  { step: "D" },
  { step: "D", alter: 1 },
  { step: "E" },
  { step: "F" },
  { step: "F", alter: 1 },
  { step: "G" },
  { step: "G", alter: 1 },
  { step: "A" },
  { step: "A", alter: 1 },
  { step: "B" }
];

export function parsePitchName(name: string): Pitch {
  const match = /^([A-Ga-g])([#b♯♭]?)(-?\d+)$/.exec(name.trim());
  if (!match) {
    throw new Error(`Invalid pitch name "${name}". Expected examples like C4, F#4, Bb3.`);
  }

  const step = match[1].toUpperCase() as Step;
  const accidental = match[2];
  const alter = accidental === "#" || accidental === "♯" ? 1 : accidental === "b" || accidental === "♭" ? -1 : 0;

  return {
    step,
    alter,
    octave: Number(match[3])
  };
}

export function pitchToMidi(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + STEP_TO_SEMITONE[pitch.step] + (pitch.alter ?? 0);
}

export function midiToPitch(midi: number): Pitch {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const pitchClass = ((rounded % 12) + 12) % 12;
  return {
    ...SHARP_NAMES[pitchClass],
    octave
  };
}

export function pitchToName(pitch: Pitch): string {
  const alter = pitch.alter ?? 0;
  const accidental = alter > 0 ? "#".repeat(alter) : alter < 0 ? "b".repeat(Math.abs(alter)) : "";
  return `${pitch.step}${accidental}${pitch.octave}`;
}

export function transposePitch(pitch: Pitch, semitones: number): Pitch {
  return midiToPitch(pitchToMidi(pitch) + semitones);
}
