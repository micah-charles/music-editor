import { Midi } from "@tonejs/midi";
import type { Duration, FoxChildMusicScore, MusicEvent, Pitch } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { splitBeatsIntoDurations } from "../rhythm/duration";
import { midiToPitch } from "../theory/pitch";
import { eventsToMeasures, getBeatsPerMeasure } from "../rhythm/measure";
import { parseKeyName } from "../theory/key";
import { detectChordName } from "../chords/chordDetection";

interface MidiImportOptions {
  title?: string;
}

interface MidiNoteForImport {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
}

interface MidiStartGroup {
  startTicks: number;
  notes: MidiNoteForImport[];
}

const MIN_BEAT = 0.25;
const BEAT_QUANTIZE = 0.25;
const EPSILON = 0.001;

export function midiToAst(data: ArrayBuffer | Uint8Array, options: MidiImportOptions = {}): FoxChildMusicScore {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const midi = new Midi(bytes);
  const tempo = Math.round(midi.header.tempos[0]?.bpm ?? 90);
  const timeSignatureTuple = midi.header.timeSignatures[0]?.timeSignature;
  const keySignature = midi.header.keySignatures[0];
  const key = keySignature ? parseKeyName(`${keySignature.key} ${keySignature.scale}`) : { tonic: "C" as const, mode: "major" as const };
  const timeSignature = {
    beats: Array.isArray(timeSignatureTuple) ? timeSignatureTuple[0] : 4,
    beatType: Array.isArray(timeSignatureTuple) ? timeSignatureTuple[1] : 4
  };
  const beatsPerMeasure = getBeatsPerMeasure(timeSignature);

  const score = createScoreFromEvents({
    id: slugify(options.title ?? "midi-draft-transcription"),
    title: options.title ?? "MIDI Draft Transcription",
    source: "midi-import",
    tempo,
    key,
    timeSignature,
    events: []
  });

  score.parts = midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track, index) => {
      const groups = groupNotesByStart(track.notes);
      const events: MusicEvent[] = [];
      let cursorBeat = 0;

      groups.forEach((group, groupIndex) => {
        const startBeat = quantizeBeat(group.startTicks / midi.header.ppq);
        const gap = startBeat - cursorBeat;

        if (gap > MIN_BEAT / 2) {
          appendRestEvents(events, gap, cursorBeat, beatsPerMeasure, `midi-${index + 1}-gap-${groupIndex + 1}`);
        }

        const durationBeats = Math.max(
          MIN_BEAT,
          quantizeBeat(Math.max(...group.notes.map((note) => note.durationTicks)) / midi.header.ppq)
        );
        const pitches = group.notes
          .map((note) => midiToPitch(note.midi))
          .sort((a, b) => pitchSortValue(a) - pitchSortValue(b));
        const velocity = Math.round((group.notes.reduce((total, note) => total + note.velocity, 0) / group.notes.length) * 127);
        const isPercussion = (track.channel ?? -1) === 9;

        appendSlicedEvents(
          events,
          durationBeats,
          Math.max(startBeat, cursorBeat),
          beatsPerMeasure,
          (duration, sliceIndex) =>
            createMidiImportEvent({
              id: `midi-${index + 1}-${group.notes.length > 1 ? "chord" : "note"}-${groupIndex + 1}-${sliceIndex + 1}`,
              duration,
              pitches,
              velocity,
              includeChordSemantic: group.notes.length > 1 && !isPercussion
            })
        );

        cursorBeat = Math.max(cursorBeat, startBeat + durationBeats);
      });

      return {
        id: `part-${index + 1}`,
        name: track.name || `MIDI Track ${index + 1}`,
        instrument: {
          name: track.instrument.name || "Piano",
          midiProgram: (track.instrument.number ?? 0) + 1,
          soundFontBank: 0,
          soundFontPreset: track.instrument.number ?? 0
        },
        clef: inferClef(track.instrument.family, track.instrument.name),
        channel: clampMidiChannel(track.channel ?? index),
        measures: eventsToMeasures(events, beatsPerMeasure)
      };
    });

  if (score.parts.length === 0) {
    score.parts[0].measures = [{ number: 1, events: [] }];
  }

  score.metadata.notes = "Imported from MIDI. This is a draft transcription; rhythm spelling and notation may need editing.";
  score.sourceMetadata = {
    originalFormat: "midi",
    draftTranscription: true,
    warnings: [
      "MIDI import is quantized to simple durations and should be reviewed.",
      `Imported MIDI metadata: ${key.tonic} ${key.mode}, ${timeSignature.beats}/${timeSignature.beatType}, ${tempo} bpm.`
    ]
  };

  return score;
}

