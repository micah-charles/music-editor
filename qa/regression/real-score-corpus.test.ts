import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  astToMusicXml,
  astToPlaybackEvents,
  compileScoreTimeline,
  musicXmlToAst,
  toNumber,
  validateScore,
  type FoxChildMusicScore
} from "@foxchild/music-core";
import {
  ensembleFixture,
  grandStaffFixture,
  largeScoreFixture,
  pickupTempoFixture,
  repeatsEndingsFixture,
  simpleMelodyFixture,
  tiesTupletsFixture
} from "./realScoreFixtures";

describe("real-score regression corpus", () => {
  it("imports and round-trips a simple single-line melody", () => {
    const score = roundTrip(simpleMelodyFixture.xml);
    expect(score.parts).toHaveLength(1);
    expect(pitchedEvents(score)).toHaveLength(4);
    expect(score.global.tempo.bpm).toBe(96);
  });

  it("preserves independent piano grand-staff voices and their timing", () => {
    const score = roundTrip(grandStaffFixture.xml);
    expect(score.parts).toHaveLength(1);
    expect(score.parts[0]).toMatchObject({ staffCount: 2, clefs: { 1: "treble", 2: "bass" } });
    const starts = compileScoreTimeline(score).events.filter((event) => event.kind === "note").map((event) => toNumber(event.scoreStart));
    expect(starts.filter((start) => start === 0).length).toBe(2);
  });

  it("preserves ensemble instruments, channels, and simultaneous attacks", () => {
    const score = roundTrip(ensembleFixture.xml);
    expect(score.parts.map((part) => part.instrument.midiProgram)).toEqual([74, 41, 43]);
    expect(score.parts.map((part) => part.channel)).toEqual([0, 1, 2]);
    expect(compileScoreTimeline(score).events.filter((event) => event.kind === "note" && toNumber(event.scoreStart) === 0)).toHaveLength(3);
    score.parts[0].muted = true;
    expect(new Set(astToPlaybackEvents(score).map((event) => event.partId))).toEqual(new Set(score.parts.slice(1).map((part) => part.id)));
    score.parts[0].muted = false;
    score.parts[1].solo = true;
    expect(new Set(astToPlaybackEvents(score).map((event) => event.partId))).toEqual(new Set([score.parts[1].id]));
  });

  it("preserves tied duration and tuplet ratios across export/reimport", () => {
    const score = roundTrip(tiesTupletsFixture.xml);
    const tuplets = score.parts.flatMap((part) => part.measures).flatMap((measure) => measure.events)
      .filter((event) => event.type !== "annotation" && event.duration.tuplet);
    expect(tuplets).toHaveLength(6);
    expect(tuplets[0]).toMatchObject({ duration: { tuplet: { actualNotes: 3, normalNotes: 2 } } });
    const tiedAttack = compileScoreTimeline(score).events.find((event) => event.tieGroupId && event.attack);
    expect(tiedAttack && toNumber(tiedAttack.soundingDuration)).toBe(4);
  });

  it("uses actual pickup duration and maps an in-measure tempo change", () => {
    const score = roundTrip(pickupTempoFixture.xml);
    const timeline = compileScoreTimeline(score);
    expect(timeline.measureMap[0]).toMatchObject({ isPickup: true });
    expect(toNumber(timeline.measureMap[1].start)).toBe(1);
    expect(score.global.tempoEvents).toEqual([
      { position: { measure: 2, beat: 2 }, bpm: 60 }
    ]);
    expect(validateScore(score).warnings).toEqual([]);
  });

  it("plays first and second endings in musical order", () => {
    const score = roundTrip(repeatsEndingsFixture.xml);
    expect(score.parts[0].measures.map((measure) => measure.repeat)).toEqual([
      { start: true, end: false, times: undefined, endings: [] },
      { start: false, end: true, times: 2, endings: [1] },
      { start: false, end: false, times: undefined, endings: [2] }
    ]);
    expect(compileScoreTimeline(score).repeatExpansion?.passes.map((pass) => pass.sourceMeasure)).toEqual([1, 2, 1, 3]);
    expect(astToPlaybackEvents(score).filter((event) => !event.isRest).map((event) => [event.pitch, event.startBeat, event.measureNumber])).toEqual([
      ["C4", 0, 1],
      ["D4", 4, 2],
      ["C4", 8, 1],
      ["E4", 12, 3]
    ]);
  });

  it("imports, compiles, exports, and reimports 320 measures within a bounded core budget", () => {
    const fixture = largeScoreFixture();
    const startedAt = performance.now();
    const score = roundTrip(fixture.xml);
    const elapsedMs = performance.now() - startedAt;
    expect(score.parts[0].measures).toHaveLength(320);
    expect(compileScoreTimeline(score).events.filter((event) => event.kind === "note")).toHaveLength(1_280);
    expect(elapsedMs).toBeLessThan(1_500);
  });

  it.each([
    ["Audiveris source draft", "qa/musicxml/mozart_k381_page21_scan_draft.source.musicxml"],
    ["Audiveris playable repair", "qa/musicxml/mozart_k381_page21_scan_playable.musicxml"],
    ["Audiveris raw helper output", "tools/omr-helper/.omr-work/hDOJTlk-n1/output/score.xml"]
  ])("imports %s without non-finite timeline data", (_label, path) => {
    const xml = readFileSync(path, "utf8");
    const score = musicXmlToAst(xml);
    const timeline = compileScoreTimeline(score);
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(timeline.events.every((event) => Number.isFinite(toNumber(event.scoreStart)) && Number.isFinite(toNumber(event.scoreDuration)))).toBe(true);
    expect(validateScore(score).errors.every((error) => !error.toLowerCase().includes("nan"))).toBe(true);
  });

  it("keeps raw Audiveris lane count stable across export and reimport", () => {
    const xml = readFileSync("tools/omr-helper/.omr-work/hDOJTlk-n1/output/score.xml", "utf8");
    const imported = musicXmlToAst(xml);
    const reimported = musicXmlToAst(astToMusicXml(imported));
    expect(imported.parts).toHaveLength(2);
    expect(reimported.parts).toHaveLength(2);
    expect(imported.sourceMetadata?.warnings).not.toContain("Slur notation is not preserved by the editable AST.");
    expect(imported.sourceMetadata?.warnings).not.toContain("Beam grouping is normalized and may be re-engraved differently on export.");
    expect(countNotation(imported, "slurs")).toBe(countNotation(reimported, "slurs"));
    expect(countNotation(imported, "beams")).toBe(countNotation(reimported, "beams"));
  });

});

