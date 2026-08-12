import type { FoxChildMusicScore } from "../ast/types";
import { validateScore } from "../ast/validateScore";
import { assessResponse, createDefaultAssessmentRegistry } from "./assessment";
import { createDefaultMusicGeneratorRegistry } from "./generators";
import type {
  AssessmentResult,
  LearningAsset,
  LearningAttempt,
  LearningItem,
  MusicQuestionGenerator,
  QuestionSet,
  ResolvedLearningItem,
  ResolvedStimulus,
  SkillMastery,
  VariableDefinition
} from "./types";
import type { AssessmentStrategyRegistry, MusicGeneratorRegistry } from "./registries";

export interface ScoreResolverAdapters {
  resolveAsset?: (asset: LearningAsset) => Promise<FoxChildMusicScore>;
  resolveScoreReference?: (scoreId: string, source: Record<string, unknown>) => Promise<FoxChildMusicScore>;
}

export interface LearningRuntimeOptions extends ScoreResolverAdapters {
  assessmentRegistry?: AssessmentStrategyRegistry;
  generatorRegistry?: MusicGeneratorRegistry;
}

export class LearningRuntime {
  readonly assessments: AssessmentStrategyRegistry;
  readonly generators: MusicGeneratorRegistry;

  constructor(private readonly options: LearningRuntimeOptions = {}) {
    this.assessments = options.assessmentRegistry ?? createDefaultAssessmentRegistry();
    this.generators = options.generatorRegistry ?? createDefaultMusicGeneratorRegistry();
  }

  async resolveItem(
    set: QuestionSet,
    item: LearningItem,
    attemptSeed = `${set.id}:${set.revision}:${item.id}`
  ): Promise<ResolvedLearningItem> {
    const resolvedVariables = resolveVariables(
      { ...(set.variables ?? {}), ...(item.variables ?? {}) },
      attemptSeed
    );
    const resolvedStimuli: ResolvedStimulus[] = [];
    for (const stimulus of item.stimulus) {
      const resolved = { ...stimulus } as ResolvedStimulus;
      if (stimulus.kind === "notation" && isRecord(stimulus.source)) {
        resolved.resolvedScore = await this.resolveScore(set, stimulus.source, resolvedVariables);
      }
      resolvedStimuli.push(resolved);
    }
    return { ...item, resolvedVariables, resolvedStimuli };
  }

  assess(
    item: ResolvedLearningItem,
    value: unknown,
    attemptNumber = 1
  ): AssessmentResult {
    return assessResponse(this.assessments, value, {
      response: item.response,
      declaration: item.assessment,
      resolvedItem: item,
      attemptNumber
    });
  }

  private async resolveScore(
    set: QuestionSet,
    source: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Promise<FoxChildMusicScore> {
    let score: FoxChildMusicScore;
    if (source.mode === "inline-ast") {
      score = structuredClone(source.score) as FoxChildMusicScore;
    } else if (source.mode === "generator") {
      const generator = this.generators.resolve(String(source.generatorId));
      score = generator.generate(
        String(source.seed),
        resolveVariableReferences(isRecord(source.parameters) ? source.parameters : {}, variables)
      );
    } else if (source.mode === "asset") {
      const asset = (set.assets ?? []).find((entry) => entry.id === source.assetId);
      if (!asset) throw new Error(`Unknown learning asset "${String(source.assetId)}".`);
      if (!this.options.resolveAsset) throw new Error(`No asset resolver is configured for "${asset.id}".`);
      score = await this.options.resolveAsset(asset);
    } else if (source.mode === "score-reference") {
      if (!this.options.resolveScoreReference) throw new Error(`No score-reference resolver is configured for "${String(source.scoreId)}".`);
      score = await this.options.resolveScoreReference(String(source.scoreId), source);
    } else {
      throw new Error(`Unsupported notation source mode "${String(source.mode)}".`);
    }
    const validation = validateScore(score);
    if (!validation.valid) {
      throw new Error(`Resolved learning score is invalid: ${validation.errors.join(" ")}`);
    }
    return score;
  }
}

export function selectDeliveryItems(
  set: QuestionSet,
  seed: string
): LearningItem[] {
  const allItems = set.sections.flatMap((section) => section.items);
  const selection = isRecord(set.delivery?.questionSelection) ? set.delivery?.questionSelection : {};
  const count = Math.min(allItems.length, Math.max(0, Number(selection.count ?? allItems.length)));
  if (selection.mode !== "random-without-replacement") return allItems.slice(0, count);
  return deterministicShuffle(allItems, seed).slice(0, count);
}

export function deterministicShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function localisedText(map: unknown, locale = "en-GB"): string {
  if (typeof map === "string") return map;
  if (!isRecord(map)) return "";
  const exact = map[locale];
  if (typeof exact === "string") return exact;
  const language = locale.split("-")[0];
  const languageMatch = Object.entries(map).find(([key, value]) => key.split("-")[0] === language && typeof value === "string");
  if (languageMatch) return String(languageMatch[1]);
  return String(Object.values(map).find((value) => typeof value === "string") ?? "");
}

export function startAttempt(
  set: QuestionSet,
  item: ResolvedLearningItem,
  options: { attemptId?: string; learnerId?: string; now?: string } = {}
): LearningAttempt {
  const now = options.now ?? new Date().toISOString();
  return {
    format: "foxchild.music-learning.attempt",
    schemaVersion: "1.0.0",
    attemptId: options.attemptId ?? createAttemptId(set.id, item.id),
    questionSetId: set.id,
    questionSetRevision: set.revision,
    itemId: item.id,
    learnerId: options.learnerId,
    startedAt: now,
    resolvedVariables: item.resolvedVariables,
    resolvedSeed: item.resolvedStimuli
      .map((stimulus) => {
        const source = stimulus.source as Record<string, unknown> | undefined;
        return isRecord(source) ? source.seed : undefined;
      })
      .find((seed): seed is string => typeof seed === "string"),
    responses: [],
    telemetry: { replayCount: 0, hintIdsUsed: [] }
  };
}

export function submitAttempt(
  attempt: LearningAttempt,
  item: ResolvedLearningItem,
  value: unknown,
  runtime: LearningRuntime,
  options: { now?: string; inputSource?: string; attemptNumber?: number } = {}
): LearningAttempt {
  const now = options.now ?? new Date().toISOString();
  const result = runtime.assess(item, value, options.attemptNumber ?? 1);
  const skillIds = Array.isArray(item.metadata?.skillIds)
    ? item.metadata.skillIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    ...attempt,
    submittedAt: now,
    responses: [...attempt.responses, { responseId: item.response.id, value, capturedAt: now }],
    result: {
      ...result,
      masteryEvidence: skillIds.map((skillId) => ({
        skillId,
        evidence: result.percentage / 100,
        weight: 1
      }))
    },
    telemetry: {
      ...attempt.telemetry,
      responseTimeMs: Math.max(0, Date.parse(now) - Date.parse(attempt.startedAt)),
      inputSource: options.inputSource
    }
  };
}

