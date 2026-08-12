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

  it("renders a reorder-and-submit path for ordering questions", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "ordering"');
    expect(learningPanelSource).toContain("Submit order");
    expect(learningPanelSource).toContain("moveOrderingOption");
  });

  it("renders selectable pair assignments for matching questions", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "matching"');
    expect(learningPanelSource).toContain("Submit {resolvedItem.interaction.kind === \"drag-drop\" ? \"assignments\" : \"matches\"}");
    expect(learningPanelSource).toContain("matchingOptions");
  });

  it("renders a local rhythm tap recorder", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "rhythm-tap"');
    expect(learningPanelSource).toContain("Tap ♩");
    expect(learningPanelSource).toContain("Submit rhythm");
  });

  it("renders local notation-entry controls", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "notation-entry"');
    expect(learningPanelSource).toContain("Submit notation");
    expect(learningPanelSource).toContain("createScoreFromEvents");
    expect(learningPanelSource).toContain("Submit composition");
  });

  it("renders sight-reading performance capture controls", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "sight-reading"');
    expect(learningPanelSource).toContain("Start recording");
    expect(learningPanelSource).toContain("Submit performance");
  });

  it("renders explicit local audio recording controls", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "audio-recording"');
    expect(learningPanelSource).toContain("Start recording");
    expect(learningPanelSource).toContain("getUserMedia");
  });

  it("renders score correction controls", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "score-drag-drop"');
    expect(learningPanelSource).toContain("Submit correction");
    expect(learningPanelSource).toContain("adjustLearningScorePitch");
  });

  it("renders target assignment for drag-drop questions", () => {
    expect(learningPanelSource).toContain('resolvedItem?.interaction.kind === "drag-drop"');
    expect(learningPanelSource).toContain("Submit {resolvedItem.interaction.kind === \"drag-drop\" ? \"assignments\" : \"matches\"}");
  });
});
