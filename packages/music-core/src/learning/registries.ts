import type {
  AssessmentStrategy,
  InteractionKind,
  MusicQuestionGenerator,
  StimulusKind
} from "./types";

export class UnsupportedLearningContentError extends Error {
  constructor(public readonly category: string, public readonly id: string) {
    super(`Unsupported ${category}: ${id}`);
    this.name = "UnsupportedLearningContentError";
  }
}

class Registry<T extends { id: string }> {
  private readonly entries = new Map<string, T>();

  register(entry: T): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`Registry entry "${entry.id}" is already registered.`);
    }
    this.entries.set(entry.id, entry);
  }

  resolve(id: string): T {
    const entry = this.entries.get(id);
    if (!entry) throw new UnsupportedLearningContentError("registry entry", id);
    return entry;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  ids(): string[] {
    return [...this.entries.keys()].sort();
  }
}

export class AssessmentStrategyRegistry extends Registry<AssessmentStrategy> {
  override resolve(id: string): AssessmentStrategy {
    const entry = super.resolve(id);
    return entry;
  }
}

export class MusicGeneratorRegistry extends Registry<MusicQuestionGenerator> {}

export interface RuntimeRegistration<TKind extends string> {
  id: TKind;
  label: string;
  responseBaseTypes?: string[];
}

export class StimulusRendererRegistry extends Registry<RuntimeRegistration<StimulusKind>> {}
export class InteractionRegistry extends Registry<RuntimeRegistration<InteractionKind>> {}

export function createDefaultStimulusRegistry(): StimulusRendererRegistry {
  const registry = new StimulusRendererRegistry();
  const kinds: StimulusKind[] = [
    "text", "rich-text", "notation", "audio", "image", "video",
    "music-symbol", "piano-keyboard", "metronome", "mixed"
  ];
  kinds.forEach((id) => registry.register({ id, label: id.replaceAll("-", " ") }));
  return registry;
}

export function createDefaultInteractionRegistry(): InteractionRegistry {
  const registry = new InteractionRegistry();
  const registrations: Array<RuntimeRegistration<InteractionKind>> = [
    { id: "choice", label: "Choice", responseBaseTypes: ["identifier", "identifier-set"] },
    { id: "text-entry", label: "Text entry", responseBaseTypes: ["string"] },
    { id: "numeric-entry", label: "Numeric entry", responseBaseTypes: ["number"] },
    { id: "matching", label: "Matching", responseBaseTypes: ["mapping"] },
    { id: "ordering", label: "Ordering", responseBaseTypes: ["ordering"] },
    { id: "drag-drop", label: "Drag and drop", responseBaseTypes: ["mapping", "ordering"] },
    { id: "score-drag-drop", label: "Score drag and drop", responseBaseTypes: ["score-patch", "mapping"] },
    { id: "hotspot", label: "Hotspot", responseBaseTypes: ["identifier", "identifier-set"] },
    { id: "music-keyboard", label: "Music keyboard", responseBaseTypes: ["pitch", "pitch-set", "pitch-sequence", "midi-performance"] },
    { id: "notation-entry", label: "Notation entry", responseBaseTypes: ["score-ast", "score-patch"] },
    { id: "rhythm-tap", label: "Rhythm tapping", responseBaseTypes: ["rhythm", "midi-performance"] },
    { id: "audio-recording", label: "Audio recording", responseBaseTypes: ["audio-recording"] },
    { id: "sight-reading", label: "Sight reading", responseBaseTypes: ["midi-performance"] },
    { id: "composition", label: "Composition", responseBaseTypes: ["score-ast"] },
    { id: "composite", label: "Composite", responseBaseTypes: ["mapping"] }
  ];
  registrations.forEach((entry) => registry.register(entry));
  return registry;
}
