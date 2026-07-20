import type { FoxChildMusicScore, FoxChildSimpleScoreV1, MusicEvent } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { DURATION_BEATS } from "../rhythm/duration";
import { parseKeyName } from "../theory/key";
import { midiToPitch, parsePitchName } from "../theory/pitch";
import { eventsToMeasures, getBeatsPerMeasure } from "../rhythm/measure";

export function simpleJsonToAst(score: FoxChildSimpleScoreV1): FoxChildMusicScore {
  const timeSignature = parseTimeSignature(score.timeSignature);
  const key = parseKeyName(score.key);

  const ast = createScoreFromEvents({
    id: score.id || slugify(score.title),
    title: score.title || "Imported V1 Score",
    composer: score.composer,
    source: "v1-json",
    tempo: score.tempo || 90,
    key,
    timeSignature,
    events: []
  });

  const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
  ast.parts = score.tracks.map((track, trackIndex) => {
    const events: MusicEvent[] = track.notes.map((note, noteIndex) => {
      const duration = {
        value: note.duration,
        beats: DURATION_BEATS[note.duration]
      };

      if (note.rest || (!note.pitch && typeof note.midi !== "number")) {
        return {
          id: note.id ?? `${track.id}-rest-${noteIndex + 1}`,
          type: "rest",
          duration
        };
      }

      return {
        id: note.id ?? `${track.id}-note-${noteIndex + 1}`,
        type: "note",
        pitch: note.pitch ? parsePitchName(note.pitch) : midiToPitch(note.midi ?? 60),
        duration,
        velocity: note.velocity,
        lyric: note.lyric
      };
    });

    return {
      id: track.id || `part-${trackIndex + 1}`,
      name: track.name || `Part ${trackIndex + 1}`,
      instrument: {
        name: track.instrument || "Piano",
        midiProgram: 1
      },
      clef: track.clef ?? "treble",
      measures: eventsToMeasures(events, beatsPerMeasure)
    };
  });
  ast.sourceMetadata = {
    originalFormat: "foxchild-v1"
  };

  return ast;
}

function parseTimeSignature(value: FoxChildSimpleScoreV1["timeSignature"]): { beats: number; beatType: number } {
  if (typeof value === "string") {
    const [beats, beatType] = value.split("/").map(Number);
    return {
      beats: beats || 4,
      beatType: beatType || 4
    };
  }
  return value ?? { beats: 4, beatType: 4 };
}
