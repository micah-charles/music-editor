import { validateScore } from "../ast/validateScore";
import {
  createDefaultInteractionRegistry,
  createDefaultStimulusRegistry,
  type AssessmentStrategyRegistry,
  type MusicGeneratorRegistry
} from "./registries";
import type {
  ContentDiagnostic,
  LearningItem,
  QuestionSet,
  ResponseBaseType
} from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const SAFE_ASSET_SCHEMES = /^(?:\.{0,2}\/|\/(?!\/)|https?:\/\/)/i;

export interface LearningValidationOptions {
  assessmentRegistry?: AssessmentStrategyRegistry;
  generatorRegistry?: MusicGeneratorRegistry;
  knownSkillIds?: Set<string>;
}

export interface LearningValidationResult {
  valid: boolean;
  diagnostics: ContentDiagnostic[];
}

export function loadQuestionSet(
  input: string | unknown,
  options: LearningValidationOptions = {}
): { questionSet?: QuestionSet; diagnostics: ContentDiagnostic[] } {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (error) {
      return {
        diagnostics: [{
          severity: "error",
          code: "json.syntax",
          path: "$",
          message: `Invalid JSON: ${(error as Error).message}`
        }]
      };
    }
  }
  const result = validateQuestionSet(value, options);
  return {
    questionSet: result.valid ? value as QuestionSet : undefined,
    diagnostics: result.diagnostics
  };
}

export function validateQuestionSet(
  value: unknown,
  options: LearningValidationOptions = {}
): LearningValidationResult {
  const diagnostics: ContentDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalid("schema.type", "$", "Question set must be an object.");
  }

  requiredConstant(value, "format", "foxchild.music-learning.question-set", diagnostics);
  requiredConstant(value, "schemaVersion", "1.0.0", diagnostics);
  checkId(value.id, "$.id", diagnostics);
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) {
    error(diagnostics, "schema.revision", "$.revision", "revision must be an integer of at least 1.");
  }
  if (!["draft", "review", "published", "retired"].includes(String(value.status))) {
    error(diagnostics, "schema.status", "$.status", "status must be draft, review, published, or retired.");
  }
  validateMetadata(value.metadata, "$.metadata", diagnostics);
  validateAssets(value.assets, diagnostics);

  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    error(diagnostics, "schema.sections", "$.sections", "sections must contain at least one section.");
  } else {
    const stableIds = new Set<string>();
    addUniqueId(value.id, "$.id", stableIds, diagnostics);
    value.sections.forEach((section, sectionIndex) => {
      const path = `$.sections[${sectionIndex}]`;
      if (!isRecord(section)) {
        error(diagnostics, "schema.section", path, "Section must be an object.");
        return;
      }
      checkId(section.id, `${path}.id`, diagnostics);
      addUniqueId(section.id, `${path}.id`, stableIds, diagnostics);
      if (!Array.isArray(section.items) || section.items.length === 0) {
        error(diagnostics, "schema.items", `${path}.items`, "Section must contain at least one item.");
        return;
      }
      section.items.forEach((item, itemIndex) => {
        validateItem(item, `${path}.items[${itemIndex}]`, stableIds, diagnostics, options);
      });
    });
  }

  return {
    valid: !diagnostics.some((item) => item.severity === "error"),
    diagnostics
  };
}

