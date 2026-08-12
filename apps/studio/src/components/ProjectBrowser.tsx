import { useMemo, useState } from "react";
import { sortProjects } from "../music/projects/projectRepository";
import type { ProjectWorkspace, SavedProject } from "../music/projects/types";

interface ProjectBrowserProps {
  projects: SavedProject[];
  currentProjectId?: string;
  onCreate: () => void;
  onOpen: (projectId: string, workspace?: ProjectWorkspace) => void;
  onRename: (projectId: string, title: string) => void;
  onDuplicate: (projectId: string) => void;
  onHistory: (projectId: string) => void;
  onFavourite: (projectId: string, favourite: boolean) => void;
  onArchive: (projectId: string, archived: boolean) => void;
  onDelete: (projectId: string) => void;
  onHome: () => void;
}

type ProjectFilter = "recent" | "all" | "favourites" | "archived";
type ProjectSort = "opened" | "edited" | "title" | "created";

export function ProjectBrowser({
  projects,
  currentProjectId,
  onCreate,
  onOpen,
  onRename,
  onDuplicate,
  onHistory,
  onFavourite,
  onArchive,
  onDelete,
  onHome
}: ProjectBrowserProps) {
  const [filter, setFilter] = useState<ProjectFilter>("recent");
  const [sort, setSort] = useState<ProjectSort>("opened");
  const [search, setSearch] = useState("");
  const [renameId, setRenameId] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      if (filter === "favourites" && !project.favourite) return false;
      if (filter === "archived" && !project.archived) return false;
      if (filter !== "archived" && project.archived) return false;
      return !query || `${project.title} ${project.composer ?? ""}`.toLowerCase().includes(query);
    });
    return sortProjects(filtered, sort);
  }, [filter, projects, search, sort]);

  function beginRename(project: SavedProject) {
    setRenameId(project.id);
    setRenameValue(project.title);
  }

  function commitRename() {
    const title = renameValue.trim();
    if (renameId && title) onRename(renameId, title);
    setRenameId(undefined);
  }

  return (
    <section className="project-browser" aria-label="My Projects">
      <header className="project-browser-header">
        <button type="button" onClick={onHome}>← Home</button>
        <div><p>MY PROJECTS</p><h1>Your music library</h1><span>Saved locally in this browser.</span></div>
        <button type="button" className="primary" onClick={onCreate}>＋ New score</button>
      </header>
      <div className="project-browser-controls">
        <nav aria-label="Project filters">
          {(["recent", "all", "favourites", "archived"] as ProjectFilter[]).map((value) => (
            <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{titleCase(value)}</button>
          ))}
        </nav>
        <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title or composer" /></label>
        <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as ProjectSort)}><option value="opened">Last opened</option><option value="edited">Last edited</option><option value="title">Title</option><option value="created">Created date</option></select></label>
      </div>
      {visibleProjects.length ? (
        <div className="project-grid">
          {visibleProjects.map((project) => (
            <article className={`project-card ${currentProjectId === project.id ? "current" : ""}`} key={project.id}>
              <div className="project-thumbnail"><span>♫</span><small>{project.ast.parts.length} track{project.ast.parts.length === 1 ? "" : "s"}</small></div>
              <div className="project-card-copy">
                {renameId === project.id ? (
                  <div className="project-rename">
                    <input aria-label={`Rename ${project.title}`} value={renameValue} autoFocus onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(); if (event.key === "Escape") setRenameId(undefined); }} />
                    <button type="button" onClick={commitRename}>Save</button>
                  </div>
                ) : <h2>{project.title}</h2>}
                <p>{project.composer || "No composer"} · {sourceLabel(project)}</p>
                <span>Edited {relativeDate(project.updatedAt)} · {workspaceLabel(project.lastWorkspace)}</span>
              </div>
              <div className="project-card-actions">
                <button type="button" className="primary" onClick={() => onOpen(project.id)}>Open</button>
                <details>
                  <summary aria-label={`More actions for ${project.title}`}>•••</summary>
                  <div>
                    <button type="button" onClick={() => beginRename(project)}>Rename</button>
                    <button type="button" onClick={() => onDuplicate(project.id)}>Duplicate</button>
                    <button type="button" onClick={() => onHistory(project.id)}>Revision history</button>
                    <button type="button" onClick={() => onFavourite(project.id, !project.favourite)}>{project.favourite ? "Remove favourite" : "Favourite"}</button>
                    <button type="button" onClick={() => onArchive(project.id, !project.archived)}>{project.archived ? "Restore" : "Archive"}</button>
                    <button type="button" className="danger" onClick={() => {
                      if (window.confirm(`Permanently delete “${project.title}”? This cannot be undone.`)) onDelete(project.id);
                    }}>Delete permanently</button>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="project-empty">
          <span>♫</span>
          <h2>{projects.length ? "No projects match this view" : "Your project library is empty"}</h2>
          <p>{projects.length ? "Try a different filter or search." : "Create a blank score or import music to begin."}</p>
          {!projects.length ? <button type="button" className="primary" onClick={onCreate}>Create your first score</button> : null}
        </div>
      )}
    </section>
  );
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function sourceLabel(project: SavedProject) {
  return titleCase(project.source?.kind ?? "blank");
}

function workspaceLabel(workspace: ProjectWorkspace) {
  return ({ score: "Score", "track-editor": "Track Editor", "piano-roll": "Piano Roll", recording: "Performance", "omr-review": "OMR Review", export: "Print" } as Record<ProjectWorkspace, string>)[workspace];
}

function relativeDate(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString();
}
