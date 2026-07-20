import { describe, expect, it } from "vitest";
import { playbackEventsToSmf } from "./directSf2Smf";
import type { PlaybackNoteEvent } from "./PlaybackEngine";

describe("playbackEventsToSmf", () => {
  it("encodes tempo with speed and keeps note ticks aligned to beats", () => {
    const events: PlaybackNoteEvent[] = [
      { pitch: "C4", midi: 60, startBeat: 0, durationBeats: 1, velocity: 88 },
      { pitch: "D4", midi: 62, startBeat: 1, durationBeats: 0.5, velocity: 88 }
    ];

    const bytes = playbackEventsToSmf(events, {
      bpm: 90,
      speed: 2,
      volume: 0.8,
      channel: 0,
      program: 56,
      ticksPerBeat: 480
    });
    const parsedEvents = parseTrackEvents(bytes);

    expect(ascii(bytes, 0, 4)).toBe("MThd");
    expect(ascii(bytes, 14, 18)).toBe("MTrk");
    expect(parsedEvents.find((event) => event.kind === "tempo")?.data).toEqual([0x05, 0x16, 0x15]);
    expect(parsedEvents.filter((event) => event.kind === "program")).toEqual([
      { tick: 0, kind: "program", channel: 0, data: [56] }
    ]);
    expect(parsedEvents.filter((event) => event.kind === "note-on").map((event) => [event.tick, event.data[0]])).toEqual([
      [0, 60],
      [480, 62]
    ]);
    expect(parsedEvents.filter((event) => event.kind === "note-off").map((event) => [event.tick, event.data[0]])).toEqual([
      [480, 60],
      [720, 62]
    ]);
  });

  it("keeps chord tones on the same start and end ticks", () => {
    const events: PlaybackNoteEvent[] = [
      { pitch: "C4", midi: 60, startBeat: 0, durationBeats: 1, velocity: 88 },
      { pitch: "E4", midi: 64, startBeat: 0, durationBeats: 1, velocity: 88 },
      { pitch: "G4", midi: 67, startBeat: 0, durationBeats: 1, velocity: 88 }
    ];

    const bytes = playbackEventsToSmf(events, {
      bpm: 90,
      speed: 1,
      volume: 0.8,
      channel: 0,
      program: 0,
      ticksPerBeat: 480
    });
    const parsedEvents = parseTrackEvents(bytes);

    expect(parsedEvents.filter((event) => event.kind === "note-on").map((event) => [event.tick, event.data[0]])).toEqual([
      [0, 60],
      [0, 64],
      [0, 67]
    ]);
    expect(parsedEvents.filter((event) => event.kind === "note-off").map((event) => [event.tick, event.data[0]])).toEqual([
      [480, 60],
      [480, 64],
      [480, 67]
    ]);
  });

  it("uses per-event channels, banks, and programs for multi-track SF2 playback", () => {
    const events: PlaybackNoteEvent[] = [
      { pitch: "C4", midi: 60, startBeat: 0, durationBeats: 1, velocity: 88, channel: 0, midiProgram: 0, midiBank: 0 },
      { pitch: "E2", midi: 40, startBeat: 0, durationBeats: 1, velocity: 88, channel: 2, midiProgram: 33, midiBank: 128 }
    ];

    const bytes = playbackEventsToSmf(events, {
      bpm: 100,
      speed: 1,
      volume: 0.8,
      channel: 0,
      program: 0,
      ticksPerBeat: 480
    });
    const parsedEvents = parseTrackEvents(bytes);

    expect(parsedEvents.filter((event) => event.kind === "program").map((event) => [event.channel, event.data[0]])).toEqual([
      [0, 0],
      [2, 33]
    ]);
    expect(parsedEvents.filter((event) => event.kind === "bank").map((event) => [event.channel, event.data[0], event.data[1]])).toEqual([
      [0, 0, 0],
      [2, 0, 1],
      [0, 32, 0],
      [2, 32, 0]
    ]);
    expect(parsedEvents
      .filter((event) => event.kind === "note-on")
      .map((event) => [event.channel, event.tick, event.data[0]])
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))).toEqual([
      [0, 0, 60],
      [2, 0, 40]
    ]);
  });

  it("quantizes dense beat grids without cumulative drift", () => {
    const events: PlaybackNoteEvent[] = Array.from({ length: 12 }, (_, index) => ({
      pitch: "C4",
      midi: 60 + (index % 3),
      startBeat: index / 3,
      durationBeats: 1 / 3,
      velocity: 88
    }));

    const bytes = playbackEventsToSmf(events, {
      bpm: 120,
      speed: 1,
      volume: 0.8,
      channel: 0,
      program: 0,
      ticksPerBeat: 480
    });
    const parsedEvents = parseTrackEvents(bytes);

    expect(parsedEvents.filter((event) => event.kind === "note-on").map((event) => event.tick)).toEqual([
      0,
      160,
      320,
      480,
      640,
      800,
      960,
      1120,
      1280,
      1440,
      1600,
      1760
    ]);
    expect(parsedEvents.filter((event) => event.kind === "note-off").at(-1)?.tick).toBe(1920);
  });
});

type ParsedEvent = {
  tick: number;
  kind: string;
  channel?: number;
  data: number[];
};

function parseTrackEvents(bytes: Uint8Array): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  let offset = 22;
  const end = offset + readU32(bytes, 18);
  let tick = 0;

  while (offset < end) {
    const delta = readVariableLength(bytes, offset);
    offset = delta.nextOffset;
    tick += delta.value;

    const status = bytes[offset++];
    if (status === 0xff) {
      const type = bytes[offset++];
      const length = readVariableLength(bytes, offset);
      offset = length.nextOffset;
      const data = [...bytes.slice(offset, offset + length.value)];
      offset += length.value;
      events.push({ tick, kind: type === 0x51 ? "tempo" : "meta", data });
    } else if ((status & 0xf0) === 0xc0) {
      events.push({ tick, kind: "program", channel: status & 0x0f, data: [bytes[offset++]] });
    } else if ((status & 0xf0) === 0xb0) {
      const controller = bytes[offset++];
      const value = bytes[offset++];
      events.push({ tick, kind: controller === 0 || controller === 32 ? "bank" : "control", channel: status & 0x0f, data: [controller, value] });
    } else if ((status & 0xf0) === 0x90) {
      events.push({ tick, kind: "note-on", channel: status & 0x0f, data: [bytes[offset++], bytes[offset++]] });
    } else if ((status & 0xf0) === 0x80) {
      events.push({ tick, kind: "note-off", channel: status & 0x0f, data: [bytes[offset++], bytes[offset++]] });
    } else {
      offset += 2;
    }
  }

  return events;
}

function readVariableLength(bytes: Uint8Array, start: number): { value: number; nextOffset: number } {
  let offset = start;
  let value = 0;
  let byte = 0;
  do {
    byte = bytes[offset++];
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return { value, nextOffset: offset };
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
