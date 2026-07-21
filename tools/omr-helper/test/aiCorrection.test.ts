import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCodexArgs, buildCodexPrompt, parseCorrectionOutput, requestAiOmrCorrection } from "../src/aiCorrection";

const originalModel = process.env.CODEX_OMR_MODEL;

afterEach(() => {
  process.env.CODEX_OMR_MODEL = originalModel;
  vi.restoreAllMocks();
});

describe("AI OMR correction", () => {
  it("builds a read-only ephemeral Codex request", () => {
    const input = {
      requested: true,
      sourcePath: "/tmp/score.png",
      filename: "score.png",
      musicXml: '<score-partwise><part id="P1"><measure number="1"><note/></measure><measure number="8"><note/></measure><measure number="9"><note/></measure></part></score-partwise>',
      warnings: ["Audiveris reported 1 rhythm issue(s) in measure stack(s) 8."],
      jobDir: "/tmp/job"
    };
    const args = buildCodexArgs(input, "/tmp/schema.json", "/tmp/output.json");
    const prompt = buildCodexPrompt(input, "/tmp/evidence.musicxml", [8]);

    expect(args).toContain("read-only");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--output-schema");
    expect(args).toContain("--image");
    expect(prompt).toContain("Prioritised measures: 8");
    expect(prompt).toContain("Do not edit files");
  });

  it("returns normalized human-review proposals from local Codex", async () => {
    process.env.CODEX_OMR_MODEL = "test-model";
    const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-ai-test-"));
    const runner = vi.fn(async ({ outputPath }: { outputPath: string }) => {
      await fs.writeFile(outputPath, JSON.stringify({
        summary: "Four sharps are visible.",
        proposals: [{
          id: "key-1",
          category: "critical-semantic",
          operation: "set-key-signature",
          measure: 1,
          confidence: 0.97,
          summary: "Use four sharps.",
          evidence: "Four sharps are visible on both staves.",
          patch: { fifths: 4, mode: "major", bpm: null, metadataField: null, value: null },
          requiresHumanReview: true
        }]
      }));
    });

    const result = await requestAiOmrCorrection({
      requested: true,
      sourcePath: path.join(jobDir, "score.png"),
      filename: "score.png",
      musicXml: "<score-partwise/>",
      warnings: [],
      jobDir
    }, runner);

    expect(result).toMatchObject({
      status: "completed",
      model: "test-model",
      proposals: [{ id: "key-1", patch: { fifths: 4, mode: "major" }, requiresHumanReview: true }]
    });
  });

  it("reports a missing local Codex executable without failing OMR", async () => {
    const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-ai-test-"));
    const result = await requestAiOmrCorrection({
      requested: true,
      sourcePath: path.join(jobDir, "score.png"),
      filename: "score.png",
      musicXml: "<score-partwise/>",
      warnings: [],
      jobDir
    }, async () => { throw new Error("spawn codex ENOENT"); });
    expect(result.status).toBe("unavailable");
    expect(result.error).toContain("Codex CLI was not found");
  });

  it("rejects malformed correction output", () => {
    expect(() => parseCorrectionOutput('{"summary":"missing proposals"}')).toThrow("expected schema");
  });
});
