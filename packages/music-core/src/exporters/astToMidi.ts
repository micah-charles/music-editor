import { Midi } from "@tonejs/midi";
import { parseMidi, writeMidi } from "midi-file";
import type { FoxChildMusicScore, Part } from "../ast/types";
import { astToPlaybackEvents } from "../playback/astToPlaybackEvents";
import { keyToFifths } from "../theory/key";
import { buildMeasureMap } from "../timeline/measureMap";
import { buildTempoMap } from "../timeline/tempoMap";
import { toNumber } from "../timeline/rational";

export function astToMidi(score: FoxChildMusicScore): Uint8Array {
  const midi = new Midi();
  const measureMap = buildMeasureMap(score);
  const tempoMap = buildTempoMap(score, measureMap);
  const fifths = Math.min(7, Math.max(-7, score.global.key.fifths ?? keyToFifths(score.global.key.tonic, score.global.key.mode)));
  midi.header.tempos = tempoMap.map((tempo) => ({
    bpm: tempo.bpm,
    ticks: Math.round(toNumber(tempo.start) * midi.header.ppq)
  }));
  midi.header.timeSignatures = [{
    ticks: 0,
    timeSignature: [score.global.timeSignature.beats, score.global.timeSignature.beatType]
  }];
  midi.header.update();

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
        ticks: Math.round(event.startBeat * midi.header.ppq),
        durationTicks: Math.max(1, Math.round(event.durationBeats * midi.header.ppq)),
        velocity: Math.min(1, Math.max(0.001, (event.velocity / 127) * (event.trackVolume ?? 1)))
      });
    });
  }

  const encoded = parseMidi(midi.toArray());
  encoded.tracks[0].unshift({
    deltaTime: 0,
    meta: true,
    type: "keySignature",
    key: fifths,
    scale: score.global.key.mode === "minor" ? 1 : 0
  });
  return new Uint8Array(writeMidi(encoded));
}

function isPartPlayable(part: Part, hasSolo: boolean): boolean {
  return !part.muted && (!hasSolo || Boolean(part.solo));
}

function clampChannel(channel: number): number {
  return Math.min(15, Math.max(0, Math.round(channel)));
}
