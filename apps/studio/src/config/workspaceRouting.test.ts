import { describe, expect, it, vi } from "vitest";
import { defaultFeatureFlags } from "./features";
import {
  isDisabledAiAnalysisUrl,
  redirectDisabledFeatureRoute,
  resolveWorkspaceId,
  safeUrlWithoutAiAnalysis
} from "./workspaceRouting";

describe("static-first workspace feature routing", () => {
  it("ships with AI Analysis disabled and OMR import enabled", () => {
    expect(defaultFeatureFlags).toEqual({
      aiAnalysis: false,
      omrImport: true
    });
  });

  it("redirects legacy persisted AI Analysis state to Score", () => {
    expect(resolveWorkspaceId("analysis")).toBe("score");
    expect(resolveWorkspaceId("home")).toBe("home");
    expect(resolveWorkspaceId("learning")).toBe("learning");
    expect(resolveWorkspaceId("unknown")).toBe("score");
  });

  it("migrates the retired Mixer workspace to Track Editor", () => {
    expect(resolveWorkspaceId("mixer")).toBe("track-editor");
    expect(resolveWorkspaceId("track-editor")).toBe("track-editor");
  });

  it.each([
    "https://foxchild.example/analysis",
    "https://foxchild.example/ai-analysis/",
    "https://foxchild.example/#analysis",
    "https://foxchild.example/#/workspace/analysis",
    "https://foxchild.example/?workspace=analysis"
  ])("recognises and removes a disabled AI Analysis route: %s", (href) => {
    const url = new URL(href);
    expect(isDisabledAiAnalysisUrl(url)).toBe(true);
    expect(safeUrlWithoutAiAnalysis(url)).not.toMatch(/analysis/);
  });

  it("replaces a disabled legacy URL without navigation or a backend request", () => {
    const replaceState = vi.fn();
    expect(redirectDisabledFeatureRoute(
      { href: "https://foxchild.example/analysis?project=demo" },
      { replaceState }
    )).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?project=demo");
  });

  it("leaves normal static workspaces and enabled feature routes alone", () => {
    expect(isDisabledAiAnalysisUrl(new URL("https://foxchild.example/learning"))).toBe(false);
    expect(resolveWorkspaceId("analysis", { aiAnalysis: true, omrImport: true })).toBe("analysis");
  });
});
