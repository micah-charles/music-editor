import {
  createDefaultAssessmentRegistry
} from "./assessment";
import type { LearningActivity } from "./adaptiveTypes";
import { createDefaultMusicGeneratorRegistry } from "./generators";
import { createDefaultQuestionFamilyRegistry, type QuestionFamilyRegistry } from "./questionFamilies";
import { validateQuestionSet, type LearningValidationResult } from "./validation";
import type { ContentDiagnostic, QuestionSet } from "./types";

export interface ActivityValidationOptions {
  familyRegistry?: QuestionFamilyRegistry;
}

export function loadLearningActivity(
  input: string | unknown,
  options: ActivityValidationOptions = {}
): { activity?: LearningActivity; diagnostics: ContentDiagnostic[] } {
  let value = input;
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
  const result = validateLearningActivity(value, options);
  return {
    activity: result.valid ? value as LearningActivity : undefined,
    diagnostics: result.diagnostics
  };
}

export function validateLearningActivity(
  value: unknown,
  options: ActivityValidationOptions = {}
): LearningValidationResult {
  const diagnostics: ContentDiagnostic[] = [];
  if (!isRecord(value)) return invalid("schema.type", "$", "Learning activity must be an object.");
  requireConstant(value, "format", "foxchild.music-learning.activity", diagnostics);
  requireConstant(value, "schemaVersion", "2.0.0", diagnostics);
  requireString(value.id, "$.id", diagnostics);
  requirePositiveInteger(value.revision, "$.revision", diagnostics);
  if (!["draft", "review", "published", "retired"].includes(String(value.status))) {
    add(diagnostics, "schema.status", "$.status", "status must be draft, review, published, or retired.");
  }
  if (!isRecord(value.metadata) || !isRecord(value.metadata.title) || typeof value.metadata.language !== "string") {
    add(diagnostics, "schema.metadata", "$.metadata", "metadata requires a locale title and language.");
  }
  const familyRegistry = options.familyRegistry ?? createDefaultQuestionFamilyRegistry();
  if (!Array.isArray(value.questionFamilies) || value.questionFamilies.length === 0) {
    add(diagnostics, "schema.question-families", "$.questionFamilies", "At least one question family is required.");
  } else {
    const seen = new Set<string>();
    value.questionFamilies.forEach((familyId, index) => {
      if (typeof familyId !== "string") {
        add(diagnostics, "schema.family-id", `$.questionFamilies[${index}]`, "Family ID must be a string.");
      } else if (seen.has(familyId)) {
        add(diagnostics, "id.duplicate-family", `$.questionFamilies[${index}]`, `Duplicate family "${familyId}".`);
      } else {
        seen.add(familyId);
        try {
          const family = familyRegistry.resolve(familyId);
          validateFamilyDefinition(family, `family:${familyId}`, diagnostics);
        } catch {
          add(diagnostics, "reference.unknown-family", `$.questionFamilies[${index}]`, `Unknown family "${familyId}".`);
        }
      }
    });
  }
  validateGeneratorConfiguration(value.generatorConfiguration, value.questionFamilies, familyRegistry, diagnostics);
  validateCurriculumConstraints(value.curriculumConstraints, diagnostics);
  validatePolicies(value, diagnostics);
  validateAuthoredItems(value.authoredItems, value, diagnostics);
  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics
  };
}

function validateFamilyDefinition(
  family: ReturnType<QuestionFamilyRegistry["resolve"]>,
  path: string,
  diagnostics: ContentDiagnostic[]
): void {
  if (Object.keys(family.parameterSpace).length === 0) {
    add(diagnostics, "family.parameter-space", path, "Family parameter space must not be empty.");
  }
  if (!family.generatorId.match(/@[0-9]+$/)) add(diagnostics, "family.generator-version", path, "Generator ID must be versioned.");
  if (!family.distractorStrategyId.match(/@[0-9]+$/)) add(diagnostics, "family.distractor-version", path, "Distractor strategy ID must be versioned.");
  if (family.curriculum.length < 4) add(diagnostics, "family.curriculum", path, "Family must map FoxChild, ABRSM, Trinity and GCSE.");
  if (family.conceptIds.length === 0 || family.variantIds.length === 0) {
    add(diagnostics, "family.identity", path, "Family must define concept and variant IDs.");
  }
}

