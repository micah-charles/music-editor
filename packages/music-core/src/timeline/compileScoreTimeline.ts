import type { DirectionEvent, FoxChildMusicScore, MusicEvent, Part } from "../ast/types";
import { durationToBeats } from "../rhythm/duration";
import { pitchToMidi, pitchToName } from "../theory/pitch";
import { buildMeasureMap } from "./measureMap";
import { addRational, compareRational, maxRational, rationalFromNumber, ZERO } from "./rational";
import { buildRepeatExpansion } from "./repeatExpansion";
import { buildTempoMap, musicalPositionToScoreTime } from "./tempoMap";
import { buildPlaybackProjection } from "./playbackProjection";
import { resolveTimelineTies } from "./tieResolution";
import type { ScoreTimeline, TimelineEvent } from "./types";

export function compileScoreTimeline(score: FoxChildMusicScore): ScoreTimeline {
  const measureMap = buildMeasureMap(score);
  const measureByNumber = new Map(measureMap.map((measure) => [measure.measureNumber, measure]));
  const events: TimelineEvent[] = [];

  score.parts.forEach((part, partIndex) => {
    const channel = clampChannel(part.channel ?? partIndex);
    const midiProgram = part.instrument.soundFontPreset ?? zeroBasedProgram(part.instrument.midiProgram);
    const midiBank = part.instrument.soundFontBank ?? 0;
    const dynamicChanges = collectDynamicChanges(part, measureMap);

    for (const measure of part.measures) {
      const boundary = measureByNumber.get(measure.number);
      const voiceCursors = new Map<string, ReturnType<typeof rationalFromNumber>>();
      let sequentialCursor = ZERO;

      measure.events.forEach((event, eventIndex) => {
        const sourceEventId = event.id ?? `${part.id}-m${measure.number}-e${eventIndex + 1}`;
        const duration = eventDuration(event);
        const voice = event.voice ?? 1;
        const staff = event.staff ?? 1;
        const voiceKey = `${staff}:${voice}`;
        const localStart = event.position
          ? addRational(rationalFromNumber(event.position.beat), event.position.offset ?? ZERO)
          : event.voice === undefined && event.staff === undefined
            ? sequentialCursor
            : voiceCursors.get(voiceKey) ?? ZERO;
        const scoreStart = event.position
          ? musicalPositionToScoreTime(event.position, measureMap)
          : addRational(boundary?.start ?? ZERO, localStart);

        events.push(...timelineEventsForMusicEvent(event, {
          sourceEventId,
          partId: part.id,
          staff,
          voice,
          measureNumber: measure.number,
          scoreStart,
          duration,
          channel,
          midiProgram,
          midiBank,
          instrument: part.instrument.name.toLowerCase(),
          trackVolume: clamp(part.volume ?? 1, 0, 1),
          pan: clamp(part.pan ?? 0, -1, 1),
          dynamicVelocity: dynamicVelocityAt(dynamicChanges, scoreStart)
        }));

        if (!event.position) {
          const next = addRational(localStart, duration);
          if (event.voice === undefined && event.staff === undefined) {
            sequentialCursor = next;
          } else {
            voiceCursors.set(voiceKey, next);
          }
        }
      });
    }
  });

  const resolvedEvents = resolveTimelineTies(events).sort(compareTimelineEvents);
  const eventEnd = resolvedEvents.reduce((maximum, event) => maxRational(maximum, addRational(event.scoreStart, event.scoreDuration)), ZERO);
  const measureEnd = measureMap.length === 0
    ? ZERO
    : addRational(measureMap[measureMap.length - 1].start, measureMap[measureMap.length - 1].duration);
  const repeatExpansion = buildRepeatExpansion(score, measureMap);
  const tempoMap = buildTempoMap(score, measureMap);
  const playback = buildPlaybackProjection(resolvedEvents, measureMap, tempoMap, repeatExpansion);

  return {
    duration: maxRational(eventEnd, measureEnd),
    events: resolvedEvents,
    playbackEvents: playback.events,
    tempoMap,
    playbackTempoMap: playback.tempoMap,
    measureMap,
    playbackMeasureMap: playback.measureMap,
    playbackDuration: playback.duration,
    repeatExpansion,
    warnings: repeatExpansion?.warnings ?? []
  };
}

type EventContext = {
  sourceEventId: string;
  partId: string;
  staff: number;
  voice: number;
  measureNumber: number;
  scoreStart: ReturnType<typeof rationalFromNumber>;
  duration: ReturnType<typeof rationalFromNumber>;
  channel: number;
  midiProgram?: number;
  midiBank: number;
  instrument: string;
  trackVolume: number;
  pan: number;
  dynamicVelocity?: number;
};

