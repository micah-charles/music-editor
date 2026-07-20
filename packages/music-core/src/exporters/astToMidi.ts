import { Midi } from "@tonejs/midi";
import type { FoxChildMusicScore, Part } from "../ast/types";
import { astToPlaybackEvents } from "../playback/astToPlaybackEvents";

export function astToMidi(score: FoxChildMusicScore): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(score.global.tempo.bpm);

  const eventsByPart = new Map<string, ReturnType<typeof astToPlaybackEvents>>();
  for (const event of astToPlaybackEvents(score).filter((playbackEvent) => !playbackEvent.isRest && typeof playbackEvent.midi === "number")) {
    const partEvents = eventsByPart.get(event.partId) ?? [];
    partEvents.push(event);
    eventsByPart.set(event.partId, partEvents);
  }

  const hasSolo = score.parts.some((part) => part.solo);
  const playableParts = score.parts.filter((part) => isPartPlayable(part, hasSolo));

  for (const [partIndex, part] of playableParts.entries()) {
    const track = midi.addTrack();
    track.name = part.name;
    track.channel = clampChannel(part.channel ?? partIndex);
    track.instrument.number = Math.max(0, (part.instrument.midiProgram ?? 1) - 1);

    const partEvents = eventsByPart.get(part.id) ?? [];
    partEvents.forEach((event) => {
      track.addNote({
        midi: event.midi ?? 60,
        time: beatsToSeconds(event.startBeat, score.global.tempo.bpm),
        duration: beatsToSeconds(event.durationBeats, score.global.tempo.bpm),
        velocity: Math.min(1, Math.max(0.1, event.velocity / 127))
      });
    });
  }

  return new Uint8Array(midi.toArray());
}

function beatsToSeconds(beats: number, bpm: number): number {
  return beats * 60 / bpm;
}

function isPartPlayable(part: Part, hasSolo: boolean): boolean {
  return !part.muted && (!hasSolo || Boolean(part.solo));
}

function clampChannel(channel: number): number {
  return Math.min(15, Math.max(0, Math.round(channel)));
}
