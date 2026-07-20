import { describe, expect, it } from "vitest";
import { quantizeBeatsToDuration, quantizeStartBeat } from "./quantizeDuration";

describe("quantizeDuration", () => {
  it("quantizes held beats to supported durations", () => {
    expect(quantizeBeatsToDuration(1.1, "eighth")).toEqual({ value: "quarter", beats: 1 });
    expect(quantizeBeatsToDuration(1.45, "eighth")).toEqual({ value: "dotted-quarter", beats: 1.5 });
    expect(quantizeBeatsToDuration(0.26, "sixteenth")).toEqual({ value: "sixteenth", beats: 0.25 });
  });

  it("quantizes start beats to the selected grid", () => {
    expect(quantizeStartBeat(2.24, "quarter")).toBe(2);
    expect(quantizeStartBeat(2.26, "eighth")).toBe(2.5);
  });
});
