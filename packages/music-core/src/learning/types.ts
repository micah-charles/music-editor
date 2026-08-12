import type { FoxChildMusicScore, Pitch } from "../ast/types";

export type LocaleMap = Record<string, string>;
export type ContentStatus = "draft" | "review" | "published" | "retired";
export type ItemType =
  | "selected-response" | "text-entry" | "numeric-entry" | "matching" | "ordering"
  | "drag-drop" | "hotspot" | "keyboard-input" | "midi-input" | "notation-entry"
  | "rhythm-tapping" | "audio-recording" | "sight-reading" | "score-correction"
  | "composition" | "composite";
export type StimulusKind =
  | "text" | "rich-text" | "notation" | "audio" | "image" | "video"
  | "music-symbol" | "piano-keyboard" | "metronome" | "mixed";
export type InteractionKind =
  | "choice" | "text-entry" | "numeric-entry" | "matching" | "ordering"
  | "drag-drop" | "score-drag-drop" | "hotspot" | "music-keyboard"
  | "notation-entry" | "rhythm-tap" | "audio-recording" | "sight-reading"
  | "composition" | "composite";
export type ResponseBaseType =
  | "identifier" | "identifier-set" | "string" | "number" | "boolean" | "pitch"
  | "pitch-set" | "pitch-sequence" | "rhythm" | "score-ast" | "score-patch"
  | "midi-performance" | "audio-recording" | "mapping" | "ordering";

