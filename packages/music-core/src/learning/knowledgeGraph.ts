import type {
  AdaptiveLearnerState,
  ConceptMastery,
  CurriculumId,
  CurriculumMapping,
  LearningDomain
} from "./adaptiveTypes";
import { curriculumMappingsForDomain } from "./curriculum";

export type KnowledgeConceptStatus = "locked" | "learning" | "mastered" | "review" | "weak";

export interface KnowledgeConcept {
  id: string;
  title: string;
  shortTitle: string;
  icon: string;
  domain: LearningDomain;
  description: string;
  prerequisites: string[];
  relatedConcepts: string[];
  curriculum: CurriculumMapping[];
  abrsmGrades: string[];
  estimatedDifficulty: 1 | 2 | 3 | 4 | 5;
}

export interface KnowledgeConceptState {
  concept: KnowledgeConcept;
  mastery: number;
  evidenceCount: number;
  incorrectCount: number;
  status: KnowledgeConceptStatus;
  nextReviewAt?: string;
  lockedBy: string[];
}

export interface KnowledgeGraphState {
  concepts: KnowledgeConceptState[];
  recommendedConceptId: string;
}

interface ConceptSeed extends Omit<KnowledgeConcept, "curriculum" | "abrsmGrades"> {}

const conceptSeeds: ConceptSeed[] = [
  concept("note-reading.pitch-on-staff", "Note Reading", "Notes", "𝄞", "note-reading",
    "Read pitches confidently in treble and bass clef.", [], ["note-values.note-duration", "sight-reading.sight-reading-preview"], 1),
  concept("note-values.note-duration", "Note Values", "Values", "♩", "note-values",
    "Understand how long written notes last.", [], ["rhythm.rhythm-total", "time-signatures.metre-identification"], 1),
  concept("music-symbols.notation-symbol", "Music Symbols", "Symbols", "𝄐", "music-symbols",
    "Recognise articulation, expression, accidental and phrasing marks.", [], ["tempo.tempo-term", "error-detection.notation-error-position"], 1),
  concept("rhythm.rhythm-total", "Rhythm Patterns", "Rhythm", "𝅘𝅥𝅮", "rhythm",
    "Count and compare complete rhythm patterns.", ["note-values.note-duration"], ["time-signatures.metre-identification", "sight-reading.sight-reading-preview"], 2),
  concept("time-signatures.metre-identification", "Time Signatures", "Metre", "¾", "time-signatures",
    "Identify simple and compound metres.", ["note-values.note-duration"], ["rhythm.rhythm-total", "sight-reading.sight-reading-preview"], 2),
  concept("key-signatures.major-key-signature", "Key Signatures", "Keys", "♯", "key-signatures",
    "Recognise common major key signatures.", ["note-reading.pitch-on-staff"], ["scales.scale-type", "chords.chord-quality"], 2),
  concept("intervals.interval-identification", "Intervals", "Intervals", "↗", "intervals",
    "Name the written distance between two pitches.", ["note-reading.pitch-on-staff"], ["ear-training.aural-interval", "chords.chord-quality"], 2),
  concept("scales.scale-type", "Scales", "Scales", "♭", "scales",
    "Distinguish major, natural minor and harmonic minor scales.", ["key-signatures.major-key-signature"], ["chords.chord-quality", "error-detection.notation-error-position"], 3),
  concept("chords.chord-quality", "Chords", "Chords", "♬", "chords",
    "Hear and see major, minor, diminished and seventh chord qualities.", ["intervals.interval-identification"], ["scales.scale-type", "ear-training.aural-interval"], 3),
  concept("tempo.tempo-term", "Tempo", "Tempo", "♙", "tempo",
    "Connect musical tempo words with a felt pulse.", ["music-symbols.notation-symbol"], ["ear-training.aural-interval", "sight-reading.sight-reading-preview"], 2),
  concept("ear-training.aural-interval", "Ear Training", "Aural", "♫", "ear-training",
    "Recognise intervals by listening.", ["intervals.interval-identification"], ["melody-dictation.melodic-contour", "chords.chord-quality"], 3),
  concept("sight-reading.sight-reading-preview", "Sight Reading", "Sight-read", "◉", "sight-reading",
    "Scan pitch, rhythm and metre before performing.", ["note-reading.pitch-on-staff", "rhythm.rhythm-total"], ["tempo.tempo-term", "error-detection.notation-error-position"], 4),
  concept("melody-dictation.melodic-contour", "Melody Dictation", "Dictation", "♪", "melody-dictation",
    "Follow and describe the shape of a heard melody.", ["ear-training.aural-interval"], ["sight-reading.sight-reading-preview", "error-detection.notation-error-position"], 4),
  concept("error-detection.notation-error-position", "Error Detection", "Spot errors", "✓", "error-detection",
    "Find pitch and pattern errors in written music.", ["scales.scale-type", "sight-reading.sight-reading-preview"], ["music-symbols.notation-symbol", "melody-dictation.melodic-contour"], 5)
];

export function createDefaultKnowledgeGraph(): KnowledgeConcept[] {
  return conceptSeeds.map((seed) => {
    const curriculum = curriculumMappingsForDomain(seed.domain, seed.id);
    return {
      ...seed,
      curriculum,
      abrsmGrades: curriculum
        .filter((mapping) => mapping.curriculumId === "abrsm")
        .map((mapping) => mapping.level)
    };
  });
}

