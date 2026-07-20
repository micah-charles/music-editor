export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type Mode = "major" | "minor";
export type Clef = "treble" | "bass" | "alto" | "tenor";
export type ScoreSource =
  | "manual"
  | "ai-generated"
  | "midi-import"
  | "musicxml-import"
  | "plain-text"
  | "free-midi-chords"
  | "audiveris-omr"
  | "v1-json"
  | "audio-transcription";

export type NoteDurationValue =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "dotted-half"
  | "dotted-quarter"
  | "dotted-eighth";

export interface Pitch {
  step: Step;
  octave: number;
  alter?: number;
}

export interface Duration {
  value: NoteDurationValue;
  beats?: number;
  tuplet?: {
    actualNotes: number;
    normalNotes: number;
    normalType?: NoteDurationValue;
  };
}

export interface SemanticNoteInfo {
  scaleDegree?: number;
  function?: "tonic" | "dominant" | "subdominant" | "passing" | "neighbor" | "other";
  motifId?: string;
  phraseId?: string;
  difficulty?: "beginner" | "early-intermediate" | "intermediate" | "advanced";
}

export interface SemanticChordInfo {
  chordName?: string;
  roman?: string;
  function?: "tonic" | "dominant" | "subdominant" | "predominant" | "other";
  sourceProgression?: string;
}

export interface NoteEvent {
  id?: string;
  type: "note";
  pitch: Pitch;
  duration: Duration;
  velocity?: number;
  lyric?: string;
  semantic?: SemanticNoteInfo;
}

export interface RestEvent {
  id?: string;
  type: "rest";
  duration: Duration;
}

export interface ChordEvent {
  id?: string;
  type: "chord";
  pitches: Pitch[];
  duration: Duration;
  velocity?: number;
  lyric?: string;
  semantic?: SemanticChordInfo;
}

export interface AnnotationEvent {
  id?: string;
  type: "annotation";
  text: string;
  placement?: "above" | "below";
}

export type MusicEvent = NoteEvent | RestEvent | ChordEvent | AnnotationEvent;

export interface Harmony {
  root: string;
  kind?: string;
  beat?: number;
}

export interface Measure {
  number: number;
  events: MusicEvent[];
  harmony?: Harmony[];
}

export type MeasureStatus = "complete" | "underfilled" | "overfilled";

export interface MeasureValidationResult {
  partId: string;
  measure: number;
  status: MeasureStatus;
  beatsUsed: number;
  beatsExpected: number;
  missingBeats?: number;
  extraBeats?: number;
  eventIds: string[];
  suggestions: string[];
}

export interface Instrument {
  name: string;
  midiProgram?: number;
  soundFontBank?: number;
  soundFontPreset?: number;
}

export interface Part {
  id: string;
  name: string;
  instrument: Instrument;
  clef: Clef;
  channel?: number;
  muted?: boolean;
  solo?: boolean;
  collapsed?: boolean;
  measures: Measure[];
}

export interface Phrase {
  id: string;
  label: string;
  partId: string;
  fromMeasure: number;
  toMeasure: number;
  description?: string;
}

export interface LearningMetadata {
  level?: "beginner" | "early-intermediate" | "intermediate" | "advanced";
  skills?: string[];
  suitableFor?: string[];
}

export interface FoxChildMusicScore {
  schemaVersion: "2.0";
  type: "FoxChildMusicScore";
  id: string;
  metadata: {
    title: string;
    composer?: string;
    source?: ScoreSource;
    createdAt?: string;
    updatedAt?: string;
    notes?: string;
  };
  global: {
    key: {
      tonic: Step;
      mode: Mode;
    };
    timeSignature: {
      beats: number;
      beatType: number;
    };
    tempo: {
      bpm: number;
      label?: string;
    };
    swing?: number;
    style?: string;
  };
  parts: Part[];
  phrases?: Phrase[];
  lyrics?: Array<{
    id: string;
    text: string;
    partId: string;
  }>;
  learning?: LearningMetadata;
  validation?: {
    updatedAt: string;
    measures: MeasureValidationResult[];
  };
  sourceMetadata?: {
    originalFormat?: "foxchild-v1" | "musicxml" | "midi" | "plain-text" | "manual" | "free-midi-chords" | "audiveris-omr";
    draftTranscription?: boolean;
    warnings?: string[];
  };
}

export interface PlaybackEvent {
  id: string;
  partId: string;
  measureNumber: number;
  pitch?: string;
  midi?: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  isRest?: boolean;
  instrument?: string;
  channel?: number;
  midiProgram?: number;
  midiBank?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FoxChildSimpleScoreV1 {
  schemaVersion: "1.0";
  id: string;
  title: string;
  composer?: string;
  tempo: number;
  key: string;
  timeSignature: string | {
    beats: number;
    beatType: number;
  };
  tracks: Array<{
    id: string;
    name: string;
    instrument: string;
    clef?: Clef;
    notes: Array<{
      id?: string;
      pitch?: string;
      midi?: number;
      duration: NoteDurationValue;
      rest?: boolean;
      velocity?: number;
      lyric?: string;
    }>;
  }>;
  metadata?: {
    source?: string;
    createdAt?: string;
    updatedAt?: string;
    notes?: string;
  };
}
