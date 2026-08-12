import type { LearningAttempt, LearningItem, QuestionSet } from "./types";

export type LearningCategory = "theory" | "ear-training" | "rhythm" | "notation" | "midi";
export type LearningMode = "learn" | "practise" | "test";

export interface SetProgress {
  setId: string;
  completedQuestions: number;
  totalQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  mastery: number;
  bestScore: number;
  lastAttempt?: string;
  resumeItemIndex: number;
  mistakeItemIndices: number[];
  itemStates: Array<"unanswered" | "correct" | "incorrect">;
}

export interface LearningCatalogueEntry {
  id: string;
  title: string;
  description: string;
  domain: string;
  categories: LearningCategory[];
  questionCount: number;
  file: string;
}

const domainCategories: Record<string, LearningCategory[]> = {
  "note-reading": ["notation", "midi"],
  "key-signatures": ["theory", "notation"],
  "notation-symbols": ["theory", "notation"],
  rhythm: ["rhythm", "notation"],
  "ear-training": ["ear-training"],
  tempo: ["theory"],
  scales: ["theory", "notation"]
};

export function categoriesForSet(set: Pick<QuestionSet, "metadata">): LearningCategory[] {
  const domain = String(set.metadata.domain ?? "");
  const tags = Array.isArray(set.metadata.tags) ? set.metadata.tags : [];
  const categories = new Set<LearningCategory>(domainCategories[domain] ?? ["theory"]);
  if (tags.some((tag) => /midi|piano-keyboard/i.test(tag))) categories.add("midi");
  if (tags.some((tag) => /notation|note-reading/i.test(tag))) categories.add("notation");
  return [...categories];
}

export function normaliseQuestionBankSet(value: QuestionSet): QuestionSet {
  const set = structuredClone(value);
  set.sections.forEach((section) => {
    section.items.forEach((item) => {
      item.stimulus = item.stimulus.map((stimulus) => ({
        ...stimulus,
        id: `${item.id}-${stimulus.id}`
      }));
      const correct = item.response.correct;
      if (correct && correct.value === undefined) {
        item.response.correct = { value: structuredClone(correct) };
      }
    });
  });
  return set;
}

export function questionItems(set: QuestionSet): LearningItem[] {
  return set.sections.flatMap((section) => section.items);
}

export function calculateSetProgress(
  set: QuestionSet,
  attempts: readonly LearningAttempt[]
): SetProgress {
  const items = questionItems(set);
  const setAttempts = attempts.filter((attempt) => attempt.questionSetId === set.id && attempt.submittedAt && attempt.result);
  const byItem = new Map<string, LearningAttempt[]>();
  setAttempts.forEach((attempt) => {
    byItem.set(attempt.itemId, [...(byItem.get(attempt.itemId) ?? []), attempt]);
  });

  const itemStates = items.map((item) => {
    const itemAttempts = byItem.get(item.id) ?? [];
    if (itemAttempts.length === 0) return "unanswered" as const;
    return itemAttempts.some((attempt) => attempt.result?.passed) ? "correct" as const : "incorrect" as const;
  });
  const itemBestScores = items.map((item) => {
    const itemAttempts = byItem.get(item.id) ?? [];
    return Math.max(0, ...itemAttempts.map((attempt) => attempt.result?.percentage ?? 0));
  });
  const completedQuestions = itemStates.filter((state) => state !== "unanswered").length;
  const correctQuestions = itemStates.filter((state) => state === "correct").length;
  const incorrectQuestions = itemStates.filter((state) => state === "incorrect").length;
  const firstUnanswered = itemStates.findIndex((state) => state === "unanswered");
  const lastAttempt = setAttempts
    .map((attempt) => attempt.submittedAt as string)
    .sort((left, right) => right.localeCompare(left))[0];

  return {
    setId: set.id,
    completedQuestions,
    totalQuestions: items.length,
    correctQuestions,
    incorrectQuestions,
    mastery: items.length === 0 ? 0 : itemBestScores.reduce((sum, value) => sum + value, 0) / items.length,
    bestScore: items.length === 0 ? 0 : correctQuestions / items.length * 100,
    lastAttempt,
    resumeItemIndex: firstUnanswered >= 0 ? firstUnanswered : Math.max(0, items.length - 1),
    mistakeItemIndices: itemStates.flatMap((state, index) => state === "incorrect" ? [index] : []),
    itemStates
  };
}

export function filterCatalogue(
  entries: readonly LearningCatalogueEntry[],
  category: LearningCategory | "all"
): LearningCatalogueEntry[] {
  return category === "all"
    ? [...entries]
    : entries.filter((entry) => entry.categories.includes(category));
}

export function formatRelativeAttempt(value: string | undefined, now = new Date()): string {
  if (!value) return "Not started";
  const elapsed = Math.max(0, now.getTime() - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}