function timelineEventsForMusicEvent(event: MusicEvent, context: EventContext): TimelineEvent[] {
  const base = {
    sourceEventId: context.sourceEventId,
    partId: context.partId,
    staff: context.staff,
    voice: context.voice,
    measureNumber: context.measureNumber,
    scoreStart: context.scoreStart,
    scoreDuration: context.duration,
    soundingDuration: context.duration,
    velocity: event.type === "note" || event.type === "chord" ? context.dynamicVelocity ?? event.velocity ?? 80 : 0,
    trackVolume: context.trackVolume,
    pan: context.pan,
    channel: context.channel,
    midiProgram: context.midiProgram,
    midiBank: context.midiBank,
    instrument: context.instrument,
    attack: true
  };

  if (event.type === "note") {
    const tieGroupId = event.tie ? event.tie.groupId ?? `${context.partId}:${context.staff}:${context.voice}:${pitchToName(event.pitch)}` : undefined;
    return [{
      ...base,
      id: context.sourceEventId,
      midi: pitchToMidi(event.pitch),
      pitch: pitchToName(event.pitch),
      tieGroupId,
      kind: "note"
    }];
  }
  if (event.type === "chord") {
    return event.pitches.map((pitch, pitchIndex) => ({
      ...base,
      id: `${context.sourceEventId}-${pitchIndex + 1}`,
      sourcePitchIndex: pitchIndex,
      midi: pitchToMidi(pitch),
      pitch: pitchToName(pitch),
      kind: "note" as const
    }));
  }
  if (event.type === "rest") {
    return [{ ...base, id: context.sourceEventId, kind: "rest", attack: false }];
  }
  return [{ ...base, id: context.sourceEventId, kind: "annotation", attack: false }];
}

function eventDuration(event: MusicEvent) {
  return event.type === "annotation" || event.type === "direction" ? ZERO : rationalFromNumber(durationToBeats(event.duration));
}

type DynamicChange = {
  scoreStart: ReturnType<typeof rationalFromNumber>;
  velocity: number;
  explicit: boolean;
  order: number;
};

function collectDynamicChanges(
  part: Part,
  measureMap: ReturnType<typeof buildMeasureMap>
): DynamicChange[] {
  const boundaryByMeasure = new Map(measureMap.map((boundary) => [boundary.measureNumber, boundary]));
  let order = 0;
  return part.measures.flatMap((measure) => {
    const boundary = boundaryByMeasure.get(measure.number);
    return measure.events.flatMap((event) => {
      if (event.type !== "direction" || !event.dynamic) return [];
      const explicitVelocity = playbackVelocityFromDirection(event);
      const velocity = explicitVelocity ?? dynamicToVelocity(event.dynamic);
      const scoreStart = event.position
        ? musicalPositionToScoreTime(event.position, measureMap)
        : boundary?.start ?? ZERO;
      order += 1;
      return [{
        scoreStart,
        velocity,
        explicit: explicitVelocity !== undefined,
        order
      }];
    });
  }).sort((left, right) =>
    compareRational(left.scoreStart, right.scoreStart) || left.order - right.order
  );
}

function dynamicVelocityAt(changes: DynamicChange[], scoreStart: ReturnType<typeof rationalFromNumber>): number | undefined {
  let current: DynamicChange | undefined;
  for (const change of changes) {
    if (compareRational(change.scoreStart, scoreStart) > 0) break;
    if (!current || compareRational(change.scoreStart, current.scoreStart) > 0) {
      current = change;
    } else if (compareRational(change.scoreStart, current.scoreStart) === 0 && (change.explicit || !current.explicit)) {
      current = change;
    }
  }
  return current?.velocity;
}

function playbackVelocityFromDirection(event: DirectionEvent): number | undefined {
  const value = Number(event.extensions?.playbackVelocity);
  return Number.isFinite(value) && value > 0
    ? Math.min(127, Math.max(1, Math.round(value)))
    : undefined;
}

function dynamicToVelocity(dynamic: NonNullable<DirectionEvent["dynamic"]>): number {
  const velocities: Record<NonNullable<DirectionEvent["dynamic"]>, number> = {
    ppp: 20,
    pp: 32,
    p: 45,
    mp: 58,
    mf: 74,
    f: 90,
    ff: 108,
    fff: 120,
    sf: 100,
    sfz: 112,
    fp: 90
  };
  return velocities[dynamic];
}

function compareTimelineEvents(left: TimelineEvent, right: TimelineEvent): number {
  return compareRational(left.scoreStart, right.scoreStart)
    || left.partId.localeCompare(right.partId)
    || left.staff - right.staff
    || left.voice - right.voice
    || (left.midi ?? -1) - (right.midi ?? -1)
    || left.id.localeCompare(right.id);
}

function clampChannel(channel: number): number {
  return Math.min(15, Math.max(0, Math.round(channel)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function zeroBasedProgram(program: number | undefined): number | undefined {
  return program === undefined ? undefined : Math.min(127, Math.max(0, Math.round(program) - 1));
}
