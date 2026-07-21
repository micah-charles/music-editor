import type { Rational } from "../ast/types";

export interface TimelineEvent {
  id: string;
  sourceEventId: string;
  sourcePitchIndex?: number;
  partId: string;
  staff: number;
  voice: number;
  measureNumber: number;
  scoreStart: Rational;
  scoreDuration: Rational;
  soundingDuration: Rational;
  midi?: number;
  pitch?: string;
  velocity: number;
  trackVolume: number;
  pan: number;
  channel: number;
  midiProgram?: number;
  midiBank?: number;
  instrument?: string;
  tieGroupId?: string;
  attack: boolean;
  kind: "note" | "rest" | "control" | "annotation";
}

export interface TempoSegment {
  start: Rational;
  bpm: number;
  secondsAtStart: number;
  label?: string;
}

export interface MeasureBoundary {
  measureNumber: number;
  start: Rational;
  duration: Rational;
  nominalDuration: Rational;
  beats: number;
  beatType: number;
  isPickup: boolean;
}

export interface RepeatPass {
  sourceMeasure: number;
  playbackMeasureIndex: number;
}

export interface RepeatExpansion {
  passes: RepeatPass[];
  warnings: string[];
}

export interface PlaybackMeasureBoundary extends MeasureBoundary {
  sourceStart: Rational;
  playbackMeasureIndex: number;
}

export interface ScoreTimeline {
  duration: Rational;
  events: TimelineEvent[];
  playbackEvents: TimelineEvent[];
  tempoMap: TempoSegment[];
  playbackTempoMap: TempoSegment[];
  measureMap: MeasureBoundary[];
  playbackMeasureMap: PlaybackMeasureBoundary[];
  playbackDuration: Rational;
  repeatExpansion?: RepeatExpansion;
  warnings: string[];
}
