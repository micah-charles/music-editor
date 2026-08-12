import { describe, expect, it } from "vitest";
import { simpleMelodyAst } from "@foxchild/music-core";
import { createSavedProject, sortProjects } from "./projectRepository";

describe("project repository model", () => {
  it("creates a versioned local project without exposing a file format", () => {
    const project = createSavedProject(simpleMelodyAst, "track-editor", "2026-07-28T12:00:00.000Z");
    expect(project.schemaVersion).toBe(1);
    expect(project.title).toBe(simpleMelodyAst.metadata.title);
    expect(project.lastWorkspace).toBe("track-editor");
    expect(project.revision).toBe(0);
    expect(project.ast).not.toBe(simpleMelodyAst);
  });

  it("orders recent projects by last opened and then last edited", () => {
    const first = createSavedProject(simpleMelodyAst, "score", "2026-07-28T10:00:00.000Z");
    const second = createSavedProject(simpleMelodyAst, "score", "2026-07-28T11:00:00.000Z");
    first.lastOpenedAt = "2026-07-28T12:00:00.000Z";
    second.lastOpenedAt = "2026-07-28T13:00:00.000Z";
    expect(sortProjects([first, second]).map((project) => project.id)).toEqual([second.id, first.id]);
  });

  it("supports title and edited-date sorting", () => {
    const alpha = createSavedProject({ ...simpleMelodyAst, metadata: { ...simpleMelodyAst.metadata, title: "Alpha" } });
    const zulu = createSavedProject({ ...simpleMelodyAst, metadata: { ...simpleMelodyAst.metadata, title: "Zulu" } });
    zulu.updatedAt = "2026-07-28T13:00:00.000Z";
    alpha.updatedAt = "2026-07-28T14:00:00.000Z";
    expect(sortProjects([zulu, alpha], "title")[0].title).toBe("Alpha");
    expect(sortProjects([zulu, alpha], "edited")[0].title).toBe("Alpha");
  });
});
