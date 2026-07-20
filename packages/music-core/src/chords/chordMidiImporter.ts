import { Midi } from "@tonejs/midi";
import type { FoxChildMusicScore, MusicEvent } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { beatsToDuration, splitBeatsIntoDurations } from "../rhythm/duration";
import { getBeatsPerMeasure } from "../rhythm/measure";
import { midiToPitch } from "../theory/pitch";
import { detectChordName } from "./chordDetection";
import { chordFunctionFromRoman, detectRomanNumeral } from "./romanNumeral";

export interface ChordMidiImportOptions {
  title?: string;
  key?: string;
}

type MidiNoteLike = {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
};

export function importChordMidiToAst(data: ArrayBuffer | Uint8Array, options: ChordMidiImportOptions = {}): FoxChildMusicScore {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const midi = new Midi(bytes);
  const tempo = Math.round(midi.header.tempos[0]?.bpm ?? 90);
  const timeSignatureTuple = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature = {
    beats: Array.isArray(timeSignatureTuple) ? timeSignatureTuple[0] : 4,
    beatType: Array.isArray(timeSignatureTuple) ? timeSignatureTuple[1] : 4
  };
  const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
  const key = options.key ?? "C major";
  const notes = midi.tracks.flatMap((track) => track.notes as MidiNoteLike[]).sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
  const groups = groupNotesByStart(notes, midi.header.ppq);
  const events: MusicEvent[] = [];
  let cursorBeat = 0;

  groups.forEach((group, groupIndex) => {
    const startBeat = group.startBeat;
    const gap = startBeat - cursorBeat;
    if (gap > 0.125) {
      splitBeatsIntoDurations(gap).forEach((duration, restIndex) => {
        events.push({
          id: `chord-midi-rest-${groupIndex + 1}-${restIndex + 1}`,
          type: "rest",
          duration
        });
      });
    }

    const pitches = group.notes.map((note) => midiToPitch(note.midi));
    const durationBeats = Math.max(0.25, Math.max(...group.notes.map((note) => note.durationTicks / midi.header.ppq)));
    const duration = beatsToDuration(durationBeats);
    const chordName = detectChordName(pitches);
    const roman = detectRomanNumeral(chordName, key);

    events.push({
      id: `chord-midi-${groupIndex + 1}`,
      type: "chord",
      pitches,
      duration,
      velocity: Math.round(Math.max(...group.notes.map((note) => note.velocity)) * 127),
      semantic: {
        chordName,
        roman,
        function: chordFunctionFromRoman(roman)
      }
    });

    cursorBeat = Math.max(cursorBeat, startBeat + (duration.beats ?? durationBeats));
  });

  const title = options.title ?? "Chord MIDI Progression";
  const score = createScoreFromEvents({
    id: slugify(title),
    title,
    source: "midi-import",
    tempo,
    timeSignature,
    events
  });
  score.parts[0].id = "chords";
  score.parts[0].name = "Chords";
  score.sourceMetadata = {
    originalFormat: "midi",
    draftTranscription: true,
    warnings: ["Chord MIDI imported as harmonic AST events. Review voicings and rhythm before publishing."]
  };
  return score;
}

function groupNotesByStart(notes: MidiNoteLike[], ppq: number): Array<{ startBeat: number; notes: MidiNoteLike[] }> {
  const toleranceTicks = Math.max(1, Math.round(ppq / 48));
  const groups: Array<{ startTicks: number; startBeat: number; notes: MidiNoteLike[] }> = [];

  notes.forEach((note) => {
    const existing = groups.find((group) => Math.abs(group.startTicks - note.ticks) <= toleranceTicks);
    if (existing) {
      existing.notes.push(note);
    } else {
      groups.push({
        startTicks: note.ticks,
        startBeat: note.ticks / ppq,
        notes: [note]
      });
    }
  });

  return groups.map(({ startBeat, notes: groupNotes }) => ({
    startBeat,
    notes: groupNotes
  }));
}
