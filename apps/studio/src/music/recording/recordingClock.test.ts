import { describe, expect, it } from "vitest";
import { SharedRecordingClock, SystemRecordingClock } from "./recordingClock";

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

describe("SharedRecordingClock", () => {
  it("uses the playback session beat when available and the same fallback clock otherwise", () => {
    let now = 0;
    let sessionBeat: number | undefined;
    const clock = new SharedRecordingClock(60, 1, () => sessionBeat, () => now);
    clock.start(-2);
    now = 1000;
    expect(clock.getCurrentBeat()).toBeCloseTo(-1);
    sessionBeat = 7.5;
    expect(clock.getCurrentBeat()).toBe(7.5);
  });
});
