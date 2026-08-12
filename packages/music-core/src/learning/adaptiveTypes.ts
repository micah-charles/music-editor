import type { LearningItem, LocaleMap, ContentStatus } from "./types";

export type LearningDomain =
  | "note-reading"
  | "key-signatures"
  | "music-symbols"
  | "note-values"
  | "time-signatures"
  | "intervals"
  | "chords"
  | "scales"
  | "rhythm"
  | "tempo"
  | "ear-training"
  | "sight-reading"
  | "melody-dictation"
  | "error-detection";

export type CurriculumId = "foxchild" | "abrsm" | "trinity" | "gcse";
export type MasteryBand = "new" | "developing" | "secure" | "mastered";
export type AdaptiveQuestionBucket = "review" | "developing" | "new" | "challenge";

export interface CurriculumMapping {
  curriculumId: CurriculumId;
  level: string;
  strand: string;
  objectiveIds: string[];
}

export interface ParameterDefinition {
  type: "enum" | "integer" | "number" | "boolean";
  values?: Array<string | number | boolean>;
  minimum?: number;
  maximum?: number;
}

export interface QuestionIdentity {
  conceptId: string;
  variantId: string;
  instanceId: string;
  canonicalId: string;
}

export interface GeneratedLearningQuestion extends QuestionIdentity {
  familyId: string;
  domain: LearningDomain;
  seed: string;
  source: "generated" | "authored";
  bucket?: AdaptiveQuestionBucket;
  curriculum: CurriculumMapping[];
  gradeMappings: Partial<Record<CurriculumId, string[]>>;
  generatorParameters?: Record<string, unknown>;
  item: LearningItem;
}

export interface QuestionFamilyDefinition {
  id: string;
  version: 1;
  title: string;
  domain: LearningDomain;
  conceptIds: string[];
  variantIds: string[];
  interactionKinds: LearningItem["interaction"]["kind"][];
  parameterSpace: Record<string, ParameterDefinition>;
  generatorId: string;
  distractorStrategyId: string;
  curriculum: CurriculumMapping[];
  gradeMappings: Partial<Record<CurriculumId, string[]>>;
  difficultyByCurriculumLevel: Partial<Record<CurriculumId, Record<string, number>>>;
}

export interface GeneratorConfiguration {
  defaultSeed: string;
  families: Array<{
    familyId: string;
    enabled: boolean;
    weight?: number;
    parameters?: Record<string, unknown>;
  }>;
}

export interface CurriculumConstraints {
  curricula: CurriculumId[];
  levels?: string[];
  domains?: LearningDomain[];
  conceptIds?: string[];
}

export interface AdaptiveMix {
  review: number;
  developing: number;
  new: number;
  challenge: number;
}

export interface SessionPolicy {
  questionCount: number;
  adaptiveMix: AdaptiveMix;
  avoidRecentConcepts: number;
  avoidRepeatedInteractionTypes: boolean;
  authoredItemShare?: number;
}

export interface MasteryPolicy {
  learningRate: number;
  incorrectPenalty: number;
  secureThreshold: number;
  masteredThreshold: number;
  minimumEvidenceForMastery: number;
}

export interface ReviewPolicy {
  initialIntervalHours: number;
  correctIntervalMultiplier: number;
  incorrectIntervalHours: number;
  maximumIntervalDays: number;
}

export interface LearningActivity {
  format: "foxchild.music-learning.activity";
  schemaVersion: "2.0.0";
  id: string;
  revision: number;
  status: ContentStatus;
  metadata: {
    title: LocaleMap;
    description?: LocaleMap;
    language: string;
    authors?: string[];
    tags?: string[];
  };
  authoredItems: LearningItem[];
  questionFamilies: string[];
  generatorConfiguration: GeneratorConfiguration;
  curriculumConstraints: CurriculumConstraints;
  sessionPolicy: SessionPolicy;
  masteryPolicy: MasteryPolicy;
  reviewPolicy: ReviewPolicy;
}

export interface ConceptMastery {
  conceptId: string;
  domain: LearningDomain;
  mastery: number;
  band: MasteryBand;
  evidenceCount: number;
  correctStreak: number;
  incorrectCount: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  intervalHours: number;
  commonError?: string;
}

export interface AdaptiveLearnerState {
  learnerId?: string;
  mastery: ConceptMastery[];
  recentConceptIds: string[];
  recentInteractionKinds: LearningItem["interaction"]["kind"][];
  sessionHistory: AdaptiveSessionSummary[];
}

export interface AdaptiveSessionPreferences {
  curriculumId: CurriculumId;
  level?: string;
  domains?: LearningDomain[];
  questionCount?: number;
  mode?: "learn" | "practise" | "test";
}

export interface AdaptiveSessionPlan {
  id: string;
  activityId: string;
  seed: string;
  createdAt: string;
  preferences: AdaptiveSessionPreferences;
  questions: GeneratedLearningQuestion[];
  bucketCounts: Record<AdaptiveQuestionBucket, number>;
}

export interface AdaptiveSessionSummary {
  sessionId: string;
  activityId: string;
  startedAt: string;
  completedAt?: string;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  masteryDelta: number;
}

export interface CoverageEntry {
  domain: LearningDomain;
  familyCount: number;
  conceptCount: number;
  coveredConcepts: number;
  mastery: number;
}

export const defaultAdaptiveMix: AdaptiveMix = {
  review: 0.4,
  developing: 0.3,
  new: 0.2,
  challenge: 0.1
};

export const defaultSessionPolicy: SessionPolicy = {
  questionCount: 10,
  adaptiveMix: defaultAdaptiveMix,
  avoidRecentConcepts: 4,
  avoidRepeatedInteractionTypes: true,
  authoredItemShare: 0.2
};

export const defaultMasteryPolicy: MasteryPolicy = {
  learningRate: 0.28,
  incorrectPenalty: 0.18,
  secureThreshold: 0.7,
  masteredThreshold: 0.9,
  minimumEvidenceForMastery: 3
};

export const defaultReviewPolicy: ReviewPolicy = {
  initialIntervalHours: 12,
  correctIntervalMultiplier: 2.2,
  incorrectIntervalHours: 4,
  maximumIntervalDays: 60
};
