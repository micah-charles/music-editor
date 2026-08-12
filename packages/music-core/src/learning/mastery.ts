import type {
  AdaptiveLearnerState,
  ConceptMastery,
  CoverageEntry,
  LearningDomain,
  MasteryBand,
  MasteryPolicy,
  QuestionFamilyDefinition,
  ReviewPolicy
} from "./adaptiveTypes";
import { defaultMasteryPolicy, defaultReviewPolicy } from "./adaptiveTypes";
import type { LearningAttempt } from "./types";

export interface MasteryUpdateEvidence {
  conceptId: string;
  domain: LearningDomain;
  percentage: number;
  passed: boolean;
  submittedAt: string;
  errorCode?: string;
}

export class MasteryEngine {
  constructor(
    readonly masteryPolicy: MasteryPolicy = defaultMasteryPolicy,
    readonly reviewPolicy: ReviewPolicy = defaultReviewPolicy
  ) {}

  update(current: ConceptMastery | undefined, evidence: MasteryUpdateEvidence): ConceptMastery {
    const prior = current ?? emptyConceptMastery(evidence.conceptId, evidence.domain);
    const result = Math.min(1, Math.max(0, evidence.percentage / 100));
    const mastery = evidence.passed
      ? prior.mastery + (1 - prior.mastery) * this.masteryPolicy.learningRate * result
      : prior.mastery * (1 - this.masteryPolicy.incorrectPenalty);
    const evidenceCount = prior.evidenceCount + 1;
    const correctStreak = evidence.passed ? prior.correctStreak + 1 : 0;
    const intervalHours = evidence.passed
      ? prior.intervalHours > 0
        ? Math.min(
          this.reviewPolicy.maximumIntervalDays * 24,
          prior.intervalHours * this.reviewPolicy.correctIntervalMultiplier
        )
        : this.reviewPolicy.initialIntervalHours
      : this.reviewPolicy.incorrectIntervalHours;
    return {
      ...prior,
      mastery,
      band: masteryBand(mastery, evidenceCount, this.masteryPolicy),
      evidenceCount,
      correctStreak,
      incorrectCount: prior.incorrectCount + (evidence.passed ? 0 : 1),
      lastSeenAt: evidence.submittedAt,
      nextReviewAt: new Date(Date.parse(evidence.submittedAt) + intervalHours * 3_600_000).toISOString(),
      intervalHours,
      commonError: evidence.passed ? prior.commonError : evidence.errorCode ?? prior.commonError ?? "incorrect-response"
    };
  }

  rebuild(
    attempts: readonly LearningAttempt[],
    domainForConcept: (conceptId: string) => LearningDomain
  ): ConceptMastery[] {
    const byConcept = new Map<string, ConceptMastery>();
    attempts
      .filter((attempt) => attempt.submittedAt && attempt.result)
      .sort((left, right) => String(left.submittedAt).localeCompare(String(right.submittedAt)))
      .forEach((attempt) => {
        const evidence = attempt.result?.masteryEvidence ?? [];
        evidence.forEach((entry) => {
          const current = byConcept.get(entry.skillId);
          byConcept.set(entry.skillId, this.update(current, {
            conceptId: entry.skillId,
            domain: domainForConcept(entry.skillId),
            percentage: entry.evidence * 100,
            passed: Boolean(attempt.result?.passed),
            submittedAt: String(attempt.submittedAt),
            errorCode: attempt.result?.passed ? undefined : String(attempt.result?.feedbackIds?.[0] ?? "incorrect-response")
          }));
        });
      });
    return [...byConcept.values()].sort((left, right) => left.conceptId.localeCompare(right.conceptId));
  }
}

export class ReviewScheduler {
  due(mastery: readonly ConceptMastery[], now = new Date()): ConceptMastery[] {
    const timestamp = now.getTime();
    return mastery
      .filter((concept) => concept.nextReviewAt && Date.parse(concept.nextReviewAt) <= timestamp)
      .sort((left, right) => String(left.nextReviewAt).localeCompare(String(right.nextReviewAt)));
  }

  next(mastery: readonly ConceptMastery[]): ConceptMastery | undefined {
    return mastery
      .filter((concept) => concept.nextReviewAt)
      .sort((left, right) => String(left.nextReviewAt).localeCompare(String(right.nextReviewAt)))[0];
  }
}

export function createLearnerState(
  attempts: readonly LearningAttempt[],
  domainForConcept: (conceptId: string) => LearningDomain,
  masteryPolicy = defaultMasteryPolicy,
  reviewPolicy = defaultReviewPolicy
): AdaptiveLearnerState {
  const mastery = new MasteryEngine(masteryPolicy, reviewPolicy).rebuild(attempts, domainForConcept);
  const recentAttempts = attempts
    .filter((attempt) => attempt.submittedAt)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)));
  return {
    mastery,
    recentConceptIds: recentAttempts.flatMap((attempt) =>
      attempt.result?.masteryEvidence.map((entry) => entry.skillId) ?? []
    ).slice(0, 12),
    recentInteractionKinds: [],
    sessionHistory: []
  };
}

export function coverageMap(
  families: readonly QuestionFamilyDefinition[],
  mastery: readonly ConceptMastery[]
): CoverageEntry[] {
  const masteryByConcept = new Map(mastery.map((entry) => [entry.conceptId, entry]));
  const domains = [...new Set(families.map((family) => family.domain))];
  return domains.map((domain) => {
    const domainFamilies = families.filter((family) => family.domain === domain);
    const conceptIds = [...new Set(domainFamilies.flatMap((family) => family.conceptIds))];
    const conceptMastery = conceptIds.map((conceptId) => masteryByConcept.get(conceptId)?.mastery ?? 0);
    return {
      domain,
      familyCount: domainFamilies.length,
      conceptCount: conceptIds.length,
      coveredConcepts: conceptIds.filter((conceptId) => (masteryByConcept.get(conceptId)?.evidenceCount ?? 0) > 0).length,
      mastery: conceptMastery.length === 0
        ? 0
        : conceptMastery.reduce((sum, value) => sum + value, 0) / conceptMastery.length
    };
  });
}

export function commonMistakes(mastery: readonly ConceptMastery[], limit = 5): ConceptMastery[] {
  return [...mastery]
    .filter((entry) => entry.incorrectCount > 0)
    .sort((left, right) =>
      right.incorrectCount - left.incorrectCount
      || left.mastery - right.mastery
    )
    .slice(0, limit);
}

export function masteryBand(
  mastery: number,
  evidenceCount: number,
  policy: MasteryPolicy = defaultMasteryPolicy
): MasteryBand {
  if (evidenceCount === 0) return "new";
  if (mastery >= policy.masteredThreshold && evidenceCount >= policy.minimumEvidenceForMastery) return "mastered";
  if (mastery >= policy.secureThreshold) return "secure";
  return "developing";
}

export function emptyConceptMastery(conceptId: string, domain: LearningDomain): ConceptMastery {
  return {
    conceptId,
    domain,
    mastery: 0,
    band: "new",
    evidenceCount: 0,
    correctStreak: 0,
    incorrectCount: 0,
    intervalHours: 0
  };
}

export function inferDomainFromConcept(conceptId: string): LearningDomain {
  const domain = conceptId.split(".")[0] as LearningDomain;
  const domains = new Set<LearningDomain>([
    "note-reading", "key-signatures", "music-symbols", "note-values",
    "time-signatures", "intervals", "chords", "scales", "rhythm", "tempo",
    "ear-training", "sight-reading", "melody-dictation", "error-detection"
  ]);
  return domains.has(domain) ? domain : "note-reading";
}
