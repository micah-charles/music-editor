import type { Rational } from "@foxchild/music-core";
import { toNumber } from "@foxchild/music-core";

export type OsmdCursorLike = {
  hide?: () => void;
  next?: () => void;
  reset?: () => void;
  show?: () => void;
  update?: () => void;
  Iterator?: {
    CurrentSourceTimestamp?: { RealValue?: number };
    currentTimeStamp?: { RealValue?: number };
    EndReached?: boolean;
  };
};

export type OsmdPositionEntry = {
  step: number;
  timestamp: number;
};

export class OsmdPositionIndex {
  constructor(readonly entries: OsmdPositionEntry[]) {}

  stepAtScoreTime(scoreTime: Rational): number {
    const target = quarterBeatsToOsmdTimestamp(scoreTime);
    let low = 0;
    let high = this.entries.length - 1;
    let result = 0;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (this.entries[middle].timestamp + 0.000001 < target) {
        low = middle + 1;
      } else {
        result = this.entries[middle].step;
        high = middle - 1;
      }
    }
    return result;
  }
}

export function cursorSourceTimestamp(cursor: OsmdCursorLike): number | null {
  const source = cursor.Iterator?.CurrentSourceTimestamp?.RealValue;
  if (typeof source === "number") {
    return source;
  }
  const current = cursor.Iterator?.currentTimeStamp?.RealValue;
  return typeof current === "number" ? current : null;
}

export function quarterBeatsToOsmdTimestamp(scoreTime: Rational): number {
  // OSMD timestamps are measured in whole notes; the FoxChild timeline uses quarter-note beats.
  return toNumber(scoreTime) / 4;
}
