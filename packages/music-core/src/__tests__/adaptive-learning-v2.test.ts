import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AdaptiveLearningRuntime,
  MasteryEngine,
  QuestionFamilyEngine,
  ReviewScheduler,
  adaptiveSessionAsQuestionSet,
  allocateMix,
  createDefaultCurriculumRegistry,
  createDefaultDistractorRegistry,
  createDefaultLearningActivity,
  createDefaultQuestionFamilyRegistry,
  canonicalQuestionId,
  migrateQuestionSetsToActivity,
  normaliseQuestionBankSet,
  questionItems,
  validateLearningActivity,
  validateQuestionSet,
  type AdaptiveLearnerState,
  type QuestionSet
} from "../index";

const emptyLearner: AdaptiveLearnerState = {
  mastery: [],
  recentConceptIds: [],
  recentInteractionKinds: [],
  sessionHistory: []
};

describe("adaptive learning v2", () => {
  it("registers all generator-backed domains and extended skill families", () => {
    const families = createDefaultQuestionFamilyRegistry().list();
    expect([...new Set(families.map((family) => family.domain))].sort()).toEqual([
      "chords",
      "ear-training",
      "error-detection",
      "intervals",
      "key-signatures",
      "melody-dictation",
      "music-symbols",
      "note-reading",
      "note-values",
      "rhythm",
      "scales",
      "sight-reading",
      "tempo",
      "time-signatures"
    ]);
    families.forEach((family) => {
      expect(Object.keys(family.parameterSpace).length, family.id).toBeGreaterThan(0);
      expect(family.generatorId, family.id).toMatch(/@[0-9]+$/);
      expect(family.distractorStrategyId, family.id).toMatch(/@[0-9]+$/);
      expect(family.conceptIds.length, family.id).toBeGreaterThan(0);
      expect(family.variantIds.length, family.id).toBeGreaterThan(0);
      expect(new Set(family.curriculum.map((mapping) => mapping.curriculumId))).toEqual(
        new Set(["foxchild", "abrsm", "trinity", "gcse"])
      );
    });
  });

  it("generates deterministic identity, canonical AST, answers, and distractors for every family", async () => {
    const engine = new QuestionFamilyEngine();
    for (const familyId of engine.families.ids()) {
      const first = engine.generate(familyId, "deterministic-seed", 0.6);
      const second = engine.generate(familyId, "deterministic-seed", 0.6);
      expect(first, familyId).toEqual(second);
      expect(first.conceptId, familyId).toBeTruthy();
      expect(first.variantId, familyId).toBeTruthy();
      expect(first.instanceId, familyId).toBeTruthy();
      expect(first.canonicalId, familyId).toBe(canonicalQuestionId(
        first.familyId,
        first.conceptId,
        first.variantId,
        first.seed,
        first.generatorParameters
      ));
      expect(engine.families.resolve(familyId).variantIds, familyId).toContain(first.variantId);
      const score = first.item.stimulus.find((stimulus) => stimulus.kind === "notation");
      expect(score?.source, familyId).toMatchObject({ mode: "inline-ast" });
      const wrapper: QuestionSet = {
        format: "foxchild.music-learning.question-set",
        schemaVersion: "1.0.0",
        id: `test-${familyId}`,
        revision: 1,
        status: "draft",
        metadata: { title: { "en-GB": familyId }, language: "en-GB" },
        sections: [{ id: `section-${familyId}`, items: [first.item] }]
      };
      expect(validateQuestionSet(wrapper).valid, familyId).toBe(true);
    }
    const tuplets = new QuestionFamilyEngine().generate("tuplets@1", "tuplet-seed");
    const tupletSource = tuplets.item.stimulus.find((stimulus) => stimulus.kind === "notation")?.source as { mode?: string; score?: { parts?: Array<{ measures?: Array<{ events?: Array<{ duration?: { tuplet?: unknown } }> }> }> } } | undefined;
    expect(tupletSource?.mode).toBe("inline-ast");
    expect(tupletSource?.score?.parts?.[0]?.measures?.[0]?.events?.[0]?.duration?.tuplet).toEqual({
      actualNotes: 3,
      normalNotes: 2,
      normalType: "quarter"
    });
  });

  it("honours validated activity-level family parameters", () => {
    const activity = createDefaultLearningActivity();
    activity.questionFamilies = ["chords@2"];
    const chordConfiguration = activity.generatorConfiguration.families.find((entry) => entry.familyId === "chords@2");
    if (!chordConfiguration) throw new Error("Missing chords family configuration.");
    chordConfiguration.parameters = { quality: "diminished" };
    activity.curriculumConstraints.domains = ["chords"];
    expect(validateLearningActivity(activity).valid).toBe(true);
    const session = new AdaptiveLearningRuntime(activity).start(activity, emptyLearner, {
      curriculumId: "foxchild",
      domains: ["chords"],
      questionCount: 5
    }, "configured-family", new Date("2026-07-28T10:00:00.000Z"));
    expect(session.questions.every((question) =>
      question.item.response.correct?.value === "answer-diminished"
    )).toBe(true);
  });

  it("builds the specified 40/30/20/10 adaptive session mix", () => {
    expect(allocateMix(10)).toEqual({
      review: 4,
      developing: 3,
      new: 2,
      challenge: 1
    });
    const activity = createDefaultLearningActivity();
    const runtime = new AdaptiveLearningRuntime(activity);
    const session = runtime.start(activity, emptyLearner, {
      curriculumId: "foxchild",
      questionCount: 10
    }, "session-seed", new Date("2026-07-28T10:00:00.000Z"));
    expect(session.questions).toHaveLength(10);
    expect(session.bucketCounts).toEqual({ review: 4, developing: 3, new: 2, challenge: 1 });
    expect(new Set(session.questions.map((question) => question.instanceId)).size).toBe(10);
    expect(adaptiveSessionAsQuestionSet(activity, session).sections[0].items).toHaveLength(10);
  });

  it("filters eligible concepts by curriculum, level, and practice domain", () => {
    const activity = createDefaultLearningActivity();
    const runtime = new AdaptiveLearningRuntime(activity);
    const eligible = runtime.sessions.eligibleFamilies(activity, {
      curriculumId: "abrsm",
      level: "Grade 3",
      domains: ["ear-training", "chords"]
    });
    expect([...new Set(eligible.map((family) => family.domain))].sort()).toEqual(["chords", "ear-training"]);
    const session = runtime.start(activity, emptyLearner, {
      curriculumId: "abrsm",
      level: "Grade 3",
      domains: ["chords"],
      questionCount: 5
    }, "domain-filter");
    expect(session.questions.every((question) => question.domain === "chords")).toBe(true);
  });

  it("updates mastery bands and schedules expanding review intervals", () => {
    const engine = new MasteryEngine();
    const first = engine.update(undefined, {
      conceptId: "note-reading.pitch-on-staff",
      domain: "note-reading",
      percentage: 100,
      passed: true,
      submittedAt: "2026-07-28T10:00:00.000Z"
    });
    const second = engine.update(first, {
      conceptId: first.conceptId,
      domain: first.domain,
      percentage: 100,
      passed: true,
      submittedAt: "2026-07-29T10:00:00.000Z"
    });
    expect(first.mastery).toBeGreaterThan(0);
    expect(second.mastery).toBeGreaterThan(first.mastery);
    expect(second.intervalHours).toBeGreaterThan(first.intervalHours);
    expect(new ReviewScheduler().due([first], new Date("2026-07-29T00:00:00.000Z"))).toEqual([first]);
  });

  it("provides four curriculum definitions and three versioned distractor strategies", () => {
    expect(createDefaultCurriculumRegistry().list().map((entry) => entry.id)).toEqual([
      "foxchild", "abrsm", "trinity", "gcse"
    ]);
    expect(createDefaultDistractorRegistry().ids()).toEqual([
      "common-confusions@1",
      "curriculum-peers@1",
      "near-neighbour@1"
    ]);
  });

  it("migrates the complete v1 bank while retaining authored assessments", () => {
    const publicRoot = new URL("../../../../apps/studio/public/learning/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as {
      sets: Array<{ file: string }>;
    };
    const sets = manifest.sets.map(({ file }) =>
      normaliseQuestionBankSet(JSON.parse(
        readFileSync(new URL(`question-sets/${file}`, publicRoot), "utf8")
      ) as QuestionSet)
    );
    const activity = migrateQuestionSetsToActivity(sets);
    expect(activity.schemaVersion).toBe("2.0.0");
    expect(activity.authoredItems).toHaveLength(50);
    expect(activity.questionFamilies).toHaveLength(21);
    expect(activity.authoredItems.every((item) => item.metadata?.adaptive === true)).toBe(true);
    expect(validateLearningActivity(activity)).toEqual({ valid: true, diagnostics: [] });
    expect(sets.flatMap(questionItems)).toHaveLength(50);
  });

  it("rejects malformed v2 policy and unknown families", () => {
    const activity = createDefaultLearningActivity();
    activity.questionFamilies.push("unknown-family@2");
    activity.sessionPolicy.adaptiveMix.review = 0.9;
    const result = validateLearningActivity(activity);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "reference.unknown-family" }),
      expect.objectContaining({ code: "policy.adaptive-mix" })
    ]));
  });

  it("rejects invalid generator configuration parameters", () => {
    const activity = createDefaultLearningActivity();
    const configuration = activity.generatorConfiguration.families[0];
    configuration.weight = 0;
    configuration.parameters = { midi: 900, mystery: true };
    const result = validateLearningActivity(activity);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "generator.weight" }),
      expect.objectContaining({ code: "generator.parameter-range" }),
      expect.objectContaining({ code: "generator.unknown-parameter" })
    ]));
  });
});
