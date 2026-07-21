export type MetronomeBeat = {
  beatIndex: number;
  beatInBar: number;
  isAccent: boolean;
  isCountIn: boolean;
};

export type MetronomeOptions = {
  bpm: number;
  beatsPerMeasure: number;
  countInBars: number;
  onBeat?: (beat: MetronomeBeat) => void;
  clock?: { getCurrentBeat(): number };
};

export class BrowserMetronome {
  private audioContext?: AudioContext;
  private timer?: number;
  private frame?: number;
  private beatIndex = 0;

  start(options: MetronomeOptions): void {
    this.stop();
    const countInBeats = Math.max(0, Math.round(options.countInBars * options.beatsPerMeasure));
    this.beatIndex = -countInBeats;
    const tick = (beatIndex = this.beatIndex) => {
      const beat = metronomeBeatInfo(beatIndex, options.beatsPerMeasure, countInBeats);
      options.onBeat?.(beat);
      this.click(beat.isAccent);
    };
    tick(this.beatIndex);

    if (options.clock) {
      let emittedBeat = this.beatIndex;
      const followClock = () => {
        const currentBeat = Math.floor(options.clock!.getCurrentBeat() + 0.001);
        while (emittedBeat < currentBeat) {
          emittedBeat += 1;
          tick(emittedBeat);
        }
        this.frame = window.requestAnimationFrame(followClock);
      };
      this.frame = window.requestAnimationFrame(followClock);
      return;
    }

    const beatMs = 60_000 / options.bpm;
    this.timer = window.setInterval(() => {
      this.beatIndex += 1;
      tick(this.beatIndex);
    }, beatMs);
  }

  stop(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.frame !== undefined) {
      window.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }

  private click(accent: boolean): void {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext ??= new AudioContextCtor();
    const context = this.audioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.frequency.value = accent ? 1400 : 900;
    gain.gain.setValueAtTime(accent ? 0.26 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }
}

export function metronomeBeatInfo(beatIndex: number, beatsPerMeasure: number, countInBeats = 0): MetronomeBeat {
  const isCountIn = beatIndex < 0 && Math.abs(beatIndex) <= countInBeats;
  const positiveBeat = ((beatIndex % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
  return {
    beatIndex,
    beatInBar: positiveBeat + 1,
    isAccent: positiveBeat === 0,
    isCountIn
  };
}
