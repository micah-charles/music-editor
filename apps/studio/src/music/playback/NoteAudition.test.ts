import { describe, expect, it } from "vitest";
import { midiToFrequency, pitchToFrequency } from "./NoteAudition";

describe("NoteAudition pitch helpers", () => {
  it("converts MIDI note numbers to equal-tempered frequencies", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 5);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 4);
  });

  it("converts pitch names to frequencies", () => {
    expect(pitchToFrequency("A4")).toBeCloseTo(440, 5);
    expect(pitchToFrequency("C4")).toBeCloseTo(261.6256, 4);
  });
});
