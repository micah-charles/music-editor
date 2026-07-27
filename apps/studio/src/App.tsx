import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  analyseDifficulty,
  astToLearningPack,
  astToMusicXml,
  beatsToDuration,
  DURATION_BEATS,
  detectChordName,
  eventsToMeasures,
  getBeatsPerMeasure,
  parsePitchName,
  pitchToName,
  splitBeatsIntoDurations,
  simpleMelodyAst,
  validateScore,
  withMeasureValidation,
  type FoxChildMusicScore,
  type Duration,
  type MeasureValidationResult,
  type MusicEvent,
  type NoteDurationValue,
  type Part
} from "@foxchild/music-core";
import { ExportPanel } from "./components/ExportPanel";
import { ChordProgressionPanel } from "./components/ChordProgressionPanel";
import { ImportPanel } from "./components/ImportPanel";
import { JsonEditor } from "./components/JsonEditor";
import { LearningPanel } from "./components/LearningPanel";
import { NoteEditor } from "./components/NoteEditor";
import { OmrImportPanel } from "./components/OmrImportPanel";
import { OmrFidelityReview } from "./components/OmrFidelityReview";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { PlaybackControls } from "./components/PlaybackControls";
import { ScoreMetadataEditor } from "./components/ScoreMetadataEditor";
import { ScoreViewer } from "./components/ScoreViewer";
import {
  attachMidiInput,
  CHORD_CAPTURE_WINDOW_MS,
  listMidiInputDevices,
  requestMidiInputs,
  type MidiAccessLike,
  type MidiInputDevice,
  type MidiNoteMessage,
  type MidiRecordMode
} from "./music/midi/midiInput";
import { NoteAudition } from "./music/playback/NoteAudition";
import { BrowserMetronome, type MetronomeBeat } from "./music/playback/metronome";
import { usePlaybackActiveEvents, usePlaybackSessionController } from "./music/playback/session/usePlaybackSession";
import { generalMidiPresetOptions, type SoundFontPresetOption } from "./music/playback/soundfontPresets";
import { SharedRecordingClock } from "./music/recording/recordingClock";
import { quantizeBeatsToDuration, quantizeStartBeat, type QuantizeGrid } from "./music/rhythm/quantizeDuration";

type InputMode = "fixed" | "performed";
type RecordingStrategy = "overdub" | "replace";
type MeasureFillMode = "ask" | "auto-advance" | "shorten" | "allow-overfill";
type AppliedMeasureFillMode = Exclude<MeasureFillMode, "ask">;
type HeldPitch = {
  pitch: string;
  startBeat: number;
  startedAtMs: number;
};
type CompletedHeldPitch = HeldPitch & {
  duration: ReturnType<typeof quantizeBeatsToDuration>;
};
type PendingOverfill = {
  event: MusicEvent;
  message: string;
  startBeat?: number;
};

type WorkspaceId = "score" | "piano-input" | "piano-roll" | "mixer" | "recording" | "omr-review" | "analysis" | "learning" | "export" | "settings";
type InspectorDock = "right" | "left" | "float";
type KeyboardSize = "compact" | "performance" | "teaching" | "fullscreen";
type UiLayoutState = {
  workspace: WorkspaceId;
  navigationCollapsed: boolean;
  inspectorVisible: boolean;
  inspectorCollapsed: boolean;
  inspectorDock: InspectorDock;
  inspectorWidth: number;
  keyboardVisible: boolean;
  keyboardSize: KeyboardSize;
  keyboardHeight: number;
  validationExpanded: boolean;
};

const UI_LAYOUT_STORAGE_KEY = "foxchild-ui-3-layout-v1";

function isMeasureTimingValidationMessage(message: string): boolean {
  return /^Measure \d+: .+ \/ .+ beats; (?:missing|extra) .+ beat\.$/.test(message);
}

const defaultUiLayout: UiLayoutState = {
  workspace: "score",
  navigationCollapsed: false,
  inspectorVisible: true,
  inspectorCollapsed: false,
  inspectorDock: "right",
  inspectorWidth: 280,
  keyboardVisible: false,
  keyboardSize: "performance",
  keyboardHeight: 250,
  validationExpanded: false
};

const workspaces: Array<{ id: WorkspaceId; icon: string; label: string; section?: "library" }> = [
  { id: "score", icon: "SC", label: "Score" },
  { id: "piano-input", icon: "PI", label: "Piano Input" },
  { id: "piano-roll", icon: "PR", label: "Piano Roll" },
  { id: "mixer", icon: "MX", label: "Mixer" },
  { id: "recording", icon: "RC", label: "Recording" },
  { id: "omr-review", icon: "OM", label: "OMR Review" },
  { id: "analysis", icon: "AN", label: "AI Analysis" },
  { id: "learning", icon: "LR", label: "Learning" },
  { id: "export", icon: "EX", label: "Export" },
  { id: "settings", icon: "ST", label: "Settings", section: "library" }
];
const durationValues = Object.keys(DURATION_BEATS) as NoteDurationValue[];

