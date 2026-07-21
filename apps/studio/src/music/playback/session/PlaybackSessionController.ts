import {
  compareRational,
  rationalFromNumber,
  scoreTimeToSeconds,
  secondsToScoreTime,
  playbackTimeToSourceTime,
  toNumber,
  type Rational
} from "@foxchild/music-core";
import type { PlaybackEngine, PlaybackNoteEvent } from "../PlaybackEngine";
import { PlaybackClock } from "./PlaybackClock";
import type {
  PlaybackLoop,
  PlaybackSessionConfiguration,
  PlaybackSessionSnapshot
} from "./types";

type Listener = () => void;

export class PlaybackSessionController {
  private configuration?: PlaybackSessionConfiguration;
  private engine?: PlaybackEngine;
  private listeners = new Set<Listener>();
  private frame?: number;
  private playGeneration = 0;
  private clock: PlaybackClock;
  private snapshot: PlaybackSessionSnapshot = {
    status: "idle",
    currentScoreTime: rationalFromNumber(0),
    currentSourceTime: rationalFromNumber(0),
    currentSeconds: 0,
    durationSeconds: 0,
    speed: 1,
    volume: 0.8,
    activeEvents: []
  };

  constructor(
    now: () => number = () => performance.now(),
    private readonly requestFrame: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle)
  ) {
    this.clock = new PlaybackClock(now);
  }

  configure(configuration: PlaybackSessionConfiguration): void {
    this.stopEngine();
    this.engine?.dispose?.();
    this.engine = undefined;
    this.configuration = configuration;
    const durationSeconds = scoreTimeToSeconds(configuration.timeline.playbackDuration, configuration.timeline.playbackTempoMap);
    this.clock.stop(0);
    this.updateSnapshot({
      status: "idle",
      currentScoreTime: rationalFromNumber(0),
      currentSourceTime: rationalFromNumber(0),
      currentSeconds: 0,
      durationSeconds,
      activeEvents: [],
      error: undefined
    });
  }

  getSnapshot = (): PlaybackSessionSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async play(): Promise<void> {
    if (!this.configuration || this.snapshot.durationSeconds <= 0) {
      return;
    }
    if (this.snapshot.status === "playing" || this.snapshot.status === "loading") {
      return;
    }
    if (this.snapshot.currentSeconds >= this.snapshot.durationSeconds - 0.001) {
      this.clock.seek(0);
      this.updatePosition(0);
    }

    const generation = ++this.playGeneration;
    this.updateSnapshot({ status: "loading", error: undefined });
    try {
      this.engine ??= this.configuration.createEngine();
      await this.engine.prepare?.();
      await this.engine.load?.();
      if (generation !== this.playGeneration) {
        return;
      }
      const fromSeconds = this.snapshot.currentSeconds;
      const engineEvents = this.eventsFromSeconds(fromSeconds);
      await this.engine.play(engineEvents, {
        bpm: this.configuration.bpm,
        speed: this.snapshot.speed,
        volume: this.snapshot.volume
      });
      if (generation !== this.playGeneration) {
        return;
      }
      this.clock.start(fromSeconds, this.snapshot.speed);
      this.updateSnapshot({ status: "playing" });
      this.startFrameLoop();
    } catch (error) {
      if (generation !== this.playGeneration) {
        return;
      }
      this.clock.pause();
      this.stopEngine();
      this.updateSnapshot({
        status: "error",
        activeEvents: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  pause(): void {
    if (this.snapshot.status !== "playing") {
      return;
    }
    this.playGeneration += 1;
    const seconds = this.clock.pause();
    this.stopEngine();
    this.stopFrameLoop();
    this.updatePosition(seconds, "paused");
  }

  async resume(): Promise<void> {
    if (this.snapshot.status === "paused") {
      await this.play();
    }
  }

  stop(): void {
    this.playGeneration += 1;
    this.stopEngine();
    this.stopFrameLoop();
    this.clock.stop(0);
    this.updateSnapshot({
      status: "stopped",
      currentSeconds: 0,
      currentScoreTime: rationalFromNumber(0),
      currentSourceTime: rationalFromNumber(0),
      activeEvents: []
    });
  }

  async seekToSeconds(seconds: number): Promise<void> {
    const target = clamp(seconds, 0, this.snapshot.durationSeconds);
    const shouldResume = this.snapshot.status === "playing" || this.snapshot.status === "loading";
    this.playGeneration += 1;
    this.stopEngine();
    this.stopFrameLoop();
    this.clock.stop(target);
    this.updatePosition(target, shouldResume ? "paused" : this.snapshot.status === "ended" ? "paused" : this.snapshot.status);
    if (shouldResume) {
      await this.play();
    }
  }

  async seekToScoreTime(time: Rational): Promise<void> {
    if (!this.configuration) {
      return;
    }
    await this.seekToSeconds(scoreTimeToSeconds(time, this.configuration.timeline.playbackTempoMap));
  }

  async seekToMeasure(measureNumber: number): Promise<void> {
    const boundary = this.configuration?.timeline.playbackMeasureMap.find((measure) => measure.measureNumber === measureNumber);
    if (boundary) {
      await this.seekToScoreTime(boundary.start);
    }
  }

  setSpeed(speed: number): void {
    const nextSpeed = clamp(speed, 0.25, 4);
    const wasPlaying = this.snapshot.status === "playing";
    const seconds = this.clock.currentSeconds();
    this.clock.setSpeed(nextSpeed);
    this.updateSnapshot({ speed: nextSpeed, currentSeconds: seconds });
    if (wasPlaying) {
      void this.restartAtCurrentPosition();
    }
  }

  setVolume(volume: number): void {
    const nextVolume = clamp(volume, 0, 1);
    const wasPlaying = this.snapshot.status === "playing";
    this.updateSnapshot({ volume: nextVolume });
    if (wasPlaying) {
      void this.restartAtCurrentPosition();
    }
  }

  setLoop(loop?: PlaybackLoop): void {
    if (loop && compareRational(loop.end, loop.start) <= 0) {
      throw new Error("Loop end must be after loop start.");
    }
    this.updateSnapshot({ loop });
  }

  dispose(): void {
    this.playGeneration += 1;
    this.stopFrameLoop();
    this.stopEngine();
    this.engine?.dispose?.();
    this.engine = undefined;
    this.listeners.clear();
  }

  /** Deterministic clock advancement hook used by tests and non-animation hosts. */
  tick(): void {
    if (this.snapshot.status !== "playing" || !this.configuration) {
      return;
    }
    const seconds = this.clock.currentSeconds();
    const loopEndSeconds = this.snapshot.loop
      ? scoreTimeToSeconds(this.snapshot.loop.end, this.configuration.timeline.playbackTempoMap)
      : undefined;

    if (loopEndSeconds !== undefined && seconds >= loopEndSeconds) {
      const loopStartSeconds = scoreTimeToSeconds(this.snapshot.loop!.start, this.configuration.timeline.playbackTempoMap);
      void this.seekToSeconds(loopStartSeconds);
      return;
    }
    if (seconds >= this.snapshot.durationSeconds) {
      this.stopEngine();
      this.stopFrameLoop();
      this.clock.stop(this.snapshot.durationSeconds);
      this.updatePosition(this.snapshot.durationSeconds, "ended");
      return;
    }
    this.updatePosition(seconds, "playing");
  }

  private async restartAtCurrentPosition(): Promise<void> {
    const seconds = this.clock.currentSeconds();
    this.playGeneration += 1;
    this.stopEngine();
    this.stopFrameLoop();
    this.clock.stop(seconds);
    this.updatePosition(seconds, "paused");
    await this.play();
  }

  private eventsFromSeconds(fromSeconds: number): PlaybackNoteEvent[] {
    if (!this.configuration) {
      return [];
    }
    const { bpm, events, timeline } = this.configuration;
    return events.flatMap((event) => {
      const eventStart = scoreTimeToSeconds(rationalFromNumber(event.startBeat), timeline.playbackTempoMap);
      const eventEnd = scoreTimeToSeconds(rationalFromNumber(event.startBeat + event.durationBeats), timeline.playbackTempoMap);
      if (eventEnd <= fromSeconds || eventStart >= this.snapshot.durationSeconds) {
        return [];
      }
      const relativeStartSeconds = Math.max(0, eventStart - fromSeconds);
      const remainingDurationSeconds = eventEnd - Math.max(eventStart, fromSeconds);
      return [{
        ...event,
        startBeat: relativeStartSeconds * bpm / 60,
        durationBeats: remainingDurationSeconds * bpm / 60
      }];
    });
  }

  private updatePosition(seconds: number, status = this.snapshot.status): void {
    if (!this.configuration) {
      return;
    }
    const currentSeconds = clamp(seconds, 0, this.snapshot.durationSeconds);
    const currentScoreTime = secondsToScoreTime(currentSeconds, this.configuration.timeline.playbackTempoMap);
    const currentSourceTime = playbackTimeToSourceTime(currentScoreTime, this.configuration.timeline.playbackMeasureMap);
    const calculatedActiveEvents = this.configuration.events.filter((event) => {
      const start = scoreTimeToSeconds(rationalFromNumber(event.startBeat), this.configuration!.timeline.playbackTempoMap);
      const end = scoreTimeToSeconds(rationalFromNumber(event.startBeat + event.durationBeats), this.configuration!.timeline.playbackTempoMap);
      return start <= currentSeconds + 0.002 && end > currentSeconds + 0.002;
    });
    const activeEvents = sameActiveEvents(this.snapshot.activeEvents, calculatedActiveEvents)
      ? this.snapshot.activeEvents
      : calculatedActiveEvents;
    this.updateSnapshot({ status, currentSeconds, currentScoreTime, currentSourceTime, activeEvents });
  }

  private startFrameLoop(): void {
    this.stopFrameLoop();
    const frame = () => {
      this.tick();
      if (this.snapshot.status === "playing") {
        this.frame = this.requestFrame(frame);
      }
    };
    this.frame = this.requestFrame(frame);
  }

  private stopFrameLoop(): void {
    if (this.frame !== undefined) {
      this.cancelFrame(this.frame);
      this.frame = undefined;
    }
  }

  private stopEngine(): void {
    this.engine?.cancelScheduled?.();
    this.engine?.allNotesOff?.();
    this.engine?.stop();
  }

  private updateSnapshot(patch: Partial<PlaybackSessionSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (sameSnapshot(this.snapshot, next)) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

function sameSnapshot(left: PlaybackSessionSnapshot, right: PlaybackSessionSnapshot): boolean {
  return left.status === right.status
    && left.currentSeconds === right.currentSeconds
    && left.currentSourceTime.numerator === right.currentSourceTime.numerator
    && left.currentSourceTime.denominator === right.currentSourceTime.denominator
    && left.durationSeconds === right.durationSeconds
    && left.speed === right.speed
    && left.volume === right.volume
    && left.loop === right.loop
    && left.activeEvents === right.activeEvents
    && left.error === right.error
    && toNumber(left.currentScoreTime) === toNumber(right.currentScoreTime);
}

function sameActiveEvents(left: PlaybackNoteEvent[], right: PlaybackNoteEvent[]): boolean {
  return left.length === right.length && left.every((event, index) => event.id === right[index].id);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
