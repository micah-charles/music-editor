import {
  defaultMasteryPolicy,
  defaultReviewPolicy,
  defaultSessionPolicy,
  type AdaptiveLearnerState,
  type AdaptiveQuestionBucket,
  type AdaptiveSessionPlan,
  type AdaptiveSessionPreferences,
  type ConceptMastery,
  type GeneratedLearningQuestion,
  type LearningActivity,
  type LearningDomain,
  type QuestionFamilyDefinition
} from "./adaptiveTypes";
import { createDefaultCurriculumRegistry, type CurriculumRegistry } from "./curriculum";
import { inferDomainFromConcept, MasteryEngine, ReviewScheduler } from "./mastery";
import {
  QuestionFamilyEngine,
  createDefaultQuestionFamilyRegistry,
  stableHash,
  canonicalQuestionId,
  type QuestionFamilyRegistry
} from "./questionFamilies";
import type { LearningItem, QuestionSet } from "./types";

export class AdaptiveSessionEngine {
  readonly reviewScheduler = new ReviewScheduler();

  constructor(
    readonly families: QuestionFamilyRegistry = createDefaultQuestionFamilyRegistry(),
    readonly questionEngine = new QuestionFamilyEngine(families),
    readonly curricula: CurriculumRegistry = createDefaultCurriculumRegistry()
  ) {}

  buildSession(
    activity: LearningActivity,
    learner: AdaptiveLearnerState,
    preferences: AdaptiveSessionPreferences,
    seed = `${activity.id}:${new Date().toISOString().slice(0, 10)}`,
    now = new Date()
  ): AdaptiveSessionPlan {
    this.curricula.resolve(preferences.curriculumId);
    const count = Math.max(1, Math.round(preferences.questionCount ?? activity.sessionPolicy.questionCount));
    const eligible = this.eligibleFamilies(activity, preferences);
    if (eligible.length === 0) throw new Error("No question families match the selected curriculum and practice controls.");
    const masteryByConcept = new Map(learner.mastery.map((entry) => [entry.conceptId, entry]));
    const configurationByFamily = new Map(
      activity.generatorConfiguration.families.map((entry) => [entry.familyId, entry])
    );
    const bucketCounts = allocateMix(count, activity.sessionPolicy.adaptiveMix);
    const selected: GeneratedLearningQuestion[] = [];
    const recentConcepts = new Set(learner.recentConceptIds.slice(0, activity.sessionPolicy.avoidRecentConcepts));
    const recentInteractions = [...learner.recentInteractionKinds];

    (Object.keys(bucketCounts) as AdaptiveQuestionBucket[]).forEach((bucket) => {
      for (let index = 0; index < bucketCounts[bucket]; index += 1) {
        const family = chooseFamily(
          eligible,
          bucket,
          masteryByConcept,
          recentConcepts,
          recentInteractions,
          activity.sessionPolicy.avoidRepeatedInteractionTypes,
          `${seed}:${bucket}:${index}`,
          configurationByFamily,
          now.getTime()
        );
        const familyConfiguration = configurationByFamily.get(family.id);
        const question = this.questionEngine.generate(
          family.id,
          `${seed}:${family.id}:${bucket}:${index}`,
          levelDifficulty(family, preferences, bucket),
          familyConfiguration?.parameters
        );
        question.bucket = bucket;
        selected.push(question);
        recentConcepts.add(question.conceptId);
        recentInteractions.unshift(question.item.interaction.kind);
      }
    });

    const eligibleDomains = new Set(eligible.map((family) => family.domain));
    const eligibleAuthoredItems = activity.authoredItems.filter((item) => {
      const conceptId = String(item.metadata?.conceptId ?? "");
      const domain = String(item.metadata?.domain ?? inferDomainFromConcept(conceptId)) as LearningDomain;
      if (!eligibleDomains.has(domain)) return false;
      const curriculumLevels = item.metadata?.curriculumLevels;
      if (!preferences.level || !isRecord(curriculumLevels)) return true;
      const allowedLevels = curriculumLevels[preferences.curriculumId];
      return !Array.isArray(allowedLevels) || allowedLevels.includes(preferences.level);
    });
    const authoredCount = Math.min(
      eligibleAuthoredItems.length,
      Math.round(count * (activity.sessionPolicy.authoredItemShare ?? 0))
    );
    if (authoredCount > 0) {
      const authored = deterministicOrder(eligibleAuthoredItems, `${seed}:authored`).slice(0, authoredCount);
      authored.forEach((item, index) => {
        const target = selected.length - 1 - index;
        if (target >= 0) selected[target] = authoredQuestion(item, eligible, `${seed}:authored:${index}`);
      });
    }

    const questions = interleaveBuckets(selected, seed);
    return {
      id: `session-${stableHash(`${seed}:${count}`).toString(16)}`,
      activityId: activity.id,
      seed,
      createdAt: now.toISOString(),
      preferences,
      questions,
      bucketCounts
    };
  }

