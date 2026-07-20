import { performance } from "node:perf_hooks";
import type { PlaybackNoteEvent } from "../apps/studio/src/music/playback/PlaybackEngine";
import { playbackEventsToSmf } from "../apps/studio/src/music/playback/directSf2Smf";

const ticksPerBeat = 480;
const bars = 64;
const beatsPerBar = 4;
const subdivisionsPerBeat = 4;
const chordSize = 3;
const iterations = 200;

const events = buildDenseChordGrid();
const expectedNoteOns = events
  .map((event) => ({
    tick: Math.round(event.startBeat * ticksPerBeat),
    midi: event.midi
  }))
  .sort((a, b) => a.tick - b.tick || a.midi - b.midi);

const timings: number[] = [];
let lastBuffer = new Uint8Array();

for (let index = 0; index < iterations; index += 1) {
  const started = performance.now();
  lastBuffer = playbackEventsToSmf(events, {
    bpm: 120,
    speed: 1,
    volume: 0.8,
    channel: 0,
    program: 0,
    ticksPerBeat
  });
  timings.push(performance.now() - started);
}

const parsed = parseTrackEvents(lastBuffer);
const noteOns = parsed
  .filter((event) => event.kind === "note-on")
  .map((event) => ({ tick: event.tick, midi: event.data[0] }))
  .sort((a, b) => a.tick - b.tick || a.midi - b.midi);

let maxTickError = 0;
for (let index = 0; index < expectedNoteOns.length; index += 1) {
  maxTickError = Math.max(maxTickError, Math.abs(noteOns[index].tick - expectedNoteOns[index].tick));
}

const chordGroups = new Map<number, number[]>();
for (const noteOn of noteOns) {
  const group = chordGroups.get(noteOn.tick) ?? [];
  group.push(noteOn.midi);
  chordGroups.set(noteOn.tick, group);
}
const simultaneousGroups = [...chordGroups.values()].filter((group) => group.length === chordSize).length;

timings.sort((a, b) => a - b);
const averageMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
const p95Ms = timings[Math.floor(timings.length * 0.95)];

console.log(JSON.stringify({
  events: events.length,
  bars,
  iterations,
  bufferBytes: lastBuffer.byteLength,
  averageBuildMs: round(averageMs),
  p95BuildMs: round(p95Ms),
  maxTickError,
  simultaneousGroups,
  expectedSimultaneousGroups: bars * beatsPerBar * subdivisionsPerBeat
}, null, 2));

function buildDenseChordGrid(): PlaybackNoteEvent[] {
  const nextEvents: PlaybackNoteEvent[] = [];
  const totalSteps = bars * beatsPerBar * subdivisionsPerBeat;

  for (let step = 0; step < totalSteps; step += 1) {
    const startBeat = step / subdivisionsPerBeat;
    const root = 60 + (step % 12);
    [root, root + 4, root + 7].forEach((midi, chordIndex) => {
      nextEvents.push({
        pitch: `midi-${midi}`,
        midi,
        startBeat,
        durationBeats: 1 / subdivisionsPerBeat,
        velocity: 88 - chordIndex * 4
      });
    });
  }

  return nextEvents;
}

type ParsedEvent = {
  tick: number;
  kind: string;
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
      offset = length.nextOffset + length.value;
      events.push({ tick, kind: type === 0x51 ? "tempo" : "meta", data: [] });
    } else if ((status & 0xf0) === 0xc0) {
      events.push({ tick, kind: "program", data: [bytes[offset++]] });
    } else if ((status & 0xf0) === 0x90) {
      events.push({ tick, kind: "note-on", data: [bytes[offset++], bytes[offset++]] });
    } else if ((status & 0xf0) === 0x80) {
      events.push({ tick, kind: "note-off", data: [bytes[offset++], bytes[offset++]] });
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

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
