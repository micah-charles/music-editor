import type { PlaybackEngine, PlaybackNoteEvent, PlaybackOptions } from "./PlaybackEngine";
import { DirectSf2PlaybackEngine } from "./DirectSf2PlaybackEngine";
import { SamplePlaybackEngine } from "./SamplePlaybackEngine";

export type SoundFontConfig = {
  mode: "direct-sf2" | "extracted-samples" | "disabled";
  soundFontUrl?: string;
  sampleMapUrl?: string;
  instrument?: string;
  bank?: number;
  program?: number;
};

export class SoundFontPlaybackEngine implements PlaybackEngine {
  name = "Direct SF2";
  private delegate?: PlaybackEngine;

  constructor(private config: SoundFontConfig) {}

  async load(): Promise<void> {
    if (this.config.mode === "disabled") {
      throw new Error("SoundFont mode is disabled. Choose Basic Synth or Sampled Piano.");
    }

    if (this.config.mode === "direct-sf2") {
      if (!this.config.soundFontUrl) {
        throw new Error("Direct SF2 playback needs a SoundFont URL or uploaded .sf2 file.");
      }
      this.delegate = new DirectSf2PlaybackEngine({
        soundFontUrl: this.config.soundFontUrl,
        bank: this.config.bank,
        program: this.config.program
      });
      await this.delegate.load?.();
      return;
    }

    if (!this.config.sampleMapUrl) {
      throw new Error("SoundFont mode needs extracted samples or a compatible browser SoundFont loader.");
    }

    const sampleDelegate = new SamplePlaybackEngine({
      sampleMapUrl: this.config.sampleMapUrl,
      instrument: this.config.instrument
    });
    this.delegate = sampleDelegate;
    try {
      await sampleDelegate.load();
    } catch (error) {
      throw new Error(`SoundFont mode needs extracted samples or a compatible browser SoundFont loader. ${(error as Error).message}`);
    }
  }

  async play(events: PlaybackNoteEvent[], options: PlaybackOptions): Promise<void> {
    if (!this.delegate) {
      await this.load();
    }
    await this.delegate?.play(events, options);
  }

  pause(): void {
    this.delegate?.pause?.();
  }

  setPartVolume(partId: string, volume: number): void {
    this.delegate?.setPartVolume?.(partId, volume);
  }

  stop(): void {
    this.delegate?.stop();
  }

  dispose(): void {
    this.delegate?.dispose?.();
  }
}
