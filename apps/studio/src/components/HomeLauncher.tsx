import { useState } from "react";
import type { FoxChildMusicScore } from "@foxchild/music-core";
import type { WorkspaceId } from "../config/workspaceRouting";
import type { ProjectRecovery, SavedProject } from "../music/projects/types";

interface HomeLauncherProps {
  score: FoxChildMusicScore;
  projects: SavedProject[];
  recoveries: ProjectRecovery[];
  currentProjectId?: string;
  onNavigate: (workspace: WorkspaceId) => void;
  onCreateProject: () => void;
  onOpenProjects: () => void;
  onOpenProject: (projectId: string) => void;
  onRecover: (recovery: ProjectRecovery) => void;
  onDiscardRecovery: (projectId: string) => void;
}

type LauncherTool = {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: string;
  colour: string;
  workspace?: WorkspaceId;
  points?: string[];
};

const launcherCards: LauncherTool[] = [
  { id: "create", label: "Create Music", description: "Compose and score", icon: "✎", colour: "#7658ed", workspace: "score" },
  { id: "perform", label: "Perform & Record", description: "Piano, MIDI, record", icon: "▥", colour: "#18a969", workspace: "recording" },
  { id: "learn", label: "Learn Music", description: "Practise and improve", icon: "◆", colour: "#f38b22", workspace: "learning" },
  { id: "import", label: "Import Music", description: "PDF, image, MIDI", icon: "⇩", colour: "#438ee8", workspace: "omr-review" },
  { id: "projects", label: "My Projects", description: "Recent scores", icon: "▰", colour: "#6b4fe3" },
  { id: "assistant", label: "Score Assistant", description: "Local composition tools", icon: "✦", colour: "#ed4f82", workspace: "score" },
  { id: "templates", label: "Templates", description: "Scores and exercises", icon: "★", colour: "#f19a23", workspace: "score" },
  { id: "progress", label: "Progress", description: "Stats and goals", icon: "▣", colour: "#19acc1", workspace: "learning" },
  { id: "settings", label: "Settings", description: "Preferences", icon: "⚙", colour: "#626b7d", workspace: "settings" }
];

const flowerTools: LauncherTool[] = [
  {
    id: "score",
    label: "Score View",
    shortLabel: "Score",
    description: "Edit traditional notation and page layout.",
    icon: "▥",
    colour: "#785ef0",
    workspace: "score",
    points: ["Notation editing", "MusicXML fidelity", "Print-ready score"]
  },
  {
    id: "piano-roll",
    label: "Piano Roll",
    description: "Edit pitches and durations in a familiar note grid.",
    icon: "▤",
    colour: "#22af70",
    workspace: "piano-roll",
    points: ["Pitch editing", "Duration controls", "Shared note selection"]
  },
  {
    id: "track-editor",
    label: "Track Editor",
    description: "Manage instruments, channels and notes on a measure timeline.",
    icon: "☷",
    colour: "#7564ef",
    workspace: "track-editor",
    points: ["Timeline editing", "Per-track parameters", "Event list and note input", "MIDI channels", "Mute, solo and volume"]
  },
  {
    id: "performance",
    label: "Perform & Record",
    shortLabel: "Perform",
    description: "Play the project with a keyboard or capture a performance.",
    icon: "♩",
    colour: "#1bad72",
    workspace: "recording",
    points: ["Piano and MIDI input", "Metronome", "Overdub and replace"]
  },
  {
    id: "print",
    label: "Print View",
    shortLabel: "Print",
    description: "Prepare exports, printable notation and project files.",
    icon: "▣",
    colour: "#7557ed",
    workspace: "export",
    points: ["PDF-ready notation", "MusicXML export", "MIDI and AST export"]
  },
  {
    id: "omr",
    label: "OMR Review",
    shortLabel: "OMR",
    description: "Import a PDF or image explicitly, then review conversion fidelity.",
    icon: "▧",
    colour: "#f05768",
    workspace: "omr-review",
    points: ["Explicit OMR workflow", "Side-by-side review", "No background service calls"]
  },
  {
    id: "info",
    label: "Project Info",
    shortLabel: "Info",
    description: "Edit project metadata, title, composer and layout preferences.",
    icon: "ⓘ",
    colour: "#f29a25",
    workspace: "settings",
    points: ["Project metadata", "Workspace layout", "Instrument library"]
  },
  {
    id: "learning",
    label: "Learning Tools",
    shortLabel: "Learn",
    description: "Turn the active score into focused practice and review.",
    icon: "✦",
    colour: "#ee4e84",
    workspace: "learning",
    points: ["Ten learning sets", "Mastery tracking", "Review mistakes"]
  }
];

