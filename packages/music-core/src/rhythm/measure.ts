import type { Measure, MusicEvent } from "../ast/types";
import { durationToBeats } from "./duration";

export function getBeatsPerMeasure(timeSignature: { beats: number; beatType: number }): number {
  return timeSignature.beats * (4 / timeSignature.beatType);
}

export function eventDurationBeats(event: MusicEvent): number {
  if (event.type === "annotation" || event.type === "direction") {
    return 0;
  }
  return durationToBeats(event.duration);
}

export function eventsToMeasures(events: MusicEvent[], beatsPerMeasure: number): Measure[] {
  const measures: Measure[] = [];
  let measureNumber = 1;
  let current: Measure = { number: measureNumber, events: [] };
  let beatInMeasure = 0;

  for (const event of events) {
    const eventBeats = eventDurationBeats(event);
    if (current.events.length > 0 && beatInMeasure + eventBeats > beatsPerMeasure + 0.001) {
      measures.push(current);
      measureNumber += 1;
      current = { number: measureNumber, events: [] };
      beatInMeasure = 0;
    }

    current.events.push(event);
    beatInMeasure += eventBeats;

    if (Math.abs(beatInMeasure - beatsPerMeasure) < 0.001) {
      measures.push(current);
      measureNumber += 1;
      current = { number: measureNumber, events: [] };
      beatInMeasure = 0;
    }
  }

  if (current.events.length > 0 || measures.length === 0) {
    measures.push(current);
  }

  return measures;
}

export function countNotes(measures: Measure[]): number {
  return measures.reduce((count, measure) => {
    return count + measure.events.reduce((measureCount, event) => {
      if (event.type === "note") {
        return measureCount + 1;
      }
      if (event.type === "chord") {
        return measureCount + event.pitches.length;
      }
      return measureCount;
    }, 0);
  }, 0);
}