function validateGeneratorConfiguration(
  value: unknown,
  familyIds: unknown,
  familyRegistry: QuestionFamilyRegistry,
  diagnostics: ContentDiagnostic[]
): void {
  if (!isRecord(value) || typeof value.defaultSeed !== "string" || !Array.isArray(value.families)) {
    add(diagnostics, "schema.generator-configuration", "$.generatorConfiguration", "generatorConfiguration requires defaultSeed and families.");
    return;
  }
  const expected = new Set(Array.isArray(familyIds) ? familyIds.filter((id): id is string => typeof id === "string") : []);
  const configured = new Set<string>();
  value.families.forEach((entry, index) => {
    const path = `$.generatorConfiguration.families[${index}]`;
    if (!isRecord(entry) || typeof entry.familyId !== "string" || typeof entry.enabled !== "boolean") {
      add(diagnostics, "schema.generator-family", path, "Generator family requires familyId and enabled.");
    } else {
      if (configured.has(entry.familyId)) {
        add(diagnostics, "id.duplicate-generator-family", path, `Duplicate generator configuration for "${entry.familyId}".`);
      }
      configured.add(entry.familyId);
      if (entry.weight !== undefined && (!Number.isFinite(Number(entry.weight)) || Number(entry.weight) <= 0)) {
        add(diagnostics, "generator.weight", `${path}.weight`, "Family weight must be greater than zero.");
      }
      try {
        const family = familyRegistry.resolve(entry.familyId);
        validateGeneratorParameters(entry.parameters, family.parameterSpace, `${path}.parameters`, diagnostics);
      } catch {
        add(diagnostics, "reference.unknown-generator-family", `${path}.familyId`, `Unknown family "${entry.familyId}".`);
      }
    }
  });
  expected.forEach((familyId) => {
    if (!configured.has(familyId)) {
      add(diagnostics, "reference.unconfigured-family", "$.generatorConfiguration.families", `Family "${familyId}" has no generator configuration.`);
    }
  });
}

function validateGeneratorParameters(
  value: unknown,
  parameterSpace: ReturnType<QuestionFamilyRegistry["resolve"]>["parameterSpace"],
  path: string,
  diagnostics: ContentDiagnostic[]
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add(diagnostics, "generator.parameters", path, "Generator parameters must be an object.");
    return;
  }
  Object.entries(value).forEach(([key, parameter]) => {
    const definition = parameterSpace[key];
    if (!definition) {
      add(diagnostics, "generator.unknown-parameter", `${path}.${key}`, `Unknown family parameter "${key}".`);
      return;
    }
    if (definition.type === "enum" && !definition.values?.includes(parameter as never)) {
      add(diagnostics, "generator.parameter-enum", `${path}.${key}`, `"${key}" is outside the declared parameter values.`);
    }
    if ((definition.type === "integer" || definition.type === "number")) {
      const number = Number(parameter);
      if (!Number.isFinite(number)
        || (definition.type === "integer" && !Number.isInteger(number))
        || (definition.minimum !== undefined && number < definition.minimum)
        || (definition.maximum !== undefined && number > definition.maximum)) {
        add(diagnostics, "generator.parameter-range", `${path}.${key}`, `"${key}" is outside the declared numeric range.`);
      }
    }
    if (definition.type === "boolean" && typeof parameter !== "boolean") {
      add(diagnostics, "generator.parameter-boolean", `${path}.${key}`, `"${key}" must be boolean.`);
    }
  });
}

