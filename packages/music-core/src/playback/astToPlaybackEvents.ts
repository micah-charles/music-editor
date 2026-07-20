import type { FoxChildMusicScore, MusicEvent, PlaybackEvent } from "../ast/types";
import { durationToBeats } from "../rhythm/duration";
import { getBeatsPerMeasure } from "../rhythm/measure";
import { pitchToMidi, pitchToName } from "../theory/pitch";

export function astToPlaybackEvents(score: FoxChildMusicScore): PlaybackEvent[] {
  const beatsPerMeasure = getBeatsPerMeasure(score.global.timeSignature);
  const events: PlaybackEvent[] = [];
  const hasSolo = score.parts.some((part) => part.solo);

  for (const [partIndex, part] of score.parts.entries()) {
    if (part.muted || (hasSolo && !part.solo)) {
      continue;
    }

    const channel = clampChannel(part.channel ?? partIndex);
    const midiProgram = part.instrument.soundFontPreset ?? zeroBasedProgram(part.instrument.midiProgram);
    const midiBank = part.instrument.soundFontBank ?? 0;

    for (const measure of part.measures) {
      let localBeat = 0;
      const measureStartBeat = (measure.number - 1) * beatsPerMeasure;

      for (const event of measure.events) {
        const durationBeats = getEventDuration(event);
        const startBeat = measureStartBeat + localBeat;

        if (event.type === "note") {
          events.push({
            id: event.id ?? `${part.id}-${measure.number}-${events.length + 1}`,
            partId: part.id,
            measureNumber: measure.number,
            pitch: pitchToName(event.pitch),
            midi: pitchToMidi(event.pitch),
            startBeat,
            durationBeats,
            velocity: event.velocity ?? 80,
            instrument: part.instrument.name.toLowerCase(),
            channel,
            midiProgram,
            midiBank
          });
        } else if (event.type === "chord") {
          event.pitches.forEach((pitch, chordIndex) => {
            events.push({
              id: `${event.id ?? `${part.id}-${measure.number}-${events.length + 1}`}-${chordIndex + 1}`,
              partId: part.id,
              measureNumber: measure.number,
              pitch: pitchToName(pitch),
              midi: pitchToMidi(pitch),
              startBeat,
              durationBeats,
              velocity: event.velocity ?? 80,
              instrument: part.instrument.name.toLowerCase(),
              channel,
              midiProgram,
              midiBank
            });
          });
        } else if (event.type === "rest") {
          events.push({
            id: event.id ?? `${part.id}-${measure.number}-rest-${events.length + 1}`,
            partId: part.id,
            measureNumber: measure.number,
            startBeat,
            durationBeats,
            velocity: 0,
            isRest: true,
            instrument: part.instrument.name.toLowerCase(),
            channel,
            midiProgram,
            midiBank
          });
        }

        localBeat += durationBeats;
      }
    }
  }

  return events.sort((a, b) => a.startBeat - b.startBeat);
}

function getEventDuration(event: MusicEvent): number {
  if (event.type === "annotation") {
    return 0;
  }
  return durationToBeats(event.duration);
}

function clampChannel(channel: number): number {
  return Math.min(15, Math.max(0, Math.round(channel)));
}

function zeroBasedProgram(program: number | undefined): number | undefined {
  return program === undefined ? undefined : Math.min(127, Math.max(0, Math.round(program) - 1));
}