  eligibleFamilies(
    activity: LearningActivity,
    preferences: AdaptiveSessionPreferences
  ): QuestionFamilyDefinition[] {
    if (!activity.curriculumConstraints.curricula.includes(preferences.curriculumId)) return [];
    const configured = new Map(
      activity.generatorConfiguration.families
        .filter((entry) => entry.enabled)
        .map((entry) => [entry.familyId, entry])
    );
    const domains = preferences.domains?.length
      ? preferences.domains
      : activity.curriculumConstraints.domains;
    const allowedLevels = preferences.level
      ? [preferences.level]
      : activity.curriculumConstraints.levels;
    const allowedConcepts = activity.curriculumConstraints.conceptIds;
    return activity.questionFamilies
      .filter((id) => configured.has(id))
      .map((id) => this.families.resolve(id))
      .filter((family) => !domains?.length || domains.includes(family.domain))
      .filter((family) => !allowedConcepts?.length || family.conceptIds.some((id) => allowedConcepts.includes(id)))
      .filter((family) => family.curriculum.some((mapping) =>
        mapping.curriculumId === preferences.curriculumId
        && (!allowedLevels?.length || allowedLevels.includes(mapping.level))
      ));
  }
}

export class AdaptiveLearningRuntime {
  readonly sessions: AdaptiveSessionEngine;
  readonly mastery: MasteryEngine;
  readonly reviews: ReviewScheduler;

  constructor(
    activity?: Pick<LearningActivity, "masteryPolicy" | "reviewPolicy">
  ) {
    this.sessions = new AdaptiveSessionEngine();
    this.mastery = new MasteryEngine(
      activity?.masteryPolicy ?? defaultMasteryPolicy,
      activity?.reviewPolicy ?? defaultReviewPolicy
    );
    this.reviews = new ReviewScheduler();
  }

  start(
    activity: LearningActivity,
    learner: AdaptiveLearnerState,
    preferences: AdaptiveSessionPreferences,
    seed?: string,
    now?: Date
  ): AdaptiveSessionPlan {
    return this.sessions.buildSession(activity, learner, preferences, seed, now);
  }

  updateMastery(
    current: ConceptMastery | undefined,
    question: GeneratedLearningQuestion,
    result: { percentage: number; passed: boolean },
    submittedAt = new Date().toISOString()
  ): ConceptMastery {
    return this.mastery.update(current, {
      conceptId: question.conceptId,
      domain: question.domain,
      percentage: result.percentage,
      passed: result.passed,
      submittedAt
    });
  }
}

export function adaptiveSessionAsQuestionSet(
  activity: LearningActivity,
  plan: AdaptiveSessionPlan
): QuestionSet {
  return {
    format: "foxchild.music-learning.question-set",
    schemaVersion: "1.0.0",
    id: plan.id,
    revision: activity.revision,
    status: "published",
    metadata: {
      title: { "en-GB": "Recommended adaptive session" },
      description: { "en-GB": "A personalised mix of review, developing, new and challenge questions." },
      language: activity.metadata.language,
      domain: "adaptive",
      tags: ["adaptive", plan.preferences.curriculumId]
    },
    defaults: { locale: activity.metadata.language },
    delivery: { adaptiveSessionId: plan.id, seed: plan.seed, bucketCounts: plan.bucketCounts },
    sections: [{
      id: `section-${plan.id}`,
      title: { "en-GB": "Adaptive questions" },
      items: plan.questions.map((question) => question.item)
    }]
  };
}

