import type { FoxChildMusicScore, FoxChildSimpleScoreV1 } from "../ast/types";
import { validateScore } from "../ast/validateScore";
import { simpleJsonToAst } from "./simpleJsonToAst";

export function importAstJson(jsonText: string): FoxChildMusicScore {
  const parsed = JSON.parse(jsonText) as FoxChildMusicScore | FoxChildSimpleScoreV1;

  if (parsed.schemaVersion === "1.0") {
    return simpleJsonToAst(parsed);
  }

  const validation = validateScore(parsed);
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }

  return parsed as FoxChildMusicScore;
}
