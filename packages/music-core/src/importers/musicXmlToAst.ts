import { XMLParser } from "fast-xml-parser";
import type { ArticulationType, Clef, DirectionEvent, Duration, FoxChildMusicScore, Mode, MusicEvent, NoteDurationValue, NoteNotation, Part, Step } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { beatsToDuration, durationToBeats } from "../rhythm/duration";
import { getBeatsPerMeasure } from "../rhythm/measure";
import { fifthsToKey } from "../theory/key";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

type Lane = {
  key: string;
  staff: string;
  voice: string;
};

type ScorePartInfo = {
  name: string;
  midiProgram: number;
  channel?: number;
};

export function musicXmlToAst(xml: string): FoxChildMusicScore {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const root = getRecord(parsed["score-partwise"] ?? parsed["score-timewise"]);
  if (!root) {
    throw new Error("Unsupported MusicXML: expected score-partwise.");
  }

  const workTitle = readText(getRecord(root.work)?.["work-title"]);
  const movementTitle = readText(root["movement-title"]);
  const credits = readCredits(root);
  const creators = readCreators(root);
  const creditTitle = readAudiverisTitleCredit(root);
  const title = workTitle
    || creditTitle
    || movementTitle
    || "Imported MusicXML";
  const partList = getRecord(root["part-list"]);
  const scoreParts = records(partList?.["score-part"]);
  const partInfoById = new Map<string, ScorePartInfo>();
  scoreParts.forEach((part, index) => {
    const id = String(part?.["@_id"] ?? `P${index + 1}`);
    const midiInstrument = getRecord(part?.["midi-instrument"]);
    const midiProgram = Math.max(1, Number(readText(midiInstrument?.["midi-program"]) || 1));
    const midiChannel = Number(readText(midiInstrument?.["midi-channel"]) || 0);
    partInfoById.set(id, {
      name: readText(part?.["part-name"]) || `Part ${index + 1}`,
      midiProgram,
      channel: midiChannel > 0 ? midiChannel - 1 : undefined
    });
  });

  const rawParts = records(root.part);
  let detectedTime = { beats: 4, beatType: 4 };
  const keyTimeline = collectKeyTimeline(rawParts);
  const detectedKey: { tonic: Step; mode: Mode; fifths: number } = keyTimeline.initial
    ?? { tonic: "C", mode: "major", fifths: 0 };
  const hasDetectedKey = keyTimeline.initial !== undefined;
  let detectedTempo = 90;
  let detectedTempoLabel: string | undefined;
  let hasDetectedTempo = false;
  let suppressedRedundantRests = 0;

  rawParts.forEach((rawPart) => {
    records(rawPart.measure).forEach((measure) => {
      const attributes = getRecord(measure.attributes);
      const time = getRecord(attributes?.time);
      if (time) {
        detectedTime = {
          beats: Number(readText(time.beats) || 4),
          beatType: Number(readText(time["beat-type"]) || 4)
        };
      }
      const tempo = findTempo(measure);
      if (tempo && !hasDetectedTempo) {
        detectedTempo = tempo;
        detectedTempoLabel = findTempoLabel(measure);
        hasDetectedTempo = true;
      }
    });
  });

  const parts = rawParts.map((rawPart, partIndex): Part => {
    const partId = String(rawPart?.["@_id"] ?? `P${partIndex + 1}`);
    const partInfo = partInfoById.get(partId) ?? { name: `Part ${partIndex + 1}`, midiProgram: 1 };
    const rawMeasures = records(rawPart?.measure);
    const lanes = collectLanes(rawMeasures);
    const clefByStaff = collectClefs(rawMeasures);
    let activeDivisions = 1;
    const measures = rawMeasures.map((measure, measureIndex) => {
      const attributes = getRecord(measure?.attributes);
      const declaredDivisions = Number(readText(attributes?.divisions));
      if (Number.isFinite(declaredDivisions) && declaredDivisions > 0) {
        activeDivisions = declaredDivisions;
      }
      const measureNumber = Number(measure?.["@_number"] ?? measureIndex + 1);
      let events = lanes.flatMap((lane) => {
        const laneEvents = readMeasureEventsForLane(measure, {
          partIndex,
          measureIndex,
          measureNumber,
          lane,
          divisions: activeDivisions
        });
        return laneEvents;
      });
      events.push(...readDirections(measure, { partIndex, measureIndex, measureNumber, divisions: activeDivisions }));
      const suppression = suppressRedundantWholeMeasureRests(events, getBeatsPerMeasure(detectedTime));
      events = suppression.events;
      suppressedRedundantRests += suppression.removed;
      events.sort(compareLaneEvents);

      return {
        number: measureNumber,
        ...(String(measure?.["@_implicit"] ?? "").toLowerCase() === "yes" ? { implicit: true } : {}),
        ...readRepeatMetadata(measure),
        events
      };
    });
    const staffNumbers = [...new Set(lanes.map((lane) => Number(lane.staff) || 1))].sort((left, right) => left - right);
    const clefs = Object.fromEntries(staffNumbers.map((staff, index) => [
      staff,
      clefByStaff.get(String(staff)) ?? (index === 0 ? "treble" : "bass")
    ])) as Record<number, Clef>;
    return {
      id: partId,
      name: partInfo.name,
      instrument: {
        name: partInfo.name,
        midiProgram: partInfo.midiProgram,
        soundFontBank: 0,
        soundFontPreset: partInfo.midiProgram - 1
      },
      clef: clefs[staffNumbers[0] ?? 1] ?? "treble",
      staffCount: Math.max(1, ...staffNumbers),
      clefs,
      ...(partInfo.channel === undefined ? {} : { channel: partInfo.channel }),
      measures: measures.length > 0 ? measures : [{ number: 1, events: [] }]
    };
  });

  const score = createScoreFromEvents({
    id: slugify(title),
    title,
    source: "musicxml-import",
    tempo: detectedTempo,
    key: detectedKey,
    timeSignature: detectedTime,
    events: []
  });

  score.parts = parts.length > 0 ? parts : score.parts;
  score.metadata = {
    ...score.metadata,
    title,
    ...(movementTitle ? { movementTitle } : {}),
    ...(readSubtitle(credits) ? { subtitle: readSubtitle(credits) } : (
      creditTitle && movementTitle && creditTitle !== movementTitle ? { subtitle: movementTitle } : {}
    )),
    ...(creators.composer ? { composer: creators.composer } : { composer: undefined }),
    ...(creators.arranger ? { arranger: creators.arranger } : {}),
    ...(creators.lyricist ? { lyricist: creators.lyricist } : {}),
    ...(credits.length > 0 ? { credits } : {})
  };
  score.global.key = detectedKey;
  if (keyTimeline.changes.length > 0) {
    score.global.keyEvents = keyTimeline.changes;
  }
  score.global.tempo.source = readTempoSource(root) ?? (hasDetectedTempo ? "musicxml" : "default");
  if (detectedTempoLabel) {
    score.global.tempo.label = detectedTempoLabel;
  } else if (hasDetectedTempo) {
    delete score.global.tempo.label;
  }
  const firstMeasureNumber = Number(records(rawParts[0]?.measure)[0]?.["@_number"] ?? 1);
  const tempoEvents = collectTempoEvents(rawParts[0]).filter((tempo) => {
    return !(tempo.position.measure === firstMeasureNumber && tempo.position.beat === 0 && tempo.bpm === detectedTempo);
  });
  if (tempoEvents.length > 0) {
    score.global.tempoEvents = tempoEvents;
  }
  const fidelityWarnings = musicXmlFidelityWarnings(parsed, rawParts, detectedKey, hasDetectedKey);
  if (suppressedRedundantRests > 0) {
    fidelityWarnings.push(`Suppressed ${suppressedRedundantRests} redundant whole-measure rest${suppressedRedundantRests === 1 ? "" : "s"} from rest-only OMR voices.`);
  }
  score.sourceMetadata = {
    originalFormat: "musicxml",
    warnings: fidelityWarnings
  };
  score.extensions = {
    ...score.extensions,
    musicXmlSource: xml
  };
  return score;
}

