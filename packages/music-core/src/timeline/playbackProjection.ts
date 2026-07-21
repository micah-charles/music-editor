import type { Rational } from "../ast/types";
import {
  addRational,
  compareRational,
  subtractRational,
  toNumber,
  ZERO
} from "./rational";
import type {
  MeasureBoundary,
  PlaybackMeasureBoundary,
  RepeatExpansion,
  TempoSegment,
  TimelineEvent
} from "./types";

export type PlaybackProjection = {
  events: TimelineEvent[];
  measureMap: PlaybackMeasureBoundary[];
  tempoMap: TempoSegment[];
  duration: Rational;
};

export function buildPlaybackProjection(
  events: TimelineEvent[],
  measureMap: MeasureBoundary[],
  tempoMap: TempoSegment[],
  repeatExpansion?: RepeatExpansion
): PlaybackProjection {
  const passes = repeatExpansion?.passes ?? measureMap.map((measure, index) => ({
    sourceMeasure: measure.measureNumber,
    playbackMeasureIndex: index
  }));
  const sourceMeasureByNumber = new Map(measureMap.map((measure) => [measure.measureNumber, measure]));
  const projectedMeasures: PlaybackMeasureBoundary[] = [];
  const projectedEvents: TimelineEvent[] = [];
  const tempoCandidates: Array<{ start: Rational; bpm: number; label?: string }> = [];
  let playbackStart = ZERO;

  passes.forEach((pass, passIndex) => {
    const source = sourceMeasureByNumber.get(pass.sourceMeasure);
    if (!source) {
      return;
    }
    const projected: PlaybackMeasureBoundary = {
      ...source,
      start: playbackStart,
      sourceStart: source.start,
      playbackMeasureIndex: pass.playbackMeasureIndex
    };
    projectedMeasures.push(projected);

    events.filter((event) => event.measureNumber === pass.sourceMeasure).forEach((event) => {
      const offset = subtractRational(event.scoreStart, source.start);
      projectedEvents.push({
        ...event,
        id: repeatExpansion ? `${event.id}@pass-${passIndex + 1}` : event.id,
        scoreStart: addRational(playbackStart, offset)
      });
    });

    const sourceEnd = addRational(source.start, source.duration);
    const tempoAtStart = tempoSegmentAt(source.start, tempoMap);
    tempoCandidates.push({ start: playbackStart, bpm: tempoAtStart.bpm, label: tempoAtStart.label });
    tempoMap.forEach((segment) => {
      if (compareRational(segment.start, source.start) > 0 && compareRational(segment.start, sourceEnd) < 0) {
        tempoCandidates.push({
          start: addRational(playbackStart, subtractRational(segment.start, source.start)),
          bpm: segment.bpm,
          label: segment.label
        });
      }
    });
    playbackStart = addRational(playbackStart, source.duration);
  });

  return {
    events: projectedEvents.sort(compareProjectedEvents),
    measureMap: projectedMeasures,
    tempoMap: finalizeTempoMap(tempoCandidates),
    duration: playbackStart
  };
}

export function playbackTimeToSourceTime(time: Rational, measureMap: PlaybackMeasureBoundary[]): Rational {
  if (measureMap.length === 0) {
    return time;
  }
  let current = measureMap[0];
  for (const measure of measureMap) {
    if (compareRational(measure.start, time) <= 0) {
      current = measure;
    } else {
      break;
    }
  }
  const offset = subtractRational(time, current.start);
  const boundedOffset = compareRational(offset, current.duration) > 0 ? current.duration : offset;
  return addRational(current.sourceStart, boundedOffset);
}

function tempoSegmentAt(time: Rational, tempoMap: TempoSegment[]): TempoSegment {
  let current = tempoMap[0] ?? { start: ZERO, bpm: 120, secondsAtStart: 0 };
  for (const segment of tempoMap) {
    if (compareRational(segment.start, time) <= 0) {
      current = segment;
    } else {
      break;
    }
  }
  return current;
}

function finalizeTempoMap(candidates: Array<{ start: Rational; bpm: number; label?: string }>): TempoSegment[] {
  const ordered = candidates.sort((left, right) => compareRational(left.start, right.start));
  const deduplicated: typeof ordered = [];
  ordered.forEach((candidate) => {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && compareRational(previous.start, candidate.start) === 0) {
      deduplicated[deduplicated.length - 1] = candidate;
    } else if (!previous || previous.bpm !== candidate.bpm) {
      deduplicated.push(candidate);
    }
  });
  let secondsAtStart = 0;
  return deduplicated.map((segment, index) => {
    if (index > 0) {
      const previous = deduplicated[index - 1];
      secondsAtStart += toNumber(subtractRational(segment.start, previous.start)) * 60 / previous.bpm;
    }
    return { ...segment, secondsAtStart };
  });
}

function compareProjectedEvents(left: TimelineEvent, right: TimelineEvent): number {
  return compareRational(left.scoreStart, right.scoreStart)
    || left.partId.localeCompare(right.partId)
    || left.staff - right.staff
    || left.voice - right.voice
    || (left.midi ?? -1) - (right.midi ?? -1)
    || left.id.localeCompare(right.id);
}
