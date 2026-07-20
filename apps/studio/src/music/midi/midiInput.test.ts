import { describe, expect, it } from "vitest";
import { midiNumberToPitchName, parseMidiMessage } from "./midiInput";

describe("midiInput", () => {
  it("converts MIDI note-on messages to pitch names", () => {
    expect(parseMidiMessage([0x90, 60, 96])).toEqual({
      type: "note-on",
      midi: 60,
      pitch: "C4",
      velocity: 96
    });
  });

  it("treats note-on velocity zero as note-off", () => {
    expect(parseMidiMessage([0x90, 64, 0])).toEqual({
      type: "note-off",
      midi: 64,
      pitch: "E4",
      velocity: 0
    });
  });

  it("ignores non-note MIDI messages", () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull();
  });

  it("maps MIDI numbers through the same pitch spelling as the score", () => {
    expect(midiNumberToPitchName(61)).toBe("C#4");
  });
});
