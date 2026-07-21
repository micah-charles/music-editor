import type { FoxChildMusicScore, FoxChildSimpleScoreV1, Rational } from "./types";
import { durationToBeats } from "../rhythm/duration";
import { simpleJsonToAst } from "../importers/simpleJsonToAst";

export type ScoreMigrationResult = {
  score: FoxChildMusicScore;
  warnings: string[];
};

export function migrateScoreToLatest(input: unknown): FoxChildMusicScore {
  return migrateScoreWithWarnings(input).score;
}

export function migrateScoreWithWarnings(input: unknown): ScoreMigrationResult {
  if (!isRecord(input)) {
    throw new Error("Score migration requires an object.");
  }

  const warnings: string[] = [];
  const source = input.schemaVersion === "1.0"
    ? simpleJsonToAst(input as unknown as FoxChildSimpleScoreV1)
    : structuredClone(input) as unknown as FoxChildMusicScore;
  if (input.schemaVersion === "1.0") {
    warnings.push("Migrated FoxChild v1 score to AST v2.");
  }
  if (source.schemaVersion !== "2.0") {
    throw new Error(`Unsupported score schema version: ${String(source.schemaVersion ?? "missing")}.`);
  }

  let generatedIds = 0;
  let generatedPositions = 0;
  source.parts?.forEach((part, partIndex) => {
    part.measures?.forEach((measure, measureIndex) => {
      const cursors = new Map<string, number>();
      measure.events?.forEach((event, eventIndex) => {
        if (!event.id) {
          event.id = `${part.id || `part-${partIndex + 1}`}-m${measure.number || measureIndex + 1}-e${eventIndex + 1}`;
          generatedIds += 1;
        }
        const staff = event.staff ?? 1;
        const voice = event.voice ?? 1;
        const lane = `${staff}:${voice}`;
        const cursor = cursors.get(lane) ?? 0;
        if (!event.position) {
          event.position = { measure: measure.number, beat: cursor };
          generatedPositions += 1;
        }
        event.staff = staff;
        event.voice = voice;
        if (event.type !== "annotation" && event.type !== "direction") {
          const end = event.position.beat + rationalOffset(event.position.offset) + durationToBeats(event.duration);
          cursors.set(lane, Math.max(cursor, end));
        }
      });
    });
  });

  if (generatedIds > 0) {
    warnings.push(`Generated ${generatedIds} stable event ID${generatedIds === 1 ? "" : "s"}.`);
  }
  if (generatedPositions > 0) {
    warnings.push(`Normalized ${generatedPositions} sequential event position${generatedPositions === 1 ? "" : "s"}.`);
  }
  if (warnings.length > 0) {
    source.sourceMetadata = {
      ...source.sourceMetadata,
      warnings: [...new Set([...(source.sourceMetadata?.warnings ?? []), ...warnings])]
    };
  }
  return { score: source, warnings };
}

function rationalOffset(offset: Rational | undefined): number {
  if (!offset || typeof offset !== "object" || !("numerator" in offset) || !("denominator" in offset)) {
    return 0;
  }
  const value = offset as { numerator: number; denominator: number };
  return value.denominator === 0 ? 0 : value.numerator / value.denominator;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
