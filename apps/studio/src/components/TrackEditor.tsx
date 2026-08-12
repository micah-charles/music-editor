import {
  DURATION_BEATS,
  durationToBeats,
  getBeatsPerMeasure,
  parsePitchName,
  pitchToName,
  type FoxChildMusicScore,
  type MeasureValidationResult,
  type MusicEvent,
  type NoteDurationValue,
  type Part
} from "@foxchild/music-core";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import {
  directNoteSuggestions,
  directNotesToEvents,
  parseDirectNoteInput
} from "../music/trackEditor/directNoteInput";
import { usePlaybackSession } from "../music/playback/session/usePlaybackSession";
import {
  generalMidiPresetOptions,
  presetOptionKey,
  type SoundFontPresetOption
} from "../music/playback/soundfontPresets";
import { PianoKeyboard } from "./PianoKeyboard";

interface TrackEditorProps {
  score: FoxChildMusicScore;
  activePartId: string;
  selectedEventId?: string;
  measureIssues: MeasureValidationResult[];
  instrumentOptions: SoundFontPresetOption[];
  canUndo: boolean;
  canRedo: boolean;
  recording: boolean;
  onActivePartChange: (partId: string) => void;
  onSelectedEventChange: (eventId?: string) => void;
  onChange: (score: FoxChildMusicScore) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleRecording: () => void;
}

type BottomPanel = "events" | "note-input" | "keyboard" | "spreadsheet";
type SnapValue = "1" | "1/2" | "1/4" | "1/8" | "1/16";
type Overlay = "heat" | "fingering" | "scale-degree" | "solfege" | "intervals" | "chords" | "roman";

interface EventRow {
  key: string;
  partId: string;
  partIndex: number;
  measureNumber: number;
  eventIndex: number;
  beat: number;
  absoluteBeat: number;
  durationBeats: number;
  event: MusicEvent;
}