export function App() {
  const playbackController = usePlaybackSessionController();
  const playbackActiveEvents = usePlaybackActiveEvents();
  const [score, setScore] = useState<FoxChildMusicScore>(() => withMeasureValidation(simpleMelodyAst));
  const [trackVolumes, setTrackVolumes] = useState<Record<string, number>>(() => playbackVolumesFromScore(simpleMelodyAst));
  const [undoStack, setUndoStack] = useState<FoxChildMusicScore[]>([]);
  const [redoStack, setRedoStack] = useState<FoxChildMusicScore[]>([]);
  const [previewScore, setPreviewScore] = useState<FoxChildMusicScore | null>(null);
  const [uiLayout, setUiLayout] = useState<UiLayoutState>(loadUiLayout);
  const [message, setMessage] = useState("Loaded demo AST score.");
  const [activePartId, setActivePartId] = useState(simpleMelodyAst.parts[0].id);
  const [keyboardPressedPitches, setKeyboardPressedPitches] = useState<string[]>([]);
  const [selectedChordPitches, setSelectedChordPitches] = useState<string[]>([]);
  const [keyboardDuration, setKeyboardDuration] = useState<NoteDurationValue>("quarter");
  const [keyboardChordMode, setKeyboardChordMode] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("fixed");
  const [quantizeGrid, setQuantizeGrid] = useState<QuantizeGrid>("eighth");
  const [measureFillMode, setMeasureFillMode] = useState<MeasureFillMode>("ask");
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInBars, setCountInBars] = useState(0);
  const [metronomeBeat, setMetronomeBeat] = useState<MetronomeBeat | null>(null);
  const [midiAccess, setMidiAccess] = useState<MidiAccessLike | null>(null);
  const [midiDevices, setMidiDevices] = useState<MidiInputDevice[]>([]);
  const [selectedMidiInputId, setSelectedMidiInputId] = useState("");
  const [midiRecordMode, setMidiRecordMode] = useState<MidiRecordMode>("off");
  const [recordingStrategy, setRecordingStrategy] = useState<RecordingStrategy>("overdub");
  const [midiActivePitches, setMidiActivePitches] = useState<string[]>([]);
  const [midiStatus, setMidiStatus] = useState("MIDI disabled");
  const [soundFontPresetOptions, setSoundFontPresetOptions] = useState<SoundFontPresetOption[]>(generalMidiPresetOptions);
  const [pendingOverfill, setPendingOverfill] = useState<PendingOverfill | null>(null);
  const midiChordCaptureRef = useRef<{ pitches: string[]; timer?: number }>({ pitches: [] });
  const noteAuditionRef = useRef<NoteAudition | null>(null);
  const metronomeRef = useRef<BrowserMetronome | null>(null);
  const recordingClockRef = useRef(new SharedRecordingClock(
    simpleMelodyAst.global.tempo.bpm,
    1,
    () => sessionRecordingBeat(playbackController)
  ));
  const heldPitchesRef = useRef(new Map<string, HeldPitch>());
  const performedChordCaptureRef = useRef<{ notes: CompletedHeldPitch[]; timer?: number }>({ notes: [] });
  const replaceOnNextRecordedEventRef = useRef(false);
  const lastAudibleTrackVolumeRef = useRef<Record<string, number>>(playbackVolumesFromScore(simpleMelodyAst));

  const validation = useMemo(() => validateScore(score), [score]);
  const structuralValidationErrors = useMemo(
    () => validation.errors.filter((message) => !isMeasureTimingValidationMessage(message)),
    [validation.errors]
  );
  const structuralValidationWarnings = useMemo(
    () => validation.warnings.filter((message) => !isMeasureTimingValidationMessage(message)),
    [validation.warnings]
  );
  const analysis = useMemo(() => analyseDifficulty(score), [score]);
  const musicXml = useMemo(() => astToMusicXml(score), [score]);
  const notationMusicXml = useMemo(() => {
    const visibleParts = score.parts.filter((part) => part.visible !== false);
    return astToMusicXml(visibleParts.length > 0 ? { ...score, parts: visibleParts } : score);
  }, [score]);
  const learningPack = useMemo(() => astToLearningPack(score), [score]);
  const measureCount = new Set(score.parts.flatMap((part) => part.measures.map((measure) => measure.number))).size;

  const measureIssues = useMemo(() => score.validation?.measures.filter((measure) => measure.status !== "complete") ?? [], [score]);
  const playbackActivePitches = useMemo(() => uniquePitches(playbackActiveEvents.map((event) => event.pitch)), [playbackActiveEvents]);
  const activeKeyboardPitches = useMemo(() => uniquePitches([...playbackActivePitches, ...keyboardPressedPitches, ...midiActivePitches]), [keyboardPressedPitches, midiActivePitches, playbackActivePitches]);
  const keyboardIsVisible = uiLayout.keyboardVisible
    || uiLayout.workspace === "piano-input"
    || uiLayout.workspace === "recording"
    || midiDevices.length > 0
    || midiRecordMode !== "off";

  useEffect(() => {
    window.localStorage.setItem(UI_LAYOUT_STORAGE_KEY, JSON.stringify(uiLayout));
  }, [uiLayout]);

  useEffect(() => {
    if (!score.parts.some((part) => part.id === activePartId)) {
      setActivePartId(score.parts[0]?.id ?? "");
    }
  }, [activePartId, score.parts]);

  useEffect(() => {
    setTrackVolumes((current) => {
      const next = Object.fromEntries(score.parts.map((part) => [
        part.id,
        current[part.id] ?? (part.muted ? 0 : clampVolume(part.volume ?? 1))
      ]));
      return sameTrackVolumes(current, next) ? current : next;
    });
  }, [score.parts]);

  useEffect(() => {
    if (!midiAccess || !selectedMidiInputId) {
      return undefined;
    }

    try {
      const cleanup = attachMidiInput(midiAccess, selectedMidiInputId, handleMidiMessage);
      const device = midiDevices.find((item) => item.id === selectedMidiInputId);
      setMidiStatus(`Listening to ${device?.name ?? "MIDI input"}.`);
      return cleanup;
    } catch (error) {
      setMidiStatus(errorMessage(error));
      return undefined;
    }
  }, [keyboardDuration, midiAccess, midiDevices, midiRecordMode, recordingStrategy, score, selectedMidiInputId]);

  useEffect(() => {
    return () => {
      if (midiChordCaptureRef.current.timer) {
        window.clearTimeout(midiChordCaptureRef.current.timer);
      }
      if (performedChordCaptureRef.current.timer) {
        window.clearTimeout(performedChordCaptureRef.current.timer);
      }
      if (midiAccess) {
        midiAccess.onstatechange = null;
      }
      noteAuditionRef.current?.dispose();
    };
  }, [midiAccess]);

  useEffect(() => {
    recordingClockRef.current = new SharedRecordingClock(
      score.global.tempo.bpm,
      playbackController.getSnapshot().speed,
      () => sessionRecordingBeat(playbackController)
    );
    const countInBeats = metronomeOn ? -countInBars * getBeatsPerMeasure(score.global.timeSignature) : 0;
    recordingClockRef.current.start(countInBeats);
  }, [countInBars, inputMode, metronomeOn, playbackController, score.global.tempo.bpm, score.global.timeSignature]);

  useEffect(() => {
    metronomeRef.current ??= new BrowserMetronome();
    if (!metronomeOn) {
      metronomeRef.current.stop();
      setMetronomeBeat(null);
      return undefined;
    }

    metronomeRef.current.start({
      bpm: score.global.tempo.bpm,
      beatsPerMeasure: score.global.timeSignature.beats,
      countInBars,
      clock: recordingClockRef.current,
      onBeat: setMetronomeBeat
    });

    return () => metronomeRef.current?.stop();
  }, [countInBars, metronomeOn, playbackController, score.global.tempo.bpm, score.global.timeSignature.beats]);

  function acceptScore(nextScore: FoxChildMusicScore, nextMessage: string) {
    const decoratedScore = withMeasureValidation({
      ...nextScore,
      metadata: {
        ...nextScore.metadata,
        updatedAt: new Date().toISOString().slice(0, 10)
      }
    }, score);
    setUndoStack((current) => [...current.slice(-49), score]);
    setRedoStack([]);
    setScore(decoratedScore);
    setPreviewScore(null);
    setMessage(nextMessage);
  }

  function togglePartSound(partId: string) {
    const part = score.parts.find((item) => item.id === partId);
    if (!part) return;
    const currentVolume = trackVolumes[partId] ?? (part.muted ? 0 : clampVolume(part.volume ?? 1));
    if (currentVolume > 0) {
      lastAudibleTrackVolumeRef.current[partId] = currentVolume;
      setPartPlaybackVolume(partId, 0);
      setMessage(`${part.name} muted. Playback continues.`);
    } else {
      const restoredVolume = lastAudibleTrackVolumeRef.current[partId] ?? (clampVolume(part.volume ?? 1) || 0.8);
      setPartPlaybackVolume(partId, restoredVolume);
      setMessage(`${part.name} restored to ${Math.round(restoredVolume * 100)}%. Playback continues.`);
    }
  }

  function setPartPlaybackVolume(partId: string, volume: number) {
    const nextVolume = clampVolume(volume);
    if (nextVolume > 0) {
      lastAudibleTrackVolumeRef.current[partId] = nextVolume;
    }
    setTrackVolumes((current) => current[partId] === nextVolume
      ? current
      : { ...current, [partId]: nextVolume });
  }

  function previewPlayback(nextScore: FoxChildMusicScore, nextMessage: string) {
    setPreviewScore(withMeasureValidation(nextScore, score));
    setMessage(nextMessage);
  }

  function addMissingRest(issue: MeasureValidationResult) {
    if (issue.status !== "underfilled" || !issue.missingBeats) {
      return;
    }
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((item) => item.id === issue.partId);
    const measure = part?.measures.find((item) => item.number === issue.measure);
    if (!measure) {
      return;
    }
    const duration = beatsToDuration(issue.missingBeats);
    measure.events.push({
      id: `rest-${Date.now()}`,
      type: "rest",
      duration
    });
    acceptScore(next, `Added ${duration.value.replaceAll("-", " ")} rest to measure ${issue.measure}.`);
  }

  function stretchLastNote(issue: MeasureValidationResult) {
    if (issue.status !== "underfilled" || !issue.missingBeats) {
      return;
    }
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((item) => item.id === issue.partId);
    const measure = part?.measures.find((item) => item.number === issue.measure);
    const lastTimedEvent = measure ? [...measure.events].reverse().find((event) => event.type !== "annotation" && event.type !== "direction") : undefined;
    if (!lastTimedEvent) {
      return;
    }
    const currentBeats = lastTimedEvent.duration.beats ?? DURATION_BEATS[lastTimedEvent.duration.value];
    lastTimedEvent.duration = beatsToDuration(currentBeats + issue.missingBeats);
    acceptScore(next, `Stretched the last note in measure ${issue.measure}.`);
  }

  function revertLastChange() {
    const previousScore = undoStack[undoStack.length - 1];
    if (!previousScore) {
      return;
    }
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-49), score]);
    setScore(withMeasureValidation(previousScore));
    setMessage("Reverted the last score change.");
  }

  function redoLastChange() {
    const nextScore = redoStack[redoStack.length - 1];
    if (!nextScore) {
      return;
    }
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-49), score]);
    setScore(withMeasureValidation(nextScore));
    setMessage("Restored the next score change.");
  }

  function insertKeyboardEvent(event: MusicEvent, nextMessage: string, startBeat?: number, forcedFillMode?: AppliedMeasureFillMode, replaceExisting = false) {
    if (!activePartId) {
      return;
    }
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((item) => item.id === activePartId) ?? next.parts[0];
    if (!part) {
      return;
    }
    if (replaceExisting && replaceOnNextRecordedEventRef.current) {
      part.measures = [{ number: 1, events: [] }];
      replaceOnNextRecordedEventRef.current = false;
    }
    const beatsPerMeasure = getBeatsPerMeasure(next.global.timeSignature);
    const overfill = getOverfillInfo(part, event, beatsPerMeasure, startBeat);
    if (overfill && measureFillMode === "ask" && !forcedFillMode) {
      setPendingOverfill({
        event,
        startBeat,
        message: `This note overfills bar ${overfill.measureNumber} by ${overfill.extraBeats} beat.`
      });
      setMessage("Choose how to handle the overfilled bar.");
      return;
    }
    appendEventToPart(part, event, {
      beatsPerMeasure,
      startBeat,
      fillMode: forcedFillMode ?? (measureFillMode === "ask" ? "auto-advance" : measureFillMode)
    });
    setPendingOverfill(null);
    acceptScore(next, nextMessage);
  }

  function resolvePendingOverfill(fillMode: AppliedMeasureFillMode) {
    if (!pendingOverfill) {
      return;
    }
    insertKeyboardEvent(pendingOverfill.event, `Handled overfill with ${fillMode.replace("-", " ")}.`, pendingOverfill.startBeat, fillMode);
  }

  function insertKeyboardNote(pitchName: string, duration: Duration = {
    value: keyboardDuration,
    beats: DURATION_BEATS[keyboardDuration]
  }, startBeat?: number, replaceExisting = false) {
    const pitch = parsePitchName(pitchName);
    insertKeyboardEvent({
      id: `keyboard-note-${Date.now()}`,
      type: "note",
      pitch,
      duration
    }, `Inserted ${pitchName} ${duration.value.replaceAll("-", " ")} note.`, startBeat, undefined, replaceExisting);
  }

  function insertKeyboardChord(pitchNames: string[], duration: Duration = {
    value: keyboardDuration,
    beats: DURATION_BEATS[keyboardDuration]
  }, startBeat?: number, replaceExisting = false) {
    const unique = uniquePitches(pitchNames);
    if (unique.length === 0) {
      return;
    }
    if (unique.length === 1) {
      insertKeyboardNote(unique[0], duration, startBeat, replaceExisting);
      return;
    }
    const pitches = unique.map(parsePitchName);
    const chordName = detectChordName(pitches);
    insertKeyboardEvent({
      id: `keyboard-chord-${Date.now()}`,
      type: "chord",
      pitches,
      duration,
      semantic: { chordName }
    }, `Inserted ${chordName} chord: ${unique.join(", ")}.`, startBeat, undefined, replaceExisting);
    setSelectedChordPitches([]);
  }

  function handleKeyboardPress(pitch: string, modifiers: { shiftKey: boolean }) {
    if (inputMode === "performed") {
      if (keyboardChordMode || modifiers.shiftKey) {
        setSelectedChordPitches((current) => {
          return current.includes(pitch)
            ? current.filter((item) => item !== pitch)
            : [...current, pitch];
        });
      }
      return;
    }

    if (keyboardChordMode || modifiers.shiftKey) {
      setSelectedChordPitches((current) => {
        return current.includes(pitch)
          ? current.filter((item) => item !== pitch)
          : [...current, pitch];
      });
      return;
    }
    insertKeyboardNote(pitch);
  }

  function beginPerformedPitch(source: "ui" | "midi", pitch: string) {
    const key = `${source}:${pitch}`;
    if (heldPitchesRef.current.has(key)) {
      return;
    }
    heldPitchesRef.current.set(key, {
      pitch,
      startBeat: quantizeStartBeat(recordingClockRef.current.getCurrentBeat(), quantizeGrid),
      startedAtMs: performance.now()
    });
  }

  function finishPerformedPitch(source: "ui" | "midi", pitch: string, asChord: boolean) {
    const key = `${source}:${pitch}`;
    const held = heldPitchesRef.current.get(key);
    if (!held) {
      return;
    }
    heldPitchesRef.current.delete(key);

    const heldBeats = Math.max(0.01, recordingClockRef.current.getCurrentBeat() - held.startBeat);
    const duration = quantizeBeatsToDuration(heldBeats, quantizeGrid);
    const completed = { ...held, duration };
    if (asChord) {
      queuePerformedChord(completed);
      return;
    }
    insertKeyboardNote(pitch, duration, held.startBeat, source === "midi" && recordingStrategy === "replace");
  }

  function queuePerformedChord(note: CompletedHeldPitch) {
    performedChordCaptureRef.current.notes = [...performedChordCaptureRef.current.notes, note];
    if (performedChordCaptureRef.current.timer) {
      window.clearTimeout(performedChordCaptureRef.current.timer);
    }
    performedChordCaptureRef.current.timer = window.setTimeout(() => {
      const notes = performedChordCaptureRef.current.notes;
      performedChordCaptureRef.current = { notes: [] };
      if (notes.length === 0) {
        return;
      }
      const pitches = uniquePitches(notes.map((note) => note.pitch));
      const duration = notes.reduce((longest, note) => {
        return (note.duration.beats ?? 0) > (longest.beats ?? 0) ? note.duration : longest;
      }, notes[0].duration);
      const startBeat = Math.min(...notes.map((note) => note.startBeat));
      insertKeyboardChord(pitches, duration, startBeat, recordingStrategy === "replace");
    }, CHORD_CAPTURE_WINDOW_MS);
  }

  function setKeyboardPressed(pitch: string, pressed: boolean) {
    setKeyboardPressedPitches((current) => {
      if (pressed) {
        return current.includes(pitch) ? current : [...current, pitch];
      }
      return current.filter((item) => item !== pitch);
    });
  }

  function auditionNoteOn(pitch: string, velocity = 0.75) {
    noteAuditionRef.current ??= new NoteAudition();
    noteAuditionRef.current.noteOn(pitch, velocity);
  }

  function auditionNoteOff(pitch: string) {
    noteAuditionRef.current?.noteOff(pitch);
  }

  async function enableMidi() {
    try {
      const next = await requestMidiInputs();
      setMidiAccess(next.access);
      setMidiDevices(next.devices);
      setSelectedMidiInputId((current) => current || next.devices[0]?.id || "");
      setMidiStatus(next.devices.length > 0 ? "MIDI enabled." : "MIDI enabled, no input devices found.");
      next.access.onstatechange = () => {
        const devices = listMidiInputDevices(next.access);
        setMidiDevices(devices);
        setMidiStatus(devices.length > 0 ? "MIDI devices refreshed." : "No MIDI input devices found.");
      };
    } catch (error) {
      setMidiStatus(errorMessage(error));
    }
  }

  function handleMidiMessage(message: MidiNoteMessage) {
    if (message.type === "note-on") {
      setMidiActivePitches((current) => current.includes(message.pitch) ? current : [...current, message.pitch]);
      auditionNoteOn(message.pitch, message.velocity / 127);
      if (inputMode === "performed" && midiRecordMode !== "off") {
        beginPerformedPitch("midi", message.pitch);
        return;
      }
      if (midiRecordMode === "insert-notes") {
        insertKeyboardNote(message.pitch, undefined, undefined, recordingStrategy === "replace");
      } else if (midiRecordMode === "insert-chords") {
        queueMidiChordPitch(message.pitch);
      }
      return;
    }

    setMidiActivePitches((current) => current.filter((pitch) => pitch !== message.pitch));
    auditionNoteOff(message.pitch);
    if (inputMode === "performed" && midiRecordMode !== "off") {
      finishPerformedPitch("midi", message.pitch, midiRecordMode === "insert-chords");
    }
  }

  function queueMidiChordPitch(pitch: string) {
    const capture = midiChordCaptureRef.current;
    capture.pitches = uniquePitches([...capture.pitches, pitch]);
    if (capture.timer) {
      return;
    }
    capture.timer = window.setTimeout(() => {
      const pitches = midiChordCaptureRef.current.pitches;
      midiChordCaptureRef.current = { pitches: [] };
      insertKeyboardChord(pitches, undefined, undefined, recordingStrategy === "replace");
    }, CHORD_CAPTURE_WINDOW_MS);
  }

  function updateUiLayout(patch: Partial<UiLayoutState>) {
    setUiLayout((current) => ({ ...current, ...patch }));
  }

  function selectWorkspace(workspace: WorkspaceId) {
    updateUiLayout({
      workspace,
      ...(workspace === "piano-input" ? { keyboardVisible: true, keyboardSize: "performance" } : {}),
      ...(workspace === "recording" ? { keyboardVisible: true, keyboardSize: "teaching" } : {})
    });
  }

  function beginInspectorResize(event: React.PointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = uiLayout.inspectorWidth;
    const direction = uiLayout.inspectorDock === "left" ? 1 : -1;
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.min(520, Math.max(260, startWidth + (moveEvent.clientX - startX) * direction));
      updateUiLayout({ inspectorWidth: Math.round(width) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function beginKeyboardResize(event: React.PointerEvent<HTMLDivElement>) {
    const startY = event.clientY;
    const startHeight = uiLayout.keyboardHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const height = Math.min(520, Math.max(170, startHeight + startY - moveEvent.clientY));
      updateUiLayout({ keyboardHeight: Math.round(height), keyboardSize: "performance" });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const workspaceLabel = workspaces.find((workspace) => workspace.id === uiLayout.workspace)?.label ?? "Score";
  const validationIssueCount = structuralValidationErrors.length
    + structuralValidationWarnings.length
    + measureIssues.length
    + (score.sourceMetadata?.warnings?.length ?? 0);

  return (
    <div className={`app-shell ui3 keyboard-${keyboardIsVisible ? "open" : "closed"}`}>
      <header className="app-header workstation-header">
        <button
          type="button"
          className="brand-mark"
          aria-label="Toggle workspace navigation"
          title="Toggle workspace navigation"
          onClick={() => updateUiLayout({ navigationCollapsed: !uiLayout.navigationCollapsed })}
        >FC</button>
        <div className="brand-title">FoxChild Music Score Lab</div>
        <div className="document-title-block">
          <strong>{score.metadata.title}</strong>
          <span>{workspaceLabel}</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`warning-button ${validationIssueCount > 0 ? "has-issues" : ""}`}
            onClick={() => updateUiLayout({ inspectorVisible: true, inspectorCollapsed: false, validationExpanded: true })}
          >{validationIssueCount} issue{validationIssueCount === 1 ? "" : "s"}</button>
          <button type="button" className="icon-button" onClick={revertLastChange} disabled={undoStack.length === 0} title="Undo" aria-label="Undo">↶</button>
          <button type="button" className="icon-button" onClick={redoLastChange} disabled={redoStack.length === 0} title="Redo" aria-label="Redo">↷</button>
          <button
            type="button"
            className="icon-button"
            onClick={() => updateUiLayout({ inspectorVisible: !uiLayout.inspectorVisible })}
            title="Toggle inspector"
            aria-label="Toggle inspector"
          >IN</button>
        </div>
      </header>

      <main className={`workstation-body inspector-${uiLayout.inspectorDock}`}>
        <nav className={`workspace-navigation ${uiLayout.navigationCollapsed ? "collapsed" : ""}`} aria-label="Workspaces">
          <div className="navigation-label">Workspaces</div>
          {workspaces.map((workspace, index) => (
            <div key={workspace.id} className={workspace.section === "library" && index > 0 ? "navigation-library" : undefined}>
              {workspace.section === "library" ? <div className="navigation-label">Library</div> : null}
              <button
                type="button"
                className={`workspace-button ${uiLayout.workspace === workspace.id ? "active" : ""}`}
                onClick={() => selectWorkspace(workspace.id)}
                title={workspace.label}
                aria-label={workspace.label}
              >
                <span className="workspace-icon">{workspace.icon}</span>
                <span className="workspace-name">{workspace.label}</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="workspace-collapse"
            onClick={() => updateUiLayout({ navigationCollapsed: !uiLayout.navigationCollapsed })}
          >{uiLayout.navigationCollapsed ? ">" : "Collapse"}</button>
        </nav>

        <section className="workspace-panel canvas-workspace">
          <div className="score-topbar workstation-toolbar">
            <div>
              <h1>{workspaceLabel}</h1>
              <p>{score.global.key.tonic} {score.global.key.mode} · {score.global.timeSignature.beats}/{score.global.timeSignature.beatType} · {score.global.tempo.bpm} bpm · {measureCount} measures</p>
            </div>
            <div className="document-actions">
              <button type="button" onClick={() => selectWorkspace("score")} className={uiLayout.workspace === "score" ? "active" : ""}>Score</button>
              <button type="button" onClick={() => selectWorkspace("mixer")} className={uiLayout.workspace === "mixer" ? "active" : ""}>Tracks</button>
              <button
                type="button"
                onClick={() => updateUiLayout({ keyboardVisible: !uiLayout.keyboardVisible })}
                aria-pressed={keyboardIsVisible}
              >{keyboardIsVisible ? "Hide Keyboard" : "Show Keyboard"}</button>
            </div>
          </div>

          <button
            type="button"
            className={`validation-banner ${validationIssueCount > 0 ? "warning" : "ok"}`}
            onClick={() => updateUiLayout({ validationExpanded: !uiLayout.validationExpanded })}
            aria-expanded={uiLayout.validationExpanded}
          >
            <span>{validationIssueCount > 0 ? `${validationIssueCount} validation and fidelity issue${validationIssueCount === 1 ? "" : "s"}` : "Score validation passed"}</span>
            <span>{uiLayout.validationExpanded ? "Hide details" : "Show details"}</span>
          </button>
          {uiLayout.validationExpanded ? (
            <div className="validation-details" aria-live="polite">
              {message ? <p className="message-line">{message}</p> : null}
              {structuralValidationErrors.map((error, index) => <p className="validation-error" key={`${index}-${error}`}>{error}</p>)}
              {structuralValidationWarnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}
              {measureIssues.map((issue) => <p key={`${issue.partId}-${issue.measure}`}>Measure {issue.measure}: {issue.status}</p>)}
              {score.sourceMetadata?.warnings?.map((warning, index) => <p key={`source-${index}-${warning}`}>{warning}</p>)}
            </div>
          ) : message ? <div className="workspace-message" aria-live="polite">{message}</div> : null}

          <div className="canvas-stage">
            {uiLayout.workspace === "piano-roll" || uiLayout.workspace === "mixer" ? (
              <NoteEditor
                score={score}
                activePartId={activePartId}
                measureIssues={measureIssues}
                instrumentOptions={soundFontPresetOptions}
                onActivePartChange={setActivePartId}
                onChange={(next) => acceptScore(next, "Updated tracks.")}
              />
            ) : uiLayout.workspace === "analysis" || uiLayout.workspace === "learning" ? (
              <LearningPanel analysis={analysis} learningPack={learningPack} />
            ) : uiLayout.workspace === "export" ? (
              <ExportPanel score={score} musicXml={musicXml} learningPack={learningPack} />
            ) : uiLayout.workspace === "omr-review" ? (
              <OmrFidelityReview score={score} onChange={(next) => acceptScore(next, "Updated OMR review values.")} />
            ) : uiLayout.workspace === "settings" ? (
              <div className="settings-canvas">
                <ScoreMetadataEditor score={score} onChange={(next) => acceptScore(next, "Updated score metadata.")} />
                <JsonEditor score={score} onApply={(next) => acceptScore(next, "Applied AST JSON.")} onMessage={setMessage} />
              </div>
            ) : (
              <ScoreViewer
                score={score}
                musicXml={notationMusicXml}
                measureIssues={measureIssues}
                activePlaybackEvents={playbackActiveEvents}
                showValidationDetails={uiLayout.validationExpanded}
                canRevert={undoStack.length > 0}
                onAddMissingRest={addMissingRest}
                onStretchLastNote={stretchLastNote}
                onRevertChange={revertLastChange}
              />
            )}
          </div>
        </section>

        {uiLayout.inspectorVisible ? (
          <aside
            className={`inspector-panel ${uiLayout.inspectorCollapsed ? "collapsed" : ""} ${uiLayout.inspectorDock === "float" ? "floating" : ""}`}
            style={{ width: uiLayout.inspectorCollapsed ? 48 : uiLayout.inspectorWidth }}
          >
            {uiLayout.inspectorDock !== "float" && !uiLayout.inspectorCollapsed ? <div className="inspector-resize-handle" onPointerDown={beginInspectorResize} /> : null}
            <div className="inspector-header">
              {!uiLayout.inspectorCollapsed ? <strong>Inspector</strong> : null}
              <button type="button" className="icon-button" onClick={() => updateUiLayout({ inspectorCollapsed: !uiLayout.inspectorCollapsed })} title="Collapse inspector" aria-label="Collapse inspector">{uiLayout.inspectorCollapsed ? "<" : ">"}</button>
              {!uiLayout.inspectorCollapsed ? <button type="button" className="icon-button" onClick={() => updateUiLayout({ inspectorVisible: false })} title="Hide inspector" aria-label="Hide inspector">×</button> : null}
            </div>
            {!uiLayout.inspectorCollapsed ? (
              <div className="inspector-content">
                <section className="inspector-section">
                  <div className="inspector-section-heading">
                    <strong>Validation</strong>
                    <span>{validationIssueCount}</span>
                  </div>
                  <button type="button" onClick={() => updateUiLayout({ validationExpanded: true })}>Review issues</button>
                </section>

                {uiLayout.workspace === "omr-review" ? (
                  <>
                    <OmrImportPanel onImport={acceptScore} onMessage={setMessage} />
                    <ImportPanel onImport={acceptScore} onMessage={setMessage} />
                  </>
                ) : null}

                {uiLayout.workspace === "settings" ? (
                  <>
                    <section className="inspector-section layout-settings">
                      <div className="inspector-section-heading"><strong>Layout</strong></div>
                      <label><span>Inspector dock</span><select aria-label="Inspector dock" value={uiLayout.inspectorDock} onChange={(event) => updateUiLayout({ inspectorDock: event.target.value as InspectorDock })}><option value="right">Right</option><option value="left">Left</option><option value="float">Float</option></select></label>
                      <label><span>Inspector width</span><input aria-label="Inspector width" type="range" min={260} max={520} value={uiLayout.inspectorWidth} onChange={(event) => updateUiLayout({ inspectorWidth: Number(event.target.value) })} /></label>
                      <label><span>Keyboard size</span><select aria-label="Keyboard size" value={uiLayout.keyboardSize} onChange={(event) => updateUiLayout({ keyboardSize: event.target.value as KeyboardSize, keyboardVisible: true })}><option value="compact">Compact</option><option value="performance">Performance</option><option value="teaching">Teaching</option><option value="fullscreen">Fullscreen</option></select></label>
                      <button type="button" onClick={() => setUiLayout(defaultUiLayout)}>Reset workspace layout</button>
                    </section>
                    <ChordProgressionPanel score={score} onPreview={previewPlayback} onInsert={acceptScore} onMessage={setMessage} />
                  </>
                ) : null}

                {uiLayout.workspace !== "omr-review" && uiLayout.workspace !== "settings" ? (
                  <>
                    <ScoreMetadataEditor score={score} onChange={(next) => acceptScore(next, "Updated score metadata.")} />
                    <section className="inspector-section track-summary">
                      <div className="inspector-section-heading"><strong>Tracks</strong><span>{score.parts.length}</span></div>
                      {score.parts.map((part, index) => {
                        const trackVolume = trackVolumes[part.id] ?? (part.muted ? 0 : clampVolume(part.volume ?? 1));
                        const volumePercent = Math.round(trackVolume * 100);
                        const isMuted = volumePercent === 0;
                        return (
                        <div className={`track-summary-row ${isMuted ? "muted" : ""} ${activePartId === part.id ? "active" : ""}`} key={part.id}>
                          <div className="track-summary-header">
                            <button type="button" className={`track-select-button ${activePartId === part.id ? "active" : ""}`} onClick={() => setActivePartId(part.id)}>
                              <span className="track-number">{index + 1}</span>
                              <span className="track-name"><strong>{part.name}</strong><small>{part.instrument.name}</small></span>
                            </button>
                          <button
                            type="button"
                            className={`track-sound-toggle ${isMuted ? "muted" : ""}`}
                            aria-label={`${isMuted ? "Enable" : "Mute"} ${part.name}`}
                            aria-pressed={isMuted}
                            title={`${isMuted ? "Enable" : "Mute"} ${part.name} without stopping playback`}
                            onClick={() => togglePartSound(part.id)}
                          >
                            <span className="track-sound-icon" aria-hidden="true">{isMuted ? "×" : "•"}</span>
                            {isMuted ? "Off" : "On"}
                          </button>
                          </div>
                          <label className="track-volume-control">
                            <span className="track-volume-icon" aria-hidden="true">VOL</span>
                            <input
                              aria-label={`${part.name} volume`}
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={volumePercent}
                              style={{ "--track-volume": `${volumePercent}%` } as CSSProperties}
                              onChange={(event) => setPartPlaybackVolume(part.id, Number(event.target.value) / 100)}
                            />
                            <output aria-live="polite">{isMuted ? "Off" : `${volumePercent}%`}</output>
                          </label>
                        </div>
                        );
                      })}
                      <button type="button" onClick={() => selectWorkspace("mixer")}>Open mixer</button>
                    </section>
                  </>
                ) : null}

                <section className="inspector-section docking-controls">
                  <div className="inspector-section-heading"><strong>Panel</strong></div>
                  <div className="button-row">
                    <button type="button" onClick={() => updateUiLayout({ inspectorDock: "left" })}>Dock Left</button>
                    <button type="button" onClick={() => updateUiLayout({ inspectorDock: "right" })}>Dock Right</button>
                    <button type="button" onClick={() => updateUiLayout({ inspectorDock: "float" })}>Float</button>
                  </div>
                </section>
              </div>
            ) : null}
          </aside>
        ) : null}
      </main>

      {keyboardIsVisible ? (
        <section
          className={`keyboard-dock keyboard-size-${uiLayout.keyboardSize}`}
          style={uiLayout.keyboardSize === "performance" ? { height: uiLayout.keyboardHeight } : undefined}
        >
          <div className="keyboard-resize-handle" onPointerDown={beginKeyboardResize} />
          <div className="keyboard-dock-header">
            <strong>Piano Input</strong>
            <div className="keyboard-size-actions">
              {(["compact", "performance", "teaching", "fullscreen"] as KeyboardSize[]).map((size) => <button type="button" key={size} className={uiLayout.keyboardSize === size ? "active" : ""} onClick={() => updateUiLayout({ keyboardSize: size })}>{size}</button>)}
              <button type="button" onClick={() => updateUiLayout({ keyboardVisible: false })} disabled={uiLayout.workspace === "piano-input" || uiLayout.workspace === "recording" || midiRecordMode !== "off"}>Hide</button>
            </div>
          </div>
          <div className="keyboard-dock-content">
            <section className="keyboard-panel">
            <div className="keyboard-toolbar">
              <label className="keyboard-mode-control">
                <span>Input Mode</span>
                <select value={inputMode} onChange={(event) => setInputMode(event.target.value as InputMode)}>
                  <option value="fixed">Fixed Duration</option>
                  <option value="performed">Performed Duration</option>
                </select>
              </label>
              <label className="keyboard-duration-control">
                <span>Duration</span>
                <select value={keyboardDuration} onChange={(event) => setKeyboardDuration(event.target.value as NoteDurationValue)} disabled={inputMode === "performed"}>
                  {durationValues.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
                </select>
              </label>
              <label className="quantize-control">
                <span>Input Quantize</span>
                <select value={quantizeGrid} onChange={(event) => setQuantizeGrid(event.target.value as QuantizeGrid)}>
                  <option value="quarter">1/4</option>
                  <option value="eighth">1/8</option>
                  <option value="sixteenth">1/16</option>
                </select>
              </label>
              <label className="measure-fill-control">
                <span>Measure Fill</span>
                <select value={measureFillMode} onChange={(event) => setMeasureFillMode(event.target.value as MeasureFillMode)}>
                  <option value="ask">Ask each time</option>
                  <option value="auto-advance">Auto advance</option>
                  <option value="shorten">Prevent overfill</option>
                  <option value="allow-overfill">Allow warning</option>
                </select>
              </label>
              <label className="inline-toggle">
                <input type="checkbox" checked={keyboardChordMode} onChange={(event) => setKeyboardChordMode(event.target.checked)} />
                <span>Chord mode</span>
              </label>
              <span className="selected-pitches">{selectedChordPitches.length ? selectedChordPitches.join(", ") : "No chord selected"}</span>
              <button type="button" onClick={() => insertKeyboardChord(selectedChordPitches)} disabled={selectedChordPitches.length < 2}>Insert Chord</button>
              <button type="button" onClick={() => setSelectedChordPitches([])} disabled={selectedChordPitches.length === 0}>Clear</button>
            </div>
            {pendingOverfill ? (
              <div className="overfill-choice">
                <strong>{pendingOverfill.message}</strong>
                <button type="button" onClick={() => resolvePendingOverfill("shorten")}>Shorten note</button>
                <button type="button" onClick={() => resolvePendingOverfill("auto-advance")}>Move to next bar</button>
                <button type="button" onClick={() => resolvePendingOverfill("allow-overfill")}>Allow</button>
              </div>
            ) : null}
            <div className="metronome-toolbar">
              <strong>Metronome</strong>
              <label className="inline-toggle">
                <input type="checkbox" checked={metronomeOn} onChange={(event) => setMetronomeOn(event.target.checked)} />
                <span>On</span>
              </label>
              <label className="count-in-control">
                <span>Count-in</span>
                <select value={countInBars} onChange={(event) => setCountInBars(Number(event.target.value))}>
                  <option value={0}>None</option>
                  <option value={1}>1 bar</option>
                  <option value={2}>2 bars</option>
                </select>
              </label>
              <span className={`beat-indicator ${metronomeBeat?.isAccent ? "accent" : ""} ${metronomeBeat?.isCountIn ? "count-in" : ""}`}>
                {metronomeBeat ? `${metronomeBeat.isCountIn ? "Count-in " : "Beat "}${metronomeBeat.beatInBar}` : "silent"}
              </span>
            </div>
            <div className="midi-toolbar">
              <strong>MIDI Input</strong>
              <button type="button" onClick={() => void enableMidi()}>Enable MIDI</button>
              <label className="midi-device-control">
                <span>Device</span>
                <select value={selectedMidiInputId} onChange={(event) => setSelectedMidiInputId(event.target.value)} disabled={midiDevices.length === 0}>
                  {midiDevices.length === 0 ? <option value="">No devices</option> : null}
                  {midiDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                </select>
              </label>
              <label className="midi-mode-control">
                <span>Record Mode</span>
                <select value={midiRecordMode} onChange={(event) => {
                  const mode = event.target.value as MidiRecordMode;
                  setMidiRecordMode(mode);
                  replaceOnNextRecordedEventRef.current = mode !== "off" && recordingStrategy === "replace";
                }}>
                  <option value="off">Off</option>
                  <option value="insert-notes">Insert Notes</option>
                  <option value="insert-chords">Insert Chords</option>
                </select>
              </label>
              <label className="midi-mode-control">
                <span>Write</span>
                <select value={recordingStrategy} onChange={(event) => {
                  const strategy = event.target.value as RecordingStrategy;
                  setRecordingStrategy(strategy);
                  replaceOnNextRecordedEventRef.current = midiRecordMode !== "off" && strategy === "replace";
                }}>
                  <option value="overdub">Overdub</option>
                  <option value="replace">Replace track</option>
                </select>
              </label>
              <span className="midi-status">{midiStatus}</span>
            </div>
            <PianoKeyboard
              activePitches={activeKeyboardPitches}
              playingPitches={playbackActivePitches}
              pressedPitches={uniquePitches([...keyboardPressedPitches, ...midiActivePitches])}
              selectedPitches={selectedChordPitches}
              onKeyDown={(pitch) => {
                setKeyboardPressed(pitch, true);
                auditionNoteOn(pitch);
                if (inputMode === "performed") {
                  beginPerformedPitch("ui", pitch);
                }
              }}
              onKeyUp={(pitch) => {
                setKeyboardPressed(pitch, false);
                auditionNoteOff(pitch);
                if (inputMode === "performed") {
                  finishPerformedPitch("ui", pitch, keyboardChordMode);
                }
              }}
              onKeyPress={handleKeyboardPress}
            />
            </section>
          </div>
        </section>
      ) : null}

      <PlaybackControls
        score={previewScore ?? score}
        trackVolumes={trackVolumes}
        label={previewScore ? `Preview: ${previewScore.metadata.title}` : undefined}
        onPresetCatalogChange={setSoundFontPresetOptions}
        onTempoChange={(bpm) => {
          if (previewScore) {
            setPreviewScore({ ...previewScore, global: { ...previewScore.global, tempo: { ...previewScore.global.tempo, bpm } } });
            return;
          }
          acceptScore({ ...score, global: { ...score.global, tempo: { ...score.global.tempo, bpm } } }, `Changed tempo to ${bpm} bpm.`);
        }}
      />
    </div>
  );
}

function uniquePitches(pitches: string[]): string[] {
  return [...new Set(pitches.map((pitch) => pitch.trim()).filter(Boolean))];
}

function playbackVolumesFromScore(score: FoxChildMusicScore): Record<string, number> {
  return Object.fromEntries(score.parts.map((part) => [
    part.id,
    part.muted ? 0 : clampVolume(part.volume ?? 1)
  ]));
}

function sameTrackVolumes(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((partId) => left[partId] === right[partId]);
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadUiLayout(): UiLayoutState {
  try {
    const compactViewport = window.innerWidth <= 820;
    const stored = window.localStorage.getItem(UI_LAYOUT_STORAGE_KEY);
    if (!stored) {
      return {
        ...defaultUiLayout,
        navigationCollapsed: compactViewport,
        inspectorVisible: !compactViewport
      };
    }
    const parsed = JSON.parse(stored) as Partial<UiLayoutState>;
    return {
      ...defaultUiLayout,
      ...parsed,
      navigationCollapsed: compactViewport ? true : Boolean(parsed.navigationCollapsed),
      inspectorVisible: compactViewport ? false : parsed.inspectorVisible ?? defaultUiLayout.inspectorVisible,
      keyboardSize: compactViewport ? "compact" : parsed.keyboardSize ?? defaultUiLayout.keyboardSize,
      inspectorWidth: Math.min(520, Math.max(260, Number(parsed.inspectorWidth) || defaultUiLayout.inspectorWidth)),
      keyboardHeight: Math.min(520, Math.max(170, Number(parsed.keyboardHeight) || defaultUiLayout.keyboardHeight))
    };
  } catch {
    return defaultUiLayout;
  }
}

function appendEventToPart(
  part: Part,
  event: MusicEvent,
  options: {
    beatsPerMeasure: number;
    startBeat?: number;
    fillMode: AppliedMeasureFillMode;
  }
) {
  let events: MusicEvent[] = part.measures.flatMap((measure) => measure.events).filter((item) => item.type !== "annotation");
  const currentEndBeat = events.reduce((sum, item) => sum + eventBeats(item), 0);
  const targetStartBeat = options.startBeat === undefined ? currentEndBeat : Math.max(currentEndBeat, options.startBeat);
  const gapBeats = targetStartBeat - currentEndBeat;

  if (gapBeats > 0.001) {
    events = [...events, ...restEventsForGap(gapBeats)];
  }

  const remaining = remainingBeatsInMeasure(events, options.beatsPerMeasure);
  const eventDuration = eventBeats(event);
  const shouldHandleOverfill = events.length > 0 && remaining < options.beatsPerMeasure - 0.001 && eventDuration > remaining + 0.001;

  if (shouldHandleOverfill && options.fillMode === "shorten" && remaining > 0.001) {
    event = {
      ...event,
      duration: beatsToDuration(remaining)
    } as MusicEvent;
  } else if (shouldHandleOverfill && options.fillMode === "auto-advance" && remaining > 0.001) {
    events = [...events, ...restEventsForGap(remaining)];
  }

  const nextEvents = [...events, event];
  part.measures = options.fillMode === "allow-overfill"
    ? eventsToMeasuresAllowOverfill(nextEvents, options.beatsPerMeasure)
    : eventsToMeasures(nextEvents, options.beatsPerMeasure);
}

function getOverfillInfo(part: Part, event: MusicEvent, beatsPerMeasure: number, startBeat?: number): { measureNumber: number; extraBeats: number } | null {
  let events: MusicEvent[] = part.measures.flatMap((measure) => measure.events).filter((item) => item.type !== "annotation");
  const currentEndBeat = events.reduce((sum, item) => sum + eventBeats(item), 0);
  const targetStartBeat = startBeat === undefined ? currentEndBeat : Math.max(currentEndBeat, startBeat);
  const gapBeats = targetStartBeat - currentEndBeat;

  if (gapBeats > 0.001) {
    events = [...events, ...restEventsForGap(gapBeats)];
  }

  const usedBeforeEvent = events.reduce((sum, item) => sum + eventBeats(item), 0);
  const remaining = remainingBeatsInMeasure(events, beatsPerMeasure);
  const duration = eventBeats(event);
  if (events.length === 0 || remaining >= beatsPerMeasure - 0.001 || duration <= remaining + 0.001) {
    return null;
  }

  return {
    measureNumber: Math.floor(usedBeforeEvent / beatsPerMeasure) + 1,
    extraBeats: Math.round((duration - remaining) * 1000) / 1000
  };
}

function restEventsForGap(beats: number): MusicEvent[] {
  return splitBeatsIntoDurations(beats).map((duration, index) => ({
    id: `recording-gap-${Date.now()}-${index + 1}`,
    type: "rest",
    duration
  }));
}

function remainingBeatsInMeasure(events: MusicEvent[], beatsPerMeasure: number): number {
  const used = events.reduce((sum, event) => sum + eventBeats(event), 0);
  const remainder = used % beatsPerMeasure;
  return remainder < 0.001 ? beatsPerMeasure : beatsPerMeasure - remainder;
}

function eventBeats(event: MusicEvent): number {
  if (event.type === "annotation" || event.type === "direction") {
    return 0;
  }
  return event.duration.beats ?? DURATION_BEATS[event.duration.value];
}

function sessionRecordingBeat(controller: ReturnType<typeof usePlaybackSessionController>): number | undefined {
  const snapshot = controller.getSnapshot();
  if (snapshot.status !== "playing" && snapshot.status !== "paused") {
    return undefined;
  }
  return snapshot.currentScoreTime.numerator / snapshot.currentScoreTime.denominator;
}

function eventsToMeasuresAllowOverfill(events: MusicEvent[], beatsPerMeasure: number) {
  const measures = [];
  let measureNumber = 1;
  let current = { number: measureNumber, events: [] as MusicEvent[] };
  let beatInMeasure = 0;

  for (const event of events) {
    current.events.push(event);
    beatInMeasure += eventBeats(event);
    if (beatInMeasure >= beatsPerMeasure - 0.001) {
      measures.push(current);
      measureNumber += 1;
      current = { number: measureNumber, events: [] };
      beatInMeasure = 0;
    }
  }

  if (current.events.length > 0 || measures.length === 0) {
    measures.push(current);
  }

  return measures;
}
