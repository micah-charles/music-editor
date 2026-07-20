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
};

export class BrowserMetronome {
  private audioContext?: AudioContext;
  private timer?: number;
  private beatIndex = 0;

  start(options: MetronomeOptions): void {
    this.stop();
    const countInBeats = Math.max(0, Math.round(options.countInBars * options.beatsPerMeasure));
    this.beatIndex = -countInBeats;
    const beatMs = 60_000 / options.bpm;
    const tick = () => {
      const beat = metronomeBeatInfo(this.beatIndex, options.beatsPerMeasure, countInBeats);
      options.onBeat?.(beat);
      this.click(beat.isAccent);
      this.beatIndex += 1;
    };
    tick();
    this.timer = window.setInterval(tick, beatMs);
  }

  stop(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
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
