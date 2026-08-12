import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./ExportPanel";

describe("export filename safety", () => {
  it("removes unsafe path and operating-system characters", () => {
    expect(sanitizeFilename("../My:Score/Final?.musicxml")).toBe("-My-Score-Final-.musicxml");
  });

  it("provides a friendly fallback and a bounded length", () => {
    expect(sanitizeFilename("...")).toBe("Untitled Score");
    expect(sanitizeFilename("A".repeat(150))).toHaveLength(100);
  });
});
