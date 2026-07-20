import { parsePitchName, pitchToMidi } from "@foxchild/music-core";
import type { PlaybackEngine, PlaybackNoteEvent, PlaybackOptions } from "./PlaybackEngine";
import { scheduleActivePitchCallbacks, secondsPerBeat } from "./PlaybackEngine";

export type SampleMap = {
  instrument: string;
  format?: string;
  samples: Record<string, string>;
};

export type SamplePlaybackConfig = {
  sampleMapUrl: string;
  instrument?: string;
};

type LoadedSample = {
  pitch: string;
  midi: number;
  url: string;
  buffer: AudioBuffer;
};

export const pianoSampleMap: SampleMap = {
  instrument: "piano",
  format: "wav",
  samples: {
    C3: "/samples/piano/C3.wav",
    E3: "/samples/piano/E3.wav",
    G3: "/samples/piano/G3.wav",
    C4: "/samples/piano/C4.wav",
    E4: "/samples/piano/E4.wav",
    G4: "/samples/piano/G4.wav",
    C5: "/samples/piano/C5.wav"
  }
};

export class SamplePlaybackEngine implements PlaybackEngine {
  name = "Sampled Piano";
  private audioContext?: AudioContext;
  private masterGain?: GainNode;
  private samples: LoadedSample[] = [];
  private activeSources: AudioBufferSourceNode[] = [];
  private stopActivePitchCallbacks?: () => void;
  private loaded = false;

  constructor(private config: SamplePlaybackConfig) {}

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const context = this.getAudioContext();
    const sampleMap = await this.fetchSampleMap();
    const loadedSamples = await Promise.all(
      Object.entries(sampleMap.samples).map(async ([pitch, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            return null;
          }
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return {
            pitch,
            midi: pitchToMidi(parsePitchName(pitch)),
            url,
            buffer
          };
        } catch {
          return null;
        }
      })
    );

    this.samples = loadedSamples.filter((sample): sample is LoadedSample => Boolean(sample));
    this.loaded = true;

    if (this.samples.length === 0) {
      throw new Error(`No playable samples were found for ${this.config.instrument ?? "instrument"} at ${this.config.sampleMapUrl}.`);
    }
  }

  async play(events: PlaybackNoteEvent[], options: PlaybackOptions): Promise<void> {
    await this.load();
    const context = this.getAudioContext();
    await context.resume();
    this.stop();

    this.masterGain = context.createGain();
    this.masterGain.gain.value = Math.min(1, Math.max(0, options.volume));
    this.masterGain.connect(context.destination);

    const startAt = context.currentTime + 0.05;
    const beatSeconds = secondsPerBeat(options);
    this.stopActivePitchCallbacks = scheduleActivePitchCallbacks(events, options, 0.05);

    events.forEach((event) => {
      const sample = this.nearestSample(event.midi);
      if (!sample || !this.masterGain) {
        return;
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const eventStart = startAt + event.startBeat * beatSeconds;
      const eventDuration = event.durationBeats * beatSeconds;

      source.buffer = sample.buffer;
      source.playbackRate.value = Math.pow(2, (event.midi - sample.midi) / 12);
      gain.gain.value = Math.min(1, Math.max(0.03, (event.velocity ?? 80) / 127));
      source.connect(gain).connect(this.masterGain);
      source.start(eventStart);
      source.stop(eventStart + eventDuration);
      source.onended = () => {
        this.activeSources = this.activeSources.filter((item) => item !== source);
      };
      this.activeSources.push(source);
    });
  }

  pause(): void {
    this.stop();
  }

  stop(): void {
    this.stopActivePitchCallbacks?.();
    this.stopActivePitchCallbacks = undefined;
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped sources throw in some browsers.
      }
    });
    this.activeSources = [];
    this.masterGain?.disconnect();
    this.masterGain = undefined;
  }

  dispose(): void {
    this.stop();
  }

  private async fetchSampleMap(): Promise<SampleMap> {
    try {
      const response = await fetch(this.config.sampleMapUrl);
      if (response.ok) {
        return await response.json() as SampleMap;
      }
    } catch {
      // Fall through to bundled piano map if this is the default piano path.
    }

    if (this.config.sampleMapUrl.endsWith("/samples/piano/sample-map.json")) {
      return pianoSampleMap;
    }

    throw new Error(`Sample map not found: ${this.config.sampleMapUrl}`);
  }

  private nearestSample(midi: number): LoadedSample | undefined {
    return this.samples.reduce<LoadedSample | undefined>((nearest, sample) => {
      if (!nearest) {
        return sample;
      }
      return Math.abs(sample.midi - midi) < Math.abs(nearest.midi - midi) ? sample : nearest;
    }, undefined);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
    }
    return this.audioContext;
  }
}