function collectKeyTimeline(rawParts: Array<Record<string, unknown>>): {
  initial?: { tonic: Step; mode: Mode; fifths: number };
  changes: Array<{ position: { measure: number; beat: number }; tonic: Step; mode: Mode; fifths: number }>;
} {
  // MusicXML commonly repeats the active key at a new page/system and in every
  // part. One canonical part is enough to distinguish repetitions from changes.
  const canonicalMeasures = rawParts
    .map((part) => records(part.measure))
    .find((measures) => measures.some((measure) => getRecord(getRecord(measure.attributes)?.key)));
  if (!canonicalMeasures) return { changes: [] };

  let initial: { tonic: Step; mode: Mode; fifths: number } | undefined;
  let activeSignature: string | undefined;
  const changes: Array<{ position: { measure: number; beat: number }; tonic: Step; mode: Mode; fifths: number }> = [];

  canonicalMeasures.forEach((measure, measureIndex) => {
    const key = getRecord(getRecord(measure.attributes)?.key);
    if (!key) return;
    const fifths = Number(readText(key.fifths) || 0);
    const mode = readMode(key.mode);
    const signature = `${fifths}:${mode}`;
    if (signature === activeSignature) return;

    const value = { ...fifthsToKey(fifths, mode), fifths };
    if (!initial) {
      initial = value;
    } else {
      const parsedMeasure = Number(measure?.["@_number"]);
      changes.push({
        position: { measure: Number.isFinite(parsedMeasure) ? parsedMeasure : measureIndex + 1, beat: 0 },
        ...value
      });
    }
    activeSignature = signature;
  });

  return { initial, changes };
}

