import type { FoxChildMusicScore } from "../ast/types";
import type { MeasureBoundary, RepeatExpansion } from "./types";

export function buildRepeatExpansion(score: FoxChildMusicScore, measureMap: MeasureBoundary[]): RepeatExpansion | undefined {
  const measures = new Map(score.parts.flatMap((part) => part.measures.map((measure) => [measure.number, measure] as const)));
  if (![...measures.values()].some((measure) => measure.repeat?.start || measure.repeat?.end || measure.repeat?.endings?.length)) {
    return undefined;
  }

  const passes: RepeatExpansion["passes"] = [];
  const warnings: string[] = [];
  let repeatStartIndex = 0;
  let activePass = 1;

  for (let index = 0; index < measureMap.length; index += 1) {
    const boundary = measureMap[index];
    const measure = measures.get(boundary.measureNumber);
    if (measure?.repeat?.start) {
      repeatStartIndex = index;
    }
    const ending = measure?.repeat?.endings;
    if (!ending?.length || ending.includes(activePass)) {
      passes.push({ sourceMeasure: boundary.measureNumber, playbackMeasureIndex: passes.length });
    }

    if (measure?.repeat?.end) {
      const repeatTimes = Math.max(2, Math.round(measure.repeat.times ?? 2));
      for (let pass = 1; pass < repeatTimes; pass += 1) {
        for (let repeatedIndex = repeatStartIndex; repeatedIndex <= index; repeatedIndex += 1) {
          const repeated = measureMap[repeatedIndex];
          const ending = measures.get(repeated.measureNumber)?.repeat?.endings;
          if (ending?.length && !ending.includes(pass + 1)) {
            continue;
          }
          passes.push({ sourceMeasure: repeated.measureNumber, playbackMeasureIndex: passes.length });
        }
      }
      activePass = repeatTimes;
    }
  }

  if ([...measures.values()].some((measure) => (measure.repeat?.endings?.length ?? 0) > 0)) {
    warnings.push("Numbered endings are represented in the repeat map; nested or discontinuous endings remain provisional.");
  }
  return { passes, warnings };
}
