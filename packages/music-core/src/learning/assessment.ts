import type { FoxChildMusicScore, Pitch } from "../ast/types";
import { validateScore } from "../ast/validateScore";
import { compileScoreTimeline } from "../timeline/compileScoreTimeline";
import { toNumber } from "../timeline/rational";
import { midiToPitch, parsePitchName, pitchToMidi } from "../theory/pitch";
import { AssessmentStrategyRegistry } from "./registries";
import type {
  AssessmentContext,
  AssessmentResult,
  AssessmentStrategy,
  MidiPerformanceEvent,
  PitchAnswer,
  RhythmEvent
} from "./types";

type StrategyFunction = (value: unknown, context: AssessmentContext) => {
  ratio: number;
  dimensions?: AssessmentResult["dimensions"];
  details?: Record<string, unknown>;
};

function strategy(id: string, run: StrategyFunction): AssessmentStrategy {
  return {
    id,
    assess(value, context) {
      const outcome = run(value, context);
      const ratio = clamp(outcome.ratio);
      const maximumScore = context.declaration.maximumScore;
      const penalty = ratio < 1
        ? (context.declaration.attemptPolicy?.penaltyPerIncorrectAttempt ?? 0) * Math.max(0, (context.attemptNumber ?? 1) - 1)
        : 0;
      const score = Math.max(0, ratio * maximumScore - penalty);
      const passingScore = context.declaration.passingScore ?? maximumScore;
      return {
        score,
        maximumScore,
        percentage: maximumScore === 0 ? 100 : score / maximumScore * 100,
        passed: score >= passingScore,
        dimensions: outcome.dimensions ?? {},
        feedbackIds: [score >= passingScore ? "correct" : "incorrect"],
        details: outcome.details
      };
    }
  };
}

