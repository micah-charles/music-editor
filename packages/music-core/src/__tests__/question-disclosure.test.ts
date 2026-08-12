import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  QuestionFamilyEngine,
  normaliseQuestionBankSet,
  questionItems
} from "../index";
import type { LearningItem, QuestionSet } from "../index";

describe("learning question answer disclosure", () => {
  it("audits all fifty published questions", () => {
    const publicRoot = new URL("../../../../apps/studio/public/learning/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as {
      sets: Array<{ file: string }>;
    };
    const items = manifest.sets.flatMap(({ file }) => {
      const set = normaliseQuestionBankSet(JSON.parse(
        readFileSync(new URL(`question-sets/${file}`, publicRoot), "utf8")
      ) as QuestionSet);
      return questionItems(set).map((item) => ({ setId: set.id, item }));
    });

    expect(items).toHaveLength(50);
    for (const { setId, item } of items) {
      expect(preAnswerDisclosures(item), `${setId}/${item.id} does not reveal its answer`).toEqual([]);
    }
  });

  it("audits representative seeds from every generated question family", () => {
    const engine = new QuestionFamilyEngine();

    for (const familyId of engine.families.ids()) {
      for (const seed of ["audit-a", "audit-b", "audit-c"]) {
        const { item } = engine.generate(familyId, seed);
        expect(preAnswerDisclosures(item), `${familyId}/${seed} does not reveal its answer`).toEqual([]);
      }
    }

    const symbolQuestion = engine.generate("music-symbols@2", "symbol-audit").item;
    expect(symbolQuestion.stimulus[0].accessibility).toEqual({
      description: { "en-GB": "An unidentified music symbol." }
    });
    expect(symbolQuestion.stimulus[1]).toMatchObject({ kind: "notation", visibility: "hidden" });
  });
});

function preAnswerDisclosures(item: LearningItem): string[] {
  if (item.interaction.kind !== "choice") return [];
  const correctOption = item.interaction.options?.find((option) => option.id === item.response.correct?.value);
  const answer = flattenStrings(correctOption?.content).join(" ").trim().toLowerCase();
  if (answer.length < 3) return [];
  const answerPattern = new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i");
  const presentation = [
    item.prompt.content,
    item.prompt.ariaLabel,
    ...item.stimulus.flatMap((stimulus) => [
      stimulus.kind === "text" || stimulus.kind === "rich-text" ? stimulus.content : undefined,
      stimulus.accessibility
    ])
  ];
  return flattenStrings(presentation).filter((text) => answerPattern.test(text));
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenStrings);
  return [];
}
