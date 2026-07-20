import type { SoundFontConfig } from "./SoundFontPlaybackEngine";

export type PlaybackInstrument = "piano" | "trumpet" | "violin" | "flute";

export const defaultDirectSoundFontUrl = "/soundfonts/default.sf2";

export const gmProgramByInstrument: Record<PlaybackInstrument, number> = {
  piano: 0,
  trumpet: 56,
  violin: 40,
  flute: 73
};

export const instrumentSampleMaps: Record<PlaybackInstrument, string> = {
  piano: "/samples/piano/sample-map.json",
  trumpet: "/samples/trumpet/sample-map.json",
  violin: "/samples/violin/sample-map.json",
  flute: "/samples/flute/sample-map.json"
};

export function defaultSoundFontConfig(soundFontUrl = defaultDirectSoundFontUrl): SoundFontConfig {
  return {
    mode: "direct-sf2",
    soundFontUrl,
    bank: 0,
    program: 0
  };
}