export function buildKnowledgeGraphState(
  learner: Pick<AdaptiveLearnerState, "mastery">,
  options: {
    curriculumId?: CurriculumId;
    now?: Date;
    studyMinutes?: number;
  } = {}
): KnowledgeGraphState {
  const now = options.now ?? new Date();
  const masteryById = new Map(learner.mastery.map((entry) => [entry.conceptId, entry]));
  const definitions = createDefaultKnowledgeGraph().filter((entry) =>
    !options.curriculumId || entry.curriculum.some((mapping) => mapping.curriculumId === options.curriculumId)
  );
  const states = definitions.map((concept) => {
    const evidence = masteryById.get(concept.id);
    const lockedBy = concept.prerequisites.filter((id) => !prerequisiteIsReady(masteryById.get(id)));
    return {
      concept,
      mastery: evidence?.mastery ?? 0,
      evidenceCount: evidence?.evidenceCount ?? 0,
      incorrectCount: evidence?.incorrectCount ?? 0,
      status: conceptStatus(evidence, lockedBy, now),
      nextReviewAt: evidence?.nextReviewAt,
      lockedBy
    } satisfies KnowledgeConceptState;
  });
  return {
    concepts: states,
    recommendedConceptId: recommendKnowledgeConcept(states, options.studyMinutes ?? 10)
  };
}

export function recommendKnowledgeConcept(
  states: readonly KnowledgeConceptState[],
  studyMinutes = 10
): string {
  const candidates = states.filter((entry) => entry.status !== "locked");
  const ranked = [...candidates].sort((left, right) =>
    recommendationScore(right, studyMinutes) - recommendationScore(left, studyMinutes)
    || left.concept.estimatedDifficulty - right.concept.estimatedDifficulty
    || left.concept.id.localeCompare(right.concept.id)
  );
  return (ranked[0] ?? states[0])?.concept.id ?? "";
}

export function relatedKnowledgeConcepts(
  state: KnowledgeGraphState,
  conceptId: string,
  limit = 7
): KnowledgeConceptState[] {
  const current = state.concepts.find((entry) => entry.concept.id === conceptId);
  if (!current) return state.concepts.slice(0, limit);
  const related = new Set([
    ...current.concept.relatedConcepts,
    ...current.concept.prerequisites,
    ...state.concepts
      .filter((entry) => entry.concept.prerequisites.includes(conceptId))
      .map((entry) => entry.concept.id)
  ]);
  const contextual = state.concepts
    .filter((entry) => entry.concept.id !== conceptId && related.has(entry.concept.id))
    .sort((left, right) =>
      statusPriority(left.status) - statusPriority(right.status)
      || left.concept.estimatedDifficulty - right.concept.estimatedDifficulty
    );
  const fallback = state.concepts
    .filter((entry) =>
      entry.concept.id !== conceptId
      && !related.has(entry.concept.id)
      && entry.status !== "locked"
    )
    .sort((left, right) =>
      statusPriority(left.status) - statusPriority(right.status)
      || left.concept.estimatedDifficulty - right.concept.estimatedDifficulty
    );
  return [...contextual, ...fallback].slice(0, limit);
}

export function knowledgeStatusLabel(status: KnowledgeConceptStatus): string {
  if (status === "review") return "Needs review";
  return status[0].toUpperCase() + status.slice(1);
}

function concept(
  id: string,
  title: string,
  shortTitle: string,
  icon: string,
  domain: LearningDomain,
  description: string,
  prerequisites: string[],
  relatedConcepts: string[],
  estimatedDifficulty: 1 | 2 | 3 | 4 | 5
): ConceptSeed {
  return { id, title, shortTitle, icon, domain, description, prerequisites, relatedConcepts, estimatedDifficulty };
}

function prerequisiteIsReady(mastery: ConceptMastery | undefined): boolean {
  return Boolean(mastery && (mastery.mastery >= 0.55 || mastery.evidenceCount >= 2));
}

function conceptStatus(
  evidence: ConceptMastery | undefined,
  lockedBy: string[],
  now: Date
): KnowledgeConceptStatus {
  if (lockedBy.length > 0 && !evidence?.evidenceCount) return "locked";
  if (!evidence || evidence.evidenceCount === 0) return "learning";
  if (evidence.incorrectCount >= 2 && evidence.mastery < 0.55) return "weak";
  if (evidence.nextReviewAt && Date.parse(evidence.nextReviewAt) <= now.getTime()) return "review";
  if (evidence.mastery >= 0.8 && evidence.evidenceCount >= 3) return "mastered";
  return "learning";
}

function recommendationScore(entry: KnowledgeConceptState, studyMinutes: number): number {
  const status = { weak: 100, review: 90, learning: 60, mastered: 15, locked: -100 }[entry.status];
  const evidenceNeed = (1 - entry.mastery) * 24;
  const mistakeWeight = Math.min(20, entry.incorrectCount * 5);
  const suitableDifficulty = entry.concept.estimatedDifficulty <= Math.max(1, Math.ceil(studyMinutes / 5)) ? 5 : 0;
  return status + evidenceNeed + mistakeWeight + suitableDifficulty;
}

function statusPriority(status: KnowledgeConceptStatus): number {
  return { weak: 0, review: 1, learning: 2, mastered: 3, locked: 4 }[status];
}
