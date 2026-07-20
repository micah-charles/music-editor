import { XMLParser } from "fast-xml-parser";
import type { Clef, Duration, FoxChildMusicScore, Mode, MusicEvent, NoteDurationValue, Part, Step } from "../ast/types";
import { createScoreFromEvents, slugify } from "../ast/factory";
import { beatsToDuration } from "../rhythm/duration";
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

  const title = readText(getRecord(root.work)?.["work-title"])
    || readText(root["movement-title"])
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
  let detectedKey: { tonic: Step; mode: Mode } = { tonic: "C", mode: "major" };
  let detectedTempo = 90;

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
      const key = getRecord(attributes?.key);
      if (key) {
        detectedKey = fifthsToKey(Number(readText(key.fifths) || 0));
      }
      const tempo = findTempo(measure);
      if (tempo) {
        detectedTempo = tempo;
      }
    });
  });

  const parts = rawParts.flatMap((rawPart, partIndex) => {
    const partId = String(rawPart?.["@_id"] ?? `P${partIndex + 1}`);
    const partInfo = partInfoById.get(partId) ?? { name: `Part ${partIndex + 1}`, midiProgram: 1 };
    const rawMeasures = records(rawPart?.measure);
    const lanes = collectLanes(rawMeasures);
    const clefByStaff = collectClefs(rawMeasures);

    return lanes.map((lane, laneIndex): Part => {
      let activeDivisions = 1;
      const measures = rawMeasures.map((measure, measureIndex) => {
        const attributes = getRecord(measure?.attributes);
        const declaredDivisions = Number(readText(attributes?.divisions));
        if (Number.isFinite(declaredDivisions) && declaredDivisions > 0) {
          activeDivisions = declaredDivisions;
        }
        const beatsPerMeasure = getBeatsPerMeasure(detectedTime);
        const events = readMeasureEventsForLane(measure, {
          partIndex,
          measureIndex,
          lane,
          divisions: activeDivisions
        });

        return {
          number: Number(measure?.["@_number"] ?? measureIndex + 1),
          events: events.length > 0 ? events : [{
            id: `xml-${partIndex + 1}-${measureIndex + 1}-${lane.key}-empty-rest`,
            type: "rest" as const,
            duration: beatsToDuration(beatsPerMeasure)
          }]
        };
      });

      const suffix = lanes.length > 1 ? ` Staff ${lane.staff} Voice ${lane.voice}` : "";
      return {
        id: lanes.length > 1 ? `${partId}-s${lane.staff}-v${lane.voice}` : partId,
        name: `${partInfo.name}${suffix}`,
        instrument: {
          name: partInfo.name,
          midiProgram: partInfo.midiProgram,
          soundFontBank: 0,
          soundFontPreset: partInfo.midiProgram - 1
        },
        clef: clefByStaff.get(lane.staff) ?? (laneIndex === 0 ? "treble" : "bass"),
        ...(partInfo.channel === undefined ? {} : { channel: partInfo.channel }),
        measures: measures.length > 0 ? measures : [{ number: 1, events: [] }]
      };
    });
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
  score.sourceMetadata = {
    originalFormat: "musicxml"
  };
  return score;
}

function collectLanes(measures: Array<Record<string, unknown>>): Lane[] {
  const laneByKey = new Map<string, Lane>();

  measures.forEach((measure) => {
    records(measure.note).forEach((note) => {
      const lane = noteLane(note);
      laneByKey.set(lane.key, lane);
    });
  });

  if (laneByKey.size === 0) {
    laneByKey.set("1:1", { key: "1:1", staff: "1", voice: "1" });
  }

  return [...laneByKey.values()].sort((a, b) => Number(a.staff) - Number(b.staff) || Number(a.voice) - Number(b.voice));
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

function readMeasureEventsForLane(
  measure: Record<string, unknown>,
  context: { partIndex: number; measureIndex: number; lane: Lane; divisions: number }
): MusicEvent[] {
  const events: MusicEvent[] = [];
  let timedIndex = 0;

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
          duration: {
            ...beatsToDuration(durationBeats),
            beats: roundBeat(durationBeats)
          }
        });
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
          duration
        });
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

      if (note.chord !== undefined && events.length > 0) {
        const previous = events[events.length - 1];
        if (previous.type === "note") {
          events[events.length - 1] = {
            id: previous.id,
            type: "chord",
            pitches: [previous.pitch, nextPitch],
            duration: previous.duration,
            velocity: previous.velocity
          };
          return;
        }
        if (previous.type === "chord") {
          previous.pitches.push(nextPitch);
          return;
        }
      }

      events.push({
        id: `${idPrefix}-note`,
        type: "note",
        pitch: nextPitch,
        duration,
        lyric: readText(getRecord(note.lyric)?.text) || undefined
      });
    });
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
  const value = durationValueFromMusicXmlType(readText(note.type), records(note.dot).length) ?? beatsToDuration(durationBeats).value;
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
    const sound = getRecord(direction.sound);
    const tempo = Number(sound?.["@_tempo"]);
    if (Number.isFinite(tempo) && tempo > 0) {
      return Math.round(tempo);
    }
  }
  const sound = getRecord(measure.sound);
  const tempo = Number(sound?.["@_tempo"]);
  return Number.isFinite(tempo) && tempo > 0 ? Math.round(tempo) : undefined;
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
