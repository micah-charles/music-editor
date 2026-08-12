import { describe, expect, it } from "vitest";
import {
  createDefaultAssessmentRegistry,
  createDefaultQuestionFamilyRegistry,
  createDefaultCurriculumRegistry,
  createDefaultSyllabusMatrix,
  syllabusCoverage,
  syllabusSkills
} from "../index";

describe("curriculum syllabus matrix", () => {
  it("defines the ten cross-curriculum areas and all target levels", () => {
    const matrix = createDefaultSyllabusMatrix();
    expect(matrix.areas).toHaveLength(10);
    expect(syllabusSkills(matrix).length).toBeGreaterThan(25);
    const levels = syllabusSkills(matrix)[0].curriculumLevels;
    expect(levels.abrsm).toEqual([
      "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"
    ]);
    expect(levels.gcse).toEqual(["Foundation", "Higher"]);
    expect(createDefaultCurriculumRegistry().resolve("abrsm").levels).toContain("Grade 8");
  });

  it("reports generator and assessment coverage without claiming planned skills are complete", () => {
    const coverage = syllabusCoverage(
      createDefaultSyllabusMatrix(),
      createDefaultQuestionFamilyRegistry(),
      createDefaultAssessmentRegistry()
    );
    expect(coverage.some((entry) => entry.status === "covered")).toBe(true);
    expect(coverage.some((entry) => entry.status === "planned")).toBe(true);
    expect(coverage.flatMap((entry) => entry.missingAssessmentStrategyIds)).toEqual([]);
  });
});
