import type {
  FoxChildMusicScore,
  Measure,
  MeasureStatus,
  MeasureValidationResult,
  MusicEvent
} from "../ast/types";
import { durationToBeats, beatsToDuration } from "../rhythm/duration";
import { getBeatsPerMeasure } from "../rhythm/measure";
import { pitchToName } from "../theory/pitch";
import { measureContentDuration } from "../timeline/measureMap";
import { toNumber } from "../timeline/rational";

const EPSILON = 0.0001;

export function validateMeasure(beatsUsed: number, beatsPerBar = 4): MeasureStatus {
  if (Math.abs(beatsUsed - beatsPerBar) < EPSILON) {
    return "complete";
  }
  if (beatsUsed < beatsPerBar) {
    return "underfilled";
  }
  return "overfilled";
}

export function validateScoreMeasures(
  score: FoxChildMusicScore,
  previousScore?: FoxChildMusicScore
): MeasureValidationResult[] {
  const previousEvents = previousScore ? eventMapById(previousScore) : new Map<string, MusicEvent>();

  return score.parts.flatMap((part) => {
    return part.measures.map((measure, measureIndex) => {
      const meter = [...(score.global.meterEvents ?? [])]
        .filter((event) => event.measure <= measure.number)
        .sort((left, right) => left.measure - right.measure)
        .at(-1) ?? score.global.timeSignature;
      const nominalBeats = roundBeat(getBeatsPerMeasure(meter));
      const beatsUsed = roundBeat(toNumber(measureContentDuration(measure.events)));
      const beatsExpected = measureIndex === 0 && measure.implicit && beatsUsed > 0 && beatsUsed < nominalBeats
        ? beatsUsed
        : nominalBeats;
      const status = validateMeasure(beatsUsed, beatsExpected);
      const eventIds = measure.events.map((event) => event.id).filter((id): id is string => Boolean(id));
      const result: MeasureValidationResult = {
        partId: part.id,
        measure: measure.number,
        status,
        beatsUsed,
        beatsExpected,
        eventIds,
        suggestions: buildSuggestions(measure, status, beatsUsed, beatsExpected, previousEvents)
      };

      if (status === "underfilled") {
        result.missingBeats = roundBeat(beatsExpected - beatsUsed);
      }
      if (status === "overfilled") {
        result.extraBeats = roundBeat(beatsUsed - beatsExpected);
      }

      return result;
    });
  });
}

export function withMeasureValidation(
  score: FoxChildMusicScore,
  previousScore?: FoxChildMusicScore
): FoxChildMusicScore {
  const next = structuredClone(score) as FoxChildMusicScore;
  next.validation = {
    updatedAt: new Date().toISOString(),
    measures: validateScoreMeasures(next, previousScore)
  };
  return next;
}

export function measureIssueText(result: MeasureValidationResult): string {
  if (result.status === "underfilled") {
    return `Measure ${result.measure} incomplete: ${result.beatsUsed} / ${result.beatsExpected} beats. Missing ${result.missingBeats} beat.`;
  }
  if (result.status === "overfilled") {
    return `Measure ${result.measure} overfilled: ${result.beatsUsed} / ${result.beatsExpected} beats. Extra ${result.extraBeats} beat.`;
  }
  return `Measure ${result.measure} complete: ${result.beatsUsed} / ${result.beatsExpected} beats.`;
}

export function durationLabelForBeats(beats: number): string {
  return beatsToDuration(beats).value.replaceAll("-", " ");
}

function buildSuggestions(
  measure: Measure,
  status: MeasureStatus,
  beatsUsed: number,
  beatsExpected: number,
  previousEvents: Map<string, MusicEvent>
): string[] {
  if (status === "complete") {
    return [];
  }

  if (status === "underfilled") {
    const missingBeats = roundBeat(beatsExpected - beatsUsed);
    const missingDuration = durationLabelForBeats(missingBeats);
    const suggestions = [`Add ${article(missingDuration)} ${missingDuration} rest`];
    const lastTimedEvent = [...measure.events].reverse().find(hasDuration);

    if (lastTimedEvent) {
      const currentBeats = durationToBeats(lastTimedEvent.duration);
      const stretchedDuration = beatsToDuration(currentBeats + missingBeats);
      suggestions.push(`Stretch last note to ${stretchedDuration.value.replaceAll("-", " ")}`);
    }

    const revertSuggestion = previousDurationSuggestion(measure.events, missingBeats, previousEvents);
    if (revertSuggestion) {
      suggestions.push(revertSuggestion);
    }

    return suggestions;
  }

  const extraBeats = roundBeat(beatsUsed - beatsExpected);
  const suggestions = [`Shorten this measure by ${extraBeats} beat`];
  const revertSuggestion = previousDurationSuggestion(measure.events, -extraBeats, previousEvents);
  if (revertSuggestion) {
    suggestions.push(revertSuggestion);
  }
  return suggestions;
}

function previousDurationSuggestion(
  events: MusicEvent[],
  beatDeltaNeeded: number,
  previousEvents: Map<string, MusicEvent>
): string | undefined {
  for (const event of events) {
    if (!event.id || !hasDuration(event)) {
      continue;
    }
    const previousEvent = previousEvents.get(event.id);
    if (!previousEvent || !hasDuration(previousEvent)) {
      continue;
    }

    const currentBeats = durationToBeats(event.duration);
    const previousBeats = durationToBeats(previousEvent.duration);
    if (Math.abs(previousBeats - currentBeats - beatDeltaNeeded) < EPSILON) {
      return `Change ${eventLabel(event)} from ${event.duration.value} to ${previousEvent.duration.value}`;
    }
  }
  return undefined;
}

function eventMapById(score: FoxChildMusicScore): Map<string, MusicEvent> {
  const map = new Map<string, MusicEvent>();
  score.parts.forEach((part) => {
    part.measures.forEach((measure) => {
      measure.events.forEach((event) => {
        if (event.id) {
          map.set(event.id, event);
        }
      });
    });
  });
  return map;
}

function hasDuration(event: MusicEvent): event is Exclude<MusicEvent, { type: "annotation" | "direction" }> {
  return event.type !== "annotation" && event.type !== "direction";
}

function eventLabel(event: MusicEvent): string {
  if (event.type === "note") {
    return pitchToName(event.pitch);
  }
  if (event.type === "rest") {
    return "rest";
  }
  if (event.type === "chord") {
    return event.pitches.map(pitchToName).join("+");
  }
  return event.type === "direction" ? "direction" : "annotation";
}

function article(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

function roundBeat(value: number): number {
  return Math.round(value * 1000) / 1000;
}