function validateItem(
  value: unknown,
  path: string,
  stableIds: Set<string>,
  diagnostics: ContentDiagnostic[],
  options: LearningValidationOptions
): void {
  if (!isRecord(value)) {
    error(diagnostics, "schema.item", path, "Item must be an object.");
    return;
  }
  checkId(value.id, `${path}.id`, diagnostics);
  addUniqueId(value.id, `${path}.id`, stableIds, diagnostics);
  if (typeof value.type !== "string") error(diagnostics, "schema.item-type", `${path}.type`, "Item type is required.");
  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    error(diagnostics, "schema.item-version", `${path}.version`, "Item version must be an integer of at least 1.");
  }
  if (!Array.isArray(value.stimulus)) {
    error(diagnostics, "schema.stimulus", `${path}.stimulus`, "stimulus must be an array.");
  } else {
    value.stimulus.forEach((stimulus, index) =>
      validateStimulus(stimulus, `${path}.stimulus[${index}]`, stableIds, diagnostics, options)
    );
  }
  if (!isRecord(value.prompt) || !isLocaleMap(value.prompt.content)) {
    error(diagnostics, "schema.prompt", `${path}.prompt.content`, "Prompt content must be a non-empty locale map.");
  }
  if (!isRecord(value.interaction)) {
    error(diagnostics, "schema.interaction", `${path}.interaction`, "Interaction is required.");
    return;
  }
  if (!isRecord(value.response)) {
    error(diagnostics, "schema.response", `${path}.response`, "Response declaration is required.");
    return;
  }
  if (!isRecord(value.assessment)) {
    error(diagnostics, "schema.assessment", `${path}.assessment`, "Assessment declaration is required.");
    return;
  }

  const item = value as unknown as LearningItem;
  if (item.interaction.responseId !== item.response.id) {
    error(diagnostics, "reference.response-id", `${path}.interaction.responseId`, "Interaction responseId must match response.id.");
  }
  checkId(item.response.id, `${path}.response.id`, diagnostics);

  const interactions = createDefaultInteractionRegistry();
  if (!interactions.has(item.interaction.kind)) {
    error(diagnostics, "unsupported.interaction", `${path}.interaction.kind`, `Unsupported interaction kind "${item.interaction.kind}".`);
  } else {
    const allowed = interactions.resolve(item.interaction.kind).responseBaseTypes ?? [];
    if (!allowed.includes(item.response.baseType)) {
      error(
        diagnostics,
        "compatibility.interaction-response",
        `${path}.response.baseType`,
        `${item.interaction.kind} is incompatible with response base type ${item.response.baseType}.`,
        `Use one of: ${allowed.join(", ")}.`
      );
    }
  }

  if (item.interaction.kind === "choice") validateChoice(item, path, diagnostics);
  if (!Number.isFinite(item.assessment.maximumScore) || item.assessment.maximumScore < 0) {
    error(diagnostics, "schema.maximum-score", `${path}.assessment.maximumScore`, "maximumScore must be zero or greater.");
  }
  if (!/^[A-Za-z0-9._-]+@[0-9]+$/.test(item.assessment.strategy)) {
    error(diagnostics, "schema.strategy", `${path}.assessment.strategy`, "Assessment strategy must include a numeric version, for example exact-identifier@1.");
  } else if (options.assessmentRegistry && !options.assessmentRegistry.has(item.assessment.strategy)) {
    error(diagnostics, "unsupported.assessment", `${path}.assessment.strategy`, `Unsupported assessment strategy "${item.assessment.strategy}".`);
  }
  validateStrategyCompatibility(item, path, diagnostics);
  validateFeedbackPolicy(item, path, diagnostics);
  validateSkillIds(item, path, diagnostics, options.knownSkillIds);
}

