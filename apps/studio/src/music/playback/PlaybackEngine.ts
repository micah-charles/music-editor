export type PlaybackNoteEvent = {
  id?: string;
  pitch: string;
  midi: number;
  measureNumber?: number;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
  isRest?: boolean;
  partId?: string;
  instrument?: string;
  channel?: number;
  midiProgram?: number;
  midiBank?: number;
};

export type PlaybackOptions = {
  bpm: number;
  speed: number;
  volume: number;
  onActivePitchesChange?: (pitches: string[]) => void;
  onActiveEventsChange?: (events: PlaybackNoteEvent[]) => void;
};

export interface PlaybackEngine {
  name: string;
  load?(): Promise<void>;
  play(events: PlaybackNoteEvent[], options: PlaybackOptions): Promise<void>;
  pause?(): void;
  resume?(): void;
  stop(): void;
  dispose?(): void;
}

export type PlaybackEngineMode = "basic-synth" | "sampled-piano" | "soundfont";

export function secondsPerBeat(options: PlaybackOptions): number {
  return 60 / (options.bpm * options.speed);
}

export function scheduleActivePitchCallbacks(
  events: PlaybackNoteEvent[],
  options: PlaybackOptions,
  startDelaySeconds = 0
): () => void {
  const onActivePitchesChange = options.onActivePitchesChange;
  const onActiveEventsChange = options.onActiveEventsChange;
  if ((!onActivePitchesChange && !onActiveEventsChange) || typeof window === "undefined") {
    return () => undefined;
  }

  const beatSeconds = secondsPerBeat(options);
  const activeEvents = new Map<string, PlaybackNoteEvent>();
  const changes = new Map<number, { starts: Array<{ key: string; event: PlaybackNoteEvent }>; stops: string[] }>();

  events.forEach((event, index) => {
    const key = event.id ?? `${event.partId ?? "part"}-${event.pitch}-${event.startBeat}-${index}`;
    const startMs = Math.max(0, Math.round((startDelaySeconds + event.startBeat * beatSeconds) * 1000));
    const stopMs = Math.max(startMs, Math.round((startDelaySeconds + (event.startBeat + event.durationBeats) * beatSeconds) * 1000));
    const startChange = changes.get(startMs) ?? { starts: [], stops: [] };
    startChange.starts.push({ key, event });
    changes.set(startMs, startChange);

    const stopChange = changes.get(stopMs) ?? { starts: [], stops: [] };
    stopChange.stops.push(key);
    changes.set(stopMs, stopChange);
  });

  emitActiveChanges(activeEvents, onActivePitchesChange, onActiveEventsChange);
  const timers = [...changes.entries()]
    .sort(([a], [b]) => a - b)
    .map(([timeMs, change]) => window.setTimeout(() => {
      change.stops.forEach((key) => activeEvents.delete(key));
      change.starts.forEach(({ key, event }) => activeEvents.set(key, event));
      emitActiveChanges(activeEvents, onActivePitchesChange, onActiveEventsChange);
    }, timeMs));

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    activeEvents.clear();
    emitActiveChanges(activeEvents, onActivePitchesChange, onActiveEventsChange);
  };
}

function emitActiveChanges(
  activeEvents: Map<string, PlaybackNoteEvent>,
  onActivePitchesChange?: (pitches: string[]) => void,
  onActiveEventsChange?: (events: PlaybackNoteEvent[]) => void
): void {
  const events = [...activeEvents.values()].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  onActivePitchesChange?.([...new Set(events.map((event) => event.pitch))]);
  onActiveEventsChange?.(events);
}
