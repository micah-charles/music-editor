import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AdaptiveLearningRuntime,
  LearningRuntime,
  calculateSetProgress,
  categoriesForSet,
  createDefaultAssessmentRegistry,
  createDefaultMusicGeneratorRegistry,
  deterministicShuffle,
  filterCatalogue,
  loadQuestionSet,
  migrateQuestionSetsToActivity,
  migrateQuestionSet,
  musicLearningDemoSet,
  normaliseQuestionBankSet,
  questionItems,
  startAttempt,
  submitAttempt,
  updateMastery,
  validateQuestionSet
} from "../index";
import type { LearningCatalogueEntry, QuestionSet } from "../index";

describe("FCMLIF learning engine", () => {
  it("validates the published demonstration set at schema and semantic layers", () => {
    const result = validateQuestionSet(musicLearningDemoSet, {
      assessmentRegistry: createDefaultAssessmentRegistry(),
      generatorRegistry: createDefaultMusicGeneratorRegistry()
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns structured JSON and semantic diagnostics", () => {
    const syntax = loadQuestionSet("{");
    expect(syntax.diagnostics[0]).toMatchObject({ code: "json.syntax", path: "$" });

    const invalid = structuredClone(musicLearningDemoSet);
    invalid.sections[0].items[0].response.correct = { value: "missing-option" };
    const semantic = validateQuestionSet(invalid);
    expect(semantic.valid).toBe(false);
    expect(semantic.diagnostics).toContainEqual(expect.objectContaining({
      code: "reference.correct-option",
      severity: "error"
    }));
  });

  it("reproduces generator output and option order from stable seeds", () => {
    const registry = createDefaultMusicGeneratorRegistry();
    const generator = registry.resolve("sight-reading-melody@1");
    expect(generator.generate("fixed-seed", { measures: 2 })).toEqual(
      generator.generate("fixed-seed", { measures: 2 })
    );
    expect(deterministicShuffle(["a", "b", "c", "d"], "options")).toEqual(
      deterministicShuffle(["a", "b", "c", "d"], "options")
    );
  });

  it("resolves canonical AST stimuli and assesses choice and written pitch", async () => {
    const runtime = new LearningRuntime();
    const [choice, note] = musicLearningDemoSet.sections[0].items;
    const resolvedChoice = await runtime.resolveItem(musicLearningDemoSet, choice);
    const resolvedNote = await runtime.resolveItem(musicLearningDemoSet, note);

    expect(resolvedChoice.resolvedStimuli[0].resolvedScore?.type).toBe("FoxChildMusicScore");
    expect(resolvedChoice.resolvedStimuli[0].resolvedScore?.global.key.fifths).toBe(3);
    expect(runtime.assess(resolvedChoice, "opt-a-major").passed).toBe(true);
    expect(runtime.assess(resolvedChoice, "opt-d-major").passed).toBe(false);
    expect(runtime.assess(resolvedNote, { step: "F", alter: 1, octave: 4 }).passed).toBe(true);
    expect(runtime.assess(resolvedNote, { step: "G", alter: -1, octave: 4 }).passed).toBe(false);
  });

  it("supports partial set, numeric, sequence, rhythm, and composite scoring", () => {
    const registry = createDefaultAssessmentRegistry();
    const assess = (strategy: string, value: unknown, correct: unknown, maximumScore = 100, parameters = {}) =>
      registry.resolve(strategy).assess(value, {
        response: { id: "r", baseType: "mapping", correct: { value: correct } },
        declaration: { strategy, maximumScore, parameters }
      });

    expect(assess("identifier-set@1", ["a", "b"], ["a", "c"]).score).toBeCloseTo(100 / 3, 8);
    expect(assess("numeric-tolerance@1", 123, 120, 100, {
      target: 120,
      fullCreditTolerance: 2,
      absoluteTolerance: 5
    }).score).toBeCloseTo(66.666, 2);
    expect(assess("pitch-sequence-match@1", [60, 62, 65], [60, 62, 64]).score).toBeCloseTo(66.666, 2);
    expect(assess("rhythm-alignment@1", [
      { onset: 0, duration: 1 },
      { onset: 1, duration: 1 }
    ], [
      { onset: 0, duration: 1 },
      { onset: 1, duration: 1 }
    ]).passed).toBe(true);
    expect(assess("composite-weighted@1", { a: 1, b: 0.5 }, undefined, 100, {
      components: [
        { responseId: "a", weight: 3 },
        { responseId: "b", weight: 1 }
      ]
    }).score).toBe(87.5);
  });

  it("registers and executes every required assessment strategy version", async () => {
    const registry = createDefaultAssessmentRegistry();
    expect(registry.ids()).toEqual([
      "audio-recording@1",
      "composite-weighted@1",
      "exact-identifier@1",
      "identifier-set@1",
      "matching@1",
      "midi-performance@1",
      "normalised-text@1",
      "numeric-tolerance@1",
      "ordering@1",
      "pitch-match@1",
      "pitch-sequence-match@1",
      "pitch-set-match@1",
      "rhythm-alignment@1",
      "rubric@1",
      "score-semantic-diff@1",
      "sight-reading@1"
    ]);

    const run = (
      strategy: string,
      value: unknown,
      correct: unknown,
      parameters: Record<string, unknown> = {},
      resolvedItem?: Awaited<ReturnType<LearningRuntime["resolveItem"]>>
    ) => registry.resolve(strategy).assess(value, {
      response: { id: "response", baseType: "mapping", correct: { value: correct } },
      declaration: { strategy, maximumScore: 1, parameters },
      resolvedItem
    });

    expect(run("exact-identifier@1", "a", "a").passed).toBe(true);
    expect(run("normalised-text@1", "  Allegro  ", "allegro").passed).toBe(true);
    expect(run("ordering@1", ["first", "second", "third"], ["first", "second", "third"]).passed).toBe(true);
    expect(run("matching@1", { a: "one", b: "two" }, { a: "one", b: "two" }).passed).toBe(true);
    expect(run("pitch-match@1", "F#4", { written: { step: "F", alter: 1, octave: 4 }, midi: 66 }).passed).toBe(true);
    expect(run("pitch-set-match@1", [67, 60, 64], [60, 64, 67], { octavePolicy: "exact" }).passed).toBe(true);
    expect(run("midi-performance@1", [
      { midi: 60, onsetMs: 0, durationMs: 500 },
      { midi: 62, onsetMs: 500, durationMs: 500 }
    ], [
      { midi: 60, onsetMs: 0, durationMs: 500 },
      { midi: 62, onsetMs: 500, durationMs: 500 }
    ]).passed).toBe(true);
    expect(run("rubric@1", { tone: 2, phrasing: 1 }, undefined, {
      criteria: [
        { id: "tone", maximum: 2 },
        { id: "phrasing", maximum: 1 }
      ]
    }).passed).toBe(true);
    expect(run("audio-recording@1", { recorded: true, durationMs: 1500, blobSize: 100 }, undefined, { minimumDurationMs: 1000 }).passed).toBe(true);

    const runtime = new LearningRuntime();
    const sightItem = await runtime.resolveItem(
      musicLearningDemoSet,
      {
        ...musicLearningDemoSet.sections[0].items[1],
        id: "sight-test",
        type: "sight-reading",
        interaction: {
          kind: "sight-reading",
          responseId: "response-note",
          mode: "flowing"
        },
        response: {
          id: "response-note",
          baseType: "midi-performance",
          cardinality: "record"
        },
        assessment: {
          strategy: "sight-reading@1",
          maximumScore: 1,
          passingScore: 0
        }
      }
    );
    expect(run("sight-reading@1", [], undefined, {}, sightItem).maximumScore).toBe(1);

    const score = sightItem.resolvedStimuli[0].resolvedScore;
    expect(run("score-semantic-diff@1", score, score).passed).toBe(true);
  });

  it("declares every FCMLIF interaction renderer and compatible response shape", () => {
    const runtime = new LearningRuntime();
    const base = musicLearningDemoSet.sections[0].items[0];
    const combinations = [
      ["choice", "identifier", "exact-identifier@1"],
      ["text-entry", "string", "normalised-text@1"],
      ["numeric-entry", "number", "numeric-tolerance@1"],
      ["matching", "mapping", "matching@1"],
      ["ordering", "ordering", "ordering@1"],
      ["drag-drop", "mapping", "composite-weighted@1"],
      ["score-drag-drop", "score-patch", "score-semantic-diff@1"],
      ["hotspot", "identifier", "exact-identifier@1"],
      ["music-keyboard", "pitch", "pitch-match@1"],
      ["notation-entry", "score-ast", "score-semantic-diff@1"],
      ["rhythm-tap", "rhythm", "rhythm-alignment@1"],
      ["audio-recording", "audio-recording", "rubric@1"],
      ["sight-reading", "midi-performance", "sight-reading@1"],
      ["composition", "score-ast", "rubric@1"],
      ["composite", "mapping", "composite-weighted@1"]
    ] as const;

    combinations.forEach(([kind, baseType, strategy], index) => {
      const item = structuredClone(base);
      item.id = `item-interaction-${kind}`;
      item.stimulus[0].id = `stimulus-interaction-${kind}`;
      item.interaction = {
        kind,
        responseId: `response-${index}`,
        ...(kind === "choice" ? {
          options: [
            { id: `option-${index}-a`, content: { "en-GB": "A" } },
            { id: `option-${index}-b`, content: { "en-GB": "B" } }
          ]
        } : {})
      };
      item.response = {
        id: `response-${index}`,
        baseType,
        correct: kind === "choice" ? { value: `option-${index}-a` } : undefined
      };
      item.assessment = {
        strategy,
        maximumScore: 1,
        passingScore: 0,
        parameters: kind === "sight-reading" ? {} : undefined
      };
      if (kind === "sight-reading") {
        item.stimulus[0].playback = { tempo: { mode: "override", bpm: 80 } };
      }
      const candidate = structuredClone(musicLearningDemoSet);
      candidate.sections[0].items = [item];
      const result = validateQuestionSet(candidate, {
        assessmentRegistry: runtime.assessments,
        generatorRegistry: runtime.generators
      });
      expect(
        result.diagnostics.filter((diagnostic) => diagnostic.code.startsWith("compatibility.") || diagnostic.code.startsWith("unsupported.")),
        `${kind} diagnostics`
      ).toEqual([]);
    });
  });

  it("creates immutable attempt records and updates weighted skill mastery", async () => {
    const runtime = new LearningRuntime();
    const item = await runtime.resolveItem(musicLearningDemoSet, musicLearningDemoSet.sections[0].items[0]);
    const attempt = startAttempt(musicLearningDemoSet, item, {
      attemptId: "attempt-test",
      learnerId: "learner-test",
      now: "2026-07-27T20:10:00.000Z"
    });
    const submitted = submitAttempt(attempt, item, "opt-a-major", runtime, {
      now: "2026-07-27T20:10:11.000Z",
      inputSource: "keyboard"
    });

    expect(attempt.submittedAt).toBeUndefined();
    expect(submitted).toMatchObject({
      attemptId: "attempt-test",
      submittedAt: "2026-07-27T20:10:11.000Z",
      telemetry: { responseTimeMs: 11000, inputSource: "keyboard" },
      result: { score: 1, percentage: 100, passed: true }
    });
    expect(updateMastery([], submitted, "2026-07-27T20:11:00.000Z")).toEqual([{
      skillId: "theory.key-signature.major.identify",
      evidenceCount: 1,
      mastery: 1,
      updatedAt: "2026-07-27T20:11:00.000Z"
    }]);
  });

  it("never silently migrates unknown schema versions", () => {
    expect(migrateQuestionSet(musicLearningDemoSet)).toEqual(musicLearningDemoSet);
    expect(() => migrateQuestionSet({ ...musicLearningDemoSet, schemaVersion: "0.9.0" }))
      .toThrow("no silent migration");
  });

  it("loads, validates, and resolves all fifty published learning questions", async () => {
    const publicRoot = new URL("../../../../apps/studio/public/learning/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as {
      sets: Array<{ file: string }>;
    };
    const runtime = new LearningRuntime();
    const sets = manifest.sets.map(({ file }) =>
      normaliseQuestionBankSet(JSON.parse(
        readFileSync(new URL(`question-sets/${file}`, publicRoot), "utf8")
      ) as QuestionSet)
    );

    expect(sets).toHaveLength(10);
    expect(sets.flatMap(questionItems)).toHaveLength(50);
    const firstNote = await runtime.resolveItem(sets[0], questionItems(sets[0])[0]);
    expect(runtime.assess(firstNote, "C4").passed).toBe(true);
    for (const set of sets) {
      expect(validateQuestionSet(set, {
        assessmentRegistry: runtime.assessments,
        generatorRegistry: runtime.generators
      }).valid, set.id).toBe(true);
      for (const item of questionItems(set)) {
        const resolved = await runtime.resolveItem(set, item);
        expect(resolved.resolvedStimuli).toHaveLength(item.stimulus.length);
        expect(
          runtime.assess(resolved, resolved.response.correct?.value).passed,
          `${set.id}/${item.id} accepts its canonical answer`
        ).toBe(true);
      }
    }
  });

  it("loads and validates supplemental authored contextual material for adaptive sessions", () => {
    const publicRoot = new URL("../../../../apps/studio/public/learning/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as {
      adaptivePacks?: Array<{ file: string }>;
    };
    const packs = (manifest.adaptivePacks ?? []).map(({ file }) => normaliseQuestionBankSet(JSON.parse(
      readFileSync(new URL(`question-sets/${file}`, publicRoot), "utf8")
    ) as QuestionSet));
    expect(packs).toHaveLength(1);
    expect(packs.flatMap(questionItems)).toHaveLength(24);
    expect(packs[0].metadata.tags).toEqual(expect.arrayContaining(["abrsm-grade-8", "gcse"]));
    expect(questionItems(packs[0]).some((item) => item.metadata?.curriculumLevels &&
      (item.metadata.curriculumLevels as { abrsm?: string[] }).abrsm?.includes("Grade 8"))).toBe(true);
    packs.forEach((pack) => expect(validateQuestionSet(pack, {
      assessmentRegistry: new LearningRuntime().assessments,
      generatorRegistry: new LearningRuntime().generators
    }).valid, pack.id).toBe(true));
    const activity = migrateQuestionSetsToActivity(packs);
    expect(activity.authoredItems.every((item) => item.metadata?.domain === "error-detection")).toBe(true);
    expect(activity.authoredItems.some((item) => item.metadata?.conceptId === "musical-analysis.context.modulation")).toBe(true);
    expect(activity.authoredItems.filter((item) => item.metadata?.linkedGroupId === "gcse-listening-01")).toHaveLength(3);
    activity.sessionPolicy.authoredItemShare = 1;
    const adaptiveRuntime = new AdaptiveLearningRuntime(activity);
    const foundation = adaptiveRuntime.start(activity, { mastery: [], recentConceptIds: [], recentInteractionKinds: [], sessionHistory: [] }, {
      curriculumId: "abrsm", level: "Grade 1", domains: ["error-detection"], questionCount: 1
    }, "authored-grade-filter-foundation");
    const advanced = adaptiveRuntime.start(activity, { mastery: [], recentConceptIds: [], recentInteractionKinds: [], sessionHistory: [] }, {
      curriculumId: "abrsm", level: "Grade 8", domains: ["error-detection"], questionCount: 1
    }, "authored-grade-filter-advanced");
    const trinityAdvanced = adaptiveRuntime.start(activity, { mastery: [], recentConceptIds: [], recentInteractionKinds: [], sessionHistory: [] }, {
      curriculumId: "trinity", level: "Grade 8", domains: ["error-detection"], questionCount: 1
    }, "authored-grade-filter-trinity");
    expect(foundation.questions[0]?.source).toBe("generated");
    expect(advanced.questions[0]?.source).toBe("authored");
    expect(trinityAdvanced.questions[0]?.source).toBe("authored");
  });

  it("calculates resumable progress and category filtering for the catalogue", () => {
    const set = normaliseQuestionBankSet(structuredClone(musicLearningDemoSet));
    const items = questionItems(set);
    const progress = calculateSetProgress(set, [{
      format: "foxchild.music-learning.attempt",
      schemaVersion: "1.0.0",
      attemptId: "catalogue-attempt",
      questionSetId: set.id,
      questionSetRevision: set.revision,
      itemId: items[0].id,
      startedAt: "2026-07-27T10:00:00.000Z",
      submittedAt: "2026-07-27T10:00:05.000Z",
      resolvedVariables: {},
      responses: [],
      result: {
        score: 1,
        maximumScore: 1,
        percentage: 100,
        passed: true,
        dimensions: {},
        feedbackIds: ["correct"],
        masteryEvidence: []
      },
      telemetry: { replayCount: 0, hintIdsUsed: [] }
    }]);
    const entry: LearningCatalogueEntry = {
      id: set.id,
      title: "Foundations",
      description: "Test",
      domain: "note-reading",
      categories: categoriesForSet({ metadata: { ...set.metadata, domain: "note-reading" } }),
      questionCount: items.length,
      file: "foundations.json"
    };

    expect(progress).toMatchObject({
      completedQuestions: 1,
      correctQuestions: 1,
      resumeItemIndex: 1,
      bestScore: 50
    });
    expect(filterCatalogue([entry], "midi")).toEqual([entry]);
    expect(filterCatalogue([entry], "ear-training")).toEqual([]);
  });
});
