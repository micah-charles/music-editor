import {
  createDefaultLearningActivity
} from "./adaptiveRuntime";
import type { LearningActivity, LearningDomain } from "./adaptiveTypes";
import { createDefaultQuestionFamilyRegistry } from "./questionFamilies";
import type { LearningItem, QuestionSet } from "./types";

const legacyDomainMap: Record<string, LearningDomain> = {
  "note-reading": "note-reading",
  "key-signatures": "key-signatures",
  "notation-symbols": "music-symbols",
  "music-symbols": "music-symbols",
  "note-values": "note-values",
  "time-signatures": "time-signatures",
  intervals: "intervals",
  chords: "chords",
  scales: "scales",
  rhythm: "rhythm",
  tempo: "tempo",
  "ear-training": "ear-training",
  "sight-reading": "sight-reading",
  "musical-analysis": "error-detection",
  analysis: "error-detection"
};

export function migrateQuestionSetsToActivity(
  sets: readonly QuestionSet[],
  activityId = "foxchild-adaptive-music-v2"
): LearningActivity {
  if (sets.length === 0) return createDefaultLearningActivity(activityId);
  const activity = createDefaultLearningActivity(activityId);
  const families = createDefaultQuestionFamilyRegistry().list();
  const familyByDomain = new Map(families.map((family) => [family.domain, family]));
  const authoredItems = sets.flatMap((set) => {
    const setDomain = inferSetDomain(set);
    const family = familyByDomain.get(setDomain);
    return set.sections.flatMap((section) => section.items.map((item) =>
      migrateAuthoredItem(item, set, setDomain, family?.id ?? "note-reading@2")
    ));
  });
  return {
    ...activity,
    revision: Math.max(...sets.map((set) => set.revision)) + 1,
    metadata: {
      ...activity.metadata,
      title: { "en-GB": "FoxChild Adaptive Music Learning" },
      description: {
        "en-GB": `${authoredItems.length} migrated authored assessments plus deterministic question families.`
      },
      authors: [...new Set(sets.flatMap((set) => set.metadata.authors ?? ["FoxChild"]))]
    },
    authoredItems
  };
}

export function migrateLearningContentV2(
  value: LearningActivity | QuestionSet | readonly QuestionSet[]
): LearningActivity {
  if (Array.isArray(value)) return migrateQuestionSetsToActivity(value);
  if (isLearningActivity(value)) return structuredClone(value);
  if (isQuestionSet(value)) return migrateQuestionSetsToActivity([value]);
  throw new Error("Unsupported learning content. Expected LearningActivity v2 or QuestionSet v1.");
}

function migrateAuthoredItem(
  item: LearningItem,
  set: QuestionSet,
  domain: LearningDomain,
  familyId: string
): LearningItem {
  const skillIds = Array.isArray(item.metadata?.skillIds)
    ? item.metadata.skillIds.filter((id): id is string => typeof id === "string")
    : [];
  const conceptId = typeof item.metadata?.conceptId === "string"
    ? item.metadata.conceptId
    : skillIds[0] ?? `${domain}.authored.${item.id}`;
  const metadata = structuredClone(item.metadata ?? {}) as Record<string, unknown>;
  const curriculumLevels = isRecord(metadata.curriculumLevels) ? metadata.curriculumLevels : undefined;
  if (curriculumLevels && Array.isArray(curriculumLevels.abrsm) && !curriculumLevels.trinity) {
    metadata.curriculumLevels = { ...curriculumLevels, trinity: [...curriculumLevels.abrsm] };
  }
  return {
    ...structuredClone(item),
    id: `${set.id}/${item.id}`,
    stimulus: item.stimulus.map((stimulus) => ({
      ...structuredClone(stimulus),
      id: `${set.id}/${item.id}/${stimulus.id}`
    })),
    metadata: {
      ...metadata,
      adaptive: true,
      sourceQuestionSetId: set.id,
      sourceQuestionSetRevision: set.revision,
      familyId,
      domain,
      conceptId,
      variantId: `authored-${item.id}`,
      instanceId: `${set.id}/${item.id}`,
      skillIds: [conceptId]
    },
    interaction: {
      ...structuredClone(item.interaction),
      responseId: `${set.id}/${item.id}/${item.response.id}`
    },
    response: {
      ...structuredClone(item.response),
      id: `${set.id}/${item.id}/${item.response.id}`
    }
  };
}

function inferSetDomain(set: QuestionSet): LearningDomain {
  const domain = String(set.metadata.domain ?? "");
  if (legacyDomainMap[domain]) return legacyDomainMap[domain];
  const text = `${set.id} ${(set.metadata.tags ?? []).join(" ")}`.toLowerCase();
  return Object.keys(legacyDomainMap).find((candidate) => text.includes(candidate)) as LearningDomain
    ?? "note-reading";
}

function isLearningActivity(value: unknown): value is LearningActivity {
  return isRecord(value)
    && value.format === "foxchild.music-learning.activity"
    && value.schemaVersion === "2.0.0";
}

function isQuestionSet(value: unknown): value is QuestionSet {
  return isRecord(value)
    && value.format === "foxchild.music-learning.question-set"
    && value.schemaVersion === "1.0.0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
