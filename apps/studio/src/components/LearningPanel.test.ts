import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const learningPanelSource = readFileSync(new URL("./LearningPanel.tsx", import.meta.url), "utf8");

describe("learning answer interaction", () => {
  it("submits a choice directly from its answer button", () => {
    expect(learningPanelSource).toContain('onClick={() => submit(option.id)}');
    expect(learningPanelSource).not.toContain('onClick={() => setSelectedResponse(option.id)}');
  });

  it("does not require a second answer confirmation action", () => {
    expect(learningPanelSource).not.toContain("Check answer");
    expect(learningPanelSource).not.toContain("Save answer");
    expect(learningPanelSource).toContain("Choose an answer above");
  });
});
