export type RecordingClock = {
  start(): void;
  stop(): void;
  getCurrentBeat(): number;
  bpm: number;
  speed: number;
};

export class SystemRecordingClock implements RecordingClock {
  private startedAtMs = 0;
  private startBeat = 0;
  private running = false;

  constructor(
    public bpm: number,
    public speed = 1,
    private now: () => number = () => performance.now()
  ) {}

  start(startBeat = 0): void {
    this.startedAtMs = this.now();
    this.startBeat = startBeat;
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.startBeat = 0;
    this.startedAtMs = 0;
  }

  getCurrentBeat(): number {
    if (!this.running) {
      return 0;
    }
    const elapsedSeconds = (this.now() - this.startedAtMs) / 1000;
    return this.startBeat + elapsedSeconds / (60 / (this.bpm * this.speed));
  }
}
