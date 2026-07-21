import { addRational, compareRational, ZERO } from "./rational";
import type { TimelineEvent } from "./types";

export function resolveTimelineTies(events: TimelineEvent[]): TimelineEvent[] {
  const resolved = events.map((event) => ({ ...event }));
  const openTies = new Map<string, TimelineEvent>();

  for (const event of resolved) {
    if (!event.tieGroupId || event.kind !== "note") {
      continue;
    }
    const open = openTies.get(event.tieGroupId);
    if (!open) {
      openTies.set(event.tieGroupId, event);
      continue;
    }
    if (compareRational(event.scoreStart, addRational(open.scoreStart, open.soundingDuration)) >= 0) {
      open.soundingDuration = addRational(open.soundingDuration, event.scoreDuration);
      event.soundingDuration = ZERO;
      event.attack = false;
    }
  }

  return resolved;
}