function validateCurriculumConstraints(value: unknown, diagnostics: ContentDiagnostic[]): void {
  if (!isRecord(value) || !Array.isArray(value.curricula)) {
    add(diagnostics, "schema.curriculum-constraints", "$.curriculumConstraints", "curriculumConstraints requires curricula.");
    return;
  }
  const curricula = value.curricula as unknown[];
  ["foxchild", "abrsm", "trinity", "gcse"].forEach((curriculum) => {
    if (!curricula.includes(curriculum)) {
      add(diagnostics, "curriculum.missing", "$.curriculumConstraints.curricula", `Missing required ${curriculum} curriculum support.`);
    }
  });
}

function validatePolicies(value: Record<string, unknown>, diagnostics: ContentDiagnostic[]): void {
  const session = value.sessionPolicy;
  if (!isRecord(session) || !Number.isInteger(session.questionCount) || Number(session.questionCount) < 1 || !isRecord(session.adaptiveMix)) {
    add(diagnostics, "schema.session-policy", "$.sessionPolicy", "sessionPolicy requires questionCount and adaptiveMix.");
  } else {
    const adaptiveMix = session.adaptiveMix as Record<string, unknown>;
    const total = ["review", "developing", "new", "challenge"]
      .reduce((sum, key) => sum + Number(adaptiveMix[key]), 0);
    if (Math.abs(total - 1) > 0.0001) {
      add(diagnostics, "policy.adaptive-mix", "$.sessionPolicy.adaptiveMix", "Adaptive mix must total 1.0.");
    }
  }
  if (!isRecord(value.masteryPolicy)) add(diagnostics, "schema.mastery-policy", "$.masteryPolicy", "masteryPolicy is required.");
  if (!isRecord(value.reviewPolicy)) add(diagnostics, "schema.review-policy", "$.reviewPolicy", "reviewPolicy is required.");
}

function validateAuthoredItems(
  items: unknown,
  activity: Record<string, unknown>,
  diagnostics: ContentDiagnostic[]
): void {
  if (!Array.isArray(items)) {
    add(diagnostics, "schema.authored-items", "$.authoredItems", "authoredItems must be an array.");
    return;
  }
  items.forEach((item, index) => {
    const wrapper: QuestionSet = {
      format: "foxchild.music-learning.question-set",
      schemaVersion: "1.0.0",
      id: `validation-${index}`,
      revision: 1,
      status: "draft",
      metadata: {
        title: { "en-GB": "Validation wrapper" },
        language: String(isRecord(activity.metadata) ? activity.metadata.language ?? "en-GB" : "en-GB")
      },
      sections: [{ id: `section-${index}`, items: [item as never] }]
    };
    const result = validateQuestionSet(wrapper, {
      assessmentRegistry: createDefaultAssessmentRegistry(),
      generatorRegistry: createDefaultMusicGeneratorRegistry()
    });
    result.diagnostics.forEach((diagnostic) => diagnostics.push({
      ...diagnostic,
      path: `$.authoredItems[${index}]${diagnostic.path === "$" ? "" : diagnostic.path.slice(1)}`
    }));
  });
}

function requireConstant(
  value: Record<string, unknown>,
  key: string,
  expected: string,
  diagnostics: ContentDiagnostic[]
): void {
  if (value[key] !== expected) add(diagnostics, `schema.${key}`, `$.${key}`, `${key} must be "${expected}".`);
}

function requireString(value: unknown, path: string, diagnostics: ContentDiagnostic[]): void {
  if (typeof value !== "string" || value.length === 0) add(diagnostics, "schema.string", path, "A non-empty string is required.");
}

function requirePositiveInteger(value: unknown, path: string, diagnostics: ContentDiagnostic[]): void {
  if (!Number.isInteger(value) || Number(value) < 1) add(diagnostics, "schema.integer", path, "An integer of at least 1 is required.");
}

function invalid(code: string, path: string, message: string): LearningValidationResult {
  return { valid: false, diagnostics: [{ severity: "error", code, path, message }] };
}

function add(diagnostics: ContentDiagnostic[], code: string, path: string, message: string): void {
  diagnostics.push({ severity: "error", code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