function roundTrip(xml: string): FoxChildMusicScore {
  const imported = musicXmlToAst(xml);
  const exported = astToMusicXml(imported);
  const reimported = musicXmlToAst(exported);
  expect(semanticSignature(reimported)).toEqual(semanticSignature(imported));
  return reimported;
}

function semanticSignature(score: FoxChildMusicScore) {
  return {
    key: score.global.key,
    timeSignature: score.global.timeSignature,
    tempo: score.global.tempo,
    partCount: score.parts.length,
    parts: score.parts.map((part) => ({
      instrument: part.instrument.midiProgram,
      channel: part.channel,
      clef: part.clef,
      staffCount: part.staffCount,
      clefs: part.clefs,
      measures: part.measures.map((measure) => ({
        number: measure.number,
        implicit: Boolean(measure.implicit),
        repeat: measure.repeat,
        events: measure.events.map((event) => event.type === "annotation" || event.type === "direction" ? { type: event.type } : {
          type: event.type,
          position: event.position,
          voice: event.voice,
          staff: event.staff,
          duration: event.duration,
          pitches: event.type === "note" ? [event.pitch] : event.type === "chord" ? event.pitches : [],
          tie: event.type === "note" ? event.tie : undefined,
          lyric: event.type === "note" || event.type === "chord" ? event.lyric : undefined
        })
      }))
    })),
    tempoEvents: score.global.tempoEvents
  };
}

function pitchedEvents(score: FoxChildMusicScore) {
  return score.parts.flatMap((part) => part.measures).flatMap((measure) => measure.events)
    .filter((event) => event.type === "note" || event.type === "chord");
}

function countNotation(score: FoxChildMusicScore, key: "slurs" | "beams"): number {
  return score.parts.flatMap((part) => part.measures).flatMap((measure) => measure.events).reduce((total, event) => {
    return total + (event.type === "note" || event.type === "chord" ? event.notation?.[key]?.length ?? 0 : 0);
  }, 0);
}