export function createDefaultAssessmentRegistry(): AssessmentStrategyRegistry {
  const registry = new AssessmentStrategyRegistry();

  registry.register(strategy("exact-identifier@1", (value, context) => ({
    ratio: value === context.response.correct?.value ? 1 : 0
  })));

  registry.register(strategy("identifier-set@1", (value, context) => {
    const actual = asStringSet(value);
    const expected = asStringSet(context.response.correct?.value);
    const overlap = [...actual].filter((item) => expected.has(item)).length;
    const union = new Set([...actual, ...expected]).size;
    return { ratio: union === 0 ? 1 : overlap / union, dimensions: { matched: overlap, expected: expected.size } };
  }));

  registry.register(strategy("matching@1", (value, context) => {
    const actual = isRecord(value) ? value : {};
    const expected = isRecord(context.response.correct?.value) ? context.response.correct.value : {};
    const keys = Object.keys(expected);
    if (keys.length === 0) return { ratio: Object.keys(actual).length === 0 ? 1 : 0 };
    const matched = keys.filter((key) => String(actual[key]) === String(expected[key])).length;
    return { ratio: matched / keys.length, dimensions: { matched, expected: keys.length } };
  }));

  registry.register(strategy("ordering@1", (value, context) => {
    const actual = Array.isArray(value) ? value.map(String) : [];
    const expectedValue = context.response.correct?.value;
    const expected = Array.isArray(expectedValue) ? expectedValue.map(String) : [];
    if (expected.length === 0) return { ratio: actual.length === 0 ? 1 : 0 };
    const compared = Math.min(actual.length, expected.length);
    const inPosition = Array.from({ length: compared }, (_, index) => actual[index] === expected[index])
      .filter(Boolean).length;
    const lengthPenalty = Math.abs(actual.length - expected.length);
    const ratio = Math.max(0, (inPosition - lengthPenalty) / expected.length);
    return { ratio, dimensions: { inPosition, expected: expected.length } };
  }));

  registry.register(strategy("normalised-text@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const normalise = (item: unknown) => {
      let text = String(item ?? "");
      if (parameters.trim !== false) text = text.trim();
      if (parameters.unicodeNormalisation !== false) text = text.normalize(String(parameters.unicodeNormalisation ?? "NFC") as "NFC");
      if (parameters.caseFold !== false) text = text.toLocaleLowerCase(String(parameters.locale ?? "en-GB"));
      if (parameters.collapseWhitespace !== false) text = text.replace(/\s+/g, " ");
      return text;
    };
    const accepted = Array.isArray(context.response.correct?.value)
      ? context.response.correct?.value
      : [context.response.correct?.value];
    return { ratio: accepted.some((item) => normalise(item) === normalise(value)) ? 1 : 0 };
  }));

  registry.register(strategy("numeric-tolerance@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const target = Number(parameters.target ?? context.response.correct?.value);
    const actual = Number(value);
    if (!Number.isFinite(actual) || !Number.isFinite(target)) return { ratio: 0 };
    const distance = Math.abs(actual - target);
    const full = Math.max(0, Number(parameters.fullCreditTolerance ?? 0));
    const tolerance = Math.max(full, Number(parameters.absoluteTolerance ?? 0));
    const ratio = distance <= full ? 1 : distance > tolerance ? 0 : 1 - (distance - full) / Math.max(Number.EPSILON, tolerance - full);
    return { ratio, dimensions: { distance, target } };
  }));

  registry.register(strategy("pitch-match@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const actual = normalisePitch(value);
    const expected = normalisePitch(context.response.correct?.value);
    if (!actual || !expected) return { ratio: 0 };
    const compare = String(parameters.compare ?? "written-pitch");
    const octaveRequired = parameters.octaveRequired !== false;
    const enharmonic = parameters.allowEnharmonicEquivalent === true || ["midi-number", "concert-pitch", "pitch-class"].includes(compare);
    const match = enharmonic
      ? octaveRequired ? actual.midi === expected.midi : mod(actual.midi, 12) === mod(expected.midi, 12)
      : actual.pitch.step === expected.pitch.step
        && (actual.pitch.alter ?? 0) === (expected.pitch.alter ?? 0)
        && (!octaveRequired || actual.pitch.octave === expected.pitch.octave);
    return { ratio: match ? 1 : 0, dimensions: { pitch: match } };
  }));

  registry.register(strategy("pitch-set-match@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const actual = normaliseMidiList(value, parameters.octavePolicy === "pitch-class");
    const expected = normaliseMidiList(context.response.correct?.value, parameters.octavePolicy === "pitch-class");
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const matched = [...actualSet].filter((midi) => expectedSet.has(midi)).length;
    const missing = expectedSet.size - matched;
    const extra = actualSet.size - matched;
    const allowExtra = parameters.allowAdditionalNotes === true;
    const allowMissing = parameters.allowMissingNotes === true;
    const denominator = expectedSet.size || 1;
    const ratio = Math.max(0, (matched - (allowExtra ? 0 : extra) - (allowMissing ? 0 : missing)) / denominator);
    return { ratio, dimensions: { matched, missing, extra } };
  }));

  registry.register(strategy("pitch-sequence-match@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const actual = normaliseMidiList(value, parameters.octaveRequired === false);
    const expected = normaliseMidiList(context.response.correct?.value, parameters.octaveRequired === false);
    const distance = levenshtein(actual, expected);
    return {
      ratio: expected.length === 0 ? (actual.length === 0 ? 1 : 0) : 1 - distance / Math.max(actual.length, expected.length),
      dimensions: { editDistance: distance, expectedNotes: expected.length }
    };
  }));

  registry.register(strategy("rhythm-alignment@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const actual = normaliseRhythm(value);
    const expected = normaliseRhythm(context.response.correct?.value);
    return alignRhythm(actual, expected, Number(parameters.onsetToleranceMs ?? 90), Number(parameters.durationToleranceRatio ?? 0.25));
  }));

  registry.register(strategy("score-semantic-diff@1", (value, context) => {
    const actual = isScore(value) ? value : undefined;
    const expectedValue = context.response.correct?.value;
    const expected = isScore(expectedValue) ? expectedValue : context.resolvedItem?.resolvedStimuli.find((item) => item.resolvedScore)?.resolvedScore;
    if (!actual || !expected) return { ratio: 0, details: { reason: "Missing canonical score response or answer." } };
    return scoreSemanticSimilarity(actual, expected, context.declaration.parameters ?? {});
  }));

  registry.register(strategy("midi-performance@1", (value, context) => {
    const events = normalisePerformance(value);
    const expected = normalisePerformance(context.response.correct?.value);
    return alignPerformance(events, expected, context.declaration.parameters ?? {});
  }));

  registry.register(strategy("sight-reading@1", (value, context) => {
    const actual = normalisePerformance(value);
    const targetScore = context.resolvedItem?.resolvedStimuli.find((item) => item.resolvedScore)?.resolvedScore;
    if (!targetScore) return { ratio: 0, details: { reason: "Sight-reading target score is unresolved." } };
    const target = timelinePerformance(targetScore);
    const parameters = context.declaration.parameters ?? {};
    const pitchWeight = nestedNumber(parameters, "pitch", "weight", 0.45);
    const rhythmWeight = nestedNumber(parameters, "rhythm", "weight", 0.30);
    const tempoWeight = nestedNumber(parameters, "tempo", "weight", 0.15);
    const continuityWeight = nestedNumber(parameters, "continuity", "weight", 0.10);
    const aligned = alignPerformance(actual, target, parameters);
    const continuity = continuityScore(actual, nestedNumber(parameters, "continuity", "pauseThresholdMs", 1500));
    const tempo = tempoScore(actual, target, nestedNumber(parameters, "tempo", "maximumDriftPercent", 12));
    const pitch = Number(aligned.dimensions?.pitch ?? aligned.ratio);
    const rhythm = Number(aligned.dimensions?.rhythm ?? aligned.ratio);
    const totalWeight = pitchWeight + rhythmWeight + tempoWeight + continuityWeight || 1;
    return {
      ratio: (pitch * pitchWeight + rhythm * rhythmWeight + tempo * tempoWeight + continuity * continuityWeight) / totalWeight,
      dimensions: { pitch, rhythm, tempo, continuity }
    };
  }));

  registry.register(strategy("rubric@1", (value, context) => {
    const parameters = context.declaration.parameters ?? {};
    const ratings = isRecord(value) ? value : {};
    const criteria = Array.isArray(parameters.criteria) ? parameters.criteria.filter(isRecord) : [];
    let earned = 0;
    let possible = 0;
    criteria.forEach((criterion) => {
      const maximum = Number(criterion.maximum ?? 1);
      possible += maximum;
      earned += Math.min(maximum, Math.max(0, Number(ratings[String(criterion.id)] ?? 0)));
    });
    return { ratio: possible === 0 ? 0 : earned / possible, dimensions: { rubricPoints: earned, rubricMaximum: possible } };
  }));

  registry.register(strategy("audio-recording@1", (value, context) => {
    const record = isRecord(value) ? value : {};
    const parameters = context.declaration.parameters ?? {};
    const durationMs = Number(record.durationMs ?? 0);
    const blobSize = Number(record.blobSize ?? 0);
    const minimumDurationMs = Math.max(0, Number(parameters.minimumDurationMs ?? 1000));
    const hasAudio = blobSize > 0 || record.recorded === true;
    const durationRatio = durationMs >= minimumDurationMs ? 1 : durationMs / Math.max(1, minimumDurationMs);
    return {
      ratio: hasAudio ? durationRatio : 0,
      dimensions: { durationMs, minimumDurationMs, hasAudio }
    };
  }));

  registry.register(strategy("composite-weighted@1", (value, context) => {
    const actual = isRecord(value) ? value : {};
    const parameters = context.declaration.parameters ?? {};
    const components = Array.isArray(parameters.components) ? parameters.components.filter(isRecord) : [];
    let score = 0;
    let weight = 0;
    components.forEach((component) => {
      const componentWeight = Number(component.weight ?? 1);
      const componentValue = Number(actual[String(component.responseId)] ?? 0);
      score += clamp(componentValue) * componentWeight;
      weight += componentWeight;
    });
    return { ratio: weight === 0 ? 0 : score / weight };
  }));

  return registry;
}