function musicXmlFidelityWarnings(
  parsed: unknown,
  rawParts: Array<Record<string, unknown>>,
  detectedKey: { tonic: Step; mode: Mode; fifths: number },
  hasDetectedKey: boolean
): string[] {
  const keys = new Set<string>();
  collectElementKeys(parsed, keys);
  const warnings: string[] = [];
  const addWhenPresent = (elements: string[], warning: string) => {
    if (elements.some((element) => keys.has(element))) {
      warnings.push(warning);
    }
  };
  addWhenPresent(["accidental"], "Explicit accidental display metadata is normalized; sounding pitch alteration is retained.");
  addWhenPresent(["grace"], "Grace-note timing is not currently represented for playback.");
  addWhenPresent(["ornaments"], "Ornaments are not currently represented for playback.");
  addWhenPresent(["wedge"], "Hairpin wedges are not currently mapped to playback velocity.");
  addWhenPresent(["pedal"], "Pedal notation is not currently represented for playback.");
  addWhenPresent(["fermata"], "Fermata timing is not currently represented for playback.");
  addWhenPresent(["transpose"], "Transposing-instrument metadata is not currently applied to playback.");
  addWhenPresent(["fingering"], "Fingering notation is not currently preserved.");
  addWhenPresent(["harmony", "figured-bass"], "Harmony or figured-bass notation is not currently preserved.");
  addWhenPresent(["print", "page-layout", "system-layout"], "Original page and system layout is reflowed by the notation renderer.");
  if (hasDetectedKey && detectedKey.fifths === 0 && hasRepeatedExplicitSharps(rawParts)) {
    warnings.push("Possible lost key signature: repeated explicit accidentals detected while key signature is C major.");
  }
  const inconsistentDurations = countInconsistentDurations(rawParts);
  if (inconsistentDurations > 0) {
    warnings.push(`${inconsistentDurations} MusicXML duration/type combination${inconsistentDurations === 1 ? " is" : "s are"} inconsistent; unambiguous values were normalized from duration.`);
  }
  return warnings;
}

function collectElementKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectElementKeys(item, keys));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (!key.startsWith("@_")) {
      keys.add(key);
    }
    collectElementKeys(child, keys);
  });
}

function hasRepeatedExplicitSharps(rawParts: Array<Record<string, unknown>>): boolean {
  const alteredStepsByMeasure = rawParts.flatMap((part) => records(part.measure).slice(0, 6).map((measure) => {
    const counts = new Map<string, number>();
    records(measure.note).forEach((note) => {
      const pitch = getRecord(note.pitch);
      if (Number(readText(pitch?.alter)) !== 1) return;
      const step = readText(pitch?.step);
      counts.set(step, (counts.get(step) ?? 0) + 1);
    });
    return counts;
  }));
  const recurringSteps = new Set<string>();
  alteredStepsByMeasure.forEach((counts) => {
    counts.forEach((count, step) => {
      if (count >= 2) recurringSteps.add(step);
    });
  });
  const measuresWithRepeatedSharps = alteredStepsByMeasure.filter((counts) => [...counts.values()].some((count) => count >= 2)).length;
  return recurringSteps.size >= 1 && measuresWithRepeatedSharps >= 2;
}