function groupNotesByStart(notes: MidiNoteForImport[]): MidiStartGroup[] {
  const groups = new Map<number, MidiNoteForImport[]>();

  notes.forEach((note) => {
    const group = groups.get(note.ticks) ?? [];
    group.push(note);
    groups.set(note.ticks, group);
  });

  return [...groups.entries()]
    .map(([startTicks, groupedNotes]) => ({
      startTicks,
      notes: groupedNotes.sort((a, b) => a.midi - b.midi)
    }))
    .sort((a, b) => a.startTicks - b.startTicks);
}

function appendRestEvents(events: MusicEvent[], totalBeats: number, startBeat: number, beatsPerMeasure: number, idPrefix: string): void {
  appendSlicedEvents(
    events,
    totalBeats,
    startBeat,
    beatsPerMeasure,
    (duration, sliceIndex) => ({
      id: `${idPrefix}-${sliceIndex + 1}`,
      type: "rest",
      duration
    })
  );
}

function appendSlicedEvents(
  events: MusicEvent[],
  totalBeats: number,
  startBeat: number,
  beatsPerMeasure: number,
  createEvent: (duration: Duration, sliceIndex: number) => MusicEvent
): void {
  let remainingBeats = quantizeBeat(totalBeats);
  let currentBeat = quantizeBeat(startBeat);
  let sliceIndex = 0;

  while (remainingBeats > EPSILON) {
    const beatInMeasure = positiveModulo(currentBeat, beatsPerMeasure);
    const availableInMeasure = beatInMeasure < EPSILON ? beatsPerMeasure : beatsPerMeasure - beatInMeasure;
    const sliceBeats = Math.min(remainingBeats, quantizeBeat(availableInMeasure));

    splitBeatsIntoDurations(sliceBeats).forEach((duration) => {
      events.push(createEvent(duration, sliceIndex));
      sliceIndex += 1;
      currentBeat = quantizeBeat(currentBeat + (duration.beats ?? MIN_BEAT));
      remainingBeats = quantizeBeat(remainingBeats - (duration.beats ?? MIN_BEAT));
    });
  }
}

function createMidiImportEvent(options: {
  id: string;
  duration: Duration;
  pitches: Pitch[];
  velocity: number;
  includeChordSemantic: boolean;
}): MusicEvent {
  if (options.pitches.length === 1) {
    return {
      id: options.id,
      type: "note",
      pitch: options.pitches[0],
      duration: options.duration,
      velocity: options.velocity
    };
  }

  return {
    id: options.id,
    type: "chord",
    pitches: options.pitches,
    duration: options.duration,
    velocity: options.velocity,
    semantic: options.includeChordSemantic ? { chordName: detectChordName(options.pitches) } : undefined
  };
}

function quantizeBeat(beats: number): number {
  return Math.max(0, Math.round(beats / BEAT_QUANTIZE) * BEAT_QUANTIZE);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clampMidiChannel(channel: number): number {
  return Math.max(0, Math.min(15, channel));
}

function inferClef(family: string, instrumentName: string): "treble" | "bass" {
  const haystack = `${family} ${instrumentName}`.toLowerCase();
  return haystack.includes("bass") || haystack.includes("contrabass") ? "bass" : "treble";
}

function pitchSortValue(pitch: Pitch): number {
  const stepValue: Record<Pitch["step"], number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
  };
  return (pitch.octave + 1) * 12 + stepValue[pitch.step] + (pitch.alter ?? 0);
}
