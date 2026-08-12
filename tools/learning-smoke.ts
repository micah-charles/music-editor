import { readFileSync } from "node:fs";
import {
  AdaptiveLearningRuntime,
  LearningRuntime,
  createDefaultQuestionFamilyRegistry,
  migrateQuestionSetsToActivity,
  normaliseQuestionBankSet,
  questionItems,
  validateQuestionSet
} from "@foxchild/music-core";
import type { QuestionSet } from "@foxchild/music-core";

const learningRoot = new URL("../apps/studio/public/learning/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", learningRoot), "utf8")) as {
  sets: Array<{ file: string }>;
  adaptivePacks?: Array<{ file: string }>;
};
const runtime = new LearningRuntime();
const load = (file: string) => normaliseQuestionBankSet(JSON.parse(
  readFileSync(new URL(`question-sets/${file}`, learningRoot), "utf8")
) as QuestionSet);
const publishedSets = manifest.sets.map(({ file }) => load(file));
const adaptivePacks = (manifest.adaptivePacks ?? []).map(({ file }) => load(file));

if (publishedSets.length !== 10) throw new Error(`Expected 10 catalogue sets, found ${publishedSets.length}.`);
if (publishedSets.flatMap(questionItems).length !== 50) throw new Error("Published catalogue is not the expected 50-question bank.");
for (const set of [...publishedSets, ...adaptivePacks]) {
  const result = validateQuestionSet(set, {
    assessmentRegistry: runtime.assessments,
    generatorRegistry: runtime.generators
  });
  if (!result.valid) throw new Error(`${set.id} failed validation: ${result.diagnostics.map((item) => item.message).join("; ")}`);
}

const families = createDefaultQuestionFamilyRegistry();
if (families.ids().length !== 29) throw new Error(`Expected 29 generated families, found ${families.ids().length}.`);
const activity = migrateQuestionSetsToActivity([...publishedSets, ...adaptivePacks]);
activity.curriculumConstraints.curricula = ["abrsm"];
activity.curriculumConstraints.levels = ["Grade 8"];
const session = new AdaptiveLearningRuntime(activity).start(activity, {
  mastery: [],
  recentConceptIds: [],
  recentInteractionKinds: [],
  sessionHistory: []
}, { curriculumId: "abrsm", level: "Grade 8", questionCount: 10 }, "learning-smoke-grade-8");
if (session.questions.length !== 10 || session.questions.some((question) => !question.gradeMappings.abrsm?.includes("Grade 8"))) {
  throw new Error("ABRSM Grade 8 adaptive session failed level routing.");
}

console.log(`Learning smoke passed: ${publishedSets.length} catalogue sets, ${publishedSets.flatMap(questionItems).length} published items, ${adaptivePacks.flatMap(questionItems).length} authored adaptive items, ${families.ids().length} generated families.`);