function countInconsistentDurations(rawParts: Array<Record<string, unknown>>): number {
  let count = 0;
  rawParts.forEach((part) => {
    let divisions = 1;
    records(part.measure).forEach((measure) => {
      const nextDivisions = Number(readText(getRecord(measure.attributes)?.divisions));
      if (Number.isFinite(nextDivisions) && nextDivisions > 0) divisions = nextDivisions;
      records(measure.note).forEach((note) => {
        const durationBeats = Number(readText(note.duration)) / divisions;
        const value = durationValueFromMusicXmlType(readText(note.type), asArray(note.dot).length);
        if (!value || !Number.isFinite(durationBeats)) return;
        if (Math.abs(beatsForValue(value, readTuplet(note)) - durationBeats) > 0.000001) count += 1;
      });
    });
  });
  return count;
}

function collectLanes(measures: Array<Record<string, unknown>>): Lane[] {
  const laneByKey = new Map<string, Lane>();
  const soundingLanes = new Set<string>();
  const soundingStaffs = new Set<string>();

  measures.forEach((measure) => {
    records(measure.note).forEach((note) => {
      const lane = noteLane(note);
      laneByKey.set(lane.key, lane);
      if (note.rest === undefined) {
        soundingLanes.add(lane.key);
        soundingStaffs.add(lane.staff);
      }
    });
  });

  if (laneByKey.size === 0) {
    laneByKey.set("1:1", { key: "1:1", staff: "1", voice: "1" });
  }

  return [...laneByKey.values()]
    .filter((lane) => soundingLanes.has(lane.key) || !soundingStaffs.has(lane.staff))
    .sort((a, b) => Number(a.staff) - Number(b.staff) || Number(a.voice) - Number(b.voice));
}

function collectClefs(measures: Array<Record<string, unknown>>): Map<string, Clef> {
  const clefByStaff = new Map<string, Clef>();

  measures.forEach((measure) => {
    const attributes = getRecord(measure.attributes);
    records(attributes?.clef).forEach((clef, index) => {
      const staff = String(clef["@_number"] ?? index + 1);
      const sign = readText(clef.sign);
      clefByStaff.set(staff, sign === "F" ? "bass" : sign === "C" ? "alto" : "treble");
    });
  });

  return clefByStaff;
}

