import type { Rational, ScoreTimeline } from "@foxchild/music-core";
import type { PlaybackEngine, PlaybackNoteEvent } from "../PlaybackEngine";

export type PlaybackSessionStatus = "idle" | "loading" | "playing" | "paused" | "stopped" | "ended" | "error";

export type PlaybackLoop = {
  start: Rational;
  end: Rational;
};

export type PlaybackSessionSnapshot = {
  status: PlaybackSessionStatus;
  currentScoreTime: Rational;
  currentSourceTime: Rational;
  currentSeconds: number;
  durationSeconds: number;
  speed: number;
  volume: number;
  loop?: PlaybackLoop;
  activeEvents: PlaybackNoteEvent[];
  error?: string;
};

export type PlaybackSessionConfiguration = {
  timeline: ScoreTimeline;
  events: PlaybackNoteEvent[];
  bpm: number;
  createEngine: () => PlaybackEngine;
};
