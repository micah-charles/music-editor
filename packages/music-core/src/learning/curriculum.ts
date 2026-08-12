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
    { id: "abrsm", title: "ABRSM Music Theory", levels: ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"] },
    { id: "trinity", title: "Trinity Music Theory", levels: ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"] },
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
  const grade = domainGrade(domain);
  return [
    { curriculumId: "foxchild", level: grade.foxchild, strand, objectiveIds: [`foxchild.${conceptId}`] },
    { curriculumId: "abrsm", level: grade.abrsm, strand, objectiveIds: [`abrsm.${conceptId}`] },
    { curriculumId: "trinity", level: grade.trinity, strand, objectiveIds: [`trinity.${conceptId}`] },
    { curriculumId: "gcse", level: grade.gcse, strand, objectiveIds: [`gcse.${conceptId}`] }
  ];
}

export function gradeMappingsForDomain(
  domain: LearningDomain
): QuestionFamilyDefinition["gradeMappings"] {
  const grade = domainGrade(domain);
  return {
    foxchild: [grade.foxchild],
    abrsm: [grade.abrsm],
    trinity: [grade.trinity],
    gcse: [grade.gcse]
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