function compareLaneEvents(left: MusicEvent, right: MusicEvent): number {
  return (left.position?.beat ?? 0) - (right.position?.beat ?? 0)
    || (left.staff ?? 1) - (right.staff ?? 1)
    || (left.voice ?? 1) - (right.voice ?? 1)
    || String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function suppressRedundantWholeMeasureRests(events: MusicEvent[], beatsPerMeasure: number): { events: MusicEvent[]; removed: number } {
  const laneEvents = new Map<string, MusicEvent[]>();
  events.forEach((event) => {
    if (event.type === "direction" || event.type === "annotation") return;
    const lane = `${event.staff ?? 1}:${event.voice ?? 1}`;
    laneEvents.set(lane, [...(laneEvents.get(lane) ?? []), event]);
  });
  const soundingStaffs = new Set(events.flatMap((event) => event.type === "note" || event.type === "chord" ? [event.staff ?? 1] : []));
  const redundantLanes = new Set([...laneEvents.entries()].flatMap(([lane, laneItems]) => {
    const [staff] = lane.split(":").map(Number);
    const onlyWholeMeasureRest = laneItems.length === 1
      && laneItems[0].type === "rest"
      && Math.abs(durationToBeats(laneItems[0].duration) - beatsPerMeasure) <= 0.000001;
    return onlyWholeMeasureRest && soundingStaffs.has(staff) ? [lane] : [];
  }));
  if (redundantLanes.size < 2) {
    return { events, removed: 0 };
  }
  const filtered = events.filter((event) => !redundantLanes.has(`${event.staff ?? 1}:${event.voice ?? 1}`));
  return { events: filtered, removed: events.length - filtered.length };
}

function readMeasureEventsForLane(
  measure: Record<string, unknown>,
  context: { partIndex: number; measureIndex: number; measureNumber: number; lane: Lane; divisions: number }
): MusicEvent[] {
  const events: MusicEvent[] = [];
  let timedIndex = 0;
  let localBeat = 0;
  const timedFields = () => ({
    voice: Number(context.lane.voice) || 1,
    staff: Number(context.lane.staff) || 1,
    position: { measure: context.measureNumber, beat: roundBeat(localBeat) }
  });

  Object.entries(measure).forEach(([key, value]) => {
    if (key === "forward") {
      records(value).forEach((forward) => {
        const lane = timedElementLane(forward);
        if (lane.key !== context.lane.key) {
          return;
        }
        const durationBeats = Number(readText(forward.duration) || 0) / context.divisions;
        if (!Number.isFinite(durationBeats) || durationBeats <= 0) {
          return;
        }
        timedIndex += 1;
        events.push({
          id: `xml-${context.partIndex + 1}-${context.measureIndex + 1}-${context.lane.staff}-${context.lane.voice}-${timedIndex}-forward-rest`,
          type: "rest",
          ...timedFields(),
          duration: {
            ...beatsToDuration(durationBeats),
            beats: roundBeat(durationBeats)
          }
        });
        localBeat += durationBeats;
      });
      return;
    }

    if (key !== "note") {
      return;
    }

    records(value).forEach((note, noteIndex) => {
      const lane = noteLane(note);
      if (lane.key !== context.lane.key) {
        return;
      }

      const durationBeats = Number(readText(note.duration) || 1) / context.divisions;
      const duration = durationFromMusicXmlNote(note, durationBeats);
      const idPrefix = `xml-${context.partIndex + 1}-${context.measureIndex + 1}-${context.lane.staff}-${context.lane.voice}-${noteIndex + 1}`;

      if (note.rest !== undefined) {
        events.push({
          id: `${idPrefix}-rest`,
          type: "rest",
          ...timedFields(),
          duration
        });
        localBeat += durationBeats;
        return;
      }

      const pitch = getRecord(note.pitch);
      if (!pitch) {
        return;
      }

      const nextPitch = {
        step: String(readText(pitch.step) || "C").charAt(0).toUpperCase() as never,
        alter: Number(readText(pitch.alter) || 0),
        octave: Number(readText(pitch.octave) || 4)
      };
      const notation = readNotation(note);

      if (note.chord !== undefined && events.length > 0) {
        const previous = events[events.length - 1];
        if (previous.type === "note") {
          events[events.length - 1] = {
            id: previous.id,
            type: "chord",
            pitches: [previous.pitch, nextPitch],
            duration: previous.duration,
            velocity: previous.velocity,
            voice: previous.voice,
            staff: previous.staff,
            position: previous.position,
            notation: mergeNotation(previous.notation, notation)
          };
          return;
        }
        if (previous.type === "chord") {
          previous.pitches.push(nextPitch);
          previous.notation = mergeNotation(previous.notation, notation);
          return;
        }
      }

      events.push({
        id: `${idPrefix}-note`,
        type: "note",
        ...timedFields(),
        pitch: nextPitch,
        duration,
        lyric: readText(getRecord(note.lyric)?.text) || undefined,
        ...(notation ? { notation } : {}),
        ...readTie(note, `${context.partIndex + 1}:${context.lane.key}:${nextPitch.step}${nextPitch.alter ?? 0}:${nextPitch.octave}`)
      });
      localBeat += durationBeats;
    });
  });

  return events;
}

function readTie(note: Record<string, unknown>, groupId: string): Pick<Extract<MusicEvent, { type: "note" }>, "tie"> {
  const ties = [
    ...records(note.tie),
    ...records(getRecord(note.notations)?.tied)
  ];
  const start = ties.some((tie) => String(tie["@_type"] ?? "") === "start");
  const stop = ties.some((tie) => String(tie["@_type"] ?? "") === "stop");
  return start || stop ? { tie: { start, stop, groupId } } : {};
}

function readRepeatMetadata(measure: Record<string, unknown>): Pick<Part["measures"][number], "repeat"> {
  let start = false;
  let end = false;
  let times: number | undefined;
  const endings = new Set<number>();
  records(measure.barline).forEach((barline) => {
    records(barline.repeat).forEach((repeat) => {
      const direction = String(repeat["@_direction"] ?? "");
      start ||= direction === "forward";
      end ||= direction === "backward";
      const parsedTimes = Number(repeat["@_times"]);
      if (Number.isFinite(parsedTimes) && parsedTimes > 0) {
        times = parsedTimes;
      }
    });
    records(barline.ending).forEach((ending) => {
      String(ending["@_number"] ?? "").split(/[ ,]+/).forEach((value) => {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) {
          endings.add(number);
        }
      });
    });
  });
  return start || end || endings.size > 0 ? { repeat: { start, end, times, endings: [...endings] } } : {};
}

