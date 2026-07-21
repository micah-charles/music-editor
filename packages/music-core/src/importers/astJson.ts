import type { FoxChildMusicScore, FoxChildSimpleScoreV1 } from "../ast/types";
import { validateScore } from "../ast/validateScore";
import { simpleJsonToAst } from "./simpleJsonToAst";
import { migrateScoreToLatest } from "../ast/migrateScoreToLatest";

export function importAstJson(jsonText: string): FoxChildMusicScore {
  const parsed = JSON.parse(jsonText) as FoxChildMusicScore | FoxChildSimpleScoreV1;

  if (parsed.schemaVersion === "1.0") {
    return migrateScoreToLatest(simpleJsonToAst(parsed));
  }

  const migrated = migrateScoreToLatest(parsed);

  const validation = validateScore(migrated);
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }

  return migrated;
}
