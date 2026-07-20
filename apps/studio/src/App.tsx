import { useEffect, useMemo, useRef, useState } from "react";
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
import type { PlaybackNoteEvent } from "./music/playback/PlaybackEngine";
import { BrowserMetronome, type MetronomeBeat } from "./music/playback/metronome";
import { generalMidiPresetOptions, type SoundFontPresetOption } from "./music/playback/soundfontPresets";
import { SystemRecordingClock } from "./music/recording/recordingClock";
import { quantizeBeatsToDuration, quantizeStartBeat, type QuantizeGrid } from "./music/rhythm/quantizeDuration";

type ViewMode = "notation" | "notes" | "ast" | "learning";
type InputMode = "fixed" | "performed";
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
const durationValues = Object.keys(DURATION_BEATS) as NoteDurationValue[];

export function App() {
  const [score, setScore] = useState<FoxChildMusicScore>(() => withMeasureValidation(simpleMelodyAst));
  const [previousScore, setPreviousScore] = useState<FoxChildMusicScore | null>(null);
  const [previewScore, setPreviewScore] = useState<FoxChildMusicScore | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("notation");
  const [message, setMessage] = useState("Loaded demo AST score.");
  const [activePartId, setActivePartId] = useState(simpleMelodyAst.parts[0].id);
  const [playbackActivePitches, setPlaybackActivePitches] = useState<string[]>([]);
  const [playbackActiveEvents, setPlaybackActiveEvents] = useState<PlaybackNoteEvent[]>([]);
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
  const [midiActivePitches, setMidiActivePitches] = useState<string[]>([]);
  const [midiStatus, setMidiStatus] = useState("MIDI disabled");
  const [soundFontPresetOptions, setSoundFontPresetOptions] = useState<SoundFontPresetOption[]>(generalMidiPresetOptions);
  const [pendingOverfill, setPendingOverfill] = useState<PendingOverfill | null>(null);
  const midiChordCaptureRef = useRef<{ pitches: string[]; timer?: number }>({ pitches: [] });
  const noteAuditionRef = useRef<NoteAudition | null>(null);
  const metronomeRef = useRef<BrowserMetronome | null>(null);
  const recordingClockRef = useRef(new SystemRecordingClock(simpleMelodyAst.global.tempo.bpm, 1));
  const heldPitchesRef = useRef(new Map<string, HeldPitch>());
  const performedChordCaptureRef = useRef<{ notes: CompletedHeldPitch[]; timer?: number }>({ notes: [] });

  const validation = useMemo(() => validateScore(score), [score]);
  const analysis = useMemo(() => analyseDifficulty(score), [score]);
  const musicXml = useMemo(() => astToMusicXml(score), [score]);
  const learningPack = useMemo(() => astToLearningPack(score), [score]);
  const measureCount = score.parts.reduce((sum, part) => sum + part.measures.length, 0);

  const measureIssues = useMemo(() => score.validation?.measures.filter((measure) => measure.status !== "complete") ?? [], [score]);
  const activeKeyboardPitches = useMemo(() => uniquePitches([...playbackActivePitches, ...keyboardPressedPitches, ...midiActivePitches]), [keyboardPressedPitches, midiActivePitches, playbackActivePitches]);

  useEffect(() => {
    if (!score.parts.some((part) => part.id === activePartId)) {
      setActivePartId(score.parts[0]?.id ?? "");
    }
  }, [activePartId, score.parts]);

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
  }, [keyboardDuration, midiAccess, midiDevices, midiRecordMode, score, selectedMidiInputId]);

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
    recordingClockRef.current = new SystemRecordingClock(score.global.tempo.bpm, 1);
    const countInBeats = metronomeOn ? -countInBars * getBeatsPerMeasure(score.global.timeSignature) : 0;
    recordingClockRef.current.start(countInBeats);
  }, [countInBars, inputMode, metronomeOn, score.global.tempo.bpm, score.global.timeSignature]);

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
      onBeat: setMetronomeBeat
    });

    return () => metronomeRef.current?.stop();
  }, [countInBars, metronomeOn, score.global.tempo.bpm, score.global.timeSignature.beats]);

  function acceptScore(nextScore: FoxChildMusicScore, nextMessage: string) {
    const decoratedScore = withMeasureValidation({
      ...nextScore,
      metadata: {
        ...nextScore.metadata,
        updatedAt: new Date().toISOString().slice(0, 10)
      }
    }, score);
    setPreviousScore(score);
    setScore(decoratedScore);
    setPreviewScore(null);
    setMessage(nextMessage);
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
    const lastTimedEvent = measure ? [...measure.events].reverse().find((event) => event.type !== "annotation") : undefined;
    if (!lastTimedEvent) {
      return;
    }
    const currentBeats = lastTimedEvent.duration.beats ?? DURATION_BEATS[lastTimedEvent.duration.value];
    lastTimedEvent.duration = beatsToDuration(currentBeats + issue.missingBeats);
    acceptScore(next, `Stretched the last note in measure ${issue.measure}.`);
  }

  function revertLastChange() {
    if (!previousScore) {
      return;
    }
    setScore(withMeasureValidation(previousScore));
    setPreviousScore(null);
    setMessage("Reverted the last score change.");
  }

  function insertKeyboardEvent(event: MusicEvent, nextMessage: string, startBeat?: number, forcedFillMode?: AppliedMeasureFillMode) {
    if (!activePartId) {
      return;
    }
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((item) => item.id === activePartId) ?? next.parts[0];
    if (!part) {
      return;
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
  }, startBeat?: number) {
    const pitch = parsePitchName(pitchName);
    insertKeyboardEvent({
      id: `keyboard-note-${Date.now()}`,
      type: "note",
      pitch,
      duration
    }, `Inserted ${pitchName} ${duration.value.replaceAll("-", " ")} note.`, startBeat);
  }

  function insertKeyboardChord(pitchNames: string[], duration: Duration = {
    value: keyboardDuration,
    beats: DURATION_BEATS[keyboardDuration]
  }, startBeat?: number) {
    const unique = uniquePitches(pitchNames);
    if (unique.length === 0) {
      return;
    }
    if (unique.length === 1) {
      insertKeyboardNote(unique[0], duration, startBeat);
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
    }, `Inserted ${chordName} chord: ${unique.join(", ")}.`, startBeat);
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
    insertKeyboardNote(pitch, duration, held.startBeat);
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
      insertKeyboardChord(pitches, duration, startBeat);
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
        insertKeyboardNote(message.pitch);
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
      insertKeyboardChord(pitches);
    }, CHORD_CAPTURE_WINDOW_MS);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">FoxChild Music Score Lab</p>
          <h1>Music Studio</h1>
        </div>
        <div className="header-meta">
          <span className={validation.valid ? "status-pill ok" : "status-pill error"}>
            {validation.valid ? "Valid AST v2" : `${validation.errors.length} errors`}
          </span>
          {measureIssues.length > 0 ? <span className="status-pill warning">{measureIssues.length} bar warning{measureIssues.length === 1 ? "" : "s"}</span> : null}
          <span className="status-pill">V1 compatible</span>
          <span className="status-pill">{analysis.level}</span>
        </div>
      </header>

      <main className="studio-layout">
        <aside className="side-panel">
          <ImportPanel onImport={acceptScore} onMessage={setMessage} />
          <OmrImportPanel onImport={acceptScore} onMessage={setMessage} />
          <ScoreMetadataEditor score={score} onChange={(next) => acceptScore(next, "Updated score metadata.")} />
          <ChordProgressionPanel
            score={score}
            onPreview={previewPlayback}
            onInsert={acceptScore}
            onMessage={setMessage}
          />
          <JsonEditor score={score} onApply={(next) => acceptScore(next, "Applied AST JSON.")} onMessage={setMessage} />
        </aside>

        <section className="workspace-panel">
          <div className="score-topbar">
            <div>
              <h2>{score.metadata.title}</h2>
              <p>
                {score.global.key.tonic} {score.global.key.mode} · {score.global.timeSignature.beats}/
                {score.global.timeSignature.beatType} · {score.global.tempo.bpm} bpm · {measureCount} measures
              </p>
            </div>
            <div className="segmented">
              <button className={viewMode === "notation" ? "active" : ""} onClick={() => setViewMode("notation")}>Notation</button>
              <button className={viewMode === "notes" ? "active" : ""} onClick={() => setViewMode("notes")}>Notes</button>
              <button className={viewMode === "ast" ? "active" : ""} onClick={() => setViewMode("ast")}>AST</button>
              <button className={viewMode === "learning" ? "active" : ""} onClick={() => setViewMode("learning")}>Learning</button>
            </div>
          </div>

          <div className="workspace-alerts" aria-live="polite">
            {message ? <p className="message-line">{message}</p> : null}
            {!validation.valid ? (
              <div className="error-list">
                {validation.errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}
              </div>
            ) : null}
            {validation.warnings.length > 0 ? (
              <div className="warning-list">
                {validation.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}
              </div>
            ) : null}
          </div>

          {viewMode === "notation" ? (
            <ScoreViewer
              score={score}
              musicXml={musicXml}
              measureIssues={measureIssues}
              activePlaybackEvents={playbackActiveEvents}
              canRevert={Boolean(previousScore)}
              onAddMissingRest={addMissingRest}
              onStretchLastNote={stretchLastNote}
              onRevertChange={revertLastChange}
            />
          ) : null}
          {viewMode === "notes" ? (
            <NoteEditor
              score={score}
              activePartId={activePartId}
              measureIssues={measureIssues}
              instrumentOptions={soundFontPresetOptions}
              onActivePartChange={setActivePartId}
              onChange={(next) => acceptScore(next, "Updated tracks.")}
            />
          ) : null}
          {viewMode === "ast" ? (
            <pre className="json-view">{JSON.stringify(score, null, 2)}</pre>
          ) : null}
          {viewMode === "learning" ? <LearningPanel analysis={analysis} learningPack={learningPack} /> : null}

          <section className="panel keyboard-panel">
            <div className="keyboard-toolbar">
              <strong>Piano Keyboard</strong>
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
                <select value={midiRecordMode} onChange={(event) => setMidiRecordMode(event.target.value as MidiRecordMode)}>
                  <option value="off">Off</option>
                  <option value="insert-notes">Insert Notes</option>
                  <option value="insert-chords">Insert Chords</option>
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

          <ExportPanel score={score} musicXml={musicXml} learningPack={learningPack} />
        </section>
      </main>

      <PlaybackControls
        score={previewScore ?? score}
        label={previewScore ? `Preview: ${previewScore.metadata.title}` : undefined}
        onActivePitchesChange={setPlaybackActivePitches}
        onActiveEventsChange={setPlaybackActiveEvents}
        onPresetCatalogChange={setSoundFontPresetOptions}
      />
    </div>
  );
}

function uniquePitches(pitches: string[]): string[] {
  return [...new Set(pitches.map((pitch) => pitch.trim()).filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  if (event.type === "annotation") {
    return 0;
  }
  return event.duration.beats ?? DURATION_BEATS[event.duration.value];
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