export function assessResponse(
  registry: AssessmentStrategyRegistry,
  value: unknown,
  context: AssessmentContext
): AssessmentResult {
  return registry.resolve(context.declaration.strategy).assess(value, context);
}

function alignRhythm(
  actual: Array<{ onset: number; duration?: number }>,
  expected: Array<{ onset: number; duration?: number }>,
  onsetTolerance: number,
  durationToleranceRatio: number
): ReturnType<StrategyFunction> {
  if (expected.length === 0) return { ratio: actual.length === 0 ? 1 : 0 };
  const unitScale = Math.max(...actual.map((item) => Math.abs(item.onset)), ...expected.map((item) => Math.abs(item.onset))) > 16 ? 1 : 1000;
  let onsetTotal = 0;
  let durationTotal = 0;
  const compared = Math.min(actual.length, expected.length);
  for (let index = 0; index < compared; index += 1) {
    const onsetError = Math.abs(actual[index].onset - expected[index].onset) * unitScale;
    onsetTotal += Math.max(0, 1 - onsetError / Math.max(1, onsetTolerance));
    const expectedDuration = expected[index].duration;
    const actualDuration = actual[index].duration;
    if (expectedDuration !== undefined && actualDuration !== undefined) {
      const ratio = Math.abs(actualDuration - expectedDuration) / Math.max(Math.abs(expectedDuration), Number.EPSILON);
      durationTotal += Math.max(0, 1 - ratio / Math.max(durationToleranceRatio, Number.EPSILON));
    } else {
      durationTotal += 1;
    }
  }
  const pattern = compared / Math.max(actual.length, expected.length);
  const onset = onsetTotal / expected.length;
  const duration = durationTotal / expected.length;
  return {
    ratio: pattern * 0.35 + onset * 0.4 + duration * 0.25,
    dimensions: { pattern, onset, duration }
  };
}

