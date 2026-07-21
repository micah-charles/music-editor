import type { FoxChildMusicScore, MusicEvent } from "../ast/types";
import { durationToBeats } from "../rhythm/duration";
import { addRational, compareRational, maxRational, rationalFromNumber, ZERO } from "./rational";
import type { MeasureBoundary } from "./types";

export function buildMeasureMap(score: FoxChildMusicScore): MeasureBoundary[] {
  const measureNumbers = [...new Set(score.parts.flatMap((part) => part.measures.map((measure) => measure.number)))].sort((a, b) => a - b);
  const boundaries: MeasureBoundary[] = [];
  let start = ZERO;

  for (const measureNumber of measureNumbers) {
    const meter = meterAtMeasure(score, measureNumber);
    const nominalDuration = rationalFromNumber(meter.beats * (4 / meter.beatType));
    const measures = score.parts.flatMap((part) => part.measures.filter((measure) => measure.number === measureNumber));
    const explicitPickup = measureNumber === measureNumbers[0] && measures.some((measure) => measure.implicit);
    const contentDuration = maxRational(...measures.map((measure) => measureContentDuration(measure.events)));
    const isPickup = explicitPickup && compareRational(contentDuration, ZERO) > 0 && compareRational(contentDuration, nominalDuration) < 0;
    const duration = isPickup ? contentDuration : nominalDuration;

    boundaries.push({
      measureNumber,
      start,
      duration,
      nominalDuration,
      beats: meter.beats,
      beatType: meter.beatType,
      isPickup
    });
    start = addRational(start, duration);
  }

  return boundaries;
}

export function measureContentDuration(events: MusicEvent[]) {
  const cursors = new Map<string, ReturnType<typeof rationalFromNumber>>();
  let sequential = ZERO;
  let maximum = ZERO;

  for (const event of events) {
    const duration = event.type === "annotation" || event.type === "direction" ? ZERO : rationalFromNumber(durationToBeats(event.duration));
    const voiceKey = `${event.staff ?? 1}:${event.voice ?? 1}`;
    const current = event.position
      ? addRational(rationalFromNumber(event.position.beat), event.position.offset ?? ZERO)
      : event.voice === undefined && event.staff === undefined
        ? sequential
        : cursors.get(voiceKey) ?? ZERO;
    const end = addRational(current, duration);
    maximum = maxRational(maximum, end);
    if (!event.position) {
      if (event.voice === undefined && event.staff === undefined) {
        sequential = end;
      } else {
        cursors.set(voiceKey, end);
      }
    }
  }

  return maximum;
}

function meterAtMeasure(score: FoxChildMusicScore, measureNumber: number) {
  const changes = (score.global.meterEvents ?? [])
    .filter((event) => event.measure <= measureNumber)
    .sort((a, b) => a.measure - b.measure);
  const current = changes[changes.length - 1];
  return current ?? score.global.timeSignature;
}
