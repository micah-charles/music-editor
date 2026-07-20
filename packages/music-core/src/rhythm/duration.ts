import type { Duration, NoteDurationValue } from "../ast/types";

export const DURATION_BEATS: Record<NoteDurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  "dotted-half": 3,
  "dotted-quarter": 1.5,
  "dotted-eighth": 0.75
};

export const ORDERED_DURATIONS: NoteDurationValue[] = [
  "whole",
  "dotted-half",
  "half",
  "dotted-quarter",
  "quarter",
  "dotted-eighth",
  "eighth",
  "sixteenth"
];

export function durationToBeats(duration: Duration | NoteDurationValue): number {
  if (typeof duration === "string") {
    return DURATION_BEATS[duration];
  }
  return duration.beats ?? DURATION_BEATS[duration.value];
}

export function beatsToDuration(beats: number): Duration {
  let best = ORDERED_DURATIONS[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const value of ORDERED_DURATIONS) {
    const distance = Math.abs(DURATION_BEATS[value] - beats);
    if (distance < bestDistance) {
      best = value;
      bestDistance = distance;
    }
  }

  return {
    value: best,
    beats: DURATION_BEATS[best]
  };
}

export function quantizeBeats(beats: number): number {
  return beatsToDuration(beats).beats ?? 1;
}

export function durationToMusicXmlType(duration: Duration): { type: string; dots: number } {
  switch (duration.value) {
    case "whole":
      return { type: "whole", dots: 0 };
    case "half":
      return { type: "half", dots: 0 };
    case "quarter":
      return { type: "quarter", dots: 0 };
    case "eighth":
      return { type: "eighth", dots: 0 };
    case "sixteenth":
      return { type: "16th", dots: 0 };
    case "dotted-half":
      return { type: "half", dots: 1 };
    case "dotted-quarter":
      return { type: "quarter", dots: 1 };
    case "dotted-eighth":
      return { type: "eighth", dots: 1 };
  }
}

export function splitBeatsIntoDurations(totalBeats: number): Duration[] {
  const durations: Duration[] = [];
  let remaining = Math.max(0, totalBeats);

  while (remaining > 0.001) {
    const next = ORDERED_DURATIONS.find((duration) => DURATION_BEATS[duration] <= remaining + 0.001) ?? "sixteenth";
    durations.push({ value: next, beats: DURATION_BEATS[next] });
    remaining -= DURATION_BEATS[next];
  }

  return durations;
}
