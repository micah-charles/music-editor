import { rational } from "@foxchild/music-core";
import { describe, expect, it, vi } from "vitest";
import { buildOsmdPositionIndex } from "./buildOsmdPositionIndex";
import { ScoreCursorController } from "./ScoreCursorController";
import { cursorSourceTimestamp, type OsmdCursorLike } from "./OsmdPositionIndex";

describe("OSMD position indexing", () => {
  it("walks the notation once to build a timestamp index", () => {
    const fake = fakeCursor([0, 0.25, 0.5, 0.75]);
    const index = buildOsmdPositionIndex(fake.cursor);

    expect(index.entries).toEqual([
      { step: 0, timestamp: 0 },
      { step: 1, timestamp: 0.25 },
      { step: 2, timestamp: 0.5 },
      { step: 3, timestamp: 0.75 }
    ]);
    expect(fake.reset).toHaveBeenCalledTimes(2);
  });

  it("moves forward by delta and resets only for a backward seek", () => {
    const fake = fakeCursor([0, 0.25, 0.5, 0.75]);
    const index = buildOsmdPositionIndex(fake.cursor);
    fake.reset.mockClear();
    fake.next.mockClear();
    const controller = new ScoreCursorController(fake.cursor, index);

    controller.moveTo(rational(2), true);
    expect(fake.next).toHaveBeenCalledTimes(2);
    expect(fake.reset).not.toHaveBeenCalled();

    controller.moveTo(rational(3), true);
    expect(fake.next).toHaveBeenCalledTimes(3);

    controller.moveTo(rational(1), true);
    expect(fake.reset).toHaveBeenCalledTimes(1);
    expect(fake.next).toHaveBeenCalledTimes(4);
  });

  it("keeps seeking at the final notation position after playback passes the last entry", () => {
    const fake = fakeCursor([0, 0.25, 0.5]);
    const index = buildOsmdPositionIndex(fake.cursor);

    expect(index.stepAtScoreTime(rational(20))).toBe(2);
  });

  it("prefers OSMD's absolute score timestamp over its measure-relative source timestamp", () => {
    const cursor: OsmdCursorLike = {
      Iterator: {
        currentTimeStamp: { RealValue: 12.5 },
        CurrentSourceTimestamp: { RealValue: 0.5 }
      }
    };

    expect(cursorSourceTimestamp(cursor)).toBe(12.5);
  });

  it("returns and marks the synchronized playback highlight", () => {
    const classList = { add: vi.fn() };
    const highlight = {
      classList,
      dataset: {}
    } as unknown as HTMLElement;
    const fake = fakeCursor([0, 0.25]);
    fake.cursor.cursorElement = highlight;
    const controller = new ScoreCursorController(fake.cursor, buildOsmdPositionIndex(fake.cursor));

    expect(controller.moveTo(rational(0), true)).toBe(highlight);
    expect(classList.add).toHaveBeenCalledWith("score-playback-highlight");
  });
});

function fakeCursor(timestamps: number[]) {
  let index = 0;
  const reset = vi.fn(() => {
    index = 0;
  });
  const next = vi.fn(() => {
    index = Math.min(timestamps.length, index + 1);
  });
  const iterator = {
    get CurrentSourceTimestamp() {
      return { RealValue: timestamps[Math.min(index, timestamps.length - 1)] };
    },
    get EndReached() {
      return index >= timestamps.length - 1;
    }
  };
  const cursor: OsmdCursorLike = {
    reset,
    next,
    show: vi.fn(),
    hide: vi.fn(),
    update: vi.fn(),
    Iterator: iterator
  };
  return { cursor, reset, next };
}
