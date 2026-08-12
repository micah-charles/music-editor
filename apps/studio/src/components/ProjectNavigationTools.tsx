import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceId } from "../config/workspaceRouting";

interface ProjectNavigationToolsProps {
  workspace: WorkspaceId;
  saveStatus: string;
  onNavigate: (workspace: WorkspaceId) => void;
  onSave: () => void;
  onValidate: () => void;
  onCloseProject: () => void;
}

type Command = {
  id: string;
  label: string;
  keywords: string;
  run: () => void;
};

export function ProjectNavigationTools({ workspace, saveStatus, onNavigate, onSave, onValidate, onCloseProject }: ProjectNavigationToolsProps) {
  const [flowerOpen, setFlowerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const flowerButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const commands = useMemo<Command[]>(() => [
    { id: "home", label: "Open Home", keywords: "launcher close project", run: () => onNavigate("home") },
    { id: "projects", label: "Open My Projects", keywords: "library recent", run: () => onNavigate("projects") },
    { id: "score", label: "Switch to Score", keywords: "notation", run: () => onNavigate("score") },
    { id: "tracks", label: "Switch to Track Editor", keywords: "timeline mixer", run: () => onNavigate("track-editor") },
    { id: "piano-roll", label: "Switch to Piano Roll", keywords: "notes grid", run: () => onNavigate("piano-roll") },
    { id: "perform", label: "Switch to Perform & Record", keywords: "midi keyboard", run: () => onNavigate("recording") },
    { id: "omr", label: "Open OMR Review", keywords: "pdf image import", run: () => onNavigate("omr-review") },
    { id: "save", label: "Save Project", keywords: "autosave local", run: onSave },
    { id: "musicxml", label: "Export MusicXML", keywords: "share", run: () => onNavigate("export") },
    { id: "midi", label: "Export MIDI", keywords: "daw share", run: () => onNavigate("export") },
    { id: "pdf", label: "Print / Save as PDF", keywords: "paper export", run: () => onNavigate("export") },
    { id: "validate", label: "Validate Score", keywords: "issues errors", run: onValidate },
    { id: "learning", label: "Open Learning", keywords: "practice review", run: () => onNavigate("learning") },
    { id: "settings", label: "Open Settings", keywords: "preferences developer", run: () => onNavigate("settings") },
    { id: "close", label: "Close Project", keywords: "home finish", run: onCloseProject }
  ], [onCloseProject, onNavigate, onSave, onValidate]);
  const visibleCommands = commands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === "Escape") {
        setFlowerOpen(false);
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (paletteOpen) window.setTimeout(() => searchRef.current?.focus(), 0);
    else setQuery("");
  }, [paletteOpen]);

  function run(command: Command) {
    command.run();
    setPaletteOpen(false);
    setFlowerOpen(false);
  }

  const petals: Array<[string, string, () => void]> = [
    ["SC", "Score", () => onNavigate("score")],
    ["TE", "Track Editor", () => onNavigate("track-editor")],
    ["PR", "Piano Roll", () => onNavigate("piano-roll")],
    ["PF", "Perform", () => onNavigate("recording")],
    ["OM", "OMR Review", () => onNavigate("omr-review")],
    ["PT", "Print", () => onNavigate("export")],
    ["SV", "Save", onSave],
    ["EX", "Export", () => onNavigate("export")]
  ];

  return (
    <>
      <div className={`project-flower-control ${flowerOpen ? "open" : ""}`}>
        {flowerOpen ? (
          <div className="project-flower-popover" role="dialog" aria-label="Project actions">
            <div className="project-flower-petals">
              {petals.map(([icon, label, action]) => <button type="button" key={`${icon}-${label}`} className={workspaceLabel(workspace) === label ? "active" : ""} onClick={() => { action(); setFlowerOpen(false); }}><span>{icon}</span><strong>{label}</strong></button>)}
            </div>
            <div className="project-flower-more">
              <button type="button" onClick={() => onNavigate("home")}>Home</button>
              <button type="button" onClick={() => onNavigate("projects")}>My Projects</button>
              <button type="button" onClick={() => setPaletteOpen(true)}>Commands</button>
              <button type="button" onClick={() => onNavigate("settings")}>Project Info</button>
              <button type="button" onClick={onCloseProject}>Close</button>
            </div>
            <small>{saveStatus}</small>
          </div>
        ) : null}
        <button
          type="button"
          className="project-flower-button"
          ref={flowerButtonRef}
          aria-label="Open project flower menu"
          aria-expanded={flowerOpen}
          onClick={() => setFlowerOpen((current) => !current)}
        >✦</button>
      </div>

      {paletteOpen ? (
        <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPaletteOpen(false); }}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
            <header><strong>Commands</strong><kbd>Esc</kbd></header>
            <input ref={searchRef} aria-label="Search commands" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands…" />
            <div>
              {visibleCommands.map((command) => <button type="button" key={command.id} onClick={() => run(command)}>{command.label}</button>)}
              {!visibleCommands.length ? <p>No matching commands.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function workspaceLabel(workspace: WorkspaceId) {
  return ({ score: "Score", "track-editor": "Track Editor", "piano-roll": "Piano Roll", recording: "Perform", "omr-review": "OMR Review", export: "Print" } as Partial<Record<WorkspaceId, string>>)[workspace];
}
