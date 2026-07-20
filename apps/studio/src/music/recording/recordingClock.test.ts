import { describe, expect, it } from "vitest";
import { SystemRecordingClock } from "./recordingClock";

describe("SystemRecordingClock", () => {
  it("reports elapsed beats from bpm and speed", () => {
    let now = 1000;
    const clock = new SystemRecordingClock(120, 1, () => now);
    clock.start();
    now += 1000;
    expect(clock.getCurrentBeat()).toBeCloseTo(2);
  });

  it("supports an initial beat offset", () => {
    let now = 0;
    const clock = new SystemRecordingClock(60, 1, () => now);
    clock.start(-4);
    now = 2000;
    expect(clock.getCurrentBeat()).toBeCloseTo(-2);
  });
});
