import type { Duration, NoteDurationValue } from "@foxchild/music-core";

export type QuantizeGrid = "quarter" | "eighth" | "sixteenth";

const durationBeats: Record<NoteDurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  "dotted-half": 3,
  "dotted-quarter": 1.5,
  "dotted-eighth": 0.75
};

const gridBeats: Record<QuantizeGrid, number> = {
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25
};

export function quantizeBeatsToDuration(beats: number, grid: QuantizeGrid): Duration {
  const minimum = gridBeats[grid];
  const quantizedBeats = Math.max(minimum, quantizeBeatValue(beats, grid));
  const candidates = Object.entries(durationBeats)
    .filter(([, value]) => value >= minimum && isGridAligned(value, minimum));
  const [value, duration] = candidates.reduce((nearest, candidate) => {
    return Math.abs(candidate[1] - quantizedBeats) < Math.abs(nearest[1] - quantizedBeats)
      ? candidate
      : nearest;
  });
  return {
    value: value as NoteDurationValue,
    beats: duration
  };
}

export function quantizeStartBeat(beat: number, grid: QuantizeGrid): number {
  return quantizeBeatValue(Math.max(0, beat), grid);
}

export function quantizeBeatValue(beat: number, grid: QuantizeGrid): number {
  const step = gridBeats[grid];
  return Math.round(beat / step) * step;
}

export function durationValueToBeats(value: NoteDurationValue): number {
  return durationBeats[value];
}

function isGridAligned(value: number, grid: number): boolean {
  return Math.abs(value / grid - Math.round(value / grid)) < 0.0001;
}
