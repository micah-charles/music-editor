import type { FoxChildMusicScore, FoxChildSimpleScoreV1 } from "../ast/types";
import { durationToBeats } from "../rhythm/duration";
import { pitchToMidi, pitchToName } from "../theory/pitch";

export function astToSimpleJson(score: FoxChildMusicScore): FoxChildSimpleScoreV1 {
  return {
    schemaVersion: "1.0",
    id: score.id,
    title: score.metadata.title,
    composer: score.metadata.composer,
    tempo: score.global.tempo.bpm,
    key: `${score.global.key.tonic} ${score.global.key.mode}`,
    timeSignature: { ...score.global.timeSignature },
    tracks: score.parts.map((part) => {
      const notes: FoxChildSimpleScoreV1["tracks"][number]["notes"] = [];

      part.measures.forEach((measure) => {
        measure.events.forEach((event) => {
        if (event.type === "note") {
          notes.push({
            id: event.id,
            pitch: pitchToName(event.pitch),
            midi: pitchToMidi(event.pitch),
            duration: event.duration.value,
            velocity: event.velocity,
            lyric: event.lyric
          });
          return;
        }
        if (event.type === "rest") {
          notes.push({
            id: event.id,
            rest: true,
            duration: event.duration.value
          });
          return;
        }
        if (event.type === "chord") {
          event.pitches.forEach((pitch, index) => notes.push({
            id: `${event.id ?? "chord"}-${index + 1}`,
            pitch: pitchToName(pitch),
            midi: pitchToMidi(pitch),
            duration: event.duration.value,
            velocity: event.velocity
          }));
        }
        });
      });

      return {
        id: part.id,
        name: part.name,
        instrument: part.instrument.name,
        clef: part.clef,
        notes
      };
    }),
    metadata: {
      source: score.metadata.source,
      createdAt: score.metadata.createdAt,
      updatedAt: score.metadata.updatedAt,
      notes: `Converted from FoxChild Music AST v2. Durations are stored as labels; beat data remains in AST. First track total beats: ${score.parts[0]?.measures.reduce((sum, measure) => {
        return sum + measure.events.reduce((eventSum, event) => {
          if (event.type === "annotation" || event.type === "direction") {
            return eventSum;
          }
          return eventSum + durationToBeats(event.duration);
        }, 0);
      }, 0) ?? 0}.`
    }
  };
}
