import type { MusicEvent, NoteDurationValue } from "../ast/types";
import { createScoreFromEvents } from "../ast/factory";
import { DURATION_BEATS } from "../rhythm/duration";
import { parsePitchName } from "../theory/pitch";

export interface PlainTextImportOptions {
  title?: string;
  tempo?: number;
}

export function plainTextToAst(text: string, options: PlainTextImportOptions = {}) {
  const events: MusicEvent[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  lines.forEach((line, index) => {
    const [rawPitch, rawDuration = "quarter"] = line.split(/[\s,]+/);
    const duration = rawDuration.toLowerCase() as NoteDurationValue;

    if (!DURATION_BEATS[duration]) {
      throw new Error(`Line ${index + 1}: unsupported duration "${rawDuration}".`);
    }

    if (rawPitch.toLowerCase() === "rest") {
      events.push({
        id: `plain-${index + 1}`,
        type: "rest",
        duration: {
          value: duration,
          beats: DURATION_BEATS[duration]
        }
      });
      return;
    }

    events.push({
      id: `plain-${index + 1}`,
      type: "note",
      pitch: parsePitchName(rawPitch),
      duration: {
        value: duration,
        beats: DURATION_BEATS[duration]
      }
    });
  });

  return createScoreFromEvents({
    title: options.title ?? "Pasted Notes",
    tempo: options.tempo ?? 90,
    source: "plain-text",
    events
  });
}
