import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraphState,
  createDefaultKnowledgeGraph,
  relatedKnowledgeConcepts,
  type AdaptiveLearnerState
} from "../index";

const emptyLearner: AdaptiveLearnerState = {
  mastery: [],
  recentConceptIds: [],
  recentInteractionKinds: [],
  sessionHistory: []
};

describe("learning knowledge graph", () => {
  it("describes every adaptive domain with relationships and curriculum mappings", () => {
    const concepts = createDefaultKnowledgeGraph();
    expect(concepts).toHaveLength(14);
    expect(new Set(concepts.map((entry) => entry.domain)).size).toBe(14);
    concepts.forEach((entry) => {
      expect(entry.relatedConcepts.length).toBeGreaterThan(0);
      expect([...new Set(entry.curriculum.map((mapping) => mapping.curriculumId))]).toEqual([
        "foxchild", "abrsm", "trinity", "gcse"
      ]);
      expect(entry.abrsmGrades.length).toBeGreaterThan(0);
      expect(entry.estimatedDifficulty).toBeGreaterThanOrEqual(1);
    });
  });

  it("locks concepts behind prerequisites and recommends an available foundation", () => {
    const state = buildKnowledgeGraphState(emptyLearner, {
      curriculumId: "foxchild",
      now: new Date("2026-07-29T10:00:00.000Z")
    });
    expect(state.concepts.find((entry) => entry.concept.domain === "chords")?.status).toBe("locked");
    expect(state.concepts.find((entry) => entry.concept.domain === "note-reading")?.status).toBe("learning");
    expect(state.concepts.find((entry) => entry.concept.id === state.recommendedConceptId)?.status).not.toBe("locked");
  });

  it("prioritises weak and due concepts and exposes contextual neighbours", () => {
    const state = buildKnowledgeGraphState({
      ...emptyLearner,
      mastery: [{
        conceptId: "note-reading.pitch-on-staff",
        domain: "note-reading",
        mastery: 0.3,
        band: "developing",
        evidenceCount: 4,
        correctStreak: 0,
        incorrectCount: 3,
        intervalHours: 4,
        nextReviewAt: "2026-07-28T10:00:00.000Z"
      }]
    }, { now: new Date("2026-07-29T10:00:00.000Z") });
    expect(state.concepts.find((entry) => entry.concept.domain === "note-reading")?.status).toBe("weak");
    expect(state.recommendedConceptId).toBe("note-reading.pitch-on-staff");
    expect(relatedKnowledgeConcepts(state, "note-reading.pitch-on-staff").map((entry) => entry.concept.id))
      .toEqual(expect.arrayContaining(["note-values.note-duration", "intervals.interval-identification"]));
  });
});