function alignPerformance(
  actual: MidiPerformanceEvent[],
  expected: MidiPerformanceEvent[],
  parameters: Record<string, unknown>
): ReturnType<StrategyFunction> {
  if (expected.length === 0) return { ratio: actual.length === 0 ? 1 : 0 };
  const expectedMidi = expected.map((item) => item.midi);
  const actualMidi = actual.map((item) => item.midi);
  const distance = levenshtein(actualMidi, expectedMidi);
  const pitch = clamp(1 - distance / Math.max(actual.length, expected.length));
  const onsetTolerance = nestedNumber(parameters, "rhythm", "onsetToleranceMs", Number(parameters.onsetToleranceMs ?? 120));
  const rhythm = alignRhythm(
    actual.map((item) => ({ onset: item.onsetMs, duration: item.durationMs })),
    expected.map((item) => ({ onset: item.onsetMs, duration: item.durationMs })),
    onsetTolerance,
    nestedNumber(parameters, "rhythm", "durationToleranceRatio", Number(parameters.durationToleranceRatio ?? 0.3))
  ).ratio;
  return { ratio: (pitch + rhythm) / 2, dimensions: { pitch, rhythm, editDistance: distance } };
}

function scoreSemanticSimilarity(
  actual: FoxChildMusicScore,
  expected: FoxChildMusicScore,
  parameters: Record<string, unknown>
): ReturnType<StrategyFunction> {
  const dimensions = isRecord(parameters.dimensions) ? parameters.dimensions : {};
  const actualEvents = scoreEvents(actual);
  const expectedEvents = scoreEvents(expected);
  const compared = Math.min(actualEvents.length, expectedEvents.length);
  let matched = 0;
  const dimensionMatches: Record<string, number> = {};
  const activeDimensions = ["pitch", "octave", "onset", "duration", "voice", "staff"].filter((key) => dimensions[key] !== false);
  activeDimensions.forEach((key) => { dimensionMatches[key] = 0; });
  for (let index = 0; index < compared; index += 1) {
    const left = actualEvents[index];
    const right = expectedEvents[index];
    let eventMatched = 0;
    activeDimensions.forEach((key) => {
      if (left[key] === right[key]) {
        dimensionMatches[key] += 1;
        eventMatched += 1;
      }
    });
    matched += activeDimensions.length === 0 ? 1 : eventMatched / activeDimensions.length;
  }
  const lengthPenalty = Math.abs(actualEvents.length - expectedEvents.length);
  const denominator = Math.max(actualEvents.length, expectedEvents.length, 1);
  const ratio = Math.max(0, (matched - lengthPenalty) / denominator);
  return {
    ratio,
    dimensions: Object.fromEntries(Object.entries(dimensionMatches).map(([key, count]) => [key, count / Math.max(1, expectedEvents.length)]))
  };
}

function scoreEvents(score: FoxChildMusicScore): Array<Record<string, string | number>> {
  return score.parts.flatMap((part) => part.measures.flatMap((measure) =>
    measure.events.flatMap((event, eventIndex) => {
      if (event.type === "note") {
        return [{
          pitch: `${event.pitch.step}${event.pitch.alter ?? 0}`,
          octave: event.pitch.octave,
          onset: event.position?.beat ?? eventIndex,
          duration: event.duration.beats ?? event.duration.value,
          voice: event.voice ?? 1,
          staff: event.staff ?? 1
        }];
      }
      if (event.type === "chord") {
        return event.pitches.map((pitch) => ({
          pitch: `${pitch.step}${pitch.alter ?? 0}`,
          octave: pitch.octave,
          onset: event.position?.beat ?? eventIndex,
          duration: event.duration.beats ?? event.duration.value,
          voice: event.voice ?? 1,
          staff: event.staff ?? 1
        }));
      }
      return [];
    })
  ));
}

function timelinePerformance(score: FoxChildMusicScore): MidiPerformanceEvent[] {
  const timeline = compileScoreTimeline(score);
  const bpm = timeline.playbackTempoMap[0]?.bpm ?? score.global.tempo.bpm;
  const millisecondsPerBeat = 60_000 / bpm;
  return timeline.playbackEvents
    .filter((event) => event.kind === "note" && event.midi !== undefined)
    .map((event) => ({
      midi: event.midi as number,
      onsetMs: toNumber(event.scoreStart) * millisecondsPerBeat,
      durationMs: toNumber(event.soundingDuration) * millisecondsPerBeat,
      velocity: event.velocity
    }));
}

