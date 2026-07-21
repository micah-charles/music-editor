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

export class SharedRecordingClock implements RecordingClock {
  private fallback: SystemRecordingClock;

  constructor(
    public bpm: number,
    public speed = 1,
    private readonly sessionBeat: () => number | undefined,
    private readonly now: () => number = () => performance.now()
  ) {
    this.fallback = new SystemRecordingClock(bpm, speed, this.now);
  }

  start(startBeat = 0): void {
    this.fallback = new SystemRecordingClock(this.bpm, this.speed, this.now);
    this.fallback.start(startBeat);
  }

  stop(): void {
    this.fallback.stop();
  }

  getCurrentBeat(): number {
    return this.sessionBeat() ?? this.fallback.getCurrentBeat();
  }
}
