import type { FoxChildMusicScore } from "../ast/types";
import { pitchToMidi, pitchToName, midiToPitch } from "../theory/pitch";

export function melodyRange(score: FoxChildMusicScore): string {
  const midiValues: number[] = [];

  score.parts.forEach((part) => {
    part.measures.forEach((measure) => {
      measure.events.forEach((event) => {
        if (event.type === "note") {
          midiValues.push(pitchToMidi(event.pitch));
        } else if (event.type === "chord") {
          event.pitches.forEach((pitch) => midiValues.push(pitchToMidi(pitch)));
        }
      });
    });
  });

  if (midiValues.length === 0) {
    return "No notes";
  }

  return `${pitchToName(midiToPitch(Math.min(...midiValues)))}-${pitchToName(midiToPitch(Math.max(...midiValues)))}`;
}
