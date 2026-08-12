import type { FoxChildMusicScore } from "@foxchild/music-core";
import type {
  ProjectRecovery,
  ProjectRevision,
  ProjectSourceKind,
  ProjectWorkspace,
  SavedProject,
  SavedProjectUiState
} from "./types";

const DATABASE_NAME = "foxchild-music-projects";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const REVISION_STORE = "revisions";
const RECOVERY_STORE = "recovery";
const MAX_REVISIONS_PER_PROJECT = 12;

export interface SaveProjectInput {
  id: string;
  ast: FoxChildMusicScore;
  lastWorkspace: ProjectWorkspace;
  uiState?: SavedProjectUiState;
  reason?: ProjectRevision["reason"];
}

export function createSavedProject(
  ast: FoxChildMusicScore,
  lastWorkspace: ProjectWorkspace = "score",
  now = new Date().toISOString()
): SavedProject {
  return {
    schemaVersion: 1,
    id: createProjectId(),
    title: ast.metadata.title || "Untitled Score",
    composer: ast.metadata.composer,
    subtitle: ast.metadata.subtitle,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    lastWorkspace,
    ast: structuredClone(ast),
    source: { kind: sourceKind(ast) },
    revision: 0,
    archived: false,
    favourite: false
  };
}

export function sortProjects(projects: SavedProject[], mode: "opened" | "edited" | "title" | "created" = "opened") {
  return [...projects].sort((left, right) => {
    if (mode === "title") return left.title.localeCompare(right.title);
    const field = mode === "edited" ? "updatedAt" : mode === "created" ? "createdAt" : "lastOpenedAt";
    const primary = right[field].localeCompare(left[field]);
    return primary || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export class ProjectRepository {
  private databasePromise?: Promise<IDBDatabase>;

  async listProjects(): Promise<SavedProject[]> {
    const database = await this.database();
    const projects = await request<SavedProject[]>(database.transaction(PROJECT_STORE).objectStore(PROJECT_STORE).getAll());
    return sortProjects(projects.map(migrateProject));
  }

  async getProject(id: string): Promise<SavedProject | undefined> {
    const database = await this.database();
    const project = await request<SavedProject | undefined>(database.transaction(PROJECT_STORE).objectStore(PROJECT_STORE).get(id));
    return project ? migrateProject(project) : undefined;
  }

  async addProject(project: SavedProject): Promise<SavedProject> {
    const database = await this.database();
    const migrated = migrateProject(project);
    await transactionDone(put(database, PROJECT_STORE, migrated));
    return migrated;
  }

  async saveProject(input: SaveProjectInput): Promise<SavedProject> {
    const database = await this.database();
    const transaction = database.transaction([PROJECT_STORE, REVISION_STORE], "readwrite");
    const projects = transaction.objectStore(PROJECT_STORE);
    const revisions = transaction.objectStore(REVISION_STORE);
    const existing = await request<SavedProject | undefined>(projects.get(input.id));
    if (!existing) throw new Error("This project is no longer available in My Projects.");
    const now = new Date().toISOString();
    const nextRevision = existing.revision + 1;
    const checkpoint: ProjectRevision = {
      key: `${existing.id}:${nextRevision}`,
      projectId: existing.id,
      revision: nextRevision,
      createdAt: now,
      reason: input.reason ?? "autosave",
      ast: structuredClone(existing.ast)
    };
    const updated: SavedProject = {
      ...existing,
      title: input.ast.metadata.title || existing.title,
      composer: input.ast.metadata.composer,
      subtitle: input.ast.metadata.subtitle,
      updatedAt: now,
      lastOpenedAt: now,
      lastWorkspace: input.lastWorkspace,
      ast: structuredClone(input.ast),
      uiState: input.uiState,
      revision: nextRevision
    };
    revisions.put(checkpoint);
    projects.put(updated);
    await transactionComplete(transaction);
    await this.trimRevisions(existing.id);
    return updated;
  }

  async updateProject(id: string, patch: Partial<Pick<SavedProject, "title" | "favourite" | "archived" | "lastWorkspace" | "lastOpenedAt">>): Promise<SavedProject> {
    const existing = await this.getProject(id);
    if (!existing) throw new Error("Project not found.");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await transactionDone(put(await this.database(), PROJECT_STORE, updated));
    return updated;
  }

  async duplicateProject(id: string): Promise<SavedProject> {
    const existing = await this.getProject(id);
    if (!existing) throw new Error("Project not found.");
    const copy = createSavedProject(
      { ...structuredClone(existing.ast), id: `${existing.ast.id}-copy`, metadata: { ...existing.ast.metadata, title: `${existing.title} Copy` } },
      existing.lastWorkspace
    );
    copy.favourite = existing.favourite;
    return this.addProject(copy);
  }

  async deleteProject(id: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction([PROJECT_STORE, REVISION_STORE, RECOVERY_STORE], "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(id);
    transaction.objectStore(RECOVERY_STORE).delete(id);
    const revisions = await request<ProjectRevision[]>(transaction.objectStore(REVISION_STORE).index("projectId").getAll(id));
    revisions.forEach((revision) => transaction.objectStore(REVISION_STORE).delete(revision.key));
    await transactionComplete(transaction);
  }

  async listRevisions(projectId: string): Promise<ProjectRevision[]> {
    const database = await this.database();
    const values = await request<ProjectRevision[]>(database.transaction(REVISION_STORE).objectStore(REVISION_STORE).index("projectId").getAll(projectId));
    return values.sort((left, right) => right.revision - left.revision);
  }

  async putRecovery(recovery: ProjectRecovery): Promise<void> {
    await transactionDone(put(await this.database(), RECOVERY_STORE, recovery));
  }

  async getRecoveries(): Promise<ProjectRecovery[]> {
    const database = await this.database();
    return request<ProjectRecovery[]>(database.transaction(RECOVERY_STORE).objectStore(RECOVERY_STORE).getAll());
  }

  async clearRecovery(projectId: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).delete(projectId);
    await transactionComplete(transaction);
  }

  private async trimRevisions(projectId: string) {
    const database = await this.database();
    const transaction = database.transaction(REVISION_STORE, "readwrite");
    const store = transaction.objectStore(REVISION_STORE);
    const revisions = await request<ProjectRevision[]>(store.index("projectId").getAll(projectId));
    revisions.sort((left, right) => right.revision - left.revision)
      .slice(MAX_REVISIONS_PER_PROJECT)
      .forEach((revision) => store.delete(revision.key));
    await transactionComplete(transaction);
  }

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable. Your project cannot be saved in this browser."));
      this.databasePromise = new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        openRequest.onupgradeneeded = () => {
          const database = openRequest.result;
          if (!database.objectStoreNames.contains(PROJECT_STORE)) database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
          if (!database.objectStoreNames.contains(RECOVERY_STORE)) database.createObjectStore(RECOVERY_STORE, { keyPath: "projectId" });
          if (!database.objectStoreNames.contains(REVISION_STORE)) {
            const revisions = database.createObjectStore(REVISION_STORE, { keyPath: "key" });
            revisions.createIndex("projectId", "projectId", { unique: false });
          }
        };
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error ?? new Error("Could not open the project library."));
        openRequest.onblocked = () => reject(new Error("Project storage upgrade is blocked by another FoxChild tab."));
      });
    }
    return this.databasePromise;
  }
}

export const projectRepository = new ProjectRepository();

function put(database: IDBDatabase, storeName: string, value: unknown) {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  return transaction;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("Project storage request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Project storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Project storage transaction was cancelled."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return transactionComplete(transaction);
}

function migrateProject(project: SavedProject): SavedProject {
  return {
    ...project,
    schemaVersion: 1,
    revision: Number(project.revision) || 0,
    archived: Boolean(project.archived),
    favourite: Boolean(project.favourite)
  };
}

function createProjectId() {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sourceKind(ast: FoxChildMusicScore): ProjectSourceKind {
  const source = ast.sourceMetadata?.originalFormat?.toLowerCase() ?? ast.metadata.source?.toLowerCase() ?? "";
  if (source.includes("musicxml")) return "musicxml";
  if (source.includes("midi")) return "midi";
  if (source.includes("omr") || source.includes("pdf")) return "pdf";
  if (source.includes("image")) return "image";
  if (source.includes("json")) return "json";
  return "blank";
}
