export type ScheduledItem<T> = {
  timeSeconds: number;
  value: T;
};

export class LookAheadScheduler<T> {
  private timer?: ReturnType<typeof setInterval>;
  private nextIndex = 0;
  private items: ScheduledItem<T>[] = [];

  constructor(
    private readonly currentSeconds: () => number,
    private readonly schedule: (item: ScheduledItem<T>) => void,
    private readonly windowSeconds = 0.15,
    private readonly intervalMilliseconds = 25
  ) {}

  load(items: ScheduledItem<T>[], fromSeconds = 0): void {
    this.items = [...items].sort((left, right) => left.timeSeconds - right.timeSeconds);
    this.nextIndex = this.items.findIndex((item) => item.timeSeconds >= fromSeconds);
    if (this.nextIndex < 0) {
      this.nextIndex = this.items.length;
    }
  }

  start(): void {
    this.stop();
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMilliseconds);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  tick(): void {
    const horizon = this.currentSeconds() + this.windowSeconds;
    while (this.nextIndex < this.items.length && this.items[this.nextIndex].timeSeconds <= horizon) {
      this.schedule(this.items[this.nextIndex]);
      this.nextIndex += 1;
    }
  }
}