export function createDefaultLearningActivity(id = "foxchild-adaptive-music-v2"): LearningActivity {
  const families = createDefaultQuestionFamilyRegistry().list();
  return {
    format: "foxchild.music-learning.activity",
    schemaVersion: "2.0.0",
    id,
    revision: 1,
    status: "published",
    metadata: {
      title: { "en-GB": "FoxChild Adaptive Music Learning" },
      description: { "en-GB": "Generator-driven practice across notation, theory, rhythm, aural and musicianship." },
      language: "en-GB",
      authors: ["FoxChild"],
      tags: ["adaptive", "music-learning"]
    },
    authoredItems: [],
    questionFamilies: families.map((family) => family.id),
    generatorConfiguration: {
      defaultSeed: "foxchild-adaptive-v2",
      families: families.map((family) => ({ familyId: family.id, enabled: true, weight: 1 }))
    },
    curriculumConstraints: {
      curricula: ["foxchild", "abrsm", "trinity", "gcse"],
      domains: families.map((family) => family.domain)
    },
    sessionPolicy: structuredClone(defaultSessionPolicy),
    masteryPolicy: structuredClone(defaultMasteryPolicy),
    reviewPolicy: structuredClone(defaultReviewPolicy)
  };
}

function chooseFamily(
  families: readonly QuestionFamilyDefinition[],
  bucket: AdaptiveQuestionBucket,
  masteryByConcept: Map<string, ConceptMastery>,
  recentConcepts: Set<string>,
  recentInteractions: LearningItem["interaction"]["kind"][],
  avoidInteractionRepeats: boolean,
  seed: string,
  configurationByFamily: Map<string, { weight?: number }>,
  now: number
): QuestionFamilyDefinition {
  const classified = families.filter((family) =>
    family.conceptIds.some((conceptId) => conceptBucket(masteryByConcept.get(conceptId), now) === bucket)
  );
  const pool = classified.length > 0 ? classified : families;
  const freshConcepts = pool.filter((family) => family.conceptIds.some((id) => !recentConcepts.has(id)));
  const conceptPool = freshConcepts.length > 0 ? freshConcepts : pool;
  const interactionPool = avoidInteractionRepeats && recentInteractions[0]
    ? conceptPool.filter((family) => !family.interactionKinds.includes(recentInteractions[0]))
    : conceptPool;
  return deterministicWeightedChoice(
    interactionPool.length > 0 ? interactionPool : conceptPool,
    seed,
    (family) => configurationByFamily.get(family.id)?.weight ?? 1
  );
}

function conceptBucket(mastery: ConceptMastery | undefined, now: number): AdaptiveQuestionBucket {
  if (!mastery || mastery.evidenceCount === 0) return "new";
  if (mastery.nextReviewAt && Date.parse(mastery.nextReviewAt) <= now) return "review";
  if (mastery.band === "mastered" || mastery.band === "secure") return "challenge";
  return "developing";
}

export function allocateMix(
  count: number,
  mix = defaultSessionPolicy.adaptiveMix
): Record<AdaptiveQuestionBucket, number> {
  const buckets: AdaptiveQuestionBucket[] = ["review", "developing", "new", "challenge"];
  const exact = buckets.map((bucket) => ({ bucket, value: count * mix[bucket] }));
  const result = Object.fromEntries(exact.map(({ bucket, value }) => [bucket, Math.floor(value)])) as Record<AdaptiveQuestionBucket, number>;
  let remaining = count - Object.values(result).reduce((sum, value) => sum + value, 0);
  exact
    .sort((left, right) => (right.value % 1) - (left.value % 1))
    .forEach(({ bucket }) => {
      if (remaining > 0) {
        result[bucket] += 1;
        remaining -= 1;
      }
    });
  return result;
}

