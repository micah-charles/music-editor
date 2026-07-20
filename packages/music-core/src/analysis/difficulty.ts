import type { FoxChildMusicScore } from "../ast/types";
import { melodyRange } from "./melodyRange";
import { countNotes } from "../rhythm/measure";

export interface ScoreDifficulty {
  level: "beginner" | "early-intermediate" | "intermediate" | "advanced";
  reasons: string[];
  range: string;
  noteCount: number;
}

export function analyseDifficulty(score: FoxChildMusicScore): ScoreDifficulty {
  const noteCount = score.parts.reduce((sum, part) => sum + countNotes(part.measures), 0);
  const range = melodyRange(score);
  const reasons: string[] = [];
  let level: ScoreDifficulty["level"] = "beginner";

  if (noteCount > 64) {
    level = "early-intermediate";
    reasons.push("More than 64 notes.");
  }
  if (score.parts.length > 1) {
    level = "early-intermediate";
    reasons.push("Multiple parts.");
  }
  if (noteCount > 160) {
    level = "intermediate";
    reasons.push("Longer score.");
  }

  if (reasons.length === 0) {
    reasons.push("Short score with simple notation.");
  }

  return {
    level,
    reasons,
    range,
    noteCount
  };
}
