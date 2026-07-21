import { describe, expect, it } from "vitest";
import type { FoxChildMusicScore, MusicEvent } from "../ast/types";
import { compileScoreTimeline } from "../timeline/compileScoreTimeline";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  subtractRational,
  toNumber
} from "../timeline/rational";
import { scoreTimeToSeconds, secondsToScoreTime } from "../timeline/tempoMap";
import { musicXmlToAst } from "../importers/musicXmlToAst";
import { astToMusicXml } from "../exporters/astToMusicXml";
import { migrateScoreWithWarnings } from "../ast/migrateScoreToLatest";

describe("rational musical time", () => {
  it("normalizes and calculates without accumulating beat drift", () => {
    expect(rational(2, 4)).toEqual({ numerator: 1, denominator: 2 });
    expect(addRational(rational(1, 3), rational(1, 6))).toEqual(rational(1, 2));
    expect(subtractRational(rational(5, 4), rational(1, 4))).toEqual(rational(1));
    expect(multiplyRational(rational(2, 3), 3)).toEqual(rational(2));
    expect(compareRational(rational(3, 8), rational(1, 2))).toBeLessThan(0);
  });
});

describe("score timeline compilation", () => {
  it("preserves sequential AST playback parity", () => {
    const score = makeScore([
      note("c", "C", 4, "quarter"),
      note("d", "D", 4, "half")
    ]);
    const timeline = compileScoreTimeline(score);
    expect(timeline.events.map((event) => [event.id, toNumber(event.scoreStart), toNumber(event.scoreDuration)])).toEqual([
      ["c", 0, 1],
      ["d", 1, 2]
    ]);
  });

  it("places explicit voices independently and deterministically", () => {
    const upper = { ...note("upper", "C", 5, "half"), voice: 1, staff: 1, position: { measure: 1, beat: 0 } };
    const lower = { ...note("lower", "C", 3, "whole"), voice: 2, staff: 2, position: { measure: 1, beat: 0 } };
    const timeline = compileScoreTimeline(makeScore([lower, upper]));
    expect(timeline.events.map((event) => [event.id, toNumber(event.scoreStart), event.voice, event.staff])).toEqual([
      ["upper", 0, 1, 1],
      ["lower", 0, 2, 2]
    ]);
  });

  it("uses an explicit implicit first measure as a pickup", () => {
    const score = makeScore([note("pickup", "G", 4, "quarter")]);
    score.parts[0].measures[0].implicit = true;
    score.parts[0].measures.push({ number: 2, events: [note("downbeat", "C", 5, "whole")] });
    const timeline = compileScoreTimeline(score);
    expect(timeline.measureMap[0].isPickup).toBe(true);
    expect(toNumber(timeline.measureMap[1].start)).toBe(1);
    expect(toNumber(timeline.events.find((event) => event.id === "downbeat")!.scoreStart)).toBe(1);
  });

  it("converts score time through tempo changes in both directions", () => {
    const score = makeScore([note("one", "C", 4, "whole")]);
    score.parts[0].measures.push({ number: 2, events: [note("two", "D", 4, "whole")] });
    score.global.tempo.bpm = 120;
    score.global.tempoEvents = [{ position: { measure: 2, beat: 0 }, bpm: 60 }];
    const timeline = compileScoreTimeline(score);
    const endSeconds = scoreTimeToSeconds(rational(8), timeline.tempoMap);
    expect(endSeconds).toBeCloseTo(6, 6);
    expect(toNumber(secondsToScoreTime(endSeconds, timeline.tempoMap))).toBeCloseTo(8, 6);
  });

  it("extends a tied attack while keeping the notation continuation", () => {
    const first = { ...note("tie-a", "C", 4, "whole"), tie: { start: true, groupId: "c4-tie" } };
    const score = makeScore([first]);
    score.parts[0].measures.push({
      number: 2,
      events: [{ ...note("tie-b", "C", 4, "half"), tie: { stop: true, groupId: "c4-tie" } }]
    });
    const timeline = compileScoreTimeline(score);
    expect(toNumber(timeline.events[0].soundingDuration)).toBe(6);
    expect(timeline.events[1].attack).toBe(false);
    expect(toNumber(timeline.events[1].soundingDuration)).toBe(0);
  });

  it("builds a non-destructive ordinary repeat playback order", () => {
    const score = makeScore([note("a", "C", 4, "whole")]);
    score.parts[0].measures[0].repeat = { start: true };
    score.parts[0].measures.push({ number: 2, events: [note("b", "D", 4, "whole")], repeat: { end: true, times: 2 } });
    const timeline = compileScoreTimeline(score);
    expect(timeline.repeatExpansion?.passes.map((pass) => pass.sourceMeasure)).toEqual([1, 2, 1, 2]);
    expect(timeline.playbackEvents.map((event) => [event.measureNumber, toNumber(event.scoreStart)])).toEqual([
      [1, 0], [2, 4], [1, 8], [2, 12]
    ]);
    expect(toNumber(timeline.playbackDuration)).toBe(16);
    expect(score.parts[0].measures).toHaveLength(2);
  });
});

