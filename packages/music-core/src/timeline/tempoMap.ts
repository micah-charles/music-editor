import type { FoxChildMusicScore, MusicalPosition, Rational } from "../ast/types";
import { addRational, compareRational, rationalFromNumber, subtractRational, toNumber, ZERO } from "./rational";
import type { MeasureBoundary, TempoSegment } from "./types";

export function buildTempoMap(score: FoxChildMusicScore, measureMap: MeasureBoundary[]): TempoSegment[] {
  const candidates = [
    { start: ZERO, bpm: score.global.tempo.bpm, label: score.global.tempo.label },
    ...(score.global.tempoEvents ?? []).map((event) => ({
      start: musicalPositionToScoreTime(event.position, measureMap),
      bpm: event.bpm,
      label: event.label
    }))
  ].sort((left, right) => compareRational(left.start, right.start));

  const deduplicated: Array<{ start: Rational; bpm: number; label?: string }> = [];
  for (const candidate of candidates) {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && compareRational(previous.start, candidate.start) === 0) {
      deduplicated[deduplicated.length - 1] = candidate;
    } else {
      deduplicated.push(candidate);
    }
  }

  let secondsAtStart = 0;
  return deduplicated.map((segment, index) => {
    if (index > 0) {
      const previous = deduplicated[index - 1];
      secondsAtStart += toNumber(subtractRational(segment.start, previous.start)) * 60 / previous.bpm;
    }
    return { ...segment, secondsAtStart };
  });
}

export function scoreTimeToSeconds(time: Rational, tempoMap: TempoSegment[], speed = 1): number {
  const segment = tempoSegmentAt(time, tempoMap);
  const elapsedBeats = toNumber(subtractRational(time, segment.start));
  return (segment.secondsAtStart + elapsedBeats * 60 / segment.bpm) / speed;
}

export function secondsToScoreTime(seconds: number, tempoMap: TempoSegment[], speed = 1): Rational {
  const unscaledSeconds = Math.max(0, seconds) * speed;
  let segment = tempoMap[0];
  for (const candidate of tempoMap) {
    if (candidate.secondsAtStart <= unscaledSeconds) {
      segment = candidate;
    } else {
      break;
    }
  }
  return addRational(segment.start, rationalFromNumber((unscaledSeconds - segment.secondsAtStart) * segment.bpm / 60));
}

export function musicalPositionToScoreTime(position: MusicalPosition, measureMap: MeasureBoundary[]): Rational {
  const boundary = measureMap.find((measure) => measure.measureNumber === position.measure);
  if (!boundary) {
    return addRational(ZERO, rationalFromNumber(position.beat));
  }
  return addRational(boundary.start, addRational(rationalFromNumber(position.beat), position.offset ?? ZERO));
}

function tempoSegmentAt(time: Rational, tempoMap: TempoSegment[]): TempoSegment {
  if (tempoMap.length === 0) {
    return { start: ZERO, bpm: 120, secondsAtStart: 0 };
  }
  let segment = tempoMap[0];
  for (const candidate of tempoMap) {
    if (compareRational(candidate.start, time) <= 0) {
      segment = candidate;
    } else {
      break;
    }
  }
  return segment;
}
