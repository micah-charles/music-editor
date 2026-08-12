import type { FoxChildMusicScore } from "@foxchild/music-core";

export type ProjectWorkspace =
  | "score"
  | "track-editor"
  | "piano-roll"
  | "recording"
  | "omr-review"
  | "export";

export type ProjectSourceKind = "blank" | "template" | "musicxml" | "midi" | "pdf" | "image" | "json";

export interface SavedProjectUiState {
  selectedPartId?: string;
  selectedEventId?: string;
  playheadBeat?: number;
  visibleMeasure?: number;
  trackEditorZoom?: number;
  scoreZoom?: number;
}

export interface SavedProject {
  schemaVersion: 1;
  id: string;
  title: string;
  composer?: string;
  subtitle?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  lastWorkspace: ProjectWorkspace;
  ast: FoxChildMusicScore;
  source?: {
    kind: ProjectSourceKind;
    originalFilename?: string;
    importedAt?: string;
  };
  uiState?: SavedProjectUiState;
  revision: number;
  archived?: boolean;
  favourite?: boolean;
}

export interface ProjectRecovery {
  projectId: string;
  title: string;
  capturedAt: string;
  baseRevision: number;
  ast: FoxChildMusicScore;
  uiState?: SavedProjectUiState;
}

export interface ProjectRevision {
  key: string;
  projectId: string;
  revision: number;
  createdAt: string;
  reason: "autosave" | "manual" | "restore";
  ast: FoxChildMusicScore;
}

export type ProjectSaveStatus = "saved" | "saving" | "unsaved" | "failed" | "recovered";
