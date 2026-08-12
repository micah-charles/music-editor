import type { AssessmentStrategyRegistry } from "./registries";
import type { QuestionFamilyRegistry } from "./questionFamilies";
import type { CurriculumId, LearningDomain } from "./adaptiveTypes";

export type SyllabusAreaId =
  | "pitch-notation"
  | "keys-scales"
  | "intervals"
  | "rhythm-metre"
  | "harmony"
  | "terms-signs"
  | "melody-composition"
  | "score-reading"
  | "aural-listening"
  | "musical-analysis";

export type SyllabusCoverageMode = "generated" | "authored" | "hybrid" | "planned";

export interface SyllabusSkill {
  id: string;
  title: string;
  area: SyllabusAreaId;
  description: string;
  domains: LearningDomain[];
  generatorFamilyIds: string[];
  assessmentStrategyIds: string[];
  coverageMode: SyllabusCoverageMode;
  curriculumLevels: Partial<Record<CurriculumId, string[]>>;
}

export interface SyllabusArea {
  id: SyllabusAreaId;
  title: string;
  skills: SyllabusSkill[];
}

export interface SyllabusMatrix {
  version: "1.0.0";
  areas: SyllabusArea[];
}

export interface SyllabusCoverageEntry {
  skillId: string;
  area: SyllabusAreaId;
  coverageMode: SyllabusCoverageMode;
  generatorFamilyIds: string[];
  missingGeneratorFamilyIds: string[];
  missingAssessmentStrategyIds: string[];
  curriculumLevels: Partial<Record<CurriculumId, string[]>>;
  status: "covered" | "partial" | "planned";
}