export function updateMastery(
  current: SkillMastery[],
  attempt: LearningAttempt,
  now = new Date().toISOString()
): SkillMastery[] {
  const evidence = attempt.result?.masteryEvidence ?? [];
  const bySkill = new Map(current.map((entry) => [entry.skillId, entry]));
  evidence.forEach((entry) => {
    const previous = bySkill.get(entry.skillId);
    const priorCount = previous?.evidenceCount ?? 0;
    const nextCount = priorCount + entry.weight;
    const nextMastery = ((previous?.mastery ?? 0) * priorCount + entry.evidence * entry.weight) / nextCount;
    bySkill.set(entry.skillId, {
      skillId: entry.skillId,
      evidenceCount: nextCount,
      mastery: nextMastery,
      updatedAt: now
    });
  });
  return [...bySkill.values()].sort((left, right) => left.skillId.localeCompare(right.skillId));
}

export interface AttemptStore {
  load(): LearningAttempt[];
  save(attempt: LearningAttempt): void;
}

export function createBrowserAttemptStore(storageKey = "foxchild-learning-attempts-v1"): AttemptStore {
  return {
    load() {
      if (typeof window === "undefined") return [];
      try {
        const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
        return Array.isArray(value) ? value as LearningAttempt[] : [];
      } catch {
        return [];
      }
    },
    save(attempt) {
      if (typeof window === "undefined") return;
      const attempts = this.load().filter((entry) => entry.attemptId !== attempt.attemptId);
      window.localStorage.setItem(storageKey, JSON.stringify([...attempts, attempt]));
    }
  };
}

export function migrateQuestionSet(value: unknown): QuestionSet {
  if (!isRecord(value)) throw new Error("Question set migration input must be an object.");
  if (value.schemaVersion === "1.0.0") return structuredClone(value) as unknown as QuestionSet;
  throw new Error(`Unsupported question-set schema version "${String(value.schemaVersion)}"; no silent migration was applied.`);
}

export function registerGenerator(registry: MusicGeneratorRegistry, generator: MusicQuestionGenerator): void {
  registry.register(generator);
}

function resolveVariables(definitions: Record<string, VariableDefinition>, seed: string): Record<string, unknown> {
  const random = createSeededRandom(seed);
  return Object.fromEntries(Object.entries(definitions).map(([key, definition]) => {
    if (definition.value !== undefined || definition.selection === "fixed") return [key, definition.value];
    if (definition.type === "enum" && Array.isArray(definition.values) && definition.values.length > 0) {
      return [key, definition.values[Math.floor(random() * definition.values.length)]];
    }
    if (definition.type === "boolean") return [key, random() >= 0.5];
    if (definition.type === "number" || definition.type === "integer") {
      const minimum = Number(definition.minimum ?? 0);
      const maximum = Number(definition.maximum ?? minimum + 100);
      const value = minimum + random() * (maximum - minimum);
      return [key, definition.type === "integer" ? Math.round(value) : value];
    }
    return [key, definition.value ?? ""];
  }));
}

function resolveVariableReferences(
  value: Record<string, unknown>,
  variables: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (isRecord(item) && typeof item.$var === "string" && Object.keys(item).length === 1) {
      if (!(item.$var in variables)) throw new Error(`Unknown learning variable "${item.$var}".`);
      return [key, variables[item.$var]];
    }
    if (Array.isArray(item)) {
      return [key, item.map((entry) => isRecord(entry) ? resolveVariableReferences(entry, variables) : entry)];
    }
    return [key, isRecord(item) ? resolveVariableReferences(item, variables) : item];
  }));
}

function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function createAttemptId(setId: string, itemId: string): string {
  const cryptoApi = typeof globalThis.crypto === "object" ? globalThis.crypto : undefined;
  const suffix = cryptoApi && "randomUUID" in cryptoApi
    ? cryptoApi.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `attempt-${setId}-${itemId}-${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
