import type { PlaybackNoteEvent, PlaybackOptions } from "./PlaybackEngine";

const defaultTicksPerBeat = 480;

export type SmfPlaybackOptions = PlaybackOptions & {
  channel?: number;
  program?: number;
  bank?: number;
  ticksPerBeat?: number;
};

type MidiEvent = {
  tick: number;
  order: number;
  data: number[];
};

export function playbackEventsToSmf(events: PlaybackNoteEvent[], options: SmfPlaybackOptions): Uint8Array {
  const ticksPerBeat = options.ticksPerBeat ?? defaultTicksPerBeat;
  const channel = clampInt(options.channel ?? 0, 0, 15);
  const program = clampInt(options.program ?? 0, 0, 127);
  const bank = clampInt(options.bank ?? 0, 0, 16383);
  const effectiveBpm = Math.max(1, options.bpm * options.speed);
  const microsecondsPerBeat = Math.round(60_000_000 / effectiveBpm);
  const trackEvents: MidiEvent[] = [
    {
      tick: 0,
      order: -4,
      data: [0xff, 0x51, 0x03, (microsecondsPerBeat >> 16) & 0xff, (microsecondsPerBeat >> 8) & 0xff, microsecondsPerBeat & 0xff]
    }
  ];

  const programByChannel = new Map<number, { program: number; bank: number; volume: number; pan: number }>();
  if (events.length === 0) {
    programByChannel.set(channel, { program, bank, volume: 127, pan: 64 });
  }
  for (const event of events) {
    const eventChannel = clampInt(event.channel ?? channel, 0, 15);
    const eventProgram = clampInt(event.midiProgram ?? program, 0, 127);
    const eventBank = clampInt(event.midiBank ?? bank, 0, 16383);
    programByChannel.set(eventChannel, {
      program: eventProgram,
      bank: eventBank,
      volume: clampInt((event.trackVolume ?? 1) * 127, 0, 127),
      pan: clampInt(((event.pan ?? 0) + 1) * 63.5, 0, 127)
    });
  }
  [...programByChannel.entries()]
    .sort(([channelA], [channelB]) => channelA - channelB)
    .forEach(([eventChannel, preset], index) => {
      const bankMsb = (preset.bank >> 7) & 0x7f;
      const bankLsb = preset.bank & 0x7f;
      trackEvents.push(
        { tick: 0, order: -3, data: [0xb0 | eventChannel, 0x00, bankMsb] },
        { tick: 0, order: -2, data: [0xb0 | eventChannel, 0x20, bankLsb] },
        { tick: 0, order: -1.8, data: [0xb0 | eventChannel, 0x07, preset.volume] },
        { tick: 0, order: -1.6, data: [0xb0 | eventChannel, 0x0a, preset.pan] },
        { tick: 0, order: -1 + index / 100, data: [0xc0 | eventChannel, preset.program] }
      );
    });

  for (const event of events) {
    const startTick = Math.max(0, Math.round(event.startBeat * ticksPerBeat));
    const durationTicks = Math.max(1, Math.round(event.durationBeats * ticksPerBeat));
    const midi = clampInt(event.midi, 0, 127);
    const velocity = clampInt(event.velocity ?? 88, 1, 127);
    const eventChannel = clampInt(event.channel ?? channel, 0, 15);

    trackEvents.push(
      { tick: startTick, order: 1, data: [0x90 | eventChannel, midi, velocity] },
      { tick: startTick + durationTicks, order: 0, data: [0x80 | eventChannel, midi, 0] }
    );
  }

  trackEvents.sort((a, b) => a.tick - b.tick || a.order - b.order || a.data[1] - b.data[1]);

  const trackData: number[] = [];
  let previousTick = 0;
  for (const event of trackEvents) {
    trackData.push(...writeVariableLength(event.tick - previousTick), ...event.data);
    previousTick = event.tick;
  }
  trackData.push(0x00, 0xff, 0x2f, 0x00);

  return bytes([
    ...asciiBytes("MThd"),
    ...u32(6),
    ...u16(0),
    ...u16(1),
    ...u16(ticksPerBeat),
    ...asciiBytes("MTrk"),
    ...u32(trackData.length),
    ...trackData
  ]);
}

export function exactArrayBuffer(bytesValue: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytesValue.byteLength);
  new Uint8Array(buffer).set(bytesValue);
  return buffer;
}

function writeVariableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytesValue: number[] = [];

  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }

  while (true) {
    bytesValue.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }

  return bytesValue;
}

function asciiBytes(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function bytes(value: number[]): Uint8Array {
  return new Uint8Array(value.map((byte) => byte & 0xff));
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
