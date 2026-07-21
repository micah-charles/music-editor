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

export interface Rational {
  numerator: number;
  denominator: number;
}

export interface MusicalPosition {
  measure: number;
  /** Zero-based quarter-note beat offset within the measure. */
  beat: number;
  offset?: Rational;
}

export interface TimedEventFields {
  position?: MusicalPosition;
  voice?: number;
  staff?: number;
  extensions?: Record<string, unknown>;
}

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

export type ArticulationType = "staccato" | "staccatissimo" | "accent" | "strong-accent" | "tenuto";

export interface NoteNotation {
  articulations?: ArticulationType[];
  slurs?: Array<{
    type: "start" | "stop" | "continue";
    number?: number;
    placement?: "above" | "below";
  }>;
  beams?: Array<{
    number: number;
    value: "begin" | "continue" | "end" | "forward hook" | "backward hook";
  }>;
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

export interface NoteEvent extends TimedEventFields {
  id?: string;
  type: "note";
  pitch: Pitch;
  duration: Duration;
  velocity?: number;
  lyric?: string;
  tie?: {
    start?: boolean;
    stop?: boolean;
    groupId?: string;
  };
  notation?: NoteNotation;
  semantic?: SemanticNoteInfo;
}

export interface RestEvent extends TimedEventFields {
  id?: string;
  type: "rest";
  duration: Duration;
}

export interface ChordEvent extends TimedEventFields {
  id?: string;
  type: "chord";
  pitches: Pitch[];
  duration: Duration;
  velocity?: number;
  lyric?: string;
  notation?: NoteNotation;
  semantic?: SemanticChordInfo;
}

export interface AnnotationEvent extends TimedEventFields {
  id?: string;
  type: "annotation";
  text: string;
  placement?: "above" | "below";
}

export interface DirectionEvent extends TimedEventFields {
  id?: string;
  type: "direction";
  dynamic?: "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff" | "sf" | "sfz" | "fp";
  text?: string;
  placement?: "above" | "below";
}

export type MusicEvent = NoteEvent | RestEvent | ChordEvent | AnnotationEvent | DirectionEvent;

export interface Harmony {
  root: string;
  kind?: string;
  beat?: number;
}

export interface Measure {
  number: number;
  events: MusicEvent[];
  harmony?: Harmony[];
  implicit?: boolean;
  repeat?: {
    start?: boolean;
    end?: boolean;
    times?: number;
    endings?: number[];
  };
  extensions?: Record<string, unknown>;
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
  staffCount?: number;
  clefs?: Record<number, Clef>;
  channel?: number;
  muted?: boolean;
  solo?: boolean;
  volume?: number;
  pan?: number;
  visible?: boolean;
  color?: string;
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
    movementTitle?: string;
    subtitle?: string;
    composer?: string;
    arranger?: string;
    lyricist?: string;
    credits?: Array<{
      type?: string;
      text: string;
      page?: number;
    }>;
    source?: ScoreSource;
    createdAt?: string;
    updatedAt?: string;
    notes?: string;
  };
  global: {
    key: {
      tonic: Step;
      mode: Mode;
      /** Canonical MusicXML circle-of-fifths value when known. */
      fifths?: number;
    };
    timeSignature: {
      beats: number;
      beatType: number;
    };
    tempo: {
      bpm: number;
      label?: string;
      source?: "musicxml" | "omr" | "user" | "default";
    };
    tempoEvents?: Array<{
      position: MusicalPosition;
      bpm: number;
      label?: string;
    }>;
    meterEvents?: Array<{
      measure: number;
      beats: number;
      beatType: number;
    }>;
    keyEvents?: Array<{
      position: MusicalPosition;
      tonic: Step;
      mode: Mode;
      /** Canonical MusicXML circle-of-fifths value when known. */
      fifths?: number;
    }>;
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
  extensions?: Record<string, unknown>;
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
  trackVolume?: number;
  pan?: number;
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