export function createDefaultSyllabusMatrix(): SyllabusMatrix {
  const allFoxChildLevels = ["Foundation", "Developing", "Fluent", "Advanced"];
  const abrsmGrades = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"];
  const gcseLevels = ["Foundation", "Higher"];
  const levels = { foxchild: allFoxChildLevels, abrsm: abrsmGrades, trinity: abrsmGrades, gcse: gcseLevels };
  const generated = (
    id: string,
    title: string,
    area: SyllabusAreaId,
    description: string,
    domains: LearningDomain[],
    generatorFamilyIds: string[],
    assessmentStrategyIds: string[]
  ): SyllabusSkill => ({
    id, title, area, description, domains, generatorFamilyIds, assessmentStrategyIds,
    coverageMode: "generated", curriculumLevels: levels
  });
  const planned = (
    id: string,
    title: string,
    area: SyllabusAreaId,
    description: string,
    domains: LearningDomain[],
    assessmentStrategyIds: string[]
  ): SyllabusSkill => ({
    id, title, area, description, domains, generatorFamilyIds: [], assessmentStrategyIds,
    coverageMode: "planned", curriculumLevels: levels
  });

  return {
    version: "1.0.0",
    areas: [
      { id: "pitch-notation", title: "Pitch & notation", skills: [
        generated("pitch.note-reading", "Note reading", "pitch-notation", "Read pitches across clefs, octaves and ledger lines.", ["note-reading"], ["note-reading@2"], ["pitch-match@1"]),
        planned("pitch.accidentals", "Accidentals and enharmonics", "pitch-notation", "Identify and spell chromatic pitches and enharmonic equivalents.", ["key-signatures"], ["exact-identifier@1"]),
        planned("pitch.transposition", "Written transposition", "pitch-notation", "Transpose a written line between clefs, keys and instruments.", ["note-reading"], ["score-semantic-diff@1"])
      ]},
      { id: "keys-scales", title: "Keys & scales", skills: [
        generated("keys.key-signatures", "Key signatures", "keys-scales", "Recognise and construct major and minor key signatures.", ["key-signatures"], ["key-signatures@2"], ["exact-identifier@1"]),
        generated("scales.scale-types", "Scale types", "keys-scales", "Distinguish and construct major, natural-minor and harmonic-minor scales.", ["scales"], ["scales@2"], ["exact-identifier@1"]),
        planned("scales.scale-degrees", "Scale degrees and relationships", "keys-scales", "Use tonic, dominant, relative and parallel relationships.", ["scales", "key-signatures"], ["exact-identifier@1"])
      ]},
      { id: "intervals", title: "Intervals", skills: [
        generated("intervals.written", "Written intervals", "intervals", "Identify interval number, quality, direction and compound form.", ["intervals"], ["intervals@2"], ["exact-identifier@1"]),
        generated("intervals.aural", "Aural intervals", "intervals", "Recognise ascending and descending intervals by ear.", ["ear-training"], ["ear-training@2"], ["exact-identifier@1"]),
        planned("intervals.inversions", "Interval inversions", "intervals", "Construct and identify inverted intervals.", ["intervals"], ["exact-identifier@1"])
      ]},
      { id: "rhythm-metre", title: "Rhythm & metre", skills: [
        generated("rhythm.note-values", "Note and rest values", "rhythm-metre", "Calculate durations using notes, rests, dots and ties.", ["note-values"], ["note-values@2"], ["numeric-tolerance@1"]),
        generated("rhythm.metre", "Simple and compound metre", "rhythm-metre", "Identify and apply time signatures and beat grouping.", ["time-signatures"], ["time-signatures@2"], ["exact-identifier@1"]),
        generated("rhythm.patterns", "Rhythm patterns", "rhythm-metre", "Count, perform and compare rhythmic fragments.", ["rhythm"], ["rhythm@2"], ["numeric-tolerance@1"]),
        planned("rhythm.tuplets", "Tuplets and irregular grouping", "rhythm-metre", "Read and construct tuplets and irregular subdivisions.", ["rhythm"], ["rhythm-alignment@1"])
      ]},
      { id: "harmony", title: "Chords & harmony", skills: [
        generated("harmony.chord-quality", "Chord qualities", "harmony", "Identify triad and seventh-chord qualities.", ["chords"], ["chords@2"], ["exact-identifier@1"]),
        planned("harmony.inversions", "Chord inversions", "harmony", "Identify and construct chord inversions and figured bass.", ["chords"], ["score-semantic-diff@1"]),
        planned("harmony.cadences", "Cadences and harmonic function", "harmony", "Recognise cadences and harmonic function in context.", ["chords", "ear-training"], ["exact-identifier@1", "rubric@1"])
      ]},
      { id: "terms-signs", title: "Terms, signs & ornaments", skills: [
        generated("symbols.music-signs", "Music signs and symbols", "terms-signs", "Interpret articulation, expression and accidental symbols.", ["music-symbols"], ["music-symbols@2"], ["exact-identifier@1"]),
        generated("terms.tempo", "Tempo terms", "terms-signs", "Match tempo terminology to pulse and performance context.", ["tempo"], ["tempo@2"], ["exact-identifier@1"]),
        planned("terms.ornaments", "Ornaments and instrumental directions", "terms-signs", "Interpret ornaments and common instrumental directions.", ["music-symbols"], ["exact-identifier@1"])
      ]},
      { id: "melody-composition", title: "Melody & composition", skills: [
        planned("melody.phrase-structure", "Phrase structure and development", "melody-composition", "Recognise phrases, sequences, repetition and contrast.", ["melody-dictation"], ["rubric@1"]),
        planned("melody.completion", "Melodic completion", "melody-composition", "Complete and develop a melody within tonal and rhythmic constraints.", ["melody-dictation"], ["score-semantic-diff@1", "rubric@1"])
      ]},
      { id: "score-reading", title: "Score reading", skills: [
        generated("score.sight-reading", "Sight reading", "score-reading", "Read and perform a notated phrase with increasing complexity.", ["sight-reading"], ["sight-reading@2"], ["sight-reading@1"]),
        planned("score.instruments", "Instruments and transposing instruments", "score-reading", "Identify instruments and account for transposing notation.", ["note-reading"], ["exact-identifier@1"]),
        planned("score.open-short", "Open and short score", "score-reading", "Read and reduce multi-part notation.", ["note-reading"], ["score-semantic-diff@1"])
      ]},
      { id: "aural-listening", title: "Aural & listening", skills: [
        generated("aural.intervals", "Interval ear training", "aural-listening", "Identify melodic intervals from generated audio.", ["ear-training"], ["ear-training@2"], ["exact-identifier@1"]),
        generated("aural.chords", "Chord ear training", "aural-listening", "Identify chord qualities from generated audio.", ["ear-training"], ["chords@2"], ["exact-identifier@1"]),
        planned("aural.features", "Musical features and instrumentation", "aural-listening", "Identify texture, sonority, metre, form and instrumentation in an excerpt.", ["ear-training"], ["rubric@1"])
      ]},
      { id: "musical-analysis", title: "Musical analysis & context", skills: [
        planned("analysis.form-texture", "Form and texture", "musical-analysis", "Analyse formal structure and texture in a musical example.", ["error-detection"], ["rubric@1"]),
        planned("analysis.context", "Style and context", "musical-analysis", "Connect musical features with style, context and area-of-study evidence.", ["error-detection"], ["rubric@1"])
      ]}
    ]
  };
}

export function syllabusSkills(matrix = createDefaultSyllabusMatrix()): SyllabusSkill[] {
  return matrix.areas.flatMap((area) => area.skills);
}

export function syllabusCoverage(
  matrix: SyllabusMatrix,
  families: QuestionFamilyRegistry,
  assessments: AssessmentStrategyRegistry
): SyllabusCoverageEntry[] {
  return syllabusSkills(matrix).map((skill) => {
    const missingGeneratorFamilyIds = skill.generatorFamilyIds.filter((id) => !families.ids().includes(id));
    const missingAssessmentStrategyIds = skill.assessmentStrategyIds.filter((id) => !assessments.has(id));
    const status = skill.coverageMode === "planned"
      ? "planned"
      : missingGeneratorFamilyIds.length || missingAssessmentStrategyIds.length
        ? "partial"
        : "covered";
    return {
      skillId: skill.id,
      area: skill.area,
      coverageMode: skill.coverageMode,
      generatorFamilyIds: skill.generatorFamilyIds,
      missingGeneratorFamilyIds,
      missingAssessmentStrategyIds,
      curriculumLevels: skill.curriculumLevels,
      status
    };
  });
}
