import { useMemo, useState } from "react";
import {
  DURATION_BEATS,
  detectChordName,
  eventsToMeasures,
  getBeatsPerMeasure,
  parsePitchName,
  pitchToName,
  transposeScore,
  type Duration,
  type FoxChildMusicScore,
  type MeasureValidationResult,
  type MusicEvent,
  type NoteDurationValue,
  type Part
} from "@foxchild/music-core";
import {
  generalMidiPresetOptions,
  presetOptionKey,
  type SoundFontPresetOption
} from "../music/playback/soundfontPresets";

interface NoteEditorProps {
  score: FoxChildMusicScore;
  activePartId: string;
  measureIssues: MeasureValidationResult[];
  instrumentOptions: SoundFontPresetOption[];
  onActivePartChange: (partId: string) => void;
  onChange: (score: FoxChildMusicScore) => void;
}

type EditableEventType = "note" | "rest" | "chord";

const durationValues = Object.keys(DURATION_BEATS) as NoteDurationValue[];
const defaultDuration = { value: "quarter" as const, beats: DURATION_BEATS.quarter };
const defaultPitch = { step: "C" as const, octave: 4, alter: 0 };
const defaultChordPitches = ["C4", "E4", "G4"].map(parsePitchName);

export function NoteEditor({ score, activePartId, measureIssues, instrumentOptions, onActivePartChange, onChange }: NoteEditorProps) {
  const [inputWarnings, setInputWarnings] = useState<Record<string, string>>({});
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const presets = instrumentOptions.length > 0 ? instrumentOptions : generalMidiPresetOptions;
  const issueByPartMeasure = useMemo(() => {
    return new Map(measureIssues.map((issue) => [`${issue.partId}:${issue.measure}`, issue]));
  }, [measureIssues]);

  function updateScorePart(partId: string, update: (part: Part) => void) {
    const next = structuredClone(score) as FoxChildMusicScore;
    const part = next.parts.find((item) => item.id === partId);
    if (!part) {
      return;
    }
    update(part);
    onChange(next);
  }

  function rebuildPartEvents(partId: string, nextEvents: MusicEvent[]) {
    updateScorePart(partId, (part) => {
      part.measures = eventsToMeasures(nextEvents, getBeatsPerMeasure(score.global.timeSignature));
    });
  }

  function updateEvent(part: Part, index: number, nextEvent: MusicEvent) {
    const events = flattenedEvents(part);
    rebuildPartEvents(part.id, events.map((event, eventIndex) => eventIndex === index ? nextEvent : event));
  }

  function deleteEvent(part: Part, index: number) {
    const events = flattenedEvents(part);
    rebuildPartEvents(part.id, events.filter((_, eventIndex) => eventIndex !== index));
  }

  function addEvent(part: Part, type: EditableEventType) {
    rebuildPartEvents(part.id, [...flattenedEvents(part), createEvent(type, `${type}-${Date.now()}`, defaultDuration)]);
  }

  function updateEventType(part: Part, index: number, event: MusicEvent, type: EditableEventType) {
    if (event.type === type || event.type === "annotation") {
      return;
    }
    updateEvent(part, index, convertEventType(event, type));
  }

  function updatePitch(part: Part, index: number, event: MusicEvent, value: string) {
    if (event.type !== "note") {
      return;
    }
    const key = eventKey(part.id, event, "pitch");
    setDraftInputs((current) => ({ ...current, [key]: value }));
    try {
      const pitch = parsePitchName(value);
      clearInputState(key);
      updateEvent(part, index, { ...event, pitch });
    } catch (error) {
      setInputWarnings((current) => ({ ...current, [key]: errorMessage(error) }));
    }
  }

  function updateChordPitches(part: Part, index: number, event: MusicEvent, value: string) {
    if (event.type !== "chord") {
      return;
    }
    const key = eventKey(part.id, event, "chord");
    setDraftInputs((current) => ({ ...current, [key]: value }));
    try {
      const pitches = parsePitchList(value);
      if (pitches.length === 0) {
        throw new Error("Chord needs at least one pitch.");
      }
      clearInputState(key);
      updateEvent(part, index, {
        ...event,
        pitches,
        semantic: {
          ...event.semantic,
          chordName: pitches.length > 1 ? detectChordName(pitches) : undefined
        }
      });
    } catch (error) {
      setInputWarnings((current) => ({ ...current, [key]: errorMessage(error) }));
    }
  }

  function clearInputState(key: string) {
    setDraftInputs((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setInputWarnings((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function addTrack() {
    const next = structuredClone(score) as FoxChildMusicScore;
    const index = next.parts.length + 1;
    const partId = uniquePartId(next.parts, `track-${index}`);
    const preset = presets[0] ?? generalMidiPresetOptions[0];
    next.parts.push({
      id: partId,
      name: `Track ${index}`,
      instrument: {
        name: preset.name,
        midiProgram: preset.program + 1,
        soundFontBank: preset.bank,
        soundFontPreset: preset.program
      },
      clef: "treble",
      channel: next.parts.length % 16,
      collapsed: false,
      measures: [{ number: 1, events: [] }]
    });
    onChange(next);
    onActivePartChange(partId);
  }

  function deleteTrack(partId: string) {
    if (score.parts.length <= 1) {
      return;
    }
    const next = structuredClone(score) as FoxChildMusicScore;
    const deletedIndex = next.parts.findIndex((part) => part.id === partId);
    next.parts = next.parts.filter((part) => part.id !== partId);
    onChange(next);
    if (activePartId === partId) {
      onActivePartChange(next.parts[Math.max(0, deletedIndex - 1)]?.id ?? next.parts[0].id);
    }
  }

  function setInstrument(partId: string, key: string) {
    const preset = presets.find((item) => presetOptionKey(item) === key) ?? presets[0] ?? generalMidiPresetOptions[0];
    updateScorePart(partId, (part) => {
      part.instrument = {
        ...part.instrument,
        name: preset.name,
        midiProgram: preset.program + 1,
        soundFontBank: preset.bank,
        soundFontPreset: preset.program
      };
    });
  }

  return (
    <section className="panel note-panel track-panel-list">
      <div className="panel-heading">
        <h2>Tracks</h2>
        <div className="mini-actions">
          <span className="preset-count">{presets.length} presets</span>
          <button type="button" onClick={() => onChange(transposeScore(score, -1))}>-1</button>
          <button type="button" onClick={() => onChange(transposeScore(score, 1))}>+1</button>
          <button type="button" onClick={addTrack}>Add Track</button>
        </div>
      </div>

      {score.parts.map((part) => {
        const rows = part.measures.flatMap((measure) => {
          return measure.events
            .filter((event) => event.type !== "annotation")
            .map((event) => ({ event, measureNumber: measure.number }));
        });
        const collapsed = Boolean(part.collapsed);

        return (
          <article className={`track-panel ${activePartId === part.id ? "active" : ""}`} key={part.id}>
            <div className="track-header">
              <button
                type="button"
                className="icon-button"
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${part.name}`}
                onClick={() => updateScorePart(part.id, (nextPart) => { nextPart.collapsed = !nextPart.collapsed; })}
              >
                {collapsed ? "▶" : "▼"}
              </button>
              <label className="track-active-control">
                <input
                  type="radio"
                  name="active-track"
                  checked={activePartId === part.id}
                  onChange={() => onActivePartChange(part.id)}
                />
                <span>Input</span>
              </label>
              <input
                className="track-name-input"
                value={part.name}
                aria-label={`Track name ${part.name}`}
                onChange={(event) => updateScorePart(part.id, (nextPart) => { nextPart.name = event.target.value; })}
              />
              <label className="track-instrument-control">
                <span>Instrument</span>
                <select value={instrumentValue(part, presets)} onChange={(event) => setInstrument(part.id, event.target.value)}>
                  {presets.map((preset) => <option key={`${preset.bank}:${preset.program}:${preset.name}`} value={presetOptionKey(preset)}>{preset.label}</option>)}
                </select>
              </label>
              <label className="track-channel-control">
                <span>Channel</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={part.channel ?? score.parts.indexOf(part)}
                  onChange={(event) => updateScorePart(part.id, (nextPart) => { nextPart.channel = clampChannel(Number(event.target.value)); })}
                />
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(part.muted)}
                  onChange={(event) => updateScorePart(part.id, (nextPart) => { nextPart.muted = event.target.checked; })}
                />
                <span>Mute</span>
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(part.solo)}
                  onChange={(event) => updateScorePart(part.id, (nextPart) => { nextPart.solo = event.target.checked; })}
                />
                <span>Solo</span>
              </label>
              <button type="button" onClick={() => addEvent(part, "note")}>Add Event</button>
              <button type="button" onClick={() => deleteTrack(part.id)} disabled={score.parts.length <= 1}>Delete</button>
            </div>

            {!collapsed ? (
              <>
                <div className="note-table">
                  {rows.map((row, index) => {
                    const event = row.event;
                    const issue = issueByPartMeasure.get(`${part.id}:${row.measureNumber}`);
                    const inputKey = eventKey(part.id, event, event.type === "chord" ? "chord" : "pitch");
                    const warning = inputWarnings[inputKey];
                    return (
                      <div className={`note-row ${issue ? `measure-${issue.status}` : ""}`} key={event.id ?? `${part.id}-${index}`}>
                        <span className="row-index">{index + 1}</span>
                        <select
                          value={event.type}
                          aria-label={`Event type ${part.name} ${index + 1}`}
                          onChange={(input) => updateEventType(part, index, event, input.target.value as EditableEventType)}
                        >
                          <option value="note">note</option>
                          <option value="rest">rest</option>
                          <option value="chord">chord</option>
                        </select>
                        {event.type === "note" ? (
                          <input
                            className={warning ? "invalid" : ""}
                            value={draftInputs[inputKey] ?? pitchToName(event.pitch)}
                            aria-label={`Pitch ${part.name} ${index + 1}`}
                            onChange={(input) => updatePitch(part, index, event, input.target.value)}
                          />
                        ) : event.type === "rest" ? (
                          <input value="rest" disabled aria-label={`Rest ${part.name} ${index + 1}`} />
                        ) : event.type === "chord" ? (
                          <input
                            className={warning ? "invalid" : ""}
                            value={draftInputs[inputKey] ?? event.pitches.map(pitchToName).join(",")}
                            aria-label={`Chord ${part.name} ${index + 1}`}
                            onChange={(input) => updateChordPitches(part, index, event, input.target.value)}
                          />
                        ) : null}
                        <select
                          value={event.duration.value}
                          onChange={(input) => updateEvent(part, index, {
                            ...event,
                            duration: {
                              value: input.target.value as NoteDurationValue,
                              beats: DURATION_BEATS[input.target.value as NoteDurationValue]
                            }
                          } as MusicEvent)}
                        >
                          {durationValues.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
                        </select>
                        <button type="button" className="icon-button" aria-label={`Delete event ${part.name} ${index + 1}`} onClick={() => deleteEvent(part, index)}>×</button>
                        {issue ? <span className="measure-badge">M{row.measureNumber}</span> : null}
                        {warning ? <span className="event-warning">{warning}</span> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => addEvent(part, "note")}>Add Note</button>
                  <button type="button" onClick={() => addEvent(part, "rest")}>Add Rest</button>
                  <button type="button" onClick={() => addEvent(part, "chord")}>Add Chord</button>
                </div>
              </>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function flattenedEvents(part: Part): MusicEvent[] {
  return part.measures.flatMap((measure) => measure.events).filter((event) => event.type !== "annotation");
}

function createEvent(type: EditableEventType, id: string, duration: Duration): MusicEvent {
  if (type === "rest") {
    return { id, type: "rest", duration };
  }
  if (type === "chord") {
    return {
      id,
      type: "chord",
      pitches: defaultChordPitches.map((pitch) => ({ ...pitch })),
      duration,
      semantic: { chordName: "C" }
    };
  }
  return {
    id,
    type: "note",
    pitch: { ...defaultPitch },
    duration
  };
}

function convertEventType(event: Exclude<MusicEvent, { type: "annotation" }>, type: EditableEventType): MusicEvent {
  if (type === "rest") {
    return {
      id: event.id,
      type: "rest",
      duration: event.duration
    };
  }

  if (type === "note") {
    const pitch = event.type === "chord" ? event.pitches[0] ?? defaultPitch : event.type === "note" ? event.pitch : defaultPitch;
    return {
      id: event.id,
      type: "note",
      pitch: { ...pitch },
      duration: event.duration,
      velocity: event.type !== "rest" ? event.velocity : undefined
    };
  }

  const pitches = event.type === "note" ? [event.pitch] : event.type === "chord" ? event.pitches : [defaultPitch];
  return {
    id: event.id,
    type: "chord",
    pitches: pitches.map((pitch) => ({ ...pitch })),
    duration: event.duration,
    velocity: event.type !== "rest" ? event.velocity : undefined,
    semantic: pitches.length > 1 ? { chordName: detectChordName(pitches) } : undefined
  };
}

function parsePitchList(value: string) {
  return value
    .split(/[,\s]+/)
    .map((pitch) => pitch.trim())
    .filter(Boolean)
    .map(parsePitchName);
}

function eventKey(partId: string, event: MusicEvent, suffix: string): string {
  return `${partId}:${event.id ?? "event"}:${suffix}`;
}

function uniquePartId(parts: Part[], baseId: string): string {
  let id = baseId;
  let counter = 2;
  while (parts.some((part) => part.id === id)) {
    id = `${baseId}-${counter}`;
    counter += 1;
  }
  return id;
}

function instrumentValue(part: Part, presets: SoundFontPresetOption[]): string {
  const bySf2Preset = presets.find((preset) => preset.bank === (part.instrument.soundFontBank ?? 0) && preset.program === part.instrument.soundFontPreset);
  if (bySf2Preset) {
    return presetOptionKey(bySf2Preset);
  }

  const byMidiProgram = presets.find((preset) => preset.bank === 0 && preset.program === (part.instrument.midiProgram ?? 1) - 1);
  if (byMidiProgram) {
    return presetOptionKey(byMidiProgram);
  }

  const byName = presets.find((preset) => preset.name.toLowerCase() === part.instrument.name.toLowerCase());
  return presetOptionKey(byName ?? presets[0] ?? generalMidiPresetOptions[0]);
}

function clampChannel(value: number): number {
  return Math.min(15, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
