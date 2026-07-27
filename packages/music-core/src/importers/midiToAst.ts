import { Midi } from "@tonejs/midi";
import type { Duration, FoxChildMusicScore, Measure, MusicEvent, Pitch } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { durationToBeats, splitBeatsIntoDurations } from "../rhythm/duration";
import { midiToPitch } from "../theory/pitch";
import { getBeatsPerMeasure } from "../rhythm/measure";
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

interface MidiTrackNotation {
  clef: "treble" | "bass";
  staffCount: 1 | 2;
  clefs?: Record<number, "treble" | "bass">;
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
  const scoreDurationBeats = quantizeBeat(midi.durationTicks / midi.header.ppq);
  const measureCount = Math.max(1, Math.ceil((scoreDurationBeats - EPSILON) / beatsPerMeasure));

  const score = createScoreFromEvents({
    id: slugify(options.title ?? "midi-draft-transcription"),
    title: options.title ?? "MIDI Draft Transcription",
    source: "midi-import",
    tempo,
    key,
    timeSignature,
    events: []
  });
  const inferredGrandStaffTracks: string[] = [];

  score.parts = midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track, index) => {
      const groups = groupNotesByStart(track.notes);
      const measures = createMeasures(measureCount);
      const notation = inferTrackNotation(track.instrument.family, track.instrument.name, track.name, track.notes);
      const voiceEndBeatsByStaff = new Map<number, number[]>();
      if (notation.staffCount === 2) {
        inferredGrandStaffTracks.push(track.name || track.instrument.name || `MIDI Track ${index + 1}`);
      }

      groups.forEach((group, groupIndex) => {
        const startBeat = quantizeBeat(group.startTicks / midi.header.ppq);
        const isPercussion = (track.channel ?? -1) === 9;
        const staffGroups = notation.staffCount === 2
          ? splitNotesByGrandStaff(group.notes)
          : [{ staff: 1, notes: group.notes }];

        staffGroups.forEach(({ staff, notes }) => {
          const durationBeats = Math.max(
            MIN_BEAT,
            quantizeBeat(Math.max(...notes.map((note) => note.durationTicks)) / midi.header.ppq)
          );
          const pitches = notes
            .map((note) => midiToPitch(note.midi))
            .sort((a, b) => pitchSortValue(a) - pitchSortValue(b));
          const velocity = Math.round((notes.reduce((total, note) => total + note.velocity, 0) / notes.length) * 127);
          const voiceEndBeats = voiceEndBeatsByStaff.get(staff) ?? [];
          const voice = assignVoice(voiceEndBeats, startBeat, durationBeats);
          voiceEndBeatsByStaff.set(staff, voiceEndBeats);

          appendPositionedEvents(
            measures,
            durationBeats,
            startBeat,
            beatsPerMeasure,
            (duration, sliceIndex, absoluteBeat) => ({
              ...createMidiImportEvent({
                id: `midi-${index + 1}-${staff}-${notes.length > 1 ? "chord" : "note"}-${groupIndex + 1}-${sliceIndex + 1}`,
                duration,
                pitches,
                velocity,
                includeChordSemantic: notes.length > 1 && !isPercussion
              }),
              position: positionAtBeat(absoluteBeat, beatsPerMeasure),
              staff,
              voice
            })
          );
        });
      });
      fillMeasureTails(measures, beatsPerMeasure, `midi-${index + 1}-tail`, notation.staffCount);

      return {
        id: `part-${index + 1}`,
        name: track.name || `MIDI Track ${index + 1}`,
        instrument: {
          name: track.instrument.name || "Piano",
          midiProgram: (track.instrument.number ?? 0) + 1,
          soundFontBank: 0,
          soundFontPreset: track.instrument.number ?? 0
        },
        clef: notation.clef,
        ...(notation.staffCount === 2 ? { staffCount: 2, clefs: notation.clefs } : {}),
        channel: clampMidiChannel(track.channel ?? index),
        measures
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
      ...(inferredGrandStaffTracks.length > 0 ? [
        `MIDI does not preserve notation clefs or staff assignments. FoxChild inferred a treble/bass grand staff for: ${inferredGrandStaffTracks.join(", ")}. Review notes near middle C; for ambiguous files, split keyboard hands into separate MIDI tracks before import, or use MusicXML for exact engraving.`
      ] : []),
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

function splitNotesByGrandStaff(notes: MidiNoteForImport[]): Array<{ staff: 1 | 2; notes: MidiNoteForImport[] }> {
  const upper = notes.filter((note) => note.midi >= 60);
  const lower = notes.filter((note) => note.midi < 60);
  return [
    ...(upper.length > 0 ? [{ staff: 1 as const, notes: upper }] : []),
    ...(lower.length > 0 ? [{ staff: 2 as const, notes: lower }] : [])
  ];
}

function createMeasures(measureCount: number): Measure[] {
  return Array.from({ length: measureCount }, (_, index) => ({
    number: index + 1,
    events: []
  }));
}

function appendPositionedEvents(
  measures: Measure[],
  totalBeats: number,
  startBeat: number,
  beatsPerMeasure: number,
  createEvent: (duration: Duration, sliceIndex: number, absoluteBeat: number) => MusicEvent
): void {
  let remainingBeats = quantizeBeat(totalBeats);
  let currentBeat = quantizeBeat(startBeat);
  let sliceIndex = 0;

  while (remainingBeats > EPSILON) {
    const beatInMeasure = positiveModulo(currentBeat, beatsPerMeasure);
    const availableInMeasure = beatInMeasure < EPSILON ? beatsPerMeasure : beatsPerMeasure - beatInMeasure;
    const sliceBeats = Math.min(remainingBeats, quantizeBeat(availableInMeasure));

    splitBeatsIntoDurations(sliceBeats).forEach((duration) => {
      const measureIndex = Math.floor((currentBeat + EPSILON) / beatsPerMeasure);
      const measure = measures[measureIndex];
      if (measure) {
        measure.events.push(createEvent(duration, sliceIndex, currentBeat));
      }
      sliceIndex += 1;
      currentBeat = quantizeBeat(currentBeat + (duration.beats ?? MIN_BEAT));
      remainingBeats = quantizeBeat(remainingBeats - (duration.beats ?? MIN_BEAT));
    });
  }
}

function assignVoice(voiceEndBeats: number[], startBeat: number, durationBeats: number): number {
  let voiceIndex = voiceEndBeats.findIndex((endBeat) => endBeat <= startBeat + EPSILON);
  if (voiceIndex < 0) {
    voiceIndex = voiceEndBeats.length;
  }
  voiceEndBeats[voiceIndex] = startBeat + durationBeats;
  return voiceIndex + 1;
}

function fillMeasureTails(measures: Measure[], beatsPerMeasure: number, idPrefix: string, staffCount: number): void {
  measures.forEach((measure) => {
    for (let staff = 1; staff <= staffCount; staff += 1) {
      const lastBeat = measure.events.reduce((maximum, event) => {
        if (event.type === "annotation" || event.type === "direction" || (event.staff ?? 1) !== staff) return maximum;
        const startBeat = event.position?.beat ?? 0;
        return Math.max(maximum, startBeat + durationToBeats(event.duration));
      }, 0);
      const missingBeats = quantizeBeat(beatsPerMeasure - lastBeat);
      if (missingBeats <= EPSILON) continue;

      let restBeat = lastBeat;
      splitBeatsIntoDurations(missingBeats).forEach((duration, restIndex) => {
        measure.events.push({
          id: `${idPrefix}-${measure.number}-${staff}-${restIndex + 1}`,
          type: "rest",
          duration,
          position: { measure: measure.number, beat: quantizeBeat(restBeat) },
          staff,
          voice: 1
        });
        restBeat += durationToBeats(duration);
      });
    }
  });
}

function positionAtBeat(absoluteBeat: number, beatsPerMeasure: number): { measure: number; beat: number } {
  return {
    measure: Math.floor((absoluteBeat + EPSILON) / beatsPerMeasure) + 1,
    beat: quantizeBeat(positiveModulo(absoluteBeat, beatsPerMeasure))
  };
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

function inferTrackNotation(
  family: string,
  instrumentName: string,
  trackName: string,
  notes: MidiNoteForImport[]
): MidiTrackNotation {
  const haystack = `${family} ${instrumentName} ${trackName}`.toLowerCase();
  const isKeyboard = ["piano", "keyboard", "organ", "harpsichord", "clav"].some((name) => haystack.includes(name));
  const minimumPitch = Math.min(...notes.map((note) => note.midi));
  const maximumPitch = Math.max(...notes.map((note) => note.midi));

  if (isKeyboard && minimumPitch < 60 && maximumPitch >= 60) {
    return {
      clef: "treble",
      staffCount: 2,
      clefs: { 1: "treble", 2: "bass" }
    };
  }
  if (isKeyboard && maximumPitch < 60) {
    return { clef: "bass", staffCount: 1 };
  }

  const bassClefInstrument = [
    "bass",
    "contrabass",
    "cello",
    "violoncello",
    "bassoon",
    "trombone",
    "tuba",
    "euphonium"
  ].some((name) => haystack.includes(name));
  return {
    clef: bassClefInstrument ? "bass" : "treble",
    staffCount: 1
  };
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