function readDirections(
  measure: Record<string, unknown>,
  context: { partIndex: number; measureIndex: number; measureNumber: number; divisions: number }
): DirectionEvent[] {
  return records(measure.direction).flatMap((direction, directionIndex) => {
    const directionTypes = records(direction["direction-type"]);
    const dynamics = directionTypes.map((directionType) => getRecord(directionType.dynamics)).find(Boolean);
    const hasMetronome = directionTypes.some((directionType) => Boolean(getRecord(directionType.metronome)));
    const dynamic = dynamics
      ? Object.keys(dynamics).find((key) => ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "sf", "sfz", "fp"].includes(key)) as DirectionEvent["dynamic"]
      : undefined;
    const text = hasMetronome
      ? undefined
      : directionTypes.map((directionType) => readText(directionType.words)).find(Boolean) || undefined;
    if (!dynamic && !text) {
      return [];
    }
    const offset = Number(readText(direction.offset) || 0) / context.divisions;
    const placement = String(direction["@_placement"] ?? "");
    const staff = Number(readText(direction.staff) || 1);
    const voice = Number(readText(direction.voice) || 1);
    return [{
      id: `xml-${context.partIndex + 1}-${context.measureIndex + 1}-direction-${directionIndex + 1}`,
      type: "direction",
      position: { measure: context.measureNumber, beat: roundBeat(offset) },
      staff,
      voice,
      ...(dynamic ? { dynamic } : {}),
      ...(text ? { text } : {}),
      ...(placement === "above" || placement === "below" ? { placement } : {})
    }];
  });
}

function readCreators(root: Record<string, unknown>): { composer?: string; arranger?: string; lyricist?: string } {
  const creators = records(getRecord(root.identification)?.creator);
  const byType = (type: string) => creators
    .filter((creator) => String(creator["@_type"] ?? "").toLowerCase() === type)
    .map(readText)
    .filter(Boolean)
    .join("; ") || undefined;
  return {
    composer: byType("composer"),
    arranger: byType("arranger"),
    lyricist: byType("lyricist") || byType("poet")
  };
}

function readCredits(root: Record<string, unknown>): NonNullable<FoxChildMusicScore["metadata"]["credits"]> {
  return records(root.credit).flatMap((credit) => {
    const type = readText(credit["credit-type"]) || undefined;
    const page = Number(credit["@_page"]);
    return asArray(credit["credit-words"]).map((words) => ({
      ...(type ? { type } : {}),
      text: readText(words),
      ...(Number.isFinite(page) && page > 0 ? { page } : {})
    })).filter((entry) => entry.text.trim().length > 0);
  });
}

function readAudiverisTitleCredit(root: Record<string, unknown>): string | undefined {
  const software = asArray(getRecord(getRecord(root.identification)?.encoding)?.software).map(readText);
  if (!software.some((value) => /audiveris/i.test(value))) return undefined;

  const candidates = records(root.credit).flatMap((credit) => {
    const page = Number(credit["@_page"] ?? 1);
    const type = readText(credit["credit-type"]);
    if (page !== 1 || type) return [];
    return asArray(credit["credit-words"]).map((words) => {
      const record = getRecord(words);
      return {
        text: readText(words).trim(),
        fontSize: Number(record?.["@_font-size"] ?? 0)
      };
    });
  }).filter((candidate) => candidate.text && /\p{L}/u.test(candidate.text) && candidate.fontSize >= 14);

  return candidates.sort((left, right) => right.fontSize - left.fontSize)[0]?.text;
}

function readSubtitle(credits: NonNullable<FoxChildMusicScore["metadata"]["credits"]>): string | undefined {
  return credits.find((credit) => credit.type?.toLowerCase() === "subtitle")?.text;
}

function readMode(value: unknown): Mode {
  return readText(value).trim().toLowerCase() === "minor" ? "minor" : "major";
}

function readTempoSource(root: Record<string, unknown>): FoxChildMusicScore["global"]["tempo"]["source"] | undefined {
  const miscellaneous = getRecord(getRecord(root.identification)?.miscellaneous);
  const value = records(miscellaneous?.["miscellaneous-field"])
    .find((field) => String(field["@_name"] ?? "") === "foxchild-tempo-source");
  const source = readText(value);
  return ["musicxml", "omr", "user", "default"].includes(source)
    ? source as FoxChildMusicScore["global"]["tempo"]["source"]
    : undefined;
}

