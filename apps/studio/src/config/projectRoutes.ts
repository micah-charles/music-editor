import type { WorkspaceId } from "./workspaceRouting";
import type { ProjectWorkspace } from "../music/projects/types";

export interface AppRoute {
  workspace: WorkspaceId;
  projectId?: string;
}

const projectSegments: Record<ProjectWorkspace, string> = {
  score: "score",
  "track-editor": "tracks",
  "piano-roll": "piano-roll",
  recording: "perform",
  "omr-review": "omr-review",
  export: "print"
};

const segmentProjects = Object.fromEntries(Object.entries(projectSegments).map(([workspace, segment]) => [segment, workspace])) as Record<string, ProjectWorkspace>;

export function routeFor(workspace: WorkspaceId, projectId?: string) {
  if (workspace === "home") return "/home";
  if (workspace === "projects") return "/projects";
  if (workspace === "learning") return "/learn";
  if (workspace === "settings") return "/settings";
  if (projectId) return `/project/${encodeURIComponent(projectId)}/${projectSegments[projectWorkspace(workspace)]}`;
  if (workspace === "score") return "/demo/score";
  return "/home";
}

export function parseAppRoute(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "/home") return { workspace: "home" };
  if (clean === "/projects") return { workspace: "projects" };
  if (clean === "/learn" || clean.startsWith("/learn/")) return { workspace: "learning" };
  if (clean === "/settings") return { workspace: "settings" };
  if (clean === "/demo/score") return { workspace: "score" };
  const match = /^\/project\/([^/]+)\/([^/]+)$/.exec(clean);
  if (match) {
    const workspace = segmentProjects[match[2]];
    if (workspace) return { workspace, projectId: decodeURIComponent(match[1]) };
  }
  return { workspace: "home" };
}

function projectWorkspace(workspace: WorkspaceId): ProjectWorkspace {
  if (workspace === "track-editor" || workspace === "piano-roll" || workspace === "recording" || workspace === "omr-review" || workspace === "export") return workspace;
  return "score";
}
