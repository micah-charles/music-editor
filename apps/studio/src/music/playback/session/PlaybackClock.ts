export class PlaybackClock {
  private anchorMilliseconds = 0;
  private anchorSeconds = 0;
  private playbackSpeed = 1;
  private running = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(seconds = this.anchorSeconds, speed = this.playbackSpeed): void {
    this.anchorSeconds = Math.max(0, seconds);
    this.playbackSpeed = Math.max(0.05, speed);
    this.anchorMilliseconds = this.now();
    this.running = true;
  }

  pause(): number {
    const seconds = this.currentSeconds();
    this.anchorSeconds = seconds;
    this.running = false;
    return seconds;
  }

  seek(seconds: number): void {
    this.anchorSeconds = Math.max(0, seconds);
    this.anchorMilliseconds = this.now();
  }

  setSpeed(speed: number): void {
    const seconds = this.currentSeconds();
    this.anchorSeconds = seconds;
    this.anchorMilliseconds = this.now();
    this.playbackSpeed = Math.max(0.05, speed);
  }

  currentSeconds(): number {
    if (!this.running) {
      return this.anchorSeconds;
    }
    return this.anchorSeconds + ((this.now() - this.anchorMilliseconds) / 1000) * this.playbackSpeed;
  }

  stop(seconds = 0): void {
    this.anchorSeconds = Math.max(0, seconds);
    this.anchorMilliseconds = 0;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
