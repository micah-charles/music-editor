import type { FoxChildMusicScore } from "../ast/types";
import { transposePitch } from "./pitch";

export function transposeScore(score: FoxChildMusicScore, semitones: number): FoxChildMusicScore {
  const next = structuredClone(score) as FoxChildMusicScore;

  next.parts.forEach((part) => {
    part.measures.forEach((measure) => {
      measure.events.forEach((event) => {
        if (event.type === "note") {
          event.pitch = transposePitch(event.pitch, semitones);
        } else if (event.type === "chord") {
          event.pitches = event.pitches.map((pitch) => transposePitch(pitch, semitones));
        }
      });
    });
  });

  next.metadata.updatedAt = new Date().toISOString().slice(0, 10);
  return next;
}