function validateStimulus(
  value: unknown,
  path: string,
  stableIds: Set<string>,
  diagnostics: ContentDiagnostic[],
  options: LearningValidationOptions
): void {
  if (!isRecord(value)) {
    error(diagnostics, "schema.stimulus-item", path, "Stimulus must be an object.");
    return;
  }
  checkId(value.id, `${path}.id`, diagnostics);
  addUniqueId(value.id, `${path}.id`, stableIds, diagnostics);
  const registry = createDefaultStimulusRegistry();
  if (typeof value.kind !== "string" || !registry.has(value.kind as never)) {
    error(diagnostics, "unsupported.stimulus", `${path}.kind`, `Unsupported stimulus kind "${String(value.kind)}".`);
  }
  if (value.kind === "notation" && isRecord(value.source)) {
    const source = value.source;
    if (source.mode === "inline-ast") {
      const scoreResult = validateScore(source.score);
      scoreResult.errors.forEach((message) =>
        error(diagnostics, "music.invalid-ast", `${path}.source.score`, message)
      );
    }
    if (source.mode === "generator") {
      if (typeof source.generatorId !== "string" || !/@[0-9]+$/.test(source.generatorId)) {
        error(diagnostics, "generator.version", `${path}.source.generatorId`, "Generator IDs must include a numeric version.");
      } else if (options.generatorRegistry && !options.generatorRegistry.has(source.generatorId)) {
        error(diagnostics, "unsupported.generator", `${path}.source.generatorId`, `Unsupported generator "${source.generatorId}".`);
      }
      if (typeof source.seed !== "string" || source.seed.length === 0) {
        error(diagnostics, "generator.seed", `${path}.source.seed`, "Generated notation requires a stable, non-empty seed.");
      }
    }
  }
}

function validateChoice(item: LearningItem, path: string, diagnostics: ContentDiagnostic[]): void {
  const options = item.interaction.options;
  if (!Array.isArray(options) || options.length < 2) {
    error(diagnostics, "choice.options", `${path}.interaction.options`, "Choice interactions require at least two options.");
    return;
  }
  const ids = new Set<string>();
  options.forEach((option, index) => {
    checkId(option.id, `${path}.interaction.options[${index}].id`, diagnostics);
    if (ids.has(option.id)) error(diagnostics, "id.duplicate-option", `${path}.interaction.options[${index}].id`, `Duplicate option ID "${option.id}".`);
    ids.add(option.id);
  });
  const correct = item.response.correct?.value;
  const correctIds = Array.isArray(correct) ? correct : correct === undefined ? [] : [correct];
  correctIds.forEach((id) => {
    if (typeof id !== "string" || !ids.has(id)) {
      error(diagnostics, "reference.correct-option", `${path}.response.correct.value`, `Correct response refers to unknown option "${String(id)}".`);
    }
  });
}

const strategyBaseTypes: Record<string, ResponseBaseType[]> = {
  "exact-identifier@1": ["identifier"],
  "identifier-set@1": ["identifier-set"],
  "matching@1": ["mapping"],
  "normalised-text@1": ["string"],
  "numeric-tolerance@1": ["number"],
  "pitch-match@1": ["pitch"],
  "pitch-set-match@1": ["pitch-set"],
  "pitch-sequence-match@1": ["pitch-sequence"],
  "ordering@1": ["ordering"],
  "rhythm-alignment@1": ["rhythm", "midi-performance"],
  "score-semantic-diff@1": ["score-ast", "score-patch"],
  "midi-performance@1": ["midi-performance"],
  "sight-reading@1": ["midi-performance"],
  "rubric@1": ["audio-recording", "score-ast"],
  "audio-recording@1": ["audio-recording"],
  "composite-weighted@1": ["mapping", "ordering"]
};

function validateStrategyCompatibility(item: LearningItem, path: string, diagnostics: ContentDiagnostic[]): void {
  const allowed = strategyBaseTypes[item.assessment.strategy];
  if (allowed && !allowed.includes(item.response.baseType)) {
    error(diagnostics, "compatibility.assessment-response", `${path}.assessment.strategy`, `${item.assessment.strategy} cannot assess ${item.response.baseType}.`);
  }
  if (item.assessment.strategy === "sight-reading@1") {
    const notation = item.stimulus.find((stimulus) => stimulus.kind === "notation");
    const tempo = notation?.playback && Number(notation.playback.tempo);
    if (!notation) error(diagnostics, "sight-reading.notation", `${path}.stimulus`, "Sight-reading requires a notation stimulus.");
    if (!tempo && !isRecord(notation?.playback?.tempo)) {
      error(diagnostics, "sight-reading.tempo", `${path}.stimulus`, "Sight-reading requires a score or override tempo.");
    }
  }
}