const trackColours = ["#38c99b", "#4f9cf9", "#f5a23a", "#ec5d8c", "#8f70f5", "#6e7cf7", "#44b7d8", "#d9c153"];
const durationValues = Object.keys(DURATION_BEATS) as NoteDurationValue[];
const groupOrder = ["Woodwinds", "Brass", "Strings", "Percussion", "Keyboard", "Choir", "Others"] as const;
const snapBeats: Record<SnapValue, number> = { "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25 };

export function TrackEditor({
  score,
  activePartId,
  selectedEventId,
  measureIssues,
  instrumentOptions,
  canUndo,
  canRedo,
  recording,
  onActivePartChange,
  onSelectedEventChange,
  onChange,
  onUndo,
  onRedo,
  onToggleRecording
}: TrackEditorProps) {
  const { controller, snapshot } = usePlaybackSession();
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState<SnapValue>("1/16");
  const [search, setSearch] = useState("");
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("events");
  const [directInput, setDirectInput] = useState("C4 q E4 8 G4 h");
  const [inputMessage, setInputMessage] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(["heat"]));
  const [copiedEvent, setCopiedEvent] = useState<MusicEvent>();
  const [selectedCell, setSelectedCell] = useState({ measure: 1, part: 0 });
  const [timelineViewport, setTimelineViewport] = useState({ left: 0, width: 1200 });
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const beatsPerMeasure = getBeatsPerMeasure(score.global.timeSignature);
  const measureNumbers = useMemo(() => allMeasureNumbers(score), [score]);
  const measureCount = Math.max(1, measureNumbers.length);
  const measureWidth = 116 * zoom;
  const timelineWidth = Math.max(900, measureCount * measureWidth);
  const rows = useMemo(() => flattenEvents(score, beatsPerMeasure), [beatsPerMeasure, score]);
  const rowsByPart = useMemo(() => {
    const grouped = new Map<string, EventRow[]>();
    rows.forEach((row) => grouped.set(row.partId, [...(grouped.get(row.partId) ?? []), row]));
    return grouped;
  }, [rows]);
  const viewportBeatStart = Math.max(0, timelineViewport.left / measureWidth * beatsPerMeasure - beatsPerMeasure);
  const viewportBeatEnd = (timelineViewport.left + timelineViewport.width) / measureWidth * beatsPerMeasure + beatsPerMeasure;
  const selectedRow = rows.find((row) => row.key === selectedEventId);
  const activePlaybackIds = new Set(snapshot.activeEvents.map((event) => event.id));
  const currentMeasure = snapshot.activeEvents[0]?.measureNumber
    ?? Math.max(1, Math.floor((Number(snapshot.currentSourceTime.numerator) / Number(snapshot.currentSourceTime.denominator)) / beatsPerMeasure) + 1);
  const presets = instrumentOptions.length ? instrumentOptions : generalMidiPresetOptions;
  const groupedParts = useMemo(() => groupParts(score.parts), [score.parts]);
  const filteredPartIds = new Set(score.parts
    .filter((part) => `${part.name} ${part.instrument.name}`.toLowerCase().includes(search.toLowerCase()))
    .map((part) => part.id));
  const visibleTimelineParts = score.parts.filter((part) =>
    filteredPartIds.has(part.id) && !collapsedGroups.has(partGroup(part))
  );

  useEffect(() => {
    function handleKeyboard(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? onRedo() : onUndo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedRow) {
        event.preventDefault();
        setCopiedEvent(structuredClone(selectedRow.event));
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && copiedEvent) {
        event.preventDefault();
        pasteEvent(copiedEvent);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedRow) {
        event.preventDefault();
        deleteSelectedEvent();
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && selectedRow) {
        event.preventDefault();
        moveEvent(selectedRow, event.key === "ArrowLeft" ? -snapBeats[snap] : snapBeats[snap]);
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [copiedEvent, onRedo, onUndo, selectedRow, snap]);

  function mutatePart(partId: string, mutation: (part: Part) => void) {
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((entry) => entry.id === partId);
    if (!part) return;
    mutation(part);
    onChange(next);
  }

  function mutateSelectedEvent(mutation: (event: MusicEvent) => MusicEvent | undefined) {
    if (!selectedRow) return;
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((entry) => entry.id === selectedRow.partId);
    const measure = part?.measures.find((entry) => entry.number === selectedRow.measureNumber);
    const event = measure?.events[selectedRow.eventIndex];
    if (!part || !measure || !event) return;
    const changed = mutation(event);
    if (changed) measure.events[selectedRow.eventIndex] = changed;
    else measure.events.splice(selectedRow.eventIndex, 1);
    onChange(next);
    if (!changed) onSelectedEventChange(undefined);
  }

  function updateGlobal(patch: Partial<FoxChildMusicScore["global"]>) {
    onChange({ ...score, global: { ...score.global, ...patch } });
  }

  function commitDirectInput() {
    const parsed = parseDirectNoteInput(directInput);
    if (!parsed.valid) {
      setInputMessage(parsed.error ?? "The note input is not valid.");
      return;
    }
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((entry) => entry.id === activePartId) ?? next.parts[0];
    if (!part) return;
    appendEvents(part, directNotesToEvents(parsed.entries, `direct-${Date.now()}`), beatsPerMeasure);
    onChange(next);
    setInputMessage(`${parsed.entries.length} event${parsed.entries.length === 1 ? "" : "s"} added to ${part.name}.`);
  }

  function setTrackField(partId: string, patch: Partial<Part>) {
    mutatePart(partId, (part) => Object.assign(part, patch));
  }

  function setInstrument(partId: string, value: string) {
    const preset = presets.find((entry) => presetOptionKey(entry) === value) ?? presets[0];
    if (!preset) return;
    mutatePart(partId, (part) => {
      part.instrument = {
        ...part.instrument,
        name: preset.name,
        midiProgram: preset.program + 1,
        soundFontBank: preset.bank,
        soundFontPreset: preset.program
      };
      if (preset.bank === 128) part.channel = 9;
    });
  }

  function addTrack() {
    const next = structuredClone(score) as FoxChildMusicScore;
    const index = next.parts.length + 1;
    const id = uniqueId(next.parts.map((part) => part.id), `track-${index}`);
    next.parts.push({
      id,
      name: `Track ${index}`,
      instrument: { name: "Acoustic Grand Piano", midiProgram: 1 },
      clef: "treble",
      channel: nextChannel(next.parts),
      color: trackColours[(index - 1) % trackColours.length],
      measures: [{ number: 1, events: [] }],
      extensions: { orchestraGroup: "Keyboard" }
    });
    onChange(next);
    onActivePartChange(id);
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  }

  function muteGroup(group: string) {
    const ids = new Set(groupedParts.get(group)?.map((part) => part.id) ?? []);
    const shouldMute = score.parts.some((part) => ids.has(part.id) && !part.muted);
    const next = structuredClone(score) as FoxChildMusicScore;
    next.parts.forEach((part) => {
      if (ids.has(part.id)) part.muted = shouldMute;
    });
    onChange(next);
  }

  function moveEvent(row: EventRow, deltaBeats: number) {
    if (isLocked(score.parts[row.partIndex])) return;
    const targetAbsolute = Math.max(0, quantize(row.absoluteBeat + deltaBeats, snapBeats[snap]));
    relocateEvent(score, row, targetAbsolute, beatsPerMeasure, onChange);
  }

  function beginEventDrag(event: PointerEvent<HTMLButtonElement>, row: EventRow) {
    if (isLocked(score.parts[row.partIndex])) return;
    const startX = event.clientX;
    const onUp = (upEvent: globalThis.PointerEvent) => {
      const delta = (upEvent.clientX - startX) / measureWidth * beatsPerMeasure;
      if (Math.abs(delta) > 0.05) moveEvent(row, quantize(delta, snapBeats[snap]));
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointerup", onUp);
  }

  function deleteSelectedEvent() {
    mutateSelectedEvent(() => undefined);
  }

  function pasteEvent(event: MusicEvent) {
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((entry) => entry.id === activePartId) ?? next.parts[0];
    if (!part) return;
    const pasted = structuredClone(event) as MusicEvent;
    pasted.id = `${event.id ?? "event"}-copy-${Date.now()}`;
    appendEvents(part, [pasted], beatsPerMeasure);
    onChange(next);
  }

  function toggleOverlay(overlay: Overlay) {
    setOverlays((current) => {
      const next = new Set(current);
      next.has(overlay) ? next.delete(overlay) : next.add(overlay);
      return next;
    });
  }

  function seekMeasure(measure: number) {
    void controller.seekToMeasure(measure);
  }

  function handleSpreadsheetKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) return;
    event.preventDefault();
    const partDelta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" || event.key === "Enter" ? 1 : 0;
    const measureDelta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    setSelectedCell((current) => ({
      part: Math.max(0, Math.min(score.parts.length - 1, current.part + partDelta)),
      measure: Math.max(1, Math.min(measureCount, current.measure + measureDelta))
    }));
  }

  function commitSpreadsheetCell(part: Part, measureNumber: number, value: string) {
    if (value.trim() === measureCellValue(part, measureNumber).trim()) return;
    if (!value.trim()) {
      mutatePart(part.id, (nextPart) => {
        ensureMeasure(nextPart, measureNumber).events = [];
      });
      return;
    }
    const parsed = parseDirectNoteInput(value);
    if (!parsed.valid) {
      setInputMessage(parsed.error ?? "Invalid spreadsheet note.");
      return;
    }
    mutatePart(part.id, (nextPart) => {
      const measure = ensureMeasure(nextPart, measureNumber);
      measure.events = directNotesToEvents(parsed.entries, `cell-${part.id}-${measureNumber}-${Date.now()}`)
        .map((event, index) => ({ ...event, position: { measure: measureNumber, beat: index * snapBeats[snap] } } as MusicEvent));
    });
  }

  return (
    <section className="track-editor" aria-label="Track Editor" onClick={() => undefined}>
      <header className="track-editor-toolbar">
        <div className="track-transport">
          <button type="button" aria-label="Play" className={snapshot.status === "playing" ? "active" : ""} onClick={() => snapshot.status === "playing" ? controller.pause() : void controller.play()}>{snapshot.status === "playing" ? "Pause" : "Play"}</button>
          <button type="button" aria-label="Stop" onClick={() => controller.stop()}>Stop</button>
          <button type="button" aria-label="Record" className={`record ${recording ? "active" : ""}`} onClick={onToggleRecording}>Rec</button>
        </div>
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo">Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo">Redo</button>
        <label><span>Snap</span><select value={snap} onChange={(event) => setSnap(event.target.value as SnapValue)}>{Object.keys(snapBeats).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Tempo</span><input aria-label="Track Editor tempo" type="number" min={20} max={300} value={score.global.tempo.bpm} onChange={(event) => updateGlobal({ tempo: { ...score.global.tempo, bpm: Number(event.target.value) } })} /></label>
        <label><span>Key</span><select value={score.global.key.tonic} onChange={(event) => updateGlobal({ key: { ...score.global.key, tonic: event.target.value as FoxChildMusicScore["global"]["key"]["tonic"] } })}>{["C", "D", "E", "F", "G", "A", "B"].map((key) => <option key={key}>{key}</option>)}</select></label>
        <label><span>Meter</span><select value={`${score.global.timeSignature.beats}/${score.global.timeSignature.beatType}`} onChange={(event) => { const [beats, beatType] = event.target.value.split("/").map(Number); updateGlobal({ timeSignature: { beats, beatType } }); }}>{["2/4", "3/4", "4/4", "6/8", "9/8"].map((meter) => <option key={meter}>{meter}</option>)}</select></label>
        <label className="track-zoom"><span>Zoom</span><input aria-label="Timeline zoom" type="range" min={0.6} max={2.2} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label className="track-search"><span>Search</span><input aria-label="Search tracks" value={search} placeholder="Track or instrument" onChange={(event) => setSearch(event.target.value)} /></label>
        <details className="overlay-menu">
          <summary>Overlays</summary>
          {(["heat", "fingering", "scale-degree", "solfege", "intervals", "chords", "roman"] as Overlay[]).map((overlay) => (
            <label key={overlay}><input type="checkbox" checked={overlays.has(overlay)} onChange={() => toggleOverlay(overlay)} />{overlay.replaceAll("-", " ")}</label>
          ))}
        </details>
      </header>

      <div className="track-editor-main">
        <aside className="track-list" aria-label="Track list">
          <div className="track-list-header"><strong>Tracks</strong><span>M</span><span>S</span><span>Vol</span><button type="button" onClick={addTrack}>＋</button></div>
          {groupOrder.map((group) => {
            const parts = groupedParts.get(group) ?? [];
            if (!parts.length) return null;
            const collapsed = collapsedGroups.has(group);
            return (
              <section className="track-group" key={group}>
                <div className="track-group-heading">
                  <button type="button" onClick={() => toggleGroup(group)}>{collapsed ? "▸" : "▾"} {group}</button>
                  <button type="button" onClick={() => muteGroup(group)}>Mute group</button>
                </div>
                {!collapsed ? parts.filter((part) => filteredPartIds.has(part.id)).map((part) => {
                  const index = score.parts.indexOf(part);
                  const colour = part.color ?? trackColours[index % trackColours.length];
                  return (
                    <article
                      key={part.id}
                      className={`track-list-row ${activePartId === part.id ? "active" : ""} ${part.muted ? "muted" : ""}`}
                      style={{ "--track-colour": colour, contentVisibility: "auto", containIntrinsicSize: "44px" } as CSSProperties}
                      onClick={() => onActivePartChange(part.id)}
                    >
                      <input aria-label={`${part.name} colour`} type="color" value={colour} onChange={(event) => setTrackField(part.id, { color: event.target.value })} />
                      <span className="track-instrument-icon">{instrumentIcon(part.instrument.name)}</span>
                      <div><input aria-label={`Track name ${part.name}`} value={part.name} onChange={(event) => setTrackField(part.id, { name: event.target.value })} /><small>Ch {part.channel ?? index + 1} · {part.instrument.name}</small></div>
                      <button type="button" className={part.muted ? "active" : ""} aria-label={`Mute ${part.name}`} onClick={(event) => { event.stopPropagation(); setTrackField(part.id, { muted: !part.muted }); }}>M</button>
                      <button type="button" className={part.solo ? "active" : ""} aria-label={`Solo ${part.name}`} onClick={(event) => { event.stopPropagation(); setTrackField(part.id, { solo: !part.solo }); }}>S</button>
                      <input aria-label={`${part.name} volume`} type="number" min={0} max={100} value={Math.round((part.volume ?? 1) * 100)} onChange={(event) => setTrackField(part.id, { volume: Number(event.target.value) / 100 })} />
                      <input aria-label={`${part.name} pan`} type="range" min={-1} max={1} step={0.05} value={part.pan ?? 0} onChange={(event) => setTrackField(part.id, { pan: Number(event.target.value) })} />
                      <button type="button" className={isLocked(part) ? "active" : ""} aria-label={`Lock ${part.name}`} onClick={(event) => { event.stopPropagation(); setPartExtension(score, part.id, "locked", !isLocked(part), onChange); }}>⌑</button>
                      <button type="button" className={part.visible === false ? "active" : ""} aria-label={`Toggle ${part.name} visibility`} onClick={(event) => { event.stopPropagation(); setTrackField(part.id, { visible: part.visible === false }); }}>◉</button>
                    </article>
                  );
                }) : null}
              </section>
            );
          })}
          <button type="button" className="add-track-button" onClick={addTrack}>＋ Add Track</button>
        </aside>

        <main className="track-timeline-shell">
          <div
            className="track-timeline"
            ref={timelineRef}
            onScroll={(event) => setTimelineViewport({
              left: event.currentTarget.scrollLeft,
              width: event.currentTarget.clientWidth
            })}
          >
            <div className="timeline-inner" style={{ width: timelineWidth, "--timeline-zoom": zoom } as CSSProperties}>
              <div className="timeline-ruler">
                {measureNumbers.map((measure) => (
                  <button type="button" key={measure} className={currentMeasure === measure ? "current" : ""} style={{ width: measureWidth }} onClick={() => seekMeasure(measure)}>
                    <strong>{measure}</strong><span>1 · 2 · 3 · 4</span>
                  </button>
                ))}
              </div>
              <div className="loop-region" style={{ left: measureWidth * 0.15, width: measureWidth * 1.7 }}><span>Loop</span></div>
              {visibleTimelineParts.map((part) => {
                const partIndex = score.parts.indexOf(part);
                const colour = part.color ?? trackColours[partIndex % trackColours.length];
                const partRows = rowsByPart.get(part.id) ?? [];
                const visiblePartRows = partRows.filter((row) =>
                  row.absoluteBeat + row.durationBeats >= viewportBeatStart && row.absoluteBeat <= viewportBeatEnd
                );
                return (
                  <div className={`timeline-lane ${activePartId === part.id ? "active" : ""}`} style={{ "--track-colour": colour, contentVisibility: "auto", containIntrinsicSize: "48px" } as CSSProperties} key={part.id}>
                    {overlays.has("heat") ? measureNumbers.map((measure) => <span key={measure} className={`measure-heat ${heatClass(partRows, measure, measureIssues, part.id)}`} style={{ left: (measure - 1) * measureWidth, width: measureWidth }} />) : null}
                    {visiblePartRows.map((row) => (
                      <button
                        type="button"
                        key={row.key}
                        className={`timeline-event ${selectedEventId === row.key ? "selected" : ""} ${activePlaybackIds.has(row.event.id ?? "") ? "playing" : ""} ${row.event.type}`}
                        style={{
                          left: row.absoluteBeat / beatsPerMeasure * measureWidth,
                          width: Math.max(7, row.durationBeats / beatsPerMeasure * measureWidth)
                        }}
                        title={`${part.name} · Measure ${row.measureNumber} · Beat ${formatBeat(row.beat)} · ${eventLabel(row.event)} · ${durationLabel(row.event)}`}
                        onClick={() => { onActivePartChange(part.id); onSelectedEventChange(row.key); }}
                        onPointerDown={(event) => beginEventDrag(event, row)}
                      >
                        <span>{eventLabel(row.event)}</span>
                        {overlays.has("scale-degree") && row.event.type === "note" ? <small>{scaleDegree(row.event.pitch.step, score.global.key.tonic)}</small> : null}
                        {overlays.has("solfege") && row.event.type === "note" ? <small>{solfege(row.event.pitch.step)}</small> : null}
                        {overlays.has("roman") && row.event.type === "chord" ? <small>{row.event.semantic?.roman ?? "I"}</small> : null}
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="timeline-playhead" style={{ left: sourceBeat(snapshot.currentSourceTime) / beatsPerMeasure * measureWidth }}><span>{currentMeasure}</span></div>
            </div>
          </div>
          <div className="timeline-overview" aria-label="Timeline mini overview">
            {sampleRows(rows, 2000).map((row) => <i key={`overview-${row.key}`} style={{ left: `${row.absoluteBeat / (measureCount * beatsPerMeasure) * 100}%`, width: `${Math.max(0.25, row.durationBeats / (measureCount * beatsPerMeasure) * 100)}%`, background: score.parts[row.partIndex].color ?? trackColours[row.partIndex % trackColours.length] }} />)}
          </div>
        </main>

        <aside className="track-event-inspector" aria-label="Track and event inspector">
          <div className="inspector-tabs"><button type="button" className={!selectedRow ? "active" : ""}>Track</button><button type="button" className={selectedRow ? "active" : ""}>Event</button></div>
          {selectedRow ? (
            <EventInspector row={selectedRow} score={score} onChange={mutateSelectedEvent} onDelete={deleteSelectedEvent} />
          ) : (
            <TrackInspector
              part={score.parts.find((part) => part.id === activePartId) ?? score.parts[0]}
              presets={presets}
              onPatch={(patch) => setTrackField(activePartId, patch)}
              onInstrument={(value) => setInstrument(activePartId, value)}
              onExtension={(key, value) => setPartExtension(score, activePartId, key, value, onChange)}
            />
          )}
        </aside>
      </div>

      <section className="track-bottom-dock">
        <nav aria-label="Track Editor bottom panels">
          {([
            ["events", "Event List"],
            ["note-input", "Direct Note Entry"],
            ["keyboard", "Piano Keyboard"],
            ["spreadsheet", "Spreadsheet"]
          ] as Array<[BottomPanel, string]>).map(([id, label]) => <button type="button" key={id} className={bottomPanel === id ? "active" : ""} onClick={() => setBottomPanel(id)}>{label}</button>)}
        </nav>
        {bottomPanel === "events" ? <EventList rows={rows.filter((row) => row.partId === activePartId)} selectedEventId={selectedEventId} onSelect={onSelectedEventChange} /> : null}
        {bottomPanel === "note-input" ? (
          <div className="direct-note-entry">
            <div><strong>Note Input</strong><span>Active track: {score.parts.find((part) => part.id === activePartId)?.name}</span></div>
            <input aria-label="Direct note input" value={directInput} list="direct-note-suggestions" onChange={(event) => { setDirectInput(event.target.value); setInputMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter") commitDirectInput(); }} />
            <datalist id="direct-note-suggestions">{directNoteSuggestions.map((suggestion) => <option key={suggestion}>{suggestion}</option>)}</datalist>
            <button type="button" className="primary" onClick={commitDirectInput}>Add</button>
            <div className={`direct-note-status ${inputMessage && !parseDirectNoteInput(directInput).valid ? "error" : ""}`} role="status">{inputMessage || "Examples: C4 q · Bb3 1/8 · C4,E4,G4 h · R q · grace D5 1/16"}</div>
          </div>
        ) : null}
        {bottomPanel === "keyboard" ? (
          <div className="track-keyboard-panel">
            <PianoKeyboard
              range={{ from: "C3", to: "C6" }}
              activePitches={[]}
              keyboardNavigable
              onKeyPress={(pitch) => {
                setDirectInput(`${pitch} q`);
                const parsed = parseDirectNoteInput(`${pitch} q`);
                if (parsed.valid) {
                  const next = structuredClone(score) as FoxChildMusicScore;
                  const part = next.parts.find((entry) => entry.id === activePartId) ?? next.parts[0];
                  if (part) {
                    appendEvents(part, directNotesToEvents(parsed.entries, `keyboard-${Date.now()}`), beatsPerMeasure);
                    onChange(next);
                  }
                }
              }}
            />
          </div>
        ) : null}
        {bottomPanel === "spreadsheet" ? (
          <SpreadsheetEditor
            score={score}
            measureNumbers={measureNumbers}
            selectedCell={selectedCell}
            onSelect={setSelectedCell}
            onCommit={commitSpreadsheetCell}
            onKeyDown={handleSpreadsheetKey}
          />
        ) : null}
      </section>

      <section className="mini-score-strip" aria-label="Mini score strip">
        <div className="mini-staff-lines" />
        {sampleRows(rows.filter((row) => row.partId === activePartId && row.event.type !== "rest"), 2000).map((row) => (
          <button
            type="button"
            key={`mini-${row.key}`}
            className={selectedEventId === row.key ? "selected" : ""}
            style={{ left: `${row.absoluteBeat / (measureCount * beatsPerMeasure) * 100}%`, bottom: `${miniPitch(row.event)}%` }}
            aria-label={`Select ${eventLabel(row.event)} in measure ${row.measureNumber}`}
            onClick={() => {
              onSelectedEventChange(row.key);
              seekMeasure(row.measureNumber);
              timelineRef.current?.scrollTo({ left: Math.max(0, (row.measureNumber - 1) * measureWidth - 100), behavior: "smooth" });
            }}
          >●</button>
        ))}
        <span className="mini-score-cursor" style={{ left: `${Math.min(100, Math.max(0, sourceBeat(snapshot.currentSourceTime) / (measureCount * beatsPerMeasure) * 100))}%` }} />
      </section>
    </section>
  );
}

function EventInspector({ row, score, onChange, onDelete }: {
  row: EventRow;
  score: FoxChildMusicScore;
  onChange: (mutation: (event: MusicEvent) => MusicEvent | undefined) => void;
  onDelete: () => void;
}) {
  const event = row.event;
  const noteLike = event.type === "note" || event.type === "chord";
  const firstPitch = event.type === "note" ? event.pitch : event.type === "chord" ? event.pitches[0] : undefined;
  const notation = noteLike ? event.notation : undefined;
  function patch(patchValue: Partial<MusicEvent>) {
    onChange((current) => ({ ...current, ...patchValue } as MusicEvent));
  }
  function patchNotation(key: string, value: unknown) {
    if (!noteLike) return;
    onChange((current) => {
      if (current.type !== "note" && current.type !== "chord") return current;
      return { ...current, notation: { ...current.notation, [key]: value } };
    });
  }
  return (
    <div className="rich-event-fields">
      <label><span>Start</span><output>{row.measureNumber} · {formatBeat(row.beat)}</output></label>
      {firstPitch ? <label><span>Pitch</span><input value={pitchToName(firstPitch)} onChange={(input) => {
        try {
          const pitch = parsePitchName(input.target.value);
          onChange((current) => current.type === "note" ? { ...current, pitch } : current.type === "chord" ? { ...current, pitches: [pitch, ...current.pitches.slice(1)] } : current);
        } catch { /* keep the last valid AST value */ }
      }} /></label> : null}
      <label><span>Duration</span><select value={"duration" in event ? event.duration.value : "quarter"} onChange={(input) => {
        if (!("duration" in event)) return;
        const value = input.target.value as NoteDurationValue;
        patch({ duration: { ...event.duration, value, beats: DURATION_BEATS[value] } } as Partial<MusicEvent>);
      }}>{durationValues.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Voice</span><input type="number" min={1} max={16} value={event.voice ?? 1} onChange={(input) => patch({ voice: Number(input.target.value) } as Partial<MusicEvent>)} /></label>
      <label><span>Staff</span><input type="number" min={1} max={8} value={event.staff ?? 1} onChange={(input) => patch({ staff: Number(input.target.value) } as Partial<MusicEvent>)} /></label>
      {noteLike ? <label><span>Velocity</span><input type="number" min={1} max={127} value={event.velocity ?? 100} onChange={(input) => patch({ velocity: Number(input.target.value) } as Partial<MusicEvent>)} /></label> : null}
      {noteLike ? <label><span>Lyrics</span><input value={event.lyric ?? ""} onChange={(input) => patch({ lyric: input.target.value } as Partial<MusicEvent>)} /></label> : null}
      {event.type === "chord" ? <label><span>Chord</span><input value={event.semantic?.chordName ?? ""} onChange={(input) => patch({ semantic: { ...event.semantic, chordName: input.target.value } } as Partial<MusicEvent>)} /></label> : null}
      {noteLike ? <>
        <label className="field-toggle"><input type="checkbox" checked={Boolean(event.tie?.start)} onChange={(input) => patch({ tie: { ...event.tie, start: input.target.checked } } as Partial<MusicEvent>)} /><span>Tie</span></label>
        <label className="field-toggle"><input type="checkbox" checked={notation?.articulations?.includes("staccato") ?? false} onChange={(input) => patchNotation("articulations", input.target.checked ? ["staccato"] : [])} /><span>Staccato</span></label>
        <label className="field-toggle"><input type="checkbox" checked={notation?.articulations?.includes("accent") ?? false} onChange={(input) => patchNotation("articulations", input.target.checked ? ["accent"] : [])} /><span>Accent</span></label>
        <label><span>Slur</span><select value={notation?.slurs?.[0]?.type ?? ""} onChange={(input) => patchNotation("slurs", input.target.value ? [{ type: input.target.value }] : [])}><option value="">None</option><option value="start">Start</option><option value="continue">Continue</option><option value="stop">Stop</option></select></label>
        <label><span>Beam</span><select value={notation?.beams?.[0]?.value ?? ""} onChange={(input) => patchNotation("beams", input.target.value ? [{ number: 1, value: input.target.value }] : [])}><option value="">Auto</option><option value="begin">Begin</option><option value="continue">Continue</option><option value="end">End</option></select></label>
      </> : null}
      <label><span>MIDI Channel</span><input type="number" min={0} max={15} value={score.parts[row.partIndex].channel ?? row.partIndex} disabled /></label>
      <label><span>Expression</span><input value={String(event.extensions?.expression ?? "")} onChange={(input) => patch({ extensions: { ...event.extensions, expression: input.target.value } })} /></label>
      <label><span>Pedal</span><select value={String(event.extensions?.pedal ?? "off")} onChange={(input) => patch({ extensions: { ...event.extensions, pedal: input.target.value } })}><option>off</option><option>down</option><option>up</option></select></label>
      <label><span>Controller Data</span><input value={String(event.extensions?.controllerData ?? "")} onChange={(input) => patch({ extensions: { ...event.extensions, controllerData: input.target.value } })} /></label>
      <button type="button" className="danger" onClick={onDelete}>Delete Event</button>
    </div>
  );
}

function TrackInspector({ part, presets, onPatch, onInstrument, onExtension }: {
  part?: Part;
  presets: SoundFontPresetOption[];
  onPatch: (patch: Partial<Part>) => void;
  onInstrument: (value: string) => void;
  onExtension: (key: string, value: unknown) => void;
}) {
  if (!part) return <p>No track selected.</p>;
  return (
    <div className="rich-event-fields">
      <label><span>Track Name</span><input value={part.name} onChange={(event) => onPatch({ name: event.target.value })} /></label>
      <label><span>Instrument</span><select value={instrumentValue(part, presets)} onChange={(event) => onInstrument(event.target.value)}>{presets.map((preset) => <option key={presetOptionKey(preset)} value={presetOptionKey(preset)}>{preset.label}</option>)}</select></label>
      <label><span>Channel</span><input type="number" min={0} max={15} value={part.channel ?? 0} onChange={(event) => onPatch({ channel: Math.max(0, Math.min(15, Number(event.target.value))) })} /></label>
      <label><span>Volume</span><input type="range" min={0} max={1} step={0.01} value={part.volume ?? 1} onChange={(event) => onPatch({ volume: Number(event.target.value) })} /></label>
      <label><span>Pan</span><input type="range" min={-1} max={1} step={0.01} value={part.pan ?? 0} onChange={(event) => onPatch({ pan: Number(event.target.value) })} /></label>
      <label><span>Colour</span><input type="color" value={part.color ?? "#38c99b"} onChange={(event) => onPatch({ color: event.target.value })} /></label>
      <label><span>Group</span><select value={partGroup(part)} onChange={(event) => onExtension("orchestraGroup", event.target.value)}>{groupOrder.map((group) => <option key={group}>{group}</option>)}</select></label>
      <label className="field-toggle"><input type="checkbox" checked={Boolean(part.muted)} onChange={(event) => onPatch({ muted: event.target.checked })} /><span>Mute</span></label>
      <label className="field-toggle"><input type="checkbox" checked={Boolean(part.solo)} onChange={(event) => onPatch({ solo: event.target.checked })} /><span>Solo</span></label>
      <label className="field-toggle"><input type="checkbox" checked={Boolean(part.extensions?.locked)} onChange={(event) => onExtension("locked", event.target.checked)} /><span>Lock</span></label>
      <label className="field-toggle"><input type="checkbox" checked={Boolean(part.extensions?.frozen)} onChange={(event) => onExtension("frozen", event.target.checked)} /><span>Freeze</span></label>
      <label className="field-toggle"><input type="checkbox" checked={part.visible !== false} onChange={(event) => onPatch({ visible: event.target.checked })} /><span>Visible</span></label>
    </div>
  );
}

function EventList({ rows, selectedEventId, onSelect }: { rows: EventRow[]; selectedEventId?: string; onSelect: (id: string) => void }) {
  return (
    <div className="track-event-list" role="grid" aria-label="Event list">
      <div role="row"><strong>Bar</strong><strong>Beat</strong><strong>Tick</strong><strong>Duration</strong><strong>Note</strong><strong>Velocity</strong><strong>Voice</strong><strong>Staff</strong><strong>Lyric</strong><strong>Articulation</strong></div>
      {rows.map((row) => (
        <button type="button" role="row" key={row.key} className={selectedEventId === row.key ? "selected" : ""} onClick={() => onSelect(row.key)}>
          <span>{row.measureNumber}</span><span>{formatBeat(row.beat)}</span><span>{Math.round(row.beat * 480)}</span><span>{durationLabel(row.event)}</span><span>{eventLabel(row.event)}</span>
          <span>{"velocity" in row.event ? row.event.velocity ?? 100 : "—"}</span><span>{row.event.voice ?? 1}</span><span>{row.event.staff ?? 1}</span>
          <span>{"lyric" in row.event ? row.event.lyric ?? "—" : "—"}</span><span>{row.event.type === "note" || row.event.type === "chord" ? row.event.notation?.articulations?.join(", ") || "—" : "—"}</span>
        </button>
      ))}
    </div>
  );
}

function SpreadsheetEditor({ score, measureNumbers, selectedCell, onSelect, onCommit, onKeyDown }: {
  score: FoxChildMusicScore;
  measureNumbers: number[];
  selectedCell: { measure: number; part: number };
  onSelect: (cell: { measure: number; part: number }) => void;
  onCommit: (part: Part, measure: number, value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="track-spreadsheet" role="grid" aria-label="Spreadsheet event editor">
      <div className="spreadsheet-header"><strong>Measure</strong>{score.parts.map((part) => <strong key={part.id}>{part.name}</strong>)}</div>
      {measureNumbers.map((measure) => (
        <div className="spreadsheet-row" key={measure}><strong>{measure}</strong>{score.parts.map((part, partIndex) => {
          const selected = selectedCell.measure === measure && selectedCell.part === partIndex;
          return <input key={part.id} className={selected ? "selected" : ""} defaultValue={measureCellValue(part, measure)} onFocus={() => onSelect({ measure, part: partIndex })} onKeyDown={onKeyDown} onBlur={(event) => onCommit(part, measure, event.target.value)} aria-label={`${part.name}, measure ${measure}`} />;
        })}</div>
      ))}
    </div>
  );
}

function flattenEvents(score: FoxChildMusicScore, beatsPerMeasure: number): EventRow[] {
  return score.parts.flatMap((part, partIndex) => part.measures.flatMap((measure) => {
    let cursor = 0;
    return measure.events.map((event, eventIndex) => {
      const beat = event.position?.beat ?? cursor;
      const durationBeats = "duration" in event ? durationToBeats(event.duration) : 0.2;
      if (!event.position && event.type !== "annotation" && event.type !== "direction") cursor += durationBeats;
      return {
        key: `${part.id}:${measure.number}:${event.id ?? eventIndex}`,
        partId: part.id,
        partIndex,
        measureNumber: measure.number,
        eventIndex,
        beat,
        absoluteBeat: (measure.number - 1) * beatsPerMeasure + beat,
        durationBeats,
        event
      };
    }).filter((row) => row.event.type !== "annotation" && row.event.type !== "direction");
  })).sort((left, right) => left.absoluteBeat - right.absoluteBeat || left.partIndex - right.partIndex);
}

function appendEvents(part: Part, events: MusicEvent[], beatsPerMeasure: number) {
  const existing = flattenPart(part, beatsPerMeasure);
  let absoluteBeat = existing.reduce((end, row) => Math.max(end, row.absoluteBeat + row.durationBeats), 0);
  events.forEach((event) => {
    const measureNumber = Math.floor(absoluteBeat / beatsPerMeasure) + 1;
    const beat = absoluteBeat % beatsPerMeasure;
    const measure = ensureMeasure(part, measureNumber);
    event.position = { measure: measureNumber, beat };
    measure.events.push(event);
    if (!((event.type === "note" || event.type === "chord") && event.notation?.grace)) {
      absoluteBeat += "duration" in event ? durationToBeats(event.duration) : 0;
    }
  });
  part.measures.sort((left, right) => left.number - right.number);
}

function flattenPart(part: Part, beatsPerMeasure: number) {
  return flattenEvents({
    schemaVersion: "2.0",
    type: "FoxChildMusicScore",
    id: "part",
    metadata: { title: "Part" },
    global: { key: { tonic: "C", mode: "major" }, timeSignature: { beats: beatsPerMeasure, beatType: 4 }, tempo: { bpm: 120 } },
    parts: [part]
  }, beatsPerMeasure);
}

function relocateEvent(score: FoxChildMusicScore, row: EventRow, absoluteBeat: number, beatsPerMeasure: number, onChange: (score: FoxChildMusicScore) => void) {
  const next = structuredClone(score) as FoxChildMusicScore;
  const part = next.parts.find((entry) => entry.id === row.partId);
  const source = part?.measures.find((measure) => measure.number === row.measureNumber);
  const event = source?.events[row.eventIndex];
  if (!part || !source || !event) return;
  source.events.splice(row.eventIndex, 1);
  const measureNumber = Math.floor(absoluteBeat / beatsPerMeasure) + 1;
  const target = ensureMeasure(part, measureNumber);
  event.position = { measure: measureNumber, beat: absoluteBeat % beatsPerMeasure };
  target.events.push(event);
  target.events.sort((left, right) => (left.position?.beat ?? 0) - (right.position?.beat ?? 0));
  onChange(next);
}

function ensureMeasure(part: Part, number: number) {
  let measure = part.measures.find((entry) => entry.number === number);
  if (!measure) {
    measure = { number, events: [] };
    part.measures.push(measure);
  }
  return measure;
}

function allMeasureNumbers(score: FoxChildMusicScore): number[] {
  const maximum = Math.max(1, ...score.parts.flatMap((part) => part.measures.map((measure) => measure.number)));
  return Array.from({ length: maximum }, (_, index) => index + 1);
}

function groupParts(parts: Part[]) {
  const grouped = new Map<string, Part[]>();
  parts.forEach((part) => {
    const group = partGroup(part);
    grouped.set(group, [...(grouped.get(group) ?? []), part]);
  });
  return grouped;
}

function partGroup(part: Part): typeof groupOrder[number] {
  const stored = String(part.extensions?.orchestraGroup ?? "");
  if ((groupOrder as readonly string[]).includes(stored)) return stored as typeof groupOrder[number];
  const name = `${part.name} ${part.instrument.name}`.toLowerCase();
  if (/flute|clarinet|oboe|bassoon|sax/.test(name)) return "Woodwinds";
  if (/trumpet|horn|trombone|tuba|brass/.test(name)) return "Brass";
  if (/violin|viola|cello|bass|strings|harp/.test(name)) return "Strings";
  if (/drum|percussion|timpani|cymbal/.test(name)) return "Percussion";
  if (/piano|keyboard|organ|synth/.test(name)) return "Keyboard";
  if (/choir|voice|vocal|soprano|alto|tenor/.test(name)) return "Choir";
  return "Others";
}

function setPartExtension(score: FoxChildMusicScore, partId: string, key: string, value: unknown, onChange: (score: FoxChildMusicScore) => void) {
  const next = structuredClone(score) as FoxChildMusicScore;
  const part = next.parts.find((entry) => entry.id === partId);
  if (!part) return;
  part.extensions = { ...part.extensions, [key]: value };
  onChange(next);
}

function isLocked(part: Part | undefined) {
  return Boolean(part?.extensions?.locked || part?.extensions?.frozen);
}

function heatClass(rows: EventRow[], measure: number, issues: MeasureValidationResult[], partId: string) {
  if (issues.some((issue) => issue.partId === partId && issue.measure === measure)) return "issue";
  const density = rows.filter((row) => row.measureNumber === measure).length;
  if (density <= 1) return "sparse";
  if (density <= 5) return "normal";
  return "dense";
}

function eventLabel(event: MusicEvent): string {
  if (event.type === "note") return pitchToName(event.pitch);
  if (event.type === "chord") return event.semantic?.chordName ?? event.pitches.map(pitchToName).join(",");
  if (event.type === "rest") return "Rest";
  if (event.type === "annotation") return event.text;
  return event.dynamic ?? event.text ?? "Direction";
}

function durationLabel(event: MusicEvent): string {
  return "duration" in event ? event.duration.value.replaceAll("-", " ") : "—";
}

function formatBeat(beat: number) {
  return `${Math.floor(beat) + 1}.${Math.round((beat % 1) * 480)}`;
}

function quantize(value: number, grid: number) {
  return Math.round(value / grid) * grid;
}

function sourceBeat(value: { numerator: number; denominator: number }) {
  return Number(value.numerator) / Number(value.denominator);
}

function instrumentIcon(name: string) {
  const value = name.toLowerCase();
  if (/piano|keyboard/.test(value)) return "▥";
  if (/drum|percussion/.test(value)) return "◉";
  if (/violin|viola|cello|string/.test(value)) return "𝄢";
  if (/flute|clarinet|oboe|sax/.test(value)) return "♩";
  if (/trumpet|horn|trombone/.test(value)) return "⌁";
  return "♫";
}

function instrumentValue(part: Part, presets: SoundFontPresetOption[]) {
  const preset = presets.find((entry) =>
    entry.bank === (part.instrument.soundFontBank ?? 0)
    && entry.program === (part.instrument.soundFontPreset ?? (part.instrument.midiProgram ?? 1) - 1)
  ) ?? presets[0];
  return preset ? presetOptionKey(preset) : "";
}

function nextChannel(parts: Part[]) {
  for (let channel = 0; channel < 16; channel += 1) {
    if (channel !== 9 && !parts.some((part) => part.channel === channel)) return channel;
  }
  return 0;
}

function uniqueId(existing: string[], base: string) {
  let value = base;
  let index = 2;
  while (existing.includes(value)) value = `${base}-${index++}`;
  return value;
}

function scaleDegree(step: string, tonic: string) {
  const steps = ["C", "D", "E", "F", "G", "A", "B"];
  return String((steps.indexOf(step) - steps.indexOf(tonic) + 7) % 7 + 1);
}

function solfege(step: string) {
  return ({ C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "ti" } as Record<string, string>)[step] ?? "";
}

function miniPitch(event: MusicEvent) {
  const pitch = event.type === "note" ? event.pitch : event.type === "chord" ? event.pitches[0] : undefined;
  if (!pitch) return 44;
  const step = ["C", "D", "E", "F", "G", "A", "B"].indexOf(pitch.step);
  return Math.max(12, Math.min(82, 20 + (pitch.octave - 3) * 18 + step * 2.5));
}

function measureCellValue(part: Part, measureNumber: number) {
  return part.measures.find((measure) => measure.number === measureNumber)?.events
    .filter((event) => event.type !== "annotation" && event.type !== "direction")
    .map((event) => `${spreadsheetEventToken(event)} ${durationToken(event)}`)
    .join(" ") ?? "";
}

function spreadsheetEventToken(event: MusicEvent) {
  if (event.type === "note") return pitchToName(event.pitch);
  if (event.type === "chord") return event.pitches.map(pitchToName).join(",");
  if (event.type === "rest") return "R";
  return eventLabel(event);
}

function sampleRows(rows: EventRow[], maximum: number) {
  if (rows.length <= maximum) return rows;
  const step = rows.length / maximum;
  return Array.from({ length: maximum }, (_, index) => rows[Math.floor(index * step)]);
}

function durationToken(event: MusicEvent) {
  if (!("duration" in event)) return "";
  return ({ whole: "w", half: "h", quarter: "q", eighth: "8", sixteenth: "16", "thirty-second": "32", "dotted-half": "h", "dotted-quarter": "q", "dotted-eighth": "8" } as Record<NoteDurationValue, string>)[event.duration.value];
}
