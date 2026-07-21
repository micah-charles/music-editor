import { cursorSourceTimestamp, OsmdPositionIndex, type OsmdCursorLike } from "./OsmdPositionIndex";

export function buildOsmdPositionIndex(cursor: OsmdCursorLike, maximumSteps = 20_000): OsmdPositionIndex {
  const entries = [];
  cursor.reset?.();

  for (let step = 0; step < maximumSteps; step += 1) {
    const timestamp = cursorSourceTimestamp(cursor);
    if (timestamp !== null) {
      entries.push({ step, timestamp });
    }
    if (cursor.Iterator?.EndReached) {
      break;
    }
    cursor.next?.();
  }

  cursor.reset?.();
  cursor.hide?.();
  return new OsmdPositionIndex(entries);
}