export interface QuestionSetMetadata {
  title: LocaleMap;
  description?: LocaleMap;
  language: string;
  authors?: string[];
  subject?: string;
  domain?: string;
  skillIds?: string[];
  difficulty?: number | Record<string, unknown>;
  tags?: string[];
  accessibility?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LearningAsset {
  id: string;
  kind: "image" | "audio" | "video" | "midi" | "musicxml" | "score-ast" | "symbol" | "font-resource" | "data";
  uri: string;
  mimeType?: string;
  sha256?: string;
  metadata?: Record<string, unknown>;
}

export type LearningScoreSource =
  | { mode: "inline-ast"; score: FoxChildMusicScore }
  | { mode: "asset"; assetId: string; importOptions?: Record<string, unknown> }
  | { mode: "score-reference"; scoreId: string; range?: Record<string, unknown>; partIds?: string[] }
  | { mode: "generator"; generatorId: string; seed: string; parameters?: Record<string, unknown> };

export interface LearningStimulus {
  id: string;
  kind: StimulusKind;
  visibility?: "visible" | "hidden";
  content?: unknown;
  format?: string;
  source?: LearningScoreSource | Record<string, unknown>;
  presentation?: Record<string, unknown>;
  playback?: Record<string, unknown>;
  accessibility?: Record<string, unknown>;
}

export interface InteractionOption {
  id: string;
  content: unknown;
}

export interface LearningInteraction {
  kind: InteractionKind;
  responseId: string;
  cardinality?: "single" | "multiple" | "ordered" | "record";
  options?: InteractionOption[];
  [key: string]: unknown;
}

export interface ResponseDeclaration {
  id: string;
  baseType: ResponseBaseType;
  cardinality?: "single" | "multiple" | "ordered" | "record";
  correct?: { value?: unknown; source?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

export interface AssessmentDeclaration {
  strategy: AssessmentStrategyId | string;
  maximumScore: number;
  passingScore?: number;
  parameters?: Record<string, unknown>;
  attemptPolicy?: {
    maximumAttempts?: number;
    scorePolicy?: "best" | "latest" | "first";
    penaltyPerIncorrectAttempt?: number;
  };
}

export interface LearningItem {
  id: string;
  type: ItemType;
  version: number;
  metadata?: Record<string, unknown>;
  variables?: Record<string, VariableDefinition>;
  stimulus: LearningStimulus[];
  prompt: {
    content: LocaleMap;
    format?: "plain-text" | "markdown" | "sanitised-html";
    ariaLabel?: LocaleMap;
  };
  interaction: LearningInteraction;
  response: ResponseDeclaration;
  assessment: AssessmentDeclaration;
  feedback?: Record<string, unknown>;
  hints?: Array<{ id?: string; content?: LocaleMap; cost?: number; [key: string]: unknown }>;
  explanation?: { content?: LocaleMap; [key: string]: unknown };
  delivery?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
}

export interface LearningSection {
  id: string;
  title?: LocaleMap;
  delivery?: Record<string, unknown>;
  items: LearningItem[];
}

export interface QuestionSet {
  format: "foxchild.music-learning.question-set";
  schemaVersion: "1.0.0";
  id: string;
  revision: number;
  status: ContentStatus;
  metadata: QuestionSetMetadata;
  defaults?: Record<string, unknown>;
  assets?: LearningAsset[];
  variables?: Record<string, VariableDefinition>;
  delivery?: Record<string, unknown>;
  sections: LearningSection[];
}

export interface VariableDefinition {
  type: "enum" | "number" | "integer" | "boolean" | "string";
  values?: unknown[];
  minimum?: number;
  maximum?: number;
  selection?: "random" | "sequential" | "fixed";
  value?: unknown;
  seedScope?: "set" | "section" | "item" | "attempt";
}

export interface ContentDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  path: string;
  message: string;
  suggestion?: string;
}

export interface ResolvedStimulus extends LearningStimulus {
  resolvedScore?: FoxChildMusicScore;
}

export interface ResolvedLearningItem extends LearningItem {
  resolvedVariables: Record<string, unknown>;
  resolvedStimuli: ResolvedStimulus[];
}

export interface MidiPerformanceEvent {
  midi: number;
  onsetMs: number;
  durationMs?: number;
  velocity?: number;
}

export interface RhythmEvent {
  onset: string | number;
  duration?: string | number;
}

export interface AssessmentContext {
  response: ResponseDeclaration;
  declaration: AssessmentDeclaration;
  resolvedItem?: ResolvedLearningItem;
  attemptNumber?: number;
}

export interface AssessmentResult {
  score: number;
  maximumScore: number;
  percentage: number;
  passed: boolean;
  dimensions: Record<string, number | string | boolean>;
  feedbackIds: string[];
  details?: Record<string, unknown>;
}

export type AssessmentStrategyId =
  | "exact-identifier@1" | "identifier-set@1" | "normalised-text@1"
  | "numeric-tolerance@1" | "pitch-match@1" | "pitch-set-match@1"
  | "pitch-sequence-match@1" | "rhythm-alignment@1" | "score-semantic-diff@1"
  | "midi-performance@1" | "sight-reading@1" | "rubric@1"
  | "composite-weighted@1";

export interface AssessmentStrategy {
  id: string;
  assess(value: unknown, context: AssessmentContext): AssessmentResult;
}

export interface MusicQuestionGenerator {
  id: string;
  generate(seed: string, parameters: Record<string, unknown>): FoxChildMusicScore;
}

export interface AttemptResponse {
  responseId: string;
  value: unknown;
  capturedAt: string;
}

export interface LearningAttempt {
  format: "foxchild.music-learning.attempt";
  schemaVersion: "1.0.0";
  attemptId: string;
  questionSetId: string;
  questionSetRevision: number;
  itemId: string;
  learnerId?: string;
  startedAt: string;
  submittedAt?: string;
  resolvedVariables: Record<string, unknown>;
  resolvedSeed?: string;
  responses: AttemptResponse[];
  result?: AssessmentResult & {
    masteryEvidence: Array<{ skillId: string; evidence: number; weight: number }>;
  };
  telemetry: {
    responseTimeMs?: number;
    replayCount: number;
    hintIdsUsed: string[];
    inputSource?: string;
  };
}

export interface SkillMastery {
  skillId: string;
  evidenceCount: number;
  mastery: number;
  updatedAt: string;
}

export type PitchAnswer = Pitch | { written?: Pitch; midi?: number } | number | string;
