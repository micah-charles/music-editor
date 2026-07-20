import type { FoxChildMusicScore, MusicEvent, ValidationResult } from "./types";
import { durationToBeats } from "../rhythm/duration";
import { getBeatsPerMeasure } from "../rhythm/measure";
import { pitchToMidi } from "../theory/pitch";
import { validateMeasure, validateScoreMeasures } from "../validation/measureValidation";

export function validateScore(score: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(score)) {
    return { valid: false, errors: ["Score must be an object."], warnings };
  }

  if (score.schemaVersion !== "2.0") {
    errors.push('schemaVersion must be "2.0".');
  }
  if (score.type !== "FoxChildMusicScore") {
    errors.push('type must be "FoxChildMusicScore".');
  }
  if (!isNonEmptyString(score.id)) {
    errors.push("id is required.");
  }

  const metadata = score.metadata;
  if (!isRecord(metadata) || !isNonEmptyString(metadata.title)) {
    errors.push("metadata.title is required.");
  }

  const global = score.global;
  if (!isRecord(global)) {
    errors.push("global settings are required.");
  } else {
    if (!isRecord(global.key) || !["A", "B", "C", "D", "E", "F", "G"].includes(String(global.key.tonic))) {
      errors.push("global.key.tonic must be A, B, C, D, E, F, or G.");
    }
    if (!isRecord(global.key) || !["major", "minor"].includes(String(global.key.mode))) {
      errors.push("global.key.mode must be major or minor.");
    }
    if (!isRecord(global.timeSignature) || !isPositiveNumber(global.timeSignature.beats) || !isPositiveNumber(global.timeSignature.beatType)) {
      errors.push("global.timeSignature.beats and beatType must be positive numbers.");
    }
    if (!isRecord(global.tempo) || !isPositiveNumber(global.tempo.bpm)) {
      errors.push("global.tempo.bpm must be a positive number.");
    }
  }

  const parts = score.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    errors.push("parts must contain at least one part.");
  } else {
    const beatsPerMeasure = isRecord(global) && isRecord(global.timeSignature)
      ? getBeatsPerMeasure({
        beats: Number(global.timeSignature.beats || 4),
        beatType: Number(global.timeSignature.beatType || 4)
      })
      : 4;

    parts.forEach((part, partIndex) => {
      if (!isRecord(part)) {
        errors.push(`parts[${partIndex}] must be an object.`);
        return;
      }
      if (!isNonEmptyString(part.id)) {
        errors.push(`parts[${partIndex}].id is required.`);
      }
      if (!isNonEmptyString(part.name)) {
        errors.push(`parts[${partIndex}].name is required.`);
      }
      if (!isRecord(part.instrument) || !isNonEmptyString(part.instrument.name)) {
        errors.push(`parts[${partIndex}].instrument.name is required.`);
      }
      if (!["treble", "bass", "alto", "tenor"].includes(String(part.clef))) {
        errors.push(`parts[${partIndex}].clef must be treble, bass, alto, or tenor.`);
      }
      if ("channel" in part && (!Number.isInteger(part.channel) || Number(part.channel) < 0 || Number(part.channel) > 15)) {
        errors.push(`parts[${partIndex}].channel must be an integer from 0 to 15.`);
      }
      if (!Array.isArray(part.measures) || part.measures.length === 0) {
        errors.push(`parts[${partIndex}].measures must contain at least one measure.`);
        return;
      }

      part.measures.forEach((measure, measureIndex) => {
        if (!isRecord(measure)) {
          errors.push(`parts[${partIndex}].measures[${measureIndex}] must be an object.`);
          return;
        }
        if (!Number.isFinite(Number(measure.number))) {
          errors.push(`parts[${partIndex}].measures[${measureIndex}].number is required.`);
        }
        if (!Array.isArray(measure.events)) {
          errors.push(`parts[${partIndex}].measures[${measureIndex}].events must be an array.`);
          return;
        }

        let measureBeats = 0;
        measure.events.forEach((event, eventIndex) => {
          validateEvent(event, `parts[${partIndex}].measures[${measureIndex}].events[${eventIndex}]`, errors);
          if (isRecord(event) && "duration" in event && isRecord(event.duration)) {
            measureBeats += durationToBeats(event.duration as never);
          }
        });

        const measureStatus = validateMeasure(measureBeats, beatsPerMeasure);
        if (measureStatus === "overfilled") {
          errors.push(`parts[${partIndex}].measures[${measureIndex}] exceeds ${beatsPerMeasure} beats.`);
        }
      });
    });
  }

  if (errors.length === 0 && isRecord(score) && score.schemaVersion === "2.0") {
    validateScoreMeasures(score as unknown as FoxChildMusicScore)
      .filter((measure) => measure.status !== "complete")
      .forEach((measure) => {
        const text = `Measure ${measure.measure}: ${measure.beatsUsed} / ${measure.beatsExpected} beats`;
        if (measure.status === "underfilled") {
          warnings.push(`${text}; missing ${measure.missingBeats} beat.`);
        }
        if (measure.status === "overfilled") {
          errors.push(`${text}; extra ${measure.extraBeats} beat.`);
        }
      });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateEvent(event: unknown, path: string, errors: string[]): void {
  if (!isRecord(event)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (!["note", "rest", "chord", "annotation"].includes(String(event.type))) {
    errors.push(`${path}.type is unsupported.`);
    return;
  }

  if (event.type === "annotation") {
    if (!isNonEmptyString(event.text)) {
      errors.push(`${path}.text is required for annotations.`);
    }
    return;
  }

  if (!isRecord(event.duration) || typeof event.duration.value !== "string") {
    errors.push(`${path}.duration.value is required.`);
  }

  if (event.type === "note") {
    if (!isRecord(event.pitch)) {
      errors.push(`${path}.pitch is required.`);
      return;
    }
    try {
      pitchToMidi(event.pitch as never);
    } catch (error) {
      errors.push(`${path}.pitch is invalid: ${(error as Error).message}`);
    }
  }

  if (event.type === "chord") {
    if (!Array.isArray(event.pitches) || event.pitches.length === 0) {
      errors.push(`${path}.pitches must contain at least one pitch.`);
      return;
    }
    event.pitches.forEach((pitch, index) => {
      try {
        pitchToMidi(pitch as never);
      } catch (error) {
        errors.push(`${path}.pitches[${index}] is invalid: ${(error as Error).message}`);
      }
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
