import type { PlaybackEngine, PlaybackNoteEvent, PlaybackOptions } from "./PlaybackEngine";
import { scheduleActivePitchCallbacks, secondsPerBeat } from "./PlaybackEngine";

export class BasicSynthEngine implements PlaybackEngine {
  name = "Basic Synth";
  private tone: any;
  private synth: any;
  private stopActivePitchCallbacks?: () => void;

  async load(): Promise<void> {
    if (!this.tone) {
      this.tone = await import("tone");
    }
  }

  async play(events: PlaybackNoteEvent[], options: PlaybackOptions): Promise<void> {
    await this.load();
    await this.tone.start();
    this.stop();

    const Tone = this.tone;
    this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
    this.synth.volume.value = volumeToDecibels(options.volume);
    const transport = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
    const beatSeconds = secondsPerBeat(options);

    transport.cancel(0);
    transport.stop();
    transport.position = 0;

    events.forEach((event) => {
      transport.schedule((time: number) => {
        this.synth?.triggerAttackRelease(
          event.pitch,
          event.durationBeats * beatSeconds * 0.94,
          time,
          Math.min(1, Math.max(0.05, (event.velocity ?? 80) / 127))
        );
      }, event.startBeat * beatSeconds);
    });

    this.stopActivePitchCallbacks = scheduleActivePitchCallbacks(events, options, 0.05);
    transport.start("+0.05");
  }

  pause(): void {
    const transport = this.getTransport();
    transport?.pause();
    this.stopActivePitchCallbacks?.();
    this.stopActivePitchCallbacks = undefined;
  }

  resume(): void {
    const transport = this.getTransport();
    transport?.start();
  }

  stop(): void {
    const transport = this.getTransport();
    transport?.stop();
    transport?.cancel(0);
    this.stopActivePitchCallbacks?.();
    this.stopActivePitchCallbacks = undefined;
    this.synth?.dispose?.();
    this.synth = null;
  }

  dispose(): void {
    this.stop();
  }

  private getTransport() {
    if (!this.tone) {
      return null;
    }
    return this.tone.getTransport ? this.tone.getTransport() : this.tone.Transport;
  }
}

function volumeToDecibels(volume: number): number {
  if (volume <= 0) {
    return -Infinity;
  }
  return 20 * Math.log10(Math.min(1, Math.max(0, volume)));
}
