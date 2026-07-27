import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import {
  astToMidi,
  astToMusicXml,
  durationToBeats,
  musicXmlToAst,
  pitchToMidi,
  pitchToName,
  validateScore,
  validateScoreMeasures,
  type MusicEvent
} from "../packages/music-core/src/index";
import { createRailwayAdventureScore, scoreDurationSeconds } from "./generate-railway-adventure";

function timedEvents(events: MusicEvent[]) {
  return events.filter((event) => event.type !== "annotation" && event.type !== "direction");
}

function noteSignature(events: MusicEvent[]): string[] {
  return timedEvents(events).map((event) => {
    if (event.type === "rest") return `rest:${durationToBeats(event.duration)}`;
    if (event.type === "note") return `${pitchToName(event.pitch)}:${durationToBeats(event.duration)}`;
    return `${event.pitches.map(pitchToName).join("+")}:${durationToBeats(event.duration)}`;
  });
}

describe("Railway Adventure generator", () => {
  const score = createRailwayAdventureScore();

  it("creates the requested complete orchestral form and duration", () => {
    expect(score.parts.map((part) => part.name)).toEqual([
      "Flute",
      "B-flat Clarinet",
      "B-flat Trumpet",
      "French Horn in F",
      "Violin",
      "Cello",
      "Double Bass",
      "Piano",
      "Percussion"
    ]);
    expect(score.parts.every((part) => part.measures.length === 82)).toBe(true);
    expect(score.parts.reduce((sum, part) => sum + (part.staffCount ?? 1), 0)).toBe(10);
    expect(scoreDurationSeconds(score)).toBeCloseTo(182.81, 1);
    expect(validateScore(score)).toMatchObject({ valid: true, errors: [] });
    expect(validateScoreMeasures(score).filter((measure) => measure.status !== "complete")).toEqual([]);
  });

  it("introduces and later reprises the exact principal trumpet theme", () => {
    const trumpet = score.parts.find((part) => part.id === "trumpet");
    expect(trumpet).toBeDefined();
    const firstStatement = trumpet!.measures.slice(8, 16).flatMap((measure) => noteSignature(measure.events));
    const reprise = trumpet!.measures.slice(68, 76).flatMap((measure) => noteSignature(measure.events));
    expect(reprise).toEqual(firstStatement);
    expect(firstStatement[0]).toBe("A4:1");
    expect(firstStatement.at(-2)).toBe("D4:3");
  });

  it("keeps ranges playable and reserves trumpet/percussion rests", () => {
    const expectedRanges: Record<string, [number, number]> = {
      flute: [60, 96],
      clarinet: [50, 84],
      trumpet: [54, 81],
      horn: [43, 72],
      violin: [55, 96],
      cello: [36, 67],
      "double-bass": [28, 55]
    };
    for (const part of score.parts.filter((candidate) => expectedRanges[candidate.id])) {
      const pitches = part.measures.flatMap((measure) => measure.events.flatMap((event) => {
        if (event.type === "note") return [pitchToMidi(event.pitch)];
        if (event.type === "chord") return event.pitches.map(pitchToMidi);
        return [];
      }));
      const [minimum, maximum] = expectedRanges[part.id];
      expect(Math.min(...pitches)).toBeGreaterThanOrEqual(minimum);
      expect(Math.max(...pitches)).toBeLessThanOrEqual(maximum);
    }
    for (const id of ["trumpet", "percussion"]) {
      const silentMeasures = score.parts.find((part) => part.id === id)!.measures
        .filter((measure) => measure.events.every((event) => event.type === "rest" || event.type === "direction"))
        .length;
      expect(silentMeasures).toBeGreaterThan(8);
    }
  });

  it("exports correct written transpositions while round-tripping concert pitch", () => {
    const xml = astToMusicXml(score);
    const clarinetXml = xml.match(/<part id="clarinet">([\s\S]*?)<\/part>/)?.[1] ?? "";
    const trumpetXml = xml.match(/<part id="trumpet">([\s\S]*?)<\/part>/)?.[1] ?? "";
    const hornXml = xml.match(/<part id="horn">([\s\S]*?)<\/part>/)?.[1] ?? "";
    expect(clarinetXml).toContain("<fifths>4</fifths>");
    expect(clarinetXml).toContain("<chromatic>-2</chromatic>");
    expect(trumpetXml).toContain("<chromatic>-2</chromatic>");
    expect(hornXml).toContain("<fifths>3</fifths>");
    expect(hornXml).toContain("<chromatic>-7</chromatic>");
    expect(xml).toContain('<wedge type="crescendo" number="1"/>');
    expect(xml).toContain('<wedge type="stop" number="1"/>');
    expect(xml).toContain("<bar-style>light-heavy</bar-style>");

    const imported = musicXmlToAst(xml);
    const importedTrumpet = imported.parts.find((part) => part.id === "trumpet")!;
    const firstThemeNote = importedTrumpet.measures[8].events.find((event) => event.type === "note");
    expect(firstThemeNote?.type === "note" ? pitchToName(firstThemeNote.pitch) : undefined).toBe("A4");
    expect(importedTrumpet.transposition?.chromatic).toBe(-2);
    expect(validateScore(imported).valid).toBe(true);
    expect(validateScoreMeasures(imported).filter((measure) => measure.status !== "complete")).toEqual([]);
  });

  it("exports a real tempo-mapped MIDI with conventional percussion channel", () => {
    const midi = new Midi(astToMidi(score));
    expect(midi.tracks).toHaveLength(9);
    expect(midi.header.tempos.map((tempo) => Math.round(tempo.bpm))).toEqual([110, 104, 92, 76, 60]);
    expect(midi.duration).toBeCloseTo(182.81, 1);
    expect(midi.tracks.find((track) => track.name === "Percussion")?.channel).toBe(9);
    expect(midi.tracks.every((track) => track.notes.length > 0)).toBe(true);
  });

  it("uses one two-staff piano part with independent complete lanes", () => {
    const piano = score.parts.find((part) => part.id === "piano")!;
    expect(piano.staffCount).toBe(2);
    expect(piano.clefs).toEqual({ 1: "treble", 2: "bass" });
    for (const measure of piano.measures) {
      const upper = timedEvents(measure.events).filter((event) => event.staff === 1);
      const lower = timedEvents(measure.events).filter((event) => event.staff === 2);
      expect(upper.reduce((sum, event) => sum + durationToBeats(event.duration), 0)).toBe(4);
      expect(lower.reduce((sum, event) => sum + durationToBeats(event.duration), 0)).toBe(4);
    }
  });
});