function collectTempoEvents(rawPart: Record<string, unknown> | undefined): NonNullable<FoxChildMusicScore["global"]["tempoEvents"]> {
  if (!rawPart) {
    return [];
  }
  let divisions = 1;
  const events: NonNullable<FoxChildMusicScore["global"]["tempoEvents"]> = [];
  records(rawPart.measure).forEach((measure, measureIndex) => {
    const declaredDivisions = Number(readText(getRecord(measure.attributes)?.divisions));
    if (Number.isFinite(declaredDivisions) && declaredDivisions > 0) {
      divisions = declaredDivisions;
    }
    const measureNumber = Number(measure["@_number"] ?? measureIndex + 1);
    records(measure.direction).forEach((direction) => {
      const tempo = tempoFromDirection(direction);
      if (!tempo) {
        return;
      }
      const offset = Number(readText(direction.offset) || 0) / divisions;
      events.push({
        position: { measure: measureNumber, beat: roundBeat(offset) },
        ...tempo,
        ...(tempo.label ? {} : (findTempoLabel(measure) ? { label: findTempoLabel(measure) } : {}))
      });
    });
    const directTempo = Number(getRecord(measure.sound)?.["@_tempo"]);
    if (Number.isFinite(directTempo) && directTempo > 0) {
      events.push({ position: { measure: measureNumber, beat: 0 }, bpm: Math.round(directTempo) });
    }
  });
  return events;
}

function noteLane(note: Record<string, unknown>): Lane {
  return timedElementLane(note);
}

function timedElementLane(element: Record<string, unknown>): Lane {
  const voice = readText(element.voice) || "1";
  const staff = readText(element.staff) || voice;
  return {
    key: `${staff}:${voice}`,
    staff,
    voice
  };
}

function durationFromMusicXmlNote(note: Record<string, unknown>, durationBeats: number): Duration {
  const declaredValue = durationValueFromMusicXmlType(readText(note.type), asArray(note.dot).length);
  const durationValue = beatsToDuration(durationBeats);
  const declaredBeats = declaredValue ? beatsForValue(declaredValue, readTuplet(note)) : undefined;
  const value = declaredValue !== undefined && declaredBeats !== undefined && Math.abs(declaredBeats - durationBeats) <= 0.000001
    ? declaredValue
    : durationValue.value;
  const duration: Duration = {
    value,
    beats: roundBeat(durationBeats)
  };
  const tuplet = readTuplet(note);
  if (tuplet) {
    duration.tuplet = tuplet;
  }
  return duration;
}

function readNotation(note: Record<string, unknown>): NoteNotation | undefined {
  const notations = getRecord(note.notations);
  const articulationRecord = getRecord(notations?.articulations);
  const supportedArticulations = new Set<ArticulationType>(["staccato", "staccatissimo", "accent", "strong-accent", "tenuto"]);
  const articulations = articulationRecord
    ? Object.keys(articulationRecord).filter((key): key is ArticulationType => supportedArticulations.has(key as ArticulationType))
    : [];
  const slurs: NonNullable<NoteNotation["slurs"]> = records(notations?.slur).flatMap((slur) => {
    const type = String(slur["@_type"] ?? "");
    if (type !== "start" && type !== "stop" && type !== "continue") {
      return [];
    }
    const number = Number(slur["@_number"]);
    const placement = String(slur["@_placement"] ?? "");
    return [{
      type: type as "start" | "stop" | "continue",
      ...(Number.isFinite(number) && number > 0 ? { number } : {}),
      ...(placement === "above" || placement === "below" ? { placement: placement as "above" | "below" } : {})
    }];
  });
  const beams = records(note.beam).flatMap((beam, index) => {
    const value = readText(beam).trim().toLowerCase();
    if (!["begin", "continue", "end", "forward hook", "backward hook"].includes(value)) {
      return [];
    }
    const number = Number(beam["@_number"] ?? index + 1);
    return [{
      number: Number.isFinite(number) && number > 0 ? number : index + 1,
      value: value as "begin" | "continue" | "end" | "forward hook" | "backward hook"
    }];
  });
  return articulations.length || slurs.length || beams.length
    ? {
      ...(articulations.length ? { articulations: [...new Set(articulations)] } : {}),
      ...(slurs.length ? { slurs } : {}),
      ...(beams.length ? { beams } : {})
    }
    : undefined;
}

function mergeNotation(left: NoteNotation | undefined, right: NoteNotation | undefined): NoteNotation | undefined {
  if (!left && !right) {
    return undefined;
  }
  const articulations = [...new Set([...(left?.articulations ?? []), ...(right?.articulations ?? [])])];
  const slurs = uniqueObjects([...(left?.slurs ?? []), ...(right?.slurs ?? [])]);
  const beams = uniqueObjects([...(left?.beams ?? []), ...(right?.beams ?? [])]);
  return {
    ...(articulations.length ? { articulations } : {}),
    ...(slurs.length ? { slurs } : {}),
    ...(beams.length ? { beams } : {})
  };
}

