import type {
  CurriculumId,
  CurriculumMapping,
  LearningDomain,
  QuestionFamilyDefinition
} from "./adaptiveTypes";

export interface CurriculumDefinition {
  id: CurriculumId;
  title: string;
  levels: string[];
}

export class CurriculumRegistry {
  private readonly definitions = new Map<CurriculumId, CurriculumDefinition>();

  register(definition: CurriculumDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Curriculum "${definition.id}" is already registered.`);
    }
    this.definitions.set(definition.id, definition);
  }

  resolve(id: CurriculumId): CurriculumDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown curriculum "${id}".`);
    return definition;
  }

  list(): CurriculumDefinition[] {
    return [...this.definitions.values()];
  }

  mappingsForFamily(family: QuestionFamilyDefinition, curriculumId: CurriculumId): CurriculumMapping[] {
    return family.curriculum.filter((mapping) => mapping.curriculumId === curriculumId);
  }
}

export function createDefaultCurriculumRegistry(): CurriculumRegistry {
  const registry = new CurriculumRegistry();
  ([
    { id: "foxchild", title: "FoxChild Learning Path", levels: ["Foundation", "Developing", "Fluent", "Advanced"] },
    { id: "abrsm", title: "ABRSM Music Theory", levels: ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"] },
    { id: "trinity", title: "Trinity Music Theory", levels: ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"] },
    { id: "gcse", title: "GCSE Music", levels: ["Foundation", "Higher"] }
  ] satisfies CurriculumDefinition[]).forEach((definition) => registry.register(definition));
  return registry;
}

const domainStrands: Record<LearningDomain, string> = {
  "note-reading": "notation.pitch",
  "key-signatures": "theory.tonality",
  "music-symbols": "notation.symbols",
  "note-values": "notation.duration",
  "time-signatures": "rhythm.metre",
  intervals: "theory.intervals",
  chords: "harmony.chords",
  scales: "theory.scales",
  rhythm: "rhythm.patterns",
  tempo: "expression.tempo",
  "ear-training": "aural.pitch",
  "sight-reading": "performance.sight-reading",
  "melody-dictation": "aural.dictation",
  "error-detection": "musicianship.error-detection"
};

export function curriculumMappingsForDomain(
  domain: LearningDomain,
  conceptId: string
): CurriculumMapping[] {
  const strand = domainStrands[domain];
  return (Object.entries(curriculumLevels()) as Array<[CurriculumId, string[]]>).flatMap(([curriculumId, levels]) =>
    levels.map((level) => ({ curriculumId, level, strand, objectiveIds: [`${curriculumId}.${conceptId}`] }))
  );
}

export function gradeMappingsForDomain(
  domain: LearningDomain
): QuestionFamilyDefinition["gradeMappings"] {
  void domain;
  const levels = curriculumLevels();
  return Object.fromEntries(Object.entries(levels).map(([curriculumId, values]) => [curriculumId, values])) as QuestionFamilyDefinition["gradeMappings"];
}

export function difficultyByCurriculumLevelForDomain(
  domain: LearningDomain
): QuestionFamilyDefinition["difficultyByCurriculumLevel"] {
  const domainOffset = ["chords", "ear-training", "melody-dictation", "error-detection"].includes(domain) ? 0.08 : 0;
  const levels = curriculumLevels();
  return Object.fromEntries(Object.entries(levels).map(([curriculumId, values]) => [
    curriculumId,
    Object.fromEntries(values.map((level, index) => [level, Math.min(0.95, 0.15 + index * 0.1 + domainOffset)]))
  ])) as QuestionFamilyDefinition["difficultyByCurriculumLevel"];
}

function curriculumLevels(): Record<CurriculumId, string[]> {
  return {
    foxchild: ["Foundation", "Developing", "Fluent", "Advanced"],
    abrsm: ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"],
    trinity: ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"],
    gcse: ["Foundation", "Higher"]
  };
}

function domainGrade(domain: LearningDomain): Record<CurriculumId, string> {
  const intermediate = new Set<LearningDomain>([
    "intervals", "chords", "scales", "ear-training", "sight-reading",
    "melody-dictation", "error-detection"
  ]);
  return intermediate.has(domain)
    ? { foxchild: "Developing", abrsm: "Grade 3", trinity: "Grade 3", gcse: "Foundation" }
    : { foxchild: "Foundation", abrsm: "Grade 1", trinity: "Grade 1", gcse: "Foundation" };
}
