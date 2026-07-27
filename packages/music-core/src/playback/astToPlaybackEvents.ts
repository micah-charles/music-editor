import type { FoxChildMusicScore, PlaybackEvent } from "../ast/types";
import { compileScoreTimeline } from "../timeline/compileScoreTimeline";
import { toNumber } from "../timeline/rational";

export function astToPlaybackEvents(score: FoxChildMusicScore): PlaybackEvent[] {
  const hasSolo = score.parts.some((part) => part.solo);
  const audibleParts = new Set(score.parts
    .filter((part) => !part.muted && (!hasSolo || part.solo))
    .map((part) => part.id));

  return compileScoreTimeline(score).playbackEvents
    .filter((event) => audibleParts.has(event.partId)
      && event.kind !== "annotation"
      && (event.kind === "rest" || (event.attack && toNumber(event.soundingDuration) > 0)))
    .map((event) => ({
      id: event.id,
      partId: event.partId,
      measureNumber: event.measureNumber,
      pitch: event.pitch,
      midi: event.midi,
      startBeat: toNumber(event.scoreStart),
      durationBeats: toNumber(event.soundingDuration),
      velocity: event.velocity,
      trackVolume: event.trackVolume,
      pan: event.pan,
      isRest: event.kind === "rest",
      instrument: event.instrument,
      channel: event.channel,
      midiProgram: event.midiProgram,
      midiBank: event.midiBank
    }));
}
