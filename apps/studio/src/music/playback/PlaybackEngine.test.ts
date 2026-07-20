import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleActivePitchCallbacks } from "./PlaybackEngine";
import type { PlaybackNoteEvent } from "./PlaybackEngine";

describe("scheduleActivePitchCallbacks", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("emits simultaneous active pitches and clears them on stop", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });

    const events: PlaybackNoteEvent[] = [
      { pitch: "C4", midi: 60, startBeat: 0, durationBeats: 1, velocity: 88 },
      { pitch: "E4", midi: 64, startBeat: 0, durationBeats: 1, velocity: 88 },
      { pitch: "G4", midi: 67, startBeat: 0, durationBeats: 1, velocity: 88 }
    ];
    const updates: string[][] = [];

    const stop = scheduleActivePitchCallbacks(events, {
      bpm: 120,
      speed: 1,
      volume: 0.8,
      onActivePitchesChange: (pitches) => updates.push(pitches)
    });

    expect(updates).toEqual([[]]);
    vi.advanceTimersByTime(0);
    expect(updates.at(-1)).toEqual(["C4", "E4", "G4"]);
    vi.advanceTimersByTime(500);
    expect(updates.at(-1)).toEqual([]);

    stop();
    expect(updates.at(-1)).toEqual([]);
  });

  it("emits active playback events without dropping overlapping repeated pitches", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });

    const events: PlaybackNoteEvent[] = [
      { id: "first-c4", pitch: "C4", midi: 60, startBeat: 0, durationBeats: 2, velocity: 88 },
      { id: "second-c4", pitch: "C4", midi: 60, startBeat: 1, durationBeats: 1, velocity: 88 }
    ];
    const pitchUpdates: string[][] = [];
    const eventUpdates: string[][] = [];

    scheduleActivePitchCallbacks(events, {
      bpm: 120,
      speed: 1,
      volume: 0.8,
      onActivePitchesChange: (pitches) => pitchUpdates.push(pitches),
      onActiveEventsChange: (activeEvents) => eventUpdates.push(activeEvents.map((event) => event.id ?? ""))
    });

    vi.advanceTimersByTime(0);
    expect(pitchUpdates.at(-1)).toEqual(["C4"]);
    expect(eventUpdates.at(-1)).toEqual(["first-c4"]);

    vi.advanceTimersByTime(500);
    expect(pitchUpdates.at(-1)).toEqual(["C4"]);
    expect(eventUpdates.at(-1)).toEqual(["first-c4", "second-c4"]);

    vi.advanceTimersByTime(500);
    expect(pitchUpdates.at(-1)).toEqual([]);
    expect(eventUpdates.at(-1)).toEqual([]);
  });
});