function validateFeedbackPolicy(item: LearningItem, path: string, diagnostics: ContentDiagnostic[]): void {
  const maximumAttempts = item.assessment.attemptPolicy?.maximumAttempts ?? 1;
  const reveal = item.feedback?.showCorrectAnswer;
  if (maximumAttempts > 1 && (reveal === "immediate" || reveal === "after-submit")) {
    error(
      diagnostics,
      "feedback.reveals-answer",
      `${path}.feedback.showCorrectAnswer`,
      "Feedback reveals the answer before all configured attempts are used.",
      'Use "after-final-attempt" or "never".'
    );
  }
}

function validateSkillIds(
  item: LearningItem,
  path: string,
  diagnostics: ContentDiagnostic[],
  knownSkillIds?: Set<string>
): void {
  if (!knownSkillIds) return;
  const ids = Array.isArray(item.metadata?.skillIds) ? item.metadata.skillIds : [];
  ids.forEach((id) => {
    if (typeof id === "string" && !knownSkillIds.has(id)) {
      warning(diagnostics, "skill.unknown", `${path}.metadata.skillIds`, `Unknown skill ID "${id}".`);
    }
  });
}

function validateMetadata(value: unknown, path: string, diagnostics: ContentDiagnostic[]): void {
  if (!isRecord(value)) {
    error(diagnostics, "schema.metadata", path, "metadata is required.");
    return;
  }
  if (!isLocaleMap(value.title)) error(diagnostics, "schema.title", `${path}.title`, "metadata.title must be a non-empty locale map.");
  if (typeof value.language !== "string" || value.language.length < 2) error(diagnostics, "schema.language", `${path}.language`, "metadata.language is required.");
}

function validateAssets(value: unknown, diagnostics: ContentDiagnostic[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    error(diagnostics, "schema.assets", "$.assets", "assets must be an array.");
    return;
  }
  value.forEach((asset, index) => {
    const path = `$.assets[${index}]`;
    if (!isRecord(asset)) {
      error(diagnostics, "schema.asset", path, "Asset must be an object.");
      return;
    }
    checkId(asset.id, `${path}.id`, diagnostics);
    if (typeof asset.uri !== "string" || !SAFE_ASSET_SCHEMES.test(asset.uri) || /^javascript:/i.test(asset.uri)) {
      error(diagnostics, "security.asset-uri", `${path}.uri`, "Asset URI must use a permitted relative, root-relative, HTTP, or HTTPS scheme.");
    }
  });
}

function checkId(value: unknown, path: string, diagnostics: ContentDiagnostic[]): void {
  if (typeof value !== "string" || value.length > 160 || !ID_PATTERN.test(value)) {
    error(diagnostics, "schema.id", path, "ID must be 1–160 safe identifier characters.");
  }
}

function addUniqueId(value: unknown, path: string, ids: Set<string>, diagnostics: ContentDiagnostic[]): void {
  if (typeof value !== "string") return;
  if (ids.has(value)) error(diagnostics, "id.duplicate", path, `Duplicate stable ID "${value}".`);
  ids.add(value);
}

function requiredConstant(record: Record<string, unknown>, key: string, expected: string, diagnostics: ContentDiagnostic[]): void {
  if (record[key] !== expected) error(diagnostics, `schema.${key}`, `$.${key}`, `${key} must be "${expected}".`);
}

function isLocaleMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every((item) => typeof item === "string");
}

function invalid(code: string, path: string, message: string): LearningValidationResult {
  return { valid: false, diagnostics: [{ severity: "error", code, path, message }] };
}

function error(diagnostics: ContentDiagnostic[], code: string, path: string, message: string, suggestion?: string): void {
  diagnostics.push({ severity: "error", code, path, message, suggestion });
}

function warning(diagnostics: ContentDiagnostic[], code: string, path: string, message: string): void {
  diagnostics.push({ severity: "warning", code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