export function HomeLauncher({
  score,
  projects,
  recoveries,
  currentProjectId,
  onNavigate,
  onCreateProject,
  onOpenProjects,
  onOpenProject,
  onRecover,
  onDiscardRecovery
}: HomeLauncherProps) {
  const [flowerOpen, setFlowerOpen] = useState(false);
  const [creationOpen, setCreationOpen] = useState(false);
  const [previewId, setPreviewId] = useState("track-editor");
  const preview = flowerTools.find((tool) => tool.id === previewId) ?? flowerTools[0];
  const recentProjects = projects.filter((project) => !project.archived).slice(0, 3);
  const hasCurrentProject = Boolean(currentProjectId && projects.some((project) => project.id === currentProjectId && !project.archived));

  function activateCard(tool: LauncherTool) {
    if (tool.id === "create") {
      setCreationOpen(true);
      return;
    }
    if (tool.id === "perform" && !currentProjectId) {
      setCreationOpen(true);
      return;
    }
    if (tool.id === "projects") {
      onOpenProjects();
      return;
    }
    if (tool.workspace) onNavigate(tool.workspace);
  }

  return (
    <section className={`home-launcher ${flowerOpen ? "flower-open" : ""}`} aria-label="Home Launcher">
      <header className="home-launcher-header">
        <div className="home-brand">
          <span>FC</span>
          <div><strong>FoxChild Music Score Lab</strong><small>Your creative hub</small></div>
        </div>
        {flowerOpen ? <button type="button" onClick={() => setFlowerOpen(false)}>← All tools</button> : <span>Start anywhere.</span>}
      </header>

      {!flowerOpen ? (
        <div className="home-launcher-content">
          <div className="home-intro">
            <p>HOME LAUNCHER</p><h1>What would you like to make?</h1><span>Compose, practise, perform or continue your latest project.</span>
            {hasCurrentProject ? <button type="button" className="current-project-flower-link" onClick={() => setFlowerOpen(true)}>Open current project workspaces</button> : null}
          </div>
          {recoveries.map((recovery) => (
            <article className="home-recovery-card" key={recovery.projectId} role="status">
              <div><strong>Unsaved work can be recovered</strong><span>{recovery.title} · {new Date(recovery.capturedAt).toLocaleString()}</span></div>
              <button type="button" onClick={() => onRecover(recovery)}>Recover</button>
              <button type="button" onClick={() => onDiscardRecovery(recovery.projectId)}>Discard</button>
            </article>
          ))}
          <div className="launcher-card-grid">
            {launcherCards.map((tool) => (
              <button type="button" className="launcher-card" key={tool.id} onClick={() => activateCard(tool)}>
                <span className="launcher-card-icon" style={{ "--launcher-colour": tool.colour } as React.CSSProperties}>{tool.icon}</span>
                <strong>{tool.label}</strong>
                <small>{tool.description}</small>
              </button>
            ))}
          </div>
          {recentProjects.length ? (
            <div className="home-recent-projects">
              {recentProjects.map((project, index) => (
                <article className="recent-project-card" key={project.id}>
                  <div className="recent-project-icon">♫</div>
                  <div><small>{index === 0 ? "RECENT PROJECT" : "PROJECT"}</small><strong>{project.title}</strong><span>{project.source?.kind ?? "score"} · {relativeTime(project.updatedAt)}</span></div>
                  <button type="button" onClick={() => onOpenProject(project.id)}>Open <span>→</span></button>
                </article>
              ))}
              <button type="button" className="view-project-library" onClick={onOpenProjects}>View all projects</button>
            </div>
          ) : (
            <article className="home-empty-projects">
              <span>♫</span><div><strong>No active projects yet</strong><p>The demo is not stored as your work. Create a score or restore an archived project to continue.</p></div>
              <button type="button" onClick={onCreateProject}>Create score</button>
            </article>
          )}
        </div>
      ) : (
        <div className="flower-workspace">
          <div className="flower-copy">
            <p>PROJECT WORKSPACES</p>
            <h1>Where do you want to work?</h1>
            <span>Choose a view. Every workspace edits the same score.</span>
          </div>
          <div className="flower-stage" aria-label="Project flower menu">
            <div className="flower-orbits" aria-hidden="true" />
            <article className="flower-project">
              <span>♫</span><strong>{score.metadata.title}</strong><small>{score.parts.length > 1 ? "Orchestral Score" : "Music Score"}</small>
            </article>
            {flowerTools.map((tool, index) => (
              <button
                type="button"
                className={`flower-tool flower-tool-${index + 1} ${preview.id === tool.id ? "previewing" : ""}`}
                key={tool.id}
                onMouseEnter={() => setPreviewId(tool.id)}
                onFocus={() => setPreviewId(tool.id)}
                onClick={() => tool.workspace && onNavigate(tool.workspace)}
                aria-describedby="flower-preview-description"
              >
                <span style={{ "--launcher-colour": tool.colour } as React.CSSProperties}>{tool.icon}</span>
                <strong>{tool.shortLabel ?? tool.label}</strong>
              </button>
            ))}
          </div>
          <aside className="flower-preview" aria-live="polite">
            <span className="flower-preview-icon" style={{ "--launcher-colour": preview.colour } as React.CSSProperties}>{preview.icon}</span>
            <div><strong>{preview.label}</strong><p id="flower-preview-description">{preview.description}</p></div>
            <ul>{preview.points?.map((point) => <li key={point}>{point}</li>)}</ul>
            <button type="button" onClick={() => preview.workspace && onNavigate(preview.workspace)}>Open {preview.label} <span>→</span></button>
          </aside>
        </div>
      )}
      {creationOpen ? (
        <div className="creation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreationOpen(false); }}>
          <section className="creation-dialog" role="dialog" aria-modal="true" aria-label="Create music">
            <header><div><span>NEW PROJECT</span><h2>How would you like to begin?</h2></div><button type="button" aria-label="Cancel new project" onClick={() => setCreationOpen(false)}>×</button></header>
            <button type="button" onClick={() => { setCreationOpen(false); onCreateProject(); }}><strong>Blank score</strong><span>Start with one piano staff and an empty measure.</span></button>
            <button type="button" onClick={() => { setCreationOpen(false); onNavigate("score"); }}><strong>Try the demo template</strong><span>Explore FoxChild before saving your own copy.</span></button>
            <button type="button" onClick={() => { setCreationOpen(false); onNavigate("omr-review"); }}><strong>Import music</strong><span>MusicXML, MIDI, AST JSON, PDF or image.</span></button>
            <button type="button" className="cancel" onClick={() => setCreationOpen(false)}>Cancel</button>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "edited just now";
  if (elapsed < 3_600_000) return `edited ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `edited ${Math.floor(elapsed / 3_600_000)}h ago`;
  return `edited ${new Date(value).toLocaleDateString()}`;
}