function uniqueObjects<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readTuplet(note: Record<string, unknown>): Duration["tuplet"] | undefined {
  const timeModification = getRecord(note["time-modification"]);
  if (!timeModification) {
    return undefined;
  }
  const actualNotes = Number(readText(timeModification["actual-notes"]));
  const normalNotes = Number(readText(timeModification["normal-notes"]));
  if (!Number.isFinite(actualNotes) || !Number.isFinite(normalNotes) || actualNotes <= 0 || normalNotes <= 0) {
    return undefined;
  }
  const normalType = durationValueFromMusicXmlType(readText(timeModification["normal-type"]), 0);
  return {
    actualNotes,
    normalNotes,
    ...(normalType ? { normalType } : {})
  };
}

function beatsForValue(value: NoteDurationValue, tuplet: Duration["tuplet"] | undefined): number {
  const beats = durationToBeats({ value });
  return tuplet ? beats * tuplet.normalNotes / tuplet.actualNotes : beats;
}

function durationValueFromMusicXmlType(type: string, dotCount: number): NoteDurationValue | undefined {
  const normalized = type.trim().toLowerCase();
  if (dotCount === 1) {
    if (normalized === "half") return "dotted-half";
    if (normalized === "quarter") return "dotted-quarter";
    if (normalized === "eighth") return "dotted-eighth";
  }
  if (normalized === "whole") return "whole";
  if (normalized === "half") return "half";
  if (normalized === "quarter") return "quarter";
  if (normalized === "eighth") return "eighth";
  if (normalized === "16th" || normalized === "sixteenth") return "sixteenth";
  return undefined;
}

function roundBeat(beats: number): number {
  return Math.round(beats * 1000000) / 1000000;
}

function findTempo(measure: Record<string, unknown>): number | undefined {
  for (const direction of records(measure.direction)) {
    const tempo = tempoFromDirection(direction);
    if (tempo) return tempo.bpm;
  }
  const sound = getRecord(measure.sound);
  const tempo = Number(sound?.["@_tempo"]);
  return Number.isFinite(tempo) && tempo > 0 ? Math.round(tempo) : undefined;
}

function tempoFromDirection(direction: Record<string, unknown>): { bpm: number; label?: string } | undefined {
  const soundTempo = Number(getRecord(direction.sound)?.["@_tempo"]);
  const directionTypes = records(direction["direction-type"]);
  const metronome = directionTypes.map((directionType) => getRecord(directionType.metronome)).find(Boolean);
  const metronomeTempo = Number(readText(metronome?.["per-minute"]));
  const formalTempo = Number.isFinite(soundTempo) && soundTempo > 0 ? soundTempo : metronomeTempo;
  if (Number.isFinite(formalTempo) && formalTempo > 0) {
    return { bpm: Math.round(formalTempo) };
  }

  // OMR may recognise a printed metronome symbol as a plain letter (for
  // example "Allegretto (J = 150)"). Require a conventional tempo term so
  // unrelated measure/page numbers cannot silently change playback speed.
  const words = directionTypes.map((directionType) => readText(directionType.words)).find(Boolean)?.trim() ?? "";
  const match = words.match(/\b(grave|largo|lento|adagio|andante|moderato|allegretto|allegro|vivace|presto|prestissimo)\b[^\d]{0,24}(\d{2,3})\s*\)?/i);
  if (!match) return undefined;
  const bpm = Number(match[2]);
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return undefined;
  return { bpm: Math.round(bpm), label: match[1] };
}

function findTempoLabel(measure: Record<string, unknown>): string | undefined {
  for (const direction of records(measure.direction)) {
    const words = records(direction["direction-type"])
      .map((directionType) => readText(directionType.words))
      .find(Boolean)?.trim() ?? "";
    const match = words.match(/\b(grave|largo|lento|adagio|andante|moderato|allegretto|allegro|vivace|presto|prestissimo)\b/i);
    if (match) return match[1];
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function records(value: unknown): Array<Record<string, unknown>> {
  return asArray(value).map(getRecord).filter((record): record is Record<string, unknown> => Boolean(record));
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function readText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "object") {
    return String((value as Record<string, unknown>)["#text"] ?? "");
  }
  return String(value);
}