describe("structural MusicXML fidelity", () => {
  it("preserves positions, pickup, ties, tempo changes, repeats, voice, and staff through export", () => {
    const imported = musicXmlToAst(`<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1" implicit="yes">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <barline location="left"><repeat direction="forward"/></barline>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><type>quarter</type><staff>1</staff><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <direction><offset>2</offset><sound tempo="60"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><type>quarter</type><staff>1</staff><notations><tied type="stop"/></notations></note>
      <forward><duration>4</duration><voice>1</voice><staff>1</staff></forward>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <barline location="right"><ending number="1" type="stop"/><repeat direction="backward" times="2"/></barline>
    </measure>
  </part>
</score-partwise>`);

    expect(imported.parts[0].measures[0]).toMatchObject({ implicit: true, repeat: { start: true } });
    expect(imported.parts[0].measures[0].events[0]).toMatchObject({
      voice: 1,
      staff: 1,
      position: { measure: 1, beat: 0 },
      tie: { start: true }
    });
    expect(imported.parts[0].measures[1].events[2]).toMatchObject({ position: { measure: 2, beat: 2 } });
    expect(imported.global.tempoEvents).toEqual([{ position: { measure: 2, beat: 0.5 }, bpm: 60 }]);
    expect(imported.parts[0].measures[1].repeat).toMatchObject({ end: true, times: 2, endings: [1] });

    const exported = astToMusicXml(imported);
    expect(exported).toContain('<measure number="1" implicit="yes">');
    expect(exported).toContain('<tie type="start"/>');
    expect(exported).toContain('<voice>1</voice>');
    expect(exported).toContain('<staff>1</staff>');
    expect(exported).toContain('<offset>12</offset>');
    expect(exported).toContain('<repeat direction="backward" times="2"/>');
  });
});

describe("AST v2 migration", () => {
  it("adds stable positions without dropping extension or unknown data", () => {
    const source = makeScore([note("", "C", 4, "quarter"), note("d", "D", 4, "quarter")]) as FoxChildMusicScore & { futureField: { keep: boolean } };
    source.parts[0].measures[0].events[0].id = undefined;
    source.extensions = { importer: { raw: true } };
    source.futureField = { keep: true };

    const migrated = migrateScoreWithWarnings(source);
    expect(migrated.score.parts[0].measures[0].events[0]).toMatchObject({
      id: "piano-m1-e1",
      position: { measure: 1, beat: 0 },
      staff: 1,
      voice: 1
    });
    expect(migrated.score.parts[0].measures[0].events[1]).toMatchObject({ position: { measure: 1, beat: 1 } });
    expect(migrated.score.extensions).toEqual({ importer: { raw: true } });
    expect((migrated.score as typeof source).futureField).toEqual({ keep: true });
    expect(migrated.warnings).toHaveLength(2);
  });
});

function makeScore(events: MusicEvent[]): FoxChildMusicScore {
  return {
    schemaVersion: "2.0",
    type: "FoxChildMusicScore",
    id: "timeline-test",
    metadata: { title: "Timeline Test" },
    global: {
      key: { tonic: "C", mode: "major" },
      timeSignature: { beats: 4, beatType: 4 },
      tempo: { bpm: 120 }
    },
    parts: [{
      id: "piano",
      name: "Piano",
      instrument: { name: "Piano", midiProgram: 1 },
      clef: "treble",
      measures: [{ number: 1, events }]
    }]
  };
}

function note(id: string, step: "C" | "D" | "G", octave: number, value: "quarter" | "half" | "whole") {
  return {
    id,
    type: "note" as const,
    pitch: { step, octave },
    duration: { value }
  };
}
