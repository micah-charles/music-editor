import { describe, expect, it } from "vitest";
import { parseAppRoute, routeFor } from "./projectRoutes";

describe("project routes", () => {
  it("maps product-level destinations", () => {
    expect(routeFor("home")).toBe("/home");
    expect(routeFor("projects")).toBe("/projects");
    expect(routeFor("score")).toBe("/demo/score");
    expect(parseAppRoute("/learn/progress")).toEqual({ workspace: "learning" });
  });

  it("round-trips project workspaces and encoded IDs", () => {
    const path = routeFor("track-editor", "project 1");
    expect(path).toBe("/project/project%201/tracks");
    expect(parseAppRoute(path)).toEqual({ workspace: "track-editor", projectId: "project 1" });
  });

  it("returns Home for unknown routes", () => {
    expect(parseAppRoute("/not-a-real-page")).toEqual({ workspace: "home" });
  });
});