function authoredQuestion(
  item: LearningItem,
  eligibleFamilies: QuestionFamilyDefinition[],
  seed: string
): GeneratedLearningQuestion {
  const metadata = item.metadata ?? {};
  const conceptId = String(metadata.conceptId ?? (Array.isArray(metadata.skillIds) ? metadata.skillIds[0] : "") ?? `authored.${item.id}`);
  const domain = String(metadata.domain ?? inferDomainFromConcept(conceptId)) as LearningDomain;
  const family = eligibleFamilies.find((candidate) => candidate.domain === domain) ?? eligibleFamilies[0];
  const instanceId = String(metadata.instanceId ?? item.id);
  const generatorParameters = metadata.generatorParameters && typeof metadata.generatorParameters === "object" && !Array.isArray(metadata.generatorParameters)
    ? metadata.generatorParameters as Record<string, unknown>
    : undefined;
  return {
    familyId: String(metadata.familyId ?? family.id),
    domain,
    seed,
    source: "authored",
    conceptId,
    variantId: String(metadata.variantId ?? `authored-${item.id}`),
    instanceId,
    canonicalId: String(metadata.canonicalId ?? canonicalQuestionId(
      String(metadata.familyId ?? family.id),
      conceptId,
      String(metadata.variantId ?? `authored-${item.id}`),
      seed,
      generatorParameters ?? {}
    )),
    curriculum: family.curriculum,
    gradeMappings: family.gradeMappings,
    generatorParameters,
    item: {
      ...structuredClone(item),
      metadata: {
        ...metadata,
        adaptive: true,
        conceptId,
        familyId: family.id,
        domain,
        instanceId,
        skillIds: [conceptId]
      }
    }
  };
}

function interleaveBuckets(
  questions: GeneratedLearningQuestion[],
  seed: string
): GeneratedLearningQuestion[] {
  return deterministicOrder(questions, `${seed}:interleave`).sort((left, right) => {
    if (left.item.interaction.kind === right.item.interaction.kind) return 0;
    return stableHash(`${seed}:${left.instanceId}`) - stableHash(`${seed}:${right.instanceId}`);
  });
}

function deterministicOrder<T>(values: readonly T[], seed: string): T[] {
  return [...values].sort((left, right) =>
    stableHash(`${seed}:${identity(left)}`) - stableHash(`${seed}:${identity(right)}`)
  );
}

function deterministicWeightedChoice<T>(
  values: readonly T[],
  seed: string,
  weightFor: (value: T) => number
): T {
  return [...values].sort((left, right) => {
    const leftUnit = (stableHash(`${seed}:${identity(left)}:weight`) + 1) / 4_294_967_297;
    const rightUnit = (stableHash(`${seed}:${identity(right)}:weight`) + 1) / 4_294_967_297;
    const leftScore = -Math.log(leftUnit) / Math.max(0.0001, weightFor(left));
    const rightScore = -Math.log(rightUnit) / Math.max(0.0001, weightFor(right));
    return leftScore - rightScore;
  })[0];
}

function identity(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return String(record.id ?? record.instanceId ?? record.familyId ?? JSON.stringify(value));
  }
  return String(value);
}

function bucketDifficulty(bucket: AdaptiveQuestionBucket): number {
  if (bucket === "challenge") return 0.9;
  if (bucket === "developing") return 0.6;
  if (bucket === "review") return 0.45;
  return 0.3;
}

function levelDifficulty(
  family: QuestionFamilyDefinition,
  preferences: AdaptiveSessionPreferences,
  bucket: AdaptiveQuestionBucket
): number {
  const configured = preferences.level
    ? family.difficultyByCurriculumLevel[preferences.curriculumId]?.[preferences.level]
    : undefined;
  if (configured === undefined) return bucketDifficulty(bucket);
  return Math.max(0.05, Math.min(0.98, configured + (bucketDifficulty(bucket) - 0.45) * 0.25));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
