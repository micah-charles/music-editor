import { astToPlaybackEvents, compileScoreTimeline, rational, toNumber, type FoxChildMusicScore } from "@foxchild/music-core";
import { describe, expect, it, vi } from "vitest";
import type { PlaybackEngine, PlaybackNoteEvent, PlaybackOptions } from "../PlaybackEngine";
import { PlaybackSessionController } from "./PlaybackSessionController";

class FakeEngine implements PlaybackEngine {
  name = "Fake";
  plays: Array<{ events: PlaybackNoteEvent[]; options: PlaybackOptions }> = [];
  stop = vi.fn();
  dispose = vi.fn();

  async play(events: PlaybackNoteEvent[], options: PlaybackOptions): Promise<void> {
    this.plays.push({ events, options });
  }
}

describe("PlaybackSessionController", () => {
  it("owns play, pause, resume, stop, and authoritative progress", async () => {
    let now = 0;
    const engine = new FakeEngine();
    const { controller } = configuredController(engine, () => now);

    await controller.play();
    expect(controller.getSnapshot().status).toBe("playing");
    expect(engine.plays).toHaveLength(1);

    now = 500;
    controller.tick();
    expect(controller.getSnapshot().currentSeconds).toBeCloseTo(0.5, 3);
    expect(controller.getSnapshot().activeEvents.map((event) => event.id)).toEqual(["d4"]);

    controller.pause();
    expect(controller.getSnapshot().status).toBe("paused");
    now = 1500;
    controller.tick();
    expect(controller.getSnapshot().currentSeconds).toBeCloseTo(0.5, 3);

    await controller.resume();
    expect(engine.plays).toHaveLength(2);
    expect(engine.plays[1].events[0].startBeat).toBe(0);

    controller.stop();
    expect(controller.getSnapshot()).toMatchObject({ status: "stopped", currentSeconds: 0, activeEvents: [] });
  });

  it("seeks while playing and restarts audio from the selected position", async () => {
    const engine = new FakeEngine();
    const { controller } = configuredController(engine, () => 0);
    await controller.play();
    await controller.seekToSeconds(0.75);

    expect(controller.getSnapshot()).toMatchObject({ status: "playing", currentSeconds: 0.75 });
    expect(engine.plays).toHaveLength(2);
    expect(engine.plays[1].events[0]).toMatchObject({ id: "d4", startBeat: 0, durationBeats: 0.5 });
  });

  it("applies speed changes to the same score clock", async () => {
    let now = 0;
    const engine = new FakeEngine();
    const { controller } = configuredController(engine, () => now);
    await controller.play();
    controller.setSpeed(2);
    await settlePlaybackRestart();
    now = 250;
    controller.tick();

    expect(controller.getSnapshot().speed).toBe(2);
    expect(controller.getSnapshot().currentSeconds).toBeCloseTo(0.5, 3);
  });

  it("loops at a rational score boundary", async () => {
    let now = 0;
    const engine = new FakeEngine();
    const { controller } = configuredController(engine, () => now);
    controller.setLoop({ start: rational(0), end: rational(1) });
    await controller.play();
    now = 600;
    controller.tick();
    await settlePlaybackRestart();

    expect(controller.getSnapshot().currentSeconds).toBe(0);
    expect(controller.getSnapshot().status).toBe("playing");
    expect(engine.plays.length).toBeGreaterThan(1);
  });

  it("schedules repeat passes and maps the second pass back to source notation time", async () => {
    let now = 0;
    const engine = new FakeEngine();
    const { controller } = configuredController(engine, () => now, repeatScore());

    expect(controller.getSnapshot().durationSeconds).toBe(8);
    await controller.play();
    expect(engine.plays[0].events.map((event) => [event.id, event.startBeat])).toEqual([
      ["repeat-c4@pass-1", 0],
      ["repeat-d4@pass-2", 4],
      ["repeat-c4@pass-3", 8],
      ["repeat-d4@pass-4", 12]
    ]);

    now = 4250;
    controller.tick();
    expect(toNumber(controller.getSnapshot().currentScoreTime)).toBeCloseTo(8.5, 5);
    expect(toNumber(controller.getSnapshot().currentSourceTime)).toBeCloseTo(0.5, 5);
    expect(controller.getSnapshot().activeEvents.map((event) => event.id)).toEqual(["repeat-c4@pass-3"]);
  });
});

function configuredController(engine: FakeEngine, now: () => number, score = demoScore()) {
  const controller = new PlaybackSessionController(now, () => 1, () => undefined);
  controller.configure({
    timeline: compileScoreTimeline(score),
    events: astToPlaybackEvents(score)
      .filter((event) => Boolean(event.pitch) && typeof event.midi === "number")
      .map((event) => ({
        ...event,
        pitch: event.pitch ?? "C4",
        midi: event.midi ?? 60
      })),
    bpm: 120,
    createEngine: () => engine
  });
  return { controller, score };
}

function repeatScore(): FoxChildMusicScore {
  const score = demoScore();
  score.parts[0].measures = [{
    number: 1,
    repeat: { start: true },
    events: [{ id: "repeat-c4", type: "note", pitch: { step: "C", octave: 4 }, duration: { value: "whole" } }]
  }, {
    number: 2,
    repeat: { end: true },
    events: [{ id: "repeat-d4", type: "note", pitch: { step: "D", octave: 4 }, duration: { value: "whole" } }]
  }];
  return score;
}

async function settlePlaybackRestart(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

function demoScore(): FoxChildMusicScore {
  return {
    schemaVersion: "2.0",
    type: "FoxChildMusicScore",
    id: "session-test",
    metadata: { title: "Session Test" },
    global: {
      key: { tonic: "C", mode: "major" },
      timeSignature: { beats: 4, beatType: 4 },
      tempo: { bpm: 120 }
    },
    parts: [{
      id: "piano",
      name: "Piano",
      instrument: { name: "Piano" },
      clef: "treble",
      measures: [{
        number: 1,
        events: [
          { id: "c4", type: "note", pitch: { step: "C", octave: 4 }, duration: { value: "quarter" } },
          { id: "d4", type: "note", pitch: { step: "D", octave: 4 }, duration: { value: "quarter" } }
        ]
      }]
    }]
  };
}