function continuityScore(events: MidiPerformanceEvent[], pauseThresholdMs: number): number {
  if (events.length < 2) return events.length === 1 ? 1 : 0;
  const pauses = events.slice(1).filter((event, index) => event.onsetMs - events[index].onsetMs > pauseThresholdMs).length;
  return clamp(1 - pauses / (events.length - 1));
}

function tempoScore(actual: MidiPerformanceEvent[], expected: MidiPerformanceEvent[], maximumDriftPercent: number): number {
  if (actual.length < 2 || expected.length < 2) return 0;
  const actualSpan = actual.at(-1)!.onsetMs - actual[0].onsetMs;
  const expectedSpan = expected.at(-1)!.onsetMs - expected[0].onsetMs;
  if (expectedSpan <= 0) return 1;
  const drift = Math.abs(actualSpan - expectedSpan) / expectedSpan * 100;
  return clamp(1 - drift / Math.max(maximumDriftPercent, Number.EPSILON));
}

function normalisePitch(value: unknown): { midi: number; pitch: Pitch } | undefined {
  try {
    if (typeof value === "number") return { midi: Math.round(value), pitch: midiToPitch(value) };
    if (typeof value === "string") {
      const pitch = parsePitchName(value);
      return { midi: pitchToMidi(pitch), pitch };
    }
    if (isRecord(value)) {
      const candidate = isRecord(value.written) ? value.written : value;
      if (typeof value.midi === "number") {
        const pitch = isPitch(candidate) ? candidate : midiToPitch(value.midi);
        return { midi: Math.round(value.midi), pitch };
      }
      if (isPitch(candidate)) return { midi: pitchToMidi(candidate), pitch: candidate };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normaliseMidiList(value: unknown, pitchClass: boolean): number[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.flatMap((item) => {
    const pitch = normalisePitch(item as PitchAnswer);
    return pitch ? [pitchClass ? mod(pitch.midi, 12) : pitch.midi] : [];
  });
}

function normaliseRhythm(value: unknown): Array<{ onset: number; duration?: number }> {
  const record = isRecord(value) && Array.isArray(value.events) ? value.events : value;
  if (!Array.isArray(record)) return [];
  return record.filter(isRecord).map((event) => ({
    onset: rationalValue(event.onset),
    duration: event.duration === undefined ? undefined : rationalValue(event.duration)
  }));
}

function normalisePerformance(value: unknown): MidiPerformanceEvent[] {
  const events = isRecord(value) && Array.isArray(value.events) ? value.events : value;
  if (!Array.isArray(events)) return [];
  return events.filter(isRecord).flatMap((event) => {
    const midi = Number(event.midi);
    const onsetMs = Number(event.onsetMs ?? event.timeMs ?? event.timestamp ?? 0);
    if (!Number.isFinite(midi) || !Number.isFinite(onsetMs)) return [];
    const duration = Number(event.durationMs);
    const velocity = Number(event.velocity);
    return [{
      midi: Math.round(midi),
      onsetMs,
      durationMs: Number.isFinite(duration) ? duration : undefined,
      velocity: Number.isFinite(velocity) ? velocity : undefined
    }];
  }).sort((left, right) => left.onsetMs - right.onsetMs || left.midi - right.midi);
}

function asStringSet(value: unknown): Set<string> {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return new Set(values.map(String));
}

function rationalValue(value: unknown): number {
  if (typeof value === "number") return value;
  const match = /^(-?\d+)\/(\d+)$/.exec(String(value));
  return match ? Number(match[1]) / Number(match[2]) : Number(value) || 0;
}

function levenshtein<T>(left: T[], right: T[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  left.forEach((leftValue, leftIndex) => {
    const current = [leftIndex + 1];
    right.forEach((rightValue, rightIndex) => {
      current.push(Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (leftValue === rightValue ? 0 : 1)
      ));
    });
    previous.splice(0, previous.length, ...current);
  });
  return previous[right.length];
}

function nestedNumber(record: Record<string, unknown>, key: string, nestedKey: string, fallback: number): number {
  const nested = isRecord(record[key]) ? record[key] : {};
  const value = Number(nested[nestedKey]);
  return Number.isFinite(value) ? value : fallback;
}

function isPitch(value: unknown): value is Pitch {
  return isRecord(value)
    && ["A", "B", "C", "D", "E", "F", "G"].includes(String(value.step))
    && Number.isFinite(value.octave);
}

function isScore(value: unknown): value is FoxChildMusicScore {
  return validateScore(value).valid;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
